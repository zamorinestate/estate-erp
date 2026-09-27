'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const { Approval } = require('../src/models/Approval');
const { LeaveRequest } = require('../src/models/LeaveRequest');
const { ShiftChangeRequest } = require('../src/models/ShiftChangeRequest');
const { Attendance } = require('../src/modules/attendance/Attendance');
const { AttendanceException } = require('../src/models/AttendanceException');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { Notification } = require('../src/models/Notification');
const { NotificationOutbox } = require('../src/models/NotificationOutbox');
const { AuditEvent } = require('../src/models/AuditEvent');

const approvalController = require('../src/controllers/approvalController');
const leaveController = require('../src/controllers/leaveController');

const ORG = 'ORG-ZAMORIN';
const CAFE = 'CAFE-001';
const MASTER_AUTH = {
  organisationId: ORG,
  userId: 'MU-0001',
  role: 'MASTER',
  isPrimaryMaster: true,
  assignedCafeIds: [CAFE],
};
const STAFF_AUTH = {
  organisationId: ORG,
  userId: 'ST-0001',
  role: 'STAFF',
  assignedCafeIds: [CAFE],
};

let replSet;

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function invoke(controller, req) {
  const res = mockRes();
  let nextError = null;
  await new Promise((resolve) => {
    const next = (err) => {
      nextError = err || null;
      resolve();
    };
    Promise.resolve(controller(req, res, next))
      .then(() => resolve())
      .catch((err) => {
        nextError = err;
        resolve();
      });
  });
  return { res, error: nextError };
}

async function seedLeaveApproval({ approvalId = 'APP-10001', leaveId = 'LR-20260927-001' } = {}) {
  await LeaveRequest.create({
    leaveId,
    organisationId: ORG,
    cafeId: CAFE,
    userId: 'ST-0001',
    leaveType: 'CASUAL',
    startDate: '2026-09-28',
    endDate: '2026-09-28',
    durationUnit: 'FULL_DAY',
    requestedDays: 1,
    reason: 'Fault injection fixture',
    status: 'PENDING',
  });
  await Approval.create({
    approvalId,
    organisationId: ORG,
    cafeId: CAFE,
    entityType: 'LEAVE_REQUEST',
    entityId: leaveId,
    requestingUserId: 'ST-0001',
    actionRequired: 'Approve leave',
    amountPaisa: 0,
    status: 'PENDING',
  });
}

describe('P0 WORKFLOW FAULT INJECTION', () => {
  before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());

    const models = [
      Approval,
      LeaveRequest,
      ShiftChangeRequest,
      Attendance,
      AttendanceException,
      SequenceCounter,
      Notification,
      NotificationOutbox,
      AuditEvent,
    ];
    for (const model of models) {
      try { await model.createCollection(); } catch {}
    }
  });

  after(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });

  beforeEach(async () => {
    for (const model of [
      Approval,
      LeaveRequest,
      ShiftChangeRequest,
      Attendance,
      AttendanceException,
      SequenceCounter,
      Notification,
      NotificationOutbox,
      AuditEvent,
    ]) {
      await model.deleteMany({});
    }
  });

  it('P0-FI-001: Approval creation failure rolls back LeaveRequest creation', async () => {
    const originalSave = Approval.prototype.save;
    Approval.prototype.save = async function injectedFailure() {
      const err = new Error('INJECTED_APPROVAL_SAVE_FAILURE');
      err.code = 'INJECTED_APPROVAL_SAVE_FAILURE';
      throw err;
    };

    try {
      const { error } = await invoke(leaveController.applyLeave, {
        auth: STAFF_AUTH,
        body: {
          cafeId: CAFE,
          leaveType: 'CASUAL',
          startDate: '2026-10-01',
          endDate: '2026-10-01',
          durationUnit: 'FULL_DAY',
          reason: 'Atomicity test',
        },
        correlationId: 'FI-LEAVE-CREATE',
        method: 'POST',
        originalUrl: '/api/v1/leave/requests',
      });

      assert.ok(error, 'Injected approval failure must propagate');
      assert.equal(await LeaveRequest.countDocuments({}), 0, 'Leave request must roll back');
      assert.equal(await Approval.countDocuments({}), 0, 'Approval must not exist');
    } finally {
      Approval.prototype.save = originalSave;
    }
  });

  it('P0-FI-002: underlying entity failure rolls back approval decision', async () => {
    await seedLeaveApproval();

    const originalSave = LeaveRequest.prototype.save;
    LeaveRequest.prototype.save = async function injectedFailure() {
      if (!this.isNew) {
        const err = new Error('INJECTED_LEAVE_UPDATE_FAILURE');
        err.code = 'INJECTED_LEAVE_UPDATE_FAILURE';
        throw err;
      }
      return originalSave.apply(this, arguments);
    };

    try {
      const { error } = await invoke(approvalController.decideApproval, {
        auth: MASTER_AUTH,
        params: { approvalId: 'APP-10001' },
        body: { decision: 'APPROVED', reason: 'Atomicity test' },
        correlationId: 'FI-DECIDE-ROLLBACK',
        method: 'POST',
        originalUrl: '/api/v1/approvals/APP-10001/decide',
      });

      assert.ok(error, 'Injected entity failure must propagate');
      const approval = await Approval.findOne({ approvalId: 'APP-10001' }).lean();
      const leave = await LeaveRequest.findOne({ leaveId: 'LR-20260927-001' }).lean();
      assert.equal(approval.status, 'PENDING');
      assert.equal(leave.status, 'PENDING');
    } finally {
      LeaveRequest.prototype.save = originalSave;
    }
  });

  it('P0-FI-003: missing target record leaves Approval PENDING', async () => {
    await Approval.create({
      approvalId: 'APP-10002',
      organisationId: ORG,
      cafeId: CAFE,
      entityType: 'LEAVE_REQUEST',
      entityId: 'LR-20260927-999',
      requestingUserId: 'ST-0001',
      actionRequired: 'Approve missing leave',
      status: 'PENDING',
    });

    const { error } = await invoke(approvalController.decideApproval, {
      auth: MASTER_AUTH,
      params: { approvalId: 'APP-10002' },
      body: { decision: 'APPROVED', reason: 'Missing target test' },
      correlationId: 'FI-MISSING-TARGET',
      method: 'POST',
      originalUrl: '/api/v1/approvals/APP-10002/decide',
    });

    assert.ok(error);
    assert.equal(error.code, 'APPROVAL_TARGET_NOT_FOUND');
    const approval = await Approval.findOne({ approvalId: 'APP-10002' }).lean();
    assert.equal(approval.status, 'PENDING');
  });

  it('P0-FI-004: concurrent double-decision produces exactly one committed outcome', async () => {
    await ShiftChangeRequest.create({
      requestId: 'SCR-2026-0001',
      organisationId: ORG,
      employeeUserId: 'ST-0001',
      employeeName: 'Test Staff',
      cafeId: CAFE,
      requestedDate: '2026-10-02',
      currentShift: 'MORNING',
      requestedShift: 'EVENING',
      reason: 'Concurrency fixture',
      status: 'SUBMITTED',
    });
    await Approval.create({
      approvalId: 'APP-10003',
      organisationId: ORG,
      cafeId: CAFE,
      entityType: 'SHIFT_CHANGE',
      entityId: 'SCR-2026-0001',
      requestingUserId: 'ST-0001',
      actionRequired: 'Approve shift change',
      status: 'PENDING',
    });

    const makeReq = (decision, correlationId) => ({
      auth: MASTER_AUTH,
      params: { approvalId: 'APP-10003' },
      body: { decision, reason: 'Concurrent decision test' },
      correlationId,
      method: 'POST',
      originalUrl: '/api/v1/approvals/APP-10003/decide',
    });

    const [a, b] = await Promise.all([
      invoke(approvalController.decideApproval, makeReq('APPROVED', 'FI-CONCURRENT-A')),
      invoke(approvalController.decideApproval, makeReq('REJECTED', 'FI-CONCURRENT-B')),
    ]);

    const successful = [a, b].filter((r) => !r.error && r.res.statusCode === 200);
    const rejected = [a, b].filter((r) => r.error);
    assert.equal(successful.length, 1, 'Exactly one decision must commit');
    assert.equal(rejected.length, 1, 'The racing decision must be rejected');

    const approval = await Approval.findOne({ approvalId: 'APP-10003' }).lean();
    const shift = await ShiftChangeRequest.findOne({ requestId: 'SCR-2026-0001' }).lean();
    assert.ok(['APPROVED', 'REJECTED'].includes(approval.status));
    assert.equal(shift.status, approval.status);
  });

  it('P0-FI-005: transient transaction error is retried and commits once', async () => {
    await seedLeaveApproval({ approvalId: 'APP-10004', leaveId: 'LR-20260927-004' });

    const originalSave = LeaveRequest.prototype.save;
    let attempts = 0;
    LeaveRequest.prototype.save = async function transientOnce() {
      if (!this.isNew && attempts++ === 0) {
        const err = new Error('INJECTED_TRANSIENT_TRANSACTION_ERROR');
        err.hasErrorLabel = (label) => label === 'TransientTransactionError';
        throw err;
      }
      return originalSave.apply(this, arguments);
    };

    try {
      const { res, error } = await invoke(approvalController.decideApproval, {
        auth: MASTER_AUTH,
        params: { approvalId: 'APP-10004' },
        body: { decision: 'REJECTED', reason: 'Transient retry test' },
        correlationId: 'FI-TRANSIENT',
        method: 'POST',
        originalUrl: '/api/v1/approvals/APP-10004/decide',
      });

      assert.equal(error, null);
      assert.equal(res.statusCode, 200);
      assert.ok(attempts >= 2, 'Transaction callback should be retried');
      const approval = await Approval.findOne({ approvalId: 'APP-10004' }).lean();
      const leave = await LeaveRequest.findOne({ leaveId: 'LR-20260927-004' }).lean();
      assert.equal(approval.status, 'REJECTED');
      assert.equal(leave.status, 'REJECTED');
    } finally {
      LeaveRequest.prototype.save = originalSave;
    }
  });
});
