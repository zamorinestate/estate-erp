'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 14: UTILITIES, WASTE & ENERGY TEST SUITE
 * ============================================================================
 * Tests:
 * 1. Utility Meter Registration: Registers electricity, water, and gas meters.
 * 2. Meter Reading Intake & Rollover: Correctly calculates consumption & detects rollover.
 * 3. Reading Anomaly Detection: Flags consumption exceeding baseline threshold by >35%.
 * 4. Waste Recording & Inventory Linkage: Prevents financial double counting with WastageRecord.
 * 5. Used Cooking Oil (RUCO): Enforces 25% TPC limit & permanent food inventory reentry prohibition.
 * 6. SWM 2026 Legal Applicability: Evaluates MoEFCC S.O. 388(E) BWG 100 kg/day threshold.
 * 7. Normalized KPI Aggregations: Zero-division protected intensity metrics.
 * 8. Multi-Tenant IDOR Isolation: Strictly restricts meter queries to owning organisation.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const UtilityMeter = require('../src/models/UtilityMeter');
const UtilityReading = require('../src/models/UtilityReading');
const WasteRecord = require('../src/models/WasteRecord');
const UsedCookingOilLog = require('../src/models/UsedCookingOilLog');
const SolidWaste2026Applicability = require('../src/models/SolidWaste2026Applicability');
const BillModule = require('../src/models/Bill');
const Bill = BillModule.Bill || BillModule;
const ownerUtilitiesWasteService = require('../src/services/ownerUtilitiesWasteService');

describe('STAGE 14 — Utilities, Waste & Energy Management Suite', () => {
  const TEST_ORG = new mongoose.Types.ObjectId().toString().toUpperCase();
  const FOREIGN_ORG = new mongoose.Types.ObjectId().toString().toUpperCase();
  const TEST_CAFE = new mongoose.Types.ObjectId().toString();

  const USER_OWNER = { userId: 'USR-OWNER-14', email: 'owner14@zamorin.com', role: 'OWNER' };

  let testElectricityMeterId;
  let testWaterMeterId;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/zamorin_erp_test';
      await mongoose.connect(uri);
    }

    await UtilityMeter.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await UtilityReading.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await WasteRecord.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await UsedCookingOilLog.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await SolidWaste2026Applicability.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await Bill.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
  });

  test('1. Utility Meter Registration: Registers electricity and water meters at café level', async () => {
    const eleMeter = await ownerUtilitiesWasteService.registerMeter(TEST_ORG, {
      cafeId: TEST_CAFE,
      utilityCategory: 'ELECTRICITY',
      meterName: 'Main Kitchen Electricity',
      meterIdentifier: 'KSEB-ZC01-001',
      providerName: 'KSEB Commercial',
      unitOfMeasure: 'KWH',
      baselineMonthlyConsumption: 1200
    }, USER_OWNER);

    assert.ok(eleMeter.meterId);
    assert.equal(eleMeter.utilityCategory, 'ELECTRICITY');
    assert.equal(eleMeter.baselineMonthlyConsumption, 1200);
    testElectricityMeterId = eleMeter.meterId;

    const waterMeter = await ownerUtilitiesWasteService.registerMeter(TEST_ORG, {
      cafeId: TEST_CAFE,
      utilityCategory: 'WATER',
      meterName: 'Main Water Inflow',
      meterIdentifier: 'KWA-ZC01-002',
      providerName: 'Kerala Water Authority',
      unitOfMeasure: 'LITRE',
      baselineMonthlyConsumption: 15000
    }, USER_OWNER);

    assert.ok(waterMeter.meterId);
    assert.equal(waterMeter.utilityCategory, 'WATER');
    testWaterMeterId = waterMeter.meterId;
  });

  test('2. Meter Reading Intake & Rollover: Correctly calculates consumption & detects rollover', async () => {
    // Normal reading
    const reading1 = await ownerUtilitiesWasteService.recordMeterReading(TEST_ORG, {
      meterId: testElectricityMeterId,
      startReading: 1000,
      endReading: 1250,
      periodStart: new Date('2026-08-01'),
      periodEnd: new Date('2026-08-15')
    }, USER_OWNER);

    assert.equal(reading1.consumption, 250);
    assert.equal(reading1.isAnomaly, false);

    // Negative reading without rollover rejected
    await assert.rejects(
      async () => {
        await ownerUtilitiesWasteService.recordMeterReading(TEST_ORG, {
          meterId: testElectricityMeterId,
          startReading: 1250,
          endReading: 1100, // Negative without being near 99999 rollover
          periodStart: new Date('2026-08-16'),
          periodEnd: new Date('2026-08-31')
        }, USER_OWNER);
      },
      (err) => err.message.includes('NEGATIVE_CONSUMPTION_DETECTED')
    );

    // Rollover reading (e.g. 99500 to 00200 = 700)
    const rolloverReading = await ownerUtilitiesWasteService.recordMeterReading(TEST_ORG, {
      meterId: testElectricityMeterId,
      startReading: 99500,
      endReading: 200,
      periodStart: new Date('2026-09-01'),
      periodEnd: new Date('2026-09-15')
    }, USER_OWNER);

    assert.equal(rolloverReading.consumption, 700);
  });

  test('3. Reading Anomaly Detection: Flags consumption exceeding baseline threshold (35% default policy, configurable)', async () => {
    // 1. Default policy (35%): Baseline is 1200. A single period reading of 1750 is 45.8% above 1200 (> 35% default)
    const anomalyReading = await ownerUtilitiesWasteService.recordMeterReading(TEST_ORG, {
      meterId: testElectricityMeterId,
      startReading: 2000,
      endReading: 3750, // consumption = 1750 (45.8% above baseline 1200)
      periodStart: new Date('2026-09-16'),
      periodEnd: new Date('2026-09-30')
    }, USER_OWNER);

    assert.equal(anomalyReading.consumption, 1750);
    assert.equal(anomalyReading.isAnomaly, true);
    assert.ok(anomalyReading.anomalyReason.includes('above monthly baseline'));

    // 2. Configurable / Scoped override: Setting anomalyThresholdPercent to 50% ensures a 45.8% surge is NOT flagged
    const nonAnomalyWithCustomThreshold = await ownerUtilitiesWasteService.recordMeterReading(TEST_ORG, {
      meterId: testElectricityMeterId,
      startReading: 4000,
      endReading: 5750, // consumption = 1750 (45.8% above baseline 1200)
      periodStart: new Date('2026-10-01'),
      periodEnd: new Date('2026-10-15'),
      anomalyThresholdPercent: 50 // Configurable override policy
    }, USER_OWNER);

    assert.equal(nonAnomalyWithCustomThreshold.consumption, 1750);
    assert.equal(nonAnomalyWithCustomThreshold.isAnomaly, false);
  });

  test('4. Waste Recording & Inventory Linkage: Prevents financial double counting with WastageRecord', async () => {
    const wasteRecord = await ownerUtilitiesWasteService.recordWaste(TEST_ORG, {
      cafeId: TEST_CAFE,
      wasteCategory: 'FOOD_WASTE',
      quantity: 12.5,
      unitOfMeasure: 'KG',
      wasteReason: 'Trimmings and prep scrap',
      disposalRoute: 'MUNICIPAL_COLLECTION',
      inventoryWastageId: 'WAST-202609-001'
    }, USER_OWNER);

    assert.ok(wasteRecord.wasteId);
    assert.equal(wasteRecord.quantity, 12.5);
    assert.equal(wasteRecord.isDoubleCountingPrevented, true);
  });

  test('5. Used Cooking Oil (RUCO): Enforces 25% TPC limit, authorised pathways & reentry prohibition', async () => {
    // Safe oil (< 25% TPC) with authorized aggregator
    const safeUco = await ownerUtilitiesWasteService.recordUsedCookingOil(TEST_ORG, {
      cafeId: TEST_CAFE,
      oilType: 'PALMOLEIN_BLENDED',
      totalPolarCompoundsPercent: 18.5,
      quantityLiters: 15,
      collectorName: 'Malabar Bio-Aggregators LLP',
      collectorFssaiRegistration: 'FSSAI-RUCO-KL-9988',
      collectorAgencyType: 'AGGREGATOR'
    }, USER_OWNER);

    assert.equal(safeUco.reentryBlocked, true);
    assert.ok(safeUco.tpcSafetyAlert.includes('within lawful food safety limits'));
    assert.ok(safeUco.rucoFrameworkNotice.includes('No universal FBO RUCO registration'));

    // Non-food industrial production unit pathway (e.g. soap/oleochemicals)
    const industrialUco = await ownerUtilitiesWasteService.recordUsedCookingOil(TEST_ORG, {
      cafeId: TEST_CAFE,
      oilType: 'SUNFLOWER_OIL',
      totalPolarCompoundsPercent: 26.5,
      quantityLiters: 25,
      collectorName: 'Kalyan Industrial Soaps Ltd',
      collectorFssaiRegistration: 'PCB-IND-DISPOSAL-4411',
      collectorAgencyType: 'NON_FOOD_PRODUCTION_UNIT'
    }, USER_OWNER);

    assert.equal(industrialUco.reentryBlocked, true);
    assert.ok(industrialUco.tpcSafetyAlert.includes('CRITICAL_SAFETY_ALERT: TPC exceeds 25.0% FSSAI limit'));
  });

  test('6. SWM 2026 Legal Applicability: Complete CPCB BWG Test Matrix & 4 Statutory Streams', async () => {
    // 1. None triggered (standard café): 250 m², 1,500 L/d water, 15 kg/d waste
    const stdEval = await ownerUtilitiesWasteService.evaluateSWM2026Applicability(TEST_ORG, TEST_CAFE, USER_OWNER, {
      floorAreaSqMetres: 250,
      dailyWaterConsumptionLitres: 1500,
      averageDailyWasteGeneratedKg: 15
    });
    assert.equal(stdEval.isBulkWasteGenerator, false);
    assert.equal(stdEval.bwgClassificationCriteria, 'NONE_TRIGGERED_STANDARD_GENERATOR');
    assert.deepEqual(stdEval.mandatedSegregationStreams, ['WET', 'DRY', 'SANITARY', 'SPECIAL_CARE']);
    assert.equal(stdEval.localBodyRegistrationRequired, false);

    // 2. Floor Area Threshold trigger (>= 20,000 m²) alone
    const areaEval = await ownerUtilitiesWasteService.evaluateSWM2026Applicability(TEST_ORG, TEST_CAFE, USER_OWNER, {
      floorAreaSqMetres: 20500,
      dailyWaterConsumptionLitres: 1500,
      averageDailyWasteGeneratedKg: 15
    });
    assert.equal(areaEval.isBulkWasteGenerator, true);
    assert.ok(areaEval.bwgCriteriaTriggered.includes('FLOOR_AREA_GE_20000_SQM'));

    // 3. Water Consumption Threshold trigger (>= 40,000 L/day) alone
    const waterEval = await ownerUtilitiesWasteService.evaluateSWM2026Applicability(TEST_ORG, TEST_CAFE, USER_OWNER, {
      floorAreaSqMetres: 250,
      dailyWaterConsumptionLitres: 42000,
      averageDailyWasteGeneratedKg: 15
    });
    assert.equal(waterEval.isBulkWasteGenerator, true);
    assert.ok(waterEval.bwgCriteriaTriggered.includes('WATER_CONSUMPTION_GE_40000_L_DAY'));

    // 4. Waste Generation Threshold trigger (>= 100 kg/day) alone
    const wasteEval = await ownerUtilitiesWasteService.evaluateSWM2026Applicability(TEST_ORG, TEST_CAFE, USER_OWNER, {
      floorAreaSqMetres: 250,
      dailyWaterConsumptionLitres: 1500,
      averageDailyWasteGeneratedKg: 120
    });
    assert.equal(wasteEval.isBulkWasteGenerator, true);
    assert.ok(wasteEval.bwgCriteriaTriggered.includes('SOLID_WASTE_GE_100_KG_DAY'));

    // 5. Each just below threshold: 19,900 m², 39,500 L/d water, 95 kg/d waste -> NOT BWG
    const belowEval = await ownerUtilitiesWasteService.evaluateSWM2026Applicability(TEST_ORG, TEST_CAFE, USER_OWNER, {
      floorAreaSqMetres: 19900,
      dailyWaterConsumptionLitres: 39500,
      averageDailyWasteGeneratedKg: 95
    });
    assert.equal(belowEval.isBulkWasteGenerator, false);
    assert.equal(belowEval.bwgClassificationCriteria, 'NONE_TRIGGERED_STANDARD_GENERATOR');

    // 6. Multiple thresholds triggered: area 22,000 m² and waste 110 kg/d
    const multiEval = await ownerUtilitiesWasteService.evaluateSWM2026Applicability(TEST_ORG, TEST_CAFE, USER_OWNER, {
      floorAreaSqMetres: 22000,
      dailyWaterConsumptionLitres: 1500,
      averageDailyWasteGeneratedKg: 110
    });
    assert.equal(multiEval.isBulkWasteGenerator, true);
    assert.ok(multiEval.bwgCriteriaTriggered.includes('FLOOR_AREA_GE_20000_SQM'));
    assert.ok(multiEval.bwgCriteriaTriggered.includes('SOLID_WASTE_GE_100_KG_DAY'));
  });

  test('7. Normalized KPI Aggregations: Zero-division protected intensity metrics', async () => {
    // Record water reading
    await ownerUtilitiesWasteService.recordMeterReading(TEST_ORG, {
      meterId: testWaterMeterId,
      startReading: 1000,
      endReading: 4500, // 3,500 L
      periodStart: new Date('2026-08-01'),
      periodEnd: new Date('2026-08-31')
    }, USER_OWNER);

    // Seed bills
    const rand = Math.floor(Math.random() * 8999 + 1000);
    await Bill.create({
      billId: `BILL-20260914-${rand}1`,
      organisationId: TEST_ORG,
      cafeId: TEST_CAFE,
      businessDate: '2026-09-14',
      status: 'COMPLETED',
      cashierUserId: 'USR-CASHIER-01',
      subtotalPaisa: 500000, // ₹5,000
      totalPaisa: 500000,
      totalPayablePaisa: 500000,
      lineItems: [{
        lineItemId: 'LINE-01',
        menuItemId: 'MENU-01',
        itemNameSnapshot: 'Coffee',
        quantity: 1,
        unitPricePaisa: 500000,
        lineSubtotalPaisa: 500000,
        lineTotalPaisa: 500000
      }]
    });

    const dashboard = await ownerUtilitiesWasteService.getUtilitiesDashboard(TEST_ORG, { cafeId: TEST_CAFE });
    assert.ok(dashboard.totalElectricityKwh > 0);
    assert.ok(dashboard.totalWaterLitres >= 3500);
    assert.equal(dashboard.totalBillsProcessed, 1);
    assert.equal(dashboard.totalRevenueRupees, 5000);
    assert.ok(dashboard.normalizedKpis.electricityKwhPerThousandSales > 0);
    assert.ok(dashboard.normalizedKpis.waterLitresPerHundredBills > 0);
    assert.ok(dashboard.environmentalClaimsNotice.includes('UNSUPPORTED_CLAIMS_PROHIBITED'));
  });

  test('8. Multi-Tenant IDOR Isolation: Strictly restricts meter queries to owning organisation', async () => {
    await assert.rejects(
      async () => {
        await ownerUtilitiesWasteService.recordMeterReading(FOREIGN_ORG, {
          meterId: testElectricityMeterId,
          startReading: 5000,
          endReading: 5200,
          periodStart: new Date('2026-10-01'),
          periodEnd: new Date('2026-10-15')
        }, USER_OWNER);
      },
      (err) => err.message.includes('METER_NOT_FOUND')
    );
  });

  after(async () => {
    await mongoose.disconnect();
  });
});
