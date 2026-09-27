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
const { Expense } = require('../src/models/Expense');
const { StaffLoanAdvance } = require('../src/models/StaffLoanAdvance');
const { ProfileChangeRequest } = require('../src/models/ProfileChangeRequest');
const { AttendanceCorrectionRequest } = require('../src/models/AttendanceCorrectionRequest');
const { User } = require('../src/models/User');
const { PurchaseOrder } = require('../src/models/PurchaseOrder');

const approvalController = require('../src/controllers/approvalController');
const leaveController = require('../src/controllers/leaveController');
const expenseController = require('../src/controllers/expenseController');
const loanAdvanceController = require('../src/controllers/loanAdvanceController');
const settingsController = require('../src/controllers/settingsController');
const attendanceController = require('../src/modules/attendance/attendanceController');

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
  fullName: 'Test Staff',
  role: 'STAFF',
  assignedCafeIds: [CAFE],
};
const CAFE_ADMIN_AUTH = {
  organisationId: ORG,
  userId: 'AD-0001',
  fullName: 'Test Cafe Admin',
  role: 'CAFE_ADMIN',
  primaryCafeId: CAFE,
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
      Expense,
      StaffLoanAdvance,
      ProfileChangeRequest,
      AttendanceCorrectionRequest,
      User,
      PurchaseOrder,
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
      Expense,
      StaffLoanAdvance,
      ProfileChangeRequest,
      AttendanceCorrectionRequest,
      User,
      PurchaseOrder,
    ]) {
      await model.deleteMany({});
    }

    await User.create({
      userId: 'ST-0001',
      organisationId: ORG,
      name: 'Fault Test Staff',
      email: 'fault-staff@example.test',
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      assignedCafeIds: [CAFE],
      primaryCafeId: CAFE,
      passwordHash: 'not-used',
      createdBy: 'SYSTEM',
    });
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

  it('P0-FI-006: UnknownTransactionCommitResult is retried without duplicating decision effects', async () => {
    await seedLeaveApproval({ approvalId: 'APP-10005', leaveId: 'LR-20260927-005' });

    const ClientSession = mongoose.mongo?.ClientSession;
    assert.ok(ClientSession?.prototype?.commitTransaction, 'MongoDB ClientSession.commitTransaction must be available');

    const originalCommit = ClientSession.prototype.commitTransaction;
    let commitAttempts = 0;

    ClientSession.prototype.commitTransaction = async function commitUnknownOnce() {
      commitAttempts += 1;
      if (commitAttempts === 1) {
        const err = new Error('INJECTED_UNKNOWN_COMMIT_RESULT');
        err.hasErrorLabel = (label) => label === 'UnknownTransactionCommitResult';
        throw err;
      }
      return originalCommit.apply(this, arguments);
    };

    try {
      const { res, error } = await invoke(approvalController.decideApproval, {
        auth: MASTER_AUTH,
        params: { approvalId: 'APP-10005' },
        body: { decision: 'REJECTED', reason: 'Unknown commit retry test' },
        correlationId: 'FI-UNKNOWN-COMMIT',
        method: 'POST',
        originalUrl: '/api/v1/approvals/APP-10005/decide',
      });

      assert.equal(error, null);
      assert.equal(res.statusCode, 200);
      assert.ok(commitAttempts >= 2, 'Commit should be retried after unknown commit result');

      const approval = await Approval.findOne({ approvalId: 'APP-10005' }).lean();
      const leave = await LeaveRequest.findOne({ leaveId: 'LR-20260927-005' }).lean();
      assert.equal(approval.status, 'REJECTED');
      assert.equal(leave.status, 'REJECTED');
      assert.equal(await Approval.countDocuments({ approvalId: 'APP-10005' }), 1);
      assert.equal(await LeaveRequest.countDocuments({ leaveId: 'LR-20260927-005' }), 1);
    } finally {
      ClientSession.prototype.commitTransaction = originalCommit;
    }
  });


  it('P0-FI-007: Expense Approval creation failure rolls back submitted Expense', async () => {
    const originalSave = Approval.prototype.save;
    Approval.prototype.save = async function injectedExpenseApprovalFailure() {
      const err = new Error('INJECTED_EXPENSE_APPROVAL_FAILURE');
      err.code = 'INJECTED_EXPENSE_APPROVAL_FAILURE';
      throw err;
    };

    try {
      const { error } = await invoke(expenseController.createExpense, {
        auth: CAFE_ADMIN_AUTH,
        body: {
          cafeId: CAFE,
          businessDate: '2026-10-03',
          category: 'UTILITIES',
          description: 'Fault injection expense',
          amount: 1250,
          vendorName: 'Fault Test Vendor',
          invoiceNumber: 'FI-EXP-001',
          isDraft: false,
        },
        headers: { 'x-idempotency-key': 'FI-EXPENSE-CREATE-001' },
        correlationId: 'FI-EXPENSE-CREATE',
        method: 'POST',
        originalUrl: '/api/v1/expenses',
      });

      assert.ok(error, 'Injected Approval failure must propagate');
      assert.equal(await Expense.countDocuments({ organisationId: ORG }), 0);
      assert.equal(await Approval.countDocuments({ organisationId: ORG, entityType: 'EXPENSE' }), 0);
    } finally {
      Approval.prototype.save = originalSave;
    }
  });

  it('P0-FI-008: Loan Approval creation failure rolls back StaffLoanAdvance request', async () => {
    const originalSave = Approval.prototype.save;
    Approval.prototype.save = async function injectedLoanApprovalFailure() {
      const err = new Error('INJECTED_LOAN_APPROVAL_FAILURE');
      err.code = 'INJECTED_LOAN_APPROVAL_FAILURE';
      throw err;
    };

    try {
      const { error } = await invoke(loanAdvanceController.requestLoan, {
        auth: STAFF_AUTH,
        body: {
          requestedAmountPaise: 500000,
          loanCategory: 'WELFARE',
          tenureMonths: 10,
          reason: 'Fault injection loan request',
        },
        headers: { 'x-idempotency-key': 'FI-LOAN-CREATE-001' },
        correlationId: 'FI-LOAN-CREATE',
        method: 'POST',
        originalUrl: '/api/v1/loans/request',
      });

      assert.ok(error, 'Injected Approval failure must propagate');
      assert.equal(await StaffLoanAdvance.countDocuments({ organisationId: ORG }), 0);
      assert.equal(await Approval.countDocuments({ organisationId: ORG, entityType: 'LOAN_ADVANCE' }), 0);
    } finally {
      Approval.prototype.save = originalSave;
    }
  });

  it('P0-FI-009: Expense target write failure rolls back Approval decision', async () => {
    const expense = await Expense.create({
      expenseId: 'EX-20261003-0001',
      organisationId: ORG,
      cafeId: CAFE,
      businessDate: '2026-10-03',
      expenseType: 'COMPANY_PAID',
      ownerUserId: 'AD-0001',
      preparerUserId: 'AD-0001',
      category: 'UTILITIES',
      purpose: 'Fault injection',
      description: 'Decision rollback fixture',
      amount: 100,
      amountPaisa: 10000,
      taxPaisa: 0,
      totalPaisa: 10000,
      paymentMethod: 'CASH',
      paymentSource: 'CASH',
      status: 'SUBMITTED',
      createdBy: 'AD-0001',
    });
    await Approval.create({
      approvalId: 'APP-10006',
      organisationId: ORG,
      cafeId: CAFE,
      entityType: 'EXPENSE',
      entityId: expense.expenseId,
      requestingUserId: 'AD-0001',
      actionRequired: 'Approve expense',
      amountPaisa: 10000,
      status: 'PENDING',
    });

    const originalSave = Expense.prototype.save;
    Expense.prototype.save = async function injectedExpenseWriteFailure() {
      if (!this.isNew) {
        const err = new Error('INJECTED_EXPENSE_WRITE_FAILURE');
        err.code = 'INJECTED_EXPENSE_WRITE_FAILURE';
        throw err;
      }
      return originalSave.apply(this, arguments);
    };

    try {
      const { error } = await invoke(approvalController.decideApproval, {
        auth: MASTER_AUTH,
        params: { approvalId: 'APP-10006' },
        body: { decision: 'APPROVED', reason: 'Expense rollback test' },
        correlationId: 'FI-EXPENSE-DECISION',
        method: 'POST',
        originalUrl: '/api/v1/approvals/APP-10006/decide',
      });
      assert.ok(error);

      const approval = await Approval.findOne({ approvalId: 'APP-10006' }).lean();
      const afterExpense = await Expense.findOne({ expenseId: expense.expenseId }).lean();
      assert.equal(approval.status, 'PENDING');
      assert.equal(afterExpense.status, 'SUBMITTED');
    } finally {
      Expense.prototype.save = originalSave;
    }
  });


  it('P0-FI-010: ProfileChangeRequest Approval failure rolls back the profile request', async () => {
    const originalSave = Approval.prototype.save;
    Approval.prototype.save = async function injectedProfileApprovalFailure() {
      const err = new Error('INJECTED_PROFILE_APPROVAL_FAILURE');
      err.code = 'INJECTED_PROFILE_APPROVAL_FAILURE';
      throw err;
    };

    try {
      const { error } = await invoke(settingsController.submitProfileChangeRequest, {
        user: {
          organisationId: ORG,
          userId: 'ST-0001',
          role: 'STAFF',
        },
        auth: {
          organisationId: ORG,
          userId: 'ST-0001',
          role: 'STAFF',
          assignedCafeIds: [CAFE],
        },
        body: {
          requestType: 'LEGAL_NAME',
          title: 'Correct legal name',
          reason: 'Fault injection profile request',
          oldValues: { legalName: 'Old Name' },
          newValues: { legalName: 'New Name' },
        },
        correlationId: 'FI-PROFILE-CREATE',
        method: 'POST',
        originalUrl: '/api/v1/settings/profile/change-request',
      });

      assert.ok(error, 'Injected Approval failure must propagate');
      assert.equal(await ProfileChangeRequest.countDocuments({ organisationId: ORG }), 0);
      assert.equal(await Approval.countDocuments({ organisationId: ORG, entityType: 'PROFILE_CHANGE' }), 0);
    } finally {
      Approval.prototype.save = originalSave;
    }
  });

  it('P0-FI-011: AttendanceCorrection Approval failure rolls back correction request and attendance mutation', async () => {
    const attendance = await Attendance.create({
      attendanceId: 'AT-20261004-001',
      organisationId: ORG,
      cafeId: CAFE,
      userId: 'ST-0001',
      businessDate: '2026-10-04',
      checkInAt: new Date('2026-10-04T04:00:00.000Z'),
      status: 'CHECKED_IN',
      correctionRequired: false,
      createdBy: 'ST-0001',
    });

    const originalSave = Approval.prototype.save;
    Approval.prototype.save = async function injectedAttendanceApprovalFailure() {
      const err = new Error('INJECTED_ATTENDANCE_APPROVAL_FAILURE');
      err.code = 'INJECTED_ATTENDANCE_APPROVAL_FAILURE';
      throw err;
    };

    try {
      const { error } = await invoke(attendanceController.requestStaffCorrection, {
        auth: {
          organisationId: ORG,
          userId: 'ST-0001',
          role: 'STAFF',
          primaryCafeId: CAFE,
          assignedCafeIds: [CAFE],
        },
        body: {
          attendanceId: attendance.attendanceId,
          businessDate: attendance.businessDate,
          issueType: 'MISSED_CHECKOUT',
          requestedCheckOut: '2026-10-04T12:30:00.000Z',
          reason: 'Fault injection attendance correction',
        },
        correlationId: 'FI-ATTENDANCE-CREATE',
        method: 'POST',
        originalUrl: '/api/v1/attendance/corrections',
      });

      assert.ok(error, 'Injected Approval failure must propagate');
      assert.equal(await AttendanceCorrectionRequest.countDocuments({ organisationId: ORG }), 0);
      assert.equal(await Approval.countDocuments({ organisationId: ORG, entityType: 'ATTENDANCE_CORRECTION' }), 0);

      const reloaded = await Attendance.findOne({ attendanceId: attendance.attendanceId }).lean();
      assert.equal(Boolean(reloaded.correctionRequired), false, 'Attendance record mutation must roll back');
    } finally {
      Approval.prototype.save = originalSave;
    }
  });


  it('P0-FI-012: Shift target write failure rolls back Approval decision', async () => {
    await ShiftChangeRequest.create({
      requestId: 'SCR-2026-1201',
      organisationId: ORG,
      employeeUserId: 'ST-0001',
      employeeName: 'Fault Test Staff',
      cafeId: CAFE,
      requestedDate: '2026-10-12',
      currentShift: 'MORNING',
      requestedShift: 'EVENING',
      reason: 'Shift target rollback fixture',
      status: 'SUBMITTED',
    });
    await Approval.create({
      approvalId: 'APP-10120',
      organisationId: ORG,
      cafeId: CAFE,
      entityType: 'SHIFT_CHANGE',
      entityId: 'SCR-2026-1201',
      requestingUserId: 'ST-0001',
      actionRequired: 'Approve shift change',
      status: 'PENDING',
    });

    const originalSave = ShiftChangeRequest.prototype.save;
    ShiftChangeRequest.prototype.save = async function injectedShiftWriteFailure() {
      if (!this.isNew) {
        const err = new Error('INJECTED_SHIFT_TARGET_WRITE_FAILURE');
        err.code = 'INJECTED_SHIFT_TARGET_WRITE_FAILURE';
        throw err;
      }
      return originalSave.apply(this, arguments);
    };

    try {
      const { error } = await invoke(approvalController.decideApproval, {
        auth: MASTER_AUTH,
        params: { approvalId: 'APP-10120' },
        body: { decision: 'APPROVED', reason: 'Shift rollback test' },
        correlationId: 'FI-SHIFT-DECISION',
        method: 'POST',
        originalUrl: '/api/v1/approvals/APP-10120/decide',
      });

      assert.ok(error);
      const approval = await Approval.findOne({ approvalId: 'APP-10120' }).lean();
      const shift = await ShiftChangeRequest.findOne({ requestId: 'SCR-2026-1201' }).lean();
      assert.equal(approval.status, 'PENDING');
      assert.equal(shift.status, 'SUBMITTED');
    } finally {
      ShiftChangeRequest.prototype.save = originalSave;
    }
  });

  it('P0-FI-013: Loan target write failure rolls back Approval decision', async () => {
    await StaffLoanAdvance.create({
      loanAdvanceId: 'LN-2026-1201',
      organisationId: ORG,
      cafeId: CAFE,
      employeeUserId: 'ST-0001',
      employeeName: 'Fault Test Staff',
      requestType: 'LOAN',
      loanCategory: 'WELFARE',
      requestedAmountPaise: 500000,
      tenureMonths: 10,
      requestReason: 'Loan target rollback fixture',
      status: 'SUBMITTED',
      createdByUserId: 'ST-0001',
    });
    await Approval.create({
      approvalId: 'APP-10121',
      organisationId: ORG,
      cafeId: CAFE,
      entityType: 'LOAN_ADVANCE',
      entityId: 'LN-2026-1201',
      requestingUserId: 'ST-0001',
      actionRequired: 'Approve loan',
      amountPaisa: 500000,
      status: 'PENDING',
    });

    const originalSave = StaffLoanAdvance.prototype.save;
    StaffLoanAdvance.prototype.save = async function injectedLoanWriteFailure() {
      if (!this.isNew) {
        const err = new Error('INJECTED_LOAN_TARGET_WRITE_FAILURE');
        err.code = 'INJECTED_LOAN_TARGET_WRITE_FAILURE';
        throw err;
      }
      return originalSave.apply(this, arguments);
    };

    try {
      const { error } = await invoke(approvalController.decideApproval, {
        auth: MASTER_AUTH,
        params: { approvalId: 'APP-10121' },
        body: { decision: 'APPROVED', reason: 'Loan rollback test' },
        correlationId: 'FI-LOAN-DECISION',
        method: 'POST',
        originalUrl: '/api/v1/approvals/APP-10121/decide',
      });

      assert.ok(error);
      const approval = await Approval.findOne({ approvalId: 'APP-10121' }).lean();
      const loan = await StaffLoanAdvance.findOne({ loanAdvanceId: 'LN-2026-1201' }).lean();
      assert.equal(approval.status, 'PENDING');
      assert.equal(loan.status, 'SUBMITTED');
      assert.equal(loan.approvedAt, null);
    } finally {
      StaffLoanAdvance.prototype.save = originalSave;
    }
  });

  it('P0-FI-014: Profile target user write failure rolls back PCR and Approval decision', async () => {
    await ProfileChangeRequest.create({
      requestId: 'PCR-202610-10001',
      organisationId: ORG,
      userId: 'ST-0001',
      requestType: 'CONTACT_UPDATE',
      title: 'Update contact',
      reason: 'Profile decision rollback fixture',
      oldValues: { preferredName: 'Old Name' },
      proposedValues: { preferredName: 'New Name' },
      status: 'SUBMITTED',
    });
    await Approval.create({
      approvalId: 'APP-10122',
      organisationId: ORG,
      cafeId: null,
      entityType: 'PROFILE_CHANGE',
      entityId: 'PCR-202610-10001',
      requestingUserId: 'ST-0001',
      actionRequired: 'Approve profile change',
      status: 'PENDING',
    });

    const originalSave = User.prototype.save;
    User.prototype.save = async function injectedUserWriteFailure() {
      if (!this.isNew) {
        const err = new Error('INJECTED_PROFILE_TARGET_USER_WRITE_FAILURE');
        err.code = 'INJECTED_PROFILE_TARGET_USER_WRITE_FAILURE';
        throw err;
      }
      return originalSave.apply(this, arguments);
    };

    try {
      const { error } = await invoke(approvalController.decideApproval, {
        auth: MASTER_AUTH,
        params: { approvalId: 'APP-10122' },
        body: { decision: 'APPROVED', reason: 'Profile rollback test' },
        correlationId: 'FI-PROFILE-DECISION',
        method: 'POST',
        originalUrl: '/api/v1/approvals/APP-10122/decide',
      });

      assert.ok(error);
      const approval = await Approval.findOne({ approvalId: 'APP-10122' }).lean();
      const pcr = await ProfileChangeRequest.findOne({ requestId: 'PCR-202610-10001' }).lean();
      const user = await User.findOne({ userId: 'ST-0001' }).lean();
      assert.equal(approval.status, 'PENDING');
      assert.equal(pcr.status, 'SUBMITTED');
      assert.equal(user.preferredName || '', '');
    } finally {
      User.prototype.save = originalSave;
    }
  });

  it('P0-FI-015: Attendance target write failure rolls back correction and Approval decision', async () => {
    const attendance = await Attendance.create({
      attendanceId: 'AT-20261013-001',
      organisationId: ORG,
      cafeId: CAFE,
      userId: 'ST-0001',
      businessDate: '2026-10-13',
      checkInAt: new Date('2026-10-13T04:00:00.000Z'),
      status: 'CHECKED_IN',
      correctionRequired: true,
      correctionReason: 'Missed checkout',
      createdBy: 'ST-0001',
    });
    await AttendanceCorrectionRequest.create({
      correctionRequestId: 'ACR-20261013-001',
      requestId: 'ACR-20261013-001',
      organisationId: ORG,
      cafeId: CAFE,
      userId: 'ST-0001',
      submittedBy: 'ST-0001',
      attendanceId: attendance.attendanceId,
      businessDate: '2026-10-13',
      issueType: 'MISSED_CHECK_OUT',
      requestedCheckOutAt: new Date('2026-10-13T12:30:00.000Z'),
      reason: 'Attendance target rollback fixture',
      status: 'PENDING',
    });
    await Approval.create({
      approvalId: 'APP-10123',
      organisationId: ORG,
      cafeId: CAFE,
      entityType: 'ATTENDANCE_CORRECTION',
      entityId: 'ACR-20261013-001',
      requestingUserId: 'ST-0001',
      actionRequired: 'Approve attendance correction',
      status: 'PENDING',
    });

    const originalSave = Attendance.prototype.save;
    Attendance.prototype.save = async function injectedAttendanceTargetFailure() {
      if (!this.isNew) {
        const err = new Error('INJECTED_ATTENDANCE_TARGET_WRITE_FAILURE');
        err.code = 'INJECTED_ATTENDANCE_TARGET_WRITE_FAILURE';
        throw err;
      }
      return originalSave.apply(this, arguments);
    };

    try {
      const { error } = await invoke(approvalController.decideApproval, {
        auth: MASTER_AUTH,
        params: { approvalId: 'APP-10123' },
        body: { decision: 'APPROVED', reason: 'Attendance rollback test' },
        correlationId: 'FI-ATTENDANCE-DECISION',
        method: 'POST',
        originalUrl: '/api/v1/approvals/APP-10123/decide',
      });

      assert.ok(error);
      const approval = await Approval.findOne({ approvalId: 'APP-10123' }).lean();
      const correction = await AttendanceCorrectionRequest.findOne({ requestId: 'ACR-20261013-001' }).lean();
      const reloaded = await Attendance.findOne({ attendanceId: 'AT-20261013-001' }).lean();
      assert.equal(approval.status, 'PENDING');
      assert.equal(correction.status, 'PENDING');
      assert.equal(reloaded.checkOutAt, null);
    } finally {
      Attendance.prototype.save = originalSave;
    }
  });


  it('P0-FI-016: Purchase Order target write failure rolls back Approval decision', async () => {
    await PurchaseOrder.create({
      purchaseOrderId: 'PO-FAULT-1601',
      organisationId: ORG,
      cafeId: CAFE,
      vendorId: 'VEN-FAULT-01',
      vendorNameSnapshot: 'Fault Vendor',
      lineItems: [{
        itemId: 'ITM-FAULT-01',
        itemNameSnapshot: 'Fault Item',
        orderedQuantityBase: 10,
        unitPricePaisa: 1000,
        totalLinePaisa: 10000,
      }],
      subtotalPaisa: 10000,
      taxPaisa: 0,
      totalPaisa: 10000,
      status: 'SUBMITTED',
      createdByUserId: 'AD-0001',
    });
    await Approval.create({
      approvalId: 'APP-10124',
      organisationId: ORG,
      cafeId: CAFE,
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-FAULT-1601',
      requestingUserId: 'AD-0001',
      actionRequired: 'Approve purchase order',
      amountPaisa: 10000,
      status: 'PENDING',
    });

    const originalSave = PurchaseOrder.prototype.save;
    PurchaseOrder.prototype.save = async function injectedPoTargetWriteFailure() {
      if (!this.isNew) {
        const err = new Error('INJECTED_PO_TARGET_WRITE_FAILURE');
        err.code = 'INJECTED_PO_TARGET_WRITE_FAILURE';
        throw err;
      }
      return originalSave.apply(this, arguments);
    };

    try {
      const { error } = await invoke(approvalController.decideApproval, {
        auth: MASTER_AUTH,
        params: { approvalId: 'APP-10124' },
        body: { decision: 'APPROVED', reason: 'PO rollback test' },
        correlationId: 'FI-PO-DECISION',
        method: 'POST',
        originalUrl: '/api/v1/approvals/APP-10124/decide',
      });

      assert.ok(error);
      const approval = await Approval.findOne({ approvalId: 'APP-10124' }).lean();
      const order = await PurchaseOrder.findOne({ purchaseOrderId: 'PO-FAULT-1601' }).lean();
      assert.equal(approval.status, 'PENDING');
      assert.equal(order.status, 'SUBMITTED');
      assert.equal(order.masterApproval?.approvedAt || null, null);
    } finally {
      PurchaseOrder.prototype.save = originalSave;
    }
  });

});
