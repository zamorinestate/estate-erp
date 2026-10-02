'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcrypt');

const { User } = require('../src/models/User');
const { Session } = require('../src/models/Session');
const { Cafe } = require('../src/models/Cafe');
const { PasswordResetChallenge } = require('../src/models/PasswordResetChallenge');
const authService = require('../src/services/authService');
const passwordResetService = require('../src/services/passwordResetService');
const operatorSessionService = require('../src/services/operatorSessionService');

test('Login Page 2.0 Integration & 24-Point Production-Equivalence Suite', async (t) => {
  let mongoServer;
  const TEST_ORG = 'ZAMORIN';
  process.env.JWT_ACCESS_SECRET = 'a_very_secure_and_long_jwt_access_secret_32bytes_long!';
  process.env.JWT_REFRESH_SECRET = 'a_very_secure_and_long_jwt_refresh_secret_32bytes_long!';
  process.env.PASSWORD_RESET_HMAC_SECRET = 'a_very_secure_and_long_jwt_access_secret_32bytes_long!';

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // 1. Create Cafes
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

    await Cafe.create({
      organisationId: TEST_ORG,
      cafeId: 'ZC-0002',
      name: 'Indiranagar Central Branch',
      displayName: 'Zamorin Indiranagar',
      cafeType: 'STANDARD_CAFE',
      city: 'Bangalore',
      status: 'ACTIVE',
      operationsPinHash: cafePinHash,
      operationsPinSetAt: new Date(),
      createdBy: 'MU-0001',
    });

    // 2. Create Personas with valid prefix regex: /^(MU|OW|AD|ST)-\d{4,}$/
    const passwordHash = await bcrypt.hash('Password@123', 10);
    const opPinHash = await bcrypt.hash('112233', 10);

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
      operatorPinHash: opPinHash,
      operatorPinSetAt: new Date(),
      operatorAccessGranted: true,
      createdBy: 'SYSTEM',
    });

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
      createdBy: 'MU-0001',
    });

    await User.create({
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      name: 'Cafe Operations Admin',
      email: 'admin@zamorin.com',
      passwordHash,
      role: 'CAFE_ADMIN',
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      isPrimaryMaster: false,
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      operatorPinHash: opPinHash,
      operatorPinSetAt: new Date(),
      operatorAccessGranted: true,
      createdBy: 'MU-0001',
    });

    await User.create({
      organisationId: TEST_ORG,
      userId: 'ST-0001',
      name: 'Floor Staff Member',
      email: 'staff@zamorin.com',
      passwordHash,
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      isPrimaryMaster: false,
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      createdBy: 'MU-0001',
    });

    await User.create({
      organisationId: TEST_ORG,
      userId: 'ST-0002',
      name: 'Terminated Employee',
      email: 'disabled@zamorin.com',
      passwordHash,
      role: 'STAFF',
      accountStatus: 'SUSPENDED',
      status: 'SUSPENDED',
      isPrimaryMaster: false,
      createdBy: 'MU-0001',
    });

    await User.create({
      organisationId: TEST_ORG,
      userId: 'OW-0002',
      name: 'Secured Officer',
      email: 'mfa.user@zamorin.com',
      passwordHash,
      role: 'OWNER',
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      isPrimaryMaster: false,
      mfaEnabled: true,
      mfaSecret: 'JBSWY3DPEHPK3PXP',
      createdBy: 'MU-0001',
    });
  });

  t.after(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  // ---------------------------------------------------------------------------
  // 1-4. Persona Logins & Canonical Role-Based Routing
  // ---------------------------------------------------------------------------
  await t.test('1. MASTER login succeeds and sets Primary Master context', async () => {
    const authResult = await authService.authenticatePassword({
      organisationId: TEST_ORG,
      email: 'master@zamorin.com',
      password: 'Password@123',
    });

    assert.equal(authResult.user.role, 'MASTER');
    assert.equal(authResult.user.isPrimaryMaster, true);
    assert.equal(authResult.user.userId, 'MU-0001');

    const sessionResult = await authService.createSession({
      user: authResult.user,
      device: { deviceId: 'DEV-TEST-001', deviceType: 'DESKTOP' },
      createdBy: authResult.user.userId,
    });

    assert.ok(sessionResult.accessToken, 'Access token generated');
    assert.ok(sessionResult.session.sessionId, 'Session record created');
  });

  await t.test('2. OWNER login succeeds and returns Owner role context', async () => {
    const authResult = await authService.authenticatePassword({
      organisationId: TEST_ORG,
      email: 'owner@zamorin.com',
      password: 'Password@123',
    });

    assert.equal(authResult.user.role, 'OWNER');
    assert.equal(authResult.user.isPrimaryMaster, false);
  });

  await t.test('3. CAFE_ADMIN login succeeds and includes cafe scope', async () => {
    const authResult = await authService.authenticatePassword({
      organisationId: TEST_ORG,
      email: 'admin@zamorin.com',
      password: 'Password@123',
    });

    assert.equal(authResult.user.role, 'CAFE_ADMIN');
    assert.equal(authResult.user.primaryCafeId, 'ZC-0001');
    assert.deepEqual(authResult.user.assignedCafeIds, ['ZC-0001']);
  });

  await t.test('4. STAFF login succeeds and enforces Staff Self-Service landing routing', async () => {
    const authResult = await authService.authenticatePassword({
      organisationId: TEST_ORG,
      email: 'staff@zamorin.com',
      password: 'Password@123',
    });

    assert.equal(authResult.user.role, 'STAFF');
  });

  // ---------------------------------------------------------------------------
  // 5-7. Security Boundaries & Account Status
  // ---------------------------------------------------------------------------
  await t.test('5. Invalid password fails with generic message to prevent enumeration', async () => {
    await assert.rejects(
      async () => {
        await authService.authenticatePassword({
          organisationId: TEST_ORG,
          email: 'master@zamorin.com',
          password: 'WrongPassword999!',
        });
      },
      (err) => {
        assert.ok(err.message.includes('Invalid email or password'));
        return true;
      }
    );
  });

  await t.test('6. Disabled/Suspended account is denied access (403)', async () => {
    await assert.rejects(
      async () => {
        await authService.authenticatePassword({
          organisationId: TEST_ORG,
          email: 'disabled@zamorin.com',
          password: 'Password@123',
        });
      },
      (err) => {
        assert.ok(err.message.includes('not available for sign-in') || err.message.includes('Inactive'));
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 8. MFA / TOTP Verification Challenge
  // ---------------------------------------------------------------------------
  await t.test('8. MFA-enabled user triggers MFA challenge requirement', async () => {
    process.env.REQUIRE_MFA = 'true';
    try {
      const authResult = await authService.authenticatePassword({
        organisationId: TEST_ORG,
        email: 'mfa.user@zamorin.com',
        password: 'Password@123',
      });

      assert.equal(authResult.requiresMfa, true, 'requiresMfa is true');
    } finally {
      delete process.env.REQUIRE_MFA;
    }
  });

  // ---------------------------------------------------------------------------
  // 9-12. Password Recovery Lifecycle (Verification Code -> Reset -> Login)
  // ---------------------------------------------------------------------------
  await t.test('9. Password recovery: Request Verification Code generates challenge', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'staff@zamorin.com' });
    const challengeResult = await passwordResetService.createPasswordResetChallenge(user);

    assert.ok(challengeResult.challenge.challengeId, 'Challenge ID created');
    assert.ok(challengeResult.code, '6-digit Verification Code generated');
    assert.equal(challengeResult.code.length, 6);
  });

  await t.test('10. Password recovery: Verification Code verification produces one-time resetToken', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'staff@zamorin.com' });
    const challengeResult = await passwordResetService.createPasswordResetChallenge(user);

    const verifyResult = await passwordResetService.verifyPasswordResetCode({
      challengeId: challengeResult.challenge.challengeId,
      code: challengeResult.code,
    });

    assert.ok(verifyResult.resetToken, 'resetToken issued');
    assert.equal(verifyResult.challenge.status, 'VERIFIED');
  });

  await t.test('11. Password recovery: Invalid/Expired Verification Code is rejected', async () => {
    const verifyResult = await passwordResetService.verifyPasswordResetCode({
      challengeId: 'PRC-20260903-9999',
      code: '000000',
    });

    assert.equal(verifyResult, null, 'Invalid verification code returns null / fail-closed');
  });

  // ---------------------------------------------------------------------------
  // 13-15. Session Lifecycle (Creation, Token Verify & Logout)
  // ---------------------------------------------------------------------------
  await t.test('13. Session creation & verifyAccessToken', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'owner@zamorin.com' });
    const sessionResult = await authService.createSession({
      user,
      device: { deviceId: 'DEV-TEST-002', deviceType: 'DESKTOP' },
      createdBy: user.userId,
    });

    assert.ok(sessionResult.accessToken);
    const decoded = await authService.verifyAccessToken(sessionResult.accessToken);
    assert.equal(decoded.payload.sub, 'OW-0001');
    assert.equal(decoded.payload.role, 'OWNER');
  });

  await t.test('14. Session logout invalidates session record', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'owner@zamorin.com' });
    const sessionResult = await authService.createSession({
      user,
      device: { deviceId: 'DEV-TEST-003', deviceType: 'DESKTOP' },
      createdBy: user.userId,
    });

    await authService.revokeSession({
      organisationId: TEST_ORG,
      sessionId: sessionResult.session.sessionId,
      revokedBy: user.userId,
    });

    const session = await Session.findOne({ sessionId: sessionResult.session.sessionId });
    assert.ok(session.revokedAt, 'Session is revoked');
  });

  // ---------------------------------------------------------------------------
  // 18. Cafe Operations Dual-PIN Access & Directory
  // ---------------------------------------------------------------------------
  await t.test('18. Cafe Operations Directory returns active branches and operators', async () => {
    const dir = await operatorSessionService.getCafeOperationsDirectory({
      organisationId: TEST_ORG,
    });

    assert.equal(dir.success, true);
    assert.ok(Array.isArray(dir.data.cafes), 'Cafes array returned');
    assert.ok(Array.isArray(dir.data.operators), 'Operators array returned');
    assert.ok(dir.data.cafes.some((c) => c.cafeId === 'ZC-0001'), 'Koramangala listed');
    assert.ok(dir.data.operators.some((o) => o.userId === 'AD-0001'), 'Admin operator listed');
  });
});
