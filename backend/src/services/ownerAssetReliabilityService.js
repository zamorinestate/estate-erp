'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER ASSET RELIABILITY & MAINTENANCE SERVICE (STAGE 07)
 * ============================================================================
 * Governed maintenance work orders, breakdown triage, calibration, MTBF/MTTR
 * metrics with zero-division safety, replacement indicators without fake AI,
 * and seamless governed linkage to Stage 01 Food Safety and Stage 03 CAPEX.
 */

const { Asset } = require('../models/Asset');
const { WorkOrder, WORK_ORDER_STATUSES } = require('../models/WorkOrder');
const { MaintenancePlan } = require('../models/MaintenancePlan');
const { CalibrationRecord } = require('../models/CalibrationRecord');
const { CapexRequest } = require('../models/CapexRequest');
const {
  AssetBreakdownLog,
  BREAKDOWN_STATUSES,
  ALLOWED_BREAKDOWN_TRANSITIONS,
} = require('../models/AssetBreakdownLog');

const FOOD_SAFETY_CRITICAL_CATEGORIES = [
  'REFRIGERATION',
  'KITCHEN_EQUIPMENT',
  'MEASUREMENT_CALIBRATION',
  'WATER_TREATMENT',
  'COFFEE_MACHINE',
];

const WORK_ORDER_TRANSITIONS = {
  PLANNED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_PARTS', 'WAITING_VENDOR', 'COMPLETED', 'CANCELLED'],
  WAITING_PARTS: ['IN_PROGRESS', 'CANCELLED'],
  WAITING_VENDOR: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: ['VERIFIED', 'IN_PROGRESS'],
  VERIFIED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
  OPEN: ['TRIAGED', 'PLANNED', 'SCHEDULED', 'CANCELLED'],
  TRIAGED: ['PLANNED', 'SCHEDULED', 'CANCELLED'],
};

class OwnerAssetReliabilityService {
  /**
   * Log a new equipment breakdown with food-safety triage review candidate
   */
  async reportBreakdown(organisationId, payload, user) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const { assetId, cafeId, title, failureDescription, serviceVendorId } = payload;
    if (!assetId || !title || !failureDescription) {
      throw new Error('MISSING_REQUIRED_BREAKDOWN_FIELDS');
    }

    const asset = await Asset.findOne({ organisationId, assetId });
    if (!asset) throw new Error('ASSET_NOT_FOUND');

    const effectiveCafeId = cafeId || asset.cafeId;
    const isFoodSafetyCritical = FOOD_SAFETY_CRITICAL_CATEGORIES.includes(asset.category);

    const breakdownId = `BRK-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const breakdown = await AssetBreakdownLog.create({
      breakdownId,
      organisationId,
      cafeId: effectiveCafeId,
      assetId,
      title,
      failureDescription,
      status: 'REPORTED',
      serviceVendorId: serviceVendorId || null,
      reportedByUserId: user.userId || user.email || 'OWNER',
      foodSafetyRiskIdentified: isFoodSafetyCritical,
      foodSafetyReviewCandidate: {
        isCandidate: isFoodSafetyCritical,
        linkedIncidentId: null,
        triageNotes: isFoodSafetyCritical
          ? `Asset belongs to food-safety critical category ${asset.category}. Requires HACCP temperature/contamination review.`
          : 'Non-critical equipment category; standard maintenance review.',
      },
      auditTrail: [
        {
          action: 'BREAKDOWN_REPORTED',
          fromStatus: null,
          toStatus: 'REPORTED',
          performedBy: user.userId || user.email || 'OWNER',
          reason: 'Initial equipment failure logged',
        },
      ],
    });

    // Update asset operational status to UNDER_MAINTENANCE safely
    asset.operationalStatus = 'UNDER_MAINTENANCE';
    await asset.save();

    return breakdown;
  }

  /**
   * Transition breakdown lifecycle with strict validation
   */
  async updateBreakdownStatus(organisationId, breakdownId, { targetStatus, reason, user, downtimeMinutes, repairCostPaisa, partsCostPaisa, rootCause }) {
    if (!organisationId || !breakdownId || !targetStatus) {
      throw new Error('MISSING_BREAKDOWN_TRANSITION_PARAMETERS');
    }

    const breakdown = await AssetBreakdownLog.findOne({ organisationId, breakdownId });
    if (!breakdown) throw new Error('BREAKDOWN_NOT_FOUND');

    const allowed = ALLOWED_BREAKDOWN_TRANSITIONS[breakdown.status] || [];
    if (!allowed.includes(targetStatus)) {
      throw new Error(`INVALID_BREAKDOWN_STATUS_TRANSITION: Cannot transition from ${breakdown.status} to ${targetStatus}`);
    }

    const prevStatus = breakdown.status;
    breakdown.status = targetStatus;

    if (downtimeMinutes !== undefined) breakdown.downtimeMinutes += Number(downtimeMinutes) || 0;
    if (repairCostPaisa !== undefined) breakdown.repairCostPaisa += Number(repairCostPaisa) || 0;
    if (partsCostPaisa !== undefined) breakdown.partsCostPaisa += Number(partsCostPaisa) || 0;
    if (rootCause) breakdown.rootCause = rootCause;

    if (targetStatus === 'ISOLATED') {
      breakdown.safetyIsolationConfirmed = true;
    }

    if (targetStatus === 'CLOSED') {
      breakdown.closedAt = new Date();
      breakdown.closedByUserId = user.userId || user.email || 'OWNER';

      // Restore asset to IN_SERVICE
      const asset = await Asset.findOne({ organisationId, assetId: breakdown.assetId });
      if (asset) {
        asset.operationalStatus = 'IN_SERVICE';
        asset.condition = 'GOOD';
        await asset.save();
      }
    }

    breakdown.auditTrail.push({
      action: `TRANSITION_TO_${targetStatus}`,
      fromStatus: prevStatus,
      toStatus: targetStatus,
      performedBy: user.userId || user.email || 'OWNER',
      reason: reason || 'Governed breakdown status update',
    });

    await breakdown.save();
    return breakdown;
  }

  /**
   * Create a governed Maintenance Work Order
   */
  async createWorkOrder(organisationId, payload, user) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const { assetId, cafeId, title, workType, priority, description, dueDate, plannedStartDate } = payload;
    if (!assetId || !title || !description) {
      throw new Error('MISSING_REQUIRED_WORK_ORDER_FIELDS');
    }

    const asset = await Asset.findOne({ organisationId, assetId });
    if (!asset) throw new Error('ASSET_NOT_FOUND');

    const count = await WorkOrder.countDocuments({ organisationId });
    const workOrderId = `WO-${String(count + 1001).padStart(4, '0')}`;

    const workOrder = await WorkOrder.create({
      workOrderId,
      organisationId,
      cafeId: cafeId || asset.cafeId,
      assetId,
      title,
      workType: workType || 'CORRECTIVE_REPAIR',
      priority: priority || 'NORMAL',
      description,
      status: 'PLANNED',
      reportedByUserId: user.userId || user.email || 'OWNER',
      dueDate: dueDate || null,
      plannedStartDate: plannedStartDate || null,
    });

    return workOrder;
  }

  /**
   * Transition Work Order lifecycle with strict verification
   */
  async updateWorkOrderStatus(organisationId, workOrderId, { targetStatus, reason, user, downtimeMinutes, costPaisa, partsCostPaisa, completionNotes }) {
    if (!organisationId || !workOrderId || !targetStatus) {
      throw new Error('MISSING_WORK_ORDER_PARAMETERS');
    }

    const workOrder = await WorkOrder.findOne({ organisationId, workOrderId });
    if (!workOrder) throw new Error('WORK_ORDER_NOT_FOUND');

    if (targetStatus === 'CANCELLED' && !reason) {
      throw new Error('MANDATORY_REASON_REQUIRED_FOR_CANCELLATION');
    }

    const currentStatus = workOrder.status;
    const allowed = WORK_ORDER_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw new Error(`INVALID_WORK_ORDER_TRANSITION: Cannot transition from ${currentStatus} to ${targetStatus}`);
    }

    workOrder.status = targetStatus;

    if (downtimeMinutes !== undefined) workOrder.downtimeMinutes = Number(downtimeMinutes) || 0;
    if (costPaisa !== undefined) workOrder.costPaisa = Number(costPaisa) || 0;
    if (partsCostPaisa !== undefined) workOrder.partsCostPaisa = Number(partsCostPaisa) || 0;
    if (completionNotes) workOrder.completionNotes = completionNotes;

    if (targetStatus === 'IN_PROGRESS' && !workOrder.actualStartDate) {
      workOrder.actualStartDate = new Date();
    }

    if (targetStatus === 'COMPLETED' && !workOrder.actualCompletionDate) {
      workOrder.actualCompletionDate = new Date();
    }

    if (targetStatus === 'VERIFIED') {
      workOrder.verifiedByUserId = user.userId || user.email || 'OWNER';
      workOrder.verifiedAt = new Date();
    }

    await workOrder.save();
    return workOrder;
  }

  /**
   * Log equipment calibration record
   */
  async recordCalibration(organisationId, payload, user) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const { assetId, cafeId, equipmentType, result, certificateNumber, nextDueDate, performedBy, remarks } = payload;
    if (!assetId || !result || !nextDueDate || !performedBy) {
      throw new Error('MISSING_CALIBRATION_FIELDS');
    }

    const asset = await Asset.findOne({ organisationId, assetId });
    if (!asset) throw new Error('ASSET_NOT_FOUND');

    const calibrationId = `CAL-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const calibration = await CalibrationRecord.create({
      calibrationId,
      organisationId,
      cafeId: cafeId || asset.cafeId,
      assetId,
      assetName: asset.name,
      equipmentType: equipmentType || 'PROBE_THERMOMETER',
      calibrationDate: new Date(),
      result,
      certificateNumber: certificateNumber || '',
      nextDueDate: new Date(nextDueDate),
      performedBy,
      status: result === 'FAIL' ? 'FAILED' : 'VALID',
      recordedByUserId: user.userId || user.email || 'OWNER',
      remarks: remarks || '',
    });

    // Update asset calibration status
    asset.lastCalibrationDate = new Date().toISOString().split('T')[0];
    asset.nextCalibrationDue = new Date(nextDueDate).toISOString().split('T')[0];
    asset.calibrationStatus = result === 'FAIL' ? 'OVERDUE' : 'CURRENT';
    await asset.save();

    return calibration;
  }

  /**
   * Authoritative Equipment Reliability Metrics (MTBF, MTTR, Uptime %)
   * Zero-denominator safe: guarantees NO NaN or Infinity values.
   */
  async getAssetReliabilityMetrics(organisationId, assetId, periodDays = 90) {
    if (!organisationId || !assetId) throw new Error('ORGANISATION_AND_ASSET_REQUIRED');

    const asset = await Asset.findOne({ organisationId, assetId });
    if (!asset) throw new Error('ASSET_NOT_FOUND');

    const sinceDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const breakdowns = await AssetBreakdownLog.find({
      organisationId,
      assetId,
      createdAt: { $gte: sinceDate },
    });

    const workOrders = await WorkOrder.find({
      organisationId,
      assetId,
      createdAt: { $gte: sinceDate },
    });

    const totalPeriodMinutes = periodDays * 24 * 60;
    const breakdownDowntime = breakdowns.reduce((acc, b) => acc + (b.downtimeMinutes || 0), 0);
    const woDowntime = workOrders.reduce((acc, w) => acc + (w.downtimeMinutes || 0), 0);
    const totalDowntimeMinutes = breakdownDowntime + woDowntime;

    const operatingMinutes = Math.max(0, totalPeriodMinutes - totalDowntimeMinutes);

    // Uptime calculation
    const uptimePercentage = totalPeriodMinutes > 0
      ? Number(((operatingMinutes / totalPeriodMinutes) * 100).toFixed(2))
      : 100;

    // Failures count
    const failuresCount = breakdowns.length;

    // MTBF: Operating Time / Number of Failures (zero denominator safe)
    let mtbfHours = null;
    let mtbfStatus = 'CALCULATED';
    if (failuresCount === 0) {
      mtbfHours = null;
      mtbfStatus = 'NO_FAILURES_RECORDED';
    } else {
      mtbfHours = Number(((operatingMinutes / failuresCount) / 60).toFixed(2));
    }

    // Repairs count
    const repairedBreakdowns = breakdowns.filter((b) => ['RETURNED_TO_SERVICE', 'CLOSED'].includes(b.status));
    const completedWorkOrders = workOrders.filter((w) => ['COMPLETED', 'VERIFIED', 'CLOSED'].includes(w.status));
    const repairsCount = repairedBreakdowns.length + completedWorkOrders.length;

    // MTTR: Total Repair Time / Number of Repairs (zero denominator safe)
    let mttrHours = null;
    let mttrStatus = 'CALCULATED';
    if (repairsCount === 0) {
      mttrHours = null;
      mttrStatus = 'NO_REPAIRS_RECORDED';
    } else {
      mttrHours = Number(((totalDowntimeMinutes / repairsCount) / 60).toFixed(2));
    }

    return {
      assetId: asset.assetId,
      assetName: asset.name,
      category: asset.category,
      criticality: asset.criticality,
      operationalStatus: asset.operationalStatus,
      periodDays,
      totalPeriodMinutes,
      totalDowntimeMinutes,
      operatingMinutes,
      uptime: {
        percentage: uptimePercentage,
        formula: '((operatingMinutes / totalPeriodMinutes) * 100)',
      },
      failuresCount,
      mtbf: {
        hours: mtbfHours,
        status: mtbfStatus,
        formula: 'operatingMinutes / failuresCount / 60',
      },
      repairsCount,
      mttr: {
        hours: mttrHours,
        status: mttrStatus,
        formula: 'totalRepairDowntimeMinutes / repairsCount / 60',
      },
      isDataAuthoritative: true,
    };
  }

  /**
   * Replacement Decision Indicators (Defensible metrics, zero fake AI)
   */
  async getReplacementIndicators(organisationId, assetId) {
    if (!organisationId || !assetId) throw new Error('ORGANISATION_AND_ASSET_REQUIRED');

    const asset = await Asset.findOne({ organisationId, assetId });
    if (!asset) throw new Error('ASSET_NOT_FOUND');

    const breakdowns = await AssetBreakdownLog.find({ organisationId, assetId });
    const workOrders = await WorkOrder.find({ organisationId, assetId });

    const totalRepairCostPaisa = breakdowns.reduce(
      (acc, b) => acc + (b.repairCostPaisa || 0) + (b.partsCostPaisa || 0),
      0
    );
    const totalWorkOrderCostPaisa = workOrders.reduce(
      (acc, w) => acc + (w.costPaisa || 0) + (w.partsCostPaisa || 0),
      0
    );
    const cumulativeMaintenanceSpendPaisa = totalRepairCostPaisa + totalWorkOrderCostPaisa;

    const acquisitionCostPaisa = asset.acquisitionCostPaisa || 0;
    const maintenanceToAcquisitionRatio = acquisitionCostPaisa > 0
      ? Number((cumulativeMaintenanceSpendPaisa / acquisitionCostPaisa).toFixed(3))
      : 0;

    const recentBreakdownCount = breakdowns.filter((b) => {
      const daysOld = (Date.now() - new Date(b.createdAt).getTime()) / (24 * 60 * 60 * 1000);
      return daysOld <= 180;
    }).length;

    // Decision indicator rules (not automatic disposal instructions)
    const reasons = [];
    if (maintenanceToAcquisitionRatio >= 0.5) {
      reasons.push(`Cumulative maintenance spend (₹${(cumulativeMaintenanceSpendPaisa / 100).toFixed(2)}) has reached ${(maintenanceToAcquisitionRatio * 100).toFixed(1)}% of original acquisition cost.`);
    }
    if (recentBreakdownCount >= 3) {
      reasons.push(`High failure frequency: ${recentBreakdownCount} breakdowns recorded in the past 180 days.`);
    }
    if (asset.condition === 'CRITICAL' || asset.condition === 'POOR') {
      reasons.push(`Current physical condition is rated as ${asset.condition}.`);
    }

    const isReplacementRecommended = reasons.length > 0;

    return {
      assetId: asset.assetId,
      name: asset.name,
      category: asset.category,
      acquisitionCostPaisa,
      cumulativeMaintenanceSpendPaisa,
      maintenanceToAcquisitionRatio,
      totalBreakdownsRecorded: breakdowns.length,
      recentBreakdownCount,
      currentCondition: asset.condition,
      isReplacementRecommended,
      recommendationReasons: reasons,
      decisionNotice: 'Decision indicator only. Does NOT constitute automatic disposal instruction or AI predictive remaining life claim.',
    };
  }

  /**
   * Link Asset Replacement recommendation to Stage 03 CAPEX Request
   * Strictly respects governed CAPEX approval workflow (zero approval bypass).
   */
  async linkReplacementToCapex(organisationId, assetId, capexData, user) {
    if (!organisationId || !assetId) throw new Error('ORGANISATION_AND_ASSET_REQUIRED');

    const asset = await Asset.findOne({ organisationId, assetId });
    if (!asset) throw new Error('ASSET_NOT_FOUND');

    const requestId = `CAPEX-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const capex = await CapexRequest.create({
      requestId,
      organisationId,
      cafeId: asset.cafeId,
      title: capexData.title || `Asset Replacement: ${asset.name} (${asset.assetId})`,
      category: capexData.category || 'KITCHEN_EQUIPMENT',
      purpose: capexData.purpose || `Replacement for chronic failure asset ${asset.assetId}`,
      estimatedCostPaisa: capexData.estimatedCostPaisa || asset.acquisitionCostPaisa || 1000000,
      businessCase: {
        purpose: `Replace depreciated asset ${asset.assetId} exhibiting high maintenance costs and reliability degradation.`,
        expectedBenefits: capexData.expectedBenefits || 'Restore production reliability, eliminate recurring maintenance spend, uphold food safety.',
        operationalRisks: 'Equipment failure during peak trading hours if unreplaced.',
        alternativesConsidered: 'Continued reactive repairs (uneconomic).',
      },
      linkedAssetId: asset.assetId,
      status: 'REQUESTED', // Dual-review approval strictly required
      auditHistory: [
        {
          action: 'CAPEX_REQUESTED_FROM_ASSET_RELIABILITY',
          performedBy: user.userId || user.email || 'OWNER',
          notes: `Initiated replacement CAPEX for asset ${asset.assetId}. Approval pending Stage 03 workflow.`,
        },
      ],
    });

    return capex;
  }

  /**
   * Executive Asset Reliability Dashboard
   */
  async getExecutiveReliabilityDashboard(organisationId, cafeId) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');

    const filter = { organisationId };
    if (cafeId) filter.cafeId = cafeId;

    const [assets, breakdowns, workOrders, calibrations] = await Promise.all([
      Asset.find(filter),
      AssetBreakdownLog.find(filter),
      WorkOrder.find(filter),
      CalibrationRecord.find(filter),
    ]);

    const activeBreakdowns = breakdowns.filter((b) => b.status !== 'CLOSED');
    const openWorkOrders = workOrders.filter((w) => !['CLOSED', 'CANCELLED'].includes(w.status));
    const foodSafetyReviewCandidates = breakdowns.filter((b) => b.foodSafetyReviewCandidate && b.foodSafetyReviewCandidate.isCandidate);
    const criticalAssets = assets.filter((a) => a.criticality === 'CRITICAL');

    return {
      totalAssetsCount: assets.length,
      criticalAssetsCount: criticalAssets.length,
      activeBreakdownsCount: activeBreakdowns.length,
      openWorkOrdersCount: openWorkOrders.length,
      foodSafetyReviewCandidatesCount: foodSafetyReviewCandidates.length,
      calibrationsCount: calibrations.length,
      recentBreakdowns: activeBreakdowns.slice(0, 10),
      recentWorkOrders: openWorkOrders.slice(0, 10),
    };
  }
}

module.exports = new OwnerAssetReliabilityService();
