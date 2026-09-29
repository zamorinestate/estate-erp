'use strict';

/**
 * AUTH ME API — Bounded Bootstrap Contract Tests
 *
 * Tests GET /api/v1/auth/me
 *
 * Verifies:
 *  - 401 when unauthenticated
 *  - 200 for authenticated user (MASTER, OWNER, CAFE_ADMIN, STAFF)
 *  - Safe serialized user object (passwordHash, mfaSecret, recoveryCodeHashes stripped)
 *  - Authentication metadata (role, assignedCafeIds, primaryCafeId, sessionId)
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const { createApp } = require('../src/server');
const { User } = require('../src/models/User');
const { Session } = require('../src/models/Session');
const authService = require('../src/services/authService');

const AUTH_ME_TEST_JWT_SECRET = 'auth_me_test_jwt_secret_2026_at_least_32_chars';
process.env.JWT_ACCESS_SECRET = AUTH_ME_TEST_JWT_SECRET;

function makeUser(overrides = {}) {
  return new User({
    userId: 'MU-0001',
    organisationId: 'ORG-TEST',
    name: 'Test Admin',
    email: 'admin@example.com',
    role: 'MASTER',
    accountStatus: 'ACTIVE',
    primaryCafeId: null,
    assignedCafeIds: [],
    isPrimaryMaster: true,
    passwordHash: 'MUST_NOT_BE_EXPOSED',
    mfaSecretEncrypted: 'MUST_NOT_BE_EXPOSED',
    recoveryCodeHashes: ['MUST_NOT_BE_EXPOSED'],
    employeeSearchTerms: ['test', 'admin'],
    createdBy: 'SYSTEM',
    ...overrides,
  });
}

function makeSession(overrides = {}) {
  return {
    sessionId: 'SS-20260807-0001',
    organisationId: 'ORG-TEST',
    userId: 'MU-0001',
    roleSnapshot: 'MASTER',
    sessionVersion: 0,
    userSessionVersionSnapshot: 1,
    permissionsVersionSnapshot: 1,
    status: 'ACTIVE',
    mfaVerified: true,
    stepUpVerifiedAt: null,
    isActive: () => true,
    ...overrides,
  };
}

function makeQueryMock(result) {
  const promise = Promise.resolve(result);
  promise.lean = async () => result;
  return promise;
}

function request(server, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://127.0.0.1:${server.address().port}`);
    const req = http.request(
      {
        method: options.method || 'GET',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(options.token
            ? { Authorization: `Bearer ${options.token}` }
            : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let body;
          try { body = JSON.parse(raw); } catch { body = raw; }
          resolve({ status: res.statusCode, body });
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('GET /api/v1/auth/me returns 401 when unauthenticated', async (t) => {
  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { status, body } = await request(server, '/api/v1/auth/me');
  assert.equal(status, 401);
  assert.equal(body.error?.code, 'AUTHENTICATION_REQUIRED');
});


test('GET /api/v1/auth/me rejects a forged access-token signature', async (t) => {
  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const forgedToken = jwt.sign(
    {
      type: 'access',
      sid: 'SS-FORGED-0001',
      sub: 'MU-0001',
      org: 'ORG-TEST',
      role: 'MASTER',
      sv: 0,
      usv: 0,
      pv: 0,
    },
    'different_test_secret_that_cannot_validate_the_signature',
    {
      algorithm: 'HS256',
      issuer: 'zamorin-cafe-erp-api',
      audience: 'zamorin-cafe-erp',
      expiresIn: '5m',
    }
  );

  const { status, body } = await request(server, '/api/v1/auth/me', {
    token: forgedToken,
  });

  assert.equal(status, 401);
  assert.equal(body.error?.code, 'AUTH_TOKEN_INVALID');
});

test('GET /api/v1/auth/me denies an otherwise valid live session after the user is deleted or archived', async (t) => {
  const session = makeSession();

  t.mock.method(authService, 'verifyAccessToken', async () => ({
    payload: {
      sub: 'MU-0001',
      org: 'ORG-TEST',
      role: 'MASTER',
      sv: 0,
      usv: 0,
      pv: 0,
      sid: session.sessionId,
    },
    session,
  }));

  t.mock.method(User, 'findOne', () => makeQueryMock(null));

  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { status, body } = await request(server, '/api/v1/auth/me', {
    token: 'valid-session-for-now-unavailable-user',
  });

  assert.equal(status, 401);
  assert.equal(body.error?.code, 'USER_UNAVAILABLE');
});

test('GET /api/v1/auth/me denies a stale or forged privilege claim when the live user role is lower', async (t) => {
  const user = makeUser({
    userId: 'SU-0001',
    role: 'STAFF',
    isPrimaryMaster: false,
    sessionVersion: 0,
    permissionsVersion: 0,
  });
  const session = makeSession({
    userId: 'SU-0001',
    roleSnapshot: 'MASTER',
  });

  t.mock.method(authService, 'verifyAccessToken', async () => ({
    payload: {
      sub: 'SU-0001',
      org: 'ORG-TEST',
      role: 'MASTER',
      sv: 0,
      usv: 0,
      pv: 0,
      sid: session.sessionId,
    },
    session,
  }));
  t.mock.method(User, 'findOne', () => makeQueryMock(user));

  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { status, body } = await request(server, '/api/v1/auth/me', {
    token: 'signed-but-stale-privilege-claim',
  });

  assert.equal(status, 401);
  assert.equal(body.error?.code, 'ROLE_CHANGED');
});

test('GET /api/v1/auth/me returns safe user identity and session metadata for authenticated MASTER', async (t) => {
  const user = makeUser();
  const session = makeSession();

  t.mock.method(authService, 'verifyAccessToken', async () => ({
    payload: {
      sub: 'MU-0001',
      org: 'ORG-TEST',
      role: 'MASTER',
      sv: 0,
      usv: 0,
      pv: 0,
      sid: 'SS-20260807-0001',
    },
    session,
  }));

  t.mock.method(Session, 'findOne', async () => session);
  t.mock.method(User, 'findOne', () => makeQueryMock(user));

  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { status, body } = await request(server, '/api/v1/auth/me', {
    token: 'mock-token',
  });

  assert.equal(status, 200);
  assert.ok(body.success);
  assert.ok(body.data?.user, 'response must contain data.user');
  assert.ok(body.data?.authentication, 'response must contain data.authentication');

  const userData = body.data.user;
  assert.equal(userData.userId, 'MU-0001');
  assert.equal(userData.role, 'MASTER');
  assert.equal(userData.organisationId, 'ORG-TEST');
  assert.equal(userData.isPrimaryMaster, true);

  // Security checks: sensitive internal fields must be stripped by toJSON
  assert.strictEqual(userData.passwordHash, undefined, 'passwordHash must be stripped');
  assert.strictEqual(userData.mfaSecretEncrypted, undefined, 'mfaSecretEncrypted must be stripped');
  assert.strictEqual(userData.recoveryCodeHashes, undefined, 'recoveryCodeHashes must be stripped');
  assert.strictEqual(userData.employeeSearchTerms, undefined, 'employeeSearchTerms must be stripped');

  // Authentication metadata check
  const authData = body.data.authentication;
  assert.equal(authData.userId, 'MU-0001');
  assert.equal(authData.role, 'MASTER');
  assert.equal(authData.sessionId, 'SS-20260807-0001');
});

test('GET /api/v1/auth/me returns 200 with OWNER role preserved', async (t) => {
  const user = makeUser({ userId: 'OU-0001', role: 'OWNER', isPrimaryMaster: false });
  const session = makeSession({ userId: 'OU-0001', roleSnapshot: 'OWNER' });

  t.mock.method(authService, 'verifyAccessToken', async () => ({
    payload: {
      sub: 'OU-0001',
      org: 'ORG-TEST',
      role: 'OWNER',
      sv: 0,
      usv: 0,
      pv: 0,
      sid: 'SS-20260807-0002',
    },
    session,
  }));

  t.mock.method(Session, 'findOne', async () => session);
  t.mock.method(User, 'findOne', () => makeQueryMock(user));

  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { status, body } = await request(server, '/api/v1/auth/me', {
    token: 'owner-token',
  });

  assert.equal(status, 200);
  assert.equal(body.data?.user?.role, 'OWNER');
  assert.equal(body.data?.authentication?.role, 'OWNER');
});

test('GET /api/v1/auth/me returns 200 with CAFE_ADMIN cafe scope preserved', async (t) => {
  const user = makeUser({
    userId: 'AU-0001',
    role: 'CAFE_ADMIN',
    primaryCafeId: 'ZC-0001',
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
    isPrimaryMaster: false,
  });
  const session = makeSession({
    userId: 'AU-0001',
    roleSnapshot: 'CAFE_ADMIN',
    assignedCafeIdsSnapshot: ['ZC-0001', 'ZC-0002'],
  });

  t.mock.method(authService, 'verifyAccessToken', async () => ({
    payload: {
      sub: 'AU-0001',
      org: 'ORG-TEST',
      role: 'CAFE_ADMIN',
      sv: 0,
      usv: 0,
      pv: 0,
      sid: 'SS-20260807-0003',
    },
    session,
  }));

  t.mock.method(Session, 'findOne', async () => session);
  t.mock.method(User, 'findOne', () => makeQueryMock(user));

  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { status, body } = await request(server, '/api/v1/auth/me', {
    token: 'admin-token',
  });

  assert.equal(status, 200);
  assert.equal(body.data?.user?.role, 'CAFE_ADMIN');
  assert.equal(body.data?.user?.primaryCafeId, 'ZC-0001');
  assert.deepEqual(body.data?.user?.assignedCafeIds, ['ZC-0001', 'ZC-0002']);
  assert.deepEqual(body.data?.authentication?.assignedCafeIds, ['ZC-0001', 'ZC-0002']);
});

test('GET /api/v1/auth/me returns 200 with STAFF role preserved', async (t) => {
  const user = makeUser({
    userId: 'SU-0001',
    role: 'STAFF',
    primaryCafeId: 'ZC-0001',
    assignedCafeIds: ['ZC-0001'],
    isPrimaryMaster: false,
  });
  const session = makeSession({
    userId: 'SU-0001',
    roleSnapshot: 'STAFF',
    assignedCafeIdsSnapshot: ['ZC-0001'],
  });

  t.mock.method(authService, 'verifyAccessToken', async () => ({
    payload: {
      sub: 'SU-0001',
      org: 'ORG-TEST',
      role: 'STAFF',
      sv: 0,
      usv: 0,
      pv: 0,
      sid: 'SS-20260807-0004',
    },
    session,
  }));

  t.mock.method(Session, 'findOne', async () => session);
  t.mock.method(User, 'findOne', () => makeQueryMock(user));

  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { status, body } = await request(server, '/api/v1/auth/me', {
    token: 'staff-token',
  });

  assert.equal(status, 200);
  assert.equal(body.data?.user?.role, 'STAFF');
  assert.equal(body.data?.authentication?.role, 'STAFF');
});

test('GET /api/v1/auth/me returns 401 when sessionVersion mismatches user security state', async (t) => {
  const user = makeUser({ sessionVersion: 2 });
  const session = makeSession();

  t.mock.method(authService, 'verifyAccessToken', async () => ({
    payload: {
      sub: 'MU-0001',
      org: 'ORG-TEST',
      role: 'MASTER',
      sv: 0,
      usv: 1, // Stale version in token
      pv: 0,
      sid: 'SS-20260807-0001',
    },
    session,
  }));

  t.mock.method(Session, 'findOne', async () => session);
  t.mock.method(User, 'findOne', () => makeQueryMock(user));

  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { status, body } = await request(server, '/api/v1/auth/me', {
    token: 'stale-token',
  });

  assert.equal(status, 401);
  assert.equal(body.error?.code, 'SECURITY_VERSION_CHANGED');
});

test('GET /api/v1/auth/me returns 401 when session is revoked', async (t) => {
  t.mock.method(authService, 'verifyAccessToken', async () => {
    throw new Error('AUTH_SESSION_REVOKED');
  });

  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { status, body } = await request(server, '/api/v1/auth/me', {
    token: 'revoked-token',
  });

  assert.equal(status, 401);
  assert.equal(body.error?.code, 'AUTH_SESSION_REVOKED');
});
