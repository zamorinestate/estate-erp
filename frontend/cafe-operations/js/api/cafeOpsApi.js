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

  async function apiRequest(path, { method, body, auth } = {}) {
    const unavailable = new Error('Server-backed café operations are unavailable.');
    unavailable.code = 'API_UNAVAILABLE';
    unavailable.status = 410;
    throw unavailable;
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
    enrollDevice: (input) => apiRequest('/devices/enroll', { body: input, auth: 'none' }),
    deviceStatus: () => apiRequest('/devices/status', { method: 'GET' }),
    devicePolicy: () => apiRequest('/devices/policy', { method: 'GET' }),

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
