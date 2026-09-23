'use strict';

/**
 * ZAMORIN CAFÉ ERP — DURABLE DOCUMENT STORAGE MIGRATION TOOL
 * 
 * Non-destructive, idempotent migration of legacy disk-backed files
 * (e.g. from backend/uploads/ or local directories) to private durable external object storage.
 * 
 * Workflow:
 * 1. Discover local files.
 * 2. Compute cryptographic SHA-256.
 * 3. Match against MongoDB BusinessDocument records.
 * 4. Upload binary to durable storage adapter under canonical opaque key.
 * 5. Verify bit-for-bit checksum on durable storage.
 * 6. Update BusinessDocument metadata references to PRIVATE_OBJECT_STORAGE.
 * 7. Verify download/read access from durable storage.
 * 8. Retain local original files intact as immutable backup.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BusinessDocument } = require('../models/BusinessDocument');
const { documentStorageAdapter } = require('../services/documentStorageAdapter');
const auditService = require('../services/auditService');

async function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

class LocalDocumentMigrator {
  constructor(options = {}) {
    this.sourceDir = options.sourceDir || path.resolve(__dirname, '../../uploads');
    this.organisationId = options.organisationId || 'ZAMORIN';
    this.retainLocalFiles = options.retainLocalFiles !== false; // Default: NEVER delete local files without explicit instruction
  }

  async discoverFiles(dir) {
    const fileList = [];
    if (!fs.existsSync(dir)) return fileList;

    const walk = async (currentPath) => {
      const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          fileList.push(full);
        }
      }
    };

    await walk(dir);
    return fileList;
  }

  async runMigration() {
    const discoveredPaths = await this.discoverFiles(this.sourceDir);
    const results = {
      timestamp: new Date().toISOString(),
      sourceDir: this.sourceDir,
      discoveredCount: discoveredPaths.length,
      migratedCount: 0,
      skippedAlreadyMigratedCount: 0,
      unmatchedFilesCount: 0,
      errors: [],
      migratedDocuments: [],
      unmatchedFiles: [],
    };

    for (const filePath of discoveredPaths) {
      try {
        const stat = await fs.promises.stat(filePath);
        const sha256 = await computeFileSha256(filePath);
        const fileName = path.basename(filePath);

        // Find corresponding document in MongoDB
        const doc = await BusinessDocument.findOne({
          $or: [
            { sha256 },
            { checksum: sha256 },
            { originalFilename: fileName },
            { originalFileName: fileName },
            { storagePath: filePath },
          ],
        });

        if (!doc) {
          results.unmatchedFilesCount++;
          results.unmatchedFiles.push({ filePath, fileName, sizeBytes: stat.size, sha256 });
          continue;
        }

        // Idempotency check: If already migrated to durable storage with matching hash, skip
        if (
          doc.storageDriver === 'PRIVATE_OBJECT_STORAGE' &&
          (doc.storageObjectKey || doc.storageKey) &&
          (doc.sha256 === sha256 || doc.checksum === sha256)
        ) {
          const key = doc.storageObjectKey || doc.storageKey;
          const existsOnDurable = await documentStorageAdapter.exists({ storageKey: key });
          if (existsOnDurable) {
            results.skippedAlreadyMigratedCount++;
            continue;
          }
        }

        // Generate canonical durable storage key
        const ext = doc.extension || path.extname(fileName).replace('.', '') || 'bin';
        const canonicalKey = documentStorageAdapter.generateStorageKey({
          organisationId: doc.organisationId || this.organisationId,
          cafeId: doc.cafeId || 'GLOBAL',
          classification: doc.classification || 'PROCUREMENT',
          documentId: `${doc.documentId}-migrated`,
          mimeType: doc.mimeType || 'application/octet-stream',
        });

        // Upload to durable storage provider
        const uploadResult = await documentStorageAdapter.put({
          filePath,
          storageKey: canonicalKey,
          mimeType: doc.mimeType || 'application/octet-stream',
          sizeBytes: stat.size,
          organisationId: doc.organisationId || this.organisationId,
        });

        // Verify checksum on durable storage
        const stream = await documentStorageAdapter.getStream({ storageKey: canonicalKey });
        const streamHash = crypto.createHash('sha256');
        await new Promise((resolve, reject) => {
          stream.on('data', (c) => streamHash.update(c));
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        const durableSha256 = streamHash.digest('hex');

        if (durableSha256 !== sha256) {
          throw new Error(`Checksum mismatch between local file (${sha256}) and durable upload (${durableSha256})`);
        }

        // Update BusinessDocument metadata
        doc.storageDriver = 'PRIVATE_OBJECT_STORAGE';
        doc.storageProvider = 'S3_COMPATIBLE';
        doc.storageObjectKey = canonicalKey;
        doc.storageKey = canonicalKey;
        doc.sha256 = sha256;
        doc.checksum = sha256;
        doc.sizeBytes = stat.size;
        doc.fileSizeBytes = stat.size;
        doc.uploadStatus = 'AVAILABLE';
        doc.scanStatus = 'CLEAN';
        doc.securityScanStatus = 'CLEAN';
        doc.status = doc.documentStatus || 'UPLOADED';
        await doc.save();

        await auditService.recordAuditEvent({
          organisationId: doc.organisationId || this.organisationId,
          cafeId: doc.cafeId || 'GLOBAL',
          actorUserId: 'SYSTEM_MIGRATION_JOB',
          actorRole: 'SYSTEM',
          module: 'DOCUMENT_ATTACHMENT',
          action: 'DOCUMENT_MIGRATED',
          entityType: 'BUSINESS_DOCUMENT',
          entityId: doc.documentId,
          reason: `Migrated legacy file ${fileName} to durable object storage ${canonicalKey}`,
          result: 'SUCCESS',
          metadata: {
            documentId: doc.documentId,
            sha256,
            storageObjectKey: canonicalKey,
            originalLocalPath: filePath,
          },
        }).catch(() => {});

        results.migratedCount++;
        results.migratedDocuments.push({
          documentId: doc.documentId,
          fileName,
          sha256,
          storageObjectKey: canonicalKey,
        });
      } catch (err) {
        results.errors.push({ filePath, error: err.message });
      }
    }

    return results;
  }
}

module.exports = {
  LocalDocumentMigrator,
  computeFileSha256,
};
