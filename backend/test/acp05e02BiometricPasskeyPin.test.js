'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcrypt');

const { User } = require('../src/models/User');
const { PasskeyCredential } = require('../src/models/PasskeyCredential');
const { PasskeyChallenge } = require('../src/models/PasskeyChallenge');
const passkeyService = require('../src/services/passkeyService');
const authService = require('../src/services/authService');
const authController = require('../src/controllers/authController');

test('ACP-05E-02: BIOMETRIC, PASSKEY & SIX-DIGIT APP PIN REGRESSION & SECURITY SUITE', async (t) => {
  let mongoServer;
  const TEST_ORG = 'ZAMORIN';
  process.env.JWT_ACCESS_SECRET = 'a_very_secure_jwt_access_secret_32bytes_min!';
  process.env.JWT_REFRESH_SECRET = 'a_very_secure_jwt_refresh_secret_32bytes_min!';
  process.env.WEBAUTHN_RP_NAME = 'Zamorin Cafe ERP';
  process.env.WEBAUTHN_RP_ID = 'localhost';
  process.env.WEBAUTHN_ORIGIN = 'http://localhost:3000,http://localhost:5173,https://zamorin-cafe-erp.vercel.app';

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const dummyPassword = await bcrypt.hash('MasterSecret@2026', 10);
    const dummyOperatorPin = await bcrypt.hash('889900', 10);

    // Primary Master
    await User.create({
      organisationId: TEST_ORG,
      userId: 'MU-0001',
      name: 'Primary Master Admin',
      email: 'master@zamorin.com',
      passwordHash: dummyPassword,
      operatorPinHash: dummyOperatorPin,
      role: 'MASTER',
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      isPrimaryMaster: true,
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'SYSTEM_BOOTSTRAP',
      primaryMasterDesignationReason: 'Initial bootstrap',
      createdBy: 'SYSTEM',
    });

    // Cafe Admin / Operator
    await User.create({
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      name: 'Cafe Lead Operator',
      email: 'operator@zamorin.com',
      passwordHash: dummyPassword,
      operatorPinHash: dummyOperatorPin,
      role: 'CAFE_ADMIN',
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      isPrimaryMaster: false,
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      createdBy: 'MU-0001',
    });

    // Suspended / Terminated User
    await User.create({
      organisationId: TEST_ORG,
      userId: 'ST-0099',
      name: 'Terminated Staff',
      email: 'terminated@zamorin.com',
      passwordHash: dummyPassword,
      role: 'STAFF',
      accountStatus: 'SUSPENDED',
      status: 'SUSPENDED',
      isPrimaryMaster: false,
      createdBy: 'MU-0001',
    });
  });

  t.after(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  // 1. Password sign-in baseline
  await t.test('1. Standard password login remains functional and regression-free', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' }).select('+passwordHash');
    assert.ok(user);
    const valid = await bcrypt.compare('MasterSecret@2026', user.passwordHash);
    assert.equal(valid, true, 'Master password verifies successfully');

    const session = await authService.createSession({
      user,
      device: { deviceId: 'DEV-TEST-01', deviceType: 'DESKTOP' },
      network: { ipAddress: '127.0.0.1', userAgent: 'NodeTest' },
      mfaVerified: true,
      createdBy: user.userId,
    });
    assert.ok(session.accessToken, 'Access token generated');
    assert.ok(session.session, 'Session generated');
  });

  // 2. Passkey registration challenges
  await t.test('2. Passkey registration requires authenticated user context', async () => {
    await assert.rejects(
      async () => {
        await passkeyService.generatePasskeyRegistrationOptions({ user: null });
      },
      (err) => {
        assert.ok(err.statusCode === 401 || err.message.includes('Authenticated user context is required'));
        return true;
      }
    );
  });

  await t.test('3. Passkey registration options generated with RP-ID and challenge freshness', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' });
    const { options, challengeId } = await passkeyService.generatePasskeyRegistrationOptions({ user });

    assert.ok(challengeId.startsWith('PKC-REG-'));
    assert.ok(options.challenge);
    assert.equal(options.rp.id, 'localhost');
    assert.equal(options.user.name, 'master@zamorin.com');

    const challengeRecord = await PasskeyChallenge.findOne({ challengeId });
    assert.ok(challengeRecord);
    assert.equal(challengeRecord.status, 'PENDING');
    assert.equal(challengeRecord.userId, user.userId);
  });

  // 4. Passkey authentication options & discoverable credentials
  await t.test('4. Discoverable passkey auth options generated when email omitted', async () => {
    const { options, challengeId } = await passkeyService.generatePasskeyAuthenticationOptions({
      organisationId: TEST_ORG,
      email: '',
    });

    assert.ok(challengeId.startsWith('PKC-AUTH-'));
    assert.ok(options.challenge);
    assert.equal(options.rpId, 'localhost');
    assert.equal(options.allowCredentials, undefined, 'Discoverable credentials allow any registered authenticator');

    const challengeRecord = await PasskeyChallenge.findOne({ challengeId });
    assert.ok(challengeRecord);
    assert.equal(challengeRecord.userId, null, 'Discoverable challenge not bound to a pre-selected user');
  });

  await t.test('5. Filtered passkey auth options populated when user has registered credentials', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' });
    await PasskeyCredential.create({
      credentialId: 'CRED-FIDO-MASTER-01',
      organisationId: TEST_ORG,
      userId: user.userId,
      publicKey: Buffer.from('mock_public_key_data').toString('base64url'),
      counter: 0,
      friendlyName: 'Primary Master Windows Hello',
      status: 'ACTIVE',
    });

    const { options, challengeId } = await passkeyService.generatePasskeyAuthenticationOptions({
      organisationId: TEST_ORG,
      email: 'master@zamorin.com',
    });

    assert.ok(challengeId);
    assert.ok(Array.isArray(options.allowCredentials));
    assert.equal(options.allowCredentials.length, 1);
    assert.equal(options.allowCredentials[0].id, 'CRED-FIDO-MASTER-01');
  });

  // 6. Passkey credential boundaries & security
  await t.test('6. Replay attack: consumed challenge rejected', async () => {
    const challenge = await PasskeyChallenge.create({
      challengeId: 'PKC-AUTH-CONSUMED-TEST',
      challenge: 'consumed_challenge_bytes',
      ceremony: 'AUTHENTICATION',
      organisationId: TEST_ORG,
      status: 'CONSUMED',
      expiresAt: new Date(Date.now() + 60000),
    });

    await assert.rejects(
      async () => {
        await passkeyService.verifyPasskeyAuthentication({
          organisationId: TEST_ORG,
          response: { id: 'CRED-FIDO-MASTER-01' },
          challengeId: challenge.challengeId,
        });
      },
      (err) => {
        assert.ok(err.statusCode === 400);
        return true;
      }
    );
  });

  await t.test('7. Revoked credential is denied authentication', async () => {
    await PasskeyCredential.create({
      credentialId: 'CRED-REVOKED-01',
      organisationId: TEST_ORG,
      userId: 'MU-0001',
      publicKey: Buffer.from('mock_public_key_revoked').toString('base64url'),
      counter: 0,
      status: 'REVOKED',
    });

    const challenge = await PasskeyChallenge.create({
      challengeId: 'PKC-AUTH-REVOKED-TEST',
      challenge: 'valid_fresh_challenge',
      ceremony: 'AUTHENTICATION',
      organisationId: TEST_ORG,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60000),
    });

    await assert.rejects(
      async () => {
        await passkeyService.verifyPasskeyAuthentication({
          organisationId: TEST_ORG,
          response: { id: 'CRED-REVOKED-01' },
          challengeId: challenge.challengeId,
        });
      },
      (err) => {
        assert.ok(err.statusCode === 401 || err.message.includes('revoked'));
        return true;
      }
    );
  });

  await t.test('8. Cross-organisation passkey assertion is rejected', async () => {
    const challenge = await PasskeyChallenge.create({
      challengeId: 'PKC-AUTH-CROSS-ORG-TEST',
      challenge: 'org_isolation_challenge',
      ceremony: 'AUTHENTICATION',
      organisationId: 'OTHER_ORG',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60000),
    });

    await assert.rejects(
      async () => {
        await passkeyService.verifyPasskeyAuthentication({
          organisationId: 'OTHER_ORG',
          response: { id: 'CRED-FIDO-MASTER-01' }, // belongs to ZAMORIN
          challengeId: challenge.challengeId,
        });
      },
      (err) => {
        assert.ok(err.statusCode === 401);
        return true;
      }
    );
  });

  await t.test('9. Terminated account cannot authenticate via passkey', async () => {
    await PasskeyCredential.create({
      credentialId: 'CRED-FIDO-TERMINATED-01',
      organisationId: TEST_ORG,
      userId: 'ST-0099',
      publicKey: Buffer.from('mock_public_key_term').toString('base64url'),
      counter: 0,
      status: 'ACTIVE',
    });

    const challenge = await PasskeyChallenge.create({
      challengeId: 'PKC-AUTH-TERM-TEST',
      challenge: 'term_user_challenge',
      ceremony: 'AUTHENTICATION',
      organisationId: TEST_ORG,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60000),
    });

    await assert.rejects(
      async () => {
        await passkeyService.verifyPasskeyAuthentication({
          organisationId: TEST_ORG,
          response: { id: 'CRED-FIDO-TERMINATED-01' },
          challengeId: challenge.challengeId,
        });
      },
      (err) => {
        assert.ok(err.statusCode === 403 || err.message.includes('not available'));
        return true;
      }
    );
  });

  // 10. Six-digit App PIN creation security
  await t.test('10. PIN creation rejects missing password reauthentication', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' });
    const req = { user, body: { pin: '394821', confirmPin: '394821' } };
    const res = { status: () => ({ json: () => {} }) };

    await assert.rejects(
      async () => {
        await authController.setupAppPin(req, res);
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'PASSWORD_REQUIRED');
        return true;
      }
    );
  });

  await t.test('11. PIN creation rejects confirmation mismatch', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' });
    const req = { user, body: { password: 'MasterSecret@2026', pin: '394821', confirmPin: '394822' } };
    const res = { status: () => ({ json: () => {} }) };

    await assert.rejects(
      async () => {
        await authController.setupAppPin(req, res);
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'PIN_MISMATCH');
        return true;
      }
    );
  });

  await t.test('12. PIN creation rejects trivial or sequential values (111111, 123456)', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' });
    for (const trivial of ['000000', '111111', '123456', '654321', '987654', '12345']) {
      const req = { user, body: { password: 'MasterSecret@2026', pin: trivial, confirmPin: trivial } };
      const res = { status: () => ({ json: () => {} }) };

      await assert.rejects(
        async () => {
          await authController.setupAppPin(req, res);
        },
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    }
  });

  await t.test('13. PIN creation succeeds with strong password reauthentication and stores bcrypt hash', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' });
    let responseData = null;
    const req = {
      user,
      body: { password: 'MasterSecret@2026', pin: '748291', confirmPin: '748291' },
    };
    const res = {
      status: (code) => {
        assert.equal(code, 200);
        return {
          json: (payload) => {
            responseData = payload;
          },
        };
      },
    };

    await authController.setupAppPin(req, res);
    assert.ok(responseData.success);
    assert.equal(responseData.data.appPinEnabled, true);

    const updatedUser = await User.findById(user._id).select('+appPinHash');
    assert.ok(updatedUser.appPinHash, 'appPinHash persisted');
    assert.notEqual(updatedUser.appPinHash, '748291', 'Raw PIN never persisted');
    const validBcrypt = await bcrypt.compare('748291', updatedUser.appPinHash);
    assert.equal(validBcrypt, true, 'Bcrypt hash correctly verifies against entered PIN');
  });

  // 14. PIN status API
  await t.test('14. App PIN status correctly reflects configuration', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' });
    let statusPayload = null;
    const req = { user };
    const res = {
      status: (code) => {
        assert.equal(code, 200);
        return { json: (p) => { statusPayload = p; } };
      },
    };

    await authController.getAppPinStatus(req, res);
    assert.equal(statusPayload.data.appPinEnabled, true);
    assert.equal(statusPayload.data.isLocked, false);
  });

  // 15. PIN Unlock on active session
  await t.test('15. PIN unlock succeeds with valid 6-digit PIN on active session', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' });
    let unlockPayload = null;
    const req = { user, body: { pin: '748291' } };
    const res = {
      status: (code) => {
        assert.equal(code, 200);
        return { json: (p) => { unlockPayload = p; } };
      },
    };

    await authController.unlockWithAppPin(req, res);
    assert.equal(unlockPayload.success, true);
    assert.equal(unlockPayload.data.unlocked, true);
  });

  // 16. PIN Unlock rate-limiting and brute-force lockout
  await t.test('16. Incorrect PIN attempts increment counter and trigger 15-minute lockout at 5 failures', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' });
    const res = { status: () => ({ json: () => {} }) };

    // 4 failed attempts
    for (let i = 1; i <= 4; i++) {
      const req = { user, body: { pin: '999998' } };
      await assert.rejects(
        async () => {
          await authController.unlockWithAppPin(req, res);
        },
        (err) => {
          assert.equal(err.statusCode, 401);
          assert.ok(err.message.includes('attempt(s) remaining'));
          return true;
        }
      );
    }

    const midUser = await User.findById(user._id);
    assert.equal(midUser.appPinFailedAttempts, 4);

    // 5th failed attempt triggers lockout
    const req5 = { user, body: { pin: '999998' } };
    await assert.rejects(
      async () => {
        await authController.unlockWithAppPin(req5, res);
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.ok(err.message.includes('locked for 15 minutes'));
        return true;
      }
    );

    const lockedUser = await User.findById(user._id);
    assert.equal(lockedUser.appPinFailedAttempts, 5);
    assert.ok(lockedUser.appPinLockedUntil > new Date(), 'Locked until timestamp set in future');

    // 6th attempt rejected with 423 APP_PIN_LOCKED even if correct PIN is supplied
    const req6 = { user, body: { pin: '748291' } };
    await assert.rejects(
      async () => {
        await authController.unlockWithAppPin(req6, res);
      },
      (err) => {
        assert.equal(err.statusCode, 423);
        assert.equal(err.code, 'APP_PIN_LOCKED');
        return true;
      }
    );
  });

  // 17. PIN Change requires current verification and resets lockout
  await t.test('17. PIN change with current password updates PIN verifier and clears lockout', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' });
    let changePayload = null;
    const req = {
      user,
      body: {
        password: 'MasterSecret@2026',
        newPin: '582910',
        confirmNewPin: '582910',
      },
    };
    const res = {
      status: (code) => {
        assert.equal(code, 200);
        return { json: (p) => { changePayload = p; } };
      },
    };

    await authController.changeAppPin(req, res);
    assert.equal(changePayload.success, true);

    const updated = await User.findById(user._id).select('+appPinHash');
    assert.equal(updated.appPinFailedAttempts, 0);
    assert.equal(updated.appPinLockedUntil, null);
    assert.equal(await bcrypt.compare('582910', updated.appPinHash), true);

    // Verify unlock now works with new PIN
    let unlockRes = null;
    await authController.unlockWithAppPin({ user, body: { pin: '582910' } }, {
      status: (c) => ({ json: (p) => { unlockRes = p; } }),
    });
    assert.equal(unlockRes.data.unlocked, true);
  });

  // 18. PIN Disable requires password reauthentication
  await t.test('18. Disabling PIN requires account password and clears hash', async () => {
    const user = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' });
    let disablePayload = null;
    const req = {
      user,
      body: { password: 'MasterSecret@2026' },
    };
    const res = {
      status: (code) => {
        assert.equal(code, 200);
        return { json: (p) => { disablePayload = p; } };
      },
    };

    await authController.disableAppPin(req, res);
    assert.equal(disablePayload.data.appPinEnabled, false);

    const disabledUser = await User.findById(user._id).select('+appPinHash');
    assert.equal(disabledUser.appPinEnabled, false);
    assert.equal(disabledUser.appPinHash, null);

    // Attempting unlock when PIN disabled is rejected
    await assert.rejects(
      async () => {
        await authController.unlockWithAppPin({ user, body: { pin: '582910' } }, res);
      },
      (err) => {
        assert.equal(err.code, 'APP_PIN_NOT_CONFIGURED');
        return true;
      }
    );
  });

  // 19. Operator PIN & Shared Terminal Isolation
  await t.test('19. Operator PIN and Personal Application PIN remain strictly isolated', async () => {
    const operator = await User.findOne({ organisationId: TEST_ORG, email: 'operator@zamorin.com' }).select('+operatorPinHash +appPinHash');
    assert.ok(operator.operatorPinHash, 'Operator PIN hash exists');
    assert.equal(operator.appPinHash, null, 'Personal App PIN hash is null by default');
    assert.equal(operator.appPinEnabled, false);

    // Operator PIN matches 889900
    const isOperatorPinValid = await bcrypt.compare('889900', operator.operatorPinHash);
    assert.equal(isOperatorPinValid, true);

    // Unlock with App PIN must NOT accept Operator PIN
    await assert.rejects(
      async () => {
        await authController.unlockWithAppPin({ user: operator, body: { pin: '889900' } }, { status: () => ({ json: () => {} }) });
      },
      (err) => {
        assert.equal(err.code, 'APP_PIN_NOT_CONFIGURED');
        return true;
      }
    );
  });

  // 20. App PIN Login from login screen (unauthenticated context)
  await t.test('20. App PIN login from login screen succeeds for configured user and generates session', async () => {
    // Configure PIN for user
    const pinUser = await User.findOne({ organisationId: TEST_ORG, email: 'master@zamorin.com' });
    const salt = await bcrypt.genSalt(10);
    pinUser.appPinHash = await bcrypt.hash('654321', salt);
    pinUser.appPinEnabled = true;
    pinUser.appPinFailedAttempts = 0;
    pinUser.appPinLockedUntil = null;
    await pinUser.save({ validateModifiedOnly: true });

    let loginPayload = null;
    const req = {
      body: {
        organisationId: TEST_ORG,
        email: 'master@zamorin.com',
        pin: '654321',
      },
      headers: { 'user-agent': 'TestRunner/1.0', 'x-device-id': 'DEV-PIN-TEST' },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    };
    const res = {
      status: (code) => {
        assert.equal(code, 200);
        return { json: (p) => { loginPayload = p; } };
      },
    };

    await authController.loginWithAppPin(req, res);
    assert.equal(loginPayload.success, true);
    assert.ok(loginPayload.data.accessToken);
    assert.equal(loginPayload.data.user.email, 'master@zamorin.com');
  });

  // 21. App PIN Login rejects invalid PIN or unconfigured accounts
  await t.test('21. App PIN login rejects incorrect PIN and non-configured accounts', async () => {
    const res = { status: () => ({ json: () => {} }) };

    // Wrong PIN
    await assert.rejects(
      async () => {
        await authController.loginWithAppPin({
          body: { organisationId: TEST_ORG, email: 'master@zamorin.com', pin: '999999' },
          headers: {},
        }, res);
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'INVALID_APP_PIN');
        return true;
      }
    );

    // Missing email
    await assert.rejects(
      async () => {
        await authController.loginWithAppPin({
          body: { organisationId: TEST_ORG, email: '', pin: '654321' },
          headers: {},
        }, res);
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'EMAIL_REQUIRED');
        return true;
      }
    );
  });
});
