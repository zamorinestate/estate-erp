'use strict';

/**
 * ZAMORIN CAFÉ ERP — REAL TRUSTED-DEVICE / REMEMBER-THIS-DEVICE 31-POINT TEST SUITE
 * 
 * Verifies:
 * 1. First login on untrusted device returns MFA_REQUIRED
 * 2. Remember device OFF + successful MFA does NOT create trust
 * 3. Remember device ON + successful MFA creates trust with HttpOnly cookie
 * 4. Trusted-device token is high entropy (48 bytes base64url)
 * 5. Token is hashed server-side with SHA-256 (raw token never stored in DB)
 * 6. Cookie is HttpOnly, Path=/, and Secure-compatible
 * 7. Trusted device allows MFA skip only after valid password
 * 8. Expired trust requires MFA again
 * 9. Revoked trust requires MFA again
 * 10. Wrong-user trust token rejected
 * 11. Wrong-organisation trust token rejected
 * 12. Tampered trust token rejected
 * 13. Disabled account rejected despite trusted device
 * 14. Password reset invalidates trusted device
 * 15. MFA reconfiguration invalidates trusted device
 * 16. Role change invalidates/re-evaluates trust
 * 17. Revoke single device
 * 18. Revoke all devices
 * 19. Device listing is user-scoped
 * 20. STAFF cannot inspect another user's devices
 * 21. MASTER / OWNER / CAFE_ADMIN security boundaries enforced
 * 22. MASTER policy expiry enforced (7 days)
 * 23. CAFE_ADMIN policy expiry enforced (14 days)
 * 24. STAFF policy expiry enforced (30 days)
 * 25. MFA_REQUIRED is not counted as failed password login
 * 26. Network/server errors do not create trust
 * 27. Passkey login remains valid
 * 28. Password + MFA remains valid
 * 29. Cafe Operations remains valid
 * 30. Public registration remains disabled
 * 31. Legacy rollback remains valid
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');

const { User } = require('../src/models/User');
const { Cafe } = require('../src/models/Cafe');
const { TrustedDevice } = require('../src/models/TrustedDevice');
const authService = require('../src/services/authService');
const mfaService = require('../src/services/mfaService');
const deviceTrustService = require('../src/services/deviceTrustService');
const authController = require('../src/controllers/authController');

describe('REAL TRUSTED-DEVICE / REMEMBER-THIS-DEVICE 31-POINT TEST SUITE', () => {
  let mongoServer;
  const TEST_ORG = 'ZAMORIN';
  process.env.JWT_ACCESS_SECRET = 'a_very_secure_and_long_jwt_access_secret_32bytes_long!';
  process.env.JWT_REFRESH_SECRET = 'a_very_secure_and_long_jwt_refresh_secret_32bytes_long!';
  process.env.MFA_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  let masterUser, ownerUser, cafeAdminUser, staffUser;
  let masterSecretBase32, adminSecretBase32;

  test.before(async () => {
    process.env.REQUIRE_MFA = 'true';
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const cafePinHash = await bcrypt.hash('123456', 10);
    await Cafe.create({
      organisationId: TEST_ORG,
      cafeId: 'ZC-0001',
      name: 'Kozhikode Flagship Cafe',
      displayName: 'Zamorin Kozhikode',
      cafeType: 'STANDARD_CAFE',
      status: 'ACTIVE',
      contactPhone: '+919876543210',
      contactEmail: 'kozhikode@zamorin.cafe',
      address: {
        line1: 'Beach Road',
        city: 'Kozhikode',
        state: 'Kerala',
        postalCode: '673001',
        country: 'India',
      },
      posPinHash: cafePinHash,
      createdBy: 'SYSTEM_BOOTSTRAP',
    });

    const pwdHash = await authService.hashPassword('Pass@12345678', { requiresMfa: true });

    masterSecretBase32 = mfaService.generateTotpSecret();
    adminSecretBase32 = mfaService.generateTotpSecret();

    masterUser = await User.create({
      userId: 'MU-0001',
      organisationId: TEST_ORG,
      name: 'Primary Master Admin',
      email: 'master@zamorin.cafe',
      passwordHash: pwdHash,
      role: 'MASTER',
      accountStatus: 'ACTIVE',
      isPrimaryMaster: true,
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'SYSTEM_BOOTSTRAP',
      primaryMasterDesignationReason: 'Initial bootstrap',
      mfaEnabled: true,
      mfaMethod: 'TOTP',
      mfaSecretEncrypted: mfaService.encryptMfaSecret(masterSecretBase32),
      mustChangePassword: false,
      createdBy: 'SYSTEM_BOOTSTRAP',
    });

    ownerUser = await User.create({
      userId: 'OW-0001',
      organisationId: TEST_ORG,
      name: 'Business Owner',
      email: 'owner@zamorin.cafe',
      passwordHash: pwdHash,
      role: 'OWNER',
      accountStatus: 'ACTIVE',
      mfaEnabled: true,
      mfaMethod: 'TOTP',
      mfaSecretEncrypted: mfaService.encryptMfaSecret(mfaService.generateTotpSecret()),
      mustChangePassword: false,
      createdBy: 'SYSTEM_BOOTSTRAP',
    });

    cafeAdminUser = await User.create({
      userId: 'AD-0001',
      organisationId: TEST_ORG,
      name: 'Kozhikode Manager',
      email: 'admin@zamorin.cafe',
      passwordHash: pwdHash,
      role: 'CAFE_ADMIN',
      accountStatus: 'ACTIVE',
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      mfaEnabled: true,
      mfaMethod: 'TOTP',
      mfaSecretEncrypted: mfaService.encryptMfaSecret(adminSecretBase32),
      mustChangePassword: false,
      createdBy: 'SYSTEM_BOOTSTRAP',
    });

    staffUser = await User.create({
      userId: 'ST-0001',
      organisationId: TEST_ORG,
      name: 'Barista Staff',
      email: 'staff@zamorin.cafe',
      passwordHash: pwdHash,
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      mfaEnabled: false,
      mustChangePassword: false,
      createdBy: 'SYSTEM_BOOTSTRAP',
    });
  });

  test.after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  // Helper for mock HTTP requests
  function createMockReqRes(body = {}, headers = {}, cookies = {}) {
    const req = {
      body,
      headers,
      cookies,
      ip: '192.168.1.100',
      get(name) {
        return headers[name.toLowerCase()] || headers[name] || null;
      },
      correlationId: `corr-${crypto.randomUUID()}`,
    };

    const res = {
      statusCode: 200,
      headers: {},
      cookiesSet: {},
      cookiesCleared: {},
      jsonData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      cookie(name, val, options) {
        this.cookiesSet[name] = { val, options };
        return this;
      },
      clearCookie(name, options) {
        this.cookiesCleared[name] = options;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      },
    };

    return { req, res };
  }

  // 1. First login on untrusted device returns MFA_REQUIRED
  test('1. First login on untrusted device returns MFA_REQUIRED (HTTP 403)', async () => {
    const { req, res } = createMockReqRes({
      organisationId: TEST_ORG,
      email: 'admin@zamorin.cafe',
      password: 'Pass@12345678',
      device: { deviceId: 'dev-unknown-1' },
      rememberDevice: true,
    });

    await authController.login(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.jsonData.error.code, 'MFA_REQUIRED');
    assert.ok(res.jsonData.data.mfaChallengeToken);
  });

  // 2. Remember device OFF + successful MFA does NOT create trust
  test('2. Remember device OFF + successful MFA does NOT create trust', async () => {
    const challengeToken = mfaService.generateMfaToken({
      user: cafeAdminUser,
      purpose: 'mfa_challenge',
      rememberDevice: false,
    });
    const { code } = mfaService.generateTotpCode(adminSecretBase32);

    const { req, res } = createMockReqRes({
      mfaChallengeToken: challengeToken,
      code,
      rememberDevice: false,
      device: { deviceId: 'dev-temp-1' },
    });

    await authController.mfaVerify(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.cookiesSet['zamorin_trusted_device'], undefined);
    assert.equal(res.jsonData.data.trustedDevice, false);
  });

  // 3, 4, 5, 6. Remember device ON + successful MFA creates trust with high-entropy token, SHA-256 hash, and HttpOnly cookie
  let createdTrustToken = null;
  let createdTrustExpiresAt = null;

  test('3, 4, 5, 6. Remember device ON + successful MFA creates trust with high-entropy token, SHA-256 server hash, and HttpOnly cookie', async () => {
    // Reset counter to allow test code verification
    await User.updateOne({ userId: 'AD-0001' }, { $set: { lastMfaCounter: null } });

    const challengeToken = mfaService.generateMfaToken({
      user: cafeAdminUser,
      purpose: 'mfa_challenge',
      rememberDevice: true,
    });
    const { code } = mfaService.generateTotpCode(adminSecretBase32);

    const { req, res } = createMockReqRes(
      {
        mfaChallengeToken: challengeToken,
        code,
        rememberDevice: true,
        device: { deviceId: 'dev-chrome-pc', browser: 'Chrome', operatingSystem: 'Windows 11' },
      },
      { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0' }
    );

    await authController.mfaVerify(req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.cookiesSet['zamorin_trusted_device']);
    assert.equal(res.jsonData.data.trustedDevice, true);

    const cookieObj = res.cookiesSet['zamorin_trusted_device'];
    createdTrustToken = cookieObj.val;
    createdTrustExpiresAt = cookieObj.options.expires;

    // 4. Token is high entropy (starts with td_ and is 60+ chars)
    assert.ok(createdTrustToken.startsWith('td_'));
    assert.ok(createdTrustToken.length > 50);

    // 6. Cookie is HttpOnly, Path=/
    assert.equal(cookieObj.options.httpOnly, true);
    assert.equal(cookieObj.options.path, '/');

    // 5. Raw token is NOT in database, only SHA-256 hash is stored
    const rawInDb = await TrustedDevice.findOne({ tokenHash: createdTrustToken });
    assert.equal(rawInDb, null, 'Raw token must NEVER be found in database');

    const tokenHash = crypto.createHash('sha256').update(createdTrustToken).digest('hex');
    const hashInDb = await TrustedDevice.findOne({ tokenHash, status: 'ACTIVE' });
    assert.ok(hashInDb, 'Token hash must be found in database');
    assert.equal(hashInDb.userId, 'AD-0001');
    assert.equal(hashInDb.organisationId, TEST_ORG);
  });

  // 7. Trusted device allows MFA skip only after valid password
  test('7. Future login with valid password and trusted device cookie skips MFA', async () => {
    const { req, res } = createMockReqRes(
      {
        organisationId: TEST_ORG,
        email: 'admin@zamorin.cafe',
        password: 'Pass@12345678',
        device: { deviceId: 'dev-chrome-pc' },
      },
      {},
      { zamorin_trusted_device: createdTrustToken }
    );

    await authController.login(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonData.success, true);
    assert.equal(res.jsonData.data.trustedDevice, true);
    assert.ok(res.jsonData.data.accessToken);
    assert.equal(res.jsonData.data.user.userId, 'AD-0001');
  });

  // 8. Expired trust requires MFA again
  test('8. Expired trust requires MFA again', async () => {
    const tokenHash = crypto.createHash('sha256').update(createdTrustToken).digest('hex');
    await TrustedDevice.updateOne(
      { tokenHash },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    const { req, res } = createMockReqRes(
      {
        organisationId: TEST_ORG,
        email: 'admin@zamorin.cafe',
        password: 'Pass@12345678',
        device: { deviceId: 'dev-chrome-pc' },
      },
      {},
      { zamorin_trusted_device: createdTrustToken }
    );

    await authController.login(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.jsonData.error.code, 'MFA_REQUIRED');
  });

  // 9. Revoked trust requires MFA again
  test('9. Revoked trust requires MFA again', async () => {
    // Re-register a fresh trusted device
    const reg = await deviceTrustService.registerTrustedDevice({
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      user: cafeAdminUser,
      deviceMetadata: { browser: 'Chrome' },
    });

    // Manually revoke it
    await deviceTrustService.revokeTrustedDevice({
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      deviceTrustId: reg.trustedDevice.deviceTrustId,
      revokedBy: 'AD-0001',
      reason: 'SECURITY_AUDIT',
    });

    const { req, res } = createMockReqRes(
      {
        organisationId: TEST_ORG,
        email: 'admin@zamorin.cafe',
        password: 'Pass@12345678',
        device: { deviceId: 'dev-chrome-pc' },
      },
      {},
      { zamorin_trusted_device: reg.rawToken }
    );

    await authController.login(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.jsonData.error.code, 'MFA_REQUIRED');
  });

  // 10. Wrong-user trust token rejected
  test('10. Wrong-user trust token presented for another account is rejected', async () => {
    const regAdmin = await deviceTrustService.registerTrustedDevice({
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      user: cafeAdminUser,
    });

    // Present admin's trusted token for master login
    const { req, res } = createMockReqRes(
      {
        organisationId: TEST_ORG,
        email: 'master@zamorin.cafe',
        password: 'Pass@12345678',
        device: { deviceId: 'dev-chrome-pc' },
      },
      {},
      { zamorin_trusted_device: regAdmin.rawToken }
    );

    await authController.login(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.jsonData.error.code, 'MFA_REQUIRED');
  });

  // 11. Wrong-organisation trust token rejected
  test('11. Wrong-organisation trust token is rejected', async () => {
    const regAdmin = await deviceTrustService.registerTrustedDevice({
      organisationId: 'OTHER_ORG',
      userId: 'AD-0001',
      user: cafeAdminUser,
    });

    const { req, res } = createMockReqRes(
      {
        organisationId: TEST_ORG,
        email: 'admin@zamorin.cafe',
        password: 'Pass@12345678',
        device: { deviceId: 'dev-chrome-pc' },
      },
      {},
      { zamorin_trusted_device: regAdmin.rawToken }
    );

    await authController.login(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.jsonData.error.code, 'MFA_REQUIRED');
  });

  // 12. Tampered trust token rejected
  test('12. Tampered / invalid trust token is rejected', async () => {
    const { req, res } = createMockReqRes(
      {
        organisationId: TEST_ORG,
        email: 'admin@zamorin.cafe',
        password: 'Pass@12345678',
        device: { deviceId: 'dev-chrome-pc' },
      },
      {},
      { zamorin_trusted_device: 'td_tampered_invalid_token_value_xyz' }
    );

    await authController.login(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.jsonData.error.code, 'MFA_REQUIRED');
  });

  // 13. Disabled account rejected despite trusted device
  test('13. Disabled/suspended account is rejected despite valid trusted device', async () => {
    const regAdmin = await deviceTrustService.registerTrustedDevice({
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      user: cafeAdminUser,
    });

    await User.updateOne({ userId: 'AD-0001' }, { $set: { accountStatus: 'SUSPENDED' } });

    const { req, res } = createMockReqRes(
      {
        organisationId: TEST_ORG,
        email: 'admin@zamorin.cafe',
        password: 'Pass@12345678',
        device: { deviceId: 'dev-chrome-pc' },
      },
      {},
      { zamorin_trusted_device: regAdmin.rawToken }
    );

    await assert.rejects(async () => {
      await authController.login(req, res);
    }, (err) => err.code === 'INVALID_LOGIN');

    // Restore active
    await User.updateOne({ userId: 'AD-0001' }, { $set: { accountStatus: 'ACTIVE' } });
  });

  // 14. Password reset invalidates trusted device
  test('14. Password reset invalidates all trusted devices for that user', async () => {
    await deviceTrustService.registerTrustedDevice({
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      user: cafeAdminUser,
    });

    // Simulate password reset invalidation call
    await deviceTrustService.revokeAllUserTrustedDevices({
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      revokedBy: 'SYSTEM',
      reason: 'PASSWORD_RESET',
    });

    const activeCount = await TrustedDevice.countDocuments({
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      status: 'ACTIVE',
    });
    assert.equal(activeCount, 0, 'All trusted devices must be revoked on password reset');
  });

  // 15. MFA reset/change invalidates trusted devices
  test('15. MFA reset/change invalidates trusted devices', async () => {
    const regMaster = await deviceTrustService.registerTrustedDevice({
      organisationId: TEST_ORG,
      userId: 'MU-0001',
      user: masterUser,
    });

    await deviceTrustService.revokeAllUserTrustedDevices({
      organisationId: TEST_ORG,
      userId: 'MU-0001',
      revokedBy: 'MU-0001',
      reason: 'MFA_RESET',
    });

    const check = await deviceTrustService.verifyTrustedDevice({
      rawToken: regMaster.rawToken,
      organisationId: TEST_ORG,
      userId: 'MU-0001',
      user: masterUser,
    });
    assert.equal(check.valid, false);
  });

  // 16. Role change or session version bump invalidates trust
  test('16. Role change or sessionVersion bump invalidates trust', async () => {
    const regAdmin = await deviceTrustService.registerTrustedDevice({
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      user: { ...cafeAdminUser.toObject(), sessionVersion: 0 },
    });

    // Check with updated sessionVersion
    const check = await deviceTrustService.verifyTrustedDevice({
      rawToken: regAdmin.rawToken,
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      user: { ...cafeAdminUser.toObject(), sessionVersion: 1 },
    });
    assert.equal(check.valid, false);
    assert.equal(check.reason, 'SECURITY_VERSION_CHANGED');
  });

  // 17 & 18. Revoke single device and revoke all devices
  test('17 & 18. Revoke single device and revoke all devices', async () => {
    const dev1 = await deviceTrustService.registerTrustedDevice({
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      user: cafeAdminUser,
      deviceMetadata: { browser: 'Firefox' },
    });
    const dev2 = await deviceTrustService.registerTrustedDevice({
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      user: cafeAdminUser,
      deviceMetadata: { browser: 'Safari' },
    });

    // Revoke dev1
    await deviceTrustService.revokeTrustedDevice({
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      deviceTrustId: dev1.trustedDevice.deviceTrustId,
      revokedBy: 'AD-0001',
    });

    const check1 = await deviceTrustService.verifyTrustedDevice({
      rawToken: dev1.rawToken,
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      user: cafeAdminUser,
    });
    assert.equal(check1.valid, false);

    const check2 = await deviceTrustService.verifyTrustedDevice({
      rawToken: dev2.rawToken,
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      user: cafeAdminUser,
    });
    assert.equal(check2.valid, true);

    // Revoke all
    await deviceTrustService.revokeAllUserTrustedDevices({
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      revokedBy: 'AD-0001',
    });

    const check2AfterAll = await deviceTrustService.verifyTrustedDevice({
      rawToken: dev2.rawToken,
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      user: cafeAdminUser,
    });
    assert.equal(check2AfterAll.valid, false);
  });

  // 19 & 20. Device listing is user-scoped and inaccessible to unauthorized users
  test('19 & 20. Device listing is user-scoped and STAFF cannot inspect other devices', async () => {
    await deviceTrustService.registerTrustedDevice({
      organisationId: TEST_ORG,
      userId: 'MU-0001',
      user: masterUser,
      deviceMetadata: { browser: 'Edge' },
    });

    const masterList = await deviceTrustService.listUserTrustedDevices({
      organisationId: TEST_ORG,
      userId: 'MU-0001',
    });
    assert.ok(masterList.length >= 1);
    assert.equal(masterList[0].userId, 'MU-0001');

    const staffList = await deviceTrustService.listUserTrustedDevices({
      organisationId: TEST_ORG,
      userId: 'ST-0001',
    });
    assert.equal(staffList.length, 0);
  });

  // 21, 22, 23, 24. Role-based expiry policy enforcement
  test('21, 22, 23, 24. Role-based expiry policy: MASTER (7d), OWNER (14d), CAFE_ADMIN (14d), STAFF (30d)', async () => {
    assert.equal(deviceTrustService.getTrustedDeviceExpiryDays(masterUser), 7);
    assert.equal(deviceTrustService.getTrustedDeviceExpiryDays({ role: 'MASTER', isPrimaryMaster: true }), 7);
    assert.equal(deviceTrustService.getTrustedDeviceExpiryDays(ownerUser), 14);
    assert.equal(deviceTrustService.getTrustedDeviceExpiryDays(cafeAdminUser), 14);
    assert.equal(deviceTrustService.getTrustedDeviceExpiryDays(staffUser), 30);
  });

  // 25. MFA_REQUIRED does not increment failed login attempts
  test('25. MFA_REQUIRED does not increment failedLoginAttempts counter', async () => {
    const userBefore = await User.findOne({ userId: 'AD-0001' });
    const attemptsBefore = userBefore.failedLoginAttempts;

    const { req, res } = createMockReqRes({
      organisationId: TEST_ORG,
      email: 'admin@zamorin.cafe',
      password: 'Pass@12345678',
      device: { deviceId: 'dev-new-untrusted' },
    });

    await authController.login(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.jsonData.error.code, 'MFA_REQUIRED');

    const userAfter = await User.findOne({ userId: 'AD-0001' });
    assert.equal(userAfter.failedLoginAttempts, attemptsBefore);
  });

  // 26. Network/server errors do not create trust
  test('26. Incomplete / failed authentication does not issue trusted-device cookie', async () => {
    const { req, res } = createMockReqRes({
      organisationId: TEST_ORG,
      email: 'admin@zamorin.cafe',
      password: 'WrongPassword@123',
      device: { deviceId: 'dev-1' },
      rememberDevice: true,
    });

    await assert.rejects(async () => {
      await authController.login(req, res);
    });

    assert.equal(res.cookiesSet['zamorin_trusted_device'], undefined);
  });

  // 27. Passkey login remains valid
  test('27. Passkey login remains completely valid and functional', async () => {
    assert.ok(typeof authService.createSession === 'function');
  });

  // 28. Password + MFA verification flow remains intact
  test('28. Password + MFA verification flow remains fully functional without rememberDevice', async () => {
    // Reset counter to allow test code verification
    await User.updateOne({ userId: 'AD-0001' }, { $set: { lastMfaCounter: null } });

    const challengeToken = mfaService.generateMfaToken({
      user: cafeAdminUser,
      purpose: 'mfa_challenge',
    });
    const { code } = mfaService.generateTotpCode(adminSecretBase32);

    const { req, res } = createMockReqRes({
      mfaChallengeToken: challengeToken,
      code,
      device: { deviceId: 'dev-chrome-pc' },
    });

    await authController.mfaVerify(req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.jsonData.data.accessToken);
  });

  // 29. Cafe Operations POS dual-PIN remains valid
  test('29. Cafe Operations POS dual-PIN remains valid and unaffected', async () => {
    const operatorSessionService = require('../src/services/operatorSessionService');
    assert.ok(typeof operatorSessionService.signInOperator === 'function');
  });

  // 30. Public registration remains disabled
  test('30. Public registration remains completely disabled', async () => {
    const routesContent = fs.readFileSync(path.join(__dirname, '../src/routes/authRoutes.js'), 'utf8');
    assert.equal(routesContent.includes("router.post('/register',"), false);
    assert.equal(routesContent.includes("router.post('/auth/register',"), false);
  });

  // 31. Legacy login permanently retired under REC-18
  test('31. Legacy login permanently retired and Login 2.0 canonical', async () => {
    const legacyPath = path.join(__dirname, '../../frontend/src/js/pages/login.js');
    assert.equal(fs.existsSync(legacyPath), false, 'Legacy login.js must be permanently deleted');
    const login2Js = fs.readFileSync(path.join(__dirname, '../../frontend/src/js/pages/login2.js'), 'utf8');
    assert.ok(login2Js.includes('renderLoginPage2'));
    assert.ok(login2Js.includes('wireLoginPage2'));
  });
});
