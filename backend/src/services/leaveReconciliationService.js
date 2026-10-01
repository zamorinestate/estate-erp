'use strict';

/**
 * LEAVE RECONCILIATION SERVICE (P1)
 * Wires approved/rejected/cancelled LeaveRequests to Attendance records.
 * Idempotent — safe to retry.
 */

const { Attendance, ATTENDANCE_STATUSES } = require('../modules/attendance/Attendance');
const { SequenceCounter } = require('../models/SequenceCounter');
const { AttendanceException } = require('../models/AttendanceException');
const { recordAuditEvent } = require('./auditService');

function getIstBusinessDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Enumerate all calendar dates from startDate to endDate (inclusive).
 * @param {string} startDate YYYY-MM-DD
 * @param {string} endDate   YYYY-MM-DD
 * @returns {string[]}
 */
function enumerateDates(startDate, endDate) {
  const dates = [];
  const cur = new Date(startDate + 'T00:00:00.000Z');
  const end = new Date(endDate + 'T00:00:00.000Z');
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Reconcile a LeaveRequest to Attendance records.
 * @param {object} params
 * @param {string}  params.organisationId
 * @param {object}  params.leaveRequest   Mongoose LeaveRequest document
 * @param {string}  params.action         'APPROVE' | 'REJECT' | 'CANCEL' | 'REVOKE'
 * @param {string}  params.actorUserId    User performing the action (for audit)
 */
async function reconcileLeaveToAttendance({ organisationId, leaveRequest, action, actorUserId, session = null, skipAudit = false }) {
  const {
    userId,
    cafeId,
    startDate,
    endDate,
    leaveType,
    durationType, // FULL_DAY | FIRST_HALF | SECOND_HALF
  } = leaveRequest;
  const requestId = leaveRequest.requestId || leaveRequest.leaveId || 'LEAVE';

  const dates = enumerateDates(startDate, endDate);
  let reconciledCount = 0;

  const isHalfDay = Boolean(
    leaveRequest.isHalfDay ||
    leaveRequest.halfDay ||
    durationType === 'FIRST_HALF' ||
    durationType === 'SECOND_HALF' ||
    durationType === 'HALF_DAY' ||
    leaveType === 'HALF_DAY'
  );
  const attendanceStatus = isHalfDay ? 'HALF_DAY' : 'ON_LEAVE';

  if (action === 'APPROVE') {
    for (const date of dates) {
      // Check if employee has an actual punch that day — do not overwrite real punches
      const existing = await Attendance.findOne({
        organisationId,
        userId,
        businessDate: date,
      }).session(session);

      if (existing) {
        const hasPunch = existing.checkInAt || existing.checkOutAt;
        if (hasPunch) {
          // Conflict — employee has a real punch AND an approved leave
          await _upsertException({
            organisationId,
            cafeId: existing.cafeId || cafeId,
            userId,
            attendanceId: existing.attendanceId,
            businessDate: date,
            type: 'LEAVE_PUNCH_CONFLICT',
            severity: 'MEDIUM',
            description: `Approved leave ${requestId} conflicts with real attendance punch on ${date}.`,
            session,
          });
          continue; // Do not overwrite punch
        }
        // No punch — update to ON_LEAVE / HALF_DAY
        existing.status = attendanceStatus;
        existing.isManualEntry = true;
        existing.leaveId = requestId;
        existing.updatedBy = actorUserId || 'SYSTEM';
        await existing.save({ session });
        reconciledCount++;
      } else {
        // Create a new Attendance record for the leave day
        const attendanceId = await SequenceCounter.generateId({
          organisationId,
          sequenceKey: 'ATTENDANCE',
          prefix: `AT-${date.replace(/-/g, '')}`,
          minimumDigits: 3,
          session,
        });
        const newRecord = new Attendance({
          attendanceId,
          organisationId,
          cafeId,
          userId,
          businessDate: date,
          status: attendanceStatus,
          isManualEntry: true,
          leaveId: requestId,
          notes: `Leave ${leaveType || ''} approved — requestId: ${requestId}`,
          createdBy: actorUserId || 'SYSTEM',
          rawTimeEvents: [],
        });
        await newRecord.save({ session });
        reconciledCount++;
      }
    }
  } else if (action === 'REJECT' || action === 'CANCEL' || action === 'REVOKE') {
    // Revert ON_LEAVE / HALF_DAY records that were created for this leave
    for (const date of dates) {
      const existing = await Attendance.findOne({
        organisationId,
        userId,
        businessDate: date,
      }).session(session);
      if (!existing) continue;

      // Only revert if the record was a leave-derived record (no real punch)
      const hasPunch = existing.checkInAt || existing.checkOutAt;
      if (!hasPunch && (existing.status === 'ON_LEAVE' || existing.status === 'HALF_DAY')) {
        existing.status = 'ABSENT';
        existing.updatedBy = actorUserId || 'SYSTEM';
        existing.notes = `Leave ${requestId} ${action.toLowerCase()} — status reverted to ABSENT.`;
        await existing.save({ session });
        reconciledCount++;
      }
    }
  }

  if (!skipAudit) {
    await recordAuditEvent({
      organisationId,
      actorUserId: actorUserId || 'SYSTEM',
      actorRole: 'SYSTEM',
      module: 'ATTENDANCE',
      action: 'ATTENDANCE_LEAVE_RECONCILED',
      entityType: 'LeaveRequest',
      entityId: requestId || 'LEAVE',
      cafeId,
      metadata: {
        userId,
        cafeId,
        leaveType,
        startDate,
        endDate,
        reconcileAction: action,
        actorUserId,
      },
    });
  }

  return {
    success: true,
    reconciledCount,
    dates,
  };
}

async function _upsertException({ organisationId, cafeId, userId, attendanceId, businessDate, type, severity, description, session = null }) {
  const existing = await AttendanceException.findOne({
    organisationId, userId, businessDate, type,
  }).session(session);
  if (existing) return; // Already exists — idempotent

  const exceptionId = `EXC-${businessDate.replace(/-/g, '')}-${userId}-${type.slice(0, 4)}`;
  const exc = new AttendanceException({
    exceptionId,
    organisationId,
    cafeId,
    userId,
    attendanceId: attendanceId || null,
    businessDate,
    type,
    severity,
    status: 'OPEN',
    description,
    generatedByService: 'leaveReconciliationService',
  });
  try {
    await exc.save({ session });
  } catch (e) {
    // Duplicate key — idempotent, ignore
    if (e.code !== 11000) throw e;
  }
}

module.exports = {
  reconcileLeaveToAttendance,
};
