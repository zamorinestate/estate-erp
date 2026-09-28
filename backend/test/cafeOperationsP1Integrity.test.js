'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/server');
const { Bill } = require('../src/models/Bill');
const { Expense } = require('../src/models/Expense');
const { Cafe } = require('../src/models/Cafe');
const { User } = require('../src/models/User');
const { RolePermission } = require('../src/models/RolePermission');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { AuditEvent } = require('../src/models/AuditEvent');
const { Asset } = require('../src/models/Asset');
const { WorkOrder } = require('../src/models/WorkOrder');
const { MaintenanceJob } = require('../src/models/MaintenanceJob');
const { Customer } = require('../src/models/Customer');
const { InventoryCycleCount } = require('../src/models/InventoryCycleCount');
const { CafeInventoryConfig } = require('../src/models/CafeInventoryConfig');
const { StockMovement } = require('../src/models/StockMovement');
const { PurchaseOrder } = require('../src/models/PurchaseOrder');
const { RewardDefinition } = require('../src/models/RewardDefinition');
const { DepartmentOrder } = require('../src/models/DepartmentOrder');
const { QualityChecklist } = require('../src/models/QualityChecklist');
const { Task } = require('../src/models/Task');
const { LoyaltyLedger } = require('../src/models/LoyaltyLedger');
const { DeviceRegistration } = require('../src/models/DeviceRegistration');

const authService = require('../src/services/authService');
const auditService = require('../src/services/auditService');

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

test('CAFÉ OPS-02 — P1 Functional Integrity & Reliability Suite (P1-1 to P1-6)', async (t) => {
  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = server.address().port;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  // Test users
  const multiCafeAdminUser = {
    userId: 'USR-ADM-MULTI',
    role: 'CAFE_ADMIN',
    organisationId: 'ORG-ZAMORIN',
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
    primaryCafeId: 'ZC-0001',
    email: 'admin.multi@zamorincafe.com',
    fullName: 'Multi-Cafe Admin',
    sessionVersion: 1,
    permissionsVersion: 1,
  };

  const singleCafeAdminUser = {
    userId: 'USR-ADM-SINGLE',
    role: 'CAFE_ADMIN',
    organisationId: 'ORG-ZAMORIN',
    assignedCafeIds: ['ZC-0001'],
    primaryCafeId: 'ZC-0001',
    email: 'admin.single@zamorincafe.com',
    fullName: 'Single Cafe Admin',
    sessionVersion: 1,
    permissionsVersion: 1,
  };

  const primaryMasterUser = {
    userId: 'USR-MST-001',
    role: 'MASTER',
    isPrimaryMaster: true,
    organisationId: 'ORG-ZAMORIN',
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
    email: 'master@zamorincafe.com',
    fullName: 'Zamorin Master',
    sessionVersion: 1,
    permissionsVersion: 1,
  };

  t.mock.method(authService, 'verifyAccessToken', async (token) => {
    if (token === 'token_admin_multi') {
      return {
        payload: {
          sub: multiCafeAdminUser.userId,
          org: multiCafeAdminUser.organisationId,
          role: multiCafeAdminUser.role,
          cafes: multiCafeAdminUser.assignedCafeIds,
          primaryCafeId: multiCafeAdminUser.primaryCafeId,
          email: multiCafeAdminUser.email,
          name: multiCafeAdminUser.fullName,
          sv: 0,
          usv: 1,
          pv: 1,
          sid: 'SS-ADM-MULTI',
        },
        session: {
          sessionId: 'SS-ADM-MULTI',
          roleSnapshot: multiCafeAdminUser.role,
          sessionVersion: 0,
          mfaVerified: true,
          stepUpVerifiedAt: new Date().toISOString(),
        },
      };
    }

    if (token === 'token_admin_single') {
      return {
        payload: {
          sub: singleCafeAdminUser.userId,
          org: singleCafeAdminUser.organisationId,
          role: singleCafeAdminUser.role,
          cafes: singleCafeAdminUser.assignedCafeIds,
          primaryCafeId: singleCafeAdminUser.primaryCafeId,
          email: singleCafeAdminUser.email,
          name: singleCafeAdminUser.fullName,
          sv: 0,
          usv: 1,
          pv: 1,
          sid: 'SS-ADM-SINGLE',
        },
        session: {
          sessionId: 'SS-ADM-SINGLE',
          roleSnapshot: singleCafeAdminUser.role,
          sessionVersion: 0,
          mfaVerified: true,
          stepUpVerifiedAt: new Date().toISOString(),
        },
      };
    }

    return {
      payload: {
        sub: primaryMasterUser.userId,
        org: primaryMasterUser.organisationId,
        role: primaryMasterUser.role,
        isPrimaryMaster: true,
        cafes: primaryMasterUser.assignedCafeIds,
        email: primaryMasterUser.email,
        name: primaryMasterUser.fullName,
        sv: 0,
        usv: 1,
        pv: 1,
        sid: 'SS-MST-001',
      },
      session: {
        sessionId: 'SS-MST-001',
        roleSnapshot: primaryMasterUser.role,
        sessionVersion: 0,
        mfaVerified: true,
        stepUpVerifiedAt: new Date().toISOString(),
      },
    };
  });

  t.mock.method(User, 'findOne', async (query) => {
    if (query?.userId === 'USR-ADM-MULTI') return { ...multiCafeAdminUser, toObject: () => multiCafeAdminUser };
    if (query?.userId === 'USR-ADM-SINGLE') return { ...singleCafeAdminUser, toObject: () => singleCafeAdminUser };
    return { ...primaryMasterUser, toObject: () => primaryMasterUser };
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

  // Default mock behavior for dashboard models
  t.mock.method(Cafe, 'findOne', (query) => createQueryMock({
    cafeId: query?.cafeId || 'ZC-0001',
    organisationId: 'ORG-ZAMORIN',
    name: `Zamorin Cafe ${query?.cafeId || 'ZC-0001'}`,
    city: 'Calicut',
    address: 'Beach Road',
    phone: '+91 9876543210',
    status: 'ACTIVE',
    operatingStatus: 'OPEN',
  }));

  let Attendance;
  try {
    ({ Attendance } = require('../src/modules/attendance/Attendance'));
    if (Attendance) {
      t.mock.method(Attendance, 'aggregate', async () => []);
    }
  } catch {}

  const { GlobalInventoryItem } = require('../src/models/GlobalInventoryItem');
  t.mock.method(GlobalInventoryItem, 'find', () => createQueryMock([]));
  t.mock.method(CafeInventoryConfig, 'find', () => createQueryMock([]));
  t.mock.method(CafeInventoryConfig, 'findOne', async () => ({
    currentQuantityBase: 10,
    availableQuantityBase: 10,
    save: async function () { return this; },
  }));
  t.mock.method(StockMovement, 'create', async (doc) => doc);
  t.mock.method(DepartmentOrder, 'countDocuments', async () => 0);
  t.mock.method(QualityChecklist, 'countDocuments', async () => 0);
  t.mock.method(WorkOrder, 'countDocuments', async () => 0);
  t.mock.method(MaintenanceJob, 'countDocuments', async () => 0);
  t.mock.method(Task, 'countDocuments', async () => 0);
  t.mock.method(Task, 'find', () => createQueryMock([]));
  t.mock.method(AuditEvent, 'find', () => createQueryMock([]));
  t.mock.method(PurchaseOrder, 'find', () => createQueryMock([]));
  t.mock.method(Expense, 'aggregate', async () => []);
  t.mock.method(Expense, 'countDocuments', async () => 0);
  LoyaltyLedger.prototype.save = async function () { return this; };

  // Setup headers
  const multiAdminHeaders = {
    Authorization: 'Bearer token_admin_multi',
    'x-workspace': 'CAFE_OPERATIONS',
  };

  const singleAdminHeaders = {
    Authorization: 'Bearer token_admin_single',
    'x-workspace': 'CAFE_OPERATIONS',
  };

  const masterCafeOpsHeaders = {
    Authorization: 'Bearer token_master',
    'x-workspace': 'CAFE_OPERATIONS',
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // P1-1: COMMAND CENTRE / DASHBOARD CAFÉ CONTEXT
  // ═══════════════════════════════════════════════════════════════════════════

  await t.test('P1-1.1: Multi-cafe admin can select secondary assigned cafe (ZC-0002) without primaryCafeId restriction', async () => {
    t.mock.method(Bill, 'aggregate', async (pipeline) => {
      const matchStage = pipeline.find((s) => s.$match)?.$match || {};
      assert.equal(matchStage.cafeId, 'ZC-0002');
      assert.equal(matchStage.organisationId, 'ORG-ZAMORIN');
      if (pipeline.some((s) => s.$project?.hourIST)) {
        return [{ _id: 12, salesPaisa: 120000, billsCount: 4 }];
      }
      return [{ _id: null, totalSalesPaisa: 120000, totalOrders: 4 }];
    });

    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/dashboard/cafe-ops?cafeId=ZC-0002',
      headers: multiAdminHeaders,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.cafeId, 'ZC-0002');
  });

  await t.test('P1-1.2: Admin attempting to query unassigned cafe returns 403 CROSS_CAFE_RESOURCE_DENIED', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/dashboard/cafe-ops?cafeId=ZC-9999',
      headers: singleAdminHeaders,
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.error.code, 'CROSS_CAFE_RESOURCE_DENIED');
  });

  await t.test('P1-1.3: Primary Master in Café Operations workspace is clamped to effective cafe', async () => {
    t.mock.method(Bill, 'aggregate', async (pipeline) => {
      const matchStage = pipeline.find((s) => s.$match)?.$match || {};
      assert.equal(matchStage.cafeId, 'ZC-0001');
      if (pipeline.some((s) => s.$project?.hourIST)) {
        return [{ _id: 12, salesPaisa: 50000, billsCount: 2 }];
      }
      return [{ _id: null, totalSalesPaisa: 50000, totalOrders: 2 }];
    });

    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/dashboard/cafe-ops?cafeId=ZC-0001',
      headers: masterCafeOpsHeaders,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.cafeId, 'ZC-0001');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P1-2: PROCUREMENT API BODY WRAPPING & CONTRACTS
  // ═══════════════════════════════════════════════════════════════════════════

  await t.test('P1-2.1: Procurement order rejects malformed wrapped body ({ body: payload }) with 400', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/procurement/orders',
      headers: multiAdminHeaders,
      body: {
        body: {
          vendorId: 'VND-001',
          cafeId: 'ZC-0001',
          lines: [{ itemId: 'ITM-001', quantity: 10, unitPricePaisa: 5000 }],
        },
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.data.error.code, 'MALFORMED_REQUEST_BODY');
  });

  await t.test('P1-2.2: Procurement order rejects cross-cafe creation with 403', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/procurement/orders',
      headers: singleAdminHeaders,
      body: {
        vendorId: 'VND-001',
        cafeId: 'ZC-0002', // Single admin only has ZC-0001
        lines: [{ itemId: 'ITM-001', quantity: 10, unitPricePaisa: 5000 }],
      },
    });

    assert.equal(res.status, 403);
    assert.ok(['CROSS_CAFE_RESOURCE_DENIED', 'CAFE_ACCESS_DENIED'].includes(res.data?.error?.code));
  });

  await t.test('P1-2.3: 3-way matching endpoint GET /procurement/matching resolves with 200', async () => {
    t.mock.method(PurchaseOrder, 'find', () => createQueryMock([]));
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/procurement/matching?cafeId=ZC-0001',
      headers: multiAdminHeaders,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P1-3: INVENTORY FAKE SUCCESS & ACCESS CONTROLS
  // ═══════════════════════════════════════════════════════════════════════════

  await t.test('P1-3.1: CAFE_ADMIN can approve cycle count for authorized cafe', async () => {
    const mockCount = {
      countId: 'CNT-2026-0001',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      status: 'SUBMITTED',
      items: [{ itemId: 'ITEM-COFFEE-01', countedQty: 10, varianceQty: 0 }],
      save: async function () {
        this.status = 'APPROVED';
        return this;
      },
    };

    t.mock.method(InventoryCycleCount, 'findOne', async (query) => {
      if (query?.countId === 'CNT-2026-0001') return mockCount;
      return null;
    });

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/inventory/counts/CNT-2026-0001/approve',
      headers: multiAdminHeaders,
      body: { remarks: 'Store manager verified' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.count.status, 'APPROVED');
  });

  await t.test('P1-3.2: CAFE_ADMIN cannot approve cycle count for unauthorized cafe', async () => {
    const otherCafeCount = {
      countId: 'CNT-2026-0002',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0002', // Single admin only has ZC-0001
      status: 'SUBMITTED',
      items: [],
    };

    t.mock.method(InventoryCycleCount, 'findOne', async (query) => {
      if (query?.countId === 'CNT-2026-0002') return otherCafeCount;
      return null;
    });

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/inventory/counts/CNT-2026-0002/approve',
      headers: singleAdminHeaders,
      body: { remarks: 'Attempt cross cafe approve' },
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.error.code, 'CROSS_CAFE_RESOURCE_DENIED');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P1-4: ASSETS API ROUTE INTEGRATION (ZERO 404s)
  // ═══════════════════════════════════════════════════════════════════════════

  await t.test('P1-4.1: POST /api/v1/assets/inspections resolves with 201 (Not 404)', async () => {
    t.mock.method(Asset, 'findOne', async () => ({
      assetId: 'AST-0001',
      cafeId: 'ZC-0001',
      organisationId: 'ORG-ZAMORIN',
      status: 'OPERATIONAL',
      serviceHistory: [],
      save: async function () { return this; },
    }));

    t.mock.method(MaintenanceJob, 'create', async (data) => ({
      ...data,
      save: async function () { return this; },
    }));

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/inspections',
      headers: multiAdminHeaders,
      body: {
        assetId: 'AST-0001',
        cafeId: 'ZC-0001',
        checklist: [{ item: 'Grinder burr check', passed: true }],
        notes: 'Operational check passed',
      },
    });

    assert.notEqual(res.status, 404);
    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.asset.assetId, 'AST-0001');
  });

  await t.test('P1-4.2: POST /api/v1/assets/work-orders/:id/resolve resolves with 200 (Not 404)', async () => {
    const mockWo = {
      workOrderId: 'WO-001',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      status: 'OPEN',
      save: async function () { return this; },
    };
    t.mock.method(WorkOrder, 'findOne', async () => mockWo);

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/work-orders/WO-001/resolve',
      headers: multiAdminHeaders,
      body: {
        status: 'COMPLETED',
        costPaisa: 450000,
        completionNotes: 'Completed maintenance repair',
      },
    });

    assert.notEqual(res.status, 404);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P1-5: CUSTOMERS API ROUTE INTEGRATION (ZERO 404s)
  // ═══════════════════════════════════════════════════════════════════════════

  await t.test('P1-5.1: POST /api/v1/customers/:id/points/adjust resolves with 200 (Not 404)', async () => {
    t.mock.method(Customer, 'findOne', async () => ({
      customerId: 'CUST-001',
      organisationId: 'ORG-ZAMORIN',
      pointsBalance: 500,
      loyaltyProgram: {
        tier: 'GOLD',
        pointsBalance: 500,
        tierStatus: 'ACTIVE',
        history: [],
      },
      auditLog: [],
      save: async function () { return this; },
    }));

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/customers/CUST-001/points/adjust',
      headers: multiAdminHeaders,
      body: {
        points: 100,
        reasonCode: 'PROMOTIONAL',
        note: 'Customer loyalty bonus',
      },
    });

    assert.notEqual(res.status, 404);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.newBalance, 600);
  });

  await t.test('P1-5.2: GET /api/v1/customers/audit/integrity resolves with 200 (Not 404)', async () => {
    t.mock.method(Customer, 'find', () => createQueryMock([]));
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/customers/audit/integrity',
      headers: multiAdminHeaders,
    });

    assert.notEqual(res.status, 404);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.status, 'HEALTHY');
  });

  await t.test('P1-5.3: POST /api/v1/customers/rewards resolves with 201 (Not 404)', async () => {
    t.mock.method(RewardDefinition, 'create', async (data) => ({
      ...data,
      toObject: () => data,
      save: async function () { return this; },
    }));

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/customers/rewards',
      headers: multiAdminHeaders,
      body: {
        name: 'Free Espresso',
        description: 'Redeem 200 points for a free signature espresso',
        pointsCost: 200,
        discountType: 'FREE_ITEM',
      },
    });

    assert.notEqual(res.status, 404);
    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.reward.name, 'Free Espresso');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P1-6: ZURF REPORTS REAL-DATA INTEGRATION & ZERO STATIC DEMO FIGURES
  // ═══════════════════════════════════════════════════════════════════════════

  await t.test('P1-6.1: ZURF XLSX export calculates real figures from live MongoDB aggregations', async () => {
    t.mock.method(Bill, 'aggregate', async (pipeline) => {
      const match = pipeline.find((s) => s.$match)?.$match || {};
      assert.equal(match.cafeId, 'ZC-0001');
      return [
        {
          _id: null,
          totalOrders: 15,
          grossSalesPaisa: 4500000,
          discountPaisa: 500000,
          refundPaisa: 0,
          netSalesPaisa: 4000000,
        },
      ];
    });

    t.mock.method(Expense, 'aggregate', async () => [
      {
        _id: null,
        totalExpensePaisa: 1200000,
      },
    ]);

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/reports/export',
      headers: multiAdminHeaders,
      body: {
        reportId: 'daily-sales',
        format: 'XLSX',
        cafeId: 'ZC-0001',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.xlsxBase64, 'Must return xlsxBase64');
    assert.ok(res.data.data.filename.endsWith('.xlsx'), 'Filename must have .xlsx extension');
    assert.equal(res.data.data.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    // Scope should be Café ZC-0001
    assert.ok(res.data.data.manifest.scope.includes('ZC-0001'));
  });

  await t.test('P1-6.2: ZURF report displays clean empty state when no transactions exist', async () => {
    t.mock.method(Bill, 'aggregate', async () => []);
    t.mock.method(Expense, 'aggregate', async () => []);

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/reports/export',
      headers: multiAdminHeaders,
      body: {
        reportId: 'daily-sales',
        format: 'PDF',
        cafeId: 'ZC-0001',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    // Verified: No transactional data message in HTML output
    assert.ok(res.data.data.html.includes('No transactional data available for the selected period'));
    // Does NOT contain hardcoded demo figure ₹3,84,500.00
    assert.equal(res.data.data.html.includes('₹3,84,500.00'), false);
  });
});
