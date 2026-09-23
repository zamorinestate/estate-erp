'use strict';

/**
 * ZAMORIN CAFÉ ERP — CANONICAL DOCUMENT STORAGE PROVIDER INTERFACE
 * 
 * Provider-agnostic abstraction for durable business document storage.
 * Decouples ERP business logic from specific cloud storage vendors
 * (AWS S3, Cloudflare R2, MinIO, Azure Blob, Google Cloud Storage).
 */

class DocumentStorageProvider {
  constructor(name = 'AbstractProvider') {
    this.name = name;
  }

  /**
   * Stores binary content into external durable object storage.
   * @param {Object} params
   * @param {string} params.objectKey - Canonical opaque tenant-scoped object key
   * @param {ReadableStream} [params.stream] - Data stream
   * @param {Buffer} [params.buffer] - Data buffer
   * @param {string} [params.filePath] - Staged file path
   * @param {string} params.mimeType - Normalized MIME type
   * @param {number} params.sizeBytes - Byte size
   * @param {Object} [params.metadata] - Generic non-PII metadata
   * @returns {Promise<{ storageProvider: string, storageObjectKey: string, sizeBytes: number, sha256?: string, versionId?: string, storedAt: Date }>}
   */
  async putObject(_params) {
    throw new Error(`[DocumentStorageProvider] putObject() must be implemented by ${this.name}`);
  }

  /**
   * Retrieves metadata for a stored object without reading file body.
   * @param {Object} params
   * @param {string} params.objectKey
   * @returns {Promise<{ exists: boolean, sizeBytes?: number, mimeType?: string, lastModified?: Date, etag?: string, versionId?: string }>}
   */
  async getObjectMetadata(_params) {
    throw new Error(`[DocumentStorageProvider] getObjectMetadata() must be implemented by ${this.name}`);
  }

  /**
   * Opens a readable binary stream for the specified object.
   * @param {Object} params
   * @param {string} params.objectKey
   * @returns {Promise<ReadableStream>}
   */
  async openReadStream(_params) {
    throw new Error(`[DocumentStorageProvider] openReadStream() must be implemented by ${this.name}`);
  }

  /**
   * Deletes an object from storage.
   * @param {Object} params
   * @param {string} params.objectKey
   * @returns {Promise<boolean>}
   */
  async deleteObject(_params) {
    throw new Error(`[DocumentStorageProvider] deleteObject() must be implemented by ${this.name}`);
  }

  /**
   * Copies an object from sourceKey to destinationKey (e.g. for quarantine promotion or immutable versions).
   * @param {Object} params
   * @param {string} params.sourceKey
   * @param {string} params.destinationKey
   * @returns {Promise<boolean>}
   */
  async copyObject(_params) {
    throw new Error(`[DocumentStorageProvider] copyObject() must be implemented by ${this.name}`);
  }

  /**
   * Creates a short-lived, single-use upload grant (e.g. presigned PUT URL).
   * @param {Object} params
   * @param {string} params.objectKey
   * @param {string} params.mimeType
   * @param {number} params.sizeBytes
   * @param {number} [params.expiresInSeconds=300]
   * @returns {Promise<{ uploadUrl: string, method: string, headers: Object, expiresAt: Date, grantType: string }>}
   */
  async createUploadGrant(_params) {
    throw new Error(`[DocumentStorageProvider] createUploadGrant() must be implemented by ${this.name}`);
  }

  /**
   * Creates a short-lived signed download grant after authorization.
   * @param {Object} params
   * @param {string} params.objectKey
   * @param {number} [params.expiresInSeconds=180]
   * @param {string} [params.safeFilename]
   * @returns {Promise<{ downloadUrl: string, expiresAt: Date, grantType: string }>}
   */
  async createDownloadGrant(_params) {
    throw new Error(`[DocumentStorageProvider] createDownloadGrant() must be implemented by ${this.name}`);
  }

  /**
   * Verifies if an object exists in storage.
   * @param {Object} params
   * @param {string} params.objectKey
   * @returns {Promise<boolean>}
   */
  async objectExists(_params) {
    throw new Error(`[DocumentStorageProvider] objectExists() must be implemented by ${this.name}`);
  }

  /**
   * Diagnostic probe for storage provider health.
   * @returns {Promise<{ status: 'OK'|'DEGRADED'|'UNAVAILABLE', provider: string, details?: any }>}
   */
  async healthCheck() {
    throw new Error(`[DocumentStorageProvider] healthCheck() must be implemented by ${this.name}`);
  }

  /**
   * Validates configuration at application startup. Fails closed if invalid.
   * @param {Object} env
   */
  validateConfiguration(_env) {
    throw new Error(`[DocumentStorageProvider] validateConfiguration() must be implemented by ${this.name}`);
  }
}

module.exports = {
  DocumentStorageProvider,
};
