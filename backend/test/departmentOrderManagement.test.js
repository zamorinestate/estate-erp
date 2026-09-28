'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/server');
const { DepartmentOrder } = require('../src/models/DepartmentOrder');
const { InstitutionalQuote } = require('../src/models/InstitutionalQuote');
const { InstitutionalAccount } = require('../src/models/InstitutionalAccount');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { RolePermission } = require('../src/models/RolePermission');
const { AuditEvent } = require('../src/models/AuditEvent');
const { User } = require('../src/models/User');
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

test('Institutional & Department Orders — Screen 007 Integration Test Suite', async (t) => {
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
    role: 'MASTER',
    isPrimaryMaster: true,
    organisationId: 'ORG-ZAMORIN',
    email: 'primary@zamorincafe.com',
    fullName: 'Primary Master',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
  };

  const malformedMasterUser = {
    userId: 'MU-NORMAL-01',
    role: 'MASTER',
    isPrimaryMaster: false,
    organisationId: 'ORG-ZAMORIN',
    email: 'normal@zamorincafe.com',
    fullName: 'Malformed MASTER',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
  };

  t.mock.method(authService, 'verifyAccessToken', async (token) => {
    const isNormal = token === 'token_malformed_master';
    const activeUser = isNormal ? malformedMasterUser : primaryMasterUser;
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
    if (query?.userId === 'MU-NORMAL-01') {
      return { ...malformedMasterUser, isPrimaryMaster: false, toObject: () => malformedMasterUser };
    }
    return { ...primaryMasterUser, isPrimaryMaster: true, toObject: () => primaryMasterUser };
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

  DepartmentOrder.prototype.save = async function () { return this; };
  InstitutionalQuote.prototype.save = async function () { return this; };
  InstitutionalAccount.prototype.save = async function () { return this; };
  AuditEvent.prototype.save = async function () { return this; };
  t.mock.method(AuditEvent, 'create', async (data) => ({ ...data, save: async function () { return this; } }));

  const mockOrders = [
    {
      orderId: 'DO-2026-0001',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      institutionName: 'University of Calicut',
      departmentName: 'Dean Office',
      careOfContact: 'Dr. K. S. Namboodiri',
      orderDate: '2026-08-15',
      fulfilmentDate: '2026-08-20',
      totalPaisa: 567000,
      settledPaisa: 0,
      orderStatus: 'CONFIRMED',
      fulfilmentStatus: 'SCHEDULED',
      creditStatus: 'CREDIT_OPEN',
      poNumber: 'UOC-2026-001',
      items: [{ name: 'Coffee', quantity: 20, unitPricePaisa: 15000, totalPaisa: 300000 }],
      headcount: { estimated: 20, final: 20 },
      revisions: [],
      settlements: [],
      save: async function () { return this; },
    },
    {
      orderId: 'DO-2026-0002',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      institutionName: 'NIT Calicut',
      departmentName: 'Computer Science',
      careOfContact: 'Prof. Ananya Roy',
      orderDate: '2026-08-16',
      fulfilmentDate: '2026-08-21',
      totalPaisa: 1480500,
      settledPaisa: 500000,
      orderStatus: 'IN_FULFILMENT',
      fulfilmentStatus: 'IN_FULFILMENT',
      creditStatus: 'PARTIALLY_SETTLED',
      poNumber: 'NITC-2026-002',
      items: [{ name: 'Cold Brew', quantity: 30, unitPricePaisa: 22000, totalPaisa: 660000 }],
      headcount: { estimated: 30, final: 30 },
      revisions: [],
      settlements: [],
      save: async function () { return this; },
    },
  ];

  await t.test('1. GET /api/v1/department-orders/overview returns KPI and control strip', async () => {
    t.mock.method(DepartmentOrder, 'find', () => createQueryWrapper(mockOrders));

    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/department-orders/overview',
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.kpis);
    assert.ok(res.data.data.controlStrip);
    assert.equal(res.data.data.totalOrders, 2);
  });

  await t.test('2. GET /api/v1/department-orders lists orders with search and filter', async () => {
    t.mock.method(DepartmentOrder, 'find', () => createQueryWrapper(mockOrders));
    t.mock.method(DepartmentOrder, 'countDocuments', async () => mockOrders.length);

    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/department-orders?search=Calicut',
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.orders.length, 2);
  });

  await t.test('3. POST /api/v1/department-orders creates an institutional order with duplicate check', async () => {
    t.mock.method(DepartmentOrder, 'findOne', () => createQueryWrapper(null));
    t.mock.method(DepartmentOrder, 'create', async (doc) => ({
      ...doc,
      _id: 'mock-id-new',
    }));

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/department-orders',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        institutionName: 'IIM Kozhikode',
        departmentName: 'Executive Education',
        careOfContact: 'Prof. Ramesh',
        cafeId: 'ZC-0001',
        fulfilmentDate: '2026-08-25',
        headcount: { estimated: 25 },
        items: [
          { name: 'Specialty Coffee Pack', quantity: 25, unitPricePaisa: 12000, totalPaisa: 300000 },
        ],
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.order.orderId.startsWith('DO-'));
    assert.equal(res.data.data.order.institutionName, 'IIM Kozhikode');
  });

  await t.test('4. GET /api/v1/department-orders/:orderId returns 360 view with allowed actions', async () => {
    t.mock.method(DepartmentOrder, 'findOne', () => createQueryWrapper(mockOrders[0]));

    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/department-orders/DO-2026-0001',
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.orderId || res.data.data.order.orderId, 'DO-2026-0001');
    assert.ok(res.data.data.allowedActions);
    assert.equal(res.data.data.allowedActions.canRevise, true);
  });

  await t.test('5. POST /api/v1/department-orders/:orderId/revisions appends audited revision', async () => {
    const targetOrder = {
      ...mockOrders[0],
      revisions: [],
      headcount: { estimated: 20, final: 20 },
      save: async function () { return this; },
    };
    t.mock.method(DepartmentOrder, 'findOne', async () => targetOrder);

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/department-orders/DO-2026-0001/revisions',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        field: 'headcount',
        before: { final: 20 },
        after: { final: 25 },
        reason: 'Additional 5 delegates confirmed by Dean Office',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.revision.revisionNumber, 1);
    assert.equal(res.data.data.order.headcount.final, 25);
  });

  await t.test('6. POST /api/v1/department-orders/:orderId/fulfil confirms fulfilment with receiving proof', async () => {
    const targetOrder = {
      ...mockOrders[0],
      items: [{ name: 'Coffee', quantity: 20 }],
      save: async function () { return this; },
    };
    t.mock.method(DepartmentOrder, 'findOne', async () => targetOrder);

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/department-orders/DO-2026-0001/fulfil',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        receivingContactName: 'Dr. K. S. Namboodiri',
        receivingSignature: 'SIGN_CAPTURED_ON_TERMINAL',
        discrepancyNotes: 'Delivered in full',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.order.fulfilmentStatus, 'FULFILLED');
    assert.equal(res.data.data.order.fulfilmentProof.receivingContactName, 'Dr. K. S. Namboodiri');
  });

  await t.test('7. POST /api/v1/department-orders/:orderId/settle records settlement and updates credit status', async () => {
    const targetOrder = {
      ...mockOrders[0],
      totalPaisa: 567000,
      settledPaisa: 0,
      settlements: [],
      save: async function () { return this; },
    };
    t.mock.method(DepartmentOrder, 'findOne', async () => targetOrder);

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/department-orders/DO-2026-0001/settle',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        amountPaisa: 567000,
        paymentMethod: 'BANK_TRANSFER',
        paymentReference: 'NEFT-UOC-9823472',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.order.creditStatus, 'SETTLED');
    assert.equal(res.data.data.remainingOutstandingPaisa, 0);
  });

  await t.test('8. GET and POST /api/v1/department-orders/quotes manages institutional quotes', async () => {
    const mockQuote = {
      quoteId: 'QUO-2026-0042',
      institutionName: 'Farook College',
      departmentName: 'Commerce',
      contactName: 'Dr. Basheer',
      totalPaisa: 2250000,
      status: 'SENT',
    };
    t.mock.method(InstitutionalQuote, 'find', () => createQueryWrapper([mockQuote]));
    t.mock.method(InstitutionalQuote, 'create', async (doc) => ({ ...doc, _id: 'mock-quote-id' }));

    const listRes = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/department-orders/quotes',
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(listRes.status, 200);
    assert.equal(listRes.data.data.quotes.length, 1);

    const createRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/department-orders/quotes',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        institutionName: 'Farook College',
        departmentName: 'Commerce',
        contactName: 'Dr. Basheer',
        validUntil: '2026-08-30',
        items: [{ name: 'High Tea Pack', quantity: 50, unitPricePaisa: 40000, totalPaisa: 2000000 }],
      },
    });

    assert.equal(createRes.status, 201);
    assert.ok(createRes.data.data.quote.quoteId.startsWith('QUO-'));
  });

  await t.test('9. GET /api/v1/department-orders/schedule returns schedule calendar list', async () => {
    t.mock.method(DepartmentOrder, 'find', () => createQueryWrapper(mockOrders));

    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/department-orders/schedule',
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.schedule.length, 2);
  });

  await t.test('10. GET /api/v1/department-orders/integrity verifies 3-way reconciliation', async () => {
    t.mock.method(DepartmentOrder, 'find', () => createQueryWrapper(mockOrders));

    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/department-orders/integrity',
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.checks);
    assert.equal(res.data.data.checks.totalOrdersEvaluated, 2);
  });
});
