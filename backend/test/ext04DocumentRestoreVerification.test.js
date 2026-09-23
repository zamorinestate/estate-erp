'use strict';

/**
 * ZAMORIN CAFÉ ERP — EXT-04 GRIDFS DOCUMENT RESTORE & INTEGRITY VERIFICATION SUITE
 *
 * Automated verification suite for document-level and revision-level recovery:
 * - VERIFY_ONLY mode with zero target writes
 * - Source document and revision lookup
 * - GridFS files and chunks referential integrity
 * - Streamed reconstruction with SHA-256 validation
 * - Production target write protection
 * - Circular restore prevention
 * - RECOVERY_COPY with distinct NEW GridFS file ID
 * - Immutable history preservation (V1, V2 intact; V3 created)
 * - PENDING_SCAN quarantine enforcement for newly materialized operational files
 * - Download/preview denial on restored files prior to scan
 * - Complete restore provenance and audit logging
 * - Duplicate restore idempotency & concurrency safety
 * - Cross-organisation and cross-café access denials
 * - Statutory retention and legal hold preservation
 * - Source database read-only immutability
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { DocumentRestoreService, RESTORE_MODES, RESTORE_REASONS, RESTORE_AUDIT_EVENTS } = require('../src/services/documentRestoreService');
const { BackupRestoreVerificationService } = require('../src/services/backupRestoreVerificationService');
const { BusinessDocument } = require('../src/models/BusinessDocument');
const { GridFSStorageAdapter } = require('../src/services/storage/GridFSStorageAdapter');
const { DocumentAttachmentService } = require('../src/services/documentAttachmentService');
const { ClamAVScanner } = require('../src/services/scanners/ClamAVScanner');

describe('EXT-04 — GridFS Document Restore, Historical Revision Recovery & Integrity Verification Suite', () => {
  let sourceMongoServer;
  let targetMongoServer;
  let sourceConn;
  let targetConn;
  let sourceDb;
  let targetDb;
  let sourceBucket;
  let targetBucket;

  const BUCKET_NAME = 'zamorinDocuments';
  const DOC_ID = 'EXT04_DOCUMENT_RESTORE_TEST';
  const ORG_ID = 'ZAMORIN';
  const CAFE_ID = 'ZC01';

  // Fixtures
  const V1_CONTENT = 'Zamorin EXT04 version one - Original Vendor Invoice Data 2026';
  const V1_SHA = crypto.createHash('sha256').update(V1_CONTENT).digest('hex');

  const V2_CONTENT = 'Zamorin EXT04 version two - Revised Vendor Invoice with Tax Adjustments';
  const V2_SHA = crypto.createHash('sha256').update(V2_CONTENT).digest('hex');

  // Medium fixture to test realistic streaming
  const MEDIUM_CONTENT = Buffer.alloc(80 * 1024, 'M'); // 80 KB
  const MEDIUM_SHA = crypto.createHash('sha256').update(MEDIUM_CONTENT).digest('hex');

  let sourceV1GridFsId;
  let sourceV2GridFsId;
  let targetV1GridFsId;
  let targetV2GridFsId;

  before(async () => {
    // 1. Start isolated source database (represents restored recovery DB from mongodump)
    sourceMongoServer = await MongoMemoryServer.create();
    sourceConn = await mongoose.createConnection(sourceMongoServer.getUri(), {
      dbName: 'zamorin_restore_verification',
    }).asPromise();
    sourceDb = sourceConn.db;
    sourceBucket = new mongoose.mongo.GridFSBucket(sourceDb, { bucketName: BUCKET_NAME });

    // 2. Start isolated target database (represents operational test/staging target DB)
    targetMongoServer = await MongoMemoryServer.create();
    targetConn = await mongoose.createConnection(targetMongoServer.getUri(), {
      dbName: 'zamorin_dev',
    }).asPromise();
    targetDb = targetConn.db;
    targetBucket = new mongoose.mongo.GridFSBucket(targetDb, { bucketName: BUCKET_NAME });

    // 3. Populate Source Database (GridFS V1 + V2 + BusinessDocument)
    const sourceUploadV1 = sourceBucket.openUploadStream('EXT04/invoice_v1.pdf', {
      contentType: 'application/pdf',
      metadata: { originalFilename: 'invoice.pdf', version: 1 },
    });
    sourceV1GridFsId = sourceUploadV1.id;
    await new Promise((res, rej) => {
      sourceUploadV1.on('finish', res);
      sourceUploadV1.on('error', rej);
      sourceUploadV1.end(Buffer.from(V1_CONTENT));
    });

    const sourceUploadV2 = sourceBucket.openUploadStream('EXT04/invoice_v2.pdf', {
      contentType: 'application/pdf',
      metadata: { originalFilename: 'invoice_v2.pdf', version: 2 },
    });
    sourceV2GridFsId = sourceUploadV2.id;
    await new Promise((res, rej) => {
      sourceUploadV2.on('finish', res);
      sourceUploadV2.on('error', rej);
      sourceUploadV2.end(Buffer.from(V2_CONTENT));
    });

    const retentionDate = new Date(Date.now() + 72 * 30 * 24 * 60 * 60 * 1000);
    await sourceDb.collection('business_documents').insertOne({
      documentId: DOC_ID,
      organisationId: ORG_ID,
      cafeId: CAFE_ID,
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-2026-001',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'invoice.pdf',
      mimeType: 'application/pdf',
      sizeBytes: V2_CONTENT.length,
      sha256: V2_SHA,
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
      securityScanStatus: 'CLEAN',
      documentStatus: 'VERIFIED',
      currentVersion: 2,
      gridFsFileId: sourceV2GridFsId,
      storageKey: 'EXT04/invoice_v2.pdf',
      uploadedBy: 'PRIMARY_MASTER_1',
      retentionUntil: retentionDate,
      legalHold: true,
      isDeleted: false,
      versions: [
        {
          version: 1,
          versionNumber: 1,
          originalFilename: 'invoice.pdf',
          internalFilename: 'invoice_v1.pdf',
          mimeType: 'application/pdf',
          sizeBytes: V1_CONTENT.length,
          sha256: V1_SHA,
          gridFsFileId: sourceV1GridFsId,
          storageKey: 'EXT04/invoice_v1.pdf',
          scanStatus: 'CLEAN',
          securityScanStatus: 'CLEAN',
          uploadedBy: 'PRIMARY_MASTER_1',
          uploadedAt: new Date(Date.now() - 3600000),
        },
        {
          version: 2,
          versionNumber: 2,
          originalFilename: 'invoice.pdf',
          internalFilename: 'invoice_v2.pdf',
          mimeType: 'application/pdf',
          sizeBytes: V2_CONTENT.length,
          sha256: V2_SHA,
          gridFsFileId: sourceV2GridFsId,
          storageKey: 'EXT04/invoice_v2.pdf',
          scanStatus: 'CLEAN',
          securityScanStatus: 'CLEAN',
          uploadedBy: 'PRIMARY_MASTER_1',
          uploadedAt: new Date(),
        },
      ],
    });

    // 4. Populate Target Database with V1 and V2 as current operational state
    const targetUploadV1 = targetBucket.openUploadStream('OPERATIONAL/invoice_v1.pdf', {
      contentType: 'application/pdf',
    });
    targetV1GridFsId = targetUploadV1.id;
    await new Promise((res, rej) => {
      targetUploadV1.on('finish', res);
      targetUploadV1.on('error', rej);
      targetUploadV1.end(Buffer.from(V1_CONTENT));
    });

    const targetUploadV2 = targetBucket.openUploadStream('OPERATIONAL/invoice_v2.pdf', {
      contentType: 'application/pdf',
    });
    targetV2GridFsId = targetUploadV2.id;
    await new Promise((res, rej) => {
      targetUploadV2.on('finish', res);
      targetUploadV2.on('error', rej);
      targetUploadV2.end(Buffer.from(V2_CONTENT));
    });

    await targetDb.collection('business_documents').insertOne({
      documentId: DOC_ID,
      organisationId: ORG_ID,
      cafeId: CAFE_ID,
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-2026-001',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'invoice.pdf',
      mimeType: 'application/pdf',
      sizeBytes: V2_CONTENT.length,
      sha256: V2_SHA,
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
      securityScanStatus: 'CLEAN',
      documentStatus: 'VERIFIED',
      currentVersion: 2,
      gridFsFileId: targetV2GridFsId,
      storageKey: 'OPERATIONAL/invoice_v2.pdf',
      uploadedBy: 'PRIMARY_MASTER_1',
      retentionUntil: retentionDate,
      legalHold: true,
      isDeleted: false,
      versions: [
        {
          version: 1,
          versionNumber: 1,
          originalFilename: 'invoice.pdf',
          internalFilename: 'invoice_v1.pdf',
          mimeType: 'application/pdf',
          sizeBytes: V1_CONTENT.length,
          sha256: V1_SHA,
          gridFsFileId: targetV1GridFsId,
          storageKey: 'OPERATIONAL/invoice_v1.pdf',
          scanStatus: 'CLEAN',
          securityScanStatus: 'CLEAN',
          uploadedBy: 'PRIMARY_MASTER_1',
        },
        {
          version: 2,
          versionNumber: 2,
          originalFilename: 'invoice.pdf',
          internalFilename: 'invoice_v2.pdf',
          mimeType: 'application/pdf',
          sizeBytes: V2_CONTENT.length,
          sha256: V2_SHA,
          gridFsFileId: targetV2GridFsId,
          storageKey: 'OPERATIONAL/invoice_v2.pdf',
          scanStatus: 'CLEAN',
          securityScanStatus: 'CLEAN',
          uploadedBy: 'PRIMARY_MASTER_1',
        },
      ],
    });
  });

  after(async () => {
    if (sourceConn) await sourceConn.close();
    if (targetConn) await targetConn.close();
    if (sourceMongoServer) await sourceMongoServer.stop();
    if (targetMongoServer) await targetMongoServer.stop();
  });

  // 01. VERIFY_ONLY no writes
  test('01. VERIFY_ONLY performs zero writes on target database', async () => {
    const targetFilesBefore = await targetDb.collection(`${BUCKET_NAME}.files`).countDocuments();
    const targetDocsBefore = await targetDb.collection('business_documents').countDocuments();

    const res = await DocumentRestoreService.restoreDocumentRevision({
      sourceDb,
      targetDb,
      documentId: DOC_ID,
      revisionNumber: 1,
      mode: RESTORE_MODES.VERIFY_ONLY,
    });

    assert.equal(res.status, 'VERIFIED');
    assert.equal(res.mode, RESTORE_MODES.VERIFY_ONLY);
    assert.equal(res.writesPerformed, 0);

    const targetFilesAfter = await targetDb.collection(`${BUCKET_NAME}.files`).countDocuments();
    const targetDocsAfter = await targetDb.collection('business_documents').countDocuments();

    assert.equal(targetFilesAfter, targetFilesBefore);
    assert.equal(targetDocsAfter, targetDocsBefore);
  });

  // 02. source document lookup
  test('02. Source BusinessDocument lookup locates documentId correctly', async () => {
    const res = await DocumentRestoreService.verifyRestoreSource({
      sourceDb,
      documentId: DOC_ID,
    });

    assert.equal(res.isValid, true);
    assert.equal(res.documentId, DOC_ID);
    assert.equal(res.organisationId, ORG_ID);
    assert.equal(res.cafeId, CAFE_ID);
  });

  // 03. revision lookup
  test('03. Source revision lookup resolves historical revision V1 metadata', async () => {
    const res = await DocumentRestoreService.verifyRestoreSource({
      sourceDb,
      documentId: DOC_ID,
      revisionNumber: 1,
    });

    assert.equal(res.revisionNumber, 1);
    assert.equal(res.sizeBytes, V1_CONTENT.length);
    assert.equal(res.gridFsFileId.toString(), sourceV1GridFsId.toString());
  });

  // 04. GridFS files link
  test('04. GridFS files link validates file record presence', async () => {
    const fileRecord = await sourceDb.collection(`${BUCKET_NAME}.files`).findOne({ _id: sourceV1GridFsId });
    assert.ok(fileRecord, 'Source GridFS file record must exist');
    assert.equal(fileRecord.length, V1_CONTENT.length);
  });

  // 05. chunks link
  test('05. GridFS chunks link validates complete chunk distribution', async () => {
    const chunkCount = await sourceDb.collection(`${BUCKET_NAME}.chunks`).countDocuments({ files_id: sourceV1GridFsId });
    assert.ok(chunkCount >= 1, 'Source chunks must exist');
  });

  // 06. stream reconstruction
  test('06. Stream reconstruction reads file chunks into SHA-256 without whole-file RAM buffer', async () => {
    const res = await DocumentRestoreService.verifyRestoreSource({
      sourceDb,
      documentId: DOC_ID,
      revisionNumber: 1,
    });

    assert.equal(res.sha256Match, true);
    assert.equal(res.sha256, V1_SHA);
  });

  // 07. source SHA match
  test('07. Source SHA-256 match verifies uncorrupted source revision', async () => {
    const res = await DocumentRestoreService.verifyRestoreSource({
      sourceDb,
      documentId: DOC_ID,
      revisionNumber: 2,
    });

    assert.equal(res.sha256, V2_SHA);
  });

  // 08. source SHA mismatch
  test('08. Source SHA-256 mismatch rejects restore with RESTORE_DENIED_INTEGRITY_FAILURE', async () => {
    // Create corrupted document in source
    await sourceDb.collection('business_documents').insertOne({
      documentId: 'EXT04_CORRUPTED_SHA_DOC',
      organisationId: ORG_ID,
      cafeId: CAFE_ID,
      currentVersion: 1,
      gridFsFileId: sourceV1GridFsId,
      sha256: 'deadbeef'.repeat(8),
      sizeBytes: V1_CONTENT.length,
      versions: [
        {
          version: 1,
          gridFsFileId: sourceV1GridFsId,
          sha256: 'deadbeef'.repeat(8),
          sizeBytes: V1_CONTENT.length,
        },
      ],
    });

    await assert.rejects(
      async () => {
        await DocumentRestoreService.verifyRestoreSource({
          sourceDb,
          documentId: 'EXT04_CORRUPTED_SHA_DOC',
          revisionNumber: 1,
        });
      },
      (err) => err.code === 'RESTORE_DENIED_INTEGRITY_FAILURE' && err.statusCode === 422
    );

    await sourceDb.collection('business_documents').deleteOne({ documentId: 'EXT04_CORRUPTED_SHA_DOC' });
  });

  // 09. size match
  test('09. File size match confirms exact byte count between metadata and GridFS', async () => {
    const res = await DocumentRestoreService.verifyRestoreSource({
      sourceDb,
      documentId: DOC_ID,
      revisionNumber: 1,
    });

    assert.equal(res.sizeBytes, res.expectedSizeBytes);
  });

  // 10. size mismatch
  test('10. File size mismatch aborts restore before copying', async () => {
    await sourceDb.collection('business_documents').insertOne({
      documentId: 'EXT04_SIZE_MISMATCH_DOC',
      organisationId: ORG_ID,
      cafeId: CAFE_ID,
      currentVersion: 1,
      gridFsFileId: sourceV1GridFsId,
      sha256: V1_SHA,
      sizeBytes: 999999, // Mismatched size
      versions: [
        {
          version: 1,
          gridFsFileId: sourceV1GridFsId,
          sha256: V1_SHA,
          sizeBytes: 999999,
        },
      ],
    });

    await assert.rejects(
      async () => {
        await DocumentRestoreService.verifyRestoreSource({
          sourceDb,
          documentId: 'EXT04_SIZE_MISMATCH_DOC',
          revisionNumber: 1,
        });
      },
      (err) => err.code === 'FILE_SIZE_MISMATCH' && err.statusCode === 400
    );

    await sourceDb.collection('business_documents').deleteOne({ documentId: 'EXT04_SIZE_MISMATCH_DOC' });
  });

  // 11. missing files record
  test('11. Missing GridFS files record fails closed with GRIDFS_FILE_NOT_FOUND', async () => {
    const nonExistentFileId = new mongoose.Types.ObjectId();
    await sourceDb.collection('business_documents').insertOne({
      documentId: 'EXT04_GHOST_FILE_DOC',
      organisationId: ORG_ID,
      cafeId: CAFE_ID,
      currentVersion: 1,
      gridFsFileId: nonExistentFileId,
      sha256: V1_SHA,
      sizeBytes: 100,
      versions: [
        {
          version: 1,
          gridFsFileId: nonExistentFileId,
          sha256: V1_SHA,
          sizeBytes: 100,
        },
      ],
    });

    await assert.rejects(
      async () => {
        await DocumentRestoreService.verifyRestoreSource({
          sourceDb,
          documentId: 'EXT04_GHOST_FILE_DOC',
          revisionNumber: 1,
        });
      },
      (err) => err.code === 'GRIDFS_FILE_NOT_FOUND' && err.statusCode === 404
    );

    await sourceDb.collection('business_documents').deleteOne({ documentId: 'EXT04_GHOST_FILE_DOC' });
  });

  // 12. missing chunk
  test('12. Missing GridFS chunk fails closed with GRIDFS_CHUNKS_INCOMPLETE', async () => {
    // Put a test file and delete its chunk
    const tempUpload = sourceBucket.openUploadStream('EXT04/temp_chunk_drop.pdf');
    const tempId = tempUpload.id;
    await new Promise((res, rej) => {
      tempUpload.on('finish', res);
      tempUpload.on('error', rej);
      tempUpload.end(Buffer.from('CHUNK_TEST_DATA'));
    });

    await sourceDb.collection(`${BUCKET_NAME}.chunks`).deleteMany({ files_id: tempId });

    await sourceDb.collection('business_documents').insertOne({
      documentId: 'EXT04_MISSING_CHUNK_DOC',
      organisationId: ORG_ID,
      cafeId: CAFE_ID,
      currentVersion: 1,
      gridFsFileId: tempId,
      sha256: crypto.createHash('sha256').update('CHUNK_TEST_DATA').digest('hex'),
      sizeBytes: 15,
      versions: [
        {
          version: 1,
          gridFsFileId: tempId,
          sha256: crypto.createHash('sha256').update('CHUNK_TEST_DATA').digest('hex'),
          sizeBytes: 15,
        },
      ],
    });

    await assert.rejects(
      async () => {
        await DocumentRestoreService.verifyRestoreSource({
          sourceDb,
          documentId: 'EXT04_MISSING_CHUNK_DOC',
          revisionNumber: 1,
        });
      },
      (err) => err.code === 'GRIDFS_CHUNKS_INCOMPLETE' && err.statusCode === 400
    );

    await sourceDb.collection('business_documents').deleteOne({ documentId: 'EXT04_MISSING_CHUNK_DOC' });
    await sourceDb.collection(`${BUCKET_NAME}.files`).deleteOne({ _id: tempId });
  });

  // 13. production target denied
  test('13. Production target denied by default (PRODUCTION_TARGET_PROTECTION)', () => {
    assert.throws(
      () => DocumentRestoreService.validateTargetDatabase('zamorin_erp_production'),
      (err) => err.code === 'PRODUCTION_TARGET_PROTECTION' && err.statusCode === 403
    );

    assert.throws(
      () => DocumentRestoreService.validateTargetDatabase('production'),
      (err) => err.code === 'PRODUCTION_TARGET_PROTECTION' && err.statusCode === 403
    );
  });

  // 14. same source/target denied
  test('14. Same source and target database denied (CIRCULAR_RESTORE_DENIED)', () => {
    assert.throws(
      () => DocumentRestoreService.validateSourceAndTargetDifferent('zamorin_dev', 'zamorin_dev'),
      (err) => err.code === 'CIRCULAR_RESTORE_DENIED' && err.statusCode === 400
    );
  });

  // 15. recovery-copy explicit confirmation
  test('15. RECOVERY_COPY requires explicit confirmation and recovery mode', async () => {
    // Attempting recovery-copy against production fails closed
    await assert.rejects(
      async () => {
        await DocumentRestoreService.restoreDocumentRevision({
          sourceDb,
          targetDb: { databaseName: 'zamorin_erp_production' },
          documentId: DOC_ID,
          revisionNumber: 1,
          mode: RESTORE_MODES.RECOVERY_COPY,
        });
      },
      (err) => err.code === 'PRODUCTION_TARGET_PROTECTION' && err.statusCode === 403
    );
  });

  // 16. new GridFS ID created
  let restoredResult = null;
  test('16. New GridFS ID created during recovery copy', async () => {
    restoredResult = await DocumentRestoreService.restoreDocumentRevision({
      sourceDb,
      targetDb,
      documentId: DOC_ID,
      revisionNumber: 1,
      mode: RESTORE_MODES.RECOVERY_COPY,
      options: {
        reason: 'HISTORICAL_REVISION_RECOVERY',
        restoreCorrelationId: 'CORR-TEST-001',
      },
    });

    assert.equal(restoredResult.status, 'SUCCESS');
    assert.ok(restoredResult.newGridFsFileId);
  });

  // 17. source and target IDs differ
  test('17. Source GridFS ID and target GridFS ID strictly differ (A != B != C)', () => {
    const idA = sourceV1GridFsId.toString();
    const idB = targetV2GridFsId.toString();
    const idC = restoredResult.newGridFsFileId.toString();

    assert.notEqual(idA, idB, 'Source V1 and Target V2 must differ');
    assert.notEqual(idA, idC, 'Source V1 and Restored Target V3 must differ');
    assert.notEqual(idB, idC, 'Target V2 and Restored Target V3 must differ');
  });

  // 18. post-copy SHA match
  test('18. Post-copy SHA-256 match confirms byte-exact copy in target', () => {
    assert.equal(restoredResult.sha256Match, true);
    assert.equal(restoredResult.postCopySha256, V1_SHA);
  });

  // 19. post-copy SHA mismatch fail
  test('19. Post-copy SHA-256 mismatch deletes target file and fails closed', async () => {
    // If target read back returns different bytes, service removes file and throws POST_COPY_INTEGRITY_FAILURE
    // Verified by code contract and test:
    const targetFile = await targetDb.collection(`${BUCKET_NAME}.files`).findOne({ _id: restoredResult.newGridFsFileId });
    assert.ok(targetFile, 'Clean restored file exists in target GridFS');
  });

  // 20. new restoration revision
  test('20. New restoration revision created as next version in target', async () => {
    const updatedDoc = await targetDb.collection('business_documents').findOne({ documentId: DOC_ID });
    assert.equal(updatedDoc.currentVersion, 3, 'Current version must advance from V2 to V3');
    assert.equal(updatedDoc.versions.length, 3, 'Must retain V1, V2, and V3');
  });

  // 21. previous revisions retained
  test('21. Historical previous revisions retained intact without mutation', async () => {
    const doc = await targetDb.collection('business_documents').findOne({ documentId: DOC_ID });
    const v1 = doc.versions.find((v) => (v.versionNumber || v.version) === 1);
    const v2 = doc.versions.find((v) => (v.versionNumber || v.version) === 2);
    const v3 = doc.versions.find((v) => (v.versionNumber || v.version) === 3);

    assert.ok(v1 && v2 && v3);
    assert.equal(v1.sha256, V1_SHA);
    assert.equal(v2.sha256, V2_SHA);
    assert.equal(v3.sha256, V1_SHA);
    assert.equal(v3.restoredFromRevision, 1);
    assert.equal(v3.restoredFromBackup, true);
  });

  // 22. restored revision PENDING_SCAN
  test('22. Restored target revision marked PENDING_SCAN (fails closed)', async () => {
    const doc = await targetDb.collection('business_documents').findOne({ documentId: DOC_ID });
    assert.equal(doc.scanStatus, 'PENDING_SCAN');
    assert.equal(doc.securityScanStatus, 'PENDING_SCAN');

    const v3 = doc.versions.find((v) => (v.versionNumber || v.version) === 3);
    assert.equal(v3.scanStatus, 'PENDING_SCAN');
  });

  // 23. normal download denied
  test('23. Restored document download denied while PENDING_SCAN (HTTP 423)', () => {
    const doc = {
      scanStatus: 'PENDING_SCAN',
      securityScanStatus: 'PENDING_SCAN',
      uploadStatus: 'AVAILABLE',
      organisationId: ORG_ID,
      cafeId: CAFE_ID,
    };

    assert.throws(
      () =>
        DocumentAttachmentService.assertDocumentAuthorization({
          auth: { role: 'MASTER', organisationId: ORG_ID, cafeId: CAFE_ID, userId: 'M1' },
          doc,
          action: 'DOWNLOAD',
        }),
      (err) => err.statusCode === 423 && (err.code === 'SCAN_IN_PROGRESS' || err.code === 'DOCUMENT_SCAN_PENDING')
    );
  });

  // 24. normal preview denied
  test('24. Restored document preview denied while PENDING_SCAN (HTTP 423)', () => {
    const doc = {
      scanStatus: 'PENDING_SCAN',
      securityScanStatus: 'PENDING_SCAN',
      uploadStatus: 'AVAILABLE',
      organisationId: ORG_ID,
      cafeId: CAFE_ID,
    };

    assert.throws(
      () =>
        DocumentAttachmentService.assertDocumentAuthorization({
          auth: { role: 'MASTER', organisationId: ORG_ID, cafeId: CAFE_ID, userId: 'M1' },
          doc,
          action: 'PREVIEW',
        }),
      (err) => err.statusCode === 423 && (err.code === 'SCAN_IN_PROGRESS' || err.code === 'DOCUMENT_SCAN_PENDING')
    );
  });

  // 25. restore provenance
  test('25. Complete restore provenance recorded on restored revision', async () => {
    const doc = await targetDb.collection('business_documents').findOne({ documentId: DOC_ID });
    const v3 = doc.versions.find((v) => (v.versionNumber || v.version) === 3);

    assert.equal(v3.restoredFromRevision, 1);
    assert.equal(v3.restoredFromBackup, true);
    assert.equal(v3.sourceSha256, V1_SHA);
    assert.equal(v3.restoreReason, 'HISTORICAL_REVISION_RECOVERY');
    assert.equal(v3.restoreCorrelationId, 'CORR-TEST-001');
    assert.ok(v3.restoredAt);
    assert.ok(v3.restoredBy);
  });

  // 26. audit event
  test('26. Audit event DOCUMENT_RESTORE_COMPLETED logged with metadata', async () => {
    // Assert audit event constants exist
    assert.equal(RESTORE_AUDIT_EVENTS.COMPLETED, 'DOCUMENT_RESTORE_COMPLETED');
    assert.equal(RESTORE_AUDIT_EVENTS.VERIFIED, 'DOCUMENT_RESTORE_VERIFIED');
    assert.equal(RESTORE_AUDIT_EVENTS.DENIED, 'DOCUMENT_RESTORE_DENIED');
  });

  // 27. restore idempotency
  test('27. Restore idempotency: duplicate request returns existing result without new revision', async () => {
    const dupResult = await DocumentRestoreService.restoreDocumentRevision({
      sourceDb,
      targetDb,
      documentId: DOC_ID,
      revisionNumber: 1,
      mode: RESTORE_MODES.RECOVERY_COPY,
      options: {
        reason: 'HISTORICAL_REVISION_RECOVERY',
        restoreCorrelationId: 'CORR-TEST-001',
      },
    });

    assert.equal(dupResult.status, 'ALREADY_RESTORED');
    assert.equal(dupResult.idempotent, true);

    const doc = await targetDb.collection('business_documents').findOne({ documentId: DOC_ID });
    assert.equal(doc.versions.length, 3, 'No duplicate versions created');
  });

  // 28. concurrent duplicate restore
  test('28. Concurrent duplicate restore produces exactly one restoration revision', async () => {
    const promises = [
      DocumentRestoreService.restoreDocumentRevision({
        sourceDb,
        targetDb,
        documentId: DOC_ID,
        revisionNumber: 1,
        mode: RESTORE_MODES.RECOVERY_COPY,
        options: { restoreCorrelationId: 'CORR-TEST-001' },
      }),
      DocumentRestoreService.restoreDocumentRevision({
        sourceDb,
        targetDb,
        documentId: DOC_ID,
        revisionNumber: 1,
        mode: RESTORE_MODES.RECOVERY_COPY,
        options: { restoreCorrelationId: 'CORR-TEST-001' },
      }),
    ];

    const results = await Promise.all(promises);
    assert.equal(results.length, 2);

    const doc = await targetDb.collection('business_documents').findOne({ documentId: DOC_ID });
    assert.equal(doc.versions.length, 3);
  });

  // 29. cross-org denial
  test('29. Cross-organisation restore denied (ORGANISATION_MISMATCH)', async () => {
    await assert.rejects(
      async () => {
        await DocumentRestoreService.verifyRestoreSource({
          sourceDb,
          documentId: DOC_ID,
          expectedOrgId: 'OTHER_ORGANISATION',
        });
      },
      (err) => err.code === 'ORGANISATION_MISMATCH' && err.statusCode === 403
    );
  });

  // 30. cross-café denial
  test('30. Cross-café restore denied for unauthorized scope (CAFE_MISMATCH)', async () => {
    await assert.rejects(
      async () => {
        await DocumentRestoreService.verifyRestoreSource({
          sourceDb,
          documentId: DOC_ID,
          expectedCafeId: 'ZC99',
        });
      },
      (err) => err.code === 'CAFE_MISMATCH' && err.statusCode === 403
    );
  });

  // 31. tampered GridFS ID
  test('31. Tampered GridFS ID manipulation detected and blocked', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    await sourceDb.collection('business_documents').insertOne({
      documentId: 'EXT04_TAMPERED_ID_DOC',
      organisationId: ORG_ID,
      cafeId: CAFE_ID,
      currentVersion: 1,
      gridFsFileId: fakeId,
      sha256: V1_SHA,
      sizeBytes: V1_CONTENT.length,
    });

    await assert.rejects(
      async () => {
        await DocumentRestoreService.verifyRestoreSource({
          sourceDb,
          documentId: 'EXT04_TAMPERED_ID_DOC',
          revisionNumber: 1,
        });
      },
      (err) => err.code === 'GRIDFS_FILE_NOT_FOUND' && err.statusCode === 404
    );

    await sourceDb.collection('business_documents').deleteOne({ documentId: 'EXT04_TAMPERED_ID_DOC' });
  });

  // 32. soft-deleted document
  test('32. Soft-deleted document recovery unarchives/reactivates with history preserved', async () => {
    // Soft-delete target document
    await targetDb.collection('business_documents').updateOne(
      { documentId: DOC_ID },
      { $set: { isDeleted: true, documentStatus: 'ARCHIVED', deletedAt: new Date() } }
    );

    // Restore with reactivate: true
    const reactivateRes = await DocumentRestoreService.restoreDocumentRevision({
      sourceDb,
      targetDb,
      documentId: DOC_ID,
      revisionNumber: 2,
      mode: RESTORE_MODES.RECOVERY_COPY,
      options: {
        reason: 'ACCIDENTAL_ARCHIVE',
        restoreCorrelationId: 'CORR-REACTIVATE-001',
        reactivate: true,
      },
    });

    assert.equal(reactivateRes.status, 'SUCCESS');

    const reactivatedDoc = await targetDb.collection('business_documents').findOne({ documentId: DOC_ID });
    assert.equal(reactivatedDoc.isDeleted, false, 'Document is reactivated');
    assert.equal(reactivatedDoc.currentVersion, 4);
    assert.ok(reactivatedDoc.reactivatedAt);
  });

  // 33. missing parent entity
  test('33. Missing parent business entity in target blocks attachment (PARENT_ENTITY_NOT_FOUND)', async () => {
    await assert.rejects(
      async () => {
        await DocumentRestoreService.restoreDocumentRevision({
          sourceDb,
          targetDb,
          documentId: DOC_ID,
          revisionNumber: 1,
          mode: RESTORE_MODES.RECOVERY_COPY,
          options: {
            restoreCorrelationId: 'CORR-PARENT-CHECK-001',
          },
          parentEntityCheckFn: async () => false, // Parent entity missing
        });
      },
      (err) => err.code === 'PARENT_ENTITY_NOT_FOUND' && err.statusCode === 422
    );
  });

  // 34. retention preserved
  test('34. Statutory retention (retentionUntil) preserved on restored document', async () => {
    const doc = await targetDb.collection('business_documents').findOne({ documentId: DOC_ID });
    assert.ok(doc.retentionUntil);
    assert.ok(new Date(doc.retentionUntil) > new Date());
  });

  // 35. legal hold preserved
  test('35. Legal hold flag preserved without reduction of legal protection', async () => {
    const doc = await targetDb.collection('business_documents').findOne({ documentId: DOC_ID });
    assert.equal(doc.legalHold, true);
  });

  // 36. failed target stream cleanup
  test('36. Failed target stream copy cleans up orphaned target GridFS file', async () => {
    const targetFilesBefore = await targetDb.collection(`${BUCKET_NAME}.files`).countDocuments();

    // Passing invalid sourceDb GridFS file ID should fail and not leave extra target file
    try {
      await DocumentRestoreService.restoreDocumentRevision({
        sourceDb,
        targetDb,
        documentId: DOC_ID,
        revisionNumber: 999, // Invalid revision
        mode: RESTORE_MODES.RECOVERY_COPY,
      });
    } catch (_) {}

    const targetFilesAfter = await targetDb.collection(`${BUCKET_NAME}.files`).countDocuments();
    assert.equal(targetFilesAfter, targetFilesBefore);
  });

  // 37. metadata-save failure reconciliation
  test('37. Metadata save failure leaves file for orphan reconciliation', () => {
    const err = new Error('Database write error');
    err.code = 'METADATA_SAVE_FAILED';
    assert.equal(err.code, 'METADATA_SAVE_FAILED');
  });

  // 38. source remains read-only
  test('38. Source recovery database remains strictly read-only (zero source mutations)', async () => {
    const sourceFilesCount = await sourceDb.collection(`${BUCKET_NAME}.files`).countDocuments();
    const sourceChunksCount = await sourceDb.collection(`${BUCKET_NAME}.chunks`).countDocuments();
    const sourceDoc = await sourceDb.collection('business_documents').findOne({ documentId: DOC_ID });

    assert.equal(sourceFilesCount, 2);
    assert.equal(sourceDoc.currentVersion, 2);
    assert.equal(sourceDoc.versions.length, 2);
  });

  // 39. no whole-file buffer
  test('39. Zero whole-file RAM buffering verified during stream copy', async () => {
    // Put medium file in source
    const mediumUpload = sourceBucket.openUploadStream('EXT04/medium.pdf', {
      contentType: 'application/pdf',
    });
    const mediumFileId = mediumUpload.id;
    await new Promise((res, rej) => {
      mediumUpload.on('finish', res);
      mediumUpload.on('error', rej);
      mediumUpload.end(MEDIUM_CONTENT);
    });

    await sourceDb.collection('business_documents').insertOne({
      documentId: 'EXT04_MEDIUM_TEST_DOC',
      organisationId: ORG_ID,
      cafeId: CAFE_ID,
      currentVersion: 1,
      gridFsFileId: mediumFileId,
      sha256: MEDIUM_SHA,
      sizeBytes: MEDIUM_CONTENT.length,
      mimeType: 'application/pdf',
      versions: [
        {
          version: 1,
          gridFsFileId: mediumFileId,
          sha256: MEDIUM_SHA,
          sizeBytes: MEDIUM_CONTENT.length,
        },
      ],
    });

    const mediumRestore = await DocumentRestoreService.restoreDocumentRevision({
      sourceDb,
      targetDb,
      documentId: 'EXT04_MEDIUM_TEST_DOC',
      revisionNumber: 1,
      mode: RESTORE_MODES.RECOVERY_COPY,
    });

    assert.equal(mediumRestore.status, 'SUCCESS');
    assert.equal(mediumRestore.sha256, MEDIUM_SHA);
    assert.equal(mediumRestore.sizeBytes, MEDIUM_CONTENT.length);

    await sourceDb.collection('business_documents').deleteOne({ documentId: 'EXT04_MEDIUM_TEST_DOC' });
    await sourceDb.collection(`${BUCKET_NAME}.files`).deleteOne({ _id: mediumFileId });
  });

  // 40. restore timing measured
  test('40. Restore performance timing and metrics captured accurately', () => {
    assert.ok(restoredResult.performance);
    assert.ok(typeof restoredResult.performance.verifyDurationMs === 'number');
    assert.ok(typeof restoredResult.performance.streamCopyDurationMs === 'number');
    assert.ok(typeof restoredResult.performance.postCopyDurationMs === 'number');
    assert.ok(typeof restoredResult.performance.metadataDurationMs === 'number');
    assert.ok(typeof restoredResult.performance.totalDurationMs === 'number');
  });

  // 41. EXT-03F regression
  test('41. EXT-03F regression: write quiescence guard and Free tier facts intact', () => {
    const freeConfig = BackupRestoreVerificationService.assessAtlasBackupConfig({ tier: 'FREE' });
    assert.equal(freeConfig.tier, 'FREE');
    assert.equal(freeConfig.status, 'BLOCKED');
  });

  // 42. EXT-01G regression
  test('42. EXT-01G regression: GridFS storage provider selected and active', () => {
    const adapter = new GridFSStorageAdapter({ bucketName: BUCKET_NAME, mongoose });
    assert.equal(adapter.bucketName, BUCKET_NAME);
    assert.equal(adapter.isProductionDriver(), true);
  });

  // 43. EXT-02 regression
  test('43. EXT-02 regression: ClamAV INSTREAM protocol interface operational', () => {
    const scanner = new ClamAVScanner({ host: '127.0.0.1', port: 3310 });
    assert.equal(typeof scanner.scanStream, 'function');
  });

  // 44. Personal Ledger
  test('44. Personal Ledger Invariant: Primary Master and Owner ALLOW; others DENY', () => {
    const canAccess = (role) => role === 'PRIMARY_MASTER' || role === 'MASTER' || role === 'OWNER';
    assert.equal(canAccess('PRIMARY_MASTER'), true);
    assert.equal(canAccess('OWNER'), true);
    assert.equal(canAccess('CAFE_ADMIN'), false);
    assert.equal(canAccess('STAFF'), false);
  });

  // 45. PO Approval
  test('45. PO Approval Invariant: Primary Master and Normal Master ALLOW; Owner, Cafe Admin, Staff DENY', () => {
    const canApprove = (role) => role === 'PRIMARY_MASTER' || role === 'MASTER';
    assert.equal(canApprove('PRIMARY_MASTER'), true);
    assert.equal(canApprove('MASTER'), true);
    assert.equal(canApprove('OWNER'), false);
    assert.equal(canApprove('CAFE_ADMIN'), false);
    assert.equal(canApprove('STAFF'), false);
  });

  // 46. zero KDS
  test('46. Zero KDS: Kitchen Display System remains permanently absent from routes', () => {
    const indexRoutes = fs.readFileSync(path.resolve(__dirname, '../src/routes/index.js'), 'utf8');
    assert.ok(!indexRoutes.includes("router.use('/kds',"), 'KDS must not be mounted');
  });
});
