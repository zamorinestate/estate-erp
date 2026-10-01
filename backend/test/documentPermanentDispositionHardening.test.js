'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { BusinessDocument } = require('../src/models/BusinessDocument');
const { DocumentAttachmentService } = require('../src/services/documentAttachmentService');
const { documentStorageAdapter } = require('../src/services/documentStorageAdapter');
const auditService = require('../src/services/auditService');

function eligibleDocument(overrides = {}) {
  return {
    _id: 'DOC-MONGO-1',
    documentId: 'DOC-TEST-GLOBAL-20260930-ABC123',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'GLOBAL',
    classification: 'GENERAL',
    documentType: 'GENERAL_DOCUMENT',
    documentStatus: 'VERIFIED',
    status: 'VERIFIED',
    legalHold: false,
    proceedingHold: false,
    investigationHold: false,
    retentionUntil: new Date('2026-01-01T00:00:00Z'),
    dispositionEligibleAt: new Date('2026-01-01T00:00:00Z'),
    dispositionState: 'NONE',
    storageObjectKey: 'ORG-ZAMORIN/GLOBAL/general/doc.pdf',
    storageKey: 'ORG-ZAMORIN/GLOBAL/general/doc.pdf',
    storagePath: null,
    gridFsFileId: null,
    quarantineObjectKey: null,
    versions: [],
    currentVersion: 1,
    originalFilename: 'doc.pdf',
    sizeBytes: 100,
    sha256: 'a'.repeat(64),
    checksum: 'a'.repeat(64),
    ...overrides,
  };
}

function masterAuth() {
  return {
    userId: 'MU-0001',
    name: 'Primary Master',
    role: 'MASTER',
    isPrimaryMaster: true,
    organisationId: 'ORG-ZAMORIN',
    assignedCafeIds: [],
  };
}

test('DOC-DISP-001: document permanent disposition requires explicit confirmation and durable state machine', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/documentAttachmentService.js'), 'utf8');
  assert.ok(source.includes('PERMANENTLY_DISPOSE_DOCUMENT'));
  assert.ok(source.includes('DOCUMENT_DISPOSITION_AUDIT_NOT_CONFIRMED'));
  assert.ok(source.includes("dispositionState: 'STORAGE_DELETING'"));
  assert.ok(source.includes("dispositionState: 'STORAGE_DELETED_PENDING_METADATA'"));
  assert.ok(source.includes("dispositionState: 'COMPLETED'"));
  assert.ok(source.includes('DOCUMENT_DISPOSITION_ALREADY_IN_PROGRESS'));
});

test('DOC-DISP-002: storage object that remains after delete prevents DISPOSED state', async () => {
  const originals = {
    findOne: BusinessDocument.findOne,
    findOneAndUpdate: BusinessDocument.findOneAndUpdate,
    updateOne: BusinessDocument.updateOne,
    exists: documentStorageAdapter.exists,
    delete: documentStorageAdapter.delete,
    audit: auditService.recordAuditEvent,
  };

  const doc = eligibleDocument();
  BusinessDocument.findOne = async () => doc;
  BusinessDocument.findOneAndUpdate = async () => ({ ...doc, dispositionState: 'STORAGE_DELETING', dispositionStartedAt: new Date() });
  const updates = [];
  BusinessDocument.updateOne = async (filter, update) => { updates.push({ filter, update }); return { matchedCount: 1, modifiedCount: 1 }; };
  let existsCalls = 0;
  documentStorageAdapter.exists = async () => { existsCalls += 1; return true; };
  documentStorageAdapter.delete = async () => true;
  auditService.recordAuditEvent = async () => ({ auditEventId: 'AUD-DOC-AUTH-1' });

  try {
    await assert.rejects(
      async () => DocumentAttachmentService.permanentDeleteDocument({
        documentId: doc.documentId,
        organisationId: doc.organisationId,
        reason: 'Verified permanent disposition test reason.',
        confirmation: 'PERMANENTLY_DISPOSE_DOCUMENT',
        auth: masterAuth(),
      }),
      (err) => err.code === 'DOCUMENT_STORAGE_DELETE_UNVERIFIED'
    );
    assert.equal(existsCalls >= 2, true);
    assert.ok(updates.some((entry) => entry.update?.$set?.dispositionState === 'FAILED'));
  } finally {
    BusinessDocument.findOne = originals.findOne;
    BusinessDocument.findOneAndUpdate = originals.findOneAndUpdate;
    BusinessDocument.updateOne = originals.updateOne;
    documentStorageAdapter.exists = originals.exists;
    documentStorageAdapter.delete = originals.delete;
    auditService.recordAuditEvent = originals.audit;
  }
});

test('DOC-DISP-003: completion-audit failure leaves storage-deleted metadata pending instead of falsely DISPOSED', async () => {
  const originals = {
    findOne: BusinessDocument.findOne,
    findOneAndUpdate: BusinessDocument.findOneAndUpdate,
    updateOne: BusinessDocument.updateOne,
    exists: documentStorageAdapter.exists,
    delete: documentStorageAdapter.delete,
    audit: auditService.recordAuditEvent,
  };

  const doc = eligibleDocument();
  BusinessDocument.findOne = async () => doc;
  let findOneAndUpdateCalls = 0;
  BusinessDocument.findOneAndUpdate = async (filter, update) => {
    findOneAndUpdateCalls += 1;
    if (findOneAndUpdateCalls === 1) {
      return { ...doc, dispositionState: 'STORAGE_DELETING', dispositionStartedAt: update.$set.dispositionStartedAt };
    }
    if (findOneAndUpdateCalls === 2) {
      return { ...doc, dispositionState: 'STORAGE_DELETED_PENDING_METADATA', dispositionStartedAt: doc.dispositionStartedAt };
    }
    throw new Error('Final DISPOSED update must not run after completion-audit failure');
  };
  BusinessDocument.updateOne = async () => ({ matchedCount: 1, modifiedCount: 1 });
  let existsCalls = 0;
  documentStorageAdapter.exists = async () => { existsCalls += 1; return existsCalls === 1; };
  documentStorageAdapter.delete = async () => true;
  let auditCalls = 0;
  auditService.recordAuditEvent = async () => {
    auditCalls += 1;
    return auditCalls === 1 ? { auditEventId: 'AUD-DOC-AUTH-2' } : null;
  };

  try {
    await assert.rejects(
      async () => DocumentAttachmentService.permanentDeleteDocument({
        documentId: doc.documentId,
        organisationId: doc.organisationId,
        reason: 'Verified permanent disposition completion audit test.',
        confirmation: 'PERMANENTLY_DISPOSE_DOCUMENT',
        auth: masterAuth(),
      }),
      (err) => err.code === 'DOCUMENT_DISPOSITION_COMPLETION_AUDIT_FAILED'
    );
    assert.equal(findOneAndUpdateCalls, 2);
  } finally {
    BusinessDocument.findOne = originals.findOne;
    BusinessDocument.findOneAndUpdate = originals.findOneAndUpdate;
    BusinessDocument.updateOne = originals.updateOne;
    documentStorageAdapter.exists = originals.exists;
    documentStorageAdapter.delete = originals.delete;
    auditService.recordAuditEvent = originals.audit;
  }
});

test('DOC-DISP-004: local storage adapter does not swallow unlink failures', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/storage/LocalDevelopmentStorageAdapter.js'), 'utf8');
  const start = source.indexOf('async deleteObject');
  const end = source.indexOf('async copyObject', start);
  const block = source.slice(start, end);
  assert.equal(block.includes('.catch(() => {})'), false);
  assert.ok(block.includes('await fs.promises.unlink(fullPath)'));
});

test('DOC-DISP-005: document storage adapter can verify/delete GridFS objects by fileId', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/documentStorageAdapter.js'), 'utf8');
  assert.ok(source.includes('async exists({ storageKey = null, fileId = null } = {})'));
  assert.ok(source.includes('async delete({ storageKey = null, fileId = null } = {})'));
  assert.ok(source.includes('provider.deleteObject({ objectKey: storageKey, fileId })'));
});

test('DOC-RET-001: legal-hold release and retention shortening require immutable pre-authorization', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/documentAttachmentService.js'), 'utf8');
  const start = source.indexOf('static async updateRetentionPolicy');
  const end = source.indexOf('Rescans a quarantined', start);
  const block = source.slice(start, end);

  assert.ok(block.includes('releasesActiveHold'));
  assert.ok(block.includes('shortensRetention'));
  assert.ok(block.includes('RETENTION_PROTECTION_RELAXATION_AUTHORIZED'));
  assert.ok(block.includes('RETENTION_RELAXATION_AUDIT_NOT_CONFIRMED'));

  const auditIndex = block.indexOf('RETENTION_PROTECTION_RELAXATION_AUTHORIZED');
  const retentionMutation = block.indexOf('doc.retentionUntil = newDate');
  const holdMutation = block.indexOf('doc.legalHold = Boolean(legalHold)');
  assert.ok(auditIndex >= 0);
  assert.ok(retentionMutation > auditIndex);
  assert.ok(holdMutation > auditIndex);
});

test('DOC-RET-002: protective retention changes stay active if post-write audit reporting fails', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/documentAttachmentService.js'), 'utf8');
  const start = source.indexOf('static async updateRetentionPolicy');
  const end = source.indexOf('Rescans a quarantined', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('Protective changes (placing a hold or extending retention) stay in'));
  assert.ok(block.includes('Protective retention change is active, but its post-write audit event could not be confirmed.'));
  assert.equal(block.includes('.catch(() => {})'), false);
});

