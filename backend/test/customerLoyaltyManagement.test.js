'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/server');
const { Customer } = require('../src/models/Customer');
const { LoyaltyLedger } = require('../src/models/LoyaltyLedger');
const { RewardDefinition } = require('../src/models/RewardDefinition');
const { CustomerFeedback } = require('../src/models/CustomerFeedback');
const { LoyaltyProgramme } = require('../src/models/LoyaltyProgramme');
const { Cafe } = require('../src/models/Cafe');
const { Bill } = require('../src/models/Bill');
const { AuditEvent } = require('../src/models/AuditEvent');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { RolePermission } = require('../src/models/RolePermission');
const authService = require('../src/services/authService');
const auditService = require('../src/services/auditService');
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

test('Customer Directory & Loyalty Rewards — Screen 006 Integration Test Suite', async (t) => {
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

  t.mock.method(auditService, 'recordRequestAudit', async () => ({}));
  t.mock.method(auditService, 'recordAuditEvent', async () => ({}));

  t.mock.method(SequenceCounter, 'generateId', async ({ prefix }) => `${prefix}-0001`);
  t.mock.method(SequenceCounter, 'getNextNumber', async () => 1);

  Customer.prototype.save = async function () { return this; };
  LoyaltyLedger.prototype.save = async function () { return this; };
  CustomerFeedback.prototype.save = async function () { return this; };
  LoyaltyProgramme.prototype.save = async function () { return this; };
  AuditEvent.prototype.save = async function () { return this; };
  t.mock.method(AuditEvent, 'create', async (data) => ({ ...data, save: async function () { return this; } }));

  const sampleCustomer = {
    customerId: 'CUST-0001',
    membershipId: 'ZAM-MEM-0001',
    organisationId: 'ORG-ZAMORIN',
    name: 'Meera Krishnan',
    phone: '+919845022880',
    email: 'meera@domain.com',
    customerType: 'INDIVIDUAL',
    tier: 'BRONZE',
    pointsBalance: 50,
    reservedPoints: 0,
    totalSpendPaisa: 125000,
    totalVisits: 4,
    status: 'ACTIVE',
    preferredCafeId: 'ZC-0001',
    toObject: function () { return { ...this }; },
    save: async function () { return this; },
  };

  t.mock.method(Customer, 'find', () => ({
    select: () => ({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: async () => [sampleCustomer],
          }),
        }),
      }),
    }),
    lean: async () => [sampleCustomer],
  }));

  t.mock.method(Customer, 'countDocuments', async () => 1);

  function makeQueryWrapper(doc) {
    const p = Promise.resolve(doc);
    p.select = () => ({
      lean: async () => doc,
    });
    p.lean = async () => doc;
    return p;
  }

  t.mock.method(Customer, 'findOne', (query) => {
    const isDupCheck = query?.$or?.some((cond) => cond?.phone === '+919845022880_DUPLICATE');
    if (isDupCheck) {
      return makeQueryWrapper(sampleCustomer);
    }
    if (query?.customerId === 'CUST-0001') {
      return makeQueryWrapper({ ...sampleCustomer, save: async function () { return this; }, toObject: function () { return { ...this }; } });
    }
    if (query?.customerId === 'CUST-0002') {
      return makeQueryWrapper({ ...sampleCustomer, customerId: 'CUST-0002', name: 'Duplicate Customer', pointsBalance: 30, save: async function () { return this; }, toObject: function () { return { ...this }; } });
    }
    return makeQueryWrapper(null);
  });

  t.mock.method(LoyaltyProgramme, 'findOne', () => ({
    lean: async () => ({
      programmeVersion: 'V1.0',
      spendToPointsRatio: 0.1,
      pointsExpiryDays: 365,
      tierRules: [
        { tier: 'BRONZE', minSpendPaisa: 0, earnMultiplier: 1.0 },
        { tier: 'SILVER', minSpendPaisa: 500000, earnMultiplier: 1.25 },
        { tier: 'GOLD', minSpendPaisa: 1500000, earnMultiplier: 1.5 },
        { tier: 'PLATINUM', minSpendPaisa: 2500000, earnMultiplier: 2.0 },
      ],
    }),
  }));

  t.mock.method(Bill, 'find', () => ({
    sort: () => ({
      limit: () => ({
        lean: async () => [],
      }),
    }),
  }));

  t.mock.method(Cafe, 'find', () => ({
    lean: async () => [
      {
        cafeId: 'ZC-0001',
        name: 'Dawn Roast Koramangala',
        organisationId: 'ORG-ZAMORIN',
      },
    ],
  }));

  t.mock.method(CustomerFeedback, 'find', () => ({
    lean: async () => [],
    sort: () => ({
      limit: () => ({
        lean: async () => [],
      }),
    }),
  }));

  t.mock.method(LoyaltyLedger, 'find', () => ({
    sort: () => ({
      limit: () => ({
        lean: async () => [],
      }),
    }),
  }));

  t.mock.method(LoyaltyLedger, 'updateMany', async () => ({ modifiedCount: 1 }));

  t.mock.method(RewardDefinition, 'find', () => ({
    lean: async () => [
      {
        rewardId: 'REW-001',
        name: 'Free Beverage',
        customerFacingName: 'Complimentary Artisan Coffee',
        pointsCost: 150,
        status: 'ACTIVE',
      },
    ],
  }));

  await t.test('1. POST /api/v1/customers — registers customer with 50 welcome points', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/customers',
      headers: { Authorization: 'Bearer token_malformed_master' },
      body: {
        name: 'Meera Krishnan',
        phone: '+919845022880',
        email: 'meera@domain.com',
        preferredCafeId: 'ZC-0001',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.customer.name, 'Meera Krishnan');
    assert.equal(res.data.data.customer.pointsBalance, 50);
  });

  await t.test('2. POST /api/v1/customers — detects duplicate phone number', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/customers',
      headers: { Authorization: 'Bearer token_malformed_master' },
      body: {
        name: 'Meera K',
        phone: '+919845022880_DUPLICATE',
        email: 'meera.diff@domain.com',
      },
    });

    assert.equal(res.status, 409);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'POSSIBLE_DUPLICATE_CUSTOMER');
  });

  await t.test('3. GET /api/v1/customers/overview — returns KPIs and café summaries', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/customers/overview',
      headers: { Authorization: 'Bearer token_malformed_master' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.kpis.totalCustomers >= 1);
    assert.ok(res.data.data.kpis.outstandingPoints >= 50);
  });

  await t.test('4. GET /api/v1/customers — searches and filters customer directory', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/customers?search=Meera',
      headers: { Authorization: 'Bearer token_malformed_master' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.customers.length, 1);
    assert.equal(res.data.data.customers[0].customerId, 'CUST-0001');
  });

  await t.test('5. GET /api/v1/customers/:customerId — returns Customer 360 with tier progress', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/customers/CUST-0001',
      headers: { Authorization: 'Bearer token_malformed_master' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data?.data?.customer?.customerId, 'CUST-0001');
    assert.equal(res.data?.data?.tierProgress?.currentTier, 'BRONZE');
    assert.equal(res.data?.data?.tierProgress?.nextTier, 'SILVER');
  });

  await t.test('6. POST /api/v1/customers/:customerId/loyalty/adjust — performs audited point adjustment', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/customers/CUST-0001/loyalty/adjust',
      headers: { Authorization: 'Bearer token_malformed_master' },
      body: {
        action: 'ADD',
        points: 100,
        reasonCode: 'Customer Service Correction',
        note: 'Loyalty bonus adjustment',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.previousBalance, 50);
    assert.equal(res.data.data.newBalance, 150);
  });

  await t.test('7. POST /api/v1/customers/merge — merges duplicate profile safely', async () => {
    const mergeRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/customers/merge',
      headers: { Authorization: 'Bearer token_malformed_master' },
      body: {
        primaryCustomerId: 'CUST-0001',
        duplicateCustomerId: 'CUST-0002',
      },
    });

    assert.equal(mergeRes.status, 200);
    assert.equal(mergeRes.data.success, true);
    assert.equal(mergeRes.data.data.primaryCustomer.pointsBalance, 80); // 50 + 30
  });

  await t.test('8. GET /api/v1/customers/rewards/catalogue — returns reward catalogue', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/customers/rewards/catalogue',
      headers: { Authorization: 'Bearer token_malformed_master' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.rewards.length >= 1);
  });

  await t.test('9. POST /api/v1/customers/feedback — records guest feedback', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/customers/feedback',
      headers: { Authorization: 'Bearer token_malformed_master' },
      body: {
        customerId: 'CUST-0001',
        cafeId: 'ZC-0001',
        rating: 5,
        category: 'SERVICE',
        comment: 'Outstanding coffee aroma and swift service.',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.feedback.rating, 5);
  });

  await t.test('10. POST /api/v1/customers/programme/publish — enforces Primary Master authority', async () => {
    // Attempt with Malformed MASTER (should fail 403)
    const normalRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/customers/programme/publish',
      headers: { Authorization: 'Bearer token_malformed_master' },
      body: { version: 'V2.0', spendToPointsRatio: 0.2 },
    });
    assert.equal(normalRes.status, 403);

    // Attempt with Primary Master (should succeed 200)
    const primaryRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/customers/programme/publish',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: { version: 'V2.0', spendToPointsRatio: 0.2 },
    });
    assert.equal(primaryRes.status, 200);
    assert.equal(primaryRes.data.success, true);
    assert.equal(primaryRes.data.data.programme.programmeVersion, 'V2.0');
  });
});
