'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const bcrypt = require('bcryptjs');

const { createApp } = require('../src/server');
const { User } = require('../src/models/User');
const { Session } = require('../src/models/Session');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const mfaService = require('../src/services/mfaService');

const TEST_MFA_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_JWT_SECRET =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

function makeQueryMock(result) {
  const promise = Promise.resolve(result);
  promise.select = async () => result;
  return promise;
}

function request(
  server,
  path,
  body,
  { method = 'POST', headers = {} } = {}
) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method,
        hostname: '127.0.0.1',
        port: server.address().port,
        path,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            body: raw ? JSON.parse(raw) : {},
            headers: res.headers,
          });
        });
      }
    );

    req.on('error', reject);
    if (
      body !== undefined &&
      body !== null &&
      method !== 'GET'
    ) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function startServer(t) {
  const app = createApp({
    allowedOrigins: ['*'],
    production: false,
  });

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  t.after(() => new Promise((resolve) => server.close(resolve)));
  return server;
}

function makeUser(overrides = {}) {
  const user = new User({
    userId: 'MU-0001',
    organisationId: 'ORG-TEST',
    name: 'Test Master',
    email: 'master@example.test',
    role: 'MASTER',
    accountStatus: 'ACTIVE',
    assignedCafeIds: [],
    isPrimaryMaster: false,
    passwordHash: 'unused-password-hash',
    mustChangePassword: false,
    sessionVersion: 0,
    permissionsVersion: 0,
    mfaEnabled: false,
    mfaMethod: 'NONE',
    recoveryCodeHashes: [],
    lastMfaCounter: null,
    createdBy: 'SYSTEM',
    ...overrides,
  });

  user.save = async () => user;
  return user;
}

function mockSessionCreation(t) {
  let next = 1;
  let lastSession = null;

  t.mock.method(
    SequenceCounter,
    'generateId',
    async () => `SS-20260808-${String(next++).padStart(4, '0')}`
  );

  t.mock.method(Session, 'create', async (data) => {
    const session = {
      ...data,
      accessTokenExpiresAt: data.accessTokenExpiresAt,
      refreshTokenExpiresAt: data.refreshTokenExpiresAt,
      isActive() {
        return this.status === 'ACTIVE';
      },
      async save() {
        return this;
      },
      toJSON() {
        return {
          sessionId: this.sessionId,
          organisationId: this.organisationId,
          userId: this.userId,
          roleSnapshot: this.roleSnapshot,
          status: this.status,
          sessionVersion: this.sessionVersion,
          mfaVerified: this.mfaVerified,
          mfaVerifiedAt: this.mfaVerifiedAt,
          mfaReenrollmentRequired:
            Boolean(this.mfaReenrollmentRequired),
          device: this.device,
          issuedAt: this.issuedAt,
          lastActivityAt: this.lastActivityAt,
          refreshTokenExpiresAt: this.refreshTokenExpiresAt,
          absoluteExpiresAt: this.absoluteExpiresAt,
        };
      },
    };

    lastSession = session;
    return session;
  });

  return () => lastSession;
}

test.beforeEach(() => {
  process.env.MFA_ENCRYPTION_KEY = TEST_MFA_KEY;
  process.env.JWT_ACCESS_SECRET = TEST_JWT_SECRET;
});

test('POST /auth/mfa/setup requires an MFA setup token', async (t) => {
  const server = await startServer(t);
  const response = await request(
    server,
    '/api/v1/auth/mfa/setup',
    {}
  );

  assert.equal(response.status, 400);
  assert.equal(
    response.body.error?.code,
    'MFA_SETUP_TOKEN_REQUIRED'
  );
});

test('POST /auth/mfa/setup stores an encrypted pending secret and returns setup material', async (t) => {
  const user = makeUser();
  const token = mfaService.generateMfaToken({
    user,
    purpose: 'mfa_setup',
  });

  t.mock.method(
    User,
    'findOne',
    () => makeQueryMock(user)
  );

  const server = await startServer(t);
  const response = await request(
    server,
    '/api/v1/auth/mfa/setup',
    { mfaSetupToken: token }
  );

  assert.equal(response.status, 200);
  assert.ok(response.body.data?.manualEntrySecret);
  assert.match(
    response.body.data?.otpauthUri || '',
    /^otpauth:\/\/totp\//
  );
  assert.equal(response.body.data?.mfaSetupToken, token);
  assert.ok(user.pendingMfaSecretEncrypted);
  assert.notEqual(
    user.pendingMfaSecretEncrypted,
    response.body.data.manualEntrySecret
  );
  assert.equal(
    mfaService.decryptMfaSecret(
      user.pendingMfaSecretEncrypted
    ),
    response.body.data.manualEntrySecret
  );
});

test('POST /auth/mfa/confirm enables MFA, persists the replay counter, returns recovery codes, and creates an MFA-verified session', async (t) => {
  const user = makeUser({
    pendingMfaSecretEncrypted:
      mfaService.encryptMfaSecret(TEST_TOTP_SECRET),
  });

  const token = mfaService.generateMfaToken({
    user,
    purpose: 'mfa_setup',
  });

  const code =
    mfaService.generateTotpCode(TEST_TOTP_SECRET).code;

  t.mock.method(
    User,
    'findOne',
    () => makeQueryMock(user)
  );
  mockSessionCreation(t);

  const server = await startServer(t);
  const response = await request(
    server,
    '/api/v1/auth/mfa/confirm',
    {
      mfaSetupToken: token,
      code,
      device: {
        deviceId: 'DEV-CONFIRM',
        deviceName: 'Office Laptop',
        deviceType: 'LAPTOP',
      },
    }
  );

  assert.equal(response.status, 200);
  assert.equal(user.mfaEnabled, true);
  assert.equal(user.mfaMethod, 'TOTP');
  assert.equal(user.pendingMfaSecretEncrypted, null);
  assert.ok(Number.isInteger(user.lastMfaCounter));
  assert.equal(user.recoveryCodeHashes.length, 10);
  assert.equal(response.body.data?.recoveryCodes?.length, 10);
  assert.equal(response.body.data?.session?.mfaVerified, true);
  assert.equal(
    response.body.data?.session?.mfaReenrollmentRequired,
    false
  );
  assert.equal(
    response.body.data?.session?.device?.deviceId,
    'DEV-CONFIRM'
  );
});

test('POST /auth/mfa/verify accepts fresh TOTP, persists its counter, and creates an MFA-verified session', async (t) => {
  const user = makeUser({
    mfaEnabled: true,
    mfaMethod: 'TOTP',
    mfaSecretEncrypted:
      mfaService.encryptMfaSecret(TEST_TOTP_SECRET),
  });

  const token = mfaService.generateMfaToken({
    user,
    purpose: 'mfa_challenge',
  });

  const code =
    mfaService.generateTotpCode(TEST_TOTP_SECRET).code;

  t.mock.method(
    User,
    'findOne',
    () => makeQueryMock(user)
  );
  mockSessionCreation(t);

  const server = await startServer(t);
  const response = await request(
    server,
    '/api/v1/auth/mfa/verify',
    {
      mfaChallengeToken: token,
      code,
      device: {
        deviceId: 'DEV-VERIFY',
      },
    }
  );

  assert.equal(response.status, 200);
  assert.ok(Number.isInteger(user.lastMfaCounter));
  assert.equal(response.body.data?.session?.mfaVerified, true);
  assert.equal(
    response.body.data?.session?.device?.deviceId,
    'DEV-VERIFY'
  );
});

test('recovery-code login is quarantined until MFA reenrollment completes and the code is single-use', async (t) => {
  const recoveryCode = 'ABCDEF-123456';
  const currentPassword =
    'Correct-Horse-Battery-Staple-2026!';
  const hashedRecoveryCode =
    mfaService.hashRecoveryCode(recoveryCode);

  const user = makeUser({
    passwordHash:
      await bcrypt.hash(currentPassword, 4),
    mfaEnabled: true,
    mfaMethod: 'TOTP',
    mfaSecretEncrypted:
      mfaService.encryptMfaSecret(TEST_TOTP_SECRET),
    recoveryCodeHashes: [hashedRecoveryCode],
  });

  const token = mfaService.generateMfaToken({
    user,
    purpose: 'mfa_challenge',
  });

  t.mock.method(
    User,
    'findOne',
    () => makeQueryMock(user)
  );

  const getLastSession =
    mockSessionCreation(t);

  t.mock.method(
    Session,
    'findOne',
    async () => getLastSession()
  );

  t.mock.method(Session, 'find', () => ({
    select: async () => [],
  }));

  const server = await startServer(t);

  let response = await request(
    server,
    '/api/v1/auth/mfa/verify',
    {
      mfaChallengeToken: token,
      recoveryCode,
      rememberDevice: true,
      device: {
        deviceId: 'DEV-RECOVERY',
      },
    }
  );

  assert.equal(response.status, 200);
  assert.equal(user.recoveryCodeHashes.length, 0);
  assert.equal(response.body.data?.mfaReenrollmentRequired, true);
  assert.equal(
    response.body.data?.session?.mfaReenrollmentRequired,
    true
  );
  assert.ok(response.body.data?.mfaReenrollmentAuthorizationToken);
  assert.equal(response.body.data?.trustedDevice, false);
  assert.ok(response.body.data?.recoverySecurityReset);
  assert.equal(
    response.body.data?.recoverySecurityReset?.revokedSessionCount,
    0
  );

  const accessToken =
    response.body.data?.accessToken;
  const reenrollmentAuthorizationToken =
    response.body.data?.mfaReenrollmentAuthorizationToken;

  const reenrollPayload = mfaService.verifyMfaToken(
    reenrollmentAuthorizationToken,
    'mfa_reenroll_authorized'
  );
  assert.equal(reenrollPayload.sub, user.userId);
  assert.equal(reenrollPayload.org, user.organisationId);

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
  };

  response = await request(
    server,
    '/api/v1/auth/me',
    null,
    {
      method: 'GET',
      headers: authHeaders,
    }
  );

  assert.equal(response.status, 403);
  assert.equal(
    response.body.error?.code,
    'MFA_REENROLLMENT_REQUIRED'
  );

  response = await request(
    server,
    '/api/v1/auth/mfa/re-enroll/start',
    {
      mfaReenrollmentAuthorizationToken:
        reenrollmentAuthorizationToken,
    },
    { headers: authHeaders }
  );

  assert.equal(response.status, 200);
  assert.ok(response.body.data?.manualEntrySecret);
  assert.ok(response.body.data?.mfaReenrollmentToken);

  const replacementSecret =
    response.body.data.manualEntrySecret;
  const replacementCode =
    mfaService.generateTotpCode(
      replacementSecret
    ).code;
  const mfaReenrollmentToken =
    response.body.data.mfaReenrollmentToken;

  response = await request(
    server,
    '/api/v1/auth/mfa/re-enroll/confirm',
    {
      mfaReenrollmentToken,
      password: currentPassword,
      code: replacementCode,
    },
    { headers: authHeaders }
  );

  assert.equal(response.status, 200);
  assert.equal(
    getLastSession()?.mfaReenrollmentRequired,
    false
  );
  assert.equal(
    response.body.data?.recoveryCodes?.length,
    10
  );

  response = await request(
    server,
    '/api/v1/auth/me',
    null,
    {
      method: 'GET',
      headers: authHeaders,
    }
  );

  assert.equal(response.status, 200);
  assert.equal(
    response.body.data?.user?.userId,
    user.userId
  );

  response = await request(
    server,
    '/api/v1/auth/mfa/verify',
    {
      mfaChallengeToken: token,
      recoveryCode,
      device: {
        deviceId: 'DEV-RECOVERY',
      },
    }
  );

  assert.equal(response.status, 400);
  assert.equal(
    response.body.error?.code,
    'INVALID_RECOVERY_CODE'
  );
});
