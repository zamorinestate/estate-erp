'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { createApp } = require('../src/server');
const { User } = require('../src/models/User');
const { Cafe } = require('../src/models/Cafe');
const { Bill } = require('../src/models/Bill');
const { Expense } = require('../src/models/Expense');
const { Task } = require('../src/models/Task');
const { Approval } = require('../src/models/Approval');
const { CafeInventoryConfig } = require('../src/models/CafeInventoryConfig');
const { DepartmentOrder } = require('../src/models/DepartmentOrder');
const { MaintenanceJob } = require('../src/models/MaintenanceJob');
const { QualityChecklist } = require('../src/models/QualityChecklist');
const { DashboardSavedView } = require('../src/models/DashboardSavedView');
const { DashboardTarget } = require('../src/models/DashboardTarget');
const authService = require('../src/services/authService');

function request(server, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://127.0.0.1:' + server.address().port);
    const body = options.body === undefined ? null : JSON.stringify(options.body);

    const req = http.request(
      {
        method: options.method || 'GET',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let responseBody;
          try {
            responseBody = JSON.parse(raw);
          } catch {
            responseBody = raw;
          }
          resolve({ status: res.statusCode, body: responseBody });
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function startServer(t) {
  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return server;
}

function mockAuth(t, overrides = {}) {
  const role = overrides.role || 'MASTER';
  const isPrimaryMaster =
    overrides.isPrimaryMaster !== undefined
      ? overrides.isPrimaryMaster
      : role === 'MASTER';

  const user = {
    userId: overrides.userId || 'MU-0001',
    organisationId: 'ZAMORIN',
    role,
    isPrimaryMaster,
    assignedCafeIds: overrides.assignedCafeIds || [],
    primaryCafeId: overrides.primaryCafeId || null,
    sessionVersion: 1,
    permissionsVersion: 1,
    ...overrides,
  };

  const session = {
    sessionId: 'SS-20260819-0001',
    roleSnapshot: user.role,
    sessionVersion: 0,
    mfaVerified: true,
    stepUpVerifiedAt: new Date().toISOString(),
  };

  t.mock.method(authService, 'verifyAccessToken', async () => ({
    payload: {
      sub: user.userId,
      org: user.organisationId,
      role: user.role,
      sv: 0,
      usv: 1,
      pv: 1,
      sid: session.sessionId,
    },
    session,
  }));

  t.mock.method(User, 'findOne', async () => user);
}

function mockDashboardModels(t) {
  let Attendance;
  try {
    ({ Attendance } = require('../src/modules/attendance/Attendance'));
    if (Attendance) {
      t.mock.method(Attendance, 'aggregate', async () => []);
    }
  } catch {}

  t.mock.method(Cafe, 'find', () => ({
    select: () => ({
      lean: async () => [
        { cafeId: 'ZC-0001', name: 'Koramangala Main', city: 'Bengaluru' },
        { cafeId: 'ZC-0002', name: 'Indiranagar Central', city: 'Bengaluru' },
      ],
    }),
  }));

  t.mock.method(Bill, 'aggregate', async () => [
    { _id: null, totalSalesPaisa: 5000000, totalOrders: 150 },
  ]);

  t.mock.method(Expense, 'aggregate', async () => [
    { _id: null, totalExpensePaisa: 1200000 },
  ]);

  t.mock.method(CafeInventoryConfig, 'find', () => ({
    select: () => ({
      lean: async () => [],
    }),
  }));

  t.mock.method(Task, 'countDocuments', async () => 0);
  t.mock.method(Approval, 'countDocuments', async () => 0);
  t.mock.method(DepartmentOrder, 'countDocuments', async () => 0);
  t.mock.method(MaintenanceJob, 'countDocuments', async () => 0);
  t.mock.method(QualityChecklist, 'countDocuments', async () => 0);
  t.mock.method(DashboardTarget, 'find', () => ({
    lean: async () => [],
  }));
}

test('Dashboard Command Centre — Primary Master receives full portfolio and expense metrics', async (t) => {
  mockAuth(t, { role: 'MASTER', isPrimaryMaster: true });
  mockDashboardModels(t);

  const server = await startServer(t);
  const res = await request(server, '/api/v1/dashboard?period=today', { token: 'valid-token' });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.portfolioKpis.salesTotal.valuePaisa, 5000000);
  assert.equal(res.body.data.portfolioKpis.expenses.restricted, false);
  assert.equal(res.body.data.portfolioKpis.expenses.valuePaisa, 1200000);
  assert.equal(res.body.data.cafePerformanceCards.length, 2);
});

test('Dashboard Command Centre — Malformed MASTER has expense financials restricted', async (t) => {
  mockAuth(t, { role: 'MASTER', isPrimaryMaster: false });
  mockDashboardModels(t);

  const server = await startServer(t);
  const res = await request(server, '/api/v1/dashboard?period=today', { token: 'valid-token' });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.portfolioKpis.salesTotal.valuePaisa, 5000000);
  // Malformed MASTER must have expenses restricted
  assert.equal(res.body.data.portfolioKpis.expenses.restricted, true);
  assert.equal(res.body.data.portfolioKpis.expenses.valuePaisa, null);
});

test('Dashboard Saved Views — User can create and list saved views', async (t) => {
  mockAuth(t, { role: 'MASTER', isPrimaryMaster: true });

  const mockViews = [];
  t.mock.method(DashboardSavedView, 'updateMany', async () => ({ modifiedCount: 0 }));
  t.mock.method(DashboardSavedView.prototype, 'save', async function () {
    mockViews.push({
      savedViewId: this.savedViewId,
      name: this.name,
      isDefault: this.isDefault,
      filters: this.filters,
    });
    return this;
  });

  t.mock.method(DashboardSavedView, 'find', () => ({
    sort: () => ({
      lean: async () => mockViews,
    }),
  }));

  const server = await startServer(t);

  // 1. Create saved view
  const createRes = await request(server, '/api/v1/dashboard/saved-views', {
    method: 'POST',
    token: 'valid-token',
    body: {
      name: 'Executive Morning Brief',
      isDefault: true,
      filters: { period: '7d', comparison: 'previous_period', cafeIds: ['ZC-0001'] },
    },
  });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.success, true);
  assert.equal(createRes.body.data.view.name, 'Executive Morning Brief');

  // 2. List saved views
  const listRes = await request(server, '/api/v1/dashboard/saved-views', {
    method: 'GET',
    token: 'valid-token',
  });

  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.success, true);
  assert.equal(listRes.body.data.views.length, 1);
});

test('Dashboard Targets — Malformed MASTER is forbidden from setting targets', async (t) => {
  mockAuth(t, { role: 'MASTER', isPrimaryMaster: false });

  const server = await startServer(t);
  const res = await request(server, '/api/v1/dashboard/targets', {
    method: 'POST',
    token: 'valid-token',
    body: {
      cafeId: 'ZC-0001',
      granularity: 'MONTHLY',
      periodKey: '2026-08',
      salesTargetPaisa: 50000000,
    },
  });

  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'TARGET_MANAGEMENT_RESTRICTED');
});
