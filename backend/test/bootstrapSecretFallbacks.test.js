'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  loadEnvironment,
} = require('../src/config/environment');

function validProductionEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    PORT: '4000',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/zamorin_test',
    JWT_ACCESS_SECRET: 'J'.repeat(64),
    MFA_ENCRYPTION_KEY: 'a'.repeat(64),
    ALLOWED_ORIGINS: 'https://example.invalid',
    INITIAL_MASTER_EMAIL: 'primary.master@example.invalid',
    INITIAL_MASTER_PASSWORD: 'StrongBootstrapPassword@123',
    ...overrides,
  };
}

test('production environment requires an explicit Primary Master email', () => {
  const env = validProductionEnv();
  delete env.INITIAL_MASTER_EMAIL;

  assert.throws(
    () => loadEnvironment(env),
    /INITIAL_MASTER_EMAIL is required/
  );
});

test('production environment requires an explicit Primary Master password', () => {
  const env = validProductionEnv();
  delete env.INITIAL_MASTER_PASSWORD;

  assert.throws(
    () => loadEnvironment(env),
    /INITIAL_MASTER_PASSWORD is required/
  );
});

test('non-production environment never invents Primary Master credentials', () => {
  const env = loadEnvironment({
    NODE_ENV: 'development',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/zamorin_dev',
    JWT_ACCESS_SECRET: 'J'.repeat(32),
    MFA_ENCRYPTION_KEY: 'a'.repeat(32),
    ALLOWED_ORIGINS: 'http://localhost:3000',
  });

  assert.equal(env.initialMasterEmail, '');
  assert.equal(env.initialMasterPassword, '');
});

test('docker compose contains no secret or Primary Master credential fallbacks', () => {
  const compose = fs.readFileSync(
    path.resolve(__dirname, '../../docker-compose.yml'),
    'utf8'
  );

  for (const key of [
    'JWT_ACCESS_SECRET',
    'MFA_ENCRYPTION_KEY',
    'QR_SIGNING_SECRET',
    'ATTENDANCE_QR_SECRET',
    'INITIAL_MASTER_EMAIL',
    'INITIAL_MASTER_PASSWORD',
  ]) {
    assert.match(
      compose,
      new RegExp(String.raw`\$\{${key}:\?`)
    );
  }

  assert.doesNotMatch(
    compose,
    /\$\{(?:JWT_ACCESS_SECRET|MFA_ENCRYPTION_KEY|INITIAL_MASTER_EMAIL|INITIAL_MASTER_PASSWORD):-/
  );
});
