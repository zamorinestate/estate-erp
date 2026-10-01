'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/server');
const { InboundEmailMessage } = require('../src/models/InboundEmailMessage');
const { NotificationOutbox } = require('../src/models/NotificationOutbox');
const { SystemCommunicationSettings } = require('../src/models/SystemCommunicationSettings');
const { MailThread } = require('../src/models/MailThread');
const { MailDraft } = require('../src/models/MailDraft');
const { MailCase } = require('../src/models/MailCase');
const { MailTemplate } = require('../src/models/MailTemplate');
const { MailAutomationRule } = require('../src/models/MailAutomationRule');
const { SenderIdentity } = require('../src/models/SenderIdentity');
const { Vendor } = require('../src/models/Vendor');
const { User } = require('../src/models/User');
const { RolePermission } = require('../src/models/RolePermission');
const { MailOpsService } = require('../src/services/MailOpsService');
const authService = require('../src/services/authService');

function makeRequest({ port, method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const serializedBody = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (serializedBody) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(serializedBody);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path,
        headers: reqHeaders,
      },
      (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          let parsedJson = null;
          try {
            parsedJson = responseData ? JSON.parse(responseData) : null;
          } catch (e) {
            parsedJson = responseData;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedJson,
          });
        });
      }
    );

    req.on('error', reject);
    if (serializedBody) {
      req.write(serializedBody);
    }
    req.end();
  });
}

function createQueryWrapper(resolvedValue) {
  const query = {
    select() { return query; },
    sort() { return query; },
    skip() { return query; },
    limit() { return query; },
    lean() { return Promise.resolve(resolvedValue); },
    then(onFulfilled, onRejected) {
      return Promise.resolve(resolvedValue).then(onFulfilled, onRejected);
    },
  };
  return query;
}

test('SCR-012: MailOps Command Centre & Communications Integration Suite', async (t) => {
  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = server.address().port;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const primaryMaster = {
    userId: 'USR-PRIMARY-MASTER',
    organisationId: 'ORG-ZAMORIN',
    role: 'MASTER',
    isPrimaryMaster: true,
    email: 'primary@zamorin.com',
    fullName: 'Primary Master',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
    accountStatus: 'ACTIVE',
    save: async function () { return this; },
  };

  const malformedMaster = {
    userId: 'USR-MALFORMED-MASTER',
    organisationId: 'ORG-ZAMORIN',
    role: 'MASTER',
    isPrimaryMaster: false,
    email: 'malformed.master@zamorin.com',
    fullName: 'Malformed MASTER',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
    accountStatus: 'ACTIVE',
    save: async function () { return this; },
  };

  const cafeAdminKora = {
    userId: 'USR-ADMIN-KORA',
    organisationId: 'ORG-ZAMORIN',
    role: 'CAFE_ADMIN',
    email: 'admin.kora@zamorin.com',
    fullName: 'Koramangala Admin',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001'],
    accountStatus: 'ACTIVE',
    save: async function () { return this; },
  };

  // In-memory collections
  const inMemoryInbound = [];
  const inMemoryOutbox = [];
  const inMemoryThreads = [];
  const inMemoryDrafts = [];
  const inMemoryCases = [];
  const inMemoryTemplates = [];
  const inMemoryRules = [];
  const inMemoryIdentities = [];
  let inMemorySettings = {
    organisationId: 'ORG-ZAMORIN',
    operationsEmail: 'zamorinestatepvtltd.erp@gmail.com',
    provider: 'GMAIL_API',
    oauthStatus: 'CONNECTED',
    dailySendBudgetLimit: 500,
    outboundPaused: false,
    gmailWatch: {
      status: 'ACTIVE',
      watchExpiration: new Date(Date.now() + 7 * 86400000),
      lastSuccessfulSyncAt: new Date(),
    },
    save: async function () { return this; },
  };

  t.mock.method(authService, 'verifyAccessToken', async (token) => {
    let activeUser = primaryMaster;
    if (token === 'token_malformed_master') activeUser = malformedMaster;
    if (token === 'token_kora_admin') activeUser = cafeAdminKora;
    return {
      payload: {
        sub: activeUser.userId,
        org: activeUser.organisationId,
        role: activeUser.role,
        isPrimaryMaster: activeUser.isPrimaryMaster,
        sv: 0,
        usv: 1,
        pv: 1,
        sid: 'SS-MAILOPS-TEST',
      },
      session: {
        sessionId: 'SS-MAILOPS-TEST',
        roleSnapshot: activeUser.role,
        sessionVersion: 0,
        mfaVerified: true,
        stepUpVerifiedAt: new Date().toISOString(),
      },
    };
  });

  t.mock.method(User, 'findOne', async (query) => {
    if (query?.userId === 'USR-PRIMARY-MASTER') return primaryMaster;
    if (query?.userId === 'USR-MALFORMED-MASTER') return malformedMaster;
    if (query?.userId === 'USR-ADMIN-KORA') return cafeAdminKora;
    return null;
  });

  t.mock.method(RolePermission, 'find', () => {
    return createQueryWrapper([
      { role: 'MASTER', permissionCode: 'MAILOPS_READ', effect: 'ALLOW', scope: 'ORGANISATION', isCurrentlyEffective: () => true },
      { role: 'MASTER', permissionCode: 'MAILOPS_WRITE', effect: 'ALLOW', scope: 'ORGANISATION', isCurrentlyEffective: () => true },
      { role: 'MASTER', permissionCode: 'MAILOPS_ADMIN', effect: 'ALLOW', scope: 'ORGANISATION', isCurrentlyEffective: () => true },
      { role: 'CAFE_ADMIN', permissionCode: 'MAILOPS_READ', effect: 'ALLOW', scope: 'ASSIGNED_CAFES', isCurrentlyEffective: () => true },
      { role: 'CAFE_ADMIN', permissionCode: 'MAILOPS_WRITE', effect: 'ALLOW', scope: 'ASSIGNED_CAFES', isCurrentlyEffective: () => true },
    ]);
  });

  // Mock SystemCommunicationSettings
  t.mock.method(SystemCommunicationSettings, 'findOne', async () => inMemorySettings);
  t.mock.method(SystemCommunicationSettings, 'create', async (doc) => {
    inMemorySettings = { ...doc, save: async function () { return this; } };
    return inMemorySettings;
  });

  // Mock InboundEmailMessage
  t.mock.method(InboundEmailMessage, 'find', (query) => {
    let list = inMemoryInbound;
    if (query?.queueStatus) list = list.filter((i) => i.queueStatus === query.queueStatus);
    if (query?.cafeId) list = list.filter((i) => i.cafeId === query.cafeId);
    return createQueryWrapper(list);
  });
  t.mock.method(InboundEmailMessage, 'findOne', async (query) => {
    if (query?.inboundId) return inMemoryInbound.find((i) => i.inboundId === query.inboundId) || null;
    if (query?.gmailMessageId) return inMemoryInbound.find((i) => i.gmailMessageId === query.gmailMessageId) || null;
    return null;
  });
  t.mock.method(InboundEmailMessage, 'countDocuments', async (query) => {
    let list = inMemoryInbound;
    if (query?.queueStatus) list = list.filter((i) => i.queueStatus === query.queueStatus);
    if (query?.isBecSuspected) list = list.filter((i) => i.isBecSuspected === query.isBecSuspected);
    if (query?.isQuarantined) list = list.filter((i) => i.isQuarantined === query.isQuarantined);
    return list.length;
  });
  t.mock.method(InboundEmailMessage, 'create', async (doc) => {
    const item = { ...doc, internalNotes: doc.internalNotes || [], save: async function () { return this; } };
    inMemoryInbound.push(item);
    return item;
  });

  // Mock NotificationOutbox
  t.mock.method(NotificationOutbox, 'find', (query) => {
    let list = inMemoryOutbox;
    if (query?.status) list = list.filter((o) => o.status === query.status);
    return createQueryWrapper(list);
  });
  t.mock.method(NotificationOutbox, 'findOne', async (query) => {
    if (query?.outboxId) return inMemoryOutbox.find((o) => o.outboxId === query.outboxId) || null;
    return null;
  });
  t.mock.method(NotificationOutbox, 'countDocuments', async (query) => {
    let list = inMemoryOutbox;
    if (query?.status) list = list.filter((o) => o.status === query.status);
    return list.length;
  });
  t.mock.method(NotificationOutbox, 'create', async (doc) => {
    const item = { ...doc, retryCount: doc.retryCount || 0, save: async function () { return this; } };
    inMemoryOutbox.push(item);
    return item;
  });

  // Mock MailThread
  t.mock.method(MailThread, 'find', () => createQueryWrapper(inMemoryThreads));
  t.mock.method(MailThread, 'findOne', async (query) => inMemoryThreads.find((t) => t.gmailThreadId === query.gmailThreadId || t.threadId === query.threadId) || null);
  t.mock.method(MailThread, 'countDocuments', async () => inMemoryThreads.length);
  t.mock.method(MailThread, 'create', async (doc) => {
    const item = { ...doc, save: async function () { return this; } };
    inMemoryThreads.push(item);
    return item;
  });

  // Mock MailDraft
  t.mock.method(MailDraft, 'find', () => createQueryWrapper(inMemoryDrafts));
  t.mock.method(MailDraft, 'findOne', async (query) => inMemoryDrafts.find((d) => d.draftId === query.draftId) || null);
  t.mock.method(MailDraft, 'countDocuments', async () => inMemoryDrafts.length);
  t.mock.method(MailDraft, 'create', async (doc) => {
    const item = { ...doc, save: async function () { return this; } };
    inMemoryDrafts.push(item);
    return item;
  });

  // Mock MailCase
  t.mock.method(MailCase, 'find', () => createQueryWrapper(inMemoryCases));
  t.mock.method(MailCase, 'countDocuments', async () => inMemoryCases.length);
  t.mock.method(MailCase, 'create', async (doc) => {
    const item = { ...doc, save: async function () { return this; } };
    inMemoryCases.push(item);
    return item;
  });

  // Mock MailTemplate
  t.mock.method(MailTemplate, 'find', () => createQueryWrapper(inMemoryTemplates));
  t.mock.method(MailTemplate, 'countDocuments', async () => inMemoryTemplates.length);
  t.mock.method(MailTemplate, 'create', async (doc) => {
    const item = { ...doc, save: async function () { return this; } };
    inMemoryTemplates.push(item);
    return item;
  });

  // Mock MailAutomationRule
  t.mock.method(MailAutomationRule, 'find', () => createQueryWrapper(inMemoryRules));
  t.mock.method(MailAutomationRule, 'findOne', async (query) => inMemoryRules.find((r) => r.ruleId === query.ruleId) || null);
  t.mock.method(MailAutomationRule, 'countDocuments', async () => inMemoryRules.length);
  t.mock.method(MailAutomationRule, 'create', async (doc) => {
    const item = { ...doc, save: async function () { return this; } };
    inMemoryRules.push(item);
    return item;
  });

  // Mock SenderIdentity
  t.mock.method(SenderIdentity, 'find', () => createQueryWrapper(inMemoryIdentities));
  t.mock.method(SenderIdentity, 'countDocuments', async () => inMemoryIdentities.length);
  t.mock.method(SenderIdentity, 'create', async (doc) => {
    const item = { ...doc, save: async function () { return this; } };
    inMemoryIdentities.push(item);
    return item;
  });

  // Mock Vendor
  t.mock.method(Vendor, 'findOne', () => createQueryWrapper(null));

  // ── TEST CASES ──────────────────────────────────────────────────────────────

  await t.test('1. GET /api/v1/mailops/status returns provider health and Zamorin Send Budget', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/mailops/status',
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.provider, 'GMAIL_API');
    assert.equal(res.body.oauthStatus, 'CONNECTED');
    assert.equal(res.body.kpis.dailySendBudgetLimit, 500);
  });

  await t.test('2. Inbound ingestion ingests message and deduplicates by gmailMessageId', async () => {
    const ingest1 = await MailOpsService.ingestInboundMessage({
      organisationId: 'ORG-ZAMORIN',
      gmailMessageId: 'GMAIL-MSG-001',
      gmailThreadId: 'GMAIL-THRD-001',
      senderEmail: 'vendor@supplier.com',
      senderName: 'Supplier Co',
      subject: 'Fresh Milk Dispatch Advice',
      bodyText: 'Attached is the dispatch challan for today.',
      bodyHtml: '<p>Attached is the dispatch challan.</p>',
    });

    assert.equal(ingest1.duplicate, false);
    assert.ok(ingest1.message.inboundId);

    // Ingest duplicate
    const ingest2 = await MailOpsService.ingestInboundMessage({
      organisationId: 'ORG-ZAMORIN',
      gmailMessageId: 'GMAIL-MSG-001',
      gmailThreadId: 'GMAIL-THRD-001',
      senderEmail: 'vendor@supplier.com',
      subject: 'Fresh Milk Dispatch Advice',
    });

    assert.equal(ingest2.duplicate, true);
    assert.equal(inMemoryInbound.length, 1);
  });

  let becMessageId = null;

  await t.test('3. Inbound ingestion flags BEC bank change phrase with CRITICAL quarantine', async () => {
    const becIngest = await MailOpsService.ingestInboundMessage({
      organisationId: 'ORG-ZAMORIN',
      gmailMessageId: 'GMAIL-MSG-BEC-99',
      gmailThreadId: 'GMAIL-THRD-002',
      senderEmail: 'spoofed@vendor.com',
      subject: 'URGENT: Change Bank Account for Invoice Payment',
      bodyText: 'Please update our bank account details and pay to new account immediately.',
    });

    assert.equal(becIngest.duplicate, false);
    assert.equal(becIngest.message.isBecSuspected, true);
    assert.equal(becIngest.message.riskScore, 'CRITICAL');
    assert.equal(becIngest.message.queueStatus, 'QUARANTINE');
    becMessageId = becIngest.message.inboundId;
  });

  await t.test('4. Inbound ingestion sanitizes dangerous HTML scripts', () => {
    const dirty = '<p>Normal text</p><script>alert("xss")</script><img src="x" onerror="stealCookie()">';
    const clean = MailOpsService.sanitizeHtml(dirty);
    assert.ok(!clean.includes('<script>'));
    assert.ok(!clean.includes('onerror'));
  });

  let outboxId = null;

  await t.test('5. POST /api/v1/mailops/compose queues operational email with correlation ID', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/mailops/compose',
      headers: { Authorization: 'Bearer token_malformed_master' },
      body: {
        to: 'vendor@beans.com',
        subject: 'Weekly Coffee Bean PO Inquiry',
        bodyPlain: 'Please confirm stock availability for Arabica beans.',
        cafeId: 'ZC-0001',
      },
    });

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.outboxItem.outboxId);
    assert.ok(res.body.outboxItem.correlationId);
    assert.equal(res.body.outboxItem.status, 'QUEUED');
    outboxId = res.body.outboxItem.outboxId;
  });

  await t.test('6. POST /api/v1/mailops/outbox/:id/retry reschedules outbox item', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/mailops/outbox/${outboxId}/retry`,
      headers: { Authorization: 'Bearer token_malformed_master' },
      body: {},
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.item.status, 'QUEUED');
    assert.equal(res.body.item.retryCount, 1);
  });

  await t.test('7. POST /api/v1/mailops/outbox/pause and resume governance by Primary Master', async () => {
    const pauseRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/mailops/outbox/pause',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {},
    });

    assert.equal(pauseRes.statusCode, 200);
    assert.equal(pauseRes.body.outboundPaused, true);

    const resumeRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/mailops/outbox/resume',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {},
    });

    assert.equal(resumeRes.statusCode, 200);
    assert.equal(resumeRes.body.outboundPaused, false);
  });

  await t.test('8. Malformed MASTER is denied Primary-only pause queue with 403', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/mailops/outbox/pause',
      headers: { Authorization: 'Bearer token_malformed_master' },
      body: {},
    });

    assert.equal(res.statusCode, 403);
  });

  await t.test('9. POST /api/v1/mailops/drafts saves versioned operational draft', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/mailops/drafts',
      headers: { Authorization: 'Bearer token_malformed_master' },
      body: {
        to: 'roaster@zamorin.com',
        subject: 'Draft Coffee Bean Order',
        bodyPlain: 'Draft notes on bean shipment.',
      },
    });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.draft.version, 1);
    assert.equal(res.body.draft.status, 'DRAFT');
  });

  await t.test('10. POST /api/v1/mailops/cases groups multi-thread communications into business case', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/mailops/cases',
      headers: { Authorization: 'Bearer token_malformed_master' },
      body: {
        title: 'Supplier Invoice Discrepancy Case',
        entityType: 'PURCHASE_ORDER',
        entityId: 'PO-2026-0012',
        priority: 'HIGH',
      },
    });

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.case.caseId);
    assert.equal(res.body.case.entityId, 'PO-2026-0012');
  });

  await t.test('11. POST /api/v1/mailops/templates creates operational template', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/mailops/templates',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        name: 'PO Dispatch Notice',
        category: 'PURCHASE_ORDER',
        subjectTemplate: 'Purchase Order {{po.number}} from Zamorin',
        bodyTemplateHtml: '<p>Dear {{vendor.name}}, please find PO attached.</p>',
      },
    });

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.template.templateId);
    assert.equal(res.body.template.category, 'PURCHASE_ORDER');
  });

  await t.test('12. POST /api/v1/mailops/automation-rules and dry run simulation', async () => {
    const ruleRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/mailops/automation-rules',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        name: 'Auto-route Milk Invoices to Finance',
        triggerType: 'INBOUND_RECEIVED',
        conditions: { senderPattern: 'supplier.com' },
        actions: { routeToModule: 'FINANCE' },
      },
    });

    assert.equal(ruleRes.statusCode, 201);
    const ruleId = ruleRes.body.rule.ruleId;

    const dryRunRes = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/mailops/automation-rules/${ruleId}/dry-run`,
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {},
    });

    assert.equal(dryRunRes.statusCode, 200);
    assert.ok(dryRunRes.body.sampleEvaluated !== undefined);
  });

  await t.test('13. POST /api/v1/mailops/sender-identities creates verified send-as identity for Primary', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/mailops/sender-identities',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        email: 'procurement@zamorin.com',
        displayName: 'Zamorin Procurement Desk',
      },
    });

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.identity.identityId);
    assert.equal(res.body.identity.displayName, 'Zamorin Procurement Desk');
  });

  await t.test('14. Primary Master releases BEC quarantine message', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/mailops/inbound/${becMessageId}/release-quarantine`,
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {},
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.messageDoc.isQuarantined, false);
    assert.equal(res.body.messageDoc.queueStatus, 'REQUIRES_ACTION');
  });

  await t.test('15. Malformed MASTER is denied quarantine release with 403', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/mailops/inbound/${becMessageId}/release-quarantine`,
      headers: { Authorization: 'Bearer token_malformed_master' },
      body: {},
    });

    assert.equal(res.statusCode, 403);
  });

  await t.test('16. Café Admin cross-café communication access is denied with 403', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/mailops/inbound?cafeId=ZC-0002', // Indiranagar, user only assigned to ZC-0001
      headers: { Authorization: 'Bearer token_kora_admin' },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error?.code || res.body.code, 'CAFE_ACCESS_DENIED');
  });

  await t.test('17. GET /api/v1/mailops/inbound/:id/360 returns Message 360 view', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/mailops/inbound/${becMessageId}/360`,
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.message);
    assert.ok(Array.isArray(res.body.threadMessages));
  });

  await t.test('18. GET /api/v1/mailops/integrity evaluates 18 checks and flags health status', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/mailops/integrity',
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.checksEvaluated, 18);
    assert.ok(res.body.status);
  });
});
