'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const zlib = require('node:zlib');

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

test('PM-05 Personal Ledger Integration & Invariant Suite', async (t) => {
  await startServer();

  let originalVerify;
  let originalUserFindOne;
  let originalSessionFindOne;
  let originalRules;
  let originalFind;
  let originalFindOne;
  let originalCount;
  let originalCalcBalance;
  let originalCreate;
  let originalGenId;
  let originalAuditCreate;

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
    originalCount = PersonalLedger.countDocuments;
    originalCalcBalance = PersonalLedger.calculateBalance;
    originalCreate = PersonalLedger.create;
    originalGenId = SequenceCounter.generateId;
    originalAuditCreate = AuditEvent.create;

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

    SequenceCounter.generateId = async () => 101;

    PersonalLedger.calculateBalance = async () => {
      let credit = 0;
      let debit = 0;
      for (const e of mockEntries) {
        if (e.status !== 'ACTIVE') continue;
        if (e.entryType === 'CREDIT') credit += e.amountPaisa;
        else if (e.entryType === 'DEBIT') debit -= e.amountPaisa;
      }
      return {
        creditPaisa: credit,
        debitPaisa: debit,
        balancePaisa: credit - debit,
        dueToOwnerPaisa: credit,
        dueFromOwnerPaisa: debit,
        netCurrentAccountPositionPaisa: credit - debit,
      };
    };

    PersonalLedger.countDocuments = async () => mockEntries.length;

    PersonalLedger.find = (query) => {
      let results = [...mockEntries];
      if (query && query.idempotencyKey) {
        results = results.filter(e => e.idempotencyKey === query.idempotencyKey);
      }
      const chain = {
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
      if (query && query.ledgerEntryId) entry = mockEntries.find(e => e.ledgerEntryId === query.ledgerEntryId) || null;
      else if (query && query.idempotencyKey) entry = mockEntries.find(e => e.idempotencyKey === query.idempotencyKey) || null;
      else entry = mockEntries[0] || null;

      const res = entry ? { ...entry, toObject: () => ({ ...entry }) } : null;
      return {
        lean: async () => res,
        then: (resolve) => resolve(res),
      };
    };

    PersonalLedger.create = async (doc) => {
      const entry = {
        ...doc,
        _id: `obj-${Date.now()}`,
        status: doc.status || 'ACTIVE',
        balanceAfterPaisa: doc.balanceAfterPaisa || doc.amountPaisa,
        createdAt: new Date(),
        updatedAt: new Date(),
        toObject: function () { return { ...this }; },
      };
      mockEntries.push(entry);
      return entry;
    };

    AuditEvent.create = async (audit) => {
      auditLogs.push(audit);
      return audit;
    };
  });

  t.afterEach(() => {
    authService.verifyAccessToken = originalVerify;
    User.findOne = originalUserFindOne;
    Session.findOne = originalSessionFindOne;
    RolePermission.findEffectiveRules = originalRules;
    PersonalLedger.find = originalFind;
    PersonalLedger.findOne = originalFindOne;
    PersonalLedger.countDocuments = originalCount;
    PersonalLedger.calculateBalance = originalCalcBalance;
    PersonalLedger.create = originalCreate;
    SequenceCounter.generateId = originalGenId;
    AuditEvent.create = originalAuditCreate;
  });

  t.after(async () => {
    await stopServer();
  });

  await t.test('1. Integer Paise Arithmetic: negative amounts are strictly rejected', async () => {
    currentUser = makeUser({ userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true });
    currentSession = makeSession({ userId: 'MU-0001', roleSnapshot: 'MASTER' });

    const res = await fetch(`${baseUrl}/personal-ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
      body: JSON.stringify({
        accountHolderId: 'OWNER-001',
        accountHolderType: 'OWNER',
        entryType: 'CREDIT',
        category: 'CURRENT_ACCOUNT_FUNDING',
        amountPaisa: -500,
        description: 'Negative credit',
        businessDate: '2026-09-12',
      }),
    });

    assert.strictEqual(res.status, 400, 'Negative amountPaisa must return 400 Bad Request');
    const data = await res.json();
    assert.strictEqual(data.error.code, 'INVALID_AMOUNT');
  });

  await t.test('2. Idempotency Protection: duplicate submission with same idempotencyKey returns 200 idempotentReplay', async () => {
    currentUser = makeUser({ userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true });
    currentSession = makeSession({ userId: 'MU-0001', roleSnapshot: 'MASTER' });

    const key = `idemp-${Date.now()}`;
    const payload = {
      accountHolderId: 'OWNER-001',
      accountHolderType: 'OWNER',
      entryType: 'CREDIT',
      category: 'CURRENT_ACCOUNT_FUNDING',
      amountPaisa: 5000000,
      description: 'Capital Contribution Round 1',
      businessDate: '2026-09-12',
      idempotencyKey: key,
    };

    const res1 = await fetch(`${baseUrl}/personal-ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res1.status, 201, 'Initial call creates entry with 201');
    const data1 = await res1.json();
    assert.strictEqual(data1.data.amountPaisa, 5000000);
    assert.strictEqual(mockEntries.length, 1);

    const res2 = await fetch(`${baseUrl}/personal-ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res2.status, 200, 'Duplicate submission with same idempotencyKey returns 200');
    const data2 = await res2.json();
    assert.strictEqual(data2.idempotentReplay, true, 'idempotentReplay flag must be true');
    assert.strictEqual(data2.data.idempotencyKey, key);
    assert.strictEqual(mockEntries.length, 1, 'No duplicate entry inserted into database');
  });

  await t.test('3. Role Authority Matrix: Primary Master & Owner allowed; Normal Master, Cafe Admin, Staff denied (401/403)', async () => {
    currentUser = makeUser({ userId: 'MU-0002', role: 'MASTER', isPrimaryMaster: false });
    currentSession = makeSession({ userId: 'MU-0002', roleSnapshot: 'MASTER' });

    let res = await fetch(`${baseUrl}/personal-ledger/overview`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.ok(res.status === 401 || res.status === 403, 'Normal Master strictly denied (401 retired or 403)');

    currentUser = makeUser({ userId: 'CA-0001', role: 'CAFE_ADMIN', isPrimaryMaster: false });
    currentSession = makeSession({ userId: 'CA-0001', roleSnapshot: 'CAFE_ADMIN' });

    res = await fetch(`${baseUrl}/personal-ledger/overview`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.strictEqual(res.status, 403, 'CAFE_ADMIN strictly denied 403');

    currentUser = makeUser({ userId: 'ST-0001', role: 'STAFF', isPrimaryMaster: false });
    currentSession = makeSession({ userId: 'ST-0001', roleSnapshot: 'STAFF' });

    res = await fetch(`${baseUrl}/personal-ledger/overview`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.strictEqual(res.status, 403, 'STAFF strictly denied 403');

    currentUser = makeUser({ userId: 'OWNER-001', role: 'OWNER', isPrimaryMaster: false });
    currentSession = makeSession({ userId: 'OWNER-001', roleSnapshot: 'OWNER' });

    res = await fetch(`${baseUrl}/personal-ledger/overview`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.strictEqual(res.status, 200, 'OWNER can read own personal ledger overview');

    currentUser = makeUser({ userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true });
    currentSession = makeSession({ userId: 'MU-0001', roleSnapshot: 'MASTER' });

    res = await fetch(`${baseUrl}/personal-ledger/overview`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.strictEqual(res.status, 200, 'Primary Master can read personal ledger overview');
  });

  await t.test('4. IDOR Protection: Owner cannot read another accountHolderId ledger', async () => {
    currentUser = makeUser({ userId: 'OWNER-001', role: 'OWNER', isPrimaryMaster: false });
    currentSession = makeSession({ userId: 'OWNER-001', roleSnapshot: 'OWNER' });

    const res = await fetch(`${baseUrl}/personal-ledger/entries?accountHolderId=OWNER-999`, {
      headers: { Authorization: 'Bearer valid-token' },
    });

    assert.strictEqual(res.status, 403, 'Owner querying another accountHolderId must be rejected with 403');
    const data = await res.json();
    assert.strictEqual(data.error.code, 'UNAUTHORIZED_ACCOUNT_ACCESS');
  });

  await t.test('5. Export Endpoint: 400 for CSV, 200 for PDF/XLSX & Formula Injection Defense', async () => {
    currentUser = makeUser({ userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true });
    currentSession = makeSession({ userId: 'MU-0001', roleSnapshot: 'MASTER' });

    mockEntries.push({
      _id: 'obj-101',
      ledgerEntryId: 'PL-20260912-0001',
      voucherNumber: 'PL-20260912-0001',
      accountHolderId: 'OWNER-001',
      accountHolderType: 'OWNER',
      entryType: 'CREDIT',
      category: 'CURRENT_ACCOUNT_FUNDING',
      amountPaisa: 100000,
      description: '=cmd|"/C calc"!A0',
      businessDate: '2026-09-12',
      status: 'ACTIVE',
      createdAt: new Date(),
    });

    // 1. CSV, JSON, HTML, TXT, XLS formats rejected with 400
    for (const rejectedFmt of ['csv', 'json', 'html', 'txt', 'xls', 'unknown']) {
      const resBad = await fetch(`${baseUrl}/personal-ledger/export?format=${rejectedFmt}`, {
        headers: { Authorization: 'Bearer valid-token' },
      });
      assert.strictEqual(resBad.status, 400, `format=${rejectedFmt} must return 400`);
      const errData = await resBad.json();
      assert.strictEqual(errData.error?.code, 'UNSUPPORTED_EXPORT_FORMAT', `format=${rejectedFmt} code must be UNSUPPORTED_EXPORT_FORMAT`);
    }

    // 2. PDF export succeeds with 200 application/pdf
    const resPdf = await fetch(`${baseUrl}/personal-ledger/export?format=pdf`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.strictEqual(resPdf.status, 200);
    assert.strictEqual(resPdf.headers.get('content-type'), 'application/pdf');

    // 3. XLSX export succeeds with 200 and formula injection defense
    const resXlsx = await fetch(`${baseUrl}/personal-ledger/export?format=xlsx`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.strictEqual(resXlsx.status, 200);
    assert.strictEqual(resXlsx.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const xlsxBuf = Buffer.from(await resXlsx.arrayBuffer());
    assert.ok(xlsxBuf.length > 100);
    function extractZipEntry(zipBuf, targetPath) {
      let offset = 0;
      while (offset < zipBuf.length - 4) {
        const sig = zipBuf.readUInt32LE(offset);
        if (sig !== 0x04034b50) break;
        const compMethod = zipBuf.readUInt16LE(offset + 8);
        const compSize = zipBuf.readUInt32LE(offset + 18);
        const nameLen = zipBuf.readUInt16LE(offset + 26);
        const extraLen = zipBuf.readUInt16LE(offset + 28);
        const name = zipBuf.toString('utf8', offset + 30, offset + 30 + nameLen);
        const dataStart = offset + 30 + nameLen + extraLen;
        const data = zipBuf.subarray(dataStart, dataStart + compSize);
        if (name === targetPath) {
          return compMethod === 8 ? zlib.inflateRawSync(data).toString('utf8') : data.toString('utf8');
        }
        offset = dataStart + compSize;
      }
      return null;
    }

    const sharedStringsXml = extractZipEntry(xlsxBuf, 'xl/sharedStrings.xml');
    assert.ok(sharedStringsXml, 'xl/sharedStrings.xml must exist in XLSX archive');
    assert.ok(
      sharedStringsXml.includes("&#x27;=cmd") || sharedStringsXml.includes("&#39;=cmd") || sharedStringsXml.includes("'=cmd") || sharedStringsXml.includes("&apos;=cmd"),
      'Formula injection trigger "=" must be neutralized with leading single quote in XLSX shared strings'
    );

    // 4. JSON format is rejected with 400 UNSUPPORTED_EXPORT_FORMAT
    const resJson = await fetch(`${baseUrl}/personal-ledger/export?format=json`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.strictEqual(resJson.status, 400);
    const jsonErr = await resJson.json();
    assert.strictEqual(jsonErr.error?.code, 'UNSUPPORTED_EXPORT_FORMAT');
  });

  await t.test('6. Client Authority Rejection & Server-Side Security Invariants', async () => {
    currentUser = makeUser({ userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true });
    currentSession = makeSession({ userId: 'MU-0001', roleSnapshot: 'MASTER' });

    const res = await fetch(`${baseUrl}/personal-ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
      body: JSON.stringify({
        organisationId: 'SPOOFED_ORG',
        createdBy: 'ATTACKER_ID',
        accountHolderId: 'OWNER-001',
        accountHolderType: 'OWNER',
        entryType: 'CREDIT',
        category: 'CURRENT_ACCOUNT_FUNDING',
        amountPaisa: 250000,
        description: 'Authority check',
        businessDate: '2026-09-12',
      }),
    });

    assert.strictEqual(res.status, 201);
    const created = mockEntries[mockEntries.length - 1];
    assert.strictEqual(created.organisationId, 'ORG-TEST', 'organisationId must be derived from authenticated user/session');
    assert.strictEqual(created.ownerUserId, 'MU-0001', 'ownerUserId must be derived from authenticated user/session');
  });
});
