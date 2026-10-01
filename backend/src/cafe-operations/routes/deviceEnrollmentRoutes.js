'use strict';
const express = require('express');
const deviceService = require('../services/deviceService');
const { deviceContext } = require('../middleware/deviceContext');
const { authenticate } = require('../../middleware/authenticate');
const sessionPolicy = require('../config/sessionPolicy');
const { ok, fail } = require('../utils/responses');
const attendanceQrService = require('../../services/attendanceQrService');

const router = express.Router();

router.post('/attestation/challenge', async (req, res, next) => {
  try {
    const { enrollmentCode, platform } = req.body || {};
    if (!enrollmentCode) {
      return fail(res, 400, 'INVALID_INPUT', 'Enter your registration code.');
    }
    const challenge = await deviceService.issueHardwareAttestationChallenge({
      enrollmentCodePlain: enrollmentCode,
      platform,
    });
    return ok(res, challenge);
  } catch (err) {
    if (err.code === 'ENROLLMENT_UNAVAILABLE') {
      return fail(
        res,
        400,
        'ENROLLMENT_UNAVAILABLE',
        'This registration code is invalid, expired, or has already been used.'
      );
    }
    if (err.code === 'ANDROID_HARDWARE_ATTESTATION_ONLY') {
      return fail(
        res,
        400,
        err.code,
        'Hardware key attestation is currently available only for Android enrollment.'
      );
    }
    if (err.code === 'ANDROID_HARDWARE_ATTESTATION_CHALLENGE_IN_PROGRESS') {
      return fail(
        res,
        409,
        err.code,
        'A hardware-attestation challenge is already active for this enrollment code.'
      );
    }
    next(err);
  }
});

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
      hardwareAttestation,
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
      hardwareAttestation,
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
        signingKeyHardwareBackedVerified: device.signingKeyHardwareBackedVerified === true,
        signingKeyHardwareSecurityLevel: device.signingKeyHardwareSecurityLevel || 'UNKNOWN',
        signingKeyHardwareAttestationVerifiedAt: device.signingKeyHardwareAttestationVerifiedAt || null,
      },
    });
  } catch (err) {
    if (err.code === 'ENROLLMENT_UNAVAILABLE') {
      return fail(res, 400, 'ENROLLMENT_UNAVAILABLE', 'This registration code is invalid, expired, or has already been used.');
    }
    if (
      err.code === 'NATIVE_DEVICE_ATTESTATION_REQUIRED' ||
      err.code === 'DEVICE_SIGNING_PROVENANCE_MISMATCH' ||
      err.code === 'UNSUPPORTED_DEVICE_SIGNING_ALGORITHM' ||
      String(err.code || '').startsWith('ANDROID_ATTESTATION_') ||
      String(err.code || '').startsWith('ANDROID_HARDWARE_ATTESTATION_')
    ) {
      return fail(res, 400, err.code, err.message);
    }
    next(err);
  }
});

router.post('/attestation/key', deviceContext, authenticate, async (req, res, next) => {
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
    if (
      err.code === 'DEVICE_ATTESTATION_KEY_ROTATION_REQUIRES_REENROLLMENT' ||
      err.code === 'DEVICE_ATTESTATION_REENROLLMENT_REQUIRED' ||
      err.code === 'DEVICE_ATTESTATION_PROVENANCE_MISMATCH'
    ) {
      return fail(
        res,
        409,
        err.code,
        'This terminal signing identity is not eligible for post-enrollment trust establishment. Controlled re-enrollment is required.'
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

router.get('/attendance/qr', deviceContext, async (req, res, next) => {
  try {
    const device = req.cafeOpsDevice;
    const challenge = await attendanceQrService.getActiveOrNewChallenge({
      organisationId: device.organisationId,
      cafeId: device.cafeId,
      deviceId: device.id,
      requestedByUserId: `DEVICE:${device.id}`,
      requestedByRole: 'CAFE_ADMIN',
      assignedCafeIds: [device.cafeId],
      rotationIntervalSeconds: 45,
    });

    return ok(res, {
      challengeId: challenge.challengeId,
      cafeId: challenge.cafeId,
      cafeName: challenge.cafeName || device.cafeDisplayName || null,
      attendanceUrl: challenge.attendanceUrl,
      expiresAt: challenge.expiresAt,
      remainingSeconds: challenge.remainingSeconds,
    });
  } catch (err) { next(err); }
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
