'use strict';

const crypto = require('node:crypto');
const { generateSixDigitPin } = require('../utils/secureRandom');
const { AttendanceQrChallenge } = require('../models/AttendanceQrChallenge');
const { AttendanceOfflineLease } = require('../models/AttendanceOfflineLease');
const { DeviceRegistration } = require('../models/DeviceRegistration');
const { DeviceSecurityEvent } = require('../models/DeviceSecurityEvent');
const { Cafe } = require('../models/Cafe');
const ApiError = require('../utils/ApiError');
const { getPublicAppOrigin } = require('./cafeAccessCryptoService');

const QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || 'zamorin_qr_master_signing_secret_key_2026_dsec';
const ATTENDANCE_SCAN_GRANT_TTL_SECONDS = 180;

function calculateDistanceMetres(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in metres
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

class AttendanceQrService {
  constructor() {
    this.userPinAttempts = new Map();
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    return calculateDistanceMetres(lat1, lon1, lat2, lon2);
  }

  getUserPinAttemptState(userId) {
    return this.userPinAttempts.get(userId) || { failedAttempts: 0, lockedUntil: null };
  }

  setUserPinAttemptState(userId, state) {
    this.userPinAttempts.set(userId, state);
  }

  clearUserPinAttemptState(userId) {
    this.userPinAttempts.delete(userId);
  }

  /**
   * Generates HMAC-SHA256 signature for challenge payload.
   */
  signPayload(payload) {
    const serialized = JSON.stringify(payload);
    return crypto.createHmac('sha256', QR_SIGNING_SECRET).update(serialized).digest('hex');
  }

  /**
   * Authoritatively issues or retrieves the currently active rotating challenge for an authorised display.
   */
  async getActiveOrNewChallenge({
    organisationId = 'ZAMORIN',
    cafeId,
    deviceId = 'OPS_CONSOLE',
    requestedByUserId = 'SYSTEM',
    requestedByRole = 'SYSTEM',
    isPrimaryMaster = false,
    assignedCafeIds = [],
    rotationIntervalSeconds = 45,
  }) {
    if (!cafeId) {
      throw new ApiError(400, 'CAFE_ID_REQUIRED', 'A cafeId must be provided to display the attendance QR.');
    }

    // Role-based authorization for displaying the live rotating QR challenge
    if (requestedByRole === 'STAFF') {
      throw new ApiError(403, 'FORBIDDEN', 'Staff members are not permitted to generate or view raw QR challenges.');
    }

    if (requestedByRole === 'MASTER' && isPrimaryMaster !== true) {
      throw new ApiError(
        403,
        'PRIMARY_MASTER_AUTHORITY_REQUIRED',
        'Attendance QR issuance requires the designated Primary Master.'
      );
    }

    if (requestedByRole === 'CAFE_ADMIN' && Array.isArray(assignedCafeIds) && assignedCafeIds.length > 0) {
      const allowedSet = new Set(assignedCafeIds.map((c) => String(c).toUpperCase()));
      if (!allowedSet.has(String(cafeId).toUpperCase())) {
        throw new ApiError(403, 'CAFE_SCOPE_MISMATCH', 'You are not authorised to display Attendance QR for this café.');
      }
    }

    const cafe = await Cafe.findOne({ cafeId, organisationId }).lean();
    if (!cafe) {
      throw new ApiError(404, 'CAFE_NOT_FOUND', 'Café not found in organisation.');
    }

    const cafeLatitude = cafe.address?.latitude;
    const cafeLongitude = cafe.address?.longitude;
    const geofenceRadiusMetres = Number(cafe.address?.geofenceRadiusMetres ?? 100);
    if (
      !Number.isFinite(cafeLatitude) ||
      !Number.isFinite(cafeLongitude) ||
      !Number.isFinite(geofenceRadiusMetres) ||
      geofenceRadiusMetres < 10 ||
      geofenceRadiusMetres > 1000
    ) {
      throw new ApiError(
        422,
        'GEOFENCE_NOT_CONFIGURED',
        'Attendance QR is unavailable until this café has valid latitude, longitude, and geofence radius configured.'
      );
    }

    // 8-Second Pre-Expiry Threshold:
    // When querying for an active challenge, only return an existing challenge if it has > 8s remaining TTL.
    // This prevents handing a client a challenge that will expire while the employee is aligning their camera in-flight.
    // NOTE: This is NOT a post-expiry grace window. Once Date.now() > expiresAt, punches are strictly rejected with 403.
    let challenge = await AttendanceQrChallenge.findOne({
      organisationId,
      cafeId,
      isRevoked: false,
      expiresAt: { $gt: new Date(Date.now() + 8 * 1000) },
    }).sort({ expiresAt: -1 });

    if (!challenge) {
      const challengeId = `CHL_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
      const opaqueToken = `ZAM_ATT_${crypto.randomBytes(32).toString('hex')}`;
      const fallbackPin = generateSixDigitPin();
      const issuedAt = new Date();
      const expiresAt = new Date(Date.now() + rotationIntervalSeconds * 1000);
      const nonce = crypto.randomBytes(16).toString('hex');

      const envelopeData = {
        ver: 1,
        cid: challengeId,
        did: deviceId || 'OPS_CONSOLE',
        cafeId,
        orgId: organisationId,
        iat: Math.floor(issuedAt.getTime() / 1000),
        exp: Math.floor(expiresAt.getTime() / 1000),
        nonce,
        purpose: 'ATTENDANCE_PUNCH',
      };

      const signature = this.signPayload(envelopeData);

      challenge = await AttendanceQrChallenge.create({
        challengeId,
        opaqueToken,
        organisationId,
        deviceId: deviceId || 'OPS_CONSOLE',
        cafeId,
        fallbackPin,
        purpose: 'ATTENDANCE_PUNCH',
        issuedByUserId: requestedByUserId || 'SYSTEM',
        issuedByRole: requestedByRole || 'SYSTEM',
        rotationIntervalSeconds,
        issuedAt,
        expiresAt,
        nonce,
        signature,
      });
    } else if (!challenge.opaqueToken) {
      const opaqueToken = `ZAM_ATT_${crypto.randomBytes(32).toString('hex')}`;
      challenge.opaqueToken = opaqueToken;
      await AttendanceQrChallenge.updateOne({ _id: challenge._id }, { $set: { opaqueToken } });
    }

    const envelope = {
      ver: 1,
      cid: challenge.challengeId,
      did: challenge.deviceId,
      cafeId: challenge.cafeId,
      orgId: challenge.organisationId,
      iat: Math.floor(challenge.issuedAt.getTime() / 1000),
      exp: Math.floor(challenge.expiresAt.getTime() / 1000),
      nonce: challenge.nonce,
      purpose: challenge.purpose || 'ATTENDANCE_PUNCH',
      sig: challenge.signature,
    };

    const secret = process.env.ATTENDANCE_QR_SECRET || 'zamorin-attendance-presence-secret-salt-2026';
    const expiresAtSec = Math.floor(challenge.expiresAt.getTime() / 1000);
    const issuedAtSec = Math.floor(challenge.issuedAt.getTime() / 1000);
    const dotPayload = `${challenge.challengeId}.${challenge.organisationId}.${challenge.cafeId}.${issuedAtSec}.${expiresAtSec}`;
    const dotSig = crypto.createHmac('sha256', secret).update(dotPayload).digest('hex');
    const dotToken = `${challenge.challengeId}.${challenge.organisationId}.${challenge.cafeId}.${expiresAtSec}.${dotSig}`;

    const attendanceUrl =
      `${getPublicAppOrigin()}/?returnTo=staff-attendance&attendanceQr=${encodeURIComponent(challenge.opaqueToken)}`;

    return {
      challengeId: challenge.challengeId,
      purpose: challenge.purpose || 'ATTENDANCE_PUNCH',
      envelope,
      qrToken: dotToken,
      dotToken,
      opaqueToken: challenge.opaqueToken,
      attendanceUrl,
      qrString: JSON.stringify(envelope),
      cafeId: challenge.cafeId,
      cafeName: cafe.name,
      fallbackPin: challenge.fallbackPin,
      issuedAt: challenge.issuedAt,
      expiresAt: challenge.expiresAt,
      rotationIntervalSeconds: challenge.rotationIntervalSeconds || rotationIntervalSeconds,
      remainingSeconds: Math.max(0, Math.floor((challenge.expiresAt.getTime() - Date.now()) / 1000)),
    };
  }

  /**
   * Validates a scanned QR token and resolves the authoritative organisationId and cafeId.
   */
  async validateChallengeToken(qrToken, { employeeOrgId, employeeAssignedCafes = [], employeeRole = 'STAFF', isPrimaryMaster = false } = {}) {
    if (!qrToken) {
      throw new ApiError(400, 'QR_TOKEN_REQUIRED', 'Attendance QR token is required.');
    }

    if (employeeRole === 'MASTER' && isPrimaryMaster !== true) {
      throw new ApiError(
        403,
        'PRIMARY_MASTER_AUTHORITY_REQUIRED',
        'Attendance QR verification requires the designated Primary Master.'
      );
    }

    let trimmedToken = typeof qrToken === 'string' ? qrToken.trim() : '';

    // A scanner may return the canonical HTTPS attendance deep-link rather
    // than only the embedded opaque challenge. Accept only our configured
    // frontend origin and extract the short-lived challenge server-side.
    if (/^https?:\/\//i.test(trimmedToken)) {
      let parsed;
      try {
        parsed = new URL(trimmedToken);
      } catch (_) {
        throw new ApiError(400, 'INVALID_CHALLENGE_FORMAT', 'Attendance QR URL format is invalid.');
      }

      const trustedOrigin = getPublicAppOrigin();
      if (
        parsed.origin !== trustedOrigin ||
        parsed.searchParams.get('returnTo') !== 'staff-attendance'
      ) {
        throw new ApiError(403, 'UNTRUSTED_ATTENDANCE_QR_ORIGIN', 'Attendance QR URL does not belong to the trusted Zamorin application origin.');
      }

      trimmedToken = String(parsed.searchParams.get('attendanceQr') || '').trim();
      if (!trimmedToken) {
        throw new ApiError(400, 'QR_TOKEN_REQUIRED', 'Attendance QR URL does not contain a challenge token.');
      }
    }

    // Branch 0: Opaque High-Entropy Token (ZAM_ATT_<hex>)
    // Privacy-hardened architecture: Does not expose organisationId, cafeId, or DB identifiers in QR payload
    if (trimmedToken.startsWith('ZAM_ATT_')) {
      const challenge = await AttendanceQrChallenge.findOne({ opaqueToken: trimmedToken });
      if (!challenge || challenge.isRevoked) {
        throw new ApiError(404, 'QR_CHALLENGE_NOT_FOUND', 'Attendance QR challenge not found or revoked.');
      }

      if (Date.now() > new Date(challenge.expiresAt).getTime()) {
        throw new ApiError(403, 'EXPIRED_ATTENDANCE_QR', 'Attendance QR token has expired. Please scan the latest rotating QR.');
      }

      if (challenge.purpose && challenge.purpose !== 'ATTENDANCE_PUNCH') {
        throw new ApiError(403, 'INVALID_CHALLENGE_PURPOSE', 'Invalid challenge purpose.');
      }

      if (employeeOrgId && challenge.organisationId !== String(employeeOrgId).toUpperCase()) {
        throw new ApiError(403, 'ORGANISATION_MISMATCH', 'Attendance QR belongs to a different organisation.');
      }

      const resolvedCafeId = challenge.cafeId;
      if (employeeRole === 'STAFF' && !isPrimaryMaster) {
        if (Array.isArray(employeeAssignedCafes) && employeeAssignedCafes.length > 0) {
          const cafeAllowed = employeeAssignedCafes
            .map((c) => String(c).toUpperCase())
            .includes(String(resolvedCafeId).toUpperCase());
          if (!cafeAllowed) {
            throw new ApiError(403, 'CROSS_CAFE_UNAUTHORIZED', 'You are not assigned to check in at this café.');
          }
        }
      }

      return {
        valid: true,
        verified: true,
        challenge,
        challengeId: challenge.challengeId,
        resolvedCafeId,
        cafeId: resolvedCafeId,
        resolvedOrgId: challenge.organisationId,
        organisationId: challenge.organisationId,
        expiresAt: challenge.expiresAt,
        purpose: challenge.purpose || 'ATTENDANCE_PUNCH',
      };
    }

    const secret = process.env.ATTENDANCE_QR_SECRET || 'zamorin-attendance-presence-secret-salt-2026';

    // Branch A: Dot-separated compact token (challengeId.orgId.cafeId.expiresAt.signature)
    if (trimmedToken && !trimmedToken.startsWith('{')) {
      const parts = trimmedToken.split('.');
      if (parts.length !== 5) {
        throw new ApiError(400, 'INVALID_CHALLENGE_FORMAT', 'Attendance QR token format is invalid.');
      }

      const [tokenCid, tokenOrgId, tokenCafeId, tokenExp, tokenSig] = parts;
      const expSec = Number(tokenExp);
      if (isNaN(expSec)) {
        throw new ApiError(400, 'INVALID_CHALLENGE_FORMAT', 'Attendance QR expiration timestamp is invalid.');
      }

      if (Date.now() > expSec * 1000) {
        throw new ApiError(403, 'EXPIRED_ATTENDANCE_QR', 'Attendance QR token has expired. Please scan the latest rotating QR.');
      }

      const challenge = await AttendanceQrChallenge.findOne({ challengeId: tokenCid });
      if (challenge && challenge.isRevoked) {
        throw new ApiError(404, 'QR_CHALLENGE_NOT_FOUND', 'Attendance QR challenge revoked.');
      }

      // Cryptographic signature check
      let validSig = false;
      if (challenge?.signature === tokenSig) {
        validSig = true;
      }
      if (!validSig && challenge?.issuedAt) {
        const iatSec = Math.floor(new Date(challenge.issuedAt).getTime() / 1000);
        const testPayload = `${tokenCid}.${tokenOrgId}.${tokenCafeId}.${iatSec}.${tokenExp}`;
        if (crypto.createHmac('sha256', secret).update(testPayload).digest('hex') === tokenSig) {
          validSig = true;
        }
      }
      if (!validSig) {
        const directPayload = `${tokenCid}.${tokenOrgId}.${tokenCafeId}.${tokenExp}`;
        if (crypto.createHmac('sha256', secret).update(directPayload).digest('hex') === tokenSig) {
          validSig = true;
        }
      }
      if (!validSig) {
        for (let offset = 40; offset <= 50; offset++) {
          const testPayload = `${tokenCid}.${tokenOrgId}.${tokenCafeId}.${expSec - offset}.${tokenExp}`;
          if (crypto.createHmac('sha256', secret).update(testPayload).digest('hex') === tokenSig) {
            validSig = true;
            break;
          }
        }
      }

      if (!validSig) {
        throw new ApiError(403, 'INVALID_CHALLENGE_SIGNATURE', 'QR cryptographic verification failed.');
      }

      if (employeeOrgId && tokenOrgId !== employeeOrgId) {
        throw new ApiError(403, 'ORGANISATION_MISMATCH', 'QR challenge belongs to a different organisation.');
      }

      if (employeeRole === 'STAFF' && Array.isArray(employeeAssignedCafes) && employeeAssignedCafes.length > 0) {
        const allowedSet = new Set(employeeAssignedCafes.map((c) => String(c).toUpperCase()));
        if (!allowedSet.has(tokenCafeId.toUpperCase())) {
          throw new ApiError(403, 'CROSS_CAFE_UNAUTHORIZED', 'You are not assigned to check in at this café.');
        }
      }

      return {
        valid: true,
        verified: true,
        challenge: challenge || { challengeId: tokenCid, cafeId: tokenCafeId, organisationId: tokenOrgId },
        challengeId: tokenCid,
        resolvedCafeId: tokenCafeId,
        cafeId: tokenCafeId,
        organisationId: tokenOrgId,
        expiresAt: new Date(expSec * 1000),
      };
    }

    // Branch B: JSON / base64 object envelope
    let envelopeData;
    if (typeof qrToken === 'string') {
      try {
        envelopeData = JSON.parse(qrToken);
      } catch (_) {
        try {
          envelopeData = JSON.parse(Buffer.from(qrToken, 'base64').toString('utf8'));
        } catch (e) {
          throw new ApiError(400, 'INVALID_QR_PAYLOAD', 'Scanned QR token could not be parsed.');
        }
      }
    } else if (typeof qrToken === 'object' && qrToken !== null) {
      envelopeData = qrToken;
    } else {
      throw new ApiError(400, 'INVALID_QR_PAYLOAD', 'Scanned QR token format is invalid.');
    }

    if (!envelopeData.sig || !envelopeData.cid) {
      throw new ApiError(400, 'INVALID_QR_STRUCTURE', 'QR envelope is missing signature or challenge ID.');
    }

    if (envelopeData.purpose && envelopeData.purpose !== 'ATTENDANCE_PUNCH') {
      throw new ApiError(400, 'INVALID_QR_PURPOSE', 'Scanned QR code is not valid for attendance punches.');
    }

    const { sig, ...dataToVerify } = envelopeData;
    const expectedSig = this.signPayload(dataToVerify);
    if (sig !== expectedSig) {
      throw new ApiError(400, 'INVALID_QR_SIGNATURE', 'QR cryptographic verification failed.');
    }

    const challenge = await AttendanceQrChallenge.findOne({ challengeId: envelopeData.cid });
    if (!challenge || challenge.isRevoked) {
      throw new ApiError(404, 'QR_CHALLENGE_NOT_FOUND', 'Attendance QR challenge not found or revoked.');
    }

    if (new Date() > challenge.expiresAt) {
      throw new ApiError(400, 'QR_CHALLENGE_EXPIRED', 'Attendance QR has expired. Please scan the current rotating code.');
    }

    if (employeeOrgId && challenge.organisationId !== employeeOrgId) {
      throw new ApiError(403, 'ORGANISATION_MISMATCH', 'QR challenge belongs to a different organisation.');
    }

    const resolvedCafeId = challenge.cafeId;
    if (employeeRole === 'STAFF' && Array.isArray(employeeAssignedCafes) && employeeAssignedCafes.length > 0) {
      const allowedSet = new Set(employeeAssignedCafes.map((c) => String(c).toUpperCase()));
      if (!allowedSet.has(resolvedCafeId.toUpperCase())) {
        throw new ApiError(403, 'CROSS_CAFE_UNAUTHORIZED', 'You are not assigned to check in at this café.');
      }
    }

    return {
      valid: true,
      verified: true,
      challenge,
      challengeId: challenge.challengeId,
      resolvedCafeId,
      cafeId: resolvedCafeId,
      organisationId: challenge.organisationId,
      issuedAt: challenge.issuedAt,
      expiresAt: challenge.expiresAt,
    };
  }

  /**
   * Converts a freshly verified rotating QR into a short-lived, user-bound
   * scan grant. This lets GPS + selfie capture finish without weakening the
   * 45-second display rotation. The grant is bound to user, organisation,
   * cafe, original challenge, device, and expected transition.
   */
  issueScanGrant({ verification, userId, organisationId, transition }) {
    const normalizedTransition = String(transition || '').toUpperCase();
    if (!verification?.valid || !verification?.challengeId || !verification?.resolvedCafeId) {
      throw new ApiError(400, 'ATTENDANCE_QR_VERIFICATION_REQUIRED', 'A verified attendance QR is required before issuing a scan grant.');
    }
    if (!userId || !organisationId || !['CHECK_IN', 'CHECK_OUT'].includes(normalizedTransition)) {
      throw new ApiError(400, 'ATTENDANCE_SCAN_GRANT_CONTEXT_INVALID', 'Attendance scan grant context is incomplete.');
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = {
      v: 1,
      purpose: 'ATTENDANCE_SCAN_GRANT',
      uid: String(userId).trim().toUpperCase(),
      oid: String(organisationId).trim().toUpperCase(),
      cafeId: String(verification.resolvedCafeId).trim().toUpperCase(),
      cid: String(verification.challengeId),
      did: String(verification.challenge?.deviceId || 'OPS_CONSOLE'),
      transition: normalizedTransition,
      iat: issuedAt,
      exp: issuedAt + ATTENDANCE_SCAN_GRANT_TTL_SECONDS,
      nonce: crypto.randomBytes(12).toString('hex'),
    };

    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const secret = process.env.ATTENDANCE_QR_SECRET || 'zamorin-attendance-presence-secret-salt-2026';
    const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('hex');

    return {
      token: `ZAM_ASG_${encodedPayload}.${signature}`,
      expiresAt: new Date(payload.exp * 1000),
      transition: normalizedTransition,
    };
  }

  validateScanGrant(token, { employeeOrgId, employeeUserId, expectedTransition }) {
    const raw = String(token || '').trim();
    if (!raw.startsWith('ZAM_ASG_')) {
      throw new ApiError(400, 'ATTENDANCE_SCAN_GRANT_FORMAT_INVALID', 'Attendance scan grant format is invalid.');
    }

    const serialized = raw.slice('ZAM_ASG_'.length);
    const separator = serialized.lastIndexOf('.');
    if (separator <= 0) {
      throw new ApiError(400, 'ATTENDANCE_SCAN_GRANT_FORMAT_INVALID', 'Attendance scan grant format is invalid.');
    }

    const encodedPayload = serialized.slice(0, separator);
    const suppliedSignature = serialized.slice(separator + 1);
    const secret = process.env.ATTENDANCE_QR_SECRET || 'zamorin-attendance-presence-secret-salt-2026';
    const expectedSignature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('hex');

    const suppliedBuffer = Buffer.from(suppliedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      throw new ApiError(403, 'ATTENDANCE_SCAN_GRANT_SIGNATURE_INVALID', 'Attendance scan grant signature is invalid.');
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch (_) {
      throw new ApiError(400, 'ATTENDANCE_SCAN_GRANT_FORMAT_INVALID', 'Attendance scan grant payload is invalid.');
    }

    const orgId = String(employeeOrgId || '').trim().toUpperCase();
    const userId = String(employeeUserId || '').trim().toUpperCase();
    const transition = String(expectedTransition || '').trim().toUpperCase();

    if (
      payload?.v !== 1 ||
      payload?.purpose !== 'ATTENDANCE_SCAN_GRANT' ||
      payload?.oid !== orgId ||
      payload?.uid !== userId ||
      payload?.transition !== transition
    ) {
      throw new ApiError(403, 'ATTENDANCE_SCAN_GRANT_SCOPE_MISMATCH', 'Attendance scan grant does not match this employee or punch transition.');
    }

    if (!Number.isSafeInteger(payload.exp) || Date.now() > payload.exp * 1000) {
      throw new ApiError(403, 'ATTENDANCE_SCAN_GRANT_EXPIRED', 'Attendance scan grant expired. Please scan the current Café QR again.');
    }

    return {
      valid: true,
      verified: true,
      challengeId: payload.cid,
      resolvedCafeId: payload.cafeId,
      cafeId: payload.cafeId,
      organisationId: payload.oid,
      issuedAt: new Date(payload.iat * 1000),
      expiresAt: new Date(payload.exp * 1000),
      purpose: 'ATTENDANCE_PUNCH',
      challenge: { deviceId: payload.did },
      scanGrantVerified: true,
    };
  }

  async validatePunchQrProof(qrToken, context = {}) {
    if (String(qrToken || '').trim().startsWith('ZAM_ASG_')) {
      return this.validateScanGrant(qrToken, {
        employeeOrgId: context.employeeOrgId,
        employeeUserId: context.employeeUserId,
        expectedTransition: context.expectedTransition,
      });
    }

    return this.validateChallengeToken(qrToken, context);
  }

  /**
   * Server-authoritative distance calculation and geofence verification against Cafe.address.
   */
  async verifyGeofence({ organisationId, cafeId, latitude, longitude, accuracyMeters }) {
    const cleanOrganisationId = String(organisationId || '').trim().toUpperCase();
    if (!cleanOrganisationId) {
      throw new ApiError(401, 'ORGANISATION_CONTEXT_REQUIRED', 'Authenticated organisation context is required for attendance geofence verification.');
    }

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new ApiError(400, 'COORDINATES_REQUIRED', 'Valid finite GPS latitude and longitude are required.');
    }

    const cafeDoc = await Cafe.findOne({
      organisationId: cleanOrganisationId,
      cafeId: String(cafeId || '').trim().toUpperCase(),
    }).lean();
    if (!cafeDoc) {
      throw new ApiError(404, 'CAFE_NOT_FOUND', 'Café not found.');
    }

    if (
      !cafeDoc.address ||
      !Number.isFinite(cafeDoc.address.latitude) ||
      !Number.isFinite(cafeDoc.address.longitude)
    ) {
      throw new ApiError(
        422,
        'GEOFENCE_NOT_CONFIGURED',
        'Attendance Geofence Not Configured: Café location coordinates are missing in system administration.'
      );
    }

    if (accuracyMeters === undefined || accuracyMeters === null) {
      throw new ApiError(
        400,
        'GPS_ACCURACY_REQUIRED',
        'A browser-reported GPS accuracy value is required for attendance presence verification.'
      );
    }

    if (!Number.isFinite(accuracyMeters) || accuracyMeters < 0) {
      throw new ApiError(400, 'GPS_ACCURACY_INVALID', 'GPS accuracy must be a finite non-negative number.');
    }

    if (accuracyMeters > 100) {
      throw new ApiError(
        422,
        'LOW_GPS_ACCURACY',
        `GPS accuracy (${Math.round(accuracyMeters)}m) is too poor to verify presence. Please move near a window or open area and retry.`
      );
    }

    const distance = calculateDistanceMetres(
      latitude,
      longitude,
      cafeDoc.address.latitude,
      cafeDoc.address.longitude
    );

    const allowedRadius = cafeDoc.geofenceRadiusMeters || cafeDoc.address.geofenceRadiusMetres || 100;
    if (distance > allowedRadius) {
      throw new ApiError(
        403,
        'OUTSIDE_GEOFENCE_RADIUS',
        'You are outside the authorised attendance location.'
      );
    }

    return {
      valid: true,
      verified: true,
      geofenceVerified: true,
      distanceMeters: Math.round(distance),
      allowedRadiusMeters: allowedRadius,
      accuracyMeters: Math.round(accuracyMeters),
      cafeId,
      cafeName: cafeDoc.name,
      cafeLatitude: cafeDoc.address.latitude,
      cafeLongitude: cafeDoc.address.longitude,
      geofencePolicyVersion: 1,
    };
  }

  /**
   * Issues a bounded offline signing lease to a verified cafe device.
   */
  async issueOfflineLease({ organisationId, deviceId, cafeId, durationMinutes = 480, correlationId }) {
    const device = await DeviceRegistration.findOne({ deviceId, status: 'ACTIVE', deviceClass: 'CAFE_OWNED' });
    if (!device || device.assignedCafeId !== cafeId) {
      throw new Error('DEVICE_UNAUTHORIZED_FOR_OFFLINE_LEASE');
    }

    const leaseId = `LEASE_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const serverNotBefore = new Date();
    const serverNotAfter = new Date(Date.now() + durationMinutes * 60 * 1000);

    const leasePayload = {
      leaseId,
      deviceId,
      cafeId,
      notBefore: Math.floor(serverNotBefore.getTime() / 1000),
      notAfter: Math.floor(serverNotAfter.getTime() / 1000),
      policyVersion: device.policyVersion,
    };

    const serverSignature = this.signPayload(leasePayload);

    await AttendanceOfflineLease.create({
      leaseId,
      organisationId,
      deviceId,
      cafeId,
      serverNotBefore,
      serverNotAfter,
      maxSequence: 5000,
      policyVersion: device.policyVersion,
      serverSignature,
      status: 'ACTIVE',
    });

    await DeviceSecurityEvent.create({
      eventId: `DEV_EVT_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      organisationId,
      deviceId,
      deviceClass: 'CAFE_OWNED',
      cafeId,
      actorUserId: 'SYSTEM',
      actorRole: 'CAFE_ADMIN',
      eventType: 'OFFLINE_LEASE_ISSUED',
      severity: 'INFO',
      metadata: { leaseId, durationMinutes },
      correlationId,
    });

    return {
      leaseId,
      serverNotBefore,
      serverNotAfter,
      serverSignature,
    };
  }
}

module.exports = new AttendanceQrService();
