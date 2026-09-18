'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('OWNER has organisation-wide Approval scope while CAFE_ADMIN is assigned-cafe scoped', () => {
  const filePath = fs.existsSync('src/controllers/approvalController.js') ? 'src/controllers/approvalController.js' : path.resolve(__dirname, '../src/controllers/approvalController.js');
  const source = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    source.includes("!['MASTER', 'OWNER'].includes(request.auth.role)") &&
      source.includes("filter.cafeId = { $in: assigned };"),
    'listApprovals must constrain non-MASTER/OWNER to assigned cafes'
  );

  assert.ok(
    source.includes("request.auth.role === 'CAFE_ADMIN'") &&
      source.includes("!assigned.includes(approval.cafeId)"),
    'CAFE_ADMIN must not decide approvals outside assigned cafes or organisation-level approvals'
  );
});
