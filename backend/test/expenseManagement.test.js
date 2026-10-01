'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/server');
const { Expense } = require('../src/models/Expense');
const { ExpensePolicy } = require('../src/models/ExpensePolicy');
const { CorporateCardTransaction } = require('../src/models/CorporateCardTransaction');
const { OperationalAdvance } = require('../src/models/OperationalAdvance');
const { User } = require('../src/models/User');
const { RolePermission } = require('../src/models/RolePermission');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const authService = require('../src/services/authService');

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
          let parsedJson = null;
          try {
            parsedJson = responseData ? JSON.parse(responseData) : null;
          } catch (e) {
            parsedJson = responseData;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedJson,
          });
        });
      }
    );

    req.on('error', reject);
    if (serializedBody) {
      req.write(serializedBody);
    }
    req.end();
  });
}

function createQueryWrapper(resolvedValue) {
  const query = {
    select() { return query; },
    sort() { return query; },
    skip() { return query; },
    limit() { return query; },
    lean() { return Promise.resolve(resolvedValue); },
    then(onFulfilled, onRejected) {
      return Promise.resolve(resolvedValue).then(onFulfilled, onRejected);
    },
  };
  return query;
}

test('Screen 009: Expense Management & Approvals Integration Test Suite', async (t) => {
  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = server.address().port;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const primaryMasterUser = {
    userId: 'MU-PRIMARY-01',
    organisationId: 'ORG-ZAMORIN',
    role: 'MASTER',
    isPrimaryMaster: true,
    email: 'primary@zamorincafe.com',
    fullName: 'Primary Master',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
    accountStatus: 'ACTIVE',
    save: async function () { return this; },
  };

  const malformedMasterUser = {
    userId: 'MU-MALFORMED-01',
    organisationId: 'ORG-ZAMORIN',
    role: 'MASTER',
    isPrimaryMaster: false,
    email: 'malformed.master@zamorincafe.com',
    fullName: 'Malformed MASTER',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
    accountStatus: 'ACTIVE',
    save: async function () { return this; },
  };

  const cafeAdminUser = {
    userId: 'ADM-001',
    organisationId: 'ORG-ZAMORIN',
    role: 'CAFE_ADMIN',
    email: 'admin.koramangala@zamorincafe.com',
    fullName: 'Cafe Admin Koramangala',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001'],
    accountStatus: 'ACTIVE',
    save: async function () { return this; },
  };

  const inMemoryExpenses = [
    {
      expenseId: 'EX-20260814-0089',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      businessDate: '2026-08-14',
      expenseType: 'COMPANY_PAID',
      ownerUserId: 'ADM-001',
      preparerUserId: 'ADM-001',
      category: 'COFFEE_RAW_MATERIALS',
      purpose: 'Weekly arabica whole bean supply',
      description: '50kg whole bean arabica',
      amount: 14500,
      amountPaisa: 1450000,
      taxPaisa: 0,
      totalPaisa: 1450000,
      vendorName: 'Blue Tokai Coffee Roasters',
      invoiceNumber: 'BT-9921',
      receiptStatus: 'ATTACHED',
      status: 'APPROVED',
      financeHandoff: { status: 'AWAITING_FINANCE' },
      approvalSnapshot: { version: 1, approvedAmountPaisa: 1450000 },
      evidence: [{ documentId: 'DOC-1', fileName: 'Invoice.pdf' }],
      missingReceipt: { isDeclared: false },
      relatedRecords: {},
      save: async function () { return this; },
    },
    {
      expenseId: 'EX-20260815-0090',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      businessDate: '2026-08-15',
      expenseType: 'PETTY_CASH',
      ownerUserId: 'ADM-001',
      preparerUserId: 'ADM-001',
      category: 'DAIRY_FRESH_MILK',
      purpose: 'Daily fresh milk delivery',
      description: '60L fresh whole milk',
      amount: 3200,
      amountPaisa: 320000,
      taxPaisa: 0,
      totalPaisa: 320000,
      vendorName: 'Nandini Milk Dairy Depot',
      invoiceNumber: 'NAN-402',
      receiptStatus: 'REQUIRED',
      status: 'SUBMITTED',
      financeHandoff: { status: 'NOT_SENT' },
      missingReceipt: { isDeclared: false },
      relatedRecords: {},
      save: async function () { return this; },
    },
  ];

  const inMemoryCardTxns = [
    {
      transactionId: 'TXN-CARD-2026-001',
      organisationId: 'ORG-ZAMORIN',
      maskedCardNumber: '•••• 4821',
      cardholderUserId: 'MU-PRIMARY-01',
      merchantName: 'La Marzocco Service Partner',
      transactionDate: '2026-08-15',
      amountPaisa: 850000,
      matchStatus: 'UNMATCHED',
      save: async function () { return this; },
    },
  ];

  const inMemoryAdvances = [
    {
      advanceId: 'ADV-OP-2026-001',
      organisationId: 'ORG-ZAMORIN',
      recipientUserId: 'ADM-001',
      cafeId: 'ZC-0001',
      purpose: 'Koramangala Event Cash Reserve',
      amountPaisa: 1000000,
      liquidatedAmountPaisa: 0,
      returnedBalancePaisa: 0,
      status: 'DISBURSED',
      returnDueDate: '2026-08-30',
      liquidatedExpenseIds: [],
      save: async function () { return this; },
    },
  ];

  t.mock.method(authService, 'verifyAccessToken', async (token) => {
    let activeUser = primaryMasterUser;
    if (token === 'token_malformed_master') activeUser = malformedMasterUser;
    if (token === 'token_cafe_admin') activeUser = cafeAdminUser;
    return {
      payload: {
        sub: activeUser.userId,
        org: activeUser.organisationId,
        role: activeUser.role,
        isPrimaryMaster: activeUser.isPrimaryMaster,
        sv: 0,
        usv: 1,
        pv: 1,
        sid: 'SS-TEST-001',
      },
      session: {
        sessionId: 'SS-TEST-001',
        roleSnapshot: activeUser.role,
        sessionVersion: 0,
        mfaVerified: true,
        stepUpVerifiedAt: new Date().toISOString(),
      },
    };
  });

  t.mock.method(User, 'findOne', async (query) => {
    if (query?.userId === 'MU-PRIMARY-01') return primaryMasterUser;
    if (query?.userId === 'MU-MALFORMED-01') return malformedMasterUser;
    if (query?.userId === 'ADM-001') return cafeAdminUser;
    return null;
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

  t.mock.method(SequenceCounter, 'generateId', async ({ prefix }) => `${prefix}-0091`);

  t.mock.method(Expense, 'find', (query) => {
    let filtered = [...inMemoryExpenses];
    if (query?.status) filtered = filtered.filter((e) => e.status === query.status);
    if (query?.expenseId?.$in) filtered = filtered.filter((e) => query.expenseId.$in.includes(e.expenseId));
    return createQueryWrapper(filtered);
  });

  t.mock.method(Expense, 'findOne', async (query) => {
    if (query?.expenseId) {
      return inMemoryExpenses.find((e) => e.expenseId === query.expenseId) || null;
    }
    if (query?.invoiceNumber === 'DUPLICATE-999') {
      return inMemoryExpenses[0];
    }
    return null;
  });

  t.mock.method(Expense, 'countDocuments', async () => inMemoryExpenses.length);
  t.mock.method(Expense, 'create', async (data) => {
    const item = { ...data, save: async function () { return this; } };
    inMemoryExpenses.push(item);
    return item;
  });

  t.mock.method(CorporateCardTransaction, 'find', async () => inMemoryCardTxns);
  t.mock.method(CorporateCardTransaction, 'findOne', async (query) => inMemoryCardTxns.find((c) => c.transactionId === query.transactionId) || null);
  t.mock.method(CorporateCardTransaction, 'countDocuments', async () => inMemoryCardTxns.length);

  t.mock.method(OperationalAdvance, 'find', async () => inMemoryAdvances);
  t.mock.method(OperationalAdvance, 'findOne', async (query) => inMemoryAdvances.find((a) => a.advanceId === query.advanceId) || null);
  t.mock.method(OperationalAdvance, 'countDocuments', async () => inMemoryAdvances.length);

  await t.test('1. GET /api/v1/expenses/overview returns KPIs and control strip', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/expenses/overview',
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.kpis);
    assert.ok(res.body.controlStrip);
    assert.ok(Array.isArray(res.body.cafeBreakdown));
  });

  await t.test('2. GET /api/v1/expenses lists expenses with search and filtering', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/expenses?status=APPROVED',
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.expenses));
  });

  await t.test('2A. Malformed non-primary MASTER is rejected before expense access', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/expenses?status=APPROVED',
      headers: { Authorization: 'Bearer token_malformed_master' },
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.body?.error?.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
  });

  await t.test('3. POST /api/v1/expenses creates a new expense voucher', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/expenses',
      headers: { Authorization: 'Bearer token_cafe_admin' },
      body: {
        cafeId: 'ZC-0001',
        category: 'PACKAGING_DISPOSABLES',
        description: '500 Kraft take-away cups',
        amount: 3500,
        paymentMethod: 'CASH',
        paymentSource: 'PETTY_CASH',
        vendorName: 'EcoPack Solutions India',
        invoiceNumber: 'ECO-2026-101',
      },
    });

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.expense);
    assert.equal(res.body.expense.status, 'SUBMITTED');
  });

  await t.test('4. POST /api/v1/expenses rejects duplicate vendor invoice', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/expenses',
      headers: { Authorization: 'Bearer token_cafe_admin' },
      body: {
        cafeId: 'ZC-0001',
        category: 'COFFEE_RAW_MATERIALS',
        description: 'Duplicate bean supply invoice',
        amount: 14500,
        vendorName: 'Blue Tokai Coffee Roasters',
        invoiceNumber: 'DUPLICATE-999',
      },
    });

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error.code, 'DUPLICATE_EXPENSE_DETECTED');
  });

  await t.test('5. GET /api/v1/expenses/:expenseId returns Expense 360 detail', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/expenses/EX-20260814-0089',
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.expense);
    assert.ok(Array.isArray(res.body.allowedActions));
  });

  await t.test('6. POST /api/v1/expenses/:expenseId/decision approves expense with snapshot versioning', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/expenses/EX-20260815-0090/decision',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        decision: 'APPROVE',
        reason: 'Verified and approved for operations.',
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.expense.status, 'APPROVED');
    assert.equal(res.body.expense.approvalSnapshot.version, 1);
  });

  await t.test('7. POST /api/v1/expenses/:expenseId/missing-receipt records declaration & waiver', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/expenses/EX-20260814-0089/missing-receipt',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        isWaiver: true,
        reason: 'Vendor receipt lost, approved with digital proof.',
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.expense.receiptStatus, 'WAIVED');
  });

  await t.test('8. POST /api/v1/expenses/cards/match matches corporate card transaction', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/expenses/cards/match',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        transactionId: 'TXN-CARD-2026-001',
        expenseId: 'EX-20260814-0089',
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.cardTxn.matchStatus, 'MATCHED');
  });

  await t.test('9. POST /api/v1/expenses/advances/liquidate liquidates operational cash advance', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/expenses/advances/liquidate',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        advanceId: 'ADV-OP-2026-001',
        expenseIds: ['EX-20260815-0090'],
        returnedBalancePaisa: 680000,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.advance.status, 'FULLY_LIQUIDATED');
  });

  await t.test('10. GET /api/v1/expenses/integrity performs 16-point audit', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/expenses/integrity',
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.checksEvaluated, 16);
    assert.ok(res.body.status);
  });
});
