'use strict';\n\nconst test = require('node:test');\nconst assert = require('node:assert/strict');\nconst fs = require('node:fs');\nconst path = require('node:path');\n\nconst source = fs.readFileSync(\n  path.join(__dirname, '../src/controllers/expenseController.js'),\n  'utf8'\n);\n\ntest('EXP-TRUTH-001: marking an expense paid requires external payment evidence', () => {\n  const start = source.indexOf('const markExpensePaid = asyncHandler');\n  const end = source.indexOf('// 12. Reverse Expense', start);\n  const block = source.slice(start, end);\n  assert.ok(block.includes('PAYMENT_REFERENCE_REQUIRED'));\n  assert.ok(block.includes('EXPENSE_ALREADY_PAID'));\n  assert.ok(block.includes('INVALID_PAID_AT'));\n});\n\ntest('EXP-TRUTH-002: expense payment does not fabricate General Ledger posting', () => {\n  const start = source.indexOf('const markExpensePaid = asyncHandler');\n  const end = source.indexOf('// 12. Reverse Expense', start);\n  const block = source.slice(start, end);\n  assert.ok(block.includes("postingStatus: 'PAYMENT_RECORDED_GL_NOT_VERIFIED'"));\n  assert.ok(block.includes("glPostingStatus: 'NOT_VERIFIED'"));\n  assert.equal(block.includes("postingStatus: 'POSTED'"), false);\n});\n

test('EXP-TRUTH-003: spend request policy and advance IDs do not use count-derived next numbers', () => {
  const requestStart = source.indexOf('const createExpenseRequest = asyncHandler');
  const policyStart = source.indexOf('const createExpensePolicy = asyncHandler');
  const advanceStart = source.indexOf('const createOperationalAdvance = asyncHandler');
  const end = source.indexOf('module.exports', advanceStart);

  const requestBlock = source.slice(requestStart, policyStart);
  const policyBlock = source.slice(policyStart, advanceStart);
  const advanceBlock = source.slice(advanceStart, end);

  for (const [name, block] of [
    ['request', requestBlock],
    ['policy', policyBlock],
    ['advance', advanceBlock],
  ]) {
    assert.ok(block.includes('SequenceCounter.generateId'), name);
    assert.equal(block.includes('countDocuments'), false, name);
  }

  assert.ok(requestBlock.includes('EXPENSE_REQUEST_'));
  assert.ok(policyBlock.includes('EXPENSE_POLICY_'));
  assert.ok(advanceBlock.includes('OPERATIONAL_ADVANCE_'));
});

