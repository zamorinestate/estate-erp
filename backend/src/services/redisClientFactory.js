'use strict';

let redis;
try {
  redis = require('redis');
} catch (_) {
  redis = null;
}

const { RedisAdapterService } = require('./redisAdapterService');

/**
 * Enterprise Production Redis Client Factory & Lifecycle Manager
 * 
 * Manages official `redis` client instances across the application:
 * - 1 Command Client (Rate Limiter, Presence, Job Locks)
 * - 1 Dedicated Subscriber Client (Event Bus Pub/Sub via duplicate())
 * Total connections per API process = 2 connections.
 */

class RedisClientFactory {
  constructor() {
    this.commandClient = null;
    this.subscriberClient = null;
    this.adapterService = null;
    this.status = 'UNINITIALIZED'; // UNINITIALIZED | CONNECTING | READY | DEGRADED | CLOSED
    this.lastError = null;
  }

  /**
   * Validates runtime cluster configuration.
   */
  static validateClusterRequirements(config = {}) {
    const isClusterMode =
      process.env.NODE_ENV === 'production' ||
      process.env.CLUSTER_MODE === 'true' ||
      config.clusterMode === true;

    const redisUrl = config.url || process.env.REDIS_URL || process.env.REDIS_HOST;

    if (isClusterMode && !redisUrl) {
      const err = new Error(
        'CLUSTER_REDIS_CONFIG_MISSING: Clustered production mode requires a valid REDIS_URL. Local in-memory fallback is forbidden in cluster mode.'
      );
      err.code = 'CLUSTER_REDIS_CONFIG_MISSING';
      throw err;
    }

    return {
      isClusterMode,
      hasRedisConfig: Boolean(redisUrl),
      url: redisUrl || null,
    };
  }

  /**
   * Initializes official Redis clients and injects them into distributed services.
   */
  async initializeClients(options = {}) {
    const config = RedisClientFactory.validateClusterRequirements(options);

    if (!config.hasRedisConfig) {
      this.status = 'LOCAL_FALLBACK';
      return { initialized: false, mode: 'LOCAL_FALLBACK' };
    }

    if (!redis || typeof redis.createClient !== 'function') {
      throw new Error('REDIS_PACKAGE_MISSING: The official "redis" package is not installed or loadable.');
    }

    const redisUrl = options.url || process.env.REDIS_URL || `redis://${options.host || '127.0.0.1'}:${options.port || 6379}`;
    const keyPrefix = options.keyPrefix || 'zamorin:';

    this.status = 'CONNECTING';

    try {
      this.commandClient = redis.createClient({ url: redisUrl });
      this.commandClient.on('error', (err) => {
        this.lastError = err.message;
        this.status = 'DEGRADED';
        console.warn(`[RedisClientFactory] Command client error: ${err.message}`);
      });
      this.commandClient.on('ready', () => {
        this.status = 'READY';
      });

      await this.commandClient.connect();

      // Duplicate client for dedicated Pub/Sub subscription
      this.subscriberClient = this.commandClient.duplicate();
      this.subscriberClient.on('error', (err) => {
        console.warn(`[RedisClientFactory] Subscriber client error: ${err.message}`);
      });
      await this.subscriberClient.connect();

      this.adapterService = new RedisAdapterService({
        client: this.commandClient,
        subscriberClient: this.subscriberClient,
        keyPrefix,
      });

      const { defaultLimiter } = require('./distributedRateLimiter');
      const { defaultEventBus } = require('./distributedEventBus');
      const { defaultPresenceService } = require('./devicePresenceService');
      defaultLimiter.setRedisClient(this.commandClient);
      defaultEventBus.setRedisBrokers(this.commandClient, this.subscriberClient);
      defaultPresenceService.setRedisClient(this.commandClient);

      this.status = 'READY';
      return {
        initialized: true,
        mode: 'REDIS_CLUSTER',
        commandClient: this.commandClient,
        subscriberClient: this.subscriberClient,
        adapterService: this.adapterService,
      };
    } catch (err) {
      this.status = 'DEGRADED';
      this.lastError = err.message;
      throw err;
    }
  }

  /**
   * Returns current health and connectivity status.
   */
  async getHealthStatus() {
    if (!this.commandClient) {
      return {
        status: this.status,
        isConnected: false,
        lastError: this.lastError,
      };
    }

    try {
      const pong = await this.commandClient.ping();
      return {
        status: pong === 'PONG' ? 'READY' : 'DEGRADED',
        isConnected: pong === 'PONG',
        lastError: this.lastError,
      };
    } catch (err) {
      return {
        status: 'DEGRADED',
        isConnected: false,
        lastError: err.message,
      };
    }
  }

  /**
   * Gracefully closes all open Redis connections on process shutdown.
   */
  async close() {
    this.status = 'CLOSED';
    const closePromises = [];

    if (this.subscriberClient && typeof this.subscriberClient.quit === 'function') {
      closePromises.push(this.subscriberClient.quit().catch(() => {}));
    }
    if (this.commandClient && typeof this.commandClient.quit === 'function') {
      closePromises.push(this.commandClient.quit().catch(() => {}));
    }

    await Promise.all(closePromises);
    try {
      const { defaultLimiter } = require('./distributedRateLimiter');
      const { defaultEventBus } = require('./distributedEventBus');
      const { defaultPresenceService } = require('./devicePresenceService');
      defaultLimiter.setRedisClient(null);
      defaultEventBus.setRedisBrokers(null, null);
      defaultPresenceService.setRedisClient(null);
    } catch (_) {}
    this.commandClient = null;
    this.subscriberClient = null;
    this.adapterService = null;
  }
}

const defaultRedisFactory = new RedisClientFactory();

module.exports = {
  RedisClientFactory,
  redisClientFactory: defaultRedisFactory,
};
