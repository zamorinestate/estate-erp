'use strict';\n\nconst test = require('node:test');\nconst assert = require('node:assert/strict');\nconst fs = require('node:fs');\nconst path = require('node:path');\n\nconst financePath = path.join(__dirname, '../src/controllers/financeController.js');\n\nfunction source() {\n  return fs.readFileSync(financePath, 'utf8');\n}\n\ntest('FIN-TRUTH-001: finance statements contain no fixed August 2026 P&L or balance-sheet figures', () => {\n  const text = source();\n  for (const forbidden of [\n    'beverageSalesPaisa: 82000000',\n    'foodSalesPaisa: 34000000',\n    'retailMerchandisePaisa: 10000000',\n    'totalRevenuePaisa: 126000000',\n    'totalCogsPaisa: 40000000',\n    'grossProfitPaisa: 86000000',\n    'netOperatingProfitPaisa: 28000000',\n    'totalAssetsPaisa: 214000000',\n    'retainedEarningsPaisa: 169700000',\n  ]) {\n    assert.equal(text.includes(forbidden), false, forbidden);\n  }\n  assert.ok(text.includes('POSTED_ACCOUNTING_JOURNALS'));\n  assert.ok(text.includes('UNAVAILABLE_NO_POSTED_COGS'));\n});\n\ntest('FIN-TRUTH-002: budget endpoint uses BudgetPlan instead of fixed category amounts', () => {\n  const text = source();\n  const start = text.indexOf('const getBudgetsAndAllocations');\n  const end = text.indexOf('// 11. Tax & Statutory Review', start);\n  const block = text.slice(start, end);\n  assert.ok(block.includes('BudgetPlan.find'));\n  assert.ok(block.includes('AUTHORITATIVE_BUDGET_PLAN'));\n  assert.equal(block.includes('monthlyBudgetPaisa: 50000000'), false);\n  assert.equal(block.includes('actualPaisa: 32000000'), false);\n});\n\ntest('FIN-TRUTH-003: tax review derives outward GST from TaxInvoice and does not certify unavailable sources', () => {\n  const text = source();\n  const start = text.indexOf('const getTaxReview');\n  const end = text.indexOf('// 12. Period Close Workflow', start);\n  const block = text.slice(start, end);\n  assert.ok(block.includes('TaxInvoice.find'));\n  assert.ok(block.includes("filingReadiness: 'NOT_VERIFIED'"));\n  assert.ok(block.includes("gstr2bReconciliation: {\n        status: 'UNAVAILABLE'"));\n  assert.ok(block.includes("tdsRegister: {\n        status: 'UNAVAILABLE'"));\n  assert.equal(block.includes("gstr1Readiness: { status: 'READY'"), false);\n});\n\ntest('FIN-TRUTH-004: period close is evidence-based and cannot default to completed', () => {\n  const text = source();\n  assert.ok(text.includes('buildPeriodCloseAssessment'));\n  assert.ok(text.includes('PERIOD_CLOSE_CONTROLS_INCOMPLETE'));\n  assert.ok(text.includes('PERIOD_CLOSE_SIGNOFF_REQUIRED'));\n  assert.ok(text.includes("request.auth.isPrimaryMaster !== true"));\n  assert.equal(text.includes("{ task: 'POS & Billing Completeness', status: 'COMPLETED', blocker: false }"), false);\n  assert.equal(text.includes('readyToClose: true'), false);\n});\n\ntest('FIN-TRUTH-005: financial period close uses cryptographic trial-balance hash and expected-state mutation', () => {\n  const text = source();\n  const start = text.indexOf('const closeFinancialPeriod');\n  const end = text.indexOf('const reopenFinancialPeriod', start);\n  const block = text.slice(start, end);\n  assert.ok(block.includes("crypto.createHash('sha256')"));\n  assert.ok(block.includes('FinancialPeriod.findOneAndUpdate'));\n  assert.ok(block.includes('status: period.status'));\n  assert.equal(block.includes('`TB-HASH-${Date.now()}`'), false);\n});\n\ntest('FIN-TRUTH-006: COGS and gross profit remain unavailable until posted cost-of-sales lines exist', () => {\n  const text = source();\n  const start = text.indexOf('async function getPostedLedgerStatement');\n  const end = text.indexOf('// 12. Period Close Workflow', start);\n  const block = text.slice(start, end);\n  assert.ok(block.includes("account.accountGroup || '').toUpperCase() === 'COST_OF_SALES'"));\n  assert.ok(block.includes("status: cogsAvailable ? 'AVAILABLE' : 'UNAVAILABLE_NO_POSTED_COGS'"));\n  assert.ok(block.includes('grossProfitPaisa ='));\n});\n

test('FIN-TRUTH-007: journal posting revalidates balance and active account mapping at execution time', () => {
  const text = source();
  const start = text.indexOf('const postJournal = asyncHandler');
  const end = text.indexOf('const reverseJournal = asyncHandler', start);
  const block = text.slice(start, end);

  assert.ok(block.includes('JOURNAL_LINE_INVALID'));
  assert.ok(block.includes('UNBALANCED_JOURNAL'));
  assert.ok(block.includes('JOURNAL_ACCOUNT_UNAVAILABLE'));
  assert.ok(block.includes("status: 'ACTIVE'"));
  assert.ok(block.includes("isPostingAllowed: { $ne: false }"));
});

test('FIN-TRUTH-008: journal posting uses expected-state atomic update and does not fake an independent checker', () => {
  const text = source();
  const start = text.indexOf('const postJournal = asyncHandler');
  const end = text.indexOf('const reverseJournal = asyncHandler', start);
  const block = text.slice(start, end);

  assert.ok(block.includes('Journal.findOneAndUpdate'));
  assert.ok(block.includes('status: journal.status'));
  assert.ok(block.includes('totalDebitPaisa: journal.totalDebitPaisa'));
  assert.ok(block.includes('JOURNAL_POST_STATE_CONFLICT'));
  assert.ok(block.includes('checkerUserId: null'));
  assert.ok(block.includes("makerCheckerStatus: 'NOT_CONFIGURED'"));
  assert.equal(block.includes('checkerUserId = userId'), false);
});

test('FIN-TRUTH-009: finance integrity reports measured coverage instead of claiming 18 checks evaluated', () => {
  const text = source();
  const start = text.indexOf('const getFinanceIntegrity = asyncHandler');
  const end = text.indexOf('POST /api/v1/finance/invoices/gst', start);
  const block = text.slice(start, end);

  assert.equal(block.includes('checksEvaluated: 18'), false);
  assert.ok(block.includes('coveragePercent'));
  assert.ok(block.includes('checksVerified'));
  assert.ok(block.includes("sourceStatus: 'EVIDENCE_BASED_PARTIAL_COVERAGE'"));
  assert.ok(block.includes("['JOURNAL_MAKER_CHECKER'"));
  assert.ok(block.includes("'NOT_VERIFIED'"));
});

test('FIN-TRUTH-010: AP-to-GL and duplicate source posting are evidence-based integrity checks', () => {
  const text = source();
  const start = text.indexOf('const getFinanceIntegrity = asyncHandler');
  const end = text.indexOf('POST /api/v1/finance/invoices/gst', start);
  const block = text.slice(start, end);

  assert.ok(block.includes('AP_SUBLEDGER_TO_GL'));
  assert.ok(block.includes("controlAccountType === 'ACCOUNTS_PAYABLE'"));
  assert.ok(block.includes('DUPLICATE_SOURCE_POSTING'));
  assert.ok(block.includes('sourceReferenceId'));
  assert.ok(block.includes('POSTED_ACCOUNT_MAPPING'));
});

test('FIN-TRUTH-011: AP payment-run approval enforces maker-checker for every role and Café Admin scope', () => {
  const text = source();
  const start = text.indexOf('const decidePaymentRun = asyncHandler');
  const end = text.indexOf('const executePaymentRun = asyncHandler', start);
  const block = text.slice(start, end);

  assert.ok(block.includes('normalizeFinanceId(run.makerUserId) === normalizeFinanceId(userId)'));
  assert.ok(block.includes('MAKER_CHECKER_VIOLATION'));
  assert.ok(block.includes('PAYMENT_RUN_CAFE_SCOPE_DENIED'));
  assert.ok(block.includes('request.auth.assignedCafeIds'));
  assert.equal(block.includes("run.makerUserId === userId && request.auth.role === 'CAFE_ADMIN'"), false);
});

test('FIN-TRUTH-012: AP execution requires exact authoritative passbook bank debit', () => {
  const text = source();
  const start = text.indexOf('const executePaymentRun = asyncHandler');
  const end = text.indexOf('// 7. Accounts Receivable', start);
  const block = text.slice(start, end);

  assert.ok(block.includes('PassbookAccount.findOne'));
  assert.ok(block.includes("accountType: 'BANK_OPERATING'"));
  assert.ok(block.includes('PassbookTransaction.findOne'));
  assert.ok(block.includes("direction: 'DEBIT'"));
  assert.ok(block.includes("status: { $in: ['POSTED', 'CLEARED'] }"));
  assert.ok(block.includes('amountPaisa: payableTotalPaisa'));
  assert.ok(block.includes('PAYMENT_BANK_DEBIT_NOT_VERIFIED'));
  assert.ok(block.includes('PAYMENT_BANK_DEBIT_ALREADY_APPLIED'));
  assert.ok(block.includes('PAYMENT_BANK_DEBIT_CAFE_SCOPE_MISMATCH'));
});

test('FIN-TRUTH-013: AP payment history and PaymentRun schemas persist canonical bank transaction IDs', () => {
  const apInvoice = fs.readFileSync(path.join(__dirname, '../src/models/APInvoice.js'), 'utf8');
  const paymentRun = fs.readFileSync(path.join(__dirname, '../src/models/PaymentRun.js'), 'utf8');

  assert.ok(apInvoice.includes('bankTransactionId'));
  assert.ok(paymentRun.includes('bankTransactionId'));
  assert.ok(paymentRun.includes('index: true'));
});

