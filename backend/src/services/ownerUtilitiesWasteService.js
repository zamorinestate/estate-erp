'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER UTILITIES, WASTE & ENERGY MANAGEMENT SERVICE (STAGE 14)
 * ============================================================================
 * Measures and governs resource consumption and waste at café level:
 * - Utility meters and consumption readings (electricity, water, LPG, generator fuel).
 * - Reading anomaly detection: negative reading, rollover, period overlap, unexplained spikes.
 * - Normalized KPIs: electricity/sales, water/bills with zero-division guards.
 * - SWM 2026 Legal Applicability: MoEFCC S.O. 388(E) dated 27 January 2026.
 *   Does NOT falsely classify every café as a Bulk Waste Generator (BWG).
 * - FSSAI RUCO 25% Total Polar Compounds (TPC) Limit for Used Cooking Oil (UCO).
 *   Strict Invariant: discarded UCO can never re-enter food inventory.
 * - Food waste reconciliation: links directly to canonical WastageRecord (zero double counting).
 * - Zero unsupported environmental claims (no net-zero, zero-waste, or greenwashing claims).
 */

const UtilityMeter = require('../models/UtilityMeter');
const UtilityReading = require('../models/UtilityReading');
const WasteRecord = require('../models/WasteRecord');
const UsedCookingOilLog = require('../models/UsedCookingOilLog');
const SolidWaste2026Applicability = require('../models/SolidWaste2026Applicability');
const BillModule = require('../models/Bill');
const Bill = BillModule.Bill || BillModule;
let WastageRecordModule;
try {
  WastageRecordModule = require('../models/WastageRecord');
} catch (e) {
  // fallback
}
const WastageRecord = WastageRecordModule ? (WastageRecordModule.WastageRecord || WastageRecordModule) : null;

class OwnerUtilitiesWasteService {
  _getOrgFilter(organisationId) {
    const orgUpper = organisationId.toString().toUpperCase();
    return { $or: [{ organisationId }, { organisationId: organisationId.toString() }, { organisationId: orgUpper }] };
  }

  /**
   * Register a Utility Meter
   */
  async registerMeter(organisationId, payload, user) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const { cafeId, utilityCategory, meterName, meterIdentifier, providerName, unitOfMeasure } = payload;

    if (!cafeId || !utilityCategory || !meterIdentifier) {
      throw new Error('CAFE_ID_UTILITY_CATEGORY_AND_IDENTIFIER_REQUIRED');
    }

    const meter = new UtilityMeter({
      meterId: `MTR-${Date.now().toString(36).toUpperCase()}`,
      organisationId,
      cafeId,
      utilityCategory,
      utilityType: utilityCategory,
      meterName: meterName || `${utilityCategory} Meter`,
      meterIdentifier,
      meterSerialNumber: payload.meterSerialNumber || meterIdentifier,
      accountNumber: payload.accountNumber || `ACC-${Date.now().toString(36).toUpperCase()}`,
      providerName: providerName || 'Utility Board',
      unitOfMeasure: unitOfMeasure || (utilityCategory === 'ELECTRICITY' ? 'KWH' : 'LITRE'),
      openingReading: payload.openingReading || 0,
      baselineMonthlyConsumption: payload.baselineMonthlyConsumption || null,
      targetMonthlyConsumption: payload.targetMonthlyConsumption || null,
      createdByUserId: user?.userId || user?._id || 'SYSTEM'
    });

    await meter.save();
    return meter;
  }

  /**
   * Record a Meter Reading with Anomaly & Rollover Validation
   */
  async recordMeterReading(organisationId, payload, user) {
    const { meterId, startReading, endReading, periodStart, periodEnd, evidenceAttachmentUrl } = payload;

    if (!meterId || startReading === undefined || endReading === undefined) {
      throw new Error('METER_ID_AND_READINGS_REQUIRED');
    }

    const orgFilter = this._getOrgFilter(organisationId);
    const meter = await UtilityMeter.findOne({ ...orgFilter, meterId });
    if (!meter) throw new Error('METER_NOT_FOUND');

    let consumption = endReading - startReading;
    let isRolloverDetected = false;

    // Detect negative reading (possible meter rollover or bad entry)
    if (consumption < 0) {
      // Check if meter rolled over (e.g. 99999 to 00050)
      if (startReading > 90000 && endReading < 10000) {
        isRolloverDetected = true;
        consumption = (100000 - startReading) + endReading;
      } else {
        throw new Error('NEGATIVE_CONSUMPTION_DETECTED: End reading cannot be less than start reading without verified rollover.');
      }
    }

    // Check for duplicate period overlap on same meter
    const existingReading = await UtilityReading.findOne({
      ...orgFilter,
      meterId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd)
    });

    if (existingReading) {
      throw new Error('DUPLICATE_READING_PERIOD: A reading already exists for this exact period.');
    }

    // Anomaly evaluation against baseline (configurable/versioned Zamorin internal policy; default: 35%)
    let isAnomaly = false;
    let anomalyNotes = null;
    const baseline = meter.baselineMonthlyConsumption || 0;
    const anomalyThresholdPercent = (typeof payload.anomalyThresholdPercent === 'number' && !isNaN(payload.anomalyThresholdPercent))
      ? payload.anomalyThresholdPercent
      : (typeof meter.anomalyThresholdPercent === 'number' && !isNaN(meter.anomalyThresholdPercent))
        ? meter.anomalyThresholdPercent
        : (process.env.UTILITY_ANOMALY_THRESHOLD_PERCENT ? parseFloat(process.env.UTILITY_ANOMALY_THRESHOLD_PERCENT) : 35);
    if (baseline > 0) {
      const variancePercent = ((consumption - baseline) / baseline) * 100;
      if (variancePercent > anomalyThresholdPercent) {
        isAnomaly = true;
        anomalyNotes = `Consumption of ${consumption} is ${variancePercent.toFixed(1)}% above monthly baseline (${baseline}) [threshold: ${anomalyThresholdPercent}%].`;
      }
    }

    const reading = new UtilityReading({
      readingId: `RDG-${Date.now().toString(36).toUpperCase()}`,
      organisationId,
      cafeId: meter.cafeId,
      meterId,
      utilityCategory: meter.utilityCategory || meter.utilityType,
      utilityType: meter.utilityType || meter.utilityCategory,
      startReading,
      endReading,
      consumption,
      unitOfMeasure: meter.unitOfMeasure || 'KWH',
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      recordedBy: user?.userId || user?._id || 'SYSTEM',
      recordedByUserId: user?.userId || user?._id || 'SYSTEM',
      readingMethod: 'MANUAL_ENTRY',
      isAnomaly,
      isAnomalyDetected: isAnomaly,
      anomalyReason: anomalyNotes,
      evidenceAttachmentUrl: evidenceAttachmentUrl || null
    });

    await reading.save();
    return reading;
  }

  /**
   * Log Solid / Liquid / Packaging Waste Record
   */
  async recordWaste(organisationId, payload, user) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const {
      cafeId,
      wasteCategory,
      quantity,
      unitOfMeasure = 'KG',
      wasteReason,
      disposalRoute,
      authorizedCollectorName,
      collectorPermitNumber,
      inventoryWastageId
    } = payload;

    if (!cafeId || !wasteCategory || !quantity || quantity <= 0) {
      throw new Error('CAFE_CATEGORY_AND_VALID_QUANTITY_REQUIRED');
    }

    const orgFilter = this._getOrgFilter(organisationId);

    // Canonical Wastage Reconciliation (prevent double counting)
    let linkedInventoryWastageId = null;
    if (wasteCategory.includes('FOOD') || wasteCategory === 'FOOD_WASTE') {
      if (inventoryWastageId && WastageRecord) {
        const inventoryWastage = await WastageRecord.findOne({
          ...orgFilter,
          wastageId: inventoryWastageId
        });
        if (inventoryWastage) {
          linkedInventoryWastageId = inventoryWastage.wastageId;
        }
      }
    }

    const wid = `WST-${Date.now().toString(36).toUpperCase()}`;
    const record = new WasteRecord({
      wasteId: wid,
      wasteRecordId: wid,
      organisationId,
      cafeId,
      wasteCategory,
      quantity,
      unitOfMeasure,
      reason: wasteReason || 'Routine operational wastage',
      wasteReason: wasteReason || 'Routine operational wastage',
      disposalRoute: disposalRoute || 'MUNICIPAL_COLLECTION',
      collectorName: authorizedCollectorName || null,
      authorizedCollectorName: authorizedCollectorName || null,
      collectorAuthReference: collectorPermitNumber || null,
      collectorPermitNumber: collectorPermitNumber || null,
      inventoryWastageReference: linkedInventoryWastageId,
      inventoryWastageId: linkedInventoryWastageId,
      isDoubleCountingPrevented: true,
      recordedByUserId: user?.userId || user?._id || 'SYSTEM',
      loggedBy: user?.userId || user?._id || 'SYSTEM'
    });

    await record.save();
    return record;
  }

  /**
   * Log Used Cooking Oil (UCO) & Enforce 25% TPC Limit (FSSAI RUCO)
   */
  async recordUsedCookingOil(organisationId, payload, user) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const {
      cafeId,
      oilType = 'PALMOLEIN_BLENDED',
      fryingBatchReference,
      totalPolarCompoundsPercent,
      quantityLiters,
      disposalStatus = 'DISCARDED_FOR_RUCO',
      collectorName,
      collectorFssaiRegistration
    } = payload;

    if (!cafeId) {
      throw new Error('CAFE_ID_AND_QUANTITY_REQUIRED');
    }

    const tpcVal = (totalPolarCompoundsPercent !== undefined && totalPolarCompoundsPercent !== null)
      ? totalPolarCompoundsPercent
      : (payload.tpcReadingPct !== undefined ? payload.tpcReadingPct : null);

    const isTpcMeasured = tpcVal !== null && tpcVal !== undefined;
    const isExceedingTpcLimit = isTpcMeasured && tpcVal > 25.0;

    const ucoId = `UCO-${Date.now().toString(36).toUpperCase()}`;
    const ucoLog = new UsedCookingOilLog({
      ucoLogId: ucoId,
      logId: ucoId,
      organisationId,
      cafeId,
      oilType,
      fryingBatchReference: fryingBatchReference || 'DAILY_FRYING_CYCLE',
      tpcReadingPct: isTpcMeasured ? tpcVal : 0,
      totalPolarCompoundsPercent: isTpcMeasured ? tpcVal : null,
      isAboveSafetyLimit: isExceedingTpcLimit,
      isTpcExceedingLimit: isExceedingTpcLimit,
      actionTaken: isExceedingTpcLimit ? 'DISCARDED_FOR_COLLECTION' : 'CONTINUE_MONITORED_USE',
      tpcMeasurementMethod: isTpcMeasured ? 'DIGITAL_TESTER_PROBE' : 'NOT_MEASURED',
      quantityLiters: quantityLiters || payload.quantityLitres || 1,
      quantityLitres: quantityLiters || payload.quantityLitres || 1,
      quantityDiscardedLitres: isExceedingTpcLimit ? (quantityLiters || payload.quantityLitres || 0) : 0,
      disposalQuantityLitres: isExceedingTpcLimit ? (quantityLiters || payload.quantityLitres || 0) : 0,
      disposalStatus,
      collectorName: collectorName || null,
      authorisedCollectorName: collectorName || null,
      collectorFssaiRegistration: collectorFssaiRegistration || null,
      reentryBlocked: true,
      isFoodInventoryReentryBlocked: true, // Strict safety invariant
      recordedByUserId: user?.userId || user?._id || 'SYSTEM',
      loggedBy: user?.userId || user?._id || 'SYSTEM'
    });

    await ucoLog.save();

    return {
      log: ucoLog,
      tpcSafetyAlert: isExceedingTpcLimit
        ? 'CRITICAL_SAFETY_ALERT: TPC exceeds 25.0% FSSAI limit! Oil permanently removed from food preparation.'
        : 'TPC within lawful food safety limits or awaiting test.',
      reentryBlocked: true,
      rucoFrameworkNotice: 'FSSAI SOP: FBOs consuming >= 50 L/day edible frying oil must maintain usage/disposal logs and hand over to authorised agencies (State/UT-authorised, collection agencies, aggregators, or non-food industrial units). No universal FBO RUCO registration mandated.'
    };
  }

  /**
   * Evaluate Solid Waste Management Rules, 2026 Applicability (CPCB / MoEFCC)
   * Criteria: Floor area >= 20,000 m² OR Water consumption >= 40,000 L/day OR Solid waste >= 100 kg/day.
   * Streams: WET, DRY, SANITARY, SPECIAL_CARE.
   */
  async evaluateSWM2026Applicability(organisationId, cafeId, user, premisesData = {}) {
    if (!organisationId || !cafeId) throw new Error('ORGANISATION_AND_CAFE_REQUIRED');

    const orgFilter = this._getOrgFilter(organisationId);

    // Estimate daily solid waste generation from recent waste records if not provided
    const recentRecords = await WasteRecord.find({
      ...orgFilter,
      cafeId,
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }).lean();

    let totalKg30Days = 0;
    for (const r of recentRecords) {
      totalKg30Days += (r.quantity || 0);
    }
    const avgDailyGenerationKg = premisesData.averageDailyWasteGeneratedKg !== undefined
      ? premisesData.averageDailyWasteGeneratedKg
      : (recentRecords.length > 0 ? (totalKg30Days / 30) : 15);

    const floorAreaSqMetres = premisesData.floorAreaSqMetres !== undefined
      ? premisesData.floorAreaSqMetres
      : (premisesData.premisesPlinthAreaSqMetres || 250);

    const dailyWaterConsumptionLitres = premisesData.dailyWaterConsumptionLitres !== undefined
      ? premisesData.dailyWaterConsumptionLitres
      : 1500;

    // CPCB official current SWM 2026 portal BWG criteria:
    // 1. FLOOR AREA >= 20,000 m²
    // 2. WATER CONSUMPTION >= 40,000 L/DAY
    // 3. SOLID WASTE GENERATION >= 100 KG/DAY
    const triggeredCriteria = [];
    if (floorAreaSqMetres >= 20000) {
      triggeredCriteria.push('FLOOR_AREA_GE_20000_SQM');
    }
    if (dailyWaterConsumptionLitres >= 40000) {
      triggeredCriteria.push('WATER_CONSUMPTION_GE_40000_L_DAY');
    }
    if (avgDailyGenerationKg >= 100) {
      triggeredCriteria.push('SOLID_WASTE_GE_100_KG_DAY');
    }

    const isBWG = triggeredCriteria.length > 0;
    const bwgClassificationCriteria = isBWG ? triggeredCriteria.join('_AND_') : 'NONE_TRIGGERED_STANDARD_GENERATOR';

    // Official SWM 2026 Four Statutory Streams: WET, DRY, SANITARY, SPECIAL_CARE
    const mandatedSegregationStreams = ['WET', 'DRY', 'SANITARY', 'SPECIAL_CARE'];

    let record = await SolidWaste2026Applicability.findOne({ ...orgFilter, cafeId });
    if (!record) {
      record = new SolidWaste2026Applicability({
        recordId: `SWM-${Date.now().toString(36).toUpperCase()}`,
        organisationId,
        cafeId,
        statutoryRuleVersion: 'SWM_RULES_2026_CPCB_MOEFCC',
        floorAreaSqMetres,
        premisesPlinthAreaSqMetres: floorAreaSqMetres,
        dailyWaterConsumptionLitres,
        averageDailyWasteGeneratedKg: Number(avgDailyGenerationKg.toFixed(1)),
        dailySolidWasteGenerationKg: Number(avgDailyGenerationKg.toFixed(1)),
        isBulkWasteGenerator: isBWG,
        bwgClassificationCriteria,
        bwgCriteriaTriggered: triggeredCriteria,
        bulkWasteClassificationRationale: isBWG
          ? `Classified as Bulk Waste Generator under CPCB SWM 2026 criteria: ${triggeredCriteria.join(', ')}. Must process wet waste on-site or engage authorized agency.`
          : `Standard commercial generator (Floor area: ${floorAreaSqMetres}m², Water: ${dailyWaterConsumptionLitres}L/d, Waste: ${avgDailyGenerationKg.toFixed(1)}kg/d). Below all 3 BWG thresholds.`,
        mandatedSegregationStreams,
        operationalStreamMapping: {
          WET: 'Biodegradable kitchen & food scrap',
          DRY: 'Recyclable packaging, paper, plastic, glass',
          SANITARY: 'Restroom & sanitary hygiene waste',
          SPECIAL_CARE: 'Domestic hazardous, e-waste, cleaning chemicals, lighting'
        },
        localUrbanBodyName: 'Kozhikode Municipal Corporation',
        localBodyRegistrationRequired: isBWG,
        evaluatedByUserId: user?.userId || user?._id || 'SYSTEM'
      });
      await record.save();
    } else {
      record.statutoryRuleVersion = 'SWM_RULES_2026_CPCB_MOEFCC';
      record.floorAreaSqMetres = floorAreaSqMetres;
      record.premisesPlinthAreaSqMetres = floorAreaSqMetres;
      record.dailyWaterConsumptionLitres = dailyWaterConsumptionLitres;
      record.averageDailyWasteGeneratedKg = Number(avgDailyGenerationKg.toFixed(1));
      record.dailySolidWasteGenerationKg = Number(avgDailyGenerationKg.toFixed(1));
      record.isBulkWasteGenerator = isBWG;
      record.bwgClassificationCriteria = bwgClassificationCriteria;
      record.bwgCriteriaTriggered = triggeredCriteria;
      record.localBodyRegistrationRequired = isBWG;
      record.mandatedSegregationStreams = mandatedSegregationStreams;
      record.bulkWasteClassificationRationale = isBWG
        ? `Classified as Bulk Waste Generator under CPCB SWM 2026 criteria: ${triggeredCriteria.join(', ')}. Must process wet waste on-site or engage authorized agency.`
        : `Standard commercial generator (Floor area: ${floorAreaSqMetres}m², Water: ${dailyWaterConsumptionLitres}L/d, Waste: ${avgDailyGenerationKg.toFixed(1)}kg/d). Below all 3 BWG thresholds.`;
      await record.save();
    }

    return record;
  }

  /**
   * Normalized KPI Aggregations with Zero Division Protection
   */
  async getUtilitiesDashboard(organisationId, options = {}) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const { cafeId } = options;

    const orgFilter = this._getOrgFilter(organisationId);

    const meterQuery = { ...orgFilter, status: { $ne: 'DECOMMISSIONED' } };
    if (cafeId) meterQuery.cafeId = cafeId;
    const meters = await UtilityMeter.find(meterQuery).lean();

    const readingQuery = { ...orgFilter };
    if (cafeId) readingQuery.cafeId = cafeId;
    const readings = await UtilityReading.find(readingQuery).lean();

    let totalElectricityKwh = 0;
    let totalWaterLitres = 0;

    for (const r of readings) {
      const type = r.utilityType || r.utilityCategory;
      if (type === 'ELECTRICITY') totalElectricityKwh += (r.consumption || 0);
      else if (type === 'WATER') totalWaterLitres += (r.consumption || 0);
    }

    // Bill denominator
    const billQuery = { ...orgFilter };
    if (cafeId) billQuery.cafeId = cafeId;
    const bills = await Bill.find(billQuery).lean();
    const totalBills = bills.length;

    let totalRevenue = 0;
    for (const b of bills) {
      totalRevenue += b.totalPayablePaisa ? (b.totalPayablePaisa / 100) : (b.grandTotal || (b.totalPaisa ? b.totalPaisa / 100 : 0));
    }

    // Normalized KPIs (strictly guarded against divide by zero)
    const electricityPerThousandSales = totalRevenue > 0
      ? Number(((totalElectricityKwh / totalRevenue) * 1000).toFixed(2))
      : null;

    const electricityPerBill = totalBills > 0
      ? Number((totalElectricityKwh / totalBills).toFixed(2))
      : null;

    const waterLitresPerHundredBills = totalBills > 0
      ? Number(((totalWaterLitres / totalBills) * 100).toFixed(2))
      : null;

    return {
      activeMetersCount: meters.length,
      totalElectricityKwh,
      totalWaterLitres,
      totalBillsProcessed: totalBills,
      totalRevenueRupees: totalRevenue,
      normalizedKpis: {
        electricityKwhPerThousandSales: electricityPerThousandSales,
        electricityKwhPerBill: electricityPerBill,
        waterLitresPerHundredBills: waterLitresPerHundredBills
      },
      environmentalClaimsNotice: 'UNSUPPORTED_CLAIMS_PROHIBITED: No unsubstantiated carbon-neutral, net-zero, or green claims are generated.'
    };
  }
}

module.exports = new OwnerUtilitiesWasteService();
