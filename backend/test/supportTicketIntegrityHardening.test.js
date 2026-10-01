'use strict';\n\nconst test = require('node:test');\nconst assert = require('node:assert/strict');\nconst fs = require('node:fs');\nconst path = require('node:path');\n\nfunction read(rel) {\n  return fs.readFileSync(path.join(__dirname, rel), 'utf8');\n}\n\ntest('SUP-INT-001: support case IDs are sequence-backed, not Math.random based', () => {\n  const source = read('../src/controllers/settingsController.js');\n  const start = source.indexOf('async function submitSupportTicket');\n  const end = source.indexOf('async function listMySupportTickets', start);\n  const block = source.slice(start, end);\n  assert.ok(block.includes('SequenceCounter.generateId'));\n  assert.ok(block.includes('SUPPORT_CASE_'));\n  assert.equal(block.includes('Math.random()'), false);\n});\n\ntest('SUP-INT-002: support submission never fabricates a zamorincafe email address', () => {\n  const source = read('../src/controllers/settingsController.js');\n  const start = source.indexOf('async function submitSupportTicket');\n  const end = source.indexOf('async function listMySupportTickets', start);\n  const block = source.slice(start, end);\n  assert.equal(block.includes('@zamorincafe.com'), false);\n  assert.ok(block.includes('SUPPORT_EMAIL_REQUIRED'));\n  assert.ok(block.includes("User.findOne({"));\n});\n\ntest('SUP-INT-003: support case creation and canonical audit share one transaction callback', () => {\n  const source = read('../src/controllers/settingsController.js');\n  const start = source.indexOf('async function submitSupportTicket');\n  const end = source.indexOf('async function listMySupportTickets', start);\n  const block = source.slice(start, end);\n  assert.ok(block.includes('const createOperation = async (session)'));\n  assert.ok(block.includes('await supportCase.save(session ? { session } : undefined)'));\n  assert.ok(block.includes('await auditService.recordAuditEvent'));\n  assert.ok(block.includes('executeTransactionWithRetry(createOperation)'));\n  assert.equal(block.includes('auditService.log'), false);\n  assert.equal(block.includes('catch (e) {}'), false);\n});\n\ntest('SUP-INT-004: SupportCase uniqueness is tenant scoped', () => {\n  const source = read('../src/models/SupportCase.js');\n  assert.ok(source.includes("supportCaseSchema.index({ organisationId: 1, caseId: 1 }, { unique: true })"));\n  assert.equal(source.includes("supportCaseSchema.index({ caseId: 1 }, { unique: true })"), false);\n});\n\ntest('SUP-INT-005: support audit records authenticated actor role and support entity', () => {\n  const source = read('../src/controllers/settingsController.js');\n  const start = source.indexOf('async function submitSupportTicket');\n  const end = source.indexOf('async function listMySupportTickets', start);\n  const block = source.slice(start, end);\n  assert.ok(block.includes("action: 'SETTINGS_SUPPORT_TICKET_SUBMITTED'"));\n  assert.ok(block.includes("entityType: 'SUPPORT_CASE'"));\n  assert.ok(block.includes('actorRole,'));\n});\n

test('SUP-INT-006: mutable support workflows contain no Math.random identifiers or swallowed audit writes', () => {
  const source = read('../src/controllers/settingsController.js');
  const start = source.indexOf('async function updateManageSupportTicket');
  const end = source.indexOf('// ═════════════════════════════════════════════════════════════════════════════\n// DELEGATION & COVERAGE', start);
  const block = source.slice(start, end);

  assert.equal(block.includes('Math.random()'), false);
  assert.equal(block.includes('auditService.log'), false);
  assert.equal(block.includes('catch (notifErr) {}'), false);
  assert.equal(block.includes('catch (e) {}'), false);
  assert.ok(block.includes('auditService.recordAuditEvent'));
  assert.ok(block.includes('generateSupportSequenceId'));
});

test('SUP-INT-007: support status mutation and notification enqueue share a transaction callback', () => {
  const source = read('../src/controllers/settingsController.js');
  const start = source.indexOf('async function updateManageSupportTicket');
  const end = source.indexOf('async function addSupportTicketReply', start);
  const block = source.slice(start, end);

  assert.ok(block.includes('const operation = async (session)'));
  assert.ok(block.includes('await ticket.save(session ? { session } : undefined)'));
  assert.ok(block.includes('enqueueSupportRecipientNotifications'));
  assert.ok(block.includes('session,'));
  assert.ok(block.includes('executeTransactionWithRetry(operation)'));
});

test('SUP-INT-008: support replies are sequence-backed and closed cases require explicit reopen', () => {
  const source = read('../src/controllers/settingsController.js');
  const manageStart = source.indexOf('async function addSupportTicketReply');
  const employeeStart = source.indexOf('async function addEmployeeSupportTicketReply', manageStart);
  const delegationStart = source.indexOf('// DELEGATION & COVERAGE', employeeStart);
  const manageBlock = source.slice(manageStart, employeeStart);
  const employeeBlock = source.slice(employeeStart, delegationStart);

  for (const block of [manageBlock, employeeBlock]) {
    assert.ok(block.includes('SUPPORT_RESPONSE_'));
    assert.ok(block.includes('generateSupportSequenceId'));
    assert.equal(block.includes('Math.random()'), false);
  }

  assert.ok(manageBlock.includes('SUPPORT_CASE_CLOSED'));
  assert.ok(employeeBlock.includes('TICKET_CLOSED'));
});

test('SUP-INT-009: support notifications use authoritative recipient role and email is optional for outbox only', () => {
  const source = read('../src/controllers/settingsController.js');
  const start = source.indexOf('async function enqueueSupportRecipientNotifications');
  const end = source.indexOf('async function listManageSupportTickets', start);
  const block = source.slice(start, end);

  assert.ok(block.includes('recipientRole: recipientProfile.role'));
  assert.ok(block.includes("const recipientEmail = String(recipientProfile.email || '')"));
  assert.ok(block.includes('if (recipientEmail)'));
  assert.equal(block.includes("recipientRole: 'STAFF'"), false);
});

