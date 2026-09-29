'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..');
const srcRoot = path.join(backendRoot, 'src');

function readSource(relativePath) {
  return fs.readFileSync(path.join(srcRoot, relativePath), 'utf8');
}

test('FINAL POS FINANCIAL GATE — canonical CI executes every authoritative settlement/reconciliation suite', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(backendRoot, 'package.json'), 'utf8')
  );
  const canonicalTestCommand = pkg.scripts.test;

  const requiredSuites = [
    'test/rec04aTransactionIntegrityCertification.test.js',
    'test/rec04bDistributedIdempotencyReconciliation.test.js',
    'test/recoveryPosSavePrintReprintLifecycle.test.js',
    'test/posCanonicalSettlementInvariant.test.js',
    'test/posRegisterScopeInvariant.test.js',
    'test/posReconciliationInvariant.test.js',
    'test/posReconciliationViewAuthorityInvariant.test.js',
    'test/posOfflineFinancialSafety.test.js',
    'test/posOfflineReviewHttpBoundary.test.js',
    'test/pm05R1FinancialAtomicity.test.js',
    'test/posFinalReceiptLineageGate.test.js',
    'test/posFinalFinancialIntegrityGate.test.js',
  ];

  for (const suite of requiredSuites) {
    assert.match(
      canonicalTestCommand,
      new RegExp(suite.replace(/[.*+?^$()|[\]{}]/g, '\\$&')),
      `${suite} must remain part of the canonical backend CI command`
    );
  }
});

test('FINAL POS FINANCIAL GATE — server-authoritative pricing, exact settlement and statutory allocation remain canonical', () => {
  const pos = readSource('services/posOrderService.js');
  const gst = readSource('services/gstTaxService.js');

  assert.match(pos, /MenuItem\.find\(/, 'catalog data must remain server-authoritative');
  assert.match(pos, /PAYMENT_SETTLEMENT_MISMATCH/);
  assert.match(pos, /tenderTotalPaisa\s*!==\s*totals\.totalPaisa/);
  assert.match(pos, /calculateCustomerPayableRounding50P/);
  assert.match(pos, /allocateInvoiceNumber/);
  assert.match(pos, /cashPaidPaisa/);
  assert.match(pos, /upiPaidPaisa/);
  assert.match(pos, /cardPaidPaisa/);
  assert.match(pos, /IdempotencyRecord/);
  assert.match(pos, /PosReconciliationService/);

  assert.match(gst, /SequenceCounter/);
  assert.match(gst, /financialYear/);
  assert.match(gst, /invoiceNumber/);
});

test('FINAL POS FINANCIAL GATE — offline state cannot manufacture a final sale or statutory invoice', () => {
  const offline = readSource('services/offlineSyncService.js');
  const pos = readSource('services/posOrderService.js');

  assert.match(offline, /LOCAL_DRAFT_ALLOWED/);
  assert.match(offline, /REVIEW_REQUIRED|SERVER_POST_REQUIRED|SYNC/i);
  assert.doesNotMatch(
    offline,
    /invoiceNumber\s*=\s*[\`'"][^\`'"]*[\`'"]/,
    'offline sync policy must not locally allocate a final statutory invoice'
  );
  assert.match(pos, /BILL_ID_REQUIRED/);
  assert.match(pos, /BILL_NOT_FOUND/);
});

test('FINAL POS FINANCIAL GATE — register and reconciliation identity remain fully scoped', () => {
  const pos = readSource('services/posOrderService.js');
  const reconciliation = readSource('services/posReconciliationService.js');

  assert.match(pos, /organisationId/);
  assert.match(pos, /cafeId/);
  assert.match(pos, /registerId/);

  assert.match(reconciliation, /organisationId/);
  assert.match(reconciliation, /cafeId/);
  assert.match(reconciliation, /billId/);
});

test('FINAL POS FINANCIAL GATE — print and drawer failure can never recreate or roll back the committed sale', () => {
  const pos = readSource('services/posOrderService.js');

  assert.match(pos, /THE TRANSACTION REMAINS COMMITTED/);
  assert.match(pos, /saleFinalized:\s*true/);
  assert.match(pos, /reprintAvailable:\s*true/);
  assert.match(pos, /allowDrawerKick:\s*false/);
});
