'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');

const { createApp } = require('../src/server');
const { Bill } = require('../src/models/Bill');
const { Cafe } = require('../src/models/Cafe');
const { RegisterSession } = require('../src/models/RegisterSession');
const { AuditEvent } = require('../src/models/AuditEvent');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { RolePermission } = require('../src/models/RolePermission');
const { User } = require('../src/models/User');
const { Expense } = require('../src/models/Expense');
const { Approval } = require('../src/models/Approval');
const { DeviceRegistration } = require('../src/models/DeviceRegistration');
const { OperatorSession } = require('../src/models/OperatorSession');

const authService = require('../src/services/authService');
const auditService = require('../src/services/auditService');
const deviceService = require('../src/cafe-operations/services/deviceService');
const operatorSessionService = require('../src/services/operatorSessionService');
const { getRepositories } = require('../src/cafe-operations/repositories');

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
  p.session = () => p;
  return p;
}

test('CAFÉ OPS-01 — P0 Remediation Suite (P0-1, P0-2, P0-3)', async (t) => {
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
  const primaryMasterUser = {
    userId: 'USR-MST-001',
    role: 'MASTER',
    isPrimaryMaster: true,
    organisationId: 'ORG-ZAMORIN',
    email: 'master@zamorincafe.com',
    fullName: 'Zamorin Master',
    sessionVersion: 1,
    permissionsVersion: 1,
  };

  const cafeAdminUser = {
    userId: 'USR-ADM-001',
    role: 'CAFE_ADMIN',
    isPrimaryMaster: false,
    organisationId: 'ORG-ZAMORIN',
    assignedCafeIds: ['ZC-0001'],
    email: 'admin@zamorincafe.com',
    fullName: 'Cafe Admin One',
    sessionVersion: 1,
    permissionsVersion: 1,
  };

  t.mock.method(authService, 'verifyAccessToken', async (token) => {
    if (token === 'token_admin') {
      return {
        payload: {
          sub: cafeAdminUser.userId,
          org: cafeAdminUser.organisationId,
          role: cafeAdminUser.role,
          isPrimaryMaster: false,
          cafes: cafeAdminUser.assignedCafeIds,
          sv: 0,
          usv: 1,
          pv: 1,
          sid: 'SS-ADM-001',
        },
        session: {
          sessionId: 'SS-ADM-001',
          roleSnapshot: cafeAdminUser.role,
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
        isPrimaryMaster: primaryMasterUser.isPrimaryMaster,
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
    if (query?.userId === 'USR-ADM-001') {
      return { ...cafeAdminUser, toObject: () => cafeAdminUser };
    }
    return { ...primaryMasterUser, toObject: () => primaryMasterUser };
  });

  t.mock.method(RolePermission, 'findEffectiveRules', async ({ role, permissionCode }) => [
    {
      role,
      permissionCode,
      effect: 'ALLOW',
      scope: 'ORGANISATION',
      isCurrentlyEffective: () => true,
    },
  ]);

  t.mock.method(auditService, 'recordRequestAudit', async () => ({}));
  t.mock.method(auditService, 'recordAuditEvent', async () => ({}));
  t.mock.method(SequenceCounter, 'generateId', async ({ prefix }) => `${prefix}-0001`);
  t.mock.method(SequenceCounter, 'getNextNumber', async () => 1);

  // In-memory mock bills
  const mockBills = [
    {
      billId: 'BILL-ZC-0001-001',
      invoiceNumber: 'INV-ZC-0001-001',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      businessDate: '2026-09-06',
      totalPaisa: 50000,
      paymentStatus: 'PAID',
      status: 'COMPLETED',
      lineItems: [{ itemNameSnapshot: 'Filter Coffee', quantity: 2, lineTotalPaisa: 50000 }],
      createdAt: new Date(),
    },
    {
      billId: 'BILL-ZC-0002-001',
      invoiceNumber: 'INV-ZC-0002-001',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0002',
      businessDate: '2026-09-06',
      totalPaisa: 75000,
      paymentStatus: 'PAID',
      status: 'COMPLETED',
      lineItems: [{ itemNameSnapshot: 'Cold Brew', quantity: 3, lineTotalPaisa: 75000 }],
      createdAt: new Date(),
    },
  ];

  t.mock.method(Bill, 'find', (filter = {}) => {
    let results = [...mockBills];
    if (filter.organisationId) {
      results = results.filter((b) => b.organisationId === filter.organisationId);
    }
    if (filter.cafeId) {
      if (typeof filter.cafeId === 'string') {
        results = results.filter((b) => b.cafeId === filter.cafeId);
      } else if (filter.cafeId.$in) {
        results = results.filter((b) => filter.cafeId.$in.includes(b.cafeId));
      }
    }
    return createQueryMock(results);
  });

  t.mock.method(Bill, 'countDocuments', async (filter = {}) => {
    let results = [...mockBills];
    if (filter.organisationId) {
      results = results.filter((b) => b.organisationId === filter.organisationId);
    }
    if (filter.cafeId) {
      if (typeof filter.cafeId === 'string') {
        results = results.filter((b) => b.cafeId === filter.cafeId);
      } else if (filter.cafeId.$in) {
        results = results.filter((b) => filter.cafeId.$in.includes(b.cafeId));
      }
    }
    return results.length;
  });

  t.mock.method(Bill, 'findOne', (filter = {}) => {
    const item = mockBills.find((b) => {
      if (filter.billId && b.billId !== filter.billId) return false;
      if (filter.organisationId && b.organisationId !== filter.organisationId) return false;
      if (filter.cafeId && b.cafeId !== filter.cafeId) return false;
      if (filter.$or) {
        const matches = filter.$or.some((c) => (c.billId && c.billId === b.billId) || (c.invoiceNumber && c.invoiceNumber === b.invoiceNumber));
        if (!matches) return false;
      }
      return true;
    }) || null;
    return createQueryMock(item);
  });

  t.mock.method(Cafe, 'find', () => createQueryMock([
    { cafeId: 'ZC-0001', name: 'Zamorin Flagship' },
    { cafeId: 'ZC-0002', name: 'Zamorin Express' },
  ]));

  t.mock.method(RegisterSession, 'find', () => createQueryMock([]));

  // ══════════════════════════════════════════════════════════════════════════
  // GATE 2 / P0-1: MASTER WORKSPACE vs CAFÉ OPERATIONS SCOPE ENFORCEMENT
  // ══════════════════════════════════════════════════════════════════════════

  await t.test('P0-1.1: MASTER in Master Workspace receives organization-wide bill listing', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/bills',
      headers: {
        Authorization: 'Bearer token_master',
      },
    });

    assert.equal(res.status, 200, 'Master in master workspace succeeds with 200');
    assert.equal(res.data.data.bills.length, 2, 'Master in master workspace sees bills from all cafes');
  });

  await t.test('P0-1.2: MASTER in Café Operations (ZC-0001) is strictly clamped to ZC-0001 bills', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/bills',
      headers: {
        Authorization: 'Bearer token_master',
        'x-workspace-mode': 'CAFE_OPERATIONS',
        'x-cafe-id': 'ZC-0001',
      },
    });

    assert.equal(res.status, 200, 'Master in Cafe Operations succeeds with 200');
    assert.equal(res.data.data.bills.length, 1, 'Master in Cafe Operations sees only 1 bill');
    assert.equal(res.data.data.bills[0].cafeId, 'ZC-0001', 'Bill belongs strictly to ZC-0001');
  });

  await t.test('P0-1.3: MASTER in Café Operations attempting cross-café query tampering is REJECTED with 403', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/bills?cafeId=ZC-0002',
      headers: {
        Authorization: 'Bearer token_master',
        'x-workspace-mode': 'CAFE_OPERATIONS',
        'x-cafe-id': 'ZC-0001',
      },
    });

    assert.equal(res.status, 403, 'Cross-cafe query tampering must return 403');
    assert.equal(res.data.error.code, 'CROSS_CAFE_RESOURCE_DENIED', 'Error code must be CROSS_CAFE_RESOURCE_DENIED');
  });

  await t.test('P0-1.4: MASTER in Café Operations accessing foreign bill detail via assertCafeAccess is REJECTED with 403 or 404 anti-enumeration', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/bills/BILL-ZC-0002-001',
      headers: {
        Authorization: 'Bearer token_master',
        'x-workspace-mode': 'CAFE_OPERATIONS',
        'x-cafe-id': 'ZC-0001',
      },
    });

    assert.ok([403, 404].includes(res.status), 'Foreign bill detail lookup in Cafe Operations must return 403 or 404');
  });

  await t.test('P0-1.5: CAFE_ADMIN at ZC-0001 cannot query ZC-0002 bills', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/bills?cafeId=ZC-0002',
      headers: {
        Authorization: 'Bearer token_admin',
      },
    });

    assert.equal(res.status, 403, 'CAFE_ADMIN cross-cafe access must return 403');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GATE 3 / P0-2: DEVICE ENROLMENT & OPERATOR SESSION CONSOLIDATION
  // ══════════════════════════════════════════════════════════════════════════

  await t.test('P0-2.1: deviceService.enrollDevice synchronizes to canonical DeviceRegistration', async () => {
    let savedRegDoc = null;
    t.mock.method(DeviceRegistration, 'findOneAndUpdate', async (filter, update) => {
      savedRegDoc = { ...update, save: async function () { return this; } };
      return savedRegDoc;
    });

    const repos = getRepositories();
    t.mock.method(repos.enrollmentTokens, 'findByHash', async () => ({
      id: 'TOK-001',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 86400000),
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      cafeDisplayName: 'Zamorin Flagship',
      intendedDisplayName: 'Billing Terminal 1',
    }));
    t.mock.method(repos.enrollmentTokens, 'consumeIfPending', async (id, usage) => ({
      id,
      status: 'USED',
      usedAt: usage.usedAt,
      usedByDeviceId: usage.usedByDeviceId,
    }));
    t.mock.method(repos.devices, 'create', async (dev) => ({ ...dev, id: 'DEV-POS-0099' }));

    const { device } = await deviceService.enrollDevice({
      enrollmentCodePlain: 'ENROLL-123456',
      displayName: 'Billing Terminal 1',
    });

    assert.equal(device.id, 'DEV-POS-0099');
    assert.ok(savedRegDoc, 'DeviceRegistration document must be created');
    assert.equal(savedRegDoc.deviceId, 'DEV-POS-0099');
    assert.equal(savedRegDoc.assignedCafeId, 'ZC-0001');
    assert.equal(savedRegDoc.platform, 'WEB_POS');
    assert.equal(savedRegDoc.status, 'ACTIVE');
  });

  await t.test('P0-2.2: Device revocation terminates live OperatorSession and blocks new sign-ins', async () => {
    let sessionTerminated = false;
    t.mock.method(OperatorSession, 'updateMany', async (filter) => {
      if (filter.deviceId === 'DEV-POS-0099') {
        sessionTerminated = true;
      }
      return { modifiedCount: 1 };
    });

    let updatedRegStatus = null;
    t.mock.method(DeviceRegistration, 'updateMany', async (filter, update) => {
      updatedRegStatus = update.status;
      return { modifiedCount: 1 };
    });

    const repos = getRepositories();
    t.mock.method(repos.devices, 'update', async (id, patch) => ({
      id,
      cafeId: 'ZC-0001',
      organisationId: 'ORG-ZAMORIN',
      ...patch,
    }));

    await deviceService.transitionLifecycle('DEV-POS-0099', 'REVOKED', {
      reason: 'Security decommissioning',
      actorEmployeeId: 'USR-MST-001',
    });

    assert.equal(sessionTerminated, true, 'Active operator sessions must be immediately terminated');
    assert.equal(updatedRegStatus, 'REVOKED', 'DeviceRegistration must be marked REVOKED');

    // Attempting operator sign-in on revoked device fails
    t.mock.method(DeviceRegistration, 'findOne', async () => ({
      deviceId: 'DEV-POS-0099',
      status: 'REVOKED',
    }));

    await assert.rejects(
      async () => {
        await operatorSessionService.signInOperator({
          organisationId: 'ORG-ZAMORIN',
          cafeId: 'ZC-0001',
          deviceId: 'DEV-POS-0099',
          operatorCode: 'OP-01',
          passcode: '1234',
        });
      },
      (err) => err.code === 'DEVICE_NOT_ACTIVE' || err.statusCode === 403,
      'Operator sign-in on revoked device must fail with 403'
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GATE 4 / P0-3: EXPENSES REAL BACKEND INTEGRATION, SCOPING & ZERO FAKE SUCCESS
  // ══════════════════════════════════════════════════════════════════════════

  const mockExpenses = [];
  const mockApprovals = [];

  t.mock.method(mongoose, 'startSession', async () => ({
    async withTransaction(work) {
      return work();
    },
    async endSession() {},
  }));

  t.mock.method(Expense.prototype, 'save', async function saveExpenseFixture() {
    if (!mockExpenses.includes(this)) {
      mockExpenses.push(this);
    }
    return this;
  });

  t.mock.method(Approval.prototype, 'save', async function saveApprovalFixture() {
    if (!mockApprovals.includes(this)) {
      mockApprovals.push(this);
    }
    return this;
  });

  t.mock.method(Expense, 'find', (filter = {}) => {
    let results = [...mockExpenses];
    if (filter.organisationId) {
      results = results.filter((e) => e.organisationId === filter.organisationId);
    }
    if (filter.cafeId) {
      results = results.filter((e) => e.cafeId === filter.cafeId);
    }
    return createQueryMock(results);
  });

  t.mock.method(Expense, 'findOne', (filter = {}) => {
    const found = mockExpenses.find((e) => {
      if (filter.expenseId && e.expenseId !== filter.expenseId) return false;
      if (filter.organisationId && e.organisationId !== filter.organisationId) return false;
      if (filter.cafeId && e.cafeId !== filter.cafeId) return false;
      return true;
    }) || null;
    return createQueryMock(found);
  });

  t.mock.method(Approval, 'findOne', (filter = {}) => {
    const found = mockApprovals.find((a) => {
      if (filter.organisationId && a.organisationId !== filter.organisationId) return false;
      if (filter.entityType && a.entityType !== filter.entityType) return false;
      if (filter.entityId && a.entityId !== filter.entityId) return false;
      return true;
    }) || null;
    return createQueryMock(found);
  });

  t.mock.method(Expense, 'countDocuments', async () => mockExpenses.length);

  await t.test('P0-3.1: POST /api/v1/expenses creates real persisted expense in database', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/expenses',
      headers: {
        Authorization: 'Bearer token_master',
      },
      body: {
        cafeId: 'ZC-0001',
        category: 'COFFEE_RAW_MATERIALS',
        vendorName: 'Blue Tokai',
        amount: 3500.00,
        paymentSource: 'COMPANY_BANK_UPI',
        paymentMethod: 'UPI',
        description: 'Specialty coffee bean restock',
        invoiceNumber: 'INV-BT-9901',
      },
    });

    assert.equal(res.status, 201, 'Expense creation must return 201 Created');
    assert.ok(res.data.expense, 'Response must contain created expense object');
    assert.ok(res.data.expense.expenseId.startsWith('EX-'), 'Must have server-generated expense ID');
    assert.equal(res.data.expense.amount, 3500.00);
    assert.equal(res.data.expense.status, 'SUBMITTED');
    assert.equal(mockExpenses.length, 1, 'Expense must be saved in database');
  });

  await t.test('P0-3.2: MASTER in Café Operations attempting foreign cafe expense creation is REJECTED with 403', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/expenses',
      headers: {
        Authorization: 'Bearer token_master',
        'x-workspace-mode': 'CAFE_OPERATIONS',
        'x-cafe-id': 'ZC-0001',
      },
      body: {
        cafeId: 'ZC-0002', // Tampered foreign cafe
        category: 'UTILITIES',
        vendorName: 'Electricity Board',
        amount: 8000.00,
        description: 'Power bill',
      },
    });

    assert.equal(res.status, 403, 'Cross-cafe expense creation must return 403');
    assert.ok(
      res.data.error?.code === 'CROSS_CAFE_RESOURCE_DENIED' || res.data.error?.code === 'CAFE_ACCESS_DENIED',
      'Error code must indicate denied cross-cafe access'
    );
  });

  await t.test('P0-3.3: POST /api/v1/expenses/:id/decision approves expense in database (no fake success)', async () => {
    const createdExpense = mockExpenses[0];

    const res = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/expenses/${createdExpense.expenseId}/decision`,
      headers: {
        Authorization: 'Bearer token_master',
      },
      body: {
        decision: 'APPROVE',
        reason: 'Authorized under quarterly operating budget',
      },
    });

    assert.equal(res.status, 200, 'Decision approval returns 200');
    assert.equal(res.data.expense.status, 'APPROVED', 'Expense status updated to APPROVED in database');
    assert.ok(res.data.expense.approvalSnapshot, 'Approval snapshot must be recorded');
  });

  await t.test('P0-3.4: Re-approving already APPROVED expense fails with 400 (no fake success)', async () => {
    const createdExpense = mockExpenses[0];

    const res = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/expenses/${createdExpense.expenseId}/decision`,
      headers: {
        Authorization: 'Bearer token_master',
      },
      body: {
        decision: 'APPROVE',
      },
    });

    assert.equal(res.status, 409, 'Invalid state transition must return 409 Conflict');
    assert.ok(
      res.data.error?.code === 'INVALID_STATE' ||
      (res.data.error?.message && res.data.error.message.includes('pending')),
      'Must return INVALID_STATE error'
    );
  });
});
