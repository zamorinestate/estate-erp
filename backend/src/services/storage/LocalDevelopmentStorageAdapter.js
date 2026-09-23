'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { DocumentStorageProvider } = require('./DocumentStorageProvider');
const { ApiError } = require('../../utils/ApiError');

/**
 * ZAMORIN CAFÉ ERP — LOCAL DEVELOPMENT STORAGE ADAPTER
 * 
 * Permitted ONLY for local development and isolated automated testing.
 * Strictly forbidden from serving as production canonical document storage.
 * In production (NODE_ENV === 'production'), it FAILS CLOSED immediately.
 */

class LocalDevelopmentStorageAdapter extends DocumentStorageProvider {
  constructor(options = {}) {
    super('LocalDevelopmentStorageAdapter');
    this.storageRoot = options.storageRoot || process.env.DOCUMENT_STORAGE_ROOT || path.join(os.tmpdir(), 'zamorin_dev_documents');
    this.signingSecret = options.signingSecret || process.env.JWT_SECRET || 'dev-grant-signing-secret-zamorin-1234';
  }

  getResolvedRoot() {
    return path.resolve(this.storageRoot);
  }

  validateConfiguration(env = process.env) {
    if (env.NODE_ENV === 'production') {
      throw new ApiError(
        500,
        'PROD_EPHEMERAL_STORAGE_DISALLOWED',
        'Local filesystem storage is strictly prohibited in production. Private durable external object storage (S3 / Cloudflare R2 / MinIO) is mandatory.'
      );
    }
    const root = this.getResolvedRoot();
    try {
      fs.mkdirSync(root, { recursive: true });
      const probe = path.join(root, `.probe-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.tmp`);
      fs.writeFileSync(probe, 'DURABLE_PROBE', 'utf8');
      fs.unlinkSync(probe);
      return true;
    } catch (err) {
      throw new ApiError(500, 'DOCUMENT_STORAGE_UNAVAILABLE', `Cannot initialize local development storage directory (${root}): ${err.message}`);
    }
  }

  async putObject({ objectKey, stream = null, buffer = null, filePath = null, mimeType = 'application/octet-stream', sizeBytes = 0, metadata = {} }) {
    if (!objectKey) {
      throw new ApiError(400, 'MISSING_STORAGE_KEY', 'Storage key is required for document persistence.');
    }
    this.validateConfiguration();

    const root = this.getResolvedRoot();
    const destPath = path.join(root, objectKey);
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

    let finalSizeBytes = sizeBytes;
    let computedSha256 = null;

    if (filePath) {
      await fs.promises.copyFile(filePath, destPath);
      const stat = await fs.promises.stat(destPath);
      finalSizeBytes = stat.size;
      const fileBuf = await fs.promises.readFile(destPath);
      computedSha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');
    } else if (buffer) {
      await fs.promises.writeFile(destPath, buffer);
      finalSizeBytes = buffer.length;
      computedSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    } else if (stream) {
      const hash = crypto.createHash('sha256');
      let bytesCount = 0;
      await new Promise((resolve, reject) => {
        const ws = fs.createWriteStream(destPath);
        stream.on('data', (chunk) => {
          hash.update(chunk);
          bytesCount += chunk.length;
        });
        stream.pipe(ws);
        ws.on('finish', resolve);
        ws.on('error', reject);
      });
      finalSizeBytes = bytesCount;
      computedSha256 = hash.digest('hex');
    } else {
      throw new ApiError(400, 'NO_PAYLOAD_PROVIDED', 'A stream, buffer, or filePath must be provided to putObject().');
    }

    return {
      storageProvider: 'LOCAL_DEV',
      storageContainer: 'local-disk',
      storageObjectKey: objectKey,
      storageRegion: 'local',
      sizeBytes: finalSizeBytes,
      sha256: computedSha256,
      versionId: '1',
      storedAt: new Date(),
    };
  }

  async getObjectMetadata({ objectKey }) {
    if (!objectKey) throw new ApiError(400, 'MISSING_STORAGE_KEY', 'Storage key is required.');
    const fullPath = path.join(this.getResolvedRoot(), objectKey);
    if (!fs.existsSync(fullPath)) {
      return { exists: false };
    }
    const stat = await fs.promises.stat(fullPath);
    return {
      exists: true,
      sizeBytes: stat.size,
      lastModified: stat.mtime,
      storageObjectKey: objectKey,
    };
  }

  async openReadStream({ objectKey }) {
    if (!objectKey) throw new ApiError(400, 'MISSING_STORAGE_KEY', 'Storage key is required.');
    const fullPath = path.join(this.getResolvedRoot(), objectKey);
    if (!fs.existsSync(fullPath)) {
      throw new ApiError(404, 'STORAGE_OBJECT_NOT_FOUND', `Object not found: ${objectKey}`);
    }
    return fs.createReadStream(fullPath);
  }

  async deleteObject({ objectKey }) {
    if (!objectKey) return false;
    const fullPath = path.join(this.getResolvedRoot(), objectKey);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath).catch(() => {});
      return true;
    }
    return false;
  }

  async copyObject({ sourceKey, destinationKey }) {
    if (!sourceKey || !destinationKey) {
      throw new ApiError(400, 'MISSING_PARAMETERS', 'sourceKey and destinationKey are required.');
    }
    const root = this.getResolvedRoot();
    const srcPath = path.join(root, sourceKey);
    const dstPath = path.join(root, destinationKey);

    if (!fs.existsSync(srcPath)) {
      throw new ApiError(404, 'SOURCE_OBJECT_NOT_FOUND', `Source object ${sourceKey} does not exist.`);
    }
    await fs.promises.mkdir(path.dirname(dstPath), { recursive: true });
    await fs.promises.copyFile(srcPath, dstPath);
    return true;
  }

  async createUploadGrant({ objectKey, mimeType, sizeBytes, expiresInSeconds = 300 }) {
    if (!objectKey) throw new ApiError(400, 'MISSING_STORAGE_KEY', 'Storage key required.');
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const token = crypto
      .createHmac('sha256', this.signingSecret)
      .update(`upload:${objectKey}:${expiresAt.getTime()}`)
      .digest('hex');

    return {
      uploadUrl: `/api/v1/documents/direct-upload/${encodeURIComponent(objectKey)}?grantToken=${token}&exp=${expiresAt.getTime()}`,
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
      },
      expiresAt,
      grantType: 'LOCAL_DEV_SIGNED_URL',
    };
  }

  async createDownloadGrant({ objectKey, expiresInSeconds = 180, safeFilename = 'document' }) {
    if (!objectKey) throw new ApiError(400, 'MISSING_STORAGE_KEY', 'Storage key required.');
    const exists = await this.objectExists({ objectKey });
    if (!exists) {
      throw new ApiError(404, 'STORAGE_OBJECT_NOT_FOUND', `Storage object ${objectKey} not found.`);
    }

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const token = crypto
      .createHmac('sha256', this.signingSecret)
      .update(`download:${objectKey}:${expiresAt.getTime()}`)
      .digest('hex');

    return {
      downloadUrl: `/api/v1/documents/direct-download/${encodeURIComponent(objectKey)}?grantToken=${token}&exp=${expiresAt.getTime()}&filename=${encodeURIComponent(safeFilename)}`,
      expiresAt,
      grantType: 'LOCAL_DEV_SIGNED_GRANT',
    };
  }

  async objectExists({ objectKey }) {
    if (!objectKey) return false;
    const fullPath = path.join(this.getResolvedRoot(), objectKey);
    return fs.existsSync(fullPath);
  }

  async healthCheck() {
    try {
      this.validateConfiguration();
      const root = this.getResolvedRoot();
      return {
        status: 'OK',
        provider: 'LOCAL_DEV',
        storageRoot: root,
      };
    } catch (err) {
      return {
        status: 'UNAVAILABLE',
        provider: 'LOCAL_DEV',
        message: err.message,
      };
    }
  }
}

module.exports = {
  LocalDevelopmentStorageAdapter,
};
