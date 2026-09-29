'use strict';

const crypto = require('node:crypto');
const {
  ATTESTATION_ALGORITHM,
  canonicalPublicJwk,
  publicKeyThumbprint,
} = require('./deviceAttestationService');
const { DeviceRegistration } = require('../models/DeviceRegistration');
const { DeviceSecurityEvent } = require('../models/DeviceSecurityEvent');
const { TrustedDevice } = require('../models/TrustedDevice');
const { defaultEventBus } = require('./distributedEventBus');
const { defaultPresenceService } = require('./devicePresenceService');
const auditService = require('./auditService');

const TRUSTED_DEVICE_COOKIE = 'zamorin_trusted_device';

const TRUSTED_DEVICE_EXPIRY_DAYS = {
  MASTER: 7,
  PRIMARY_MASTER: 7,
  OWNER: 14,
  CAFE_ADMIN: 14,
  STAFF: 30,
};

function getTrustedDeviceExpiryDays(user) {
  if (!user) return 7;
  if (user.isPrimaryMaster) return 7;
  const role = String(user.role || '').toUpperCase();
  return TRUSTED_DEVICE_EXPIRY_DAYS[role] || 7;
}

function hashToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('A valid token is required for hashing.');
  }
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateTrustedDeviceToken() {
  return `td_${crypto.randomBytes(48).toString('base64url')}`;
}

function deriveDeviceLabel(deviceMetadata = {}, userAgent = '') {
  const browser = deviceMetadata.browser || '';
  const os = deviceMetadata.operatingSystem || '';
  if (browser && os) {
    return `${browser} on ${os}`;
  }
  if (deviceMetadata.deviceName && deviceMetadata.deviceName !== 'Unknown device') {
    return deviceMetadata.deviceName;
  }
  if (userAgent) {
    if (userAgent.includes('Chrome')) {
      if (userAgent.includes('Windows')) return 'Chrome on Windows';
      if (userAgent.includes('Macintosh')) return 'Chrome on macOS';
      if (userAgent.includes('Linux')) return 'Chrome on Linux';
      if (userAgent.includes('Android')) return 'Chrome on Android';
      return 'Chrome Browser';
    }
    if (userAgent.includes('Firefox')) return 'Firefox Browser';
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari Browser';
    if (userAgent.includes('Edge')) return 'Edge Browser';
  }
  return 'Browser Device';
}

function maskIpAddress(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ipAddress = value.split(',')[0].trim();
  if (ipAddress.includes(':')) {
    const segments = ipAddress.split(':').filter(Boolean);
    return segments.length > 0 ? `${segments.slice(0, 4).join(':')}::` : null;
  }
  const octets = ipAddress.split('.');
  if (octets.length === 4) {
    return `${octets[0]}.${octets[1]}.x.x`;
  }
  return null;
}

class DeviceTrustService {
  /**
   * Derives the effective privilege profile from human role and device context.
   *
   * Invariant:
   * CAFE_ADMIN + PERSONAL => SELF_ONLY
   * CAFE_ADMIN + ACTIVE CAFE_OWNED (bound to cafe) => CAFE_OPERATIONS
   */
  derivePrivilegeProfile(role, deviceRegistration, requestedCafeId = null) {
    if (role === 'MASTER') {
      if (
        deviceRegistration &&
        deviceRegistration.deviceClass === 'CAFE_OWNED' &&
        deviceRegistration.status === 'ACTIVE' &&
        deviceRegistration.assignedCafeId
      ) {
        const boundCafe = deviceRegistration.assignedCafeId;
        if (requestedCafeId && requestedCafeId !== '*' && requestedCafeId !== boundCafe) {
          return {
            privilegeProfile: 'SELF_ONLY',
            allowedCafeScope: [],
            isCafeOperationsAllowed: false,
            boundCafeId: boundCafe,
            workspaceMode: 'CAFE_OPERATIONS',
          };
        }
        return {
          privilegeProfile: 'CAFE_OPERATIONS',
          allowedCafeScope: [boundCafe],
          isCafeOperationsAllowed: true,
          boundCafeId: boundCafe,
          workspaceMode: 'CAFE_OPERATIONS',
        };
      }

      return {
        privilegeProfile: 'ORGANISATION_GOVERNANCE',
        allowedCafeScope: ['*'],
        isCafeOperationsAllowed: true,
        workspaceMode: 'MASTER_WORKSPACE',
      };
    }

    if (role === 'OWNER') {
      return {
        privilegeProfile: 'STRATEGIC_EXECUTIVE_READ',
        allowedCafeScope: ['*'],
        isCafeOperationsAllowed: false,
      };
    }

    if (role === 'STAFF') {
      return {
        privilegeProfile: 'SELF_ONLY',
        allowedCafeScope: [],
        isCafeOperationsAllowed: false,
      };
    }

    if (role === 'CAFE_ADMIN') {
      // If no device registration or device is PERSONAL or not ACTIVE -> Clamp to SELF_ONLY
      if (
        !deviceRegistration ||
        deviceRegistration.deviceClass !== 'CAFE_OWNED' ||
        deviceRegistration.status !== 'ACTIVE'
      ) {
        return {
          privilegeProfile: 'SELF_ONLY',
          allowedCafeScope: [],
          isCafeOperationsAllowed: false,
        };
      }

      // Check if device is bound to a valid assigned cafe
      const boundCafe = deviceRegistration.assignedCafeId;
      if (!boundCafe) {
        return {
          privilegeProfile: 'SELF_ONLY',
          allowedCafeScope: [],
          isCafeOperationsAllowed: false,
        };
      }

      // If requested cafe does not match the device's bound cafe, deny access
      if (requestedCafeId && requestedCafeId !== '*' && requestedCafeId !== boundCafe) {
        return {
          privilegeProfile: 'SELF_ONLY',
          allowedCafeScope: [],
          isCafeOperationsAllowed: false,
          boundCafeId: boundCafe,
        };
      }

      return {
        privilegeProfile: 'CAFE_OPERATIONS',
        allowedCafeScope: [boundCafe],
        isCafeOperationsAllowed: true,
        boundCafeId: boundCafe,
      };
    }

    return {
      privilegeProfile: 'SELF_ONLY',
      allowedCafeScope: [],
      isCafeOperationsAllowed: false,
    };
  }

  /**
   * Initializes device enrollment request on cafe tablet.
   */
  async startEnrollment({ organisationId, deviceId, deviceName, publicSigningKey, requestedCafeId, correlationId }) {
    const enrollmentCode = `ENR-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${requestedCafeId || 'GEN'}`;
    const enrollmentExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes TTL

    let canonicalSigningKey = null;
    let thumbprint = null;
    if (publicSigningKey) {
      canonicalSigningKey = canonicalPublicJwk(publicSigningKey);
      thumbprint = publicKeyThumbprint(canonicalSigningKey);
    }

    const reg = await DeviceRegistration.findOneAndUpdate(
      { deviceId },
      {
        $set: {
          organisationId,
          deviceId,
          deviceName,
          deviceClass: 'CAFE_OWNED',
          assignedCafeId: requestedCafeId,
          publicSigningKey: canonicalSigningKey,
          signingKeyThumbprint: thumbprint,
          signingKeyAlgorithm: canonicalSigningKey ? ATTESTATION_ALGORITHM : null,
          signingKeyProvider: canonicalSigningKey ? 'UNKNOWN' : null,
          signingKeyCreatedAt: canonicalSigningKey ? new Date() : null,
          status: 'PENDING',
          enrollmentCode,
          enrollmentExpiresAt,
          policyVersion: 1,
          deviceVersion: 1,
        },
      },
      { upsert: true, new: true }
    );

    return {
      deviceId: reg.deviceId,
      enrollmentCode: reg.enrollmentCode,
      expiresAt: reg.enrollmentExpiresAt,
    };
  }

  /**
   * Approves device enrollment by MASTER.
   */
  async approveEnrollment({ deviceId, masterUserId, assignedCafeId, correlationId }) {
    const reg = await DeviceRegistration.findOne({ deviceId });
    if (!reg) {
      throw new Error('DEVICE_NOT_FOUND');
    }

    if (reg.status === 'REVOKED') {
      throw new Error('DEVICE_PREVIOUSLY_REVOKED_REQUIRES_NEW_HARDWARE_ENROLLMENT');
    }

    reg.status = 'ACTIVE';
    reg.assignedCafeId = assignedCafeId;
    reg.enrollmentApprovedBy = masterUserId;
    reg.enrollmentApprovedAt = new Date();
    reg.enrollmentCode = null;
    reg.policyVersion += 1;
    reg.deviceVersion += 1;

    await reg.save();

    await DeviceSecurityEvent.create({
      eventId: `DEV_EVT_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      organisationId: reg.organisationId,
      deviceId: reg.deviceId,
      deviceClass: reg.deviceClass,
      cafeId: reg.assignedCafeId,
      actorUserId: masterUserId,
      actorRole: 'MASTER',
      eventType: 'DEVICE_APPROVED',
      severity: 'INFO',
      metadata: { assignedCafeId },
      correlationId,
    });

    return reg;
  }

  /**
   * Emergency revocation of a compromised device.
   */
  async revokeDevice({ deviceId, masterUserId, reason, correlationId }) {
    const reg = await DeviceRegistration.findOne({ deviceId });
    if (!reg) {
      throw new Error('DEVICE_NOT_FOUND');
    }

    reg.status = 'REVOKED';
    reg.revokedAt = new Date();
    reg.revocationReason = reason || 'MASTER_REVOCATION';
    reg.policyVersion += 1;
    reg.deviceVersion += 1;

    await reg.save();

    try {
      const deviceService = require('../cafe-operations/services/deviceService');
      await deviceService.transitionLifecycle(reg.deviceId, 'REVOKED', { reason, actorEmployeeId: masterUserId });
    } catch (_) {}

    // Immediately terminate any active operator sessions on this device
    const { OperatorSession } = require('../models/OperatorSession');
    await OperatorSession.updateMany(
      { deviceId: reg.deviceId, status: { $in: ['ACTIVE', 'LOCKED'] } },
      {
        $set: {
          status: 'REVOKED',
          endedAt: new Date(),
          endReason: 'DEVICE_REVOKED',
        },
      }
    );

    await DeviceSecurityEvent.create({
      eventId: `DEV_EVT_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      organisationId: reg.organisationId,
      deviceId: reg.deviceId,
      deviceClass: reg.deviceClass,
      cafeId: reg.assignedCafeId,
      actorUserId: masterUserId,
      actorRole: 'MASTER',
      eventType: 'DEVICE_REVOKED',
      severity: 'CRITICAL',
      metadata: { reason },
      correlationId,
    });

    // Broadcast across cluster to terminate live sockets / SSE on any replica instance
    defaultEventBus.publish('DEVICE_REVOKED', {
      deviceId: reg.deviceId,
      organisationId: reg.organisationId,
      cafeId: reg.assignedCafeId,
      reason,
      revokedAt: reg.revokedAt,
    }).catch(() => {});

    defaultPresenceService.recordHeartbeat({
      deviceId: reg.deviceId,
      organisationId: reg.organisationId,
      cafeId: reg.assignedCafeId,
      status: 'REVOKED',
      forceDurable: true,
    }).catch(() => {});

    return reg;
  }

  /**
   * Marks a device as LOST.
   */
  async reportDeviceLost({ deviceId, masterUserId, reason, correlationId }) {
    const reg = await DeviceRegistration.findOne({ deviceId });
    if (!reg) {
      throw new Error('DEVICE_NOT_FOUND');
    }

    reg.status = 'LOST';
    reg.revocationReason = reason || 'REPORTED_LOST';
    reg.policyVersion += 1;
    reg.deviceVersion += 1;
    await reg.save();

    const { OperatorSession } = require('../models/OperatorSession');
    await OperatorSession.updateMany(
      { deviceId: reg.deviceId, status: { $in: ['ACTIVE', 'LOCKED'] } },
      {
        $set: {
          status: 'REVOKED',
          endedAt: new Date(),
          endReason: 'DEVICE_LOST',
        },
      }
    );

    defaultEventBus.publish('DEVICE_LOST', {
      deviceId: reg.deviceId,
      organisationId: reg.organisationId,
      cafeId: reg.assignedCafeId,
      reason,
    }).catch(() => {});

    defaultPresenceService.recordHeartbeat({
      deviceId: reg.deviceId,
      organisationId: reg.organisationId,
      cafeId: reg.assignedCafeId,
      status: 'LOST',
      forceDurable: true,
    }).catch(() => {});

    return reg;
  }

  /**
   * Marks a device as RETIRED.
   */
  async retireDevice({ deviceId, masterUserId, reason, correlationId }) {
    const reg = await DeviceRegistration.findOne({ deviceId });
    if (!reg) {
      throw new Error('DEVICE_NOT_FOUND');
    }

    reg.status = 'RETIRED';
    reg.retiredAt = new Date();
    reg.revocationReason = reason || 'HARDWARE_RETIRED';
    reg.policyVersion += 1;
    reg.deviceVersion += 1;
    await reg.save();

    const { OperatorSession } = require('../models/OperatorSession');
    await OperatorSession.updateMany(
      { deviceId: reg.deviceId, status: { $in: ['ACTIVE', 'LOCKED'] } },
      {
        $set: {
          status: 'ENDED',
          endedAt: new Date(),
          endReason: 'DEVICE_RETIRED',
        },
      }
    );

    defaultEventBus.publish('DEVICE_RETIRED', {
      deviceId: reg.deviceId,
      organisationId: reg.organisationId,
      cafeId: reg.assignedCafeId,
      reason,
    }).catch(() => {});

    defaultPresenceService.recordHeartbeat({
      deviceId: reg.deviceId,
      organisationId: reg.organisationId,
      cafeId: reg.assignedCafeId,
      status: 'RETIRED',
      forceDurable: true,
    }).catch(() => {});

    return reg;
  }

  /**
   * Replaces an old device with a fresh new hardware device registration.
   */
  async replaceDevice({ oldDeviceId, newDeviceId, newDeviceName, masterUserId, reason, correlationId }) {
    const oldReg = await DeviceRegistration.findOne({ deviceId: oldDeviceId });
    if (!oldReg) {
      throw new Error('OLD_DEVICE_NOT_FOUND');
    }

    oldReg.status = 'REPLACED';
    oldReg.replacedAt = new Date();
    oldReg.replacedByDeviceId = newDeviceId;
    oldReg.revocationReason = reason || 'HARDWARE_REPLACEMENT';
    await oldReg.save();

    const { OperatorSession } = require('../models/OperatorSession');
    await OperatorSession.updateMany(
      { deviceId: oldReg.deviceId, status: { $in: ['ACTIVE', 'LOCKED'] } },
      {
        $set: {
          status: 'ENDED',
          endedAt: new Date(),
          endReason: 'DEVICE_REPLACED',
        },
      }
    );

    // Create new device registration in ACTIVE state assigned to same cafe
    const newReg = await DeviceRegistration.create({
      deviceId: newDeviceId,
      organisationId: oldReg.organisationId,
      deviceName: newDeviceName || `${oldReg.deviceName} (Replacement)`,
      deviceClass: 'CAFE_OWNED',
      assignedCafeId: oldReg.assignedCafeId,
      platform: oldReg.platform || 'UNKNOWN',
      status: 'ACTIVE',
      trustLevel: 'ENROLLED',
      enrollmentApprovedBy: masterUserId,
      enrollmentApprovedAt: new Date(),
      policyVersion: 1,
      deviceVersion: 1,
    });

    defaultEventBus.publish('DEVICE_REPLACED', {
      oldDeviceId,
      newDeviceId,
      organisationId: oldReg.organisationId,
      cafeId: oldReg.assignedCafeId,
      reason,
    }).catch(() => {});

    defaultPresenceService.recordHeartbeat({
      deviceId: oldDeviceId,
      organisationId: oldReg.organisationId,
      cafeId: oldReg.assignedCafeId,
      status: 'REPLACED',
      forceDurable: true,
    }).catch(() => {});

    defaultPresenceService.recordHeartbeat({
      deviceId: newDeviceId,
      organisationId: newReg.organisationId,
      cafeId: newReg.assignedCafeId,
      status: 'ACTIVE',
      forceDurable: true,
    }).catch(() => {});

    return { oldDevice: oldReg, newDevice: newReg };
  }

  /**
   * Lists devices for an organisation / cafe with bounded pagination and search.
   */
  async listDevices({ organisationId, cafeId, status, search, page = 1, limit = 50 }) {
    const filter = { organisationId: organisationId.toUpperCase() };
    if (cafeId && cafeId !== '*') {
      filter.assignedCafeId = cafeId.toUpperCase();
    }
    if (status) {
      filter.status = status;
    }
    if (search && typeof search === 'string' && search.trim()) {
      const s = search.trim();
      filter.$or = [
        { deviceId: { $regex: s, $options: 'i' } },
        { deviceName: { $regex: s, $options: 'i' } },
        { assignedCafeId: { $regex: s, $options: 'i' } },
      ];
    }

    const parsedLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const [devices, total] = await Promise.all([
      DeviceRegistration.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      DeviceRegistration.countDocuments(filter),
    ]);

    devices.pagination = {
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit) || 1,
    };

    return devices;
  }

  get TRUSTED_DEVICE_COOKIE() {
    return TRUSTED_DEVICE_COOKIE;
  }

  getTrustedDeviceExpiryDays(user) {
    return getTrustedDeviceExpiryDays(user);
  }

  hashTrustedDeviceToken(token) {
    return hashToken(token);
  }

  /**
   * Registers a new browser trusted device for an authenticated user after MFA / strong auth.
   */
  async registerTrustedDevice({
    organisationId,
    userId,
    user,
    deviceMetadata = {},
    ipAddress = null,
    userAgent = '',
    correlationId = null,
  }) {
    if (!organisationId || !userId) {
      throw new Error('ORGANISATION_AND_USER_REQUIRED');
    }

    const expiryDays = getTrustedDeviceExpiryDays(user);
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    const rawToken = generateTrustedDeviceToken();
    const tokenHash = hashToken(rawToken);
    const deviceTrustId = `TD-${crypto.randomUUID().toUpperCase()}`;

    const deviceLabel = deriveDeviceLabel(deviceMetadata, userAgent);
    const sessionVersionSnapshot = typeof user?.sessionVersion === 'number' ? user.sessionVersion : 0;
    const roleSnapshot = user?.role ? user.role.toUpperCase() : 'STAFF';

    const trustedDevice = await TrustedDevice.create({
      deviceTrustId,
      organisationId: organisationId.toUpperCase(),
      userId: userId.toUpperCase(),
      tokenHash,
      status: 'ACTIVE',
      roleSnapshot,
      sessionVersionSnapshot,
      deviceLabel,
      deviceType: deviceMetadata.deviceType || 'DESKTOP',
      browser: deviceMetadata.browser || '',
      operatingSystem: deviceMetadata.operatingSystem || '',
      userAgent: userAgent ? userAgent.slice(0, 500) : '',
      lastIpMasked: maskIpAddress(ipAddress),
      expiresAt,
      lastUsedAt: new Date(),
    });

    try {
      await auditService.recordAuditEvent({
        organisationId: organisationId.toUpperCase(),
        actorUserId: userId.toUpperCase(),
        actorRole: roleSnapshot,
        module: 'AUTHENTICATION',
        action: 'TRUSTED_DEVICE_REGISTERED',
        entityType: 'TRUSTED_DEVICE',
        entityId: deviceTrustId,
        reason: 'New trusted device registered after successful multi-factor authentication.',
        result: 'SUCCESS',
        riskClassification: 'LOW',
        correlationId,
        metadata: {
          deviceTrustId,
          deviceLabel,
          expiresAt,
          expiryDays,
        },
      });
    } catch (_auditErr) {}

    return {
      rawToken,
      trustedDevice,
      expiresAt,
    };
  }

  /**
   * Authoritatively verifies a presented trusted-device credential for password login.
   */
  async verifyTrustedDevice({
    rawToken,
    organisationId,
    userId,
    user,
    ipAddress = null,
    correlationId = null,
  }) {
    if (!rawToken || typeof rawToken !== 'string') {
      return { valid: false, reason: 'NO_TOKEN' };
    }

    let tokenHash;
    try {
      tokenHash = hashToken(rawToken);
    } catch {
      return { valid: false, reason: 'INVALID_TOKEN_FORMAT' };
    }

    const trustedDevice = await TrustedDevice.findOne({
      tokenHash,
      status: 'ACTIVE',
    });

    if (!trustedDevice) {
      return { valid: false, reason: 'TOKEN_NOT_FOUND' };
    }

    const normOrg = String(organisationId || '').trim().toUpperCase();
    const normUser = String(userId || '').trim().toUpperCase();

    // Verify cryptographic binding to organisation and user
    if (trustedDevice.organisationId !== normOrg || trustedDevice.userId !== normUser) {
      try {
        await auditService.recordAuditEvent({
          organisationId: normOrg || trustedDevice.organisationId,
          actorUserId: normUser || 'UNKNOWN',
          actorRole: 'SYSTEM',
          module: 'AUTHENTICATION',
          action: 'INVALID_TRUSTED_DEVICE_ATTEMPT',
          entityType: 'TRUSTED_DEVICE',
          entityId: trustedDevice.deviceTrustId,
          reason: 'Trusted device credential presented with mismatched user or organisation binding.',
          result: 'DENIED',
          riskClassification: 'HIGH',
          correlationId,
        });
      } catch (_err) {}

      return { valid: false, reason: 'USER_ORG_MISMATCH' };
    }

    // Check expiry
    const now = new Date();
    if (trustedDevice.expiresAt < now) {
      trustedDevice.status = 'EXPIRED';
      await trustedDevice.save();

      try {
        await auditService.recordAuditEvent({
          organisationId: trustedDevice.organisationId,
          actorUserId: trustedDevice.userId,
          actorRole: trustedDevice.roleSnapshot,
          module: 'AUTHENTICATION',
          action: 'TRUSTED_DEVICE_EXPIRED',
          entityType: 'TRUSTED_DEVICE',
          entityId: trustedDevice.deviceTrustId,
          reason: 'Trusted device credential presented after expiration.',
          result: 'DENIED',
          riskClassification: 'LOW',
          correlationId,
        });
      } catch (_err) {}

      return { valid: false, reason: 'EXPIRED' };
    }

    // Check user account status
    if (user && user.accountStatus !== 'ACTIVE') {
      return { valid: false, reason: 'ACCOUNT_INACTIVE' };
    }

    // Check session/security version invalidation
    if (user && typeof user.sessionVersion === 'number' && user.sessionVersion !== trustedDevice.sessionVersionSnapshot) {
      return { valid: false, reason: 'SECURITY_VERSION_CHANGED' };
    }

    // Check role material change
    if (user && user.role && user.role.toUpperCase() !== trustedDevice.roleSnapshot) {
      return { valid: false, reason: 'ROLE_CHANGED' };
    }

    // Trust is valid! Update last used and IP
    trustedDevice.lastUsedAt = now;
    if (ipAddress) {
      trustedDevice.lastIpMasked = maskIpAddress(ipAddress);
    }
    await trustedDevice.save();

    try {
      await auditService.recordAuditEvent({
        organisationId: trustedDevice.organisationId,
        actorUserId: trustedDevice.userId,
        actorRole: trustedDevice.roleSnapshot,
        module: 'AUTHENTICATION',
        action: 'TRUSTED_DEVICE_USED',
        entityType: 'TRUSTED_DEVICE',
        entityId: trustedDevice.deviceTrustId,
        reason: 'Valid trusted device credential presented to satisfy routine multi-factor requirement.',
        result: 'SUCCESS',
        riskClassification: 'LOW',
        correlationId,
      });
    } catch (_err) {}

    return {
      valid: true,
      trustedDevice,
    };
  }

  /**
   * Revokes a specific trusted device by deviceTrustId.
   */
  async revokeTrustedDevice({
    organisationId,
    userId,
    deviceTrustId,
    revokedBy,
    reason = 'USER_REVOKED',
    actorRole = 'STAFF',
    correlationId = null,
  }) {
    const filter = {
      organisationId: organisationId.toUpperCase(),
      deviceTrustId: deviceTrustId.toUpperCase(),
    };

    if (actorRole !== 'MASTER') {
      filter.userId = userId.toUpperCase();
    }

    const mongoose = require('mongoose');
    if (mongoose.connection?.readyState !== 1) {
      return null;
    }

    const device = await TrustedDevice.findOne(filter);
    if (!device) {
      throw new Error('TRUSTED_DEVICE_NOT_FOUND');
    }

    device.status = 'REVOKED';
    device.revokedAt = new Date();
    device.revokedBy = (revokedBy || userId).toUpperCase();
    device.revocationReason = reason;
    await device.save();

    try {
      await auditService.recordAuditEvent({
        organisationId: device.organisationId,
        actorUserId: (revokedBy || userId).toUpperCase(),
        actorRole,
        module: 'AUTHENTICATION',
        action: 'TRUSTED_DEVICE_REVOKED',
        entityType: 'TRUSTED_DEVICE',
        entityId: device.deviceTrustId,
        reason: `Trusted device revoked: ${reason}`,
        result: 'SUCCESS',
        riskClassification: 'MEDIUM',
        correlationId,
        metadata: {
          deviceTrustId: device.deviceTrustId,
          targetUserId: device.userId,
        },
      });
    } catch (_err) {}

    return device;
  }

  /**
   * Revokes all trusted devices for a user (e.g. on password reset, or user request).
   */
  async revokeAllUserTrustedDevices({
    organisationId,
    userId,
    revokedBy,
    reason = 'ALL_REVOKED',
    exceptDeviceTrustId = null,
    actorRole = 'SYSTEM',
    correlationId = null,
  }) {
    const filter = {
      organisationId: organisationId.toUpperCase(),
      userId: userId.toUpperCase(),
      status: 'ACTIVE',
    };

    if (exceptDeviceTrustId) {
      filter.deviceTrustId = { $ne: exceptDeviceTrustId.toUpperCase() };
    }

    const now = new Date();
    let result = { modifiedCount: 0 };
    const mongoose = require('mongoose');

    if (mongoose.connection?.readyState === 1) {
      result = await TrustedDevice.updateMany(filter, {
        $set: {
          status: 'REVOKED',
          revokedAt: now,
          revokedBy: (revokedBy || userId).toUpperCase(),
          revocationReason: reason,
        },
      });
    }

    try {
      await auditService.recordAuditEvent({
        organisationId: organisationId.toUpperCase(),
        actorUserId: (revokedBy || userId).toUpperCase(),
        actorRole,
        module: 'AUTHENTICATION',
        action: 'ALL_TRUSTED_DEVICES_REVOKED',
        entityType: 'USER',
        entityId: userId.toUpperCase(),
        reason: `All trusted devices revoked: ${reason}`,
        result: 'SUCCESS',
        riskClassification: 'MEDIUM',
        correlationId,
        metadata: {
          revokedCount: result.modifiedCount || 0,
        },
      });
    } catch (_err) {}

    return result;
  }

  /**
   * Lists trusted devices for an authenticated user.
   */
  async listUserTrustedDevices({
    organisationId,
    userId,
    currentRawToken = null,
  }) {
    let currentTokenHash = null;
    if (currentRawToken) {
      try {
        currentTokenHash = hashToken(currentRawToken);
      } catch {}
    }

    const devices = await TrustedDevice.find({
      organisationId: organisationId.toUpperCase(),
      userId: userId.toUpperCase(),
      status: 'ACTIVE',
    })
      .select('-tokenHash')
      .sort({ lastUsedAt: -1 })
      .lean();

    return devices.map((d) => ({
      ...d,
      isCurrentDevice: currentTokenHash ? d.tokenHash === currentTokenHash : false,
    }));
  }
}

module.exports = new DeviceTrustService();

