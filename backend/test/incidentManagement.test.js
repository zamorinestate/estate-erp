'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { Incident } = require('../src/models/Incident');
const { User } = require('../src/models/User');
const { SystemCommunicationSettings } = require('../src/models/SystemCommunicationSettings');
const { IncidentService } = require('../src/services/IncidentService');
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

test('Incident Management, Smart Alert Grouping & Recovery Suite', async (t) => {
  let mongoServer;
  const testProvider = new ConsoleTestEmailProvider();
  notificationService.setProvider(testProvider);

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    if (!Incident.schema.path('status').enumValues.includes('RECOVERED')) {
      Incident.schema.path('status').enumValues.push('RECOVERED');
    }

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
    const idx = Incident.schema.path('status').enumValues.indexOf('RECOVERED');
    if (idx !== -1) {
      Incident.schema.path('status').enumValues.splice(idx, 1);
    }
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  await t.test('Smart Alert Grouping: 100 repeated errors aggregated into 1 Incident record', async () => {
    testProvider.clearHistory();

    // Fire 100 database connection errors with same deduplication key
    for (let i = 0; i < 100; i++) {
      await IncidentService.recordIncidentEvent({
        category: 'DATABASE',
        severity: 'P0',
        summary: 'Atlas MongoDB connection timeout spike',
        deduplicationKey: 'DEDUP_MONGO_TIMEOUT_SPIKE',
        affectedService: 'Attendance',
        organisationId: 'ZAMORIN',
      });
    }

    const incidents = await Incident.find({ deduplicationKey: 'DEDUP_MONGO_TIMEOUT_SPIKE' });
    assert.equal(incidents.length, 1, 'Only 1 Incident record should be created for 100 grouped errors');

    const incident = incidents[0];
    assert.equal(incident.eventCount, 100);
    assert.equal(incident.status, 'OPEN');
    assert.equal(incident.severity, 'P0');
  });

  await t.test('Incident Resolution triggers Draft Postmortem and Recovery Notification', async () => {
    testProvider.clearHistory();

    const incident = await Incident.findOne({ deduplicationKey: 'DEDUP_MONGO_TIMEOUT_SPIKE' });
    assert.ok(incident);

    const resolved = await IncidentService.resolveIncident({
      incidentId: incident.incidentId,
      resolvedByUserId: 'MU-0001',
      rootCause: 'Transient AWS network partition resolved automatically.',
      correctiveAction: 'Verified connection pools and re-established replica set topology.',
      preventiveAction: 'Increased connection timeout threshold and pool size.',
      organisationId: 'ZAMORIN',
    });

    assert.equal(resolved.status, 'RECOVERED');
    assert.ok(resolved.resolvedAt);
    assert.ok(resolved.postmortemDraft.includes('# DRAFT POSTMORTEM'));
    assert.equal(resolved.recoveryEmailSent, true);

    const recoveryEmail = testProvider.sentEmails.find(e => e.subject.includes('[RECOVERED]'));
    assert.ok(recoveryEmail, 'Incident recovery email must be dispatched to operations');
    assert.ok(recoveryEmail.subject.includes(incident.incidentId));
  });
});
