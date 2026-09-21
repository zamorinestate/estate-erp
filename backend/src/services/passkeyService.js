'use strict';

const crypto = require('crypto');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const { PasskeyCredential } = require('../models/PasskeyCredential');
const { PasskeyChallenge } = require('../models/PasskeyChallenge');
const { User } = require('../models/User');
const authService = require('./authService');
const ApiError = require('../utils/ApiError');

const CHALLENGE_TTL_MINUTES = 5;

/**
 * Returns WebAuthn server configuration.
 */
function getWebAuthnConfig() {
  const rpName = process.env.WEBAUTHN_RP_NAME || 'Zamorin Cafe ERP';
  const rpID = process.env.WEBAUTHN_RP_ID || (process.env.NODE_ENV === 'production' ? 'zamorin-cafe-erp.vercel.app' : 'localhost');
  
  const rawOrigins = process.env.WEBAUTHN_ORIGIN
    ? process.env.WEBAUTHN_ORIGIN.split(',').map((o) => o.trim())
    : [
        'https://zamorin-cafe-erp.vercel.app',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:5173',
      ];

  return {
    rpName,
    rpID,
    expectedOrigin: rawOrigins,
  };
}

/**
 * Audit log helper
 */
async function recordPasskeyAudit({
  organisationId,
  actorUserId,
  actorRole,
  action,
  credentialId = null,
  result = 'SUCCESS',
  details = {},
}) {
  try {
    const { recordAuditEvent } = require('./auditService');
    await recordAuditEvent({
      organisationId: organisationId || 'ZAMORIN',
      actorUserId: actorUserId || 'SYSTEM',
      actorRole: actorRole || 'USER',
      module: 'AUTHENTICATION',
      action: action || 'PASSKEY_ACTION',
      entityType: 'PASSKEY_CREDENTIAL',
      entityId: credentialId || 'UNKNOWN',
      result,
      riskClassification: result === 'SUCCESS' ? 'LOW' : 'MEDIUM',
      correlationId: `PK-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
      metadata: details,
    });
  } catch (_) {
    // Safe fallback in test or bootstrap contexts
  }
}

/**
 * Generate Registration Options for an authenticated user.
 */
async function generatePasskeyRegistrationOptions({ user }) {
  if (!user || !user.userId || !user.organisationId) {
    throw ApiError.unauthorized('Authenticated user context is required for passkey registration.');
  }

  const { rpName, rpID } = getWebAuthnConfig();

  // Find existing credentials for this user to exclude re-registration
  const existingCredentials = await PasskeyCredential.find({
    organisationId: user.organisationId,
    userId: user.userId,
    status: 'ACTIVE',
  });

  const excludeCredentials = existingCredentials.map((cred) => ({
    id: cred.credentialId,
    transports: cred.transports || [],
  }));

  let userName = user.email;
  let userDisplayName = user.name || user.email;

  if (!userName || !userDisplayName) {
    try {
      const { User } = require('../models/User');
      const userDoc = await User.findOne({
        organisationId: user.organisationId,
        userId: user.userId,
      }).lean();
      if (userDoc) {
        userName = userName || userDoc.email || user.userId;
        userDisplayName = userDisplayName || userDoc.name || userDoc.email || user.userId;
      }
    } catch {}
  }

  userName = userName || user.userId || 'user';
  userDisplayName = userDisplayName || userName;

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: Buffer.from(user.userId, 'utf-8'),
    userName,
    userDisplayName,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
  });

  const challengeId = `PKC-REG-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000);

  await PasskeyChallenge.create({
    challengeId,
    challenge: options.challenge,
    ceremony: 'REGISTRATION',
    organisationId: user.organisationId,
    userId: user.userId,
    status: 'PENDING',
    expiresAt,
  });

  return {
    options,
    challengeId,
  };
}

/**
 * Verify Registration Response and persist public key.
 */
async function verifyPasskeyRegistration({
  user,
  response,
  challengeId,
  friendlyName = 'Passkey Device',
}) {
  if (!user || !user.userId) {
    throw ApiError.unauthorized('Authenticated user context is required for passkey registration.');
  }

  if (!response || !challengeId) {
    throw ApiError.badRequest('Invalid registration payload or missing challenge ID.');
  }

  const challengeRecord = await PasskeyChallenge.findOne({
    challengeId,
    ceremony: 'REGISTRATION',
    organisationId: user.organisationId,
    userId: user.userId,
    status: 'PENDING',
  });

  if (!challengeRecord) {
    throw ApiError.badRequest('Invalid or already consumed registration challenge.');
  }

  if (challengeRecord.expiresAt < new Date()) {
    challengeRecord.status = 'EXPIRED';
    await challengeRecord.save();
    throw ApiError.badRequest('Registration challenge has expired.');
  }

  const { rpID, expectedOrigin } = getWebAuthnConfig();

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (err) {
    await recordPasskeyAudit({
      organisationId: user.organisationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'PASSKEY_REGISTRATION_FAILED',
      result: 'FAILURE',
      details: { error: err.message },
    });
    throw ApiError.badRequest(`Passkey registration verification failed: ${err.message}`);
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw ApiError.badRequest('Passkey registration could not be verified.');
  }

  // Consume challenge
  challengeRecord.status = 'CONSUMED';
  challengeRecord.consumedAt = new Date();
  await challengeRecord.save();

  const { credential, aaguid } = verification.registrationInfo;
  const credentialId = credential.id;

  // Check if credential ID is already registered
  const existing = await PasskeyCredential.findOne({
    organisationId: user.organisationId,
    credentialId,
  });

  if (existing && existing.status === 'ACTIVE') {
    throw ApiError.conflict('This passkey is already registered.');
  }

  const publicKeyBase64 = Buffer.from(credential.publicKey).toString('base64url');

  const createdCredential = await PasskeyCredential.create({
    credentialId,
    organisationId: user.organisationId,
    userId: user.userId,
    publicKey: publicKeyBase64,
    counter: credential.counter || 0,
    transports: response.response?.transports || credential.transports || [],
    authenticatorAttachment: response.authenticatorAttachment || null,
    aaguid: aaguid || null,
    friendlyName: String(friendlyName || 'Passkey Device').trim().slice(0, 120),
    status: 'ACTIVE',
  });

  await recordPasskeyAudit({
    organisationId: user.organisationId,
    actorUserId: user.userId,
    actorRole: user.role,
    action: 'PASSKEY_REGISTERED',
    credentialId,
    result: 'SUCCESS',
    details: { friendlyName },
  });

  return {
    verified: true,
    credential: createdCredential.toJSON(),
  };
}

/**
 * Generate Authentication Options for an account.
 */
async function generatePasskeyAuthenticationOptions({ organisationId, email }) {
  const orgId = String(organisationId || 'ZAMORIN').trim().toUpperCase();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  const { rpID } = getWebAuthnConfig();

  let allowCredentials = undefined;
  let user = null;

  if (normalizedEmail) {
    user = await User.findOne({
      organisationId: orgId,
      email: normalizedEmail,
    });

    if (user && user.accountStatus === 'ACTIVE') {
      const activeCredentials = await PasskeyCredential.find({
        organisationId: orgId,
        userId: user.userId,
        status: 'ACTIVE',
      });

      if (activeCredentials.length > 0) {
        allowCredentials = activeCredentials.map((cred) => ({
          id: cred.credentialId,
          transports: cred.transports || [],
        }));
      } else {
        allowCredentials = [];
      }
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    userVerification: 'required',
  });

  const challengeId = `PKC-AUTH-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000);

  await PasskeyChallenge.create({
    challengeId,
    challenge: options.challenge,
    ceremony: 'AUTHENTICATION',
    organisationId: orgId,
    userId: user ? user.userId : null,
    status: 'PENDING',
    expiresAt,
  });

  return {
    options,
    challengeId,
  };
}

/**
 * Verify Authentication Response, update counter, and issue authoritative session.
 */
async function verifyPasskeyAuthentication({
  organisationId,
  response,
  challengeId,
  device = { deviceId: 'DEV-WEB-PASSKEY', deviceType: 'DESKTOP' },
  userAgent = '',
  ipAddress = '',
}) {
  const orgId = String(organisationId || 'ZAMORIN').trim().toUpperCase();

  if (!response || !response.id || !challengeId) {
    throw ApiError.badRequest('Invalid authentication payload or missing challenge ID.');
  }

  const challengeRecord = await PasskeyChallenge.findOne({
    challengeId,
    ceremony: 'AUTHENTICATION',
    organisationId: orgId,
    status: 'PENDING',
  });

  if (!challengeRecord) {
    throw ApiError.badRequest('Invalid or already consumed authentication challenge.');
  }

  if (challengeRecord.expiresAt < new Date()) {
    challengeRecord.status = 'EXPIRED';
    await challengeRecord.save();
    throw ApiError.badRequest('Authentication challenge has expired.');
  }

  const credentialId = response.id;
  const credential = await PasskeyCredential.findOne({
    organisationId: orgId,
    credentialId,
    status: 'ACTIVE',
  });

  if (!credential) {
    throw ApiError.unauthorized('Passkey credential not recognized or has been revoked.');
  }

  // Cross-user verification check if challenge was bound to a specific user
  if (challengeRecord.userId && challengeRecord.userId !== credential.userId) {
    throw ApiError.forbidden('Passkey credential does not match challenge identity.');
  }

  const user = await User.findOne({
    organisationId: orgId,
    userId: credential.userId,
  });

  if (!user || user.accountStatus !== 'ACTIVE') {
    throw ApiError.forbidden('This account is not available for sign-in.');
  }

  const { rpID, expectedOrigin } = getWebAuthnConfig();

  let verification;
  try {
    const publicKeyBuffer = Buffer.from(credential.publicKey, 'base64url');

    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: {
        id: credential.credentialId,
        publicKey: publicKeyBuffer,
        counter: credential.counter,
        transports: credential.transports,
      },
      requireUserVerification: true,
    });
  } catch (err) {
    await recordPasskeyAudit({
      organisationId: orgId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'PASSKEY_AUTH_FAILED',
      credentialId,
      result: 'FAILURE',
      details: { error: err.message },
    });
    throw ApiError.unauthorized(`Passkey authentication failed: ${err.message}`);
  }

  if (!verification.verified || !verification.authenticationInfo) {
    throw ApiError.unauthorized('Passkey authentication signature could not be verified.');
  }

  // Consume challenge
  challengeRecord.status = 'CONSUMED';
  challengeRecord.consumedAt = new Date();
  await challengeRecord.save();

  // Update signCount and lastUsedAt
  credential.counter = verification.authenticationInfo.newCounter || credential.counter + 1;
  credential.lastUsedAt = new Date();
  await credential.save();

  // Authoritative Session & Token Issuance via authService.createSession
  const sessionResult = await authService.createSession({
    user,
    device,
    network: { ipAddress, userAgent },
    mfaVerified: true, // Passkey biometric assertion satisfies MFA/user verification
    createdBy: user.userId,
  });

  await recordPasskeyAudit({
    organisationId: orgId,
    actorUserId: user.userId,
    actorRole: user.role,
    action: 'PASSKEY_AUTH_SUCCESS',
    credentialId,
    result: 'SUCCESS',
    details: { deviceId: device?.deviceId },
  });

  return {
    success: true,
    verified: true,
    accessToken: sessionResult.accessToken,
    refreshToken: sessionResult.refreshToken,
    session: sessionResult.session,
    user: {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
      organisationId: user.organisationId,
      isPrimaryMaster: Boolean(user.isPrimaryMaster),
      primaryCafeId: user.primaryCafeId || null,
      assignedCafeIds: user.assignedCafeIds || [],
    },
  };
}

/**
 * List all active passkeys for an authenticated user.
 */
async function listUserPasskeys({ organisationId, userId }) {
  return PasskeyCredential.find({
    organisationId,
    userId,
    status: 'ACTIVE',
  }).sort({ createdAt: -1 });
}

/**
 * Rename a passkey for an authenticated user.
 */
async function renameUserPasskey({ organisationId, userId, credentialId, friendlyName }) {
  const credential = await PasskeyCredential.findOne({
    organisationId,
    userId,
    credentialId,
    status: 'ACTIVE',
  });

  if (!credential) {
    throw ApiError.notFound('Passkey credential not found or already revoked.');
  }

  const cleanName = String(friendlyName || '').trim().slice(0, 120);
  if (!cleanName) {
    throw ApiError.badRequest('A valid passkey name is required.');
  }

  credential.friendlyName = cleanName;
  await credential.save();

  await recordPasskeyAudit({
    organisationId,
    actorUserId: userId,
    action: 'PASSKEY_RENAMED',
    credentialId,
    result: 'SUCCESS',
    details: { friendlyName: cleanName },
  });

  return { success: true, credential: credential.toJSON() };
}

/**
 * Revoke a passkey for an authenticated user.
 */
async function revokeUserPasskey({ organisationId, userId, credentialId, revokedBy }) {
  const credential = await PasskeyCredential.findOne({
    organisationId,
    userId,
    credentialId,
    status: 'ACTIVE',
  });

  if (!credential) {
    throw ApiError.notFound('Passkey credential not found or already revoked.');
  }

  credential.status = 'REVOKED';
  credential.revokedAt = new Date();
  credential.revokedBy = revokedBy || userId;
  await credential.save();

  await recordPasskeyAudit({
    organisationId,
    actorUserId: userId,
    action: 'PASSKEY_REVOKED',
    credentialId,
    result: 'SUCCESS',
  });

  return { success: true, credentialId };
}

/**
 * Revoke or purge all passkeys for an authenticated user.
 */
async function revokeAllUserPasskeys({ organisationId, userId, revokedBy, hardDelete = true }) {
  if (hardDelete) {
    const result = await PasskeyCredential.deleteMany({
      organisationId,
      userId,
    });
    return { success: true, count: result.deletedCount };
  }

  const result = await PasskeyCredential.updateMany(
    {
      organisationId,
      userId,
      status: 'ACTIVE',
    },
    {
      $set: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedBy: revokedBy || userId,
      },
    }
  );

  await recordPasskeyAudit({
    organisationId,
    actorUserId: userId,
    action: 'ALL_PASSKEYS_REVOKED',
    result: 'SUCCESS',
  });

  return { success: true, count: result.modifiedCount };
}

module.exports = {
  getWebAuthnConfig,
  generatePasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  generatePasskeyAuthenticationOptions,
  verifyPasskeyAuthentication,
  listUserPasskeys,
  revokeUserPasskey,
  revokeAllUserPasskeys,
  renameUserPasskey,
};
