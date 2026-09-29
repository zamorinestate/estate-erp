'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PosOrderService } = require('../src/services/posOrderService');
const { PrintJob } = require('../src/models/PrintJob');
const { Bill } = require('../src/models/Bill');
const { OperatorSession } = require('../src/models/OperatorSession');
const auditService = require('../src/services/auditService');

const deviceContextPath = path.join(__dirname, '..', 'src', 'middleware', 'deviceContext.js');
const posRoutesPath = path.join(__dirname, '..', 'src', 'routes', 'posRoutes.js');
const servicePath = path.join(__dirname, '..', 'src', 'services', 'posOrderService.js');
const hardwareServicePath = path.join(__dirname, '..', 'src', 'services', 'hardwareBridgeService.js');
const hardwareControllerPath = path.join(__dirname, '..', 'src', 'controllers', 'hardwareController.js');
const hardwareRoutesPath = path.join(__dirname, '..', 'src', 'routes', 'hardwareRoutes.js');
const androidPrintManagerPath = path.join(__dirname, '..', '..', 'Platform', 'Android', 'app', 'src', 'main', 'java', 'com', 'zamorin', 'cafe', 'erp', 'ZamorinPrintManager.kt');
const androidMainPath = path.join(__dirname, '..', '..', 'Platform', 'Android', 'app', 'src', 'main', 'java', 'com', 'zamorin', 'cafe', 'erp', 'MainActivity.kt');
const windowsBridgePath = path.join(__dirname, '..', '..', 'Platform', 'Windows', 'ZamorinCafeERP', 'ZamorinNativeBridge.cs');
const iosBridgePath = path.join(__dirname, '..', '..', 'Platform', 'Apple', 'ios', 'ZamorinCafeERP', 'ZamorinNativeBridge.swift');
const iosControllerPath = path.join(__dirname, '..', '..', 'Platform', 'Apple', 'ios', 'ZamorinCafeERP', 'ViewController.swift');
const macBridgePath = path.join(__dirname, '..', '..', 'Platform', 'Apple', 'macos', 'ZamorinCafeERP', 'ZamorinNativeBridge.swift');
const macControllerPath = path.join(__dirname, '..', '..', 'Platform', 'Apple', 'macos', 'ZamorinCafeERP', 'MainWindowController.swift');

function activeCafeDevice(deviceId = 'DV-ZC0001-POS-01', cafeId = 'ZC-0001') {
  return {
    userId: 'EMP-ZC-1001',
    role: 'STAFF',
    organisationId: 'ORG-ZAMORIN',
    operatorSessionId: 'OPS-REC04C-001',
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

  t.mock.method(OperatorSession, 'findOne', (query) => ({
    lean: async () => (
      query.operatorSessionId === 'OPS-REC04C-001' &&
      query.organisationId === 'ORG-ZAMORIN' &&
      query.cafeId === 'ZC-0001' &&
      query.deviceId === 'DV-ZC0001-POS-01' &&
      query.operatorUserId === 'EMP-ZC-1001' &&
      query.status === 'ACTIVE'
        ? { ...query }
        : null
    ),
  }));

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

  const missingSessionAuth = { ...auth, operatorSessionId: null };
  await assert.rejects(
    () => PosOrderService.acknowledgePrintJob(
      job.printJobId,
      missingSessionAuth,
      { status: 'PRINTED' }
    ),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'ACTIVE_OPERATOR_SESSION_REQUIRED');
      return true;
    }
  );

  const mismatchedSessionAuth = { ...auth, operatorSessionId: 'OPS-WRONG-999' };
  await assert.rejects(
    () => PosOrderService.acknowledgePrintJob(
      job.printJobId,
      mismatchedSessionAuth,
      { status: 'PRINTED' }
    ),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'OPERATOR_SESSION_DEVICE_MISMATCH');
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

test('REC-04C — manual drawer API is truthful, café-scoped, and device-bound', () => {
  const service = fs.readFileSync(hardwareServicePath, 'utf8');
  const controller = fs.readFileSync(hardwareControllerPath, 'utf8');
  const routes = fs.readFileSync(hardwareRoutesPath, 'utf8');

  assert.match(service, /DRAWER_KICK_PREPARED/);
  assert.doesNotMatch(service, /DRAWER_KICK_TRIGGERED/);
  assert.match(service, /CROSS_CAFE_RESOURCE_DENIED/);
  assert.match(service, /CAFE_OWNED_DEVICE_REQUIRED/);
  assert.match(service, /status:\s*'PREPARED'/);
  assert.match(service, /dispatched:\s*false/);
  assert.match(service, /acknowledged:\s*false/);

  assert.match(controller, /Physical drawer opening is not yet acknowledged/);
  assert.doesNotMatch(controller, /pulse emitted/);

  const authIndex = routes.indexOf('router.use(authenticate)');
  const deviceIndex = routes.indexOf('router.use(attachDeviceContext)');
  assert.ok(deviceIndex > authIndex, 'Hardware routes must attach canonical device context after authentication');
  assert.doesNotMatch(
    routes,
    /allowedRoles:\s*\['MASTER',\s*'OWNER',\s*'CAFE_ADMIN',\s*'STAFF'\][\s\S]{0,100}?triggerDrawerKick/,
    'Owner must not have operational cash-drawer authority'
  );
});

test('REC-04C — native print shells never equate dialog/spool acceptance with physical completion', () => {
  const androidPrintManager = fs.readFileSync(androidPrintManagerPath, 'utf8');
  const androidMain = fs.readFileSync(androidMainPath, 'utf8');
  const windowsBridge = fs.readFileSync(windowsBridgePath, 'utf8');
  const iosBridge = fs.readFileSync(iosBridgePath, 'utf8');
  const iosController = fs.readFileSync(iosControllerPath, 'utf8');
  const macBridge = fs.readFileSync(macBridgePath, 'utf8');
  const macController = fs.readFileSync(macControllerPath, 'utf8');

  assert.ok(
    (androidPrintManager.match(/status = "QUEUED"/g) || []).length >= 2,
    'Android WebView and PDF jobs must report queued state after PrintManager.print'
  );
  assert.match(androidMain, /put\("printed", false\)/);
  assert.match(androidMain, /put\("physicalCompletionVerified", false\)/);

  assert.match(windowsBridge, /\["printed"\] = false/);
  assert.match(windowsBridge, /\["physicalCompletionVerified"\] = false/);

  for (const appleBridge of [iosBridge, macBridge]) {
    const start = appleBridge.indexOf('case "PRINT_DOCUMENT", "OPEN_SYSTEM_PRINT":');
    const end = appleBridge.indexOf('\n        case ', start + 1);
    assert.ok(start >= 0 && end > start);
    const printCase = appleBridge.slice(start, end);
    assert.doesNotMatch(
      printCase,
      /buildResponse\(requestId:\s*requestId,\s*success:\s*true/,
      'Apple bridge must not send an immediate success before its print delegate responds'
    );
  }

  assert.match(iosController, /"physicalCompletionVerified": false/);
  assert.match(macController, /let systemCompleted = printOperation\.run\(\)/);
  assert.match(macController, /"physicalCompletionVerified": false/);
  assert.doesNotMatch(
    macController,
    /printOperation\.runModal\([\s\S]{0,250}?success:\s*true/,
    'macOS must not report unconditional success after merely presenting the print operation'
  );
});

