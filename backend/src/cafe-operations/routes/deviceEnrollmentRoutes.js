'use strict';
const express = require('express');
const deviceService = require('../services/deviceService');
const { deviceContext } = require('../middleware/deviceContext');
const sessionPolicy = require('../config/sessionPolicy');
const { ok, fail } = require('../utils/responses');

const router = express.Router();

router.post('/enroll', async (req, res, next) => {
  try {
    const {
      enrollmentCode,
      displayName,
      platform,
      appVersion,
      osVersion,
      publicSigningKey,
      signingKeyAlgorithm,
      signingKeyProvider,
    } = req.body || {};
    if (!enrollmentCode) return fail(res, 400, 'INVALID_INPUT', 'Enter your registration code.');
    const { device, deviceToken, attestation } = await deviceService.enrollDevice({
      enrollmentCodePlain: enrollmentCode,
      displayName,
      platform,
      appVersion,
      osVersion,
      publicSigningKey,
      signingKeyAlgorithm,
      signingKeyProvider,
    });
    return ok(res, {
      deviceToken,
      attestation,
      device: {
        id: device.id,
        displayName: device.displayName,
        cafeId: device.cafeId,
        cafeName: device.cafeDisplayName || null,
        lifecycleStatus: device.lifecycleStatus,
        attestationCapable: Boolean(device.attestationCapable),
        signingKeyThumbprint: device.signingKeyThumbprint || null,
      },
    });
  } catch (err) {
    if (err.code === 'ENROLLMENT_UNAVAILABLE') {
      return fail(res, 400, 'ENROLLMENT_UNAVAILABLE', 'This registration code is invalid, expired, or has already been used.');
    }
    next(err);
  }
});

router.post('/attestation/key', deviceContext, async (req, res, next) => {
  try {
    const {
      publicSigningKey,
      signingKeyAlgorithm,
      signingKeyProvider,
    } = req.body || {};

    const result = await deviceService.bindAttestationKey(req.cafeOpsDevice, {
      publicSigningKey,
      signingKeyAlgorithm,
      signingKeyProvider,
    });

    return ok(res, result);
  } catch (err) {
    if (err.code === 'DEVICE_ATTESTATION_KEY_ROTATION_REQUIRES_REENROLLMENT') {
      return fail(
        res,
        409,
        err.code,
        'This terminal already has a different signing key. Controlled re-enrollment is required before key rotation.'
      );
    }
    if (
      err.code === 'DEVICE_SIGNING_KEY_REQUIRED' ||
      err.code === 'UNSUPPORTED_DEVICE_SIGNING_ALGORITHM'
    ) {
      return fail(res, 400, err.code, err.message);
    }
    next(err);
  }
});

router.get('/status', deviceContext, async (req, res, next) => {
  try {
    const diagnostics = await deviceService.getDiagnostics(req.cafeOpsDevice);
    return ok(res, { diagnostics, serverTime: new Date().toISOString() });
  } catch (err) { next(err); }
});

router.get('/policy', deviceContext, async (req, res) => {
  return ok(res, {
    policy: {
      inactivityLockTimeoutMinutes: sessionPolicy.INACTIVITY_LOCK_TIMEOUT_MINUTES,
      preTimeoutWarningSeconds: sessionPolicy.PRE_TIMEOUT_WARNING_SECONDS,
      overallSessionLifetimeHours: sessionPolicy.OVERALL_SESSION_LIFETIME_HOURS,
      masterAccessReasonRequired: sessionPolicy.MASTER_ACCESS_REASON_REQUIRED,
    },
  });
});

module.exports = router;
