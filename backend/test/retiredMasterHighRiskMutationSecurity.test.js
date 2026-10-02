'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { voidBill } = require('../src/controllers/billController');
const {
  masterApproveInvoiceAndPostInventory,
  retryFailedInventoryPosting,
  approveBankChangeRequest,
} = require('../src/controllers/vendorController');
const { retireAsset } = require('../src/controllers/assetController');
const { decideOvertime, recordMasterManualAttendance } = require('../src/modules/attendance/attendanceController');

const retiredMaster = Object.freeze({
  userId: 'MU-RETIRED-HIGH-RISK',
  organisationId: 'ORG-ZAMORIN',
  role: 'MASTER',
  isPrimaryMaster: false,
});

function responseStub() {
  return {
    status() { return this; },
    json() { return this; },
  };
}

test('retired non-primary MASTER cannot void a finalized bill', async () => {
  await assert.rejects(
    () => voidBill({
      auth: retiredMaster,
      params: { billId: 'BILL-TEST-001' },
      body: { reason: 'security regression' },
    }, responseStub()),
    (err) => err?.statusCode === 403 && err?.code === 'VOID_FORBIDDEN'
  );
});

test('retired non-primary MASTER cannot approve supplier invoice and inventory posting', async () => {
  await assert.rejects(
    () => masterApproveInvoiceAndPostInventory({
      auth: retiredMaster,
      params: { poId: 'PO-TEST-001' },
      body: {},
    }, responseStub()),
    (err) => err?.statusCode === 403 && err?.code === 'MASTER_APPROVAL_REQUIRED'
  );
});

test('retired non-primary MASTER cannot retry failed inventory posting', async () => {
  await assert.rejects(
    () => retryFailedInventoryPosting({
      auth: retiredMaster,
      params: { poId: 'PO-TEST-001' },
      body: {},
    }, responseStub()),
    (err) => err?.statusCode === 403 && err?.code === 'FORBIDDEN'
  );
});

test('retired non-primary MASTER cannot approve vendor bank-detail changes', async () => {
  await assert.rejects(
    () => approveBankChangeRequest({
      auth: retiredMaster,
      params: { vendorId: 'VEN-TEST-001' },
      body: { decision: 'APPROVE' },
    }, responseStub()),
    (err) => err?.statusCode === 403 && err?.code === 'FORBIDDEN'
  );
});

test('retired non-primary MASTER cannot retire capital assets', async () => {
  await assert.rejects(
    () => retireAsset({
      auth: retiredMaster,
      params: { assetId: 'AST-TEST-001' },
      body: { reason: 'security regression' },
    }, responseStub()),
    (err) => err?.statusCode === 403 && err?.code === 'PRIMARY_MASTER_AUTHORITY_REQUIRED'
  );
});

test('retired non-primary MASTER cannot approve overtime', async () => {
  await assert.rejects(
    () => decideOvertime({
      auth: retiredMaster,
      body: { attendanceId: 'AT-TEST-001', decision: 'APPROVE', approvedMinutes: 60 },
    }, responseStub()),
    (err) => err?.statusCode === 403 && err?.code === 'PRIMARY_MASTER_AUTHORITY_REQUIRED'
  );
});

test('retired non-primary MASTER cannot reject overtime as a final decision', async () => {
  await assert.rejects(
    () => decideOvertime({
      auth: retiredMaster,
      body: { attendanceId: 'AT-TEST-001', decision: 'REJECT' },
    }, responseStub()),
    (err) => err?.statusCode === 403 && err?.code === 'PRIMARY_MASTER_AUTHORITY_REQUIRED'
  );
});

test('retired non-primary MASTER cannot create manual attendance entries', async () => {
  await assert.rejects(
    () => recordMasterManualAttendance({
      auth: retiredMaster,
      body: {
        userId: 'EMP-TEST-001',
        cafeId: 'ZC-0001',
        eventType: 'CHECK_IN',
        reason: 'security regression',
      },
    }, responseStub()),
    (err) => err?.statusCode === 403 && err?.code === 'RETIRED_MASTER_ACCOUNT_DENIED'
  );
});

test('MASTER without explicit Primary-Master attestation is rejected before mutation', async () => {
  const malformedMaster = {
    userId: 'MU-MALFORMED-HIGH-RISK',
    organisationId: 'ORG-ZAMORIN',
    role: 'MASTER',
  };

  await assert.rejects(
    () => voidBill({
      auth: malformedMaster,
      params: { billId: 'BILL-TEST-MALFORMED' },
      body: { reason: 'security regression' },
    }, responseStub()),
    (err) => err?.statusCode === 403 && err?.code === 'VOID_FORBIDDEN'
  );

  await assert.rejects(
    () => recordMasterManualAttendance({
      auth: malformedMaster,
      body: {
        userId: 'EMP-TEST-001',
        cafeId: 'ZC-0001',
        eventType: 'CHECK_IN',
        reason: 'security regression',
      },
    }, responseStub()),
    (err) => err?.statusCode === 403 && err?.code === 'RETIRED_MASTER_ACCOUNT_DENIED'
  );
});
