'use strict';

/**
 * ZAMORIN CAFÉ ERP — GRIDFS DOCUMENT RESTORE SERVICE (EXT-04)
 *
 * Provides document-level and revision-level recovery from isolated backup sources:
 * - VERIFY_ONLY (read-only verification of source document, GridFS file, chunks, SHA-256)
 * - RECOVERY_COPY (streamed re-import into target with a NEW GridFS file ID & recovery revision)
 *
 * Invariants:
 * - Never overwrites existing GridFS binaries or historical revisions.
 * - Restored operational objects are strictly PENDING_SCAN until scanned (fails closed).
 * - Target database production write guard: fails closed unless explicit confirmation provided.
 * - Source database is read-only (zero source mutations).
 * - Zero whole-file RAM buffering (streams directly with in-flight hashing).
 * - Idempotency: duplicate requests return existing restoration revision.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const { KNOWN_PRODUCTION_DB_NAMES } = require('./backupRestoreVerificationService');
const auditService = require('./auditService');
const { ApiError } = require('../utils/ApiError');

const RESTORE_MODES = {
  VERIFY_ONLY: 'VERIFY_ONLY',
  RECOVERY_COPY: 'RECOVERY_COPY',
};

const RESTORE_REASONS = [
  'ACCIDENTAL_ARCHIVE',
  'BINARY_MISSING',
  'CORRUPTION_RECOVERY',
  'HISTORICAL_REVISION_RECOVERY',
  'DISASTER_RECOVERY_TEST',
];

const RESTORE_AUDIT_EVENTS = {
  REQUESTED: 'DOCUMENT_RESTORE_REQUESTED',
  VERIFIED: 'DOCUMENT_RESTORE_VERIFIED',
  STARTED: 'DOCUMENT_RESTORE_STARTED',
  COMPLETED: 'DOCUMENT_RESTORE_COMPLETED',
  FAILED: 'DOCUMENT_RESTORE_FAILED',
  INTEGRITY_FAILED: 'DOCUMENT_RESTORE_INTEGRITY_FAILED',
  DENIED: 'DOCUMENT_RESTORE_DENIED',
  RESCAN_REQUIRED: 'DOCUMENT_RESTORE_RESCAN_REQUIRED',
};

class DocumentRestoreService {
  /**
   * Validates target database to ensure production cannot be overwritten casually.
   */
  static validateTargetDatabase(targetDbName, targetUri = null, options = {}) {
    if (!targetDbName || typeof targetDbName !== 'string') {
      const err = new Error('Target database name is required.');
      err.code = 'TARGET_DB_NAME_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    const normalizedTarget = targetDbName.trim().toLowerCase();
    const isKnownProd = KNOWN_PRODUCTION_DB_NAMES.has(normalizedTarget);

    let uriIndicatesProd = false;
    if (targetUri && typeof targetUri === 'string') {
      const lowerUri = targetUri.toLowerCase();
      if (lowerUri.includes('production') && !lowerUri.includes('restore') && !lowerUri.includes('test')) {
        uriIndicatesProd = true;
      }
    }

    if (isKnownProd || uriIndicatesProd) {
      const isModeRecovery = process.env.DOCUMENT_RESTORE_MODE === 'RECOVERY';
      const isConfirmed = process.env.DOCUMENT_RESTORE_TARGET_CONFIRMED === 'true';
      const isApproved = options.productionApproval === 'APPROVED_BY_PRIMARY_MASTER';

      if (!isModeRecovery || !isConfirmed || !isApproved) {
        const err = new Error(`Cannot restore into protected production database '${targetDbName}'. Requires DOCUMENT_RESTORE_MODE=RECOVERY, DOCUMENT_RESTORE_TARGET_CONFIRMED=true, and explicit productionApproval='APPROVED_BY_PRIMARY_MASTER'.`);
        err.code = 'PRODUCTION_TARGET_PROTECTION';
        err.statusCode = 403;
        throw err;
      }
    }

    return true;
  }

  /**
   * Ensures source and target databases are not the same (prevents circular recovery).
   */
  static validateSourceAndTargetDifferent(sourceDbName, targetDbName) {
    if (sourceDbName && targetDbName && sourceDbName.trim().toLowerCase() === targetDbName.trim().toLowerCase()) {
      const err = new Error(`Source database '${sourceDbName}' and target database '${targetDbName}' cannot be identical.`);
      err.code = 'CIRCULAR_RESTORE_DENIED';
      err.statusCode = 400;
      throw err;
    }
    return true;
  }

  /**
   * Enforces that only MASTER or PRIMARY_MASTER can execute recovery.
   */
  static validateAuthority(user = {}) {
    const role = (user && (user.role || user.actorRole)) || '';
    if (role !== 'PRIMARY_MASTER' && role !== 'MASTER') {
      const err = new Error(`Role '${role || 'ANONYMOUS'}' is unauthorized to perform document restoration. Requires PRIMARY_MASTER or MASTER.`);
      err.code = 'RESTORE_UNAUTHORIZED';
      err.statusCode = 403;
      throw err;
    }
    return true;
  }

  /**
   * Read-only verification of a document revision in a recovery source database.
   * Performs ZERO writes.
   */
  static async verifyRestoreSource({
    sourceDb,
    documentId,
    revisionNumber = null,
    bucketName = 'zamorinDocuments',
    expectedOrgId = null,
    expectedCafeId = null,
  }) {
    const startTime = Date.now();

    if (!sourceDb) {
      const err = new Error('Source database handle is required for restore verification.');
      err.code = 'SOURCE_DB_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    if (!documentId) {
      const err = new Error('documentId is required to locate recovery source document.');
      err.code = 'DOCUMENT_ID_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    // 1. Locate BusinessDocument in source DB
    const collections = await sourceDb.listCollections().toArray();
    const collNames = new Set(collections.map((c) => c.name));

    const docsCollName = collNames.has('business_documents')
      ? 'business_documents'
      : collNames.has('businessdocuments')
      ? 'businessdocuments'
      : 'business_documents';

    const docsColl = sourceDb.collection(docsCollName);
    const sourceDoc = await docsColl.findOne({ documentId });

    if (!sourceDoc) {
      const err = new Error(`Source BusinessDocument with documentId '${documentId}' not found in recovery database.`);
      err.code = 'SOURCE_DOCUMENT_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // 2. Organization and Café scope validation
    if (expectedOrgId && sourceDoc.organisationId !== expectedOrgId) {
      const err = new Error(`Organisation mismatch: source document belongs to '${sourceDoc.organisationId}', but target context is '${expectedOrgId}'.`);
      err.code = 'ORGANISATION_MISMATCH';
      err.statusCode = 403;
      throw err;
    }

    if (expectedCafeId && sourceDoc.cafeId && sourceDoc.cafeId !== 'GLOBAL' && sourceDoc.cafeId !== expectedCafeId) {
      const err = new Error(`Café mismatch: source document belongs to '${sourceDoc.cafeId}', but target context is '${expectedCafeId}'.`);
      err.code = 'CAFE_MISMATCH';
      err.statusCode = 403;
      throw err;
    }

    // 3. Resolve requested revision
    const targetRevNum = (revisionNumber !== null && revisionNumber !== undefined)
      ? parseInt(revisionNumber, 10)
      : sourceDoc.currentVersion;

    let targetVersion = null;
    if (Array.isArray(sourceDoc.versions) && sourceDoc.versions.length > 0) {
      targetVersion = sourceDoc.versions.find((v) => (v.versionNumber || v.version) === targetRevNum);
    }

    // If revision not in versions array, check if it's the currentVersion top-level metadata
    let gridFsFileId = null;
    let expectedSha256 = null;
    let expectedSizeBytes = 0;
    let mimeType = null;
    let originalFilename = null;
    let scanStatus = null;

    if (targetVersion) {
      gridFsFileId = targetVersion.gridFsFileId;
      expectedSha256 = (targetVersion.sha256 || targetVersion.checksum || '').toLowerCase();
      expectedSizeBytes = targetVersion.sizeBytes || 0;
      mimeType = targetVersion.mimeType || 'application/pdf';
      originalFilename = targetVersion.originalFilename || targetVersion.internalFilename || 'document.pdf';
      scanStatus = targetVersion.scanStatus || targetVersion.securityScanStatus || 'CLEAN';
    } else if (targetRevNum === sourceDoc.currentVersion) {
      gridFsFileId = sourceDoc.gridFsFileId;
      expectedSha256 = (sourceDoc.sha256 || sourceDoc.checksum || '').toLowerCase();
      expectedSizeBytes = sourceDoc.sizeBytes || 0;
      mimeType = sourceDoc.mimeType || 'application/pdf';
      originalFilename = sourceDoc.originalFilename || 'document.pdf';
      scanStatus = sourceDoc.scanStatus || sourceDoc.securityScanStatus || 'CLEAN';
    } else {
      const err = new Error(`Requested revision ${targetRevNum} not found in source document '${documentId}'.`);
      err.code = 'SOURCE_REVISION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (!gridFsFileId) {
      const err = new Error(`Source document revision ${targetRevNum} has null or missing gridFsFileId.`);
      err.code = 'CORRUPT_SOURCE_METADATA';
      err.statusCode = 400;
      throw err;
    }

    // Convert string ID to ObjectId if needed
    const targetFileObjectId = (typeof gridFsFileId === 'string')
      ? new mongoose.Types.ObjectId(gridFsFileId)
      : gridFsFileId;

    // 4. Validate GridFS files collection entry
    const filesCollName = `${bucketName}.files`;
    const chunksCollName = `${bucketName}.chunks`;

    const filesColl = sourceDb.collection(filesCollName);
    const chunksColl = sourceDb.collection(chunksCollName);

    const fileRecord = await filesColl.findOne({ _id: targetFileObjectId });
    if (!fileRecord) {
      const err = new Error(`GridFS file record for ID '${targetFileObjectId}' not found in ${filesCollName}.`);
      err.code = 'GRIDFS_FILE_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (expectedSizeBytes > 0 && fileRecord.length !== expectedSizeBytes) {
      const err = new Error(`File size mismatch: BusinessDocument metadata expected ${expectedSizeBytes} bytes, but GridFS files record has ${fileRecord.length} bytes.`);
      err.code = 'FILE_SIZE_MISMATCH';
      err.statusCode = 400;
      throw err;
    }

    // 5. Validate GridFS chunks collection completeness
    const actualChunksCount = await chunksColl.countDocuments({ files_id: targetFileObjectId });
    const expectedChunksCount = Math.ceil(fileRecord.length / fileRecord.chunkSize);

    if (fileRecord.length > 0 && actualChunksCount !== expectedChunksCount) {
      const err = new Error(`GridFS chunks incomplete: expected ${expectedChunksCount} chunks for file length ${fileRecord.length}, but found ${actualChunksCount} chunks.`);
      err.code = 'GRIDFS_CHUNKS_INCOMPLETE';
      err.statusCode = 400;
      throw err;
    }

    // 6. Stream source binary and compute SHA-256 (Zero whole-file RAM buffer)
    const bucket = new mongoose.mongo.GridFSBucket(sourceDb, { bucketName });
    const hash = crypto.createHash('sha256');
    let reconstructedBytes = 0;

    try {
      const downloadStream = bucket.openDownloadStream(targetFileObjectId);
      await new Promise((resolve, reject) => {
        downloadStream.on('data', (chunk) => {
          hash.update(chunk);
          reconstructedBytes += chunk.length;
        });
        downloadStream.on('end', resolve);
        downloadStream.on('error', reject);
      });
    } catch (streamErr) {
      const err = new Error(`GridFS stream reconstruction failed: ${streamErr.message}`);
      err.code = 'STREAM_RECONSTRUCTION_FAILED';
      err.statusCode = 500;
      throw err;
    }

    const reconstructedSha256 = hash.digest('hex').toLowerCase();

    // 7. Verify SHA-256 checksum match
    if (expectedSha256 && reconstructedSha256 !== expectedSha256) {
      const err = new Error(`SHA-256 integrity failure: expected ${expectedSha256}, got ${reconstructedSha256}. Restoring corrupted binaries is denied.`);
      err.code = 'RESTORE_DENIED_INTEGRITY_FAILURE';
      err.statusCode = 422;
      throw err;
    }

    const verifyDurationMs = Date.now() - startTime;

    return {
      isValid: true,
      documentId: sourceDoc.documentId,
      revisionNumber: targetRevNum,
      gridFsFileId: targetFileObjectId,
      sha256: reconstructedSha256,
      expectedSha256,
      sha256Match: true,
      sizeBytes: reconstructedBytes,
      expectedSizeBytes: fileRecord.length,
      mimeType,
      originalFilename,
      scanStatus,
      retentionUntil: sourceDoc.retentionUntil || null,
      legalHold: Boolean(sourceDoc.legalHold),
      isDeleted: Boolean(sourceDoc.isDeleted),
      documentStatus: sourceDoc.documentStatus || 'UPLOADED',
      organisationId: sourceDoc.organisationId,
      cafeId: sourceDoc.cafeId,
      entityType: sourceDoc.entityType,
      entityId: sourceDoc.entityId,
      chunkCount: actualChunksCount,
      writesPerformed: 0,
      verifyDurationMs,
    };
  }

  /**
   * Executes document revision restoration.
   * Supports VERIFY_ONLY (default) and RECOVERY_COPY.
   */
  static async restoreDocumentRevision({
    sourceDb,
    targetDb,
    documentId,
    revisionNumber = null,
    mode = RESTORE_MODES.VERIFY_ONLY,
    bucketName = 'zamorinDocuments',
    options = {},
    user = { role: 'PRIMARY_MASTER', id: 'PRIMARY_MASTER_1' },
    parentEntityCheckFn = null,
  }) {
    const totalStartTime = Date.now();
    const initialMemory = process.memoryUsage().heapUsed;

    // 1. Authorization check
    this.validateAuthority(user);

    // 2. Validate source and target database configuration
    const sourceDbName = sourceDb.databaseName || (sourceDb.db && sourceDb.db.databaseName) || 'source_db';
    const targetDbName = targetDb ? (targetDb.databaseName || (targetDb.db && targetDb.db.databaseName) || 'target_db') : null;

    if (mode === RESTORE_MODES.RECOVERY_COPY) {
      if (!targetDb) {
        const err = new Error('Target database handle is required for RECOVERY_COPY mode.');
        err.code = 'TARGET_DB_REQUIRED';
        err.statusCode = 400;
        throw err;
      }
      this.validateTargetDatabase(targetDbName, options.targetUri, options);
      this.validateSourceAndTargetDifferent(sourceDbName, targetDbName);
    }

    // 3. Step 1: VERIFY_ONLY on source (zero writes)
    const verification = await this.verifyRestoreSource({
      sourceDb,
      documentId,
      revisionNumber,
      bucketName,
      expectedOrgId: options.expectedOrgId || null,
      expectedCafeId: options.expectedCafeId || null,
    });

    // If mode is VERIFY_ONLY, return immediately with zero writes
    if (mode === RESTORE_MODES.VERIFY_ONLY) {
      return {
        status: 'VERIFIED',
        mode: RESTORE_MODES.VERIFY_ONLY,
        verification,
        writesPerformed: 0,
        totalDurationMs: Date.now() - totalStartTime,
      };
    }

    // 4. RECOVERY_COPY execution
    const correlationId = options.restoreCorrelationId || `RST-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const reason = options.reason || 'HISTORICAL_REVISION_RECOVERY';

    // Verify parent entity still exists in target DB if entity check supplied
    if (parentEntityCheckFn && typeof parentEntityCheckFn === 'function') {
      const parentExists = await parentEntityCheckFn({
        entityType: verification.entityType,
        entityId: verification.entityId,
        organisationId: verification.organisationId,
        cafeId: verification.cafeId,
      });

      if (!parentExists) {
        const err = new Error(`Parent business entity '${verification.entityType}:${verification.entityId}' does not exist in target database. Attaching recovered document to non-existent entity is denied.`);
        err.code = 'PARENT_ENTITY_NOT_FOUND';
        err.statusCode = 422;
        throw err;
      }
    }

    // 5. Check Idempotency in target DB
    const targetCollNames = new Set((await targetDb.listCollections().toArray()).map((c) => c.name));
    const targetDocsCollName = targetCollNames.has('business_documents')
      ? 'business_documents'
      : targetCollNames.has('businessdocuments')
      ? 'businessdocuments'
      : 'business_documents';

    const targetDocsColl = targetDb.collection(targetDocsCollName);
    let targetDoc = await targetDocsColl.findOne({ documentId });

    if (targetDoc && Array.isArray(targetDoc.versions)) {
      const existingRestoredVersion = targetDoc.versions.find(
        (v) =>
          v.restoreCorrelationId === correlationId ||
          (v.restoredFromRevision === verification.revisionNumber &&
            v.sourceSha256 === verification.sha256 &&
            v.restoredFromBackup === true)
      );

      if (existingRestoredVersion) {
        return {
          status: 'ALREADY_RESTORED',
          mode: RESTORE_MODES.RECOVERY_COPY,
          idempotent: true,
          documentId,
          restoredVersion: existingRestoredVersion.versionNumber || existingRestoredVersion.version,
          gridFsFileId: existingRestoredVersion.gridFsFileId,
          sha256: existingRestoredVersion.sha256,
          restoreCorrelationId: existingRestoredVersion.restoreCorrelationId,
          totalDurationMs: Date.now() - totalStartTime,
        };
      }
    }

    // 6. Stream copy from source GridFS into target GridFS (NEW GridFS file ID)
    const sourceBucket = new mongoose.mongo.GridFSBucket(sourceDb, { bucketName });
    const targetBucket = new mongoose.mongo.GridFSBucket(targetDb, { bucketName });

    const streamCopyStartTime = Date.now();
    const newStorageKey = `RESTORED/${verification.organisationId}/${verification.documentId}/v${verification.revisionNumber}_${Date.now()}_${verification.originalFilename}`;

    const uploadStream = targetBucket.openUploadStream(newStorageKey, {
      contentType: verification.mimeType,
      metadata: {
        storageKey: newStorageKey,
        originalFilename: verification.originalFilename,
        mimeType: verification.mimeType,
        organisationId: verification.organisationId,
        cafeId: verification.cafeId,
        restoredAt: new Date(),
        restoredFromRevision: verification.revisionNumber,
        sourceGridFsFileId: verification.gridFsFileId,
        sourceSha256: verification.sha256,
        restoreCorrelationId: correlationId,
        restoreReason: reason,
      },
    });

    const newTargetGridFsId = uploadStream.id;
    let targetBytesWritten = 0;
    const inFlightTargetHash = crypto.createHash('sha256');

    try {
      const downloadStream = sourceBucket.openDownloadStream(verification.gridFsFileId);

      await new Promise((resolve, reject) => {
        downloadStream.on('data', (chunk) => {
          inFlightTargetHash.update(chunk);
          targetBytesWritten += chunk.length;
        });

        downloadStream.on('error', async (err) => {
          uploadStream.abort().catch(() => {});
          reject(err);
        });

        uploadStream.on('error', reject);
        uploadStream.on('finish', resolve);

        downloadStream.pipe(uploadStream);
      });
    } catch (copyErr) {
      // Clean up target GridFS file on failure
      try {
        await targetBucket.delete(newTargetGridFsId);
      } catch (_) {}
      const err = new Error(`Target GridFS copy failed: ${copyErr.message}`);
      err.code = 'GRIDFS_COPY_FAILED';
      err.statusCode = 500;
      throw err;
    }

    const streamCopyDurationMs = Date.now() - streamCopyStartTime;
    const inFlightTargetSha256 = inFlightTargetHash.digest('hex').toLowerCase();

    // 7. Post-copy target verification: read back target file from targetBucket and verify SHA-256
    const postCopyStartTime = Date.now();
    const postCopyHash = crypto.createHash('sha256');
    let postCopyBytes = 0;

    try {
      const targetVerifyStream = targetBucket.openDownloadStream(newTargetGridFsId);
      await new Promise((resolve, reject) => {
        targetVerifyStream.on('data', (chunk) => {
          postCopyHash.update(chunk);
          postCopyBytes += chunk.length;
        });
        targetVerifyStream.on('end', resolve);
        targetVerifyStream.on('error', reject);
      });
    } catch (readBackErr) {
      try {
        await targetBucket.delete(newTargetGridFsId);
      } catch (_) {}
      const err = new Error(`Post-copy target file read back failed: ${readBackErr.message}`);
      err.code = 'POST_COPY_READ_FAILED';
      err.statusCode = 500;
      throw err;
    }

    const postCopySha256 = postCopyHash.digest('hex').toLowerCase();
    const postCopyDurationMs = Date.now() - postCopyStartTime;

    if (postCopySha256 !== verification.sha256 || postCopySha256 !== inFlightTargetSha256) {
      // Delete corrupted target file
      try {
        await targetBucket.delete(newTargetGridFsId);
      } catch (_) {}
      const err = new Error(`Post-copy SHA-256 mismatch: target calculated ${postCopySha256}, but expected source SHA was ${verification.sha256}. Corrupted file removed.`);
      err.code = 'POST_COPY_INTEGRITY_FAILURE';
      err.statusCode = 422;
      throw err;
    }

    // 8. Commit restoration revision to target BusinessDocument
    const metadataStartTime = Date.now();
    let nextVersionNumber = 1;

    if (targetDoc) {
      // Optimistic concurrency check: if caller provided expectedCurrentVersion
      if (options.expectedCurrentVersion && targetDoc.currentVersion !== options.expectedCurrentVersion) {
        try {
          await targetBucket.delete(newTargetGridFsId);
        } catch (_) {}
        const err = new Error(`Concurrent modification conflict: expected version ${options.expectedCurrentVersion}, but current version is ${targetDoc.currentVersion}.`);
        err.code = 'RESTORE_CONCURRENCY_CONFLICT';
        err.statusCode = 409;
        throw err;
      }

      nextVersionNumber = (targetDoc.currentVersion || 1) + 1;

      // Preserve all previous revisions and append NEW restoration revision
      const previousVersions = Array.isArray(targetDoc.versions) ? targetDoc.versions : [];

      const newVersionRecord = {
        version: nextVersionNumber,
        versionNumber: nextVersionNumber,
        originalFilename: `restored_v${verification.revisionNumber}_${verification.originalFilename}`,
        internalFilename: `restored_v${verification.revisionNumber}_${verification.originalFilename}`,
        mimeType: verification.mimeType,
        sizeBytes: verification.sizeBytes,
        sha256: verification.sha256,
        gridFsFileId: newTargetGridFsId,
        storageKey: newStorageKey,
        storageObjectKey: newStorageKey,
        storageDriver: 'GRIDFS',
        storageProvider: 'GRIDFS',
        bucketName,
        scanStatus: 'PENDING_SCAN', // CRITICAL: A newly materialized operational file must NOT inherit CLEAN blindly!
        securityScanStatus: 'PENDING_SCAN',
        uploadedBy: user.id || user.actorUserId || 'PRIMARY_MASTER_1',
        uploadedAt: new Date(),
        // Provenance metadata
        restoredFromRevision: verification.revisionNumber,
        restoredFromBackup: true,
        restoredFromGridFsFileId: verification.gridFsFileId,
        restoredFromBackupTimestamp: options.backupTimestamp || null,
        sourceSha256: verification.sha256,
        sourceScanStatus: verification.scanStatus || 'CLEAN',
        restoreReason: reason,
        restoreCorrelationId: correlationId,
        restoredAt: new Date(),
        restoredBy: user.id || user.actorUserId || 'PRIMARY_MASTER_1',
      };

      const updateOps = {
        $set: {
          currentVersion: nextVersionNumber,
          gridFsFileId: newTargetGridFsId,
          sha256: verification.sha256,
          sizeBytes: verification.sizeBytes,
          mimeType: verification.mimeType,
          scanStatus: 'PENDING_SCAN',
          securityScanStatus: 'PENDING_SCAN',
          uploadStatus: 'AVAILABLE',
          lastRestoredAt: new Date(),
          lastRestoredBy: user.id || user.actorUserId || 'PRIMARY_MASTER_1',
          lastRestoreReason: reason,
          lastRestoreCorrelationId: correlationId,
        },
        $push: {
          versions: newVersionRecord,
        },
      };

      // If document was soft-deleted, reactivate if requested or update status
      if (options.reactivate === true && targetDoc.isDeleted) {
        updateOps.$set.isDeleted = false;
        updateOps.$set.documentStatus = 'UPLOADED';
        updateOps.$set.reactivatedAt = new Date();
        updateOps.$set.reactivatedBy = user.id || user.actorUserId || 'PRIMARY_MASTER_1';
      }

      // Preserve legal hold
      if (verification.legalHold || targetDoc.legalHold) {
        updateOps.$set.legalHold = true;
      }

      // Preserve statutory retention
      if (verification.retentionUntil && (!targetDoc.retentionUntil || new Date(verification.retentionUntil) > new Date(targetDoc.retentionUntil))) {
        updateOps.$set.retentionUntil = verification.retentionUntil;
      }

      try {
        await targetDocsColl.updateOne({ _id: targetDoc._id }, updateOps);
      } catch (dbSaveErr) {
        // Leave target file in GridFS for reconciliation; do not report fake success
        const err = new Error(`Failed to commit restoration revision metadata to database: ${dbSaveErr.message}`);
        err.code = 'METADATA_SAVE_FAILED';
        err.statusCode = 500;
        err.orphanGridFsId = newTargetGridFsId;
        throw err;
      }
    } else {
      // Document missing in target entirely: recreate metadata safely
      const newDocRecord = {
        documentId: verification.documentId,
        organisationId: verification.organisationId,
        cafeId: verification.cafeId,
        entityType: verification.entityType || 'COMPLIANCE',
        entityId: verification.entityId || 'RECOVERED',
        documentType: 'TAX_SUPPORTING_DOCUMENT',
        originalFilename: verification.originalFilename,
        mimeType: verification.mimeType,
        sizeBytes: verification.sizeBytes,
        sha256: verification.sha256,
        uploadStatus: 'AVAILABLE',
        scanStatus: 'PENDING_SCAN', // Newly materialized file requires scan
        securityScanStatus: 'PENDING_SCAN',
        documentStatus: 'UPLOADED',
        currentVersion: 1,
        gridFsFileId: newTargetGridFsId,
        storageKey: newStorageKey,
        storageDriver: 'GRIDFS',
        bucketName,
        uploadedBy: user.id || user.actorUserId || 'PRIMARY_MASTER_1',
        uploadedAt: new Date(),
        legalHold: verification.legalHold,
        retentionUntil: verification.retentionUntil,
        isDeleted: false,
        lastRestoredAt: new Date(),
        lastRestoredBy: user.id || user.actorUserId || 'PRIMARY_MASTER_1',
        lastRestoreReason: reason,
        lastRestoreCorrelationId: correlationId,
        versions: [
          {
            version: 1,
            versionNumber: 1,
            originalFilename: verification.originalFilename,
            internalFilename: verification.originalFilename,
            mimeType: verification.mimeType,
            sizeBytes: verification.sizeBytes,
            sha256: verification.sha256,
            gridFsFileId: newTargetGridFsId,
            storageKey: newStorageKey,
            storageDriver: 'GRIDFS',
            bucketName,
            scanStatus: 'PENDING_SCAN',
            securityScanStatus: 'PENDING_SCAN',
            uploadedBy: user.id || user.actorUserId || 'PRIMARY_MASTER_1',
            uploadedAt: new Date(),
            restoredFromRevision: verification.revisionNumber,
            restoredFromBackup: true,
            restoredFromGridFsFileId: verification.gridFsFileId,
            restoredFromBackupTimestamp: options.backupTimestamp || null,
            sourceSha256: verification.sha256,
            sourceScanStatus: verification.scanStatus || 'CLEAN',
            restoreReason: reason,
            restoreCorrelationId: correlationId,
            restoredAt: new Date(),
            restoredBy: user.id || user.actorUserId || 'PRIMARY_MASTER_1',
          },
        ],
      };

      try {
        await targetDocsColl.insertOne(newDocRecord);
      } catch (dbInsertErr) {
        const err = new Error(`Failed to insert restored document record into target database: ${dbInsertErr.message}`);
        err.code = 'METADATA_INSERT_FAILED';
        err.statusCode = 500;
        err.orphanGridFsId = newTargetGridFsId;
        throw err;
      }
    }

    const metadataDurationMs = Date.now() - metadataStartTime;
    const finalMemory = process.memoryUsage().heapUsed;
    const totalDurationMs = Date.now() - totalStartTime;

    // 9. Safe Audit Event Logging
    try {
      if (auditService && typeof auditService.logEvent === 'function') {
        await auditService.logEvent({
          organisationId: verification.organisationId,
          cafeId: verification.cafeId,
          action: RESTORE_AUDIT_EVENTS.COMPLETED,
          entityType: 'DOCUMENT_RESTORE',
          entityId: verification.documentId,
          actorUserId: user.id || user.actorUserId || 'PRIMARY_MASTER_1',
          actorRole: user.role || 'PRIMARY_MASTER',
          result: 'SUCCESS',
          riskClassification: 'HIGH',
          reason,
          correlationId,
          metadata: {
            restoredFromRevision: verification.revisionNumber,
            newVersionNumber,
            sourceGridFsFileId: verification.gridFsFileId.toString(),
            targetGridFsFileId: newTargetGridFsId.toString(),
            sha256: verification.sha256,
            sizeBytes: verification.sizeBytes,
            scanStatus: 'PENDING_SCAN',
            durationMs: totalDurationMs,
          },
        });
      }
    } catch (_) {}

    return {
      status: 'SUCCESS',
      mode: RESTORE_MODES.RECOVERY_COPY,
      documentId: verification.documentId,
      sourceRevision: verification.revisionNumber,
      newRevision: nextVersionNumber,
      sourceGridFsFileId: verification.gridFsFileId,
      newGridFsFileId: newTargetGridFsId,
      sha256: verification.sha256,
      postCopySha256,
      sha256Match: true,
      sizeBytes: verification.sizeBytes,
      scanStatus: 'PENDING_SCAN',
      securityScanStatus: 'PENDING_SCAN',
      sourceScanStatus: verification.scanStatus,
      restoreCorrelationId: correlationId,
      restoreReason: reason,
      legalHold: verification.legalHold,
      retentionPreserved: true,
      immutableHistoryPreserved: true,
      performance: {
        verifyDurationMs: verification.verifyDurationMs,
        streamCopyDurationMs,
        postCopyDurationMs,
        metadataDurationMs,
        totalDurationMs,
        heapDeltaBytes: Math.max(0, finalMemory - initialMemory),
      },
    };
  }
}

module.exports = {
  DocumentRestoreService,
  RESTORE_MODES,
  RESTORE_REASONS,
  RESTORE_AUDIT_EVENTS,
};
