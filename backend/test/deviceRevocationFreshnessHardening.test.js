'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { DeviceRegistration } = require('../src/models/DeviceRegistration');
const deviceTrustService = require('../src/services/deviceTrustService');
const { attachDeviceContext } = require('../src/middleware/deviceContext');

function invokeMiddleware(req) {
  return new Promise((resolve, reject) => {
    attachDeviceContext(req, {}, (err) => err ? reject(err) : resolve());
  });
}

test('DEVICE-REV-001: general API device authorization re-reads durable ACTIVE status on every request', async () => {
  const originals = {
    findOne: DeviceRegistration.findOne,
    derive: deviceTrustService.derivePrivilegeProfile,
  };
  let dbReads = 0;
  DeviceRegistration.findOne = () => ({
    lean: async () => {
      dbReads += 1;
      return {
        deviceId: 'DEV-001',
        deviceClass: 'CAFE_OWNED',
        assignedCafeId: 'ZC-0001',
        status: 'ACTIVE',
        trustLevel: 'ENROLLED',
      };
    },
  });
  deviceTrustService.derivePrivilegeProfile = () => ({
    privilegeProfile: 'CAFE_OPERATIONS',
    isCafeOperationsAllowed: true,
    allowedCafeScope: ['ZC-0001'],
  });

  const makeReq = () => ({
    auth: { userId: 'EMP-001', role: 'CAFE_ADMIN', organisationId: 'ORG-ZAMORIN' },
    headers: { 'x-device-id': 'DEV-001' },
    params: { cafeId: 'ZC-0001' },
    query: {},
    body: {},
    session: null,
  });

  try {
    await invokeMiddleware(makeReq());
    await invokeMiddleware(makeReq());
    assert.equal(dbReads, 2, 'Every protected request must re-read canonical active-device state');
  } finally {
    DeviceRegistration.findOne = originals.findOne;
    deviceTrustService.derivePrivilegeProfile = originals.derive;
  }
});

test('DEVICE-REV-002: general API middleware contains no process-local active-device authorization cache', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/middleware/deviceContext.js'), 'utf8');
  assert.equal(source.includes('DEVICE_CACHE_TTL_MS'), false);
  assert.equal(source.includes('activeDeviceCache'), false);
  assert.ok(source.includes("status: 'ACTIVE'"));
});

test('DEVICE-REV-003: Café Operations middleware requires canonical device registration and does not swallow lookup errors', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/cafe-operations/middleware/deviceContext.js'), 'utf8');
  const start = source.indexOf('// Canonical DeviceRegistration is mandatory');
  const end = source.indexOf('await repos.devices.touchLastSeen', start);
  const block = source.slice(start, end);

  assert.ok(block.includes('DEVICE_CANONICAL_REGISTRATION_REQUIRED'));
  assert.ok(block.includes("canonical.status !== 'ACTIVE'"));
  assert.ok(block.includes('await DeviceRegistration.findOne'));
  assert.equal(block.includes('catch (err)'), false);
  assert.equal(block.includes('Ignore DB connection errors'), false);
});

test('DEVICE-REV-004: enrollment treats canonical DeviceRegistration creation as mandatory with compensation', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/cafe-operations/services/deviceService.js'), 'utf8');
  const start = source.indexOf("const { DeviceRegistration } = require('../../models/DeviceRegistration')");
  const end = source.indexOf('logSecurityEvent', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('DeviceRegistration.findOneAndUpdate'));
  assert.ok(block.includes('DeviceRegistration.deleteOne'));
  assert.ok(block.includes('repos.devices.delete'));
  assert.ok(block.includes('restoreIfUsedByDevice'));
  assert.ok(block.includes('CANONICAL_DEVICE_REGISTRATION_FAILED'));
});
