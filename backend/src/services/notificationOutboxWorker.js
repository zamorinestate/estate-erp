'use strict';

const { notificationService } = require('./NotificationService');
const { scheduledJobRegistry } = require('./scheduledJobRegistry');

const JOB_ID = 'JOB-NOTIFICATION-OUTBOX-DISPATCH';
const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BATCH_SIZE = 25;

let timer = null;
let runningPromise = null;

async function runNotificationOutboxCycle({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
  if (runningPromise) {
    return runningPromise;
  }

  const startedAt = Date.now();
  runningPromise = (async () => {
    try {
      const summary = await notificationService.processDueOutbox({ limit: batchSize });
      scheduledJobRegistry.recordJobExecution(JOB_ID, {
        success: true,
        durationMs: Date.now() - startedAt,
      });
      return summary;
    } catch (error) {
      scheduledJobRegistry.recordJobExecution(JOB_ID, {
        success: false,
        durationMs: Date.now() - startedAt,
        error,
      });
      throw error;
    } finally {
      runningPromise = null;
    }
  })();

  return runningPromise;
}

function startNotificationOutboxWorker({
  intervalMs = Number(process.env.NOTIFICATION_OUTBOX_INTERVAL_MS) || DEFAULT_INTERVAL_MS,
  batchSize = Number(process.env.NOTIFICATION_OUTBOX_BATCH_SIZE) || DEFAULT_BATCH_SIZE,
  runImmediately = true,
} = {}) {
  if (timer) return timer;

  if (runImmediately) {
    runNotificationOutboxCycle({ batchSize }).catch((error) => {
      console.warn('[NotificationOutboxWorker] Initial dispatch cycle failed:', error.message);
    });
  }

  timer = setInterval(() => {
    runNotificationOutboxCycle({ batchSize }).catch((error) => {
      console.warn('[NotificationOutboxWorker] Dispatch cycle failed:', error.message);
    });
  }, Math.max(5_000, intervalMs));

  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

async function stopNotificationOutboxWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (runningPromise) {
    try {
      await runningPromise;
    } catch {
      // Failure already recorded by the registry; shutdown continues.
    }
  }
}

function isNotificationOutboxWorkerRunning() {
  return Boolean(timer);
}

module.exports = {
  JOB_ID,
  DEFAULT_INTERVAL_MS,
  DEFAULT_BATCH_SIZE,
  runNotificationOutboxCycle,
  startNotificationOutboxWorker,
  stopNotificationOutboxWorker,
  isNotificationOutboxWorkerRunning,
};
