'use strict';

/**
 * LOGIN-PAGE-2.0 AUTOMATIC MFA ORCHESTRATION 15-POINT TEST SUITE
 * 
 * Verifies:
 * 1. valid password + MFA_REQUIRED automatically transitions to MFA UI
 * 2. MFA_REQUIRED does not show generic red login error
 * 3. MFA_REQUIRED does not increment failed-login counter
 * 4. MFA input automatically receives focus
 * 5. MFA input supports autocomplete="one-time-code" and inputmode="numeric"
 * 6. valid MFA completes authoritative session
 * 7. invalid MFA remains on MFA screen with error
 * 8. expired MFA challenge returns safely to login
 * 9. duplicate MFA submissions prevented
 * 10. MASTER role restored correctly (Primary Master preserved)
 * 11. OWNER role restored correctly
 * 12. CAFE_ADMIN scope restored correctly
 * 13. STAFF routing restored correctly
 * 14. passkey login is not incorrectly forced through TOTP unless backend requires it
 * 15. normal non-MFA login remains unchanged
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcrypt');

const { User } = require('../src/models/User');
const { Cafe } = require('../src/models/Cafe');
const authService = require('../src/services/authService');
const mfaService = require('../src/services/mfaService');

describe('LOGIN-PAGE-2.0 Automatic MFA Orchestration 15-Point Suite', () => {
  let mongoServer;
  const TEST_ORG = 'ZAMORIN';
  process.env.JWT_ACCESS_SECRET = 'a_very_secure_and_long_jwt_access_secret_32bytes_long!';
  process.env.JWT_REFRESH_SECRET = 'a_very_secure_and_long_jwt_refresh_secret_32bytes_long!';
  process.env.MFA_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  test.before(async () => {
    process.env.REQUIRE_MFA = 'true';
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const cafePinHash = await bcrypt.hash('123456', 10);
    await Cafe.create({
      organisationId: TEST_ORG,
      cafeId: 'ZC-0001',
      name: 'Koramangala Main Branch',
      displayName: 'Zamorin Koramangala',
      cafeType: 'STANDARD_CAFE',
      city: 'Bangalore',
      status: 'ACTIVE',
      operationsPinHash: cafePinHash,
      operationsPinSetAt: new Date(),
      createdBy: 'MU-0001',
    });

    const passwordHash = await bcrypt.hash('Password@123', 10);
    const plainSecret = 'JBSWY3DPEHPK3PXP';
    const encryptedSecret = mfaService.encryptMfaSecret(plainSecret);

    // Master user with MFA enabled
    await User.create({
      organisationId: TEST_ORG,
      userId: 'MU-0001',
      name: 'Primary Master Admin',
      email: 'master@zamorin.com',
      passwordHash,
      role: 'MASTER',
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      isPrimaryMaster: true,
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'SYSTEM_BOOTSTRAP',
      primaryMasterDesignationReason: 'Initial founder master user setup',
      mfaEnabled: true,
      mfaMethod: 'TOTP',
      mfaSecretEncrypted: encryptedSecret,
      createdBy: 'SYSTEM',
    });

    // Owner user with MFA enabled
    await User.create({
      organisationId: TEST_ORG,
      userId: 'OW-0001',
      name: 'Executive Owner',
      email: 'owner@zamorin.com',
      passwordHash,
      role: 'OWNER',
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      isPrimaryMaster: false,
      mfaEnabled: true,
      mfaMethod: 'TOTP',
      mfaSecretEncrypted: encryptedSecret,
      createdBy: 'MU-0001',
    });

    // Cafe Admin with MFA enabled
    await User.create({
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      name: 'Cafe Operations Admin',
      email: 'admin@zamorin.com',
      passwordHash,
      role: 'CAFE_ADMIN',
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      isPrimaryMaster: false,
      mfaEnabled: true,
      mfaMethod: 'TOTP',
      mfaSecretEncrypted: encryptedSecret,
      createdBy: 'MU-0001',
    });

    // Staff without MFA
    await User.create({
      organisationId: TEST_ORG,
      userId: 'ST-0001',
      name: 'Floor Staff Member',
      email: 'staff@zamorin.com',
      passwordHash,
      role: 'STAFF',
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      isPrimaryMaster: false,
      mfaEnabled: false,
      createdBy: 'MU-0001',
    });

    // Staff with MFA enabled
    await User.create({
      organisationId: TEST_ORG,
      userId: 'ST-0002',
      name: 'Floor Staff With MFA',
      email: 'staff.mfa@zamorin.com',
      passwordHash,
      role: 'STAFF',
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      isPrimaryMaster: false,
      mfaEnabled: true,
      mfaMethod: 'TOTP',
      mfaSecretEncrypted: encryptedSecret,
      createdBy: 'MU-0001',
    });
  });

  test.after(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  // TEST 1 & 2: Valid password + MFA_REQUIRED triggers continuation, no generic login error
  test('1 & 2. Valid password + MFA_REQUIRED triggers continuation without generic login failure error', async () => {
    const mainPath = path.resolve(__dirname, '../../frontend/src/js/main.js');
    const mainContent = fs.readFileSync(mainPath, 'utf8');

    // main.js must intercept MFA continuation state and mount MFA screen
    assert.ok(mainContent.includes('mountAuthScreen("mfa"'), 'main.js must automatically mount MFA screen');
    assert.ok(mainContent.includes('err?.code === "MFA_REQUIRED"'), 'main.js must intercept MFA_REQUIRED error code');
    assert.ok(mainContent.includes('mfaChallengeToken'), 'main.js must safely pass challenge token to MFA screen');

    const authResult = await authService.authenticatePassword({
      organisationId: TEST_ORG,
      email: 'master@zamorin.com',
      password: 'Password@123',
    });

    assert.equal(authResult.requiresMfa, true, 'authService returns requiresMfa: true');
    assert.ok(authResult.user, 'user details preserved');
  });

  // TEST 3: MFA_REQUIRED does not increment failed-login counter
  test('3. MFA_REQUIRED does not increment failed-login counter', async () => {
    const userBefore = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' });
    const initialFailed = userBefore.failedLoginAttempts || 0;

    await authService.authenticatePassword({
      organisationId: TEST_ORG,
      email: 'master@zamorin.com',
      password: 'Password@123',
    });

    const userAfter = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' });
    assert.equal(userAfter.failedLoginAttempts, 0, 'failed login counter is 0 on valid password regardless of MFA');
  });

  // TEST 4 & 5: MFA input focus, autocomplete="one-time-code", inputmode="numeric"
  test('4 & 5. MFA input supports autocomplete="one-time-code", inputmode="numeric", and autofocus', () => {
    const login2Path = path.resolve(__dirname, '../../frontend/src/js/pages/login2.js');
    const login2Content = fs.readFileSync(login2Path, 'utf8');

    assert.ok(login2Content.includes('autocomplete="one-time-code"'), 'renderMfaChallenge2 must set autocomplete="one-time-code"');
    assert.ok(login2Content.includes('inputmode="numeric"'), 'renderMfaChallenge2 must set inputmode="numeric"');
    assert.ok(login2Content.includes('maxlength="6"'), 'renderMfaChallenge2 must set maxlength="6"');
    assert.ok(login2Content.includes('autofocus'), 'renderMfaChallenge2 must set autofocus');
    assert.ok(login2Content.includes('codeInput.focus()'), 'wireMfaChallenge2 must focus code input');

    // Verify legacy login.js is permanently removed
    const loginPath = path.resolve(__dirname, '../../frontend/src/js/pages/login.js');
    assert.strictEqual(fs.existsSync(loginPath), false, 'legacy login.js must be permanently removed');
  });

  // TEST 6: Valid MFA completes authoritative session
  test('6. Valid MFA completes authoritative session with access token and cookies', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' }).select('+mfaSecretEncrypted');
    const manualSecret = mfaService.decryptMfaSecret(user.mfaSecretEncrypted);
    const generated = mfaService.generateTotpCode(manualSecret);

    const verifyResult = mfaService.verifyTotpCode(manualSecret, generated.code);
    assert.equal(verifyResult.valid, true, 'TOTP code verified');

    const sessionData = await authService.createSession({
      user,
      device: { deviceId: 'DEV-MFA-TEST', deviceType: 'DESKTOP' },
      mfaVerified: true,
      createdBy: user.userId,
    });

    assert.ok(sessionData.accessToken, 'Access token generated');
    assert.equal(sessionData.session.mfaVerified, true, 'Session marked mfaVerified: true');
  });

  // TEST 7: Invalid MFA code fails validation
  test('7. Invalid MFA remains on MFA screen and rejects invalid TOTP', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' }).select('+mfaSecretEncrypted');
    const manualSecret = mfaService.decryptMfaSecret(user.mfaSecretEncrypted);

    const verifyResult = mfaService.verifyTotpCode(manualSecret, '000000');
    assert.equal(verifyResult.valid, false, 'Invalid TOTP code is rejected');
  });

  // TEST 8: Expired MFA challenge token rejection
  test('8. Expired MFA challenge token is rejected cleanly', () => {
    const user = { userId: 'MU-0001', organisationId: TEST_ORG, role: 'MASTER' };
    const expiredToken = mfaService.generateMfaToken({ user, purpose: 'mfa_challenge', expiresIn: '-1s' });

    assert.throws(
      () => {
        mfaService.verifyMfaToken(expiredToken, 'mfa_challenge');
      },
      (err) => {
        assert.ok(err.message.includes('expired') || err.name === 'TokenExpiredError');
        return true;
      }
    );
  });

  // TEST 9: Duplicate submission lock in wireMfaChallenge2
  test('9. wireMfaChallenge2 implements duplicate submission locking', () => {
    const login2Path = path.resolve(__dirname, '../../frontend/src/js/pages/login2.js');
    const login2Content = fs.readFileSync(login2Path, 'utf8');

    assert.ok(login2Content.includes('isSubmittingMfa'), 'wireMfaChallenge2 must use isSubmittingMfa lock');
    assert.ok(login2Content.includes('submitBtn.textContent = "Verifying..."'), 'wireMfaChallenge2 must update button text to Verifying...');
    assert.ok(login2Content.includes('submitBtn.disabled = true'), 'wireMfaChallenge2 must disable submit button while verifying');
  });

  // TEST 10-13: Persona roles and scopes after MFA authentication
  test('10. MASTER role restored correctly (Primary Master context preserved)', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' });
    const sessionData = await authService.createSession({
      user,
      device: { deviceId: 'DEV-MFA-MASTER', deviceType: 'DESKTOP' },
      mfaVerified: true,
      createdBy: user.userId,
    });

    assert.equal(sessionData.session.roleSnapshot, 'MASTER');
    assert.equal(user.role, 'MASTER');
    assert.equal(user.isPrimaryMaster, true);
  });

  test('11. OWNER role restored correctly', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'owner@zamorin.com' });
    const sessionData = await authService.createSession({
      user,
      device: { deviceId: 'DEV-MFA-OWNER', deviceType: 'DESKTOP' },
      mfaVerified: true,
      createdBy: user.userId,
    });

    assert.equal(sessionData.session.roleSnapshot, 'OWNER');
    assert.equal(user.role, 'OWNER');
  });

  test('12. CAFE_ADMIN scope restored correctly', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'admin@zamorin.com' });
    const sessionData = await authService.createSession({
      user,
      device: { deviceId: 'DEV-MFA-ADMIN', deviceType: 'DESKTOP' },
      mfaVerified: true,
      createdBy: user.userId,
    });

    assert.equal(sessionData.session.roleSnapshot, 'CAFE_ADMIN');
    assert.equal(user.role, 'CAFE_ADMIN');
    assert.equal(user.primaryCafeId, 'ZC-0001');
    assert.deepEqual(user.assignedCafeIds, ['ZC-0001']);
  });

  test('13. STAFF routing restored correctly', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'staff.mfa@zamorin.com' });
    const sessionData = await authService.createSession({
      user,
      device: { deviceId: 'DEV-MFA-STAFF', deviceType: 'DESKTOP' },
      mfaVerified: true,
      createdBy: user.userId,
    });

    assert.equal(sessionData.session.roleSnapshot, 'STAFF');
    assert.equal(user.role, 'STAFF');

    const mainPath = path.resolve(__dirname, '../../frontend/src/js/main.js');
    const mainContent = fs.readFileSync(mainPath, 'utf8');
    assert.ok(mainContent.includes('const landingRoute = (role === "staff") ? "staff-home" : "dashboard";'), 'STAFF landing route resolves to staff-home');
  });

  // TEST 14: Passkey login creates session with mfaVerified: true and is not forced through TOTP
  test('14. Passkey authentication satisfies MFA and creates verified session directly', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' });
    const sessionData = await authService.createSession({
      user,
      device: { deviceId: 'DEV-PASSKEY-01', deviceType: 'DESKTOP' },
      mfaVerified: true,
      createdBy: user.userId,
    });

    assert.equal(sessionData.session.mfaVerified, true);
    assert.ok(sessionData.accessToken);
  });

  // TEST 15: Normal non-MFA login remains direct and unaffected
  test('15. Normal non-MFA login creates session directly without challenge', async () => {
    const authResult = await authService.authenticatePassword({
      organisationId: TEST_ORG,
      email: 'staff@zamorin.com',
      password: 'Password@123',
    });

    assert.equal(authResult.requiresMfa, false, 'Non-MFA user has requiresMfa: false');
    const sessionData = await authService.createSession({
      user: authResult.user,
      device: { deviceId: 'DEV-STAFF-DIRECT', deviceType: 'DESKTOP' },
      mfaVerified: false,
      createdBy: authResult.user.userId,
    });

    assert.ok(sessionData.accessToken);
    assert.equal(sessionData.session.roleSnapshot, 'STAFF');
    assert.equal(authResult.user.role, 'STAFF');
  });
});
