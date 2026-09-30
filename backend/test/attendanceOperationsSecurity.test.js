'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// Mock Audit Service BEFORE requiring controller
const auditService = require('../src/services/auditService');
auditService.recordRequestAudit = async () => ({});
auditService.recordAuditEvent = async () => ({});

const { Attendance } = require('../src/modules/attendance/Attendance');
const { AttendancePeriod } = require('../src/models/AttendancePeriod');
const { ShiftRoster } = require('../src/models/ShiftRoster');
const { Cafe } = require('../src/models/Cafe');
const { AuditEvent } = require('../src/models/AuditEvent');
const { SequenceCounter } = require('../src/models/SequenceCounter');

// SequenceCounter mocks
SequenceCounter.generateId = async ({ prefix }) => `${prefix}-0001`;
SequenceCounter.getNextNumber = async () => 1;

// Global Mongoose save bypass
mongoose.Model.prototype.save = async function () { return this; };
Attendance.prototype.save = async function () { return this; };
AttendancePeriod.prototype.save = async function () { return this; };
ShiftRoster.prototype.save = async function () { return this; };
AuditEvent.prototype.save = async function () { return this; };

const attendanceController = require('../src/modules/attendance/attendanceController');

function invokeHandler(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        resolve(this);
        return this;
      },
      send(data) {
        this.body = data;
        resolve(this);
        return this;
      },
    };
    const next = (err) => {
      if (err) {
        res.statusCode = err.statusCode || 500;
        res.body = {
          success: false,
          code: err.code || 'INTERNAL_ERROR',
          message: err.message,
        };
        resolve(res);
      } else {
        resolve(res);
      }
    };
    try {
      const result = handler(req, res, next);
      if (result && typeof result.catch === 'function') {
        result.catch((err) => next(err));
      }
    } catch (err) {
      next(err);
    }
  });
}

test('ADM-SCR-003: Attendance & Shifts Canonical Security & Authority Test Suite', async (t) => {
  // In-memory records
  const sampleAttendance = {
    attendanceId: 'AT-20260822-001',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    userId: 'EMP-001',
    businessDate: '2026-08-22',
    status: 'CHECKED_IN',
    checkInAt: new Date('2026-08-22T06:45:00Z'),
    regularMinutes: 360,
    isLate: false,
    overtimeStatus: 'PENDING_REVIEW',
    detectedOvertimeMinutes: 90,
    rawTimeEvents: [],
    save: async function () { return this; },
  };

  const sampleAttendance2 = {
    attendanceId: 'AT-20260822-002',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0002',
    userId: 'EMP-002',
    businessDate: '2026-08-22',
    status: 'CHECKED_IN',
    checkInAt: new Date('2026-08-22T07:15:00Z'),
    regularMinutes: 300,
    isLate: true,
    overtimeStatus: 'NONE',
    detectedOvertimeMinutes: 0,
    rawTimeEvents: [],
    save: async function () { return this; },
  };

  const mockAttendance = [sampleAttendance, sampleAttendance2];

  t.mock.method(Attendance, 'find', (query = {}) => {
    let filtered = [...mockAttendance];
    if (query.organisationId) {
      filtered = filtered.filter((r) => r.organisationId === query.organisationId);
    }
    if (query.cafeId) {
      if (typeof query.cafeId === 'string') {
        filtered = filtered.filter((r) => r.cafeId === query.cafeId);
      } else if (query.cafeId.$in) {
        filtered = filtered.filter((r) => query.cafeId.$in.includes(r.cafeId));
      }
    }
    if (query.userId) {
      filtered = filtered.filter((r) => r.userId === query.userId);
    }
    return {
      sort: () => ({ lean: async () => filtered }),
      lean: async () => filtered,
    };
  });

  t.mock.method(Attendance, 'findOne', (query = {}) => {
    let result = mockAttendance.find((r) => {
      if (query.attendanceId && r.attendanceId !== query.attendanceId) return false;
      if (query.userId && r.userId !== query.userId) return false;
      if (query.organisationId && r.organisationId !== query.organisationId) return false;
      return true;
    }) || null;

    return {
      ...result,
      lean: () => Promise.resolve(result),
      then: (resolve) => Promise.resolve(result).then(resolve),
      catch: (reject) => Promise.resolve(result).catch(reject),
    };
  });

  t.mock.method(Attendance, 'updateMany', async () => ({ modifiedCount: 148 }));

  t.mock.method(Cafe, 'find', (query = {}) => ({
    lean: async () => {
      const all = [
        { cafeId: 'ZC-0001', name: 'Dawn Roast Koramangala', status: 'ACTIVE' },
        { cafeId: 'ZC-0002', name: 'Indiranagar Central', status: 'ACTIVE' },
        { cafeId: 'ZC-0003', name: 'Calicut Beach', status: 'ACTIVE' },
      ];
      if (query.cafeId?.$in) {
        return all.filter((c) => query.cafeId.$in.includes(c.cafeId));
      }
      return all;
    },
  }));

  const samplePeriod = {
    periodId: 'PER-2026-08',
    organisationId: 'ORG-ZAMORIN',
    year: 2026,
    month: 8,
    status: 'OPEN',
    reopenHistory: [],
    save: async function () { return this; },
  };

  t.mock.method(AttendancePeriod, 'findOne', () => ({
    ...samplePeriod,
    lean: async () => samplePeriod,
    then: (resolve) => Promise.resolve(samplePeriod).then(resolve),
  }));

  const sampleRoster = {
    rosterId: 'ROS-20260817-ZC0001',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    weekStartDate: '2026-08-17',
    status: 'DRAFT',
    assignments: [],
    save: async function () { return this; },
  };

  t.mock.method(ShiftRoster, 'findOne', () => ({
    ...sampleRoster,
    lean: async () => sampleRoster,
    then: (resolve) => Promise.resolve(sampleRoster).then(resolve),
  }));

  await t.test('1. Authoritative Server Time endpoint returns IST sync state', async () => {
    const req = {
      auth: { role: 'CAFE_ADMIN', organisationId: 'ORG-ZAMORIN', assignedCafeIds: ['ZC-0001'] },
      correlationId: 'CORR-TIME-01',
    };

    const res = await invokeHandler(attendanceController.getServerTime, req);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.istDisplay);
    assert.ok(res.body.data.istDateKey);
    assert.ok(res.body.data.utc);
  });

  await t.test('2. CAFE_ADMIN on Trusted Device scoped strictly to assigned cafe (0 cross-cafe leakage)', async () => {
    const trustedAuth = {
      role: 'CAFE_ADMIN',
      organisationId: 'ORG-ZAMORIN',
      assignedCafeIds: ['ZC-0001'],
      privilegeProfile: 'CAFE_OPERATIONS',
      deviceContext: { deviceId: 'DV_ZC0001_POS_01', deviceClass: 'CAFE_OWNED' },
    };

    // Attempting foreign cafe ZC-0002 -> HTTP 403 CAFE_ACCESS_DENIED
    const foreignReq = {
      auth: trustedAuth,
      query: { cafeId: 'ZC-0002' },
      correlationId: 'CORR-SCOPE-01',
    };
    const foreignRes = await invokeHandler(attendanceController.getAttendanceOverview, foreignReq);
    assert.equal(foreignRes.statusCode, 403);
    assert.equal(foreignRes.body.code, 'CAFE_ACCESS_DENIED');

    // Querying assigned cafe ZC-0001 -> HTTP 200
    const validReq = {
      auth: trustedAuth,
      query: { cafeId: 'ZC-0001' },
      correlationId: 'CORR-SCOPE-02',
    };
    const validRes = await invokeHandler(attendanceController.getAttendanceOverview, validReq);
    assert.equal(validRes.statusCode, 200);
    assert.equal(validRes.body.success, true);
    assert.ok(validRes.body.data.kpis);
    assert.equal(validRes.body.data.cafeWorkforce.length, 1);
    assert.equal(validRes.body.data.cafeWorkforce[0].cafeId, 'ZC-0001');
  });

  await t.test('3. CAFE_ADMIN on Personal Device (SELF_ONLY) denied cafe-wide attendance overview', async () => {
    const personalAuth = {
      role: 'CAFE_ADMIN',
      organisationId: 'ORG-ZAMORIN',
      assignedCafeIds: ['ZC-0001'],
      privilegeProfile: 'SELF_ONLY',
      deviceContext: { deviceClass: 'PERSONAL' },
    };

    const req = {
      auth: personalAuth,
      query: { cafeId: 'ZC-0001' },
      correlationId: 'CORR-SELF-01',
    };
    const res = await invokeHandler(attendanceController.getAttendanceOverview, req);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'PERMISSION_DENIED');
  });

  await t.test('4. STAFF role denied manual attendance entry and admin operations', async () => {
    const staffAuth = {
      role: 'STAFF',
      organisationId: 'ORG-ZAMORIN',
      assignedCafeIds: ['ZC-0001'],
      privilegeProfile: 'SELF_ONLY',
    };

    const req = {
      auth: staffAuth,
      body: {
        userId: 'EMP-002',
        cafeId: 'ZC-0001',
        eventType: 'CHECK_IN',
        reason: 'Staff self elevation attempt',
      },
    };
    const res = await invokeHandler(attendanceController.recordMasterManualAttendance, req);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'PERMISSION_DENIED');
  });

  await t.test('5. CAFE_ADMIN records manual punch for assigned cafe with full audit lineage', async () => {
    const trustedAuth = {
      userId: 'CA-KORA-01',
      role: 'CAFE_ADMIN',
      organisationId: 'ORG-ZAMORIN',
      assignedCafeIds: ['ZC-0001'],
      privilegeProfile: 'CAFE_OPERATIONS',
      operatorSession: { sessionId: 'SES-KORA-01' },
      deviceContext: { deviceId: 'DV_ZC0001_POS_01', deviceClass: 'CAFE_OWNED' },
    };

    // Foreign cafe punch -> 403
    const foreignReq = {
      auth: trustedAuth,
      body: {
        userId: 'EMP-002',
        cafeId: 'ZC-0002',
        eventType: 'CHECK_OUT',
        reason: 'Attempting to punch for another branch',
      },
    };
    const foreignRes = await invokeHandler(attendanceController.recordMasterManualAttendance, foreignReq);
    assert.equal(foreignRes.statusCode, 403);
    assert.equal(foreignRes.body.code, 'CAFE_ACCESS_DENIED');

    // Assigned cafe punch -> 200
    const validReq = {
      auth: trustedAuth,
      body: {
        userId: 'EMP-001',
        cafeId: 'ZC-0001',
        eventType: 'CHECK_OUT',
        reason: 'Staff forgot to punch out due to peak evening rush',
      },
    };
    const validRes = await invokeHandler(attendanceController.recordMasterManualAttendance, validReq);
    assert.equal(validRes.statusCode, 200);
    assert.equal(validRes.body.success, true);
    assert.equal(validRes.body.data.attendance.isManualEntry, true);
  });

  await t.test('6. Overtime Authority: CAFE_ADMIN can recommend (VERIFY_ADMIN); final APPROVE requires MASTER', async () => {
    const adminAuth = {
      userId: 'CA-KORA-01',
      role: 'CAFE_ADMIN',
      organisationId: 'ORG-ZAMORIN',
      assignedCafeIds: ['ZC-0001'],
      privilegeProfile: 'CAFE_OPERATIONS',
    };

    // 1. CAFE_ADMIN attempts final APPROVE -> 403 PRIMARY_MASTER_AUTHORITY_REQUIRED
    const failApproveReq = {
      auth: adminAuth,
      body: {
        attendanceId: 'AT-20260822-001',
        decision: 'APPROVE',
        approvedMinutes: 90,
      },
    };
    const failApproveRes = await invokeHandler(attendanceController.decideOvertime, failApproveReq);
    assert.equal(failApproveRes.statusCode, 403);
    assert.equal(failApproveRes.body.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');

    // 2. CAFE_ADMIN submits VERIFY_ADMIN recommendation -> 200
    const verifyReq = {
      auth: adminAuth,
      body: {
        attendanceId: 'AT-20260822-001',
        decision: 'VERIFY_ADMIN',
      },
    };
    const verifyRes = await invokeHandler(attendanceController.decideOvertime, verifyReq);
    assert.equal(verifyRes.statusCode, 200);
    assert.equal(verifyRes.body.success, true);

    // 3. Primary Master final APPROVE -> 200
    const primaryMasterAuth = {
      userId: 'MU-PRIMARY-01',
      role: 'MASTER',
      isPrimaryMaster: true,
      organisationId: 'ORG-ZAMORIN',
    };
    const masterApproveReq = {
      auth: primaryMasterAuth,
      body: {
        attendanceId: 'AT-20260822-001',
        decision: 'APPROVE',
        approvedMinutes: 90,
        reason: 'Authorized peak hours shift extension',
      },
    };
    const masterApproveRes = await invokeHandler(attendanceController.decideOvertime, masterApproveReq);
    assert.equal(masterApproveRes.statusCode, 200);
    assert.equal(masterApproveRes.body.success, true);
  });

  await t.test('7. Period Lock & Retention Purge Governance: Primary Master Only', async () => {
    const adminAuth = {
      userId: 'CA-KORA-01',
      role: 'CAFE_ADMIN',
      organisationId: 'ORG-ZAMORIN',
      assignedCafeIds: ['ZC-0001'],
      privilegeProfile: 'CAFE_OPERATIONS',
    };

    const primaryMasterAuth = {
      userId: 'MU-PRIMARY-01',
      role: 'MASTER',
      isPrimaryMaster: true,
      organisationId: 'ORG-ZAMORIN',
    };

    // CAFE_ADMIN close period -> 403
    const adminLockRes = await invokeHandler(attendanceController.closePeriod, {
      auth: adminAuth,
      params: { periodId: 'PER-2026-08' },
    });
    assert.equal(adminLockRes.statusCode, 403);

    // Primary Master close period -> 200
    const masterLockRes = await invokeHandler(attendanceController.closePeriod, {
      auth: primaryMasterAuth,
      params: { periodId: 'PER-2026-08' },
    });
    assert.equal(masterLockRes.statusCode, 200);
    assert.equal(masterLockRes.body.success, true);

    // CAFE_ADMIN purge selfies -> 403
    const adminPurgeRes = await invokeHandler(attendanceController.purgeSelfieEvidence, {
      auth: adminAuth,
    });
    assert.equal(adminPurgeRes.statusCode, 403);

    // Primary Master reaches the purge boundary, but physical deletion fails closed
    // until explicit retention cutoff + provider deletion are configured.
    const masterPurgeRes = await invokeHandler(attendanceController.purgeSelfieEvidence, {
      auth: primaryMasterAuth,
    });
    assert.equal(masterPurgeRes.statusCode, 503);
    assert.equal(masterPurgeRes.body.code, 'EVIDENCE_PURGE_NOT_CONFIGURED');
  });
});
