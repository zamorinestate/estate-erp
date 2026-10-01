'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../src/services/posReconciliationService.js'),
  'utf8'
);

test('reconciliation job identity is organisation-scoped', () => {
  assert.match(
    source,
    /RECJOB-\$\{orgId\}-\$\{bId\}-\$\{eType\}/,
    'Reconciliation job IDs must include organisation identity'
  );
});

test('cash-ledger dedupe is scoped to organisation, café and bill', () => {
  assert.match(
    source,
    /CashTransaction\.findOne\(\{[\s\S]*organisationId:[\s\S]*cafeId:[\s\S]*referenceId:\s*job\.billId[\s\S]*category:\s*['"]POS_SALE['"]/,
    'Cash ledger exactly-once lookup must be tenant and café scoped'
  );
});

test('BOM reconciliation updates only the scoped bill', () => {
  assert.match(
    source,
    /Bill\.findOneAndUpdate\(\s*\{[\s\S]*organisationId:[\s\S]*cafeId:[\s\S]*billId:\s*job\.billId/,
    'BOM recovery must never update a bill by billId alone'
  );
});

test('register reconciliation remains idempotent after session close', () => {
  assert.match(
    source,
    /const scope = \{[\s\S]*registerSessionId[\s\S]*organisationId:[\s\S]*cafeId:[\s\S]*registerId[\s\S]*\};/,
    'Register reconciliation must use the complete register scope'
  );
  assert.doesNotMatch(
    source,
    /const scope = \{[\s\S]{0,240}status:\s*['"]OPEN['"][\s\S]{0,80}\};/,
    'Reconciliation must not become impossible merely because the original register was subsequently closed'
  );
  assert.match(
    source,
    /existing\.status === ['"]CLOSED['"][\s\S]*adjustedExpectedCashPaisa[\s\S]*cashVariancePaisa/,
    'Closed-register cash reconciliation must repair expected cash and variance'
  );
  assert.match(
    source,
    /settledBillIds:\s*\{\s*\$ne:\s*job\.billId\s*\}/,
    'Register reconciliation must retain exactly-once settlement protection'
  );
});
