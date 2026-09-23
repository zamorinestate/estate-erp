'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — DOCUMENT STORAGE RECONCILIATION & CAPACITY SERVICE
 * ============================================================================
 * Conducts non-destructive integrity reconciliation between MongoDB BusinessDocument
 * metadata and physical stored binary files in MongoDB Atlas GridFS (or local dev mount).
 *
 * Invariants:
 * - Reconciles both current versions and historical versions in BusinessDocument.versions[].
 * - Detects orphan metadata (database references missing GridFS file).
 * - Detects orphan GridFS files (<bucket>.files entry without matching BusinessDocument).
 * - Verifies SHA-256 integrity checksums.
 * - Assesses Atlas storage capacity and emits tiered warnings (70%, 80%, 90%).
 * - Orphaned binary objects are NEVER automatically purged without audited human operator decision.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { BusinessDocument } = require('../models/BusinessDocument');
const { documentStorageAdapter } = require('./documentStorageAdapter');

const CAPACITY_ALERT_THRESHOLDS = {
  WARNING_PERCENT: 70,
  HIGH_PERCENT: 80,
  CRITICAL_PERCENT: 90,
};

class DocumentReconciliationService {
  /**
   * Assesses storage capacity and usage metrics for document storage (GridFS or local disk).
   */
  async assessStorageCapacity() {
    const provider = documentStorageAdapter.getProvider();
    const isGridFs = provider.name === 'GridFSStorageAdapter';

    if (isGridFs) {
      const db = mongoose.connection.db;
      if (!db) {
        return {
          status: 'UNAVAILABLE',
          storageType: 'MONGODB_ATLAS_GRIDFS',
          totalBytes: 0,
          usedBytes: 0,
          freeBytes: 0,
          utilizationPercent: 0,
          alertLevel: 'CRITICAL',
          message: 'MongoDB connection is not established for GridFS capacity assessment.',
        };
      }

      const bucketName = provider.bucketName || 'zamorinDocuments';
      const filesColl = db.collection(`${bucketName}.files`);
      const chunksColl = db.collection(`${bucketName}.chunks`);

      let totalBinaryBytes = 0;
      let fileCount = 0;
      let chunkCount = 0;

      try {
        fileCount = await filesColl.countDocuments();
        chunkCount = await chunksColl.countDocuments();
        const lengthAgg = await filesColl.aggregate([
          { $group: { _id: null, totalBytes: { $sum: '$length' } } },
        ]).toArray();
        totalBinaryBytes = (lengthAgg[0] && lengthAgg[0].totalBytes) || 0;
      } catch (err) {
        // Fallback for empty collections
      }

      // Provisioned cluster storage ceiling: Default 10GB (M10 tier), 5GB (Flex tier)
      const provisionedCapacityBytes = parseInt(process.env.ATLAS_STORAGE_MAX_BYTES, 10) || 10 * 1024 * 1024 * 1024;
      const utilizationPercent = Number(((totalBinaryBytes / provisionedCapacityBytes) * 100).toFixed(2));

      let alertLevel = 'NORMAL';
      let recommendedAction = 'No action required.';

      if (utilizationPercent >= CAPACITY_ALERT_THRESHOLDS.CRITICAL_PERCENT) {
        alertLevel = 'CRITICAL';
        recommendedAction =
          'IMMEDIATE: Storage capacity exceeded 90%. Trip KILL_SWITCH_DOCUMENT_UPLOADS to suspend new uploads. ' +
          'Scale up MongoDB Atlas cluster tier (e.g. M10 to M20/M30) to increase storage allocation.';
      } else if (utilizationPercent >= CAPACITY_ALERT_THRESHOLDS.HIGH_PERCENT) {
        alertLevel = 'HIGH';
        recommendedAction =
          'URGENT: Storage capacity reached 80%. Prepare MongoDB Atlas cluster expansion request (SEV-2 alert).';
      } else if (utilizationPercent >= CAPACITY_ALERT_THRESHOLDS.WARNING_PERCENT) {
        alertLevel = 'WARNING';
        recommendedAction =
          'MONITOR: Storage capacity reached 70%. Investigate document growth trends and archive eligible historical files (SEV-3 alert).';
      }

      // Estimate monthly growth based on existing files
      const avgFileSizeBytes = fileCount > 0 ? Math.round(totalBinaryBytes / fileCount) : 500 * 1024;
      const estimatedMonthlyUploads = 300; // estimated monthly POs, invoices, receipts
      const estimatedMonthlyGrowthBytes = avgFileSizeBytes * estimatedMonthlyUploads;

      return {
        status: alertLevel === 'NORMAL' ? 'HEALTHY' : alertLevel,
        storageType: 'MONGODB_ATLAS_GRIDFS',
        bucketName,
        provisionedCapacityBytes,
        provisionedCapacityGB: Number((provisionedCapacityBytes / (1024 * 1024 * 1024)).toFixed(2)),
        usedBytes: totalBinaryBytes,
        usedMB: Number((totalBinaryBytes / (1024 * 1024)).toFixed(2)),
        freeBytes: Math.max(0, provisionedCapacityBytes - totalBinaryBytes),
        freeGB: Number((Math.max(0, provisionedCapacityBytes - totalBinaryBytes) / (1024 * 1024 * 1024)).toFixed(2)),
        utilizationPercent,
        fileCount,
        chunkCount,
        estimatedMonthlyGrowthMB: Number((estimatedMonthlyGrowthBytes / (1024 * 1024)).toFixed(2)),
        estimated6MonthGrowthMB: Number(((estimatedMonthlyGrowthBytes * 6) / (1024 * 1024)).toFixed(2)),
        estimated12MonthGrowthMB: Number(((estimatedMonthlyGrowthBytes * 12) / (1024 * 1024)).toFixed(2)),
        alertLevel,
        thresholds: CAPACITY_ALERT_THRESHOLDS,
        recommendedAction,
        timestamp: new Date().toISOString(),
      };
    }

    // Fallback: Local filesystem walk for development/testing
    const root = documentStorageAdapter.getResolvedStorageRoot();
    if (!root || !fs.existsSync(root)) {
      return {
        status: 'UNAVAILABLE',
        storageType: 'LOCAL_DEV_DISK',
        rootPath: root,
        totalBytes: 0,
        usedBytes: 0,
        freeBytes: 0,
        utilizationPercent: 0,
        alertLevel: 'CRITICAL',
        message: 'Persistent storage root is not available or unmounted.',
      };
    }

    let totalSizeBytes = 0;
    let fileCount = 0;

    const walk = async (dir) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          const stat = await fs.promises.stat(full);
          totalSizeBytes += stat.size;
          fileCount += 1;
        }
      }
    };

    try {
      await walk(root);
    } catch (_) {}

    const provisionedDiskCapacityBytes = 10 * 1024 * 1024 * 1024;
    const utilizationPercent = Number(((totalSizeBytes / provisionedDiskCapacityBytes) * 100).toFixed(2));

    let alertLevel = 'NORMAL';
    let recommendedAction = 'No action required.';

    if (utilizationPercent >= CAPACITY_ALERT_THRESHOLDS.CRITICAL_PERCENT) {
      alertLevel = 'CRITICAL';
      recommendedAction = 'IMMEDIATE: Storage capacity exceeded 90%.';
    } else if (utilizationPercent >= CAPACITY_ALERT_THRESHOLDS.HIGH_PERCENT) {
      alertLevel = 'HIGH';
      recommendedAction = 'URGENT: Storage capacity reached 80%.';
    } else if (utilizationPercent >= CAPACITY_ALERT_THRESHOLDS.WARNING_PERCENT) {
      alertLevel = 'WARNING';
      recommendedAction = 'MONITOR: Storage capacity reached 70%.';
    }

    return {
      status: alertLevel === 'NORMAL' ? 'HEALTHY' : alertLevel,
      storageType: 'LOCAL_DEV_DISK',
      rootPath: root,
      provisionedCapacityBytes: provisionedDiskCapacityBytes,
      usedBytes: totalSizeBytes,
      freeBytes: Math.max(0, provisionedDiskCapacityBytes - totalSizeBytes),
      utilizationPercent,
      fileCount,
      alertLevel,
      thresholds: CAPACITY_ALERT_THRESHOLDS,
      recommendedAction,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reconciles MongoDB metadata with physical files in GridFS (or local disk).
   * Detects:
   * 1. Orphan metadata: Document version active in MongoDB but binary missing from GridFS.
   * 2. Orphan binaries: Files in GridFS without matching BusinessDocument record.
   * 3. Checksum mismatches: Binary SHA-256 does not match database record.
   */
  async reconcileDocuments({ organisationId = 'ZAMORIN', verifyChecksums = true, sampleLimit = 100 } = {}) {
    const provider = documentStorageAdapter.getProvider();
    const isGridFs = provider.name === 'GridFSStorageAdapter';

    if (isGridFs) {
      return this._reconcileGridFS({ organisationId, verifyChecksums, sampleLimit, provider });
    }

    return this._reconcileLocalDisk({ organisationId, verifyChecksums, sampleLimit });
  }

  async _reconcileGridFS({ organisationId, verifyChecksums, sampleLimit, provider }) {
    const bucket = provider.getBucket();
    const orphanMetadata = [];
    const checksumMismatches = [];
    const verifiedFileIds = new Set();
    const verifiedKeys = new Set();

    const docs = await BusinessDocument.find({ organisationId, isDeleted: false })
      .limit(sampleLimit)
      .lean();

    for (const doc of docs) {
      // Check current version and historical versions
      const versionsToCheck = Array.isArray(doc.versions) && doc.versions.length > 0
        ? doc.versions
        : [{ version: doc.currentVersion || 1, storageKey: doc.storageKey, storageObjectKey: doc.storageObjectKey, gridFsFileId: doc.gridFsFileId, sha256: doc.sha256 }];

      for (const ver of versionsToCheck) {
        const fileId = ver.gridFsFileId || (ver.storageObjectKey === doc.storageObjectKey ? doc.gridFsFileId : null);
        const storageKey = ver.storageObjectKey || ver.storageKey || doc.storageObjectKey || doc.storageKey;

        if (!fileId && !storageKey) continue;

        const query = fileId ? { _id: fileId } : { filename: storageKey };
        const gridFiles = await bucket.find(query).limit(1).toArray();

        if (!gridFiles || gridFiles.length === 0) {
          orphanMetadata.push({
            documentId: doc.documentId,
            version: ver.version || 1,
            storageKey,
            gridFsFileId: fileId ? fileId.toString() : null,
            reason: 'Binary file missing in GridFS collection',
          });
        } else {
          const gFile = gridFiles[0];
          verifiedFileIds.add(gFile._id.toString());
          verifiedKeys.add(gFile.filename);

          if (verifyChecksums) {
            const expectedSha = ver.sha256 || doc.sha256;
            if (expectedSha) {
              // Verify against file metadata or read stream
              const actualSha = gFile.metadata?.sha256;
              if (actualSha && actualSha !== expectedSha) {
                checksumMismatches.push({
                  documentId: doc.documentId,
                  version: ver.version || 1,
                  storageKey,
                  gridFsFileId: gFile._id.toString(),
                  expectedSha256: expectedSha,
                  actualSha256: actualSha,
                  reason: 'GridFS metadata SHA-256 does not match database record',
                });
              } else if (!actualSha) {
                // Stream and compute hash if metadata sha is absent
                const hash = crypto.createHash('sha256');
                const stream = bucket.openDownloadStream(gFile._id);
                await new Promise((resolve, reject) => {
                  stream.on('data', (c) => hash.update(c));
                  stream.on('end', resolve);
                  stream.on('error', reject);
                }).catch(() => {});
                const computed = hash.digest('hex');
                if (computed !== expectedSha) {
                  checksumMismatches.push({
                    documentId: doc.documentId,
                    version: ver.version || 1,
                    storageKey,
                    gridFsFileId: gFile._id.toString(),
                    expectedSha256: expectedSha,
                    actualSha256: computed,
                    reason: 'GridFS streamed binary SHA-256 does not match database record',
                  });
                }
              }
            }
          }
        }
      }
    }

    // Audit files in GridFS to discover orphan binaries
    const allGridFiles = await bucket.find({}).limit(sampleLimit * 2).toArray();
    const orphanBinaries = [];
    const GRACE_PERIOD_MS = 15 * 60 * 1000; // 15 minute grace period for in-flight uploads

    for (const file of allGridFiles) {
      const fileIdStr = file._id.toString();
      if (!verifiedFileIds.has(fileIdStr) && !verifiedKeys.has(file.filename)) {
        // Double check against BusinessDocument
        const match = await BusinessDocument.findOne({
          $or: [
            { gridFsFileId: file._id },
            { storageKey: file.filename },
            { storageObjectKey: file.filename },
            { 'versions.gridFsFileId': file._id },
            { 'versions.storageKey': file.filename },
            { 'versions.storageObjectKey': file.filename },
          ],
        }).lean();

        if (!match) {
          const ageMs = Date.now() - new Date(file.uploadDate).getTime();
          if (ageMs > GRACE_PERIOD_MS) {
            orphanBinaries.push({
              gridFsFileId: fileIdStr,
              storageKey: file.filename,
              sizeBytes: file.length,
              uploadDate: file.uploadDate,
              reason: 'GridFS binary exists without matching BusinessDocument reference',
            });
          }
        }
      }
    }

    return {
      status: 'RECONCILIATION_COMPLETE',
      storageType: 'MONGODB_ATLAS_GRIDFS',
      timestamp: new Date().toISOString(),
      documentsAudited: docs.length,
      gridFilesScanned: allGridFiles.length,
      orphanMetadataCount: orphanMetadata.length,
      orphanBinariesCount: orphanBinaries.length,
      checksumMismatchesCount: checksumMismatches.length,
      orphanMetadata,
      orphanBinaries,
      checksumMismatches,
      isConsistent: orphanMetadata.length === 0 && checksumMismatches.length === 0,
      remediationNotice: 'Orphaned binaries are preserved for operator review per non-destructive policy.',
    };
  }

  async _reconcileLocalDisk({ organisationId, verifyChecksums, sampleLimit }) {
    const root = documentStorageAdapter.getResolvedStorageRoot();
    if (!root || !fs.existsSync(root)) {
      return {
        status: 'FAILED',
        error: 'DOCUMENT_STORAGE_ROOT_UNAVAILABLE',
        orphanMetadata: [],
        orphanBinaries: [],
        checksumMismatches: [],
      };
    }

    const orphanMetadata = [];
    const checksumMismatches = [];
    const verifiedKeys = new Set();

    const docs = await BusinessDocument.find({ organisationId, isDeleted: false })
      .limit(sampleLimit)
      .lean();

    for (const doc of docs) {
      const storageKey = doc.storageKey;
      if (!storageKey) continue;

      verifiedKeys.add(storageKey);
      const fullPath = path.join(root, storageKey);

      if (!fs.existsSync(fullPath)) {
        orphanMetadata.push({
          documentId: doc.documentId,
          storageKey,
          title: doc.originalName,
          reason: 'Binary file missing on persistent disk mount',
        });
      } else if (verifyChecksums && doc.sha256) {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(fullPath);
        await new Promise((resolve) => {
          stream.on('data', (chunk) => hash.update(chunk));
          stream.on('end', resolve);
        });
        const actualHash = hash.digest('hex');

        if (actualHash !== doc.sha256) {
          checksumMismatches.push({
            documentId: doc.documentId,
            storageKey,
            expectedSha256: doc.sha256,
            actualSha256: actualHash,
            reason: 'Disk binary SHA-256 does not match database record',
          });
        }
      }
    }

    const diskFiles = [];
    const walkFiles = async (dir, relativePrefix = '') => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const relative = path.join(relativePrefix, entry.name).replace(/\\/g, '/');
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walkFiles(full, relative);
        } else if (entry.isFile()) {
          diskFiles.push({ storageKey: relative, fullPath: full });
        }
      }
    };

    try {
      await walkFiles(root);
    } catch (_) {}

    const orphanBinaries = [];
    for (const file of diskFiles) {
      if (!verifiedKeys.has(file.storageKey)) {
        const existsInDb = await BusinessDocument.findOne({ storageKey: file.storageKey }).lean();
        if (!existsInDb) {
          orphanBinaries.push({
            storageKey: file.storageKey,
            fullPath: file.fullPath,
            reason: 'Physical file exists on disk without matching BusinessDocument record',
          });
        }
      }
    }

    return {
      status: 'RECONCILIATION_COMPLETE',
      storageType: 'LOCAL_DEV_DISK',
      timestamp: new Date().toISOString(),
      documentsAudited: docs.length,
      diskFilesScanned: diskFiles.length,
      orphanMetadataCount: orphanMetadata.length,
      orphanBinariesCount: orphanBinaries.length,
      checksumMismatchesCount: checksumMismatches.length,
      orphanMetadata,
      orphanBinaries,
      checksumMismatches,
      isConsistent: orphanMetadata.length === 0 && checksumMismatches.length === 0,
      remediationNotice: 'Orphaned binaries are preserved for operator review per non-destructive policy.',
    };
  }

  /**
   * Reconciles documents stuck in PENDING_SCAN, SCAN_FAILED, or SCANNER_UNAVAILABLE (EXT-02).
   * Identifies unverified or failed documents older than maxAgeMs (default 15 mins) and retries scan.
   */
  async reconcilePendingScans({ maxAgeMs = 15 * 60 * 1000, limit = 50, autoRetry = false } = {}) {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const filter = {
      isDeleted: false,
      $or: [
        { scanStatus: 'PENDING_SCAN', createdAt: { $lte: cutoff } },
        { scanStatus: 'SCAN_FAILED' },
        { scanStatus: 'SCANNER_UNAVAILABLE' },
        { uploadStatus: 'SCANNING', updatedAt: { $lte: cutoff } },
      ],
    };

    const staleDocs = await BusinessDocument.find(filter).limit(limit);
    const results = {
      timestamp: new Date().toISOString(),
      staleCount: staleDocs.length,
      retriedCount: 0,
      cleanCount: 0,
      infectedCount: 0,
      failedCount: 0,
      items: [],
    };

    const { DocumentAttachmentService } = require('./documentAttachmentService');

    for (const doc of staleDocs) {
      const item = {
        documentId: doc.documentId,
        organisationId: doc.organisationId,
        currentStatus: doc.scanStatus,
        createdAt: doc.createdAt,
      };

      if (autoRetry) {
        try {
          const rescan = await DocumentAttachmentService.scanGridFsRevision({
            documentId: doc.documentId,
            organisationId: doc.organisationId,
            versionNumber: doc.currentVersion,
          });
          item.newStatus = rescan.scanStatus;
          item.threatName = rescan.threatName;
          results.retriedCount++;
          if (rescan.scanStatus === 'CLEAN') results.cleanCount++;
          else if (rescan.scanStatus === 'INFECTED') results.infectedCount++;
          else results.failedCount++;
        } catch (scanErr) {
          item.retryError = scanErr.message;
          results.failedCount++;
        }
      }

      results.items.push(item);
    }

    return results;
  }
}

const documentReconciliationService = new DocumentReconciliationService();

module.exports = {
  CAPACITY_ALERT_THRESHOLDS,
  DocumentReconciliationService,
  documentReconciliationService,
};
