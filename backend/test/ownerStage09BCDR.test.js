'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 09: BCDR TEST SUITE
 * ============================================================================
 * Tests Business Impact Analysis (BIA), DR Drill lifecycles, backup integrity
 * reporting (simulation vs provider verified), and the core financial invariant:
 * NO SERVER ACKNOWLEDGEMENT = NO COMPLETED ERP FINANCIAL SALE.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { BusinessImpactProcess } = require('../src/models/BusinessImpactProcess');
const { DisasterRecoveryDrill } = require('../src/models/DisasterRecoveryDrill');
const ownerBcdrService = require('../src/services/ownerBcdrService');

describe('STAGE 09 — Business Continuity & Disaster Recovery Centre Suite', () => {
  const TEST_ORG = 'ORG-TEST-STAGE09';
  const FOREIGN_ORG = 'ORG-TEST-FOREIGN09';
  const USER_OWNER = { userId: 'USR-OWNER-09', email: 'owner09@zamorin.com' };

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/zamorin_erp_test';
      await mongoose.connect(uri);
    }

    await BusinessImpactProcess.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await DisasterRecoveryDrill.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
  });

  after(async () => {
    await BusinessImpactProcess.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await DisasterRecoveryDrill.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await mongoose.disconnect();
  });

  test('1. BIA Critical Process: Registers POS Billing with target RTO/RPO and financial safety notice', async () => {
    const proc = await ownerBcdrService.registerBusinessProcess(TEST_ORG, {
      processName: 'POS_ORDER_BILLING',
      criticalityTier: 'MISSION_CRITICAL',
      ownerRole: 'Head of Retail Cafe Operations',
      maxAcceptableInterruptionMinutes: 30,
      targetRtoMinutes: 15,
      targetRpoMinutes: 0,
      financialImpactPerHourPaisa: 5000000,
      foodSafetyImpactDescription: 'None; orders buffered locally',
      dependencies: [
        { dependencyType: 'DATABASE', entityName: 'MongoDB Primary Cluster', isRedundant: true },
        { dependencyType: 'NETWORK', entityName: 'Cafe Dual WAN Broadband', isRedundant: true },
      ],
      offlineFallbackMechanism: 'Local terminal draft cart buffer + physical paper receipt pad',
    });

    assert.ok(proc.processId);
    assert.equal(proc.criticalityTier, 'MISSION_CRITICAL');
    assert.equal(proc.targetRtoMinutes, 15);
    assert.equal(proc.rtoRpoStatus, 'TARGET_ESTABLISHED_PENDING_DRILL_PROOF');
    assert.ok(proc.offlineFinancialInvariant.includes('NO SERVER ACKNOWLEDGEMENT = NO COMPLETED ERP FINANCIAL SALE'));
  });

  test('2. RTO/RPO Target distinction: Targets are explicitly not marked as achieved until drill proof', async () => {
    const list = await ownerBcdrService.getBusinessProcesses(TEST_ORG);
    assert.equal(list.length, 1);
    assert.equal(list[0].rtoRpoStatus, 'TARGET_ESTABLISHED_PENDING_DRILL_PROOF');
  });

  test('3. DR Drill Planning: Planned drill starts strictly in PLANNED status (never auto-executed)', async () => {
    const drill = await ownerBcdrService.planDrill(
      TEST_ORG,
      {
        title: 'Q3 Cafe Internet Outage & Offline POS Buffer Simulation',
        scenarioType: 'INTERNET_OUTAGE',
        scope: 'Simulate 60-minute WAN disconnection across flagship cafe terminal.',
        targetRtoMinutes: 20,
        targetRpoMinutes: 5,
      },
      USER_OWNER
    );

    assert.ok(drill.drillId);
    assert.equal(drill.status, 'PLANNED'); // Never auto-executed!
    assert.equal(drill.isSimulation, true);
    assert.equal(drill.isProviderVerified, false);
    assert.equal(drill.providerEvidenceStatus, 'SIMULATION_ONLY');
  });

  test('4. Governed DR Drill Lifecycle: PLANNED -> APPROVED -> EXECUTED -> RESULTS_RECORDED -> VERIFIED -> CLOSED', async () => {
    const drill = await ownerBcdrService.planDrill(
      TEST_ORG,
      {
        title: 'Primary MongoDB Read Replica Failover Test',
        scenarioType: 'DATABASE_OUTAGE',
        scope: 'Trigger simulated primary DB stepdown and verify replica election.',
        targetRtoMinutes: 5,
        targetRpoMinutes: 0,
      },
      USER_OWNER
    );

    // APPROVED
    const approved = await ownerBcdrService.updateDrillStatus(TEST_ORG, drill.drillId, {
      targetStatus: 'APPROVED',
      user: USER_OWNER,
    });
    assert.equal(approved.status, 'APPROVED');

    // EXECUTED
    const executed = await ownerBcdrService.updateDrillStatus(TEST_ORG, drill.drillId, {
      targetStatus: 'EXECUTED',
      user: USER_OWNER,
    });
    assert.equal(executed.status, 'EXECUTED');
    assert.ok(executed.executedAt);

    // RESULTS_RECORDED
    const recorded = await ownerBcdrService.updateDrillStatus(TEST_ORG, drill.drillId, {
      targetStatus: 'RESULTS_RECORDED',
      observedRtoMinutes: 3,
      observedRpoMinutes: 0,
      findings: [
        {
          issueDescription: 'Read replica elected in 180 seconds; connection pool re-established seamlessly.',
          severity: 'LOW',
          correctiveAction: 'Maintain current timeout configuration.',
        },
      ],
      user: USER_OWNER,
    });
    assert.equal(recorded.status, 'RESULTS_RECORDED');
    assert.equal(recorded.observedRtoMinutes, 3);

    // VERIFIED
    const verified = await ownerBcdrService.updateDrillStatus(TEST_ORG, drill.drillId, {
      targetStatus: 'VERIFIED',
      user: USER_OWNER,
    });
    assert.equal(verified.status, 'VERIFIED');

    // CLOSED
    const closed = await ownerBcdrService.updateDrillStatus(TEST_ORG, drill.drillId, {
      targetStatus: 'CLOSED',
      closureNotes: 'Drill verified by CTO. Observed RTO (3 mins) satisfied target (5 mins).',
      user: USER_OWNER,
    });
    assert.equal(closed.status, 'CLOSED');
  });

  test('5. Illegal DR Drill transition jump is strictly rejected', async () => {
    const drill = await ownerBcdrService.planDrill(
      TEST_ORG,
      {
        title: 'Power failure drill',
        scenarioType: 'CAFE_POWER_OUTAGE',
        scope: 'Inverter switchover test',
      },
      USER_OWNER
    );

    // Cannot jump from PLANNED directly to CLOSED or EXECUTED
    await assert.rejects(
      async () => {
        await ownerBcdrService.updateDrillStatus(TEST_ORG, drill.drillId, {
          targetStatus: 'CLOSED',
          user: USER_OWNER,
        });
      },
      (err) => err.message.includes('INVALID_DRILL_TRANSITION')
    );
  });

  test('6. Backup Health & Provider Verification: Factual distinction between configured and provider-verified', async () => {
    const backup = await ownerBcdrService.getBackupStatus(TEST_ORG);

    assert.equal(backup.database.status, 'ENGINEERING_CONFIGURATION_ACTIVE');
    assert.equal(backup.database.isProviderRestoreVerified, false); // Zero fake provider claim!
    assert.ok(backup.database.providerBlockerNotice.includes('Local simulation does NOT constitute provider proof'));
    assert.equal(backup.offlineFinancialSafety.invariant, 'NO SERVER ACKNOWLEDGEMENT = NO COMPLETED ERP FINANCIAL SALE');
  });

  test('7. Frozen Financial Invariant: Rejects offline completed sale and offline GST numbering', () => {
    // Attempting completed financial sale while disconnected must throw
    assert.throws(
      () => {
        ownerBcdrService.validateSaleSyncState({
          isServerAcknowledged: false,
          isFinalFinancialSale: true,
          items: [{ name: 'Cappuccino', paisa: 25000 }],
        });
      },
      (err) => err.message.includes('OFFLINE_FINANCIAL_SALE_PROHIBITED')
    );

    // Attempting offline GST numbering while disconnected must throw
    assert.throws(
      () => {
        ownerBcdrService.validateSaleSyncState({
          isServerAcknowledged: false,
          isFinalFinancialSale: false,
          taxInvoiceNumber: 'INV-2026-09-0099',
        });
      },
      (err) => err.message.includes('OFFLINE_GST_NUMBER_PROHIBITED')
    );

    // Offline draft cart buffer is safely permitted
    const offlineDraft = ownerBcdrService.validateSaleSyncState({
      isServerAcknowledged: false,
      isFinalFinancialSale: false,
      taxInvoiceNumber: null,
      items: [{ name: 'Espresso', paisa: 18000 }],
    });
    assert.equal(offlineDraft.isValid, true);
    assert.equal(offlineDraft.status, 'OFFLINE_DRAFT_CART_PRESERVED');
    assert.equal(offlineDraft.financialPostingAllowed, false);

    // Invariant: NO SERVER AUTHORIZATION = NO NEW PRIVILEGED SERVER ACTION
    assert.throws(
      () => {
        ownerBcdrService.validatePrivilegedActionState({
          isServerAuthorized: false,
          isPrivilegedAction: true,
          action: 'EXECUTE_PAYROLL_DISBURSEMENT',
        });
      },
      (err) => err.message.includes('NO SERVER AUTHORIZATION = NO NEW PRIVILEGED SERVER ACTION')
    );

    const safeOfflineRead = ownerBcdrService.validatePrivilegedActionState({
      isServerAuthorized: false,
      isPrivilegedAction: false,
      action: 'PRESERVE_LOCAL_UI_SESSION_STATE',
    });
    assert.equal(safeOfflineRead.isValid, true);
    assert.equal(safeOfflineRead.status, 'CACHED_LOCAL_STATE_PRESERVED_READ_ONLY');
    assert.equal(safeOfflineRead.serverExecutionAllowed, false);
  });

  test('8. Multi-Tenant IDOR: Foreign organisation cannot see test organisation BIA or drills', async () => {
    const foreignProcesses = await ownerBcdrService.getBusinessProcesses(FOREIGN_ORG);
    assert.equal(foreignProcesses.length, 0);

    const foreignDashboard = await ownerBcdrService.getExecutiveBcdrDashboard(FOREIGN_ORG);
    assert.equal(foreignDashboard.totalProcessesCount, 0);
    assert.equal(foreignDashboard.plannedDrillsCount, 0);
  });
});
