'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  prepareAtlasServerEnvironment,
} = require('../src/scripts/startAtlasServer');

function validProductionEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/test',
    JWT_ACCESS_SECRET: 'J'.repeat(64),
    MFA_ENCRYPTION_KEY: 'a'.repeat(64),
    QR_SIGNING_SECRET: 'Q'.repeat(64),
    ATTENDANCE_QR_SECRET: 'A'.repeat(64),
    ALLOWED_ORIGINS: 'https://example.invalid',
    INITIAL_MASTER_EMAIL: 'primary.master@example.invalid',
    INITIAL_MASTER_PASSWORD: 'StrongBootstrapPassword@123',
    DOCUMENT_STORAGE_PROVIDER: 'gridfs',
    ...overrides,
  };
}

test('Atlas helper never manufactures missing production secrets', () => {
  const env = validProductionEnv();
  delete env.JWT_ACCESS_SECRET;

  assert.throws(
    () => prepareAtlasServerEnvironment(env),
    /JWT_ACCESS_SECRET is required/
  );
  assert.equal(env.JWT_ACCESS_SECRET, undefined);
});

test('Atlas helper preserves explicit production security values', () => {
  const env = validProductionEnv();
  const before = { ...env };

  prepareAtlasServerEnvironment(env);

  for (const key of [
    'MONGODB_URI',
    'JWT_ACCESS_SECRET',
    'MFA_ENCRYPTION_KEY',
    'QR_SIGNING_SECRET',
    'ATTENDANCE_QR_SECRET',
    'INITIAL_MASTER_EMAIL',
    'INITIAL_MASTER_PASSWORD',
  ]) {
    assert.equal(env[key], before[key]);
  }
});

test('development helper generates ephemeral distinct signing material', () => {
  const first = prepareAtlasServerEnvironment({
    NODE_ENV: 'development',
  });
  const second = prepareAtlasServerEnvironment({
    NODE_ENV: 'development',
  });

  assert.ok(first.JWT_ACCESS_SECRET.length >= 32);
  assert.match(first.MFA_ENCRYPTION_KEY, /^[0-9a-f]{64}$/);
  assert.notEqual(
    first.QR_SIGNING_SECRET,
    first.ATTENDANCE_QR_SECRET
  );
  assert.notEqual(
    first.JWT_ACCESS_SECRET,
    second.JWT_ACCESS_SECRET
  );
  assert.notEqual(
    first.MFA_ENCRYPTION_KEY,
    second.MFA_ENCRYPTION_KEY
  );
});
