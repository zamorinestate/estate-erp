'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const login = fs.readFileSync(path.join(__dirname, '../../frontend/src/js/pages/login2.js'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '../../frontend/src/js/main.js'), 'utf8');

test('password recovery exposes one canonical three-screen flow', () => {
  for (const name of [
    'renderPasswordResetRequest2',
    'wirePasswordResetRequest2',
    'renderPasswordResetVerify2',
    'wirePasswordResetVerify2',
    'renderPasswordResetFinal2',
    'wirePasswordResetFinal2',
  ]) {
    assert.equal((login.match(new RegExp(`export function ${name}\\(`, 'g')) || []).length, 1);
  }
  assert.ok(login.includes('id="l2-forgot-pwd-btn"'));
});

test('password recovery uses authoritative backend endpoints and verified credentials', () => {
  for (const endpoint of [
    'apiPost("/auth/password/forgot"',
    'apiPost("/auth/password/reset/verify"',
    'apiPost("/auth/password/reset"',
  ]) assert.ok(main.includes(endpoint));
  assert.ok(main.includes('const challengeId = result?.data?.challengeId;'));
  assert.ok(main.includes('const resetToken = result?.data?.resetToken;'));
});

test('recovery verification preserves generic account messaging and six digit code validation', () => {
  assert.ok(login.includes('Verification Code'));
  assert.ok(login.includes('pattern="[0-9]{6}"'));
  assert.ok(login.includes('code.length !== 6'));
});

test('final reset preserves the existing password and confirmation constraints', () => {
  for (const marker of [
    'minlength="12"',
    'maxlength="128"',
    '!/[a-z]/.test(newPassword)',
    '!/[A-Z]/.test(newPassword)',
    '!/[0-9]/.test(newPassword)',
    '!/[^A-Za-z0-9]/.test(newPassword)',
    'newPassword !== confirmPassword',
  ]) assert.ok(login.includes(marker));
});
