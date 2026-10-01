'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — UNIVERSAL STARTUP CONFIGURATION VALIDATOR
 * ============================================================================
 * Enforces production startup safety invariants.
 *
 * Invariants:
 * 1. Validates all mandatory operational and security environment variables.
 * 2. Never logs or prints secret material during validation.
 * 3. Reports status strictly as PRESENT, MISSING, INVALID, or UNSAFE.
 * 4. Fails closed: In production (NODE_ENV === 'production'), if any mandatory
 *    or security variable is missing/invalid, server startup is aborted.
 */

const path = require('path');
const ApiError = require('../utils/ApiError');
const {
  isUnsafeAttendanceSecret,
} = require('./attendanceSecurityConfig');

const PRODUCTION_MANDATORY_SPECS = [
  {
    key: 'NODE_ENV',
    requiredInProduction: true,
    description: 'Runtime environment profile',
    isSecret: false,
    validate: (val) => ['production', 'development', 'test', 'staging'].includes(val),
  },
  {
    key: 'PORT',
    requiredInProduction: false,
    default: '4000',
    description: 'HTTP listening port',
    isSecret: false,
    validate: (val) => Number.isInteger(Number(val)) && Number(val) > 0 && Number(val) < 65536,
  },
  {
    key: 'MONGODB_URI',
    requiredInProduction: true,
    description: 'MongoDB Atlas primary replica-set connection string',
    isSecret: true,
    validate: (val) => typeof val === 'string' && (val.startsWith('mongodb://') || val.startsWith('mongodb+srv://')),
  },
  {
    key: 'JWT_ACCESS_SECRET',
    requiredInProduction: true,
    description: 'HMAC-SHA256 secret for access tokens (min 32 chars in prod)',
    isSecret: true,
    validate: (val, isProd) => typeof val === 'string' && val.trim().length >= (isProd ? 32 : 16) && !val.includes('placeholder'),
  },
  {
    key: 'MFA_ENCRYPTION_KEY',
    requiredInProduction: true,
    description: 'AES-256-GCM symmetric key for MFA secrets (64-char hex)',
    isSecret: true,
    validate: (val, isProd) => {
      if (!isProd) return typeof val === 'string' && val.trim().length >= 32;
      return typeof val === 'string' && /^[0-9a-fA-F]{64}$/.test(val.trim());
    },
  },
  {
    key: 'QR_SIGNING_SECRET',
    requiredInProduction: true,
    description: 'HMAC-SHA256 secret for signed attendance QR envelopes',
    isSecret: true,
    validate: (val, isProd) => {
      if (!isProd) return true;
      return !isUnsafeAttendanceSecret(val);
    },
  },
  {
    key: 'ATTENDANCE_QR_SECRET',
    requiredInProduction: true,
    description: 'HMAC-SHA256 secret for attendance compact tokens and scan grants',
    isSecret: true,
    validate: (val, isProd) => {
      if (!isProd) return true;
      return !isUnsafeAttendanceSecret(val);
    },
  },
  {
    key: 'DOCUMENT_STORAGE_PROVIDER',
    requiredInProduction: true,
    description: 'Durable document storage provider (GridFS, persistent disk, or private object storage)',
    isSecret: false,
    validate: (val) => {
      const provider = String(val || '').trim().toLowerCase();
      return [
        'gridfs',
        'mongodb',
        'mongodb_gridfs',
        'render_persistent_disk',
        'private_object_storage',
        's3',
        's3_compatible',
      ].includes(provider);
    },
  },
  {
    key: 'ALLOWED_ORIGINS',
    requiredInProduction: true,
    description: 'Authorized frontend CORS origins list',
    isSecret: false,
    validate: (val, isProd) => {
      if (!isProd) return true;
      if (!val || typeof val !== 'string') return false;
      return !val.includes('*') && val.includes('https://');
    },
  },
  {
    key: 'SESSION_ABSOLUTE_TTL_DAYS',
    requiredInProduction: false,
    default: '7',
    description: 'Absolute session expiry threshold (days)',
    isSecret: false,
    validate: (val) => !Number.isNaN(Number(val)) && Number(val) > 0,
  },
  {
    key: 'SESSION_IDLE_TIMEOUT_MINUTES',
    requiredInProduction: false,
    default: '30',
    description: 'Idle session timeout window (minutes)',
    isSecret: false,
    validate: (val) => !Number.isNaN(Number(val)) && Number(val) > 0,
  },
];

function validateStartupConfiguration(env = process.env, { failClosed = true } = {}) {
  const isProduction = env.NODE_ENV === 'production';
  const report = [];
  const blockingIssues = [];

  for (const spec of PRODUCTION_MANDATORY_SPECS) {
    const raw = env[spec.key];
    const isPresent = raw !== undefined && raw !== null && String(raw).trim() !== '';

    let status = 'MISSING';
    let detail = '';

    if (isPresent) {
      const isValid = spec.validate ? spec.validate(raw, isProduction) : true;
      if (isValid) {
        status = 'PRESENT';
      } else {
        status = 'INVALID';
        detail = `Variable ${spec.key} violates security/format constraints`;
        if (spec.requiredInProduction && isProduction) {
          blockingIssues.push(`${spec.key}: ${detail}`);
        }
      }
    } else {
      if (spec.requiredInProduction && isProduction) {
        status = 'MISSING';
        detail = `Mandatory variable ${spec.key} is missing`;
        blockingIssues.push(`${spec.key}: ${detail}`);
      } else {
        status = 'OPTIONAL_DEFAULT';
        detail = `Using default: ${spec.default || 'none'}`;
      }
    }

    report.push({
      key: spec.key,
      description: spec.description,
      status,
      isSecret: spec.isSecret,
      detail: spec.isSecret && isPresent ? 'Configured (Value Redacted)' : detail,
    });
  }

  if (isProduction) {
    const qrSigningSecret = String(env.QR_SIGNING_SECRET || '').trim();
    const attendanceQrSecret = String(env.ATTENDANCE_QR_SECRET || '').trim();

    if (
      qrSigningSecret &&
      attendanceQrSecret &&
      qrSigningSecret === attendanceQrSecret
    ) {
      blockingIssues.push(
        'ATTENDANCE_SECURITY_SECRETS: QR_SIGNING_SECRET and ATTENDANCE_QR_SECRET must be distinct'
      );
    }
  }

  const isSafe = blockingIssues.length === 0;

  if (!isSafe && failClosed && isProduction) {
    const errMessage = `PRODUCTION_STARTUP_CONFIG_ERROR: ${blockingIssues.join('; ')}`;
    throw new ApiError(500, 'STARTUP_CONFIGURATION_FAILED', errMessage);
  }

  return {
    isProduction,
    isSafe,
    blockingIssues,
    report,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  PRODUCTION_MANDATORY_SPECS,
  validateStartupConfiguration,
};
