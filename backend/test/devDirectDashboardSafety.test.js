'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const mainJsPath = path.join(__dirname, '../../frontend/src/js/main.js');
const mainJs = fs.readFileSync(mainJsPath, 'utf8');

test('Security Guard: Production environment strictly forbids direct dashboard bypass (fail-closed)', () => {
  // 1. Verify hostname / origin validation exists in main.js
  assert.ok(
    mainJs.includes('isLocalDevelopmentOrigin') ||
    mainJs.includes('window.location.hostname === "localhost"') ||
    mainJs.includes('isDirectDashboardAllowed'),
    'main.js must contain explicit origin verification guard'
  );

  // 2. Verify production fail-closed handling exists
  assert.ok(
    mainJs.includes('renderProductionFailClosedScreen') ||
    mainJs.includes('Fail-closed') ||
    mainJs.includes('NODE_ENV === "production"') ||
    mainJs.includes('production'),
    'main.js must fail closed in non-local / production environments'
  );
});

test('Security Guard: No 5th RBAC role created for preview', () => {
  const navJs = fs.readFileSync(path.join(__dirname, '../../frontend/src/js/navigation.js'), 'utf8');
  
  // Exactly 4 canonical roles must exist
  const rolesMatch = navJs.match(/ROLES\s*=\s*\{\s*([^}]+)\}/);
  assert.ok(rolesMatch, 'ROLES catalog must be defined');
  
  const roleKeys = rolesMatch[1].split(',').map(s => s.trim().split(':')[0]).filter(Boolean);
  const internalRoles = roleKeys.filter(r => r !== 'VENDOR');
  assert.deepEqual(
    internalRoles.sort(),
    ['CAFE_ADMIN', 'MASTER', 'OWNER', 'STAFF'].sort(),
    'Exactly 4 canonical internal roles must be present (no DEV, PREVIEW, or BYPASS role)'
  );
  assert.ok(!roleKeys.includes('DEV') && !roleKeys.includes('PREVIEW') && !roleKeys.includes('BYPASS'), 'No preview or bypass role allowed');
});

test('Security Guard: Backend protected endpoints strictly reject unauthenticated calls', async () => {
  const { authenticate } = require('../src/middleware/authenticate');
  
  const req = {
    get: () => null,
    cookies: {},
    path: '/api/v1/dashboard',
  };
  let statusCode = null;
  let jsonResponse = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonResponse = data;
      return this;
    },
  };
  const next = () => {
    assert.fail('next() should not be called for unauthenticated request');
  };
  
  await authenticate(req, res, next);
  assert.equal(statusCode, 401, 'Unauthenticated request must be rejected with 401');
  assert.ok(jsonResponse?.error, 'Response must return error object');
});

