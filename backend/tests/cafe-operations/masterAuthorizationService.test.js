'use strict';
// Master spec Section 192 matrix rows that are about the pure authorization
// decision (org match / device state / active status) rather than the full
// HTTP round trip — those live in http-smoke.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateMasterCafeOperationsAccess } = require('../../src/cafe-operations/services/masterAuthorizationService');
const { DEVICE_STATUS } = require('../../src/cafe-operations/utils/constants');

const device = (o = {}) => ({ id: 'dev1', cafeId: 'cafeA', organisationId: 'orgA', lifecycleStatus: DEVICE_STATUS.ACTIVE, ...o });
const master = (o = {}) => ({ id: 'm1', isActive: true, organisationId: 'orgA', role: 'MASTER_PRIMARY', ...o });

test('Primary Master + Cafe A device, same org => PASS (no cafe-assignment lookup required)', () => {
  assert.equal(evaluateMasterCafeOperationsAccess({ device: device(), master: master() }).granted, true);
});

test('non-primary Master + Cafe A device, same org => DENIED', () => {
  const r = evaluateMasterCafeOperationsAccess({ device: device(), master: master({ role: 'MASTER' }) });
  assert.equal(r.granted, false);
  assert.equal(r.reason, 'MASTER_AUTH_FAILED');
});

test('Master from a different organisation on this device => DENIED (ORG_MISMATCH), not a cafe-scope question', () => {
  const r = evaluateMasterCafeOperationsAccess({ device: device({ organisationId: 'orgA' }), master: master({ organisationId: 'orgB' }) });
  assert.equal(r.granted, false);
  assert.equal(r.reason, 'ORG_MISMATCH');
});

test('inactive/suspended Master => DENIED', () => {
  const r = evaluateMasterCafeOperationsAccess({ device: device(), master: master({ isActive: false }) });
  assert.equal(r.granted, false);
  assert.equal(r.reason, 'MASTER_INACTIVE');
});

for (const status of ['REVOKED', 'LOST', 'RETIRED', 'REPLACED']) {
  test(`revoked cafe device denies Master too (${status})`, () => {
    const r = evaluateMasterCafeOperationsAccess({ device: device({ lifecycleStatus: status }), master: master() });
    assert.equal(r.granted, false);
    assert.equal(r.reason, 'DEVICE_NOT_ACTIVE');
  });
}

test('static check: the Master decision function never references an operator-access/grant lookup — the cafe boundary is enforced elsewhere (session creation), not here', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, '../../src/cafe-operations/services/masterAuthorizationService.js'), 'utf8');
  assert.doesNotMatch(source, /operatorAccess/i);
});
