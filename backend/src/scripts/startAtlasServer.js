'use strict';

/**
 * Start the backend against Atlas or local MongoDB for operator testing.
 *
 * Production mode is fail-closed: every security-sensitive value must already
 * be provided by the runtime environment. Development mode may generate
 * ephemeral process-local signing keys so known secrets are never committed.
 */

const crypto = require('node:crypto');
const dns = require('node:dns');

dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (_) {}

function requireProductionValue(env, key) {
  const value = String(env[key] || '').trim();
  if (!value) {
    throw new Error(
      `${key} is required when startAtlasServer runs in production mode.`
    );
  }
  return value;
}

function prepareAtlasServerEnvironment(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || 'development')
    .trim()
    .toLowerCase();
  const production = nodeEnv === 'production';

  env.NODE_ENV = nodeEnv;
  env.DNS_SERVERS =
    env.DNS_SERVERS || '8.8.8.8,1.1.1.1';

  if (production) {
    for (const key of [
      'MONGODB_URI',
      'JWT_ACCESS_SECRET',
      'MFA_ENCRYPTION_KEY',
      'QR_SIGNING_SECRET',
      'ATTENDANCE_QR_SECRET',
      'ALLOWED_ORIGINS',
      'INITIAL_MASTER_EMAIL',
      'INITIAL_MASTER_PASSWORD',
      'DOCUMENT_STORAGE_PROVIDER',
    ]) {
      requireProductionValue(env, key);
    }
  } else {
    env.MONGODB_URI =
      env.MONGODB_URI ||
      'mongodb://127.0.0.1:27017/zamorin_cafe_erp';

    env.JWT_ACCESS_SECRET =
      env.JWT_ACCESS_SECRET ||
      crypto.randomBytes(48).toString('base64url');

    env.MFA_ENCRYPTION_KEY =
      env.MFA_ENCRYPTION_KEY ||
      crypto.randomBytes(32).toString('hex');

    env.QR_SIGNING_SECRET =
      env.QR_SIGNING_SECRET ||
      crypto.randomBytes(32).toString('base64url');

    env.ATTENDANCE_QR_SECRET =
      env.ATTENDANCE_QR_SECRET ||
      crypto.randomBytes(32).toString('base64url');

    if (
      env.ATTENDANCE_QR_SECRET ===
      env.QR_SIGNING_SECRET
    ) {
      env.ATTENDANCE_QR_SECRET =
        crypto.randomBytes(32).toString('base64url');
    }

    env.ALLOWED_ORIGINS =
      env.ALLOWED_ORIGINS ||
      'http://127.0.0.1:4000,http://localhost:3000,http://localhost:5173';

    env.PRIVATE_STORAGE_DRIVER =
      env.PRIVATE_STORAGE_DRIVER || 'local';

    env.DOCUMENT_STORAGE_PROVIDER =
      env.DOCUMENT_STORAGE_PROVIDER || 'gridfs';
  }

  env.PORT = env.PORT || '4000';
  env.HOST =
    env.HOST || (production ? '0.0.0.0' : '127.0.0.1');
  env.RATE_LIMIT_MAX =
    env.RATE_LIMIT_MAX || '50000';
  env.MONGODB_MAX_POOL_SIZE =
    env.MONGODB_MAX_POOL_SIZE || '100';
  env.MONGODB_MIN_POOL_SIZE =
    env.MONGODB_MIN_POOL_SIZE || '20';

  return env;
}

if (require.main === module) {
  prepareAtlasServerEnvironment(process.env);

  const {
    startProductionServer,
  } = require('./startProd');

  startProductionServer().catch((err) => {
    console.error(
      '[ATLAS SERVER FATAL]',
      err
    );
    process.exit(1);
  });
}

module.exports = {
  prepareAtlasServerEnvironment,
};
