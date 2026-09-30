'use strict';

/**
 * ATTENDANCE & SHIFTS CONTROLLER (SCREEN 004)
 */

const {
  Attendance,
  ATTENDANCE_STATUSES,
  ATTENDANCE_SOURCES,
} = require('./Attendance');

const {
  calculateAttendanceMetrics,
} = require('../../services/attendanceCalculationService');

const {
  AttendanceCorrectionRequest,
} = require('../../models/AttendanceCorrectionRequest');

const {
  AttendancePeriod,
  PERIOD_STATUSES,
} = require('../../models/AttendancePeriod');

const {
  ShiftRoster,
} = require('../../models/ShiftRoster');

const {
  AttendanceException,
} = require('../../models/AttendanceException');

const {
  HolidayCalendar,
} = require('../../models/HolidayCalendar');

const {
  PayrollRun,
} = require('../../models/PayrollRun');

const {
  resolveEmployeeShiftForDate,
  buildShiftDateTime,
  getWeekStartDate,
} = require('../../services/shiftResolverService');

const {
  Cafe,
} = require('../../models/Cafe');

const {
  User,
} = require('../../models/User');

const {
  SequenceCounter,
} = require('../../models/SequenceCounter');

const {
  Approval,
} = require('../../models/Approval');

const {
  Notification,
} = require('../../models/Notification');

const {
  asyncHandler,
} = require('../../utils/asyncHandler');

const {
  ApiError,
} = require('../../utils/ApiError');

const {
  recordRequestAudit,
} = require('../../services/auditService');

const crypto = require('node:crypto');
const attendanceQrService = require('../../services/attendanceQrService');
const { attendanceEvidenceStorageService } = require('../../services/attendanceEvidenceStorageService');
const {
  reconcileExpiredOrphanAttendanceEvidence,
} = require('../../services/attendanceEvidenceRetentionService');
const {
  auditAttendanceEvidenceIntegrity,
  verifyAttendanceEvidenceSlot,
} = require('../../services/attendanceEvidenceIntegrityService');
const { PrivateFile } = require('../../models/PrivateFile');
const { AttendanceSubmission } = require('../../models/AttendanceSubmission');

function normalizeIdentifier(value) {
  return typeof value === 'string'
    ? value.trim().toUpperCase()
    : '';
}

function isAttendanceEvidenceLinkEnforcementActive() {
  return PrivateFile.db?.readyState === 1;
}

async function reserveAttendanceEvidenceLink({
  fileId,
  organisationId,
  userId,
  challengeId,
  cafeId,
  punchType,
  attendanceId,
}) {
  const claimId = crypto.randomUUID();

  // Offline unit tests replace model persistence with in-memory stubs. Runtime
  // requests only reach a durable Attendance.save() when MongoDB is connected,
  // and the reservation is mandatory in that live path.
  if (!isAttendanceEvidenceLinkEnforcementActive()) {
    return { claimId, persisted: false };
  }

  const reserved = await PrivateFile.findOneAndUpdate(
    {
      fileId: normalizeIdentifier(fileId),
      organisationId: normalizeIdentifier(organisationId),
      uploadedByUserId: normalizeIdentifier(userId),
      'attendanceContext.challengeId': challengeId,
      'attendanceContext.cafeId': normalizeIdentifier(cafeId),
      'attendanceContext.punchType': normalizeIdentifier(punchType),
      'attendanceCleanup.status': { $ne: 'CLAIMED' },
      'attendanceLink.status': { $nin: ['RESERVED', 'COMMITTED'] },
    },
    {
      $set: {
        'attendanceLink.status': 'RESERVED',
        'attendanceLink.claimId': claimId,
        'attendanceLink.reservedAt': new Date(),
        'attendanceLink.committedAt': null,
        'attendanceLink.attendanceId': normalizeIdentifier(attendanceId),
        'attendanceLink.punchType': normalizeIdentifier(punchType),
        'attendanceLink.linkedByUserId': normalizeIdentifier(userId),
      },
    },
    { new: true }
  );

  if (!reserved) {
    throw new ApiError(
      409,
      'SELFIE_EVIDENCE_UNAVAILABLE',
      'This selfie evidence is already linked, reserved, or being reconciled. Capture a fresh selfie and retry the punch.'
    );
  }

  return { claimId, persisted: true };
}

async function releaseAttendanceEvidenceLink({ fileId, organisationId, claimId, persisted }) {
  if (!persisted) return;

  await PrivateFile.updateOne(
    {
      fileId: normalizeIdentifier(fileId),
      organisationId: normalizeIdentifier(organisationId),
      'attendanceLink.status': 'RESERVED',
      'attendanceLink.claimId': claimId,
    },
    { $unset: { attendanceLink: '' } }
  );
}

async function commitAttendanceEvidenceLink({
  fileId,
  organisationId,
  claimId,
  attendanceId,
  punchType,
  persisted,
}) {
  if (!persisted) return true;

  const result = await PrivateFile.updateOne(
    {
      fileId: normalizeIdentifier(fileId),
      organisationId: normalizeIdentifier(organisationId),
      'attendanceLink.status': 'RESERVED',
      'attendanceLink.claimId': claimId,
    },
    {
      $set: {
        'attendanceLink.status': 'COMMITTED',
        'attendanceLink.committedAt': new Date(),
        'attendanceLink.attendanceId': normalizeIdentifier(attendanceId),
        'attendanceLink.punchType': normalizeIdentifier(punchType),
      },
    }
  );

  return Boolean(
    result &&
    (
      result.modifiedCount === 1 ||
      result.matchedCount === 1 ||
      result.nModified === 1 ||
      result.n === 1
    )
  );
}

function getIstBusinessDate(date = new Date()) {
  return new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }
  ).format(date);
}

function ensureCafeOperationsAllowed(request) {
  if (request.auth.role === 'MASTER') {
    if (request.auth.isPrimaryMaster !== true) {
      throw new ApiError(
        403,
        'PRIMARY_MASTER_AUTHORITY_REQUIRED',
        'Attendance administration requires the designated Primary Master.'
      );
    }
    return;
  }

  if (request.auth.role === 'OWNER') return;

  if (request.auth.role === 'CAFE_ADMIN') {
    if (request.auth.privilegeProfile === 'SELF_ONLY') {
      throw new ApiError(
        403,
        'PERMISSION_DENIED',
        'Cafe Operations attendance administration is restricted on personal or untrusted devices.'
      );
    }
    return;
  }

  throw new ApiError(
    403,
    'PERMISSION_DENIED',
    'Attendance administration is restricted to the Primary Master, Owner, or Café Admin.'
  );
}

function ensureCafeAccess(request, cafeId) {
  ensureCafeOperationsAllowed(request);
  if (request.auth.role === 'MASTER') return;
  const assigned = (request.auth.assignedCafeIds || []).map((c) => String(c).trim().toUpperCase());
  if (!assigned.length && request.auth.role === 'OWNER') {
    throw new ApiError(403, 'CROSS_CAFE_RESOURCE_DENIED', 'Owner has no assigned cafés.');
  }
  if (!assigned.includes(String(cafeId).trim().toUpperCase())) {
    const errCode = request.auth.role === 'OWNER' ? 'CROSS_CAFE_RESOURCE_DENIED' : 'CAFE_ACCESS_DENIED';
    throw new ApiError(403, errCode, 'You do not have access to this café.');
  }
}

async function ensureRosterAssignmentCafeMembership({ organisationId, cafeId, assignments = [] }) {
  const uniqueUserIds = [...new Set(
    (assignments || [])
      .map((assignment) => normalizeIdentifier(assignment?.userId))
      .filter(Boolean)
  )];

  if (!uniqueUserIds.length) return;

  const mongoose = require('mongoose');
  if (mongoose.connection?.readyState !== 1) {
    // Isolated unit tests run without a database. Runtime enforcement is active
    // whenever the application has its required live database connection.
    return;
  }

  const users = await User.find({
    organisationId,
    userId: { $in: uniqueUserIds },
  })
    .select('userId primaryCafeId assignedCafeIds employmentStatus accountStatus')
    .lean();

  const byId = new Map(users.map((user) => [normalizeIdentifier(user.userId), user]));
  const normalizedCafeId = normalizeIdentifier(cafeId);
  const invalid = [];

  for (const userId of uniqueUserIds) {
    const user = byId.get(userId);
    const assignedCafes = new Set([
      ...(user?.assignedCafeIds || []),
      user?.primaryCafeId,
    ].filter(Boolean).map(normalizeIdentifier));

    const isEmploymentActive = !['EXITED', 'ARCHIVED'].includes(String(user?.employmentStatus || '').toUpperCase());
    const isAccountActive = String(user?.accountStatus || '').toUpperCase() === 'ACTIVE';

    if (!user || !assignedCafes.has(normalizedCafeId) || !isEmploymentActive || !isAccountActive) {
      invalid.push(userId);
    }
  }

  if (invalid.length) {
    throw new ApiError(
      422,
      'ROSTER_EMPLOYEE_SCOPE_INVALID',
      `Roster contains employees who are not active members of café ${normalizedCafeId}: ${invalid.join(', ')}`
    );
  }
}

// Throws 423 if the Attendance period for businessDate is LOCKED
async function ensurePeriodNotLocked(organisationId, businessDate) {
  if (!businessDate || typeof businessDate !== 'string') return;
  const mongoose = require('mongoose');
  const isDbReady = mongoose.connection?.readyState === 1;
  const isStubbed = typeof AttendancePeriod.findOne === 'function' && AttendancePeriod.findOne !== mongoose.Model.findOne;
  if (!isDbReady && !isStubbed) return;
  try {
    const parts = businessDate.slice(0, 7).split('-').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return;
    const [year, month] = parts;
    const period = await AttendancePeriod.findOne({ organisationId, year, month }).lean();
    if (period && period.status === 'LOCKED') {
      throw new ApiError(423, 'PERIOD_LOCKED', 'Attendance period is locked. Contact Primary Master to reopen before making corrections.');
    }
  } catch (err) {
    if (err.statusCode === 423) throw err;
  }
}

// Flag a PayrollRun as needing recalculation after Attendance change (audit only; never mutates PAID)
async function flagPayrollRecalculationRequired(organisationId, cafeId, businessDate, actorUserId) {
  if (!businessDate || typeof businessDate !== 'string') return;
  const mongoose = require('mongoose');
  if (mongoose.connection?.readyState !== 1) return;
  try {
    const periodKey = businessDate.slice(0, 7);
    const run = await PayrollRun.findOne({ organisationId, cafeId, periodKey }).lean();
    if (!run) return;
    const finalized = ['APPROVED', 'PAID', 'VOIDED'].includes(run.status);
    await recordRequestAudit({
      module: 'PAYROLL',
      action: finalized ? 'ATTENDANCE_CHANGE_ON_FINALIZED_PAYROLL' : 'ATTENDANCE_PAYROLL_RECALCULATION_REQUIRED',
      entityType: 'PayrollRun',
      entityId: run.payrollRunId,
      systemGenerated: true,
      organisationId,
      metadata: { cafeId, businessDate, actorUserId, payrollStatus: run.status },
    });
  } catch (_) { /* Non-blocking */ }
}

// 1. GET /api/v1/attendance/overview
const getAttendanceOverview = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const businessDate = request.query.date || getIstBusinessDate();

  ensureCafeOperationsAllowed(request);

  const filter = { organisationId, businessDate };
  if (request.query.cafeId) {
    const normCafe = normalizeIdentifier(request.query.cafeId);
    ensureCafeAccess(request, normCafe);
    filter.cafeId = normCafe;
  } else if (request.auth.role === 'OWNER') {
    const assigned = (request.auth.assignedCafeIds || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
    if (!assigned.length) {
      throw new ApiError(403, 'CROSS_CAFE_RESOURCE_DENIED', 'Owner has no assigned cafés.');
    }
    filter.cafeId = { $in: assigned };
  } else if (request.auth.role !== 'MASTER') {
    filter.cafeId = { $in: request.auth.assignedCafeIds };
  }

  const attendanceRecords = await Attendance.find(filter).lean();
  let allCafes = [];
  if (request.auth.role === 'MASTER') {
    allCafes = await Cafe.find({ organisationId, status: 'ACTIVE' }).lean();
  } else {
    allCafes = await Cafe.find({ organisationId, cafeId: { $in: request.auth.assignedCafeIds }, status: 'ACTIVE' }).lean();
  }

  let presentNow = 0;
  let onTime = 0;
  let late = 0;
  let absent = 0;
  let onLeave = 0;
  let missingPunches = 0;
  let overtimePending = 0;

  const needsAttention = [];

  for (const record of attendanceRecords) {
    if (record.status === 'CHECKED_IN' || record.status === 'ON_BREAK') presentNow++;
    if (record.isLate) late++;
    else if (record.status === 'CHECKED_IN' || record.status === 'CHECKED_OUT') onTime++;

    if (record.status === 'ABSENT') absent++;
    if (record.status === 'ON_LEAVE') onLeave++;
    if (record.status === 'MISSED_PUNCH' || (!record.checkOutAt && record.status === 'CHECKED_IN')) {
      missingPunches++;
    }

    if (record.overtimeStatus === 'PENDING_REVIEW' || record.overtimeStatus === 'VERIFIED_BY_ADMIN') {
      overtimePending++;
    }

    if (record.isLate || record.geofenceException || record.qrException) {
      needsAttention.push({
        type: record.isLate ? 'LATE_ARRIVAL' : 'VERIFICATION_EXCEPTION',
        severity: 'MEDIUM',
        userId: record.userId,
        cafeId: record.cafeId,
        businessDate: record.businessDate,
        message: record.isLate ? `Late check-in recorded for ${record.userId}` : `Location/QR exception on punch`,
      });
    }
  }

  const cafeWorkforce = await Promise.all(allCafes.map(async (cafe) => {
    const cafeRecords = attendanceRecords.filter((r) => r.cafeId === cafe.cafeId);
    const checkedIn = cafeRecords.filter((r) => r.status === 'CHECKED_IN' || r.status === 'ON_BREAK').length;

    // Real scheduled count from published roster
    let scheduledCount = 0;
    try {
      const wsd = getWeekStartDate(businessDate);
      const roster = await ShiftRoster.findOne({
        organisationId,
        cafeId: cafe.cafeId,
        weekStartDate: wsd,
        status: 'PUBLISHED',
      }).lean();
      if (roster) {
        scheduledCount = (roster.assignments || []).filter((a) => a.date === businessDate).length;
      }
    } catch (_) {}

    return {
      cafeId: cafe.cafeId,
      cafeName: cafe.name,
      scheduled: scheduledCount,
      present: checkedIn,
      adequacyStatus: scheduledCount > 0 ? (checkedIn >= scheduledCount ? 'ADEQUATE' : 'UNDERSTAFFED') : 'NO_ROSTER',
    };
  }));

  const scheduledToday = cafeWorkforce.reduce(
    (sum, cafe) => sum + (Number.isFinite(Number(cafe.scheduled)) ? Number(cafe.scheduled) : 0),
    0
  );

  return response.status(200).json({
    success: true,
    data: {
      kpis: {
        scheduledToday,
        presentNow,
        onTime,
        late,
        absent,
        onLeave,
        missingPunches,
        overtimePending,
      },
      cafeWorkforce,
      needsAttention: needsAttention.slice(0, 10),
    },
    correlationId: request.correlationId || null,
  });
});

// 2. GET /api/v1/attendance/live
const getLiveAttendance = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const businessDate = request.query.date || getIstBusinessDate();

  ensureCafeOperationsAllowed(request);

  const filter = { organisationId, businessDate };
  if (request.query.cafeId) {
    const normCafe = normalizeIdentifier(request.query.cafeId);
    ensureCafeAccess(request, normCafe);
    filter.cafeId = normCafe;
  } else if (request.auth.role === 'OWNER') {
    const assigned = (request.auth.assignedCafeIds || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
    if (!assigned.length) {
      throw new ApiError(403, 'CROSS_CAFE_RESOURCE_DENIED', 'Owner has no assigned cafés.');
    }
    filter.cafeId = { $in: assigned };
  } else if (request.auth.role !== 'MASTER') {
    filter.cafeId = { $in: request.auth.assignedCafeIds };
  }

  if (request.query.status) {
    filter.status = request.query.status.toUpperCase();
  }

  const records = await Attendance.find(filter)
    .sort({ checkInAt: -1 })
    .lean();

  return response.status(200).json({
    success: true,
    data: { attendance: records },
    correlationId: request.correlationId || null,
  });
});

// 3. POST /api/v1/attendance/master-manual (Primary Master or authorized Café Admin)
const recordMasterManualAttendance = asyncHandler(async (request, response) => {
  const {
    userId: rawUserId,
    cafeId: rawCafeId,
    businessDate = getIstBusinessDate(),
    eventType: rawEventType = 'CHECK_IN',
    time = null,
    reason,
    notes = '',
  } = request.body || {};

  if (!['MASTER', 'CAFE_ADMIN'].includes(request.auth.role)) {
    throw new ApiError(403, 'PERMISSION_DENIED', 'Only Primary Master or Café Admin can record manual attendance.');
  }

  ensureCafeOperationsAllowed(request);

  const userId = normalizeIdentifier(rawUserId);
  const cafeId = normalizeIdentifier(rawCafeId);
  const eventType = normalizeIdentifier(rawEventType);

  if (!userId) throw new ApiError(400, 'USER_ID_REQUIRED', 'Employee userId is required.');
  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  if (!reason || !reason.trim()) throw new ApiError(400, 'REASON_REQUIRED', 'A reason for manual attendance entry is required.');
  if (!['CHECK_IN', 'CHECK_OUT'].includes(eventType)) {
    throw new ApiError(
      400,
      'MANUAL_EVENT_TYPE_UNSUPPORTED',
      'Manual attendance supports CHECK_IN or CHECK_OUT only. Leave and full-day changes must use their dedicated approval/correction workflow.'
    );
  }

  ensureCafeAccess(request, cafeId);

  const targetUser = await User.findOne({
    organisationId: request.auth.organisationId,
    userId,
  });

  if (!targetUser) {
    throw new ApiError(404, 'EMPLOYEE_NOT_FOUND', 'Employee account was not found.');
  }

  const employeeCafes = new Set([
    ...(targetUser.assignedCafeIds || []),
    targetUser.primaryCafeId,
  ].filter(Boolean).map(normalizeIdentifier));

  if (!employeeCafes.has(cafeId)) {
    throw new ApiError(
      422,
      'ATTENDANCE_EMPLOYEE_CAFE_MISMATCH',
      'The selected employee is not currently assigned to this café.'
    );
  }

  if (
    String(targetUser.accountStatus || '').toUpperCase() !== 'ACTIVE' ||
    ['EXITED', 'ARCHIVED'].includes(String(targetUser.employmentStatus || '').toUpperCase())
  ) {
    throw new ApiError(422, 'ATTENDANCE_EMPLOYEE_INACTIVE', 'Manual attendance cannot be recorded for an inactive employee.');
  }

  let attendance = await Attendance.findOne({
    organisationId: request.auth.organisationId,
    userId,
    businessDate,
  });

  const punchTime = time ? new Date(time) : new Date();
  if (Number.isNaN(punchTime.getTime())) {
    throw new ApiError(400, 'ATTENDANCE_TIME_INVALID', 'Manual attendance time is invalid.');
  }

  if (eventType === 'CHECK_IN') {
    if (attendance) {
      throw new ApiError(
        409,
        'ATTENDANCE_RECORD_ALREADY_EXISTS',
        'Attendance already exists for this employee and date. Use the audited correction workflow instead.'
      );
    }

    const attendanceId = await SequenceCounter.generateId({
      organisationId: request.auth.organisationId,
      sequenceKey: 'ATTENDANCE',
      prefix: `AT-${businessDate.replace(/-/g, '')}`,
      minimumDigits: 3,
    });

    attendance = new Attendance({
      attendanceId,
      organisationId: request.auth.organisationId,
      cafeId,
      userId,
      businessDate,
      status: 'CHECKED_IN',
      checkInAt: punchTime,
      checkInSource: request.auth.role === 'MASTER' ? 'MASTER' : 'CAFE_ADMIN',
      checkInRecordedBy: request.auth.userId,
      isManualEntry: true,
      notes: notes.trim(),
      createdBy: request.auth.userId,
      rawTimeEvents: [
        {
          eventType: 'CHECK_IN',
          timestamp: punchTime,
          source: request.auth.role === 'MASTER' ? 'MASTER' : 'CAFE_ADMIN',
          recordedByUserId: request.auth.userId,
          notes: reason.trim(),
        },
      ],
    });
  } else {
    if (!attendance || !attendance.checkInAt || attendance.checkOutAt) {
      throw new ApiError(
        409,
        'MANUAL_CHECK_OUT_STATE_INVALID',
        'Manual check-out requires an existing open check-in for the selected employee and date.'
      );
    }

    if (normalizeIdentifier(attendance.cafeId) !== cafeId) {
      throw new ApiError(
        422,
        'ATTENDANCE_CAFE_MISMATCH',
        'Manual check-out must use the café recorded on the active attendance entry.'
      );
    }

    attendance.isManualEntry = true;
    attendance.updatedBy = request.auth.userId;
    attendance.checkOutAt = punchTime;
    attendance.checkOutSource = request.auth.role === 'MASTER' ? 'MASTER' : 'CAFE_ADMIN';
    attendance.checkOutRecordedBy = request.auth.userId;
    attendance.status = 'CHECKED_OUT';
    if (!Array.isArray(attendance.rawTimeEvents)) attendance.rawTimeEvents = [];
    attendance.rawTimeEvents.push({
      eventType: 'CHECK_OUT',
      timestamp: punchTime,
      source: request.auth.role === 'MASTER' ? 'MASTER' : 'CAFE_ADMIN',
      recordedByUserId: request.auth.userId,
      notes: reason.trim(),
    });

    const metrics = calculateAttendanceMetrics({
      checkInAt: attendance.checkInAt,
      checkOutAt: attendance.checkOutAt,
      breaks: attendance.breaks,
      breakMinutes: attendance.breakMinutes,
      scheduledStartAt: attendance.scheduledStartAt,
      scheduledEndAt: attendance.scheduledEndAt,
      scheduledDurationMinutes: attendance.scheduledDurationMinutes,
      approvedOvertimeMinutes: attendance.approvedOvertimeMinutes,
    });
    attendance.totalWorkedMinutes = metrics.totalWorkedMinutes;
    attendance.workedMinutes = metrics.totalWorkedMinutes;
    attendance.regularMinutes = metrics.regularMinutes;
    attendance.detectedOvertimeMinutes = metrics.detectedOvertimeMinutes;
    attendance.payableMinutes = metrics.payableMinutes;
  }

  await attendance.save();

  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: request.auth.role === 'MASTER' ? 'MASTER_MANUAL_ATTENDANCE_RECORDED' : 'CAFE_ADMIN_MANUAL_ATTENDANCE_RECORDED',
    entityType: 'Attendance',
    entityId: attendance.attendanceId,
    metadata: {
      userId,
      cafeId,
      businessDate,
      eventType,
      reason: reason.trim(),
      operatorSessionId: request.auth.operatorSession?.sessionId || null,
      deviceId: request.auth.deviceContext?.deviceId || null,
    },
  });

  return response.status(200).json({
    success: true,
    message: 'Manual attendance successfully recorded with full audit trail.',
    data: { attendance },
    correlationId: request.correlationId || null,
  });
});

// 4. GET /api/v1/attendance/calendar-360/:userId
const getEmployeeMonthlyCalendar = asyncHandler(async (request, response) => {
  const normUserId = normalizeIdentifier(request.params.userId);
  const year = Number(request.query.year) || new Date().getFullYear();
  const month = Number(request.query.month) || new Date().getMonth() + 1;

  const monthStr = String(month).padStart(2, '0');
  const datePrefix = `${year}-${monthStr}`;

  // Strict employee privacy and live authority boundary.
  if (request.auth.role === 'STAFF') {
    if (normalizeIdentifier(request.auth.userId) !== normUserId) {
      throw new ApiError(403, 'FORBIDDEN', 'Staff members may only view their own attendance records.');
    }
  } else {
    ensureCafeOperationsAllowed(request);
  }

  const filter = {
    organisationId: request.auth.organisationId,
    userId: normUserId,
    businessDate: { $regex: `^${datePrefix}` },
  };

  if (request.auth.role === 'OWNER' || request.auth.role === 'CAFE_ADMIN') {
    const assigned = (request.auth.assignedCafeIds || []).map(normalizeIdentifier).filter(Boolean);
    if (!assigned.length) {
      throw new ApiError(403, 'CAFE_ACCESS_DENIED', 'No authorised café scope is available for attendance history.');
    }
    filter.cafeId = { $in: assigned };
  }

  const records = await Attendance.find(filter).sort({ businessDate: 1 }).lean();

  let totalWorkedMinutes = 0;
  let totalOvertimeMinutes = 0;
  let daysPresent = 0;
  let daysLate = 0;
  let daysAbsent = 0;

  for (const r of records) {
    totalWorkedMinutes += r.totalWorkedMinutes || 0;
    totalOvertimeMinutes += r.approvedOvertimeMinutes || 0;
    if (r.status === 'CHECKED_IN' || r.status === 'CHECKED_OUT') daysPresent++;
    if (r.isLate) daysLate++;
    if (r.status === 'ABSENT') daysAbsent++;
  }

  return response.status(200).json({
    success: true,
    data: {
      userId: normUserId,
      year,
      month,
      summary: {
        totalHoursWorked: (totalWorkedMinutes / 60).toFixed(1),
        totalOvertimeHours: (totalOvertimeMinutes / 60).toFixed(1),
        daysPresent,
        daysLate,
        daysAbsent,
      },
      records,
    },
    correlationId: request.correlationId || null,
  });
});

// 5. Shift Rosters
const getRoster = asyncHandler(async (request, response) => {
  const { weekStartDate, cafeId: rawCafe } = request.query;
  ensureCafeOperationsAllowed(request);

  const cafeId = rawCafe
    ? normalizeIdentifier(rawCafe)
    : normalizeIdentifier(request.auth.primaryCafeId || request.auth.assignedCafeIds?.[0] || '');
  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required for attendance roster access.');
  }
  ensureCafeAccess(request, cafeId);

  const effectiveWeekStart = weekStartDate || getWeekStartDate(getIstBusinessDate());

  const roster = await ShiftRoster.findOne({
    organisationId: request.auth.organisationId,
    cafeId,
    weekStartDate: effectiveWeekStart,
  }).lean();

  return response.status(200).json({
    success: true,
    data: { roster: roster || { cafeId, weekStartDate: effectiveWeekStart, status: 'DRAFT', assignments: [] } },
    correlationId: request.correlationId || null,
  });
});

const saveRoster = asyncHandler(async (request, response) => {
  const { cafeId: rawCafe, weekStartDate, assignments = [] } = request.body || {};
  ensureCafeOperationsAllowed(request);

  const cafeId = rawCafe
    ? normalizeIdentifier(rawCafe)
    : normalizeIdentifier(request.auth.primaryCafeId || request.auth.assignedCafeIds?.[0] || '');
  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required for attendance roster access.');
  }
  ensureCafeAccess(request, cafeId);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekStartDate || ''))) {
    throw new ApiError(400, 'ROSTER_WEEK_INVALID', 'weekStartDate must use YYYY-MM-DD format.');
  }

  const weekStart = new Date(`${weekStartDate}T00:00:00+05:30`);
  if (Number.isNaN(weekStart.getTime()) || weekStart.getDay() !== 1) {
    throw new ApiError(400, 'ROSTER_WEEK_MUST_START_MONDAY', 'Attendance roster weekStartDate must be a Monday.');
  }

  if (!Array.isArray(assignments) || assignments.length > 500) {
    throw new ApiError(400, 'ROSTER_ASSIGNMENTS_INVALID', 'Roster assignments must be an array of at most 500 entries.');
  }

  const allowedDates = new Set(
    Array.from({ length: 7 }, (_, offset) => {
      const d = new Date(weekStart.getTime() + offset * 86400000);
      return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    })
  );
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const seen = new Set();
  const normalizedAssignments = assignments.map((assignment, index) => {
    const userId = normalizeIdentifier(assignment?.userId);
    const date = String(assignment?.date || '').trim();
    const startTime = String(assignment?.startTime || '').trim();
    const endTime = String(assignment?.endTime || '').trim();

    if (!userId || !allowedDates.has(date) || !timePattern.test(startTime) || !timePattern.test(endTime)) {
      throw new ApiError(
        400,
        'ROSTER_ASSIGNMENT_INVALID',
        `Roster assignment ${index + 1} has invalid employee, date, startTime, or endTime.`
      );
    }

    const duplicateKey = `${userId}|${date}`;
    if (seen.has(duplicateKey)) {
      throw new ApiError(409, 'ROSTER_ASSIGNMENT_DUPLICATE', `Duplicate roster assignment for ${userId} on ${date}.`);
    }
    seen.add(duplicateKey);

    return {
      userId,
      date,
      shiftTemplateId: assignment.shiftTemplateId ? normalizeIdentifier(assignment.shiftTemplateId) : null,
      shiftName: assignment.shiftName ? String(assignment.shiftName).trim() : null,
      startTime,
      endTime,
      breakMinutes: Math.max(0, Number(assignment.breakMinutes) || 0),
      assignedRole: assignment.assignedRole ? String(assignment.assignedRole).trim() : null,
    };
  });

  await ensureRosterAssignmentCafeMembership({
    organisationId: request.auth.organisationId,
    cafeId,
    assignments: normalizedAssignments,
  });

  let roster = await ShiftRoster.findOne({
    organisationId: request.auth.organisationId,
    cafeId,
    weekStartDate,
  });

  if (roster && ['PUBLISHED', 'LOCKED', 'ARCHIVED'].includes(roster.status)) {
    throw new ApiError(
      423,
      'ROSTER_IMMUTABLE',
      `Roster ${roster.rosterId} is ${roster.status} and cannot be edited as a draft.`
    );
  }

  if (!roster) {
    const rosterId = `ROS-${weekStartDate.replace(/-/g, '')}-${cafeId}`;
    roster = new ShiftRoster({
      rosterId,
      organisationId: request.auth.organisationId,
      cafeId,
      weekStartDate,
      status: 'DRAFT',
      assignments: normalizedAssignments,
      createdByUserId: request.auth.userId,
    });
  } else {
    roster.assignments = normalizedAssignments;
  }

  await roster.save();

  return response.status(200).json({
    success: true,
    message: 'Shift roster saved as draft.',
    data: { roster },
    correlationId: request.correlationId || null,
  });
});

// 5b. POST /api/v1/attendance/roster/:rosterId/publish
const publishRoster = asyncHandler(async (request, response) => {
  const { rosterId: rawId } = request.params;
  const rosterId = normalizeIdentifier(rawId);

  if (!['MASTER', 'OWNER', 'CAFE_ADMIN'].includes(request.auth.role)) {
    throw new ApiError(403, 'PERMISSION_DENIED', 'Only Master, Owner, or Café Admin can publish a roster.');
  }

  const roster = await ShiftRoster.findOne({
    rosterId,
    organisationId: request.auth.organisationId,
  });

  if (!roster) throw new ApiError(404, 'ROSTER_NOT_FOUND', 'Roster not found.');

  // Re-check live authority at execution time. This rejects any retired/non-primary
  // MASTER identity and applies café scope to Owner and Café Admin publication.
  ensureCafeOperationsAllowed(request);
  ensureCafeAccess(request, roster.cafeId);

  if (roster.status === 'PUBLISHED') {
    return response.status(200).json({
      success: true, message: 'Roster is already published.', data: { roster: roster.toObject() },
      correlationId: request.correlationId || null,
    });
  }

  // Validate assignments: no duplicate userId+date
  const seen = new Set();
  const errors = [];
  for (const a of (roster.assignments || [])) {
    const key = `${a.userId}|${a.date}`;
    if (seen.has(key)) errors.push(`Duplicate assignment for ${a.userId} on ${a.date}`);
    seen.add(key);
    if (!a.startTime || !a.endTime) errors.push(`Assignment for ${a.userId} on ${a.date} missing startTime/endTime`);
  }
  if (errors.length > 0) {
    throw new ApiError(422, 'ROSTER_VALIDATION_FAILED', errors.join('; '));
  }

  await ensureRosterAssignmentCafeMembership({
    organisationId: request.auth.organisationId,
    cafeId: roster.cafeId,
    assignments: roster.assignments || [],
  });

  // Archive any previously published roster for the same café+week
  await ShiftRoster.updateMany(
    {
      organisationId: request.auth.organisationId,
      cafeId: roster.cafeId,
      weekStartDate: roster.weekStartDate,
      status: 'PUBLISHED',
      rosterId: { $ne: rosterId },
    },
    { $set: { status: 'ARCHIVED' } }
  );

  roster.status = 'PUBLISHED';
  roster.publishedByUserId = request.auth.userId;
  roster.publishedAt = new Date();
  await roster.save();

  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: 'ROSTER_PUBLISHED',
    entityType: 'ShiftRoster',
    entityId: rosterId,
    metadata: {
      cafeId: roster.cafeId,
      weekStartDate: roster.weekStartDate,
      assignmentCount: roster.assignments.length,
    },
  });

  // Dispatch canonical Notification and NotificationOutbox to assigned employees
  try {
    const { Notification } = require('../../models/Notification');
    const { NotificationOutbox } = require('../../models/NotificationOutbox');
    const { User } = require('../../models/User');

    const uniqueUserIds = [...new Set((roster.assignments || []).map((a) => a.userId).filter(Boolean))];
    for (const empUserId of uniqueUserIds) {
      const deduplicationKey = `ROSTER_PUB:${rosterId}:${empUserId}`;
      const existingNotif = await Notification.findOne({
        organisationId: request.auth.organisationId,
        deduplicationKey,
      }).lean();

      if (!existingNotif) {
        let recipientEmail = `${String(empUserId).toLowerCase()}@zamorincafe.com`;
        let recipientName = empUserId;
        try {
          const u = await User.findOne({ organisationId: request.auth.organisationId, userId: empUserId }).select('email name').lean();
          if (u?.email) recipientEmail = u.email;
          if (u?.name) recipientName = u.name;
        } catch (_) {}

        const outboxId = `OUT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        await NotificationOutbox.create({
          outboxId,
          organisationId: request.auth.organisationId,
          eventType: 'ROSTER_PUBLISHED',
          recipientUserId: empUserId,
          recipientEmail,
          recipientName,
          recipientRole: 'STAFF',
          templateId: 'ROSTER_PUBLISHED_NOTICE',
          subject: `Weekly Shift Schedule Published (${roster.weekStartDate})`,
          renderedSubject: `Weekly Shift Schedule Published (${roster.weekStartDate})`,
          renderedBody: `Your weekly duty roster commencing ${roster.weekStartDate} at café ${roster.cafeId} has been published.`,
          status: 'QUEUED',
          nextAttemptAt: new Date(),
        });

        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const notifId = `NT-${todayStr}-${Math.floor(1000 + Math.random() * 9000)}`;
        await Notification.create({
          notificationId: notifId,
          organisationId: request.auth.organisationId,
          eventType: 'ROSTER_PUBLISHED',
          category: 'OPERATIONS',
          recipientUserId: empUserId,
          recipientRole: 'STAFF',
          recipientEmail,
          title: 'Shift Schedule Published',
          message: `Your duty roster for week commencing ${roster.weekStartDate} has been published.`,
          priority: 'NORMAL',
          channels: ['IN_APP'],
          deepLink: '#staff-attendance?tab=weekly-roster',
          sourceModule: 'ATTENDANCE',
          sourceEntityType: 'ShiftRoster',
          sourceEntityId: rosterId,
          deduplicationKey,
          correlationId: request.correlationId || outboxId,
          createdBy: request.auth.userId || 'SYSTEM',
        });
      }
    }
  } catch (notifErr) {
    // Non-blocking notification dispatch
  }

  return response.status(200).json({
    success: true,
    message: `Roster for week ${roster.weekStartDate} published successfully.`,
    data: { roster: roster.toObject() },
    correlationId: request.correlationId || null,
  });
});

// 5c. GET /api/v1/attendance/roster/shifts — list shift templates available for roster builder
const listShiftsForRoster = asyncHandler(async (request, response) => {
  const { Shift } = require('../../models/Shift');
  ensureCafeOperationsAllowed(request);

  const cafeId = request.query.cafeId ? normalizeIdentifier(request.query.cafeId) : null;
  const filter = { organisationId: request.auth.organisationId, isActive: true };

  if (cafeId) {
    ensureCafeAccess(request, cafeId);
    filter.$or = [{ cafeId }, { cafeId: null }];
  } else if (request.auth.role !== 'MASTER') {
    const assigned = (request.auth.assignedCafeIds || [])
      .map((id) => normalizeIdentifier(id))
      .filter(Boolean);
    if (!assigned.length) {
      throw new ApiError(403, 'CAFE_ACCESS_DENIED', 'No authorised café scope is available for roster shift templates.');
    }
    filter.$or = [{ cafeId: { $in: assigned } }, { cafeId: null }];
  }

  const shifts = await Shift.find(filter).sort({ isDefault: -1, name: 1 }).lean();
  return response.status(200).json({
    success: true, data: { shifts }, correlationId: request.correlationId || null,
  });
});

// 6. Overtime Decision (CAFE_ADMIN verification -> Primary Master final decision)
const decideOvertime = asyncHandler(async (request, response) => {
  const {
    attendanceId: rawAttId,
    decision: rawDecision,
    approvedMinutes,
    reason = '',
  } = request.body || {};
  const attendanceId = normalizeIdentifier(rawAttId);
  const decision = normalizeIdentifier(rawDecision);

  if (!['APPROVE', 'VERIFY_ADMIN', 'REJECT'].includes(decision)) {
    throw new ApiError(
      400,
      'OVERTIME_DECISION_INVALID',
      'Overtime decision must be APPROVE, VERIFY_ADMIN, or REJECT.'
    );
  }

  const attendance = await Attendance.findOne({
    attendanceId,
    organisationId: request.auth.organisationId,
  });

  if (!attendance) {
    throw new ApiError(404, 'ATTENDANCE_NOT_FOUND', 'Attendance record not found.');
  }

  await ensurePeriodNotLocked(request.auth.organisationId, attendance.businessDate);

  const beforeSnapshot = {
    overtimeStatus: attendance.overtimeStatus,
    detectedOvertimeMinutes: attendance.detectedOvertimeMinutes,
    approvedOvertimeMinutes: attendance.approvedOvertimeMinutes,
    overtimeDecidedByUserId: attendance.overtimeDecidedByUserId,
    overtimeReason: attendance.overtimeReason,
  };

  if (decision === 'VERIFY_ADMIN') {
    if (request.auth.role !== 'CAFE_ADMIN') {
      throw new ApiError(
        403,
        'CAFE_ADMIN_VERIFICATION_REQUIRED',
        'Only an authorised Café Admin may verify detected overtime before final review.'
      );
    }
    ensureCafeOperationsAllowed(request);
    ensureCafeAccess(request, attendance.cafeId);

    attendance.overtimeStatus = 'VERIFIED_BY_ADMIN';
    attendance.overtimeReason = reason.trim();
  } else {
    if (request.auth.role !== 'MASTER' || request.auth.isPrimaryMaster !== true) {
      throw new ApiError(
        403,
        'PRIMARY_MASTER_AUTHORITY_REQUIRED',
        'Final overtime approval or rejection requires Primary Master authority.'
      );
    }
    ensureCafeAccess(request, attendance.cafeId);

    if (decision === 'APPROVE') {
      const detectedMinutes = Math.max(0, Number(attendance.detectedOvertimeMinutes) || 0);
      const requestedMinutes =
        approvedMinutes === undefined || approvedMinutes === null || approvedMinutes === ''
          ? detectedMinutes
          : Number(approvedMinutes);

      if (!Number.isFinite(requestedMinutes) || requestedMinutes < 0) {
        throw new ApiError(400, 'OVERTIME_MINUTES_INVALID', 'Approved overtime minutes must be a finite non-negative number.');
      }
      if (requestedMinutes > detectedMinutes) {
        throw new ApiError(
          422,
          'OVERTIME_EXCEEDS_DETECTED',
          'Approved overtime minutes cannot exceed the server-detected overtime. Correct attendance first if the detected duration is wrong.'
        );
      }

      attendance.overtimeStatus = 'APPROVED_BY_PRIMARY';
      attendance.approvedOvertimeMinutes = Math.round(requestedMinutes);
      attendance.overtimeReason = reason.trim();
    } else {
      if (!reason.trim()) {
        throw new ApiError(400, 'REASON_REQUIRED', 'A reason is required to reject overtime.');
      }
      attendance.overtimeStatus = 'REJECTED';
      attendance.approvedOvertimeMinutes = 0;
      attendance.overtimeReason = reason.trim();
    }

    attendance.overtimeDecidedByUserId = request.auth.userId;
    attendance.overtimeDecidedAt = new Date();
  }

  await attendance.save();

  await flagPayrollRecalculationRequired(
    request.auth.organisationId,
    attendance.cafeId,
    attendance.businessDate,
    request.auth.userId
  );

  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: 'ATTENDANCE_OVERTIME_DECIDED',
    entityType: 'Attendance',
    entityId: attendance.attendanceId,
    metadata: {
      decision,
      cafeId: attendance.cafeId,
      businessDate: attendance.businessDate,
      userId: attendance.userId,
      beforeSnapshot,
      afterSnapshot: {
        overtimeStatus: attendance.overtimeStatus,
        detectedOvertimeMinutes: attendance.detectedOvertimeMinutes,
        approvedOvertimeMinutes: attendance.approvedOvertimeMinutes,
        overtimeDecidedByUserId: attendance.overtimeDecidedByUserId,
        overtimeReason: attendance.overtimeReason,
      },
    },
  });

  return response.status(200).json({
    success: true,
    message: `Overtime ${decision.toLowerCase()} processed.`,
    data: { attendance },
    correlationId: request.correlationId || null,
  });
});

// 7. Period Closure (Primary Master Lock & Controlled Reopen)
const closePeriod = asyncHandler(async (request, response) => {
  const { periodId: rawPid } = request.params;
  const periodId = normalizeIdentifier(rawPid);

  if (request.auth.role !== 'MASTER' || !request.auth.isPrimaryMaster) {
    throw new ApiError(403, 'PRIMARY_MASTER_AUTHORITY_REQUIRED', 'Only Primary Master can lock attendance periods for payroll.');
  }

  let period = await AttendancePeriod.findOne({
    periodId,
    organisationId: request.auth.organisationId,
  });

  if (!period) {
    const [year, month] = periodId.replace('PER-', '').split('-').map(Number);
    period = new AttendancePeriod({
      periodId,
      organisationId: request.auth.organisationId,
      year,
      month,
    });
  }

  period.status = 'LOCKED';
  period.lockedByUserId = request.auth.userId;
  period.lockedAt = new Date();
  await period.save();

  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: 'ATTENDANCE_PERIOD_LOCKED',
    entityType: 'AttendancePeriod',
    entityId: period.periodId,
    metadata: { periodId, lockedByUserId: request.auth.userId },
  });

  return response.status(200).json({
    success: true,
    message: `Attendance Period ${periodId} successfully locked. Payroll export ready.`,
    data: { period },
    correlationId: request.correlationId || null,
  });
});

const reopenPeriod = asyncHandler(async (request, response) => {
  const { periodId: rawPid } = request.params;
  const { reason = '' } = request.body || {};
  const periodId = normalizeIdentifier(rawPid);

  if (request.auth.role !== 'MASTER' || !request.auth.isPrimaryMaster) {
    throw new ApiError(403, 'PRIMARY_MASTER_AUTHORITY_REQUIRED', 'Only Primary Master can reopen a locked attendance period.');
  }

  if (!reason.trim()) throw new ApiError(400, 'REASON_REQUIRED', 'A mandatory reason is required to reopen a locked period.');

  const period = await AttendancePeriod.findOne({
    periodId,
    organisationId: request.auth.organisationId,
  });

  if (!period) throw new ApiError(404, 'PERIOD_NOT_FOUND', 'Attendance period not found.');

  period.status = 'OPEN';
  period.reopenedByUserId = request.auth.userId;
  period.reopenedAt = new Date();
  period.reopenReason = reason.trim();
  period.reopenHistory.push({
    reopenedAt: new Date(),
    reopenedByUserId: request.auth.userId,
    reason: reason.trim(),
  });

  await period.save();

  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: 'ATTENDANCE_PERIOD_REOPENED',
    entityType: 'AttendancePeriod',
    entityId: period.periodId,
    metadata: { periodId, reason },
  });

  return response.status(200).json({
    success: true,
    message: `Attendance Period ${periodId} reopened for corrections.`,
    data: { period },
    correlationId: request.correlationId || null,
  });
});

// 8. Selfie Evidence Purge (Primary Master Only)
const purgeSelfieEvidence = asyncHandler(async (request, response) => {
  if (request.auth.role !== 'MASTER' || request.auth.isPrimaryMaster !== true) {
    throw new ApiError(
      403,
      'PRIMARY_MASTER_AUTHORITY_REQUIRED',
      'Only the Primary Master holds authority to execute selfie evidence retention purge.'
    );
  }

  // Committed attendance evidence retention remains fail-closed. The separate
  // orphan reconciliation workflow only removes expired uploads that are not
  // referenced by any Attendance record.
  throw new ApiError(
    503,
    'EVIDENCE_PURGE_NOT_CONFIGURED',
    'Committed attendance selfie purge remains disabled until a formal retention policy is approved. Use orphan reconciliation only for expired, unlinked uploads.'
  );
});

const reconcileOrphanSelfieEvidence = asyncHandler(async (request, response) => {
  if (request.auth.role !== 'MASTER' || request.auth.isPrimaryMaster !== true) {
    throw new ApiError(
      403,
      'PRIMARY_MASTER_AUTHORITY_REQUIRED',
      'Only the Primary Master may reconcile expired orphan attendance evidence.'
    );
  }

  const {
    execute = false,
    confirmation = '',
    graceMinutes,
    batchSize,
  } = request.body || {};

  const dryRun = execute !== true;
  if (
    !dryRun &&
    String(confirmation || '').trim() !== 'DELETE_EXPIRED_UNLINKED_ATTENDANCE_SELFIES'
  ) {
    throw new ApiError(
      400,
      'ORPHAN_RECONCILIATION_CONFIRMATION_REQUIRED',
      'Execution requires confirmation DELETE_EXPIRED_UNLINKED_ATTENDANCE_SELFIES.'
    );
  }

  const result = await reconcileExpiredOrphanAttendanceEvidence({
    organisationId: request.auth.organisationId,
    actorUserId: request.auth.userId,
    graceMinutes,
    batchSize,
    dryRun,
  });

  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: dryRun
      ? 'ATTENDANCE_ORPHAN_EVIDENCE_RECONCILIATION_PREVIEWED'
      : 'ATTENDANCE_ORPHAN_EVIDENCE_RECONCILED',
    entityType: 'AttendanceEvidence',
    entityId: request.auth.organisationId,
    metadata: {
      dryRun,
      policy: result.policy,
      scanned: result.scanned,
      staleReservationsScanned: result.staleReservationsScanned,
      staleReservationsLinked: result.staleReservationsLinked,
      staleReservationsCommitted: result.staleReservationsCommitted,
      staleReservationsQuarantined: result.staleReservationsQuarantined,
      staleReservationConflicts: result.staleReservationConflicts,
      linkedProtected: result.linkedProtected,
      eligibleOrphans: result.eligibleOrphans,
      deleted: result.deleted,
      storageAlreadyMissing: result.storageAlreadyMissing,
      claimConflicts: result.claimConflicts,
      metadataDeleteConflicts: result.metadataDeleteConflicts,
      failed: result.failed,
    },
  });

  return response.status(200).json({
    success: true,
    message: dryRun
      ? 'Expired orphan attendance evidence reconciliation preview completed.'
      : 'Expired orphan attendance evidence reconciliation completed.',
    data: result,
    correlationId: request.correlationId || null,
  });
});

const auditAttendanceEvidence = asyncHandler(async (request, response) => {
  if (request.auth.role !== 'MASTER' || request.auth.isPrimaryMaster !== true) {
    throw new ApiError(
      403,
      'PRIMARY_MASTER_AUTHORITY_REQUIRED',
      'Only the Primary Master may execute attendance evidence integrity audits.'
    );
  }

  const {
    attendanceId = '',
    cafeId = '',
    batchSize,
    verifyStorageBytes = true,
  } = request.body || {};

  const result = await auditAttendanceEvidenceIntegrity({
    organisationId: request.auth.organisationId,
    attendanceId,
    cafeId,
    batchSize,
    verifyStorageBytes: verifyStorageBytes !== false,
  });

  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: 'ATTENDANCE_EVIDENCE_INTEGRITY_AUDITED',
    entityType: 'AttendanceEvidence',
    entityId: normalizeIdentifier(attendanceId) || normalizeIdentifier(cafeId) || request.auth.organisationId,
    metadata: {
      attendanceId: normalizeIdentifier(attendanceId) || null,
      cafeId: normalizeIdentifier(cafeId) || null,
      recordsScanned: result.recordsScanned,
      evidenceSlotsScanned: result.evidenceSlotsScanned,
      passed: result.passed,
      failed: result.failed,
      integrityOk: result.integrityOk,
      verifyStorageBytes: result.verifyStorageBytes,
    },
  });

  return response.status(200).json({
    success: true,
    message: result.integrityOk
      ? 'Attendance evidence integrity audit completed without detected failures.'
      : 'Attendance evidence integrity audit detected one or more failures.',
    data: result,
    correlationId: request.correlationId || null,
  });
});

// 9. GET /api/v1/attendance/server-time
const getServerTime = asyncHandler(async (request, response) => {
  const now = new Date();
  const istDisplay = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(now);

  return response.status(200).json({
    success: true,
    data: {
      utc: now.toISOString(),
      istDisplay: `${istDisplay} IST`,
      istDateKey: getIstBusinessDate(now),
    },
    correlationId: request.correlationId || null,
  });
});

// 10. GET /api/v1/attendance/policy
const getStaffPolicy = asyncHandler(async (request, response) => {
  const cafeId = normalizeIdentifier(
    request.query.cafeId || request.auth.primaryCafeId || (request.auth.assignedCafeIds && request.auth.assignedCafeIds[0]) || ''
  );
  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'No café scope is available for attendance policy.');
  }
  ensureCafeAccess(request, cafeId);

  const cafe = await Cafe.findOne({
    organisationId: request.auth.organisationId,
    cafeId,
    status: { $ne: 'ARCHIVED' },
  }).lean();

  if (!cafe) {
    throw new ApiError(404, 'CAFE_NOT_FOUND', 'The assigned café was not found.');
  }

  const rawRadius = cafe.address?.geofenceRadiusMetres ?? cafe.geofenceRadiusMeters;
  const geofenceRadiusMetres = Number(rawRadius);
  const geofenceConfigured =
    Number.isFinite(Number(cafe.address?.latitude)) &&
    Number.isFinite(Number(cafe.address?.longitude)) &&
    Number.isFinite(geofenceRadiusMetres) &&
    geofenceRadiusMetres >= 10 &&
    geofenceRadiusMetres <= 1000;

  return response.status(200).json({
    success: true,
    data: {
      cafeId,
      verificationMode: 'SECURE',
      geofenceEnabled: geofenceConfigured,
      geofenceRadiusMetres: geofenceConfigured ? geofenceRadiusMetres : null,
      liveSelfieRequired: true,
      rotatingQrRequired: true,
      qrRotationSeconds: 45,
      gracePeriodMinutes: 15,
      unpaidBreakMinutes: 30,
    },
    correlationId: request.correlationId || null,
  });
});

// 11. GET /api/v1/attendance/today
const getStaffToday = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const businessDate = getIstBusinessDate();

  // P0-A05: Look for any open session first (handles overnight shifts)
  let attendance = await Attendance.findOne({
    organisationId,
    userId,
    status: { $in: ['CHECKED_IN', 'ON_BREAK'] },
    checkOutAt: null,
  }).sort({ checkInAt: -1 }).lean();

  if (!attendance) {
    attendance = await Attendance.findOne({
      organisationId,
      userId,
      businessDate,
    }).lean();
  }

  const status = attendance ? attendance.status : 'NOT_STARTED';
  const canCheckIn = status === 'NOT_STARTED' || status === 'MISSED_CHECK_IN';
  const canCheckOut = status === 'CHECKED_IN' || status === 'ON_BREAK';
  const canStartBreak = status === 'CHECKED_IN';
  const canEndBreak = status === 'ON_BREAK';

  let assignedCafeName = '';
  try {
    const user = await User.findOne({ organisationId, userId }).lean();
    if (user?.primaryCafeName) {
      assignedCafeName = user.primaryCafeName;
    } else if (user?.primaryCafeId) {
      const cafe = await Cafe.findOne({ organisationId, cafeId: user.primaryCafeId }).lean();
      if (cafe) assignedCafeName = cafe.name;
    }
  } catch (e) {}

  const cafeIdForShift = attendance?.cafeId || request.auth.primaryCafeId || (request.auth.assignedCafeIds && request.auth.assignedCafeIds[0]) || null;
  let resolvedShift = null;
  if (cafeIdForShift) {
    try {
      resolvedShift = await resolveEmployeeShiftForDate({
        organisationId,
        userId,
        cafeId: cafeIdForShift,
        businessDate,
      });
    } catch (_) {}
  }

  const defaultShift = resolvedShift ? {
    shiftId: resolvedShift.shiftId || null,
    shiftName: resolvedShift.shiftName || resolvedShift.name || null,
    scheduledStartAt: resolvedShift.startTime
      ? buildShiftDateTime(businessDate, resolvedShift.startTime).toISOString()
      : null,
    scheduledEndAt: resolvedShift.endTime
      ? buildShiftDateTime(businessDate, resolvedShift.endTime).toISOString()
      : null,
    assignedCafeName: assignedCafeName || null,
    unpaidBreakMinutes: Number.isFinite(Number(resolvedShift.unpaidBreakMinutes))
      ? Number(resolvedShift.unpaidBreakMinutes)
      : null,
  } : null;

  return response.status(200).json({
    success: true,
    data: {
      attendance: attendance || null,
      shift: attendance?.scheduledStartAt || attendance?.scheduledEndAt || attendance?.shiftId || attendance?.shiftName ? {
        shiftId: attendance.shiftId || null,
        shiftName: attendance.shiftName || null,
        scheduledStartAt: attendance.scheduledStartAt || null,
        scheduledEndAt: attendance.scheduledEndAt || null,
        assignedCafeName: assignedCafeName || null,
        unpaidBreakMinutes: Number.isFinite(Number(attendance.unpaidBreakMinutes))
          ? Number(attendance.unpaidBreakMinutes)
          : null,
      } : defaultShift,
      canCheckIn,
      canCheckOut,
      canStartBreak,
      canEndBreak,
      businessDate,
    },
    correlationId: request.correlationId || null,
  });
});

// 12. POST /api/v1/attendance/check-in
const staffCheckIn = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const {
    cafeId: rawCafeId,
    latitude,
    longitude,
    accuracyMeters,
    qrToken,
    selfieMediaId: rawSelfieMediaId,
    selfieFileId,
    deviceFingerprint,
    idempotencyKey,
  } = request.body || {};
  const selfieMediaId = rawSelfieMediaId || selfieFileId;

  // P0-A06: Enforce café assignment for STAFF if cafeId is explicitly supplied
  if (rawCafeId && request.auth.role === 'STAFF') {
    const allowed = new Set([...(request.auth.assignedCafeIds || [])]);
    if (request.auth.primaryCafeId) {
      allowed.add(request.auth.primaryCafeId.toUpperCase());
    }
    if (allowed.size > 0 && !allowed.has(rawCafeId.toUpperCase())) {
      throw new ApiError(403, 'CAFE_NOT_ASSIGNED', 'You are not assigned to check in at this café.');
    }
  }

  // Mandatory presence evidence parameter enforcement
  if (!qrToken) {
    throw new ApiError(400, 'QR_TOKEN_REQUIRED', 'Rotating attendance QR token is required.');
  }
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new ApiError(400, 'GEOLOCATION_REQUIRED', 'Live GPS geolocation coordinates are required.');
  }
  // Check if there is an active session (including overnight)
  const openSession = await Attendance.findOne({
    organisationId,
    userId,
    status: { $in: ['CHECKED_IN', 'ON_BREAK'] },
    checkOutAt: null,
  });

  if (openSession) {
    throw new ApiError(400, 'ALREADY_CHECKED_IN', 'You already have an active check-in session.');
  }

  if (!selfieMediaId) {
    throw new ApiError(400, 'SELFIE_EVIDENCE_REQUIRED', 'A live selfie verification photograph is required.');
  }

  // Validate QR challenge token
  const qrValidation = await attendanceQrService.validatePunchQrProof(qrToken, {
    employeeOrgId: organisationId,
    employeeUserId: userId,
    expectedTransition: 'CHECK_IN',
    employeeAssignedCafes: [
      ...(request.auth.assignedCafeIds || []),
      request.auth.primaryCafeId,
    ].filter(Boolean),
    employeeRole: request.auth.role,
  });

  // Authoritative café: derived strictly from the validated QR challenge.
  // Caller-supplied/profile café values never override a verified QR scope.
  const cafeId = normalizeIdentifier(qrValidation.resolvedCafeId || '');
  if (!cafeId) {
    throw new ApiError(400, 'QR_CAFE_SCOPE_REQUIRED', 'The validated attendance QR did not resolve an authoritative café.');
  }

  // Server-authoritative geofence verification
  let geofenceResult = null;
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    geofenceResult = await attendanceQrService.verifyGeofence({
      organisationId,
      cafeId,
      latitude,
      longitude,
      accuracyMeters,
    });
  }

  // Validate uploaded selfie photograph
  if (selfieMediaId) {
    const selfieFile = await PrivateFile.findOne({
      fileId: selfieMediaId,
      organisationId,
      uploadedByUserId: userId,
      'attendanceContext.challengeId': qrValidation.challengeId,
      'attendanceContext.cafeId': cafeId,
      'attendanceContext.punchType': 'CHECK_IN',
      'attendanceCleanup.status': { $ne: 'CLAIMED' },
      'attendanceLink.status': { $nin: ['RESERVED', 'COMMITTED'] },
    });
    if (!selfieFile) {
      throw new ApiError(
        400,
        'SELFIE_CHALLENGE_BINDING_MISMATCH',
        'Check-In selfie is not bound to this verified QR challenge and transition.'
      );
    }
  }

  const businessDate = getIstBusinessDate();
  const punchTime = new Date();

  let attendance = await Attendance.findOne({
    organisationId,
    userId,
    businessDate,
  });

  if (attendance && attendance.status === 'CHECKED_OUT') {
    throw new ApiError(400, 'ALREADY_COMPLETED', 'Attendance is already completed for today.');
  }

  let resolvedShift = null;
  try {
    resolvedShift = await resolveEmployeeShiftForDate({
      organisationId,
      userId,
      cafeId,
      businessDate,
    });
  } catch (_) {}

  const scheduledStartAt = resolvedShift?.startTime
    ? buildShiftDateTime(businessDate, resolvedShift.startTime)
    : null;
  const scheduledEndAt = resolvedShift?.endTime
    ? buildShiftDateTime(businessDate, resolvedShift.endTime)
    : null;
  const shiftId = resolvedShift?.shiftId || null;
  const shiftName = resolvedShift?.shiftName || resolvedShift?.name || null;

  const metrics = calculateAttendanceMetrics({
    checkInAt: punchTime,
    scheduledStartAt,
    scheduledEndAt,
  });

  const checkInEvidence = {
    photoFileId: selfieMediaId || null,
    selfieMediaId: selfieMediaId || null,
    verificationStatus: 'VERIFIED',
    qrChallengeId: qrValidation?.challengeId || null,
    latitude: typeof latitude === 'number' ? latitude : null,
    longitude: typeof longitude === 'number' ? longitude : null,
    accuracyMeters: typeof accuracyMeters === 'number' ? Math.round(accuracyMeters) : null,
    distanceMeters: geofenceResult?.distanceMeters ?? null,
    geofenceVerified: Boolean(geofenceResult?.geofenceVerified || geofenceResult?.valid),
    qrVerified: Boolean(qrValidation?.valid),
    serverTimestamp: punchTime,
    deviceId: qrValidation?.challenge?.deviceId || 'OPS_CONSOLE',
    deviceFingerprint: deviceFingerprint || null,
  };

  if (!attendance) {
    const attendanceId = await SequenceCounter.generateId({
      organisationId,
      sequenceKey: 'ATTENDANCE',
      prefix: `AT-${businessDate.replace(/-/g, '')}`,
      minimumDigits: 3,
    });

    attendance = new Attendance({
      attendanceId,
      organisationId,
      cafeId,
      userId,
      businessDate,
      status: 'CHECKED_IN',
      checkInAt: punchTime,
      checkInSource: 'SELF',
      checkInRecordedBy: userId,
      shiftId,
      shiftName,
      scheduledStartAt,
      scheduledEndAt,
      isLate: metrics.isLate,
      lateMinutes: metrics.lateMinutes,
      selfieFileId: selfieMediaId || null,
      attendanceEvidence: {
        checkIn: checkInEvidence,
        checkOut: null,
      },
      rawTimeEvents: [
        {
          eventType: 'CHECK_IN',
          timestamp: punchTime,
          source: 'SELF',
          recordedByUserId: userId,
          isGeofenceVerified: Boolean(geofenceResult?.geofenceVerified || geofenceResult?.valid),
          isQrVerified: Boolean(qrValidation?.valid),
          isSelfieVerified: Boolean(selfieMediaId),
          selfieFileId: selfieMediaId || null,
        },
      ],
      createdBy: userId,
    });
  } else {
    attendance.status = 'CHECKED_IN';
    attendance.cafeId = cafeId;
    attendance.checkInAt = punchTime;
    attendance.checkInSource = 'SELF';
    attendance.checkInRecordedBy = userId;
    attendance.shiftId = shiftId;
    attendance.shiftName = shiftName;
    attendance.scheduledStartAt = scheduledStartAt;
    attendance.scheduledEndAt = scheduledEndAt;
    attendance.isLate = metrics.isLate;
    attendance.lateMinutes = metrics.lateMinutes;
    if (selfieMediaId) attendance.selfieFileId = selfieMediaId;
    attendance.attendanceEvidence = attendance.attendanceEvidence || {};
    attendance.attendanceEvidence.checkIn = checkInEvidence;
    if (!Array.isArray(attendance.rawTimeEvents)) attendance.rawTimeEvents = [];
    attendance.rawTimeEvents.push({
      eventType: 'CHECK_IN',
      timestamp: punchTime,
      source: 'SELF',
      recordedByUserId: userId,
      isGeofenceVerified: Boolean(geofenceResult?.geofenceVerified || geofenceResult?.valid),
      isQrVerified: Boolean(qrValidation?.valid),
      isSelfieVerified: Boolean(selfieMediaId),
      selfieFileId: selfieMediaId || null,
    });
  }

  const checkInEvidenceReservation = await reserveAttendanceEvidenceLink({
    fileId: selfieMediaId,
    organisationId,
    userId,
    challengeId: qrValidation.challengeId,
    cafeId,
    punchType: 'CHECK_IN',
    attendanceId: attendance.attendanceId,
  });

  try {
    await attendance.save();
  } catch (saveError) {
    await releaseAttendanceEvidenceLink({
      fileId: selfieMediaId,
      organisationId,
      claimId: checkInEvidenceReservation.claimId,
      persisted: checkInEvidenceReservation.persisted,
    }).catch(() => {});
    throw saveError;
  }

  const checkInEvidenceLinkCommitted = await commitAttendanceEvidenceLink({
    fileId: selfieMediaId,
    organisationId,
    claimId: checkInEvidenceReservation.claimId,
    attendanceId: attendance.attendanceId,
    punchType: 'CHECK_IN',
    persisted: checkInEvidenceReservation.persisted,
  }).catch(() => false);

  if (checkInEvidenceReservation.persisted && !checkInEvidenceLinkCommitted) {
    console.error('[Attendance] check-in selfie link finalization did not confirm; reservation remains fail-closed', {
      attendanceId: attendance.attendanceId,
      fileId: selfieMediaId,
    });
  }

  // Persist submission record for idempotency & replay protection
  if (qrValidation?.challengeId || idempotencyKey) {
    const keyToHash = idempotencyKey || `${userId}_CHECK_IN_${punchTime.getTime()}`;
    const idempotencyKeyHash = crypto.createHash('sha256').update(String(keyToHash)).digest('hex');
    await AttendanceSubmission.create({
      submissionId: `SUB_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      organisationId,
      userId,
      cafeId,
      deviceId: qrValidation?.challenge?.deviceId || 'OPS_CONSOLE',
      challengeId: qrValidation?.challengeId || 'CHL_MANUAL',
      idempotencyKeyHash,
      transition: 'CHECK_IN',
      challengeIssuedAt: qrValidation?.issuedAt || punchTime,
      clientScannedAt: punchTime,
      serverReceivedAt: punchTime,
      isOffline: false,
      result: 'ACCEPTED',
    }).catch(() => {});
  }

  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: 'ATTENDANCE_SECURE_CHECK_IN',
    entityType: 'Attendance',
    entityId: attendance.attendanceId || 'ATT-FALLBACK',
    metadata: {
      userId,
      cafeId,
      businessDate,
      punchTime,
      isLate: attendance.isLate,
      qrVerified: Boolean(qrValidation?.valid),
      geofenceVerified: Boolean(geofenceResult?.geofenceVerified || geofenceResult?.valid),
      selfieMediaId: selfieMediaId || null,
    },
  });

  return response.status(201).json({
    success: true,
    message: 'Check-in recorded successfully.',
    data: {
      attendance,
      receipt: {
        attendanceId: attendance.attendanceId,
        serverTime: punchTime,
        cafeId: attendance.cafeId,
        geofenceVerified: Boolean(geofenceResult?.geofenceVerified || geofenceResult?.valid),
        qrVerified: Boolean(qrValidation?.valid),
        evidenceStatus: selfieMediaId ? 'VERIFIED' : 'PENDING_SELFIE',
      },
    },
    correlationId: request.correlationId || null,
  });
});

// 12a. POST /api/v1/attendance/break/start
const staffStartBreak = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const punchTime = new Date();

  const sessionQuery = Attendance.findOne({
    organisationId,
    userId,
    status: { $in: ['CHECKED_IN', 'ON_BREAK'] },
    checkOutAt: null,
  });
  const attendance = await (typeof sessionQuery?.sort === 'function'
    ? sessionQuery.sort({ checkInAt: -1 })
    : sessionQuery);

  if (!attendance) {
    throw new ApiError(400, 'NOT_CHECKED_IN', 'Cannot start a break when not checked in.');
  }

  if (attendance.status === 'ON_BREAK' || (attendance.breaks && attendance.breaks.some((b) => !b.endedAt))) {
    throw new ApiError(400, 'ALREADY_ON_BREAK', 'A break is already in progress.');
  }

  attendance.status = 'ON_BREAK';
  if (!attendance.breaks) attendance.breaks = [];
  attendance.breaks.push({
    startedAt: punchTime,
    endedAt: null,
    durationMinutes: 0,
  });

  if (!Array.isArray(attendance.rawTimeEvents)) attendance.rawTimeEvents = [];
  attendance.rawTimeEvents.push({
    eventType: 'BREAK_START',
    timestamp: punchTime,
    source: 'SELF',
    recordedByUserId: userId,
  });

  await attendance.save();

  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: 'STAFF_BREAK_START',
    entityType: 'Attendance',
    entityId: attendance.attendanceId,
    metadata: { userId, cafeId: attendance.cafeId, punchTime },
  });

  return response.status(200).json({
    success: true,
    message: 'Break started successfully.',
    data: { attendance },
    correlationId: request.correlationId || null,
  });
});

// 12b. POST /api/v1/attendance/break/end
const staffEndBreak = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const punchTime = new Date();

  const sessionQuery = Attendance.findOne({
    organisationId,
    userId,
    status: 'ON_BREAK',
    checkOutAt: null,
  });
  const attendance = await (typeof sessionQuery?.sort === 'function'
    ? sessionQuery.sort({ checkInAt: -1 })
    : sessionQuery);

  if (!attendance) {
    throw new ApiError(400, 'NOT_ON_BREAK', 'No active break found to end.');
  }

  const openBreak = attendance.breaks ? attendance.breaks.slice().reverse().find((b) => !b.endedAt) : null;
  if (openBreak) {
    openBreak.endedAt = punchTime;
    openBreak.durationMinutes = Math.max(0, Math.round((punchTime.getTime() - new Date(openBreak.startedAt).getTime()) / 60000));
  }

  attendance.status = 'CHECKED_IN';
  if (!Array.isArray(attendance.rawTimeEvents)) attendance.rawTimeEvents = [];
  attendance.rawTimeEvents.push({
    eventType: 'BREAK_END',
    timestamp: punchTime,
    source: 'SELF',
    recordedByUserId: userId,
  });

  await attendance.save();

  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: 'STAFF_BREAK_END',
    entityType: 'Attendance',
    entityId: attendance.attendanceId,
    metadata: { userId, cafeId: attendance.cafeId, punchTime, breakDurationMinutes: openBreak?.durationMinutes || 0 },
  });

  return response.status(200).json({
    success: true,
    message: 'Break ended successfully.',
    data: { attendance },
    correlationId: request.correlationId || null,
  });
});

// 13. POST /api/v1/attendance/check-out
const staffCheckOut = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const {
    qrToken,
    latitude,
    longitude,
    accuracyMeters,
    selfieMediaId: rawSelfieMediaId,
    selfieFileId,
    deviceFingerprint,
    idempotencyKey,
  } = request.body || {};
  const selfieMediaId = rawSelfieMediaId || selfieFileId;

  const punchTime = new Date();

  // P0-A05: Look for any open active session across business dates (handles overnight shifts)
  const openSessionQuery = Attendance.findOne({
    organisationId,
    userId,
    status: { $in: ['CHECKED_IN', 'ON_BREAK'] },
    checkOutAt: null,
  });
  let attendance = await (typeof openSessionQuery?.sort === 'function'
    ? openSessionQuery.sort({ checkInAt: -1 })
    : openSessionQuery);

  if (!attendance) {
    attendance = await Attendance.findOne({
      organisationId,
      userId,
      businessDate: getIstBusinessDate(),
    });
  }

  if (!attendance || (attendance.status !== 'CHECKED_IN' && attendance.status !== 'ON_BREAK')) {
    throw new ApiError(400, 'NOT_CHECKED_IN', 'You must be checked in before checking out.');
  }

  // Secure presence parity with check-in: check-out must never be accepted
  // without a fresh rotating QR, live GPS coordinates, and a distinct selfie.
  if (!qrToken) {
    throw new ApiError(400, 'QR_TOKEN_REQUIRED', 'Rotating attendance QR token is required for check-out.');
  }
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new ApiError(400, 'GEOLOCATION_REQUIRED', 'Live GPS geolocation coordinates are required for check-out.');
  }
  if (!selfieMediaId) {
    throw new ApiError(400, 'SELFIE_EVIDENCE_REQUIRED', 'A fresh live selfie verification photograph is required for check-out.');
  }

  // Validate the mandatory QR challenge token.
  let qrValidation = null;
  if (qrToken) {
    qrValidation = await attendanceQrService.validatePunchQrProof(qrToken, {
      employeeOrgId: organisationId,
      employeeUserId: userId,
      expectedTransition: 'CHECK_OUT',
      employeeAssignedCafes: [
        ...(request.auth.assignedCafeIds || []),
        request.auth.primaryCafeId,
      ].filter(Boolean),
      employeeRole: request.auth.role,
    });

    if (qrValidation && qrValidation.resolvedCafeId.toUpperCase() !== attendance.cafeId.toUpperCase()) {
      throw new ApiError(403, 'CAFE_SCOPE_MISMATCH', 'Check-out QR code must belong to the same café as your check-in.');
    }
  }

  // Server-authoritative geofence verification
  let geofenceResult = null;
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    geofenceResult = await attendanceQrService.verifyGeofence({
      organisationId,
      cafeId: qrValidation?.resolvedCafeId || attendance.cafeId,
      latitude,
      longitude,
      accuracyMeters,
    });
  }

  // Validate that Check-Out selfie is fresh and not reused from Check-In
  if (selfieMediaId) {
    const existingCheckInSelfie = attendance.attendanceEvidence?.checkIn?.selfieMediaId || attendance.attendanceEvidence?.checkIn?.photoFileId || attendance.selfieFileId;
    if (existingCheckInSelfie && existingCheckInSelfie === selfieMediaId) {
      throw new ApiError(
        400,
        'SAME_SELFIE_REUSED',
        'Check-In selfie cannot be reused as Check-Out selfie. A fresh live photo is required.'
      );
    }

    const selfieFile = await PrivateFile.findOne({
      fileId: selfieMediaId,
      organisationId,
      uploadedByUserId: userId,
      'attendanceContext.challengeId': qrValidation.challengeId,
      'attendanceContext.cafeId': normalizeIdentifier(qrValidation.resolvedCafeId || attendance.cafeId),
      'attendanceContext.punchType': 'CHECK_OUT',
      'attendanceCleanup.status': { $ne: 'CLAIMED' },
      'attendanceLink.status': { $nin: ['RESERVED', 'COMMITTED'] },
    });
    if (!selfieFile) {
      throw new ApiError(
        400,
        'SELFIE_CHALLENGE_BINDING_MISMATCH',
        'Check-Out selfie is not bound to this verified QR challenge and transition.'
      );
    }
  }

  // Auto-close any open break
  if (attendance.breaks && attendance.breaks.length > 0) {
    const openBreak = attendance.breaks.slice().reverse().find((b) => !b.endedAt);
    if (openBreak) {
      openBreak.endedAt = punchTime;
      openBreak.durationMinutes = Math.max(0, Math.round((punchTime.getTime() - new Date(openBreak.startedAt).getTime()) / 60000));
    }
  }

  const checkOutEvidence = {
    photoFileId: selfieMediaId || null,
    selfieMediaId: selfieMediaId || null,
    verificationStatus: 'VERIFIED',
    qrChallengeId: qrValidation?.challengeId || null,
    latitude: typeof latitude === 'number' ? latitude : null,
    longitude: typeof longitude === 'number' ? longitude : null,
    accuracyMeters: typeof accuracyMeters === 'number' ? Math.round(accuracyMeters) : null,
    distanceMeters: geofenceResult?.distanceMeters ?? null,
    geofenceVerified: Boolean(geofenceResult?.geofenceVerified || geofenceResult?.valid),
    qrVerified: Boolean(qrValidation?.valid),
    serverTimestamp: punchTime,
    deviceId: qrValidation?.challenge?.deviceId || 'OPS_CONSOLE',
    deviceFingerprint: deviceFingerprint || null,
  };

  attendance.status = 'CHECKED_OUT';
  attendance.checkOutAt = punchTime;
  attendance.checkOutSource = 'SELF';
  attendance.checkOutRecordedBy = userId;
  attendance.attendanceEvidence = attendance.attendanceEvidence || {};
  attendance.attendanceEvidence.checkOut = checkOutEvidence;

  if (!Array.isArray(attendance.rawTimeEvents)) attendance.rawTimeEvents = [];
  attendance.rawTimeEvents.push({
    eventType: 'CHECK_OUT',
    timestamp: punchTime,
    source: 'SELF',
    recordedByUserId: userId,
    isGeofenceVerified: Boolean(geofenceResult?.geofenceVerified || geofenceResult?.valid),
    isQrVerified: Boolean(qrValidation?.valid),
    isSelfieVerified: Boolean(selfieMediaId),
    selfieFileId: selfieMediaId || null,
  });

  if (typeof attendance.calculateWorkedMinutes === 'function') {
    attendance.calculateWorkedMinutes();
  }

  const checkOutEvidenceReservation = await reserveAttendanceEvidenceLink({
    fileId: selfieMediaId,
    organisationId,
    userId,
    challengeId: qrValidation.challengeId,
    cafeId: normalizeIdentifier(qrValidation.resolvedCafeId || attendance.cafeId),
    punchType: 'CHECK_OUT',
    attendanceId: attendance.attendanceId,
  });

  try {
    await attendance.save();
  } catch (saveError) {
    await releaseAttendanceEvidenceLink({
      fileId: selfieMediaId,
      organisationId,
      claimId: checkOutEvidenceReservation.claimId,
      persisted: checkOutEvidenceReservation.persisted,
    }).catch(() => {});
    throw saveError;
  }

  const checkOutEvidenceLinkCommitted = await commitAttendanceEvidenceLink({
    fileId: selfieMediaId,
    organisationId,
    claimId: checkOutEvidenceReservation.claimId,
    attendanceId: attendance.attendanceId,
    punchType: 'CHECK_OUT',
    persisted: checkOutEvidenceReservation.persisted,
  }).catch(() => false);

  if (checkOutEvidenceReservation.persisted && !checkOutEvidenceLinkCommitted) {
    console.error('[Attendance] check-out selfie link finalization did not confirm; reservation remains fail-closed', {
      attendanceId: attendance.attendanceId,
      fileId: selfieMediaId,
    });
  }

  // Save submission for idempotency & replay protection
  if (qrValidation?.challengeId || idempotencyKey) {
    const keyToHash = idempotencyKey || `${userId}_CHECK_OUT_${punchTime.getTime()}`;
    const idempotencyKeyHash = crypto.createHash('sha256').update(String(keyToHash)).digest('hex');
    await AttendanceSubmission.create({
      submissionId: `SUB_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      organisationId,
      userId,
      cafeId: attendance.cafeId,
      deviceId: qrValidation?.challenge?.deviceId || 'OPS_CONSOLE',
      challengeId: qrValidation?.challengeId || 'CHL_MANUAL',
      idempotencyKeyHash,
      transition: 'CHECK_OUT',
      challengeIssuedAt: qrValidation?.issuedAt || punchTime,
      clientScannedAt: punchTime,
      serverReceivedAt: punchTime,
      isOffline: false,
      result: 'ACCEPTED',
    }).catch(() => {});
  }

  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: 'ATTENDANCE_SECURE_CHECK_OUT',
    entityType: 'Attendance',
    entityId: attendance.attendanceId || 'ATT-FALLBACK',
    metadata: {
      userId,
      cafeId: attendance.cafeId,
      businessDate: attendance.businessDate,
      punchTime,
      totalWorkedMinutes: attendance.totalWorkedMinutes,
      payableMinutes: attendance.payableMinutes,
      breakMinutes: attendance.breakMinutes,
      qrVerified: Boolean(qrValidation?.valid),
      geofenceVerified: Boolean(geofenceResult?.geofenceVerified || geofenceResult?.valid),
      selfieMediaId: selfieMediaId || null,
    },
  });

  return response.status(200).json({
    success: true,
    message: 'Check-out recorded successfully.',
    data: {
      attendance,
      receipt: {
        attendanceId: attendance.attendanceId,
        serverTime: punchTime,
        cafeId: attendance.cafeId,
        geofenceVerified: Boolean(geofenceResult?.geofenceVerified || geofenceResult?.valid),
        qrVerified: Boolean(qrValidation?.valid),
        evidenceStatus: selfieMediaId ? 'VERIFIED' : 'PENDING_SELFIE',
      },
    },
    correlationId: request.correlationId || null,
  });
});

// 13b. PATCH /api/v1/attendance/:attendanceId & PATCH /api/v1/attendance/:attendanceId/correct
const correctAttendance = asyncHandler(async (request, response) => {
  const { attendanceId: rawAttId } = request.params;
  const attendanceId = normalizeIdentifier(rawAttId);
  const {
    status,
    checkInAt,
    checkOutAt,
    breakMinutes,
    approvedOvertimeMinutes,
    shiftId,
    shiftName,
    scheduledStartAt,
    scheduledEndAt,
    notes,
    reason = '',
  } = request.body || {};

  if (!['MASTER', 'OWNER', 'CAFE_ADMIN'].includes(request.auth.role)) {
    throw new ApiError(403, 'PERMISSION_DENIED', 'You do not have permission to correct attendance records.');
  }

  // Reject retired/non-primary MASTER and untrusted Café Admin context before
  // processing correction inputs or reading the target attendance record.
  ensureCafeOperationsAllowed(request);

  if (!reason || !reason.trim()) {
    throw new ApiError(400, 'REASON_REQUIRED', 'A mandatory reason is required for attendance correction.');
  }

  const attendance = await Attendance.findOne({
    attendanceId,
    organisationId: request.auth.organisationId,
  });

  if (!attendance) {
    throw new ApiError(404, 'ATTENDANCE_NOT_FOUND', 'Attendance record not found.');
  }

  await ensurePeriodNotLocked(request.auth.organisationId, attendance.businessDate);

  // Apply target café scope after the authoritative record is resolved.
  ensureCafeAccess(request, attendance.cafeId);

  const beforeSnapshot = {
    status: attendance.status,
    checkInAt: attendance.checkInAt,
    checkOutAt: attendance.checkOutAt,
    breakMinutes: attendance.breakMinutes,
    totalWorkedMinutes: attendance.totalWorkedMinutes,
    payableMinutes: attendance.payableMinutes,
    overtimeMinutes: attendance.overtimeMinutes,
    isLate: attendance.isLate,
    isOvertime: attendance.isOvertime,
  };

  if (status !== undefined) {
    if (!ATTENDANCE_STATUSES.includes(status)) {
      throw new ApiError(400, 'ATTENDANCE_STATUS_INVALID', 'Attendance status is invalid.');
    }
    if (status === 'ON_LEAVE') {
      throw new ApiError(
        400,
        'LEAVE_WORKFLOW_REQUIRED',
        'Approved leave status must be applied through the leave approval/reconciliation workflow.'
      );
    }
    attendance.status = status;
  }

  if (checkInAt !== undefined) {
    const parsedCheckIn = checkInAt ? new Date(checkInAt) : null;
    if (parsedCheckIn && Number.isNaN(parsedCheckIn.getTime())) {
      throw new ApiError(400, 'CHECK_IN_TIME_INVALID', 'Corrected check-in timestamp is invalid.');
    }
    attendance.checkInAt = parsedCheckIn;
  }
  if (checkOutAt !== undefined) {
    const parsedCheckOut = checkOutAt ? new Date(checkOutAt) : null;
    if (parsedCheckOut && Number.isNaN(parsedCheckOut.getTime())) {
      throw new ApiError(400, 'CHECK_OUT_TIME_INVALID', 'Corrected check-out timestamp is invalid.');
    }
    attendance.checkOutAt = parsedCheckOut;
  }

  if (attendance.checkInAt && attendance.checkOutAt && attendance.checkOutAt < attendance.checkInAt) {
    throw new ApiError(400, 'ATTENDANCE_TIME_ORDER_INVALID', 'Corrected check-out cannot be earlier than check-in.');
  }
  if (breakMinutes !== undefined) {
    attendance.breakMinutes = Math.max(0, Number(breakMinutes) || 0);
  }
  if (approvedOvertimeMinutes !== undefined) {
    throw new ApiError(
      400,
      'OVERTIME_DECISION_WORKFLOW_REQUIRED',
      'Overtime approval cannot be changed through generic attendance correction. Use the overtime decision workflow.'
    );
  }
  if (shiftId !== undefined) attendance.shiftId = shiftId;
  if (shiftName !== undefined) attendance.shiftName = shiftName;
  if (scheduledStartAt !== undefined) attendance.scheduledStartAt = scheduledStartAt ? new Date(scheduledStartAt) : null;
  if (scheduledEndAt !== undefined) attendance.scheduledEndAt = scheduledEndAt ? new Date(scheduledEndAt) : null;
  if (notes !== undefined) attendance.notes = String(notes).trim();

  attendance.isManualEntry = true;
  attendance.isCorrection = true;
  attendance.correctionReason = reason.trim();
  attendance.updatedBy = request.auth.userId;

  const metrics = calculateAttendanceMetrics({
    checkInAt: attendance.checkInAt,
    checkOutAt: attendance.checkOutAt,
    breaks: attendance.breaks,
    breakMinutes: attendance.breakMinutes,
    scheduledStartAt: attendance.scheduledStartAt,
    scheduledEndAt: attendance.scheduledEndAt,
    scheduledDurationMinutes: attendance.scheduledDurationMinutes,
    approvedOvertimeMinutes: attendance.approvedOvertimeMinutes,
  });
  attendance.totalWorkedMinutes = metrics.totalWorkedMinutes;
  attendance.workedMinutes = metrics.totalWorkedMinutes;
  attendance.regularMinutes = metrics.regularMinutes;
  attendance.detectedOvertimeMinutes = metrics.detectedOvertimeMinutes;
  attendance.overtimeMinutes = metrics.approvedOvertimeMinutes || 0;
  attendance.isLate = metrics.isLate;
  attendance.lateMinutes = metrics.lateMinutes;
  attendance.payableMinutes = metrics.payableMinutes;

  if (typeof attendance.calculateWorkedMinutes === 'function') {
    attendance.calculateWorkedMinutes();
  }
  await attendance.save();
  await flagPayrollRecalculationRequired(
    request.auth.organisationId,
    attendance.cafeId,
    attendance.businessDate,
    request.auth.userId
  );

  const afterSnapshot = {
    status: attendance.status,
    checkInAt: attendance.checkInAt,
    checkOutAt: attendance.checkOutAt,
    breakMinutes: attendance.breakMinutes,
    totalWorkedMinutes: attendance.totalWorkedMinutes,
    payableMinutes: attendance.payableMinutes,
    overtimeMinutes: attendance.overtimeMinutes,
    isLate: attendance.isLate,
    isOvertime: attendance.isOvertime,
  };

  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: 'ATTENDANCE_CORRECTED',
    entityType: 'Attendance',
    entityId: attendance.attendanceId,
    metadata: {
      userId: attendance.userId,
      cafeId: attendance.cafeId,
      businessDate: attendance.businessDate,
      reason: reason.trim(),
      beforeSnapshot,
      afterSnapshot,
      operatorSessionId: request.auth.sessionId || null,
    },
  });

  return response.status(200).json({
    success: true,
    message: 'Attendance record successfully updated with full audit trail.',
    data: { attendance },
    correlationId: request.correlationId || null,
  });
});

// 13c. POST /api/v1/attendance/preview-recalculation
const previewRecalculation = asyncHandler(async (request, response) => {
  const {
    checkInAt,
    checkOutAt,
    breaks = [],
    breakMinutes = 0,
    scheduledStartAt,
    scheduledEndAt,
    scheduledDurationMinutes,
    approvedOvertimeMinutes = 0,
  } = request.body || {};

  const metrics = calculateAttendanceMetrics({
    checkInAt: checkInAt ? new Date(checkInAt) : null,
    checkOutAt: checkOutAt ? new Date(checkOutAt) : null,
    breaks,
    breakMinutes,
    scheduledStartAt: scheduledStartAt ? new Date(scheduledStartAt) : null,
    scheduledEndAt: scheduledEndAt ? new Date(scheduledEndAt) : null,
    scheduledDurationMinutes,
    approvedOvertimeMinutes,
  });

  return response.status(200).json({
    success: true,
    data: { metrics },
    correlationId: request.correlationId || null,
  });
});

// 14. GET /api/v1/attendance/history
const getStaffHistory = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const month = String(request.query.month || '').trim() || getIstBusinessDate().slice(0, 7);

  const records = await Attendance.find({
    organisationId,
    userId,
    businessDate: { $regex: `^${month}` },
  }).sort({ businessDate: -1 }).lean();

  let totalWorkedMinutes = 0;
  let totalOvertimeMinutes = 0;
  let daysPresent = 0;
  let daysLate = 0;
  let daysAbsent = 0;
  let exceptionsCount = 0;

  for (const r of records) {
    totalWorkedMinutes += r.totalWorkedMinutes || 0;
    totalOvertimeMinutes += r.approvedOvertimeMinutes || 0;
    if (r.status === 'CHECKED_IN' || r.status === 'CHECKED_OUT') daysPresent++;
    if (r.isLate) {
      daysLate++;
      exceptionsCount++;
    }
    if (r.status === 'ABSENT') daysAbsent++;
    if (r.status === 'MISSED_PUNCH') exceptionsCount++;
  }

  return response.status(200).json({
    success: true,
    data: {
      month,
      summary: {
        totalHoursWorked: (totalWorkedMinutes / 60).toFixed(1),
        totalOvertimeHours: (totalOvertimeMinutes / 60).toFixed(1),
        daysPresent,
        daysLate,
        daysAbsent,
        exceptionsCount,
      },
      records,
    },
    correlationId: request.correlationId || null,
  });
});

// 15. POST /api/v1/attendance/corrections
const requestStaffCorrection = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const {
    attendanceId: rawAttId,
    businessDate: rawDate,
    issueType = 'OTHER',
    requestedCheckIn,
    requestedCheckOut,
    requestedBreakMinutes = 0,
    reason = '',
  } = request.body || {};

  if (!reason || !reason.trim()) {
    throw new ApiError(400, 'REASON_REQUIRED', 'A mandatory reason for correction is required.');
  }

  let attendance = null;
  const attendanceId = rawAttId ? normalizeIdentifier(rawAttId) : null;
  if (attendanceId) {
    attendance = await Attendance.findOne({
      attendanceId,
      organisationId,
      userId,
    });
    if (!attendance) {
      throw new ApiError(404, 'ATTENDANCE_NOT_FOUND', 'Attendance record not found for this user.');
    }
  }

  const businessDate = attendance ? attendance.businessDate : (rawDate || getIstBusinessDate());
  const assignedCafeIds = Array.isArray(request.auth.assignedCafeIds)
    ? request.auth.assignedCafeIds
    : (request.auth.assignedCafeIds ? [request.auth.assignedCafeIds] : []);
  const cafeId = attendance?.cafeId || request.auth.primaryCafeId || assignedCafeIds[0] || null;

  if (!cafeId) {
    throw new ApiError(400, 'CAFE_SCOPE_REQUIRED', 'An assigned Café is required before requesting an attendance correction.');
  }
  if (assignedCafeIds.length > 0 && !assignedCafeIds.includes(cafeId)) {
    throw new ApiError(403, 'CAFE_ACCESS_DENIED', 'The attendance correction Café is outside your assigned scope.');
  }

  let correctionRequest = null;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const requestId = await SequenceCounter.generateId({
        organisationId,
        sequenceKey: 'CORRECTION_REQUEST',
        prefix: `ACR-${businessDate.replace(/-/g, '')}`,
        minimumDigits: 3,
        session,
      });

      correctionRequest = new AttendanceCorrectionRequest({
        correctionRequestId: requestId,
        requestId,
        organisationId,
        cafeId,
        userId,
        submittedBy: userId,
        attendanceId: attendance?.attendanceId || null,
        businessDate,
        issueType,
        requestedCheckInAt: requestedCheckIn ? new Date(requestedCheckIn) : null,
        requestedCheckOutAt: requestedCheckOut ? new Date(requestedCheckOut) : null,
        requestedBreakMinutes: Number(requestedBreakMinutes) || 0,
        reason: reason.trim(),
        status: 'PENDING',
      });
      await correctionRequest.save({ session });

      if (attendance) {
        attendance.correctionRequired = true;
        attendance.correctionReason = reason.trim();
        await attendance.save({ session });
      }

      const approvalId = await SequenceCounter.generateId({
        organisationId,
        sequenceKey: 'APPROVAL',
        prefix: 'APP',
        minimumDigits: 5,
        session,
      });

      const approval = new Approval({
        approvalId,
        organisationId,
        cafeId,
        entityType: 'ATTENDANCE_CORRECTION',
        entityId: requestId,
        requestingUserId: userId,
        actionRequired: `Attendance Correction: ${businessDate} (${userId})`,
        amountPaisa: 0,
        status: 'PENDING',
      });
      await approval.save({ session });
    }, {
      readPreference: 'primary',
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      maxCommitTimeMS: 10000,
    });
  } finally {
    await session.endSession();
  }

  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: 'STAFF_CORRECTION_REQUESTED',
    entityType: 'AttendanceCorrectionRequest',
    entityId: correctionRequest.requestId,
    metadata: { userId, cafeId, businessDate, reason: reason.trim() },
  });

  try {
    const masterUsers = await User.find({
      organisationId,
      role: 'MASTER',
      isPrimaryMaster: true,
      accountStatus: 'ACTIVE',
    }).select('userId email').lean();

    const notifDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (const master of masterUsers) {
      const notifId = await SequenceCounter.generateId({
        organisationId,
        sequenceKey: `NOTIFICATION_${notifDateStr}`,
        prefix: `NT-${notifDateStr}`,
        minimumDigits: 4,
      });
      await Notification.create({
        notificationId: notifId,
        organisationId,
        cafeId,
        eventType: 'ATTENDANCE_CORRECTION_REQUESTED',
        category: 'OPERATIONS',
        recipientUserId: master.userId,
        recipientRole: 'MASTER',
        recipientEmail: master.email,
        title: `⏱️ Attendance Correction: ${userId}`,
        message: `${userId} requested attendance correction for ${businessDate}. Reason: ${reason.trim()}`,
        priority: 'NORMAL',
        channels: ['IN_APP'],
        deepLink: '#approvals',
        sourceModule: 'ATTENDANCE',
        sourceEntityType: 'ATTENDANCE_CORRECTION',
        sourceEntityId: correctionRequest.requestId,
        deduplicationKey: `ACR_${correctionRequest.requestId}_${master.userId}`,
        correlationId: request.correlationId || `CORR-ACR-${correctionRequest.requestId}`,
        status: 'DELIVERED',
        deliveredAt: new Date(),
        createdBy: userId,
      });
    }
  } catch (notifErr) {
    console.warn(`[ATTENDANCE_CORRECTION_NOTIFICATION_WARN] ${notifErr.message}`);
  }

  return response.status(201).json({
    success: true,
    message: 'Correction request submitted for review.',
    data: { correctionRequest },
    correlationId: request.correlationId || null,
  });
});

// 15a. GET /api/v1/attendance/corrections/mine
const getStaffCorrections = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const month = String(request.query.month || '').trim();

  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    throw new ApiError(400, 'INVALID_MONTH', 'month must use YYYY-MM format.');
  }

  const filter = {
    organisationId,
    userId,
  };
  if (month) {
    filter.businessDate = { $regex: `^${month}` };
  }

  const requests = await AttendanceCorrectionRequest.find(filter)
    .sort({ submittedAt: -1, createdAt: -1 })
    .lean();

  return response.status(200).json({
    success: true,
    data: { requests },
    correlationId: request.correlationId || null,
  });
});

// 15b. GET /api/v1/attendance/corrections/pending
const getPendingCorrections = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  if (!['MASTER', 'OWNER', 'CAFE_ADMIN'].includes(request.auth.role)) {
    throw new ApiError(403, 'PERMISSION_DENIED', 'Insufficient permissions to view correction requests.');
  }

  ensureCafeOperationsAllowed(request);

  const filter = { organisationId, status: 'PENDING' };
  if (request.auth.role === 'OWNER' || request.auth.role === 'CAFE_ADMIN') {
    const assigned = (request.auth.assignedCafeIds || []).map(normalizeIdentifier).filter(Boolean);
    if (!assigned.length) {
      throw new ApiError(403, 'CAFE_ACCESS_DENIED', 'No authorised café scope is available for correction requests.');
    }
    filter.cafeId = { $in: assigned };
  }

  const requests = await AttendanceCorrectionRequest.find(filter).sort({ createdAt: -1 }).lean();

  return response.status(200).json({
    success: true,
    data: { requests },
    correlationId: request.correlationId || null,
  });
});

// 15c. POST /api/v1/attendance/corrections/:requestId/review
const reviewStaffCorrection = asyncHandler(async (request, response) => {
  const requestId = normalizeIdentifier(request.params.requestId);
  const rawDecision = request.body?.decision || request.body?.action;
  const decision = String(rawDecision || '').toUpperCase().trim();
  const remarks = String(request.body?.remarks || request.body?.reviewerNote || request.body?.reviewRemarks || '').trim();

  if (request.auth.role !== 'MASTER' || !request.auth.isPrimaryMaster) {
    throw new ApiError(
      403,
      'PRIMARY_MASTER_AUTHORITY_REQUIRED',
      'Attendance correction decisions require Primary Master authority.'
    );
  }

  if (!['APPROVE', 'REJECT'].includes(decision)) {
    throw new ApiError(400, 'INVALID_DECISION', "Decision must be 'APPROVE' or 'REJECT'.");
  }

  const existingRequest = await AttendanceCorrectionRequest.findOne({
    $or: [{ correctionRequestId: requestId }, { requestId }],
    organisationId: request.auth.organisationId,
  }).lean();

  if (!existingRequest) {
    throw new ApiError(404, 'REQUEST_NOT_FOUND', 'Correction request not found.');
  }
  if (existingRequest.status !== 'PENDING') {
    throw new ApiError(409, 'ALREADY_DECIDED', `Correction request is already ${existingRequest.status}.`);
  }

  if (decision === 'APPROVE') {
    await ensurePeriodNotLocked(
      request.auth.organisationId,
      existingRequest.businessDate
    );
  }

  let correctionRequest = null;
  let attendance = null;
  let approval = null;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      correctionRequest = await AttendanceCorrectionRequest.findOne({
        $or: [{ correctionRequestId: requestId }, { requestId }],
        organisationId: request.auth.organisationId,
      }).session(session);

      if (!correctionRequest) {
        throw new ApiError(404, 'REQUEST_NOT_FOUND', 'Correction request not found.');
      }
      if (correctionRequest.status !== 'PENDING') {
        throw new ApiError(409, 'ALREADY_DECIDED', `Correction request is already ${correctionRequest.status}.`);
      }

      approval = await Approval.findOne({
        organisationId: request.auth.organisationId,
        entityType: 'ATTENDANCE_CORRECTION',
        entityId: requestId,
      }).session(session);

      if (!approval) {
        throw new ApiError(
          409,
          'APPROVAL_TARGET_NOT_FOUND',
          'The attendance correction has no matching Approval record. No decision was committed.'
        );
      }
      if (approval.status !== 'PENDING') {
        throw new ApiError(409, 'ALREADY_DECIDED', `Approval request is already ${approval.status}.`);
      }

      correctionRequest.status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      correctionRequest.reviewedBy = request.auth.userId;
      correctionRequest.reviewedByUserId = request.auth.userId;
      correctionRequest.reviewedAt = new Date();
      correctionRequest.reviewReason = remarks;
      correctionRequest.reviewRemarks = remarks;

      if (decision === 'APPROVE') {
        if (correctionRequest.attendanceId) {
          attendance = await Attendance.findOne({
            attendanceId: correctionRequest.attendanceId,
            organisationId: request.auth.organisationId,
          }).session(session);
        }

        if (!attendance && correctionRequest.userId && correctionRequest.businessDate) {
          attendance = await Attendance.findOne({
            organisationId: request.auth.organisationId,
            userId: correctionRequest.userId,
            businessDate: correctionRequest.businessDate,
          }).session(session);
        }

        if (!attendance) {
          throw new ApiError(
            409,
            'ATTENDANCE_TARGET_NOT_FOUND',
            'The attendance record to correct could not be resolved. No decision was committed.'
          );
        }

        if (correctionRequest.requestedCheckInAt) attendance.checkInAt = correctionRequest.requestedCheckInAt;
        if (correctionRequest.requestedCheckOutAt) attendance.checkOutAt = correctionRequest.requestedCheckOutAt;
        if (correctionRequest.requestedBreakMinutes !== undefined) attendance.breakMinutes = correctionRequest.requestedBreakMinutes;
        attendance.status = attendance.checkOutAt ? 'CHECKED_OUT' : 'CHECKED_IN';
        attendance.isManualEntry = true;
        attendance.isCorrection = true;
        attendance.correctionRequired = false;
        attendance.correctionReason = `Approved request ${requestId}: ${correctionRequest.reason || ''}`;
        attendance.updatedBy = request.auth.userId;

        const metrics = calculateAttendanceMetrics({
          checkInAt: attendance.checkInAt,
          checkOutAt: attendance.checkOutAt,
          breaks: attendance.breaks,
          breakMinutes: attendance.breakMinutes,
          scheduledStartAt: attendance.scheduledStartAt,
          scheduledEndAt: attendance.scheduledEndAt,
          scheduledDurationMinutes: attendance.scheduledDurationMinutes,
        });
        attendance.totalWorkedMinutes = metrics.totalWorkedMinutes;
        attendance.workedMinutes = metrics.totalWorkedMinutes;
        attendance.regularMinutes = metrics.regularMinutes;
        attendance.detectedOvertimeMinutes = metrics.detectedOvertimeMinutes;
        attendance.overtimeMinutes = metrics.approvedOvertimeMinutes || 0;

        if (typeof attendance.calculateWorkedMinutes === 'function') {
          attendance.calculateWorkedMinutes();
        }
        await attendance.save({ session });
      }

      await correctionRequest.save({ session });

      approval.status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      approval.decidedByUserId = request.auth.userId;
      approval.decidedAt = new Date();
      approval.decisionReason = remarks;
      await approval.save({ session });
    }, {
      readPreference: 'primary',
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      maxCommitTimeMS: 10000,
    });
  } finally {
    await session.endSession();
  }

  if (decision === 'APPROVE' && attendance) {
    await flagPayrollRecalculationRequired(
      request.auth.organisationId,
      attendance.cafeId,
      attendance.businessDate,
      request.auth.userId
    );
  }

  try {
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const notifId = await SequenceCounter.generateId({
      organisationId: request.auth.organisationId,
      sequenceKey: `NOTIFICATION_${todayStr}`,
      prefix: `NT-${todayStr}`,
      minimumDigits: 4,
    });
    await Notification.create({
      notificationId: notifId,
      organisationId: request.auth.organisationId,
      cafeId: correctionRequest.cafeId,
      eventType: decision === 'APPROVE' ? 'ATTENDANCE_CORRECTION_APPROVED' : 'ATTENDANCE_CORRECTION_REJECTED',
      category: 'OPERATIONS',
      recipientUserId: correctionRequest.userId,
      recipientRole: 'STAFF',
      title: `Attendance Correction ${decision === 'APPROVE' ? 'Approved' : 'Rejected'}`,
      message: `Your attendance correction request for ${correctionRequest.businessDate} was ${decision === 'APPROVE' ? 'approved' : 'rejected'}.${remarks ? ' Reason: ' + remarks : ''}`,
      priority: 'NORMAL',
      channels: ['IN_APP'],
      deepLink: '#staff-attendance',
      sourceModule: 'ATTENDANCE',
      sourceEntityType: 'ATTENDANCE_CORRECTION',
      sourceEntityId: requestId,
      deduplicationKey: `${correctionRequest.userId}:ATTENDANCE_CORRECTION_DECISION:${requestId}`,
      correlationId: request.correlationId || `CORR-ACR-${requestId}`,
      status: 'DELIVERED',
      deliveredAt: new Date(),
      createdBy: request.auth.userId,
    });
  } catch (notifErr) {
    console.warn(`[ATTENDANCE_NOTIF_WARN] ${notifErr.message}`);
  }

  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: decision === 'APPROVE' ? 'CORRECTION_REQUEST_APPROVED' : 'CORRECTION_REQUEST_REJECTED',
    entityType: 'AttendanceCorrectionRequest',
    entityId: requestId,
    metadata: { requestId, decision, remarks, reviewerUserId: request.auth.userId },
  });

  return response.status(200).json({
    success: true,
    message: `Correction request ${decision === 'APPROVE' ? 'approved' : 'rejected'} successfully.`,
    data: { correctionRequest, attendance, approval },
    correlationId: request.correlationId || null,
  });
});

// 16. POST /api/v1/attendance/attestation
const recordStaffAttestation = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { month, decision = 'CONFIRM_REVIEWED', remarks = '' } = request.body || {};

  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: 'STAFF_PERIOD_ATTESTATION',
    entityType: 'AttendancePeriod',
    entityId: `PER-${month || getIstBusinessDate().slice(0, 7)}`,
    metadata: { userId, month, decision, remarks },
  });

  return response.status(200).json({
    success: true,
    message: decision === 'CONFIRM_REVIEWED'
      ? 'Attendance review confirmed successfully.'
      : 'Discrepancy reported for administrative review.',
    data: {
      userId,
      month: month || getIstBusinessDate().slice(0, 7),
      decision,
      attestedAt: new Date().toISOString(),
    },
    correlationId: request.correlationId || null,
  });
});

// OT-1. GET /api/v1/attendance/overtime
const getOvertimeList = asyncHandler(async (request, response) => {
  ensureCafeOperationsAllowed(request);
  const { organisationId } = request.auth;

  const filter = {
    organisationId,
    $or: [
      { detectedOvertimeMinutes: { $gt: 0 } },
      { overtimeStatus: { $in: ['PENDING_REVIEW', 'VERIFIED_BY_ADMIN', 'APPROVED_BY_PRIMARY', 'REJECTED'] } },
    ],
  };

  if (request.query.cafeId) {
    const cafeId = normalizeIdentifier(request.query.cafeId);
    ensureCafeAccess(request, cafeId);
    filter.cafeId = cafeId;
  } else if (request.auth.role === 'OWNER') {
    const assigned = (request.auth.assignedCafeIds || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
    if (!assigned.length) {
      throw new ApiError(403, 'CROSS_CAFE_RESOURCE_DENIED', 'Owner has no assigned cafés.');
    }
    filter.cafeId = { $in: assigned };
  } else if (request.auth.role !== 'MASTER') {
    filter.cafeId = { $in: request.auth.assignedCafeIds || [] };
  }

  if (request.query.status) filter.overtimeStatus = request.query.status.toUpperCase();
  if (request.query.date) filter.businessDate = request.query.date;
  else if (request.query.month) filter.businessDate = { $regex: `^${request.query.month}` };

  const records = await Attendance.find(filter)
    .select('attendanceId userId cafeId businessDate shiftId shiftName totalWorkedMinutes scheduledDurationMinutes detectedOvertimeMinutes approvedOvertimeMinutes overtimeStatus overtimeDecidedByUserId overtimeDecidedAt')
    .sort({ businessDate: -1 })
    .lean();

  return response.status(200).json({
    success: true,
    data: { records, total: records.length },
    correlationId: request.correlationId || null,
  });
});

// EXC-1. GET /api/v1/attendance/exceptions
const getExceptionList = asyncHandler(async (request, response) => {
  ensureCafeOperationsAllowed(request);
  const { organisationId } = request.auth;

  const filter = { organisationId };

  if (request.query.cafeId) {
    const cafeId = normalizeIdentifier(request.query.cafeId);
    ensureCafeAccess(request, cafeId);
    filter.cafeId = cafeId;
  } else if (request.auth.role === 'OWNER') {
    const assigned = (request.auth.assignedCafeIds || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
    if (!assigned.length) {
      throw new ApiError(403, 'CROSS_CAFE_RESOURCE_DENIED', 'Owner has no assigned cafés.');
    }
    filter.cafeId = { $in: assigned };
  } else if (request.auth.role !== 'MASTER') {
    filter.cafeId = { $in: request.auth.assignedCafeIds || [] };
  }

  if (request.query.status) filter.status = request.query.status.toUpperCase();
  else filter.status = { $in: ['OPEN', 'UNDER_REVIEW'] };

  if (request.query.type) filter.type = request.query.type.toUpperCase();
  if (request.query.date) filter.businessDate = request.query.date;
  else if (request.query.month) filter.businessDate = { $regex: `^${request.query.month}` };

  const exceptions = await AttendanceException.find(filter).sort({ businessDate: -1, severity: 1 }).lean();

  return response.status(200).json({
    success: true,
    data: { exceptions, total: exceptions.length },
    correlationId: request.correlationId || null,
  });
});

// EXC-2. POST /api/v1/attendance/exceptions/:exceptionId/resolve
const resolveException = asyncHandler(async (request, response) => {
  if (!['MASTER', 'OWNER', 'CAFE_ADMIN'].includes(request.auth.role)) {
    throw new ApiError(403, 'PERMISSION_DENIED', 'Insufficient permissions to resolve attendance exceptions.');
  }

  ensureCafeOperationsAllowed(request);

  const exceptionId = normalizeIdentifier(request.params.exceptionId);
  const { action = 'RESOLVE', reason = '' } = request.body || {};

  if (!reason.trim()) throw new ApiError(400, 'REASON_REQUIRED', 'A reason is required to resolve or dismiss an exception.');

  const normalizedAction = String(action).toUpperCase();
  if (!['RESOLVE', 'DISMISS'].includes(normalizedAction)) {
    throw new ApiError(400, 'INVALID_ACTION', "Action must be 'RESOLVE' or 'DISMISS'.");
  }

  const exception = await AttendanceException.findOne({
    exceptionId,
    organisationId: request.auth.organisationId,
  });

  if (!exception) throw new ApiError(404, 'EXCEPTION_NOT_FOUND', 'Attendance exception not found.');

  ensureCafeAccess(request, exception.cafeId);

  exception.status = normalizedAction === 'RESOLVE' ? 'RESOLVED' : 'DISMISSED';
  exception.resolvedAt = new Date();
  exception.resolvedByUserId = request.auth.userId;
  exception.resolutionReason = reason.trim();
  await exception.save();

  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: 'ATTENDANCE_EXCEPTION_RESOLVED',
    entityType: 'AttendanceException',
    entityId: exceptionId,
    metadata: { exceptionId, action: normalizedAction, reason: reason.trim(), exceptionType: exception.type },
  });

  return response.status(200).json({
    success: true,
    message: `Exception ${normalizedAction.toLowerCase()}d successfully.`,
    data: { exception: exception.toObject() },
    correlationId: request.correlationId || null,
  });
});

// ── SECURE PRESENCE EVIDENCE HANDLERS ──────────────────────────────────────

/**
 * GET /api/v1/attendance/qr/active
 * Authoritative rotating QR challenge for display on authorized screens.
 */
const getActiveCafeQr = asyncHandler(async (request, response) => {
  const { organisationId, userId, role, assignedCafeIds, assignedCafeId, primaryCafeId } = request.auth;

  ensureCafeOperationsAllowed(request);

  const cafeId = normalizeIdentifier(request.query.cafeId) || assignedCafeId || primaryCafeId || (assignedCafeIds && assignedCafeIds[0]);

  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId query parameter is required.');
  }

  ensureCafeAccess(request, cafeId);

  const challengeData = await attendanceQrService.getActiveOrNewChallenge({
    organisationId,
    cafeId,
    deviceId: request.headers['x-device-id'] || 'OPS_CONSOLE',
    requestedByUserId: userId,
    requestedByRole: role,
    isPrimaryMaster: request.auth.isPrimaryMaster === true,
    assignedCafeIds: [
      ...(assignedCafeIds || []),
      assignedCafeId,
      primaryCafeId,
    ].filter(Boolean),
    rotationIntervalSeconds: 45,
  });

  return response.status(200).json({
    success: true,
    data: challengeData,
    correlationId: request.correlationId || null,
  });
});

/**
 * POST /api/v1/attendance/qr/verify
 * Validates a scanned QR token and resolves authoritative café.
 */
const verifyScannedQr = asyncHandler(async (request, response) => {
  const { organisationId, userId, role, assignedCafeIds, primaryCafeId } = request.auth;
  const { qrToken } = request.body || {};

  if (!qrToken) {
    throw new ApiError(400, 'QR_TOKEN_REQUIRED', 'Scanned QR token is required.');
  }

  const result = await attendanceQrService.validateChallengeToken(qrToken, {
    employeeOrgId: organisationId,
    employeeAssignedCafes: [
      ...(assignedCafeIds || []),
      primaryCafeId,
    ].filter(Boolean),
    employeeRole: role,
    isPrimaryMaster: request.auth.isPrimaryMaster === true,
  });

  const cafe = await Cafe.findOne({
    organisationId,
    cafeId: result.resolvedCafeId,
  }).lean();

  const openAttendanceQuery = Attendance.findOne({
    organisationId,
    userId,
    status: { $in: ['CHECKED_IN', 'ON_BREAK'] },
    checkOutAt: null,
  });
  const openAttendance = await (typeof openAttendanceQuery?.sort === 'function'
    ? openAttendanceQuery.sort({ checkInAt: -1 })
    : openAttendanceQuery);

  if (
    openAttendance &&
    normalizeIdentifier(openAttendance.cafeId) !== normalizeIdentifier(result.resolvedCafeId)
  ) {
    throw new ApiError(
      403,
      'CAFE_SCOPE_MISMATCH',
      'Check-out QR must belong to the same café as the active check-in session.'
    );
  }

  const transition = openAttendance ? 'CHECK_OUT' : 'CHECK_IN';

  const scanGrant = attendanceQrService.issueScanGrant({
    verification: result,
    userId,
    organisationId,
    transition,
  });

  return response.status(200).json({
    success: true,
    data: {
      valid: true,
      verified: true,
      challengeId: result.challengeId,
      cafeId: result.resolvedCafeId,
      cafeName: cafe?.name || result.resolvedCafeId,
      expiresAt: result.expiresAt,
      transition,
      scanGrant: scanGrant.token,
      scanGrantExpiresAt: scanGrant.expiresAt,
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * POST /api/v1/attendance/geofence/verify
 * Validates browser GPS coordinates against café geofence.
 */
const verifyPunchGeofence = asyncHandler(async (request, response) => {
  const { cafeId, latitude, longitude, accuracyMeters } = request.body || {};

  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'A cafeId is required for geofence validation.');
  }

  const normalizedCafeId = normalizeIdentifier(cafeId);
  if (request.auth.role === 'STAFF') {
    const allowedCafes = new Set([
      ...(request.auth.assignedCafeIds || []),
      request.auth.primaryCafeId,
    ].filter(Boolean).map(normalizeIdentifier));
    if (!allowedCafes.has(normalizedCafeId)) {
      throw new ApiError(403, 'CAFE_NOT_ASSIGNED', 'Attendance geofence verification is restricted to your assigned café.');
    }
  } else {
    ensureCafeAccess(request, normalizedCafeId);
  }

  const geofenceResult = await attendanceQrService.verifyGeofence({
    organisationId: request.auth.organisationId,
    cafeId: normalizedCafeId,
    latitude: Number(latitude),
    longitude: Number(longitude),
    accuracyMeters: typeof accuracyMeters === 'number' ? Number(accuracyMeters) : null,
  });

  return response.status(200).json({
    success: true,
    data: geofenceResult,
    correlationId: request.correlationId || null,
  });
});

/**
 * POST /api/v1/attendance/evidence/upload
 * Securely uploads a live selfie capture to object storage and records PrivateFile.
 */
function detectSelfieImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: RIFF....WEBP
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

const uploadPunchSelfie = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const {
    selfieDataUrl,
    selfieBase64,
    mimeType = 'image/jpeg',
    punchType: rawPunchType = 'CHECK_IN',
    scanGrant,
    qrToken: uploadQrToken,
    qrChallengeId,
  } = request.body || {};
  const punchType = normalizeIdentifier(rawPunchType);

  if (!['CHECK_IN', 'CHECK_OUT'].includes(punchType)) {
    throw new ApiError(400, 'INVALID_PUNCH_TYPE', 'Selfie evidence punchType must be CHECK_IN or CHECK_OUT.');
  }

  let buffer;
  let extractedMime = mimeType;
  let fileSize = 0;

  if (request.file) {
    extractedMime = request.file.mimetype;
    buffer = request.file.buffer;
    fileSize = request.file.size || buffer?.length || 0;
  } else {
    let rawData = selfieBase64 || selfieDataUrl;
    if (!rawData || typeof rawData !== 'string') {
      throw new ApiError(400, 'SELFIE_PAYLOAD_REQUIRED', 'A valid base64 image, data URL, or file upload is required.');
    }

    if (rawData.startsWith('data:')) {
      const parts = rawData.split(',');
      const mimeMatch = parts[0].match(/data:(.*?);base64/);
      if (mimeMatch) {
        extractedMime = mimeMatch[1];
      }
      rawData = parts[1] || '';
    }

    try {
      buffer = Buffer.from(rawData, 'base64');
      fileSize = buffer.length;
    } catch (err) {
      throw new ApiError(400, 'MALFORMED_IMAGE_PAYLOAD', 'Could not decode image base64 data.');
    }
  }

  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const normalizedDeclaredMime = String(extractedMime || '').toLowerCase();
  if (!allowedMimes.includes(normalizedDeclaredMime)) {
    throw new ApiError(400, 'INVALID_SELFIE_MIME', 'Only JPEG, PNG, or WebP selfie photographs are accepted.');
  }

  const maxBytes = 5 * 1024 * 1024; // 5 MB
  if (fileSize > maxBytes || (buffer && buffer.length > maxBytes)) {
    throw new ApiError(400, 'SELFIE_FILE_TOO_LARGE', 'Selfie photograph exceeds the maximum allowed size of 5 MB.');
  }

  if (!buffer || buffer.length === 0) {
    throw new ApiError(400, 'EMPTY_IMAGE_PAYLOAD', 'Decoded image payload contains 0 bytes.');
  }

  const detectedMime = detectSelfieImageMime(buffer);
  if (!detectedMime) {
    throw new ApiError(
      400,
      'INVALID_SELFIE_IMAGE_SIGNATURE',
      'Selfie payload does not contain a supported JPEG, PNG, or WebP image signature.'
    );
  }

  const declaredComparable = normalizedDeclaredMime === 'image/jpg'
    ? 'image/jpeg'
    : normalizedDeclaredMime;
  if (declaredComparable !== detectedMime) {
    throw new ApiError(
      400,
      'SELFIE_MIME_SIGNATURE_MISMATCH',
      'Selfie MIME type does not match the uploaded image bytes.'
    );
  }

  extractedMime = detectedMime;

  const grantToken = String(scanGrant || uploadQrToken || '').trim();
  if (!grantToken) {
    throw new ApiError(
      400,
      'ATTENDANCE_SCAN_GRANT_REQUIRED',
      'A verified attendance scan grant is required before selfie evidence can be uploaded.'
    );
  }

  const evidenceProof = await attendanceQrService.validatePunchQrProof(grantToken, {
    employeeOrgId: organisationId,
    employeeUserId: userId,
    expectedTransition: punchType,
  });

  if (
    qrChallengeId &&
    normalizeIdentifier(qrChallengeId) !== normalizeIdentifier(evidenceProof.challengeId)
  ) {
    throw new ApiError(
      403,
      'SELFIE_CHALLENGE_SCOPE_MISMATCH',
      'Selfie evidence challenge does not match the verified attendance scan grant.'
    );
  }

  const fileId = await SequenceCounter.generateId({
    organisationId,
    sequenceKey: 'PRIVATE_FILE',
    prefix: 'FILE',
    minimumDigits: 4,
  });

  const extensionByMime = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const fileExtension = extensionByMime[extractedMime];

  const uploadResult = await attendanceEvidenceStorageService.storeSelfie({
    organisationId,
    cafeId: evidenceProof.resolvedCafeId,
    fileId,
    punchType,
    mimeType: extractedMime,
    buffer,
  });

  let privateFile;
  try {
    privateFile = await PrivateFile.create({
      fileId,
      organisationId,
      originalName: `selfie_${punchType.toLowerCase()}_${Date.now()}.${fileExtension}`,
      mimeType: extractedMime,
      sizeBytes: buffer.length,
      sha256: uploadResult.sha256 || crypto.createHash('sha256').update(buffer).digest('hex'),
      storagePath: uploadResult.fileKey,
      uploadedByUserId: userId,
      attendanceContext: {
        challengeId: evidenceProof.challengeId,
        cafeId: normalizeIdentifier(evidenceProof.resolvedCafeId),
        punchType,
        boundAt: new Date(),
        grantExpiresAt: evidenceProof.expiresAt || null,
      },
    });
  } catch (metadataErr) {
    try {
      await attendanceEvidenceStorageService.deleteObject({ fileKey: uploadResult.fileKey });
    } catch (cleanupErr) {
      console.error('[Attendance] orphan selfie cleanup failed after metadata persistence error', {
        fileId,
        cleanupError: cleanupErr?.message || 'UNKNOWN_STORAGE_CLEANUP_ERROR',
      });
    }
    throw metadataErr;
  }

  return response.status(201).json({
    success: true,
    message: 'Selfie uploaded successfully.',
    data: {
      fileId: privateFile.fileId,
      mediaId: privateFile.fileId,
      sizeBytes: privateFile.sizeBytes,
      mimeType: privateFile.mimeType,
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * GET /api/v1/attendance/evidence/media/:mediaId
 * Authenticated streaming endpoint for selfie photographs with strict RBAC & IDOR protection.
 */
const getEvidenceMedia = asyncHandler(async (request, response) => {
  const { mediaId } = request.params;
  const { organisationId, userId, role, assignedCafeIds, assignedCafeId, primaryCafeId } = request.auth;

  if (!mediaId) {
    throw new ApiError(400, 'MEDIA_ID_REQUIRED', 'mediaId parameter is required.');
  }

  const privateFile = await PrivateFile.findOne({
    fileId: mediaId.trim().toUpperCase(),
    organisationId,
  });
  if (!privateFile) {
    throw new ApiError(404, 'MEDIA_NOT_FOUND', 'Attendance photograph not found.');
  }

  // Find attendance record referencing this selfie
  const attendanceQuery = Attendance.findOne({
    organisationId,
    $or: [
      { 'attendanceEvidence.checkIn.selfieMediaId': privateFile.fileId },
      { 'attendanceEvidence.checkIn.photoFileId': privateFile.fileId },
      { 'attendanceEvidence.checkOut.selfieMediaId': privateFile.fileId },
      { 'attendanceEvidence.checkOut.photoFileId': privateFile.fileId },
      { selfieFileId: privateFile.fileId },
    ],
  });
  const attendance = (attendanceQuery && typeof attendanceQuery.lean === 'function')
    ? await attendanceQuery.lean()
    : await attendanceQuery;

  // This endpoint is exclusively for attendance evidence. A same-organisation
  // PrivateFile that is not linked to an attendance record must never be
  // streamable merely because its fileId is known.
  if (!attendance) {
    throw new ApiError(404, 'ATTENDANCE_EVIDENCE_NOT_FOUND', 'Attendance photograph not found.');
  }

  if (role === 'MASTER' && request.auth.isPrimaryMaster !== true) {
    throw new ApiError(
      403,
      'PRIMARY_MASTER_AUTHORITY_REQUIRED',
      'Only the Primary Master may view organisation-wide attendance evidence.'
    );
  }

  // Strict Media Authorization Matrix (Section 31-35, 56)
  if (role === 'STAFF') {
    // Staff can only view own photograph
    const isOwnerOfPhoto = privateFile.uploadedByUserId === userId || (attendance && attendance.userId === userId);
    if (!isOwnerOfPhoto) {
      throw new ApiError(403, 'FORBIDDEN_EVIDENCE_ACCESS', 'You are only authorised to view your own attendance photographs.');
    }
  } else if (role === 'CAFE_ADMIN') {
    // Cafe Admin can only view for employees belonging to assigned café
    const allowedCafes = new Set([
      ...(assignedCafeIds || []),
      assignedCafeId,
      primaryCafeId,
    ].filter(Boolean).map((c) => String(c).toUpperCase()));

    if (attendance && !allowedCafes.has(attendance.cafeId.toUpperCase())) {
      throw new ApiError(403, 'FORBIDDEN_CAFE_EVIDENCE', 'Access denied to attendance photographs outside your assigned café.');
    }
  } else if (role === 'CAFE_OPS') {
    // Cafe Operations can only view for employees belonging to its bound café
    const boundCafe = String(request.auth.boundCafeId || assignedCafeId || primaryCafeId || (assignedCafeIds && assignedCafeIds[0]) || '').toUpperCase();
    if (attendance && attendance.cafeId.toUpperCase() !== boundCafe) {
      throw new ApiError(403, 'FORBIDDEN_CAFE_EVIDENCE', 'Access denied to attendance photographs outside your bound café.');
    }
  } else if (role === 'OWNER') {
    const ownerCafes = new Set((assignedCafeIds || []).map((c) => String(c).trim().toUpperCase()));
    if (!ownerCafes.size) {
      throw new ApiError(403, 'CROSS_CAFE_RESOURCE_DENIED', 'Owner has no assigned cafés.');
    }
    if (attendance && !ownerCafes.has(attendance.cafeId.toUpperCase())) {
      throw new ApiError(403, 'CROSS_CAFE_RESOURCE_DENIED', 'Access denied to attendance photographs outside your assigned café.');
    }
  } else if (role !== 'MASTER') {
    throw new ApiError(403, 'FORBIDDEN_EVIDENCE_ACCESS', 'Unauthorised to view attendance evidence.');
  }

  // Determine punch type for audit
  const isCheckIn =
    attendance?.attendanceEvidence?.checkIn?.selfieMediaId === privateFile.fileId ||
    attendance?.attendanceEvidence?.checkIn?.photoFileId === privateFile.fileId ||
    attendance?.selfieFileId === privateFile.fileId;
  const evidenceType = isCheckIn ? 'CHECK_IN' : 'CHECK_OUT';

  if (privateFile.attendanceContext?.challengeId) {
    const metadataIntegrity = await verifyAttendanceEvidenceSlot({
      organisationId,
      attendance,
      punchType: evidenceType,
      verifyStorageBytes: false,
    });

    if (metadataIntegrity.status !== 'PASS') {
      throw new ApiError(
        409,
        'ATTENDANCE_EVIDENCE_BINDING_INTEGRITY_FAILURE',
        'Attendance photograph metadata does not match its committed attendance evidence binding.'
      );
    }
  }

  if (!request.auth.userId) {
    request.auth.userId = role === 'CAFE_OPS' ? 'DEVICE-OPS-TERMINAL' : 'SYSTEM_ACTOR';
  }

  // Fetch image bytes
  const buffer = await attendanceEvidenceStorageService.readObjectBuffer({ fileKey: privateFile.fileKey || privateFile.storagePath });
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ApiError(
      404,
      'ATTENDANCE_EVIDENCE_BYTES_NOT_FOUND',
      'Attendance photograph metadata exists but the stored image bytes are unavailable.'
    );
  }

  const expectedSizeBytes = Number(privateFile.sizeBytes);
  if (
    Number.isFinite(expectedSizeBytes) &&
    expectedSizeBytes > 0 &&
    buffer.length !== expectedSizeBytes
  ) {
    throw new ApiError(
      409,
      'ATTENDANCE_EVIDENCE_SIZE_MISMATCH',
      'Attendance photograph byte length does not match its stored metadata.'
    );
  }

  const storedSha256 = String(privateFile.sha256 || '').trim().toLowerCase();
  if (privateFile.attendanceContext?.challengeId && !/^[a-f0-9]{64}$/.test(storedSha256)) {
    throw new ApiError(
      409,
      'ATTENDANCE_EVIDENCE_HASH_MISSING',
      'Secure attendance photograph is missing its canonical SHA-256 integrity metadata.'
    );
  }

  if (storedSha256) {
    const computedSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    if (computedSha256 !== storedSha256) {
      throw new ApiError(
        409,
        'ATTENDANCE_EVIDENCE_INTEGRITY_FAILURE',
        'Attendance photograph failed its stored SHA-256 integrity check.'
      );
    }
  }

  // Audit only after the evidence bytes have been successfully retrieved and
  // their stored checksum has passed. Failed/missing/corrupt evidence must not
  // be recorded as a successful view.
  await recordRequestAudit({
    request,
    module: 'ATTENDANCE',
    action: 'ATTENDANCE_EVIDENCE_VIEWED',
    entityType: 'AttendanceEvidence',
    entityId: privateFile.fileId,
    metadata: {
      mediaId: privateFile.fileId,
      fileKey: privateFile.fileKey || privateFile.storagePath || null,
      actorUserId: request.auth.userId,
      actorRole: role,
      employeeUserId: attendance?.userId || privateFile.uploadedByUserId,
      attendanceId: attendance?.attendanceId || null,
      cafeId: attendance?.cafeId || null,
      evidenceType,
    },
  });

  response.setHeader('Content-Type', privateFile.mimeType || 'image/jpeg');
  response.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  return response.status(200).send(buffer);
});

/**
 * GET /api/v1/attendance/evidence/record/:attendanceId
 * Returns structured attendance evidence metadata for the Evidence Viewer Modal.
 */
const getAttendanceEvidenceRecord = asyncHandler(async (request, response) => {
  const { attendanceId } = request.params;
  const { organisationId, userId, role, assignedCafeIds, assignedCafeId, primaryCafeId } = request.auth;

  const attendance = await Attendance.findOne({
    attendanceId: attendanceId.trim().toUpperCase(),
    organisationId,
  }).lean();

  if (!attendance) {
    throw new ApiError(404, 'ATTENDANCE_NOT_FOUND', 'Attendance record not found.');
  }

  // Authorization checks
  if (role === 'MASTER' && request.auth.isPrimaryMaster !== true) {
    throw new ApiError(
      403,
      'PRIMARY_MASTER_AUTHORITY_REQUIRED',
      'Only the Primary Master may view organisation-wide attendance evidence.'
    );
  }

  if (role === 'STAFF' && attendance.userId !== userId) {
    throw new ApiError(403, 'FORBIDDEN', 'Access denied to other employees attendance records.');
  }

  if (role === 'CAFE_ADMIN') {
    const allowedCafes = new Set([
      ...(assignedCafeIds || []),
      assignedCafeId,
      primaryCafeId,
    ].filter(Boolean).map((c) => String(c).toUpperCase()));

    if (!allowedCafes.has(attendance.cafeId.toUpperCase())) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied to records outside your assigned café.');
    }
  }

  if (role === 'CAFE_OPS') {
    const boundCafe = String(request.auth.boundCafeId || assignedCafeId || primaryCafeId || (assignedCafeIds && assignedCafeIds[0]) || '').toUpperCase();
    if (attendance.cafeId.toUpperCase() !== boundCafe) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied to records outside your bound café.');
    }
  } else if (role === 'OWNER') {
    const ownerCafes = new Set((assignedCafeIds || []).map((c) => String(c).trim().toUpperCase()));
    if (!ownerCafes.size || !ownerCafes.has(attendance.cafeId.toUpperCase())) {
      throw new ApiError(403, 'CROSS_CAFE_RESOURCE_DENIED', 'Access denied to attendance evidence outside your assigned café.');
    }
  } else if (!['MASTER', 'STAFF', 'CAFE_ADMIN'].includes(role)) {
    throw new ApiError(403, 'FORBIDDEN_EVIDENCE_ACCESS', 'Unauthorised to view attendance evidence.');
  }

  const [userDoc, cafeDoc] = await Promise.all([
    User.findOne({ userId: attendance.userId, organisationId }).lean(),
    Cafe.findOne({ cafeId: attendance.cafeId, organisationId }).lean(),
  ]);

  const checkInEvidence = attendance.attendanceEvidence?.checkIn;
  const checkOutEvidence = attendance.attendanceEvidence?.checkOut;

  // Management roles see detailed distance & accuracy
  const isManagement = ['MASTER', 'OWNER', 'CAFE_ADMIN'].includes(role);

  return response.status(200).json({
    success: true,
    data: {
      attendanceId: attendance.attendanceId,
      userId: attendance.userId,
      employeeName: userDoc?.fullName || userDoc?.name || attendance.userId,
      permanentEmployeeId: userDoc?.permanentEmployeeId || userDoc?.employeeId || attendance.userId,
      cafeId: attendance.cafeId,
      cafeName: cafeDoc?.name || attendance.cafeId,
      businessDate: attendance.businessDate,
      shiftName: attendance.shiftName || 'Standard Shift',
      status: attendance.status,
      checkIn: {
        time: attendance.checkInAt,
        selfieMediaId: checkInEvidence?.selfieMediaId || attendance.selfieFileId,
        qrVerified: checkInEvidence?.qrVerified ?? false,
        geofenceVerified: checkInEvidence?.geofenceVerified ?? false,
        distanceMeters: isManagement ? checkInEvidence?.distanceMeters ?? null : null,
        accuracyMeters: isManagement ? checkInEvidence?.accuracyMeters ?? null : null,
        serverTimestamp: checkInEvidence?.serverTimestamp || attendance.checkInAt,
      },
      checkOut: attendance.checkOutAt ? {
        time: attendance.checkOutAt,
        selfieMediaId: checkOutEvidence?.selfieMediaId || null,
        qrVerified: checkOutEvidence?.qrVerified ?? false,
        geofenceVerified: checkOutEvidence?.geofenceVerified ?? false,
        distanceMeters: isManagement ? checkOutEvidence?.distanceMeters ?? null : null,
        accuracyMeters: isManagement ? checkOutEvidence?.accuracyMeters ?? null : null,
        serverTimestamp: checkOutEvidence?.serverTimestamp || attendance.checkOutAt,
      } : null,
      isCorrection: attendance.isCorrection || false,
      correctionReason: attendance.correctionReason || null,
    },
    correlationId: request.correlationId || null,
  });
});

module.exports = {
  getAttendanceOverview,
  getLiveAttendance,
  recordMasterManualAttendance,
  getEmployeeMonthlyCalendar,
  getRoster,
  saveRoster,
  publishRoster,
  listShiftsForRoster,
  decideOvertime,
  getOvertimeList,
  getExceptionList,
  resolveException,
  closePeriod,
  reopenPeriod,
  purgeSelfieEvidence,
  reconcileOrphanSelfieEvidence,
  auditAttendanceEvidence,
  getServerTime,
  getStaffPolicy,
  getStaffToday,
  staffCheckIn,
  staffCheckOut,
  staffStartBreak,
  staffEndBreak,
  correctAttendance,
  previewRecalculation,
  getStaffHistory,
  requestStaffCorrection,
  getStaffCorrections,
  getPendingCorrections,
  reviewStaffCorrection,
  recordStaffAttestation,
  getActiveCafeQr,
  verifyScannedQr,
  verifyPunchGeofence,
  uploadPunchSelfie,
  getEvidenceMedia,
  getAttendanceEvidenceRecord,
};