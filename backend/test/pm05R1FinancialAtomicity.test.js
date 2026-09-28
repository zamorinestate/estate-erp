'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { createApp } = require('../src/server');
const { User } = require('../src/models/User');
const { Session } = require('../src/models/Session');
const { RolePermission } = require('../src/models/RolePermission');
const { PersonalLedger } = require('../src/models/PersonalLedger');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { AuditEvent } = require('../src/models/AuditEvent');
const authService = require('../src/services/authService');
const auditService = require('../src/services/auditService');
const transactionHelper = require('../src/utils/transactionHelper');

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
    sessionId: 'SS-20260912-0001',
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

function makePermissionRule(role, code, overrides = {}) {
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
    ...overrides,
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

test('PM-05-R1 Financial Atomicity, Idempotency & Governance Suite', async (t) => {
  await startServer();

  let originalVerify;
  let originalUserFindOne;
  let originalSessionFindOne;
  let originalRules;
  let originalFind;
  let originalFindOne;
  let originalCreate;
  let originalGenId;
  let originalRecordRequestAudit;
  let originalExecTx;
  let originalCalcBalance;
  let originalCountDocs;

  let mockEntries = [];
  let auditLogs = [];
  let currentUser;
  let currentSession;

  t.beforeEach(() => {
    originalVerify = authService.verifyAccessToken;
    originalUserFindOne = User.findOne;
    originalSessionFindOne = Session.findOne;
    originalRules = RolePermission.findEffectiveRules;
    originalFind = PersonalLedger.find;
    originalFindOne = PersonalLedger.findOne;
    originalCreate = PersonalLedger.create;
    originalGenId = SequenceCounter.generateId;
    originalRecordRequestAudit = auditService.recordRequestAudit;
    originalExecTx = transactionHelper.executeTransactionWithRetry;
    originalCalcBalance = PersonalLedger.calculateBalance;
    originalCountDocs = PersonalLedger.countDocuments;

    mockEntries = [];
    auditLogs = [];

    authService.verifyAccessToken = async () => ({
      payload: {
        sub: currentUser.userId,
        org: currentUser.organisationId,
        sid: currentSession.sessionId,
        role: currentUser.role,
        sv: 0,
        usv: 1,
        pv: 1,
        type: 'access',
      },
      session: currentSession,
    });

    User.findOne = async () => currentUser;
    Session.findOne = async () => currentSession;

    RolePermission.findEffectiveRules = async () => [
      makePermissionRule(currentUser.role, 'PERSONAL_LEDGER_READ'),
      makePermissionRule(currentUser.role, 'PERSONAL_LEDGER_WRITE'),
      makePermissionRule(currentUser.role, 'PERSONAL_LEDGER_EXPORT'),
      makePermissionRule(currentUser.role, 'PERSONAL_LEDGER_RECONCILE'),
    ];

    SequenceCounter.generateId = async () => 'PL-20260912-0001';

    PersonalLedger.calculateBalance = async () => ({
      creditPaisa: 5000000,
      debitPaisa: 0,
      balancePaisa: 5000000,
      dueToOwnerPaisa: 5000000,
      dueFromOwnerPaisa: 0,
      netCurrentAccountPositionPaisa: 5000000,
    });

    PersonalLedger.countDocuments = async () => 0;

    PersonalLedger.find = (query) => {
      let results = [...mockEntries];
      if (query && query.ledgerEntryId && query.ledgerEntryId.$in) {
        results = results.filter((e) => query.ledgerEntryId.$in.includes(e.ledgerEntryId));
      }
      const chain = {
        session: () => chain,
        sort: () => chain,
        skip: () => chain,
        limit: () => chain,
        lean: async () => results,
        then: (resolve) => resolve(results),
      };
      return chain;
    };

    PersonalLedger.findOne = (query) => {
      let entry = null;
      if (query && query.ledgerEntryId) {
        entry = mockEntries.find((e) => e.ledgerEntryId === query.ledgerEntryId) || null;
      } else if (query && query.idempotencyKey) {
        entry = mockEntries.find((e) => e.idempotencyKey === query.idempotencyKey) || null;
      } else if (query && query.externalReference) {
        entry = mockEntries.find((e) => e.externalReference === query.externalReference) || null;
      }

      if (entry && !entry.toObject) {
        entry.toObject = function () { return { ...this }; };
      }
      const res = entry;
      const chain = {
        session: () => chain,
        lean: async () => res ? { ...res } : null,
        then: (resolve) => resolve(res),
      };
      return chain;
    };

    PersonalLedger.create = async (docs, opts) => {
      const isArray = Array.isArray(docs);
      const items = isArray ? docs : [docs];
      const createdItems = items.map((doc) => {
        const entry = {
          ...doc,
          _id: `obj-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          status: doc.status || 'ACTIVE',
          balanceAfterPaisa: doc.balanceAfterPaisa || doc.amountPaisa,
          createdAt: new Date(),
          updatedAt: new Date(),
          toObject: function () {
            return { ...this };
          },
          save: async function (saveOpts) {
            return this;
          },
        };
        mockEntries.push(entry);
        return entry;
      });
      return isArray ? createdItems : createdItems[0];
    };

    auditService.recordRequestAudit = async (payload, options) => {
      const entry = { ...payload, session: payload.session || options?.session };
      auditLogs.push(entry);
      return entry;
    };
  });

  t.afterEach(() => {
    authService.verifyAccessToken = originalVerify;
    User.findOne = originalUserFindOne;
    Session.findOne = originalSessionFindOne;
    RolePermission.findEffectiveRules = originalRules;
    PersonalLedger.find = originalFind;
    PersonalLedger.findOne = originalFindOne;
    PersonalLedger.create = originalCreate;
    SequenceCounter.generateId = originalGenId;
    auditService.recordRequestAudit = originalRecordRequestAudit;
    transactionHelper.executeTransactionWithRetry = originalExecTx;
    PersonalLedger.calculateBalance = originalCalcBalance;
    PersonalLedger.countDocuments = originalCountDocs;
  });

  t.after(async () => {
    await stopServer();
  });

  await t.test('R1-1 & R1-2: AuditEvent failure rolls back ledger mutation (Atomicity Share Fate)', async () => {
    currentUser = makeUser({ userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true });
    currentSession = makeSession({ userId: 'MU-0001', roleSnapshot: 'MASTER' });

    const mockSession = {
      aborted: false,
      committed: false,
      startTransaction: () => {},
      commitTransaction: async () => {
        mockSession.committed = true;
      },
      abortTransaction: async () => {
        mockSession.aborted = true;
      },
      endSession: async () => {},
    };

    transactionHelper.executeTransactionWithRetry = async (op) => {
      const snapshot = [...mockEntries];
      try {
        return await op(mockSession);
      } catch (err) {
        mockEntries = snapshot;
        await mockSession.abortTransaction();
        throw err;
      }
    };

    auditService.recordRequestAudit = async () => {
      throw new Error('Mandatory AuditEvent persistence failed: Disk full');
    };

    const res = await fetch(`${baseUrl}/personal-ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
      body: JSON.stringify({
        accountHolderId: 'OWNER-001',
        entryType: 'CREDIT',
        category: 'CURRENT_ACCOUNT_FUNDING',
        amountPaisa: 100000,
        description: 'Audit failure test deposit',
        businessDate: '2026-09-12',
      }),
    });

    assert.strictEqual(res.status, 500);
    assert.strictEqual(mockEntries.length, 0, 'PERSONAL_LEDGER_AUDIT_FAILURE_LEAVES_FINANCIAL_MUTATION = 0: Ledger write rolled back');
    assert.strictEqual(mockSession.aborted, true, 'Transaction must be aborted on audit failure');
  });

  await t.test('R1-3: Ledger write failure never creates success AuditEvent', async () => {
    currentUser = makeUser({ userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true });
    currentSession = makeSession({ userId: 'MU-0001', roleSnapshot: 'MASTER' });

    PersonalLedger.create = async () => {
      throw new Error('Database connection reset during ledger insert');
    };

    const res = await fetch(`${baseUrl}/personal-ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
      body: JSON.stringify({
        accountHolderId: 'OWNER-001',
        entryType: 'CREDIT',
        category: 'CURRENT_ACCOUNT_FUNDING',
        amountPaisa: 100000,
        description: 'Failed ledger write test',
        businessDate: '2026-09-12',
      }),
    });

    assert.strictEqual(res.status, 500);
    assert.strictEqual(auditLogs.length, 0, 'PERSONAL_LEDGER_FAILED_WRITE_CREATES_SUCCESS_AUDIT = 0: No success audit emitted');
  });

  await t.test('R1-4 & R1-5: Source-event idempotency protects different-key duplicate submissions', async () => {
    currentUser = makeUser({ userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true });
    currentSession = makeSession({ userId: 'MU-0001', roleSnapshot: 'MASTER' });

    const externalRef = 'PAYROLL-DISBURSEMENT-BATCH-202609';

    // Submission A with key A
    const resA = await fetch(`${baseUrl}/personal-ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
        'idempotency-key': 'CLIENT-KEY-AAA',
      },
      body: JSON.stringify({
        accountHolderId: 'OWNER-001',
        entryType: 'CREDIT',
        category: 'CURRENT_ACCOUNT_FUNDING',
        amountPaisa: 500000,
        description: 'Payroll run disburse',
        externalReference: externalRef,
        businessDate: '2026-09-12',
      }),
    });

    assert.strictEqual(resA.status, 201);
    assert.strictEqual(mockEntries.length, 1);

    // Submission B with different key B but same externalReference
    const resB = await fetch(`${baseUrl}/personal-ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
        'idempotency-key': 'CLIENT-KEY-BBB',
      },
      body: JSON.stringify({
        accountHolderId: 'OWNER-001',
        entryType: 'CREDIT',
        category: 'CURRENT_ACCOUNT_FUNDING',
        amountPaisa: 500000,
        description: 'Payroll run disburse duplicate attempt',
        externalReference: externalRef,
        businessDate: '2026-09-12',
      }),
    });

    assert.strictEqual(resB.status, 200, 'Duplicate submission with different client key returns 200 idempotent replay');
    const dataB = await resB.json();
    assert.strictEqual(dataB.idempotentReplay, true);
    assert.strictEqual(mockEntries.length, 1, 'SAME_SOURCE_EVENT_DIFFERENT_IDEMPOTENCY_KEY_DOUBLE_POSTS = 0');
  });

  await t.test('R1-6: Owner authority source-truth & strict self-scoped restriction', async () => {
    currentUser = makeUser({ userId: 'OWNER-001', role: 'OWNER', isPrimaryMaster: false });
    currentSession = makeSession({ userId: 'OWNER-001', roleSnapshot: 'OWNER' });

    const resSelf = await fetch(`${baseUrl}/personal-ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
      body: JSON.stringify({
        accountHolderId: 'OWNER-001',
        entryType: 'CREDIT',
        category: 'CURRENT_ACCOUNT_FUNDING',
        amountPaisa: 200000,
        description: 'Owner self-funding',
        businessDate: '2026-09-12',
      }),
    });

    assert.strictEqual(resSelf.status, 201, 'Owner self-adjustment authorized in frozen policy');
    const created = mockEntries[mockEntries.length - 1];
    assert.strictEqual(created.accountHolderId, 'OWNER-001');

    const resOther = await fetch(`${baseUrl}/personal-ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
      body: JSON.stringify({
        accountHolderId: 'OWNER-002',
        entryType: 'CREDIT',
        category: 'CURRENT_ACCOUNT_FUNDING',
        amountPaisa: 200000,
        description: 'Tampered owner funding',
        businessDate: '2026-09-12',
      }),
    });

    assert.strictEqual(resOther.status, 201);
    const createdOther = mockEntries[mockEntries.length - 1];
    assert.strictEqual(createdOther.accountHolderId, 'OWNER-001', 'PM05_EXPANDS_FROZEN_OWNER_LEDGER_WRITE_AUTHORITY = 0: Client accountHolderId override is ignored and forced to own userId');
  });

  await t.test('R1-7: Reversal creates immutable audit trail and does not delete history', async () => {
    currentUser = makeUser({ userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true });
    currentSession = makeSession({ userId: 'MU-0001', roleSnapshot: 'MASTER' });

    mockEntries.push({
      _id: 'orig-001',
      ledgerEntryId: 'PL-20260912-0001',
      voucherNumber: 'PL-20260912-0001',
      accountType: 'OWNER_CURRENT_ACCOUNT',
      accountHolderId: 'OWNER-001',
      entryType: 'CREDIT',
      amountPaisa: 150000,
      category: 'CURRENT_ACCOUNT_FUNDING',
      businessDate: '2026-09-12',
      description: 'Original funding',
      status: 'ACTIVE',
      save: async function () {
        return this;
      },
    });

    SequenceCounter.generateId = async () => 'PL-20260912-0002';

    const res = await fetch(`${baseUrl}/personal-ledger/entries/PL-20260912-0001/reverse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
      body: JSON.stringify({
        reason: 'Correction of accidental overfunding',
      }),
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(mockEntries.length, 2, 'SOURCE_REVERSAL_SILENTLY_DELETES_LEDGER_HISTORY = 0: Original entry retained in database');
    const orig = mockEntries.find((e) => e.ledgerEntryId === 'PL-20260912-0001');
    const rev = mockEntries.find((e) => e.ledgerEntryId === 'PL-20260912-0002');
    assert.strictEqual(orig.status, 'REVERSED');
    assert.strictEqual(orig.correctedByEntryId, 'PL-20260912-0002');
    assert.strictEqual(rev.entryType, 'DEBIT', 'Reversal entry must counter-balance credit');
    assert.strictEqual(rev.amountPaisa, 150000);
  });

  await t.test('R1-8: Finance Controller entryType field-alias source truth', async () => {
    const financeControllerPath = require.resolve('../src/controllers/financeController');
    const fs = require('fs');
    const content = fs.readFileSync(financeControllerPath, 'utf8');

    assert.doesNotMatch(content, /ple\.entryType\s*\|\|\s*ple\.type/, 'UNSUPPORTED_PERSONAL_LEDGER_FIELD_ALIAS_MASKS_BAD_DATA = 0: Stale || ple.type fallback removed');
    assert.match(content, /const entryType = ple\.entryType;/, 'Strict entryType usage enforced');
  });

  await t.test('R2-1: Concurrent source-event processing race condition protection', async () => {
    currentUser = makeUser({ userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true });
    currentSession = makeSession({ userId: 'MU-0001', roleSnapshot: 'MASTER' });

    const extRef = 'SOURCE-EVENT-CONCURRENT-RACE-001';

    // Execute two concurrent requests simultaneously with distinct client idempotency keys
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/personal-ledger/entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
          'idempotency-key': 'CONCURRENT-CLIENT-KEY-1',
        },
        body: JSON.stringify({
          accountHolderId: 'OWNER-001',
          entryType: 'CREDIT',
          category: 'CURRENT_ACCOUNT_FUNDING',
          amountPaisa: 300000,
          description: 'Concurrent race disburse A',
          externalReference: extRef,
          businessDate: '2026-09-12',
        }),
      }),
      fetch(`${baseUrl}/personal-ledger/entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
          'idempotency-key': 'CONCURRENT-CLIENT-KEY-2',
        },
        body: JSON.stringify({
          accountHolderId: 'OWNER-001',
          entryType: 'CREDIT',
          category: 'CURRENT_ACCOUNT_FUNDING',
          amountPaisa: 300000,
          description: 'Concurrent race disburse B',
          externalReference: extRef,
          businessDate: '2026-09-12',
        }),
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.deepStrictEqual(statuses, [200, 201], 'Exactly one request creates (201) and one returns replay (200)');
    assert.strictEqual(mockEntries.length, 1, 'CONCURRENT_SOURCE_EVENT_DOUBLE_POSTS_LEDGER = 0: Only 1 ledger entry created');
  });

  await t.test('R2-2: System Source Identity: Payroll Run disburse & deduction deduplication', async () => {
    currentUser = makeUser({ userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true });
    currentSession = makeSession({ userId: 'MU-0001', roleSnapshot: 'MASTER' });

    // Initial Payroll disburse using server-derived sourceModule and sourceReferenceId
    const resA = await fetch(`${baseUrl}/personal-ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
        'idempotency-key': 'BROWSER-ARBITRARY-KEY-1001',
      },
      body: JSON.stringify({
        accountHolderId: 'OWNER-001',
        entryType: 'CREDIT',
        category: 'CURRENT_ACCOUNT_FUNDING',
        amountPaisa: 750000,
        description: 'Payroll disbursement batch 2026-09',
        sourceModule: 'PAYROLL',
        sourceReferenceId: 'PAYROLL-RUN-202609-01',
        postingType: 'CREDIT',
        businessDate: '2026-09-12',
      }),
    });

    assert.strictEqual(resA.status, 201);
    const bodyA = await resA.json();
    assert.strictEqual(bodyA.data.externalReference, 'PAYROLL:PAYROLL-RUN-202609-01:CREDIT');
    assert.strictEqual(mockEntries.length, 1);

    // Replay with DIFFERENT arbitrary client key
    const resB = await fetch(`${baseUrl}/personal-ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
        'idempotency-key': 'BROWSER-DIFFERENT-KEY-9999',
      },
      body: JSON.stringify({
        accountHolderId: 'OWNER-001',
        entryType: 'CREDIT',
        category: 'CURRENT_ACCOUNT_FUNDING',
        amountPaisa: 750000,
        description: 'Payroll disbursement batch 2026-09 retry attempt',
        sourceModule: 'PAYROLL',
        sourceReferenceId: 'PAYROLL-RUN-202609-01',
        postingType: 'CREDIT',
        businessDate: '2026-09-12',
      }),
    });

    assert.strictEqual(resB.status, 200);
    const bodyB = await resB.json();
    assert.strictEqual(bodyB.idempotentReplay, true);
    assert.strictEqual(mockEntries.length, 1, 'PAYROLL_LEDGER_POSTING_CAN_DUPLICATE_WITH_DIFFERENT_REQUEST_KEY = 0');
    assert.strictEqual(mockEntries.length, 1, 'SYSTEM_LEDGER_POSTING_IDEMPOTENCY_DEPENDS_ON_CLIENT_KEY = 0');
  });

  await t.test('R2-3: Loan & Advance integration: Disbursed loan and salary advance source-event idempotency', async () => {
    currentUser = makeUser({ userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true });
    currentSession = makeSession({ userId: 'MU-0001', roleSnapshot: 'MASTER' });

    // Loan Disbursement
    const resLoan = await fetch(`${baseUrl}/personal-ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
      body: JSON.stringify({
        accountHolderId: 'OWNER-001',
        entryType: 'DEBIT',
        category: 'DIRECTOR_LOAN_TO_COMPANY',
        amountPaisa: 1500000,
        description: 'Director loan disbursement',
        sourceModule: 'LOAN',
        sourceReferenceId: 'LN-2026-0042',
        businessDate: '2026-09-12',
      }),
    });
    assert.strictEqual(resLoan.status, 201);

    // Replay same loan disbursement with different client key
    const resLoanReplay = await fetch(`${baseUrl}/personal-ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
        'idempotency-key': 'ANOTHER-CLIENT-KEY',
      },
      body: JSON.stringify({
        accountHolderId: 'OWNER-001',
        entryType: 'DEBIT',
        category: 'DIRECTOR_LOAN_TO_COMPANY',
        amountPaisa: 1500000,
        description: 'Director loan disbursement replay',
        sourceModule: 'LOAN',
        sourceReferenceId: 'LN-2026-0042',
        businessDate: '2026-09-12',
      }),
    });
    assert.strictEqual(resLoanReplay.status, 200);
    const loanBody = await resLoanReplay.json();
    assert.strictEqual(loanBody.idempotentReplay, true);
    assert.strictEqual(mockEntries.length, 1, 'SAME_SOURCE_EVENT_DIFFERENT_IDEMPOTENCY_KEY_DOUBLE_POSTS = 0');
  });

  await t.test('R2-4: Expense / Reimbursement status governance: Ineligible status rejected', async () => {
    currentUser = makeUser({ userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true });
    currentSession = makeSession({ userId: 'MU-0001', roleSnapshot: 'MASTER' });

    // Ineligible expense statuses (DRAFT, REJECTED, SUBMITTED) must be rejected
    for (const badStatus of ['DRAFT', 'REJECTED', 'PENDING_APPROVAL']) {
      const res = await fetch(`${baseUrl}/personal-ledger/entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          accountHolderId: 'OWNER-001',
          entryType: 'CREDIT',
          category: 'BUSINESS_EXPENSE_PAID_PERSONALLY',
          amountPaisa: 250000,
          description: 'Draft expense reimbursement attempt',
          expenseStatus: badStatus,
          businessDate: '2026-09-12',
        }),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'INELIGIBLE_SOURCE_STATUS');
    }

    assert.strictEqual(mockEntries.length, 0, 'INELIGIBLE_EXPENSE_STATUS_POSTS_TO_PERSONAL_LEDGER = 0');

    // Eligible expense status (APPROVED) succeeds
    const okRes = await fetch(`${baseUrl}/personal-ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
      body: JSON.stringify({
        accountHolderId: 'OWNER-001',
        entryType: 'CREDIT',
        category: 'BUSINESS_EXPENSE_PAID_PERSONALLY',
        amountPaisa: 250000,
        description: 'Approved expense reimbursement',
        expenseStatus: 'APPROVED',
        businessDate: '2026-09-12',
      }),
    });

    assert.strictEqual(okRes.status, 201);
    assert.strictEqual(mockEntries.length, 1);
  });

  await t.test('R2-5: Five-Portal Personal Ledger authority matrix & Zero drift', async () => {
    // 1. Malformed MASTER: DENIED (403)
    currentUser = makeUser({ userId: 'MU-NORMAL-01', role: 'MASTER', isPrimaryMaster: false });
    currentSession = makeSession({ userId: 'MU-NORMAL-01', roleSnapshot: 'MASTER' });
    const nmRes = await fetch(`${baseUrl}/personal-ledger/overview`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.strictEqual(nmRes.status, 403);

    // 2. CAFE_ADMIN: DENIED (403)
    currentUser = makeUser({ userId: 'ADM-01', role: 'CAFE_ADMIN', isPrimaryMaster: false });
    currentSession = makeSession({ userId: 'ADM-01', roleSnapshot: 'CAFE_ADMIN' });
    const caRes = await fetch(`${baseUrl}/personal-ledger/overview`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.strictEqual(caRes.status, 403);

    // 3. STAFF: DENIED (403)
    currentUser = makeUser({ userId: 'STF-01', role: 'STAFF', isPrimaryMaster: false });
    currentSession = makeSession({ userId: 'STF-01', roleSnapshot: 'STAFF' });
    const stRes = await fetch(`${baseUrl}/personal-ledger/overview`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.strictEqual(stRes.status, 403);

    // 4. OWNER: ALLOWED for self (200)
    currentUser = makeUser({ userId: 'OWNER-001', role: 'OWNER', isPrimaryMaster: false });
    currentSession = makeSession({ userId: 'OWNER-001', roleSnapshot: 'OWNER' });
    const ownRes = await fetch(`${baseUrl}/personal-ledger/overview`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.strictEqual(ownRes.status, 200);

    // 5. PRIMARY MASTER: ALLOWED (200)
    currentUser = makeUser({ userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true });
    currentSession = makeSession({ userId: 'MU-0001', roleSnapshot: 'MASTER' });
    const pmRes = await fetch(`${baseUrl}/personal-ledger/overview`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.strictEqual(pmRes.status, 200, 'PERSONAL_LEDGER_BROWSER_BACKEND_AUTHORITY_DRIFT = 0');
  });

  await t.test('R2-6: Complete Primary Master Route & Actionable Control Manifest validation', async () => {
    const fs = require('fs');
    const path = require('path');
    const navPath = path.resolve(__dirname, '../../frontend/src/js/navigation.js');
    const routerPath = path.resolve(__dirname, '../../frontend/src/js/router.js');

    const navCode = fs.readFileSync(navPath, 'utf8');
    const routerCode = fs.readFileSync(routerPath, 'utf8');

    // Extract all PRIMARY_MASTER_ITEMS routes
    const pmRoutes = [...navCode.matchAll(/route:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
    assert.ok(pmRoutes.length >= 26, `Primary master items count must be >= 26 (found ${pmRoutes.length})`);

    for (const r of pmRoutes) {
      assert.ok(
        routerCode.includes(`"${r}"`) || routerCode.includes(`'${r}'`),
        `PRIMARY_MASTER_SCREEN_MISSING_FROM_PM05_CONTROL_AUDIT = 0: Route ${r} must be handled in router.js`
      );
    }
  });

  await t.test('R2-7: CSV Export Domain Separation: Reports API does not reintroduce CSV', async () => {
    const reportRoutesPath = path.resolve(__dirname, '../src/routes/reportRoutes.js');
    const fs = require('fs');
    const content = fs.readFileSync(reportRoutesPath, 'utf8');

    assert.doesNotMatch(
      content,
      /\/export\/csv/,
      'PM05_REINTRODUCES_REPORTS_CSV_EXPORT = 0: Frozen Reports API must not expose ad-hoc CSV export routes'
    );
  });
});

