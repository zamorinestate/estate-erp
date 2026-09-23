'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — ASSET MAINTENANCE & PREVENTIVE SCHEDULING SERVICE (REC-15)
 * ============================================================================
 * Deterministic due-status engine, calendar-aware next-due date math,
 * maintenance completion workflow, immutable history, deduplicated alerts,
 * automatic alert resolution, and multi-tenant café scope isolation.
 */

const { Asset } = require('../models/Asset');
const { MaintenancePlan } = require('../models/MaintenancePlan');
const { MaintenanceJob } = require('../models/MaintenanceJob');
const { BusinessDocument } = require('../models/BusinessDocument');
const { operationalAlertService } = require('./operationalAlertService');
const { SequenceCounter } = require('../models/SequenceCounter');
const ApiError = require('../utils/ApiError');

const DUE_STATUSES = {
  NOT_SCHEDULED: 'NOT_SCHEDULED',
  UPCOMING: 'UPCOMING',
  DUE_SOON: 'DUE_SOON',
  DUE_TODAY: 'DUE_TODAY',
  OVERDUE: 'OVERDUE',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  MANUAL_REVIEW_REQUIRED: 'MANUAL_REVIEW_REQUIRED',
};

/**
 * Returns current date string (YYYY-MM-DD) in Asia/Kolkata timezone.
 */
function getKolkataDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Helper to determine days in a given month (leap-year aware).
 */
function getDaysInMonth(year, month) {
  // month is 1-indexed (1 = Jan, 2 = Feb, etc.)
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Adds days to a YYYY-MM-DD string in Asia/Kolkata context.
 */
function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const rY = dt.getUTCFullYear();
  const rM = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const rD = String(dt.getUTCDate()).padStart(2, '0');
  return `${rY}-${rM}-${rD}`;
}

/**
 * Computes calendar-aware next due date handling month-end boundaries and leap years.
 */
function calculateNextDueDate(baseDateStr, frequencyType = 'QUARTERLY', intervalDays = 90) {
  if (!baseDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(baseDateStr)) {
    baseDateStr = getKolkataDate();
  }

  const [year, month, day] = baseDateStr.split('-').map(Number);
  const normFreq = (frequencyType || '').toUpperCase().trim();

  let monthsToAdd = 0;
  if (normFreq === 'DAILY') {
    return addDaysToDateStr(baseDateStr, 1);
  } else if (normFreq === 'WEEKLY') {
    return addDaysToDateStr(baseDateStr, 7);
  } else if (normFreq === 'MONTHLY') {
    monthsToAdd = 1;
  } else if (normFreq === 'QUARTERLY') {
    monthsToAdd = 3;
  } else if (normFreq === 'BIANNUALLY' || normFreq === 'SEMI_ANNUALLY') {
    monthsToAdd = 6;
  } else if (normFreq === 'ANNUALLY') {
    monthsToAdd = 12;
  } else if (normFreq === 'CUSTOM_DAYS') {
    const days = Math.max(1, Number(intervalDays) || 90);
    return addDaysToDateStr(baseDateStr, days);
  } else {
    // Default to intervalDays
    const days = Math.max(1, Number(intervalDays) || 90);
    return addDaysToDateStr(baseDateStr, days);
  }

  let targetYear = year;
  let targetMonth = month + monthsToAdd;
  while (targetMonth > 12) {
    targetYear += 1;
    targetMonth -= 12;
  }

  const daysInTargetMonth = getDaysInMonth(targetYear, targetMonth);
  const targetDay = Math.min(day, daysInTargetMonth);

  const finalM = String(targetMonth).padStart(2, '0');
  const finalD = String(targetDay).padStart(2, '0');
  return `${targetYear}-${finalM}-${finalD}`;
}

/**
 * Calculates due status for a target date relative to reference date.
 */
function calculateDueStatus(dueDateStr, { dueSoonDays = 7, referenceDate = null } = {}) {
  if (!dueDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dueDateStr)) {
    return DUE_STATUSES.NOT_SCHEDULED;
  }

  const today = referenceDate || getKolkataDate();
  const warningDate = addDaysToDateStr(today, dueSoonDays);

  if (dueDateStr < today) {
    return DUE_STATUSES.OVERDUE;
  }
  if (dueDateStr === today) {
    return DUE_STATUSES.DUE_TODAY;
  }
  if (dueDateStr <= warningDate) {
    return DUE_STATUSES.DUE_SOON;
  }
  return DUE_STATUSES.UPCOMING;
}

class AssetMaintenanceService {
  /**
   * Evaluates due status for an asset or plan.
   */
  getDueStatus(dueDateStr, options = {}) {
    return calculateDueStatus(dueDateStr, options);
  }

  /**
   * Calendar-aware calculation for recurrence.
   */
  getNextDueDate(baseDateStr, frequencyType, intervalDays) {
    return calculateNextDueDate(baseDateStr, frequencyType, intervalDays);
  }

  /**
   * List maintenance schedules and backlog with computed due statuses.
   */
  async getMaintenanceBacklog({ organisationId, cafeId = null, statusFilter = null }) {
    if (!organisationId) throw new ApiError(400, 'ORGANISATION_ID_REQUIRED', 'Organisation ID is required.');

    const assetQuery = {
      organisationId,
      operationalStatus: { $ne: 'RETIRED' },
      status: { $ne: 'DISCARDED' },
    };
    if (cafeId) assetQuery.cafeId = cafeId.toUpperCase();

    const [assets, plans] = await Promise.all([
      Asset.find(assetQuery).lean(),
      MaintenancePlan.find({ organisationId, isActive: true }).lean(),
    ]);

    const todayStr = getKolkataDate();
    const backlog = [];

    // Map plans by assetId
    const planMap = new Map();
    for (const plan of plans) {
      if (plan.assetId) {
        if (!planMap.has(plan.assetId)) planMap.set(plan.assetId, []);
        planMap.get(plan.assetId).push(plan);
      }
    }

    for (const asset of assets) {
      const assetPlans = planMap.get(asset.assetId) || [];

      if (assetPlans.length > 0) {
        for (const plan of assetPlans) {
          const dueDate = plan.nextDueDate || asset.nextMaintenanceDue;
          const dueStatus = calculateDueStatus(dueDate, { referenceDate: todayStr });

          if (!statusFilter || statusFilter.toUpperCase() === dueStatus) {
            backlog.push({
              scheduleId: plan.planId,
              type: 'PREVENTIVE_PLAN',
              planName: plan.name,
              assetId: asset.assetId,
              assetName: asset.name,
              cafeId: asset.cafeId,
              category: asset.category,
              frequencyType: plan.frequencyType,
              intervalDays: plan.intervalDays,
              dueDate,
              dueStatus,
              serviceProviderId: plan.serviceProviderId || asset.serviceProviderId,
              operationalStatus: asset.operationalStatus,
            });
          }
        }
      } else if (asset.nextMaintenanceDue) {
        const dueDate = asset.nextMaintenanceDue;
        const dueStatus = calculateDueStatus(dueDate, { referenceDate: todayStr });

        if (!statusFilter || statusFilter.toUpperCase() === dueStatus) {
          backlog.push({
            scheduleId: `ASSET-DUE-${asset.assetId}`,
            type: 'ASSET_CYCLE',
            planName: 'Asset Standard Maintenance Cycle',
            assetId: asset.assetId,
            assetName: asset.name,
            cafeId: asset.cafeId,
            category: asset.category,
            frequencyType: asset.serviceFrequency || 'QUARTERLY',
            intervalDays: 90,
            dueDate,
            dueStatus,
            serviceProviderId: asset.serviceProviderId,
            operationalStatus: asset.operationalStatus,
          });
        }
      }
    }

    // Sort: OVERDUE first, then DUE_TODAY, DUE_SOON, UPCOMING
    const statusOrder = {
      OVERDUE: 1,
      DUE_TODAY: 2,
      DUE_SOON: 3,
      UPCOMING: 4,
      NOT_SCHEDULED: 5,
    };

    backlog.sort((a, b) => {
      const orderA = statusOrder[a.dueStatus] || 99;
      const orderB = statusOrder[b.dueStatus] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return (a.dueDate || '').localeCompare(b.dueDate || '');
    });

    return backlog;
  }

  /**
   * Completes a maintenance job / schedule and updates the asset + recurring plan.
   */
  async completeMaintenance({
    organisationId,
    assetId,
    jobId = null,
    planId = null,
    payload = {},
    user,
  }) {
    if (!organisationId || !assetId) {
      throw new ApiError(400, 'MISSING_REQUIRED_FIELDS', 'organisationId and assetId are required.');
    }

    const normAssetId = assetId.trim().toUpperCase();
    const asset = await Asset.findOne({ organisationId, assetId: normAssetId });
    if (!asset) {
      throw new ApiError(404, 'ASSET_NOT_FOUND', `Asset ${normAssetId} was not found.`);
    }

    const {
      maintenanceType = 'PREVENTIVE_MAINTENANCE',
      workSummary = 'Routine preventive maintenance completed successfully.',
      issueDescription = 'Scheduled preventive maintenance service',
      result = 'COMPLETED',
      costPaisa = 0,
      technicianName = '',
      performedBy = '',
      serviceProviderId = null,
      resolutionNotes = '',
      completedAt = null,
      evidenceDocumentIds = [],
      nextMaintenanceDue = null,
    } = payload;

    // Validate evidence documents if supplied
    if (Array.isArray(evidenceDocumentIds) && evidenceDocumentIds.length > 0) {
      for (const docId of evidenceDocumentIds) {
        const doc = await BusinessDocument.findOne({
          documentId: docId.trim().toUpperCase(),
          organisationId,
        });
        if (!doc) {
          throw new ApiError(404, 'DOCUMENT_NOT_FOUND', `Document ${docId} was not found.`);
        }
        // Enforce REC-06 scan status: only CLEAN documents permitted
        const scanStatus = doc.securityScanStatus || doc.scanStatus || doc.currentVersion?.securityScanStatus || doc.currentVersion?.scanStatus;
        if (doc.isQuarantined || scanStatus === 'INFECTED' || scanStatus === 'REJECTED') {
          throw new ApiError(400, 'INFECTED_DOCUMENT_REJECTED', `Document ${docId} failed security scan and cannot be attached.`);
        }
        if (scanStatus === 'PENDING_SCAN' || scanStatus === 'PENDING') {
          throw new ApiError(400, 'DOCUMENT_SCAN_PENDING', `Document ${docId} is still pending security scan.`);
        }

        // Associate document to asset and maintenance
        doc.entityType = 'ASSET';
        doc.entityId = normAssetId;
        doc.relatedModule = 'ASSETS';
        if (jobId) doc.relatedRecordId = jobId;
        await doc.save();
      }
    }

    const completionDateStr = completedAt
      ? (typeof completedAt === 'string' && completedAt.length >= 10 ? completedAt.slice(0, 10) : getKolkataDate(new Date(completedAt)))
      : getKolkataDate();

    // Generate or fetch MaintenanceJob
    let finalJobId = jobId;
    let job = null;

    if (finalJobId) {
      job = await MaintenanceJob.findOne({ jobId: finalJobId, organisationId });
    }

    if (!job) {
      finalJobId = await SequenceCounter.generateId({
        organisationId,
        sequenceKey: 'MAINTENANCE',
        prefix: 'MNT',
        minimumDigits: 4,
      });

      job = new MaintenanceJob({
        jobId: finalJobId,
        organisationId,
        cafeId: asset.cafeId,
        assetId: normAssetId,
        planId: planId || null,
        maintenanceType,
        scheduledDate: asset.nextMaintenanceDue || completionDateStr,
        issueDescription: issueDescription || workSummary,
        workSummary,
        costPaisa: Number(costPaisa) || 0,
        technicianName: technicianName || performedBy || user.name || '',
        performedBy: performedBy || technicianName || user.name || '',
        serviceProviderId: serviceProviderId || asset.serviceProviderId,
        resolutionNotes,
        evidenceDocumentIds,
        loggedByUserId: user.userId || user.email || 'SYSTEM',
        status: 'COMPLETED',
        result,
        completedAt: completedAt ? new Date(completedAt) : new Date(),
      });
    } else {
      job.status = 'COMPLETED';
      job.result = result;
      job.workSummary = workSummary;
      job.resolutionNotes = resolutionNotes;
      job.costPaisa = Number(costPaisa) || job.costPaisa;
      job.completedAt = completedAt ? new Date(completedAt) : new Date();
      if (evidenceDocumentIds.length > 0) {
        job.evidenceDocumentIds = [...new Set([...job.evidenceDocumentIds, ...evidenceDocumentIds])];
      }
    }

    await job.save();

    // Advance recurring MaintenancePlan if associated
    let computedNextDue = nextMaintenanceDue;
    if (planId) {
      const plan = await MaintenancePlan.findOne({ planId, organisationId });
      if (plan) {
        computedNextDue = calculateNextDueDate(completionDateStr, plan.frequencyType, plan.intervalDays);
        plan.nextDueDate = computedNextDue;
        await plan.save();
      }
    }

    if (!computedNextDue) {
      computedNextDue = calculateNextDueDate(completionDateStr, asset.serviceFrequency || 'QUARTERLY', 90);
    }

    // Update Asset authoritative dates
    asset.lastServiceDate = completionDateStr;
    asset.nextMaintenanceDue = computedNextDue;
    if (asset.operationalStatus === 'UNDER_MAINTENANCE') {
      asset.operationalStatus = 'IN_SERVICE';
      asset.status = 'OPERATIONAL';
    }
    await asset.save();

    // Auto-resolve open maintenance alerts for this asset
    await this.resolveAlertsForAsset(organisationId, normAssetId);

    return { job, asset, nextMaintenanceDue: computedNextDue };
  }

  /**
   * Reschedules maintenance to a new due date with mandatory reason and history.
   */
  async rescheduleMaintenance({
    organisationId,
    assetId,
    planId = null,
    jobId = null,
    newDueDate,
    reason,
    user,
  }) {
    if (!organisationId || !assetId || !newDueDate) {
      throw new ApiError(400, 'MISSING_REQUIRED_FIELDS', 'organisationId, assetId and newDueDate are required.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDueDate)) {
      throw new ApiError(400, 'INVALID_DATE_FORMAT', 'newDueDate must be in YYYY-MM-DD format.');
    }
    if (!reason || !reason.trim()) {
      throw new ApiError(400, 'REASON_REQUIRED', 'A mandatory reason is required to reschedule maintenance.');
    }

    const normAssetId = assetId.trim().toUpperCase();
    const asset = await Asset.findOne({ organisationId, assetId: normAssetId });
    if (!asset) {
      throw new ApiError(404, 'ASSET_NOT_FOUND', `Asset ${normAssetId} was not found.`);
    }

    const oldDueDate = asset.nextMaintenanceDue;
    asset.nextMaintenanceDue = newDueDate;
    await asset.save();

    let plan = null;
    if (planId) {
      plan = await MaintenancePlan.findOne({ planId, organisationId });
      if (plan) {
        plan.nextDueDate = newDueDate;
        await plan.save();
      }
    }

    let job = null;
    if (jobId) {
      job = await MaintenanceJob.findOne({ jobId, organisationId });
      if (job) {
        job.scheduledDate = newDueDate;
        job.rescheduleHistory.push({
          oldDueDate,
          newDueDate,
          rescheduledByUserId: user.userId || user.email || 'SYSTEM',
          reason: reason.trim(),
          rescheduledAt: new Date(),
        });
        await job.save();
      }
    }

    // Re-evaluate alerts: if new due date is in the future, resolve overdue alert
    const todayStr = getKolkataDate();
    if (newDueDate >= todayStr) {
      await operationalAlertService.autoResolveByDeduplicationKey({
        deduplicationKey: `MNT_${organisationId}_${normAssetId}_OVERDUE`,
        resolution: `Rescheduled to ${newDueDate} by ${user.userId || user.email}: ${reason}`,
      });
    }

    return { asset, plan, job, oldDueDate, newDueDate };
  }

  /**
   * Deactivates or cancels a maintenance plan with mandatory reason.
   */
  async cancelMaintenancePlan({ organisationId, planId, reason, user }) {
    if (!organisationId || !planId) {
      throw new ApiError(400, 'MISSING_REQUIRED_FIELDS', 'organisationId and planId are required.');
    }
    if (!reason || !reason.trim()) {
      throw new ApiError(400, 'REASON_REQUIRED', 'A mandatory reason is required to cancel a maintenance plan.');
    }

    const plan = await MaintenancePlan.findOne({ planId, organisationId });
    if (!plan) {
      throw new ApiError(404, 'PLAN_NOT_FOUND', `Maintenance plan ${planId} was not found.`);
    }

    plan.isActive = false;
    await plan.save();

    if (plan.assetId) {
      await this.resolveAlertsForAsset(organisationId, plan.assetId);
    }

    return plan;
  }

  /**
   * Automatically resolves active alerts for an asset when serviced or decommissioned.
   */
  async resolveAlertsForAsset(organisationId, assetId) {
    const keys = [
      `MNT_${organisationId}_${assetId}_OVERDUE`,
      `MNT_${organisationId}_${assetId}_DUE_TODAY`,
      `MNT_${organisationId}_${assetId}_DUE_SOON`,
    ];

    for (const key of keys) {
      await operationalAlertService.autoResolveByDeduplicationKey({
        deduplicationKey: key,
        resolution: `Condition resolved via service completion or lifecycle update on ${getKolkataDate()}`,
      });
    }
  }

  /**
   * Evaluates maintenance alerts across assets and raises deduplicated OperationalAlert records.
   */
  async evaluateMaintenanceAlerts({ organisationId, cafeId = null }) {
    if (!organisationId) throw new ApiError(400, 'ORGANISATION_ID_REQUIRED', 'Organisation ID is required.');

    const query = {
      organisationId,
      operationalStatus: { $ne: 'RETIRED' },
      status: { $ne: 'DISCARDED' },
    };
    if (cafeId) query.cafeId = cafeId.toUpperCase();

    const assets = await Asset.find(query).lean();
    const todayStr = getKolkataDate();
    const results = {
      evaluatedCount: assets.length,
      alertsRaised: 0,
      alertsResolved: 0,
    };

    for (const asset of assets) {
      if (!asset.nextMaintenanceDue) continue;

      const dueStatus = calculateDueStatus(asset.nextMaintenanceDue, { referenceDate: todayStr });

      if (dueStatus === DUE_STATUSES.OVERDUE) {
        await operationalAlertService.raiseAlert({
          category: 'ASSET_MAINTENANCE',
          severity: asset.criticality === 'CRITICAL' ? 'SEV-1' : 'SEV-2',
          source: 'ASSET_MAINTENANCE_SCHEDULER',
          title: `Preventive Maintenance Overdue: ${asset.name} (${asset.assetId})`,
          description: `Asset ${asset.assetId} at café ${asset.cafeId} was due for maintenance on ${asset.nextMaintenanceDue}.`,
          deduplicationKey: `MNT_${organisationId}_${asset.assetId}_OVERDUE`,
          organisationId,
          cafeId: asset.cafeId,
        });
        results.alertsRaised++;
      } else if (dueStatus === DUE_STATUSES.DUE_TODAY) {
        await operationalAlertService.raiseAlert({
          category: 'ASSET_MAINTENANCE',
          severity: 'SEV-3',
          source: 'ASSET_MAINTENANCE_SCHEDULER',
          title: `Preventive Maintenance Due Today: ${asset.name} (${asset.assetId})`,
          description: `Asset ${asset.assetId} at café ${asset.cafeId} is due for scheduled service today (${asset.nextMaintenanceDue}).`,
          deduplicationKey: `MNT_${organisationId}_${asset.assetId}_DUE_TODAY`,
          organisationId,
          cafeId: asset.cafeId,
        });
        results.alertsRaised++;
      } else if (dueStatus === DUE_STATUSES.DUE_SOON) {
        await operationalAlertService.raiseAlert({
          category: 'ASSET_MAINTENANCE',
          severity: 'SEV-4',
          source: 'ASSET_MAINTENANCE_SCHEDULER',
          title: `Preventive Maintenance Due Soon: ${asset.name} (${asset.assetId})`,
          description: `Asset ${asset.assetId} at café ${asset.cafeId} is due for service on ${asset.nextMaintenanceDue}.`,
          deduplicationKey: `MNT_${organisationId}_${asset.assetId}_DUE_SOON`,
          organisationId,
          cafeId: asset.cafeId,
        });
        results.alertsRaised++;
      }

      // Check warranty expiry warning (within 30 days)
      if (asset.warrantyExpiryDate) {
        const warrantyStatus = calculateDueStatus(asset.warrantyExpiryDate, { dueSoonDays: 30, referenceDate: todayStr });
        if (warrantyStatus === DUE_STATUSES.DUE_SOON || warrantyStatus === DUE_STATUSES.DUE_TODAY) {
          await operationalAlertService.raiseAlert({
            category: 'ASSET_MAINTENANCE',
            severity: 'SEV-4',
            source: 'ASSET_MAINTENANCE_SCHEDULER',
            title: `Warranty Expiring Soon: ${asset.name} (${asset.assetId})`,
            description: `Manufacturer/vendor warranty for asset ${asset.assetId} expires on ${asset.warrantyExpiryDate}.`,
            deduplicationKey: `MNT_${organisationId}_${asset.assetId}_WARRANTY_EXPIRING`,
            organisationId,
            cafeId: asset.cafeId,
          });
          results.alertsRaised++;
        }
      }
    }

    return results;
  }
}

const assetMaintenanceService = new AssetMaintenanceService();

module.exports = {
  AssetMaintenanceService,
  assetMaintenanceService,
  DUE_STATUSES,
  getKolkataDate,
  calculateNextDueDate,
  calculateDueStatus,
};
