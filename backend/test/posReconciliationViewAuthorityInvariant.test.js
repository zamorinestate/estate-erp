'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const servicePath = path.join(__dirname, '..', 'src', 'services', 'posReconciliationService.js');
const controllerPath = path.join(__dirname, '..', 'src', 'controllers', 'posController.js');

test('REC-04B reconciliation queue reads require live canonical authority', () => {
  const source = fs.readFileSync(servicePath, 'utf8');

  const helperStart = source.indexOf('async function resolveReconciliationViewAuthority');
  const helperEnd = source.indexOf('\nclass PosReconciliationService', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'canonical reconciliation view authority helper must exist');

  const helper = source.slice(helperStart, helperEnd);
  assert.match(helper, /User\.findOne\(/);
  assert.match(helper, /PRIMARY_MASTER_AUTHORITY_REQUIRED/);
  assert.match(helper, /AUTHORIZATION_CONTEXT_STALE/);
  assert.match(helper, /CAFE_ACCESS_DENIED/);
  assert.match(helper, /DISABLED.*TERMINATED.*SUSPENDED.*DEACTIVATED.*ARCHIVED.*LOCKED.*EXITED/s);

  const methodStart = source.indexOf('static async getPendingReconciliations');
  const methodEnd = source.indexOf('\n  }\n}', methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart, 'getPendingReconciliations must exist');

  const method = source.slice(methodStart, methodEnd);
  assert.match(method, /resolveReconciliationViewAuthority\(\{ organisationId, cafeId \}, authContext\)/);
});

test('REC-04B controller passes authenticated context into reconciliation view authorization', () => {
  const source = fs.readFileSync(controllerPath, 'utf8');
  const start = source.indexOf('const getPendingReconciliations = asyncHandler');
  const end = source.indexOf('\n});', start);
  assert.ok(start >= 0 && end > start, 'getPendingReconciliations controller must exist');

  const block = source.slice(start, end);
  assert.match(block, /authContext:\s*request\.auth/);
});
