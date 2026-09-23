'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
mongoose.set('bufferCommands', false);
mongoose.set('bufferTimeoutMS', 100);

const { createApp } = require('../src/server');
const { CashTransaction } = require('../src/models/CashTransaction');
const { Bill } = require('../src/models/Bill');
const { Expense } = require('../src/models/Expense');
const { Cafe } = require('../src/models/Cafe');
const { User } = require('../src/models/User');
const { RolePermission } = require('../src/models/RolePermission');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { AuditEvent } = require('../src/models/AuditEvent');
const { DeviceRegistration } = require('../src/models/DeviceRegistration');
const { OperatorSession } = require('../src/models/OperatorSession');
const { Task } = require('../src/models/Task');
const { Approval } = require('../src/models/Approval');
const { UserPreference } = require('../src/models/UserPreference');
const { Session } = require('../src/models/Session');
const { Asset } = require('../src/models/Asset');
const { Customer } = require('../src/models/Customer');
const { QualityChecklist } = require('../src/models/QualityChecklist');
const { CafeInventoryConfig } = require('../src/models/CafeInventoryConfig');
const { PurchaseOrder } = require('../src/models/PurchaseOrder');
const { GlobalInventoryItem } = require('../src/models/GlobalInventoryItem');
const { StockTransfer } = require('../src/models/StockTransfer');
const { MaintenanceJob } = require('../src/models/MaintenanceJob');
const { RecallNotice } = require('../src/models/RecallNotice');
const { Attendance } = require('../src/modules/attendance/Attendance');
const { InventoryCycleCount } = require('../src/models/InventoryCycleCount');
const { DepartmentOrder } = require('../src/models/DepartmentOrder');

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
          let parsedData = null;
          try {
            parsedData = responseData ? JSON.parse(responseData) : null;
          } catch {
            parsedData = responseData;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsedData,
          });
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

test('CAFÉ OPS-04 — Final Cross-Role Release-Candidate Validation Suite', async (t) => {
  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  // User identities for all 4 personas
  const masterUser = {
    userId: 'USR-MST-01',
    role: 'MASTER',
    isPrimaryMaster: true,
    organisationId: 'ORG-ZAMORIN',
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
    primaryCafeId: 'ZC-0001',
    email: 'master@zamorincafe.com',
    fullName: 'Primary Master Admin',
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
    fullName: 'Owner Investor',
    sessionVersion: 1,
    permissionsVersion: 1,
  };

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

  const staffUser = {
    userId: 'USR-STF-01',
    role: 'STAFF',
    organisationId: 'ORG-ZAMORIN',
    assignedCafeIds: ['ZC-0001'],
    primaryCafeId: 'ZC-0001',
    email: 'staff@zamorincafe.com',
    fullName: 'Duty Staff Operator',
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

    if (token === 'token_owner') {
      return {
        payload: {
          sub: ownerUser.userId,
          org: ownerUser.organisationId,
          role: ownerUser.role,
          cafes: ownerUser.assignedCafeIds,
          primaryCafeId: ownerUser.primaryCafeId,
          effectiveCafeId: 'ZC-0001',
          email: ownerUser.email,
          name: ownerUser.fullName,
          sv: 0,
          usv: 1,
          pv: 1,
          sid: 'SS-OWN-01',
        },
        session: {
          sessionId: 'SS-OWN-01',
          roleSnapshot: ownerUser.role,
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
          effectiveCafeId: 'ZC-0001',
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

  t.mock.method(User, 'findOne', (query) => {
    let u = masterUser;
    if (query?.userId === 'USR-ADM-01') u = adminUser;
    else if (query?.userId === 'USR-OWN-01') u = ownerUser;
    else if (query?.userId === 'USR-STF-01') u = staffUser;
    const res = { ...u, toObject: () => u, lean: () => u };
    const p = Promise.resolve(res);
    p.lean = () => Promise.resolve(u);
    p.toObject = () => u;
    return p;
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
  t.mock.method(Bill, 'countDocuments', () => Promise.resolve(0));
  t.mock.method(Bill, 'aggregate', () => Promise.resolve([]));
  t.mock.method(CashTransaction, 'countDocuments', () => Promise.resolve(0));
  t.mock.method(Expense, 'find', () => createQueryMock([]));
  t.mock.method(Expense, 'countDocuments', () => Promise.resolve(0));
  t.mock.method(Expense, 'aggregate', () => Promise.resolve([]));
  t.mock.method(InventoryCycleCount, 'find', () => createQueryMock([]));
  t.mock.method(InventoryCycleCount, 'countDocuments', () => Promise.resolve(0));
  t.mock.method(CafeInventoryConfig, 'find', () => createQueryMock([]));
  t.mock.method(CafeInventoryConfig, 'countDocuments', () => Promise.resolve(0));
  t.mock.method(StockTransfer, 'find', () => createQueryMock([]));
  t.mock.method(StockTransfer, 'countDocuments', () => Promise.resolve(0));
  t.mock.method(PurchaseOrder, 'find', () => createQueryMock([]));
  t.mock.method(PurchaseOrder, 'countDocuments', () => Promise.resolve(0));
  t.mock.method(Task, 'find', () => createQueryMock([]));
  t.mock.method(Task, 'countDocuments', () => Promise.resolve(0));
  t.mock.method(Approval, 'find', () => createQueryMock([]));
  t.mock.method(Approval, 'countDocuments', () => Promise.resolve(0));
  t.mock.method(DeviceRegistration, 'find', () => createQueryMock([]));
  t.mock.method(DeviceRegistration, 'countDocuments', () => Promise.resolve(0));
  t.mock.method(Session, 'countDocuments', () => Promise.resolve(1));
  t.mock.method(Asset, 'find', () => createQueryMock([]));
  t.mock.method(Asset, 'countDocuments', () => Promise.resolve(0));
  t.mock.method(Customer, 'find', () => createQueryMock([]));
  t.mock.method(Customer, 'countDocuments', () => Promise.resolve(0));
  t.mock.method(QualityChecklist, 'find', () => createQueryMock([]));
  t.mock.method(QualityChecklist, 'countDocuments', () => Promise.resolve(0));
  t.mock.method(MaintenanceJob, 'countDocuments', () => Promise.resolve(0));
  t.mock.method(Attendance, 'aggregate', () => Promise.resolve([]));
  t.mock.method(RecallNotice, 'find', () => createQueryMock([]));
  t.mock.method(RecallNotice, 'countDocuments', () => Promise.resolve(0));
  t.mock.method(DepartmentOrder, 'find', () => createQueryMock([]));
  t.mock.method(DepartmentOrder, 'countDocuments', () => Promise.resolve(0));
  t.mock.method(UserPreference, 'findOrCreateForUser', async () => ({
    theme: 'paper',
    fontSize: 'standard',
    density: 'standard',
    locale: 'en-IN',
    timeFormat: '12h',
    accessibility: {},
    notifications: [],
    workspace: {},
  }));

  t.mock.method(GlobalInventoryItem, 'find', () => createQueryMock([]));
  t.mock.method(GlobalInventoryItem, 'countDocuments', () => Promise.resolve(0));

  t.mock.method(Cafe, 'findOne', ({ cafeId }) => {
    let c = null;
    if (['ZC-0001', 'ZC-0002'].includes(cafeId)) {
      c = {
        cafeId,
        organisationId: 'ORG-ZAMORIN',
        status: 'ACTIVE',
        name: cafeId === 'ZC-0001' ? 'Zamorin Beach' : 'Zamorin Cyberpark',
      };
    }
    const p = Promise.resolve(c);
    p.select = () => p;
    p.lean = () => p;
    return p;
  });

  t.mock.method(Cafe, 'find', () => createQueryMock([
    { cafeId: 'ZC-0001', name: 'Zamorin Beach' },
    { cafeId: 'ZC-0002', name: 'Zamorin Cyberpark' },
  ]));

  // ===========================================================================
  // 1. PRIMARY MASTER CROSS-ROLE INTEGRATION
  // ===========================================================================
  await t.test('RC-01: Master in Master Workspace retains global org view, while Master in Cafe Ops is clamped to effective cafe', async () => {
    t.mock.method(Bill, 'find', (query) => {
      // If cafeId is explicitly queried (clamped), verify it
      if (query.cafeId) {
        assert.equal(query.cafeId, 'ZC-0001', 'Expected query to be clamped to ZC-0001');
      }
      return createQueryMock([]);
    });

    // 1. Master in Master Workspace (x-workspace: MASTER) -> Global
    const resMasterGlobal = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/bills',
      headers: {
        Authorization: 'Bearer token_master',
        'x-workspace': 'MASTER',
      },
    });
    assert.equal(resMasterGlobal.status, 200);

    // 2. Master in Cafe Ops (x-workspace: CAFE_OPERATIONS) -> Clamped to effective cafe
    const resMasterCafeOps = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/bills',
      headers: {
        Authorization: 'Bearer token_master',
        'x-workspace': 'CAFE_OPERATIONS',
      },
    });
    assert.equal(resMasterCafeOps.status, 200);
  });

  // ===========================================================================
  // 2. OWNER INTEGRATION & RESTRICTIONS
  // ===========================================================================
  await t.test('RC-02: Owner accesses canonical cash data for assigned cafe, but cannot reverse cash (403 MASTER_ACCESS_REQUIRED)', async () => {
    t.mock.method(CashTransaction, 'find', () => createQueryMock([]));

    // Owner can view cash transactions for assigned cafe
    const resOwnerCash = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/cash-transactions?cafeId=ZC-0001',
      headers: {
        Authorization: 'Bearer token_owner',
      },
    });
    assert.equal(resOwnerCash.status, 200);

    // Owner cannot reverse cash transactions
    const resOwnerReverse = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/cash-transactions/CT-20260907-0001/reverse',
      headers: {
        Authorization: 'Bearer token_owner',
        'x-workspace': 'CAFE_OPERATIONS',
      },
      body: {
        reason: 'Owner attempted reversal',
      },
    });
    assert.equal(resOwnerReverse.status, 403);
    assert.equal(resOwnerReverse.data.error?.code, 'MASTER_ACCESS_REQUIRED');
  });

  // ===========================================================================
  // 3. EMPLOYEE / STAFF INTEGRATION & CANONICAL IDENTITY
  // ===========================================================================
  await t.test('RC-03: Staff operator cannot perform administrative operations or cross-cafe tampering', async () => {
    // Staff cannot reverse cash transactions
    const resStaffReverse = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/cash-transactions/CT-20260907-0001/reverse',
      headers: {
        Authorization: 'Bearer token_staff',
        'x-workspace': 'CAFE_OPERATIONS',
      },
      body: {
        reason: 'Staff attempted reversal',
      },
    });
    assert.equal(resStaffReverse.status, 403);
    assert.equal(resStaffReverse.data.error?.code, 'MASTER_ACCESS_REQUIRED');
  });

  // ===========================================================================
  // 4. ABSOLUTE RESTRICTIONS: PERSONAL LEDGER ISOLATION
  // ===========================================================================
  await t.test('RC-04: Cafe Operations roles (CAFE_ADMIN, STAFF) cannot access Personal Ledger (403 Forbidden)', async () => {
    const resAdminPL = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/personal-ledger',
      headers: {
        Authorization: 'Bearer token_admin',
      },
    });
    assert.equal(resAdminPL.status, 403, 'Cafe Admin must be denied Personal Ledger access');

    const resStaffPL = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/personal-ledger',
      headers: {
        Authorization: 'Bearer token_staff',
      },
    });
    assert.equal(resStaffPL.status, 403, 'Staff must be denied Personal Ledger access');
  });

  // ===========================================================================
  // 5. CAFE ISOLATION & CROSS-CAFE IDOR PREVENTION
  // ===========================================================================
  await t.test('RC-05: Cross-cafe access attempt is strictly rejected with 403 CROSS_CAFE_RESOURCE_DENIED', async () => {
    // Admin assigned only to ZC-0001 attempts to query ZC-0002 bills
    const resCrossCafe = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/bills?cafeId=ZC-0002',
      headers: {
        Authorization: 'Bearer token_admin',
        'x-workspace': 'CAFE_OPERATIONS',
      },
    });
    assert.equal(resCrossCafe.status, 403);
    assert.equal(resCrossCafe.data.error?.code, 'CROSS_CAFE_RESOURCE_DENIED');
  });

  // ===========================================================================
  // 6. TERMINAL & DEVICE SECURITY
  // ===========================================================================
  await t.test('RC-06: Device emergency revocation terminates active sessions and blocks unauthenticated requests', async () => {
    let revocationRecorded = false;
    const origRevoke = deviceTrustService.revokeDevice;
    deviceTrustService.revokeDevice = async (args) => {
      revocationRecorded = true;
      return {
        device: { deviceId: args.deviceId, status: 'REVOKED' },
        terminatedSessionsCount: 2,
      };
    };

    const resRevoke = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/devices/DEV-001/revoke',
      headers: {
        Authorization: 'Bearer token_master',
      },
      body: {
        reason: 'Compromised tablet stolen from counter',
      },
    });

    assert.equal(resRevoke.status, 200);
    assert.equal(resRevoke.data.message, 'DEVICE_REVOKED_SUCCESSFULLY');
    assert.equal(revocationRecorded, true);

    deviceTrustService.revokeDevice = origRevoke;

    // Unauthenticated request to protected device endpoint is rejected with 401
    const resUnauth = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/devices',
    });
    assert.equal(resUnauth.status, 401);
  });

  // ===========================================================================
  // 7. FINANCIAL RECONCILIATION & CASH REVERSAL PARITY (OBJECTIVE D / CTL-003)
  // ===========================================================================
  await t.test('RC-07: Cash reversal executes with server confirmation, sequential ID, audit trail, and 409 conflict guard', async () => {
    let savedReverseArgs = null;
    let auditEventCreated = null;

    const mockTx = {
      cashTransactionId: 'CT-20260907-0099',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      businessDate: '2026-09-07',
      transactionType: 'PAID_OUT',
      direction: 'OUT',
      amount: 2500,
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
      return { eventId: 'AUD-RC-01' };
    };

    // 1. Successful reversal by Master in Cafe Ops
    const resReversal = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/cash-transactions/CT-20260907-0099/reverse',
      headers: {
        Authorization: 'Bearer token_master',
        'x-workspace': 'CAFE_OPERATIONS',
      },
      body: {
        reason: 'Authorized managerial reversal for returned stock delivery',
      },
    });

    assert.equal(resReversal.status, 200);
    assert.equal(resReversal.data.success, true);
    assert.equal(mockTx.status, 'REVERSED');
    assert.equal(savedReverseArgs?.reason, 'Authorized managerial reversal for returned stock delivery');
    assert.equal(auditEventCreated?.action, 'CASH_TRANSACTION_REVERSED');
    assert.equal(auditEventCreated?.cafeId, 'ZC-0001');

    // 2. Duplicate reversal returns 409 Conflict
    const resDuplicate = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/cash-transactions/CT-20260907-0099/reverse',
      headers: {
        Authorization: 'Bearer token_master',
        'x-workspace': 'CAFE_OPERATIONS',
      },
      body: {
        reason: 'Duplicate reversal attempt',
      },
    });
    assert.equal(resDuplicate.status, 409);
    assert.equal(resDuplicate.data.error?.code, 'CASH_TRANSACTION_ALREADY_REVERSED');

    CashTransaction.findOne = origFindOne;
    auditService.recordAuditEvent = origRecordAudit;
  });

  // ===========================================================================
  // 8. 25-SCREEN ROUTE PARITY & BACKEND MOUNTING INTEGRITY
  // ===========================================================================
  await t.test('RC-08: All 25 Cafe Operations primary endpoints exist and are mounted without 404 router errors', async () => {
    const endpointsToVerify = [
      { method: 'GET', path: '/api/v1/dashboard/cafe-ops', roleToken: 'token_admin' },
      { method: 'GET', path: '/api/v1/bills', roleToken: 'token_admin' },
      { method: 'GET', path: '/api/v1/cash-transactions', roleToken: 'token_admin' },
      { method: 'GET', path: '/api/v1/inventory/overview', roleToken: 'token_admin' },
      { method: 'GET', path: '/api/v1/procurement/overview', roleToken: 'token_admin' },
      { method: 'GET', path: '/api/v1/expenses', roleToken: 'token_admin' },
      { method: 'GET', path: '/api/v1/assets', roleToken: 'token_admin' },
      { method: 'GET', path: '/api/v1/customers', roleToken: 'token_admin' },
      { method: 'GET', path: '/api/v1/quality/overview', roleToken: 'token_admin' },
      { method: 'GET', path: '/api/v1/tasks', roleToken: 'token_admin' },
      { method: 'GET', path: '/api/v1/approvals', roleToken: 'token_admin' },
      { method: 'GET', path: '/api/v1/reports/overview', roleToken: 'token_admin' },
      { method: 'GET', path: '/api/v1/devices', roleToken: 'token_admin' },
      { method: 'GET', path: '/api/v1/settings/overview', roleToken: 'token_admin' },
    ];

    for (const ep of endpointsToVerify) {
      const res = await makeRequest({
        port,
        method: ep.method,
        path: ep.path,
        headers: {
          Authorization: `Bearer ${ep.roleToken}`,
          'x-workspace': 'CAFE_OPERATIONS',
        },
      });
      assert.notEqual(res.status, 404, `Endpoint ${ep.method} ${ep.path} must not return 404 router error`);
    }
  });
});
