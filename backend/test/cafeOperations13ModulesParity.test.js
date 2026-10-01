'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveEffectiveCafeScope,
  assertResourceCafeOwnership,
  allowlistWritableFields,
} = require('../src/utils/cafeScope');
const deviceTrustService = require('../src/services/deviceTrustService');
const { ApiError } = require('../src/utils/ApiError');

test('13 Shared Modules Parity, Master Workspace vs Cafe Operations Scope & Tenant Isolation Suite', async (t) => {

  await t.test('1. CRITICAL P0: Master in Master Workspace receives portfolio scope, but Master in Cafe Operations is clamped to device café', () => {
    // A. Primary Master in MASTER_WORKSPACE
    const masterReqWorkspace = {
      auth: {
        role: 'MASTER',
        userId: 'MST-001',
        organisationId: 'ORG-001',
        isPrimaryMaster: true,
        workspaceMode: 'MASTER_WORKSPACE',
        deviceContext: { deviceClass: 'PERSONAL' },
      },
      query: {},
      body: {},
    };
    assert.equal(resolveEffectiveCafeScope(masterReqWorkspace), null, 'Master in Master Workspace has global portfolio scope (null)');

    // B. Primary Master filtering to specific cafe in Master Workspace
    const masterReqFiltered = {
      auth: {
        role: 'MASTER',
        userId: 'MST-001',
        organisationId: 'ORG-001',
        isPrimaryMaster: true,
        workspaceMode: 'MASTER_WORKSPACE',
        deviceContext: { deviceClass: 'PERSONAL' },
      },
      query: { cafeId: 'ZC-0002' },
      body: {},
    };
    assert.equal(resolveEffectiveCafeScope(masterReqFiltered), 'ZC-0002', 'Master in Master Workspace can filter to specific cafe');

    // C. Primary Master in CAFE_OPERATIONS mode on Cafe A device (ZC-0001)
    const masterReqCafeOps = {
      auth: {
        role: 'MASTER',
        userId: 'MST-001',
        organisationId: 'ORG-001',
        isPrimaryMaster: true,
        workspaceMode: 'CAFE_OPERATIONS',
        deviceContext: { deviceClass: 'CAFE_OWNED', boundCafeId: 'ZC-0001' },
      },
      query: {},
      body: {},
    };
    assert.equal(resolveEffectiveCafeScope(masterReqCafeOps), 'ZC-0001', 'Master in Cafe Operations MUST be strictly clamped to device café (ZC-0001)');

    // D. Malformed MASTER in CAFE_OPERATIONS mode on Cafe A device (ZC-0001)
    const malformedMasterReqCafeOps = {
      auth: {
        role: 'MASTER',
        userId: 'MST-002',
        organisationId: 'ORG-001',
        isPrimaryMaster: false,
        workspaceMode: 'CAFE_OPERATIONS',
        deviceContext: { deviceClass: 'CAFE_OWNED', boundCafeId: 'ZC-0001' },
      },
      query: {},
      body: {},
    };
    assert.equal(resolveEffectiveCafeScope(malformedMasterReqCafeOps), 'ZC-0001', 'Malformed MASTER in Cafe Operations is strictly clamped to device café (ZC-0001)');
  });

  await t.test('2. CRITICAL P0: Master in Cafe Operations attempting foreign cafe tampering is strictly DENIED', () => {
    // Master on Cafe A device trying query parameter tampering (?cafeId=ZC-0002)
    const masterTamperingQuery = {
      auth: {
        role: 'MASTER',
        userId: 'MST-001',
        organisationId: 'ORG-001',
        workspaceMode: 'CAFE_OPERATIONS',
        deviceContext: { deviceClass: 'CAFE_OWNED', boundCafeId: 'ZC-0001' },
      },
      query: { cafeId: 'ZC-0002' },
      body: {},
    };
    assert.throws(
      () => resolveEffectiveCafeScope(masterTamperingQuery),
      (err) => err instanceof ApiError && err.statusCode === 403 && err.code === 'CROSS_CAFE_RESOURCE_DENIED',
      'Master query tampering on Cafe Operations device must throw 403 CROSS_CAFE_RESOURCE_DENIED'
    );

    // Master on Cafe A device trying body parameter tampering ({ cafeId: 'ZC-0003' })
    const masterTamperingBody = {
      auth: {
        role: 'MASTER',
        userId: 'MST-001',
        organisationId: 'ORG-001',
        workspaceMode: 'CAFE_OPERATIONS',
        deviceContext: { deviceClass: 'CAFE_OWNED', boundCafeId: 'ZC-0001' },
      },
      query: {},
      body: { cafeId: 'ZC-0003' },
    };
    assert.throws(
      () => resolveEffectiveCafeScope(masterTamperingBody),
      (err) => err instanceof ApiError && err.statusCode === 403 && err.code === 'CROSS_CAFE_RESOURCE_DENIED',
      'Master body tampering on Cafe Operations device must throw 403 CROSS_CAFE_RESOURCE_DENIED'
    );
  });

  await t.test('3. CAFE_ADMIN is strictly bound to trusted device & operator cafe', () => {
    const req1 = {
      auth: {
        role: 'CAFE_ADMIN',
        organisationId: 'ORG-001',
        assignedCafeIds: ['ZC-0001'],
        deviceContext: { boundCafeId: 'ZC-0001' },
      },
      query: {},
      body: {},
    };
    assert.equal(resolveEffectiveCafeScope(req1), 'ZC-0001', 'CAFE_ADMIN must resolve to device bound café');

    const req2 = {
      auth: {
        role: 'CAFE_ADMIN',
        organisationId: 'ORG-001',
        assignedCafeIds: ['ZC-0001'],
        deviceContext: { boundCafeId: 'ZC-0001' },
      },
      query: { cafeId: 'ZC-0002' },
      body: {},
    };
    assert.throws(
      () => resolveEffectiveCafeScope(req2),
      (err) => err instanceof ApiError && err.statusCode === 403 && err.code === 'CROSS_CAFE_RESOURCE_DENIED',
      'Query tampering to foreign cafeId must throw 403 CROSS_CAFE_RESOURCE_DENIED'
    );
  });

  await t.test('4. assertResourceCafeOwnership: Rejects foreign IDOR access safely (404 Not Found)', () => {
    const cafe1Record = { orderId: 'DO-1001', cafeId: 'ZC-0001', totalPaisa: 50000 };
    const cafe2Record = { orderId: 'DO-1002', cafeId: 'ZC-0002', totalPaisa: 90000 };

    // Same-café access succeeds
    assert.doesNotThrow(() => assertResourceCafeOwnership(cafe1Record, 'ZC-0001', 'Order'));

    // Cross-café IDOR access fails safely
    assert.throws(
      () => assertResourceCafeOwnership(cafe2Record, 'ZC-0001', 'Order'),
      (err) => err instanceof ApiError && err.statusCode === 404,
      'Foreign cafe resource access must return safe 404 NOT_FOUND'
    );

    // Global Master Workspace access (effectiveCafe = null) succeeds for any record
    assert.doesNotThrow(() => assertResourceCafeOwnership(cafe2Record, null, 'Order'));
  });

  await t.test('5. assertResourceCafeOwnership: Inter-Café Transfer visibility for Source and Destination', () => {
    const transfer = {
      transferId: 'TRF-001',
      fromCafeId: 'ZC-0001',
      toCafeId: 'ZC-0002',
      status: 'IN_TRANSIT',
    };

    // Source cafe (ZC-0001) has access
    assert.doesNotThrow(() => assertResourceCafeOwnership(transfer, 'ZC-0001', 'Transfer'));

    // Destination cafe (ZC-0002) has access
    assert.doesNotThrow(() => assertResourceCafeOwnership(transfer, 'ZC-0002', 'Transfer'));

    // Unrelated third-party cafe (ZC-0003) is denied
    assert.throws(
      () => assertResourceCafeOwnership(transfer, 'ZC-0003', 'Transfer'),
      (err) => err instanceof ApiError && err.statusCode === 404,
      'Unrelated third party cafe cannot access inter-cafe transfer'
    );
  });

  await t.test('6. deviceTrustService derives CAFE_OPERATIONS privilege profile when MASTER is on CAFE_OWNED device', () => {
    const deviceReg = {
      deviceId: 'DV_ZC0001_01',
      deviceClass: 'CAFE_OWNED',
      status: 'ACTIVE',
      assignedCafeId: 'ZC-0001',
    };

    // Master on CAFE_OWNED device
    const profileOnDevice = deviceTrustService.derivePrivilegeProfile('MASTER', deviceReg);
    assert.equal(profileOnDevice.privilegeProfile, 'CAFE_OPERATIONS');
    assert.deepEqual(profileOnDevice.allowedCafeScope, ['ZC-0001']);
    assert.equal(profileOnDevice.workspaceMode, 'CAFE_OPERATIONS');

    // Master on Personal device
    const profileOnPersonal = deviceTrustService.derivePrivilegeProfile('MASTER', { deviceClass: 'PERSONAL' });
    assert.equal(profileOnPersonal.privilegeProfile, 'ORGANISATION_GOVERNANCE');
    assert.deepEqual(profileOnPersonal.allowedCafeScope, ['*']);
    assert.equal(profileOnPersonal.workspaceMode, 'MASTER_WORKSPACE');
  });

  await t.test('7. allowlistWritableFields: Prevents mass assignment of immutable/protected fields', () => {
    const rawPayload = {
      name: 'Batch Milk 10L',
      quantity: 10,
      cafeId: 'ZC-0002',
      organisationId: 'ORG-FOREIGN',
      status: 'ACTIVE',
    };

    const allowed = ['name', 'quantity', 'status'];
    const sanitized = allowlistWritableFields(rawPayload, allowed);

    assert.equal(sanitized.name, 'Batch Milk 10L');
    assert.equal(sanitized.quantity, 10);
    assert.equal(sanitized.status, 'ACTIVE');
    assert.equal(sanitized.cafeId, undefined, 'cafeId must not be writable via standard updates');
    assert.equal(sanitized.organisationId, undefined, 'organisationId must not be writable');
  });

  await t.test('8. Unauthenticated request throws 401', () => {
    assert.throws(
      () => resolveEffectiveCafeScope({}),
      (err) => err instanceof ApiError && err.statusCode === 401 && err.code === 'UNAUTHENTICATED'
    );
  });

});
