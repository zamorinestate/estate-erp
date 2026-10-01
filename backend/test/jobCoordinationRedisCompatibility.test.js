'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { JobCoordinationService } = require('../src/services/jobCoordinationService');

function createRedisMock() {
  const calls = [];
  let fencing = 40;
  const state = new Map();

  return {
    calls,
    state,
    async incr(key) {
      calls.push({ method: 'incr', key });
      fencing += 1;
      return fencing;
    },
    async set(key, value, options) {
      calls.push({ method: 'set', key, value, options });
      if (options?.NX === true && state.has(key)) return null;
      state.set(key, value);
      return 'OK';
    },
    async get(key) {
      calls.push({ method: 'get', key });
      return state.get(key) || null;
    },
    async eval(script, options) {
      calls.push({ method: 'eval', script, options });
      const key = options.keys[0];
      const ownerId = options.arguments[0];
      const raw = state.get(key);
      if (!raw) return 0;
      const data = JSON.parse(raw);
      if (data.ownerId !== ownerId) return 0;
      if (script.includes('pexpire')) return 1;
      if (script.includes('del')) {
        state.delete(key);
        return 1;
      }
      return 0;
    },
  };
}

test('JOB-REDIS-001: acquireLock uses node-redis options object with NX and PX', async () => {
  const redis = createRedisMock();
  const service = new JobCoordinationService({ redisClient: redis });

  const result = await service.acquireLock('JOB-TEST', 'worker-a', 45_000);

  assert.equal(result.acquired, true);
  assert.equal(result.fencingToken, 41);
  const setCall = redis.calls.find((call) => call.method === 'set');
  assert.ok(setCall);
  assert.deepEqual(setCall.options, { NX: true, PX: 45_000 });
  assert.equal(typeof setCall.value, 'string');
  assert.equal(JSON.parse(setCall.value).ownerId, 'worker-a');
});

test('JOB-REDIS-002: extend and release use node-redis EVAL keys/arguments options', async () => {
  const redis = createRedisMock();
  const service = new JobCoordinationService({ redisClient: redis });
  await service.acquireLock('JOB-EVAL', 'worker-b', 60_000);

  assert.equal(await service.extendLock('JOB-EVAL', 'worker-b', 90_000), true);
  assert.equal(await service.releaseLock('JOB-EVAL', 'worker-b'), true);

  const evalCalls = redis.calls.filter((call) => call.method === 'eval');
  assert.equal(evalCalls.length, 2);
  assert.deepEqual(evalCalls[0].options.keys, ['lock:job:JOB-EVAL']);
  assert.deepEqual(evalCalls[0].options.arguments, ['worker-b', '90000']);
  assert.deepEqual(evalCalls[1].options.keys, ['lock:job:JOB-EVAL']);
  assert.deepEqual(evalCalls[1].options.arguments, ['worker-b']);
});

test('JOB-REDIS-003: fencing verification reads the distributed lock payload', async () => {
  const redis = createRedisMock();
  const service = new JobCoordinationService({ redisClient: redis });
  const lock = await service.acquireLock('JOB-FENCE', 'worker-c', 60_000);

  assert.equal(
    await service.verifyFencingToken('JOB-FENCE', 'worker-c', lock.fencingToken),
    true
  );
  assert.equal(
    await service.verifyFencingToken('JOB-FENCE', 'worker-c', lock.fencingToken + 1),
    false
  );
});

test('JOB-REDIS-004: configured Redis failure never degrades into a local lock', async () => {
  const redis = {
    async incr() {
      const error = new Error('redis unavailable');
      error.code = 'ECONNRESET';
      throw error;
    },
  };
  const service = new JobCoordinationService({ redisClient: redis });

  await assert.rejects(
    () => service.acquireLock('JOB-FAIL-CLOSED', 'worker-d', 60_000),
    (error) => {
      assert.equal(error.code, 'REDIS_JOB_COORDINATION_FAILED');
      assert.equal(error.operation, 'acquireLock');
      return true;
    }
  );
  assert.equal(service.localLocks.size, 0);
});

test('JOB-REDIS-005: distributed idempotency TTL uses node-redis EX options object', async () => {
  const redis = createRedisMock();
  const service = new JobCoordinationService({ redisClient: redis });

  const result = await service.executeIdempotent(
    'TEST-IDEMPOTENCY-KEY',
    async () => ({ ok: true }),
    120_000
  );

  assert.deepEqual(result, { ok: true });
  const write = redis.calls.find(
    (call) => call.method === 'set' && call.key === 'idempotency:TEST-IDEMPOTENCY-KEY'
  );
  assert.ok(write);
  assert.deepEqual(write.options, { EX: 120 });
});

test('JOB-REDIS-006: local fencing tokens stay within JavaScript safe integer range', () => {
  const service = new JobCoordinationService();
  for (let index = 0; index < 100; index += 1) {
    const token = service._generateFencingToken();
    assert.equal(Number.isSafeInteger(token), true);
  }
});
