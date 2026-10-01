'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { generateSixDigitPin } = require('../src/utils/secureRandom');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

test('ATT-QR-CRYPTO-001: fallback attendance PIN is always six decimal digits', () => {
  for (let i = 0; i < 250; i += 1) {
    const pin = generateSixDigitPin();
    assert.match(pin, /^\d{6}$/);
    const numeric = Number(pin);
    assert.ok(numeric >= 100000 && numeric <= 999999);
  }
});

test('ATT-QR-CRYPTO-002: attendance QR production paths never use Math.random for fallback PINs', () => {
  const service = read('../src/services/attendanceQrService.js');
  const model = read('../src/models/AttendanceQrChallenge.js');
  const util = read('../src/utils/secureRandom.js');

  assert.equal(service.includes('Math.random()'), false);
  assert.equal(model.includes('Math.random()'), false);
  assert.ok(service.includes('generateSixDigitPin()'));
  assert.ok(model.includes('default: generateSixDigitPin'));
  assert.ok(util.includes('crypto.randomInt(100000, 1000000)'));
});
