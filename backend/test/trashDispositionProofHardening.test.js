'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { DispositionCertificate } = require('../src/models/DispositionCertificate');

const controllerPath = path.join(__dirname, '../src/controllers/trashController.js');
const frontendPath = path.join(__dirname, '../../frontend/src/js/pages/trashBin.js');
const transactionPath = path.join(__dirname, '../src/utils/transactionHelper.js');

function read(file) { return fs.readFileSync(file, 'utf8'); }

test('TRASH-DISP-001: disposition certificate defaults every unproved stage to NOT_APPLICABLE', () => {
  const cert = new DispositionCertificate({
    certificateId: 'CERT-DISP-202609-90001',
    organisationId: 'ORG-ZAMORIN',
    trashId: 'TRASH-202609-90001',
    sourceModule: 'GENERAL',
    entityType: 'TEST_ENTITY',
    entityId: 'TEST-1',
    recordReference: 'TEST-1',
    policyId: 'RET-000001-90001',
    retentionCompletedAt: new Date(),
    executedByUserId: 'MU-0001',
  });
  assert.equal(cert.propagationStages.primaryDatabase, 'NOT_APPLICABLE');
  assert.equal(cert.propagationStages.searchIndex, 'NOT_APPLICABLE');
  assert.equal(cert.propagationStages.fileStorage, 'NOT_APPLICABLE');
  assert.equal(cert.propagationStages.cacheLayer, 'NOT_APPLICABLE');
  assert.equal(cert.propagationStages.analyticsReadModel, 'NOT_APPLICABLE');
});

test('TRASH-DISP-002: execution requires approved state, expiry, exact policy, hold clearance and durable approval proof', () => {
  const source = read(controllerPath);
  const start = source.indexOf('const executeDispositionPurge = asyncHandler');
  const end = source.indexOf('// ═════════════════════════════════════════════════════════════════════════════\n// 8. DISPOSITION CERTIFICATES', start);
  const block = source.slice(start, end);
  assert.ok(block.includes("item.lifecycleStatus !== 'DISPOSITION_APPROVED'"));
  assert.ok(block.includes('assertDispositionRetentionComplete(item)'));
  assert.ok(block.includes('assertNoActiveDispositionHold(item)'));
  assert.ok(block.includes('loadExactRetentionPolicy(item, orgId)'));
  assert.ok(block.includes('DISPOSITION_APPROVAL_PROOF_MISSING'));
  assert.ok(block.includes('PERMANENTLY_DISPOSE_TRASH_RECORD'));
  assert.ok(block.includes('DISPOSITION_EXECUTION_AUDIT_NOT_CONFIRMED'));
});

test('TRASH-DISP-003: unverified attachment deletion blocks permanent disposition', () => {
  const source = read(controllerPath);
  assert.ok(source.includes('DISPOSITION_ATTACHMENT_PURGE_UNVERIFIED'));
  assert.ok(source.includes('attached file deletion is not yet backed by a verified provider deletion workflow'));
});

test('TRASH-DISP-004: successful proof scope certifies MongoDB only and leaves unsupported stages NOT_APPLICABLE', () => {
  const source = read(controllerPath);
  const start = source.indexOf('const executeDispositionPurge = asyncHandler');
  const end = source.indexOf('// ═════════════════════════════════════════════════════════════════════════════\n// 8. DISPOSITION CERTIFICATES', start);
  const block = source.slice(start, end);
  assert.ok(block.includes("primaryDatabase: 'COMPLETED'"));
  assert.ok(block.includes("searchIndex: 'NOT_APPLICABLE'"));
  assert.ok(block.includes("fileStorage: 'NOT_APPLICABLE'"));
  assert.ok(block.includes("cacheLayer: 'NOT_APPLICABLE'"));
  assert.ok(block.includes("analyticsReadModel: 'NOT_APPLICABLE'"));
  assert.equal(block.includes("searchIndex: 'COMPLETED'"), false);
  assert.equal(block.includes("fileStorage: item.attachments?.length > 0 ? 'COMPLETED'"), false);
});

test('TRASH-DISP-005: irreversible disposition explicitly requires transaction support', () => {
  const controller = read(controllerPath);
  const transaction = read(transactionPath);
  assert.ok(controller.includes('{ requireTransactions: true }'));
  assert.ok(transaction.includes("'TRANSACTION_SUPPORT_REQUIRED'"));
  assert.ok(transaction.includes('if (requireTransactions)'));
});

test('TRASH-DISP-006: disposition execution uses expected-state compare-and-swap before payload erasure', () => {
  const source = read(controllerPath);
  const start = source.indexOf('const executeDispositionPurge = asyncHandler');
  const end = source.indexOf('// ═════════════════════════════════════════════════════════════════════════════\n// 8. DISPOSITION CERTIFICATES', start);
  const block = source.slice(start, end);
  const claim = block.indexOf('const claimed = await TrashEntry.findOneAndUpdate');
  const processing = block.indexOf("lifecycleStatus: 'DISPOSITION_PROCESSING'", claim);
  const erase = block.indexOf('claimed.payload = null', claim);
  assert.ok(claim >= 0);
  assert.ok(processing > claim);
  assert.ok(erase > processing);
  assert.ok(block.includes("lifecycleStatus: 'DISPOSITION_APPROVED'"));
  assert.ok(block.includes('dispositionApprovedAt: item.dispositionApprovedAt'));
});

test('TRASH-DISP-007: maker-checker policy cannot be self-approved', () => {
  const source = read(controllerPath);
  const start = source.indexOf('const approveDisposition = asyncHandler');
  const end = source.indexOf('const executeDispositionPurge = asyncHandler', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('policy.makerCheckerRequired === true'));
  assert.ok(block.includes("'MAKER_CHECKER_REQUIRED'"));
  assert.ok(block.includes('dispositionRequestedByUserId'));
});

test('TRASH-DISP-008: certificate PDF renders stored propagation truth instead of hardcoded deletion claims', () => {
  const source = read(controllerPath);
  assert.ok(source.includes("cert.propagationStages?.primaryDatabase || 'NOT_APPLICABLE'"));
  assert.ok(source.includes("cert.propagationStages?.searchIndex || 'NOT_APPLICABLE'"));
  assert.ok(source.includes('certificate records only disposition stages actually verified by the server'));
  assert.equal(source.includes("status: 'PURGED & UNINDEXED'"), false);
  assert.equal(source.includes("status: 'SYNCHRONIZED'"), false);
});

test('TRASH-DISP-009: UI no longer promises blanket multi-store deletion and carries explicit authorization inputs', () => {
  const source = read(frontendPath);
  assert.equal(source.includes('permanently destroy the business record across primary database, search index, and object storage'), false);
  assert.ok(source.includes('The certificate records verified stages only'));
  assert.ok(source.includes('PERMANENTLY_DISPOSE_TRASH_RECORD'));
  assert.ok(source.includes('Submit for Review'));
  assert.ok(source.includes('APPROVE_PERMANENT_DISPOSITION'));
  assert.ok(source.includes('Execute Disposition'));
});
