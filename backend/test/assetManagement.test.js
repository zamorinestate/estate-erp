'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/server');
const { Asset } = require('../src/models/Asset');
const { WorkOrder } = require('../src/models/WorkOrder');
const { MaintenancePlan } = require('../src/models/MaintenancePlan');
const { AuditEvent } = require('../src/models/AuditEvent');
const { SequenceCounter } = require('../src/models/SequenceCounter');
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

test('Equipment & Asset Management — Screen 003 Integration Test Suite', async (t) => {
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
      return { ...malformedMasterUser, isPrimaryMaster: false, toObject: () => malformedMasterUser };
    }
    return { ...primaryMasterUser, isPrimaryMaster: true, toObject: () => primaryMasterUser };
  });

  const { RolePermission } = require('../src/models/RolePermission');

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

  Asset.prototype.save = async function () { return this; };
  WorkOrder.prototype.save = async function () { return this; };
  MaintenancePlan.prototype.save = async function () { return this; };
  AuditEvent.prototype.save = async function () { return this; };
  t.mock.method(AuditEvent, 'create', async (data) => ({ ...data, save: async function () { return this; } }));

  const sampleAsset = {
    assetId: 'AST-0001',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    name: 'La Marzocco Linea PB 2-Group',
    category: 'BREWING_EQUIPMENT',
    serialNumber: 'LM-PB-99412',
    operationalStatus: 'IN_SERVICE',
    condition: 'EXCELLENT',
    criticality: 'CRITICAL',
    nextMaintenanceDue: '2026-11-01',
    locationHistory: [
      {
        toCafeId: 'ZC-0001',
        transferredAt: new Date(),
        transferredByUserId: 'MU-PRIMARY-01',
        reason: 'Initial Deployment',
      },
    ],
    save: async function () { return this; },
  };

  t.mock.method(Asset, 'find', () => ({
    select: () => ({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: async () => [sampleAsset],
          }),
        }),
      }),
    }),
    lean: async () => [sampleAsset],
  }));

  t.mock.method(Asset, 'countDocuments', async () => 1);

  t.mock.method(Asset, 'findOne', (query) => {
    let result = null;
    if (query?.serialNumber === 'DUPLICATE-SN') {
      result = { assetId: 'AST-0099', serialNumber: 'DUPLICATE-SN', save: async function () { return this; } };
    } else if (query?.assetId === 'AST-0001') {
      result = sampleAsset;
    }

    return {
      lean: () => Promise.resolve(result),
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      catch: (reject) => Promise.resolve(result).catch(reject),
    };
  });

  t.mock.method(WorkOrder, 'findOne', (query) => {
    const result = {
      workOrderId: 'WO-0001',
      assetId: 'AST-0001',
      title: 'Quarterly Service',
      save: async function () { return this; },
    };
    return {
      lean: () => Promise.resolve(result),
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      catch: (reject) => Promise.resolve(result).catch(reject),
    };
  });

  t.mock.method(Asset, 'create', async (data) => ({
    ...data,
    save: async function () { return this; },
  }));

  t.mock.method(WorkOrder, 'find', () => ({
    sort: () => ({
      lean: async () => [
        {
          workOrderId: 'WO-0001',
          assetId: 'AST-0001',
          title: 'Quarterly Service',
          workType: 'PREVENTIVE_MAINTENANCE',
          priority: 'NORMAL',
          status: 'OPEN',
        },
      ],
    }),
    lean: async () => [],
  }));

  t.mock.method(WorkOrder, 'create', async (data) => ({
    ...data,
    save: async function () { return this; },
  }));

  t.mock.method(MaintenancePlan, 'create', async (data) => ({
    ...data,
    save: async function () { return this; },
  }));

  // 1. GET /api/v1/assets/overview
  await t.test('Master receives complete Asset Overview and health KPIs', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/assets/overview',
      headers: { Authorization: `Bearer token_malformed_master` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.kpis.totalAssets, 1);
    assert.equal(res.data.data.kpis.inService, 1);
  });

  // 2. POST /api/v1/assets (malformed MASTER claim registers new asset)
  await t.test('malformed MASTER claim can register a new equipment asset', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets',
      headers: { Authorization: `Bearer token_malformed_master` },
      body: {
        name: 'Mahlkönig EK43 Commercial Grinder',
        category: 'GRINDERS_MILLS',
        cafeId: 'ZC-0001',
        serialNumber: 'MK-7721',
        condition: 'GOOD',
        criticality: 'HIGH',
      },
    });

    if (res.status !== 201) {
      console.log('TEST 2 RES:', JSON.stringify(res.data));
    }
    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.asset.name, 'Mahlkönig EK43 Commercial Grinder');
  });

  // 3. POST /api/v1/assets (Duplicate serial number blocked)
  await t.test('Asset registration rejects duplicate serial number within organisation', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets',
      headers: { Authorization: `Bearer token_malformed_master` },
      body: {
        name: 'Duplicate Espresso Machine',
        cafeId: 'ZC-0001',
        serialNumber: 'DUPLICATE-SN',
      },
    });

    assert.equal(res.status, 409);
    assert.equal(res.data.error.code, 'DUPLICATE_SERIAL_NUMBER');
  });

  // 4. POST /api/v1/assets/:assetId/commission
  await t.test('Master can commission and place setup asset into active service', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/AST-0001/commission',
      headers: { Authorization: `Bearer token_malformed_master` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.asset.operationalStatus, 'IN_SERVICE');
  });

  // 5. POST /api/v1/assets/:assetId/transfer
  await t.test('Master can transfer equipment between cafes with location history tracking', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/AST-0001/transfer',
      headers: { Authorization: `Bearer token_malformed_master` },
      body: {
        toCafeId: 'ZC-0002',
        reason: 'Equipment capacity balancing',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.asset.cafeId, 'ZC-0002');
  });

  // 6. POST /api/v1/assets/:assetId/safety-hold
  await t.test('Master can place asset on Safety Hold (OUT OF SERVICE — DO NOT USE)', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/AST-0001/safety-hold',
      headers: { Authorization: `Bearer token_malformed_master` },
      body: {
        isHoldActive: true,
        reason: 'Boiler pressure valve leak detected',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.asset.operationalStatus, 'OUT_OF_SERVICE');
  });

  // 7. POST /api/v1/assets/work-orders
  await t.test('Master can create a maintenance work order with priority and failure analysis', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/work-orders',
      headers: { Authorization: `Bearer token_malformed_master` },
      body: {
        assetId: 'AST-0001',
        title: 'Group Head Gasket Replacement',
        workType: 'CORRECTIVE_REPAIR',
        priority: 'HIGH',
        description: 'Steam leak observed around group head #1 during extraction',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.workOrder.title, 'Group Head Gasket Replacement');
  });

  // 8. POST /api/v1/assets/:assetId/retire (Primary Master capital retirement)
  await t.test('Primary Master can authorize final capital asset retirement', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/AST-0001/retire',
      headers: { Authorization: `Bearer token_primary_master` },
      body: {
        reason: 'Beyond economic repair',
        disposalMethod: 'Certified E-Waste Recycling',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.asset.operationalStatus, 'RETIRED');
  });
});
