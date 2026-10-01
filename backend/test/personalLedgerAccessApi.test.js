'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { createApp } = require('../src/server');
const { User } = require('../src/models/User');
const { Session } = require('../src/models/Session');
const { RolePermission } = require('../src/models/RolePermission');
const { PersonalLedger } = require('../src/models/PersonalLedger');
const authService = require('../src/services/authService');

function makeUser(overrides = {}) {
  return new User({
    userId: 'MU-0001',
    organisationId: 'ORG-TEST',
    name: 'Test User',
    email: 'test@example.com',
    role: 'MASTER',
    accountStatus: 'ACTIVE',
    primaryCafeId: null,
    assignedCafeIds: [],
    isPrimaryMaster: true,
    primaryMasterDesignatedAt: new Date(),
    primaryMasterDesignatedBy: 'MU-0001',
    primaryMasterDesignationReason: 'Initial setup',
    roleHistory: [],
    cafeAssignmentHistory: [],
    sessionVersion: 1,
    permissionsVersion: 1,
    passwordHash: 'hash',
    createdBy: 'SYSTEM',
    ...overrides,
  });
}

function makeSession(overrides = {}) {
  return {
    sessionId: 'SS-20260811-0001',
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

function makePermissionRule(role) {
  return new RolePermission({
    permissionRuleId: `PR-${role}-LEDGER`,
    organisationId: 'ORG-TEST',
    role,
    permissionCode: 'PERSONAL_LEDGER_READ',
    module: 'PERSONAL_LEDGER',
    resource: 'PERSONAL_LEDGER_ENTRY',
    action: 'READ',
    effect: 'ALLOW',
    scope: 'ORGANISATION',
    requiresMfa: true,
    requiresStepUpAuthentication: false,
    requiresReason: false,
    requiresAuditEvent: false,
    requiresReauthentication: false,
    policyVersion: 1,
    createdBy: 'SYSTEM',
  });
}

let server;
let baseUrl;

async function startServer() {
  const app = createApp({
    allowedOrigins: ['*'],
    production: false,
  });

  server = http.createServer(app);
  await new Promise((resolve) =>
    server.listen(0, '127.0.0.1', resolve)
  );

  baseUrl =
    `http://127.0.0.1:${server.address().port}/api/v1`;
}

async function stopServer() {
  if (!server) return;

  await new Promise((resolve) =>
    server.close(resolve)
  );

  server = null;
}

function setupMocks({
  role,
  userId,
  isPrimaryMaster = false,
} = {}) {
  const actor = makeUser({
    userId,
    email: `${userId.toLowerCase()}@example.com`,
    role,
    isPrimaryMaster,
    primaryMasterDesignatedAt:
      isPrimaryMaster ? new Date() : null,
    primaryMasterDesignatedBy:
      isPrimaryMaster ? 'MU-0001' : null,
    primaryMasterDesignationReason:
      isPrimaryMaster ? 'Initial setup' : null,
  });

  const session = makeSession({
    userId,
    roleSnapshot: role,
  });

  const originals = {
    verifyAccessToken: authService.verifyAccessToken,
    userFindOne: User.findOne,
    sessionFindOne: Session.findOne,
    rules: RolePermission.findEffectiveRules,
    calculateBalance: PersonalLedger.calculateBalance,
  };

  const observed = {
    permissionFilter: null,
    balanceCalled: false,
    balanceArgs: null,
  };

  authService.verifyAccessToken = async () => ({
    payload: {
      sub: userId,
      org: 'ORG-TEST',
      role,
      sv: 0,
      usv: 1,
      pv: 1,
      type: 'access',
    },
    session,
  });

  User.findOne = async (filter) =>
    filter.userId === userId &&
    filter.organisationId === 'ORG-TEST'
      ? actor
      : null;

  Session.findOne = async () => session;

  RolePermission.findEffectiveRules =
    async (filter) => {
      observed.permissionFilter = { ...filter };
      return [makePermissionRule(role)];
    };

  PersonalLedger.calculateBalance =
    async (args) => {
      observed.balanceCalled = true;
      observed.balanceArgs = { ...args };

      return {
        totalCreditPaisa: 1000,
        totalDebitPaisa: 250,
        balancePaisa: 750,
        dueToOwnerPaisa: 1000,
        dueFromOwnerPaisa: 250,
        netCurrentAccountPositionPaisa: 750,
      };
    };

  return {
    observed,
    restore() {
      authService.verifyAccessToken =
        originals.verifyAccessToken;
      User.findOne = originals.userFindOne;
      Session.findOne = originals.sessionFindOne;
      RolePermission.findEffectiveRules =
        originals.rules;
      PersonalLedger.calculateBalance =
        originals.calculateBalance;
    },
  };
}

async function getBalance(token) {
  return fetch(
    `${baseUrl}/personal-ledger/balance`,
    token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined
  );
}

test(
  'SCR-018: Personal Ledger & Owner Account Access Governance',
  async (t) => {
    await startServer();
    t.after(stopServer);

    await t.test(
      'unauthenticated request returns 401',
      async () => {
        const response = await getBalance();
        const body = await response.json();

        assert.equal(response.status, 401);
        assert.equal(
          body.error.code,
          'AUTHENTICATION_REQUIRED'
        );
      }
    );

    // Primary Master (allowed)
    await t.test(
      'PRIMARY MASTER (MASTER + isPrimaryMaster: true) may read Personal Ledger balance',
      async () => {
        const allowed = { role: 'MASTER', userId: 'MU-0001', isPrimaryMaster: true };
        const { observed, restore } = setupMocks(allowed);

        try {
          const response = await getBalance('valid-primary-master-token');
          const body = await response.json();

          assert.equal(response.status, 200);
          assert.ok(body.data);
          assert.equal(
            observed.permissionFilter.permissionCode,
            'PERSONAL_LEDGER_READ'
          );
          assert.equal(observed.balanceCalled, true);
        } finally {
          restore();
        }
      }
    );

    // Owner (allowed)
    await t.test(
      'OWNER may read own Personal Ledger & Owner Account balance',
      async () => {
        const allowed = { role: 'OWNER', userId: 'OW-0001', isPrimaryMaster: false };
        const { observed, restore } = setupMocks(allowed);

        try {
          const response = await getBalance('valid-owner-token');
          const body = await response.json();

          assert.equal(response.status, 200);
          assert.ok(body.data);
          assert.equal(observed.balanceCalled, true);
        } finally {
          restore();
        }
      }
    );

    // Malformed MASTER (strictly denied)
    await t.test(
      'MALFORMED MASTER (MASTER + isPrimaryMaster: false) is strictly DENIED with 403',
      async () => {
        const denied = { role: 'MASTER', userId: 'MU-0002', isPrimaryMaster: false };
        const { observed, restore } = setupMocks(denied);

        try {
          const response = await getBalance('valid-malformed-master-token');
          const body = await response.json();

          assert.equal(response.status, 403);
          assert.equal(body.error.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
          assert.equal(observed.balanceCalled, false);
        } finally {
          restore();
        }
      }
    );

    // CAFE_ADMIN and STAFF (strictly denied)
    for (const denied of [
      { role: 'CAFE_ADMIN', userId: 'CA-0001' },
      { role: 'STAFF', userId: 'ST-0001' },
    ]) {
      await t.test(
        `${denied.role} is blocked with 403 before permission or ledger query`,
        async () => {
          const { observed, restore } = setupMocks(denied);

          try {
            const response = await getBalance(`valid-${denied.role.toLowerCase()}-token`);
            const body = await response.json();

            assert.equal(response.status, 403);
            assert.equal(
              ['ABSOLUTE_ROLE_RESTRICTION', 'ROLE_NOT_ALLOWED'].includes(body.error.code),
              true
            );
            assert.equal(observed.balanceCalled, false);
          } finally {
            restore();
          }
        }
      );
    }
  }
);
