'use strict';
const { getRepositories } = require('../repositories');
const { generateDeviceCode, generateOpaqueToken, sha256Hex } = require('../utils/ids');
const { DEVICE_STATUS, SESSION_END_REASON, SECURITY_EVENT_TYPE } = require('../utils/constants');
const sessionService = require('./cafeOpsSessionService');
const auditService = require('./auditService');
const { logSecurityEvent, SECURITY_ACTIONS } = require('../../services/securityLogger');
const {
  ATTESTATION_ALGORITHM,
  canonicalPublicJwk,
  publicKeyThumbprint,
} = require('../../services/deviceAttestationService');

function resolveCanonicalDevicePlatform(platform, signingKeyProvider = null) {
  const provider = String(signingKeyProvider || '').trim().toUpperCase();
  if (provider === 'ANDROID_KEYSTORE') return 'ANDROID';
  if (provider === 'WINDOWS_CNG') return 'DESKTOP';

  const value = String(platform || '').trim().toLowerCase();
  if (value === 'android') return 'ANDROID';
  if (value === 'ios' || value === 'ipados') return 'IOS';
  if (value === 'macos' || value === 'windows' || value === 'desktop') return 'DESKTOP';
  if (value === 'web' || value === 'web_pos' || value === 'pwa') return 'WEB_POS';
  return 'UNKNOWN';
}

function assertSigningProviderMatchesPlatform(platform, signingKeyProvider) {
  const declaredPlatform = resolveCanonicalDevicePlatform(platform, null);
  const provider = String(signingKeyProvider || '').trim().toUpperCase();

  const allowed = {
    ANDROID: new Set(['ANDROID_KEYSTORE']),
    IOS: new Set(['APPLE_SECURE_ENCLAVE', 'APPLE_KEYCHAIN']),
    DESKTOP: new Set(['WINDOWS_CNG', 'APPLE_SECURE_ENCLAVE', 'APPLE_KEYCHAIN']),
    WEB_POS: new Set(['WEB_CRYPTO']),
  };

  if (!allowed[declaredPlatform] || !allowed[declaredPlatform].has(provider)) {
    const err = new Error('DEVICE_SIGNING_PROVENANCE_MISMATCH');
    err.code = 'DEVICE_SIGNING_PROVENANCE_MISMATCH';
    throw err;
  }

  return {
    platform: declaredPlatform,
    provider,
  };
}

async function resolveCanonicalDeviceScope(device) {
  const rawCafeId = String(device?.cafeId || '').trim();
  const rawOrganisationId = String(device?.organisationId || '').trim();

  if (/^ZC-(?:CAF-)?\d{4,}$/i.test(rawCafeId) && rawOrganisationId) {
    return {
      cafeId: rawCafeId.toUpperCase(),
      organisationId: rawOrganisationId.toUpperCase(),
    };
  }

  const models = require('../models');
  const CafeModel = models.getExternalCafeModel();
  if (!CafeModel) {
    const err = new Error('CANONICAL_CAFE_MODEL_UNAVAILABLE');
    err.code = 'CANONICAL_CAFE_MODEL_UNAVAILABLE';
    throw err;
  }

  let cafe = null;
  try {
    cafe = await CafeModel.findById(device.cafeId).lean();
  } catch (_) {
    cafe = null;
  }

  if (!cafe && rawCafeId) {
    cafe = await CafeModel.findOne({ cafeId: rawCafeId.toUpperCase() }).lean();
  }

  if (!cafe?.cafeId || !cafe?.organisationId) {
    const err = new Error('CANONICAL_CAFE_SCOPE_NOT_FOUND');
    err.code = 'CANONICAL_CAFE_SCOPE_NOT_FOUND';
    throw err;
  }

  return {
    cafeId: String(cafe.cafeId).trim().toUpperCase(),
    organisationId: String(cafe.organisationId).trim().toUpperCase(),
  };
}

async function enrollDevice({
  enrollmentCodePlain,
  displayName,
  platform,
  appVersion,
  osVersion,
  publicSigningKey,
  signingKeyAlgorithm,
  signingKeyProvider,
}) {
  const repos = getRepositories();
  const tokenHash = sha256Hex(enrollmentCodePlain);
  const enrollment = await repos.enrollmentTokens.findByHash(tokenHash);
  if (!enrollment || enrollment.status !== 'PENDING' || new Date() > new Date(enrollment.expiresAt)) {
    try {
      logSecurityEvent({
        action: SECURITY_ACTIONS.DEVICE_REJECTED,
        outcome: 'FAILURE',
        severity: 'WARN',
        metadata: { reason: !enrollment ? 'NOT_FOUND' : enrollment.status },
      });
    } catch (_) {}
    await auditService.record({ eventType: SECURITY_EVENT_TYPE.DEVICE_ENROLLMENT_FAILED, metadata: { reason: !enrollment ? 'NOT_FOUND' : enrollment.status } });
    const err = new Error('ENROLLMENT_UNAVAILABLE'); err.code = 'ENROLLMENT_UNAVAILABLE'; throw err;
  }
  const declaredPlatform = resolveCanonicalDevicePlatform(platform, null);
  const nativeEnrollment = ['ANDROID', 'IOS', 'DESKTOP'].includes(declaredPlatform);

  let canonicalSigningKey = null;
  let signingKeyThumbprint = null;
  let normalizedSigningKeyProvider = null;
  if (publicSigningKey) {
    if (String(signingKeyAlgorithm || ATTESTATION_ALGORITHM).toUpperCase() !== ATTESTATION_ALGORITHM) {
      const err = new Error('UNSUPPORTED_DEVICE_SIGNING_ALGORITHM');
      err.code = 'UNSUPPORTED_DEVICE_SIGNING_ALGORITHM';
      throw err;
    }

    const provenance = assertSigningProviderMatchesPlatform(platform, signingKeyProvider);
    canonicalSigningKey = canonicalPublicJwk(publicSigningKey);
    signingKeyThumbprint = publicKeyThumbprint(canonicalSigningKey);
    normalizedSigningKeyProvider = provenance.provider;
  } else if (nativeEnrollment) {
    const err = new Error('NATIVE_DEVICE_ATTESTATION_REQUIRED');
    err.code = 'NATIVE_DEVICE_ATTESTATION_REQUIRED';
    throw err;
  }

  const deviceToken = generateOpaqueToken();
  const device = await repos.devices.create({
    deviceCode: generateDeviceCode(),
    displayName: displayName || enrollment.intendedDisplayName || 'Cafe Operations Device',
    organisationId: enrollment.organisationId,
    cafeId: enrollment.cafeId,
    cafeDisplayName: enrollment.cafeDisplayName,
    platform: platform || 'web',
    appVersion, osVersion,
    lifecycleStatus: DEVICE_STATUS.ACTIVE,
    deviceTokenHash: sha256Hex(deviceToken),
    signingKeyThumbprint,
    signingKeyAlgorithm: canonicalSigningKey ? ATTESTATION_ALGORITHM : null,
    signingKeyProvider: normalizedSigningKeyProvider,
    attestationCapable: Boolean(canonicalSigningKey),
    integrityState: canonicalSigningKey ? 'READY' : 'UNKNOWN',
    enrolledAt: new Date(),
  });

  const consumed = await repos.enrollmentTokens.consumeIfPending(enrollment.id, {
    usedAt: new Date(),
    usedByDeviceId: device.id,
  });

  if (!consumed) {
    try { await repos.devices.delete(device.id); } catch (_) {}
    const err = new Error('ENROLLMENT_UNAVAILABLE');
    err.code = 'ENROLLMENT_UNAVAILABLE';
    throw err;
  }

  try {
    const canonicalScope = await resolveCanonicalDeviceScope(device);
    const { DeviceRegistration } = require('../../models/DeviceRegistration');
    await DeviceRegistration.findOneAndUpdate(
      { deviceId: String(device.id) },
      {
        deviceId: String(device.id),
        organisationId: canonicalScope.organisationId,
        deviceClass: 'CAFE_OWNED',
        assignedCafeId: canonicalScope.cafeId,
        deviceName: device.displayName,
        platform: resolveCanonicalDevicePlatform(device.platform || platform, normalizedSigningKeyProvider),
        status: 'ACTIVE',
        publicSigningKey: canonicalSigningKey,
        signingKeyThumbprint,
        signingKeyAlgorithm: canonicalSigningKey ? ATTESTATION_ALGORITHM : null,
        signingKeyProvider: normalizedSigningKeyProvider,
        signingKeyCreatedAt: canonicalSigningKey ? new Date() : null,
        trustLevel: 'ENROLLED',
        lastSeenAt: new Date(),
        metadata: {
          deviceCode: device.deviceCode,
          cafeOpsOrganisationRef: String(device.organisationId || ''),
          cafeOpsCafeRef: String(device.cafeId || ''),
          attestationCapable: Boolean(canonicalSigningKey),
        },
      },
      { upsert: true, new: true, runValidators: true }
    );
  } catch (canonicalErr) {
    const rollbackErrors = [];
    try {
      await repos.devices.delete(device.id);
    } catch (deviceRollbackErr) {
      rollbackErrors.push(deviceRollbackErr);
    }
    try {
      const restored = await repos.enrollmentTokens.restoreIfUsedByDevice(
        enrollment.id,
        device.id
      );
      if (!restored) {
        const restoreErr = new Error('ENROLLMENT_TOKEN_COMPENSATION_NOT_APPLIED');
        restoreErr.code = 'ENROLLMENT_TOKEN_COMPENSATION_NOT_APPLIED';
        rollbackErrors.push(restoreErr);
      }
    } catch (tokenRollbackErr) {
      rollbackErrors.push(tokenRollbackErr);
    }

    if (rollbackErrors.length) {
      canonicalErr.code = 'DEVICE_ENROLLMENT_ROLLBACK_FAILED';
      canonicalErr.rollbackErrors = rollbackErrors;
    } else if (!canonicalErr.code) {
      canonicalErr.code = 'CANONICAL_DEVICE_REGISTRATION_FAILED';
    }
    throw canonicalErr;
  }

  try {
    logSecurityEvent({
      action: SECURITY_ACTIONS.DEVICE_ENROLLED,
      deviceId: String(device.id),
      cafeId: device.cafeId,
      organisationId: device.organisationId,
      outcome: 'SUCCESS',
      severity: 'INFO',
    });
  } catch (_) {}
  await auditService.record({ eventType: SECURITY_EVENT_TYPE.DEVICE_ENROLLED, deviceId: device.id, cafeId: device.cafeId, organisationId: device.organisationId });
  return {
    device,
    deviceToken,
    attestation: {
      capable: Boolean(canonicalSigningKey),
      algorithm: canonicalSigningKey ? ATTESTATION_ALGORITHM : null,
      keyThumbprint: signingKeyThumbprint,
      provider: normalizedSigningKeyProvider,
    },
  };
}

const LIFECYCLE_END_REASON = {
  REVOKED: SESSION_END_REASON.DEVICE_REVOKED,
  LOST: SESSION_END_REASON.DEVICE_LOST,
  RETIRED: SESSION_END_REASON.DEVICE_RETIRED,
  REPLACED: SESSION_END_REASON.DEVICE_REPLACED,
};

async function transitionLifecycle(deviceId, status, { actorEmployeeId, reason, replacesDeviceId } = {}) {
  const repos = getRepositories();
  const timestampField = { REVOKED: 'revokedAt', LOST: 'lostAt', RETIRED: 'retiredAt', REPLACED: 'replacedAt' }[status];
  const patch = { lifecycleStatus: status, lifecycleReason: reason, lifecycleActorEmployeeId: actorEmployeeId };
  if (timestampField) patch[timestampField] = new Date();
  if (status === 'REPLACED' && replacesDeviceId) patch.replacesDeviceId = replacesDeviceId;

  const device = await repos.devices.update(deviceId, patch);
  if (status === 'REVOKED') {
    try {
      logSecurityEvent({
        action: SECURITY_ACTIONS.DEVICE_REVOKED,
        deviceId: String(deviceId),
        cafeId: device?.cafeId || null,
        organisationId: device?.organisationId || null,
        actorId: actorEmployeeId || null,
        outcome: 'SUCCESS',
        severity: 'WARN',
        metadata: { reason },
      });
    } catch (_) {}
  }
  if (status !== DEVICE_STATUS.ACTIVE && LIFECYCLE_END_REASON[status]) {
    // No local cached state may override this (login spec Section 63): kill
    // whatever session is live on the device the instant it stops being ACTIVE.
    await sessionService.endAllActiveSessionsForDevice(deviceId, LIFECYCLE_END_REASON[status]);

    try {
      const { DeviceRegistration } = require('../../models/DeviceRegistration');
      const { OperatorSession } = require('../../models/OperatorSession');
      await DeviceRegistration.updateMany(
        { $or: [{ deviceId: String(deviceId) }, { 'metadata.deviceCode': String(deviceId) }] },
        { status, [timestampField || 'revokedAt']: new Date(), revocationReason: reason }
      );
      await OperatorSession.updateMany(
        { deviceId: String(deviceId), status: { $in: ['ACTIVE', 'LOCKED'] } },
        { $set: { status: 'ENDED', endedAt: new Date(), endReason: 'DEVICE_' + status } }
      );
    } catch (_) {}
  }
  await auditService.record({
    eventType: SECURITY_EVENT_TYPE.DEVICE_LIFECYCLE_EVENT, deviceId, cafeId: device?.cafeId || null, organisationId: device?.organisationId || null,
    reasonCode: status, metadata: { reason, actorEmployeeId },
  });
  return device;
}

// Master spec Section 68: a device's cafe assignment must never change
// underneath a live session. Any active/locked session is force-ended
// BEFORE the reassignment is written.
async function reassignCafe(deviceId, newCafeId, { actorEmployeeId, reason, newCafeDisplayName } = {}) {
  const repos = getRepositories();
  const device = await repos.devices.findById(deviceId);
  if (!device) { const err = new Error('DEVICE_NOT_FOUND'); err.code = 'DEVICE_NOT_FOUND'; throw err; }

  await sessionService.endAllActiveSessionsForDevice(deviceId, SESSION_END_REASON.DEVICE_REASSIGNED);

  const updated = await repos.devices.update(deviceId, {
    previousCafeId: device.cafeId, cafeId: newCafeId, cafeDisplayName: newCafeDisplayName || device.cafeDisplayName, reassignedAt: new Date(),
    lifecycleReason: reason, lifecycleActorEmployeeId: actorEmployeeId,
  });
  await auditService.record({
    eventType: SECURITY_EVENT_TYPE.DEVICE_REASSIGNED_EVENT, deviceId, organisationId: device.organisationId,
    metadata: { previousCafeId: device.cafeId, newCafeId, actorEmployeeId, reason },
  });
  return updated;
}

async function getDiagnostics(device) {
  return {
    cafeId: device.cafeId,
    cafeName: device.cafeDisplayName || null,
    deviceDisplayName: device.displayName,
    registrationStatus: device.lifecycleStatus,
    lastSeenAt: device.lastSeenAt,
    lastSyncAt: device.lastSyncAt,
    appVersion: device.appVersion,
    integrityState: device.integrityState || 'UNKNOWN',
  };
}


async function bindAttestationKey(device, {
  publicSigningKey,
  signingKeyAlgorithm,
  signingKeyProvider,
} = {}) {
  if (!device?.id) {
    const err = new Error('DEVICE_CONTEXT_REQUIRED');
    err.code = 'DEVICE_CONTEXT_REQUIRED';
    throw err;
  }

  if (!publicSigningKey) {
    const err = new Error('DEVICE_SIGNING_KEY_REQUIRED');
    err.code = 'DEVICE_SIGNING_KEY_REQUIRED';
    throw err;
  }

  if (String(signingKeyAlgorithm || ATTESTATION_ALGORITHM).toUpperCase() !== ATTESTATION_ALGORITHM) {
    const err = new Error('UNSUPPORTED_DEVICE_SIGNING_ALGORITHM');
    err.code = 'UNSUPPORTED_DEVICE_SIGNING_ALGORITHM';
    throw err;
  }

  const canonicalSigningKey = canonicalPublicJwk(publicSigningKey);
  const keyThumbprint = publicKeyThumbprint(canonicalSigningKey);
  const provider = String(signingKeyProvider || 'UNKNOWN').trim().toUpperCase();
  const existingThumbprint = String(device.signingKeyThumbprint || '').trim().toLowerCase();

  if (existingThumbprint && existingThumbprint !== keyThumbprint.toLowerCase()) {
    const err = new Error('DEVICE_ATTESTATION_KEY_ROTATION_REQUIRES_REENROLLMENT');
    err.code = 'DEVICE_ATTESTATION_KEY_ROTATION_REQUIRES_REENROLLMENT';
    throw err;
  }

  const repos = getRepositories();
  const { DeviceRegistration } = require('../../models/DeviceRegistration');
  const canonical = await DeviceRegistration.findOne({
    $or: [
      { deviceId: String(device.id) },
      { 'metadata.deviceCode': String(device.deviceCode || '') },
    ],
  });

  if (!canonical) {
    const err = new Error('CANONICAL_DEVICE_REGISTRATION_NOT_FOUND');
    err.code = 'CANONICAL_DEVICE_REGISTRATION_NOT_FOUND';
    throw err;
  }

  const canonicalThumbprint = String(canonical.signingKeyThumbprint || '').trim().toLowerCase();
  const canonicalProvider = String(canonical.signingKeyProvider || '').trim().toUpperCase();
  const canonicalAlgorithm = String(canonical.signingKeyAlgorithm || '').trim().toUpperCase();
  const deviceProvider = String(device.signingKeyProvider || '').trim().toUpperCase();
  const deviceAlgorithm = String(device.signingKeyAlgorithm || '').trim().toUpperCase();

  if (
    !canonical.publicSigningKey ||
    !canonicalThumbprint ||
    !existingThumbprint
  ) {
    const err = new Error('DEVICE_ATTESTATION_REENROLLMENT_REQUIRED');
    err.code = 'DEVICE_ATTESTATION_REENROLLMENT_REQUIRED';
    throw err;
  }

  if (
    canonicalThumbprint !== keyThumbprint.toLowerCase() ||
    existingThumbprint !== keyThumbprint.toLowerCase()
  ) {
    const err = new Error('DEVICE_ATTESTATION_KEY_ROTATION_REQUIRES_REENROLLMENT');
    err.code = 'DEVICE_ATTESTATION_KEY_ROTATION_REQUIRES_REENROLLMENT';
    throw err;
  }

  const provenance = assertSigningProviderMatchesPlatform(device.platform, provider);
  if (
    canonicalProvider !== provider ||
    (deviceProvider && deviceProvider !== provider) ||
    canonicalAlgorithm !== ATTESTATION_ALGORITHM ||
    (deviceAlgorithm && deviceAlgorithm !== ATTESTATION_ALGORITHM) ||
    String(canonical.platform || 'UNKNOWN').trim().toUpperCase() !== provenance.platform ||
    canonical.metadata?.attestationCapable !== true ||
    device.attestationCapable !== true
  ) {
    const err = new Error('DEVICE_ATTESTATION_PROVENANCE_MISMATCH');
    err.code = 'DEVICE_ATTESTATION_PROVENANCE_MISMATCH';
    throw err;
  }

  // Verification is deliberately read-only. Enrollment is the only ceremony
  // allowed to establish or mutate the signing identity.
  const updated = device;

  try {
    await auditService.record({
      eventType: SECURITY_EVENT_TYPE.DEVICE_LIFECYCLE_EVENT,
      deviceId: device.id,
      cafeId: device.cafeId,
      organisationId: device.organisationId,
      reasonCode: 'DEVICE_ATTESTATION_KEY_VERIFIED',
      metadata: {
        keyThumbprint,
        algorithm: ATTESTATION_ALGORITHM,
        provider,
        idempotentReplay: true,
      },
    });
  } catch (_) {
    // Security audit delivery is non-fatal after both authoritative registries agree.
  }

  return {
    device: updated,
    attestation: {
      capable: true,
      algorithm: ATTESTATION_ALGORITHM,
      keyThumbprint,
      provider,
      idempotentReplay: true,
    },
  };
}

module.exports = { enrollDevice, bindAttestationKey, transitionLifecycle, reassignCafe, getDiagnostics };
