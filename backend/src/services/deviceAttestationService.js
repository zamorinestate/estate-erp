'use strict';

const crypto = require('node:crypto');
const { ApiError } = require('../utils/ApiError');

const ATTESTATION_VERSION = 'ZAMORIN_DEVICE_ACK_V1';
const ATTESTATION_ALGORITHM = 'ES256';

function cleanToken(value, fieldName) {
  const token = String(value || '').trim().toUpperCase();
  if (!token || /[\r\n]/.test(token)) {
    throw new ApiError(400, 'INVALID_DEVICE_ATTESTATION_PAYLOAD', `${fieldName} is required and must be a single-line token.`);
  }
  return token;
}

function parsePublicJwk(publicSigningKey) {
  if (!publicSigningKey) {
    throw new ApiError(400, 'DEVICE_SIGNING_KEY_REQUIRED', 'A device public signing key is required.');
  }

  let jwk;
  try {
    jwk = typeof publicSigningKey === 'string'
      ? JSON.parse(publicSigningKey)
      : publicSigningKey;
  } catch (_) {
    throw new ApiError(400, 'INVALID_DEVICE_SIGNING_KEY', 'Device public signing key must be valid JWK JSON.');
  }

  if (
    !jwk ||
    jwk.kty !== 'EC' ||
    jwk.crv !== 'P-256' ||
    typeof jwk.x !== 'string' ||
    typeof jwk.y !== 'string' ||
    jwk.d
  ) {
    throw new ApiError(
      400,
      'INVALID_DEVICE_SIGNING_KEY',
      'Device signing key must be a public EC P-256 JWK without private key material.'
    );
  }

  try {
    crypto.createPublicKey({ key: jwk, format: 'jwk' });
  } catch (_) {
    throw new ApiError(400, 'INVALID_DEVICE_SIGNING_KEY', 'Device public signing key could not be imported.');
  }

  return {
    kty: 'EC',
    crv: 'P-256',
    x: jwk.x,
    y: jwk.y,
  };
}

function canonicalPublicJwk(publicSigningKey) {
  const jwk = parsePublicJwk(publicSigningKey);
  return JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y,
  });
}

function publicKeyThumbprint(publicSigningKey) {
  return crypto.createHash('sha256').update(canonicalPublicJwk(publicSigningKey)).digest('hex');
}

function createChallenge() {
  return crypto.randomBytes(32).toString('base64url');
}

function failureReasonSha256(reason) {
  return crypto.createHash('sha256').update(String(reason || ''), 'utf8').digest('hex');
}

function buildPrintAckPayload({
  organisationId,
  cafeId,
  deviceId,
  printJobId,
  challenge,
  status,
  drawerKickStatus,
  failureCode,
  failureReason,
}) {
  const challengeValue = String(challenge || '').trim();
  if (!challengeValue || /[\r\n]/.test(challengeValue)) {
    throw new ApiError(400, 'PRINT_ACK_CHALLENGE_REQUIRED', 'A valid print acknowledgement challenge is required.');
  }

  return [
    ATTESTATION_VERSION,
    `organisationId=${cleanToken(organisationId, 'organisationId')}`,
    `cafeId=${cleanToken(cafeId, 'cafeId')}`,
    `deviceId=${cleanToken(deviceId, 'deviceId')}`,
    `printJobId=${cleanToken(printJobId, 'printJobId')}`,
    `challenge=${challengeValue}`,
    `status=${cleanToken(status, 'status')}`,
    `drawerKickStatus=${String(drawerKickStatus || 'NOT_APPLICABLE').trim().toUpperCase()}`,
    `failureCode=${String(failureCode || 'NONE').trim().toUpperCase()}`,
    `failureReasonSha256=${failureReasonSha256(failureReason)}`,
  ].join('\n');
}

function verifyPrintAckSignature({
  publicSigningKey,
  signatureBase64Url,
  payload,
}) {
  const signature = String(signatureBase64Url || '').trim();
  if (!signature) {
    throw new ApiError(403, 'DEVICE_ATTESTATION_SIGNATURE_REQUIRED', 'Signed device acknowledgement is required.');
  }

  let signatureBytes;
  try {
    signatureBytes = Buffer.from(signature, 'base64url');
  } catch (_) {
    throw new ApiError(400, 'INVALID_DEVICE_ATTESTATION_SIGNATURE', 'Device acknowledgement signature encoding is invalid.');
  }

  if (signatureBytes.length < 64 || signatureBytes.length > 80) {
    throw new ApiError(400, 'INVALID_DEVICE_ATTESTATION_SIGNATURE', 'Device acknowledgement signature length is invalid.');
  }

  const jwk = parsePublicJwk(publicSigningKey);
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const verified = crypto.verify(
    'sha256',
    Buffer.from(payload, 'utf8'),
    { key, dsaEncoding: 'der' },
    signatureBytes
  );

  if (!verified) {
    throw new ApiError(403, 'DEVICE_ATTESTATION_SIGNATURE_INVALID', 'Device acknowledgement signature verification failed.');
  }

  return {
    verified: true,
    signatureHash: crypto.createHash('sha256').update(signatureBytes).digest('hex'),
    keyThumbprint: publicKeyThumbprint(jwk),
  };
}

module.exports = {
  ATTESTATION_VERSION,
  ATTESTATION_ALGORITHM,
  parsePublicJwk,
  canonicalPublicJwk,
  publicKeyThumbprint,
  createChallenge,
  buildPrintAckPayload,
  verifyPrintAckSignature,
};
