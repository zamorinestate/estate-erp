'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ScheduledJobExecution } = require('../src/models/ScheduledJobExecution');
const { JOB_SPECS, getBucketKey } = require('../src/services/scheduledOperationsWorker');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

test('JOB-WIRE-001: operations worker wires every registered non-notification scheduled job', () => {
  const ids = JOB_SPECS.map((spec) => spec.jobId).sort();
  assert.deepEqual(ids, [
    'JOB-ASSET-MAINTENANCE-SCHEDULER',
    'JOB-ATTENDANCE-AUTO-CHECKOUT',
    'JOB-BACKUP-PRECONDITION-AUDIT',
    'JOB-DOCUMENT-INTEGRITY-RECONCILIATION',
    'JOB-DOCUMENT-STAGING-CLEANUP',
  ]);
});

test('JOB-WIRE-002: scheduled execution ledger enforces one durable record per job bucket', () => {
  const indexes = ScheduledJobExecution.schema.indexes();
  const uniqueBucketIndex = indexes.find(([fields, options]) =>
    fields.jobId === 1 && fields.bucketKey === 1 && options.unique === true
  );
  assert.ok(uniqueBucketIndex);
});

test('JOB-WIRE-003: Kolkata schedule buckets do not run daily jobs before their configured hour', () => {
  const documentJob = JOB_SPECS.find((spec) => spec.jobId === 'JOB-DOCUMENT-INTEGRITY-RECONCILIATION');
  const attendanceJob = JOB_SPECS.find((spec) => spec.jobId === 'JOB-ATTENDANCE-AUTO-CHECKOUT');
  const assetJob = JOB_SPECS.find((spec) => spec.jobId === 'JOB-ASSET-MAINTENANCE-SCHEDULER');
  const beforeDue = new Date('2026-09-30T19:00:00Z'); // 2026-10-01 00:30 IST

  assert.equal(getBucketKey(documentJob, beforeDue), null);
  assert.equal(getBucketKey(attendanceJob, beforeDue), null);
  assert.equal(getBucketKey(assetJob, beforeDue), null);
});

test('JOB-WIRE-004: Kolkata daily and interval buckets become due deterministically', () => {
  const documentJob = JOB_SPECS.find((spec) => spec.jobId === 'JOB-DOCUMENT-INTEGRITY-RECONCILIATION');
  const attendanceJob = JOB_SPECS.find((spec) => spec.jobId === 'JOB-ATTENDANCE-AUTO-CHECKOUT');
  const assetJob = JOB_SPECS.find((spec) => spec.jobId === 'JOB-ASSET-MAINTENANCE-SCHEDULER');
  const stagingJob = JOB_SPECS.find((spec) => spec.jobId === 'JOB-DOCUMENT-STAGING-CLEANUP');
  const backupJob = JOB_SPECS.find((spec) => spec.jobId === 'JOB-BACKUP-PRECONDITION-AUDIT');
  const afterFive = new Date('2026-10-01T00:00:00Z'); // 05:30 IST

  assert.equal(getBucketKey(documentJob, afterFive), '2026-10-01:DAILY@02');
  assert.equal(getBucketKey(attendanceJob, afterFive), '2026-10-01:DAILY@04');
  assert.equal(getBucketKey(assetJob, afterFive), '2026-10-01:DAILY@05');
  assert.equal(getBucketKey(stagingJob, afterFive), '2026-10-01:H00');
  assert.equal(getBucketKey(backupJob, afterFive), '2026-10-01:H00');
});

test('JOB-WIRE-005: server starts and stops both notification and operations workers', () => {
  const source = read('../src/server.js');
  assert.ok(source.includes('startNotificationOutboxWorker();'));
  assert.ok(source.includes('startScheduledOperationsWorker();'));
  assert.ok(source.includes('await stopScheduledOperationsWorker();'));
  assert.ok(source.includes('await stopNotificationOutboxWorker();'));
});

test('JOB-WIRE-006: Redis factory injects distributed coordinator for scheduled jobs', () => {
  const source = read('../src/services/redisClientFactory.js');
  assert.ok(source.includes("const { defaultJobCoordinator } = require('./jobCoordinationService')"));
  assert.ok(source.includes('defaultJobCoordinator.setRedisClient(this.commandClient)'));
  assert.ok(source.includes('defaultJobCoordinator.setRedisClient(null)'));
});

test('JOB-WIRE-007: staging cleanup verifies deletion and reports failures instead of swallowing them', () => {
  const source = read('../src/services/retentionPolicyService.js');
  const start = source.indexOf('async cleanupAbandonedStaging');
  const end = source.indexOf('
  }
}', start);
  const block = source.slice(start, end);
  assert.ok(block.includes("status: failures.length === 0 ? 'SUCCESS' : 'PARTIAL_FAILURE'"));
  assert.ok(block.includes('STAGING_DELETE_UNVERIFIED'));
  assert.equal(block.includes('catch (_) {}'), false);
});
