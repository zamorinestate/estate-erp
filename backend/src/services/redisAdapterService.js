'use strict';

/**
 * Enterprise Production Redis Adapter Suite
 * 
 * Provides unified, production-ready distributed primitives for:
 * 1. Distributed Rate Limiting (Atomic sliding window with Redis Sorted Sets / Lua)
 * 2. Realtime Pub/Sub Event Bus (Cluster-wide security broadcasts & invalidations)
 * 3. Ephemeral Device Presence (TTL-based presence tracking with O(1) reads)
 * 4. Distributed Job Mutex & Fencing (Safe owner release via Lua, monotonic fencing counter, lease renewal)
 * 
 * Peer Dependency: official node-redis client (when deployed to production cluster).
 */

const LUA_SCRIPTS = {
  // Sliding window rate limiter script
  SLIDING_WINDOW_LIMITER: `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local windowMs = tonumber(ARGV[2])
    local maxRequests = tonumber(ARGV[3])
    local clearBefore = now - windowMs

    redis.call('ZREMRANGEBYSCORE', key, 0, clearBefore)
    local currentCount = redis.call('ZCARD', key)

    if currentCount < maxRequests then
      redis.call('ZADD', key, now, tostring(now) .. '-' .. tostring(math.random(1000, 9999)))
      redis.call('PEXPIRE', key, windowMs)
      return { 1, maxRequests - currentCount - 1, math.floor(windowMs / 1000) }
    else
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local resetMs = windowMs
      if oldest and oldest[2] then
        resetMs = math.max(0, math.floor((tonumber(oldest[2]) + windowMs - now) / 1000))
      end
      return { 0, 0, resetMs }
    end
  `,

  // Safe distributed mutex release (only owner can delete lock)
  SAFE_LOCK_RELEASE: `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `,

  // Safe distributed mutex lease extension (only owner can extend)
  SAFE_LOCK_EXTEND: `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("pexpire", KEYS[1], tonumber(ARGV[2]))
    else
      return 0
    end
  `,
};

class RedisAdapterService {
  constructor(options = {}) {
    this.client = options.client || null;
    this.subscriberClient = options.subscriberClient || null;
    this.keyPrefix = options.keyPrefix || 'zamorin:';
  }

  /**
   * Validates Redis cluster configuration parameters.
   */
  static validateConfiguration(config = {}) {
    const errors = [];
    if (!config.host && !config.url && !config.sentinels) {
      errors.push('Redis connection configuration must specify host, url, or sentinels');
    }
    if (config.port && (typeof config.port !== 'number' || config.port < 1 || config.port > 65535)) {
      errors.push('Redis port must be a valid integer between 1 and 65535');
    }
    return {
      isValid: errors.length === 0,
      errors,
      validatedConfig: {
        host: config.host || '127.0.0.1',
        port: config.port || 6379,
        keyPrefix: config.keyPrefix || 'zamorin:',
        connectTimeout: config.connectTimeout || 5000,
        maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
        clusterMode: Boolean(config.clusterMode),
      },
    };
  }

  // --- 1. Distributed Rate Limiter ---
  async checkRateLimit(scope, identifier, limit, windowMs) {
    if (!this.client) {
      throw new Error('REDIS_CLIENT_NOT_INITIALIZED');
    }
    const key = `${this.keyPrefix}rl:${scope}:${identifier}`;
    const now = Date.now();

    const [allowed, remaining, resetAfterSeconds] = await this.client.eval(
      LUA_SCRIPTS.SLIDING_WINDOW_LIMITER,
      {
        keys: [key],
        arguments: [String(now), String(windowMs), String(limit)],
      }
    );

    return {
      allowed: Boolean(allowed === 1),
      remaining: Number(remaining),
      resetAfterSeconds: Number(resetAfterSeconds),
      limit,
      windowMs,
    };
  }

  // --- 2. Realtime Event Bus Pub/Sub ---
  async publishEvent(topic, eventEnvelope) {
    if (!this.client) {
      throw new Error('REDIS_CLIENT_NOT_INITIALIZED');
    }
    const channel = `${this.keyPrefix}events:${topic}`;
    const payloadStr = typeof eventEnvelope === 'string' ? eventEnvelope : JSON.stringify(eventEnvelope);
    return this.client.publish(channel, payloadStr);
  }

  async subscribeTopic(topic, callback) {
    if (!this.subscriberClient) {
      throw new Error('REDIS_SUBSCRIBER_NOT_INITIALIZED');
    }
    const channel = `${this.keyPrefix}events:${topic}`;
    await this.subscriberClient.subscribe(channel, (msg) => {
      try {
        callback(JSON.parse(msg));
      } catch (_) {
        callback(msg);
      }
    });
  }

  // --- 3. Ephemeral Device Presence ---
  async recordDeviceHeartbeat(deviceId, payload = {}, ttlSeconds = 60) {
    if (!this.client) {
      throw new Error('REDIS_CLIENT_NOT_INITIALIZED');
    }
    const organisationId = String(payload.organisationId || '').trim().toUpperCase();
    const cafeId = String(payload.cafeId || 'GLOBAL').trim().toUpperCase() || 'GLOBAL';
    const normalizedDeviceId = String(deviceId || '').trim().toUpperCase();
    if (!organisationId || !normalizedDeviceId) {
      throw new Error('REDIS_PRESENCE_SCOPE_REQUIRED');
    }
    const key = `${this.keyPrefix}presence:${organisationId}:${cafeId}:${normalizedDeviceId}`;
    const data = {
      ...payload,
      organisationId,
      cafeId,
      deviceId: normalizedDeviceId,
      lastHeartbeat: new Date().toISOString(),
    };
    return this.client.set(key, JSON.stringify(data), { EX: ttlSeconds });
  }

  async getDevicePresence(deviceId, { organisationId, cafeId = 'GLOBAL' } = {}) {
    if (!this.client) {
      throw new Error('REDIS_CLIENT_NOT_INITIALIZED');
    }
    const org = String(organisationId || '').trim().toUpperCase();
    const cafe = String(cafeId || 'GLOBAL').trim().toUpperCase() || 'GLOBAL';
    const normalizedDeviceId = String(deviceId || '').trim().toUpperCase();
    if (!org || !normalizedDeviceId) {
      throw new Error('REDIS_PRESENCE_SCOPE_REQUIRED');
    }
    const key = `${this.keyPrefix}presence:${org}:${cafe}:${normalizedDeviceId}`;
    const raw = await this.client.get(key);
    if (!raw) return { isOnline: false };
    return {
      isOnline: true,
      ...JSON.parse(raw),
    };
  }

  // --- 4. Distributed Job Mutex & Fencing ---
  async acquireJobLock(jobName, ownerId, ttlMs = 30000) {
    if (!this.client) {
      throw new Error('REDIS_CLIENT_NOT_INITIALIZED');
    }
    const lockKey = `${this.keyPrefix}locks:${jobName}`;
    const fenceKey = `${this.keyPrefix}fence:${jobName}`;

    // Atomically increment fencing counter
    const fencingToken = await this.client.incr(fenceKey);

    // Atomically acquire mutex with ownerId
    const acquired = await this.client.set(lockKey, ownerId, { PX: ttlMs, NX: true });

    if (acquired === 'OK' || acquired === true) {
      return {
        acquired: true,
        jobName,
        ownerId,
        fencingToken,
        ttlMs,
        expiresAt: new Date(Date.now() + ttlMs),
      };
    }

    return {
      acquired: false,
      jobName,
      ownerId,
      fencingToken: null,
    };
  }

  async releaseJobLock(jobName, ownerId) {
    if (!this.client) {
      throw new Error('REDIS_CLIENT_NOT_INITIALIZED');
    }
    const lockKey = `${this.keyPrefix}locks:${jobName}`;
    const released = await this.client.eval(LUA_SCRIPTS.SAFE_LOCK_RELEASE, { keys: [lockKey], arguments: [String(ownerId)] });
    return Boolean(released === 1);
  }

  async extendJobLock(jobName, ownerId, ttlMs = 30000) {
    if (!this.client) {
      throw new Error('REDIS_CLIENT_NOT_INITIALIZED');
    }
    const lockKey = `${this.keyPrefix}locks:${jobName}`;
    const extended = await this.client.eval(LUA_SCRIPTS.SAFE_LOCK_EXTEND, { keys: [lockKey], arguments: [String(ownerId), String(ttlMs)] });
    return Boolean(extended === 1);
  }

  // --- Health Check ---
  async checkHealth() {
    if (!this.client) {
      return { status: 'DISCONNECTED', isReady: false };
    }
    try {
      const pong = await this.client.ping();
      return {
        status: 'CONNECTED',
        isReady: pong === 'PONG',
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        status: 'ERROR',
        isReady: false,
        error: err.message,
      };
    }
  }
}

module.exports = {
  RedisAdapterService,
  LUA_SCRIPTS,
};
