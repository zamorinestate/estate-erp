'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const cafeService = fs.readFileSync(path.resolve(__dirname, '../src/services/cafeService.js'), 'utf8');
const universalQr = fs.readFileSync(path.resolve(__dirname, '../src/services/universalQrService.js'), 'utf8');
const accessController = fs.readFileSync(path.resolve(__dirname, '../src/controllers/cafeAccessController.js'), 'utf8');

test('Café QR uses the canonical cafe-access gateway and public origin', () => {
  assert.doesNotMatch(cafeService, /https:\/\/zamorin\.app\/cafe\//,
    'Café login QR routes must not hard-code the production host or legacy route');
  assert.match(cafeService, /cafe-access\/qr/);
  assert.match(cafeService, /getPublicAppOrigin\(\)/);
  assert.match(universalQr, /payloadOverride = null/);
  assert.match(universalQr, /if \(payloadOverride\)/);
});

test('QR and login-link credentials remain distinct canonical gateway routes', () => {
  assert.match(cafeService, /qrUrl:[\s\S]*cafe-access\/qr/);
  assert.match(cafeService, /linkUrl:[\s\S]*cafe-access\/link/);
  assert.match(cafeService, /dedicatedLoginUrl:[\s\S]*cafe-access\/link/);
});

test('Café-access governance accepts Primary Master, not a generic MASTER token', () => {
  assert.match(accessController, /role === 'MASTER' && req\.auth\.isPrimaryMaster === true/);
  assert.match(accessController, /PRIMARY_MASTER_AUTHORITY_REQUIRED/);
});

test('printable Café QR never creates an alternate credential on demand', () => {
  assert.match(cafeService, /CAFE_QR_RECORD_MISSING/);
  assert.doesNotMatch(
    cafeService,
    /\/\/ Create on-demand[\s\S]{0,500}UniversalQrService\.createQrRecord/,
    'Printable QR repair must not invent a second gateway identity'
  );
});
