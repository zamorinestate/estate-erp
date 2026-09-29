/* =====================================================================
   js/api/cafeOpsApi.js — CAFE OPERATIONS API CLIENT
   ---------------------------------------------------------------------
   Mirrors the conventions of the real src/js/pages/login.js Api object
   exactly: same API_BASE_URL override pattern, same error shape (throws
   an Error with .code/.status set from the real backend's
   { success:false, error:{code,message} } envelope). The one addition
   is device/session token headers, since Cafe Operations identity is
   carried in custom headers rather than the browser's cookie jar — see
   ARCHITECTURE_DECISIONS.md for why a shared kiosk device needs that.

   Depends on: nothing (pure fetch wrapper, no DOM).
   ===================================================================== */
(function (global) {
  'use strict';

  const API_BASE_URL = (global.ZAMORIN_API_BASE_URL || '/api/v1') + '/cafe-ops';
  const DEVICE_TOKEN_KEY = 'zamorin.cafeops.deviceToken';
  const SESSION_TOKEN_KEY = 'zamorin.cafeops.sessionToken'; // sessionStorage — cleared on tab close, not persisted like the device token

  // -------------------------------------------------------------------
  // Token storage. Device token is long-lived and device-bound, so it
  // belongs in localStorage (survives app restarts — Section 73 of the
  // login spec explicitly expects re-enrollment NOT to be required on
  // every reboot). Session token deliberately does NOT persist across a
  // full browser restart the same way — Section 73 also requires
  // reauthentication after a security-relevant restart, so sessionStorage
  // (cleared when the tab/app process ends) is the correct choice, not a
  // bug.
  // -------------------------------------------------------------------
  function getDeviceToken() { try { return localStorage.getItem(DEVICE_TOKEN_KEY); } catch (_) { return null; } }
  function setDeviceToken(token) { try { localStorage.setItem(DEVICE_TOKEN_KEY, token); } catch (_) {} }
  function clearDeviceToken() { try { localStorage.removeItem(DEVICE_TOKEN_KEY); } catch (_) {} }

  function getSessionToken() { try { return sessionStorage.getItem(SESSION_TOKEN_KEY); } catch (_) { return null; } }
  function setSessionToken(token) { try { sessionStorage.setItem(SESSION_TOKEN_KEY, token); } catch (_) {} }
  function clearSessionToken() { try { sessionStorage.removeItem(SESSION_TOKEN_KEY); } catch (_) {} }

  function isNativeEnrollmentPlatform(platform) {
    return ['android', 'ios', 'macos', 'windows'].includes(
      String(platform || '').trim().toLowerCase()
    );
  }

  function validateNativeSigningIdentity(identity, platform) {
    const result = identity?.result || identity || {};
    const jwk = typeof result.publicKeyJwk === 'string'
      ? JSON.parse(result.publicKeyJwk)
      : result.publicKeyJwk;

    if (
      !jwk ||
      jwk.kty !== 'EC' ||
      jwk.crv !== 'P-256' ||
      typeof jwk.x !== 'string' ||
      typeof jwk.y !== 'string' ||
      jwk.d
    ) {
      const err = new Error('Native device returned an invalid public signing key.');
      err.code = 'INVALID_DEVICE_SIGNING_KEY';
      throw err;
    }

    const algorithm = String(result.algorithm || '').trim().toUpperCase();
    const provider = String(result.provider || '').trim().toUpperCase();
    const expectedProviders = {
      android: new Set(['ANDROID_KEYSTORE']),
      windows: new Set(['WINDOWS_CNG']),
      ios: new Set(['APPLE_SECURE_ENCLAVE', 'APPLE_KEYCHAIN']),
      macos: new Set(['APPLE_SECURE_ENCLAVE', 'APPLE_KEYCHAIN']),
    };
    const normalizedPlatform = String(platform || '').trim().toLowerCase();

    if (algorithm !== 'ES256') {
      const err = new Error('Native device returned an unsupported signing algorithm.');
      err.code = 'UNSUPPORTED_DEVICE_SIGNING_ALGORITHM';
      throw err;
    }

    if (!expectedProviders[normalizedPlatform]?.has(provider)) {
      const err = new Error('Native signing provider does not match the selected platform.');
      err.code = 'DEVICE_SIGNING_PROVENANCE_MISMATCH';
      throw err;
    }

    return {
      publicSigningKey: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y },
      signingKeyAlgorithm: algorithm,
      signingKeyProvider: provider,
    };
  }

  async function sendNativeEnrollmentMessage(action, payload = {}) {
    const requestId = `cafeops_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const message = { requestId, action, payload };

    const awaitWindowReply = (dispatch) => new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        global.removeEventListener('message', handler);
        const err = new Error('Native signing identity request timed out.');
        err.code = 'NATIVE_DEVICE_ATTESTATION_TIMEOUT';
        reject(err);
      }, 15000);

      const handler = (event) => {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (!data || data.requestId !== requestId || settled) return;
          settled = true;
          clearTimeout(timeout);
          global.removeEventListener('message', handler);
          if (data.success === false) {
            const err = new Error(data.errorMessage || 'Native signing identity is unavailable.');
            err.code = data.errorCode || 'NATIVE_DEVICE_ATTESTATION_UNAVAILABLE';
            reject(err);
            return;
          }
          resolve(data);
        } catch (_) {}
      };

      global.addEventListener('message', handler);
      try {
        dispatch();
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          global.removeEventListener('message', handler);
          reject(err);
        }
      }
    });

    if (global.chrome?.webview?.postMessage) {
      return awaitWindowReply(() => global.chrome.webview.postMessage(JSON.stringify(message)));
    }

    if (global.webkit?.messageHandlers?.ZamorinNativeBridge?.postMessage) {
      return awaitWindowReply(() => global.webkit.messageHandlers.ZamorinNativeBridge.postMessage(message));
    }

    if (global.ZamorinNativeBridge?.postMessage) {
      return awaitWindowReply(() => global.ZamorinNativeBridge.postMessage(JSON.stringify(message)));
    }

    const err = new Error('Native bridge is unavailable for device enrollment.');
    err.code = 'NATIVE_DEVICE_ATTESTATION_UNAVAILABLE';
    throw err;
  }

  async function prepareEnrollmentInput(input = {}) {
    const prepared = { ...input };
    if (!isNativeEnrollmentPlatform(prepared.platform)) return prepared;

    if (
      prepared.publicSigningKey &&
      prepared.signingKeyAlgorithm &&
      prepared.signingKeyProvider
    ) {
      return prepared;
    }

    if (String(prepared.platform || '').trim().toLowerCase() === 'android') {
      const challenge = await apiRequest('/devices/attestation/challenge', {
        body: {
          enrollmentCode: prepared.enrollmentCode,
          platform: prepared.platform,
        },
        auth: 'none',
      });

      try {
        const nativeIdentity = await sendNativeEnrollmentMessage(
          'GET_DEVICE_ATTESTATION_KEY',
          { hardwareAttestationChallenge: challenge.challenge }
        );
        const nativeResult = nativeIdentity?.result || nativeIdentity || {};
        if (
          nativeResult.hardwareAttestationChallengeBound !== true ||
          !Array.isArray(nativeResult.certificateChain) ||
          nativeResult.certificateChain.length < 2
        ) {
          const err = new Error(
            'Android did not return a challenge-bound hardware-attestation certificate chain.'
          );
          err.code = 'ANDROID_ATTESTATION_CERTIFICATE_CHAIN_INVALID';
          throw err;
        }

        return {
          ...prepared,
          ...validateNativeSigningIdentity(nativeIdentity, prepared.platform),
          hardwareAttestation: {
            challengeId: challenge.challengeId,
            certificateChain: nativeResult.certificateChain,
          },
        };
      } catch (hardwareErr) {
        const fallbackEligible = new Set([
          'DEVICE_ATTESTATION_KEY_FAILED',
          'NATIVE_DEVICE_ATTESTATION_TIMEOUT',
          'ANDROID_ATTESTATION_CERTIFICATE_CHAIN_INVALID',
        ]);
        if (!fallbackEligible.has(hardwareErr?.code)) throw hardwareErr;

        const fallbackIdentity = await sendNativeEnrollmentMessage(
          'GET_DEVICE_ATTESTATION_KEY',
          {}
        );
        return {
          ...prepared,
          ...validateNativeSigningIdentity(
            fallbackIdentity,
            prepared.platform
          ),
        };
      }
    }

    const nativeIdentity = await sendNativeEnrollmentMessage(
      'GET_DEVICE_ATTESTATION_KEY',
      {}
    );
    return {
      ...prepared,
      ...validateNativeSigningIdentity(nativeIdentity, prepared.platform),
    };
  }

  async function apiRequest(path, { method, body, auth } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth !== 'none') {
      const deviceToken = getDeviceToken();
      if (deviceToken) headers['X-CafeOps-Device-Token'] = deviceToken;
      if (auth === 'session') {
        const sessionToken = getSessionToken();
        if (sessionToken) headers['X-CafeOps-Session-Token'] = sessionToken;
      }
    }
    const res = await fetch(API_BASE_URL + path, {
      method: method || 'POST',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let parsed = null;
    try { parsed = await res.json(); } catch (_) { /* non-JSON response */ }

    if (!res.ok || (parsed && parsed.success === false)) {
      const err = (parsed && parsed.error) || { code: 'UNKNOWN_ERROR', message: 'Something went wrong. Please try again.' };
      const e = new Error(err.message);
      e.code = err.code;
      e.status = res.status;
      e.retryAt = err.retryAt || null;
      e.supportReference = err.supportReference || null;
      throw e;
    }
    return (parsed && parsed.data) || {};
  }

  const CafeOpsApi = {
    // ---- Device ------------------------------------------------------
    enrollDevice: async (input) => apiRequest('/devices/enroll', {
      body: await prepareEnrollmentInput(input),
      auth: 'none',
    }),
    deviceStatus: () => apiRequest('/devices/status', { method: 'GET' }),
    devicePolicy: () => apiRequest('/devices/policy', { method: 'GET' }),
    attendanceQr: () => apiRequest('/devices/attendance/qr', { method: 'GET' }),

    // ---- Operator PIN --------------------------------------------------
    operatorSignIn: (pin) => apiRequest('/operator/signin', { body: { pin } }),

    // ---- Master account ------------------------------------------------
    masterSignInCredentials: (identifier, password, accessReason) =>
      apiRequest('/operator/master-signin/credentials', { body: { identifier, password, accessReason } }),
    masterSignInMfa: (mfaChallengeId, code, accessReason) =>
      apiRequest('/operator/master-signin/mfa', { body: { mfaChallengeId, code, accessReason } }),

    // ---- Shared session lifecycle ---------------------------------------
    getSession: () => apiRequest('/operator/session', { method: 'GET', auth: 'session' }),
    lockSession: () => apiRequest('/operator/lock', { auth: 'session' }),
    unlockWithPin: (pin) => apiRequest('/operator/unlock', { body: { pin }, auth: 'session' }),
    unlockWithMaster: (password, mfaCode) => apiRequest('/operator/unlock', { body: { password, mfaCode }, auth: 'session' }),
    confirmWithPin: (pin) => apiRequest('/operator/confirm', { body: { pin }, auth: 'session' }),
    confirmWithMaster: (password, mfaCode) => apiRequest('/operator/confirm', { body: { password, mfaCode }, auth: 'session' }),
    endSession: (handoverNote, forSwitch) => apiRequest('/operator/end', { body: { handoverNote, forSwitch }, auth: 'session' }),
    heartbeat: () => apiRequest('/operator/heartbeat', { auth: 'session' }),
  };

  global.CafeOpsApi = CafeOpsApi;
  global.CafeOpsTokens = {
    getDeviceToken, setDeviceToken, clearDeviceToken,
    getSessionToken, setSessionToken, clearSessionToken,
  };
})(window);
