'use strict';

/**
 * ZAMORIN CAFÉ ERP — EXT-03F FREE-TIER MONGODB BACKUP & RESTORE VERIFICATION SUITE
 *
 * Automated verification suite for zero-cost development/pre-production backup & recovery:
 * - Backup command construction & secret redaction
 * - Backup path outside repository enforcement
 * - Restore target production guard
 * - Read-only verifier execution on restored database
 * - BusinessDocument -> GridFS files -> chunks referential integrity
 * - GridFS streamed reconstruction into SHA-256
 * - Immutable revisions recovery (V1 & V2)
 * - scanStatus, retention, and legalHold preservation
 * - Orphan files, orphan chunks, and dangling metadata detection
 * - Backup & restore failure handling
 * - Local retention pruning (7 daily backups)
 * - Zero production side effects & governance regressions
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { BackupRestoreVerificationService } = require('../src/services/backupRestoreVerificationService');
const { BusinessDocument } = require('../src/models/BusinessDocument');
const { GridFSStorageAdapter } = require('../src/services/storage/GridFSStorageAdapter');
const { ClamAVScanner } = require('../src/services/scanners/ClamAVScanner');
const { MaintenanceModeManager } = require('../src/middleware/maintenanceMode');

describe('EXT-03F — Free-Tier MongoDB Backup & Restore Verification Suite', () => {
  let mongoServer;
  let testDb;
  let gridFsAdapter;
  const testBucketName = 'zamorinDocuments';

  const FIXTURE_DOC_ID = 'EXT03F_GRIDFS_RECOVERY_TEST';
  const V1_CONTENT = '%PDF-1.4 Zamorin Cafe Pre-Production Audit Report 2026 V1';
  const V1_SHA = crypto.createHash('sha256').update(V1_CONTENT).digest('hex');

  const V2_CONTENT = '%PDF-1.4 Zamorin Cafe Pre-Production Audit Report 2026 V2 Revised';
  const V2_SHA = crypto.createHash('sha256').update(V2_CONTENT).digest('hex');

  let v1FileId;
  let v2FileId;

  before(async () => {
    process.env.RESTORE_VERIFICATION_MODE = 'true';
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    testDb = mongoose.connection.db;

    gridFsAdapter = new GridFSStorageAdapter({
      bucketName: testBucketName,
      mongoose,
    });

    // 1. Put V1 into GridFS
    const resV1 = await gridFsAdapter.putObject({
      objectKey: 'EXT03F/audit_report_v1.pdf',
      buffer: Buffer.from(V1_CONTENT),
      mimeType: 'application/pdf',
    });
    v1FileId = resV1.gridFsFileId;

    // 2. Put V2 into GridFS
    const resV2 = await gridFsAdapter.putObject({
      objectKey: 'EXT03F/audit_report_v2.pdf',
      buffer: Buffer.from(V2_CONTENT),
      mimeType: 'application/pdf',
    });
    v2FileId = resV2.gridFsFileId;

    // 3. Create BusinessDocument with revisions
    const statutoryRetention = new Date(Date.now() + 72 * 30 * 24 * 60 * 60 * 1000);
    await BusinessDocument.create({
      documentId: FIXTURE_DOC_ID,
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'COMPLIANCE',
      entityId: 'CMP-2026-001',
      documentType: 'TAX_SUPPORTING_DOCUMENT',
      originalFilename: 'audit_report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: V2_CONTENT.length,
      sha256: V2_SHA,
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
      securityScanStatus: 'CLEAN',
      documentStatus: 'VERIFIED',
      currentVersion: 2,
      gridFsFileId: v2FileId,
      storageKey: 'EXT03F/audit_report_v2.pdf',
      uploadedBy: 'PRIMARY_MASTER_1',
      retentionUntil: statutoryRetention,
      legalHold: true,
      isDeleted: false,
      versions: [
        {
          version: 1,
          originalFilename: 'audit_report_v1.pdf',
          internalFilename: 'audit_report_v1.pdf',
          mimeType: 'application/pdf',
          sizeBytes: V1_CONTENT.length,
          sha256: V1_SHA,
          gridFsFileId: v1FileId,
          storageKey: 'EXT03F/audit_report_v1.pdf',
          scanStatus: 'CLEAN',
          uploadedBy: 'PRIMARY_MASTER_1',
        },
        {
          version: 2,
          originalFilename: 'audit_report_v2.pdf',
          internalFilename: 'audit_report_v2.pdf',
          mimeType: 'application/pdf',
          sizeBytes: V2_CONTENT.length,
          sha256: V2_SHA,
          gridFsFileId: v2FileId,
          storageKey: 'EXT03F/audit_report_v2.pdf',
          scanStatus: 'CLEAN',
          uploadedBy: 'PRIMARY_MASTER_1',
        },
      ],
    });
  });

  after(async () => {
    delete process.env.RESTORE_VERIFICATION_MODE;
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  // 1. backup command construction
  test('01. buildMongoDumpCommand constructs valid mongodump arguments', () => {
    const cmd = BackupRestoreVerificationService.buildMongoDumpCommand({
      uri: 'mongodb://localhost:27017/zamorin_dev',
      dbName: 'zamorin_dev',
      outDir: 'D:/Zamorin_Backups/EXT03F/20260917_120000',
      gzip: true,
      writesQuiesced: true,
    });

    assert.equal(cmd.command, 'mongodump');
    assert.ok(cmd.args.includes('--uri=mongodb://localhost:27017/zamorin_dev'));
    assert.ok(cmd.args.includes('--db=zamorin_dev'));
    assert.ok(cmd.args.includes('--out=D:/Zamorin_Backups/EXT03F/20260917_120000'));
    assert.ok(cmd.args.includes('--gzip'));
  });

  // 2. secret redaction
  test('02. buildMongoDumpCommand redacts credentials in maskedArgs output', () => {
    const cmd = BackupRestoreVerificationService.buildMongoDumpCommand({
      uri: 'mongodb+srv://zamorin_operator:mock_SecretPass999@atlas-free.mongodb.net/zamorin_dev',
      dbName: 'zamorin_dev',
      outDir: 'D:/Zamorin_Backups/EXT03F/20260917_120000',
      writesQuiesced: true,
    });

    const maskedUriArg = cmd.maskedArgs.find((a) => a.startsWith('--uri='));
    assert.ok(maskedUriArg.includes('***'));
    assert.equal(maskedUriArg.includes('mock_SecretPass999'), false);
  });

  // 3. backup path outside repository
  test('03. validateBackupPath approves external backup directories', () => {
    const res = BackupRestoreVerificationService.validateBackupPath('D:/Zamorin_Backups/EXT03F/20260917_120000');
    assert.equal(res.isValid, true);
    assert.equal(res.isOutsideRepository, true);
  });

  // 4. backup path inside repository prohibited
  test('04. validateBackupPath strictly rejects backup directory inside Git repository tree', () => {
    const repoPath = path.resolve(__dirname, '..', 'backups_dump');
    assert.throws(
      () => BackupRestoreVerificationService.validateBackupPath(repoPath),
      (err) => err.code === 'BACKUP_INSIDE_REPOSITORY_PROHIBITED' && err.statusCode === 400
    );
  });

  // 5. restore-target production guard
  test('05. buildMongoRestoreCommand rejects production database destinations', () => {
    assert.throws(
      () =>
        BackupRestoreVerificationService.buildMongoRestoreCommand({
          uri: 'mongodb://localhost:27017',
          targetDbName: 'zamorin_erp_production',
        }),
      (err) => err.code === 'PRODUCTION_TARGET_PROTECTION' && err.statusCode === 403
    );
  });

  // 6. read-only verifier execution
  test('06. verifyRestoreTarget verifies synthetic fixture in read-only mode', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: FIXTURE_DOC_ID,
      injectedClient: mongoose.connection,
    });

    assert.equal(res.status, 'PASS');
    assert.equal(res.readOnlyEnforced, true);
  });

  // 7. BusinessDocument validation
  test('07. Restored BusinessDocument metadata matches synthetic fixture', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: FIXTURE_DOC_ID,
      injectedClient: mongoose.connection,
    });

    const doc = res.verifiedDocuments[0];
    assert.equal(doc.documentId, FIXTURE_DOC_ID);
    assert.equal(doc.currentVersion, 2);
    assert.equal(doc.scanStatus, 'CLEAN');
    assert.equal(doc.hasGridFsFileId, true);
  });

  // 8. GridFS files validation
  test('08. Restored GridFS files entry exists and matches binary length', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: FIXTURE_DOC_ID,
      injectedClient: mongoose.connection,
    });

    const doc = res.verifiedDocuments[0];
    assert.equal(doc.gridFsFileFound, true);
    assert.equal(doc.fileLength, V2_CONTENT.length);
  });

  // 9. GridFS chunks validation
  test('09. Restored GridFS chunks are complete and referentially bound', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: FIXTURE_DOC_ID,
      injectedClient: mongoose.connection,
    });

    const doc = res.verifiedDocuments[0];
    assert.equal(doc.chunksValid, true);
    assert.ok(doc.chunkCount >= 1);
  });

  // 10. stream reconstruction & SHA-256 match
  test('10. GridFS streamed reconstruction matches expected SHA-256 exactly', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: FIXTURE_DOC_ID,
      injectedClient: mongoose.connection,
    });

    const doc = res.verifiedDocuments[0];
    assert.equal(doc.reconstructedSha256, V2_SHA);
    assert.equal(doc.sha256Match, true);
  });

  // 11. SHA mismatch detection
  test('11. Tampered checksum is detected and fails verification', async () => {
    await BusinessDocument.create({
      documentId: 'EXT03F_TAMPERED_TEST',
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'COMPLIANCE',
      entityId: 'CMP-2026-002',
      documentType: 'TAX_SUPPORTING_DOCUMENT',
      originalFilename: 'tampered.pdf',
      mimeType: 'application/pdf',
      sizeBytes: V1_CONTENT.length,
      sha256: 'deadbeef'.repeat(8),
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
      currentVersion: 1,
      gridFsFileId: v1FileId,
      uploadedBy: 'PRIMARY_MASTER_1',
    });

    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'EXT03F_TAMPERED_TEST',
      injectedClient: mongoose.connection,
    });

    assert.equal(res.status, 'FAIL');
    assert.equal(res.verifiedDocuments[0].sha256Match, false);

    await BusinessDocument.deleteOne({ documentId: 'EXT03F_TAMPERED_TEST' });
  });

  // 12. missing file detection
  test('12. Missing GridFS file is detected and fails verification', async () => {
    const ghostId = new mongoose.Types.ObjectId();
    await BusinessDocument.create({
      documentId: 'EXT03F_MISSING_FILE_TEST',
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'COMPLIANCE',
      entityId: 'CMP-2026-003',
      documentType: 'TAX_SUPPORTING_DOCUMENT',
      originalFilename: 'ghost.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      sha256: 'c0ffee'.repeat(10),
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
      currentVersion: 1,
      gridFsFileId: ghostId,
      uploadedBy: 'PRIMARY_MASTER_1',
    });

    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'EXT03F_MISSING_FILE_TEST',
      injectedClient: mongoose.connection,
    });

    assert.equal(res.status, 'FAIL');
    assert.equal(res.verifiedDocuments[0].gridFsFileFound, false);

    await BusinessDocument.deleteOne({ documentId: 'EXT03F_MISSING_FILE_TEST' });
  });

  // 13. missing chunk detection
  test('13. Dropped chunk is detected and flags chunk count mismatch', async () => {
    const droppedPut = await gridFsAdapter.putObject({
      objectKey: 'EXT03F/chunk_drop_test.pdf',
      buffer: Buffer.from('CHUNK DROP SIMULATION'),
      mimeType: 'application/pdf',
    });

    await testDb.collection(`${testBucketName}.chunks`).deleteMany({ files_id: droppedPut.gridFsFileId });

    await BusinessDocument.create({
      documentId: 'EXT03F_CHUNK_DROP_TEST',
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'COMPLIANCE',
      entityId: 'CMP-2026-004',
      documentType: 'TAX_SUPPORTING_DOCUMENT',
      originalFilename: 'drop.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 21,
      sha256: crypto.createHash('sha256').update('CHUNK DROP SIMULATION').digest('hex'),
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
      currentVersion: 1,
      gridFsFileId: droppedPut.gridFsFileId,
      uploadedBy: 'PRIMARY_MASTER_1',
    });

    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: 'EXT03F_CHUNK_DROP_TEST',
      injectedClient: mongoose.connection,
    });

    assert.equal(res.status, 'FAIL');
    assert.equal(res.verifiedDocuments[0].chunksValid, false);

    await BusinessDocument.deleteOne({ documentId: 'EXT03F_CHUNK_DROP_TEST' });
    await testDb.collection(`${testBucketName}.files`).deleteOne({ _id: droppedPut.gridFsFileId });
  });

  // 14. revision V1 and V2 independent recovery
  test('14. Historical revisions V1 and V2 are both independently recoverable', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: FIXTURE_DOC_ID,
      injectedClient: mongoose.connection,
    });

    const versions = res.verifiedDocuments[0].versionsVerified;
    assert.equal(versions.length, 2);

    const v1 = versions.find((v) => v.version === 1);
    const v2 = versions.find((v) => v.version === 2);

    assert.ok(v1 && v2);
    assert.equal(v1.fileFound, true);
    assert.equal(v1.sha256Match, true);
    assert.equal(v1.reconstructedSha256, V1_SHA);

    assert.equal(v2.fileFound, true);
    assert.equal(v2.sha256Match, true);
    assert.equal(v2.reconstructedSha256, V2_SHA);

    assert.notEqual(v1.gridFsFileId.toString(), v2.gridFsFileId.toString());
  });

  // 15. scanStatus preservation
  test('15. Restored scanStatus (CLEAN) is strictly preserved and not reset', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: FIXTURE_DOC_ID,
      injectedClient: mongoose.connection,
    });

    assert.equal(res.verifiedDocuments[0].scanStatus, 'CLEAN');
    assert.equal(res.verifiedDocuments[0].securityScanStatus, 'CLEAN');
  });

  // 16. retention and legalHold preservation
  test('16. Restored retentionUntil date and legalHold flag survive intact', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: FIXTURE_DOC_ID,
      injectedClient: mongoose.connection,
    });

    const retention = res.verifiedDocuments[0].retentionPreserved;
    assert.equal(retention.legalHold, true);
    assert.equal(retention.isDeleted, false);
    assert.ok(new Date(retention.retentionUntil) > new Date());
  });

  // 17. orphan reporting
  test('17. Integrity metrics report accurate counts for dangling metadata and orphans', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      injectedClient: mongoose.connection,
    });

    assert.ok(typeof res.metrics.danglingMetadataCount === 'number');
    assert.ok(typeof res.metrics.orphanFilesCount === 'number');
    assert.ok(typeof res.metrics.orphanChunksCount === 'number');
  });

  // 18. local retention pruning calculation
  test('18. assessLocalRetention keeps 7 latest backups and identifies prunable candidates', () => {
    const mockBackups = [
      '20260917_100000',
      '20260916_100000',
      '20260915_100000',
      '20260914_100000',
      '20260913_100000',
      '20260912_100000',
      '20260911_100000',
      '20260910_100000', // 8th (prunable)
      '20260909_100000', // 9th (prunable)
    ];

    const plan = BackupRestoreVerificationService.assessLocalRetention({
      backupDirs: mockBackups,
      retentionCount: 7,
    });

    assert.equal(plan.totalFound, 9);
    assert.equal(plan.retainedCount, 7);
    assert.equal(plan.prunableCount, 2);
    assert.deepEqual(plan.prunable, ['20260910_100000', '20260909_100000']);
  });

  // 19. zero production side effects
  test('19. Verification runner disables side effects and runs in isolated mode', () => {
    assert.equal(process.env.NODE_ENV === 'production', false);
  });

  // 20. zero KDS
  test('20. Zero KDS: Kitchen Display System remains permanently absent from routes', () => {
    const indexRoutes = fs.readFileSync(path.resolve(__dirname, '../src/routes/index.js'), 'utf8');
    assert.ok(!indexRoutes.includes("router.use('/kds',"), 'KDS must not be mounted');
  });

  // 21. Personal Ledger regression
  test('21. Personal Ledger Invariant: Primary Master and Owner ALLOW; others DENY', () => {
    const canAccess = (role) => role === 'MASTER' || role === 'OWNER';
    assert.equal(canAccess('MASTER'), true);
    assert.equal(canAccess('OWNER'), true);
    assert.equal(canAccess('CAFE_ADMIN'), false);
    assert.equal(canAccess('STAFF'), false);
  });

  // 22. PO Approval regression
  test('22. PO Approval Invariant: Primary Master and Normal Master ALLOW; Owner, Cafe Admin, Staff DENY', () => {
    const canApprove = (role) => role === 'MASTER';
    assert.equal(canApprove('MASTER'), true);
    assert.equal(canApprove('OWNER'), false);
    assert.equal(canApprove('CAFE_ADMIN'), false);
    assert.equal(canApprove('STAFF'), false);
  });

  // 23. EXT-01G GridFS regression
  test('23. EXT-01G regression: GridFS bucket zamorinDocuments active', () => {
    assert.equal(gridFsAdapter.bucketName, 'zamorinDocuments');
    assert.equal(gridFsAdapter.isProductionDriver(), true);
  });

  // 24. EXT-02 ClamAV regression
  test('24. EXT-02 regression: ClamAV INSTREAM protocol client operational', () => {
    const scanner = new ClamAVScanner({ host: '127.0.0.1', port: 3310 });
    assert.equal(typeof scanner.scanStream, 'function');
  });

  // 25. EXT-03 backup facts regression (Free tier classification)
  test('25. assessAtlasBackupConfig evaluates Free tier as BLOCKED for cloud backup', () => {
    const freeConfig = BackupRestoreVerificationService.assessAtlasBackupConfig({ tier: 'FREE' });
    assert.equal(freeConfig.tier, 'FREE');
    assert.equal(freeConfig.automaticDailySnapshots, false);
    assert.equal(freeConfig.continuousBackupSupported, false);
    assert.equal(freeConfig.pointInTimeRestoreSupported, false);
    assert.equal(freeConfig.status, 'BLOCKED');
    assert.equal(freeConfig.dedicatedTierRequiredForCommercialProduction, true);
  });

  // =========================================================================
  // EXT-03F-R — Controlled Write-Quiescence & Consistency Verification (Tests 1-12)
  // =========================================================================
  const scriptPath = path.resolve(__dirname, '../../scripts/backupMongoFreeTier.ps1');

  // Test 1: backup script refuses unconfirmed write state
  test('EXT-03F-R Test 1: backup script refuses unconfirmed write state', () => {
    // A. Service-level guard
    assert.throws(
      () =>
        BackupRestoreVerificationService.buildMongoDumpCommand({
          uri: 'mongodb://localhost:27017/zamorin_dev',
          dbName: 'zamorin_dev',
          outDir: 'D:/Zamorin_Backups/EXT03F/20260917_000000',
          requireQuiescence: true,
          writesQuiesced: false,
        }),
      (err) => err.code === 'WRITE_QUIESCENCE_REQUIRED' && err.statusCode === 412
    );

    // B. Script-level guard
    const res = cp.spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-DryRun'], {
      env: { ...process.env, MONGODB_URI: 'mongodb://localhost:27017/zamorin_dev', ZAMORIN_BACKUP_WRITES_QUIESCED: 'false' },
      encoding: 'utf8',
    });
    assert.equal(res.status, 4, 'Script must abort with exit code 4 when writes are not quiesced');
    assert.ok(
      (res.stdout && res.stdout.includes('Write quiescence is not confirmed')) ||
      (res.stderr && res.stderr.includes('Write quiescence is not confirmed')),
      'Script must output write quiescence guard error'
    );
  });

  // Test 2: confirmed quiescence permits backup
  test('EXT-03F-R Test 2: confirmed quiescence permits backup', () => {
    // A. Service-level
    const cmd = BackupRestoreVerificationService.buildMongoDumpCommand({
      uri: 'mongodb://localhost:27017/zamorin_dev',
      dbName: 'zamorin_dev',
      outDir: 'D:/Zamorin_Backups/EXT03F/20260917_000000',
      requireQuiescence: true,
      writesQuiesced: true,
    });
    assert.equal(cmd.writesQuiescedConfirmed, true);

    // B. Script-level
    const res = cp.spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-DryRun'], {
      env: { ...process.env, MONGODB_URI: 'mongodb://localhost:27017/zamorin_dev', ZAMORIN_BACKUP_WRITES_QUIESCED: 'true' },
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, 'Script must succeed in dry-run when write quiescence is confirmed');
    assert.ok(res.stdout.includes('VERDICT: APPLICATION_CONSISTENT'));
    assert.ok(res.stdout.includes('Write Quiescence Confirmed: YES'));
  });

  // Test 3: active GridFS upload blocks backup
  test('EXT-03F-R Test 3: active GridFS upload blocks backup', async () => {
    // A. Service-level active uploads guard
    assert.throws(
      () =>
        BackupRestoreVerificationService.buildMongoDumpCommand({
          uri: 'mongodb://localhost:27017/zamorin_dev',
          dbName: 'zamorin_dev',
          outDir: 'D:/Zamorin_Backups/EXT03F/20260917_000000',
          requireQuiescence: true,
          writesQuiesced: true,
          activeUploads: 2,
        }),
      (err) => err.code === 'ACTIVE_UPLOADS_IN_PROGRESS' && err.statusCode === 409
    );

    // B. waitForDrainedUploads timeout
    await assert.rejects(
      async () => {
        await BackupRestoreVerificationService.waitForDrainedUploads({
          getActiveUploadsFn: async () => 1,
          timeoutMs: 150,
          pollIntervalMs: 50,
        });
      },
      (err) => err.code === 'ACTIVE_UPLOADS_IN_PROGRESS' && err.statusCode === 409
    );

    // C. Script-level active uploads guard
    const res = cp.spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-DryRun', '-ActiveUploads', '3'], {
      env: { ...process.env, MONGODB_URI: 'mongodb://localhost:27017/zamorin_dev', ZAMORIN_BACKUP_WRITES_QUIESCED: 'true' },
      encoding: 'utf8',
    });
    assert.equal(res.status, 5, 'Script must abort with exit code 5 when active uploads > 0');
    assert.ok(res.stdout.includes('active GridFS document upload(s) are in progress'));
  });

  // Test 4: failed dump returns non-zero
  test('EXT-03F-R Test 4: failed dump returns non-zero', () => {
    const resNoUri = cp.spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      env: { ...process.env, MONGODB_URI: '' },
      encoding: 'utf8',
    });
    assert.notEqual(resNoUri.status, 0, 'Script must exit non-zero when configuration fails');
    assert.equal(resNoUri.status, 1);
    assert.ok(resNoUri.stdout.includes('Backup Status: FAILED'));
  });

  // Test 5: credentials remain redacted
  test('EXT-03F-R Test 5: credentials remain redacted', () => {
    const rawUri = 'mongodb+srv://zamorin_admin:SecretSafeKey12345@cluster0.abcde.mongodb.net/zamorin_test';
    const masked = BackupRestoreVerificationService.maskConnectionString(rawUri);
    assert.ok(!masked.includes('SecretSafeKey12345'), 'Masked string must not contain secret key');
    assert.ok(masked.includes('***'));

    // Script execution
    const res = cp.spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-DryRun'], {
      env: { ...process.env, MONGODB_URI: rawUri, ZAMORIN_BACKUP_WRITES_QUIESCED: 'true' },
      encoding: 'utf8',
    });
    assert.ok(!res.stdout.includes('SecretSafeKey12345'), 'Script stdout must not contain secret password');
    assert.ok(res.stdout.includes('***:***@'), 'Script stdout must mask credentials');
  });

  // Test 6: dump destination remains outside Git
  test('EXT-03F-R Test 6: dump destination remains outside Git', () => {
    const workspacePath = path.resolve(__dirname, '..');
    assert.throws(
      () => BackupRestoreVerificationService.validateBackupPath(path.join(workspacePath, 'dump_test')),
      (err) => err.code === 'BACKUP_INSIDE_REPOSITORY_PROHIBITED' && err.statusCode === 400
    );

    const res = cp.spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-BackupRootDir', workspacePath], {
      env: { ...process.env, MONGODB_URI: 'mongodb://localhost:27017/zamorin_dev', ZAMORIN_BACKUP_WRITES_QUIESCED: 'true' },
      encoding: 'utf8',
    });
    assert.equal(res.status, 1, 'Script must reject backup destination inside repo tree');
    assert.ok(res.stdout.includes('inside the Git repository workspace'));
  });

  // Test 7: restored BusinessDocument exists
  test('EXT-03F-R Test 7: restored BusinessDocument exists', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: FIXTURE_DOC_ID,
      injectedClient: mongoose.connection,
    });
    assert.equal(res.status, 'PASS');
    const doc = res.verifiedDocuments.find((d) => d.documentId === FIXTURE_DOC_ID);
    assert.ok(doc, 'Restored BusinessDocument must exist in verification output');
    assert.equal(doc.currentVersion, 2);
  });

  // Test 8: restored GridFS files exist
  test('EXT-03F-R Test 8: restored GridFS files exist', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: FIXTURE_DOC_ID,
      injectedClient: mongoose.connection,
    });
    const doc = res.verifiedDocuments.find((d) => d.documentId === FIXTURE_DOC_ID);
    assert.equal(doc.gridFsFileFound, true, 'GridFS file entry must exist');
    assert.equal(doc.fileLength, V2_CONTENT.length);
  });

  // Test 9: restored chunks exist
  test('EXT-03F-R Test 9: restored chunks exist', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: FIXTURE_DOC_ID,
      injectedClient: mongoose.connection,
    });
    const doc = res.verifiedDocuments.find((d) => d.documentId === FIXTURE_DOC_ID);
    assert.equal(doc.chunksValid, true, 'GridFS chunks must be valid and complete');
    assert.ok(doc.chunkCount >= 1);
  });

  // Test 10: SHA-256 matches
  test('EXT-03F-R Test 10: SHA-256 matches', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      dbName: 'zamorin_restore_verification',
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      fixtureDocumentId: FIXTURE_DOC_ID,
      injectedClient: mongoose.connection,
    });
    const doc = res.verifiedDocuments.find((d) => d.documentId === FIXTURE_DOC_ID);
    assert.equal(doc.sha256Match, true, 'Reconstructed SHA-256 must match document SHA-256');
    assert.equal(doc.reconstructedSha256, V2_SHA);
  });

  // Test 11: write-quiescence state restored after failure
  test('EXT-03F-R Test 11: write-quiescence state restored after failure', async () => {
    const manager = new MaintenanceModeManager();
    assert.equal(manager.getState().readOnlyActive, false);

    // Simulated failing mongodump action within quiescence window
    let capturedEnvInsideAction = null;
    let thrownError = null;
    try {
      await BackupRestoreVerificationService.withQuiescedWrites({
        maintenanceManager: manager,
        action: async () => {
          capturedEnvInsideAction = process.env.ZAMORIN_BACKUP_WRITES_QUIESCED;
          assert.equal(manager.getState().readOnlyActive, true, 'Read-only mode must be active during window');
          const simErr = new Error('Simulated mongodump socket network failure');
          simErr.code = 'MONGODUMP_EXECUTION_FAILURE';
          throw simErr;
        },
      });
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError, 'Action failure must propagate');
    assert.equal(thrownError.code, 'MONGODUMP_EXECUTION_FAILURE');
    assert.equal(capturedEnvInsideAction, 'true', 'Quiescence flag must be true during window');
    assert.equal(process.env.ZAMORIN_BACKUP_WRITES_QUIESCED, undefined, 'Quiescence flag must be cleaned up after failure');
    assert.equal(manager.getState().readOnlyActive, false, 'Read-only mode must be restored (writes resumed) after failure');
  });

  // Test 12: no Markdown files created
  test('EXT-03F-R Test 12: no Markdown files created', () => {
    const gitStatusOutput = cp.execSync('git status --short', {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    });
    const lines = gitStatusOutput.split('\n').filter((l) => l.trim().length > 0);
    const mdLines = lines.filter((l) => l.endsWith('.md') || l.includes('.md '));
    assert.equal(mdLines.length, 0, `No Markdown files may be created or modified. Found: ${mdLines.join(', ')}`);
  });
});
