'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_ACCESS_SECRET = 'p2_auth_execution_access_secret_32_chars_minimum_2026';
process.env.JWT_REFRESH_SECRET = 'p2_auth_execution_refresh_secret_32_chars_minimum_2026';
process.env.NODE_ENV = 'test';

const { User } = require('../src/models/User');
const { Session } = require('../src/models/Session');
const { Cafe } = require('../src/models/Cafe');
const authService = require('../src/services/authService');
const cafeService = require('../src/services/cafeService');
const { authenticate } = require('../src/middleware/authenticate');

const ORG = 'ZAMORIN_P2AUTH';
const CAFE_A = 'ZC-9901';
const CAFE_B = 'ZC-9902';

let mongoServer;

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    cookie() {
      return this;
    },
    clearCookie() {
      return this;
    },
  };
}

async function executeAuthenticate(accessToken, preloadedAuth = null) {
  const headers = accessToken ? { authorization: `Bearer ${accessToken}` } : {};
  const request = {
    headers,
    cookies: {},
    auth: preloadedAuth,
    get(name) {
      return headers[String(name || '').toLowerCase()] || undefined;
    },
  };
  const response = mockResponse();
  let nextCalled = false;
  await authenticate(request, response, () => {
    nextCalled = true;
  });
  return { request, response, nextCalled };
}

async function createUser({
  userId,
  email,
  role = 'STAFF',
  isPrimaryMaster = false,
  assignedCafeIds = [CAFE_A],
  primaryCafeId = CAFE_A,
}) {
  const passwordHash = await authService.hashPassword('P2ExecutionBoundaryPassphrase2026!', { minLength: 15 });
  return User.create({
    organisationId: ORG,
    userId,
    name: `P2 Auth ${userId}`,
    email,
    passwordHash,
    role,
    accountStatus: 'ACTIVE',
    status: 'ACTIVE',
    isPrimaryMaster,
    assignedCafeIds,
    primaryCafeId,
    sessionVersion: 1,
    permissionsVersion: 1,
    createdBy: 'SYSTEM',
    ...(isPrimaryMaster ? {
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'SYSTEM_BOOTSTRAP',
      primaryMasterDesignationReason: 'P2 execution-boundary test fixture',
    } : {}),
  });
}

async function createSessionFor(user, suffix) {
  return authService.createSession({
    user,
    device: {
      deviceId: `P2-AUTH-${suffix}`,
      deviceName: 'P2 Auth Execution Boundary',
      deviceType: 'DESKTOP',
    },
  });
}

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  await Cafe.create({
    organisationId: ORG,
    cafeId: CAFE_A,
    name: 'P2 Auth Cafe A',
    displayName: 'P2 Auth Cafe A',
    cafeType: 'STANDARD_CAFE',
    city: 'Test City',
    status: 'ACTIVE',
    createdBy: 'SYSTEM',
  });

  await Cafe.create({
    organisationId: ORG,
    cafeId: CAFE_B,
    name: 'P2 Auth Cafe B',
    displayName: 'P2 Auth Cafe B',
    cafeType: 'STANDARD_CAFE',
    city: 'Test City',
    status: 'ACTIVE',
    createdBy: 'SYSTEM',
  });
});

test.after(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

test('P2-02 baseline: live session authenticates and request authority comes from current user record', async () => {
  const user = await createUser({
    userId: 'ST-9901',
    email: 'p2-auth-baseline@zamorin.test',
  });
  const session = await createSessionFor(user, 'BASELINE');

  const result = await executeAuthenticate(session.accessToken);

  assert.equal(result.nextCalled, true);
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.request.auth.userId, 'ST-9901');
  assert.deepEqual(result.request.auth.assignedCafeIds, [CAFE_A]);
  assert.equal(result.request.auth.role, 'STAFF');
});

test('P2-02 attack: stale access token is rejected after execution-time role mutation', async () => {
  const user = await createUser({
    userId: 'ST-9902',
    email: 'p2-auth-role-change@zamorin.test',
  });
  const session = await createSessionFor(user, 'ROLE');

  await User.updateOne(
    { organisationId: ORG, userId: user.userId },
    { $set: { role: 'CAFE_ADMIN' } }
  );

  const result = await executeAuthenticate(session.accessToken);

  assert.equal(result.nextCalled, false);
  assert.equal(result.response.statusCode, 401);
  assert.equal(result.response.body?.error?.code, 'ROLE_CHANGED');
});

test('P2-02 attack: stale access token is rejected after permissions-version mutation', async () => {
  const user = await createUser({
    userId: 'ST-9903',
    email: 'p2-auth-permissions@zamorin.test',
  });
  const session = await createSessionFor(user, 'PERMS');

  await User.updateOne(
    { organisationId: ORG, userId: user.userId },
    { $inc: { permissionsVersion: 1 } }
  );

  const result = await executeAuthenticate(session.accessToken);

  assert.equal(result.nextCalled, false);
  assert.equal(result.response.statusCode, 401);
  assert.equal(result.response.body?.error?.code, 'SECURITY_VERSION_CHANGED');
});

test('P2-02 attack: disabling an account kills an already-issued token at execution time', async () => {
  const user = await createUser({
    userId: 'ST-9904',
    email: 'p2-auth-disabled@zamorin.test',
  });
  const session = await createSessionFor(user, 'DISABLED');

  await User.updateOne(
    { organisationId: ORG, userId: user.userId },
    { $set: { accountStatus: 'DISABLED', status: 'INACTIVE' } }
  );

  const result = await executeAuthenticate(session.accessToken);

  assert.equal(result.nextCalled, false);
  assert.equal(result.response.statusCode, 401);
  assert.equal(result.response.body?.error?.code, 'USER_UNAVAILABLE');
});

test('P2-02 attack: malformed non-primary MASTER loses authority immediately even with a valid session', async () => {
  const user = await createUser({
    userId: 'MU-9901',
    email: 'p2-auth-master@zamorin.test',
    role: 'MASTER',
    isPrimaryMaster: true,
    assignedCafeIds: [],
    primaryCafeId: null,
  });
  const session = await createSessionFor(user, 'MASTER');

  await User.updateOne(
    { organisationId: ORG, userId: user.userId },
    { $set: { isPrimaryMaster: false } }
  );

  const result = await executeAuthenticate(session.accessToken);

  assert.equal(result.nextCalled, false);
  assert.equal(result.response.statusCode, 401);
  assert.equal(result.response.body?.error?.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
});

test('P2-02 attack: revoked server session invalidates an otherwise valid access token', async () => {
  const user = await createUser({
    userId: 'ST-9905',
    email: 'p2-auth-revoked@zamorin.test',
  });
  const session = await createSessionFor(user, 'REVOKED');

  await Session.updateOne(
    { sessionId: session.session.sessionId },
    {
      $set: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revocationReason: 'P2_ATTACK_TEST',
      },
    }
  );

  const result = await executeAuthenticate(session.accessToken);

  assert.equal(result.nextCalled, false);
  assert.equal(result.response.statusCode, 401);
  assert.equal(result.response.body?.error?.code, 'AUTH_SESSION_REVOKED');
});

test('P2-02 attack: stale token cafe claims cannot restore revoked cafe access', async () => {
  const user = await createUser({
    userId: 'ST-9906',
    email: 'p2-auth-cafe-reassignment@zamorin.test',
    assignedCafeIds: [CAFE_A],
    primaryCafeId: CAFE_A,
  });
  const session = await createSessionFor(user, 'CAFE');

  await User.updateOne(
    { organisationId: ORG, userId: user.userId },
    {
      $set: {
        assignedCafeIds: [CAFE_B],
        primaryCafeId: CAFE_B,
      },
    }
  );

  const result = await executeAuthenticate(session.accessToken);

  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.request.auth.assignedCafeIds, [CAFE_B]);
  assert.equal(result.request.auth.primaryCafeId, CAFE_B);
  assert.equal(result.request.auth.assignedCafeIds.includes(CAFE_A), false);

  await assert.rejects(
    cafeService.verifyCafeAccessBinding({
      ...result.request.auth,
      targetCafeId: CAFE_A,
    }),
    /CAFE_ACCESS_DENIED|not authori[sz]ed/i
  );
});

test('P2-02 attack: preloaded malformed MASTER request context cannot bypass middleware', async () => {
  const result = await executeAuthenticate(null, {
    userId: 'MU-MALFORMED',
    organisationId: ORG,
    role: 'MASTER',
    isPrimaryMaster: false,
  });

  assert.equal(result.nextCalled, false);
  assert.equal(result.response.statusCode, 401);
  assert.equal(result.response.body?.error?.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
});


test('P2-02 attack: preloaded non-MASTER auth context cannot bypass canonical session validation', async () => {
  const result = await executeAuthenticate(null, {
    userId: 'ST-FORGED',
    organisationId: ORG,
    role: 'STAFF',
    isPrimaryMaster: false,
    assignedCafeIds: [CAFE_A],
  });

  assert.equal(result.nextCalled, false);
  assert.equal(result.response.statusCode, 401);
  assert.equal(result.response.body?.error?.code, 'AUTH_CONTEXT_UNVERIFIED');
});
