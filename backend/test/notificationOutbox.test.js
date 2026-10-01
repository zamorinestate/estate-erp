'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { NotificationOutbox } = require('../src/models/NotificationOutbox');
const { User } = require('../src/models/User');
const { SystemCommunicationSettings } = require('../src/models/SystemCommunicationSettings');
const { notificationService } = require('../src/services/NotificationService');
const { ConsoleTestEmailProvider } = require('../src/services/ConsoleTestEmailProvider');

function makeUser(overrides = {}) {
  return new User({
    userId: 'MU-0001',
    organisationId: 'ZAMORIN',
    name: 'Primary Master',
    email: 'pradeeshk331@gmail.com',
    role: 'MASTER',
    accountStatus: 'ACTIVE',
    primaryCafeId: null,
    assignedCafeIds: [],
    isPrimaryMaster: true,
    primaryMasterDesignatedAt: new Date(),
    primaryMasterDesignatedBy: 'MU-0001',
    primaryMasterDesignationReason: 'Initial setup',
    roleHistory: [],
    cafeAssignmentHistory: [],
    sessionVersion: 1,
    permissionsVersion: 1,
    passwordHash: 'hash',
    createdBy: 'SYSTEM',
    ...overrides,
  });
}

test('Notification Outbox, Backoff & Resilience Suite', async (t) => {
  let mongoServer;
  const testProvider = new ConsoleTestEmailProvider();
  notificationService.setProvider(testProvider);

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    await makeUser().save();

    await SystemCommunicationSettings.create({
      organisationId: 'ZAMORIN',
      operationsEmail: 'zamorinestatepvtltd.erp@gmail.com',
      primaryMasterEmail: 'pradeeshk331@gmail.com',
      provider: 'CONSOLE_TEST',
      enabled: true,
      outboundEnabled: true,
    });
  });

  t.after(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  await t.test('Outbox record is created with QUEUED status and transitions to SENT on success', async () => {
    testProvider.clearHistory();
    testProvider.setOutageSimulation(false);

    const result = await notificationService.publishNotification({
      eventType: 'DEVICE_REVOKED',
      organisationId: 'ZAMORIN',
      targetUserIds: ['MU-0001'],
      templateId: 'SECURITY_ALERT',
      templateData: {
        title: 'Device Revoked',
        message: 'POS device was revoked',
        resource: 'ZC-0001',
        awaitOutboxProcessing: true,
      },
      idempotencyKey: 'IDEMP_KEY_DEV_REV_1',
      processImmediately: true,
    });

    assert.equal(result.success, true);
    assert.equal(result.outboxQueued, 1);

    const outboxItem = await NotificationOutbox.findOne({ idempotencyKey: 'IDEMP_KEY_DEV_REV_1_pradeeshk331@gmail.com' });
    assert.ok(outboxItem);
    assert.equal(outboxItem.status, 'SENT');
    assert.ok(outboxItem.sentAt);
    assert.ok(outboxItem.providerMessageId);
    assert.equal(testProvider.sentEmails.length, 1);
  });

  await t.test('Idempotency prevents duplicate outbox entries for identical event keys', async () => {
    const initialCount = await NotificationOutbox.countDocuments({});

    // Send identical notification again
    await notificationService.publishNotification({
      eventType: 'DEVICE_REVOKED',
      organisationId: 'ZAMORIN',
      targetUserIds: ['MU-0001'],
      templateId: 'SECURITY_ALERT',
      templateData: { title: 'Device Revoked', message: 'POS device was revoked', resource: 'ZC-0001' },
      idempotencyKey: 'IDEMP_KEY_DEV_REV_1',
      processImmediately: false,
    });

    const afterCount = await NotificationOutbox.countDocuments({});
    assert.equal(afterCount, initialCount, 'Duplicate idempotency key must not create duplicate outbox entries');
  });

  await t.test('Provider outage causes outbox RETRY with exponential backoff and does not crash caller', async () => {
    testProvider.setOutageSimulation(true, 'SIMULATED_GMAIL_API_TIMEOUT');

    const result = await notificationService.publishNotification({
      eventType: 'ATTENDANCE_EXCEPTION',
      organisationId: 'ZAMORIN',
      targetUserIds: ['MU-0001'],
      templateId: 'SECURITY_ALERT',
      templateData: {
        title: 'Missed Punch',
        message: 'Missed checkout detected',
        awaitOutboxProcessing: true,
      },
      idempotencyKey: 'IDEMP_KEY_ATT_OUTAGE_1',
      processImmediately: true,
    });

    // Caller succeeds without crashing
    assert.equal(result.success, true);

    const outboxItem = await NotificationOutbox.findOne({ idempotencyKey: 'IDEMP_KEY_ATT_OUTAGE_1_pradeeshk331@gmail.com' });
    assert.ok(outboxItem);
    assert.equal(outboxItem.status, 'RETRY');
    assert.equal(outboxItem.attemptCount, 1);
    assert.equal(outboxItem.lastErrorCode, 'SIMULATED_GMAIL_API_TIMEOUT');
    assert.ok(outboxItem.nextRetryAt > new Date());
  });


  await t.test('Durable outbox staging failure is reported truthfully for non-mandatory notification', async () => {
    const originalCreate = NotificationOutbox.create;
    NotificationOutbox.create = async () => {
      const err = new Error('Simulated durable outbox write failure');
      err.code = 'SIMULATED_OUTBOX_WRITE_FAILED';
      throw err;
    };

    try {
      const result = await notificationService.publishNotification({
        eventType: 'STAGING_FAILURE_TEST',
        organisationId: 'ZAMORIN',
        targetUserIds: ['MU-0001'],
        templateId: 'SECURITY_ALERT',
        templateData: {
          title: 'Staging Test',
          message: 'Durable outbox staging should fail truthfully',
        },
        channels: ['EMAIL'],
        idempotencyKey: 'IDEMP_STAGE_FAIL_NONMANDATORY_1',
        processImmediately: false,
      });

      assert.equal(result.success, false);
      assert.equal(result.deliveryStatus, 'STAGE_FAILED');
      assert.equal(result.outboxQueued, 0);
      assert.equal(result.stagingFailures.length, 1);
      assert.equal(result.stagingFailures[0].channel, 'EMAIL');
      assert.equal(result.stagingFailures[0].code, 'SIMULATED_OUTBOX_WRITE_FAILED');
    } finally {
      NotificationOutbox.create = originalCreate;
    }
  });

  await t.test('Mandatory notification fails closed when durable staging fails', async () => {
    const originalCreate = NotificationOutbox.create;
    NotificationOutbox.create = async () => {
      const err = new Error('Simulated mandatory outbox write failure');
      err.code = 'SIMULATED_MANDATORY_OUTBOX_WRITE_FAILED';
      throw err;
    };

    try {
      await assert.rejects(
        () => notificationService.publishNotification({
          eventType: 'MANDATORY_STAGING_FAILURE_TEST',
          organisationId: 'ZAMORIN',
          targetUserIds: ['MU-0001'],
          templateId: 'SECURITY_ALERT',
          templateData: {
            title: 'Mandatory Staging Test',
            message: 'Mandatory notification must fail closed',
          },
          channels: ['EMAIL'],
          idempotencyKey: 'IDEMP_STAGE_FAIL_MANDATORY_1',
          processImmediately: false,
          mandatory: true,
        }),
        (err) => {
          assert.equal(err.code, 'MANDATORY_NOTIFICATION_STAGE_FAILED');
          assert.ok(Array.isArray(err.stagingFailures));
          assert.equal(err.stagingFailures.length, 1);
          return true;
        }
      );
    } finally {
      NotificationOutbox.create = originalCreate;
    }
  });

  await t.test('Notification staging IDs use cryptographic randomness instead of Math.random', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../src/services/NotificationService.js'),
      'utf8'
    );
    const start = source.indexOf('async publishNotification');
    const end = source.indexOf('Marks expired processing leases', start);
    const block = source.slice(start, end);

    assert.equal(block.includes('Math.random()'), false);
    assert.ok(block.includes('crypto.randomInt'));
    assert.ok(block.includes('crypto.randomUUID'));
  });
});
