'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateAttendanceMetrics } = require('../src/services/attendanceCalculationService');
const { AttendanceCorrectionRequest } = require('../src/models/AttendanceCorrectionRequest');
const { Attendance } = require('../src/modules/attendance/Attendance');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { AuditEvent } = require('../src/models/AuditEvent');
const { User } = require('../src/models/User');

const {
  staffCheckIn,
  staffCheckOut,
  staffStartBreak,
  staffEndBreak,
  correctAttendance,
  previewRecalculation,
  getStaffHistory,
  requestStaffCorrection,
  getPendingCorrections,
  reviewStaffCorrection,
  getEmployeeMonthlyCalendar,
} = require('../src/modules/attendance/attendanceController');

// Ensure prototype.save doesn't attempt real network I/O in unit mocks
AttendanceCorrectionRequest.prototype.save = async function () { return this; };

// ---------------------------------------------------------------------------
// 1. UNIT TESTS: attendanceCalculationService (P0-A04, P0-A05, P0-A09)
// ---------------------------------------------------------------------------

test('CALC-001: standard shift with no breaks computes exact worked minutes', () => {
  const result = calculateAttendanceMetrics({
    checkInAt: '2026-08-19T09:00:00Z',
    checkOutAt: '2026-08-19T17:00:00Z',
    scheduledStartTime: '09:00',
    scheduledEndTime: '17:00',
  });

  assert.equal(result.workedMinutes, 480);
  assert.equal(result.breakMinutes, 0);
  assert.equal(result.lateMinutes, 0);
  assert.equal(result.isLate, false);
  assert.equal(result.earlyDepartureMinutes, 0);
  assert.equal(result.overtimeMinutes, 0);
  assert.equal(result.status, 'COMPLETED');
});

test('CALC-002: late arrival beyond threshold detects isLate and lateMinutes', () => {
  const result = calculateAttendanceMetrics({
    checkInAt: '2026-08-19T09:25:00Z',
    checkOutAt: '2026-08-19T17:00:00Z',
    scheduledStartAt: '2026-08-19T09:00:00Z',
    scheduledEndAt: '2026-08-19T17:00:00Z',
    lateThresholdMinutes: 15,
  });

  assert.equal(result.isLate, true);
  assert.equal(result.lateMinutes, 25);
  assert.equal(result.workedMinutes, 455);
});

test('CALC-003: arrival within late threshold grace period is not marked late', () => {
  const result = calculateAttendanceMetrics({
    checkInAt: '2026-08-19T09:10:00Z',
    checkOutAt: '2026-08-19T17:00:00Z',
    scheduledStartAt: '2026-08-19T09:00:00Z',
    scheduledEndAt: '2026-08-19T17:00:00Z',
    gracePeriodMinutes: 15,
  });

  assert.equal(result.isLate, false);
  assert.equal(result.lateMinutes, 0);
});

test('CALC-004: early departure detects earlyDepartureMinutes', () => {
  const result = calculateAttendanceMetrics({
    checkInAt: '2026-08-19T09:00:00Z',
    checkOutAt: '2026-08-19T16:30:00Z',
    scheduledStartAt: '2026-08-19T09:00:00Z',
    scheduledEndAt: '2026-08-19T17:00:00Z',
    gracePeriodMinutes: 15,
  });

  assert.equal(result.isEarlyExit, true);
  assert.equal(result.earlyDepartureMinutes, 30);
  assert.equal(result.workedMinutes, 450);
});

test('CALC-005: breaks array accurately subtracts from gross worked time', () => {
  const result = calculateAttendanceMetrics({
    checkInAt: '2026-08-19T09:00:00Z',
    checkOutAt: '2026-08-19T17:00:00Z',
    breaks: [
      { startedAt: '2026-08-19T12:00:00Z', endedAt: '2026-08-19T12:30:00Z', durationMinutes: 30 },
      { startedAt: '2026-08-19T15:00:00Z', endedAt: '2026-08-19T15:15:00Z', durationMinutes: 15 },
    ],
  });

  assert.equal(result.breakMinutes, 45);
  assert.equal(result.workedMinutes, 435);
});

test('CALC-006: open break is automatically closed up to checkOutAt', () => {
  const result = calculateAttendanceMetrics({
    checkInAt: '2026-08-19T09:00:00Z',
    checkOutAt: '2026-08-19T17:00:00Z',
    breaks: [
      { startedAt: '2026-08-19T16:30:00Z', endedAt: null },
    ],
  });

  assert.equal(result.breakMinutes, 30);
  assert.equal(result.workedMinutes, 450);
  assert.equal(result.breaks[0].endedAt, '2026-08-19T17:00:00Z');
  assert.equal(result.breaks[0].durationMinutes, 30);
});

test('CALC-007: overnight shift crossing midnight calculates exact minutes (P0-A05)', () => {
  const result = calculateAttendanceMetrics({
    checkInAt: '2026-08-18T22:00:00Z',
    checkOutAt: '2026-08-19T06:00:00Z',
    scheduledStartAt: '2026-08-18T22:00:00Z',
    scheduledEndAt: '2026-08-19T06:00:00Z',
  });

  assert.equal(result.workedMinutes, 480);
  assert.equal(result.breakMinutes, 0);
  assert.equal(result.lateMinutes, 0);
  assert.equal(result.isLate, false);
});

test('CALC-008: overtime past standard shift detects overtimeMinutes and PENDING_REVIEW', () => {
  const result = calculateAttendanceMetrics({
    checkInAt: '2026-08-19T09:00:00Z',
    checkOutAt: '2026-08-19T19:00:00Z',
    scheduledDurationMinutes: 480,
  });

  assert.equal(result.workedMinutes, 600);
  assert.equal(result.overtimeMinutes, 120);
  assert.equal(result.overtimeStatus, 'PENDING_REVIEW');
});

// ---------------------------------------------------------------------------
// 2. CONTROLLER TESTS: Master Attendance Edit & Malformed MASTER Parity (P0-A01)
// ---------------------------------------------------------------------------

test('P0-A01: correctAttendance rejects if reason is missing', async () => {
  const req = {
    auth: { userId: 'MU-NORMAL-01', role: 'MASTER', isPrimaryMaster: false, organisationId: 'ORG-ZAMORIN' },
    params: { attendanceId: 'AT-20260819-001' },
    body: { checkInAt: '2026-08-19T09:00:00Z' },
  };
  const res = {
    status() { return this; },
    json() { return this; },
  };

  await assert.rejects(
    async () => {
      await correctAttendance(req, res);
    },
    {
      statusCode: 400,
      code: 'REASON_REQUIRED',
    }
  );
});

test('P0-A01: correctAttendance allows Malformed MASTER and recalculates metrics', async () => {
  const origFindOne = Attendance.findOne;
  const origGenId = SequenceCounter.generateId;
  const origAuditCreate = AuditEvent.create;

  const sampleRecord = {
    attendanceId: 'AT-20260819-001',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    userId: 'EMP-001',
    businessDate: '2026-08-19',
    status: 'CHECKED_IN',
    checkInAt: new Date('2026-08-19T09:00:00Z'),
    checkOutAt: null,
    workedMinutes: 0,
    breakMinutes: 0,
    overtimeMinutes: 0,
    breaks: [],
    rawTimeEvents: [],
    save: async function () { return this; },
  };

  Attendance.findOne = async () => sampleRecord;
  SequenceCounter.generateId = async () => 'AE-20260819-0001';
  AuditEvent.create = async () => ({});

  let responseJson = null;
  const req = {
    auth: { userId: 'MU-NORMAL-01', role: 'MASTER', isPrimaryMaster: false, organisationId: 'ORG-ZAMORIN' },
    params: { attendanceId: 'AT-20260819-001' },
    body: {
      checkInAt: '2026-08-19T09:00:00Z',
      checkOutAt: '2026-08-19T17:00:00Z',
      status: 'MANUALLY_CORRECTED',
      reason: 'Biometric reader network disconnect during check-out',
    },
    ip: '127.0.0.1',
    get: () => 'TestAgent',
  };
  const res = {
    status(code) {
      assert.equal(code, 200);
      return this;
    },
    json(data) {
      responseJson = data;
      return this;
    },
  };

  await correctAttendance(req, res);

  assert.equal(responseJson.success, true);
  assert.equal(responseJson.data.attendance.workedMinutes, 480);
  assert.equal(responseJson.data.attendance.status, 'MANUALLY_CORRECTED');

  Attendance.findOne = origFindOne;
  SequenceCounter.generateId = origGenId;
  AuditEvent.create = origAuditCreate;
});

test('P0-A01: previewRecalculation returns instant calculation preview', async () => {
  const origFindOne = Attendance.findOne;
  Attendance.findOne = async () => ({
    attendanceId: 'AT-20260819-001',
    breaks: [],
  });

  let responseJson = null;
  const req = {
    auth: { userId: 'MU-PRIMARY-01', role: 'MASTER', isPrimaryMaster: true, organisationId: 'ORG-ZAMORIN' },
    body: {
      attendanceId: 'AT-20260819-001',
      checkInAt: '2026-08-19T09:00:00Z',
      checkOutAt: '2026-08-19T18:00:00Z',
      scheduledStartAt: '2026-08-19T09:00:00Z',
      scheduledEndAt: '2026-08-19T17:00:00Z',
      scheduledDurationMinutes: 480,
    },
  };
  const res = {
    status(code) {
      assert.equal(code, 200);
      return this;
    },
    json(data) {
      responseJson = data;
      return this;
    },
  };

  await previewRecalculation(req, res);

  assert.equal(responseJson.success, true);
  assert.equal(responseJson.data.metrics.workedMinutes, 540);
  assert.equal(responseJson.data.metrics.overtimeMinutes, 60);

  Attendance.findOne = origFindOne;
});

// ---------------------------------------------------------------------------
// 3. CONTROLLER TESTS: Cross-Café Check-in Enforcement (P0-A06)
// ---------------------------------------------------------------------------

test('P0-A06: staffCheckIn rejects clock-in when employee is not assigned to cafe (403)', async () => {
  const req = {
    auth: {
      userId: 'STAFF-001',
      role: 'STAFF',
      organisationId: 'ORG-ZAMORIN',
      assignedCafeIds: ['CAFE-001'],
      primaryCafeId: 'CAFE-001',
    },
    body: {
      cafeId: 'CAFE-002', // unassigned cafe
    },
  };
  const res = {
    status() { return this; },
    json() { return this; },
  };

  await assert.rejects(
    async () => {
      await staffCheckIn(req, res);
    },
    {
      statusCode: 403,
      code: 'CAFE_NOT_ASSIGNED',
    }
  );
});

// ---------------------------------------------------------------------------
// 4. CONTROLLER TESTS: Break Management Workflow (P0-A04)
// ---------------------------------------------------------------------------

test('P0-A04: staffStartBreak transitions session to ON_BREAK', async () => {
  const origFindOne = Attendance.findOne;
  const sampleSession = {
    attendanceId: 'AT-20260819-001',
    userId: 'STAFF-001',
    status: 'CHECKED_IN',
    breaks: [],
    rawTimeEvents: [],
    save: async function () { return this; },
  };
  Attendance.findOne = () => ({
    sort: () => Promise.resolve(sampleSession),
    then: (res, rej) => Promise.resolve(sampleSession).then(res, rej),
    catch: (rej) => Promise.resolve(sampleSession).catch(rej),
  });

  let responseJson = null;
  const req = {
    auth: { userId: 'STAFF-001', role: 'STAFF', organisationId: 'ORG-ZAMORIN' },
    body: { reason: 'Lunch Break' },
  };
  const res = {
    status(code) {
      assert.equal(code, 200);
      return this;
    },
    json(data) {
      responseJson = data;
      return this;
    },
  };

  await staffStartBreak(req, res);

  assert.equal(responseJson.success, true);
  assert.equal(responseJson.data.attendance.status, 'ON_BREAK');
  assert.equal(sampleSession.breaks.length, 1);

  Attendance.findOne = origFindOne;
});

test('P0-A04: staffStartBreak rejects if already on break (400)', async () => {
  const origFindOne = Attendance.findOne;
  const activeSession = {
    attendanceId: 'AT-20260819-001',
    userId: 'STAFF-001',
    status: 'ON_BREAK',
  };
  Attendance.findOne = () => ({
    sort: () => Promise.resolve(activeSession),
    then: (res, rej) => Promise.resolve(activeSession).then(res, rej),
    catch: (rej) => Promise.resolve(activeSession).catch(rej),
  });

  const req = {
    auth: { userId: 'STAFF-001', role: 'STAFF', organisationId: 'ORG-ZAMORIN' },
    body: {},
  };
  const res = {
    status() { return this; },
    json() { return this; },
  };

  await assert.rejects(
    async () => {
      await staffStartBreak(req, res);
    },
    {
      statusCode: 400,
      code: 'ALREADY_ON_BREAK',
    }
  );

  Attendance.findOne = origFindOne;
});

test('P0-A04: staffEndBreak closes break and transitions session back to CHECKED_IN', async () => {
  const origFindOne = Attendance.findOne;
  const startedAt = new Date(Date.now() - 30 * 60 * 1000); // 30 mins ago
  const sampleSession = {
    attendanceId: 'AT-20260819-001',
    userId: 'STAFF-001',
    status: 'ON_BREAK',
    breakMinutes: 0,
    breaks: [
      { startedAt, endedAt: null, durationMinutes: 0 },
    ],
    rawTimeEvents: [],
    save: async function () { return this; },
  };
  Attendance.findOne = () => ({
    sort: () => Promise.resolve(sampleSession),
    then: (res, rej) => Promise.resolve(sampleSession).then(res, rej),
    catch: (rej) => Promise.resolve(sampleSession).catch(rej),
  });

  let responseJson = null;
  const req = {
    auth: { userId: 'STAFF-001', role: 'STAFF', organisationId: 'ORG-ZAMORIN' },
  };
  const res = {
    status(code) {
      assert.equal(code, 200);
      return this;
    },
    json(data) {
      responseJson = data;
      return this;
    },
  };

  await staffEndBreak(req, res);

  assert.equal(responseJson.success, true);
  assert.equal(responseJson.data.attendance.status, 'CHECKED_IN');
  assert.ok(sampleSession.breaks[0].endedAt);

  Attendance.findOne = origFindOne;
});

// ---------------------------------------------------------------------------
// 5. CONTROLLER TESTS: Overnight Shift Checkout (P0-A05)
// ---------------------------------------------------------------------------

test('P0-A05: staffCheckOut successfully checks out across midnight rollover', async () => {
  const origFindOne = Attendance.findOne;
  const checkInDate = new Date('2026-08-18T22:00:00Z');
  const sampleSession = {
    attendanceId: 'AT-20260818-001',
    userId: 'STAFF-001',
    businessDate: '2026-08-18', // previous day business date
    status: 'CHECKED_IN',
    checkInAt: checkInDate,
    checkOutAt: null,
    breaks: [],
    rawTimeEvents: [],
    save: async function () { return this; },
  };

  Attendance.findOne = (query) => ({
    sort: () => Promise.resolve(sampleSession),
    then: (res, rej) => Promise.resolve(sampleSession).then(res, rej),
    catch: (rej) => Promise.resolve(sampleSession).catch(rej),
  });

  let responseJson = null;
  const req = {
    auth: { userId: 'STAFF-001', role: 'STAFF', organisationId: 'ORG-ZAMORIN' },
    body: {},
  };
  const res = {
    status(code) {
      assert.equal(code, 200);
      return this;
    },
    json(data) {
      responseJson = data;
      return this;
    },
  };

  await staffCheckOut(req, res);

  assert.equal(responseJson.success, true);
  assert.equal(responseJson.data.attendance.status, 'CHECKED_OUT');
  assert.ok(responseJson.data.attendance.checkOutAt);

  Attendance.findOne = origFindOne;
});

// ---------------------------------------------------------------------------
// 6. CONTROLLER TESTS: Correction Request Creation & Review (P0-A03)
// ---------------------------------------------------------------------------

test('P0-A03: requestStaffCorrection creates real AttendanceCorrectionRequest', async () => {
  const origFindOne = Attendance.findOne;
  const origGenId = SequenceCounter.generateId;

  Attendance.findOne = async () => ({
    attendanceId: 'AT-20260819-001',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    userId: 'STAFF-001',
    businessDate: '2026-08-19',
    checkInAt: new Date('2026-08-19T09:00:00Z'),
    checkOutAt: new Date('2026-08-19T17:00:00Z'),
    status: 'CHECKED_OUT',
    save: async function () { return this; },
  });

  SequenceCounter.generateId = async () => 'CR-20260819-0001';

  let responseJson = null;
  const req = {
    auth: { userId: 'STAFF-001', role: 'STAFF', organisationId: 'ORG-ZAMORIN' },
    body: {
      attendanceId: 'AT-20260819-001',
      requestedCheckInAt: '2026-08-19T08:45:00Z',
      requestedCheckOutAt: '2026-08-19T17:15:00Z',
      reason: 'Biometric reader did not register initial tap at 08:45',
    },
  };
  const res = {
    status(code) {
      assert.equal(code, 201);
      return this;
    },
    json(data) {
      responseJson = data;
      return this;
    },
  };

  await requestStaffCorrection(req, res);

  assert.equal(responseJson.success, true);
  assert.ok(responseJson.data.correctionRequest);
  assert.equal(responseJson.data.correctionRequest.status, 'PENDING');
  assert.equal(responseJson.data.correctionRequest.reason, 'Biometric reader did not register initial tap at 08:45');

  Attendance.findOne = origFindOne;
  SequenceCounter.generateId = origGenId;
});

test('P0-A03: reviewStaffCorrection allows Malformed MASTER to approve and update attendance', async () => {
  const origFindOne = AttendanceCorrectionRequest.findOne;
  const origAttFindOne = Attendance.findOne;
  const origGenId = SequenceCounter.generateId;
  const origAuditCreate = AuditEvent.create;

  const sampleCorrection = {
    correctionRequestId: 'CR-20260819-0001',
    requestId: 'CR-20260819-0001',
    attendanceId: 'AT-20260819-001',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    userId: 'STAFF-001',
    status: 'PENDING',
    requestedCheckInAt: new Date('2026-08-19T08:45:00Z'),
    requestedCheckOutAt: new Date('2026-08-19T17:15:00Z'),
    requestedStatus: 'MANUALLY_CORRECTED',
    reason: 'Biometric reader did not register initial tap at 08:45',
    save: async function () { return this; },
  };

  const sampleAttendance = {
    attendanceId: 'AT-20260819-001',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    userId: 'STAFF-001',
    businessDate: '2026-08-19',
    checkInAt: new Date('2026-08-19T09:00:00Z'),
    checkOutAt: new Date('2026-08-19T17:00:00Z'),
    status: 'CHECKED_OUT',
    breaks: [],
    rawTimeEvents: [],
    save: async function () { return this; },
  };

  AttendanceCorrectionRequest.findOne = async () => sampleCorrection;
  Attendance.findOne = async () => sampleAttendance;
  SequenceCounter.generateId = async () => 'AE-20260819-0002';
  AuditEvent.create = async () => ({});

  let responseJson = null;
  const req = {
    auth: { userId: 'MU-NORMAL-01', role: 'MASTER', isPrimaryMaster: false, organisationId: 'ORG-ZAMORIN' },
    params: { requestId: 'CR-20260819-0001' },
    body: {
      decision: 'APPROVE',
      reviewerNote: 'Verified with security log',
    },
    ip: '127.0.0.1',
    get: () => 'TestAgent',
  };
  const res = {
    status(code) {
      assert.equal(code, 200);
      return this;
    },
    json(data) {
      responseJson = data;
      return this;
    },
  };

  await reviewStaffCorrection(req, res);

  assert.equal(responseJson.success, true);
  assert.equal(sampleCorrection.status, 'APPROVED');
  assert.equal(sampleAttendance.status, 'CHECKED_OUT');
  assert.equal(sampleAttendance.workedMinutes, 510); // 08:45 to 17:15 = 8h30m = 510m

  AttendanceCorrectionRequest.findOne = origFindOne;
  Attendance.findOne = origAttFindOne;
  SequenceCounter.generateId = origGenId;
  AuditEvent.create = origAuditCreate;
});

// ---------------------------------------------------------------------------
// 7. CONTROLLER TESTS: Staff Calendar-360 Privacy Leak (P0-A08)
// ---------------------------------------------------------------------------

test('P0-A08: getEmployeeMonthlyCalendar blocks staff from accessing another employee calendar (403)', async () => {
  const req = {
    auth: { userId: 'STAFF-001', role: 'STAFF', organisationId: 'ORG-ZAMORIN' },
    params: { userId: 'STAFF-002' }, // different user
    query: { month: '2026-08' },
  };
  const res = {
    status() { return this; },
    json() { return this; },
  };

  await assert.rejects(
    async () => {
      await getEmployeeMonthlyCalendar(req, res);
    },
    {
      statusCode: 403,
      code: 'FORBIDDEN',
    }
  );
});

test('P0-A08: getEmployeeMonthlyCalendar allows staff to view their own calendar without untrusted device rejection', async () => {
  const origFind = Attendance.find;
  const origUserFindOne = User.findOne;

  Attendance.find = () => ({
    sort: () => ({
      lean: async () => [
        {
          attendanceId: 'AT-20260819-001',
          userId: 'STAFF-001',
          businessDate: '2026-08-19',
          status: 'CHECKED_OUT',
          workedMinutes: 480,
          isLate: false,
        },
      ],
    }),
    lean: async () => [
      {
        attendanceId: 'AT-20260819-001',
        userId: 'STAFF-001',
        businessDate: '2026-08-19',
        status: 'CHECKED_OUT',
        workedMinutes: 480,
        isLate: false,
      },
    ],
  });

  User.findOne = () => ({
    lean: async () => ({
      userId: 'STAFF-001',
      fullName: 'Alice Staff',
      assignedCafeIds: ['ZC-0001'],
      primaryCafeId: 'ZC-0001',
    }),
  });

  let responseJson = null;
  const req = {
    auth: { userId: 'STAFF-001', role: 'STAFF', organisationId: 'ORG-ZAMORIN' },
    params: { userId: 'STAFF-001' }, // own user id
    query: { month: '2026-08' },
  };
  const res = {
    status(code) {
      assert.equal(code, 200);
      return this;
    },
    json(data) {
      responseJson = data;
      return this;
    },
  };

  await getEmployeeMonthlyCalendar(req, res);

  assert.equal(responseJson.success, true);
  assert.equal(responseJson.data.records.length, 1);

  Attendance.find = origFind;
  User.findOne = origUserFindOne;
});

// ---------------------------------------------------------------------------
// 8. CONTROLLER TESTS: Dynamic Month History Query (P0-A07)
// ---------------------------------------------------------------------------

test('P0-A07: getStaffHistory dynamically filters by requested month query', async () => {
  const origFind = Attendance.find;
  let capturedQuery = null;

  Attendance.find = (query) => {
    capturedQuery = query;
    return {
      sort: () => ({
        lean: async () => [],
      }),
    };
  };

  let responseJson = null;
  const req = {
    auth: { userId: 'STAFF-001', role: 'STAFF', organisationId: 'ORG-ZAMORIN' },
    query: { month: '2026-09' }, // dynamic month parameter
  };
  const res = {
    status(code) {
      assert.equal(code, 200);
      return this;
    },
    json(data) {
      responseJson = data;
      return this;
    },
  };

  await getStaffHistory(req, res);

  assert.equal(responseJson.success, true);
  assert.equal(responseJson.data.month, '2026-09');
  assert.equal(capturedQuery.businessDate.$regex, '^2026-09');

  Attendance.find = origFind;
});
