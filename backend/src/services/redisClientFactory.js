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

    const redisUrl = config.url || process.env.REDIS_URL || null;
    const redisHost = config.host || process.env.REDIS_HOST || null;
    const redisPortRaw = config.port || process.env.REDIS_PORT || 6379;
    const redisPort = Number(redisPortRaw);

    if (!Number.isInteger(redisPort) || redisPort < 1 || redisPort > 65535) {
      const err = new Error('REDIS_PORT_INVALID: Redis port must be an integer between 1 and 65535.');
      err.code = 'REDIS_PORT_INVALID';
      throw err;
    }

    if (isClusterMode && !redisUrl && !redisHost) {
      const err = new Error(
        'CLUSTER_REDIS_CONFIG_MISSING: Clustered production mode requires REDIS_URL or REDIS_HOST. Local in-memory fallback is forbidden in cluster mode.'
      );
      err.code = 'CLUSTER_REDIS_CONFIG_MISSING';
      throw err;
    }

    return {
      isClusterMode,
      hasRedisConfig: Boolean(redisUrl || redisHost),
      url: redisUrl,
      host: redisHost,
      port: redisPort,
    };
  }

  static resolveRedisUrl(config = {}) {
    if (config.url) return config.url;
    if (!config.host) return null;
    if (/^rediss?:\/\//i.test(config.host)) return config.host;
    return `redis://${config.host}:${config.port || 6379}`;
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

    const redisUrl = RedisClientFactory.resolveRedisUrl(config);
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
      defaultLimiter.setRedisClient(this.commandClient, keyPrefix);
      defaultEventBus.setRedisBrokers(this.commandClient, this.subscriberClient, keyPrefix);
      defaultPresenceService.setRedisClient(this.commandClient, keyPrefix);

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
