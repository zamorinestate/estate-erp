'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcrypt');

const { User } = require('../models/User');
const { Cafe } = require('../models/Cafe');
const { DeviceRegistration } = require('../models/DeviceRegistration');
const { OperatorSession } = require('../models/OperatorSession');
const { AuditEvent } = require('../models/AuditEvent');
const { ApiError } = require('../utils/ApiError');

const PIN_HASH_ROUNDS = 12;
const MAX_FAILED_PIN_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;
const INACTIVITY_LOCK_MINUTES = 30;

class OperatorSessionService {
  /**
   * Safe audit logging helper.
   */
  async _logAudit({
    organisationId,
    cafeId = null,
    actorUserId,
    actorRole,
    action,
    entityType,
    entityId,
    details = {},
    result = 'SUCCESS',
    riskClassification = 'LOW',
    correlationId = null,
  }) {
    try {
      const { recordAuditEvent } = require('./auditService');
      await recordAuditEvent({
        organisationId: organisationId || 'ZAMORIN',
        cafeId,
        actorUserId: actorUserId || 'SYSTEM',
        actorRole: actorRole || 'SYSTEM',
        module: 'CAFE_OPERATIONS',
        action: action || 'OPERATOR_ACTION',
        entityType: entityType || 'OPERATOR_SESSION',
        entityId: entityId || 'OPS_SYSTEM',
        result,
        riskClassification,
        correlationId: correlationId || `CID-${Date.now()}`,
        metadata: details,
      });
    } catch (_) {
      // Safe fallback for background test runs
    }
  }

  /**
   * Returns active cafes and eligible operators for the Cafe Operations login directory.
   */
  async getCafeOperationsDirectory({ organisationId = 'ZAMORIN' } = {}) {
    const orgId = String(organisationId || 'ZAMORIN').toUpperCase();

    const [cafes, operators] = await Promise.all([
      Cafe.find({
        organisationId: orgId,
        status: 'ACTIVE',
      })
        .select('cafeId name displayName address.city status')
        .sort({ name: 1 })
        .lean(),

      User.find({
        organisationId: orgId,
        role: { $in: ['CAFE_ADMIN', 'MASTER'] },
        accountStatus: 'ACTIVE',
      })
        .select('userId name role primaryCafeId assignedCafeIds isPrimaryMaster')
        .sort({ name: 1 })
        .lean(),
    ]);

    return {
      success: true,
      data: {
        cafes: cafes.map((c) => ({
          cafeId: c.cafeId,
          name: c.name,
          displayName: c.displayName || c.name,
          city: c.address?.city || '',
        })),
        operators: operators.map((u) => ({
          userId: u.userId,
          name: u.name,
          role: u.role,
          isPrimaryMaster: Boolean(u.isPrimaryMaster),
          primaryCafeId: u.primaryCafeId || null,
          assignedCafeIds: u.assignedCafeIds || [],
        })),
      },
    };
  }

  /**
   * Sets or resets the 6-digit Cafe Operations PIN for a cafe.
   */
  async setCafePin({ organisationId, cafeId, actorUserId, actorRole, newPin, pin }) {
    const rawPin = newPin || pin;
    if (!rawPin || !/^\d{6}$/.test(String(rawPin))) {
      throw new ApiError(400, 'INVALID_CAFE_PIN', 'Cafe Operations PIN must be exactly 6 numeric digits.');
    }

    const { isWeakPin } = require('../utils/pinPolicy');
    if (isWeakPin(String(rawPin))) {
      throw new ApiError(400, 'WEAK_PIN_REJECTED', 'Please choose a stronger, non-sequential 6-digit Café PIN.');
    }

    if (actorRole !== 'MASTER') {
      throw new ApiError(403, 'UNAUTHORIZED_CAFE_PIN_SETUP', 'Only Master Administrator can configure Cafe PIN.');
    }

    const cafe = await Cafe.findOne({
      organisationId: (organisationId || 'ZAMORIN').toUpperCase(),
      cafeId: cafeId.toUpperCase(),
    });

    if (!cafe) {
      throw new ApiError(404, 'CAFE_NOT_FOUND', `Cafe ${cafeId} was not found.`);
    }

    const pinHash = await this.hashPin(rawPin);
    cafe.operationsPinHash = pinHash;
    cafe.operationsPinSetAt = new Date();
    cafe.operationsPinFailedAttempts = 0;
    cafe.operationsPinLockedUntil = null;
    await cafe.save();

    await this._logAudit({
      organisationId: cafe.organisationId,
      cafeId: cafe.cafeId,
      action: 'CAFE_PIN_SET',
      actorUserId,
      actorRole,
      entityType: 'CAFE',
      entityId: cafe.cafeId,
      details: { cafeId: cafe.cafeId, reason: 'Cafe Operations PIN configured / updated' },
    });

    return {
      success: true,
      message: `Cafe Operations PIN configured for ${cafe.cafeId}.`,
      cafeId: cafe.cafeId,
    };
  }

  async setCafeOperationsPin(params) {
    return this.setCafePin(params);
  }

  /**
   * Hashes a 6-digit Operator PIN.
   */
  async hashPin(pin) {
    if (!pin || !/^\d{6}$/.test(String(pin))) {
      throw new ApiError(400, 'INVALID_OPERATOR_PIN', 'Operator PIN must be exactly 6 digits.');
    }
    const { isWeakPin } = require('../utils/pinPolicy');
    if (isWeakPin(String(pin))) {
      throw new ApiError(400, 'WEAK_PIN_REJECTED', 'Operator PIN must be a strong, non-sequential 6-digit PIN.');
    }
    return bcrypt.hash(String(pin), PIN_HASH_ROUNDS);
  }

  /**
   * Sets or resets an Operator PIN for an eligible employee.
   */
  async setOperatorPin({ organisationId, targetUserId, actorUserId, actorRole, newPin }) {
    if (!newPin || !/^\d{6}$/.test(String(newPin))) {
      throw new ApiError(400, 'INVALID_OPERATOR_PIN', 'Operator PIN must be exactly 6 numeric digits.');
    }

    // Centralized weak PIN check
    const { isWeakPin } = require('../utils/pinPolicy');
    if (isWeakPin(String(newPin))) {
      throw new ApiError(400, 'WEAK_PIN_REJECTED', 'Please choose a stronger, non-sequential 6-digit PIN.');
    }

    const user = await User.findOne({
      organisationId: organisationId.toUpperCase(),
      userId: targetUserId.toUpperCase(),
    });

    if (!user) {
      throw new ApiError(404, 'USER_NOT_FOUND', `User ${targetUserId} was not found.`);
    }

    // Role check: Only MASTER or the user themselves can set their PIN
    if (actorRole !== 'MASTER' && actorUserId !== targetUserId) {
      throw new ApiError(403, 'UNAUTHORIZED_PIN_SETUP', 'Only Master or the user themselves can configure Operator PIN.');
    }

    const pinHash = await this.hashPin(newPin);
    user.operatorPinHash = pinHash;
    user.operatorPinSetAt = new Date();
    user.operatorPinFailedAttempts = 0;
    user.operatorPinLockedUntil = null;

    await user.save();

    await this._logAudit({
      organisationId: user.organisationId,
      action: 'OPERATOR_PIN_SET',
      actorUserId,
      actorRole,
      entityType: 'USER',
      entityId: user.userId,
      details: {
        targetUserId: user.userId,
        reason: 'Operator PIN configured / updated',
      },
    });

    return {
      success: true,
      message: 'Operator PIN configured successfully.',
      userId: user.userId,
    };
  }

  /**
   * Operator Sign-In on a cafe-owned, trusted device (supports dual-PIN verification).
   */
  async signInOperator({ organisationId, deviceId, cafeId, operatorUserId, employeeId, cafePin, pin, gatewayContextToken, rememberAccess, clientIp, userAgent, correlationId }) {
    const effectiveOperatorUserId = (operatorUserId || employeeId || '').trim();
    let orgId = (organisationId || 'ZAMORIN').toUpperCase();
    let targetCafeId = null;
    let cafe = null;
    let accessMethod = 'DEVICE';

    const cleanGatewayToken = (gatewayContextToken || '').trim();

    if (cleanGatewayToken) {
      // 1. Authoritative Gateway Context Resolution (P0-01)
      const { CafeGatewayContext } = require('../models/CafeGatewayContext');
      const gatewayContext = await CafeGatewayContext.findOne({
        gatewayContextId: cleanGatewayToken,
      });

      if (!gatewayContext) {
        throw new ApiError(401, 'INVALID_GATEWAY_CONTEXT', 'Cafe Operations access is unavailable or invalid.');
      }

      // P0-01B: Expiration check (independent of MongoDB TTL monitor)
      if (!gatewayContext.expiresAt || new Date(gatewayContext.expiresAt) <= new Date() || gatewayContext.status === 'EXPIRED') {
        throw new ApiError(401, 'GATEWAY_CONTEXT_EXPIRED', 'This access session has expired. Please start again.');
      }

      if (gatewayContext.consumed || gatewayContext.status === 'CONSUMED') {
        throw new ApiError(401, 'GATEWAY_CONTEXT_CONSUMED', 'This access context has already been used. Please scan or enter PIN again.');
      }

      if (gatewayContext.status !== 'ACTIVE') {
        throw new ApiError(403, 'GATEWAY_CONTEXT_INACTIVE', 'Cafe Operations access is currently unavailable.');
      }

      // Check CafeAccess record & emergency lock
      const { CafeAccess } = require('../models/CafeAccess');
      const cafeAccessDoc = await CafeAccess.findOne({
        organisationId: gatewayContext.organisationId,
        cafeId: gatewayContext.cafeId,
      });

      if (!cafeAccessDoc || cafeAccessDoc.accessStatus === 'LOCKED' || cafeAccessDoc.accessStatus === 'DISABLED') {
        throw new ApiError(403, 'CAFE_ACCESS_UNAVAILABLE', 'Café Operations access is currently unavailable.');
      }

      // Check parent cafe status
      cafe = await Cafe.findOne({
        organisationId: gatewayContext.organisationId,
        cafeId: gatewayContext.cafeId,
      });

      if (!cafe || cafe.status === 'ARCHIVED' || cafe.status === 'CLOSED') {
        throw new ApiError(403, 'CAFE_INACTIVE', 'Café Operations access is currently unavailable.');
      }

      // Authoritative derivation from server Gateway Context (P0-01)
      orgId = gatewayContext.organisationId;
      targetCafeId = gatewayContext.cafeId;
      accessMethod = gatewayContext.accessMethod || 'GATEWAY';

      // Security Invariant: Client-supplied cafeId is NEVER authoritative; if supplied, reject tampering
      if (cafeId && cafeId.trim().toUpperCase() !== targetCafeId) {
        throw new ApiError(403, 'CAFE_MISMATCH', 'Selected cafe does not match the active gateway context.');
      }

      // Mark gateway context consumed
      gatewayContext.consumed = true;
      gatewayContext.status = 'CONSUMED';
      gatewayContext.consumedAt = new Date();
      gatewayContext.consumedByUserId = (effectiveOperatorUserId || '').toUpperCase();
      await gatewayContext.save().catch(() => {});
    } else {
      // Direct registered device sign-in
      const resolvedDeviceId = deviceId;
      let device = null;
      if (resolvedDeviceId) {
        device = await DeviceRegistration.findOne({
          $or: [{ deviceId: resolvedDeviceId }, { 'metadata.deviceCode': resolvedDeviceId }],
          organisationId: orgId,
        });

        if (!device) {
          // Check repos.devices / CafeOpsDevice as fallback bridge
          try {
            const { getRepositories } = require('../cafe-operations/repositories');
            const repos = getRepositories();
            const cafeOpsDev = (await repos.devices.findById(resolvedDeviceId)) || (await repos.devices.findByCode(resolvedDeviceId));
            if (cafeOpsDev) {
              device = await DeviceRegistration.findOneAndUpdate(
                { deviceId: String(cafeOpsDev.id) },
                {
                  deviceId: String(cafeOpsDev.id),
                  organisationId: cafeOpsDev.organisationId,
                  deviceClass: 'CAFE_OWNED',
                  assignedCafeId: cafeOpsDev.cafeId,
                  deviceName: cafeOpsDev.displayName,
                  platform: 'WEB_POS',
                  status: cafeOpsDev.lifecycleStatus === 'ACTIVE' ? 'ACTIVE' : (cafeOpsDev.lifecycleStatus || 'REVOKED'),
                  trustLevel: 'ENROLLED',
                  lastSeenAt: new Date(),
                  metadata: { deviceCode: cafeOpsDev.deviceCode },
                },
                { upsert: true, new: true }
              );
            }
          } catch (_) {}
        }
      }

      if (device && device.status !== 'ACTIVE') {
        throw new ApiError(403, 'DEVICE_REVOKED', `This device is ${device.status}. Operations access is blocked.`);
      }

      if (device && device.assignedCafeId) {
        targetCafeId = device.assignedCafeId;
        cafe = await Cafe.findOne({ organisationId: orgId, cafeId: targetCafeId }).select('+operationsPinHash');
      } else if (cafeId) {
        targetCafeId = cafeId.trim().toUpperCase();
        cafe = await Cafe.findOne({ organisationId: orgId, cafeId: targetCafeId }).select('+operationsPinHash');
      }

      if (cafeId && targetCafeId && cafeId.trim().toUpperCase() !== targetCafeId) {
        throw new ApiError(403, 'CAFE_DEVICE_MISMATCH', 'Selected cafe does not match the device assigned cafe.');
      }

      if (!targetCafeId) {
        throw new ApiError(400, 'DEVICE_OR_CAFE_REQUIRED', 'Cafe Operations require a registered device or valid cafe gateway context.');
      }

      if (!cafe) {
        throw new ApiError(404, 'CAFE_NOT_FOUND', `Cafe ${targetCafeId} was not found.`);
      }

      if (cafe.status !== 'ACTIVE') {
        throw new ApiError(403, 'CAFE_INACTIVE', `Cafe ${targetCafeId} is currently ${cafe.status}. Operations access is blocked.`);
      }

      // Dual-PIN Verification (if location has operationsPinHash configured or cafePin supplied)
      if (cafe && (cafe.operationsPinHash || cafePin)) {
        if (cafe.operationsPinLockedUntil && new Date(cafe.operationsPinLockedUntil) > new Date()) {
          const waitMinutes = Math.ceil((new Date(cafe.operationsPinLockedUntil) - new Date()) / 60000);
          throw new ApiError(429, 'CAFE_PIN_LOCKED', `Cafe Operations PIN is temporarily locked. Try again in ${waitMinutes} minute(s).`);
        }

        if (!cafePin) {
          throw new ApiError(400, 'CAFE_PIN_REQUIRED', 'Cafe PIN is required for this location.');
        }

        if (!cafe.operationsPinHash) {
          throw new ApiError(401, 'INVALID_CAFE_PIN', 'Cafe PIN not recognised. Please verify and try again.');
        }

        const isCafePinValid = await bcrypt.compare(String(cafePin), cafe.operationsPinHash);
        if (!isCafePinValid) {
          cafe.operationsPinFailedAttempts = (cafe.operationsPinFailedAttempts || 0) + 1;
          if (cafe.operationsPinFailedAttempts >= MAX_FAILED_PIN_ATTEMPTS) {
            cafe.operationsPinLockedUntil = new Date(Date.now() + PIN_LOCK_MINUTES * 60 * 1000);
          }
          await cafe.save();

          await this._logAudit({
            organisationId: orgId,
            cafeId: cafe.cafeId,
            action: 'CAFE_PIN_AUTH_FAILED',
            actorUserId: effectiveOperatorUserId || 'UNKNOWN',
            actorRole: 'CAFE_ADMIN',
            entityType: 'CAFE',
            entityId: cafe.cafeId,
            result: 'FAILURE',
            riskClassification: 'HIGH',
            details: { failedAttempts: cafe.operationsPinFailedAttempts, targetCafeId: cafe.cafeId },
          });

          throw new ApiError(401, 'INVALID_CAFE_PIN', 'Cafe PIN not recognised. Please verify and try again.');
        }

        // Reset cafe PIN failed attempts on success
        if (cafe.operationsPinFailedAttempts > 0) {
          cafe.operationsPinFailedAttempts = 0;
          cafe.operationsPinLockedUntil = null;
          await cafe.save();
        }
      }
    }

    // 2. Device Verification / Resolution
    let resolvedDeviceId = deviceId || (cafe ? `DEV-WEB-${cafe.cafeId}` : null);
    if (!resolvedDeviceId) {
      throw new ApiError(400, 'DEVICE_OR_CAFE_REQUIRED', 'Cafe Operations require a registered device or valid cafe selection.');
    }

    let device = await DeviceRegistration.findOne({
      deviceId: resolvedDeviceId,
      organisationId: orgId,
    });

    if (!device && cafe) {
      // Auto-enrol standard web terminal device for cafe if none exists
      device = await DeviceRegistration.create({
        deviceId: resolvedDeviceId,
        organisationId: orgId,
        deviceName: `${cafe.displayName || cafe.name} (Web Terminal)`,
        deviceClass: 'CAFE_OWNED',
        assignedCafeId: cafe.cafeId,
        status: 'ACTIVE',
        trustLevel: 'ENROLLED',
        enrollmentApprovedBy: 'SYSTEM',
        enrollmentApprovedAt: new Date(),
        policyVersion: 1,
        deviceVersion: 1,
      });
    }

    if (!device) {
      throw new ApiError(403, 'DEVICE_NOT_REGISTERED', 'This device is not enrolled in Zamorin Cafe Operations.');
    }

    if (device.deviceClass !== 'CAFE_OWNED') {
      throw new ApiError(403, 'PERSONAL_DEVICE_DENIED', 'Cafe Operations is only accessible on cafe-owned trusted devices.');
    }

    if (device.status !== 'ACTIVE') {
      throw new ApiError(403, 'DEVICE_INACTIVE', `This device is currently ${device.status}. Cafe Operations access is blocked.`);
    }

    if (!device.assignedCafeId) {
      throw new ApiError(403, 'DEVICE_UNASSIGNED', 'This device has not been assigned to a specific cafe.');
    }

    const deviceCafe = device.assignedCafeId;
    if (cafe && cafe.cafeId !== deviceCafe) {
      throw new ApiError(403, 'CAFE_DEVICE_MISMATCH', 'Selected cafe does not match the device assigned cafe.');
    }

    // 4. Operator Identification & Role Verification
    if (!effectiveOperatorUserId || !pin) {
      throw new ApiError(400, 'MISSING_CREDENTIALS', 'Operator ID and 6-digit PIN are required.');
    }

    const user = await User.findOne({
      organisationId: orgId,
      $or: [
        { userId: effectiveOperatorUserId.toUpperCase() },
        { employeeId: effectiveOperatorUserId.toUpperCase() },
      ],
    }).select('+operatorPinHash');

    if (!user) {
      throw new ApiError(401, 'INVALID_OPERATOR_CREDENTIALS', 'Operator code not recognised. Please try again.');
    }

    if (user.accountStatus !== 'ACTIVE') {
      throw new ApiError(403, 'OPERATOR_INACTIVE', 'Operator account is not active.');
    }

    // Invariant: STAFF cannot elevate on a trusted device
    if (user.role === 'STAFF') {
      throw new ApiError(403, 'STAFF_ELEVATION_DENIED', 'Staff users cannot access Cafe Operations without explicit Operator authorization.');
    }

    // Only CAFE_ADMIN and MASTER can operate
    if (user.role !== 'CAFE_ADMIN' && user.role !== 'MASTER') {
      throw new ApiError(403, 'UNAUTHORIZED_ROLE', 'User does not possess Cafe Operations authority.');
    }

    // 5. Cafe Assignment Matching (Strict Invariant: No cross-cafe leakage)
    let isCafeAllowed = false;

    if (user.role === 'MASTER') {
      isCafeAllowed = true;
    } else {
      if (user.primaryCafeId === deviceCafe) {
        isCafeAllowed = true;
      } else if (Array.isArray(user.assignedCafeIds) && user.assignedCafeIds.includes(deviceCafe)) {
        isCafeAllowed = true;
      } else if (
        user.cafeOperatorAccess &&
        user.cafeOperatorAccess.active &&
        user.cafeOperatorAccess.assignedCafeId === deviceCafe &&
        (!user.cafeOperatorAccess.validUntil || new Date(user.cafeOperatorAccess.validUntil) >= new Date())
      ) {
        isCafeAllowed = true;
      }
    }

    if (!isCafeAllowed) {
      await this._logAudit({
        organisationId: orgId,
        cafeId: deviceCafe,
        action: 'OPERATOR_WRONG_CAFE_ATTEMPT',
        actorUserId: user.userId,
        actorRole: user.role,
        entityType: 'DEVICE',
        entityId: device.deviceId,
        result: 'DENIED',
        riskClassification: 'MEDIUM',
        details: { deviceCafeId: deviceCafe, userPrimaryCafeId: user.primaryCafeId },
      });
      throw new ApiError(403, 'WRONG_CAFE_ACCESS', 'Your account is not authorised for this café.');
    }

    // 6. Rate-Limiting & Lockout Check for Operator PIN
    if (user.operatorPinLockedUntil && new Date(user.operatorPinLockedUntil) > new Date()) {
      const waitMinutes = Math.ceil((new Date(user.operatorPinLockedUntil) - new Date()) / 60000);
      throw new ApiError(429, 'OPERATOR_PIN_LOCKED', `Too many failed attempts. Try again in ${waitMinutes} minute(s).`);
    }

    // If user does not have PIN set yet, set it or throw
    if (!user.operatorPinHash) {
      throw new ApiError(403, 'OPERATOR_PIN_NOT_SET', 'Operator PIN has not been set for this account. Please contact Master Administrator.');
    }

    // 7. PIN Verification
    const isPinValid = await bcrypt.compare(String(pin), user.operatorPinHash);
    if (!isPinValid) {
      user.operatorPinFailedAttempts = (user.operatorPinFailedAttempts || 0) + 1;
      if (user.operatorPinFailedAttempts >= MAX_FAILED_PIN_ATTEMPTS) {
        user.operatorPinLockedUntil = new Date(Date.now() + PIN_LOCK_MINUTES * 60 * 1000);
      }
      await user.save();

      await this._logAudit({
        organisationId: orgId,
        cafeId: deviceCafe,
        action: 'OPERATOR_AUTH_FAILED',
        actorUserId: user.userId,
        actorRole: user.role,
        entityType: 'DEVICE',
        entityId: device.deviceId,
        result: 'FAILURE',
        riskClassification: 'HIGH',
        details: { failedAttempts: user.operatorPinFailedAttempts },
      });

      throw new ApiError(401, 'INVALID_OPERATOR_CREDENTIALS', 'Operator code not recognised. Please try again.');
    }

    // Reset failed attempts on success
    user.operatorPinFailedAttempts = 0;
    user.operatorPinLockedUntil = null;
    await user.save();

    // 8. Close Any Existing Active Operator Sessions on this Device
    await OperatorSession.updateMany(
      { deviceId: device.deviceId, status: { $in: ['ACTIVE', 'LOCKED'] } },
      {
        $set: {
          status: 'ENDED',
          endedAt: new Date(),
          endReason: 'SWITCH_OPERATOR',
        },
      }
    );

    // 9. Create New Active Operator Session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');

    const operatorSessionId = `OPS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const session = await OperatorSession.create({
      operatorSessionId,
      organisationId: orgId,
      cafeId: deviceCafe,
      deviceId: device.deviceId,
      operatorUserId: user.userId,
      operatorNameSnapshot: user.name,
      status: 'ACTIVE',
      authMethod: cleanGatewayToken ? `GATEWAY_${accessMethod}` : 'OPERATOR_PIN',
      sessionStartedAt: new Date(),
      lastActivityAt: new Date(),
      sessionTokenHash,
    });

    // Update device last seen
    device.lastSeenAt = new Date();
    device.lastSyncAt = new Date();
    await device.save();

    // 10. Generate Trusted Device Token if rememberAccess requested
    let trustedDeviceToken = null;
    if (rememberAccess) {
      trustedDeviceToken = `trdev_${crypto.randomBytes(24).toString('hex')}`;
    }

    // Record Audit Event
    await this._logAudit({
      organisationId: orgId,
      cafeId: deviceCafe,
      action: 'OPERATOR_SESSION_STARTED',
      actorUserId: user.userId,
      actorRole: user.role,
      entityType: 'OPERATOR_SESSION',
      entityId: session.operatorSessionId,
      correlationId,
      details: {
        cafeId: deviceCafe,
        deviceId: device.deviceId,
        operatorUserId: user.userId,
        rememberAccess: Boolean(rememberAccess),
      },
    });

    return {
      success: true,
      sessionToken,
      operatorSession: {
        operatorSessionId: session.operatorSessionId,
        sessionToken,
        cafeId: session.cafeId,
        deviceId: session.deviceId,
        operatorUserId: session.operatorUserId,
        operatorName: session.operatorNameSnapshot,
        status: session.status,
        sessionStartedAt: session.sessionStartedAt,
      },
      cafeContext: {
        cafeId: deviceCafe,
        deviceName: device.deviceName,
        businessDate: new Date().toISOString().slice(0, 10),
      },
      trustedDeviceToken,
    };
  }

  /**
   * Locks an active operator session.
   */
  async lockOperatorSession({ operatorSessionId, deviceId, operatorUserId }) {
    const session = await OperatorSession.findOne({
      operatorSessionId,
      status: 'ACTIVE',
    });

    if (!session) {
      throw new ApiError(404, 'SESSION_NOT_FOUND', 'Active operator session not found.');
    }

    session.status = 'LOCKED';
    session.lockedAt = new Date();
    session.lastActivityAt = new Date();
    await session.save();

    await AuditEvent.create({
      organisationId: session.organisationId,
      action: 'OPERATOR_SESSION_LOCKED',
      actor: { userId: session.operatorUserId, role: 'CAFE_ADMIN' },
      target: { entityType: 'OPERATOR_SESSION', entityId: session.operatorSessionId },
      details: { deviceId: session.deviceId, cafeId: session.cafeId },
    });

    return {
      success: true,
      message: 'Operator session locked.',
      operatorSession: session,
    };
  }

  /**
   * Unlocks a locked operator session using the operator PIN.
   */
  async unlockOperatorSession({ operatorSessionId, pin }) {
    const session = await OperatorSession.findOne({
      operatorSessionId,
      status: 'LOCKED',
    });

    if (!session) {
      throw new ApiError(404, 'SESSION_NOT_FOUND', 'Locked operator session not found.');
    }

    const user = await User.findOne({
      organisationId: session.organisationId,
      userId: session.operatorUserId,
    }).select('+operatorPinHash');

    if (!user || !user.operatorPinHash) {
      throw new ApiError(401, 'INVALID_OPERATOR_CREDENTIALS', 'Operator code not recognised.');
    }

    const isValid = await bcrypt.compare(String(pin), user.operatorPinHash);
    if (!isValid) {
      throw new ApiError(401, 'INVALID_OPERATOR_CREDENTIALS', 'Incorrect Operator PIN.');
    }

    session.status = 'ACTIVE';
    session.lockedAt = null;
    session.lastActivityAt = new Date();
    await session.save();

    await AuditEvent.create({
      organisationId: session.organisationId,
      action: 'OPERATOR_SESSION_UNLOCKED',
      actor: { userId: session.operatorUserId, role: 'CAFE_ADMIN' },
      target: { entityType: 'OPERATOR_SESSION', entityId: session.operatorSessionId },
      details: { deviceId: session.deviceId, cafeId: session.cafeId },
    });

    return {
      success: true,
      message: 'Operator session unlocked.',
      operatorSession: session,
    };
  }

  /**
   * Ends an active or locked session and starts a new one for a new operator.
   */
  async switchOperator({ operatorSessionId, handoverNote, newOperatorUserId, newPin, deviceId, organisationId }) {
    if (operatorSessionId) {
      const currentSession = await OperatorSession.findOne({
        operatorSessionId,
        status: { $in: ['ACTIVE', 'LOCKED'] },
      });

      if (currentSession) {
        currentSession.status = 'ENDED';
        currentSession.endedAt = new Date();
        currentSession.endReason = 'SWITCH_OPERATOR';
        if (handoverNote) {
          currentSession.handoverNote = handoverNote;
        }
        await currentSession.save();
      }
    }

    // Sign in the new operator
    return this.signInOperator({
      organisationId,
      deviceId,
      operatorUserId: newOperatorUserId,
      pin: newPin,
    });
  }

  /**
   * Closes an active operator session.
   */
  async endOperatorSession({ operatorSessionId, endReason = 'MANUAL_END' }) {
    const session = await OperatorSession.findOne({
      operatorSessionId,
      status: { $in: ['ACTIVE', 'LOCKED'] },
    });

    if (!session) {
      return { success: true, message: 'Session already ended or not found.' };
    }

    session.status = 'ENDED';
    session.endedAt = new Date();
    session.endReason = endReason;
    await session.save();

    await AuditEvent.create({
      organisationId: session.organisationId,
      action: 'OPERATOR_SESSION_ENDED',
      actor: { userId: session.operatorUserId, role: 'CAFE_ADMIN' },
      target: { entityType: 'OPERATOR_SESSION', entityId: session.operatorSessionId },
      details: { deviceId: session.deviceId, cafeId: session.cafeId, endReason },
    });

    return {
      success: true,
      message: 'Operator session ended.',
    };
  }

  /**
   * Retrieves current active session for a device.
   */
  async getCurrentOperatorSession({ deviceId, organisationId }) {
    const session = await OperatorSession.findOne({
      deviceId,
      organisationId: organisationId.toUpperCase(),
      status: { $in: ['ACTIVE', 'LOCKED'] },
    }).sort({ sessionStartedAt: -1 });

    if (!session) {
      return null;
    }

    // Check inactivity
    const now = new Date();
    const elapsedMinutes = (now - new Date(session.lastActivityAt)) / 60000;
    if (elapsedMinutes > INACTIVITY_LOCK_MINUTES && session.status === 'ACTIVE') {
      session.status = 'LOCKED';
      session.lockedAt = now;
      await session.save();
    }

    return session;
  }

  /**
   * Lists Operator Sessions for governance and auditing.
   */
  async listOperatorSessions({ organisationId, cafeId, operatorUserId, deviceId, status, dateFrom, dateTo, page = 1, limit = 20 }) {
    const filter = {
      organisationId: organisationId.toUpperCase(),
    };

    if (cafeId && cafeId !== '*') {
      filter.cafeId = cafeId.toUpperCase();
    }
    if (operatorUserId) {
      filter.operatorUserId = operatorUserId.toUpperCase();
    }
    if (deviceId) {
      filter.deviceId = deviceId;
    }
    if (status) {
      filter.status = status;
    }
    if (dateFrom || dateTo) {
      filter.sessionStartedAt = {};
      if (dateFrom) filter.sessionStartedAt.$gte = new Date(dateFrom);
      if (dateTo) filter.sessionStartedAt.$lte = new Date(dateTo);
    }

    const skip = (Math.max(1, page) - 1) * limit;
    const [sessions, total] = await Promise.all([
      OperatorSession.find(filter).sort({ sessionStartedAt: -1 }).skip(skip).limit(limit).lean(),
      OperatorSession.countDocuments(filter),
    ]);

    return {
      sessions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Master Account Sign-In on a cafe-owned, trusted device.
   * Authenticates using canonical Master password.
   * Creates Master Cafe Operations Session (workspaceMode: 'CAFE_OPERATIONS') without side-effects on Attendance.
   */
  async signInMasterOperator({ organisationId, deviceId, masterUserId, password, mfaCode, clientIp, userAgent, correlationId }) {
    const orgId = (organisationId || 'ZAMORIN').toUpperCase();

    // 1. Device Verification
    if (!deviceId) {
      throw new ApiError(400, 'DEVICE_ID_REQUIRED', 'Cafe Operations require a registered device ID.');
    }

    let device = await DeviceRegistration.findOne({
      $or: [{ deviceId }, { 'metadata.deviceCode': deviceId }],
      organisationId: orgId,
    });

    if (!device) {
      try {
        const { getRepositories } = require('../cafe-operations/repositories');
        const repos = getRepositories();
        const cafeOpsDev = (await repos.devices.findById(deviceId)) || (await repos.devices.findByCode(deviceId));
        if (cafeOpsDev) {
          device = await DeviceRegistration.findOneAndUpdate(
            { deviceId: String(cafeOpsDev.id) },
            {
              deviceId: String(cafeOpsDev.id),
              organisationId: cafeOpsDev.organisationId,
              deviceClass: 'CAFE_OWNED',
              assignedCafeId: cafeOpsDev.cafeId,
              deviceName: cafeOpsDev.displayName,
              platform: 'WEB_POS',
              status: cafeOpsDev.lifecycleStatus === 'ACTIVE' ? 'ACTIVE' : (cafeOpsDev.lifecycleStatus || 'REVOKED'),
              trustLevel: 'ENROLLED',
              lastSeenAt: new Date(),
              metadata: { deviceCode: cafeOpsDev.deviceCode },
            },
            { upsert: true, new: true }
          );
        }
      } catch (_) {}
    }

    if (!device || device.deviceClass !== 'CAFE_OWNED' || device.status !== 'ACTIVE' || !device.assignedCafeId) {
      throw new ApiError(403, 'DEVICE_NOT_ELIGIBLE', 'Cafe Operations is only accessible on active cafe-owned devices assigned to a cafe.');
    }

    // 2. Master Identification & Password Verification
    if (!masterUserId || !password) {
      throw new ApiError(400, 'MISSING_CREDENTIALS', 'Master identifier and password are required.');
    }

    const user = await User.findOne({
      organisationId: orgId,
      userId: masterUserId.toUpperCase(),
    }).select('+passwordHash +mfaSecret');

    if (!user || user.role !== 'MASTER') {
      throw new ApiError(401, 'INVALID_MASTER_CREDENTIALS', 'Invalid Master credentials.');
    }

    if (user.accountStatus !== 'ACTIVE') {
      throw new ApiError(403, 'ACCOUNT_INACTIVE', 'Master account is not active.');
    }

    const { verifyPassword } = require('./authService');
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      await AuditEvent.create({
        organisationId: orgId,
        action: 'MASTER_CAFE_OPS_AUTH_FAILED',
        actor: { userId: user.userId, role: 'MASTER' },
        target: { entityType: 'DEVICE', entityId: device.deviceId },
        details: { reason: 'INVALID_PASSWORD' },
      });
      throw new ApiError(401, 'INVALID_MASTER_CREDENTIALS', 'Invalid Master credentials.');
    }

    // 3. Close any existing operator sessions on device
    await OperatorSession.updateMany(
      { deviceId: device.deviceId, status: { $in: ['ACTIVE', 'LOCKED'] } },
      {
        $set: {
          status: 'ENDED',
          endedAt: new Date(),
          endReason: 'SWITCH_MASTER_OPERATOR',
        },
      }
    );

    // 4. Create Master Cafe Operations Session (strictly single-cafe scope)
    const operatorSessionId = `OPS-MST-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const session = await OperatorSession.create({
      operatorSessionId,
      organisationId: orgId,
      cafeId: device.assignedCafeId,
      deviceId: device.deviceId,
      operatorUserId: user.userId,
      operatorNameSnapshot: user.name,
      status: 'ACTIVE',
      authMethod: 'MASTER_PASSWORD_MFA',
      workspaceMode: 'CAFE_OPERATIONS',
      sessionStartedAt: new Date(),
      lastActivityAt: new Date(),
    });

    device.lastSeenAt = new Date();
    device.lastSyncAt = new Date();
    await device.save();

    await AuditEvent.create({
      organisationId: orgId,
      action: 'MASTER_CAFE_OPS_SESSION_STARTED',
      actor: { userId: user.userId, role: 'MASTER' },
      target: { entityType: 'OPERATOR_SESSION', entityId: session.operatorSessionId },
      details: {
        cafeId: device.assignedCafeId,
        deviceId: device.deviceId,
        operatorUserId: user.userId,
        workspaceMode: 'CAFE_OPERATIONS',
      },
    });

    return {
      success: true,
      operatorSession: {
        operatorSessionId: session.operatorSessionId,
        cafeId: session.cafeId,
        deviceId: session.deviceId,
        operatorUserId: session.operatorUserId,
        operatorName: session.operatorNameSnapshot,
        operatorRole: 'MASTER',
        workspaceMode: 'CAFE_OPERATIONS',
        status: session.status,
        sessionStartedAt: session.sessionStartedAt,
      },
      cafeContext: {
        cafeId: device.assignedCafeId,
        deviceName: device.deviceName,
        businessDate: new Date().toISOString().slice(0, 10),
      },
    };
  }

  /**
   * Acknowledges an incoming handover note.
   */
  async acknowledgeHandover({ operatorSessionId, acknowledgingOperatorId }) {
    const session = await OperatorSession.findOne({ operatorSessionId });
    if (!session) {
      throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found.');
    }

    session.handoverAcknowledgedBy = acknowledgingOperatorId.toUpperCase();
    session.handoverAcknowledgedAt = new Date();
    await session.save();

    return {
      success: true,
      message: 'Handover note acknowledged.',
      session,
    };
  }
}

module.exports = new OperatorSessionService();
