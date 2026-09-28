'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/server');
const { Bill } = require('../src/models/Bill');
const { Cafe } = require('../src/models/Cafe');
const { AuditEvent } = require('../src/models/AuditEvent');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { RolePermission } = require('../src/models/RolePermission');
const { RegisterSession } = require('../src/models/RegisterSession');
const authService = require('../src/services/authService');
const { User } = require('../src/models/User');

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

test('Sales Bills & Tax Receipts — Screen 005 Integration Test Suite', async (t) => {
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

  const auditService = require('../src/services/auditService');
  t.mock.method(auditService, 'recordRequestAudit', async () => ({}));
  t.mock.method(auditService, 'recordAuditEvent', async () => ({}));

  t.mock.method(SequenceCounter, 'generateId', async ({ prefix }) => `${prefix}-0001`);
  t.mock.method(SequenceCounter, 'getNextNumber', async () => 1);

  Bill.prototype.save = async function () { return this; };
  AuditEvent.prototype.save = async function () { return this; };
  t.mock.method(AuditEvent, 'create', async (data) => ({ ...data, save: async function () { return this; } }));

  const sampleBill = {
    billId: 'BILL-20260818-0004',
    invoiceNumber: 'ZAM-BILL-882104',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    businessDate: '2026-08-18',
    tableNumber: 'Table 04',
    customerName: 'Rahul Verma',
    lineItems: [
      {
        menuItemId: 'MI-001',
        itemNameSnapshot: 'Zamorin Pour-Over',
        quantity: 2,
        unitPricePaisa: 28000,
        taxRatePercent: 5,
        taxClassification: 'GST_5',
        lineSubtotalPaisa: 56000,
        cgstPaisa: 1400,
        sgstPaisa: 1400,
        igstPaisa: 0,
        lineTotalPaisa: 58800,
      },
    ],
    subtotalPaisa: 56000,
    taxPaisa: 2800,
    cgstPaisa: 1400,
    sgstPaisa: 1400,
    igstPaisa: 0,
    discountPaisa: 0,
    totalPaisa: 58800,
    refundedTotalPaisa: 0,
    paymentStatus: 'PAID',
    paymentMethod: 'UPI',
    status: 'COMPLETED',
    cashierUserId: 'EMP-001',
    tenders: [
      {
        paymentMethod: 'UPI',
        amountPaisa: 58800,
        status: 'COMPLETED',
        provider: 'BHIM_UPI',
        paymentReference: 'TXN-998811',
      },
    ],
    refunds: [],
    reprints: [],
    save: async function () { return this; },
    toObject: function () { return { ...this }; },
  };

  t.mock.method(Bill, 'find', (filter) => {
    const isFilterOpen = filter?.status === 'OPEN';
    const data = isFilterOpen ? [] : [sampleBill];
    return {
      select: () => ({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: async () => data,
            }),
          }),
        }),
      }),
      lean: async () => data,
    };
  });

  t.mock.method(Bill, 'countDocuments', async () => 1);

  t.mock.method(Bill, 'findOne', (query) => {
    let result = null;
    if (query?.$or || query?.billId === 'BILL-20260818-0004' || query?.invoiceNumber === 'ZAM-BILL-882104') {
      result = sampleBill;
    }
    return {
      select: () => ({
        lean: () => Promise.resolve(result),
      }),
      lean: () => Promise.resolve(result),
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      catch: (reject) => Promise.resolve(result).catch(reject),
    };
  });

  t.mock.method(Cafe, 'find', () => ({
    lean: async () => [
      { cafeId: 'ZC-0001', name: 'Dawn Roast Koramangala', status: 'ACTIVE' },
      { cafeId: 'ZC-0002', name: 'Indiranagar Central', status: 'ACTIVE' },
    ],
  }));

  t.mock.method(RegisterSession, 'find', () => ({
    lean: async () => [
      { cafeId: 'ZC-0001', status: 'OPEN', cashVariancePaisa: 0 },
      { cafeId: 'ZC-0002', status: 'CLOSED', cashVariancePaisa: 0 },
    ],
  }));

  // 1. GET /api/v1/bills/overview
  await t.test('Master receives Bills Overview KPIs and multi-cafe breakdown', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/bills/overview?date=2026-08-18',
      headers: { Authorization: `Bearer token_malformed_master` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.kpis.grossSales, 588);
    assert.equal(res.data.data.kpis.completedBills, 1);
    assert.equal(res.data.data.kpis.averageBillValue, 588);
  });

  // 2. GET /api/v1/bills (List & Filter)
  await t.test('Master receives advanced filtered bill register', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/bills?status=COMPLETED&cafeId=ZC-0001',
      headers: { Authorization: `Bearer token_malformed_master` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.bills.length, 1);
  });

  // 3. GET /api/v1/bills/:billId (360 Detail & Allowed Actions)
  await t.test('Master receives 360 Bill Detail with sale-time snapshots and allowed actions', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/bills/BILL-20260818-0004',
      headers: { Authorization: `Bearer token_malformed_master` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.bill.billId, 'BILL-20260818-0004');
    assert.equal(res.data.data.allowedActions.canReprint, true);
  });

  // 4. POST /api/v1/bills/:billId/reprint (Reprint Audit)
  await t.test('Master can reprint receipt and record reprint audit', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/bills/BILL-20260818-0004/reprint',
      headers: { Authorization: `Bearer token_malformed_master` },
      body: { reason: 'Customer Duplicate Copy' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.reprintCount, 1);
  });

  // 5. POST /api/v1/bills/:billId/refund (Controlled Refund)
  await t.test('Master can process controlled refund with refundable limit validation', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/bills/BILL-20260818-0004/refund',
      headers: { Authorization: `Bearer token_malformed_master` },
      body: {
        refundType: 'PARTIAL',
        amount: 100,
        reason: 'Item temperature complaint',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.refund.amountPaisa, 10000);
  });

  // 6. POST /api/v1/bills/:billId/void (Controlled Void)
  await t.test('Primary Master can void invoice with mandatory reason and audit', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/bills/BILL-20260818-0004/void',
      headers: { Authorization: `Bearer token_primary_master` },
      body: {
        reason: 'Order cancelled by guest before preparation',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.bill.status, 'VOIDED');
  });

  // 7. GET /api/v1/bills/tax/gst-register
  await t.test('Master receives Sales Tax & GST Source Register', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/bills/tax/gst-register?date=2026-08-18',
      headers: { Authorization: `Bearer token_malformed_master` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.summary.invoiceCount, 1);
  });

  // 8. GET /api/v1/bills/reconciliation/status
  await t.test('Master receives Reconciliation Status and EOD Close Readiness', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/bills/reconciliation/status?date=2026-08-18',
      headers: { Authorization: `Bearer token_malformed_master` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.isReadyToClose, true);
  });

  // 9. POST /api/v1/bills/eod/close
  await t.test('Master can close business-day billing when zero blockers exist', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/bills/eod/close',
      headers: { Authorization: `Bearer token_primary_master` },
      body: { businessDate: '2026-08-18' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.status, 'CLOSED');
  });
});
