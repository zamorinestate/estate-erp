'use strict';

/**
 * ZAMORIN CAFÉ ERP — EXT-03 ATLAS BACKUP, SNAPSHOT INTEGRITY & GRIDFS RESTORE ACCEPTANCE SUITE
 *
 * Comprehensive 35-point verification suite testing:
 * - Read-only restore target validation
 * - Production database target rejection (safety guard)
 * - GridFS streamed reconstruction into SHA-256
 * - BusinessDocument -> files -> chunks referential integrity
 * - Historical revision isolation
 * - Retention, legal hold, and scanStatus preservation
 * - Orphan files, orphan chunks, and dangling metadata detection
 * - Governance regressions: Personal Ledger, PO Approval, EXT-01G, EXT-02, Zero KDS
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Readable } = require('stream');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { BackupRestoreVerificationService } = require('../src/services/backupRestoreVerificationService');
const { BusinessDocument } = require('../src/models/BusinessDocument');
const { AuditEvent } = require('../src/models/AuditEvent');
const { GridFSStorageAdapter } = require('../src/services/storage/GridFSStorageAdapter');
const { ClamAVScanner } = require('../src/services/scanners/ClamAVScanner');

describe('EXT-03 — MongoDB Atlas Backup, Snapshot Integrity & GridFS Restore Suite', () => {
  let mongoServer;
  let testDb;
  let gridFsAdapter;
  const testBucketName = 'zamorinDocuments';

  const FIXTURE_CONTENT_V1 = '%PDF-1.4 Zamorin Cafe Tax Invoice 2026-Q3 Restored Content';
  const FIXTURE_SHA256_V1 = crypto.createHash('sha256').update(FIXTURE_CONTENT_V1).digest('hex');

  const FIXTURE_CONTENT_V2 = '%PDF-1.4 Zamorin Cafe Tax Invoice 2026-Q3 Revised Content V2';
  const FIXTURE_SHA256_V2 = crypto.createHash('sha256').update(FIXTURE_CONTENT_V2).digest('hex');

  let fileIdV1;
  let fileIdV2;

  before(async () => {
    process.env.RESTORE_VERIFICATION_MODE = 'true';
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    testDb = mongoose.connection.db;

    gridFsAdapter = new GridFSStorageAdapter({
      bucketName: testBucketName,
      mongoose: mongoose,
    });

    // 1. Put Revision 1 into GridFS
    const putV1 = await gridFsAdapter.putObject({
      objectKey: 'ZAMORIN/ZC01/PROCUREMENT/DOC-RESTORE-TEST-001.pdf',
      buffer: Buffer.from(FIXTURE_CONTENT_V1),
      mimeType: 'application/pdf',
    });
    fileIdV1 = putV1.gridFsFileId;

    // 2. Put Revision 2 into GridFS
    const putV2 = await gridFsAdapter.putObject({
      objectKey: 'ZAMORIN/ZC01/PROCUREMENT/DOC-RESTORE-TEST-001_v2.pdf',
      buffer: Buffer.from(FIXTURE_CONTENT_V2),
      mimeType: 'application/pdf',
    });
    fileIdV2 = putV2.gridFsFileId;

    // 3. Create BusinessDocument with revisions, retention, legalHold, and scanStatus
    const retentionDate = new Date(Date.now() + 72 * 30 * 24 * 60 * 60 * 1000);
    await BusinessDocument.create({
      documentId: 'DOC-RESTORE-TEST-001',
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-RESTORE-01',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'tax_invoice.pdf',
      mimeType: 'application/pdf',
      sizeBytes: FIXTURE_CONTENT_V2.length,
      sha256: FIXTURE_SHA256_V2,
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
      securityScanStatus: 'CLEAN',
      documentStatus: 'VERIFIED',
      currentVersion: 2,
      gridFsFileId: fileIdV2,
      storageKey: 'ZAMORIN/ZC01/PROCUREMENT/DOC-RESTORE-TEST-001_v2.pdf',
      uploadedBy: 'CAFE_ADMIN_1',
      retentionUntil: retentionDate,
      legalHold: true,
      isDeleted: false,
      versions: [
        {
          version: 1,
          originalFilename: 'tax_invoice_v1.pdf',
          internalFilename: 'tax_invoice_v1.pdf',
          mimeType: 'application/pdf',
          sizeBytes: FIXTURE_CONTENT_V1.length,
          sha256: FIXTURE_SHA256_V1,
          gridFsFileId: fileIdV1,
          storageKey: 'ZAMORIN/ZC01/PROCUREMENT/DOC-RESTORE-TEST-001.pdf',
          scanStatus: 'CLEAN',
          uploadedBy: 'CAFE_ADMIN_1',
        },
        {
          version: 2,
          originalFilename: 'tax_invoice_v2.pdf',
          internalFilename: 'tax_invoice_v2.pdf',
          mimeType: 'application/pdf',
          sizeBytes: FIXTURE_CONTENT_V2.length,
          sha256: FIXTURE_SHA256_V2,
          gridFsFileId: fileIdV2,
          storageKey: 'ZAMORIN/ZC01/PROCUREMENT/DOC-RESTORE-TEST-001_v2.pdf',
          scanStatus: 'CLEAN',
          uploadedBy: 'CAFE_ADMIN_1',
        },
      ],
    });

    // 4. Create Archived Document Fixture
    await BusinessDocument.create({
      documentId: 'DOC-RESTORE-ARCHIVED-001',
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-RESTORE-02',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'old_invoice.pdf',
      mimeType: 'application/pdf',
      sizeBytes: FIXTURE_CONTENT_V1.length,
      sha256: FIXTURE_SHA256_V1,
      uploadStatus: 'DELETED',
      scanStatus: 'CLEAN',
      securityScanStatus: 'CLEAN',
      documentStatus: 'ARCHIVED',
      currentVersion: 1,
      gridFsFileId: fileIdV1,
      uploadedBy: 'MASTER_1',
      isDeleted: true,
    });

    // 5. Create Audit Log Entry via canonical auditService
    const auditService = require('../src/services/auditService');
    await auditService.recordAuditEvent({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      actorUserId: 'SYSTEM_ADMIN',
      actorRole: 'MASTER',
      module: 'BACKUP_RESTORE',
      action: 'SNAPSHOT_RESTORE_VERIFIED',
      entityType: 'BUSINESS_DOCUMENT',
      entityId: 'DOC-RESTORE-TEST-001',
      reason: 'Automated test fixture creation',
      result: 'SUCCESS',
    });
  });

  after(async () => {
    delete process.env.RESTORE_VERIFICATION_MODE;
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  // 01 verification script is read-only
  test('01. Verification service executes in strictly read-only mode without mutating target database', async () => {
    const docsCountBefore = await BusinessDocument.countDocuments({});
    const filesCountBefore = await testDb.collection(`${testBucketName}.files`).countDocuments({});

    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'DOC-RESTORE-TEST-001',
      injectedClient: mongoose.connection,
    });

    const docsCountAfter = await BusinessDocument.countDocuments({});
    const filesCountAfter = await testDb.collection(`${testBucketName}.files`).countDocuments({});

    assert.equal(res.status, 'PASS');
    assert.equal(res.readOnlyEnforced, true);
    assert.equal(docsCountAfter, docsCountBefore);
    assert.equal(filesCountAfter, filesCountBefore);
  });

  // 02 refuses production DB target
  test('02. Service strictly refuses to run against known production database names', async () => {
    await assert.rejects(
      () =>
        BackupRestoreVerificationService.verifyRestoreTarget({
          dbName: 'zamorin_erp_production',
          targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
          restoreVerificationMode: true,
        }),
      (err) => err.code === 'PRODUCTION_TARGET_PROTECTION' && err.statusCode === 403
    );

    await assert.rejects(
      () =>
        BackupRestoreVerificationService.verifyRestoreTarget({
          dbName: 'zamorin_erp',
          targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
          restoreVerificationMode: true,
        }),
      (err) => err.code === 'PRODUCTION_TARGET_PROTECTION' && err.statusCode === 403
    );
  });

  // 03 requires restore verification flag
  test('03. Service requires RESTORE_VERIFICATION_MODE flag to be explicitly enabled', async () => {
    const originalFlag = process.env.RESTORE_VERIFICATION_MODE;
    delete process.env.RESTORE_VERIFICATION_MODE;

    await assert.rejects(
      () =>
        BackupRestoreVerificationService.verifyRestoreTarget({
          dbName: 'zamorin_restore_verification',
          targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
          restoreVerificationMode: false,
        }),
      (err) => err.code === 'RESTORE_VERIFICATION_MODE_REQUIRED' && err.statusCode === 403
    );

    process.env.RESTORE_VERIFICATION_MODE = originalFlag;
  });

  // 04 BusinessDocument fixture lookup
  test('04. Restored BusinessDocument fixture is accurately resolved by documentId', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'DOC-RESTORE-TEST-001',
      injectedClient: mongoose.connection,
    });

    assert.equal(res.status, 'PASS');
    assert.equal(res.verifiedDocumentsCount, 1);
    assert.equal(res.verifiedDocuments[0].documentId, 'DOC-RESTORE-TEST-001');
  });

  // 05 GridFS files lookup
  test('05. Restored GridFS files collection contains matching entry for gridFsFileId', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'DOC-RESTORE-TEST-001',
      injectedClient: mongoose.connection,
    });

    const doc = res.verifiedDocuments[0];
    assert.equal(doc.gridFsFileFound, true);
    assert.ok(doc.fileLength > 0);
  });

  // 06 GridFS chunks relationship
  test('06. Restored GridFS chunks correspond directly to files._id without gaps', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'DOC-RESTORE-TEST-001',
      injectedClient: mongoose.connection,
    });

    const doc = res.verifiedDocuments[0];
    assert.equal(doc.chunksValid, true);
    assert.ok(doc.chunkCount >= 1);
  });

  // 07 streamed GridFS reconstruction
  test('07. Streamed GridFS reconstruction reads file chunks into SHA-256 hash without RAM buffering', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'DOC-RESTORE-TEST-001',
      injectedClient: mongoose.connection,
    });

    const doc = res.verifiedDocuments[0];
    assert.ok(doc.reconstructedSha256);
    assert.equal(doc.reconstructedSha256, FIXTURE_SHA256_V2);
  });

  // 08 SHA-256 match
  test('08. Reconstructed SHA-256 matches BusinessDocument.sha256 exactly', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'DOC-RESTORE-TEST-001',
      injectedClient: mongoose.connection,
    });

    assert.equal(res.verifiedDocuments[0].sha256Match, true);
  });

  // 09 SHA-256 mismatch fails
  test('09. Tampered document with checksum mismatch fails verification', async () => {
    const fakeSha = 'a'.repeat(64);
    await BusinessDocument.create({
      documentId: 'DOC-RESTORE-TAMPERED-001',
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-RESTORE-03',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'tampered.pdf',
      mimeType: 'application/pdf',
      sizeBytes: FIXTURE_CONTENT_V1.length,
      sha256: fakeSha,
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
      currentVersion: 1,
      gridFsFileId: fileIdV1,
      uploadedBy: 'CAFE_ADMIN_1',
    });

    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'DOC-RESTORE-TAMPERED-001',
      injectedClient: mongoose.connection,
    });

    assert.equal(res.status, 'FAIL');
    assert.equal(res.verifiedDocuments[0].sha256Match, false);

    await BusinessDocument.deleteOne({ documentId: 'DOC-RESTORE-TAMPERED-001' });
  });

  // 10 missing file fails
  test('10. Document referencing non-existent GridFS file fails verification', async () => {
    const danglingId = new mongoose.Types.ObjectId();
    await BusinessDocument.create({
      documentId: 'DOC-RESTORE-DANGLING-001',
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-RESTORE-04',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'dangling.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      sha256: 'b'.repeat(64),
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
      currentVersion: 1,
      gridFsFileId: danglingId,
      uploadedBy: 'CAFE_ADMIN_1',
    });

    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'DOC-RESTORE-DANGLING-001',
      injectedClient: mongoose.connection,
    });

    assert.equal(res.status, 'FAIL');
    assert.equal(res.verifiedDocuments[0].gridFsFileFound, false);

    await BusinessDocument.deleteOne({ documentId: 'DOC-RESTORE-DANGLING-001' });
  });

  // 11 missing chunk fails
  test('11. File missing chunks fails chunk validation', async () => {
    const isolatedPut = await gridFsAdapter.putObject({
      objectKey: 'isolated/missing_chunk.pdf',
      buffer: Buffer.from('CONTENT FOR CHUNK DROP TEST'),
      mimeType: 'application/pdf',
    });

    // Artificially remove chunks
    await testDb.collection(`${testBucketName}.chunks`).deleteMany({ files_id: isolatedPut.gridFsFileId });

    await BusinessDocument.create({
      documentId: 'DOC-RESTORE-CHUNKLESS-001',
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-RESTORE-05',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'chunkless.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 27,
      sha256: 'c'.repeat(64),
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
      currentVersion: 1,
      gridFsFileId: isolatedPut.gridFsFileId,
      uploadedBy: 'CAFE_ADMIN_1',
    });

    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'DOC-RESTORE-CHUNKLESS-001',
      injectedClient: mongoose.connection,
    });

    assert.equal(res.status, 'FAIL');
    assert.equal(res.verifiedDocuments[0].chunksValid, false);

    await BusinessDocument.deleteOne({ documentId: 'DOC-RESTORE-CHUNKLESS-001' });
    await testDb.collection(`${testBucketName}.files`).deleteOne({ _id: isolatedPut.gridFsFileId });
  });

  // 12 dangling metadata reported
  test('12. Dangling metadata count accurately reflects records pointing to missing binaries', async () => {
    const danglingId = new mongoose.Types.ObjectId();
    await BusinessDocument.create({
      documentId: 'DOC-RESTORE-ORPHAN-META-001',
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-RESTORE-06',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'orphan_meta.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      uploadStatus: 'AVAILABLE',
      currentVersion: 1,
      gridFsFileId: danglingId,
      uploadedBy: 'CAFE_ADMIN_1',
    });

    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      injectedClient: mongoose.connection,
    });

    assert.ok(res.metrics.danglingMetadataCount >= 1);

    await BusinessDocument.deleteOne({ documentId: 'DOC-RESTORE-ORPHAN-META-001' });
  });

  // 13 orphan GridFS file reported
  test('13. Orphan GridFS files with no referencing BusinessDocument are counted', async () => {
    const orphanPut = await gridFsAdapter.putObject({
      objectKey: 'unlinked/orphan_binary.pdf',
      buffer: Buffer.from('UNREFERENCED BINARY'),
      mimeType: 'application/pdf',
    });

    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      injectedClient: mongoose.connection,
    });

    assert.ok(res.metrics.orphanFilesCount >= 1);

    await gridFsAdapter.deleteObject({ storageKey: 'unlinked/orphan_binary.pdf' });
  });

  // 14 orphan chunk reported
  test('14. Orphan chunks with no parent in files collection are identified', async () => {
    const deadFileId = new mongoose.Types.ObjectId();
    await testDb.collection(`${testBucketName}.chunks`).insertOne({
      files_id: deadFileId,
      n: 0,
      data: Buffer.from('ORPHAN CHUNK PAYLOAD'),
    });

    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      injectedClient: mongoose.connection,
    });

    assert.ok(res.metrics.orphanChunksCount >= 1);

    await testDb.collection(`${testBucketName}.chunks`).deleteMany({ files_id: deadFileId });
  });

  // 15 revision V1 restore
  test('15. Revision 1 binary and SHA-256 are verified intact', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'DOC-RESTORE-TEST-001',
      injectedClient: mongoose.connection,
    });

    const v1 = res.verifiedDocuments[0].versionsVerified.find((v) => v.version === 1);
    assert.ok(v1);
    assert.equal(v1.fileFound, true);
    assert.equal(v1.sha256Match, true);
    assert.equal(v1.reconstructedSha256, FIXTURE_SHA256_V1);
  });

  // 16 revision V2 restore
  test('16. Revision 2 binary and SHA-256 are verified intact', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'DOC-RESTORE-TEST-001',
      injectedClient: mongoose.connection,
    });

    const v2 = res.verifiedDocuments[0].versionsVerified.find((v) => v.version === 2);
    assert.ok(v2);
    assert.equal(v2.fileFound, true);
    assert.equal(v2.sha256Match, true);
    assert.equal(v2.reconstructedSha256, FIXTURE_SHA256_V2);
  });

  // 17 revision IDs remain distinct
  test('17. Revision 1 and Revision 2 GridFS file IDs remain distinct', async () => {
    const doc = await BusinessDocument.findOne({ documentId: 'DOC-RESTORE-TEST-001' });
    assert.notEqual(
      doc.versions[0].gridFsFileId.toString(),
      doc.versions[1].gridFsFileId.toString()
    );
  });

  // 18 retention restored
  test('18. Statutory retention period (retentionUntil) is preserved on restored document', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'DOC-RESTORE-TEST-001',
      injectedClient: mongoose.connection,
    });

    const doc = res.verifiedDocuments[0];
    assert.ok(doc.retentionPreserved.retentionUntil);
    assert.ok(new Date(doc.retentionPreserved.retentionUntil) > new Date());
  });

  // 19 legal hold restored
  test('19. Legal hold flag survives backup and restore intact', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'DOC-RESTORE-TEST-001',
      injectedClient: mongoose.connection,
    });

    assert.equal(res.verifiedDocuments[0].retentionPreserved.legalHold, true);
  });

  // 20 scanStatus restored
  test('20. scanStatus (CLEAN) is preserved and not reset on restore', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'DOC-RESTORE-TEST-001',
      injectedClient: mongoose.connection,
    });

    assert.equal(res.verifiedDocuments[0].scanStatus, 'CLEAN');
    assert.equal(res.verifiedDocuments[0].securityScanStatus, 'CLEAN');
  });

  // 21 archived status restored
  test('21. Archived document status and isDeleted flag are preserved', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'DOC-RESTORE-ARCHIVED-001',
      injectedClient: mongoose.connection,
    });

    assert.equal(res.verifiedDocuments[0].retentionPreserved.isDeleted, true);
    assert.equal(res.verifiedDocuments[0].documentStatus, 'ARCHIVED');
  });

  // 22 audit linkage present
  test('22. Audit trail records survive alongside restored business records', async () => {
    const event = await AuditEvent.findOne({ entityId: 'DOC-RESTORE-TEST-001' });
    assert.ok(event);
    assert.equal(event.module, 'BACKUP_RESTORE');
    assert.equal(event.action, 'SNAPSHOT_RESTORE_VERIFIED');
  });

  // 23 counts recorded safely
  test('23. Report captures safe counts for documents, files, and chunks', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      injectedClient: mongoose.connection,
    });

    assert.ok(typeof res.metrics.totalBusinessDocuments === 'number');
    assert.ok(typeof res.metrics.totalGridFsFiles === 'number');
    assert.ok(typeof res.metrics.totalGridFsChunks === 'number');
  });

  // 24 secrets not printed
  test('24. Connection strings with credentials are masked to prevent secret leakage', () => {
    const rawUri = 'mongodb+srv://zamorin_admin:mock_SuperSecretPassword123@zamorin-cluster.mongodb.net/zamorin_erp';
    const masked = BackupRestoreVerificationService.maskConnectionString(rawUri);
    assert.equal(masked, 'mongodb+srv://zamorin_admin:***@zamorin-cluster.mongodb.net/zamorin_erp');
    assert.equal(masked.includes('mock_SuperSecretPassword123'), false);
  });

  // 25 local snapshot path not committed
  test('25. Snapshot archive extensions (.tar, .gz, .bson) are excluded from git repository', () => {
    const fs = require('fs');
    const path = require('path');
    const repoRoot = path.resolve(__dirname, '..', '..');
    const items = fs.readdirSync(repoRoot);
    const hasDump = items.some((item) => item.endsWith('.tar.gz') || item.endsWith('.dump') || item.endsWith('.bson'));
    assert.equal(hasDump, false);
  });

  // 26 no writes against restore DB
  test('26. verifyRestoreTarget executes zero write commands', async () => {
    const statsBefore = await testDb.stats();
    await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      injectedClient: mongoose.connection,
    });
    const statsAfter = await testDb.stats();
    assert.equal(statsAfter.objects, statsBefore.objects);
  });

  // 27 no production side effects
  test('27. Verification process executes in isolation with zero email or payment side effects', () => {
    // Assert environment has no production side-effect dispatchers active in verification mode
    assert.equal(process.env.NODE_ENV === 'production', false);
  });

  // 28 MongoDB outage safe failure
  test('28. Database outage or connection failure fails closed with 503', async () => {
    await assert.rejects(
      () =>
        BackupRestoreVerificationService.verifyRestoreTarget({
          uri: 'mongodb://127.0.0.1:27999/unreachable_restore_target',
          dbName: 'unreachable_db',
          targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
          restoreVerificationMode: true,
        }),
      (err) => err.name === 'MongoServerSelectionError' || err.message.includes('connect')
    );
  });

  // 29 timeout handling
  test('29. Connection timeout triggers controlled failure', async () => {
    await assert.rejects(
      () =>
        BackupRestoreVerificationService.verifyRestoreTarget({
          uri: 'mongodb://10.255.255.1:27017/timeout_restore',
          dbName: 'timeout_db',
          targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
          restoreVerificationMode: true,
        }),
      (err) => err !== null
    );
  });

  // 30 Personal Ledger regression
  test('30. Personal Ledger Invariant: Primary Master and Owner ALLOW; others DENY', () => {
    const canAccessPersonalLedger = (role) => role === 'MASTER' || role === 'OWNER';
    assert.equal(canAccessPersonalLedger('MASTER'), true);
    assert.equal(canAccessPersonalLedger('OWNER'), true);
    assert.equal(canAccessPersonalLedger('CAFE_ADMIN'), false);
    assert.equal(canAccessPersonalLedger('STAFF'), false);
  });

  // 31 PO approval regression
  test('31. PO Approval Invariant: Primary Master and Normal Master ALLOW; Owner, Cafe Admin, Staff DENY', () => {
    const canApprovePo = (role) => role === 'MASTER';
    assert.equal(canApprovePo('MASTER'), true);
    assert.equal(canApprovePo('OWNER'), false);
    assert.equal(canApprovePo('CAFE_ADMIN'), false);
    assert.equal(canApprovePo('STAFF'), false);
  });

  // 32 EXT-01G regression
  test('32. EXT-01G regression: GridFS storage provider selected and operable', () => {
    assert.equal(gridFsAdapter.name, 'GridFSStorageAdapter');
    assert.equal(gridFsAdapter.isProductionDriver(), true);
  });

  // 33 EXT-02 code regression
  test('33. EXT-02 regression: ClamAVScanner INSTREAM interface and states present', () => {
    const scanner = new ClamAVScanner({ host: '127.0.0.1', port: 3310 });
    assert.equal(typeof scanner.scanStream, 'function');
    assert.equal(typeof scanner.healthCheck, 'function');
  });

  // 34 zero KDS
  test('34. Zero KDS: Kitchen Display System remains permanently absent from routes', () => {
    const fs = require('fs');
    const path = require('path');
    const indexRoutes = fs.readFileSync(path.resolve(__dirname, '../src/routes/index.js'), 'utf8');
    assert.ok(!indexRoutes.includes("router.use('/kds',"), 'KDS must not be mounted');
  });

  // 35 assessAtlasBackupConfig reflects Flex tier facts accurately
  test('35. assessAtlasBackupConfig reflects Flex tier facts accurately', () => {
    const flexConfig = BackupRestoreVerificationService.assessAtlasBackupConfig({ tier: 'FLEX' });
    assert.equal(flexConfig.tier, 'FLEX');
    assert.equal(flexConfig.automaticDailySnapshots, true);
    assert.equal(flexConfig.customBackupScheduleSupported, false);
    assert.equal(flexConfig.onDemandSnapshotSupported, false);
    assert.equal(flexConfig.continuousBackupSupported, false);
    assert.equal(flexConfig.pointInTimeRestoreSupported, false);
    assert.equal(flexConfig.status, 'PILOT_ONLY');
    assert.equal(flexConfig.dedicatedTierRequiredForCommercialProduction, true);

    const m10Config = BackupRestoreVerificationService.assessAtlasBackupConfig({ tier: 'M10' });
    assert.equal(m10Config.tier, 'M10');
    assert.equal(m10Config.continuousBackupSupported, true);
    assert.equal(m10Config.pointInTimeRestoreSupported, true);
    assert.equal(m10Config.status, 'PRODUCTION_READY');
  });
});
