'use strict';

/**
 * Enterprise Distributed Rate Limiter Abstraction
 * 
 * Supports:
 * - Multi-dimensional rate limit keying (IP, userId, deviceId, cafeId, organisationId, scope)
 * - Distributed backend (Redis / centralized store) when REDIS_URI / SHARED_STORE is provided
 * - High-speed in-memory store for single-instance local execution and testing
 * - Strict Separation of Security vs General Traffic Policies:
 *   * SECURITY_CRITICAL_POLICY: 'FAIL_CLOSED' / Restrictive shared protection on distributed outage
 *   * GENERAL_TRAFFIC_POLICY: 'DEGRADE_LOCAL_BOUNDED' with observable telemetry
 */

const SECURITY_CRITICAL_SCOPES = new Set([
  'LOGIN',
  'MFA',
  'PASSWORD_RECOVERY',
  'PIN',
  'MASTER',
  'DEVICE_ENROLLMENT',
  'SECURITY_ACTION',
  'AUTH',
]);

class DistributedRateLimiter {
  constructor(options = {}) {
    this.redisClient = options.redisClient || null;
    this.memoryStore = new Map();
    this.isDistributed = options.isDistributed !== undefined ? options.isDistributed : Boolean(this.redisClient);
    this.degraded = Boolean(options.degraded);
    this.securityFailurePolicy = options.securityFailurePolicy || 'FAIL_CLOSED'; // 'FAIL_CLOSED' | 'DEGRADE_LOCAL'
    this.generalFailurePolicy = options.generalFailurePolicy || 'DEGRADE_LOCAL_BOUNDED';
    this.forcedSecurityDegradation = false; // Testing hook for negative controls
  }

  setRedisClient(client) {
    this.redisClient = client;
    this.isDistributed = Boolean(client);
    this.degraded = false;
  }

  isSecurityScope(scope) {
    if (!scope) return false;
    return SECURITY_CRITICAL_SCOPES.has(String(scope).toUpperCase());
  }

  getHealth() {
    return {
      status: this.isDistributed ? (this.degraded ? 'degraded_local' : 'distributed') : 'local_memory',
      isDistributed: this.isDistributed && !this.degraded,
      activeKeysCount: this.memoryStore.size,
      securityFailurePolicy: this.securityFailurePolicy,
      generalFailurePolicy: this.generalFailurePolicy,
      forcedSecurityDegradation: this.forcedSecurityDegradation,
    };
  }

  formatKey({ organisationId = 'GLOBAL', cafeId = '*', deviceId = '*', userId = '*', ip = '*', scope = 'DEFAULT' }) {
    return `rl:${organisationId}:${cafeId}:${deviceId}:${userId}:${ip}:${scope}`;
  }

  /**
   * Evaluates if a key is locked / throttled.
   */
  async isLocked(keyParams, { maxAttempts = 5, windowMs = 900000, lockoutMs = 900000, now = new Date() } = {}) {
    const key = typeof keyParams === 'string' ? keyParams : this.formatKey(keyParams);
    const scope = typeof keyParams === 'object' ? keyParams.scope : (key.split(':').pop() || 'DEFAULT');
    const isSecurity = this.isSecurityScope(scope);

    if (this.isDistributed && this.redisClient && !this.degraded) {
      try {
        const raw = await this.redisClient.get(key);
        if (!raw) return { locked: false, retryAt: null, failures: 0 };
        const state = JSON.parse(raw);
        if (state.lockedUntil && now.getTime() < state.lockedUntil) {
          return { locked: true, retryAt: new Date(state.lockedUntil), failures: state.failures };
        }
        return { locked: false, retryAt: null, failures: state.failures || 0 };
      } catch (err) {
        console.warn(`[RateLimiter] Distributed store get failed: ${err.message}`);
        this.degraded = true;
      }
    }

    // Security Rate Limiter Cluster Failure Policy:
    // If running in distributed mode and distributed backend failed, security critical scopes
    // must NOT silently fall back to per-process counters unless explicitly forced (or in single-instance mode).
    if (this.isDistributed && (this.degraded || !this.redisClient) && isSecurity && !this.forcedSecurityDegradation) {
      if (this.securityFailurePolicy === 'FAIL_CLOSED') {
        return {
          locked: true,
          retryAt: new Date(now.getTime() + lockoutMs),
          failures: maxAttempts,
          reason: 'DISTRIBUTED_SECURITY_LIMITER_UNAVAILABLE',
        };
      }
    }

    const state = this.memoryStore.get(key) || { failures: 0, lockedUntil: null, firstFailureAt: null };
    if (state.lockedUntil && now.getTime() < state.lockedUntil.getTime()) {
      return { locked: true, retryAt: state.lockedUntil, failures: state.failures };
    }
    return { locked: false, retryAt: null, failures: state.failures };
  }

  /**
   * Records a failed attempt for a key.
   */
  async recordFailure(keyParams, { maxAttempts = 5, windowMs = 900000, lockoutMs = 900000, now = new Date() } = {}) {
    const key = typeof keyParams === 'string' ? keyParams : this.formatKey(keyParams);
    const scope = typeof keyParams === 'object' ? keyParams.scope : (key.split(':').pop() || 'DEFAULT');
    const isSecurity = this.isSecurityScope(scope);

    if (this.isDistributed && this.redisClient && !this.degraded) {
      try {
        const raw = await this.redisClient.get(key);
        let state = raw ? JSON.parse(raw) : { failures: 0, lockedUntil: null, firstFailureAt: null };
        const nowMs = now.getTime();

        if (!state.firstFailureAt || (nowMs - state.firstFailureAt > windowMs)) {
          state.firstFailureAt = nowMs;
          state.failures = 0;
        }

        state.failures += 1;
        if (state.failures >= maxAttempts) {
          state.lockedUntil = nowMs + lockoutMs;
        }

        const ttlSeconds = Math.ceil((lockoutMs + windowMs) / 1000);
        await this.redisClient.set(key, JSON.stringify(state), { EX: ttlSeconds });
        return {
          failures: state.failures,
          lockedUntil: state.lockedUntil ? new Date(state.lockedUntil) : null,
          locked: Boolean(state.lockedUntil && nowMs < state.lockedUntil),
        };
      } catch (err) {
        console.warn(`[RateLimiter] Distributed store update failed: ${err.message}`);
        this.degraded = true;
      }
    }

    if (this.isDistributed && (this.degraded || !this.redisClient) && isSecurity && !this.forcedSecurityDegradation) {
      if (this.securityFailurePolicy === 'FAIL_CLOSED') {
        return {
          failures: maxAttempts,
          lockedUntil: new Date(now.getTime() + lockoutMs),
          locked: true,
          reason: 'DISTRIBUTED_SECURITY_LIMITER_UNAVAILABLE',
        };
      }
    }

    let state = this.memoryStore.get(key) || { failures: 0, lockedUntil: null, firstFailureAt: null };
    const nowMs = now.getTime();

    if (!state.firstFailureAt || (nowMs - state.firstFailureAt.getTime() > windowMs)) {
      state.firstFailureAt = now;
      state.failures = 0;
    }

    state.failures += 1;
    if (state.failures >= maxAttempts) {
      state.lockedUntil = new Date(nowMs + lockoutMs);
    }

    this.memoryStore.set(key, state);
    return {
      failures: state.failures,
      lockedUntil: state.lockedUntil,
      locked: Boolean(state.lockedUntil && nowMs < state.lockedUntil.getTime()),
    };
  }

  /**
   * Resets / clears failure state on successful authentication.
   */
  async recordSuccess(keyParams) {
    const key = typeof keyParams === 'string' ? keyParams : this.formatKey(keyParams);

    if (this.isDistributed && this.redisClient && !this.degraded) {
      try {
        await this.redisClient.del(key);
      } catch (err) {
        this.degraded = true;
      }
    }

    this.memoryStore.delete(key);
  }

  /**
   * Clear all records (testing utility).
   */
  async reset() {
    this.memoryStore.clear();
    this.degraded = false;
    this.forcedSecurityDegradation = false;
  }
}

const defaultLimiter = new DistributedRateLimiter();

module.exports = {
  DistributedRateLimiter,
  defaultLimiter,
  SECURITY_CRITICAL_SCOPES,
};
