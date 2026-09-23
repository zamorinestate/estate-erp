'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PasswordResetChallenge,
} = require('../src/models/PasswordResetChallenge');

function makeChallenge(overrides = {}) {
  const now = Date.now();
  return new PasswordResetChallenge({
    challengeId: 'PRC-20260809-0001',
    organisationId: 'ORG-TEST',
    userId: 'ST-0001',
    codeHash: 'hashed-code',
    status: 'PENDING',
    verificationAttempts: 0,
    maxVerificationAttempts: 5,
    codeExpiresAt: new Date(now + 5 * 60 * 1000),
    resetTokenHash: 'hashed-reset-token',
    resetTokenExpiresAt: new Date(now + 15 * 60 * 1000),
    absoluteExpiresAt: new Date(now + 30 * 60 * 1000),
    ...overrides,
  });
}

test('password reset challenge JSON never exposes secret hashes', () => {
  const value = makeChallenge().toJSON();
  assert.equal(Object.hasOwn(value, 'codeHash'), false);
  assert.equal(Object.hasOwn(value, 'resetTokenHash'), false);
});

test('password reset challenge rejects expiry beyond absolute expiry', async () => {
  const now = Date.now();
  const challenge = makeChallenge({
    codeExpiresAt: new Date(now + 40 * 60 * 1000),
    absoluteExpiresAt: new Date(now + 30 * 60 * 1000),
  });
  await assert.rejects(() => challenge.validate(), /Code expiry must not exceed absolute expiry/);
});

test('password reset challenge has TTL cleanup index', () => {
  const ttlIndex = PasswordResetChallenge.schema.indexes().find(([fields, options]) =>
    fields.absoluteExpiresAt === 1 && options.expireAfterSeconds === 0
  );
  assert.ok(ttlIndex, 'absoluteExpiresAt TTL cleanup index is required');
});
