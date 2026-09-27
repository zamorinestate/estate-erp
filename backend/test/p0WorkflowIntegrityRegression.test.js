'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const approvalController = read('backend/src/controllers/approvalController.js');
const leaveController = read('backend/src/controllers/leaveController.js');
const shiftController = read('backend/src/controllers/shiftChangeController.js');
const payrollQueryController = read('backend/src/controllers/payrollQueryController.js');
const loanAdvanceController = read('backend/src/controllers/loanAdvanceController.js');
const settingsController = read('backend/src/controllers/settingsController.js');
const attendanceController = read('backend/src/modules/attendance/attendanceController.js');
const companyIdentityService = read('backend/src/services/companyIdentityService.js');
const notificationService = read('backend/src/services/NotificationService.js');
const outboxWorker = read('backend/src/services/notificationOutboxWorker.js');
const outboxModel = read('backend/src/models/NotificationOutbox.js');
const serverSource = read('backend/src/server.js');

test('P0-WF-001: approval notification outbox is queued, never pre-marked SENT', () => {
  const helperStart = approvalController.indexOf('async function sendNotificationAndOutbox');
  const helperEnd = approvalController.indexOf('function normalizeId', helperStart);
  const helper = approvalController.slice(helperStart, helperEnd);
  assert.ok(helper.includes("status: 'QUEUED'"));
  assert.equal(helper.includes("status: 'SENT'"), false);
  assert.equal(helper.includes('sentAt: new Date()'), false);
});

test('P0-WF-002: other direct notification outbox producers do not claim SENT before provider delivery', () => {
  for (const source of [payrollQueryController, loanAdvanceController, settingsController, attendanceController]) {
    assert.equal(/NotificationOutbox\.create\([\s\S]{0,1600}status:\s*'SENT'/.test(source), false);
  }
});

test('P0-WF-003: leave request and approval are committed in one MongoDB transaction', () => {
  const start = leaveController.indexOf('const applyLeave');
  const end = leaveController.indexOf('// 6. GET /api/v1/leave/requests', start);
  const block = leaveController.slice(start, end);
  assert.ok(block.includes('session.withTransaction'));
  assert.ok(block.includes('await leave.save({ session })'));
  assert.ok(block.includes('await approval.save({ session })'));
  assert.ok(block.includes("sequenceKey: 'APPROVAL'"));
  assert.equal(block.includes("|| 'ZC-0001'"), false);
});

test('P0-WF-004: leave submission rejects client cafe outside authenticated assignments', () => {
  const start = leaveController.indexOf('const applyLeave');
  const end = leaveController.indexOf('// 6. GET /api/v1/leave/requests', start);
  const block = leaveController.slice(start, end);
  assert.ok(block.includes('CAFE_ACCESS_DENIED'));
  assert.ok(block.includes('CAFE_SCOPE_REQUIRED'));
});

test('P0-WF-005: shift-change request and approval are committed atomically', () => {
  const start = shiftController.indexOf('const createSelfShiftChangeRequest');
  const end = shiftController.indexOf('// 2.', start);
  const block = shiftController.slice(start, end);
  assert.ok(block.includes('session.withTransaction'));
  assert.ok(block.includes('await shiftRequest.save({ session })'));
  assert.ok(block.includes('await approval.save({ session })'));
  assert.ok(block.includes("sequenceKey: 'SHIFT_CHANGE_REQUEST'"));
  assert.equal(block.includes("|| 'ZC-0001'"), false);
});

test('P0-WF-006: shift-change cafe scope is fail-closed', () => {
  const start = shiftController.indexOf('const createSelfShiftChangeRequest');
  const end = shiftController.indexOf('// 2.', start);
  const block = shiftController.slice(start, end);
  assert.ok(block.includes('CAFE_ACCESS_DENIED'));
  assert.ok(block.includes('CAFE_SCOPE_REQUIRED'));
});


test('P0-WF-007: company identity lookup is strictly organisation scoped', () => {
  assert.ok(companyIdentityService.includes("organisationId: normalizedOrganisationId"));
  assert.ok(companyIdentityService.includes("status: 'CURRENT'"));
  assert.equal(companyIdentityService.includes("$or: [{ organisationId }, { status: 'CURRENT' }]"), false);
});

test('P0-WF-008: outlet branding lookup cannot resolve a cafe from another organisation', () => {
  assert.ok(companyIdentityService.includes("Cafe.findOne({ organisationId: normalizedOrganisationId, cafeId })"));
  assert.equal(companyIdentityService.includes("Cafe.findOne({ cafeId })"), false);
  assert.ok(companyIdentityService.includes("'ORGANISATION_REQUIRED'"));
});


test('P0-WF-009: approval decision and target entity use canonical retryable transaction wrapper', () => {
  const start = approvalController.indexOf('const decideApproval');
  const block = approvalController.slice(start);
  assert.ok(approvalController.includes("executeTransactionWithRetry"));
  assert.ok(block.includes('executeTransactionWithRetry'));
  assert.ok(block.includes('applyApprovalEntityDecision'));
  assert.ok(block.includes("maxTransientRetries: 5"));
  assert.ok(block.includes("maxCommitRetries: 3"));
  assert.equal(block.includes('[EXPENSE_SYNC_WARN]'), false);
  assert.equal(block.includes('[SHIFT_SYNC_WARN]'), false);
  assert.equal(block.includes('[PROFILE_SYNC_WARN]'), false);
});

test('P0-WF-010: profile change request persists proposed values and Approval atomically', () => {
  assert.ok(settingsController.includes('session.withTransaction'));
  assert.ok(settingsController.includes('proposedValues: newValues || {}'));
  assert.ok(settingsController.includes('await pcr.save({ session })'));
  assert.ok(settingsController.includes('await approval.save({ session })'));
  assert.equal(settingsController.includes('APP-344807-'), false);
});

test('P0-WF-011: attendance correction create/review paths are transactionally coupled to Approval', () => {
  const createStart = attendanceController.indexOf('const requestStaffCorrection = asyncHandler');
  const reviewStart = attendanceController.indexOf('const reviewStaffCorrection = asyncHandler');
  const createBlock = attendanceController.slice(createStart, reviewStart);
  const reviewEnd = attendanceController.indexOf('// 16.', reviewStart);
  const reviewBlock = attendanceController.slice(reviewStart, reviewEnd);

  assert.ok(createBlock.includes('session.withTransaction'));
  assert.ok(createBlock.includes('await approval.save({ session })'));
  assert.equal(createBlock.includes("|| 'ZC-0001'"), false);
  assert.ok(createBlock.includes("'CAFE_SCOPE_REQUIRED'"));

  assert.ok(reviewBlock.includes('session.withTransaction'));
  assert.ok(reviewBlock.includes("'PRIMARY_MASTER_AUTHORITY_REQUIRED'"));
  assert.ok(reviewBlock.includes('await approval.save({ session })'));
  assert.equal(reviewBlock.includes('[ATTENDANCE_APPROVAL_SYNC_WARN]'), false);
});

test('P0-WF-012: outbox has durable lease fields and atomic claim processing', () => {
  assert.ok(outboxModel.includes('lockedBy'));
  assert.ok(outboxModel.includes('lockedUntil'));
  assert.ok(outboxModel.includes('leaseVersion'));
  assert.ok(notificationService.includes('findOneAndUpdate'));
  assert.ok(notificationService.includes("status: 'PROCESSING'"));
  assert.ok(notificationService.includes('processDueOutbox'));
  assert.ok(notificationService.includes('quarantineExpiredProcessingLeases'));
});

test('P0-WF-013: production server lifecycle starts and stops the outbox worker', () => {
  assert.ok(serverSource.includes('startNotificationOutboxWorker();'));
  assert.ok(serverSource.includes('await stopNotificationOutboxWorker();'));
  assert.ok(outboxWorker.includes("JOB-NOTIFICATION-OUTBOX-DISPATCH"));
  assert.ok(outboxWorker.includes('setInterval'));
});
