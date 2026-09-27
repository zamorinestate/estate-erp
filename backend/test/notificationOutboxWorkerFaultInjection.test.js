'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { NotificationOutbox } = require('../src/models/NotificationOutbox');
const { NotificationService } = require('../src/services/NotificationService');
const {
  runNotificationOutboxCycle,
  stopNotificationOutboxWorker,
} = require('../src/services/notificationOutboxWorker');

const ORG = 'ORG-ZAMORIN';
let mongo;

function dueRecord(overrides = {}) {
  return {
    outboxId: overrides.outboxId || 'OUT-20260927-0001',
    organisationId: ORG,
    eventType: 'TEST_NOTIFICATION',
    recipientUserId: 'ST-0001',
    recipientEmail: 'staff@example.com',
    recipientRole: 'STAFF',
    templateId: 'GENERAL_APPROVAL_DECISION',
    subject: 'Test',
    renderedSubject: 'Test',
    renderedBody: '<p>Test</p>',
    renderedBodyPlain: 'Test',
    channels: ['EMAIL'],
    correlationId: overrides.correlationId || 'CORR-TEST',
    idempotencyKey: overrides.idempotencyKey || 'IDEMP-TEST',
    status: 'QUEUED',
    nextAttemptAt: new Date(Date.now() - 1000),
    maxAttempts: 3,
    ...overrides,
  };
}

describe('NOTIFICATION OUTBOX WORKER FAULT INJECTION', () => {
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    try { await NotificationOutbox.createCollection(); } catch {}
  });

  after(async () => {
    await stopNotificationOutboxWorker();
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  beforeEach(async () => {
    await NotificationOutbox.deleteMany({});
  });

  it('OUTBOX-FI-001: two workers cannot deliver the same queued record twice', async () => {
    await NotificationOutbox.create(dueRecord());

    let sends = 0;
    const provider = {
      async sendEmail() {
        sends += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { providerMessageId: 'MSG-ONE' };
      },
    };

    const workerA = new NotificationService();
    const workerB = new NotificationService();
    workerA.setProvider(provider);
    workerB.setProvider(provider);

    await Promise.all([
      workerA.processDueOutbox({ limit: 1 }),
      workerB.processDueOutbox({ limit: 1 }),
    ]);

    const record = await NotificationOutbox.findOne({ outboxId: 'OUT-20260927-0001' }).lean();
    assert.equal(sends, 1, 'Provider must be invoked exactly once');
    assert.equal(record.status, 'SENT');
    assert.equal(record.attemptCount, 1);
    assert.ok(record.providerMessageId);
  });

  it('OUTBOX-FI-002: provider failure schedules retry and later succeeds', async () => {
    await NotificationOutbox.create(dueRecord({
      outboxId: 'OUT-20260927-0002',
      idempotencyKey: 'IDEMP-RETRY',
    }));

    let sends = 0;
    const provider = {
      async sendEmail() {
        sends += 1;
        if (sends === 1) {
          const error = new Error('Injected provider outage');
          error.code = 'INJECTED_PROVIDER_DOWN';
          throw error;
        }
        return { providerMessageId: 'MSG-RETRY-SUCCESS' };
      },
    };

    const worker = new NotificationService();
    worker.setProvider(provider);

    const first = await worker.processDueOutbox({ limit: 1 });
    assert.equal(first.retry, 1);

    let record = await NotificationOutbox.findOne({ outboxId: 'OUT-20260927-0002' });
    assert.equal(record.status, 'RETRY');
    assert.equal(record.attemptCount, 1);
    assert.ok(record.nextRetryAt);

    record.nextRetryAt = new Date(Date.now() - 1000);
    record.nextAttemptAt = new Date(Date.now() - 1000);
    await record.save();

    const second = await worker.processDueOutbox({ limit: 1 });
    assert.equal(second.sent, 1);

    record = await NotificationOutbox.findOne({ outboxId: 'OUT-20260927-0002' }).lean();
    assert.equal(record.status, 'SENT');
    assert.equal(record.attemptCount, 2);
    assert.equal(sends, 2);
  });

  it('OUTBOX-FI-003: exhausted provider failures enter DEAD_LETTER', async () => {
    await NotificationOutbox.create(dueRecord({
      outboxId: 'OUT-20260927-0003',
      idempotencyKey: 'IDEMP-DEAD',
      maxAttempts: 1,
    }));

    const worker = new NotificationService();
    worker.setProvider({
      async sendEmail() {
        const error = new Error('Permanent provider rejection');
        error.code = 'PERMANENT_REJECT';
        throw error;
      },
    });

    const summary = await worker.processDueOutbox({ limit: 1 });
    assert.equal(summary.deadLetter, 1);

    const record = await NotificationOutbox.findOne({ outboxId: 'OUT-20260927-0003' }).lean();
    assert.equal(record.status, 'DEAD_LETTER');
    assert.equal(record.attemptCount, 1);
    assert.ok(record.failedAt);
    assert.match(record.deadLetterReason, /Permanent provider rejection/);
  });

  it('OUTBOX-FI-004: expired PROCESSING lease becomes SEND_STATE_UNKNOWN and is not resent', async () => {
    await NotificationOutbox.create(dueRecord({
      outboxId: 'OUT-20260927-0004',
      idempotencyKey: 'IDEMP-UNKNOWN',
      status: 'PROCESSING',
      lockedBy: 'dead-worker',
      lockedUntil: new Date(Date.now() - 1000),
      processingAt: new Date(Date.now() - 120000),
      attemptCount: 1,
    }));

    let sends = 0;
    const worker = new NotificationService();
    worker.setProvider({
      async sendEmail() {
        sends += 1;
        return { providerMessageId: 'SHOULD-NOT-SEND' };
      },
    });

    const summary = await worker.processDueOutbox({ limit: 1 });
    assert.equal(summary.unknownQuarantined, 1);
    assert.equal(sends, 0);

    const record = await NotificationOutbox.findOne({ outboxId: 'OUT-20260927-0004' }).lean();
    assert.equal(record.status, 'SEND_STATE_UNKNOWN');
    assert.equal(record.lockedBy == null, true);
    assert.equal(record.lockedUntil == null, true);
  });

  it('OUTBOX-FI-005: registered worker cycle is executable without a separate manual poller', async () => {
    await NotificationOutbox.create(dueRecord({
      outboxId: 'OUT-20260927-0005',
      idempotencyKey: 'IDEMP-CYCLE',
    }));

    // The singleton uses ConsoleTestEmailProvider under NODE_ENV=test.
    const summary = await runNotificationOutboxCycle({ batchSize: 5 });
    assert.ok(summary.claimed >= 1);

    const record = await NotificationOutbox.findOne({ outboxId: 'OUT-20260927-0005' }).lean();
    assert.ok(['SENT', 'RETRY', 'DEAD_LETTER'].includes(record.status));
  });

  it('OUTBOX-FI-006: provider success with lost lease is quarantined and never blindly resent', async () => {
    await NotificationOutbox.create(dueRecord({
      outboxId: 'OUT-20260927-0006',
      idempotencyKey: 'IDEMP-LEASE-LOSS',
    }));

    let sends = 0;
    const worker = new NotificationService();
    worker.setProvider({
      async sendEmail() {
        sends += 1;

        // Simulate the worker losing its database lease after the provider
        // accepted the message but before SENT could be persisted.
        await NotificationOutbox.updateOne(
          { outboxId: 'OUT-20260927-0006' },
          {
            $set: {
              lockedBy: 'simulated-dead-worker',
              lockedUntil: new Date(Date.now() - 1000),
            },
          }
        );

        return { providerMessageId: 'MSG-ACCEPTED-BUT-LEASE-LOST' };
      },
    });

    const first = await worker.processDueOutbox({ limit: 1 });
    assert.equal(first.claimed, 1);
    assert.equal(sends, 1);

    let record = await NotificationOutbox.findOne({ outboxId: 'OUT-20260927-0006' }).lean();
    assert.equal(record.status, 'PROCESSING', 'Uncertain post-send state must not be lied about as SENT');

    const second = await worker.processDueOutbox({ limit: 1 });
    assert.equal(second.unknownQuarantined, 1);
    assert.equal(sends, 1, 'Uncertain provider delivery must never be blindly sent again');

    record = await NotificationOutbox.findOne({ outboxId: 'OUT-20260927-0006' }).lean();
    assert.equal(record.status, 'SEND_STATE_UNKNOWN');
    assert.equal(record.providerMessageId || null, null);
  });


  it('OUTBOX-FI-007: provider accepted delivery but SENT persistence fails -> SEND_STATE_UNKNOWN, never RETRY', async () => {
    await NotificationOutbox.create(dueRecord({
      outboxId: 'OUT-20260927-0007',
      idempotencyKey: 'IDEMP-POST-SEND-DB-FAIL',
    }));

    let sends = 0;
    const worker = new NotificationService();
    worker.setProvider({
      async sendEmail() {
        sends += 1;
        return { providerMessageId: 'MSG-POST-SEND-PERSIST-FAIL' };
      },
    });

    const originalUpdateOne = NotificationOutbox.updateOne.bind(NotificationOutbox);
    let injected = false;
    NotificationOutbox.updateOne = async function injectedPostSendPersistenceFailure(filter, update, options) {
      if (!injected && update?.$set?.status === 'SENT') {
        injected = true;
        const err = new Error('INJECTED_POST_SEND_DB_PERSISTENCE_FAILURE');
        err.code = 'INJECTED_DB_FAILURE';
        throw err;
      }
      return originalUpdateOne(filter, update, options);
    };

    try {
      await worker.processDueOutbox({ limit: 1 });

      let record = await NotificationOutbox.findOne({ outboxId: 'OUT-20260927-0007' }).lean();
      assert.equal(sends, 1, 'Provider was called exactly once');
      assert.equal(record.status, 'SEND_STATE_UNKNOWN');
      assert.equal(record.providerMessageId, 'MSG-POST-SEND-PERSIST-FAIL');
      assert.equal(record.lastErrorCode, 'POST_SEND_PERSISTENCE_FAILED');

      // A fresh worker (simulated process restart) must not pick this record up.
      const replacementWorker = new NotificationService();
      replacementWorker.setProvider({
        async sendEmail() {
          sends += 1;
          return { providerMessageId: 'SHOULD-NOT-BE-SENT' };
        },
      });
      await replacementWorker.processDueOutbox({ limit: 1 });

      record = await NotificationOutbox.findOne({ outboxId: 'OUT-20260927-0007' }).lean();
      assert.equal(record.status, 'SEND_STATE_UNKNOWN');
      assert.equal(sends, 1, 'Ambiguous provider state must not cause duplicate delivery');
    } finally {
      NotificationOutbox.updateOne = originalUpdateOne;
    }
  });

});
