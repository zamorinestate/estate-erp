'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('P2 multi-cafe isolation evidence is part of the canonical regression gate', () => {
  const packageJson = JSON.parse(read('backend/package.json'));
  const command = packageJson.scripts?.test || '';

  for (const suite of [
    'test/attendanceOperationsSecurity.test.js',
    'test/payrollAccessApi.test.js',
    'test/cafeOperationsP0Remediation.test.js',
    'test/acp03MultiCafeOperationalSimulation.test.js',
  ]) {
    assert.equal(command.includes(suite), true, suite + ' must remain in canonical npm test');
  }
});

test('P2 same-organisation cross-cafe attack cases remain explicit in source', () => {
  const attendance = read('backend/test/attendanceOperationsSecurity.test.js');
  assert.match(attendance, /scoped strictly to assigned cafe/i);
  assert.match(attendance, /CAFE_ACCESS_DENIED/);

  const payroll = read('backend/test/payrollAccessApi.test.js');
  assert.match(payroll, /OWNER payroll listing is restricted to assigned cafes/);
  assert.match(payroll, /OWNER cannot create payroll for an unassigned cafe/);

  const cafeOps = read('backend/test/cafeOperationsP0Remediation.test.js');
  assert.match(cafeOps, /foreign cafe expense creation is REJECTED with 403/i);
  assert.match(cafeOps, /cross-café query tampering is REJECTED with 403/i);

  const simulation = read('backend/test/acp03MultiCafeOperationalSimulation.test.js');
  assert.match(simulation, /zero authority over Café B/i);
  assert.match(simulation, /without cross-café contamination/i);
  assert.match(simulation, /Cross-café direct document access is blocked/i);
});

test('P2 tenant isolation continues to cover cross-organisation object-level authorization', () => {
  const regression = read('backend/test/rec11CrossRoleFinalRegression.test.js');
  assert.match(regression, /Cross-Organisation IDOR/i);
  assert.match(regression, /Organisation-ID Tamper/i);
  assert.match(regression, /Record-ID Tamper/i);
});
