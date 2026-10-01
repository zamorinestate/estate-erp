'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { RegisterSession } = require('../src/models/RegisterSession');

const BACKEND = path.resolve(__dirname, '../src');
const FRONTEND = path.resolve(__dirname, '../../frontend/src');

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('POS register scope has no invented register or tenant defaults', () => {
  const posService = read(BACKEND, 'services/posOrderService.js');
  const reconciliation = read(BACKEND, 'services/posReconciliationService.js');
  const offlineSync = read(BACKEND, 'services/offlineSyncService.js');
  const billController = read(BACKEND, 'controllers/billController.js');
  const posTill = read(FRONTEND, 'js/pages/posTill.js');

  for (const [name, source] of [
    ['posOrderService', posService],
    ['posReconciliationService', reconciliation],
    ['offlineSyncService', offlineSync],
    ['billController', billController],
    ['posTill', posTill],
  ]) {
    assert.equal(
      /\|\|\s*['"]REG-01['"]/.test(source),
      false,
      `${name} must not invent REG-01 as a runtime fallback`
    );
  }

  assert.equal(
    /organisationId\s*:\s*authContext\.organisationId\s*\|\|/.test(posService),
    false,
    'POS bill lookups must not fall back to a fabricated organisation'
  );

  assert.equal(
    /registerSessionId\s*:\s*tx\.registerSessionId\s*\|\|\s*operatorSessionId/.test(offlineSync),
    false,
    'OperatorSession and RegisterSession identities must never be conflated'
  );

  assert.equal(
    /apiPost\(\s*["']\/bills["']\s*,\s*payload\s*\)/.test(posTill),
    false,
    'POS frontend must not fall back to the legacy /bills settlement path'
  );
});

test('register session lookups carry organisation, café and register scope', () => {
  const posService = read(BACKEND, 'services/posOrderService.js');
  const billController = read(BACKEND, 'controllers/billController.js');

  assert.match(posService, /registerSessionId[\s\S]*organisationId:\s*orgId[\s\S]*cafeId[\s\S]*registerId[\s\S]*status:\s*['"]OPEN['"]/);
  assert.match(billController, /registerSessionId:\s*cleanRegisterSessionId[\s\S]*organisationId:\s*request\.auth\.organisationId[\s\S]*cafeId[\s\S]*registerId:\s*cleanRegisterId[\s\S]*status:\s*['"]OPEN['"]/);
});

test('only one OPEN register session may exist per organisation/café/register', () => {
  const matchingIndex = RegisterSession.schema.indexes().find(([spec, options]) => (
    spec.organisationId === 1 &&
    spec.cafeId === 1 &&
    spec.registerId === 1 &&
    options?.unique === true &&
    options?.partialFilterExpression?.status === 'OPEN'
  ));

  assert.ok(
    matchingIndex,
    'RegisterSession must enforce a unique OPEN-session index per organisation/café/register'
  );
});
