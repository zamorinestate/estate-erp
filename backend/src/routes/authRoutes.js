'use strict';

const crypto = require('crypto');
const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const {
  login,
  requestPasswordReset,
  verifyPasswordResetCode,
  resetPassword,
  mfaSetup,
  mfaConfirm,
  mfaVerify,
  getMfaStatus,
  regenerateRecoveryCodes,
  changePassword,
  stepUpAuthentication,
  refreshSession,
  logout,
  logoutAll,
  getSessions,
  getCurrentUser,
  revokeSessionById,
  revokeOtherSessions,
  listTrustedDevices,
  revokeTrustedDevice,
  revokeAllTrustedDevices,
  getSelfPrivacySecurity,
  setupAppPin,
  changeAppPin,
  disableAppPin,
  getAppPinStatus,
  unlockWithAppPin,
  loginWithAppPin,
  loginCafeOperations,
  getPublicCafeOperationsCafes,
} = require('../controllers/authController');

const {
  authenticate,
  requireMfa,
} = require('../middleware/authenticate');
const passkeyController = require('../controllers/passkeyController');
const { getTrustedClientIp } = require('../utils/clientIp');
const { logSecurityEvent } = require('../services/securityLogger');
const { redisClientFactory } = require('../services/redisClientFactory');

const router = express.Router();

/**
 * Normalizes account identity (orgId + email/username/identifier) into a deterministic,
 * privacy-safe SHA-256 pseudonym for account-scoped rate limit bucketing.
 * Raw credentials and plaintext emails are never stored in memory or exposed in telemetry.
 */
function normalizeAccountKey(req, fallbackIdentifierKey = 'email') {
  const body = req.body || {};
  const orgId = String(body.organisationId || body.orgId || body.organisation || '').trim().toUpperCase();
  const rawIdentifier = String(
    body[fallbackIdentifierKey] ||
    body.email ||
    body.identifier ||
    body.userId ||
    ''
  ).trim().toLowerCase();

  if (!rawIdentifier) {
    return `auth:acct:anon:${ipKeyGenerator(getTrustedClientIp(req))}`;
  }

  const hash = crypto
    .createHash('sha256')
    .update(`${orgId}:${rawIdentifier}`)
    .digest('hex')
    .slice(0, 32);

  return `auth:acct:${hash}`;
}

function createRateLimitHandler(limiterName, message) {
  return (req, res, next, options) => {
    try {
      logSecurityEvent({
        correlationId: req.correlationId || null,
        organisationId: req.body?.organisationId || req.body?.orgId || null,
        action: 'RATE_LIMIT_EXCEEDED',
        outcome: 'DENIED',
        severity: 'WARN',
        metadata: {
          route: req.originalUrl || req.baseUrl || '/auth',
          limiter: limiterName,
          clientIp: getTrustedClientIp(req),
        },
      });
    } catch {}
    return res.status(options.statusCode).json(options.message || message);
  };
}

const LOGIN_RATE_LIMIT_MESSAGE = Object.freeze({
  success: false,
  error: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many sign-in attempts detected. Please wait a moment before trying again.',
  },
});

const PASSWORD_RESET_RATE_LIMIT_MESSAGE = Object.freeze({
  success: false,
  error: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many password reset requests. Please try again later.',
  },
});

const PASSKEY_RATE_LIMIT_MESSAGE = Object.freeze({
  success: false,
  error: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many passkey requests. Please try again later.',
  },
});

const MFA_RATE_LIMIT_MESSAGE = Object.freeze({
  success: false,
  error: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many MFA requests. Please try again later.',
  },
});


function isProductionLikeAuthEnvironment() {
  const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  const appMode = String(process.env.APP_MODE || '').trim().toUpperCase();
  return (
    nodeEnv === 'production' ||
    nodeEnv === 'staging' ||
    appMode === 'PRODUCTION' ||
    appMode === 'STAGING' ||
    appMode === 'UAT' ||
    appMode === 'REAL_USER_TEST'
  );
}

function sendDistributedLimiterUnavailable(req, res) {
  try {
    logSecurityEvent({
      correlationId: req.correlationId || null,
      organisationId: req.body?.organisationId || req.body?.orgId || null,
      action: 'AUTH_DISTRIBUTED_RATE_LIMITER_UNAVAILABLE',
      outcome: 'DENIED',
      severity: 'ERROR',
      metadata: {
        route: req.originalUrl || req.baseUrl || '/auth',
        clientIp: getTrustedClientIp(req),
      },
    });
  } catch {}

  return res.status(503).json({
    success: false,
    error: {
      code: 'AUTH_RATE_LIMITER_UNAVAILABLE',
      message: 'Authentication protection is temporarily unavailable. Please try again later.',
    },
  });
}

function createDistributedAuthRateLimiter({
  scope,
  ipLimit,
  accountLimit,
  accountKeyFn = normalizeAccountKey,
  windowMs = 15 * 60 * 1000,
  message = LOGIN_RATE_LIMIT_MESSAGE,
}) {
  return async function distributedAuthRateLimiter(req, res, next) {
    const adapter = redisClientFactory.adapterService;

    if (!adapter) {
      if (isProductionLikeAuthEnvironment()) {
        return sendDistributedLimiterUnavailable(req, res);
      }
      return next();
    }

    const ipIdentifier = ipKeyGenerator(getTrustedClientIp(req));
    const accountIdentifier = accountKeyFn(req);

    try {
      const [ipResult, accountResult] = await Promise.all([
        adapter.checkRateLimit(`${scope}:IP`, ipIdentifier, ipLimit, windowMs),
        adapter.checkRateLimit(`${scope}:ACCOUNT`, accountIdentifier, accountLimit, windowMs),
      ]);

      const deniedResult = !ipResult.allowed
        ? { result: ipResult, limiter: `${scope}_IP` }
        : (!accountResult.allowed
          ? { result: accountResult, limiter: `${scope}_ACCOUNT` }
          : null);

      if (deniedResult) {
        try {
          logSecurityEvent({
            correlationId: req.correlationId || null,
            organisationId: req.body?.organisationId || req.body?.orgId || null,
            action: 'RATE_LIMIT_EXCEEDED',
            outcome: 'DENIED',
            severity: 'WARN',
            metadata: {
              route: req.originalUrl || req.baseUrl || '/auth',
              limiter: deniedResult.limiter,
              clientIp: getTrustedClientIp(req),
              distributed: true,
            },
          });
        } catch {}

        if (Number.isFinite(deniedResult.result.resetAfterSeconds)) {
          res.setHeader('Retry-After', String(Math.max(1, deniedResult.result.resetAfterSeconds)));
        }

        return res.status(429).json(message);
      }

      return next();
    } catch (error) {
      if (isProductionLikeAuthEnvironment()) {
        return sendDistributedLimiterUnavailable(req, res);
      }

      return next();
    }
  };
}

function createLoginIpRateLimiter(overrides = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.AUTH_RATE_LIMIT_IP_MAX ? Number(process.env.AUTH_RATE_LIMIT_IP_MAX) : 50,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(getTrustedClientIp(req)),
    handler: createRateLimitHandler('AUTH_LOGIN_IP', LOGIN_RATE_LIMIT_MESSAGE),
    message: LOGIN_RATE_LIMIT_MESSAGE,
    ...overrides,
  });
}

function createLoginAccountRateLimiter(overrides = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.AUTH_RATE_LIMIT_ACCOUNT_MAX ? Number(process.env.AUTH_RATE_LIMIT_ACCOUNT_MAX) : 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => normalizeAccountKey(req, 'email'),
    handler: createRateLimitHandler('AUTH_LOGIN_ACCOUNT', LOGIN_RATE_LIMIT_MESSAGE),
    message: LOGIN_RATE_LIMIT_MESSAGE,
    ...overrides,
  });
}

function createPasswordResetIpRateLimiter(overrides = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(getTrustedClientIp(req)),
    handler: createRateLimitHandler('AUTH_RESET_IP', PASSWORD_RESET_RATE_LIMIT_MESSAGE),
    message: PASSWORD_RESET_RATE_LIMIT_MESSAGE,
    ...overrides,
  });
}

function createPasswordResetAccountRateLimiter(overrides = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => normalizeAccountKey(req, 'email'),
    handler: createRateLimitHandler('AUTH_RESET_ACCOUNT', PASSWORD_RESET_RATE_LIMIT_MESSAGE),
    message: PASSWORD_RESET_RATE_LIMIT_MESSAGE,
    ...overrides,
  });
}

const loginIpRateLimiter = createLoginIpRateLimiter();
const loginAccountRateLimiter = createLoginAccountRateLimiter();
const passwordResetIpRateLimiter = createPasswordResetIpRateLimiter();
const passwordResetAccountRateLimiter = createPasswordResetAccountRateLimiter();

const distributedLoginRateLimiter = createDistributedAuthRateLimiter({
  scope: 'AUTH_LOGIN',
  ipLimit: process.env.AUTH_RATE_LIMIT_IP_MAX ? Number(process.env.AUTH_RATE_LIMIT_IP_MAX) : 50,
  accountLimit: process.env.AUTH_RATE_LIMIT_ACCOUNT_MAX ? Number(process.env.AUTH_RATE_LIMIT_ACCOUNT_MAX) : 10,
  accountKeyFn: (req) => normalizeAccountKey(req, 'email'),
  message: LOGIN_RATE_LIMIT_MESSAGE,
});

const distributedPasswordResetRateLimiter = createDistributedAuthRateLimiter({
  scope: 'AUTH_PASSWORD_RECOVERY',
  ipLimit: 15,
  accountLimit: 5,
  accountKeyFn: (req) => normalizeAccountKey(req, 'email'),
  message: PASSWORD_RESET_RATE_LIMIT_MESSAGE,
});

const passkeyIpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.AUTH_RATE_LIMIT_PASSKEY_IP_MAX ? Number(process.env.AUTH_RATE_LIMIT_PASSKEY_IP_MAX) : 150,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(getTrustedClientIp(req)),
  handler: createRateLimitHandler('AUTH_PASSKEY_IP', PASSKEY_RATE_LIMIT_MESSAGE),
  message: PASSKEY_RATE_LIMIT_MESSAGE,
});

const passkeyAccountRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.AUTH_RATE_LIMIT_PASSKEY_MAX ? Number(process.env.AUTH_RATE_LIMIT_PASSKEY_MAX) : 80,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => normalizeAccountKey(req, 'email'),
  handler: createRateLimitHandler('AUTH_PASSKEY_ACCOUNT', PASSKEY_RATE_LIMIT_MESSAGE),
  message: PASSKEY_RATE_LIMIT_MESSAGE,
});

const mfaIpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(getTrustedClientIp(req)),
  handler: createRateLimitHandler('AUTH_MFA_IP', MFA_RATE_LIMIT_MESSAGE),
  message: MFA_RATE_LIMIT_MESSAGE,
});

const mfaAccountRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => normalizeAccountKey(req, 'userId'),
  handler: createRateLimitHandler('AUTH_MFA_ACCOUNT', MFA_RATE_LIMIT_MESSAGE),
  message: MFA_RATE_LIMIT_MESSAGE,
});

function normalizeCafeOpsAccountKey(req) {
  const body = req.body || {};
  const cafeId = String(body.cafeId || body.cafe || '').trim().toUpperCase();
  const userId = String(body.userId || body.employeeId || body.identifier || '').trim().toUpperCase();
  if (!cafeId || !userId) {
    return `auth:cafeops:anon:${ipKeyGenerator(getTrustedClientIp(req))}`;
  }
  const hash = crypto
    .createHash('sha256')
    .update(`${cafeId}:${userId}`)
    .digest('hex')
    .slice(0, 32);
  return `auth:cafeops:${hash}`;
}

function createCafeOpsIpRateLimiter(overrides = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.AUTH_RATE_LIMIT_CAFE_OPS_IP_MAX
      ? Number(process.env.AUTH_RATE_LIMIT_CAFE_OPS_IP_MAX)
      : 50,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(getTrustedClientIp(req)),
    skip: (req) => process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'],
    handler: createRateLimitHandler('AUTH_CAFE_OPS_IP', LOGIN_RATE_LIMIT_MESSAGE),
    message: LOGIN_RATE_LIMIT_MESSAGE,
    ...overrides,
  });
}

function createCafeOpsAccountRateLimiter(overrides = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.AUTH_RATE_LIMIT_CAFE_OPS_ACCOUNT_MAX
      ? Number(process.env.AUTH_RATE_LIMIT_CAFE_OPS_ACCOUNT_MAX)
      : 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => normalizeCafeOpsAccountKey(req),
    skip: (req) => process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'],
    handler: createRateLimitHandler('AUTH_CAFE_OPS_ACCOUNT', LOGIN_RATE_LIMIT_MESSAGE),
    message: LOGIN_RATE_LIMIT_MESSAGE,
    ...overrides,
  });
}

const cafeOpsIpRateLimiter = createCafeOpsIpRateLimiter();
const cafeOpsAccountRateLimiter = createCafeOpsAccountRateLimiter();

// Authentication endpoints
router.post('/login', distributedLoginRateLimiter, loginIpRateLimiter, loginAccountRateLimiter, login);
router.post('/password/forgot', distributedPasswordResetRateLimiter, passwordResetIpRateLimiter, passwordResetAccountRateLimiter, requestPasswordReset);
router.post('/password/reset/verify', distributedPasswordResetRateLimiter, passwordResetIpRateLimiter, passwordResetAccountRateLimiter, verifyPasswordResetCode);
router.post('/password/reset', distributedPasswordResetRateLimiter, passwordResetIpRateLimiter, passwordResetAccountRateLimiter, resetPassword);
router.post('/refresh', refreshSession);

// Café Operations Login 2.0 Endpoints
router.get('/cafe-operations/cafes', getPublicCafeOperationsCafes);
router.post('/cafe-operations/login', cafeOpsIpRateLimiter, cafeOpsAccountRateLimiter, loginCafeOperations);

// Personal Six-Digit Application PIN Endpoints (ACP-05E-02)
router.post('/app-pin/setup', authenticate, setupAppPin);
router.post('/app-pin/change', authenticate, changeAppPin);
router.post('/app-pin/disable', authenticate, disableAppPin);
router.get('/app-pin/status', authenticate, getAppPinStatus);
router.post('/app-pin/unlock', authenticate, unlockWithAppPin);
router.post('/app-pin/login', passkeyIpRateLimiter, passkeyAccountRateLimiter, loginWithAppPin);

// Feature Gate: Passkeys / WebAuthn are enabled by default unless explicitly disabled
const isPasskeyEnabled = () => process.env.ENABLE_PASSKEY_AUTH !== 'false';

const passkeyFeatureGate = (req, res, next) => {
  if (!isPasskeyEnabled()) {
    return res.status(404).json({
      success: false,
      code: 'FEATURE_DISABLED',
      message: 'Passkey authentication is disabled in current release.',
    });
  }
  next();
};

// Passkeys / WebAuthn Endpoints
router.post('/passkeys/register/options', passkeyFeatureGate, authenticate, passkeyIpRateLimiter, passkeyController.getRegistrationOptions);
router.post('/passkeys/register/verify', passkeyFeatureGate, authenticate, passkeyIpRateLimiter, passkeyController.verifyRegistration);
router.post('/passkeys/authenticate/options', passkeyFeatureGate, passkeyIpRateLimiter, passkeyAccountRateLimiter, passkeyController.getAuthenticationOptions);
router.post('/passkeys/authenticate/verify', passkeyFeatureGate, passkeyIpRateLimiter, passkeyAccountRateLimiter, passkeyController.verifyAuthentication);
router.get('/passkeys', passkeyFeatureGate, authenticate, passkeyController.listUserPasskeys);
router.delete('/passkeys', passkeyFeatureGate, authenticate, passkeyController.revokeAllUserPasskeys);
router.patch('/passkeys/:credentialId', passkeyFeatureGate, authenticate, passkeyController.renameUserPasskey);
router.delete('/passkeys/:credentialId', passkeyFeatureGate, authenticate, passkeyController.revokeUserPasskey);

// Trusted Device Management Endpoints
router.get('/trusted-devices', authenticate, listTrustedDevices);
router.delete('/trusted-devices/:deviceTrustId', authenticate, revokeTrustedDevice);
router.delete('/trusted-devices', authenticate, revokeAllTrustedDevices);

// Unauthenticated MFA setup, confirmation, and verification routes
router.post('/mfa/setup', mfaIpRateLimiter, mfaAccountRateLimiter, mfaSetup);
router.post('/mfa/confirm', mfaIpRateLimiter, mfaAccountRateLimiter, mfaConfirm);
router.post('/mfa/verify', mfaIpRateLimiter, mfaAccountRateLimiter, mfaVerify);

// Authenticated MFA status and recovery code regeneration routes
router.get('/mfa/status', authenticate, getMfaStatus);
router.post('/mfa/recovery-codes/regenerate', authenticate, mfaIpRateLimiter, regenerateRecoveryCodes);

router.get('/me', authenticate, getCurrentUser);
router.get('/me/privacy-security', authenticate, getSelfPrivacySecurity);

router.post(
  '/step-up',
  authenticate,
  requireMfa,
  mfaIpRateLimiter,
  stepUpAuthentication
);

router.post('/password/change', authenticate, changePassword);
router.post('/change-password', authenticate, changePassword);
router.post('/logout', authenticate, logout);
router.post('/logout-all', authenticate, logoutAll);
router.get('/sessions', authenticate, getSessions);
router.delete('/sessions/:sessionId', authenticate, revokeSessionById);
router.post('/sessions/revoke-others', authenticate, revokeOtherSessions);

router.normalizeAccountKey = normalizeAccountKey;
router.createLoginIpRateLimiter = createLoginIpRateLimiter;
router.createLoginAccountRateLimiter = createLoginAccountRateLimiter;
router.createPasswordResetIpRateLimiter = createPasswordResetIpRateLimiter;
router.createPasswordResetAccountRateLimiter = createPasswordResetAccountRateLimiter;
router.createDistributedAuthRateLimiter = createDistributedAuthRateLimiter;
router.isProductionLikeAuthEnvironment = isProductionLikeAuthEnvironment;

module.exports = router;
