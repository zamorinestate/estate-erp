'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PosOrderService } = require('../src/services/posOrderService');
const { PrintJob } = require('../src/models/PrintJob');
const { Bill } = require('../src/models/Bill');
const auditService = require('../src/services/auditService');

const deviceContextPath = path.join(__dirname, '..', 'src', 'middleware', 'deviceContext.js');
const posRoutesPath = path.join(__dirname, '..', 'src', 'routes', 'posRoutes.js');
const servicePath = path.join(__dirname, '..', 'src', 'services', 'posOrderService.js');

function activeCafeDevice(deviceId = 'DV-ZC0001-POS-01', cafeId = 'ZC-0001') {
  return {
    userId: 'EMP-ZC-1001',
    role: 'STAFF',
    organisationId: 'ORG-ZAMORIN',
    assignedCafeIds: [cafeId],
    primaryCafeId: cafeId,
    deviceContext: {
      deviceId,
      deviceClass: 'CAFE_OWNED',
      boundCafeId: cafeId,
      status: 'ACTIVE',
      trustLevel: 'ENROLLED',
    },
  };
}

test('REC-04C — device-bound print acknowledgement state machine', async (t) => {
  const job = {
    printJobId: 'PJ-PRT-ACK-001',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    billId: 'BILL-20260929-9901',
    jobType: 'RECEIPT',
    status: 'DISPATCHED',
    requestedAt: new Date('2026-09-29T10:00:00Z'),
    dispatchedDeviceId: 'DV-ZC0001-POS-01',
    drawerKickRequested: true,
    drawerKickStatus: 'DISPATCHED',
    failureCode: null,
    failureReason: null,
    acknowledgedByDeviceId: null,
    acknowledgedAt: null,
    completedAt: null,
    async save() { return this; },
  };

  const bill = {
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    billId: 'BILL-20260929-9901',
    printStatus: 'PRINT_DISPATCHED',
    printJobs: [{
      printJobId: 'PJ-PRT-ACK-001',
      jobType: 'RECEIPT',
      status: 'DISPATCHED',
      dispatchedDeviceId: 'DV-ZC0001-POS-01',
      drawerKickRequested: true,
      drawerKickStatus: 'DISPATCHED',
    }],
    async save() { return this; },
  };

  t.mock.method(PrintJob, 'findOne', async (query) => {
    if (
      query.organisationId === job.organisationId &&
      query.printJobId === job.printJobId
    ) return job;
    return null;
  });

  t.mock.method(Bill, 'findOne', async (query) => {
    if (
      query.organisationId === bill.organisationId &&
      query.cafeId === bill.cafeId &&
      query.billId === bill.billId
    ) return bill;
    return null;
  });

  t.mock.method(auditService, 'recordAuditEvent', async () => ({}));

  const auth = activeCafeDevice();
  const completed = await PosOrderService.acknowledgePrintJob(
    job.printJobId,
    auth,
    { status: 'PRINTED', drawerKickStatus: 'ACKNOWLEDGED' }
  );

  assert.equal(completed.status, 'PRINTED');
  assert.equal(completed.printed, true);
  assert.equal(completed.acknowledgedByDeviceId, 'DV-ZC0001-POS-01');
  assert.equal(completed.drawerKickStatus, 'ACKNOWLEDGED');
  assert.equal(completed.idempotentReplay, false);
  assert.equal(job.status, 'PRINTED');
  assert.equal(bill.printStatus, 'PRINTED');
  assert.equal(bill.printJobs[0].status, 'PRINTED');

  const replay = await PosOrderService.acknowledgePrintJob(
    job.printJobId,
    auth,
    { status: 'PRINTED', drawerKickStatus: 'ACKNOWLEDGED' }
  );
  assert.equal(replay.idempotentReplay, true, 'duplicate same-state device acknowledgement must be idempotent');

  await assert.rejects(
    () => PosOrderService.acknowledgePrintJob(
      job.printJobId,
      auth,
      { status: 'FAILED', failureCode: 'LATE_FAILURE' }
    ),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'PRINT_JOB_TERMINAL_STATE_CONFLICT');
      return true;
    }
  );

  job.status = 'DISPATCHED';
  job.acknowledgedByDeviceId = null;
  job.acknowledgedAt = null;
  job.completedAt = null;

  await assert.rejects(
    () => PosOrderService.acknowledgePrintJob(
      job.printJobId,
      activeCafeDevice('DV-ZC0001-POS-02'),
      { status: 'PRINTED' }
    ),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'PRINT_JOB_DEVICE_MISMATCH');
      return true;
    }
  );

  await assert.rejects(
    () => PosOrderService.acknowledgePrintJob(
      job.printJobId,
      activeCafeDevice('DV-ZC0002-POS-01', 'ZC-0002'),
      { status: 'PRINTED' }
    ),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'CROSS_CAFE_PRINT_ACK_DENIED');
      return true;
    }
  );

  const originalDevice = job.dispatchedDeviceId;
  job.dispatchedDeviceId = null;
  await assert.rejects(
    () => PosOrderService.acknowledgePrintJob(
      job.printJobId,
      auth,
      { status: 'PRINTED' }
    ),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'PRINT_JOB_NOT_DEVICE_BOUND');
      return true;
    }
  );
  job.dispatchedDeviceId = originalDevice;

  job.drawerKickRequested = false;
  job.drawerKickStatus = 'NOT_REQUESTED';
  await assert.rejects(
    () => PosOrderService.acknowledgePrintJob(
      job.printJobId,
      auth,
      { status: 'PRINTED', drawerKickStatus: 'ACKNOWLEDGED' }
    ),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'DRAWER_ACK_NOT_APPLICABLE');
      return true;
    }
  );
});

test('REC-04C — device context lookup is organisation-bound and works for STAFF without privilege elevation', () => {
  const source = fs.readFileSync(deviceContextPath, 'utf8');

  assert.match(source, /organisationId:\s*req\.auth\.organisationId/);
  assert.doesNotMatch(source, /req\.auth\.role\s*!==\s*['"]STAFF['"]/);
  assert.match(source, /derivePrivilegeProfile\(\s*req\.auth\.role/);
});

test('REC-04C — acknowledgement endpoint is authenticated and device-context protected by POS router middleware', () => {
  const routes = fs.readFileSync(posRoutesPath, 'utf8');

  const authIndex = routes.indexOf('router.use(authenticate)');
  const deviceIndex = routes.indexOf('router.use(attachDeviceContext)');
  const ackIndex = routes.indexOf("router.post('/print-jobs/:printJobId/ack'");

  assert.ok(authIndex >= 0);
  assert.ok(deviceIndex > authIndex);
  assert.ok(ackIndex > deviceIndex);
  assert.match(routes, /acknowledgePrintJob/);
});

test('REC-04C — only original sale dispatch can request a drawer kick', () => {
  const source = fs.readFileSync(servicePath, 'utf8');

  assert.match(source, /triggerDrawerKick:\s*options\.allowDrawerKick === true && hasCashTender\(billData\)/);
  assert.equal(
    (source.match(/allowDrawerKick:\s*true/g) || []).length,
    1,
    'Exactly one service path may opt into a cash-drawer kick'
  );
  assert.ok(
    (source.match(/allowDrawerKick:\s*false/g) || []).length >= 2,
    'PRINT and REPRINT must explicitly suppress drawer kick'
  );
});
