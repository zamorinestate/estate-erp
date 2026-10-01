'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const authService = require('../src/services/authService');
const { User } = require('../src/models/User');
const { authenticate } = require('../src/middleware/authenticate');
const { authorize, canAccessCafe } = require('../src/middleware/authorize');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCAN_ROOTS = [
  'backend/src',
  'backend/test',
  'backend/tests',
  'frontend/src',
  'scripts',
];

const FORBIDDEN_ROLE_TOKENS = [
  ['MASTER', 'NORMAL'].join('_'),
  ['master', 'normal'].join('_'),
];

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (entry.isFile()) files.push(fullPath);
  }

  return files;
}

test('retired non-primary Master role tokens cannot return to active code or audit tooling', () => {
  const violations = [];

  for (const relativeRoot of SCAN_ROOTS) {
    const absoluteRoot = path.join(REPO_ROOT, relativeRoot);
    for (const filePath of walkFiles(absoluteRoot)) {
      if (!/\.(?:js|mjs|cjs|json|html|css|ps1)$/.test(filePath)) continue;

      const source = fs.readFileSync(filePath, 'utf8');
      for (const token of FORBIDDEN_ROLE_TOKENS) {
        if (source.includes(token)) {
          violations.push(
            `${path.relative(REPO_ROOT, filePath)} contains retired role token ${token}`
          );
        }
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Retired non-primary Master role tokens were reintroduced:\n${violations.join('\n')}`
  );
});


test('non-primary Master cannot inherit organisation-wide cafe access', () => {
  assert.equal(
    canAccessCafe(
      {
        role: 'MASTER',
        isPrimaryMaster: false,
        assignedCafeIds: [],
      },
      'ZC-0001'
    ),
    false
  );

  assert.equal(
    canAccessCafe(
      {
        role: 'MASTER',
        isPrimaryMaster: true,
        assignedCafeIds: [],
      },
      'ZC-0001'
    ),
    true
  );
});

test('role-only MASTER authorization denies a non-primary Master claim', async () => {
  const middleware = authorize(['MASTER']);
  let nextCalled = false;
  let statusCode = null;
  let body = null;

  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return payload;
    },
  };

  await middleware(
    {
      auth: {
        userId: 'MU-0099',
        organisationId: 'ZAMORIN',
        role: 'MASTER',
        isPrimaryMaster: false,
      },
    },
    response,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);
  assert.equal(body?.error?.code, 'PERMISSION_DENIED');
});

test('authentication rejects a stale session for a non-primary Master', async (t) => {
  t.mock.method(
    authService,
    'verifyAccessToken',
    async () => ({
      payload: {
        org: 'ZAMORIN',
        sub: 'MU-0099',
        role: 'MASTER',
        usv: 0,
        pv: 0,
      },
      session: {
        sessionId: 'SS-STALE-MASTER',
        roleSnapshot: 'MASTER',
        sessionVersion: 0,
        mfaVerified: true,
        mfaVerifiedAt: new Date(),
        stepUpVerifiedAt: new Date(),
      },
    })
  );

  t.mock.method(
    User,
    'findOne',
    async () => ({
      userId: 'MU-0099',
      email: 'retired-master@zamorin.test',
      name: 'Retired Master Fixture',
      organisationId: 'ZAMORIN',
      role: 'MASTER',
      isPrimaryMaster: false,
      accountStatus: 'ACTIVE',
      archivedAt: null,
      assignedCafeIds: [],
      primaryCafeId: null,
      capabilities: [],
      sessionVersion: 0,
      permissionsVersion: 0,
    })
  );

  let nextCalled = false;
  let statusCode = null;
  let body = null;

  const request = {
    cookies: {},
    query: {},
    get(name) {
      return name === 'authorization'
        ? 'Bearer stale-master-token'
        : null;
    },
  };

  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return payload;
    },
  };

  await authenticate(
    request,
    response,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(statusCode, 401);
  assert.equal(nextCalled, false);
  assert.equal(body?.error?.code, 'MASTER_ACCOUNT_RETIRED');
});


test('canonical password authentication rejects a non-primary Master even with the correct password', async (t) => {
  const password = 'CorrectPassword@123';
  const passwordHash = await authService.hashPassword(password);

  const user = {
    _id: '507f1f77bcf86cd799439011',
    userId: 'MU-0098',
    organisationId: 'ZAMORIN',
    email: 'nonprimary-master@zamorin.test',
    role: 'MASTER',
    isPrimaryMaster: false,
    accountStatus: 'ACTIVE',
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordHash,
    passwordHistoryHashes: [],
    mfaEnabled: false,
    mustChangePassword: false,
    sessionVersion: 0,
    permissionsVersion: 0,
    save: async () => user,
  };

  t.mock.method(
    User,
    'findOne',
    () => ({
      select: async () => user,
    })
  );

  await assert.rejects(
    authService.authenticatePassword({
      organisationId: 'ZAMORIN',
      email: user.email,
      password,
    }),
    /not available for sign-in/i
  );
});

test('session creation rejects a non-primary Master before issuing tokens', async () => {
  await assert.rejects(
    authService.createSession({
      user: {
        userId: 'MU-0097',
        organisationId: 'ZAMORIN',
        role: 'MASTER',
        isPrimaryMaster: false,
      },
      device: {
        deviceId: 'DEV-RETIRED-MASTER',
      },
      createdBy: 'MU-0097',
    }),
    /no longer authorized to create sessions/i
  );
});
