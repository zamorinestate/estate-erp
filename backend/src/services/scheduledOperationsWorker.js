'use strict';

const os = require('node:os');
const crypto = require('node:crypto');

const { ScheduledJobExecution } = require('../models/ScheduledJobExecution');
const { scheduledJobRegistry } = require('./scheduledJobRegistry');
const { defaultJobCoordinator } = require('./jobCoordinationService');
const { retentionPolicyService } = require('./retentionPolicyService');
const { documentReconciliationService } = require('./documentReconciliationService');
const { backupVerificationService } = require('./backupVerificationService');
const { assetMaintenanceService } = require('./assetMaintenanceService');
const { attendanceRolloverService } = require('./attendanceRolloverService');

const DEFAULT_TICK_INTERVAL_MS = 60_000;
const WORKER_ID = `${os.hostname()}:${process.pid}:${crypto.randomUUID()}`;

let timer = null;
let runningPromise = null;

function getKolkataParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const values = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
  };
}

function getBucketKey(spec, now = new Date()) {
  const { date, hour } = getKolkataParts(now);

  if (Number.isInteger(spec.dailyHour)) {
    if (hour < spec.dailyHour) return null;
    return `${date}:DAILY@${String(spec.dailyHour).padStart(2, '0')}`;
  }

  if (Number.isInteger(spec.bucketHours) && spec.bucketHours > 0) {
    const bucketStart = Math.floor(hour / spec.bucketHours) * spec.bucketHours;
    return `${date}:H${String(bucketStart).padStart(2, '0')}`;
  }

  return null;
}

function summarizeDocumentReconciliation(result) {
  return {
    status: result?.status || null,
    documentsAudited: Number(result?.documentsAudited || 0),
    gridFilesScanned: Number(result?.gridFilesScanned || 0),
    orphanMetadataCount: Number(result?.orphanMetadataCount || 0),
    orphanBinariesCount: Number(result?.orphanBinariesCount || 0),
    checksumMismatchesCount: Number(result?.checksumMismatchesCount || 0),
    isConsistent: result?.isConsistent === true,
  };
}

const JOB_SPECS = [
  {
    jobId: 'JOB-DOCUMENT-STAGING-CLEANUP',
    bucketHours: 6,
    leaseMs: 10 * 60 * 1000,
    async run() {
      const result = await retentionPolicyService.cleanupAbandonedStaging({
        olderThanMinutes: 120,
      });
      if (result?.status === 'PARTIAL_FAILURE') {
        const error = new Error(
          `Staging cleanup completed with ${Number(result.failureCount || 0)} failure(s).`
        );
        error.code = 'STAGING_CLEANUP_PARTIAL_FAILURE';
        error.summary = {
          scanned: Number(result.scanned || 0),
          deleted: Number(result.deleted || 0),
          failureCount: Number(result.failureCount || 0),
        };
        throw error;
      }
      return {
        status: result?.status || 'UNKNOWN',
        scanned: Number(result?.scanned || 0),
        deleted: Number(result?.deleted || 0),
        failureCount: Number(result?.failureCount || 0),
      };
    },
  },
  {
    jobId: 'JOB-DOCUMENT-INTEGRITY-RECONCILIATION',
    dailyHour: 2,
    leaseMs: 30 * 60 * 1000,
    async run() {
      const organisationId =
        String(process.env.INITIAL_ORGANISATION_ID || 'ZAMORIN').trim().toUpperCase();
      const result = await documentReconciliationService.reconcileDocuments({
        organisationId,
        verifyChecksums: true,
        sampleLimit: Number(process.env.DOCUMENT_RECONCILIATION_SAMPLE_LIMIT) || 100,
      });
      return summarizeDocumentReconciliation(result);
    },
  },
  {
    jobId: 'JOB-BACKUP-PRECONDITION-AUDIT',
    bucketHours: 12,
    leaseMs: 10 * 60 * 1000,
    async run() {
      const result = await backupVerificationService.assessBackupReadiness();
      if (
        process.env.NODE_ENV === 'production' &&
        result?.continuousBackupCapable !== true
      ) {
        const error = new Error(
          'Production backup precondition audit found a topology without continuous-backup capability.'
        );
        error.code = 'BACKUP_PRECONDITION_FAILED';
        error.summary = {
          databaseConnected: Boolean(result?.databaseConnected),
          clusterTopology: result?.clusterTopology || null,
          continuousBackupCapable: Boolean(result?.continuousBackupCapable),
          missingCriticalCollections: result?.missingCriticalCollections || [],
        };
        throw error;
      }

      return {
        databaseConnected: Boolean(result?.databaseConnected),
        clusterTopology: result?.clusterTopology || null,
        continuousBackupCapable: Boolean(result?.continuousBackupCapable),
        totalCollections: Number(result?.totalCollections || 0),
        missingCriticalCollections: result?.missingCriticalCollections || [],
      };
    },
  },
  {
    jobId: 'JOB-ATTENDANCE-AUTO-CHECKOUT',
    dailyHour: 4,
    leaseMs: 20 * 60 * 1000,
    async run() {
      const organisationId =
        String(process.env.INITIAL_ORGANISATION_ID || 'ZAMORIN').trim().toUpperCase();
      const result = await attendanceRolloverService.markStaleOpenAttendance({
        organisationId,
        batchLimit: Number(process.env.ATTENDANCE_ROLLOVER_BATCH_LIMIT) || 500,
      });
      return {
        status: result?.status || null,
        currentBusinessDate: result?.currentBusinessDate || null,
        scannedCount: Number(result?.scannedCount || 0),
        updatedCount: Number(result?.updatedCount || 0),
        lockedOpenCount: Number(result?.lockedOpenCount || 0),
        hasMore: Boolean(result?.hasMore),
        invariant: result?.invariant || null,
      };
    },
  },
  {
    jobId: 'JOB-ASSET-MAINTENANCE-SCHEDULER',
    dailyHour: 5,
    leaseMs: 20 * 60 * 1000,
    async run() {
      const organisationId =
        String(process.env.INITIAL_ORGANISATION_ID || 'ZAMORIN').trim().toUpperCase();
      const result = await assetMaintenanceService.evaluateMaintenanceAlerts({
        organisationId,
      });
      return {
        evaluatedCount: Number(result?.evaluatedCount || 0),
        alertsRaised: Number(result?.alertsRaised || 0),
        alertsResolved: Number(result?.alertsResolved || 0),
      };
    },
  },
];

async function claimExecution(spec, bucketKey, now = new Date()) {
  const leaseExpiresAt = new Date(now.getTime() + spec.leaseMs);

  try {
    return await ScheduledJobExecution.create({
      jobId: spec.jobId,
      bucketKey,
      status: 'RUNNING',
      workerId: WORKER_ID,
      attemptCount: 1,
      claimedAt: now,
      leaseExpiresAt,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  const existing = await ScheduledJobExecution.findOne({
    jobId: spec.jobId,
    bucketKey,
  });

  if (!existing) return null;
  if (existing.status === 'SUCCEEDED') return null;

  if (
    existing.status === 'RUNNING' &&
    existing.leaseExpiresAt &&
    new Date(existing.leaseExpiresAt) > now
  ) {
    return null;
  }

  return ScheduledJobExecution.findOneAndUpdate(
    {
      _id: existing._id,
      jobId: spec.jobId,
      bucketKey,
      status: existing.status,
      ...(existing.status === 'RUNNING'
        ? { leaseExpiresAt: { $lte: now } }
        : {}),
    },
    {
      $set: {
        status: 'RUNNING',
        workerId: WORKER_ID,
        claimedAt: now,
        leaseExpiresAt,
        completedAt: null,
        failedAt: null,
        durationMs: null,
        summary: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
      $inc: { attemptCount: 1 },
    },
    { new: true }
  );
}

async function executeScheduledJob(spec, now = new Date()) {
  const bucketKey = getBucketKey(spec, now);
  if (!bucketKey) {
    return {
      jobId: spec.jobId,
      executed: false,
      reason: 'NOT_DUE_YET',
    };
  }

  return defaultJobCoordinator.runExclusive(
    `${spec.jobId}:${bucketKey}`,
    async () => {
      const claim = await claimExecution(spec, bucketKey, now);
      if (!claim) {
        return {
          jobId: spec.jobId,
          bucketKey,
          executed: false,
          reason: 'BUCKET_ALREADY_CLAIMED_OR_SUCCEEDED',
        };
      }

      const startedAt = Date.now();

      try {
        const summary = await spec.run();
        const durationMs = Date.now() - startedAt;

        const finalized = await ScheduledJobExecution.updateOne(
          {
            _id: claim._id,
            status: 'RUNNING',
            workerId: WORKER_ID,
          },
          {
            $set: {
              status: 'SUCCEEDED',
              completedAt: new Date(),
              durationMs,
              summary,
              lastErrorCode: null,
              lastErrorMessage: null,
            },
          }
        );

        if (finalized.modifiedCount !== 1) {
          const error = new Error('Scheduled job execution lease/state was lost before success finalization.');
          error.code = 'SCHEDULED_JOB_FINALIZE_CONFLICT';
          throw error;
        }

        scheduledJobRegistry.recordJobExecution(spec.jobId, {
          success: true,
          durationMs,
        });

        return {
          jobId: spec.jobId,
          bucketKey,
          executed: true,
          status: 'SUCCEEDED',
          summary,
        };
      } catch (error) {
        const durationMs = Date.now() - startedAt;

        await ScheduledJobExecution.updateOne(
          {
            _id: claim._id,
            status: 'RUNNING',
            workerId: WORKER_ID,
          },
          {
            $set: {
              status: 'FAILED',
              failedAt: new Date(),
              durationMs,
              summary: error?.summary || null,
              lastErrorCode: String(error?.code || 'SCHEDULED_JOB_FAILED').slice(0, 120),
              lastErrorMessage: String(error?.message || 'Scheduled job failed').slice(0, 1000),
            },
          }
        ).catch(() => {});

        scheduledJobRegistry.recordJobExecution(spec.jobId, {
          success: false,
          durationMs,
          error,
        });

        throw error;
      }
    },
    {
      ttlMs: spec.leaseMs,
      ownerId: WORKER_ID,
    }
  );
}

async function runScheduledOperationsCycle({ now = new Date() } = {}) {
  if (runningPromise) return runningPromise;

  runningPromise = (async () => {
    const results = [];
    for (const spec of JOB_SPECS) {
      try {
        results.push(await executeScheduledJob(spec, now));
      } catch (error) {
        results.push({
          jobId: spec.jobId,
          executed: true,
          status: 'FAILED',
          errorCode: String(error?.code || 'SCHEDULED_JOB_FAILED'),
          message: String(error?.message || 'Scheduled job failed').slice(0, 300),
        });
      }
    }
    return results;
  })();

  try {
    return await runningPromise;
  } finally {
    runningPromise = null;
  }
}

function startScheduledOperationsWorker({
  intervalMs = Number(process.env.SCHEDULED_OPERATIONS_INTERVAL_MS) || DEFAULT_TICK_INTERVAL_MS,
  runImmediately = true,
} = {}) {
  if (timer) return timer;

  if (runImmediately) {
    runScheduledOperationsCycle().catch((error) => {
      console.warn('[ScheduledOperationsWorker] Initial cycle failed:', error.message);
    });
  }

  timer = setInterval(() => {
    runScheduledOperationsCycle().catch((error) => {
      console.warn('[ScheduledOperationsWorker] Cycle failed:', error.message);
    });
  }, Math.max(30_000, intervalMs));

  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

async function stopScheduledOperationsWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  if (runningPromise) {
    try {
      await runningPromise;
    } catch {
      // Per-job failure is persisted to ScheduledJobExecution and registry.
    }
  }
}

function isScheduledOperationsWorkerRunning() {
  return Boolean(timer);
}

module.exports = {
  JOB_SPECS,
  WORKER_ID,
  getKolkataParts,
  getBucketKey,
  claimExecution,
  executeScheduledJob,
  runScheduledOperationsCycle,
  startScheduledOperationsWorker,
  stopScheduledOperationsWorker,
  isScheduledOperationsWorkerRunning,
};
