'use strict';

import { apiPost, getCafeOpsDeviceToken } from '../apiClient.js';
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

export async function ensureNativeDeviceAttestationBinding() {
  const capabilities = NativeCapabilities.getCapabilities();
  const deviceToken = getCafeOpsDeviceToken();

  if (!capabilities.isNative || !deviceToken) {
    return {
      attempted: false,
      capable: false,
      reason: !capabilities.isNative ? 'WEB_RUNTIME' : 'DEVICE_NOT_ENROLLED',
    };
  }

  const identity = await getNativeDeviceAttestationIdentity({
    requiredForNative: true,
  });

  const response = await apiPost('/cafe-ops/devices/attestation/key', {
    publicSigningKey: identity.publicKeyJwk,
    signingKeyAlgorithm: identity.algorithm,
    signingKeyProvider: identity.provider,
  });

  return {
    attempted: true,
    capable: true,
    identity,
    binding: response?.data || response,
  };
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

async function submitPurposeBoundPrintAcknowledgement(dispatch, nativeResult) {
  if (!dispatch?.printJobId) {
    throw new Error('printJobId is required for device acknowledgement.');
  }
  if (!nativeResult?.signature) {
    const err = new Error('Android did not return a purpose-bound print attestation signature.');
    err.code = 'DEVICE_ATTESTATION_SIGNATURE_MISSING';
    throw err;
  }

  const nativeStatus = String(nativeResult.status || '').toUpperCase();
  if (!['PRINTED', 'FAILED', 'CANCELLED'].includes(nativeStatus)) {
    const err = new Error('Native print attestation did not return a supported terminal status.');
    err.code = 'INVALID_NATIVE_PRINT_ATTESTATION_STATUS';
    throw err;
  }

  const drawerKickStatus =
    String(nativeResult.drawerKickStatus || '').toUpperCase() === 'UNCHANGED'
      ? null
      : (nativeResult.drawerKickStatus || null);

  const failureCode =
    nativeResult.failureCode && String(nativeResult.failureCode).toUpperCase() !== 'NONE'
      ? nativeResult.failureCode
      : null;

  return apiPost(
    `/pos/print-jobs/${encodeURIComponent(dispatch.printJobId)}/ack`,
    {
      status: nativeStatus,
      failureCode,
      failureReason: nativeResult.failureReason || null,
      drawerKickStatus,
      attestation: {
        signature: nativeResult.signature,
        keyThumbprint: nativeResult.keyThumbprint || null,
        algorithm: nativeResult.algorithm || ATTESTATION_ALGORITHM,
        provider: nativeResult.provider || 'ANDROID_KEYSTORE',
      },
    }
  );
}


function unwrapNativeResult(response) {
  return response?.result || response || {};
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * REC-04D Android completion monitor.
 *
 * Android's application PrintManager can report terminal COMPLETED / FAILED /
 * CANCELLED states for print jobs created by this application. Only those
 * terminal states are converted into signed server acknowledgements.
 */
export async function monitorAndroidPrintAndAcknowledge(
  dispatch,
  nativePrintResponse,
  { pollIntervalMs = 1000, maxPolls = 120 } = {}
) {
  const capabilities = NativeCapabilities.getCapabilities();
  if (!capabilities.isNative || String(capabilities.platform || '').toUpperCase() !== 'ANDROID') {
    return { monitored: false, reason: 'ANDROID_NATIVE_REQUIRED' };
  }

  const initial = unwrapNativeResult(nativePrintResponse);
  const platformJobId = String(initial.platformJobId || '').trim();
  if (!platformJobId) {
    return { monitored: false, reason: 'PLATFORM_PRINT_JOB_ID_MISSING' };
  }

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (attempt > 0) await delay(pollIntervalMs);

    const attestationResponse = await NativeCapabilities.sendNativeMessage(
      'ATTEST_PRINT_JOB_RESULT',
      { platformJobId }
    );
    if (attestationResponse?.success === false) {
      const err = new Error(
        attestationResponse?.errorMessage ||
        'Android could not attest the bound print job result.'
      );
      err.code = attestationResponse?.errorCode || 'ANDROID_PRINT_ATTESTATION_FAILED';
      throw err;
    }

    const attestedResult = unwrapNativeResult(attestationResponse);
    const status = String(attestedResult.status || '').toUpperCase();

    if (!attestedResult.terminal) {
      continue;
    }

    if (
      status === 'PRINTED' &&
      attestedResult.physicalCompletionVerified !== true
    ) {
      const err = new Error('Android attempted to report PRINTED without spooler completion evidence.');
      err.code = 'ANDROID_PRINT_COMPLETION_EVIDENCE_REQUIRED';
      throw err;
    }

    const serverAck = await submitPurposeBoundPrintAcknowledgement(
      dispatch,
      attestedResult
    );
    return {
      monitored: true,
      terminal: true,
      acknowledged: true,
      platformJobId,
      status,
      serverAck,
    };
  }

  return {
    monitored: true,
    terminal: false,
    acknowledged: false,
    platformJobId,
    status: 'PENDING',
    reason: 'PRINT_JOB_NOT_TERMINAL_WITHIN_MONITOR_WINDOW',
  };
}

export {
  ATTESTATION_VERSION,
  ATTESTATION_ALGORITHM,
};
