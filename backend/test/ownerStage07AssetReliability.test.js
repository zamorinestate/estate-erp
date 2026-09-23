'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 07: ASSET RELIABILITY & PREVENTIVE MAINTENANCE TEST SUITE
 * ============================================================================
 * Tests authoritative work order lifecycles, breakdown triage, food-safety integration,
 * zero-denominator MTBF/MTTR metrics, replacement indicators, and Stage 03 CAPEX links.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { Asset } = require('../src/models/Asset');
const { WorkOrder } = require('../src/models/WorkOrder');
const { AssetBreakdownLog } = require('../src/models/AssetBreakdownLog');
const { CalibrationRecord } = require('../src/models/CalibrationRecord');
const { CapexRequest } = require('../src/models/CapexRequest');
const ownerAssetReliabilityService = require('../src/services/ownerAssetReliabilityService');

describe('STAGE 07 — Asset Reliability & Preventive Maintenance Centre Suite', () => {
  const TEST_ORG = 'ORG-TEST-STAGE07';
  const FOREIGN_ORG = 'ORG-TEST-FOREIGN07';
  const CAFE_ID = 'CAF-001';
  const USER_OWNER = { userId: 'USR-OWNER-07', email: 'owner07@zamorin.com' };

  let espressoAssetId = 'AST-701';
  let fridgeAssetId = 'AST-702';

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/zamorin_erp_test';
      await mongoose.connect(uri);
    }

    // Clean test artifacts
    await Asset.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await WorkOrder.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await AssetBreakdownLog.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await CalibrationRecord.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await CapexRequest.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });

    // Seed test assets in existing Asset Master
    await Asset.create([
      {
        assetId: espressoAssetId,
        organisationId: TEST_ORG,
        cafeId: CAFE_ID,
        name: 'La Marzocco Linea PB 2-Group',
        category: 'COFFEE_MACHINE',
        criticality: 'CRITICAL',
        operationalStatus: 'IN_SERVICE',
        condition: 'GOOD',
        acquisitionCostPaisa: 85000000, // ₹8,50,000
        createdByUserId: USER_OWNER.userId,
      },
      {
        assetId: fridgeAssetId,
        organisationId: TEST_ORG,
        cafeId: CAFE_ID,
        name: 'Under-Counter Milk Chiller 300L',
        category: 'REFRIGERATION',
        criticality: 'CRITICAL',
        operationalStatus: 'IN_SERVICE',
        condition: 'GOOD',
        acquisitionCostPaisa: 12000000, // ₹1,20,000
        createdByUserId: USER_OWNER.userId,
      },
    ]);
  });

  after(async () => {
    await Asset.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await WorkOrder.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await AssetBreakdownLog.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await CalibrationRecord.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await CapexRequest.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await mongoose.disconnect();
  });

  test('1. Asset Master reuse: Verifies zero duplicate master and loads seeded assets', async () => {
    const assets = await Asset.find({ organisationId: TEST_ORG }).sort({ assetId: 1 });
    assert.equal(assets.length, 2);
    assert.equal(assets[0].name, 'La Marzocco Linea PB 2-Group');
  });

  test('2. Governed Work Order Lifecycle: PLANNED -> SCHEDULED -> IN_PROGRESS -> COMPLETED -> VERIFIED -> CLOSED', async () => {
    const wo = await ownerAssetReliabilityService.createWorkOrder(
      TEST_ORG,
      {
        assetId: espressoAssetId,
        title: 'Quarterly Group Head Overhaul',
        workType: 'PREVENTIVE_MAINTENANCE',
        priority: 'CRITICAL',
        description: 'Replace shower screens, group gaskets, and check solenoid valves.',
        dueDate: '2026-10-15',
      },
      USER_OWNER
    );

    assert.ok(wo.workOrderId);
    assert.equal(wo.status, 'PLANNED');

    // Progress through lifecycle
    const scheduled = await ownerAssetReliabilityService.updateWorkOrderStatus(TEST_ORG, wo.workOrderId, {
      targetStatus: 'SCHEDULED',
      user: USER_OWNER,
    });
    assert.equal(scheduled.status, 'SCHEDULED');

    const inProgress = await ownerAssetReliabilityService.updateWorkOrderStatus(TEST_ORG, wo.workOrderId, {
      targetStatus: 'IN_PROGRESS',
      user: USER_OWNER,
    });
    assert.equal(inProgress.status, 'IN_PROGRESS');
    assert.ok(inProgress.actualStartDate);

    const completed = await ownerAssetReliabilityService.updateWorkOrderStatus(TEST_ORG, wo.workOrderId, {
      targetStatus: 'COMPLETED',
      downtimeMinutes: 90,
      costPaisa: 750000,
      completionNotes: 'All gaskets and group screens replaced. Pressure test passed at 9.0 bar.',
      user: USER_OWNER,
    });
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.downtimeMinutes, 90);

    const verified = await ownerAssetReliabilityService.updateWorkOrderStatus(TEST_ORG, wo.workOrderId, {
      targetStatus: 'VERIFIED',
      user: USER_OWNER,
    });
    assert.equal(verified.status, 'VERIFIED');
    assert.ok(verified.verifiedByUserId);

    const closed = await ownerAssetReliabilityService.updateWorkOrderStatus(TEST_ORG, wo.workOrderId, {
      targetStatus: 'CLOSED',
      user: USER_OWNER,
    });
    assert.equal(closed.status, 'CLOSED');
  });

  test('3. Illegal Work Order transition jump is strictly rejected', async () => {
    const wo = await ownerAssetReliabilityService.createWorkOrder(
      TEST_ORG,
      {
        assetId: espressoAssetId,
        title: 'Emergency Steam Wand Leak',
        workType: 'CORRECTIVE_REPAIR',
        description: 'Steam wand valve leaking.',
      },
      USER_OWNER
    );
    assert.equal(wo.status, 'PLANNED');

    // Illegal jump: PLANNED directly to CLOSED
    await assert.rejects(
      async () => {
        await ownerAssetReliabilityService.updateWorkOrderStatus(TEST_ORG, wo.workOrderId, {
          targetStatus: 'CLOSED',
          user: USER_OWNER,
        });
      },
      (err) => err.message.includes('INVALID_WORK_ORDER_TRANSITION')
    );
  });

  test('4. Work Order Cancellation requires mandatory justification reason', async () => {
    const wo = await ownerAssetReliabilityService.createWorkOrder(
      TEST_ORG,
      {
        assetId: espressoAssetId,
        title: 'Unneeded inspection',
        workType: 'INSPECTION',
        description: 'Redundant visual check',
      },
      USER_OWNER
    );

    // Missing reason must fail
    await assert.rejects(
      async () => {
        await ownerAssetReliabilityService.updateWorkOrderStatus(TEST_ORG, wo.workOrderId, {
          targetStatus: 'CANCELLED',
          reason: '',
          user: USER_OWNER,
        });
      },
      (err) => err.message.includes('MANDATORY_REASON_REQUIRED_FOR_CANCELLATION')
    );

    // With reason must succeed
    const cancelled = await ownerAssetReliabilityService.updateWorkOrderStatus(TEST_ORG, wo.workOrderId, {
      targetStatus: 'CANCELLED',
      reason: 'Superseded by quarterly preventive overhaul scheduled tomorrow.',
      user: USER_OWNER,
    });
    assert.equal(cancelled.status, 'CANCELLED');
  });

  test('5. Breakdown Logging & Food-Safety Link: Category REFRIGERATION flags review candidate without auto-violation', async () => {
    const breakdown = await ownerAssetReliabilityService.reportBreakdown(
      TEST_ORG,
      {
        assetId: fridgeAssetId,
        title: 'Chiller Compressor Tripping',
        failureDescription: 'Temperature gauge indicates chamber rising to 9°C. Target is <4°C.',
      },
      USER_OWNER
    );

    assert.ok(breakdown.breakdownId);
    assert.equal(breakdown.status, 'REPORTED');
    assert.equal(breakdown.foodSafetyRiskIdentified, true);
    assert.equal(breakdown.foodSafetyReviewCandidate.isCandidate, true);
    assert.ok(breakdown.foodSafetyReviewCandidate.triageNotes.includes('food-safety critical'));

    // Verify asset status changed to UNDER_MAINTENANCE
    const asset = await Asset.findOne({ organisationId: TEST_ORG, assetId: fridgeAssetId });
    assert.equal(asset.operationalStatus, 'UNDER_MAINTENANCE');
  });

  test('6. Governed Breakdown lifecycle: REPORTED -> TRIAGED -> ISOLATED -> REPAIRING -> TESTING -> RETURNED_TO_SERVICE -> CLOSED', async () => {
    const breakdown = await ownerAssetReliabilityService.reportBreakdown(
      TEST_ORG,
      {
        assetId: espressoAssetId,
        title: 'Boiler Element Short Circuit',
        failureDescription: 'Heating element tripped main circuit breaker.',
      },
      USER_OWNER
    );

    // TRIAGED
    const triaged = await ownerAssetReliabilityService.updateBreakdownStatus(TEST_ORG, breakdown.breakdownId, {
      targetStatus: 'TRIAGED',
      user: USER_OWNER,
    });
    assert.equal(triaged.status, 'TRIAGED');

    // ISOLATED
    const isolated = await ownerAssetReliabilityService.updateBreakdownStatus(TEST_ORG, breakdown.breakdownId, {
      targetStatus: 'ISOLATED',
      user: USER_OWNER,
    });
    assert.equal(isolated.status, 'ISOLATED');
    assert.equal(isolated.safetyIsolationConfirmed, true);

    // REPAIRING
    const repairing = await ownerAssetReliabilityService.updateBreakdownStatus(TEST_ORG, breakdown.breakdownId, {
      targetStatus: 'REPAIRING',
      user: USER_OWNER,
    });
    assert.equal(repairing.status, 'REPAIRING');

    // TESTING
    const testing = await ownerAssetReliabilityService.updateBreakdownStatus(TEST_ORG, breakdown.breakdownId, {
      targetStatus: 'TESTING',
      downtimeMinutes: 180,
      repairCostPaisa: 1500000,
      partsCostPaisa: 2200000,
      rootCause: 'Calcium scale buildup caused dry-fire heating element rupture.',
      user: USER_OWNER,
    });
    assert.equal(testing.status, 'TESTING');
    assert.equal(testing.downtimeMinutes, 180);

    // RETURNED_TO_SERVICE
    const returned = await ownerAssetReliabilityService.updateBreakdownStatus(TEST_ORG, breakdown.breakdownId, {
      targetStatus: 'RETURNED_TO_SERVICE',
      user: USER_OWNER,
    });
    assert.equal(returned.status, 'RETURNED_TO_SERVICE');

    // CLOSED
    const closed = await ownerAssetReliabilityService.updateBreakdownStatus(TEST_ORG, breakdown.breakdownId, {
      targetStatus: 'CLOSED',
      user: USER_OWNER,
    });
    assert.equal(closed.status, 'CLOSED');
    assert.ok(closed.closedAt);

    // Asset restored to IN_SERVICE
    const asset = await Asset.findOne({ organisationId: TEST_ORG, assetId: espressoAssetId });
    assert.equal(asset.operationalStatus, 'IN_SERVICE');
  });

  test('7. Calibration Log: Records precision equipment calibration and updates asset status', async () => {
    // Seed thermometer asset
    const probeId = 'AST-703';
    await Asset.create({
      assetId: probeId,
      organisationId: TEST_ORG,
      cafeId: CAFE_ID,
      name: 'Digitron Food Core Thermometer',
      category: 'MEASUREMENT_CALIBRATION',
      calibrationRequired: true,
      createdByUserId: USER_OWNER.userId,
    });

    const cal = await ownerAssetReliabilityService.recordCalibration(
      TEST_ORG,
      {
        assetId: probeId,
        equipmentType: 'PROBE_THERMOMETER',
        result: 'PASS',
        certificateNumber: 'CERT-NABL-2026-0988',
        nextDueDate: '2027-09-14',
        performedBy: 'Calitech NABL Accredited Laboratory',
        remarks: 'Calibrated at -18°C, 0°C, and 100°C ice/boiling points. Deviation within ±0.2°C.',
      },
      USER_OWNER
    );

    assert.ok(cal.calibrationId);
    assert.equal(cal.result, 'PASS');
    assert.equal(cal.status, 'VALID');

    const asset = await Asset.findOne({ organisationId: TEST_ORG, assetId: probeId });
    assert.equal(asset.calibrationStatus, 'CURRENT');
    assert.equal(asset.nextCalibrationDue, '2027-09-14');
  });

  test('8. Authoritative MTBF/MTTR Metrics with Zero-Denominator Safety (NO NaN or Infinity)', async () => {
    // Probe thermometer has ZERO failures and ZERO repairs
    const metrics = await ownerAssetReliabilityService.getAssetReliabilityMetrics(TEST_ORG, 'AST-703', 90);

    assert.equal(metrics.assetId, 'AST-703');
    assert.equal(metrics.failuresCount, 0);
    assert.equal(metrics.mtbf.hours, null);
    assert.equal(metrics.mtbf.status, 'NO_FAILURES_RECORDED');
    assert.equal(typeof metrics.mtbf.hours !== 'number' || !Number.isNaN(metrics.mtbf.hours), true);

    assert.equal(metrics.repairsCount, 0);
    assert.equal(metrics.mttr.hours, null);
    assert.equal(metrics.mttr.status, 'NO_REPAIRS_RECORDED');
    assert.equal(typeof metrics.mttr.hours !== 'number' || !Number.isNaN(metrics.mttr.hours), true);

    assert.equal(metrics.uptime.percentage, 100);
    assert.ok(metrics.uptime.formula);
  });

  test('9. Replacement Decision Indicators: Flags chronic failure asset without automatic disposal', async () => {
    // Log additional failures and high maintenance costs for fridge
    await AssetBreakdownLog.create([
      {
        breakdownId: 'BRK-SEED-01',
        organisationId: TEST_ORG,
        cafeId: CAFE_ID,
        assetId: fridgeAssetId,
        title: 'Freon Gas Leak',
        failureDescription: 'System lost charge',
        status: 'CLOSED',
        downtimeMinutes: 300,
        repairCostPaisa: 3000000,
        partsCostPaisa: 2500000,
        reportedByUserId: USER_OWNER.userId,
      },
      {
        breakdownId: 'BRK-SEED-02',
        organisationId: TEST_ORG,
        cafeId: CAFE_ID,
        assetId: fridgeAssetId,
        title: 'Thermostat Failure',
        failureDescription: 'Thermostat sticking',
        status: 'CLOSED',
        downtimeMinutes: 200,
        repairCostPaisa: 2000000,
        partsCostPaisa: 1500000,
        reportedByUserId: USER_OWNER.userId,
      },
      {
        breakdownId: 'BRK-SEED-03',
        organisationId: TEST_ORG,
        cafeId: CAFE_ID,
        assetId: fridgeAssetId,
        title: 'Condenser Fan Motor Seized',
        failureDescription: 'Motor burnt out',
        status: 'CLOSED',
        downtimeMinutes: 240,
        repairCostPaisa: 1800000,
        partsCostPaisa: 1200000,
        reportedByUserId: USER_OWNER.userId,
      },
    ]);

    const indicators = await ownerAssetReliabilityService.getReplacementIndicators(TEST_ORG, fridgeAssetId);

    assert.equal(indicators.assetId, fridgeAssetId);
    assert.equal(indicators.isReplacementRecommended, true);
    assert.ok(indicators.recentBreakdownCount >= 3);
    assert.ok(indicators.cumulativeMaintenanceSpendPaisa > 6000000); // Exceeded 50% of ₹1,20,000 acquisition cost
    assert.ok(indicators.decisionNotice.includes('Decision indicator only'));
    assert.ok(indicators.decisionNotice.includes('Does NOT constitute automatic disposal'));

    // Verify asset is NOT deleted or auto-disposed
    const assetStillExists = await Asset.findOne({ organisationId: TEST_ORG, assetId: fridgeAssetId });
    assert.ok(assetStillExists);
  });

  test('10. Governed Replacement -> Stage 03 CAPEX Linkage: Initiates CAPEX in REQUESTED status with zero bypass', async () => {
    const capex = await ownerAssetReliabilityService.linkReplacementToCapex(
      TEST_ORG,
      fridgeAssetId,
      {
        title: 'Replacement of Under-Counter Milk Chiller (AST-702)',
        category: 'HVAC_REFRIGERATION',
        purpose: 'Chronic refrigerant leaks and high repair costs compromising food safety temperature standards.',
        estimatedCostPaisa: 15000000,
        expectedBenefits: 'Restore reliable milk temperature holding, reduce breakdown downtime, zero Freon leakage.',
      },
      USER_OWNER
    );

    assert.ok(capex.requestId);
    assert.equal(capex.status, 'REQUESTED'); // Must be strictly REQUESTED, requiring Stage 03 dual approval
    assert.equal(capex.linkedAssetId, fridgeAssetId);
    assert.ok(capex.auditHistory.some((a) => a.action === 'CAPEX_REQUESTED_FROM_ASSET_RELIABILITY'));
  });

  test('11. Multi-Tenant IDOR: Foreign organisation denied access to asset reliability resources', async () => {
    await assert.rejects(
      async () => {
        await ownerAssetReliabilityService.getAssetReliabilityMetrics(FOREIGN_ORG, espressoAssetId);
      },
      (err) => err.message.includes('ASSET_NOT_FOUND')
    );

    await assert.rejects(
      async () => {
        await ownerAssetReliabilityService.getReplacementIndicators(FOREIGN_ORG, fridgeAssetId);
      },
      (err) => err.message.includes('ASSET_NOT_FOUND')
    );
  });
});
