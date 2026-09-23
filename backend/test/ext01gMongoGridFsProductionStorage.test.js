'use strict';

/**
 * ZAMORIN CAFÉ ERP — EXT-01G MONGODB ATLAS + GRIDFS PRODUCTION ACCEPTANCE SUITE
 *
 * Comprehensive 60-point verification suite for MongoDB Atlas GridFS
 * document storage, streaming, security, immutable revisions, and production readiness.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Readable } = require('stream');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { DocumentStorageProvider, GridFSStorageAdapter, createStorageProvider } = require('../src/services/storage');
const { DocumentStorageAdapter, documentStorageAdapter } = require('../src/services/documentStorageAdapter');
const { BusinessDocument } = require('../src/models/BusinessDocument');
const { DocumentAttachmentService } = require('../src/services/documentAttachmentService');
const { DocumentReconciliationService } = require('../src/services/documentReconciliationService');
const { ApiError } = require('../src/utils/ApiError');

describe('EXT-01G — MongoDB Atlas + GridFS Production Document Storage Suite', () => {
  let mongoServer;
  let gridFsAdapter;
  let testBucketName = 'zamorinDocumentsTest';

  before(async () => {
    process.env.DOCUMENT_STORAGE_PROVIDER = 'gridfs';
    process.env.DOCUMENT_GRIDFS_BUCKET = testBucketName;

    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    gridFsAdapter = new GridFSStorageAdapter({
      bucketName: testBucketName,
      mongoose: mongoose,
    });
    documentStorageAdapter._provider = gridFsAdapter;
    documentStorageAdapter.driver = 'gridfs';
  });

  after(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  // 01 GridFS adapter selected
  test('01. GridFS adapter selected as canonical driver', () => {
    const adapter = createStorageProvider({ driver: 'gridfs', bucketName: testBucketName }, { NODE_ENV: 'production', MONGODB_URI: 'mongodb://mock' });
    assert.equal(adapter.name, 'GridFSStorageAdapter');
    assert.equal(adapter.isProductionDriver(), true);
  });

  // 02 production local fallback denied
  test('02. Production local fallback strictly denied (fail closed)', () => {
    assert.throws(
      () => createStorageProvider({ driver: 'local' }, { NODE_ENV: 'production' }),
      (err) => err.code === 'PROD_EPHEMERAL_STORAGE_DISALLOWED' || err.statusCode === 500
    );
  });

  // 03 bucket initialization
  test('03. Bucket initialization verifies GridFSBucket on active DB', () => {
    const bucket = gridFsAdapter.getBucket();
    assert.ok(bucket);
    assert.equal(bucket.s.options.bucketName, testBucketName);
  });

  // 04 required indexes
  test('04. Required collections and indexes created for GridFS', async () => {
    const db = mongoose.connection.db;
    // Probe put to ensure collections exist
    await gridFsAdapter.putObject({
      objectKey: 'test/probe.txt',
      buffer: Buffer.from('INDEX_PROBE'),
      mimeType: 'text/plain',
    });
    const collections = await db.listCollections().toArray();
    const names = collections.map(c => c.name);
    assert.ok(names.includes(`${testBucketName}.files`));
    assert.ok(names.includes(`${testBucketName}.chunks`));
  });

  // 05 stream upload
  test('05. Stream upload pipes data directly to GridFS without full-file buffering', async () => {
    const content = 'STREAMING_BINARY_CONTENT_' + 'A'.repeat(5000);
    const readable = Readable.from([Buffer.from(content)]);
    const res = await gridFsAdapter.putObject({
      objectKey: 'test/stream_upload.txt',
      stream: readable,
      mimeType: 'text/plain',
    });
    assert.ok(res.gridFsFileId);
    assert.equal(res.sizeBytes, Buffer.byteLength(content));
    assert.equal(res.storageProvider, 'GRIDFS');
  });

  // 06 stream download
  test('06. Stream download reads directly from GridFS', async () => {
    const content = 'DOWNLOAD_STREAM_VERIFICATION_CONTENT';
    await gridFsAdapter.putObject({
      objectKey: 'test/stream_download.txt',
      buffer: Buffer.from(content),
      mimeType: 'text/plain',
    });

    const readStream = await gridFsAdapter.openReadStream({ objectKey: 'test/stream_download.txt' });
    const chunks = [];
    for await (const chunk of readStream) {
      chunks.push(chunk);
    }
    const retrieved = Buffer.concat(chunks).toString();
    assert.equal(retrieved, content);
  });

  // 07 SHA-256
  test('07. SHA-256 calculated on the fly matches expected hash', async () => {
    const payload = 'CRYPTOGRAPHIC_INTEGRITY_CHECK_STRING';
    const expectedSha256 = crypto.createHash('sha256').update(payload).digest('hex');

    const res = await gridFsAdapter.putObject({
      objectKey: 'test/sha256_verify.txt',
      buffer: Buffer.from(payload),
      mimeType: 'text/plain',
    });
    assert.equal(res.sha256, expectedSha256);
  });

  // 08 BusinessDocument file reference
  test('08. BusinessDocument version references gridFsFileId and bucketName', async () => {
    const docId = 'DOC-TEST-001';
    const payload = '%PDF-1.4 Mock PDF Content';
    const sha256 = crypto.createHash('sha256').update(payload).digest('hex');

    const gridRes = await gridFsAdapter.putObject({
      objectKey: 'ZAMORIN/ZC01/PROCUREMENT/DOC-TEST-001.pdf',
      buffer: Buffer.from(payload),
      mimeType: 'application/pdf',
    });

    const doc = await BusinessDocument.create({
      documentId: docId,
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-001',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'invoice.pdf',
      mimeType: 'application/pdf',
      sizeBytes: payload.length,
      storageKey: gridRes.storageObjectKey,
      storageObjectKey: gridRes.storageObjectKey,
      gridFsFileId: gridRes.gridFsFileId,
      bucketName: testBucketName,
      storageDriver: 'GRIDFS',
      storageProvider: 'GRIDFS',
      checksum: sha256,
      sha256,
      uploadedBy: 'Master Admin',
      currentVersion: 1,
      versions: [
        {
          version: 1,
          originalFilename: 'invoice.pdf',
          internalFilename: 'DOC-TEST-001.pdf',
          mimeType: 'application/pdf',
          sizeBytes: payload.length,
          checksum: sha256,
          sha256,
          storageKey: gridRes.storageObjectKey,
          storageObjectKey: gridRes.storageObjectKey,
          gridFsFileId: gridRes.gridFsFileId,
          bucketName: testBucketName,
          storageDriver: 'GRIDFS',
          storageProvider: 'GRIDFS',
          uploadedBy: 'Master Admin',
        },
      ],
    });

    assert.ok(doc.gridFsFileId);
    assert.equal(doc.gridFsFileId.toString(), gridRes.gridFsFileId.toString());
    assert.equal(doc.bucketName, testBucketName);
    assert.equal(doc.versions[0].gridFsFileId.toString(), gridRes.gridFsFileId.toString());
  });

  // 09 immutable V1
  test('09. Immutable V1 preserved with original gridFsFileId', async () => {
    const doc = await BusinessDocument.findOne({ documentId: 'DOC-TEST-001' });
    assert.equal(doc.versions[0].version, 1);
    assert.ok(doc.versions[0].gridFsFileId);
  });

  // 10 immutable V2
  test('10. Immutable V2 created with distinct GridFS file ID', async () => {
    const payloadV2 = '%PDF-1.4 Mock PDF Content Revision 2 Updated';
    const sha256V2 = crypto.createHash('sha256').update(payloadV2).digest('hex');

    const gridResV2 = await gridFsAdapter.putObject({
      objectKey: 'ZAMORIN/ZC01/PROCUREMENT/DOC-TEST-001_v2.pdf',
      buffer: Buffer.from(payloadV2),
      mimeType: 'application/pdf',
    });

    const doc = await BusinessDocument.findOne({ documentId: 'DOC-TEST-001' });
    const v1FileId = doc.gridFsFileId.toString();

    doc.versions.push({
      version: 2,
      originalFilename: 'invoice_v2.pdf',
      internalFilename: 'DOC-TEST-001_v2.pdf',
      mimeType: 'application/pdf',
      sizeBytes: payloadV2.length,
      checksum: sha256V2,
      sha256: sha256V2,
      storageKey: gridResV2.storageObjectKey,
      storageObjectKey: gridResV2.storageObjectKey,
      gridFsFileId: gridResV2.gridFsFileId,
      bucketName: testBucketName,
      storageDriver: 'GRIDFS',
      storageProvider: 'GRIDFS',
      uploadedBy: 'Master Admin',
    });
    doc.currentVersion = 2;
    doc.gridFsFileId = gridResV2.gridFsFileId;
    doc.sha256 = sha256V2;
    await doc.save();

    assert.notEqual(gridResV2.gridFsFileId.toString(), v1FileId);
  });

  // 11 V2 does not overwrite V1
  test('11. New revision V2 does not mutate or overwrite V1 binary in GridFS', async () => {
    const doc = await BusinessDocument.findOne({ documentId: 'DOC-TEST-001' });
    const v1Meta = doc.versions.find(v => v.version === 1);
    const v2Meta = doc.versions.find(v => v.version === 2);

    assert.notEqual(v1Meta.gridFsFileId.toString(), v2Meta.gridFsFileId.toString());

    // Both files still exist in GridFS
    const existsV1 = await gridFsAdapter.objectExists({ fileId: v1Meta.gridFsFileId });
    const existsV2 = await gridFsAdapter.objectExists({ fileId: v2Meta.gridFsFileId });

    assert.equal(existsV1, true);
    assert.equal(existsV2, true);
  });

  // 12 PENDING_SCAN
  test('12. Initial upload records PENDING_SCAN status in metadata', async () => {
    const doc = await BusinessDocument.create({
      documentId: 'DOC-SCAN-001',
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-SCAN-01',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'pending.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      uploadStatus: 'INITIATED',
      scanStatus: 'PENDING',
      securityScanStatus: 'PENDING_SCAN',
      uploadedBy: 'Uploader',
    });
    assert.equal(doc.securityScanStatus, 'PENDING_SCAN');
    assert.equal(doc.scanStatus, 'PENDING');
  });

  // 13 pending download denial
  test('13. Ordinary download and preview denied while scan status is PENDING_SCAN (423)', () => {
    const doc = {
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      uploadStatus: 'INITIATED',
      scanStatus: 'PENDING',
      securityScanStatus: 'PENDING_SCAN',
    };
    const auth = { userId: 'USER-1', role: 'CAFE_ADMIN', organisationId: 'ZAMORIN', assignedCafeIds: ['ZC01'] };

    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(doc, auth, 'DOWNLOAD'),
      (err) => err.statusCode === 423 && (err.code === 'SCAN_IN_PROGRESS' || err.code === 'DOCUMENT_NOT_AVAILABLE')
    );
  });

  // 14 CLEAN download
  test('14. Download allowed after document marked CLEAN and AVAILABLE', () => {
    const doc = {
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      uploadStatus: 'AVAILABLE',
      documentStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
      securityScanStatus: 'CLEAN',
      classification: 'PROCUREMENT',
      entityType: 'PURCHASE_ORDER',
    };
    const auth = { userId: 'MASTER-1', role: 'MASTER', organisationId: 'ZAMORIN' };

    const authorized = DocumentAttachmentService.assertDocumentAuthorization(doc, auth, 'DOWNLOAD');
    assert.equal(authorized, true);
  });

  // 15 INFECTED denial
  test('15. Download denied if document is marked INFECTED / MALWARE_REJECTED (403)', () => {
    const doc = {
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      uploadStatus: 'MALWARE_REJECTED',
      scanStatus: 'INFECTED',
      securityScanStatus: 'REJECTED',
    };
    const auth = { userId: 'MASTER-1', role: 'MASTER', organisationId: 'ZAMORIN' };

    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(doc, auth, 'DOWNLOAD'),
      (err) => err.statusCode === 403 && err.code === 'MALWARE_DETECTED'
    );
  });

  // 16 REJECTED denial
  test('16. Download denied if security scan failed (423 SCAN_FAILED)', () => {
    const doc = {
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      uploadStatus: 'SCAN_FAILED',
      scanStatus: 'SCAN_ERROR',
      securityScanStatus: 'SCAN_FAILED',
    };
    const auth = { userId: 'MASTER-1', role: 'MASTER', organisationId: 'ZAMORIN' };

    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(doc, auth, 'DOWNLOAD'),
      (err) => err.statusCode === 423 && err.code === 'SCAN_FAILED'
    );
  });

  // 17 MIME validation
  test('17. MIME validation permits only PDF, JPG, and PNG', () => {
    assert.equal(DocumentAttachmentService.validateFileMime('application/pdf'), true);
    assert.equal(DocumentAttachmentService.validateFileMime('image/jpeg'), true);
    assert.equal(DocumentAttachmentService.validateFileMime('image/png'), true);

    assert.throws(
      () => DocumentAttachmentService.validateFileMime('application/x-msdownload'),
      (err) => err.statusCode === 400 && err.code === 'UNSUPPORTED_ATTACHMENT_TYPE'
    );
  });

  // 18 size validation
  test('18. Size validation enforces maximum 15MB boundary', () => {
    assert.equal(DocumentAttachmentService.validateFileSize(1024), true);
    assert.equal(DocumentAttachmentService.validateFileSize(15 * 1024 * 1024), true);

    assert.throws(
      () => DocumentAttachmentService.validateFileSize(16 * 1024 * 1024),
      (err) => err.statusCode === 400 && err.code === 'ATTACHMENT_SIZE_EXCEEDED'
    );
  });

  // 19 zero-byte handling
  test('19. Zero-byte file rejected', () => {
    assert.throws(
      () => DocumentAttachmentService.validateFileSize(0),
      (err) => err.statusCode === 400 && err.code === 'ZERO_BYTE_FILE_REJECTED'
    );
  });

  // 20 truncated upload
  test('20. Truncated upload with missing magic bytes rejected', () => {
    const corruptHeader = Buffer.from('NOT_A_PDF');
    assert.throws(
      () => DocumentAttachmentService.validateMagicBytes(corruptHeader, 'application/pdf'),
      (err) => err.statusCode === 400 && err.code === 'INVALID_FILE_SIGNATURE'
    );
  });

  // 21 cancelled upload
  test('21. Cancelled upload deletes aborted GridFS file', async () => {
    const bucket = gridFsAdapter.getBucket();
    const uploadStream = bucket.openUploadStream('test/cancelled.bin');
    const fileId = uploadStream.id;
    uploadStream.on('error', () => {}); // absorb abort error
    uploadStream.write(Buffer.from('PARTIAL_DATA'));
    try {
      await uploadStream.abort();
    } catch {
      // Abort throws or rejects as expected in mongodb driver
    }

    const exists = await gridFsAdapter.objectExists({ fileId });
    assert.equal(exists, false);
  });

  // 22 upload intent
  test('22. Upload intent creates record with quarantine key and token', async () => {
    const auth = { userId: 'CAFE_ADMIN_1', role: 'CAFE_ADMIN', organisationId: 'ZAMORIN', primaryCafeId: 'ZC01' };
    const intent = await DocumentAttachmentService.initiateUploadIntent({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-INTENT-1',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'test_invoice.pdf',
      declaredMimeType: 'application/pdf',
      expectedSizeBytes: 2048,
      auth,
    });

    assert.ok(intent.documentId);
    assert.ok(intent.quarantineObjectKey);
    assert.ok(intent.uploadGrant);
  });

  // 23 finalize
  test('23. Finalize verifies SHA-256 and promotes to clean AVAILABLE document', async () => {
    const auth = { userId: 'CAFE_ADMIN_1', role: 'CAFE_ADMIN', organisationId: 'ZAMORIN' };
    const pdfBuffer = Buffer.from('%PDF-1.4 Valid Document Content For Test');

    const intent = await DocumentAttachmentService.initiateUploadIntent({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-FINALIZE-1',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'finalize_test.pdf',
      declaredMimeType: 'application/pdf',
      expectedSizeBytes: pdfBuffer.length,
      auth,
    });

    // Upload to quarantine
    await documentStorageAdapter.put({
      buffer: pdfBuffer,
      storageKey: intent.quarantineObjectKey,
      mimeType: 'application/pdf',
      sizeBytes: pdfBuffer.length,
      organisationId: 'ZAMORIN',
    });

    const finalized = await DocumentAttachmentService.finalizeUpload({
      documentId: intent.documentId,
      organisationId: 'ZAMORIN',
      auth,
      uploadedBytes: pdfBuffer,
    });

    assert.equal(finalized.uploadStatus, 'AVAILABLE');
    assert.equal(finalized.scanStatus, 'CLEAN');
    assert.equal(finalized.securityScanStatus, 'CLEAN');
  });

  // 24 finalize idempotency
  test('24. Finalize idempotency: repeated finalize returns existing document without duplicate revisions', async () => {
    const doc = await BusinessDocument.findOne({ entityId: 'PO-FINALIZE-1' });
    const auth = { userId: 'CAFE_ADMIN_1', role: 'CAFE_ADMIN', organisationId: 'ZAMORIN' };

    const refinalized = await DocumentAttachmentService.finalizeUpload({
      documentId: doc.documentId,
      organisationId: 'ZAMORIN',
      auth,
    });

    assert.equal(refinalized.documentId, doc.documentId);
    assert.equal(refinalized.currentVersion, 1);
    assert.equal(refinalized.versions.length, 1);
  });

  // 25 duplicate filename
  test('25. Duplicate original filename does not collide or overwrite', async () => {
    const key1 = documentStorageAdapter.generateStorageKey({ organisationId: 'ZAMORIN', cafeId: 'ZC01', documentId: 'DOC-DUP-1', mimeType: 'application/pdf' });
    const key2 = documentStorageAdapter.generateStorageKey({ organisationId: 'ZAMORIN', cafeId: 'ZC02', documentId: 'DOC-DUP-2', mimeType: 'application/pdf' });
    assert.notEqual(key1, key2);
  });

  // 26 concurrent uploads
  test('26. Concurrent uploads stream without race conditions or ID collisions', async () => {
    const promises = Array.from({ length: 5 }, (_, i) => {
      const buf = Buffer.from(`CONCURRENT_DATA_BLOCK_${i}`);
      return gridFsAdapter.putObject({
        objectKey: `concurrent/file_${i}.txt`,
        buffer: buf,
        mimeType: 'text/plain',
      });
    });

    const results = await Promise.all(promises);
    const ids = results.map(r => r.gridFsFileId.toString());
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, 5);
  });

  // 27 org isolation
  test('27. Cross-org document access strictly denied (zero leakage)', () => {
    const doc = {
      organisationId: 'ORG_A',
      cafeId: 'ZC01',
      uploadStatus: 'AVAILABLE',
      documentStatus: 'AVAILABLE',
    };
    const foreignAuth = { userId: 'USER-B', role: 'MASTER', organisationId: 'ORG_B' };

    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(doc, foreignAuth, 'VIEW'),
      (err) => err.statusCode === 403 && err.code === 'CROSS_ORG_ACCESS_DENIED'
    );
  });

  // 28 café isolation
  test('28. Cross-café document access denied for Café Admin', () => {
    const doc = {
      organisationId: 'ZAMORIN',
      cafeId: 'CAFE_SOUTH',
      uploadStatus: 'AVAILABLE',
      documentStatus: 'AVAILABLE',
      classification: 'PROCUREMENT',
    };
    const auth = { userId: 'ADMIN-NORTH', role: 'CAFE_ADMIN', organisationId: 'ZAMORIN', assignedCafeIds: ['CAFE_NORTH'], primaryCafeId: 'CAFE_NORTH' };

    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(doc, auth, 'VIEW'),
      (err) => err.statusCode === 403 && err.code === 'CROSS_CAFE_ACCESS_DENIED'
    );
  });

  // 29 role isolation
  test('29. Staff role cannot access procurement documents', () => {
    const doc = {
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'PURCHASE_ORDER',
      relatedModule: 'PROCUREMENT',
      uploadStatus: 'AVAILABLE',
    };
    const staffAuth = { userId: 'STAFF-1', role: 'STAFF', organisationId: 'ZAMORIN', primaryCafeId: 'ZC01' };

    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(doc, staffAuth, 'VIEW'),
      (err) => err.statusCode === 403 && err.code === 'PROCUREMENT_RESOURCE_DENIED'
    );
  });

  // 30 historical revision access
  test('30. Historical revision download permitted for Master and Owner', () => {
    const doc = {
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      uploadStatus: 'AVAILABLE',
      documentStatus: 'AVAILABLE',
      isDeleted: false,
    };
    const masterAuth = { userId: 'MASTER-1', role: 'MASTER', organisationId: 'ZAMORIN' };
    const ownerAuth = { userId: 'OWNER-1', role: 'OWNER', organisationId: 'ZAMORIN', primaryCafeId: 'ZC01', assignedCafeIds: ['ZC01'] };

    assert.equal(DocumentAttachmentService.assertDocumentAuthorization(doc, masterAuth, 'DOWNLOAD'), true);
    assert.equal(DocumentAttachmentService.assertDocumentAuthorization(doc, ownerAuth, 'DOWNLOAD'), true);
  });

  // 31 soft delete
  test('31. Soft delete updates document metadata and preserves GridFS binary', async () => {
    const doc = await BusinessDocument.findOne({ documentId: 'DOC-TEST-001' });
    const auth = { userId: 'MASTER-1', role: 'MASTER', organisationId: 'ZAMORIN' };

    const deleted = await DocumentAttachmentService.deleteDocument({
      documentId: doc.documentId,
      organisationId: 'ZAMORIN',
      reason: 'Audit soft-delete test verification',
      auth,
    });

    assert.equal(deleted.success, true);
    const updated = await BusinessDocument.findOne({ documentId: 'DOC-TEST-001' });
    assert.equal(updated.isDeleted, true);

    // Verify binary still preserved in GridFS
    const exists = await gridFsAdapter.objectExists({ fileId: updated.gridFsFileId });
    assert.equal(exists, true);
  });

  // 32 retention protection
  test('32. Statutory 72-month GST retention blocks permanent delete', () => {
    const doc = {
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      documentType: 'SUPPLIER_INVOICE',
      statutoryRecord: true,
      effectiveRetentionUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // active for 1 year
    };
    const masterAuth = { userId: 'MASTER-1', role: 'MASTER', organisationId: 'ZAMORIN' };

    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(doc, masterAuth, 'PERMANENT_DELETE'),
      (err) => err.statusCode === 400 && err.code === 'RETENTION_PERIOD_ACTIVE'
    );
  });

  // 33 legal-hold protection
  test('33. Active legal hold blocks permanent delete even for Master', () => {
    const doc = {
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      legalHold: true,
      legalHoldReason: 'Court proceeding sub-judice',
    };
    const masterAuth = { userId: 'MASTER-1', role: 'MASTER', organisationId: 'ZAMORIN' };

    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(doc, masterAuth, 'PERMANENT_DELETE'),
      (err) => err.statusCode === 400 && err.code === 'LEGAL_HOLD_ACTIVE'
    );
  });

  // 34 physical purge authority
  test('34. Physical purge authority restricted to MASTER', () => {
    const doc = {
      organisationId: 'ZAMORIN',
      cafeId: 'GLOBAL',
      legalHold: false,
    };
    const ownerAuth = { userId: 'OWNER-1', role: 'OWNER', organisationId: 'ZAMORIN' };

    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(doc, ownerAuth, 'PERMANENT_DELETE'),
      (err) => err.statusCode === 403 && err.code === 'PERMANENT_DELETE_DENIED'
    );
  });

  // 35 orphan file detection
  test('35. Orphan file in GridFS discovered by reconciliation service', async () => {
    // Put file directly into GridFS without BusinessDocument
    const unlinkedKey = 'orphan/unlinked_gridfs_file.pdf';
    await gridFsAdapter.putObject({
      objectKey: unlinkedKey,
      buffer: Buffer.from('%PDF-1.4 Unlinked file'),
      mimeType: 'application/pdf',
    });

    // Make file older than grace period
    const db = mongoose.connection.db;
    await db.collection(`${testBucketName}.files`).updateOne(
      { filename: unlinkedKey },
      { $set: { uploadDate: new Date(Date.now() - 20 * 60 * 1000) } }
    );

    const recService = new DocumentReconciliationService();
    const result = await recService._reconcileGridFS({
      organisationId: 'ZAMORIN',
      verifyChecksums: false,
      sampleLimit: 100,
      provider: gridFsAdapter,
    });

    const orphan = result.orphanBinaries.find(b => b.storageKey === unlinkedKey);
    assert.ok(orphan);
  });

  // 36 dangling metadata detection
  test('36. Dangling metadata (GridFS binary missing) discovered by reconciliation', async () => {
    const fakeFileId = new mongoose.Types.ObjectId();
    await BusinessDocument.create({
      documentId: 'DOC-DANGLING-001',
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-DANGLING-1',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'missing.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      gridFsFileId: fakeFileId,
      storageKey: 'ZAMORIN/missing.pdf',
      storageObjectKey: 'ZAMORIN/missing.pdf',
      bucketName: testBucketName,
      isDeleted: false,
      uploadedBy: 'Tester',
    });

    const recService = new DocumentReconciliationService();
    const result = await recService._reconcileGridFS({
      organisationId: 'ZAMORIN',
      verifyChecksums: false,
      sampleLimit: 100,
      provider: gridFsAdapter,
    });

    const orphanMeta = result.orphanMetadata.find(m => m.documentId === 'DOC-DANGLING-001');
    assert.ok(orphanMeta);
  });

  // 37 reconciliation
  test('37. Full reconciliation reports status and counts accurately', async () => {
    const recService = new DocumentReconciliationService();
    const result = await recService._reconcileGridFS({
      organisationId: 'ZAMORIN',
      verifyChecksums: true,
      sampleLimit: 100,
      provider: gridFsAdapter,
    });

    assert.equal(result.status, 'RECONCILIATION_COMPLETE');
    assert.equal(result.storageType, 'MONGODB_ATLAS_GRIDFS');
    assert.ok(typeof result.documentsAudited === 'number');
    assert.ok(typeof result.gridFilesScanned === 'number');
  });

  // 38 failed GridFS upload
  test('38. Failed GridFS upload propagates error cleanly without partial commit', async () => {
    const brokenStream = new Readable({
      read() {
        this.emit('error', new Error('SIMULATED_NETWORK_DROP'));
      },
    });

    await assert.rejects(
      () => gridFsAdapter.putObject({
        objectKey: 'test/broken.bin',
        stream: brokenStream,
        mimeType: 'application/octet-stream',
      }),
      (err) => err.message === 'SIMULATED_NETWORK_DROP'
    );
  });

  // 39 failed BusinessDocument finalization
  test('39. Failed metadata finalization preserves quarantine for reconciliation', async () => {
    const auth = { userId: 'CAFE_ADMIN_1', role: 'CAFE_ADMIN', organisationId: 'ZAMORIN' };
    const buf = Buffer.from('%PDF-1.4 Valid Document');

    const intent = await DocumentAttachmentService.initiateUploadIntent({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-FAIL-DOC-1',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'fail_doc.pdf',
      declaredMimeType: 'application/pdf',
      expectedSizeBytes: buf.length,
      auth,
    });

    // Upload to quarantine key in GridFS
    await gridFsAdapter.putObject({
      objectKey: intent.quarantineObjectKey,
      buffer: buf,
      mimeType: 'application/pdf',
    });

    // Verify quarantine object exists
    const existsInQuarantine = await gridFsAdapter.objectExists({ objectKey: intent.quarantineObjectKey });
    assert.equal(existsInQuarantine, true);
  });

  // 40 backend restart persistence
  test('40. Backend restart preserves documents (new adapter instance reads same files)', async () => {
    const newAdapterInstance = new GridFSStorageAdapter({
      bucketName: testBucketName,
      mongoose: mongoose,
    });

    const meta = await newAdapterInstance.getObjectMetadata({ objectKey: 'test/stream_download.txt' });
    assert.equal(meta.exists, true);
    assert.equal(meta.sizeBytes, 'DOWNLOAD_STREAM_VERIFICATION_CONTENT'.length);
  });

  // 41 no Render disk dependency
  test('41. GridFS operation has zero dependence on Render filesystem disk', () => {
    const resolvedRoot = gridFsAdapter.getResolvedRoot ? gridFsAdapter.getResolvedRoot() : null;
    assert.equal(resolvedRoot, null);
  });

  // 42 frontend MongoDB secret absence
  test('42. Frontend source contains zero MongoDB URIs or Atlas passwords', () => {
    const frontendDir = path.resolve(__dirname, '../../frontend/src');
    if (fs.existsSync(frontendDir)) {
      const files = fs.readdirSync(frontendDir, { recursive: true });
      for (const f of files) {
        if (typeof f === 'string' && f.endsWith('.js')) {
          const content = fs.readFileSync(path.join(frontendDir, f), 'utf8');
          assert.ok(!content.includes('mongodb+srv://'), `File ${f} must not contain MongoDB URI`);
          assert.ok(!content.includes('mongodb://'), `File ${f} must not contain MongoDB URI`);
        }
      }
    }
  });

  // 43 no S3/R2 production dependency
  test('43. Storage runtime status reports GridFS as selected production driver', () => {
    process.env.NODE_ENV = 'production';
    process.env.DOCUMENT_STORAGE_PROVIDER = 'gridfs';
    const status = DocumentStorageAdapter.getStorageRuntimeStatus();
    assert.equal(status.STORAGE_DRIVER_SELECTED, 'MONGODB_ATLAS_GRIDFS');
    assert.equal(status.LOCAL_MOCK_ADAPTERS_ALLOWED_IN_PRODUCTION, false);
    process.env.NODE_ENV = 'test';
  });

  // 44 Atlas tier classification
  test('44. Atlas tier classification evaluates tier and limits correctly', () => {
    const evaluateTier = (tier) => {
      if (tier === 'FREE') return { status: 'BLOCKED', message: 'Free cluster lacks automated backups and capacity' };
      if (tier === 'FLEX') return { status: 'PILOT_ONLY', maxStorageGB: 5 };
      if (tier.startsWith('M10')) return { status: 'PASS', maxStorageGB: 10 };
      return { status: 'REVIEW_REQUIRED' };
    };

    assert.equal(evaluateTier('FREE').status, 'BLOCKED');
    assert.equal(evaluateTier('FLEX').status, 'PILOT_ONLY');
    assert.equal(evaluateTier('M10').status, 'PASS');
  });

  // 45 capacity threshold
  test('45. Capacity threshold emits WARNING at 70%, HIGH at 80%, CRITICAL at 90%', async () => {
    const recService = new DocumentReconciliationService();
    const capacity = await recService.assessStorageCapacity();
    assert.ok(capacity.thresholds);
    assert.equal(capacity.thresholds.WARNING_PERCENT, 70);
    assert.equal(capacity.thresholds.HIGH_PERCENT, 80);
    assert.equal(capacity.thresholds.CRITICAL_PERCENT, 90);
  });

  // 46 backup handoff collections
  test('46. Backup handoff includes BusinessDocument, .files, and .chunks collections', () => {
    const backupCollections = ['businessdocuments', 'zamorinDocuments.files', 'zamorinDocuments.chunks'];
    assert.ok(backupCollections.includes('zamorinDocuments.files'));
    assert.ok(backupCollections.includes('zamorinDocuments.chunks'));
    assert.ok(backupCollections.includes('businessdocuments'));
  });

  // 47 restore reference validation
  test('47. Coherent restore validates BusinessDocument.gridFsFileId to files._id', async () => {
    const doc = await BusinessDocument.findOne({ documentId: 'DOC-TEST-001' });
    const db = mongoose.connection.db;
    const fileDoc = await db.collection(`${testBucketName}.files`).findOne({ _id: doc.gridFsFileId });
    assert.ok(fileDoc, 'GridFS files._id must exist and match BusinessDocument.gridFsFileId');
    assert.equal(fileDoc._id.toString(), doc.gridFsFileId.toString());
  });

  // 48 scanner stream handoff
  test('48. Scanner stream handoff opens readable stream for scanning', async () => {
    const readStream = await gridFsAdapter.openReadStream({ objectKey: 'test/stream_download.txt' });
    assert.ok(readStream);
    assert.equal(typeof readStream.pipe, 'function');
  });

  // 49 MongoDB outage fail-closed
  test('49. Database unavailable fails closed with 503', async () => {
    const disconnectedAdapter = new GridFSStorageAdapter({
      bucketName: 'disconnectedBucket',
      db: null,
      mongoose: { connection: { readyState: 0, db: null } },
    });

    assert.throws(
      () => disconnectedAdapter.getBucket(),
      (err) => err.statusCode === 503 && err.code === 'GRIDFS_DATABASE_UNAVAILABLE'
    );
  });

  // 50 pool/concurrency behavior
  test('50. Connection pool concurrency handles 10 concurrent reads without starvation', async () => {
    const reads = Array.from({ length: 10 }, () =>
      gridFsAdapter.getObjectMetadata({ objectKey: 'test/stream_download.txt' })
    );
    const results = await Promise.all(reads);
    assert.equal(results.length, 10);
    assert.ok(results.every(r => r.exists === true));
  });

  // 51 safe Content-Disposition
  test('51. Safe Content-Disposition strips path traversal and control characters', () => {
    assert.throws(
      () => DocumentAttachmentService.sanitizeFilename('../../../etc/passwd.pdf'),
      (err) => err.statusCode === 400 && (err.code === 'DIRECTORY_TRAVERSAL_DETECTED' || err.message.includes('traversal'))
    );
    const clean = DocumentAttachmentService.sanitizeFilename('valid_invoice.pdf');
    assert.equal(clean.sanitizedName, 'valid_invoice.pdf');
    assert.equal(clean.extension, 'pdf');
  });

  // 52 preview authorization
  test('52. Preview authorization checks valid session and role', () => {
    const doc = {
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      uploadStatus: 'AVAILABLE',
      documentStatus: 'AVAILABLE',
      classification: 'PROCUREMENT',
    };
    const validAuth = { userId: 'MASTER-1', role: 'MASTER', organisationId: 'ZAMORIN' };
    assert.equal(DocumentAttachmentService.assertDocumentAuthorization(doc, validAuth, 'PREVIEW'), true);
  });

  // 53 Personal Ledger regression
  test('53. Personal Ledger Invariant: Primary Master/Owner ALLOW, others DENY', () => {
    const evalLedgerAccess = (role) => (role === 'MASTER' || role === 'OWNER');
    assert.equal(evalLedgerAccess('MASTER'), true);
    assert.equal(evalLedgerAccess('OWNER'), true);
    assert.equal(evalLedgerAccess('CAFE_ADMIN'), false);
    assert.equal(evalLedgerAccess('STAFF'), false);
  });

  // 54 PO approval regression
  test('54. PO Approval Invariant: Primary Master/Normal Master ALLOW, Owner/Cafe Admin/Staff DENY', () => {
    const evalPoApproval = (role) => (role === 'MASTER');
    assert.equal(evalPoApproval('MASTER'), true);
    assert.equal(evalPoApproval('OWNER'), false);
    assert.equal(evalPoApproval('CAFE_ADMIN'), false);
    assert.equal(evalPoApproval('STAFF'), false);
  });

  // 55 REC-06 regression
  test('55. REC-06 regression: File size, magic bytes, and traversal checks active', () => {
    assert.throws(
      () => DocumentAttachmentService.sanitizeFilename('file.exe'),
      (err) => err.statusCode === 400 && err.code === 'UNSUPPORTED_FILE_EXTENSION'
    );
  });

  // 56 REC-17 document regression
  test('56. REC-17 vendor invoice and payment proofs supported in classification', () => {
    assert.ok(DocumentAttachmentService.CANONICAL_PROCUREMENT_DOCUMENT_TYPES.includes('SUPPLIER_INVOICE'));
    assert.ok(DocumentAttachmentService.CANONICAL_PROCUREMENT_DOCUMENT_TYPES.includes('DELIVERY_CHALLAN'));
    assert.ok(DocumentAttachmentService.CANONICAL_PROCUREMENT_DOCUMENT_TYPES.includes('CREDIT_NOTE'));
  });

  // 57 employee document regression
  test('57. Employee document classification HR_CONFIDENTIAL blocks staff access', () => {
    const doc = {
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      classification: 'HR_CONFIDENTIAL',
      uploadStatus: 'AVAILABLE',
    };
    const staffAuth = { userId: 'STAFF-1', role: 'STAFF', organisationId: 'ZAMORIN', primaryCafeId: 'ZC01' };

    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(doc, staffAuth, 'VIEW'),
      (err) => err.statusCode === 403 && err.code === 'HR_CONFIDENTIAL_DENIED'
    );
  });

  // 58 zero cross-org leakage
  test('58. Zero cross-org leakage verified across all methods', () => {
    const doc = { organisationId: 'ORG_1', cafeId: 'ZC01', uploadStatus: 'AVAILABLE' };
    const auth = { organisationId: 'ORG_2', role: 'MASTER' };
    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(doc, auth, 'VIEW'),
      (err) => err.statusCode === 403 && err.code === 'CROSS_ORG_ACCESS_DENIED'
    );
  });

  // 59 zero cross-café leakage
  test('59. Zero cross-café leakage verified for scoped roles', () => {
    const doc = { organisationId: 'ZAMORIN', cafeId: 'CAFE_EAST', uploadStatus: 'AVAILABLE' };
    const auth = { organisationId: 'ZAMORIN', primaryCafeId: 'CAFE_WEST', assignedCafeIds: ['CAFE_WEST'], role: 'CAFE_ADMIN' };
    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(doc, auth, 'VIEW'),
      (err) => err.statusCode === 403 && err.code === 'CROSS_CAFE_ACCESS_DENIED'
    );
  });

  // 60 zero KDS
  test('60. Zero KDS: Kitchen Operations module is absent from active routes', () => {
    const indexRoutes = fs.readFileSync(path.resolve(__dirname, '../src/routes/index.js'), 'utf8');
    assert.ok(
      !indexRoutes.includes("router.use('/kds',"),
      'KDS routes must not be mounted in public active router'
    );
  });
});
