'use strict';

const { Attendance } = require('../modules/attendance/Attendance');
const { executeTransactionWithRetry } = require('../utils/transactionHelper');
const { recordAuditEvent } = require('./auditService');

const DEFAULT_BATCH_LIMIT = 500;
const MAX_BATCH_LIMIT = 1000;

function getKolkataBusinessDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

class AttendanceRolloverService {
  /**
   * Marks stale open attendance as MISSED_PUNCH.
   *
   * Critical invariant:
   * - NEVER invents checkOutAt.
   * - NEVER creates a CHECK_OUT raw event.
   * - NEVER fabricates QR/GPS/selfie evidence.
   * - Employee/admin correction remains required.
   */
  async markStaleOpenAttendance({
    organisationId = String(process.env.INITIAL_ORGANISATION_ID || 'ZAMORIN').trim().toUpperCase(),
    now = new Date(),
    batchLimit = DEFAULT_BATCH_LIMIT,
  } = {}) {
    const orgId = String(organisationId || '').trim().toUpperCase();
    if (!orgId) {
      const error = new Error('organisationId is required for attendance rollover.');
      error.code = 'ORGANISATION_ID_REQUIRED';
      throw error;
    }

    const currentBusinessDate = getKolkataBusinessDate(now);
    const limit = Math.min(
      MAX_BATCH_LIMIT,
      Math.max(1, Number(batchLimit) || DEFAULT_BATCH_LIMIT)
    );

    return executeTransactionWithRetry(
      async (session) => {
        const staleQuery = {
          organisationId: orgId,
          businessDate: { $lt: currentBusinessDate },
          status: { $in: ['CHECKED_IN', 'ON_BREAK'] },
          checkOutAt: null,
          isLocked: { $ne: true },
        };

        let findQuery = Attendance.find(staleQuery)
          .sort({ businessDate: 1, checkInAt: 1, attendanceId: 1 })
          .limit(limit);

        if (session && typeof findQuery.session === 'function') {
          findQuery = findQuery.session(session);
        }

        const staleRecords = await findQuery;

        let lockedCountQuery = Attendance.countDocuments({
          organisationId: orgId,
          businessDate: { $lt: currentBusinessDate },
          status: { $in: ['CHECKED_IN', 'ON_BREAK'] },
          checkOutAt: null,
          isLocked: true,
        });
        if (session && typeof lockedCountQuery.session === 'function') {
          lockedCountQuery = lockedCountQuery.session(session);
        }
        const lockedOpenCount = Number(await lockedCountQuery || 0);

        const updatedAttendanceIds = [];
        const correctionReason =
          'Scheduled attendance rollover detected no verified checkout punch before the next business day. No checkout time/evidence was fabricated; correction is required.';

        for (const record of staleRecords || []) {
          const result = await Attendance.updateOne(
            {
              _id: record._id,
              organisationId: orgId,
              attendanceId: record.attendanceId,
              businessDate: record.businessDate,
              status: record.status,
              checkOutAt: null,
              isLocked: { $ne: true },
            },
            {
              $set: {
                status: 'MISSED_PUNCH',
                correctionRequired: true,
                correctionReason,
                updatedBy: 'SYSTEM',
              },
            },
            session ? { session } : undefined
          );

          if (result.modifiedCount === 1) {
            updatedAttendanceIds.push(record.attendanceId);
          }
        }

        if (updatedAttendanceIds.length > 0) {
          await recordAuditEvent({
            organisationId: orgId,
            cafeId: 'GLOBAL',
            actorUserId: 'SYSTEM',
            actorRole: 'SYSTEM',
            module: 'ATTENDANCE',
            action: 'ATTENDANCE_MISSED_PUNCH_ROLLOVER',
            entityType: 'ATTENDANCE_ROLLOVER',
            entityId: `ROLLOVER-${currentBusinessDate.replace(/-/g, '')}`,
            result: 'SUCCESS',
            riskClassification: 'MEDIUM',
            metadata: {
              currentBusinessDate,
              updatedCount: updatedAttendanceIds.length,
              lockedOpenCount,
              batchLimit: limit,
              attendanceIds: updatedAttendanceIds.slice(0, 100),
              evidenceInvariant:
                'NO_CHECKOUT_TIMESTAMP_QR_GPS_OR_SELFIE_WAS_FABRICATED',
            },
            session,
          });
        }

        return {
          status: 'COMPLETED',
          currentBusinessDate,
          scannedCount: Array.isArray(staleRecords) ? staleRecords.length : 0,
          updatedCount: updatedAttendanceIds.length,
          lockedOpenCount,
          hasMore:
            Array.isArray(staleRecords) &&
            staleRecords.length >= limit,
          updatedAttendanceIds,
          invariant:
            'MISSED_PUNCH_ONLY_NO_SYNTHETIC_CHECKOUT_OR_EVIDENCE',
        };
      },
      {
        requireTransactions: process.env.NODE_ENV === 'production',
      }
    );
  }
}

const attendanceRolloverService = new AttendanceRolloverService();

module.exports = {
  DEFAULT_BATCH_LIMIT,
  MAX_BATCH_LIMIT,
  getKolkataBusinessDate,
  AttendanceRolloverService,
  attendanceRolloverService,
};
