'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RedisClientFactory } = require('../src/services/redisClientFactory');
const { DevicePresenceService } = require('../src/services/devicePresenceService');
const { DistributedRateLimiter } = require('../src/services/distributedRateLimiter');
const { DistributedEventBus } = require('../src/services/distributedEventBus');

test('Redis host/port configuration resolves to the intended endpoint', () => {
  const config = RedisClientFactory.validateClusterRequirements({
    clusterMode: false,
    host: 'redis.internal.example',
    port: 6380,
  });

  assert.equal(config.hasRedisConfig, true);
  assert.equal(config.host, 'redis.internal.example');
  assert.equal(config.port, 6380);
  assert.equal(
    RedisClientFactory.resolveRedisUrl(config),
    'redis://redis.internal.example:6380'
  );

  assert.throws(
    () => RedisClientFactory.validateClusterRequirements({
      clusterMode: false,
      host: 'redis.internal.example',
      port: 70000,
    }),
    (err) => err.code === 'REDIS_PORT_INVALID'
  );
});

test('device presence written by one process is readable by another through Redis', async () => {
  const store = new Map();
  const redisClient = {
    async set(key, value) {
      store.set(key, value);
      return 'OK';
    },
    async get(key) {
      return store.get(key) || null;
    },
  };

  const instanceA = new DevicePresenceService({
    redisClient,
    keyPrefix: 'zamorin:test:',
    checkpointWindowMs: 300000,
  });
  const instanceB = new DevicePresenceService({
    redisClient,
    keyPrefix: 'zamorin:test:',
    checkpointWindowMs: 300000,
  });

  await instanceA.recordHeartbeat({
    organisationId: 'ORG-REDIS',
    cafeId: 'ZC-0100',
    deviceId: 'DEV-0100',
    status: 'ACTIVE',
    now: new Date('2026-09-28T00:00:00.000Z'),
  });

  assert.equal(instanceB.ephemeralPresence.size, 0);

  const presence = await instanceB.getDevicePresence(
    'DEV-0100',
    'ORG-REDIS',
    'ZC-0100'
  );

  assert.equal(presence.deviceId, 'DEV-0100');
  assert.equal(presence.organisationId, 'ORG-REDIS');
  assert.equal(presence.cafeId, 'ZC-0100');
  assert.equal(presence.online, true);
  assert.ok(
    store.has('zamorin:test:presence:ORG-REDIS:ZC-0100:DEV-0100'),
    'presence key must use the configured Redis namespace'
  );
});

test('rate limiter and event bus use the same configured Redis namespace', async () => {
  const limiter = new DistributedRateLimiter({ keyPrefix: 'zamorin:test:' });
  assert.equal(
    limiter.formatKey({
      organisationId: 'ORG-REDIS',
      cafeId: 'ZC-0100',
      deviceId: 'DEV-0100',
      userId: 'ST-0100',
      ip: '127.0.0.1',
      scope: 'LOGIN',
    }),
    'zamorin:test:rl:ORG-REDIS:ZC-0100:DEV-0100:ST-0100:127.0.0.1:LOGIN'
  );

  const published = [];
  const subscribed = [];
  const publisher = {
    async publish(channel, payload) {
      published.push({ channel, payload });
      return 1;
    },
  };
  const subscriber = {
    async subscribe(channel) {
      subscribed.push(channel);
    },
    async unsubscribe() {},
  };
  const eventBus = new DistributedEventBus({
    redisPublisher: publisher,
    redisSubscriber: subscriber,
    keyPrefix: 'zamorin:test:',
    checkpointService: { reset: async () => {} },
  });

  eventBus.subscribe('DEVICE_REVOKED', () => {});
  await new Promise((resolve) => setImmediate(resolve));
  await eventBus.publish('DEVICE_REVOKED', {
    organisationId: 'ORG-REDIS',
    cafeId: 'ZC-0100',
    deviceId: 'DEV-0100',
  });

  assert.deepEqual(subscribed, ['zamorin:test:events:DEVICE_REVOKED']);
  assert.equal(published[0].channel, 'zamorin:test:events:DEVICE_REVOKED');
});
