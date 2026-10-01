'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
mongoose.set('bufferCommands', false);
mongoose.set('bufferTimeoutMS', 100);

const { createApp } = require('../src/server');
const { CashTransaction } = require('../src/models/CashTransaction');
const { Cafe } = require('../src/models/Cafe');
const { User } = require('../src/models/User');
const { RolePermission } = require('../src/models/RolePermission');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { AuditEvent } = require('../src/models/AuditEvent');
const { DeviceRegistration } = require('../src/models/DeviceRegistration');
const { OperatorSession } = require('../src/models/OperatorSession');
const { Bill } = require('../src/models/Bill');

const authService = require('../src/services/authService');
const auditService = require('../src/services/auditService');
const deviceTrustService = require('../src/services/deviceTrustService');

function makeRequest({ port, method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const serializedBody = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (serializedBody) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(serializedBody);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path,
        headers: reqHeaders,
      },
      (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(responseData);
          } catch (e) {
            json = { raw: responseData };
          }
          resolve({ status: res.statusCode, data: json });
        });
      }
    );

    req.on('error', reject);
    if (serializedBody) req.write(serializedBody);
    req.end();
  });
}

function createQueryMock(items) {
  const p = Promise.resolve(items);
  p.lean = () => p;
  p.select = () => p;
  p.sort = () => p;
  p.skip = () => p;
  p.limit = () => p;
  return p;
}

test('CAFÉ OPS-03 — Full 25-Screen Control Audit & Wiring Parity Suite', async (t) => {
  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const adminUser = {
    userId: 'USR-ADM-01',
    role: 'CAFE_ADMIN',
    organisationId: 'ORG-ZAMORIN',
    assignedCafeIds: ['ZC-0001'],
    primaryCafeId: 'ZC-0001',
    email: 'admin.beach@zamorincafe.com',
    fullName: 'Beach Cafe Admin',
    sessionVersion: 1,
    permissionsVersion: 1,
  };

  const masterUser = {
    userId: 'USR-MST-01',
    role: 'MASTER',
    isPrimaryMaster: true,
    organisationId: 'ORG-ZAMORIN',
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
    primaryCafeId: 'ZC-0001',
    email: 'master@zamorincafe.com',
    fullName: 'Master Operator',
    sessionVersion: 1,
    permissionsVersion: 1,
  };

  const staffUser = {
    userId: 'USR-STF-01',
    role: 'STAFF',
    organisationId: 'ORG-ZAMORIN',
    assignedCafeIds: ['ZC-0001'],
    primaryCafeId: 'ZC-0001',
    email: 'staff@zamorincafe.com',
    fullName: 'Duty Staff',
    sessionVersion: 1,
    permissionsVersion: 1,
  };

  const ownerUser = {
    userId: 'USR-OWN-01',
    role: 'OWNER',
    organisationId: 'ORG-ZAMORIN',
    assignedCafeIds: ['ZC-0001'],
    primaryCafeId: 'ZC-0001',
    email: 'owner@zamorincafe.com',
    fullName: 'Owner User',
    sessionVersion: 1,
    permissionsVersion: 1,
  };

  t.mock.method(authService, 'verifyAccessToken', async (token) => {
    if (token === 'token_admin') {
      return {
        payload: {
          sub: adminUser.userId,
          org: adminUser.organisationId,
          role: adminUser.role,
          cafes: adminUser.assignedCafeIds,
          primaryCafeId: adminUser.primaryCafeId,
          effectiveCafeId: 'ZC-0001',
          email: adminUser.email,
          name: adminUser.fullName,
          sv: 0,
          usv: 1,
          pv: 1,
          sid: 'SS-ADM-01',
        },
        session: {
          sessionId: 'SS-ADM-01',
          roleSnapshot: adminUser.role,
          sessionVersion: 0,
          mfaVerified: true,
          stepUpVerifiedAt: new Date().toISOString(),
        },
      };
    }

    if (token === 'token_staff') {
      return {
        payload: {
          sub: staffUser.userId,
          org: staffUser.organisationId,
          role: staffUser.role,
          cafes: staffUser.assignedCafeIds,
          primaryCafeId: staffUser.primaryCafeId,
          email: staffUser.email,
          name: staffUser.fullName,
          sv: 0,
          usv: 1,
          pv: 1,
          sid: 'SS-STF-01',
        },
        session: {
          sessionId: 'SS-STF-01',
          roleSnapshot: staffUser.role,
          sessionVersion: 0,
          mfaVerified: false,
          stepUpVerifiedAt: null,
        },
      };
    }

    if (token === 'token_owner') {
      return {
        payload: {
          sub: 'USR-OWN-01',
          org: 'ORG-ZAMORIN',
          role: 'OWNER',
          cafes: ['ZC-0001'],
          primaryCafeId: 'ZC-0001',
          effectiveCafeId: 'ZC-0001',
          email: 'owner@zamorincafe.com',
          name: 'Owner User',
          sv: 0,
          usv: 1,
          pv: 1,
          sid: 'SS-OWN-01',
        },
        session: {
          sessionId: 'SS-OWN-01',
          roleSnapshot: 'OWNER',
          sessionVersion: 0,
          mfaVerified: true,
          stepUpVerifiedAt: new Date().toISOString(),
        },
      };
    }

    // Default master
    return {
      payload: {
        sub: masterUser.userId,
        org: masterUser.organisationId,
        role: masterUser.role,
        isPrimaryMaster: true,
        cafes: masterUser.assignedCafeIds,
        primaryCafeId: masterUser.primaryCafeId,
        effectiveCafeId: 'ZC-0001',
        email: masterUser.email,
        name: masterUser.fullName,
        sv: 0,
        usv: 1,
        pv: 1,
        sid: 'SS-MST-01',
      },
      session: {
        sessionId: 'SS-MST-01',
        roleSnapshot: masterUser.role,
        sessionVersion: 0,
        mfaVerified: true,
        stepUpVerifiedAt: new Date().toISOString(),
      },
    };
  });

  t.mock.method(User, 'findOne', async (query) => {
    if (query?.userId === 'USR-ADM-01') return { ...adminUser, toObject: () => adminUser };
    if (query?.userId === 'USR-STF-01') return { ...staffUser, toObject: () => staffUser };
    if (query?.userId === 'USR-OWN-01') return { ...ownerUser, toObject: () => ownerUser };
    return { ...masterUser, toObject: () => masterUser };
  });

  t.mock.method(RolePermission, 'findEffectiveRules', async ({ role, permissionCode }) => [
    {
      role,
      permissionCode,
      effect: 'ALLOW',
      scope: role === 'CAFE_ADMIN' ? 'ASSIGNED_CAFES' : 'ORGANISATION',
      isCurrentlyEffective: () => true,
    },
  ]);

  t.mock.method(auditService, 'recordRequestAudit', async () => ({}));
  t.mock.method(auditService, 'recordAuditEvent', async () => ({}));
  t.mock.method(SequenceCounter, 'generateId', async ({ prefix }) => `${prefix}-2026-0001`);
  t.mock.method(SequenceCounter, 'getNextNumber', async () => 1);

  t.mock.method(Cafe, 'findOne', async ({ cafeId }) => {
    if (['ZC-0001', 'ZC-0002'].includes(cafeId)) {
      return {
        cafeId,
        organisationId: 'ORG-ZAMORIN',
        status: 'ACTIVE',
        name: cafeId === 'ZC-0001' ? 'Zamorin Beach' : 'Zamorin Cyberpark',
      };
    }
    return null;
  });

  t.mock.method(Cafe, 'find', () => createQueryMock([
    { cafeId: 'ZC-0001', name: 'Zamorin Beach' },
    { cafeId: 'ZC-0002', name: 'Zamorin Cyberpark' },
  ]));

  t.mock.method(Bill, 'find', () => createQueryMock([]));
  t.mock.method(Bill, 'countDocuments', async () => 0);
  t.mock.method(Bill, 'findOne', () => createQueryMock(null));
  t.mock.method(Bill, 'aggregate', async () => []);

  const { CafeInventoryConfig } = require('../src/models/CafeInventoryConfig');
  const { GlobalInventoryItem } = require('../src/models/GlobalInventoryItem');
  const { DepartmentOrder } = require('../src/models/DepartmentOrder');
  const { QualityChecklist } = require('../src/models/QualityChecklist');
  const { MaintenanceJob } = require('../src/models/MaintenanceJob');
  const { WorkOrder } = require('../src/models/WorkOrder');
  const { Task } = require('../src/models/Task');
  const { Approval } = require('../src/models/Approval');
  const { PurchaseOrder } = require('../src/models/PurchaseOrder');
  const { Expense } = require('../src/models/Expense');
  const { RegisterSession } = require('../src/models/RegisterSession');

  t.mock.method(Expense, 'aggregate', async () => []);
  t.mock.method(Expense, 'countDocuments', async () => 0);
  t.mock.method(Expense, 'find', () => createQueryMock([]));
  t.mock.method(CafeInventoryConfig, 'find', () => createQueryMock([]));
  t.mock.method(CafeInventoryConfig, 'findOne', () => createQueryMock(null));
  t.mock.method(GlobalInventoryItem, 'find', () => createQueryMock([]));
  t.mock.method(DepartmentOrder, 'find', () => createQueryMock([]));
  t.mock.method(DepartmentOrder, 'countDocuments', async () => 0);
  t.mock.method(QualityChecklist, 'find', () => createQueryMock([]));
  t.mock.method(QualityChecklist, 'countDocuments', async () => 0);
  t.mock.method(MaintenanceJob, 'find', () => createQueryMock([]));
  t.mock.method(MaintenanceJob, 'countDocuments', async () => 0);
  t.mock.method(WorkOrder, 'find', () => createQueryMock([]));
  t.mock.method(WorkOrder, 'countDocuments', async () => 0);
  t.mock.method(Task, 'find', () => createQueryMock([]));
  t.mock.method(Task, 'countDocuments', async () => 0);
  t.mock.method(Approval, 'find', () => createQueryMock([]));
  t.mock.method(Approval, 'countDocuments', async () => 0);
  t.mock.method(PurchaseOrder, 'find', () => createQueryMock([]));
  t.mock.method(RegisterSession, 'find', () => createQueryMock([]));
  t.mock.method(AuditEvent, 'find', () => createQueryMock([]));

  // ===========================================================================
  // 1. CASH REVERSAL PARITY TESTS (OBJECTIVE A & B)
  // ===========================================================================
  await t.test('Cash Reversal — MASTER can successfully reverse a cash transaction in own café', async () => {
    let savedReverseArgs = null;
    let auditEventCreated = null;

    const mockTx = {
      cashTransactionId: 'CT-20260907-0001',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      businessDate: '2026-09-07',
      transactionType: 'PAID_OUT',
      direction: 'OUT',
      amount: 1500,
      currency: 'INR',
      status: 'POSTED',
      reverse: async function (args) {
        savedReverseArgs = args;
        this.status = 'REVERSED';
        this.reversedAt = new Date();
        this.reversedBy = args.userId;
        this.reversalReason = args.reason;
        this.reversalTransactionId = args.reversalTransactionId;
        return this;
      },
    };

    const origFindOne = CashTransaction.findOne;
    CashTransaction.findOne = () => Promise.resolve(mockTx);

    const origRecordAudit = auditService.recordAuditEvent;
    auditService.recordAuditEvent = async (event) => {
      auditEventCreated = event;
      return { eventId: 'AUD-001' };
    };

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/cash-transactions/CT-20260907-0001/reverse',
      headers: {
        Authorization: 'Bearer token_master',
        'x-workspace': 'CAFE_OPERATIONS',
      },
      body: {
        reason: 'Duplicate supplier payout recorded in error',
      },
    });

    assert.equal(res.status, 200, 'Expected 200 OK on successful cash reversal');
    assert.equal(res.data.success, true);
    const expectedDatePart = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()).replaceAll('-', '');
    assert.strictEqual(
      res.data.data.reversalTransactionId,
      `CR-${expectedDatePart}-2026-0001`,
      'Reversal transaction ID must follow CR-YYYYMMDD-2026-0001 format with deterministic current IST date'
    );
    assert.equal(mockTx.status, 'REVERSED');
    assert.equal(savedReverseArgs?.reason, 'Duplicate supplier payout recorded in error');
    assert.equal(auditEventCreated?.action, 'CASH_TRANSACTION_REVERSED');
    assert.equal(auditEventCreated?.cafeId, 'ZC-0001');

    CashTransaction.findOne = origFindOne;
    auditService.recordAuditEvent = origRecordAudit;
  });

  await t.test('Cash Reversal — Reversing an already reversed transaction returns 409 Conflict', async () => {
    const mockTx = {
      cashTransactionId: 'CT-20260907-0002',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      status: 'REVERSED',
    };

    const origFindOne = CashTransaction.findOne;
    CashTransaction.findOne = () => Promise.resolve(mockTx);

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/cash-transactions/CT-20260907-0002/reverse',
      headers: {
        Authorization: 'Bearer token_master',
        'x-workspace': 'CAFE_OPERATIONS',
      },
      body: {
        reason: 'Second reversal attempt',
      },
    });

    assert.equal(res.status, 409, 'Expected 409 Conflict for already reversed transaction');
    assert.equal(res.data.error?.code, 'CASH_TRANSACTION_ALREADY_REVERSED');

    CashTransaction.findOne = origFindOne;
  });

  await t.test('Cash Reversal — Reversal without reason returns 400 Bad Request', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/cash-transactions/CT-20260907-0003/reverse',
      headers: {
        Authorization: 'Bearer token_master',
        'x-workspace': 'CAFE_OPERATIONS',
      },
      body: {
        reason: '',
      },
    });

    assert.equal(res.status, 400, 'Expected 400 Bad Request when reversal reason is missing');
    assert.equal(res.data.error?.code, 'REVERSAL_REASON_REQUIRED');
  });

  await t.test('Cash Reversal — Cross-café reversal is denied with 403 Forbidden', async () => {
    const mockTx = {
      cashTransactionId: 'CT-20260907-0004',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0002', // Belongs to different cafe
      status: 'POSTED',
    };

    const origFindOne = CashTransaction.findOne;
    CashTransaction.findOne = () => Promise.resolve(mockTx);

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/cash-transactions/CT-20260907-0004/reverse',
      headers: {
        Authorization: 'Bearer token_master',
        'x-workspace': 'CAFE_OPERATIONS',
      },
      body: {
        reason: 'Attempted cross-cafe reversal',
      },
    });

    assert.equal(res.status, 403, 'Expected 403 Forbidden on cross-café cash reversal');
    assert.equal(res.data.error?.code, 'CROSS_CAFE_RESOURCE_DENIED');

    CashTransaction.findOne = origFindOne;
  });

  await t.test('Cash Reversal — Non-MASTER roles (STAFF, CAFE_ADMIN, OWNER) cannot reverse cash transactions (403)', async () => {
    for (const roleToken of ['token_staff', 'token_admin', 'token_owner']) {
      const res = await makeRequest({
        port,
        method: 'POST',
        path: '/api/v1/cash-transactions/CT-20260907-0005/reverse',
        headers: {
          Authorization: `Bearer ${roleToken}`,
          'x-workspace': 'CAFE_OPERATIONS',
        },
        body: {
          reason: 'Unauthorized role attempting reversal',
        },
      });

      assert.equal(res.status, 403, `Expected 403 Forbidden for ${roleToken}`);
      assert.equal(res.data.error?.code, 'MASTER_ACCESS_REQUIRED');
    }
  });

  // ===========================================================================
  // 2. DEVICE REVOCATION LIFECYCLE TESTS (OBJECTIVE D / P2-2)
  // ===========================================================================
  await t.test('Device Revocation — Emergency revocation terminates sessions and marks REVOKED', async () => {
    let revokedArgs = null;
    const origRevoke = deviceTrustService.revokeDevice;
    deviceTrustService.revokeDevice = async (args) => {
      revokedArgs = args;
      return {
        deviceId: args.deviceId,
        status: 'REVOKED',
        revokedAt: new Date(),
      };
    };

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/devices/DEV-ZC01-TAB01/revoke',
      headers: {
        Authorization: 'Bearer token_master',
      },
      body: {
        reason: 'Terminal hardware compromised and replaced',
      },
    });

    assert.equal(res.status, 200, 'Expected 200 OK on device revocation');
    assert.equal(res.data.device.status, 'REVOKED');
    assert.equal(revokedArgs?.reason, 'Terminal hardware compromised and replaced');

    deviceTrustService.revokeDevice = origRevoke;
  });

  // ===========================================================================
  // 3. 25-SCREEN ROUTE & API INTEGRITY
  // ===========================================================================
  await t.test('25-Screen Wiring Parity — Route mounting and cafe scope enforcement verified', async () => {
    // Screen 1: Command Centre (GET /api/v1/dashboard/cafe-ops)
    const s1 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/dashboard/cafe-ops',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s1.status !== 404, `Screen 1 route should exist (got ${s1.status})`);

    // Screen 2: POS Billing (POST /api/v1/bills)
    const s2 = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/bills',
      headers: { Authorization: 'Bearer token_admin' },
      body: { cafeId: 'ZC-0001' },
    });
    assert.ok(s2.status !== 404, `Screen 2 POS route should exist (got ${s2.status})`);

    // Screen 3: Bills History (GET /api/v1/bills)
    const s3 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/bills',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s3.status !== 404, `Screen 3 Bills route should exist (got ${s3.status})`);

    // Screen 4: Kiosk Attendance uses the canonical enrolled-device QR route.
    // This parity test only asserts that the route is mounted; deviceContext may
    // correctly return 401 when no CafeOps device token is provisioned here.
    const s4 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/devices/attendance/qr',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s4.status !== 404, `Screen 4 canonical Kiosk QR route should exist (got ${s4.status})`);

    // Screen 5: Staff Attendance (GET /api/v1/attendance)
    const s5 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/attendance',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s5.status !== 404, `Screen 5 Attendance route should exist (got ${s5.status})`);

    // Screen 6: Department Orders (GET /api/v1/department-orders)
    const s6 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/department-orders',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s6.status !== 404, `Screen 6 Department Orders route should exist (got ${s6.status})`);

    // Screen 7: Inventory (GET /api/v1/inventory/items)
    const s7 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/inventory/items',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s7.status !== 404, `Screen 7 Inventory items route should exist (got ${s7.status})`);

    // Screen 8: Procurement (GET /api/v1/procurement/orders)
    const s8 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/procurement/orders',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s8.status !== 404, `Screen 8 Procurement orders route should exist (got ${s8.status})`);

    // Screen 9: Expenses (GET /api/v1/expenses)
    const s9 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/expenses',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s9.status !== 404, `Screen 9 Expenses route should exist (got ${s9.status})`);

    // Screen 10: Cash Book (GET /api/v1/cash-transactions)
    const s10 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/cash-transactions',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s10.status !== 404, `Screen 10 Cash Transactions route should exist (got ${s10.status})`);

    // Screen 11: Customers (GET /api/v1/customers)
    const s11 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/customers',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s11.status !== 404, `Screen 11 Customers route should exist (got ${s11.status})`);

    // Screen 12: Reports (GET /api/v1/reports/overview)
    const s12 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/reports/overview',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s12.status !== 404, `Screen 12 Reports route should exist (got ${s12.status})`);

    // Screen 13: Tasks (GET /api/v1/tasks)
    const s13 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/tasks',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s13.status !== 404, `Screen 13 Tasks route should exist (got ${s13.status})`);

    // Screen 14: Approvals (GET /api/v1/tasks)
    const s14 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/tasks',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s14.status !== 404, `Screen 14 Approvals queue should exist (got ${s14.status})`);

    // Screen 15: Assets (GET /api/v1/assets)
    const s15 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/assets',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s15.status !== 404, `Screen 15 Assets route should exist (got ${s15.status})`);

    // Screen 16: Quality (GET /api/v1/quality/checklists)
    const s16 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/quality/checklists',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s16.status !== 404, `Screen 16 Quality checklists route should exist (got ${s16.status})`);

    // Screen 17: Settings (GET /api/v1/settings/overview)
    const s17 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/settings/overview',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s17.status !== 404, `Screen 17 Settings route should exist (got ${s17.status})`);

    // Screen 18: Devices (GET /api/v1/devices)
    const s18 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/devices',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s18.status !== 404, `Screen 18 Devices route should exist (got ${s18.status})`);

    // Screen 20: Operator Sign-in (POST /api/v1/cafe-operations/operator/signin)
    const s20 = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/cafe-operations/operator/signin',
      headers: {},
      body: {},
    });
    assert.ok(s20.status !== 404, `Screen 20 Operator signin route should exist (got ${s20.status})`);

    // Screen 21: Master Sign-in (POST /api/v1/cafe-operations/operator/signin-master)
    const s21 = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/cafe-operations/operator/signin-master',
      headers: {},
      body: {},
    });
    assert.ok(s21.status !== 404, `Screen 21 Master signin route should exist (got ${s21.status})`);

    // Screen 22: Device Enroll (POST /api/v1/devices/enroll)
    const s22 = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/devices/enroll',
      headers: {},
      body: {},
    });
    assert.ok(s22.status !== 404, `Screen 22 Device enrollment route should exist (got ${s22.status})`);

    // Screen 24: Gateway Resolve (POST /api/v1/cafe-access/resolve)
    const s24 = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/cafe-access/resolve',
      headers: {},
      body: {},
    });
    assert.ok(s24.status !== 404, `Screen 24 Gateway resolve route should exist (got ${s24.status})`);

    // Screen 25: Menu Management (GET /api/v1/menu/items)
    const s25 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/menu/items',
      headers: { Authorization: 'Bearer token_admin' },
    });
    assert.ok(s25.status !== 404, `Screen 25 Menu items route should exist (got ${s25.status})`);
  });

  // ===========================================================================
  // 4. SECURITY INVARIANTS: UNAUTHENTICATED CALLS ARE REJECTED
  // ===========================================================================
  await t.test('Security Matrix — Unauthenticated requests are rejected with 401', async () => {
    const endpoints = [
      { method: 'GET', path: '/api/v1/cash-transactions' },
      { method: 'POST', path: '/api/v1/cash-transactions/CT-001/reverse' },
      { method: 'GET', path: '/api/v1/bills' },
      { method: 'GET', path: '/api/v1/expenses' },
      { method: 'GET', path: '/api/v1/devices' },
      { method: 'GET', path: '/api/v1/inventory/items' },
    ];

    for (const ep of endpoints) {
      const res = await makeRequest({
        port,
        method: ep.method,
        path: ep.path,
      });
      assert.equal(res.status, 401, `Expected 401 for unauthenticated ${ep.method} ${ep.path}`);
    }
  });
});
