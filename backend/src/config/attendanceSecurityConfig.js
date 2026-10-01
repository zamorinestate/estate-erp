'use strict';

const crypto = require('node:crypto');

const MIN_ATTENDANCE_SECRET_LENGTH = 32;

// SHA-256 fingerprints of historical development fallback values that were once
// committed in source. Keeping only fingerprints lets production reject them
// without retaining the original secret material in the current tree.
const RETIRED_SECRET_FINGERPRINTS = new Set([
  '0ca71b96e81c93c4c04bb222a332b607d5306f8b3f7392e665795bcb77f213ca',
  '4b5bef7d3e088571672e932510a1c7f5f8c1d71128ce185ea6f9f3cfe97b95f7',
]);

function fingerprint(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function isUnsafeAttendanceSecret(value) {
  const normalized = String(value || '').trim();
  if (normalized.length < MIN_ATTENDANCE_SECRET_LENGTH) return true;

  const lowered = normalized.toLowerCase();
  if (
    lowered.includes('placeholder') ||
    lowered.includes('changeme') ||
    lowered.includes('change-me') ||
    lowered.includes('replace-with') ||
    lowered.includes('example-secret') ||
    lowered.includes('test-secret')
  ) {
    return true;
  }

  return RETIRED_SECRET_FINGERPRINTS.has(fingerprint(normalized));
}

function developmentOnlySecret(name) {
  // This is deliberately derived from a public label and must never be treated
  // as secret material. Production resolution below refuses to use it.
  return crypto
    .createHash('sha256')
    .update(`zamorin-development-only-non-secret-context:v1:${name}`, 'utf8')
    .digest('hex');
}

function resolveSecuritySecret(name, env = process.env) {
  const configured = String(env?.[name] || '').trim();
  const isProduction = String(env?.NODE_ENV || '').trim().toLowerCase() === 'production';

  if (configured) {
    if (isUnsafeAttendanceSecret(configured)) {
      const error = new Error(`${name} does not meet attendance signing-secret security requirements.`);
      error.code = 'ATTENDANCE_SECURITY_SECRET_UNSAFE';
      throw error;
    }
    return configured;
  }

  if (isProduction) {
    const error = new Error(`${name} is required in production.`);
    error.code = 'ATTENDANCE_SECURITY_SECRET_REQUIRED';
    throw error;
  }

  return developmentOnlySecret(name);
}

function getQrSigningSecret(env = process.env) {
  return resolveSecuritySecret('QR_SIGNING_SECRET', env);
}

function getAttendanceTokenSecret(env = process.env) {
  return resolveSecuritySecret('ATTENDANCE_QR_SECRET', env);
}

function validateAttendanceSecretPair(env = process.env) {
  const qrSigningSecret = getQrSigningSecret(env);
  const attendanceTokenSecret = getAttendanceTokenSecret(env);

  if (
    String(env?.NODE_ENV || '').trim().toLowerCase() === 'production' &&
    crypto.timingSafeEqual(
      Buffer.from(fingerprint(qrSigningSecret), 'hex'),
      Buffer.from(fingerprint(attendanceTokenSecret), 'hex')
    )
  ) {
    const error = new Error('QR_SIGNING_SECRET and ATTENDANCE_QR_SECRET must be distinct in production.');
    error.code = 'ATTENDANCE_SECURITY_SECRETS_NOT_DISTINCT';
    throw error;
  }

  return {
    qrSigningSecret,
    attendanceTokenSecret,
  };
}

module.exports = {
  MIN_ATTENDANCE_SECRET_LENGTH,
  RETIRED_SECRET_FINGERPRINTS,
  fingerprint,
  isUnsafeAttendanceSecret,
  getQrSigningSecret,
  getAttendanceTokenSecret,
  validateAttendanceSecretPair,
};
