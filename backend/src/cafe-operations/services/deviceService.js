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
  let canonicalSigningKey = null;
  let signingKeyThumbprint = null;
  let normalizedSigningKeyProvider = null;
  if (publicSigningKey) {
    if (String(signingKeyAlgorithm || ATTESTATION_ALGORITHM).toUpperCase() !== ATTESTATION_ALGORITHM) {
      const err = new Error('UNSUPPORTED_DEVICE_SIGNING_ALGORITHM');
      err.code = 'UNSUPPORTED_DEVICE_SIGNING_ALGORITHM';
      throw err;
    }
    canonicalSigningKey = canonicalPublicJwk(publicSigningKey);
    signingKeyThumbprint = publicKeyThumbprint(canonicalSigningKey);
    normalizedSigningKeyProvider = String(signingKeyProvider || 'UNKNOWN').trim().toUpperCase();
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
  await repos.enrollmentTokens.update(enrollment.id, { status: 'USED', usedAt: new Date(), usedByDeviceId: device.id });
  try {
    const { DeviceRegistration } = require('../../models/DeviceRegistration');
    await DeviceRegistration.findOneAndUpdate(
      { deviceId: String(device.id) },
      {
        deviceId: String(device.id),
        organisationId: device.organisationId,
        deviceClass: 'CAFE_OWNED',
        assignedCafeId: device.cafeId,
        deviceName: device.displayName,
        platform: 'WEB_POS',
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
          attestationCapable: Boolean(canonicalSigningKey),
        },
      },
      { upsert: true, new: true }
    );
  } catch (_) {}
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

module.exports = { enrollDevice, transitionLifecycle, reassignCafe, getDiagnostics };
