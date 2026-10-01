'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cafeService = require('../src/services/cafeService');
const operatorSessionService = require('../src/services/operatorSessionService');
const { Cafe } = require('../src/models/Cafe');
const { CafeAccess } = require('../src/models/CafeAccess');
const { CafeGatewayContext } = require('../src/models/CafeGatewayContext');

test('CAFE-LIFE-001: SUSPENDED CafeAccess is denied by gateway resolution', async () => {
  const originalFindOne = CafeAccess.findOne;
  CafeAccess.findOne = async () => ({
    _id: 'ACCESS-1',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    accessStatus: 'SUSPENDED',
  });
  try {
    await assert.rejects(
      async () => cafeService.resolveGatewayCredential({ method: 'QR', credential: 'test-token' }),
      (err) => err.code === 'CAFE_ACCESS_UNAVAILABLE' && err.statusCode === 403
    );
  } finally {
    CafeAccess.findOne = originalFindOne;
  }
});

test('CAFE-LIFE-002: TEMPORARILY_CLOSED parent cafe is denied even when access record is ACTIVE', async () => {
  const originalAccessFindOne = CafeAccess.findOne;
  const originalCafeFindOne = Cafe.findOne;
  CafeAccess.findOne = async () => ({
    _id: 'ACCESS-2',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0002',
    accessStatus: 'ACTIVE',
  });
  Cafe.findOne = () => ({ lean: async () => ({ cafeId: 'ZC-0002', name: 'Closed Cafe', status: 'TEMPORARILY_CLOSED' }) });
  try {
    await assert.rejects(
      async () => cafeService.resolveGatewayCredential({ method: 'QR', credential: 'test-token-2' }),
      (err) => err.code === 'CAFE_INACTIVE' && err.statusCode === 403
    );
  } finally {
    CafeAccess.findOne = originalAccessFindOne;
    Cafe.findOne = originalCafeFindOne;
  }
});

test('CAFE-LIFE-003: TEST_MODE remains a commissioned operational state', async () => {
  const originals = {
    accessFindOne: CafeAccess.findOne,
    accessUpdateOne: CafeAccess.updateOne,
    cafeFindOne: Cafe.findOne,
    gatewayCreate: CafeGatewayContext.create,
  };
  CafeAccess.findOne = async () => ({
    _id: 'ACCESS-3',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0003',
    accessStatus: 'ACTIVE',
  });
  Cafe.findOne = () => ({
    lean: async () => ({ cafeId: 'ZC-0003', name: 'Commissioning Cafe', displayName: 'Commissioning Cafe', status: 'TEST_MODE', address: { city: 'Kochi' } }),
  });
  CafeGatewayContext.create = async () => ({ created: true });
  CafeAccess.updateOne = async () => ({ matchedCount: 1, modifiedCount: 1 });
  try {
    const result = await cafeService.resolveGatewayCredential({ method: 'QR', credential: 'test-token-3' });
    assert.equal(result.cafeId, 'ZC-0003');
    assert.equal(result.accessMethod, 'QR');
    assert.ok(result.gatewayContextId);
  } finally {
    CafeAccess.findOne = originals.accessFindOne;
    CafeAccess.updateOne = originals.accessUpdateOne;
    Cafe.findOne = originals.cafeFindOne;
    CafeGatewayContext.create = originals.gatewayCreate;
  }
});

test('CAFE-LIFE-004: lifecycle transition synchronizes CafeAccess before saving cafe status', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/cafeService.js'), 'utf8');
  const start = source.indexOf('async transitionLifecycleState');
  const end = source.indexOf('STAGE 03: Calculates licence', start);
  const block = source.slice(start, end);
  const accessUpdate = block.indexOf('const accessResult = await CafeAccess.updateOne');
  const cafeSave = block.indexOf('await cafe.save()');
  assert.ok(accessUpdate >= 0);
  assert.ok(cafeSave > accessUpdate);
  assert.ok(block.includes("['TEST_MODE', 'ACTIVE'].includes(normalizedTarget)"));
  assert.ok(block.includes('CAFE_ACCESS_STATE_MISSING'));
  assert.equal(block.includes('catch (_) {}'), false);
});

test('CAFE-LIFE-005: direct status and archive controllers cannot swallow access synchronization failure', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/controllers/cafeController.js'), 'utf8');
  const statusStart = source.indexOf('const changeCafeStatus = asyncHandler');
  const archiveStart = source.indexOf('const archiveCafe = asyncHandler', statusStart);
  const readinessStart = source.indexOf('const getCafeReadiness = asyncHandler', archiveStart);
  const statusBlock = source.slice(statusStart, archiveStart);
  const archiveBlock = source.slice(archiveStart, readinessStart);

  assert.ok(statusBlock.indexOf('CafeAccess.updateOne') < statusBlock.indexOf('Cafe.findOneAndUpdate'));
  assert.ok(statusBlock.includes('CAFE_ACCESS_STATE_MISSING'));
  assert.ok(statusBlock.includes('CAFE_STATUS_STATE_CONFLICT'));
  assert.equal(statusBlock.includes('.catch(() => {})'), false);

  assert.ok(archiveBlock.indexOf('CafeAccess.updateOne') < archiveBlock.indexOf('await cafe.archive'));
  assert.ok(archiveBlock.includes("accessStatus: 'SUSPENDED'"));
  assert.ok(archiveBlock.includes('CAFE_ACCESS_STATE_MISSING'));
  assert.equal(archiveBlock.includes('.catch(() => {})'), false);
});

test('CAFE-LIFE-006: operator-session gateway requires ACTIVE access and TEST_MODE/ACTIVE parent status', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/operatorSessionService.js'), 'utf8');
  assert.ok(source.includes("cafeAccessDoc.accessStatus !== 'ACTIVE'"));
  assert.ok(source.includes("!['TEST_MODE', 'ACTIVE'].includes(cafe.status)"));
});

test('CAFE-GWC-001: gateway context consumption is an atomic expected-state claim', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/operatorSessionService.js'), 'utf8');
  const start = source.indexOf('if (cleanGatewayToken)');
  const end = source.indexOf('} else {\n      // Direct registered device sign-in', start);
  const block = source.slice(start, end);

  assert.ok(block.includes('CafeGatewayContext.findOneAndUpdate'));
  assert.ok(block.includes("status: 'ACTIVE'"));
  assert.ok(block.includes('consumed: { $ne: true }'));
  assert.ok(block.includes('expiresAt: { $gt: consumedAt }'));
  assert.ok(block.includes("status: 'CONSUMED'"));
  assert.ok(block.includes('{ new: true }'));
  assert.ok(block.includes('GATEWAY_CONTEXT_STATE_CONFLICT'));
  assert.equal(block.includes('gatewayContext.save().catch(() => {})'), false);
});

test('CAFE-GWC-002: losing the atomic gateway claim is classified as consumed replay', async () => {
  const originals = {
    findOne: CafeGatewayContext.findOne,
    findOneAndUpdate: CafeGatewayContext.findOneAndUpdate,
  };

  let findOneCalls = 0;
  CafeGatewayContext.findOne = () => {
    findOneCalls += 1;
    if (findOneCalls === 1) {
      return Promise.resolve({
        _id: 'GWC-MONGO-1',
        gatewayContextId: 'GWC-TEST-REPLAY',
        organisationId: 'ORG-ZAMORIN',
        cafeId: 'ZC-0001',
        accessMethod: 'QR',
        status: 'ACTIVE',
        consumed: false,
        expiresAt: new Date(Date.now() + 60_000),
      });
    }
    return {
      lean: async () => ({
        gatewayContextId: 'GWC-TEST-REPLAY',
        status: 'CONSUMED',
        consumed: true,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    };
  };
  CafeGatewayContext.findOneAndUpdate = async () => null;

  try {
    await assert.rejects(
      async () => operatorSessionService.signInOperator({
        organisationId: 'ORG-ZAMORIN',
        gatewayContextToken: 'GWC-TEST-REPLAY',
        operatorUserId: 'EMP-0001',
      }),
      (err) => err.code === 'GATEWAY_CONTEXT_CONSUMED' && err.statusCode === 401
    );
  } finally {
    CafeGatewayContext.findOne = originals.findOne;
    CafeGatewayContext.findOneAndUpdate = originals.findOneAndUpdate;
  }
});

