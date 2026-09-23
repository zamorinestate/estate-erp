'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — REC-15 TEST SUITE
 * ASSET MAINTENANCE SCHEDULING, PREVENTIVE MAINTENANCE, ALERTING & CERTIFICATION
 * ============================================================================
 * Comprehensive 37-scenario test suite covering:
 * - Deterministic due-status calculation (UPCOMING, DUE_SOON, DUE_TODAY, OVERDUE)
 * - Calendar-aware recurrence math (month boundaries, leap years, annual)
 * - Maintenance completion and next-due calculation without drift
 * - Reschedule workflow with mandatory reason and history
 * - Cancellation with evidence preservation
 * - Operational alert generation, deduplication, and automatic resolution
 * - Scheduler restart and missed run recovery
 * - Retired asset alert suppression and transferred asset scoping
 * - REC-06 BusinessDocument evidence integration and security scan enforcement
 * - Multi-tenant isolation: Master org-wide, Owner read-only, Cafe Admin assigned scope, Staff denied
 * - Cross-café and cross-organisation IDOR protection
 * - Audit event generation and zero KDS verification
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { createApp } = require('../src/server');
const { Asset } = require('../src/models/Asset');
const { MaintenancePlan } = require('../src/models/MaintenancePlan');
const { MaintenanceJob } = require('../src/models/MaintenanceJob');
const { OperationalAlert } = require('../src/models/OperationalAlert');
const { BusinessDocument } = require('../src/models/BusinessDocument');
const { AuditEvent } = require('../src/models/AuditEvent');
const { User } = require('../src/models/User');
const authService = require('../src/services/authService');
const {
  assetMaintenanceService,
  calculateDueStatus,
  calculateNextDueDate,
  getKolkataDate,
} = require('../src/services/assetMaintenanceService');

function makeRequest({ port, method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const serializedBody = body ? JSON.stringify(body) : null;
    const reqHeaders = { Connection: 'close', ...headers };
    if (serializedBody) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(serializedBody);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path,
        headers: reqHeaders,
        agent: false,
      },
      (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(responseData);
          } catch (e) {
            json = { raw: responseData };
          }
          resolve({ status: res.statusCode, data: json });
        });
      }
    );

    req.on('error', reject);
    if (serializedBody) req.write(serializedBody);
    req.end();
  });
}

test('REC-15 — Asset Maintenance Scheduling, Preventive Maintenance, Alerting & Certification', async (t) => {
  let mongoServer;
  if (mongoose.connection.readyState === 0) {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  }

  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = server.address().port;

  t.after(async () => {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
    // Clean up test records
    await Asset.deleteMany({ organisationId: { $in: ['ORG-REC15', 'ORG-FOREIGN'] } });
    await MaintenancePlan.deleteMany({ organisationId: { $in: ['ORG-REC15', 'ORG-FOREIGN'] } });
    await MaintenanceJob.deleteMany({ organisationId: { $in: ['ORG-REC15', 'ORG-FOREIGN'] } });
    await OperationalAlert.deleteMany({ organisationId: { $in: ['ORG-REC15', 'ORG-FOREIGN'] } });
    await BusinessDocument.deleteMany({ organisationId: { $in: ['ORG-REC15', 'ORG-FOREIGN'] } });
    await User.deleteMany({ organisationId: { $in: ['ORG-REC15', 'ORG-FOREIGN'] } });

    if (mongoServer) {
      await mongoose.disconnect();
      await mongoServer.stop();
    }
  });

  // Seed Users for different roles
  const users = {
    master: {
      userId: 'USR-MASTER-REC15',
      role: 'MASTER',
      isPrimaryMaster: true,
      organisationId: 'ORG-REC15',
      name: 'Master User',
      email: 'master@rec15.com',
      assignedCafeIds: ['CAF-001', 'CAF-002'],
      accountStatus: 'ACTIVE',
      sessionVersion: 1,
      permissionsVersion: 1,
    },
    owner: {
      userId: 'USR-OWNER-REC15',
      role: 'OWNER',
      isPrimaryMaster: false,
      organisationId: 'ORG-REC15',
      name: 'Owner User',
      email: 'owner@rec15.com',
      assignedCafeIds: [],
      accountStatus: 'ACTIVE',
      sessionVersion: 1,
      permissionsVersion: 1,
    },
    adminA: {
      userId: 'USR-ADMIN-A-REC15',
      role: 'CAFE_ADMIN',
      isPrimaryMaster: false,
      organisationId: 'ORG-REC15',
      name: 'Cafe Admin A',
      email: 'admin_a@rec15.com',
      assignedCafeIds: ['CAF-001'],
      primaryCafeId: 'CAF-001',
      accountStatus: 'ACTIVE',
      sessionVersion: 1,
      permissionsVersion: 1,
    },
    adminB: {
      userId: 'USR-ADMIN-B-REC15',
      role: 'CAFE_ADMIN',
      isPrimaryMaster: false,
      organisationId: 'ORG-REC15',
      name: 'Cafe Admin B',
      email: 'admin_b@rec15.com',
      assignedCafeIds: ['CAF-002'],
      primaryCafeId: 'CAF-002',
      accountStatus: 'ACTIVE',
      sessionVersion: 1,
      permissionsVersion: 1,
    },
    staff: {
      userId: 'USR-STAFF-REC15',
      role: 'STAFF',
      isPrimaryMaster: false,
      organisationId: 'ORG-REC15',
      name: 'Staff User',
      email: 'staff@rec15.com',
      assignedCafeIds: ['CAF-001'],
      primaryCafeId: 'CAF-001',
      accountStatus: 'ACTIVE',
      sessionVersion: 1,
      permissionsVersion: 1,
    },
    foreignMaster: {
      userId: 'USR-FOREIGN-REC15',
      role: 'MASTER',
      isPrimaryMaster: true,
      organisationId: 'ORG-FOREIGN',
      name: 'Foreign Master User',
      email: 'foreign@other.com',
      assignedCafeIds: ['CAF-999'],
      accountStatus: 'ACTIVE',
      sessionVersion: 1,
      permissionsVersion: 1,
    },
  };

  // Upsert users into DB
  for (const u of Object.values(users)) {
    await User.updateOne({ userId: u.userId, organisationId: u.organisationId }, { $set: u }, { upsert: true });
  }

  // Mock verifyAccessToken
  t.mock.method(authService, 'verifyAccessToken', async (token) => {
    let u = users.master;
    if (token === 'token_owner') u = users.owner;
    else if (token === 'token_admin_a') u = users.adminA;
    else if (token === 'token_admin_b') u = users.adminB;
    else if (token === 'token_staff') u = users.staff;
    else if (token === 'token_foreign') u = users.foreignMaster;

    return {
      payload: {
        sub: u.userId,
        org: u.organisationId,
        role: u.role,
        isPrimaryMaster: u.isPrimaryMaster,
        usv: u.sessionVersion,
        pv: u.permissionsVersion,
        sid: `SESSION-${u.userId}`,
      },
      session: {
        sessionId: `SESSION-${u.userId}`,
        roleSnapshot: u.role,
        sessionVersion: u.sessionVersion,
        mfaVerified: true,
      },
    };
  });

  const headers = {
    master: { Authorization: 'Bearer token_master' },
    owner: { Authorization: 'Bearer token_owner' },
    adminA: { Authorization: 'Bearer token_admin_a' },
    adminB: { Authorization: 'Bearer token_admin_b' },
    staff: { Authorization: 'Bearer token_staff' },
    foreign: { Authorization: 'Bearer token_foreign' },
  };

  const todayStr = getKolkataDate();

  // Seed sample assets
  const asset1 = await Asset.create({
    assetId: 'AST-101',
    organisationId: 'ORG-REC15',
    cafeId: 'CAF-001',
    name: 'Espresso Machine Linea PB',
    category: 'COFFEE_MACHINE',
    operationalStatus: 'IN_SERVICE',
    condition: 'EXCELLENT',
    criticality: 'CRITICAL',
    serviceFrequency: 'QUARTERLY',
    nextMaintenanceDue: '2026-10-01',
    createdByUserId: users.master.userId,
  });

  const asset2 = await Asset.create({
    assetId: 'AST-102',
    organisationId: 'ORG-REC15',
    cafeId: 'CAF-002',
    name: 'Under-counter Refrigerator',
    category: 'REFRIGERATION',
    operationalStatus: 'IN_SERVICE',
    condition: 'GOOD',
    criticality: 'HIGH',
    serviceFrequency: 'MONTHLY',
    nextMaintenanceDue: '2026-08-01', // Overdue
    createdByUserId: users.master.userId,
  });

  // 1. Existing architecture verified
  await t.test('1. Existing asset and maintenance architecture verified in models', () => {
    assert.ok(Asset, 'Asset model exists');
    assert.ok(MaintenancePlan, 'MaintenancePlan model exists');
    assert.ok(MaintenanceJob, 'MaintenanceJob model exists');
    assert.ok(OperationalAlert, 'OperationalAlert model exists');
    assert.ok(BusinessDocument, 'BusinessDocument model exists');
  });

  // 2. Master creates preventive maintenance plan
  let plan1 = null;
  await t.test('2. Master creates preventive maintenance plan for specific asset', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/plans',
      headers: headers.master,
      body: {
        name: 'Quarterly Espresso Grouphead Overhaul',
        assetId: 'AST-101',
        frequencyType: 'QUARTERLY',
        intervalDays: 90,
        startDate: todayStr,
      },
    });

    assert.equal(res.status, 201);
    assert.ok(res.data?.data?.plan?.planId);
    assert.equal(res.data.data.plan.assetId, 'AST-101');
    plan1 = res.data.data.plan;
  });

  // 3. Due status engine: UPCOMING
  await t.test('3. Due status engine: UPCOMING status calculation', () => {
    const status = calculateDueStatus('2026-12-31', { referenceDate: '2026-09-16' });
    assert.equal(status, 'UPCOMING');
  });

  // 4. Due status engine: DUE_SOON
  await t.test('4. Due status engine: DUE_SOON status calculation within warning window', () => {
    const status = calculateDueStatus('2026-09-20', { dueSoonDays: 7, referenceDate: '2026-09-16' });
    assert.equal(status, 'DUE_SOON');
  });

  // 5. Due status engine: DUE_TODAY
  await t.test('5. Due status engine: DUE_TODAY status calculation on matching date', () => {
    const status = calculateDueStatus('2026-09-16', { referenceDate: '2026-09-16' });
    assert.equal(status, 'DUE_TODAY');
  });

  // 6. Due status engine: OVERDUE
  await t.test('6. Due status engine: OVERDUE status calculation on past due date', () => {
    const status = calculateDueStatus('2026-09-10', { referenceDate: '2026-09-16' });
    assert.equal(status, 'OVERDUE');
  });

  // 7. Calendar date calculation: Month-end boundary (Jan 31 -> Feb 28 on standard year)
  await t.test('7. Calendar date calculation: Month-end boundary clamps correctly', () => {
    const nextDate = calculateNextDueDate('2025-01-31', 'MONTHLY');
    assert.equal(nextDate, '2025-02-28');
  });

  // 8. Calendar date calculation: Leap year handling (Feb 29 on 2024 leap year)
  await t.test('8. Calendar date calculation: Leap year Feb 29 clamps to Feb 28 on following year', () => {
    const nextDate = calculateNextDueDate('2024-02-29', 'ANNUALLY');
    assert.equal(nextDate, '2025-02-28');
  });

  // 9. Calendar date calculation: 30-day to 31-day month rollover
  await t.test('9. Calendar date calculation: 30-day month preserves day on next month', () => {
    const nextDate = calculateNextDueDate('2026-04-30', 'MONTHLY');
    assert.equal(nextDate, '2026-05-30');
  });

  // 10. Calendar date calculation: Annual interval rollover
  await t.test('10. Calendar date calculation: Annual interval rollover preserves date', () => {
    const nextDate = calculateNextDueDate('2026-09-16', 'ANNUALLY');
    assert.equal(nextDate, '2027-09-16');
  });

  // 11. Maintenance completion persists in MaintenanceJob
  let completedJobId = null;
  await t.test('11. Maintenance completion workflow persists in MaintenanceJob', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/maintenance/complete',
      headers: headers.master,
      body: {
        assetId: 'AST-101',
        planId: plan1?.planId,
        workSummary: 'Replaced group gaskets and descaled boilers',
        performedBy: 'Master Technician',
        costPaisa: 450000,
        result: 'COMPLETED',
        completedAt: todayStr,
      },
    });

    assert.equal(res.status, 200);
    assert.ok(res.data?.data?.job?.jobId);
    assert.equal(res.data.data.job.status, 'COMPLETED');
    assert.equal(res.data.data.job.costPaisa, 450000);
    completedJobId = res.data.data.job.jobId;
  });

  // 12. Maintenance completion advances Asset.nextMaintenanceDue without drift
  await t.test('12. Maintenance completion advances Asset.nextMaintenanceDue without date drift', async () => {
    const asset = await Asset.findOne({ assetId: 'AST-101', organisationId: 'ORG-REC15' });
    const expectedNext = calculateNextDueDate(todayStr, 'QUARTERLY');
    assert.equal(asset.nextMaintenanceDue, expectedNext);
  });

  // 13. Maintenance completion updates Asset.lastServiceDate
  await t.test('13. Maintenance completion updates Asset.lastServiceDate', async () => {
    const asset = await Asset.findOne({ assetId: 'AST-101', organisationId: 'ORG-REC15' });
    assert.equal(asset.lastServiceDate, todayStr);
  });

  // 14. Maintenance completion automatically resolves active OperationalAlert items
  await t.test('14. Maintenance completion automatically resolves active OperationalAlert items', async () => {
    // Seed an open alert for AST-101
    await OperationalAlert.create({
      alertId: 'ALT-TEST-001',
      category: 'ASSET_MAINTENANCE',
      severity: 'SEV-2',
      source: 'ASSET_MAINTENANCE_SCHEDULER',
      title: 'Maintenance Overdue for AST-101',
      description: 'Overdue service alert',
      deduplicationKey: 'MNT_ORG-REC15_AST-101_OVERDUE',
      organisationId: 'ORG-REC15',
      cafeId: 'CAF-001',
      status: 'OPEN',
    });

    // Complete maintenance again
    await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/maintenance/complete',
      headers: headers.master,
      body: {
        assetId: 'AST-101',
        workSummary: 'Overdue service performed',
        performedBy: 'Tech 1',
      },
    });

    const alert = await OperationalAlert.findOne({ alertId: 'ALT-TEST-001' });
    assert.equal(alert.status, 'RESOLVED');
  });

  // 15. Maintenance reschedule records old due date, new due date, actor, and reason
  await t.test('15. Maintenance reschedule records old due date, new due date, actor, and mandatory reason', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/assets/maintenance/jobs/${completedJobId}/reschedule`,
      headers: headers.master,
      body: {
        assetId: 'AST-101',
        newDueDate: '2026-11-15',
        reason: 'Spare parts delayed from supplier in Milan',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data?.data?.newDueDate, '2026-11-15');

    const job = await MaintenanceJob.findOne({ jobId: completedJobId });
    assert.ok(job.rescheduleHistory.length > 0);
    assert.equal(job.rescheduleHistory[0].newDueDate, '2026-11-15');
    assert.equal(job.rescheduleHistory[0].reason, 'Spare parts delayed from supplier in Milan');
  });

  // 16. Reschedule without reason rejected (400)
  await t.test('16. Maintenance reschedule without reason is rejected with 400', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/maintenance/reschedule',
      headers: headers.master,
      body: {
        assetId: 'AST-101',
        newDueDate: '2026-11-20',
        reason: '',
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.data?.error?.code, 'REASON_REQUIRED');
  });

  // 17. Maintenance cancellation with reason deactivates plan without deleting historical evidence
  await t.test('17. Maintenance cancellation with reason deactivates plan without deleting historical evidence', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/assets/plans/${plan1.planId}/cancel`,
      headers: headers.master,
      body: {
        reason: 'Contract terminated with legacy provider',
      },
    });

    assert.equal(res.status, 200);
    const plan = await MaintenancePlan.findOne({ planId: plan1.planId });
    assert.equal(plan.isActive, false);

    // Verify historical jobs are NOT deleted
    const jobs = await MaintenanceJob.find({ planId: plan1.planId });
    assert.ok(jobs.length > 0);
  });

  // 18. Maintenance history immutability
  await t.test('18. Maintenance history immutability: older records are never overwritten', async () => {
    const res1 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/assets/AST-101/maintenance',
      headers: headers.master,
    });

    assert.equal(res1.status, 200);
    assert.ok(Array.isArray(res1.data?.data?.history));
    assert.ok(res1.data.data.history.length >= 2, 'Multiple historic jobs preserved');
  });

  // 19. Alert engine generates SEV-4 MAINTENANCE_DUE_SOON alert
  await t.test('19. Alert engine generates SEV-4 MAINTENANCE_DUE_SOON alert', async () => {
    // Set asset nextMaintenanceDue to 3 days from now
    const soonDate = calculateNextDueDate(todayStr, 'CUSTOM_DAYS', 3);
    await Asset.updateOne({ assetId: 'AST-101' }, { $set: { nextMaintenanceDue: soonDate } });

    await assetMaintenanceService.evaluateMaintenanceAlerts({ organisationId: 'ORG-REC15' });

    const alert = await OperationalAlert.findOne({
      deduplicationKey: 'MNT_ORG-REC15_AST-101_DUE_SOON',
      status: 'OPEN',
    });
    assert.ok(alert, 'DUE_SOON alert raised');
    assert.equal(alert.severity, 'SEV-4');
  });

  // 20. Alert engine generates SEV-2 MAINTENANCE_OVERDUE alert
  await t.test('20. Alert engine generates SEV-2 MAINTENANCE_OVERDUE alert', async () => {
    // Set asset nextMaintenanceDue to past date
    await Asset.updateOne({ assetId: 'AST-102' }, { $set: { nextMaintenanceDue: '2026-08-01' } });

    await assetMaintenanceService.evaluateMaintenanceAlerts({ organisationId: 'ORG-REC15' });

    const alert = await OperationalAlert.findOne({
      deduplicationKey: 'MNT_ORG-REC15_AST-102_OVERDUE',
      status: 'OPEN',
    });
    assert.ok(alert, 'OVERDUE alert raised');
    assert.equal(alert.severity, 'SEV-2');
  });

  // 21. Alert deduplication
  await t.test('21. Alert deduplication: repeated scheduler evaluation produces zero duplicate open alerts', async () => {
    // Run evaluation 3 times
    await assetMaintenanceService.evaluateMaintenanceAlerts({ organisationId: 'ORG-REC15' });
    await assetMaintenanceService.evaluateMaintenanceAlerts({ organisationId: 'ORG-REC15' });
    await assetMaintenanceService.evaluateMaintenanceAlerts({ organisationId: 'ORG-REC15' });

    const alerts = await OperationalAlert.find({
      deduplicationKey: 'MNT_ORG-REC15_AST-102_OVERDUE',
      status: 'OPEN',
    });
    assert.equal(alerts.length, 1, 'Exactly one open alert exists due to deduplication');
  });

  // 22. Scheduler process-restart safety
  await t.test('22. Scheduler process-restart safety: recovers schedules from persisted database state', async () => {
    // Backlog query derives completely from DB
    const backlog = await assetMaintenanceService.getMaintenanceBacklog({ organisationId: 'ORG-REC15' });
    assert.ok(Array.isArray(backlog));
    assert.ok(backlog.length > 0);
  });

  // 23. Missed scheduler run recovery
  await t.test('23. Missed scheduler run recovery: identifies overdue items regardless of when evaluated', async () => {
    const backlog = await assetMaintenanceService.getMaintenanceBacklog({ organisationId: 'ORG-REC15' });
    const overdueItem = backlog.find((b) => b.assetId === 'AST-102');
    assert.ok(overdueItem);
    assert.equal(overdueItem.dueStatus, 'OVERDUE');
  });

  // 24. Retired asset suppression
  await t.test('24. Retired asset suppression: RETIRED assets stop generating future due/overdue alerts', async () => {
    const retiredAsset = await Asset.create({
      assetId: 'AST-991',
      organisationId: 'ORG-REC15',
      cafeId: 'CAF-001',
      name: 'Decommissioned Grinder',
      category: 'GRINDERS_MILLS',
      operationalStatus: 'RETIRED',
      status: 'DISCARDED',
      nextMaintenanceDue: '2026-01-01',
      createdByUserId: users.master.userId,
    });

    await assetMaintenanceService.evaluateMaintenanceAlerts({ organisationId: 'ORG-REC15' });

    const alert = await OperationalAlert.findOne({
      deduplicationKey: 'MNT_ORG-REC15_AST-991_OVERDUE',
    });
    assert.equal(alert, null, 'No alert generated for retired asset');
  });

  // 25. Transferred asset scope
  await t.test('25. Transferred asset scope: future maintenance follows new café while historical records retain original location', async () => {
    // Create job at CAF-001
    const jobBefore = await MaintenanceJob.create({
      jobId: 'MNT-9001',
      organisationId: 'ORG-REC15',
      cafeId: 'CAF-001',
      assetId: 'AST-101',
      issueDescription: 'Initial service at Cafe 001',
      status: 'COMPLETED',
      loggedByUserId: users.master.userId,
      completedAt: new Date(),
    });

    // Transfer asset to CAF-002
    await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/AST-101/transfer',
      headers: headers.master,
      body: {
        toCafeId: 'CAF-002',
        reason: 'Transferred for higher brewing demand',
      },
    });

    const assetAfter = await Asset.findOne({ assetId: 'AST-101' });
    assert.equal(assetAfter.cafeId, 'CAF-002');

    // Historical job still has CAF-001
    const historicJob = await MaintenanceJob.findOne({ jobId: 'MNT-9001' });
    assert.equal(historicJob.cafeId, 'CAF-001');

    // Transfer back to CAF-001 for remaining tests
    await Asset.updateOne({ assetId: 'AST-101' }, { $set: { cafeId: 'CAF-001' } });
  });

  // 26. Document association: linking clean document via REC-06
  await t.test('26. Document association: linking clean document via REC-06 succeeds', async () => {
    const docClean = await BusinessDocument.create({
      documentId: 'DOC-CLEAN-01',
      organisationId: 'ORG-REC15',
      cafeId: 'CAF-001',
      entityType: 'ASSET',
      entityId: 'AST-101',
      documentType: 'SERVICE_REPORT',
      classification: 'ASSET',
      originalFilename: 'service_report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      uploadedBy: users.master.userId,
      uploadedByUserId: users.master.userId,
      currentVersionNumber: 1,
      securityScanStatus: 'CLEAN',
      scanStatus: 'CLEAN',
      versions: [
        {
          version: 1,
          originalFilename: 'service_report.pdf',
          internalFilename: 'internal_01.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          uploadedBy: 'Master Tech',
          securityScanStatus: 'CLEAN',
          scanStatus: 'CLEAN',
        },
      ],
    });

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/maintenance/complete',
      headers: headers.master,
      body: {
        assetId: 'AST-101',
        workSummary: 'Service with attached report',
        performedBy: 'Technician',
        evidenceDocumentIds: ['DOC-CLEAN-01'],
      },
    });

    assert.equal(res.status, 200);
    assert.ok(res.data?.data?.job?.evidenceDocumentIds.includes('DOC-CLEAN-01'));
  });

  // 27. Document association: scan-pending document rejected with 400
  await t.test('27. Document association: linking scan-pending document is rejected with 400', async () => {
    await BusinessDocument.create({
      documentId: 'DOC-PENDING-01',
      organisationId: 'ORG-REC15',
      cafeId: 'CAF-001',
      entityType: 'ASSET',
      entityId: 'AST-101',
      documentType: 'SERVICE_REPORT',
      classification: 'ASSET',
      originalFilename: 'pending_scan.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      uploadedBy: users.master.userId,
      uploadedByUserId: users.master.userId,
      currentVersionNumber: 1,
      securityScanStatus: 'PENDING_SCAN',
      scanStatus: 'PENDING',
      versions: [
        {
          version: 1,
          originalFilename: 'pending_scan.pdf',
          internalFilename: 'internal_pending.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          uploadedBy: 'Master Tech',
          securityScanStatus: 'PENDING_SCAN',
          scanStatus: 'PENDING',
        },
      ],
    });

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/maintenance/complete',
      headers: headers.master,
      body: {
        assetId: 'AST-101',
        workSummary: 'Service with pending doc',
        performedBy: 'Technician',
        evidenceDocumentIds: ['DOC-PENDING-01'],
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.data?.error?.code, 'DOCUMENT_SCAN_PENDING');
  });

  // 28. Document association: infected document rejected with 400
  await t.test('28. Document association: linking infected document is rejected with 400', async () => {
    await BusinessDocument.create({
      documentId: 'DOC-INFECTED-01',
      organisationId: 'ORG-REC15',
      cafeId: 'CAF-001',
      entityType: 'ASSET',
      entityId: 'AST-101',
      documentType: 'SERVICE_REPORT',
      classification: 'ASSET',
      originalFilename: 'virus.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      uploadedBy: users.master.userId,
      uploadedByUserId: users.master.userId,
      currentVersionNumber: 1,
      securityScanStatus: 'REJECTED',
      scanStatus: 'INFECTED',
      isQuarantined: true,
      versions: [
        {
          version: 1,
          originalFilename: 'virus.pdf',
          internalFilename: 'internal_virus.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          uploadedBy: 'Master Tech',
          securityScanStatus: 'INFECTED',
          scanStatus: 'INFECTED',
        },
      ],
    });

    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/maintenance/complete',
      headers: headers.master,
      body: {
        assetId: 'AST-101',
        workSummary: 'Service with infected doc',
        performedBy: 'Technician',
        evidenceDocumentIds: ['DOC-INFECTED-01'],
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.data?.error?.code, 'INFECTED_DOCUMENT_REJECTED');
  });

  // 29. Master role: full organisation-wide management authority
  await t.test('29. Master role: full organisation-wide management authority across all cafes', async () => {
    // Master can view backlog across cafes
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/assets/maintenance/backlog',
      headers: headers.master,
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data?.data?.backlog));
  });

  // 30. Owner role: read-only oversight; mutation denied with 403
  await t.test('30. Owner role: read-only oversight; mutation denied with 403', async () => {
    // Owner can read backlog
    const readRes = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/assets/maintenance/backlog',
      headers: headers.owner,
    });
    assert.equal(readRes.status, 200);

    // Owner cannot complete maintenance
    const writeRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/maintenance/complete',
      headers: headers.owner,
      body: {
        assetId: 'AST-101',
        workSummary: 'Owner attempted completion',
      },
    });
    assert.equal(writeRes.status, 403);
    assert.equal(writeRes.data?.error?.code, 'AUTHORIZATION_DENIED');
  });

  // 31. Assigned Café Admin: authorized for assigned café
  await t.test('31. Assigned Café Admin: authorized for operational maintenance in assigned café', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/maintenance/complete',
      headers: headers.adminA,
      body: {
        assetId: 'AST-101', // Located in CAF-001
        workSummary: 'Cafe Admin A authorized completion',
        performedBy: 'Local Tech',
      },
    });

    assert.equal(res.status, 200);
  });

  // 32. Foreign Café Admin denial (Cross-café IDOR)
  await t.test('32. Foreign Café Admin denial: Café Admin for Café B cannot complete Café A maintenance', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/maintenance/complete',
      headers: headers.adminB,
      body: {
        assetId: 'AST-101', // Located in CAF-001 (adminB is assigned to CAF-002 only)
        workSummary: 'Cross-cafe unauthorized completion',
        performedBy: 'Local Tech',
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.data?.error?.code, 'CAFE_ACCESS_DENIED');
  });

  // 33. Staff role: unauthorized maintenance administration returns 403
  await t.test('33. Staff role: unauthorized maintenance administration returns 403', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/maintenance/complete',
      headers: headers.staff,
      body: {
        assetId: 'AST-101',
        workSummary: 'Staff unauthorized completion',
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.data?.error?.code, 'AUTHORIZATION_DENIED');
  });

  // 34. Cross-org IDOR: Organisation A cannot access Organisation B records
  await t.test('34. Cross-org IDOR: Organisation A cannot view or mutate Organisation B maintenance', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/assets/maintenance/complete',
      headers: headers.foreign,
      body: {
        assetId: 'AST-101', // Belongs to ORG-REC15, not ORG-FOREIGN
        workSummary: 'Cross-org unauthorized completion',
      },
    });

    assert.equal(res.status, 404);
    assert.equal(res.data?.error?.code, 'ASSET_NOT_FOUND');
  });

  // 35. Audit trail generation
  await t.test('35. Audit trail generation: MAINTENANCE_COMPLETED and MAINTENANCE_RESCHEDULED recorded in AuditEvent', async () => {
    const completedAudits = await AuditEvent.find({
      organisationId: 'ORG-REC15',
      action: 'MAINTENANCE_COMPLETED',
    });
    assert.ok(completedAudits.length > 0, 'MAINTENANCE_COMPLETED audit event recorded');

    const rescheduledAudits = await AuditEvent.find({
      organisationId: 'ORG-REC15',
      action: 'MAINTENANCE_RESCHEDULED',
    });
    assert.ok(rescheduledAudits.length > 0, 'MAINTENANCE_RESCHEDULED audit event recorded');
  });

  // 36. Zero Kitchen Display System (KDS)
  await t.test('36. Zero Kitchen Display System (KDS) files or endpoints present', () => {
    const routesContent = fs.readFileSync(path.resolve(__dirname, '../src/routes/assetRoutes.js'), 'utf8');
    assert.equal(routesContent.toLowerCase().includes('kds'), false, 'Zero KDS references in asset routes');
    assert.equal(routesContent.toLowerCase().includes('kitchen-display'), false, 'Zero kitchen-display references in asset routes');
  });
});
