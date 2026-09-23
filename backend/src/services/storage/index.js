'use strict';

const { DocumentStorageProvider } = require('./DocumentStorageProvider');
const { GridFSStorageAdapter } = require('./GridFSStorageAdapter');
const { S3CompatibleStorageAdapter } = require('./S3CompatibleStorageAdapter');
const { LocalDevelopmentStorageAdapter } = require('./LocalDevelopmentStorageAdapter');
const { ApiError } = require('../../utils/ApiError');

/**
 * ZAMORIN CAFÉ ERP — STORAGE PROVIDER FACTORY
 * 
 * Selects and instantiates the canonical document storage provider.
 * Enforces production invariants:
 * - Local filesystem storage is prohibited in production.
 * - MongoDB Atlas GridFS is the canonical production document store.
 */

function createStorageProvider(options = {}, env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const driver = (options.driver || env.DOCUMENT_STORAGE_PROVIDER || env.DOCUMENT_STORAGE_DRIVER || (isProd ? 'gridfs' : 'local')).toLowerCase();

  if (isProd && (driver === 'local' || driver === 'render_persistent_disk')) {
    if (!options.allowLocalInProdForTesting) {
      throw new ApiError(
        500,
        'PROD_EPHEMERAL_STORAGE_DISALLOWED',
        'Production canonical business documents must use MongoDB Atlas GridFS. Ephemeral and local container filesystems are strictly disallowed.'
      );
    }
  }

  if (driver === 'gridfs' || driver === 'mongodb_gridfs' || driver === 'mongodb') {
    const adapter = new GridFSStorageAdapter(options);
    adapter.validateConfiguration(env);
    return adapter;
  }

  if (driver === 's3' || driver === 's3_compatible' || driver === 'private_object_storage') {
    const adapter = new S3CompatibleStorageAdapter(options);
    adapter.validateConfiguration(env);
    return adapter;
  }

  if (driver === 'local' || driver === 'local_dev' || driver === 'render_persistent_disk') {
    const adapter = new LocalDevelopmentStorageAdapter(options);
    adapter.validateConfiguration(env);
    return adapter;
  }

  throw new ApiError(500, 'UNSUPPORTED_STORAGE_PROVIDER', `Unsupported document storage driver: ${driver}`);
}

module.exports = {
  DocumentStorageProvider,
  GridFSStorageAdapter,
  S3CompatibleStorageAdapter,
  LocalDevelopmentStorageAdapter,
  createStorageProvider,
};
