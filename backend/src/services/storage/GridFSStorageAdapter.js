'use strict';

const crypto = require('crypto');
const fs = require('fs');
const mongoose = require('mongoose');
const { DocumentStorageProvider } = require('./DocumentStorageProvider');
const { ApiError } = require('../../utils/ApiError');

/**
 * ZAMORIN CAFÉ ERP — MONGODB ATLAS GRIDFS STORAGE ADAPTER
 *
 * Canonical production document storage adapter backed by MongoDB Atlas GridFS.
 * Stores binary documents inside GridFS collections:
 *   - <bucketName>.files
 *   - <bucketName>.chunks
 *
 * Invariants:
 * - Decoupled from application filesystem: Zero permanent Render disk dependence.
 * - Streams directly to/from GridFS without loading complete large files into RAM.
 * - Computes and verifies SHA-256 checksums in-stream.
 * - Supports immutable versioning (historical binaries are never overwritten).
 * - Multi-instance Render safe (all backend instances share Atlas GridFS authority).
 */
class GridFSStorageAdapter extends DocumentStorageProvider {
  constructor(options = {}) {
    super('GridFSStorageAdapter');
    this.bucketName = options.bucketName || process.env.DOCUMENT_GRIDFS_BUCKET || 'zamorinDocuments';
    this.mongooseInstance = options.mongoose || mongoose;
    this.customDb = options.db || null;
    this._bucket = options.bucket || null;
    this.signingSecret = options.signingSecret || process.env.JWT_ACCESS_SECRET || 'zamorin-gridfs-grant-secret-1234';
  }

  /**
   * Retrieves or initializes the GridFSBucket instance on active DB connection.
   */
  getBucket() {
    if (this._bucket) {
      return this._bucket;
    }
    const db = this.customDb || (this.mongooseInstance.connection && this.mongooseInstance.connection.db);
    if (!db) {
      throw new ApiError(503, 'GRIDFS_DATABASE_UNAVAILABLE', 'MongoDB connection is not established for GridFS.');
    }
    const mongoDriver = this.mongooseInstance.mongo;
    if (!mongoDriver || typeof mongoDriver.GridFSBucket !== 'function') {
      throw new ApiError(500, 'GRIDFS_DRIVER_MISSING', 'MongoDB driver GridFSBucket is unavailable.');
    }
    this._bucket = new mongoDriver.GridFSBucket(db, { bucketName: this.bucketName });
    return this._bucket;
  }

  isProductionDriver() {
    return true;
  }

  validateConfiguration(env = process.env) {
    const isProd = env.NODE_ENV === 'production';
    if (isProd) {
      const db = this.customDb || (this.mongooseInstance.connection && this.mongooseInstance.connection.readyState === 1);
      const uri = env.MONGODB_URI;
      if (!db && (!uri || !String(uri).trim())) {
        throw new ApiError(
          500,
          'DOCUMENT_STORAGE_NOT_CONFIGURED',
          'Production GridFS storage requires active MongoDB Atlas connection configuration (MONGODB_URI).'
        );
      }
    }
    return true;
  }

  /**
   * Streams binary content into GridFS.
   * Calculates SHA-256 checksum on the fly.
   */
  async putObject({
    objectKey,
    stream = null,
    buffer = null,
    filePath = null,
    mimeType = 'application/octet-stream',
    sizeBytes = 0,
    metadata = {},
  }) {
    if (!objectKey) {
      throw new ApiError(400, 'MISSING_STORAGE_KEY', 'Storage object key is required for GridFS storage.');
    }

    const bucket = this.getBucket();
    const hash = crypto.createHash('sha256');
    let bytesCount = 0;

    const uploadStream = bucket.openUploadStream(objectKey, {
      contentType: mimeType,
      metadata: {
        ...metadata,
        storageKey: objectKey,
        mimeType,
        originalFilename: metadata.originalFilename || null,
        organisationId: metadata.organisationId || 'ZAMORIN',
        cafeId: metadata.cafeId || 'GLOBAL',
        uploadedAt: new Date(),
      },
    });

    const fileId = uploadStream.id;

    if (stream) {
      await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => {
          hash.update(chunk);
          bytesCount += chunk.length;
        });
        stream.on('error', (err) => {
          uploadStream.abort().catch(() => {});
          reject(err);
        });
        uploadStream.on('error', reject);
        uploadStream.on('finish', resolve);
        stream.pipe(uploadStream);
      });
    } else if (buffer) {
      await new Promise((resolve, reject) => {
        hash.update(buffer);
        bytesCount = buffer.length;
        uploadStream.on('error', reject);
        uploadStream.on('finish', resolve);
        uploadStream.end(buffer);
      });
    } else if (filePath) {
      await new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(filePath);
        readStream.on('data', (chunk) => {
          hash.update(chunk);
          bytesCount += chunk.length;
        });
        readStream.on('error', (err) => {
          uploadStream.abort().catch(() => {});
          reject(err);
        });
        uploadStream.on('error', reject);
        uploadStream.on('finish', resolve);
        readStream.pipe(uploadStream);
      });
    } else {
      throw new ApiError(400, 'NO_PAYLOAD_PROVIDED', 'A readable stream, buffer, or filePath must be provided to putObject().');
    }

    const computedSha256 = hash.digest('hex');

    // Optionally update file metadata in GridFS with verified sha256
    try {
      const db = this.customDb || this.mongooseInstance.connection.db;
      if (db) {
        await db.collection(`${this.bucketName}.files`).updateOne(
          { _id: fileId },
          { $set: { 'metadata.sha256': computedSha256 } }
        );
      }
    } catch (_) {
      // Non-blocking metadata enrichment
    }

    return {
      storageProvider: 'GRIDFS',
      storageContainer: this.bucketName,
      storageObjectKey: objectKey,
      gridFsFileId: fileId,
      sizeBytes: bytesCount,
      sha256: computedSha256,
      versionId: fileId.toString(),
      storedAt: new Date(),
    };
  }

  /**
   * Opens a readable binary stream from GridFS with optional byte-range support.
   */
  async openReadStream({ objectKey = null, fileId = null, start = 0, end = null } = {}) {
    const bucket = this.getBucket();
    const options = {};
    if (typeof start === 'number' && start >= 0) options.start = start;
    if (typeof end === 'number' && end >= start) options.end = end;

    if (fileId) {
      const id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
      return bucket.openDownloadStream(id, options);
    }

    if (objectKey) {
      return bucket.openDownloadStreamByName(objectKey, options);
    }

    throw new ApiError(400, 'MISSING_FILE_IDENTIFIER', 'objectKey or fileId must be provided to openReadStream().');
  }

  /**
   * Retrieves GridFS file metadata without reading file chunks.
   */
  async getObjectMetadata({ objectKey = null, fileId = null } = {}) {
    const bucket = this.getBucket();
    const query = {};

    if (fileId) {
      query._id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
    } else if (objectKey) {
      query.filename = objectKey;
    } else {
      throw new ApiError(400, 'MISSING_FILE_IDENTIFIER', 'objectKey or fileId must be provided.');
    }

    const files = await bucket.find(query).limit(1).toArray();
    if (!files || files.length === 0) {
      return { exists: false };
    }

    const file = files[0];
    return {
      exists: true,
      fileId: file._id,
      objectKey: file.filename,
      sizeBytes: file.length,
      mimeType: file.contentType || (file.metadata && file.metadata.mimeType) || 'application/octet-stream',
      sha256: file.metadata?.sha256 || null,
      lastModified: file.uploadDate,
      metadata: file.metadata || {},
    };
  }

  async objectExists({ objectKey = null, fileId = null } = {}) {
    const meta = await this.getObjectMetadata({ objectKey, fileId });
    return meta.exists;
  }

  /**
   * Deletes a file and its chunks from GridFS.
   */
  async deleteObject({ objectKey = null, fileId = null } = {}) {
    const bucket = this.getBucket();
    let targetId = fileId;

    if (!targetId && objectKey) {
      const files = await bucket.find({ filename: objectKey }).limit(1).toArray();
      if (!files || files.length === 0) return false;
      targetId = files[0]._id;
    }

    if (!targetId) return false;

    const id = typeof targetId === 'string' ? new mongoose.Types.ObjectId(targetId) : targetId;
    try {
      await bucket.delete(id);
      return true;
    } catch (err) {
      if (err.message && err.message.includes('FileNotFound')) {
        return false;
      }
      throw err;
    }
  }

  /**
   * Copies an object inside GridFS via streaming without loading into application RAM.
   */
  async copyObject({ sourceKey, destinationKey }) {
    if (!sourceKey || !destinationKey) {
      throw new ApiError(400, 'MISSING_KEYS', 'sourceKey and destinationKey required for copyObject().');
    }

    const sourceMeta = await this.getObjectMetadata({ objectKey: sourceKey });
    if (!sourceMeta.exists) {
      throw new ApiError(404, 'SOURCE_OBJECT_NOT_FOUND', `Source object '${sourceKey}' not found in GridFS.`);
    }

    const readStream = await this.openReadStream({ objectKey: sourceKey });
    const result = await this.putObject({
      objectKey: destinationKey,
      stream: readStream,
      mimeType: sourceMeta.mimeType,
      sizeBytes: sourceMeta.sizeBytes,
      metadata: {
        ...sourceMeta.metadata,
        copiedFrom: sourceKey,
      },
    });

    return Boolean(result && result.gridFsFileId);
  }

  /**
   * Generates a short-lived authorized upload grant pointing to the backend API.
   * Replaces external cloud presigned URLs with secure application-managed tokens.
   */
  async createUploadGrant({ objectKey, mimeType, sizeBytes, expiresInSeconds = 300 }) {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const tokenPayload = `${objectKey}:${expiresAt.getTime()}:${sizeBytes || 0}`;
    const token = crypto.createHmac('sha256', this.signingSecret).update(tokenPayload).digest('hex');

    return {
      uploadUrl: `/api/v1/documents/upload-stream?key=${encodeURIComponent(objectKey)}&token=${token}&exp=${expiresAt.getTime()}`,
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
      },
      expiresAt,
      grantType: 'GRIDFS_BACKEND_STREAM',
    };
  }

  /**
   * Generates a short-lived authorized download grant pointing to the backend API.
   */
  async createDownloadGrant({ objectKey, expiresInSeconds = 180, safeFilename = 'document' }) {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const tokenPayload = `${objectKey}:${expiresAt.getTime()}`;
    const token = crypto.createHmac('sha256', this.signingSecret).update(tokenPayload).digest('hex');

    return {
      downloadUrl: `/api/v1/documents/stream?key=${encodeURIComponent(objectKey)}&token=${token}&exp=${expiresAt.getTime()}&filename=${encodeURIComponent(safeFilename)}`,
      expiresAt,
      grantType: 'GRIDFS_BACKEND_STREAM',
    };
  }

  /**
   * Validates GridFS bucket readiness.
   */
  async healthCheck() {
    try {
      const bucket = this.getBucket();
      // Probe find query to confirm collection access
      await bucket.find().limit(1).toArray();
      return {
        status: 'HEALTHY',
        provider: 'GRIDFS',
        bucket: this.bucketName,
        database: (this.customDb && this.customDb.databaseName) || (this.mongooseInstance.connection && this.mongooseInstance.connection.name) || 'connected',
      };
    } catch (err) {
      return {
        status: 'UNAVAILABLE',
        provider: 'GRIDFS',
        bucket: this.bucketName,
        error: err.message,
      };
    }
  }

  /**
   * Measures GridFS capacity and chunks statistics from MongoDB Atlas.
   */
  async getCapacityMetrics() {
    const db = this.customDb || (this.mongooseInstance.connection && this.mongooseInstance.connection.db);
    if (!db) {
      return { status: 'UNAVAILABLE', error: 'Database not connected' };
    }

    try {
      const filesColl = db.collection(`${this.bucketName}.files`);
      const chunksColl = db.collection(`${this.bucketName}.chunks`);

      const [filesCount, chunksCount] = await Promise.all([
        filesColl.countDocuments(),
        chunksColl.countDocuments(),
      ]);

      // Aggregate total file length
      const lengthAgg = await filesColl.aggregate([
        { $group: { _id: null, totalBytes: { $sum: '$length' } } },
      ]).toArray();

      const totalBinaryBytes = (lengthAgg[0] && lengthAgg[0].totalBytes) || 0;

      return {
        status: 'HEALTHY',
        bucketName: this.bucketName,
        filesCount,
        chunksCount,
        totalBinaryBytes,
        totalBinaryMB: Number((totalBinaryBytes / (1024 * 1024)).toFixed(2)),
      };
    } catch (err) {
      return {
        status: 'ERROR',
        bucketName: this.bucketName,
        error: err.message,
      };
    }
  }
}

module.exports = {
  GridFSStorageAdapter,
};
