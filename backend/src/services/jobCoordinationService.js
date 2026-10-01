'use strict';

/**
 * Enterprise Distributed Job Coordination & Mutual Exclusion Lock Service
 * 
 * Guarantees that scheduled cron jobs, payroll executions, retention cleanups,
 * and bulk notifications are executed by exactly one worker instance in a cluster.
 * 
 * Features:
 * - Distributed mutex lease locking (Redis or Mongo lock collection or Memory)
 * - Automatic TTL expiration to prevent deadlocks if a node terminates abruptly
 * - Monotonically increasing Fencing Tokens to protect against stale workers committing after lease expiry
 * - Lock extension (heartbeat) during long tasks
 * - Idempotency key tracking
 * - Atomic safe release (only release if owner matches)
 */

class JobCoordinationService {
  constructor(options = {}) {
    this.redisClient = options.redisClient || null;
    this.localLocks = new Map(); // key -> { owner, expiresAt, fencingToken }
    this.idempotencyLedger = new Map(); // key -> { result, timestamp, fencingToken }
    this.fencingCounter = 0;
    this.metrics = {
      locksAcquired: 0,
      locksDenied: 0,
      locksReleased: 0,
      locksExtended: 0,
      staleCommitsBlocked: 0,
      idempotentExecutionsSkipped: 0,
    };
  }

  setRedisClient(client) {
    this.redisClient = client;
  }

  _generateFencingToken() {
    // Local-only fallback token. Keep it inside Number.MAX_SAFE_INTEGER rather
    // than multiplying Date.now() into an unsafe JavaScript integer.
    this.fencingCounter += 1;
    if (!Number.isSafeInteger(this.fencingCounter) || this.fencingCounter >= Number.MAX_SAFE_INTEGER) {
      this.fencingCounter = 1;
    }
    return this.fencingCounter;
  }

  _redisCoordinationError(operation, error) {
    const wrapped = new Error(
      `Redis job coordination failed during ${operation}: ${String(error?.message || error || 'unknown error')}`
    );
    wrapped.code = 'REDIS_JOB_COORDINATION_FAILED';
    wrapped.operation = operation;
    wrapped.cause = error;
    return wrapped;
  }

  /**
   * Attempts to acquire an exclusive lock for a job name.
   * @param {string} jobName - Unique job identifier.
   * @param {string} ownerId - Unique identifier of the requesting instance/worker.
   * @param {number} ttlMs - Lock lease duration in milliseconds (default: 60s).
   * @returns {Promise<{ acquired: boolean, fencingToken: number|null }>} 
   */
  async acquireLock(jobName, ownerId = `inst-${process.pid}`, ttlMs = 60000) {
    const lockKey = `lock:job:${jobName}`;
    const fencingKey = `lock:fencing:${jobName}`;
    const now = Date.now();
    let fencingToken = this._generateFencingToken();

    if (this.redisClient) {
      try {
        // Redis owns the distributed fencing sequence. Tokens may be consumed
        // by failed contenders; monotonicity is what matters.
        fencingToken = await this.redisClient.incr(fencingKey);
        const payload = JSON.stringify({ ownerId, fencingToken, acquiredAt: now });
        const result = await this.redisClient.set(lockKey, payload, {
          NX: true,
          PX: ttlMs,
        });
        if (result === 'OK' || result === true) {
          this.metrics.locksAcquired++;
          return { acquired: true, fencingToken };
        }
        this.metrics.locksDenied++;
        return { acquired: false, fencingToken: null };
      } catch (err) {
        // A configured Redis dependency must never degrade into per-process
        // locking: that would permit multiple cluster instances to execute the
        // same supposedly-exclusive job.
        throw this._redisCoordinationError('acquireLock', err);
      }
    }

    const existing = this.localLocks.get(lockKey);
    if (existing && existing.expiresAt > now && existing.owner !== ownerId) {
      this.metrics.locksDenied++;
      return { acquired: false, fencingToken: null };
    }

    this.localLocks.set(lockKey, { owner: ownerId, expiresAt: now + ttlMs, fencingToken });
    this.metrics.locksAcquired++;
    return { acquired: true, fencingToken };
  }

  /**
   * Extends the lease duration for an actively held lock.
   */
  async extendLock(jobName, ownerId = `inst-${process.pid}`, additionalTtlMs = 60000) {
    const lockKey = `lock:job:${jobName}`;
    const now = Date.now();

    if (this.redisClient) {
      try {
        const lua = `
          local raw = redis.call("get", KEYS[1])
          if raw then
            local data = cjson.decode(raw)
            if data.ownerId == ARGV[1] then
              return redis.call("pexpire", KEYS[1], ARGV[2])
            end
          end
          return 0
        `;
        const res = await this.redisClient.eval(lua, {
          keys: [lockKey],
          arguments: [String(ownerId), String(additionalTtlMs)],
        });
        if (Number(res) === 1) {
          this.metrics.locksExtended++;
          return true;
        }
        return false;
      } catch (err) {
        throw this._redisCoordinationError('extendLock', err);
      }
    }

    const existing = this.localLocks.get(lockKey);
    if (existing && existing.owner === ownerId && existing.expiresAt > now) {
      existing.expiresAt = now + additionalTtlMs;
      this.metrics.locksExtended++;
      return true;
    }
    return false;
  }

  /**
   * Verifies if a fencing token is still authoritative (has not been superseded by a newer worker).
   */
  async verifyFencingToken(jobName, ownerId, fencingToken) {
    const lockKey = `lock:job:${jobName}`;
    const now = Date.now();

    if (this.redisClient) {
      try {
        const raw = await this.redisClient.get(lockKey);
        if (!raw) {
          this.metrics.staleCommitsBlocked++;
          return false;
        }
        const data = JSON.parse(raw);
        if (data.ownerId === ownerId && data.fencingToken === fencingToken) {
          return true;
        }
        this.metrics.staleCommitsBlocked++;
        return false;
      } catch (err) {
        throw this._redisCoordinationError('verifyFencingToken', err);
      }
    }

    const existing = this.localLocks.get(lockKey);
    if (existing && existing.owner === ownerId && existing.fencingToken === fencingToken && existing.expiresAt > now) {
      return true;
    }
    this.metrics.staleCommitsBlocked++;
    return false;
  }

  /**
   * Releases an exclusive lock safely using owner verification.
   */
  async releaseLock(jobName, ownerId = `inst-${process.pid}`) {
    const lockKey = `lock:job:${jobName}`;

    if (this.redisClient) {
      try {
        const lua = `
          local raw = redis.call("get", KEYS[1])
          if raw then
            local data = cjson.decode(raw)
            if data.ownerId == ARGV[1] then
              return redis.call("del", KEYS[1])
            end
          end
          return 0
        `;
        const released = await this.redisClient.eval(lua, {
          keys: [lockKey],
          arguments: [String(ownerId)],
        });
        if (Number(released) === 1) {
          this.metrics.locksReleased++;
          return true;
        }
        return false;
      } catch (err) {
        throw this._redisCoordinationError('releaseLock', err);
      }
    }

    const existing = this.localLocks.get(lockKey);
    if (existing && existing.owner === ownerId) {
      this.localLocks.delete(lockKey);
      this.metrics.locksReleased++;
      return true;
    }
    return false;
  }

  /**
   * Wraps a background job with distributed lock acquisition, fencing protection, and release.
   */
  async runExclusive(jobName, taskFn, { ttlMs = 60000, ownerId = `inst-${process.pid}` } = {}) {
    const { acquired, fencingToken } = await this.acquireLock(jobName, ownerId, ttlMs);
    if (!acquired) {
      return { executed: false, reason: 'LOCKED_BY_ANOTHER_INSTANCE', fencingToken: null };
    }

    try {
      // Pass fencing token and lease verification hook to taskFn
      const context = {
        fencingToken,
        verifyAuthority: () => this.verifyFencingToken(jobName, ownerId, fencingToken),
      };
      const result = await taskFn(context);
      return { executed: true, result, fencingToken };
    } finally {
      await this.releaseLock(jobName, ownerId);
    }
  }

  /**
   * Idempotency execution check for high-value write actions.
   */
  async executeIdempotent(idempotencyKey, executeFn, ttlMs = 86400000) {
    if (!idempotencyKey) {
      return executeFn();
    }

    const key = `idempotency:${idempotencyKey}`;
    const now = Date.now();

    if (this.redisClient) {
      try {
        const raw = await this.redisClient.get(key);
        if (raw) {
          this.metrics.idempotentExecutionsSkipped++;
          return JSON.parse(raw);
        }
      } catch (err) {
        throw this._redisCoordinationError('executeIdempotent.read', err);
      }
    }

    if (this.idempotencyLedger.has(key)) {
      const entry = this.idempotencyLedger.get(key);
      if (now - entry.timestamp < ttlMs) {
        this.metrics.idempotentExecutionsSkipped++;
        return entry.result;
      }
    }

    const result = await executeFn();
    this.idempotencyLedger.set(key, { result, timestamp: now });

    if (this.redisClient) {
      try {
        await this.redisClient.set(key, JSON.stringify(result), {
          EX: Math.ceil(ttlMs / 1000),
        });
      } catch (err) {
        const wrapped = this._redisCoordinationError('executeIdempotent.write', err);
        wrapped.operationMayHaveExecuted = true;
        throw wrapped;
      }
    }

    return result;
  }

  getMetrics() {
    return {
      ...this.metrics,
      activeLocalLocksCount: this.localLocks.size,
      idempotencyEntriesCount: this.idempotencyLedger.size,
      isDistributed: Boolean(this.redisClient),
    };
  }

  reset() {
    this.localLocks.clear();
    this.idempotencyLedger.clear();
    this.metrics = {
      locksAcquired: 0,
      locksDenied: 0,
      locksReleased: 0,
      locksExtended: 0,
      staleCommitsBlocked: 0,
      idempotentExecutionsSkipped: 0,
    };
  }
}

const defaultJobCoordinator = new JobCoordinationService();

module.exports = {
  JobCoordinationService,
  defaultJobCoordinator,
};
