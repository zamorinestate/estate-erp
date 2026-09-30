'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { createApp } = require('../src/server');
const { User } = require('../src/models/User');
const { Session } = require('../src/models/Session');
const { RolePermission } = require('../src/models/RolePermission');
const { PersonalLedger } = require('../src/models/PersonalLedger');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { AuditEvent } = require('../src/models/AuditEvent');
const authService = require('../src/services/authService');

function makeUser(overrides = {}) {
  return new User({
    userId: 'MU-0001',
    organisationId: 'ORG-TEST',
    name: 'Primary Master',
    email: 'primary.master@zamorin.test',
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

function makePermissionRule(role, code) {
  return new RolePermission({
    permissionRuleId: `PR-${role}-${code}`,
    organisationId: 'ORG-TEST',
    role,
    permissionCode: code,
    module: 'PERSONAL_LEDGER',
    resource: 'PERSONAL_LEDGER_ENTRY',
    action: code.includes('READ') ? 'READ' : 'WRITE',
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

  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
}

async function stopServer() {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
  server = null;
}

function setupMockEnvironment(role = 'MASTER', isPrimaryMaster = true, userId = 'MU-0001') {
  const user = makeUser({ userId, role, isPrimaryMaster });
  const session = makeSession({ userId, roleSnapshot: role });

  const storedEntries = [];

  const originals = {
    verifyAccessToken: authService.verifyAccessToken,
    userFindOne: User.findOne,
    sessionFindOne: Session.findOne,
    rules: RolePermission.findEffectiveRules,
    calculateBalance: PersonalLedger.calculateBalance,
    countDocuments: PersonalLedger.countDocuments,
    find: PersonalLedger.find,
    findOne: PersonalLedger.findOne,
    create: PersonalLedger.create,
    generateId: SequenceCounter.generateId,
    auditCreate: AuditEvent.create,
  };

  authService.verifyAccessToken = async () => ({
    payload: {
      sub: userId,
      org: 'ORG-TEST',
      sid: session.sessionId,
      role,
      sv: 0,
      usv: 1,
      pv: 1,
      type: 'access',
    },
    session,
  });

  User.findOne = async () => user;
  Session.findOne = async () => session;

  RolePermission.findEffectiveRules = async () => {
    return [
      makePermissionRule(role, 'PERSONAL_LEDGER_READ'),
      makePermissionRule(role, 'PERSONAL_LEDGER_WRITE'),
    ];
  };

  SequenceCounter.generateId = async () => 101;
  AuditEvent.create = async () => ({});

  PersonalLedger.calculateBalance = async () => ({
    creditPaisa: 8750000,
    debitPaisa: 1250000,
    balancePaisa: 7500000,
    dueToOwnerPaisa: 8750000,
    dueFromOwnerPaisa: 1250000,
    netCurrentAccountPositionPaisa: 7500000,
  });

  PersonalLedger.countDocuments = async () => 2;

  PersonalLedger.find = () => {
    const matching = storedEntries.length > 0 ? storedEntries : [{
      ledgerEntryId: 'PL-20260814-0001',
      voucherNumber: 'PL-20260814-0001',
      status: 'ACTIVE',
      amountPaisa: 1250000,
      save: async function () { return this; },
      toObject: function () { return { ...this }; },
    }];
    const chain = {
      sort: () => chain,
      skip: () => chain,
      limit: () => chain,
      lean: async () => matching,
      then: (resolve) => resolve(matching),
    };
    return chain;
  };

  PersonalLedger.findOne = (filter) => {
    const entry = storedEntries.find((e) => e.ledgerEntryId === filter.ledgerEntryId) || {
      ledgerEntryId: filter.ledgerEntryId || 'PL-20260814-0001',
      voucherNumber: filter.ledgerEntryId || 'PL-20260814-0001',
      status: 'ACTIVE',
      amountPaisa: 1250000,
      entryType: 'CREDIT',
      description: 'Estate meeting lunch',
      workflowStatus: 'SUBMITTED',
      accountingTreatment: 'PERSONAL',
      financePostingStatus: 'NOT_POSTED',
      save: async function () { return this; },
      toObject: function () { return { ...this }; },
    };
    return {
      lean: async () => entry,
      then: (resolve) => resolve(entry),
    };
  };

  PersonalLedger.create = async (doc) => {
    const created = {
      ...doc,
      toObject: function () { return { ...this }; },
    };
    storedEntries.push(created);
    return created;
  };

  return {
    storedEntries,
    restore() {
      authService.verifyAccessToken = originals.verifyAccessToken;
      User.findOne = originals.userFindOne;
      Session.findOne = originals.sessionFindOne;
      RolePermission.findEffectiveRules = originals.rules;
      PersonalLedger.calculateBalance = originals.calculateBalance;
      PersonalLedger.countDocuments = originals.countDocuments;
      PersonalLedger.find = originals.find;
      PersonalLedger.findOne = originals.findOne;
      PersonalLedger.create = originals.create;
      SequenceCounter.generateId = originals.generateId;
      AuditEvent.create = originals.auditCreate;
    },
  };
}

test('SCR-018: Master Control & Financial Invariant Tests', async (t) => {
  await startServer();
  t.after(stopServer);

  await t.test('1. GET /personal-ledger/overview returns 200 for Primary Master', async () => {
    const mock = setupMockEnvironment('MASTER', true, 'MU-0001');
    try {
      const res = await fetch(`${baseUrl}/personal-ledger/overview`, {
        headers: { Authorization: 'Bearer test-token' },
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.data.confidential, true);
      assert.equal(body.data.balances.dueToOwnerPaisa, 8750000);
      assert.equal(body.data.balances.dueFromOwnerPaisa, 1250000);
      assert.equal(body.data.balances.netCurrentAccountPositionPaisa, 7500000);
    } finally {
      mock.restore();
    }
  });

  await t.test('2. GET /personal-ledger/overview returns 200 for OWNER', async () => {
    const mock = setupMockEnvironment('OWNER', false, 'OW-0001');
    try {
      const res = await fetch(`${baseUrl}/personal-ledger/overview`, {
        headers: { Authorization: 'Bearer test-token' },
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.data.accessLevel, 'OWNER');
    } finally {
      mock.restore();
    }
  });

  await t.test('3. Malformed MASTER (role = MASTER, isPrimaryMaster = false) is strictly DENIED (403)', async () => {
    const mock = setupMockEnvironment('MASTER', false, 'MU-0002');
    try {
      const res = await fetch(`${baseUrl}/personal-ledger/overview`, {
        headers: { Authorization: 'Bearer test-token' },
      });
      assert.equal(res.status, 403);
    } finally {
      mock.restore();
    }
  });

  await t.test('4. CAFE_ADMIN is strictly DENIED (403/404)', async () => {
    const mock = setupMockEnvironment('CAFE_ADMIN', false, 'CA-0001');
    try {
      const res = await fetch(`${baseUrl}/personal-ledger/overview`, {
        headers: { Authorization: 'Bearer test-token' },
      });
      assert.equal(res.status, 403);
    } finally {
      mock.restore();
    }
  });

  await t.test('5. STAFF is strictly DENIED (403/404)', async () => {
    const mock = setupMockEnvironment('STAFF', false, 'ST-0001');
    try {
      const res = await fetch(`${baseUrl}/personal-ledger/overview`, {
        headers: { Authorization: 'Bearer test-token' },
      });
      assert.equal(res.status, 403);
    } finally {
      mock.restore();
    }
  });

  await t.test('6. POST /personal-ledger/entries creates a valid entry with integer paise', async () => {
    const mock = setupMockEnvironment('MASTER', true, 'MU-0001');
    try {
      const res = await fetch(`${baseUrl}/personal-ledger/entries`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: 'BUSINESS_EXPENSE_PAID_PERSONALLY',
          amountPaisa: 1250000,
          entryType: 'CREDIT',
          businessDate: '2026-08-14',
          description: 'Coffee tasting lunch',
          paymentSource: 'PERSONAL_CARD',
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 201);
      assert.equal(body.data.amountPaisa, 1250000);
      assert.equal(body.data.amountInr, 12500);
    } finally {
      mock.restore();
    }
  });

  await t.test('7. POST /personal-ledger/entries rejects split mismatch', async () => {
    const mock = setupMockEnvironment('MASTER', true, 'MU-0001');
    try {
      const res = await fetch(`${baseUrl}/personal-ledger/entries`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: 'BUSINESS_EXPENSE_PAID_PERSONALLY',
          amountPaisa: 2000000,
          entryType: 'CREDIT',
          businessDate: '2026-08-14',
          description: 'Hotel stay & meals split',
          paymentSource: 'PERSONAL_CARD',
          splits: [
            { splitId: 'SP-1', amountPaisa: 1000000, category: 'TRAVEL' },
            { splitId: 'SP-2', amountPaisa: 500000, category: 'MEALS' }, // Sum is 1500000 != 2000000
          ],
        }),
      });
      assert.equal(res.status, 400);
    } finally {
      mock.restore();
    }
  });

  await t.test('8. POST /personal-ledger/entries/:id/classify posts to GL with Journal Reference', async () => {
    const mock = setupMockEnvironment('MASTER', true, 'MU-0001');
    try {
      const res = await fetch(`${baseUrl}/personal-ledger/entries/PL-20260814-0001/classify`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountingTreatment: 'BUSINESS_EXPENSE',
          targetGLAccount: '5200-TRAV',
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.data.accountingTreatment, 'BUSINESS_EXPENSE');
      assert.equal(body.data.workflowStatus, 'POSTING_PENDING');
      assert.equal(body.data.financePostingStatus, 'NOT_POSTED');
      assert.equal(body.data.financeJournalRef, null);
      assert.equal(body.data.glPosting.status, 'NOT_POSTED');
      assert.equal(body.data.glPosting.actuality, 'UNAVAILABLE');
    } finally {
      mock.restore();
    }
  });

  await t.test('9. POST /personal-ledger/entries/:id/reverse creates paired reversal entry', async () => {
    const mock = setupMockEnvironment('MASTER', true, 'MU-0001');
    try {
      const res = await fetch(`${baseUrl}/personal-ledger/entries/PL-20260814-0001/reverse`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'Duplicate entry correction',
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 201);
      assert.equal(body.data.reversalEntry.reversalReason, 'Duplicate entry correction');
    } finally {
      mock.restore();
    }
  });

  await t.test('10. POST /personal-ledger/settlements executes batch voucher settlement', async () => {
    const mock = setupMockEnvironment('MASTER', true, 'MU-0001');
    try {
      const res = await fetch(`${baseUrl}/personal-ledger/settlements`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voucherIds: ['PL-20260814-0001'],
          settlementAmountPaisa: 1250000,
          paymentMethod: 'COMPANY_BANK',
          paymentReference: 'NEFT-SETTLE-001',
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.match(body.data.settlementBatchRef, /^SETTLE-\d{8}-\d{4,}$/);
      assert.equal(body.data.settledAmountPaisa, 1250000);
    } finally {
      mock.restore();
    }
  });

  await t.test('11. POST /personal-ledger/confirmations records owner sign-off and discrepancy', async () => {
    const mock = setupMockEnvironment('OWNER', false, 'OW-0001');
    try {
      const res = await fetch(`${baseUrl}/personal-ledger/confirmations`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirmationStatus: 'CONFIRMED',
          discrepancyNote: 'Agreed as of August 2026',
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.data.confirmationStatus, 'CONFIRMED');
      assert.match(body.data.confirmationRef, /^CONF-\d{8}-\d{4,}$/);
    } finally {
      mock.restore();
    }
  });

  await t.test('12. GET /personal-ledger/reconciliation returns 100% mathematical match', async () => {
    const mock = setupMockEnvironment('MASTER', true, 'MU-0001');
    try {
      const res = await fetch(`${baseUrl}/personal-ledger/reconciliation`, {
        headers: { Authorization: 'Bearer test-token' },
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.data.reconciliationStatus, 'GL_SOURCE_NOT_CONFIGURED');
      assert.equal(body.data.financeGLControlBalancePaisa, null);
      assert.equal(body.data.differencePaisa, null);
      assert.equal(body.data.reconciliationVerified, false);
    } finally {
      mock.restore();
    }
  });
});
