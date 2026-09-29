'use strict';

import { apiPost } from '../apiClient.js';
import { NativeCapabilities } from './nativeCapabilities.js';

const ATTESTATION_VERSION = 'ZAMORIN_DEVICE_ACK_V1';
const ATTESTATION_ALGORITHM = 'ES256';

function normalizeToken(value, fieldName) {
  const token = String(value || '').trim().toUpperCase();
  if (!token || /[\r\n]/.test(token)) {
    throw new Error(`${fieldName} is missing or invalid for device attestation.`);
  }
  return token;
}

async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure hashing is unavailable in this client.');
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(String(value || ''))
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeBridgeResult(response) {
  if (!response || response.success !== true) {
    const err = new Error(response?.errorMessage || 'Native device attestation bridge is unavailable.');
    err.code = response?.errorCode || 'DEVICE_ATTESTATION_UNAVAILABLE';
    throw err;
  }
  return response.result || response;
}

function validatePublicJwk(jwk) {
  const key = typeof jwk === 'string' ? JSON.parse(jwk) : jwk;
  if (
    !key ||
    key.kty !== 'EC' ||
    key.crv !== 'P-256' ||
    typeof key.x !== 'string' ||
    typeof key.y !== 'string' ||
    key.d
  ) {
    const err = new Error('Native device returned an invalid public signing key.');
    err.code = 'INVALID_DEVICE_SIGNING_KEY';
    throw err;
  }
  return { kty: 'EC', crv: 'P-256', x: key.x, y: key.y };
}

export async function getNativeDeviceAttestationIdentity({ requiredForNative = true } = {}) {
  const capabilities = NativeCapabilities.getCapabilities();
  if (!capabilities.isNative) {
    return {
      capable: false,
      platform: capabilities.platform || 'WEB',
      algorithm: null,
      provider: null,
      publicKeyJwk: null,
      keyThumbprint: null,
    };
  }

  try {
    const result = normalizeBridgeResult(
      await NativeCapabilities.sendNativeMessage('GET_DEVICE_ATTESTATION_KEY', {})
    );
    return {
      capable: true,
      platform: capabilities.platform || null,
      algorithm: result.algorithm || ATTESTATION_ALGORITHM,
      provider: result.provider || 'UNKNOWN',
      publicKeyJwk: validatePublicJwk(result.publicKeyJwk),
      keyThumbprint: result.keyThumbprint || null,
    };
  } catch (err) {
    if (requiredForNative) throw err;
    return {
      capable: false,
      platform: capabilities.platform || null,
      algorithm: null,
      provider: null,
      publicKeyJwk: null,
      keyThumbprint: null,
      errorCode: err.code || 'DEVICE_ATTESTATION_UNAVAILABLE',
    };
  }
}

export async function buildPrintAckPayload(attestationContext, acknowledgement = {}) {
  const context = attestationContext || {};
  if (context.version !== ATTESTATION_VERSION) {
    throw new Error('Unsupported print acknowledgement attestation version.');
  }
  if ((context.algorithm || ATTESTATION_ALGORITHM) !== ATTESTATION_ALGORITHM) {
    throw new Error('Unsupported print acknowledgement signing algorithm.');
  }

  const status = normalizeToken(acknowledgement.status, 'status');
  const drawerKickStatus = String(acknowledgement.drawerKickStatus || 'UNCHANGED').trim().toUpperCase();
  const failureCode =
    status === 'FAILED'
      ? normalizeToken(acknowledgement.failureCode || 'DEVICE_PRINT_FAILED', 'failureCode')
      : status === 'CANCELLED'
        ? normalizeToken(acknowledgement.failureCode || 'PRINT_CANCELLED', 'failureCode')
        : 'NONE';
  const failureReason =
    status === 'FAILED'
      ? String(acknowledgement.failureReason || 'Physical print device reported failure.').slice(0, 500)
      : status === 'CANCELLED'
        ? String(acknowledgement.failureReason || 'Physical print job was cancelled.').slice(0, 500)
        : '';

  return [
    ATTESTATION_VERSION,
    `organisationId=${normalizeToken(context.organisationId, 'organisationId')}`,
    `cafeId=${normalizeToken(context.cafeId, 'cafeId')}`,
    `deviceId=${normalizeToken(context.deviceId, 'deviceId')}`,
    `printJobId=${normalizeToken(context.printJobId, 'printJobId')}`,
    `challenge=${String(context.challenge || '').trim()}`,
    `status=${status}`,
    `drawerKickStatus=${drawerKickStatus}`,
    `failureCode=${failureCode}`,
    `failureReasonSha256=${await sha256Hex(failureReason)}`,
  ].join('\n');
}

export async function signPrintAcknowledgement(attestationContext, acknowledgement = {}) {
  const payload = await buildPrintAckPayload(attestationContext, acknowledgement);
  const result = normalizeBridgeResult(
    await NativeCapabilities.sendNativeMessage('SIGN_DEVICE_ATTESTATION', { payload })
  );
  if (!result.signature) {
    const err = new Error('Native device did not return an attestation signature.');
    err.code = 'DEVICE_ATTESTATION_SIGNATURE_MISSING';
    throw err;
  }
  return {
    payload,
    attestation: {
      signature: result.signature,
      keyThumbprint: result.keyThumbprint || null,
      algorithm: result.algorithm || ATTESTATION_ALGORITHM,
      provider: result.provider || null,
    },
  };
}

export async function submitPrintAcknowledgement(dispatch, acknowledgement = {}) {
  if (!dispatch?.printJobId) {
    throw new Error('printJobId is required for device acknowledgement.');
  }

  let attestation = null;
  if (dispatch.cryptographicAttestationRequired) {
    if (!dispatch.attestationContext) {
      throw new Error('Server did not provide the attestation context for this print job.');
    }
    const signed = await signPrintAcknowledgement(dispatch.attestationContext, acknowledgement);
    attestation = signed.attestation;
  }

  return apiPost(
    `/pos/print-jobs/${encodeURIComponent(dispatch.printJobId)}/ack`,
    {
      ...acknowledgement,
      attestation,
    }
  );
}

export {
  ATTESTATION_VERSION,
  ATTESTATION_ALGORITHM,
};
