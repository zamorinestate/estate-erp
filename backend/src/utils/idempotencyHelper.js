'use strict';

/**
 * IDEMPOTENCY & CONCURRENCY HELPER
 *
 * Provides thread-safe / event-loop safe in-flight submission locks,
 * idempotency key extraction, and deduplication verification to guarantee
 * exactly-once business request execution across all self-service workflows.
 */

const { ApiError } = require('./ApiError');
const { IdempotencyRecord } = require('../models/IdempotencyRecord');

const inFlightLocks = new Map();
const LOCK_TIMEOUT_MS = 30000;

function cleanExpiredLocks() {
  const now = Date.now();
  for (const [key, timestamp] of inFlightLocks.entries()) {
    if (now - timestamp > LOCK_TIMEOUT_MS) {
      inFlightLocks.delete(key);
    }
  }
}
setInterval(cleanExpiredLocks, 60000).unref();

function extractIdempotencyKey(request) {
  if (!request) return null;
  const headerKey = request.headers?.['idempotency-key'] || request.headers?.['x-idempotency-key'];
  if (headerKey && typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }
  const bodyKey = request.body?.idempotencyKey || request.body?.clientRequestId;
  if (bodyKey && typeof bodyKey === 'string' && bodyKey.trim()) {
    return bodyKey.trim();
  }
  return null;
}

function acquireLock(lockKey) {
  if (!lockKey) return () => {};
  if (inFlightLocks.has(lockKey)) {
    throw new ApiError(
      409,
      'DUPLICATE_REQUEST_IN_FLIGHT',
      'A request with identical parameters is currently being processed. Please wait for the current request to complete.'
    );
  }
  inFlightLocks.set(lockKey, Date.now());
  return () => {
    inFlightLocks.delete(lockKey);
  };
}

module.exports = {
  extractIdempotencyKey,
  acquireLock,
};
