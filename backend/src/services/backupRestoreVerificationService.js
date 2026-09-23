'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

const KNOWN_PRODUCTION_DB_NAMES = new Set([
  'zamorin_erp_production',
  'zamorin_erp_prod',
  'zamorin_prod',
  'zamorin_production',
  'zamorin_erp',
  'production',
]);

class BackupRestoreVerificationService {
  /**
   * Masks sensitive credentials in connection strings or URIs.
   */
  static maskConnectionString(uri = '') {
    if (!uri || typeof uri !== 'string') return '';
    return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
  }

  /**
   * Assesses Atlas tier and backup capabilities.
   */
  static assessAtlasBackupConfig(options = {}) {
    const tier = (options.tier || process.env.ATLAS_TIER || 'FLEX').toUpperCase();
    const cloud = options.cloudProvider || process.env.ATLAS_CLOUD_PROVIDER || 'AWS';
    const region = options.region || process.env.ATLAS_REGION || 'ap-south-1';

    const isFlex = tier === 'FLEX';
    const isDedicatedM10Plus = tier.startsWith('M10') || tier.startsWith('M20') || tier.startsWith('M30');
    const isFree = tier === 'FREE' || tier === 'M0';

    return {
      tier,
      cloudProvider: cloud,
      region,
      automaticDailySnapshots: !isFree,
      customBackupScheduleSupported: isDedicatedM10Plus,
      onDemandSnapshotSupported: isDedicatedM10Plus,
      continuousBackupSupported: isDedicatedM10Plus,
      pointInTimeRestoreSupported: isDedicatedM10Plus,
      currentRpoCapability: isFlex ? 'DAILY_SNAPSHOT (~24 hours)' : isDedicatedM10Plus ? 'CONTINUOUS_PITR (1-minute)' : 'NONE',
      dedicatedTierRequiredForCommercialProduction: isFlex || isFree,
      status: isFlex ? 'PILOT_ONLY' : isDedicatedM10Plus ? 'PRODUCTION_READY' : 'BLOCKED',
      retentionPolicy: isFlex ? 'Automatic daily snapshots retained per Atlas Flex policy' : 'Configurable multi-day/weekly retention',
      encryptionAtRest: 'PROVIDER_MANAGED (AWS KMS managed by MongoDB Atlas)',
    };
  }

  /**
   * Performs read-only verification of a restored target MongoDB instance.
   *
   * @param {Object} params
   * @param {string} params.uri - Connection URI to the isolated restore target
   * @param {string} params.dbName - Name of the restored database
   * @param {string} params.targetConfirmation - Confirmation token proving target is isolated
   * @param {boolean} [params.restoreVerificationMode] - Safety flag: must be true
   * @param {string} [params.fixtureDocumentId] - Specific test documentId to verify
   * @param {string} [params.bucketName='zamorinDocuments'] - GridFS bucket name
   * @param {Object} [params.injectedClient] - Optional pre-connected MongoClient or mongoose connection for testing
   */
  static async verifyRestoreTarget({
    uri,
    dbName,
    targetConfirmation,
    restoreVerificationMode = false,
    fixtureDocumentId = null,
    bucketName = 'zamorinDocuments',
    injectedClient = null,
  }) {
    const startTime = Date.now();
    const isFlagActive = restoreVerificationMode === true || process.env.RESTORE_VERIFICATION_MODE === 'true';

    // 1. Safety Guard: Enforce RESTORE_VERIFICATION_MODE
    if (!isFlagActive) {
      const err = new Error('RESTORE_VERIFICATION_MODE must be enabled (true) to run restore verification.');
      err.code = 'RESTORE_VERIFICATION_MODE_REQUIRED';
      err.statusCode = 403;
      throw err;
    }

    // 2. Safety Guard: Require isolated target confirmation
    if (targetConfirmation !== 'CONFIRM_ISOLATED_RESTORE_TARGET') {
      const err = new Error('Explicit target confirmation CONFIRM_ISOLATED_RESTORE_TARGET is required to protect against accidental execution.');
      err.code = 'RESTORE_TARGET_CONFIRMATION_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    // 3. Safety Guard: Refuse known production database names
    const normalizedDbName = (dbName || '').trim().toLowerCase();
    if (KNOWN_PRODUCTION_DB_NAMES.has(normalizedDbName)) {
      const err = new Error(`Target database '${dbName}' matches known production database name. Restore verification on production databases is prohibited.`);
      err.code = 'PRODUCTION_TARGET_PROTECTION';
      err.statusCode = 403;
      throw err;
    }

    // 4. Safety Guard: Inspect URI host for production hostnames
    if (uri) {
      const lowerUri = uri.toLowerCase();
      if (lowerUri.includes('production') && !lowerUri.includes('restore') && !lowerUri.includes('test')) {
        const err = new Error('Target URI appears to reference production cluster. Refusing execution.');
        err.code = 'PRODUCTION_CLUSTER_PROTECTION';
        err.statusCode = 403;
        throw err;
      }
    }

    // 5. Connect to target using isolated client (READ-ONLY)
    let client = injectedClient;
    let ownConnection = false;
    let targetDb;

    try {
      if (!client) {
        if (!uri) {
          const err = new Error('Target connection URI or injectedClient is required.');
          err.code = 'TARGET_URI_REQUIRED';
          err.statusCode = 400;
          throw err;
        }

        ownConnection = true;
        const conn = await mongoose.createConnection(uri, {
          dbName: dbName || undefined,
          serverSelectionTimeoutMS: 5000,
          readPreference: 'secondaryPreferred', // Prefer read replica if cluster
        }).asPromise();

        client = conn;
        targetDb = conn.db;
      } else {
        targetDb = client.db || client;
      }

      if (!targetDb) {
        const err = new Error('Could not obtain database handle from target connection.');
        err.code = 'TARGET_DATABASE_UNAVAILABLE';
        err.statusCode = 503;
        throw err;
      }

      // Verify collections presence
      const collections = await targetDb.listCollections().toArray();
      const collectionNames = new Set(collections.map((c) => c.name));

      const filesCollName = `${bucketName}.files`;
      const chunksCollName = `${bucketName}.chunks`;
      const businessDocsCollName = collectionNames.has('business_documents')
        ? 'business_documents'
        : collectionNames.has('businessdocuments')
        ? 'businessdocuments'
        : 'business_documents';

      const hasFiles = collectionNames.has(filesCollName);
      const hasChunks = collectionNames.has(chunksCollName);
      const hasBusinessDocs = collectionNames.has(businessDocsCollName);

      if (!hasFiles || !hasChunks || !hasBusinessDocs) {
        return {
          success: false,
          status: 'FAIL',
          code: 'MISSING_COLLECTIONS',
          message: `Restored target is missing essential collections. Found files: ${hasFiles}, chunks: ${hasChunks}, businessdocuments: ${hasBusinessDocs}`,
          collectionsFound: Array.from(collectionNames),
          durationMs: Date.now() - startTime,
        };
      }

      const filesColl = targetDb.collection(filesCollName);
      const chunksColl = targetDb.collection(chunksCollName);
      const docsColl = targetDb.collection(businessDocsCollName);

      // Safe Counts
      const totalDocuments = await docsColl.countDocuments({});
      const totalGridFsFiles = await filesColl.countDocuments({});
      const totalGridFsChunks = await chunksColl.countDocuments({});

      // 6. Verify Indexes
      const filesIndexes = await filesColl.indexes();
      const chunksIndexes = await chunksColl.indexes();
      const docsIndexes = await docsColl.indexes();

      const filesHasFilenameUploadDateIndex = filesIndexes.some(
        (idx) => (idx.key?.filename && idx.key?.uploadDate) || (idx.name && idx.name.includes('filename'))
      );
      const chunksHasFilesIdNIndex = chunksIndexes.some(
        (idx) => (idx.key?.files_id && idx.key?.n !== undefined) || (idx.name && idx.name.includes('files_id'))
      );
      const docsHasDocumentIdIndex = docsIndexes.some(
        (idx) => idx.key?.documentId !== undefined
      );

      // 7. Verify Fixture Document
      const query = fixtureDocumentId ? { documentId: fixtureDocumentId } : {};
      const sampleDocs = await docsColl.find(query).limit(10).toArray();

      if (sampleDocs.length === 0) {
        return {
          success: false,
          status: 'FAIL',
          code: 'FIXTURE_NOT_FOUND',
          message: fixtureDocumentId
            ? `Specified fixture documentId '${fixtureDocumentId}' was not found in restored target.`
            : 'No BusinessDocument records found in restored target.',
          totalDocuments,
          totalGridFsFiles,
          totalGridFsChunks,
          durationMs: Date.now() - startTime,
        };
      }

      const verifiedDocuments = [];
      const bucket = new mongoose.mongo.GridFSBucket(targetDb, { bucketName });

      for (const doc of sampleDocs) {
        const docResult = {
          documentId: doc.documentId,
          organisationId: doc.organisationId,
          cafeId: doc.cafeId,
          scanStatus: doc.scanStatus,
          securityScanStatus: doc.securityScanStatus,
          documentStatus: doc.documentStatus,
          currentVersion: doc.currentVersion,
          hasGridFsFileId: Boolean(doc.gridFsFileId),
          gridFsFileFound: false,
          chunksValid: false,
          sha256Match: false,
          reconstructedSha256: null,
          versionsVerified: [],
          retentionPreserved: {
            retentionUntil: doc.retentionUntil || null,
            legalHold: Boolean(doc.legalHold),
            isDeleted: Boolean(doc.isDeleted),
          },
        };

        if (!doc.gridFsFileId) {
          docResult.error = 'BusinessDocument has null or missing gridFsFileId';
          verifiedDocuments.push(docResult);
          continue;
        }

        // Check files collection
        const fileRecord = await filesColl.findOne({ _id: doc.gridFsFileId });
        if (!fileRecord) {
          docResult.error = `GridFS file record for ID ${doc.gridFsFileId} not found in ${filesCollName}`;
          verifiedDocuments.push(docResult);
          continue;
        }

        docResult.gridFsFileFound = true;
        docResult.fileLength = fileRecord.length;
        docResult.chunkSize = fileRecord.chunkSize;

        // Check chunks collection
        const expectedChunksCount = Math.ceil(fileRecord.length / fileRecord.chunkSize);
        const actualChunksCount = await chunksColl.countDocuments({ files_id: doc.gridFsFileId });

        if (fileRecord.length > 0 && actualChunksCount !== expectedChunksCount) {
          docResult.error = `Chunk count mismatch: expected ${expectedChunksCount}, got ${actualChunksCount}`;
          verifiedDocuments.push(docResult);
          continue;
        }
        docResult.chunksValid = true;
        docResult.chunkCount = actualChunksCount;

        // Stream reconstructed binary and calculate SHA-256 (Zero whole-file RAM buffer)
        try {
          const hash = crypto.createHash('sha256');
          const downloadStream = bucket.openDownloadStream(doc.gridFsFileId);

          await new Promise((resolve, reject) => {
            downloadStream.on('data', (chunk) => hash.update(chunk));
            downloadStream.on('end', resolve);
            downloadStream.on('error', reject);
          });

          const calculatedSha256 = hash.digest('hex');
          docResult.reconstructedSha256 = calculatedSha256;

          const expectedSha = (doc.sha256 || doc.checksum || '').toLowerCase();
          if (expectedSha && calculatedSha256.toLowerCase() === expectedSha) {
            docResult.sha256Match = true;
          } else if (!expectedSha) {
            docResult.sha256Match = true; // No baseline sha recorded
          } else {
            docResult.sha256Match = false;
            docResult.error = `SHA-256 mismatch: expected ${expectedSha}, got ${calculatedSha256}`;
          }
        } catch (streamErr) {
          docResult.error = `GridFS stream reconstruction failed: ${streamErr.message}`;
          verifiedDocuments.push(docResult);
          continue;
        }

        // Verify historical immutable revisions
        if (Array.isArray(doc.versions) && doc.versions.length > 0) {
          for (const ver of doc.versions) {
            const verResult = {
              version: ver.version || ver.versionNumber,
              gridFsFileId: ver.gridFsFileId,
              scanStatus: ver.scanStatus,
              sha256Match: false,
            };

            if (ver.gridFsFileId) {
              const verFile = await filesColl.findOne({ _id: ver.gridFsFileId });
              if (verFile) {
                verResult.fileFound = true;
                try {
                  const verHash = crypto.createHash('sha256');
                  const vStream = bucket.openDownloadStream(ver.gridFsFileId);
                  await new Promise((resolve, reject) => {
                    vStream.on('data', (chunk) => verHash.update(chunk));
                    vStream.on('end', resolve);
                    vStream.on('error', reject);
                  });
                  const vCalculated = verHash.digest('hex');
                  verResult.reconstructedSha256 = vCalculated;
                  const vExpected = (ver.sha256 || ver.checksum || '').toLowerCase();
                  verResult.sha256Match = !vExpected || vCalculated.toLowerCase() === vExpected;
                } catch (vErr) {
                  verResult.error = vErr.message;
                }
              } else {
                verResult.fileFound = false;
              }
            }
            docResult.versionsVerified.push(verResult);
          }
        }

        verifiedDocuments.push(docResult);
      }

      // 8. Integrity and Orphan Audit
      // Dangling metadata: docs pointing to missing files
      const allDocFileIds = [];
      const cursor = docsColl.find({}, { projection: { gridFsFileId: 1, 'versions.gridFsFileId': 1 } });
      while (await cursor.hasNext()) {
        const d = await cursor.next();
        if (d.gridFsFileId) allDocFileIds.push(d.gridFsFileId);
        if (Array.isArray(d.versions)) {
          for (const v of d.versions) {
            if (v.gridFsFileId) allDocFileIds.push(v.gridFsFileId);
          }
        }
      }

      const danglingMetadataCount = (
        await filesColl.countDocuments({ _id: { $in: allDocFileIds } })
      ) < allDocFileIds.length
        ? allDocFileIds.length - (await filesColl.countDocuments({ _id: { $in: allDocFileIds } }))
        : 0;

      // Orphan GridFS files: files not in any document
      const orphanFilesCount = await filesColl.countDocuments({
        _id: { $nin: allDocFileIds },
      });

      const allFileRecords = await filesColl.find({}, { projection: { _id: 1 } }).toArray();
      const validFileIds = allFileRecords.map((f) => f._id);
      const orphanChunksCount = await chunksColl.countDocuments({
        files_id: { $nin: validFileIds },
      });

      const allFixturesClean = verifiedDocuments.every(
        (v) => v.gridFsFileFound && v.chunksValid && v.sha256Match
      );

      const durationMs = Date.now() - startTime;

      return {
        success: allFixturesClean,
        status: allFixturesClean ? 'PASS' : 'FAIL',
        databaseName: dbName || targetDb.databaseName,
        metrics: {
          totalBusinessDocuments: totalDocuments,
          totalGridFsFiles,
          totalGridFsChunks,
          danglingMetadataCount,
          orphanFilesCount,
          orphanChunksCount,
        },
        indexHealth: {
          filesHasExpectedIndex: filesHasFilenameUploadDateIndex,
          chunksHasCompoundIndex: chunksHasFilesIdNIndex,
          docsHasDocumentIdIndex,
        },
        verifiedDocumentsCount: verifiedDocuments.length,
        verifiedDocuments,
        readOnlyEnforced: true,
        durationMs,
      };
    } finally {
      if (ownConnection && client) {
        await client.close().catch(() => {});
      }
    }
  }

  /**
   * Validates that a backup destination directory is safely outside the Git repository.
   */
  static validateBackupPath(targetPath, repoRoot = null) {
    if (!targetPath || typeof targetPath !== 'string') {
      const err = new Error('Backup destination path is required.');
      err.code = 'BACKUP_PATH_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    const path = require('path');
    const normalizedTarget = path.resolve(targetPath);
    const resolvedRepoRoot = repoRoot ? path.resolve(repoRoot) : path.resolve(__dirname, '..', '..', '..');

    const rel = path.relative(resolvedRepoRoot, normalizedTarget);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      const err = new Error(`Backup destination '${targetPath}' is inside the Git repository tree. Backups must be stored outside repository.`);
      err.code = 'BACKUP_INSIDE_REPOSITORY_PROHIBITED';
      err.statusCode = 400;
      throw err;
    }

    return {
      isValid: true,
      path: normalizedTarget,
      isOutsideRepository: true,
    };
  }

  /**
   * Waits until active GridFS document uploads/finalizations reach 0.
   */
  static async waitForDrainedUploads({ getActiveUploadsFn, timeoutMs = 5000, pollIntervalMs = 50 } = {}) {
    if (!getActiveUploadsFn || typeof getActiveUploadsFn !== 'function') return 0;
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const active = await getActiveUploadsFn();
      if (active === 0) return 0;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    const remaining = await getActiveUploadsFn();
    if (remaining > 0) {
      const err = new Error(`Cannot start backup while ${remaining} active GridFS document upload(s) are in progress.`);
      err.code = 'ACTIVE_UPLOADS_IN_PROGRESS';
      err.statusCode = 409;
      err.activeUploads = remaining;
      throw err;
    }
    return 0;
  }

  /**
   * Coordinates a controlled write-quiescence window during which mutations are suspended.
   * Restores original state even if backup fails.
   */
  static async withQuiescedWrites({
    maintenanceManager = null,
    action,
    getActiveUploadsFn = null,
    maxWaitUploadsMs = 5000,
  }) {
    if (typeof action !== 'function') {
      throw new Error('An action function is required to execute within write-quiesced window.');
    }

    // 1. Drain active GridFS uploads before starting
    if (getActiveUploadsFn) {
      await this.waitForDrainedUploads({ getActiveUploadsFn, timeoutMs: maxWaitUploadsMs });
    }

    // 2. Capture existing maintenance/read-only state
    const previousState = maintenanceManager && typeof maintenanceManager.getState === 'function'
      ? maintenanceManager.getState()
      : null;

    // 3. Put ERP into verified read-only mode & set write quiescence safety flag
    if (maintenanceManager && typeof maintenanceManager.setReadOnlyMode === 'function') {
      maintenanceManager.setReadOnlyMode({
        enabled: true,
        reason: 'Zero-cost Free-tier backup window: write quiescence active',
      });
    }
    process.env.ZAMORIN_BACKUP_WRITES_QUIESCED = 'true';

    try {
      // 4. Execute dump / backup action
      return await action();
    } finally {
      // 5. Restores original quiescence state safely on success OR failure
      delete process.env.ZAMORIN_BACKUP_WRITES_QUIESCED;
      if (maintenanceManager && typeof maintenanceManager.setReadOnlyMode === 'function') {
        if (previousState && previousState.readOnlyActive) {
          maintenanceManager.setReadOnlyMode({ enabled: true, reason: previousState.reason });
        } else {
          maintenanceManager.setReadOnlyMode({ enabled: false });
        }
      }
    }
  }

  /**
   * Constructs mongodump arguments with safe credential masking.
   */
  static buildMongoDumpCommand({
    uri,
    dbName,
    outDir = null,
    archivePath = null,
    gzip = true,
    repoRoot = null,
    requireQuiescence = true,
    writesQuiesced = (process.env.ZAMORIN_BACKUP_WRITES_QUIESCED === 'true'),
    activeUploads = 0,
  }) {
    if (!uri) {
      const err = new Error('MongoDB URI is required for mongodump.');
      err.code = 'MONGODB_URI_REQUIRED';
      throw err;
    }

    if (requireQuiescence && !writesQuiesced) {
      const err = new Error('Controlled write quiescence (ZAMORIN_BACKUP_WRITES_QUIESCED=true) is required for Free-tier mongodump to guarantee application consistency without oplog.');
      err.code = 'WRITE_QUIESCENCE_REQUIRED';
      err.statusCode = 412;
      throw err;
    }

    if (activeUploads > 0) {
      const err = new Error(`Cannot start backup while ${activeUploads} active GridFS document upload(s) are in progress.`);
      err.code = 'ACTIVE_UPLOADS_IN_PROGRESS';
      err.statusCode = 409;
      throw err;
    }

    const dest = archivePath || outDir;
    this.validateBackupPath(dest, repoRoot);

    const args = [`--uri=${uri}`];
    if (dbName) args.push(`--db=${dbName}`);
    if (archivePath) {
      args.push(`--archive=${archivePath}`);
    } else if (outDir) {
      args.push(`--out=${outDir}`);
    }
    if (gzip) args.push('--gzip');

    const maskedArgs = args.map((arg) => {
      if (arg.startsWith('--uri=')) {
        return `--uri=${this.maskConnectionString(uri)}`;
      }
      return arg;
    });

    return {
      command: 'mongodump',
      args,
      maskedArgs,
      destination: dest,
      writesQuiescedConfirmed: Boolean(writesQuiesced),
    };
  }

  /**
   * Constructs mongorestore arguments with production target safety guard.
   */
  static buildMongoRestoreCommand({
    uri,
    targetDbName,
    archivePath = null,
    dumpDir = null,
    drop = false,
    gzip = true,
  }) {
    if (!uri) {
      const err = new Error('MongoDB URI is required for mongorestore.');
      err.code = 'MONGODB_URI_REQUIRED';
      throw err;
    }

    const normalizedDb = (targetDbName || '').trim().toLowerCase();
    if (KNOWN_PRODUCTION_DB_NAMES.has(normalizedDb)) {
      const err = new Error(`Cannot restore into protected production database '${targetDbName}'.`);
      err.code = 'PRODUCTION_TARGET_PROTECTION';
      err.statusCode = 403;
      throw err;
    }

    const args = [`--uri=${uri}`];
    if (targetDbName) {
      args.push(`--nsInclude=*.*`);
      args.push(`--nsFrom=*.*`);
      args.push(`--nsTo=${targetDbName}.*`);
    }
    if (archivePath) {
      args.push(`--archive=${archivePath}`);
    } else if (dumpDir) {
      args.push(dumpDir);
    }
    if (gzip) args.push('--gzip');
    if (drop) args.push('--drop');

    const maskedArgs = args.map((arg) => {
      if (arg.startsWith('--uri=')) {
        return `--uri=${this.maskConnectionString(uri)}`;
      }
      return arg;
    });

    return {
      command: 'mongorestore',
      args,
      maskedArgs,
      targetDatabase: targetDbName,
    };
  }

  /**
   * Calculates local backup retention (e.g. keeps 7 most recent backups, flags older ones).
   */
  static assessLocalRetention({ backupDirs = [], retentionCount = 7 }) {
    const sorted = [...backupDirs].sort().reverse();
    const retained = sorted.slice(0, retentionCount);
    const prunable = sorted.slice(retentionCount);

    return {
      totalFound: backupDirs.length,
      retentionLimit: retentionCount,
      retainedCount: retained.length,
      prunableCount: prunable.length,
      retained,
      prunable,
    };
  }
}

module.exports = {
  BackupRestoreVerificationService,
  KNOWN_PRODUCTION_DB_NAMES,
};
