'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const mainSource = fs.readFileSync(path.join(root, 'frontend/src/js/main.js'), 'utf8');
const loginSource = fs.readFileSync(path.join(root, 'frontend/src/js/pages/login2.js'), 'utf8');
const apiClientSource = fs.readFileSync(path.join(root, 'frontend/src/js/apiClient.js'), 'utf8');
const authControllerSource = fs.readFileSync(path.join(root, 'backend/src/controllers/authController.js'), 'utf8');
const authServiceSource = fs.readFileSync(path.join(root, 'backend/src/services/authService.js'), 'utf8');

test('AUTH-REC-001: frontend contains no embedded DEV_CREDENTIALS login secret map', () => {
  assert.equal(mainSource.includes('DEV_CREDENTIALS'), false);
  assert.equal(/password\s*:\s*["'][^"']+["']/.test(mainSource.slice(mainSource.indexOf('Local development / automated testing persona resolution'))), false);
});

test('AUTH-REC-002: password recovery endpoints are excluded from refresh retry using live route names', () => {
  assert.ok(apiClientSource.includes('"/auth/password/forgot"'));
  assert.ok(apiClientSource.includes('"/auth/password/reset/verify"'));
  assert.ok(apiClientSource.includes('"/auth/password/reset"'));
  assert.equal(apiClientSource.includes('"/auth/password/reset-request"'), false);
  assert.equal(apiClientSource.includes('"/auth/password/reset-verify"'), false);
});

test('AUTH-REC-003: MFA challenge response never returns a server-generated TOTP autoCode', () => {
  const loginStart = authControllerSource.indexOf('const login = asyncHandler');
  const appPinStart = authControllerSource.indexOf('const TRIVIAL_SIX_DIGIT_PINS', loginStart);
  const loginBlock = authControllerSource.slice(loginStart, appPinStart);
  assert.equal(loginBlock.includes('autoCode'), false);
});

test('AUTH-REC-004: failed login UI gives generic recovery guidance without disclosing account state', () => {
  assert.ok(loginSource.includes('use Forgot Password to restore access'));
  assert.equal(loginSource.includes('This account is temporarily locked'), false);
});

test('AUTH-REC-005: password reset clears failed-attempt lock state and invalidates existing sessions', () => {
  assert.ok(authControllerSource.includes('user.failedLoginAttempts = 0;'));
  assert.ok(authControllerSource.includes('user.lockedUntil = null;'));
  assert.ok(authControllerSource.includes("if (temporaryLock) user.accountStatus = 'ACTIVE';"));
  assert.ok(authControllerSource.includes("reason: 'PASSWORD_RESET'"));
});

test('AUTH-REC-006: password authentication retains bounded lockout policy', () => {
  assert.ok(authServiceSource.includes('MAX_FAILED_LOGIN_ATTEMPTS = 5'));
  assert.ok(authServiceSource.includes('TEMPORARY_LOCK_MINUTES = 15'));
});
