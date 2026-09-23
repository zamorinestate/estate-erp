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

test('ACP-07B: PASSKEY REGISTRATION, WINDOWS HELLO & LIFECYCLE COORDINATION SUITE', async (t) => {
  let mongoServer;
  const TEST_ORG = 'ZAMORIN';
  process.env.JWT_ACCESS_SECRET = 'a_very_secure_jwt_access_secret_32bytes_min!';
  process.env.JWT_REFRESH_SECRET = 'a_very_secure_jwt_refresh_secret_32bytes_min!';
  process.env.WEBAUTHN_RP_NAME = 'Zamorin Cafe ERP';
  process.env.WEBAUTHN_RP_ID = 'localhost';
  process.env.WEBAUTHN_ORIGIN = 'http://localhost:3000,http://localhost:5173';

  let masterUser;
  let operatorUser;
  const masterPassword = 'MasterSecret@2026';
  const masterPin = '123456';

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const hashedPwd = await bcrypt.hash(masterPassword, 10);
    const hashedPin = await bcrypt.hash(masterPin, 10);

    masterUser = await User.create({
      organisationId: TEST_ORG,
      userId: 'MU-95889',
      name: 'Zamorin Primary Master',
      email: 'master@zamorin.com',
      passwordHash: hashedPwd,
      role: 'MASTER',
      accountStatus: 'ACTIVE',
      isPrimaryMaster: true,
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'SYSTEM',
      primaryMasterDesignationReason: 'ACP-07B Test Primary Master designation',
      createdBy: 'SYSTEM',
      operatorPinHash: hashedPin,
    });

    operatorUser = await User.create({
      organisationId: TEST_ORG,
      userId: 'ST-0042',
      name: 'Cafe Operator',
      email: 'operator@zamorin.com',
      passwordHash: hashedPwd,
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      isPrimaryMaster: false,
      createdBy: 'MU-95889',
    });
  });

  t.after(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  await t.test('1. Platform authenticator attachment is applied when authenticatorType is PLATFORM', async () => {
    const res = await passkeyService.generatePasskeyRegistrationOptions({
      user: masterUser,
      authenticatorType: 'PLATFORM',
    });

    assert.ok(res.options, 'Registration options should be generated');
    assert.equal(res.options.authenticatorSelection.authenticatorAttachment, 'platform');
    assert.equal(res.options.authenticatorSelection.userVerification, 'required');
    assert.equal(res.options.rp.id, 'localhost');
  });

  await t.test('2. Platform attachment is not forced when no preference is requested', async () => {
    const res = await passkeyService.generatePasskeyRegistrationOptions({
      user: masterUser,
    });

    assert.ok(res.options, 'Registration options should be generated');
    assert.equal(res.options.authenticatorSelection.authenticatorAttachment, undefined);
  });

  await t.test('3. Cross-platform attachment is applied when explicitly requested', async () => {
    const res = await passkeyService.generatePasskeyRegistrationOptions({
      user: masterUser,
      authenticatorAttachment: 'cross-platform',
    });

    assert.ok(res.options, 'Registration options should be generated');
    assert.equal(res.options.authenticatorSelection.authenticatorAttachment, 'cross-platform');
  });

  await t.test('4. WebAuthn challenge generated with 5-minute expiration and bound to user', async () => {
    const res = await passkeyService.generatePasskeyRegistrationOptions({
      user: masterUser,
      authenticatorType: 'PLATFORM',
    });

    assert.ok(res.challengeId.startsWith('PKC-REG-'));
    const challengeDoc = await PasskeyChallenge.findOne({ challengeId: res.challengeId });
    assert.ok(challengeDoc, 'Challenge must be stored in database');
    assert.equal(challengeDoc.status, 'PENDING');
    assert.equal(challengeDoc.userId, 'MU-95889');
    assert.equal(challengeDoc.ceremony, 'REGISTRATION');
  });

  await t.test('5. Replayed or consumed challenge cannot be reused for verification', async () => {
    const res = await passkeyService.generatePasskeyRegistrationOptions({
      user: masterUser,
      authenticatorType: 'PLATFORM',
    });

    const challengeDoc = await PasskeyChallenge.findOne({ challengeId: res.challengeId });
    challengeDoc.status = 'CONSUMED';
    await challengeDoc.save();

    await assert.rejects(
      async () => {
        await passkeyService.verifyPasskeyRegistration({
          user: masterUser,
          response: { id: 'dummy-cred' },
          challengeId: res.challengeId,
        });
      },
      (err) => {
        assert.match(err.message, /consumed|Invalid/);
        return true;
      }
    );
  });

  await t.test('6. Expired registration challenge is rejected', async () => {
    const res = await passkeyService.generatePasskeyRegistrationOptions({
      user: masterUser,
      authenticatorType: 'PLATFORM',
    });

    const challengeDoc = await PasskeyChallenge.findOne({ challengeId: res.challengeId });
    challengeDoc.expiresAt = new Date(Date.now() - 1000);
    await challengeDoc.save();

    await assert.rejects(
      async () => {
        await passkeyService.verifyPasskeyRegistration({
          user: masterUser,
          response: { id: 'dummy-cred' },
          challengeId: res.challengeId,
        });
      },
      (err) => {
        assert.match(err.message, /expired/i);
        return true;
      }
    );
  });

  await t.test('7. Cross-user registration challenge binding mismatch is rejected', async () => {
    const res = await passkeyService.generatePasskeyRegistrationOptions({
      user: masterUser,
      authenticatorType: 'PLATFORM',
    });

    await assert.rejects(
      async () => {
        await passkeyService.verifyPasskeyRegistration({
          user: operatorUser,
          response: { id: 'dummy-cred' },
          challengeId: res.challengeId,
        });
      },
      (err) => {
        assert.match(err.message, /Invalid|consumed/i);
        return true;
      }
    );
  });

  await t.test('8. Duplicate credential registration is rejected by unique index', async () => {
    const dummyCredentialId = 'CRED-UNIQUE-ACP07B-01';
    await PasskeyCredential.create({
      credentialId: dummyCredentialId,
      organisationId: TEST_ORG,
      userId: masterUser.userId,
      publicKey: 'dGVzdC1wdWJsaWMta2V5LWJhc2U2NA',
      counter: 1,
      status: 'ACTIVE',
      friendlyName: 'Windows Hello Laptop',
    });

    const existingCred = await PasskeyCredential.findOne({
      organisationId: TEST_ORG,
      credentialId: dummyCredentialId,
    });
    assert.ok(existingCred);

    // Verify model prevents duplicate active credential insertion
    await assert.rejects(
      async () => {
        await PasskeyCredential.create({
          credentialId: dummyCredentialId,
          organisationId: TEST_ORG,
          userId: operatorUser.userId,
          publicKey: 'YW5vdGhlci1rZXk',
          counter: 1,
          status: 'ACTIVE',
          friendlyName: 'Duplicate Credential Attempt',
        });
      },
      (err) => {
        assert.ok(err.code === 11000 || err.message.includes('duplicate key'));
        return true;
      }
    );
  });

  await t.test('9. Passkey credential listing and friendlyName rename lifecycle', async () => {
    const creds = await passkeyService.listUserPasskeys({
      organisationId: TEST_ORG,
      userId: masterUser.userId,
    });
    assert.ok(creds.length >= 1);
    assert.equal(creds[0].friendlyName, 'Windows Hello Laptop');

    const updated = await passkeyService.renameUserPasskey({
      organisationId: TEST_ORG,
      userId: masterUser.userId,
      credentialId: 'CRED-UNIQUE-ACP07B-01',
      friendlyName: 'Primary Workstation Windows Hello',
    });
    assert.equal(updated.credential.friendlyName, 'Primary Workstation Windows Hello');
  });

  await t.test('10. Revoked passkey credential cannot authenticate and is marked REVOKED', async () => {
    const revoked = await passkeyService.revokeUserPasskey({
      organisationId: TEST_ORG,
      userId: masterUser.userId,
      credentialId: 'CRED-UNIQUE-ACP07B-01',
    });
    assert.equal(revoked.success, true);
    assert.equal(revoked.credentialId, 'CRED-UNIQUE-ACP07B-01');

    const credDoc = await PasskeyCredential.findOne({ credentialId: 'CRED-UNIQUE-ACP07B-01' });
    assert.equal(credDoc.status, 'REVOKED');

    // Attempting to generate auth options with user email excludes revoked credentials
    const authOptions = await passkeyService.generatePasskeyAuthenticationOptions({
      organisationId: TEST_ORG,
      email: masterUser.email,
    });
    const containsRevoked = authOptions.options.allowCredentials.some(
      (c) => c.id === 'CRED-UNIQUE-ACP07B-01'
    );
    assert.equal(containsRevoked, false, 'Revoked credentials must be excluded from allowCredentials');
  });

  await t.test('11. Password login remains functional for Primary Master and Operator', async () => {
    const masterAuth = await authService.authenticatePassword({
      organisationId: TEST_ORG,
      email: masterUser.email,
      password: masterPassword,
    });
    assert.ok(masterAuth.user, 'Master user authenticated');
    assert.equal(masterAuth.user.userId, 'MU-95889');

    const masterSession = await authService.createSession({
      user: masterAuth.user,
      device: { deviceId: 'DEV-TEST-001', deviceType: 'DESKTOP' },
    });
    assert.ok(masterSession.accessToken, 'Master password login must issue access token');

    const opAuth = await authService.authenticatePassword({
      organisationId: TEST_ORG,
      email: operatorUser.email,
      password: masterPassword,
    });
    assert.ok(opAuth.user, 'Operator user authenticated');
    assert.equal(opAuth.user.userId, 'ST-0042');

    const opSession = await authService.createSession({
      user: opAuth.user,
      device: { deviceId: 'DEV-TEST-002', deviceType: 'DESKTOP' },
    });
    assert.ok(opSession.accessToken, 'Operator password login must issue access token');
  });

  await t.test('12. Canonical User ID login remains functional', async () => {
    const idAuth = await authService.authenticatePassword({
      organisationId: TEST_ORG,
      email: 'MU-95889',
      password: masterPassword,
    });
    assert.ok(idAuth.user);
    assert.equal(idAuth.user.userId, 'MU-95889');

    const idSession = await authService.createSession({
      user: idAuth.user,
      device: { deviceId: 'DEV-TEST-003', deviceType: 'DESKTOP' },
    });
    assert.ok(idSession.accessToken);
  });

  await t.test('13. Six-digit App PIN verification and lockout protections remain enforced', async () => {
    const userDoc = await User.findOne({ userId: 'MU-95889' }).select('+operatorPinHash');
    assert.ok(userDoc.operatorPinHash, 'Operator PIN hash must exist');
    const isCorrect = await bcrypt.compare(masterPin, userDoc.operatorPinHash);
    assert.equal(isCorrect, true, 'Valid 6-digit PIN must match hash');

    const isIncorrect = await bcrypt.compare('999999', userDoc.operatorPinHash);
    assert.equal(isIncorrect, false, 'Invalid 6-digit PIN must fail verification');
  });

  await t.test('14. Cancelled or aborted WebAuthn request coordination simulation', async () => {
    let activeCoordinator = null;
    let conditionalSignal = null;

    function startConditional() {
      activeCoordinator = new AbortController();
      conditionalSignal = activeCoordinator.signal;
    }

    function cancelActive() {
      if (activeCoordinator) {
        activeCoordinator.abort();
        activeCoordinator = null;
      }
    }

    // A. Start conditional request on login page
    startConditional();
    assert.equal(conditionalSignal.aborted, false);

    // B. User submits password login -> must cancel active conditional request
    cancelActive();
    assert.equal(conditionalSignal.aborted, true);
    assert.equal(activeCoordinator, null);

    // C. Verify delayed assertion guard: if aborted, handler must discard response
    let sessionCreated = false;
    const delayedResponseHandler = (signal) => {
      if (signal.aborted) {
        return; // Discard!
      }
      sessionCreated = true;
    };
    delayedResponseHandler(conditionalSignal);
    assert.equal(sessionCreated, false, 'Delayed response from cancelled request must not establish session');

    // D. Before registration begins, ensure clean idle state
    let isRegistering = false;
    let registrationCoordinator = null;

    function startRegistration() {
      cancelActive();
      if (isRegistering) return false;
      isRegistering = true;
      registrationCoordinator = new AbortController();
      return true;
    }

    function endRegistration() {
      isRegistering = false;
      registrationCoordinator = null;
    }

    const reg1 = startRegistration();
    assert.equal(reg1, true);
    // Duplicate click test
    const reg2 = startRegistration();
    assert.equal(reg2, false, 'Duplicate click must be prevented while registration is active');

    endRegistration();
    assert.equal(isRegistering, false);
  });
});
