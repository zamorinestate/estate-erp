'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const BACKEND = path.resolve(__dirname, '../src');

function read(relative) {
  return fs.readFileSync(path.join(BACKEND, relative), 'utf8');
}

test('all bill creation routes use the canonical POS commit pipeline', () => {
  const billRoutes = read('routes/billRoutes.js');

  assert.match(
    billRoutes,
    /router\.post\(['"]\/['"],\s*canonicalCommitOrder\)/,
    'POST /bills must be a compatibility alias to canonicalCommitOrder'
  );
  assert.match(
    billRoutes,
    /router\.post\(['"]\/commit['"],\s*canonicalCommitOrder\)/,
    'POST /bills/commit must use canonicalCommitOrder'
  );
  assert.doesNotMatch(
    billRoutes,
    /router\.post\(['"]\/['"],\s*createBill\)/,
    'Legacy createBill settlement must not be routable'
  );
});

test('post-hoc split settlement is retired', () => {
  const billRoutes = read('routes/billRoutes.js');

  assert.match(billRoutes, /LEGACY_POS_SETTLEMENT_RETIRED/);
  assert.doesNotMatch(
    billRoutes,
    /router\.post\(['"]\/:billId\/split['"],\s*splitBill\)/,
    'Legacy splitBill mutation must not be routable'
  );
});

test('canonical settlement enforces exact tender totals and method-derived side effects', () => {
  const posService = read('services/posOrderService.js');

  assert.match(posService, /tenderTotalPaisa\s*!==\s*totals\.totalPaisa/);
  assert.match(posService, /PAYMENT_SETTLEMENT_MISMATCH/);
  assert.match(posService, /cashPaidPaisa\s*=\s*tenders[\s\S]*paymentMethod\s*===\s*['"]CASH['"]/);
  assert.match(posService, /upiPaidPaisa\s*=\s*tenders[\s\S]*paymentMethod\s*===\s*['"]UPI['"]/);
  assert.match(posService, /cardPaidPaisa\s*=\s*tenders[\s\S]*paymentMethod\s*===\s*['"]CARD['"]/);
  assert.match(posService, /totalCashSalesPaisa:\s*cashPaidPaisa/);
  assert.match(posService, /totalUpiSalesPaisa:\s*upiPaidPaisa/);
  assert.match(posService, /totalCardSalesPaisa:\s*cardPaidPaisa/);
  assert.match(posService, /isImmediateCompletion\s*&&\s*cashPaidPaisa\s*>\s*0/);
  assert.match(posService, /amount:\s*cashPaidPaisa\s*\/\s*100/);
});
