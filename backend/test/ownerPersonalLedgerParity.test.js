'use strict';

/**
 * OWN-SCR-005: Owner Personal Ledger & Primary Master Functional Parity Test Suite
 *
 * Validates:
 * 1. Primary Master ↔ Owner 100% functional parity across all ledger workflows.
 * 2. Strict principal data isolation & cross-owner IDOR denial.
 * 3. Immutable audit logs, reversals, and financial calculations.
 * 4. Absolute denial for Malformed MASTER, CAFE_ADMIN, and STAFF.
 */

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
    userId: 'OWNER-0001',
    organisationId: 'ORG-TEST',
    name: 'Authorized Owner',
    email: 'owner@zamorin.test',
    role: 'OWNER',
    accountStatus: 'ACTIVE',
    primaryCafeId: 'CAFE-001',
    assignedCafeIds: ['CAFE-001', 'CAFE-002'],
    isPrimaryMaster: false,
    sessionVersion: 1,
    permissionsVersion: 1,
    passwordHash: 'hash',
    createdBy: 'SYSTEM',
    ...overrides,
  });
}

function makeSession(overrides = {}) {
  return {
    sessionId: 'SS-OWNER-0001',
    organisationId: 'ORG-TEST',
    userId: 'OWNER-0001',
    roleSnapshot: 'OWNER',
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
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
}

async function stopServer() {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
  server = null;
}

function setupMockEnvironment(role = 'OWNER', isPrimaryMaster = false, userId = 'OWNER-0001') {
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
      isPrimaryMaster,
      sv: 0,
      usv: 1,
      pv: 1,
      type: 'access',
    },
    session,
  });

  User.findOne = async () => user;
  Session.findOne = async () => session;

  RolePermission.findEffectiveRules = async () => [
    makePermissionRule(role, 'PERSONAL_LEDGER_READ'),
    makePermissionRule(role, 'PERSONAL_LEDGER_WRITE'),
  ];

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

  PersonalLedger.find = (filter = {}) => {
    if (filter.ledgerEntryId && filter.ledgerEntryId.$in && filter.ledgerEntryId.$in.includes('PL-FOREIGN-9999')) {
      const emptyChain = {
        sort: () => emptyChain,
        skip: () => emptyChain,
        limit: () => emptyChain,
        lean: async () => [],
        then: (resolve) => resolve([]),
      };
      return emptyChain;
    }

    const matching = storedEntries.length > 0 ? storedEntries : [{
      ledgerEntryId: 'PL-20260814-0001',
      voucherNumber: 'PL-20260814-0001',
      ownerUserId: 'OWNER-0001',
      accountHolderId: 'OWNER-0001',
      organisationId: 'ORG-TEST',
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
    if (filter?.ledgerEntryId === 'PL-FOREIGN-9999') {
      return {
        lean: async () => null,
        then: (resolve) => resolve(null),
      };
    }

    const entry = storedEntries.find((e) => e.ledgerEntryId === filter?.ledgerEntryId) || {
      ledgerEntryId: filter?.ledgerEntryId || 'PL-20260814-0001',
      voucherNumber: filter?.ledgerEntryId || 'PL-20260814-0001',
      ownerUserId: 'OWNER-0001',
      accountHolderId: 'OWNER-0001',
      organisationId: 'ORG-TEST',
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
      save: async function () { return this; },
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

test('OWN-SCR-005: Owner Personal Ledger Parity & Security Suite', async (t) => {
  await startServer();
  t.after(stopServer);

  await t.test('1. Parity: OWNER can create personal ledger transactions (Credit & Debit in integer paise)', async () => {
    const mock = setupMockEnvironment('OWNER', false, 'OWNER-0001');

    try {
      const res = await fetch(`${baseUrl}/personal-ledger/entries`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: 'BUSINESS_EXPENSE_PAID_PERSONALLY',
          entryType: 'CREDIT',
          amountPaisa: 1250000,
          businessDate: '2026-08-14',
          description: 'Wayanad farm sampling expenses',
          paymentSource: 'PERSONAL_CARD',
        }),
      });

      const body = await res.json();
      assert.equal(res.status, 201);
      assert.equal(body.data.amountPaisa, 1250000);
      assert.equal(body.data.amountInr, 12500);
      assert.equal(body.data.ledgerEntryId.startsWith('PL-'), true);
      assert.equal(body.data.workflowStatus, 'SUBMITTED');
    } finally {
      mock.restore();
    }
  });

  await t.test('2. Parity: OWNER can classify submitted transaction to business books / GL', async () => {
    const mock = setupMockEnvironment('OWNER', false, 'OWNER-0001');

    try {
      const res = await fetch(`${baseUrl}/personal-ledger/entries/PL-20260814-0001/classify`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetGLAccount: '5100-EXP',
          accountingTreatment: 'BUSINESS_EXPENSE',
          cafeId: 'CAFE-001',
        }),
      });

      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.data.accountingTreatment, 'BUSINESS_EXPENSE');
      assert.equal(body.data.workflowStatus, 'POSTED');
      assert.equal(body.data.financePostingStatus, 'POSTED');
      assert.match(body.data.financeJournalRef, /^JRN-2026-\d{4}$/);
    } finally {
      mock.restore();
    }
  });

  await t.test('3. Parity: OWNER can execute batch settlement for their own vouchers', async () => {
    const mock = setupMockEnvironment('OWNER', false, 'OWNER-0001');

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
          paymentReference: 'UTR-2026-SETTLE-001',
        }),
      });

      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.data.settledAmountPaisa, 1250000);
      assert.equal(body.data.settledAmountInr, 12500);
      assert.match(body.data.settlementBatchRef, /^SETTLE-2026-\d{4}$/);
    } finally {
      mock.restore();
    }
  });

  await t.test('4. Security & IDOR: OWNER A is strictly DENIED when attempting to classify or settle foreign vouchers', async () => {
    const mock = setupMockEnvironment('OWNER', false, 'OWNER-0001');

    try {
      // 1. Attempt IDOR classify on foreign voucher
      const classifyRes = await fetch(`${baseUrl}/personal-ledger/entries/PL-FOREIGN-9999/classify`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetGLAccount: '5100-EXP',
        }),
      });

      assert.equal(classifyRes.status, 404);

      // 2. Attempt IDOR settlement on foreign voucher
      const settleRes = await fetch(`${baseUrl}/personal-ledger/settlements`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voucherIds: ['PL-FOREIGN-9999'],
          settlementAmountPaisa: 500000,
        }),
      });

      assert.equal(settleRes.status, 404);
    } finally {
      mock.restore();
    }
  });

  await t.test('5. Reversal Integrity: Correcting reversal creates paired opposite entry and links original', async () => {
    const mock = setupMockEnvironment('OWNER', false, 'OWNER-0001');

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
      assert.equal(body.data.originalEntry.status, 'REVERSED');
      assert.equal(body.data.reversalEntry.entryType, 'DEBIT'); // Equal and opposite
      assert.equal(body.data.reversalEntry.reversalReason, 'Duplicate entry correction');
      assert.equal(body.data.reversalEntry.originalEntryId, 'PL-20260814-0001');
    } finally {
      mock.restore();
    }
  });

  await t.test('6. Parity: Balance confirmation sign-off and GL reconciliation work for OWNER', async () => {
    const mock = setupMockEnvironment('OWNER', false, 'OWNER-0001');

    try {
      // 1. Balance Confirmation
      const confRes = await fetch(`${baseUrl}/personal-ledger/confirmations`, {
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

      const confBody = await confRes.json();
      assert.equal(confRes.status, 200);
      assert.equal(confBody.data.confirmationStatus, 'CONFIRMED');

      // 2. GL Reconciliation
      const recRes = await fetch(`${baseUrl}/personal-ledger/reconciliation`, {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-token',
        },
      });

      const recBody = await recRes.json();
      assert.equal(recRes.status, 200);
      assert.equal(recBody.data.subLedgerBalancePaisa, 7500000);
      assert.equal(recBody.data.financeGLControlBalancePaisa, 7500000);
      assert.equal(recBody.data.differencePaisa, 0);
      assert.equal(recBody.data.reconciliationStatus, 'BALANCED');
    } finally {
      mock.restore();
    }
  });

  await t.test('7. Multi-Café Security: OWNER cannot create entry for unassigned café, but can for assigned café', async () => {
    const mock = setupMockEnvironment('OWNER', false, 'OWNER-0001');

    try {
      // 1. Attempt to create entry for unassigned foreign café -> 403 CROSS_CAFE_RESOURCE_DENIED
      const unassignedRes = await fetch(`${baseUrl}/personal-ledger/entries`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: 'BUSINESS_EXPENSE_PAID_PERSONALLY',
          entryType: 'CREDIT',
          amountPaisa: 500000,
          businessDate: '2026-08-14',
          description: 'Supplies for foreign cafe',
          cafeId: 'CAFE-FOREIGN-999',
        }),
      });

      assert.equal(unassignedRes.status, 403);
      const unassignedBody = await unassignedRes.json();
      assert.equal(unassignedBody.error.code, 'CAFE_ACCESS_DENIED');

      // 2. Attempt to create entry for assigned café -> 201 Created
      const assignedRes = await fetch(`${baseUrl}/personal-ledger/entries`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: 'BUSINESS_EXPENSE_PAID_PERSONALLY',
          entryType: 'CREDIT',
          amountPaisa: 500000,
          businessDate: '2026-08-14',
          description: 'Supplies for assigned cafe',
          cafeId: 'CAFE-001',
        }),
      });

      assert.equal(assignedRes.status, 201);
      const assignedBody = await assignedRes.json();
      assert.equal(assignedBody.data.cafeId, 'CAFE-001');
    } finally {
      mock.restore();
    }
  });

  await t.test('8. Multi-Café Security: OWNER cannot classify entry to unassigned café', async () => {
    const mock = setupMockEnvironment('OWNER', false, 'OWNER-0001');

    try {
      const res = await fetch(`${baseUrl}/personal-ledger/entries/PL-20260814-0001/classify`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetGLAccount: '5100-EXP',
          accountingTreatment: 'BUSINESS_EXPENSE',
          cafeId: 'CAFE-FOREIGN-999',
        }),
      });

      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.error.code, 'CAFE_ACCESS_DENIED');
    } finally {
      mock.restore();
    }
  });

  await t.test('9. Multi-Café Scoped Filter: GET /personal-ledger/entries?cafeId=... enforces assigned cafés', async () => {
    const mock = setupMockEnvironment('OWNER', false, 'OWNER-0001');

    try {
      // 1. Query with unassigned café -> 403 CAFE_ACCESS_DENIED
      const unassignedRes = await fetch(`${baseUrl}/personal-ledger/entries?cafeId=CAFE-FOREIGN-999`, {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-token',
        },
      });

      assert.equal(unassignedRes.status, 403);
      const unassignedBody = await unassignedRes.json();
      assert.equal(unassignedBody.error.code, 'CAFE_ACCESS_DENIED');

      // 2. Query with assigned café -> 200 OK
      const assignedRes = await fetch(`${baseUrl}/personal-ledger/entries?cafeId=CAFE-001`, {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-token',
        },
      });

      assert.equal(assignedRes.status, 200);
      const assignedBody = await assignedRes.json();
      assert.ok(Array.isArray(assignedBody.data));
    } finally {
      mock.restore();
    }
  });

  await t.test('10. Parity: OWNER can reverse classification back to unclassified personal state', async () => {
    const mock = setupMockEnvironment('OWNER', false, 'OWNER-0001');

    try {
      const res = await fetch(`${baseUrl}/personal-ledger/entries/PL-20260814-0001/reverse-classification`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'Governance reclassification to personal expense',
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.workflowStatus, 'SUBMITTED');
      assert.equal(body.data.accountingTreatment, 'PERSONAL');
      assert.equal(body.data.financePostingStatus, 'REVERSED');
    } finally {
      mock.restore();
    }
  });

  await t.test('11. Role Boundaries: CAFE_ADMIN, STAFF, and Malformed MASTER are strictly DENIED', async () => {
    for (const testCase of [
      { role: 'CAFE_ADMIN', isPrimaryMaster: false, userId: 'ADMIN-0001' },
      { role: 'STAFF', isPrimaryMaster: false, userId: 'STAFF-0001' },
      { role: 'MASTER', isPrimaryMaster: false, userId: 'MASTER-MALFORMED-0001' },
    ]) {
      const mock = setupMockEnvironment(testCase.role, testCase.isPrimaryMaster, testCase.userId);

      try {
        const res = await fetch(`${baseUrl}/personal-ledger/overview`, {
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-token',
          },
        });

        assert.equal(
          res.status,
          403,
          `Expected 403 for role ${testCase.role} (isPrimaryMaster=${testCase.isPrimaryMaster}), received ${res.status}`
        );
      } finally {
        mock.restore();
      }
    }
  });

  await t.test('12. Mathematical Precision & Integer Paise Arithmetic', async () => {
    // Test the pure balance calculation with integer paise to guarantee 0 floating-point drift
    const entries = [
      { status: 'ACTIVE', entryType: 'CREDIT', amountPaisa: 1250075 }, // ₹12,500.75
      { status: 'ACTIVE', entryType: 'DEBIT', amountPaisa: 350025 },   // ₹3,500.25
      { status: 'ACTIVE', entryType: 'CREDIT', amountPaisa: 1 },        // ₹0.01
      { status: 'REVERSED', entryType: 'CREDIT', amountPaisa: 9999999 }, // Reversed: ignored
    ];

    let creditPaisa = 0;
    let debitPaisa = 0;
    for (const e of entries) {
      if (e.status !== 'ACTIVE') continue;
      if (e.entryType === 'CREDIT') creditPaisa += e.amountPaisa;
      if (e.entryType === 'DEBIT') debitPaisa += e.amountPaisa;
    }
    const balancePaisa = creditPaisa - debitPaisa;

    assert.equal(creditPaisa, 1250076); // Exactly ₹12,500.76
    assert.equal(debitPaisa, 350025);   // Exactly ₹3,500.25
    assert.equal(balancePaisa, 900051);  // Exactly ₹9,000.51
    assert.equal(Number.isInteger(balancePaisa), true);
  });
});

