'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/server');
const { User } = require('../src/models/User');
const { Cafe } = require('../src/models/Cafe');
const { AdministrativeRequest } = require('../src/models/AdministrativeRequest');
const { AccessReview } = require('../src/models/AccessReview');
const { ServiceIdentity } = require('../src/models/ServiceIdentity');
const authService = require('../src/services/authService');
const cafeService = require('../src/services/cafeService');

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

test('Administration & Governance — Screen 002 Integration Test Suite', async (t) => {
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
    userId: 'MU-MALFORMED-01',
    role: 'MASTER',
    isPrimaryMaster: false,
    organisationId: 'ORG-ZAMORIN',
    email: 'normal@zamorincafe.com',
    fullName: 'malformed MASTER claim',
    sessionVersion: 1,
    permissionsVersion: 1,
  };

  let currentUser = primaryMasterUser;

  t.mock.method(authService, 'verifyAccessToken', async (token) => {
    const isMalformed = token === 'token_malformed_master';
    const activeUser = isMalformed ? malformedMasterUser : primaryMasterUser;
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
    if (query?.userId === 'MU-MALFORMED-01') {
      return {
        ...malformedMasterUser,
        isPrimaryMaster: false,
        save: async () => {},
        toObject: () => malformedMasterUser,
      };
    }
    return {
      ...primaryMasterUser,
      isPrimaryMaster: true,
      save: async () => {},
      toObject: () => primaryMasterUser,
    };
  });

  t.mock.method(User, 'find', () => ({
    lean: async () => [
      primaryMasterUser,
      malformedMasterUser,
      { userId: 'AD-0001', role: 'CAFE_ADMIN', isPrimaryMaster: false, accountStatus: 'ACTIVE', assignedCafeIds: ['ZC-0001'] },
      { userId: 'ST-0001', role: 'STAFF', isPrimaryMaster: false, accountStatus: 'ACTIVE', assignedCafeIds: ['ZC-0001'] },
    ],
  }));

  t.mock.method(Cafe, 'find', () => ({
    lean: async () => [
      { cafeId: 'ZC-0001', name: 'Dawn Roast Koramangala', status: 'ACTIVE', city: 'Bengaluru' },
      { cafeId: 'ZC-0002', name: 'Indiranagar Central', status: 'ACTIVE', city: 'Bengaluru' },
      { cafeId: 'ZC-0003', name: 'Calicut Beach', status: 'DRAFT', city: 'Kozhikode' },
    ],
    sort: () => ({
      lean: async () => [
        { cafeId: 'ZC-0001', name: 'Dawn Roast Koramangala', status: 'ACTIVE', city: 'Bengaluru' },
      ],
    }),
  }));

  t.mock.method(AdministrativeRequest, 'find', () => ({
    sort: () => ({
      limit: () => ({
        lean: async () => [
          {
            requestId: 'REQ-0001',
            requestType: 'CREATE_MASTER_USER',
            title: 'New Regional Ops Master',
            reason: 'Needed for North region expansion',
            status: 'SUBMITTED',
            requestedByUserId: 'MU-MALFORMED-01',
            submittedAt: new Date(),
          },
        ],
      }),
    }),
  }));

  t.mock.method(AdministrativeRequest, 'countDocuments', async () => 1);

  AdministrativeRequest.prototype.save = async function () {
    return this;
  };

  t.mock.method(AdministrativeRequest, 'findOne', async () => ({
    requestId: 'REQ-0001',
    organisationId: 'ORG-ZAMORIN',
    status: 'SUBMITTED',
    save: async function () { return this; },
  }));

  const { SequenceCounter } = require('../src/models/SequenceCounter');

  t.mock.method(SequenceCounter, 'generateId', async () => 'REQ-0001');
  t.mock.method(SequenceCounter, 'getNextNumber', async () => 1);

  t.mock.method(ServiceIdentity, 'find', () => ({
    lean: async () => [
      {
        serviceId: 'SVC-MAILOPS-01',
        serviceName: 'Zamorin MailOps Inbound Worker',
        purpose: 'Synchronizes vendor emails',
        ownerUserId: 'PRIMARY_MASTER',
        credentialStatus: 'HEALTHY',
        isActive: true,
      },
    ],
  }));

  // 1. GET /admin/overview (Primary Master)
  await t.test('Primary Master receives complete admin overview and control status', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/admin/overview',
      headers: { Authorization: `Bearer token_primary_master` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.isPrimaryMaster, true);
    assert.equal(res.data.data.kpis.masters.primary, 1);
    assert.ok(Array.isArray(res.data.data.controls));
    assert.ok(res.data.data.controls.length >= 5);
  });

  // 2. GET /admin/work-queue
  await t.test('Governance Work Queue returns pending tasks with aging classification', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/admin/work-queue',
      headers: { Authorization: `Bearer token_primary_master` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.data.queue));
  });

  // 3. POST /admin/requests (malformed MASTER claim submits request)
  await t.test('malformed MASTER claim can submit an Administrative Request to Primary Master', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/admin/requests',
      headers: { Authorization: `Bearer token_malformed_master` },
      body: {
        requestType: 'CREATE_MASTER_USER',
        title: 'New Regional Ops Master',
        reason: 'Needed for North region expansion',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.request.status, 'SUBMITTED');
  });

  // 4. PATCH /admin/requests/:id/decision (malformed MASTER claim blocked from deciding)
  await t.test('malformed MASTER claim is forbidden from deciding Administrative Requests', async () => {
    const res = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/admin/requests/REQ-0001/decision',
      headers: { Authorization: `Bearer token_malformed_master` },
      body: {
        decision: 'APPROVED',
        comment: 'Self approval attempt',
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.error.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
  });

  // 5. PATCH /admin/requests/:id/decision (Primary Master can approve)
  await t.test('Primary Master can approve Administrative Requests', async () => {
    const res = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/admin/requests/REQ-0001/decision',
      headers: { Authorization: `Bearer token_primary_master` },
      body: {
        decision: 'APPROVED',
        comment: 'Approved after executive review',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.request.status, 'APPROVED');
  });

  // 6. GET /admin/service-identities (Machine identities governance)
  await t.test('Service Identities returns machine identities without exposing secrets', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/admin/service-identities',
      headers: { Authorization: `Bearer token_primary_master` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.data.services));
    for (const svc of res.data.data.services) {
      assert.equal(svc.secret, undefined);
      assert.equal(svc.apiKey, undefined);
    }
  });

  // 7. POST /cafes (Both Primary and malformed MASTER claim can create cafes)
  await t.test('malformed MASTER claim can create a new Café location', async () => {
    t.mock.method(cafeService, 'createCafeWithAccess', async ({ cafeData }) => ({
      cafe: {
        ...cafeData,
        cafeId: 'ZC-0004',
        status: 'DRAFT',
      },
      access: {
        cafeId: 'ZC-0004',
        accessStatus: 'ACTIVE',
      },
    }));

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/cafes',
      headers: { Authorization: `Bearer token_malformed_master` },
      body: {
        name: 'Dawn Roast — HSR Layout',
        displayName: 'HSR Layout Branch',
        cafeType: 'STANDARD_CAFE',
        city: 'Bengaluru',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.cafe.name, 'Dawn Roast — HSR Layout');
  });
});
