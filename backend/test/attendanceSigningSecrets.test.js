'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getQrSigningSecret,
  getAttendanceTokenSecret,
  validateAttendanceSecretPair,
  isUnsafeAttendanceSecret,
  fingerprint,
  RETIRED_SECRET_FINGERPRINTS,
} = require('../src/config/attendanceSecurityConfig');
const { validateStartupConfiguration } = require('../src/config/startupValidator');

const GOOD_QR_SECRET = 'Q'.repeat(48);
const GOOD_TOKEN_SECRET = 'T'.repeat(48);

function productionEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    PORT: '4000',
    MONGODB_URI: 'mongodb://localhost:27017/zamorin_config_test',
    JWT_ACCESS_SECRET: 'J'.repeat(48),
    MFA_ENCRYPTION_KEY: 'a'.repeat(64),
    QR_SIGNING_SECRET: GOOD_QR_SECRET,
    ATTENDANCE_QR_SECRET: GOOD_TOKEN_SECRET,
    DOCUMENT_STORAGE_DRIVER: 'RENDER_PERSISTENT_DISK',
    DOCUMENT_STORAGE_ROOT: '/var/data/zamorin_documents',
    ALLOWED_ORIGINS: 'https://app.example.invalid',
    ...overrides,
  };
}

test('ATT-SECRET-001: development/test derives stable non-production secrets without environment values', () => {
  const env = { NODE_ENV: 'test' };
  const qrOne = getQrSigningSecret(env);
  const qrTwo = getQrSigningSecret(env);
  const token = getAttendanceTokenSecret(env);

  assert.equal(qrOne, qrTwo);
  assert.notEqual(qrOne, token);
  assert.ok(qrOne.length >= 32);
  assert.ok(token.length >= 32);
});

test('ATT-SECRET-002: production resolver rejects missing attendance signing secrets', () => {
  assert.throws(
    () => getQrSigningSecret({ NODE_ENV: 'production' }),
    (error) => error.code === 'ATTENDANCE_SECURITY_SECRET_REQUIRED'
  );
  assert.throws(
    () => getAttendanceTokenSecret({ NODE_ENV: 'production' }),
    (error) => error.code === 'ATTENDANCE_SECURITY_SECRET_REQUIRED'
  );
});

test('ATT-SECRET-003: production resolver rejects weak and identical secrets', () => {
  assert.equal(isUnsafeAttendanceSecret('short'), true);

  assert.throws(
    () => validateAttendanceSecretPair({
      NODE_ENV: 'production',
      QR_SIGNING_SECRET: GOOD_QR_SECRET,
      ATTENDANCE_QR_SECRET: GOOD_QR_SECRET,
    }),
    (error) => error.code === 'ATTENDANCE_SECURITY_SECRETS_NOT_DISTINCT'
  );
});

test('ATT-SECRET-004: startup validator requires both distinct attendance secrets in production', () => {
  const valid = validateStartupConfiguration(productionEnv(), { failClosed: false });
  assert.equal(valid.isSafe, true);

  const missingQr = validateStartupConfiguration(
    productionEnv({ QR_SIGNING_SECRET: '' }),
    { failClosed: false }
  );
  assert.equal(missingQr.isSafe, false);
  assert.ok(missingQr.blockingIssues.some((entry) => entry.includes('QR_SIGNING_SECRET')));

  const identical = validateStartupConfiguration(
    productionEnv({ ATTENDANCE_QR_SECRET: GOOD_QR_SECRET }),
    { failClosed: false }
  );
  assert.equal(identical.isSafe, false);
  assert.ok(identical.blockingIssues.some((entry) => entry.includes('must be distinct')));
});

test('ATT-SECRET-005: retired fallback fingerprints stay blocked and service has no env-or fallback expression', () => {
  assert.ok(RETIRED_SECRET_FINGERPRINTS.size >= 2);
  for (const retiredFingerprint of RETIRED_SECRET_FINGERPRINTS) {
    assert.match(retiredFingerprint, /^[0-9a-f]{64}$/);
  }

  const service = fs.readFileSync(
    path.join(__dirname, '../src/services/attendanceQrService.js'),
    'utf8'
  );
  assert.equal(service.includes('process.env.ATTENDANCE_QR_SECRET ||'), false);
  assert.equal(service.includes('process.env.QR_SIGNING_SECRET ||'), false);

  assert.equal(RETIRED_SECRET_FINGERPRINTS.has(fingerprint(GOOD_QR_SECRET)), false);
  assert.equal(RETIRED_SECRET_FINGERPRINTS.has(fingerprint(GOOD_TOKEN_SECRET)), false);
});
