'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) =>
  fs.readFileSync(path.resolve(__dirname, '../..', relativePath), 'utf8');

describe('Login and authentication end-to-end hardening', () => {
  const main = read('frontend/src/js/main.js');
  const login2 = read('frontend/src/js/pages/login2.js');
  const staticIndex = read('frontend/index.html');
  const cafeOpsLogin = read('frontend/src/js/pages/cafeOperationsLogin2.js');
  const passwordModal = read('frontend/src/js/components/changePasswordModal.js');
  const authController = read('backend/src/controllers/authController.js');

  it('standard login helper always supplies canonical browser device metadata', () => {
    const start = main.indexOf('export async function handleLoginSubmit');
    const end = main.indexOf('export async function handlePasswordResetRequest', start);
    const block = main.slice(start, end);

    assert.ok(block.includes('device: {'));
    assert.ok(block.includes('deviceId: getOrCreateDeviceId()'));
    assert.ok(block.includes('deviceName: "Browser Client"'));
    assert.ok(block.includes('deviceType: "DESKTOP"'));
  });

  it('Primary Master routing uses explicit server isPrimaryMaster attestation, never identity shortcuts', () => {
    const start = main.indexOf('function resolveAuthenticatedRole');
    const end = main.indexOf('if (rawRole === "OWNER")', start);
    const block = main.slice(start, end);

    assert.ok(block.includes('user?.isPrimaryMaster === true'));
    assert.equal(block.includes('isHardcodedPrimaryMaster'), false);
    assert.equal(block.includes('MU-0001'), false);
    assert.equal(block.includes('pradeeshk331@gmail.com'), false);
  });

  it('required password changes are enforced before dashboard/session routing', () => {
    assert.ok(main.includes('async function enforceRequiredPasswordChange'));
    assert.ok(main.includes('res?.data?.mustChangePassword === true'));
    assert.ok(main.includes('user?.mustChangePassword === true'));
    assert.ok(main.includes('openChangePasswordModal({ forced: true })'));
  });

  it('forced password change cannot be dismissed back into the application', () => {
    assert.ok(passwordModal.includes('export function openChangePasswordModal({ forced = false } = {})'));
    assert.ok(passwordModal.includes('cancelLabel: forced ? "Sign Out" : "Cancel"'));
    assert.ok(passwordModal.includes('onCancel: forced ? exitForcedPasswordFlow : null'));
    assert.ok(passwordModal.includes('await apiPost("/auth/logout", {})'));
  });

  it('Cafe Operations login sends a real per-browser device identity', () => {
    assert.ok(cafeOpsLogin.includes('getOrCreateDeviceId'));
    assert.ok(cafeOpsLogin.includes('deviceId: getOrCreateDeviceId()'));
    assert.ok(cafeOpsLogin.includes('deviceName: "Café Operations Browser"'));
    assert.ok(cafeOpsLogin.includes('deviceType: "DESKTOP"'));
  });

  it('Cafe Operations access tokens remain memory-only', () => {
    assert.equal(cafeOpsLogin.includes('localStorage.setItem("zamorin_token"'), false);
    assert.ok(cafeOpsLogin.includes('setAccessToken(data.accessToken)'));
  });

  it('first-time MFA setup is initiated before confirmation and exposes setup material, not a generated OTP', () => {
    assert.ok(main.includes('"/auth/mfa/setup"'));
    assert.ok(main.includes('mfaSetupPrepared: true'));
    assert.ok(login2.includes('manualEntrySecret'));
    assert.equal(authController.includes('autoCode'), false);
  });

  it('unsupported social-login buttons are absent from both dynamic and pre-rendered login UI', () => {
    for (const source of [login2, staticIndex]) {
      assert.equal(source.includes('id="l2-social-google"'), false);
      assert.equal(source.includes('id="l2-social-apple"'), false);
      assert.equal(source.includes('id="l2-social-facebook"'), false);
    }
  });

  it('public self-registration affordance is absent and direct register routing fails closed', () => {
    assert.equal(login2.includes('id="l2-to-register-btn"'), false);
    assert.equal(staticIndex.includes('id="l2-to-register-btn"'), false);
    assert.equal(main.includes('mountAuthScreen("register")'), false);
    assert.ok(main.includes('rawHash === "register"'));
    assert.ok(main.includes('Self-registration is disabled'));
  });

  it('cached legacy login markup is actively replaced before wiring', () => {
    assert.ok(main.includes('hasUnsupportedLegacyAuthControls'));
    assert.ok(main.includes('#l2-social-google, #l2-social-apple, #l2-social-facebook, #l2-to-register-btn'));
  });
});
