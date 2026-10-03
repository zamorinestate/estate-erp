const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const procurementPath = path.resolve(__dirname, '../../frontend/src/js/pages/procurement.js');
const source = fs.readFileSync(procurementPath, 'utf8');

function getOrderModalSource() {
  const start = source.indexOf('export async function openPlaceOrderRequestModal');
  const end = source.indexOf('\nexport function openNewPoModal', start);
  assert.ok(start >= 0, 'openPlaceOrderRequestModal must exist');
  assert.ok(end > start, 'openPlaceOrderRequestModal boundary must be discoverable');
  return source.slice(start, end);
}

test('procurement order modal uses server-authoritative master data only', () => {
  const modal = getOrderModalSource();

  assert.doesNotMatch(modal, /COMMON_CATALOGUE/);
  assert.doesNotMatch(modal, /__CUSTOM__/);
  assert.doesNotMatch(modal, /\bZC-0001\b/);
  assert.doesNotMatch(modal, /\bZC-0002\b/);
  assert.doesNotMatch(modal, /\bVEN-0001\b/);
  assert.doesNotMatch(modal, /\bVEN-0002\b/);
  assert.doesNotMatch(modal, /\bVEN-0003\b/);

  assert.match(modal, /apiGet\('\/vendors\?status=ACTIVE'\)/);
  assert.match(modal, /apiGet\('\/cafes'\)/);
  assert.match(modal, /\/procurement\/catalogue\?cafeId=/);
  assert.match(modal, /item\.approvedVendors/);
  assert.match(modal, /minimumOrderQuantity/);
});

test('procurement order submission revalidates catalogue authority immediately before POST', () => {
  const modal = getOrderModalSource();
  const submissionStart = modal.indexOf('async function handleOrderSubmission');
  assert.ok(submissionStart >= 0, 'submission handler must exist');

  const submission = modal.slice(submissionStart);
  const catalogueRead = submission.indexOf('/procurement/catalogue?cafeId=');
  const orderPost = submission.indexOf("apiPost('/procurement/orders'");

  assert.ok(catalogueRead >= 0, 'submission must refresh the server catalogue');
  assert.ok(orderPost > catalogueRead, 'catalogue refresh must occur before order POST');
  assert.match(submission, /vendorId === vendorId/);
  assert.match(submission, /unitPricePaisa:\s*Number\(/);
  assert.match(submission, /baseUnit:\s*offer\.uom \|\| item\.baseUnit/);
});
