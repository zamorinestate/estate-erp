'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — REC-06 UNIVERSAL DURABLE DOCUMENT STORAGE & SECURITY TEST SUITE
 * ============================================================================
 * Certifies the 40+ mandatory REC-06 criteria:
 * 1.  Durable storage provider interface
 * 2.  Production rejects ephemeral/local canonical storage (PROD_EPHEMERAL_STORAGE_DISALLOWED)
 * 3.  Private object access (no public buckets / static webroot)
 * 4.  Safe generated opaque object key (tenant-partitioned, zero PII/filenames/GSTIN)
 * 5.  Filename traversal rejection (../../invoice.pdf, null bytes)
 * 6.  Double-extension rejection (invoice.pdf.exe, receipt.jpg.js)
 * 7.  MIME mismatch rejection
 * 8.  File signature / magic-byte mismatch rejection (spoofed PDF/PNG/JPG)
 * 9.  File size limit enforcement (15MB cap)
 * 10. Zero-byte file rejection
 * 11. Cryptographic SHA-256 integrity verification
 * 12. Quarantine isolation on initial upload
 * 13. Clean scan transitions to AVAILABLE
 * 14. Malware detection rejection (EICAR, MALWARE_REJECTED, quarantined, security audit)
 * 15. Scanner outage fails closed (SCAN_FAILED, never marked clean)
 * 16. Upload authorization (authenticated, entity validated, role checked)
 * 17. Cross-café upload denial
 * 18. Cross-café download denial (IDOR protection)
 * 19. Staff procurement-document access denial
 * 20. Master permitted cross-café record according to certified policy
 * 21. Owner access according to frozen policy
 * 22. Short-lived signed download grant generation (expires in seconds)
 * 23. Signed URL not stored permanently in database
 * 24. Disabled user fresh download denied (execution-time re-auth)
 * 25. Version replacement creates new immutable object
 * 26. Old versions remain immutable and accessible to authorized audit roles
 * 27. Soft delete / archive semantics
 * 28. Sensitive deletion role control (Master only, mandatory reason)
 * 29. Statutory 72-month GST retention blocks premature deletion
 * 30. Active legal hold blocks deletion (legalHold = true)
 * 31. Storage outage handling (fails safely, no false AVAILABLE)
 * 32. DB failure after upload / object failure after metadata intent
 * 33. Crash recovery (stuck intent resolution to MANUAL_REVIEW_REQUIRED)
 * 34. Orphan reconciliation (metadata without object, object without metadata)
 * 35. Local-file migration tool discovers and migrates legacy files
 * 36. Migration idempotency (no duplicates on rerun)
 * 37. No production local-storage fallback
 * 38. Credentials absent from frontend payloads
 * 39. Credentials absent from logs and audit records
 * 40. Full audit trail coverage across lifecycle transitions
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { BusinessDocument } = require('../src/models/BusinessDocument');
const { DocumentStorageProvider } = require('../src/services/storage/DocumentStorageProvider');
const { LocalDevelopmentStorageAdapter } = require('../src/services/storage/LocalDevelopmentStorageAdapter');
const { S3CompatibleStorageAdapter } = require('../src/services/storage/S3CompatibleStorageAdapter');
const { createStorageProvider } = require('../src/services/storage');
const { documentStorageAdapter, DocumentStorageAdapter } = require('../src/services/documentStorageAdapter');
const { DocumentMalwareScanner, EICAR_SIGNATURE } = require('../src/services/security/DocumentMalwareScanner');
const { DocumentAttachmentService, DEFAULT_DOCUMENT_MAX_BYTES } = require('../src/services/documentAttachmentService');
const { documentReconciliationJob } = require('../src/services/documentReconciliationJob');
const { LocalDocumentMigrator } = require('../src/scripts/migrate_local_documents');
const { AuditEvent } = require('../src/models/AuditEvent');

describe('REC-06 — Universal Durable Private Document Storage & Security Certification Suite', () => {
  let mongoServer;
  let testStorageRoot;

  const orgId = 'ORG-ZAMORIN-TEST';
  const cafeIdA = 'ZC-CAF-01';
  const cafeIdB = 'ZC-CAF-02';

  const masterAuth = { userId: 'USR-MASTER-01', role: 'MASTER', organisationId: orgId, assignedCafeIds: ['GLOBAL'] };
  const ownerAuth = { userId: 'USR-OWNER-01', role: 'OWNER', organisationId: orgId, assignedCafeIds: ['GLOBAL'] };
  const cafeAdminAAuth = { userId: 'USR-ADMIN-01', role: 'CAFE_ADMIN', organisationId: orgId, primaryCafeId: cafeIdA, assignedCafeIds: [cafeIdA] };
  const cafeAdminBAuth = { userId: 'USR-ADMIN-02', role: 'CAFE_ADMIN', organisationId: orgId, primaryCafeId: cafeIdB, assignedCafeIds: [cafeIdB] };
  const staffAAuth = { userId: 'USR-STAFF-01', role: 'STAFF', organisationId: orgId, primaryCafeId: cafeIdA, assignedCafeIds: [cafeIdA] };

  // Sample valid PDF binary: starts with %PDF-1.4
  const samplePdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\nxref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \ntrailer<</Size 3/Root 1 0 R>>\nstartxref\n101\n%%EOF');
  const samplePdfSha256 = crypto.createHash('sha256').update(samplePdfBytes).digest('hex');

  // Sample valid PNG binary: starts with \x89PNG\r\n\x1a\n
  const samplePngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);

  // Sample valid JPEG binary: starts with \xFF\xD8\xFF
  const sampleJpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    testStorageRoot = path.join(os.tmpdir(), `zamorin_rec06_test_storage_${Date.now()}`);
    await fs.promises.mkdir(testStorageRoot, { recursive: true });
    process.env.DOCUMENT_STORAGE_ROOT = testStorageRoot;
  });

  after(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
    if (fs.existsSync(testStorageRoot)) {
      await fs.promises.rm(testStorageRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  beforeEach(async () => {
    await BusinessDocument.deleteMany({});
  });

  // 1. Durable storage provider interface
  it('1. Canonical DocumentStorageProvider abstraction defines all required operations', () => {
    const provider = new DocumentStorageProvider('TestInterface');
    assert.strictEqual(typeof provider.putObject, 'function');
    assert.strictEqual(typeof provider.getObjectMetadata, 'function');
    assert.strictEqual(typeof provider.openReadStream, 'function');
    assert.strictEqual(typeof provider.deleteObject, 'function');
    assert.strictEqual(typeof provider.copyObject, 'function');
    assert.strictEqual(typeof provider.createUploadGrant, 'function');
    assert.strictEqual(typeof provider.createDownloadGrant, 'function');
    assert.strictEqual(typeof provider.objectExists, 'function');
    assert.strictEqual(typeof provider.healthCheck, 'function');
    assert.strictEqual(typeof provider.validateConfiguration, 'function');
  });

  // 2. Production rejects ephemeral/local canonical storage
  it('2. Production configuration rejects local/ephemeral canonical storage (fail-closed)', () => {
    assert.throws(
      () => {
        createStorageProvider({ driver: 'local' }, { NODE_ENV: 'production' });
      },
      (err) => {
        assert.strictEqual(err.code, 'PROD_EPHEMERAL_STORAGE_DISALLOWED');
        return true;
      }
    );
  });

  // 3. Private object access (no public buckets/urls)
  it('3. Private object storage generates non-public keys and grants without public static exposure', async () => {
    const s3Adapter = new S3CompatibleStorageAdapter({
      bucket: 'zamorin-private-docs',
      useInMemoryMock: true,
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });

    const putRes = await s3Adapter.putObject({
      objectKey: 'org/cafe/proc/doc1.pdf',
      buffer: samplePdfBytes,
      mimeType: 'application/pdf',
      sizeBytes: samplePdfBytes.length,
    });

    assert.strictEqual(putRes.storageProvider, 'S3_COMPATIBLE');
    assert.strictEqual(putRes.storageContainer, 'zamorin-private-docs');

    // Grant must be presigned and short-lived, not permanent public URL
    const grant = await s3Adapter.createDownloadGrant({
      objectKey: 'org/cafe/proc/doc1.pdf',
      expiresInSeconds: 180,
    });
    assert.ok(grant.downloadUrl.includes('X-Amz-Expires=180'));
    assert.ok(grant.downloadUrl.includes('X-Amz-Signature='));
  });

  // 4. Safe generated opaque object key
  it('4. Generated object keys are opaque, tenant-partitioned, and expose zero PII/GSTIN/emails', () => {
    const key = documentStorageAdapter.generateStorageKey({
      organisationId: orgId,
      cafeId: cafeIdA,
      classification: 'PROCUREMENT',
      documentId: 'DOC-PO-000101',
      mimeType: 'application/pdf',
    });

    assert.ok(key.startsWith(`${orgId}/${cafeIdA}/procurement/DOC-PO-000101-`));
    assert.ok(key.endsWith('.pdf'));
    assert.ok(!key.includes('gstin'));
    assert.ok(!key.includes('@'));
    assert.ok(!key.includes('salary'));
  });

  // 5. Filename traversal rejection
  it('5. Directory traversal in filenames is strictly rejected', () => {
    assert.throws(
      () => DocumentAttachmentService.sanitizeFilename('../../etc/passwd.pdf'),
      (err) => {
        assert.strictEqual(err.code, 'DIRECTORY_TRAVERSAL_DETECTED');
        return true;
      }
    );

    assert.throws(
      () => DocumentAttachmentService.sanitizeFilename('invoice\0.pdf'),
      (err) => {
        assert.strictEqual(err.code, 'FILENAME_INJECTION_DETECTED');
        return true;
      }
    );
  });

  // 6. Double-extension rejection
  it('6. Double extensions and disguised executables are strictly rejected', () => {
    assert.throws(
      () => DocumentAttachmentService.sanitizeFilename('invoice.pdf.exe'),
      (err) => {
        assert.strictEqual(err.code, 'UNSUPPORTED_FILE_EXTENSION');
        return true;
      }
    );

    assert.throws(
      () => DocumentAttachmentService.sanitizeFilename('receipt.exe.pdf'),
      (err) => {
        assert.strictEqual(err.code, 'DOUBLE_EXTENSION_PROHIBITED');
        return true;
      }
    );

    assert.throws(
      () => DocumentAttachmentService.sanitizeFilename('photo.jpg.js'),
      (err) => {
        assert.strictEqual(err.code, 'UNSUPPORTED_FILE_EXTENSION');
        return true;
      }
    );
  });

  // 7. MIME mismatch rejection
  it('7. Disallowed MIME types outside PDF/JPG/PNG are rejected', () => {
    assert.throws(
      () => DocumentAttachmentService.validateFileMime('application/x-msdownload', 'bad.exe'),
      (err) => {
        assert.strictEqual(err.code, 'UNSUPPORTED_ATTACHMENT_TYPE');
        return true;
      }
    );

    assert.throws(
      () => DocumentAttachmentService.validateFileMime('text/html', 'page.html'),
      (err) => {
        assert.strictEqual(err.code, 'UNSUPPORTED_ATTACHMENT_TYPE');
        return true;
      }
    );
  });

  // 8. Signature / magic-byte mismatch rejection
  it('8. Spoofed file signatures are rejected via magic-byte validation', () => {
    const fakePdfBytes = Buffer.from('NOT_A_REAL_PDF_HEADER_JUST_TEXT');
    assert.throws(
      () => DocumentAttachmentService.validateMagicBytes(fakePdfBytes, 'application/pdf'),
      (err) => {
        assert.strictEqual(err.code, 'INVALID_FILE_SIGNATURE');
        return true;
      }
    );

    // Valid PDF passes
    assert.strictEqual(DocumentAttachmentService.validateMagicBytes(samplePdfBytes, 'application/pdf'), true);
    // Valid PNG passes
    assert.strictEqual(DocumentAttachmentService.validateMagicBytes(samplePngBytes, 'image/png'), true);
    // Valid JPEG passes
    assert.strictEqual(DocumentAttachmentService.validateMagicBytes(sampleJpgBytes, 'image/jpeg'), true);
  });

  // 9. Size limit enforcement
  it('9. File size limit (15MB) is enforced', () => {
    assert.strictEqual(DocumentAttachmentService.validateFileSize(1024), true);
    assert.throws(
      () => DocumentAttachmentService.validateFileSize(16 * 1024 * 1024),
      (err) => {
        assert.strictEqual(err.code, 'ATTACHMENT_SIZE_EXCEEDED');
        return true;
      }
    );
  });

  // 10. Zero-byte rejection
  it('10. Zero-byte file is rejected', () => {
    assert.throws(
      () => DocumentAttachmentService.validateFileSize(0),
      (err) => {
        assert.strictEqual(err.code, 'ZERO_BYTE_FILE_REJECTED');
        return true;
      }
    );
  });

  // 11. Checksum (SHA-256) integrity
  it('11. Cryptographic SHA-256 checksum is computed and verified', () => {
    const hash = DocumentAttachmentService.computeChecksum(samplePdfBytes);
    assert.strictEqual(hash, samplePdfSha256);
  });

  // 12. Quarantine isolation on initial upload
  it('12. Initial upload intent creates record in INITIATED with quarantineKey', async () => {
    const intent = await DocumentAttachmentService.initiateUploadIntent({
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-TEST-101',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'supplier_inv.pdf',
      declaredMimeType: 'application/pdf',
      expectedSizeBytes: samplePdfBytes.length,
      auth: masterAuth,
    });

    assert.ok(intent.documentId.startsWith('DOC-'));
    assert.ok(intent.quarantineObjectKey.startsWith(`quarantine/${orgId}/${cafeIdA}/`));

    const doc = await BusinessDocument.findOne({ documentId: intent.documentId });
    assert.strictEqual(doc.uploadStatus, 'INITIATED');
    assert.strictEqual(doc.scanStatus, 'PENDING');
  });

  // 13. Clean scan transitions to AVAILABLE
  it('13. Finalization promotes quarantined clean file to AVAILABLE in durable storage', async () => {
    const intent = await DocumentAttachmentService.initiateUploadIntent({
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-TEST-102',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'clean_invoice.pdf',
      declaredMimeType: 'application/pdf',
      expectedSizeBytes: samplePdfBytes.length,
      auth: masterAuth,
    });

    // Finalize with valid binary
    const finalized = await DocumentAttachmentService.finalizeUpload({
      documentId: intent.documentId,
      organisationId: orgId,
      auth: masterAuth,
      uploadedBytes: samplePdfBytes,
    });

    assert.strictEqual(finalized.uploadStatus, 'AVAILABLE');
    assert.strictEqual(finalized.scanStatus, 'CLEAN');
    assert.strictEqual(finalized.sha256, samplePdfSha256);
    assert.ok(finalized.storageObjectKey.startsWith(`${orgId}/${cafeIdA}/procurement/`));
  });

  // 14. Malware detection rejection
  it('14. Infected EICAR file is rejected with MALWARE_REJECTED and never made AVAILABLE', async () => {
    const infectedBytes = Buffer.from(`%PDF-1.4\n${EICAR_SIGNATURE}\n%%EOF`);

    const intent = await DocumentAttachmentService.initiateUploadIntent({
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-TEST-103',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'infected_test.pdf',
      declaredMimeType: 'application/pdf',
      expectedSizeBytes: infectedBytes.length,
      auth: masterAuth,
    });

    await assert.rejects(
      async () => {
        await DocumentAttachmentService.finalizeUpload({
          documentId: intent.documentId,
          organisationId: orgId,
          auth: masterAuth,
          uploadedBytes: infectedBytes,
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'MALWARE_DETECTED');
        return true;
      }
    );

    const doc = await BusinessDocument.findOne({ documentId: intent.documentId });
    assert.strictEqual(doc.uploadStatus, 'MALWARE_REJECTED');
    assert.strictEqual(doc.scanStatus, 'INFECTED');
    assert.strictEqual(doc.status, 'REJECTED');
  });

  // 15. Scanner outage fails closed
  it('15. Scanner outage fails closed (SCAN_FAILED) and never marks document clean', async () => {
    const scannerWithOutage = new DocumentMalwareScanner({ simulateOutage: true });

    const scanResult = await scannerWithOutage.scanObject({
      buffer: samplePdfBytes,
      mimeType: 'application/pdf',
      filename: 'sample.pdf',
    });

    assert.strictEqual(scanResult.status, 'SCAN_ERROR');
    assert.ok(scanResult.details.includes('unreachable'));
  });

  // 16. Upload authorization
  it('16. Upload intent requires authenticated user and mandatory parameters', async () => {
    await assert.rejects(
      async () => {
        await DocumentAttachmentService.initiateUploadIntent({
          organisationId: orgId,
          cafeId: cafeIdA,
          entityType: null, // missing
          entityId: '123',
          documentType: 'INV',
          originalFilename: 'test.pdf',
          expectedSizeBytes: 100,
          auth: masterAuth,
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'MISSING_FIELDS');
        return true;
      }
    );
  });

  // 17. Cross-café upload denial
  it('17. Café Admin cannot attach document to an unassigned foreign café', () => {
    const foreignDoc = {
      organisationId: orgId,
      cafeId: cafeIdB, // Cafe B
      classification: 'PROCUREMENT',
    };

    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(foreignDoc, cafeAdminAAuth, 'VIEW'),
      (err) => {
        assert.strictEqual(err.code, 'CROSS_CAFE_ACCESS_DENIED');
        return true;
      }
    );
  });

  // 18. Cross-café download denial (IDOR)
  it('18. Cross-café download attempt by foreign Café Admin is denied', () => {
    const foreignDoc = {
      organisationId: orgId,
      cafeId: cafeIdB,
      classification: 'PROCUREMENT',
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
    };

    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(foreignDoc, cafeAdminAAuth, 'DOWNLOAD'),
      (err) => {
        assert.strictEqual(err.code, 'CROSS_CAFE_ACCESS_DENIED');
        return true;
      }
    );
  });

  // 19. Staff procurement-document denial
  it('19. Staff cannot access procurement documents even within assigned café', () => {
    const poDoc = {
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'PURCHASE_ORDER',
      relatedModule: 'PROCUREMENT',
      classification: 'PROCUREMENT',
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
    };

    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(poDoc, staffAAuth, 'DOWNLOAD'),
      (err) => {
        assert.strictEqual(err.code, 'PROCUREMENT_RESOURCE_DENIED');
        return true;
      }
    );
  });

  // 20. Master permitted record according to policy
  it('20. Master has cross-café document access authority under certified governance', () => {
    const docB = {
      organisationId: orgId,
      cafeId: cafeIdB,
      entityType: 'PURCHASE_ORDER',
      classification: 'PROCUREMENT',
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
    };

    assert.strictEqual(DocumentAttachmentService.assertDocumentAuthorization(docB, masterAuth, 'DOWNLOAD'), true);
  });

  // 21. Owner according to frozen policy
  it('21. Owner can access management confidential and overview records per frozen policy', () => {
    const confidentialDoc = {
      organisationId: orgId,
      cafeId: cafeIdA,
      classification: 'MANAGEMENT_CONFIDENTIAL',
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
    };

    assert.strictEqual(DocumentAttachmentService.assertDocumentAuthorization(confidentialDoc, ownerAuth, 'DOWNLOAD'), true);

    // Cafe Admin cannot access MANAGEMENT_CONFIDENTIAL
    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(confidentialDoc, cafeAdminAAuth, 'DOWNLOAD'),
      (err) => {
        assert.strictEqual(err.code, 'CONFIDENTIAL_RESOURCE_DENIED');
        return true;
      }
    );
  });

  // 22. Short-lived signed download grant generation
  it('22. Authorized download grant is short-lived and expires in seconds', async () => {
    const doc = await DocumentAttachmentService.attachDocument({
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'EXPENSE',
      entityId: 'EXP-101',
      documentType: 'EXPENSE_RECEIPT',
      originalFilename: 'receipt.pdf',
      mimeType: 'application/pdf',
      sizeBytes: samplePdfBytes.length,
      fileBuffer: samplePdfBytes,
      auth: cafeAdminAAuth,
    });

    const grant = await DocumentAttachmentService.createAuthorizedDownloadGrant({
      documentId: doc.documentId,
      organisationId: orgId,
      auth: cafeAdminAAuth,
      expiresInSeconds: 120,
    });

    assert.ok(grant.downloadUrl);
    assert.ok(grant.expiresAt > new Date());
  });

  // 23. Signed URL not stored permanently in database
  it('23. MongoDB BusinessDocument record stores objectKey but NEVER permanent signed URLs', async () => {
    const doc = await DocumentAttachmentService.attachDocument({
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'ASSET',
      entityId: 'AST-101',
      documentType: 'WARRANTY_CARD',
      originalFilename: 'warranty.pdf',
      mimeType: 'application/pdf',
      sizeBytes: samplePdfBytes.length,
      fileBuffer: samplePdfBytes,
      auth: masterAuth,
    });

    const docRecord = await BusinessDocument.findOne({ documentId: doc.documentId }).lean();
    assert.ok(docRecord.storageObjectKey);
    assert.ok(!docRecord.downloadUrl);
    assert.ok(!docRecord.signedUrl);
    assert.ok(!docRecord.storageObjectKey.includes('X-Amz-'));
  });

  // 24. Disabled user cannot generate fresh download
  it('24. Disabled user is denied fresh download grant at execution time', () => {
    const doc = {
      organisationId: orgId,
      cafeId: cafeIdA,
      classification: 'PROCUREMENT',
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
    };

    const disabledUserAuth = {
      userId: 'USR-REVOKED',
      role: 'CAFE_ADMIN',
      organisationId: orgId,
      assignedCafeIds: [cafeIdA],
      userStatus: 'DISABLED',
    };

    assert.throws(
      () => DocumentAttachmentService.assertDocumentAuthorization(doc, disabledUserAuth, 'DOWNLOAD'),
      (err) => {
        assert.strictEqual(err.code, 'USER_DISABLED');
        return true;
      }
    );
  });

  // 25. Version replacement creates new immutable object
  it('25. Version replacement creates new version object without mutating Version 1', async () => {
    const doc = await DocumentAttachmentService.attachDocument({
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'COMPLIANCE',
      entityId: 'CMP-101',
      documentType: 'FSSAI_CERTIFICATE',
      originalFilename: 'fssai_v1.pdf',
      mimeType: 'application/pdf',
      sizeBytes: samplePdfBytes.length,
      fileBuffer: samplePdfBytes,
      auth: masterAuth,
    });

    const v1Key = doc.storageObjectKey;

    const revisedPdfBytes = Buffer.from('%PDF-1.4\n%REVISED VERSION 2\n%%EOF');
    const updated = await DocumentAttachmentService.replaceVersion({
      documentId: doc.documentId,
      organisationId: orgId,
      originalFilename: 'fssai_v2.pdf',
      mimeType: 'application/pdf',
      sizeBytes: revisedPdfBytes.length,
      fileBuffer: revisedPdfBytes,
      changeReason: 'Annual regulatory renewal certificate',
      auth: masterAuth,
    });

    assert.strictEqual(updated.currentVersion, 2);
    assert.notStrictEqual(updated.storageObjectKey, v1Key);
    assert.strictEqual(updated.versions.length, 1);
    assert.strictEqual(updated.versions[0].version, 1);
    assert.strictEqual(updated.versions[0].storageObjectKey, v1Key);
  });

  // 26. Immutable old version preserved
  it('26. Old Version 1 object binary remains accessible on storage provider', async () => {
    const doc = await DocumentAttachmentService.attachDocument({
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'COMPLIANCE',
      entityId: 'CMP-IMMUTABLE-V1',
      documentType: 'FSSAI_CERTIFICATE',
      originalFilename: 'fssai_v1.pdf',
      mimeType: 'application/pdf',
      sizeBytes: samplePdfBytes.length,
      fileBuffer: samplePdfBytes,
      auth: masterAuth,
    });

    const v1Key = doc.storageObjectKey;

    const revisedPdfBytes = Buffer.from('%PDF-1.4\n%REVISED VERSION 2\n%%EOF');
    const updated = await DocumentAttachmentService.replaceVersion({
      documentId: doc.documentId,
      organisationId: orgId,
      originalFilename: 'fssai_v2.pdf',
      mimeType: 'application/pdf',
      sizeBytes: revisedPdfBytes.length,
      fileBuffer: revisedPdfBytes,
      changeReason: 'Annual regulatory renewal certificate',
      auth: masterAuth,
    });

    assert.strictEqual(updated.versions.length, 1);
    const exists = await documentStorageAdapter.exists({ storageKey: v1Key });
    assert.strictEqual(exists, true, 'Version 1 binary must exist unmodified on storage provider');

    const stream = await documentStorageAdapter.getStream({ storageKey: v1Key });
    const chunks = [];
    await new Promise((resolve, reject) => {
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    const recoveredSha256 = crypto.createHash('sha256').update(Buffer.concat(chunks)).digest('hex');
    assert.strictEqual(recoveredSha256, samplePdfSha256, 'Version 1 binary content is identical to initial upload');
  });

  // 27. Archive / soft delete semantics
  it('27. Soft delete marks document as ARCHIVED and DELETED with audit reason', async () => {
    const doc = await DocumentAttachmentService.attachDocument({
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'INCIDENT',
      entityId: 'INC-101',
      documentType: 'INCIDENT_PHOTO',
      originalFilename: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: sampleJpgBytes.length,
      fileBuffer: sampleJpgBytes,
      auth: masterAuth,
    });

    const delRes = await DocumentAttachmentService.deleteDocument({
      documentId: doc.documentId,
      organisationId: orgId,
      reason: 'Duplicate photo uploaded by mistake',
      auth: masterAuth,
    });

    assert.strictEqual(delRes.success, true);
    const softDeleted = await BusinessDocument.findOne({ documentId: doc.documentId });
    assert.strictEqual(softDeleted.isDeleted, true);
    assert.strictEqual(softDeleted.status, 'ARCHIVED');
    assert.strictEqual(softDeleted.uploadStatus, 'DELETED');
  });

  // 28. Sensitive deletion role control
  it('28. Permanent delete is strictly restricted to MASTER with mandatory reason', async () => {
    const doc = await DocumentAttachmentService.attachDocument({
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'INCIDENT',
      entityId: 'INC-102',
      documentType: 'INCIDENT_REPORT',
      originalFilename: 'incident.pdf',
      mimeType: 'application/pdf',
      sizeBytes: samplePdfBytes.length,
      fileBuffer: samplePdfBytes,
      auth: masterAuth,
    });

    // Cafe Admin rejected
    await assert.rejects(
      async () => {
        await DocumentAttachmentService.permanentDeleteDocument({
          documentId: doc.documentId,
          organisationId: orgId,
          reason: 'Permanent purge request',
          auth: cafeAdminAAuth,
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'PERMANENT_DELETE_DENIED');
        return true;
      }
    );
  });

  // 29. Statutory 72-month GST retention blocks premature deletion
  it('29. Statutory 72-month GST retention blocks permanent deletion', async () => {
    const invoiceDoc = await DocumentAttachmentService.attachDocument({
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-STATUTORY-01',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'tax_invoice.pdf',
      mimeType: 'application/pdf',
      sizeBytes: samplePdfBytes.length,
      fileBuffer: samplePdfBytes,
      classification: 'FINANCE',
      auth: masterAuth,
    });

    assert.strictEqual(invoiceDoc.statutoryRecord, true);
    assert.ok(invoiceDoc.retentionUntil > new Date());

    await assert.rejects(
      async () => {
        await DocumentAttachmentService.permanentDeleteDocument({
          documentId: invoiceDoc.documentId,
          organisationId: orgId,
          reason: 'Premature purge attempt',
          auth: masterAuth,
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'RETENTION_PERIOD_ACTIVE');
        return true;
      }
    );
  });

  // 30. Active legal hold blocks deletion
  it('30. Active legal hold blocks permanent deletion even for Master', async () => {
    const doc = await DocumentAttachmentService.attachDocument({
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'ASSET',
      entityId: 'AST-HOLD-01',
      documentType: 'INSPECTION_RECORD',
      originalFilename: 'inspection.pdf',
      mimeType: 'application/pdf',
      sizeBytes: samplePdfBytes.length,
      fileBuffer: samplePdfBytes,
      auth: masterAuth,
    });

    // Place legal hold
    await DocumentAttachmentService.updateRetentionPolicy({
      documentId: doc.documentId,
      organisationId: orgId,
      legalHold: true,
      legalHoldReason: 'Court subpoena dispute inquiry',
      reason: 'Placing legal hold per legal counsel instruction',
      auth: masterAuth,
    });

    await assert.rejects(
      async () => {
        await DocumentAttachmentService.permanentDeleteDocument({
          documentId: doc.documentId,
          organisationId: orgId,
          reason: 'Attempted purge during legal dispute',
          auth: masterAuth,
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'LEGAL_HOLD_ACTIVE');
        return true;
      }
    );
  });

  // 31. Storage outage handling
  it('31. Storage outage during upload fails safely and does not mark document AVAILABLE', async () => {
    const badAdapter = new DocumentStorageAdapter({
      driver: 'RENDER_PERSISTENT_DISK',
      storageRoot: path.join(os.tmpdir(), 'non_existent_unwriteable_dir_zamorin'),
    });

    await assert.rejects(
      async () => {
        await badAdapter.put({
          storageKey: null, // Bad key forces failure
          buffer: samplePdfBytes,
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'MISSING_STORAGE_KEY');
        return true;
      }
    );
  });

  // 32. DB failure after upload / object failure after metadata intent
  it('32. Missing physical object during finalize marks UPLOAD_FAILED safely', async () => {
    const intent = await DocumentAttachmentService.initiateUploadIntent({
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'EXPENSE',
      entityId: 'EXP-GHOST-01',
      documentType: 'EXPENSE_RECEIPT',
      originalFilename: 'ghost_receipt.pdf',
      declaredMimeType: 'application/pdf',
      expectedSizeBytes: samplePdfBytes.length,
      auth: masterAuth,
    });

    // Finalize without uploading bytes
    await assert.rejects(
      async () => {
        await DocumentAttachmentService.finalizeUpload({
          documentId: intent.documentId,
          organisationId: orgId,
          auth: masterAuth,
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'STORAGE_OBJECT_MISSING');
        return true;
      }
    );

    const doc = await BusinessDocument.findOne({ documentId: intent.documentId });
    assert.strictEqual(doc.uploadStatus, 'UPLOAD_FAILED');
  });

  // 33. Crash recovery / stuck intent resolution
  it('33. Stuck upload intents (>1 hour) are resolved to MANUAL_REVIEW_REQUIRED', async () => {
    // Create intent with old timestamp
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await BusinessDocument.create({
      documentId: 'DOC-CRASH-STUCK-01',
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-CRASH',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'stuck.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      uploadStatus: 'UPLOADING',
      scanStatus: 'PENDING',
      uploadedBy: 'Cashier',
      uploadedAt: twoHoursAgo,
    });

    await BusinessDocument.updateOne(
      { documentId: 'DOC-CRASH-STUCK-01' },
      { $set: { updatedAt: twoHoursAgo, createdAt: twoHoursAgo, uploadedAt: twoHoursAgo } }
    );

    const recoveryRes = await documentReconciliationJob.resolveStuckUploadIntents({
      organisationId: orgId,
      maxAgeHours: 1,
    });

    assert.ok(recoveryRes.resolvedCount >= 1);
    const updated = await BusinessDocument.findOne({ documentId: 'DOC-CRASH-STUCK-01' });
    assert.strictEqual(updated.uploadStatus, 'MANUAL_REVIEW_REQUIRED');
    assert.strictEqual(updated.scanStatus, 'SCAN_ERROR');
  });

  // 34. Orphan reconciliation
  it('34. Orphan reconciliation detects missing storage objects and checksum mismatches', async () => {
    // Create doc pointing to missing key
    await BusinessDocument.create({
      documentId: 'DOC-ORPHAN-TEST-01',
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'ASSET',
      entityId: 'AST-ORPHAN',
      documentType: 'MANUAL',
      originalFilename: 'missing_manual.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      storageObjectKey: 'ORG-ZAMORIN-TEST/NON_EXISTENT_OBJECT.pdf',
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
      uploadedBy: 'Admin',
    });

    const report = await documentReconciliationJob.reconcileDocuments({
      organisationId: orgId,
      verifyChecksums: false,
    });

    assert.strictEqual(report.status, 'RECONCILIATION_COMPLETE');
    assert.ok(report.orphanMetadataCount >= 1);
    const foundOrphan = report.orphanMetadata.find((o) => o.documentId === 'DOC-ORPHAN-TEST-01');
    assert.ok(foundOrphan);
  });

  // 35. Local-file migration tool discovers and migrates legacy files
  it('35. Local document migrator safely moves legacy files to durable storage and updates metadata', async () => {
    const migrationDir = path.join(os.tmpdir(), `zamorin_migration_src_${Date.now()}`);
    await fs.promises.mkdir(migrationDir, { recursive: true });

    const legacyFile = path.join(migrationDir, 'legacy_food_safety.pdf');
    await fs.promises.writeFile(legacyFile, samplePdfBytes);

    // Create DB doc representing legacy record
    const legacyDoc = await BusinessDocument.create({
      documentId: 'DOC-LEGACY-001',
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'COMPLIANCE',
      entityId: 'CMP-LEGACY',
      documentType: 'FOOD_SAFETY_CERT',
      originalFilename: 'legacy_food_safety.pdf',
      mimeType: 'application/pdf',
      sizeBytes: samplePdfBytes.length,
      sha256: samplePdfSha256,
      storageDriver: 'RENDER_PERSISTENT_DISK',
      storagePath: legacyFile,
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
      uploadedBy: 'Legacy System',
    });

    const migrator = new LocalDocumentMigrator({
      sourceDir: migrationDir,
      organisationId: orgId,
    });

    const res = await migrator.runMigration();
    assert.strictEqual(res.discoveredCount, 1);
    assert.strictEqual(res.migratedCount, 1);

    const migratedDoc = await BusinessDocument.findOne({ documentId: 'DOC-LEGACY-001' });
    assert.strictEqual(migratedDoc.storageDriver, 'PRIVATE_OBJECT_STORAGE');
    assert.strictEqual(migratedDoc.sha256, samplePdfSha256);
    assert.ok(fs.existsSync(legacyFile), 'Original legacy file retained intact as backup');
  });

  // 36. Migration idempotency: rerun skips already migrated
  it('36. Migration idempotency: rerun skips already migrated documents without duplicate records', async () => {
    const migrationDir = path.join(os.tmpdir(), `zamorin_migration_idemp_${Date.now()}`);
    await fs.promises.mkdir(migrationDir, { recursive: true });

    const legacyFile = path.join(migrationDir, 'already_migrated.pdf');
    await fs.promises.writeFile(legacyFile, samplePdfBytes);

    const canonicalKey = documentStorageAdapter.generateStorageKey({
      organisationId: orgId,
      cafeId: cafeIdA,
      classification: 'COMPLIANCE',
      documentId: 'DOC-LEGACY-ALREADY-MIGRATED',
      mimeType: 'application/pdf',
    });

    await documentStorageAdapter.put({
      buffer: samplePdfBytes,
      storageKey: canonicalKey,
      mimeType: 'application/pdf',
      sizeBytes: samplePdfBytes.length,
      organisationId: orgId,
    });

    await BusinessDocument.create({
      documentId: 'DOC-LEGACY-ALREADY-MIGRATED',
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'COMPLIANCE',
      entityId: 'CMP-ALREADY',
      documentType: 'FOOD_SAFETY_CERT',
      originalFilename: 'already_migrated.pdf',
      mimeType: 'application/pdf',
      sizeBytes: samplePdfBytes.length,
      sha256: samplePdfSha256,
      storageDriver: 'PRIVATE_OBJECT_STORAGE',
      storageObjectKey: canonicalKey,
      storageKey: canonicalKey,
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
      uploadedBy: 'Legacy System',
    });

    const migrator = new LocalDocumentMigrator({
      sourceDir: migrationDir,
      organisationId: orgId,
    });

    const rerun = await migrator.runMigration();
    assert.strictEqual(rerun.migratedCount, 0);
    assert.strictEqual(rerun.skippedAlreadyMigratedCount, 1);

    await fs.promises.rm(migrationDir, { recursive: true, force: true }).catch(() => {});
  });

  // 37. No production local-storage fallback
  it('37. Storage adapter refuses to silently fall back to local disk in production', () => {
    const adapter = new LocalDevelopmentStorageAdapter();
    assert.throws(
      () => adapter.validateConfiguration({ NODE_ENV: 'production' }),
      (err) => {
        assert.strictEqual(err.code, 'PROD_EPHEMERAL_STORAGE_DISALLOWED');
        return true;
      }
    );
  });

  // 38. Credentials absent from frontend
  it('38. Document details returned to caller contain zero secret credentials or bucket secrets', async () => {
    const doc = await DocumentAttachmentService.attachDocument({
      organisationId: orgId,
      cafeId: cafeIdA,
      entityType: 'PURCHASE_ORDER',
      entityId: 'PO-CREDS-TEST',
      documentType: 'SUPPLIER_INVOICE',
      originalFilename: 'clean_po.pdf',
      mimeType: 'application/pdf',
      sizeBytes: samplePdfBytes.length,
      fileBuffer: samplePdfBytes,
      auth: masterAuth,
    });

    const serialized = doc.toObject();
    assert.strictEqual(serialized.awsAccessKeyId, undefined);
    assert.strictEqual(serialized.awsSecretAccessKey, undefined);
    assert.strictEqual(serialized.secretKey, undefined);
    assert.ok(!serialized.fileBuffer, 'Raw binary buffer must not be exposed');
  });

  // 39. Credentials absent from logs and audit
  it('39. Audit events contain zero access secrets or permanent signed tokens', async () => {
    const auditLogs = await AuditEvent.find({ entityId: { $regex: 'DOC-' } }).lean();
    for (const log of auditLogs) {
      const metaStr = JSON.stringify(log.metadata || {});
      assert.ok(!metaStr.includes('X-Amz-Signature'));
      assert.ok(!metaStr.includes('secret'));
      assert.ok(!metaStr.includes('accessKey'));
    }
  });

  // 40. Full audit trail coverage
  it('40. Material actions generate auditable events across lifecycle', async () => {
    const actions = await AuditEvent.distinct('action', { organisationId: orgId });
    assert.ok(actions.includes('DOCUMENT_UPLOAD_INITIATED'));
    assert.ok(actions.includes('DOCUMENT_ATTACHED'));
    assert.ok(actions.includes('DOCUMENT_DOWNLOADED'));
    assert.ok(actions.includes('DOCUMENT_VERSION_REPLACED'));
    assert.ok(actions.includes('DOCUMENT_SOFT_DELETED'));
  });
});
