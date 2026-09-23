'use strict';

/**
 * ASSET & EQUIPMENT MAINTENANCE CONTROLLER (SCREEN 003)
 */

const {
  Asset,
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_OPERATIONAL_STATUSES,
  ASSET_CRITICALITIES,
} = require('../models/Asset');

const {
  WorkOrder,
  WORK_ORDER_TYPES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_PRIORITIES,
} = require('../models/WorkOrder');

const {
  MaintenancePlan,
} = require('../models/MaintenancePlan');

const {
  MaintenanceJob,
} = require('../models/MaintenanceJob');

const {
  SequenceCounter,
} = require('../models/SequenceCounter');

const {
  AssetBreakdownLog,
} = require('../models/AssetBreakdownLog');

const {
  CalibrationRecord,
} = require('../models/CalibrationRecord');

const {
  BusinessContract,
} = require('../models/BusinessContract');

const {
  InsurancePolicy,
} = require('../models/InsurancePolicy');

const {
  InsuranceClaim,
} = require('../models/InsuranceClaim');

const {
  MasterDuplicateCandidate,
} = require('../models/MasterDuplicateCandidate');

const ownerAssetReliabilityService = require('../services/ownerAssetReliabilityService');
const { assetMaintenanceService } = require('../services/assetMaintenanceService');

const {
  asyncHandler,
} = require('../utils/asyncHandler');

const {
  ApiError,
} = require('../utils/ApiError');

const {
  recordRequestAudit,
} = require('../services/auditService');

const { resolveEffectiveCafeScope, assertResourceCafeOwnership } = require('../utils/cafeScope');

function normalizeId(value) {
  return typeof value === 'string'
    ? value.trim().toUpperCase()
    : '';
}

function parsePositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function assertCafeAccess(request, cafeId) {
  if (!cafeId) return;
  if (request.auth.role === 'MASTER' || request.auth.role === 'OWNER') return;
  const isCafeOps = request.auth.workspaceMode === 'CAFE_OPERATIONS' ||
    request.headers?.['x-workspace-mode'] === 'CAFE_OPERATIONS' ||
    (request.auth.deviceContext?.deviceClass === 'CAFE_OWNED' && !!request.auth.deviceContext?.boundCafeId);
  const effectiveCafe = resolveEffectiveCafeScope(request);
  if (isCafeOps && effectiveCafe && effectiveCafe !== cafeId.trim().toUpperCase()) {
    throw new ApiError(
      403,
      'CROSS_CAFE_RESOURCE_DENIED',
      'Cross-café access is denied. You are not authorized for the requested café.'
    );
  }
  if (effectiveCafe && effectiveCafe !== cafeId.trim().toUpperCase()) {
    throw new ApiError(
      403,
      'CAFE_ACCESS_DENIED',
      'You do not have access to this café.'
    );
  }
}

// 1. GET /api/v1/assets/overview
const getAssetOverview = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  let effectiveCafe = null;
  if (!['MASTER', 'OWNER'].includes(request.auth.role)) {
    effectiveCafe = resolveEffectiveCafeScope(request);
  }
  const filter = { organisationId };

  if (effectiveCafe) {
    filter.cafeId = effectiveCafe;
  } else if (request.query.cafeId && request.query.cafeId !== 'ALL') {
    const normCafeId = normalizeId(request.query.cafeId);
    assertCafeAccess(request, normCafeId);
    filter.cafeId = normCafeId;
  }

  const allAssets = await Asset.find(filter).lean();
  const todayStr = new Date().toISOString().split('T')[0];
  const next30Days = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  const totalAssets = allAssets.length;
  let inService = 0;
  let underMaintenance = 0;
  let outOfService = 0;
  let dueSoon = 0;
  let overdue = 0;
  let criticalIssues = 0;
  let warrantyExpiring = 0;
  let calibrationOverdue = 0;

  const needsAttention = [];

  for (const asset of allAssets) {
    const opStatus = asset.operationalStatus || asset.status;
    if (opStatus === 'IN_SERVICE' || opStatus === 'OPERATIONAL') inService++;
    else if (opStatus === 'UNDER_MAINTENANCE') underMaintenance++;
    else if (opStatus === 'OUT_OF_SERVICE' || opStatus === 'DISCARDED') outOfService++;

    if (asset.nextMaintenanceDue) {
      if (asset.nextMaintenanceDue < todayStr && opStatus !== 'RETIRED') {
        overdue++;
        needsAttention.push({
          type: 'OVERDUE_MAINTENANCE',
          severity: asset.criticality === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
          assetId: asset.assetId,
          name: asset.name,
          cafeId: asset.cafeId,
          due: asset.nextMaintenanceDue,
          message: `Preventive maintenance overdue since ${asset.nextMaintenanceDue}`,
        });
      } else if (asset.nextMaintenanceDue <= next30Days) {
        dueSoon++;
      }
    }

    if (asset.safetyHold?.isSafetyHoldActive) {
      criticalIssues++;
      needsAttention.push({
        type: 'SAFETY_HOLD',
        severity: 'CRITICAL',
        assetId: asset.assetId,
        name: asset.name,
        cafeId: asset.cafeId,
        message: `Safety Hold: ${asset.safetyHold.holdReason || 'Equipment out of service'}`,
      });
    }

    if (asset.warrantyExpiryDate && asset.warrantyExpiryDate >= todayStr && asset.warrantyExpiryDate <= next30Days) {
      warrantyExpiring++;
    }

    if (asset.calibrationRequired && asset.nextCalibrationDue && asset.nextCalibrationDue < todayStr) {
      calibrationOverdue++;
    }
  }

  const openWorkOrders = await WorkOrder.find({
    organisationId,
    status: { $in: ['OPEN', 'TRIAGED', 'PLANNED', 'SCHEDULED', 'IN_PROGRESS', 'WAITING_PARTS'] },
  }).lean();

  return response.status(200).json({
    success: true,
    data: {
      kpis: {
        totalAssets,
        inService,
        underMaintenance,
        outOfService,
        dueSoon,
        overdue,
        criticalIssues,
        warrantyExpiring,
        calibrationOverdue,
        activeWorkOrders: openWorkOrders.length,
      },
      needsAttention: needsAttention.slice(0, 10),
    },
    correlationId: request.correlationId || null,
  });
});

// 2. GET /api/v1/assets
const listAssets = asyncHandler(async (request, response) => {
  const page = parsePositiveInteger(request.query.page, 1, 1000);
  const limit = parsePositiveInteger(request.query.limit, 25, 100);
  const skip = (page - 1) * limit;

  const filter = { organisationId: request.auth.organisationId };
  const { cafeId, status, operationalStatus, category, condition, criticality, search } = request.query;

  if (cafeId) {
    const normCafeId = normalizeId(cafeId);
    assertCafeAccess(request, normCafeId);
    filter.cafeId = normCafeId;
  } else if (!['MASTER', 'OWNER'].includes(request.auth.role)) {
    filter.cafeId = { $in: request.auth.assignedCafeIds };
  }

  if (operationalStatus) filter.operationalStatus = operationalStatus.toUpperCase();
  else if (status && ASSET_OPERATIONAL_STATUSES.includes(status.toUpperCase())) filter.operationalStatus = status.toUpperCase();

  if (category) filter.category = category.toUpperCase();
  if (condition) filter.condition = condition.toUpperCase();
  if (criticality) filter.criticality = criticality.toUpperCase();

  if (search) {
    const regex = new RegExp(search.trim(), 'i');
    filter.$or = [
      { name: regex },
      { assetId: regex },
      { serialNumber: regex },
      { manufacturer: regex },
      { model: regex },
    ];
  }

  const [assets, total] = await Promise.all([
    Asset.find(filter)
      .select('-__v -version')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Asset.countDocuments(filter),
  ]);

  return response.status(200).json({
    success: true,
    data: {
      assets,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
    correlationId: request.correlationId || null,
  });
});

// 3. POST /api/v1/assets
const createAsset = asyncHandler(async (request, response) => {
  const {
    cafeId: rawCafeId,
    name,
    category = 'BREWING_EQUIPMENT',
    manufacturer = '',
    model = '',
    serialNumber = '',
    placementArea = 'Main Counter',
    condition = 'GOOD',
    criticality = 'MEDIUM',
    operationalStatus = 'IN_SERVICE',
    acquisitionType = 'PURCHASED',
    purchaseDate = null,
    purchaseVendorId = '',
    invoiceReference = '',
    installationDate = null,
    commissioningDate = null,
    acquisitionCostPaisa = 0,
    warrantyProvider = '',
    warrantyStartDate = null,
    warrantyExpiryDate = null,
    serviceProviderId = '',
    serviceFrequency = 'Quarterly',
    maintenanceStrategy = 'PREVENTIVE_TIME_BASED',
    nextMaintenanceDue = null,
    calibrationRequired = false,
    calibrationFrequency = 'Annually',
    notes = '',
  } = request.body || {};

  const cafeId = normalizeId(rawCafeId);
  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  assertCafeAccess(request, cafeId);

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new ApiError(400, 'ASSET_NAME_REQUIRED', 'Asset name is required.');
  }

  // Duplicate serial check within organisation
  if (serialNumber && serialNumber.trim()) {
    const existingSerial = await Asset.findOne({
      organisationId: request.auth.organisationId,
      serialNumber: serialNumber.trim(),
    }).lean();

    if (existingSerial) {
      throw new ApiError(409, 'DUPLICATE_SERIAL_NUMBER', `Asset with serial number ${serialNumber} already exists (${existingSerial.assetId}).`);
    }
  }

  const assetId = await SequenceCounter.generateId({
    organisationId: request.auth.organisationId,
    sequenceKey: 'ASSET',
    prefix: 'AST',
    minimumDigits: 3,
  });

  const asset = await Asset.create({
    assetId,
    organisationId: request.auth.organisationId,
    cafeId,
    name: name.trim(),
    category: category.toUpperCase(),
    manufacturer: manufacturer.trim(),
    model: model.trim(),
    serialNumber: serialNumber.trim(),
    placementArea: placementArea.trim(),
    condition: condition.toUpperCase(),
    operationalStatus: operationalStatus.toUpperCase(),
    status: operationalStatus.toUpperCase() === 'IN_SERVICE' ? 'OPERATIONAL' : operationalStatus.toUpperCase(),
    criticality: criticality.toUpperCase(),
    acquisitionType: acquisitionType.toUpperCase(),
    purchaseDate,
    purchaseVendorId,
    invoiceReference,
    installationDate,
    commissioningDate,
    acquisitionCostPaisa: Math.max(0, Number(acquisitionCostPaisa) || 0),
    warrantyProvider,
    warrantyStartDate,
    warrantyExpiryDate,
    serviceProviderId,
    serviceFrequency,
    maintenanceStrategy,
    nextMaintenanceDue,
    calibrationRequired: Boolean(calibrationRequired),
    calibrationFrequency,
    calibrationStatus: calibrationRequired ? 'CURRENT' : 'NOT_REQUIRED',
    notes: notes.trim(),
    createdByUserId: request.auth.userId,
    locationHistory: [
      {
        toCafeId: cafeId,
        transferredAt: new Date(),
        transferredByUserId: request.auth.userId,
        reason: 'Initial Registration & Deployment',
        conditionAtTransfer: condition.toUpperCase(),
      },
    ],
  });

  await recordRequestAudit({
    request,
    module: 'ASSETS',
    action: 'ASSET_REGISTERED',
    entityType: 'Asset',
    entityId: asset.assetId,
    metadata: { name: asset.name, cafeId: asset.cafeId, category: asset.category },
  });

  return response.status(201).json({
    success: true,
    message: 'Asset registered successfully.',
    data: { asset },
    correlationId: request.correlationId || null,
  });
});

// 4. GET /api/v1/assets/:assetId
const getAssetDetail = asyncHandler(async (request, response) => {
  const normAssetId = normalizeId(request.params.assetId);
  const asset = await Asset.findOne({
    assetId: normAssetId,
    organisationId: request.auth.organisationId,
  }).lean();

  if (!asset) {
    throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
  }

  assertCafeAccess(request, asset.cafeId);

  const [workOrders, breakdowns, calibrations, amcContracts, claims, metrics, replacement, dupCandidate, maintenanceHistory, maintenancePlans] =
    await Promise.all([
      WorkOrder.find({
        assetId: normAssetId,
        organisationId: request.auth.organisationId,
      }).sort({ createdAt: -1 }).lean(),
      AssetBreakdownLog.find({
        assetId: normAssetId,
        organisationId: request.auth.organisationId,
      }).sort({ reportedAt: -1 }).limit(15).lean().catch(() => []),
      CalibrationRecord.find({
        assetId: normAssetId,
        organisationId: request.auth.organisationId,
      }).sort({ calibrationDate: -1 }).limit(10).lean().catch(() => []),
      BusinessContract.find({
        organisationId: request.auth.organisationId,
        contractType: 'AMC_MAINTENANCE',
        $or: [{ counterpartyId: asset.serviceProviderId || '' }, { title: new RegExp(normAssetId, 'i') }],
      }).lean().catch(() => []),
      InsuranceClaim.find({
        organisationId: request.auth.organisationId,
        assetId: normAssetId,
      }).lean().catch(() => []),
      ownerAssetReliabilityService.getAssetReliabilityMetrics(request.auth.organisationId, normAssetId).catch(() => null),
      ownerAssetReliabilityService.getReplacementDecisionIndicators(request.auth.organisationId, normAssetId).catch(() => null),
      MasterDuplicateCandidate.findOne({
        organisationId: request.auth.organisationId,
        domainCode: 'ASSET',
        $or: [{ masterRecordIdA: normAssetId }, { masterRecordIdB: normAssetId }],
      }).lean().catch(() => null),
      MaintenanceJob.find({
        assetId: normAssetId,
        organisationId: request.auth.organisationId,
      }).sort({ completedAt: -1, createdAt: -1 }).lean().catch(() => []),
      MaintenancePlan.find({
        assetId: normAssetId,
        organisationId: request.auth.organisationId,
      }).sort({ nextDueDate: 1 }).lean().catch(() => []),
    ]);

  return response.status(200).json({
    success: true,
    data: {
      asset,
      workOrders,
      breakdowns: breakdowns || [],
      calibrations: calibrations || [],
      amcContracts: amcContracts || [],
      insuranceClaims: claims || [],
      reliabilityMetrics: metrics || null,
      replacementIndicators: replacement || null,
      duplicateCandidate: dupCandidate || null,
      maintenanceHistory: maintenanceHistory || [],
      maintenancePlans: maintenancePlans || [],
    },
    correlationId: request.correlationId || null,
  });
});

// 5. POST /api/v1/assets/:assetId/commission
const commissionAsset = asyncHandler(async (request, response) => {
  const normAssetId = normalizeId(request.params.assetId);
  const asset = await Asset.findOne({
    assetId: normAssetId,
    organisationId: request.auth.organisationId,
  });

  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
  assertCafeAccess(request, asset.cafeId);

  asset.operationalStatus = 'IN_SERVICE';
  asset.status = 'OPERATIONAL';
  asset.commissioningDate = new Date().toISOString().split('T')[0];
  asset.commissioningChecklist = {
    isInstallationComplete: true,
    isPowerUtilitiesChecked: true,
    isInitialInspectionPassed: true,
    isTestRunPassed: true,
    commissionedByUserId: request.auth.userId,
    commissionedAt: new Date(),
  };

  await asset.save();

  await recordRequestAudit({
    request,
    module: 'ASSETS',
    action: 'ASSET_COMMISSIONED',
    entityType: 'Asset',
    entityId: asset.assetId,
    metadata: { operationalStatus: asset.operationalStatus },
  });

  return response.status(200).json({
    success: true,
    message: 'Asset commissioned and placed in service.',
    data: { asset },
    correlationId: request.correlationId || null,
  });
});

// 6. POST /api/v1/assets/:assetId/transfer
const transferAsset = asyncHandler(async (request, response) => {
  const normAssetId = normalizeId(request.params.assetId);
  const { toCafeId: rawToCafeId, reason = '', conditionAtTransfer = 'GOOD' } = request.body || {};

  const toCafeId = normalizeId(rawToCafeId);
  if (!toCafeId) throw new ApiError(400, 'DESTINATION_CAFE_REQUIRED', 'Destination cafeId is required.');

  const asset = await Asset.findOne({
    assetId: normAssetId,
    organisationId: request.auth.organisationId,
  });

  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');

  const fromCafeId = asset.cafeId;
  asset.cafeId = toCafeId;
  asset.condition = conditionAtTransfer.toUpperCase();
  asset.locationHistory.push({
    fromCafeId,
    toCafeId,
    transferredAt: new Date(),
    transferredByUserId: request.auth.userId,
    reason: reason.trim() || 'Inter-Café Operational Transfer',
    conditionAtTransfer: conditionAtTransfer.toUpperCase(),
  });

  await asset.save();

  await recordRequestAudit({
    request,
    module: 'ASSETS',
    action: 'ASSET_TRANSFERRED',
    entityType: 'Asset',
    entityId: asset.assetId,
    metadata: { fromCafeId, toCafeId, reason },
  });

  return response.status(200).json({
    success: true,
    message: `Asset successfully transferred from ${fromCafeId} to ${toCafeId}.`,
    data: { asset },
    correlationId: request.correlationId || null,
  });
});

// 7. POST /api/v1/assets/:assetId/safety-hold
const toggleSafetyHold = asyncHandler(async (request, response) => {
  const normAssetId = normalizeId(request.params.assetId);
  const { isHoldActive, reason = '' } = request.body || {};

  const asset = await Asset.findOne({
    assetId: normAssetId,
    organisationId: request.auth.organisationId,
  });

  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');

  if (isHoldActive) {
    asset.operationalStatus = 'OUT_OF_SERVICE';
    asset.safetyHold = {
      isSafetyHoldActive: true,
      holdReason: reason.trim() || 'Safety hazard detected — Out of service',
      holdReportedByUserId: request.auth.userId,
      holdReportedAt: new Date(),
    };
  } else {
    asset.operationalStatus = 'IN_SERVICE';
    asset.safetyHold = {
      isSafetyHoldActive: false,
      holdReason: '',
      holdReportedByUserId: null,
      holdReportedAt: null,
    };
  }

  await asset.save();

  await recordRequestAudit({
    request,
    module: 'ASSETS',
    action: isHoldActive ? 'ASSET_SAFETY_HOLD_APPLIED' : 'ASSET_SAFETY_HOLD_RELEASED',
    entityType: 'Asset',
    entityId: asset.assetId,
    metadata: { isHoldActive, reason },
  });

  return response.status(200).json({
    success: true,
    message: isHoldActive ? 'Safety Hold applied: Asset marked Out of Service.' : 'Safety Hold released: Asset returned to service.',
    data: { asset },
    correlationId: request.correlationId || null,
  });
});

// 8. POST /api/v1/assets/:assetId/retire (Primary Master authorized for final capital retirement)
const retireAsset = asyncHandler(async (request, response) => {
  const normAssetId = normalizeId(request.params.assetId);
  const { reason = 'End of Life', disposalMethod = 'Scrapped', notes = '' } = request.body || {};

  const asset = await Asset.findOne({
    assetId: normAssetId,
    organisationId: request.auth.organisationId,
  });

  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');

  const isPrimary = request.auth.isPrimaryMaster === true;

  if (!isPrimary && request.auth.role !== 'MASTER') {
    throw new ApiError(403, 'PRIMARY_MASTER_AUTHORITY_REQUIRED', 'Only Primary Master holds authority for capital asset retirement and write-off.');
  }

  asset.operationalStatus = 'RETIRED';
  asset.status = 'DISCARDED';
  asset.retirementRecord = {
    retiredAt: new Date(),
    retiredByUserId: request.auth.userId,
    reason,
    disposalMethod,
    notes,
    isPrimaryAuthorized: isPrimary,
  };

  await asset.save();

  await recordRequestAudit({
    request,
    module: 'ASSETS',
    action: 'ASSET_RETIRED',
    entityType: 'Asset',
    entityId: asset.assetId,
    metadata: { reason, disposalMethod, isPrimaryAuthorized: isPrimary },
  });

  return response.status(200).json({
    success: true,
    message: 'Asset successfully retired and removed from active service.',
    data: { asset },
    correlationId: request.correlationId || null,
  });
});

// 9. Work Orders Endpoints
const listWorkOrders = asyncHandler(async (request, response) => {
  const filter = { organisationId: request.auth.organisationId };
  if (request.query.cafeId) {
    const normCafe = normalizeId(request.query.cafeId);
    assertCafeAccess(request, normCafe);
    filter.cafeId = normCafe;
  }
  if (request.query.status) filter.status = request.query.status.toUpperCase();
  if (request.query.assetId) filter.assetId = normalizeId(request.query.assetId);

  const workOrders = await WorkOrder.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  return response.status(200).json({
    success: true,
    data: { workOrders },
    correlationId: request.correlationId || null,
  });
});

const createWorkOrder = asyncHandler(async (request, response) => {
  const {
    assetId: rawAssetId,
    title,
    workType = 'CORRECTIVE_REPAIR',
    priority = 'NORMAL',
    description,
    assignedExecutionType = 'UNASSIGNED',
    assignedUserId = null,
    vendorId = null,
    technicianName = '',
    plannedStartDate = null,
    dueDate = null,
  } = request.body || {};

  const assetId = normalizeId(rawAssetId);
  const asset = await Asset.findOne({
    assetId,
    organisationId: request.auth.organisationId,
  }).lean();

  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
  assertCafeAccess(request, asset.cafeId);

  if (!title || !title.trim()) throw new ApiError(400, 'TITLE_REQUIRED', 'Work order title is required.');
  if (!description || !description.trim()) throw new ApiError(400, 'DESCRIPTION_REQUIRED', 'Work order description is required.');

  const workOrderId = await SequenceCounter.generateId({
    organisationId: request.auth.organisationId,
    sequenceKey: 'WORK_ORDER',
    prefix: 'WO',
    minimumDigits: 4,
  });

  const workOrder = await WorkOrder.create({
    workOrderId,
    organisationId: request.auth.organisationId,
    cafeId: asset.cafeId,
    assetId,
    title: title.trim(),
    workType: workType.toUpperCase(),
    priority: priority.toUpperCase(),
    description: description.trim(),
    status: 'OPEN',
    reportedByUserId: request.auth.userId,
    assignedExecutionType,
    assignedUserId,
    vendorId,
    technicianName,
    plannedStartDate,
    dueDate,
  });

  await recordRequestAudit({
    request,
    module: 'ASSETS',
    action: 'WORK_ORDER_CREATED',
    entityType: 'WorkOrder',
    entityId: workOrder.workOrderId,
    metadata: { assetId, title: workOrder.title, priority: workOrder.priority },
  });

  return response.status(201).json({
    success: true,
    message: 'Work order created successfully.',
    data: { workOrder },
    correlationId: request.correlationId || null,
  });
});

const updateWorkOrder = asyncHandler(async (request, response) => {
  const normWoId = normalizeId(request.params.workOrderId);
  const workOrder = await WorkOrder.findOne({
    workOrderId: normWoId,
    organisationId: request.auth.organisationId,
  });

  if (!workOrder) throw new ApiError(404, 'WORK_ORDER_NOT_FOUND', 'Work order not found.');

  const {
    status,
    blocker,
    blockerNotes,
    downtimeMinutes,
    costPaisa,
    completionNotes,
    failureAnalysis,
    parts,
  } = request.body || {};

  if (status) workOrder.status = status.toUpperCase();
  if (blocker) workOrder.blocker = blocker.toUpperCase();
  if (blockerNotes !== undefined) workOrder.blockerNotes = blockerNotes;
  if (downtimeMinutes !== undefined) workOrder.downtimeMinutes = Number(downtimeMinutes) || 0;
  if (costPaisa !== undefined) workOrder.costPaisa = Number(costPaisa) || 0;
  if (completionNotes !== undefined) workOrder.completionNotes = completionNotes;
  if (failureAnalysis) workOrder.failureAnalysis = { ...workOrder.failureAnalysis, ...failureAnalysis };
  if (parts) workOrder.parts = parts;

  if (status === 'COMPLETED' && !workOrder.actualCompletionDate) {
    workOrder.actualCompletionDate = new Date();
  }

  await workOrder.save();

  return response.status(200).json({
    success: true,
    message: 'Work order updated successfully.',
    data: { workOrder },
    correlationId: request.correlationId || null,
  });
});

// 10. Maintenance Plans Endpoints
const listMaintenancePlans = asyncHandler(async (request, response) => {
  if (request.auth.role === 'STAFF') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Staff users are not authorized to view maintenance plans.');
  }

  const query = { organisationId: request.auth.organisationId };
  if (request.query.cafeId && request.query.cafeId !== 'ALL') {
    const normCafe = normalizeId(request.query.cafeId);
    assertCafeAccess(request, normCafe);
    query.$or = [{ cafeId: normCafe }, { cafeId: null }];
  } else if (!['MASTER', 'OWNER'].includes(request.auth.role)) {
    const effectiveCafe = resolveEffectiveCafeScope(request);
    if (effectiveCafe) {
      query.$or = [{ cafeId: effectiveCafe }, { cafeId: null }];
    } else if (request.auth.assignedCafeIds?.length) {
      query.$or = [{ cafeId: { $in: request.auth.assignedCafeIds } }, { cafeId: null }];
    }
  }

  const plans = await MaintenancePlan.find(query).sort({ nextDueDate: 1 }).lean();

  return response.status(200).json({
    success: true,
    data: { plans },
    correlationId: request.correlationId || null,
  });
});

const createMaintenancePlan = asyncHandler(async (request, response) => {
  if (request.auth.role === 'STAFF') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Staff users are not authorized to create maintenance plans.');
  }
  if (request.auth.role === 'OWNER') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Owner role has read-only oversight and cannot create maintenance plans.');
  }

  const { name, assetId: rawAssetId, category, frequencyType = 'QUARTERLY', intervalDays = 90, startDate, jobPlan, cafeId: rawCafeId } = request.body || {};

  if (!name || !name.trim()) throw new ApiError(400, 'PLAN_NAME_REQUIRED', 'Plan name is required.');

  let assetId = rawAssetId ? normalizeId(rawAssetId) : null;
  let targetCafeId = rawCafeId ? normalizeId(rawCafeId) : null;

  if (assetId) {
    const asset = await Asset.findOne({
      assetId,
      organisationId: request.auth.organisationId,
    }).lean();
    if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
    assertCafeAccess(request, asset.cafeId);
    targetCafeId = asset.cafeId;
  } else if (targetCafeId) {
    assertCafeAccess(request, targetCafeId);
  } else if (!['MASTER', 'OWNER'].includes(request.auth.role)) {
    const effectiveCafe = resolveEffectiveCafeScope(request);
    if (effectiveCafe) targetCafeId = effectiveCafe;
  }

  const planId = await SequenceCounter.generateId({
    organisationId: request.auth.organisationId,
    sequenceKey: 'MAINTENANCE_PLAN',
    prefix: 'PLN',
    minimumDigits: 4,
  });

  const startStr = startDate
    ? (typeof startDate === 'string' && startDate.length >= 10 ? startDate.slice(0, 10) : new Date(startDate).toISOString().split('T')[0])
    : new Date().toISOString().split('T')[0];

  const plan = await MaintenancePlan.create({
    planId,
    organisationId: request.auth.organisationId,
    cafeId: targetCafeId,
    assetId,
    name: name.trim(),
    category: category ? String(category).trim().toUpperCase() : 'BREWING_EQUIPMENT',
    frequencyType,
    intervalDays: Number(intervalDays) || 90,
    startDate: startStr,
    nextDueDate: startStr,
    jobPlan: typeof jobPlan === 'object' ? jobPlan : { title: jobPlan || 'Standard Preventive Maintenance SOP', tasks: [] },
    isActive: true,
    createdByUserId: request.auth.userId,
  });

  await recordRequestAudit({
    request,
    module: 'ASSETS',
    action: 'MAINTENANCE_PLAN_CREATED',
    entityType: 'MaintenancePlan',
    entityId: plan.planId,
    metadata: { name: plan.name, frequencyType: plan.frequencyType, assetId },
  });

  return response.status(201).json({
    success: true,
    message: 'Maintenance plan created successfully.',
    data: { plan },
    correlationId: request.correlationId || null,
  });
});

// 11. Maintenance Backlog & Queue
const getMaintenanceBacklog = asyncHandler(async (request, response) => {
  if (request.auth.role === 'STAFF') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Staff users are not authorized to view maintenance schedules.');
  }

  let targetCafe = null;
  if (request.query.cafeId && request.query.cafeId !== 'ALL') {
    const normCafe = normalizeId(request.query.cafeId);
    assertCafeAccess(request, normCafe);
    targetCafe = normCafe;
  } else if (!['MASTER', 'OWNER'].includes(request.auth.role)) {
    targetCafe = resolveEffectiveCafeScope(request);
  }

  const backlog = await assetMaintenanceService.getMaintenanceBacklog({
    organisationId: request.auth.organisationId,
    cafeId: targetCafe,
    statusFilter: request.query.status || null,
  });

  return response.status(200).json({
    success: true,
    data: { backlog },
    correlationId: request.correlationId || null,
  });
});

// 12. Maintenance Service History
const getMaintenanceHistory = asyncHandler(async (request, response) => {
  if (request.auth.role === 'STAFF') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Staff users are not authorized to view maintenance history.');
  }

  const filter = { organisationId: request.auth.organisationId };
  if (request.query.cafeId && request.query.cafeId !== 'ALL') {
    const normCafe = normalizeId(request.query.cafeId);
    assertCafeAccess(request, normCafe);
    filter.cafeId = normCafe;
  } else if (!['MASTER', 'OWNER'].includes(request.auth.role)) {
    const effectiveCafe = resolveEffectiveCafeScope(request);
    if (effectiveCafe) {
      filter.cafeId = effectiveCafe;
    } else if (request.auth.assignedCafeIds?.length) {
      filter.cafeId = { $in: request.auth.assignedCafeIds };
    }
  }

  const rawAssetId = request.params.assetId || request.query.assetId;
  if (rawAssetId) {
    const normAssetId = normalizeId(rawAssetId);
    const asset = await Asset.findOne({
      assetId: normAssetId,
      organisationId: request.auth.organisationId,
    }).lean();
    if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
    assertCafeAccess(request, asset.cafeId);
    filter.assetId = normAssetId;
  }

  const history = await MaintenanceJob.find(filter)
    .sort({ completedAt: -1, createdAt: -1 })
    .lean();

  return response.status(200).json({
    success: true,
    data: { history },
    correlationId: request.correlationId || null,
  });
});

// 13. Complete Maintenance Job
const completeMaintenanceJob = asyncHandler(async (request, response) => {
  if (request.auth.role === 'STAFF') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Staff users are not authorized to complete maintenance.');
  }
  if (request.auth.role === 'OWNER') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Owner role has read-only oversight and cannot complete maintenance.');
  }

  const normJobId = request.params.jobId ? normalizeId(request.params.jobId) : null;
  const { assetId: rawAssetId, planId: rawPlanId } = request.body || {};
  let assetId = rawAssetId ? normalizeId(rawAssetId) : null;

  if (!assetId && normJobId) {
    const existingJob = await MaintenanceJob.findOne({
      jobId: normJobId,
      organisationId: request.auth.organisationId,
    }).lean();
    if (existingJob) assetId = existingJob.assetId;
  }

  if (!assetId) {
    throw new ApiError(400, 'ASSET_ID_REQUIRED', 'Asset ID is required to complete maintenance.');
  }

  const asset = await Asset.findOne({
    assetId,
    organisationId: request.auth.organisationId,
  }).lean();
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
  assertCafeAccess(request, asset.cafeId);

  const result = await assetMaintenanceService.completeMaintenance({
    organisationId: request.auth.organisationId,
    assetId,
    jobId: normJobId,
    planId: rawPlanId ? normalizeId(rawPlanId) : null,
    payload: request.body || {},
    user: request.auth,
  });

  await recordRequestAudit({
    request,
    module: 'ASSETS',
    action: 'MAINTENANCE_COMPLETED',
    entityType: 'Asset',
    entityId: assetId,
    metadata: {
      jobId: result.job?.jobId,
      nextMaintenanceDue: result.nextMaintenanceDue,
      costPaisa: result.job?.costPaisa,
    },
  });

  return response.status(200).json({
    success: true,
    message: 'Maintenance completed and record persisted successfully.',
    data: result,
    correlationId: request.correlationId || null,
  });
});

// 14. Reschedule Maintenance Job
const rescheduleMaintenanceJob = asyncHandler(async (request, response) => {
  if (request.auth.role === 'STAFF') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Staff users are not authorized to reschedule maintenance.');
  }
  if (request.auth.role === 'OWNER') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Owner role has read-only oversight and cannot reschedule maintenance.');
  }

  const normJobId = request.params.jobId ? normalizeId(request.params.jobId) : null;
  const { assetId: rawAssetId, planId: rawPlanId, newDueDate, reason } = request.body || {};
  let assetId = rawAssetId ? normalizeId(rawAssetId) : null;

  if (!assetId && normJobId) {
    const existingJob = await MaintenanceJob.findOne({
      jobId: normJobId,
      organisationId: request.auth.organisationId,
    }).lean();
    if (existingJob) assetId = existingJob.assetId;
  }

  if (!assetId) {
    throw new ApiError(400, 'ASSET_ID_REQUIRED', 'Asset ID is required to reschedule maintenance.');
  }

  const asset = await Asset.findOne({
    assetId,
    organisationId: request.auth.organisationId,
  }).lean();
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
  assertCafeAccess(request, asset.cafeId);

  const result = await assetMaintenanceService.rescheduleMaintenance({
    organisationId: request.auth.organisationId,
    assetId,
    planId: rawPlanId ? normalizeId(rawPlanId) : null,
    jobId: normJobId,
    newDueDate,
    reason,
    user: request.auth,
  });

  await recordRequestAudit({
    request,
    module: 'ASSETS',
    action: 'MAINTENANCE_RESCHEDULED',
    entityType: 'Asset',
    entityId: assetId,
    metadata: {
      oldDueDate: result.oldDueDate,
      newDueDate: result.newDueDate,
      reason,
    },
  });

  return response.status(200).json({
    success: true,
    message: 'Maintenance rescheduled successfully.',
    data: result,
    correlationId: request.correlationId || null,
  });
});

// 15. Cancel Maintenance Plan
const cancelMaintenancePlan = asyncHandler(async (request, response) => {
  if (request.auth.role === 'STAFF') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Staff users are not authorized to cancel maintenance plans.');
  }
  if (request.auth.role === 'OWNER') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Owner role has read-only oversight and cannot cancel maintenance plans.');
  }

  const normPlanId = normalizeId(request.params.planId);
  const { reason } = request.body || {};

  const plan = await MaintenancePlan.findOne({
    planId: normPlanId,
    organisationId: request.auth.organisationId,
  }).lean();
  if (!plan) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Maintenance plan not found.');
  if (plan.cafeId) assertCafeAccess(request, plan.cafeId);

  const result = await assetMaintenanceService.cancelMaintenancePlan({
    organisationId: request.auth.organisationId,
    planId: normPlanId,
    reason,
    user: request.auth,
  });

  await recordRequestAudit({
    request,
    module: 'ASSETS',
    action: 'MAINTENANCE_PLAN_CANCELLED',
    entityType: 'MaintenancePlan',
    entityId: normPlanId,
    metadata: { reason },
  });

  return response.status(200).json({
    success: true,
    message: 'Maintenance plan cancelled successfully.',
    data: { plan: result },
    correlationId: request.correlationId || null,
  });
});

// 16. Evaluate Maintenance Alerts
const runMaintenanceAlertEvaluation = asyncHandler(async (request, response) => {
  if (request.auth.role === 'STAFF') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Staff users are not authorized to trigger alert evaluations.');
  }
  let targetCafe = null;
  if (!['MASTER', 'OWNER'].includes(request.auth.role)) {
    targetCafe = resolveEffectiveCafeScope(request);
  }
  const results = await assetMaintenanceService.evaluateMaintenanceAlerts({
    organisationId: request.auth.organisationId,
    cafeId: targetCafe,
  });

  return response.status(200).json({
    success: true,
    message: 'Maintenance alerts evaluated successfully.',
    data: results,
    correlationId: request.correlationId || null,
  });
});

// Backward compatibility: Log maintenance job
const logMaintenanceJob = asyncHandler(async (request, response) => {
  if (request.auth.role === 'STAFF') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Staff users are not authorized to log maintenance jobs.');
  }
  if (request.auth.role === 'OWNER') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Owner role has read-only oversight and cannot log maintenance jobs.');
  }

  const normAssetId = normalizeId(request.params.assetId);
  const asset = await Asset.findOne({
    assetId: normAssetId,
    organisationId: request.auth.organisationId,
  });

  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
  assertCafeAccess(request, asset.cafeId);

  const { issueDescription, costPaisa = 0, technicianName = '', resolutionNotes = '', nextMaintenanceDue } = request.body || {};

  const jobId = await SequenceCounter.generateId({
    organisationId: request.auth.organisationId,
    sequenceKey: 'MAINTENANCE',
    prefix: 'MNT',
    minimumDigits: 4,
  });

  const job = await MaintenanceJob.create({
    jobId,
    organisationId: request.auth.organisationId,
    cafeId: asset.cafeId,
    assetId: normAssetId,
    issueDescription: issueDescription || 'General Service Logged',
    costPaisa: Number(costPaisa) || 0,
    technicianName,
    resolutionNotes,
    loggedByUserId: request.auth.userId,
    status: 'COMPLETED',
    completedAt: new Date(),
  });

  asset.lastServiceDate = new Date().toISOString().split('T')[0];
  if (nextMaintenanceDue) asset.nextMaintenanceDue = nextMaintenanceDue;
  await asset.save();

  await recordRequestAudit({
    request,
    module: 'ASSETS',
    action: 'MAINTENANCE_JOB_LOGGED',
    entityType: 'Asset',
    entityId: normAssetId,
    metadata: { jobId: job.jobId },
  });

  return response.status(201).json({
    success: true,
    message: 'Maintenance job logged successfully.',
    data: { job, asset },
    correlationId: request.correlationId || null,
  });
});

const recordInspection = asyncHandler(async (request, response) => {
  if (request.auth.role === 'STAFF') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Staff users are not authorized to record inspections.');
  }
  if (request.auth.role === 'OWNER') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Owner role has read-only oversight and cannot record inspections.');
  }

  const { assetId: rawAssetId, verdict = 'PASS', notes = '' } = request.body || {};
  const normAssetId = normalizeId(rawAssetId);
  if (!normAssetId) throw new ApiError(400, 'ASSET_ID_REQUIRED', 'Asset ID is required.');

  const asset = await Asset.findOne({
    assetId: normAssetId,
    organisationId: request.auth.organisationId,
  });

  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
  assertCafeAccess(request, asset.cafeId);

  const jobId = await SequenceCounter.generateId({
    organisationId: request.auth.organisationId,
    sequenceKey: 'MAINTENANCE',
    prefix: 'MNT',
    minimumDigits: 4,
  });

  const job = await MaintenanceJob.create({
    jobId,
    organisationId: request.auth.organisationId,
    cafeId: asset.cafeId,
    assetId: normAssetId,
    issueDescription: `Periodic Inspection Calibration — ${verdict}`,
    costPaisa: 0,
    technicianName: request.auth.name || 'Equipment Inspector',
    resolutionNotes: notes || `Inspection completed with verdict: ${verdict}`,
    loggedByUserId: request.auth.userId,
    status: 'COMPLETED',
    completedAt: new Date(),
  });

  asset.lastServiceDate = new Date().toISOString().split('T')[0];
  await asset.save();

  await recordRequestAudit({
    request,
    module: 'ASSETS',
    action: 'RECORD_INSPECTION',
    entityType: 'ASSET',
    entityId: normAssetId,
    reason: notes || `Inspection verdict ${verdict}`,
    result: 'SUCCESS',
    riskClassification: 'LOW',
  });

  return response.status(201).json({
    success: true,
    message: `Inspection logged for ${normAssetId}: ${verdict}.`,
    data: { job, asset },
    correlationId: request.correlationId || null,
  });
});

module.exports = {
  getAssetOverview,
  listAssets,
  createAsset,
  getAssetDetail,
  commissionAsset,
  transferAsset,
  toggleSafetyHold,
  retireAsset,
  listWorkOrders,
  createWorkOrder,
  updateWorkOrder,
  listMaintenancePlans,
  createMaintenancePlan,
  getMaintenanceBacklog,
  getMaintenanceHistory,
  completeMaintenanceJob,
  rescheduleMaintenanceJob,
  cancelMaintenancePlan,
  runMaintenanceAlertEvaluation,
  logMaintenanceJob,
  recordInspection,
};
