'use strict';

const mongoose = require('mongoose');

/**
 * QUALITY & COMPLIANCE CONTROLLER — SCR-021
 * Food Safety Management System (FSMS), HACCP, PRP, Inspections,
 * Temperature Monitoring, Quality Holds, NCR, CAPA, Traceability,
 * Audits & Compliance Register for Zamorin Cafés.
 */

const {
  QualityChecklist,
  CHECKLIST_FREQUENCIES,
  OVERALL_RESULTS,
} = require('../models/QualityChecklist');

const {
  SequenceCounter,
} = require('../models/SequenceCounter');

const { FoodSafetyService } = require('../services/foodSafetyService');
const { FoodSafetyIncident } = require('../models/FoodSafetyIncident');
const { InventoryLot } = require('../models/InventoryLot');
const { PurchaseOrder } = require('../models/PurchaseOrder');
const { Vendor } = require('../models/Vendor');
const { Cafe } = require('../models/Cafe');
const { CalibrationRecord } = require('../models/CalibrationRecord');
const { EmployeeTraining } = require('../models/EmployeeTraining');
const { Bill } = require('../models/Bill');
const { CapaRecord } = require('../models/CapaRecord');
const {
  QualityHold,
  QUALITY_HOLD_DISPOSITIONS,
} = require('../models/QualityHold');
const {
  QualityNonConformance,
  NCR_SOURCES,
  NCR_SEVERITIES,
} = require('../models/QualityNonConformance');
const { AuditEvent } = require('../models/AuditEvent');

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

function getIstBusinessDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function parsePositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function assertCafeAccess(request, cafeId) {
  if (!cafeId) return;
  const cleanCafe = cafeId.trim().toUpperCase();
  const role = request?.auth?.role;
  if (role === 'MASTER') return;
  if (role === 'OWNER') {
    const assignedCafeIds = (request?.auth?.assignedCafeIds || []).map((c) => String(c).trim().toUpperCase());
    if (!assignedCafeIds.includes(cleanCafe)) {
      throw new ApiError(
        403,
        'CAFE_ACCESS_DENIED',
        'You do not have access to this café.'
      );
    }
    return;
  }
  const effectiveCafe = resolveEffectiveCafeScope(request);
  if (effectiveCafe && effectiveCafe !== cleanCafe) {
    throw new ApiError(
      403,
      'CAFE_ACCESS_DENIED',
      'You do not have access to this café.'
    );
  }
}

function buildQualityScopeFilter(request, extra = {}) {
  const filter = {
    organisationId: request.auth.organisationId,
    ...extra,
  };

  const requestedCafeId = normalizeId(request.query?.cafeId || '');
  if (requestedCafeId && requestedCafeId !== 'ALL') {
    assertCafeAccess(request, requestedCafeId);
    filter.cafeId = requestedCafeId;
    return filter;
  }

  if (request.auth.role !== 'MASTER') {
    const assignedCafeIds = (request.auth.assignedCafeIds || [])
      .map(normalizeId)
      .filter(Boolean);
    filter.cafeId = { $in: assignedCafeIds };
  }

  return filter;
}

function resolveSafetyRegisterScope(request, rawCafeId = null) {
  const cafeId = normalizeId(rawCafeId || '');
  if (cafeId && cafeId !== 'ALL') {
    assertCafeAccess(request, cafeId);
    return { cafeId, cafeIds: [] };
  }

  if (request.auth.role === 'MASTER') {
    return { cafeId: null, cafeIds: [] };
  }

  const assignedCafeIds = (request.auth.assignedCafeIds || [])
    .map(normalizeId)
    .filter(Boolean);

  return {
    cafeId: null,
    cafeIds: assignedCafeIds.length > 0
      ? assignedCafeIds
      : ['__NO_AUTHORIZED_CAFE__'],
  };
}


async function runQualityAtomic(work) {
  if (mongoose.connection?.readyState !== 1 || typeof mongoose.startSession !== 'function') {
    return work(null);
  }

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

function capaSourceFromNcr(ncr) {
  switch (String(ncr?.source || '').toUpperCase()) {
    case 'CHECKLIST_CRITICAL_FAIL':
      return 'HYGIENE_CHECKLIST';
    case 'TEMPERATURE_EXCURSION':
      return 'TEMPERATURE_EXCURSION';
    case 'RECEIVING_INSPECTION':
    case 'SUPPLIER_QUALITY':
      return 'SUPPLIER_QUALITY';
    case 'INTERNAL_AUDIT':
      return 'INTERNAL_AUDIT';
    default:
      return 'OPERATIONAL_ANOMALY';
  }
}

/**
 * 1. GET /api/v1/quality/overview
 */
const getQualityOverview = asyncHandler(async (request, response) => {
  const filter = buildQualityScopeFilter(request);
  const organisationId = request.auth.organisationId;
  const singleCafeId = typeof filter.cafeId === 'string' ? filter.cafeId : null;

  const [
    dbChecklists,
    totalChecklists,
  ] = await Promise.all([
    QualityChecklist.find(filter)
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    QualityChecklist.countDocuments(filter),
  ]);

  let activeHolds = [];
  if (qualitySourceConnected(QualityHold.find)) {
    const holdQuery = QualityHold.find({
      ...filter,
      status: 'ON_HOLD',
    })
      .sort({ placedAt: -1 })
      .limit(500);
    activeHolds = holdQuery && typeof holdQuery.lean === 'function'
      ? await holdQuery.lean()
      : await holdQuery;
    if (!Array.isArray(activeHolds)) activeHolds = [];
  }

  let openNcrs = [];
  if (qualitySourceConnected(QualityNonConformance.find)) {
    const ncrQuery = QualityNonConformance.find({
      ...filter,
      status: { $ne: 'CLOSED' },
    })
      .sort({ reportedAt: -1 })
      .limit(500);
    openNcrs = ncrQuery && typeof ncrQuery.lean === 'function'
      ? await ncrQuery.lean()
      : await ncrQuery;
    if (!Array.isArray(openNcrs)) openNcrs = [];
  }

  let openCapas = [];
  if (qualitySourceConnected(CapaRecord.find)) {
    const capaQuery = CapaRecord.find({
      ...filter,
      status: { $ne: 'CLOSED' },
    })
      .sort({ dueDate: 1 })
      .limit(500);
    openCapas = capaQuery && typeof capaQuery.lean === 'function'
      ? await capaQuery.lean()
      : await capaQuery;
    if (!Array.isArray(openCapas)) openCapas = [];
  }

  const now = new Date();
  const overdueCapas = openCapas.filter((entry) => {
    const due = entry?.dueDate ? new Date(entry.dueDate) : null;
    return due && !Number.isNaN(due.getTime()) && due < now;
  });

  let temperatures = [];
  if (singleCafeId && qualitySourceConnected(FoodSafetyService.listTemperatures)) {
    try {
      temperatures = await FoodSafetyService.listTemperatures({
        organisationId,
        cafeId: singleCafeId,
        limit: 5,
      });
    } catch (_) {
      temperatures = [];
    }
  }

  const actionCentreItems = [];
  if (activeHolds.length > 0) {
    actionCentreItems.push({
      id: 'act-hold-1',
      type: 'QUALITY_HOLD',
      title: `${activeHolds.length} Inventory Lot(s) on Quality Quarantine`,
      description: `${activeHolds[0].itemName || activeHolds[0].itemId || 'Inventory lot'} (${activeHolds[0].inventoryLotId}) isolated due to ${String(activeHolds[0].reason || 'quality hold').toLowerCase().replace(/_/g, ' ')}.`,
      deepTab: 'holds',
      severity: 'CRITICAL',
    });
  }
  if (openNcrs.length > 0) {
    actionCentreItems.push({
      id: 'act-ncr-1',
      type: 'OPEN_NCR',
      title: `${openNcrs.length} Non-Conformance Report(s) under Investigation`,
      description: openNcrs[0].title || 'Open non-conformance requires review.',
      deepTab: 'ncrs',
      severity: 'ATTENTION',
    });
  }
  if (openCapas.some((entry) => entry.effectivenessStatus === 'PENDING_VERIFICATION')) {
    actionCentreItems.push({
      id: 'act-capa-1',
      type: 'CAPA_VERIFICATION',
      title: 'CAPA Effectiveness Verification Awaiting Review',
      description: 'A recorded CAPA is awaiting effectiveness verification.',
      deepTab: 'capas',
      severity: 'ATTENTION',
    });
  }

  return response.status(200).json({
    success: true,
    data: {
      kpis: {
        checksDueToday: null,
        checksDueTodayStatus: 'NOT_AVAILABLE_NO_DURABLE_TEMPLATE_SCHEDULE_ENGINE',
        overdueActions: overdueCapas.length,
        overdueActionsStatus: 'DURABLE_CAPA_DUE_DATES',
        openNcrs: openNcrs.length,
        complianceDueSoon: null,
        complianceDueSoonStatus: 'LOAD_COMPLIANCE_REGISTER_FOR_AUTHORITATIVE_COUNT',
        activeHoldsCount: activeHolds.length,
        openCapasCount: openCapas.length,
        totalCompletedChecks: totalChecklists,
      },
      actionCentreItems,
      recentChecklists: dbChecklists,
      temperatures,
      prpStatus: {
        cleaningSanitation: 'NOT_ASSESSED',
        pestControl: 'NOT_ASSESSED',
        waterSafety: 'NOT_ASSESSED',
        personalHygiene: 'NOT_ASSESSED',
        allergenControls: 'NOT_ASSESSED',
      },
      sourceStatus: {
        checklistRecords: 'DURABLE',
        temperatureRecords: singleCafeId ? 'DURABLE_IF_AVAILABLE' : 'CAFE_SCOPE_REQUIRED',
        qualityHolds: qualitySourceConnected(QualityHold.find) ? 'DURABLE' : 'UNAVAILABLE',
        ncrs: qualitySourceConnected(QualityNonConformance.find) ? 'DURABLE' : 'UNAVAILABLE',
        capas: qualitySourceConnected(CapaRecord.find) ? 'DURABLE' : 'UNAVAILABLE',
        audits: qualitySourceConnected(AuditEvent.find) ? 'DURABLE_AUDIT_EVENTS' : 'UNAVAILABLE',
      },
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * 2. GET /api/v1/quality/checklists
 */
const listChecklists = asyncHandler(async (request, response) => {
  const page = parsePositiveInteger(request.query.page, 1, 1000);
  const limit = parsePositiveInteger(request.query.limit, 25, 100);
  const skip = (page - 1) * limit;

  const filter = buildQualityScopeFilter(request);
  const { date } = request.query;

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    filter.inspectionDate = date;
  }

  const [checklists, total] = await Promise.all([
    QualityChecklist.find(filter)
      .select('-__v -version')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    QualityChecklist.countDocuments(filter),
  ]);

  return response.status(200).json({
    success: true,
    data: {
      checklists,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * 3. POST /api/v1/quality/checklists
 */
const submitChecklist = asyncHandler(async (request, response) => {
  const { cafeId: rawCafeId, title, frequency, items, overallResult, actionRequired, templateId, templateVersion } = request.body || {};

  const cafeId = normalizeId(rawCafeId);
  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  }
  assertCafeAccess(request, cafeId);

  const titleText = typeof title === 'string' ? title.trim() : '';
  if (!titleText) {
    throw new ApiError(400, 'TITLE_REQUIRED', 'Checklist title is required.');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, 'ITEMS_REQUIRED', 'Checklist items are required.');
  }

  const normResult = normalizeId(overallResult);
  if (!OVERALL_RESULTS.includes(normResult)) {
    throw new ApiError(400, 'INVALID_RESULT', `overallResult must be one of: ${OVERALL_RESULTS.join(', ')}.`);
  }

  const seqId = await SequenceCounter.generateId({
    organisationId: request.auth.organisationId,
    sequenceKey: 'QUALITY_CHECKLIST',
    prefix: 'QC',
    minimumDigits: 4,
  });

  const checklist = new QualityChecklist({
    checklistId: seqId,
    organisationId: request.auth.organisationId,
    cafeId,
    title: titleText,
    templateId: templateId ? normalizeId(templateId) : null,
    templateVersion: templateVersion ? String(templateVersion).trim() : null,
    frequency: frequency ? normalizeId(frequency) : 'DAILY',
    items,
    overallResult: normResult,
    inspectionDate: getIstBusinessDate(),
    inspectedByUserId: request.auth.userId,
    actionRequired: typeof actionRequired === 'string' ? actionRequired.trim() : '',
  });

  let autoNcr = null;
  let autoNcrId = null;

  if (normResult === 'CRITICAL_FAIL') {
    if (!qualitySourceConnected(QualityNonConformance.findOne)) {
      throw new ApiError(
        503,
        'NCR_SOURCE_UNAVAILABLE',
        'Critical checklist submission is blocked because the durable NCR source is unavailable.'
      );
    }

    autoNcrId = await SequenceCounter.generateId({
      organisationId: request.auth.organisationId,
      sequenceKey: 'QUALITY_NCR',
      prefix: 'NCR',
      minimumDigits: 4,
    });
  }

  await runQualityAtomic(async (session) => {
    await checklist.save(session ? { session } : undefined);

    if (normResult === 'CRITICAL_FAIL') {
      const now = new Date();
      autoNcr = new QualityNonConformance({
        ncrId: autoNcrId,
        organisationId: request.auth.organisationId,
        cafeId,
        source: 'CHECKLIST_CRITICAL_FAIL',
        severity: 'CRITICAL',
        title: `Critical Failure in ${titleText}`,
        description: String(
          actionRequired || 'Critical inspection failure requires immediate investigation.'
        ).trim(),
        immediateAction: String(
          actionRequired || 'Affected operations must remain contained until an authorized review is completed.'
        ).trim(),
        status: 'OPEN',
        reportedByUserId: request.auth.userId,
        reportedAt: now,
        linkedChecklistId: seqId,
        auditHistory: [
          {
            action: 'AUTO_CREATED_FROM_CRITICAL_CHECKLIST',
            performedByUserId: request.auth.userId,
            performedAt: now,
            notes: seqId,
          },
        ],
      });
      await autoNcr.save(session ? { session } : undefined);
    }
  });

  await recordRequestAudit({
    request,
    module: 'QUALITY',
    action: 'SUBMIT_QUALITY_CHECKLIST',
    entityType: 'QUALITY_CHECKLIST',
    entityId: seqId,
    after: { checklistId: seqId, cafeId, result: normResult, templateId, templateVersion },
    result: 'SUCCESS',
    riskClassification: normResult === 'CRITICAL_FAIL' ? 'HIGH' : 'LOW',
  });

  return response.status(201).json({
    success: true,
    data: {
      checklist: checklist.toObject(),
      autoNcrId: autoNcrId || null,
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * 4. GET /api/v1/quality/templates
 */
const listTemplates = asyncHandler(async (request, response) => {
  const templates = [
    {
      templateId: 'QC-TMPL-OPEN-01',
      version: 'v2.4',
      title: 'Opening Hygiene & Food Safety Readiness',
      category: 'DAILY_OPERATIONS',
      frequency: 'DAILY',
      area: 'Entire Café & Kitchen',
      targetTime: '06:30',
      questions: [
        { id: 'q1', text: 'All staff in clean uniform, aprons, and hair restraints?', type: 'YES_NO', critical: true },
        { id: 'q2', text: 'Handwash stations fully stocked with soap, warm water & paper towels?', type: 'YES_NO', critical: true },
        { id: 'q3', text: 'All chillers operating within 1.0°C – 4.0°C range?', type: 'TEMPERATURE', critical: true },
        { id: 'q4', text: 'Food contact surfaces sanitised with approved quat sanitizer (200 ppm)?', type: 'YES_NO', critical: false },
        { id: 'q5', text: 'No evidence of pest intrusion or damaged seals overnight?', type: 'YES_NO', critical: true },
      ],
    },
    {
      templateId: 'QC-TMPL-CLOSE-01',
      version: 'v2.1',
      title: 'Closing Sanitation & Waste Lockdown',
      category: 'DAILY_OPERATIONS',
      frequency: 'DAILY',
      area: 'Back of House & Bar',
      targetTime: '23:00',
      questions: [
        { id: 'q1', text: 'All open dairy and perishables sealed, labelled, and dated?', type: 'YES_NO', critical: true },
        { id: 'q2', text: 'Espresso machine groupheads, portafilters, and steam wands backflushed & soaked?', type: 'YES_NO', critical: false },
        { id: 'q3', text: 'Bins emptied, sanitized, and lined with fresh heavy-duty bags?', type: 'YES_NO', critical: false },
        { id: 'q4', text: 'All refrigeration doors verified closed with magnetic gaskets sealed tight?', type: 'YES_NO', critical: true },
      ],
    },
    {
      templateId: 'QC-TMPL-TEMP-01',
      version: 'v1.8',
      title: 'Mid-Day Cold Chain & Holding Temperature Audit',
      category: 'TEMPERATURE_MONITORING',
      frequency: 'PER_SHIFT',
      area: 'Refrigeration Units',
      targetTime: '14:00',
      questions: [
        { id: 'q1', text: 'Display Chiller Temperature (°C)', type: 'TEMPERATURE', expectedRange: '1.0 - 4.0' },
        { id: 'q2', text: 'Main Walk-In Chiller Temperature (°C)', type: 'TEMPERATURE', expectedRange: '1.0 - 4.0' },
        { id: 'q3', text: 'Deep Freeze Storage Temperature (°C)', type: 'TEMPERATURE', expectedRange: '-22.0 - -18.0' },
      ],
    },
    {
      templateId: 'QC-TMPL-RECV-01',
      version: 'v1.5',
      title: 'Goods Receiving Quality & GRN Inspection',
      category: 'SUPPLIER_QUALITY',
      frequency: 'AD_HOC',
      area: 'Receiving Dock',
      questions: [
        { id: 'q1', text: 'Delivery vehicle clean, free from odors and pests?', type: 'YES_NO', critical: true },
        { id: 'q2', text: 'Refrigerated goods core temp <= 4.0°C at arrival?', type: 'TEMPERATURE', critical: true },
        { id: 'q3', text: 'Packaging intact with FSSAI licence and batch details legible?', type: 'YES_NO', critical: true },
      ],
    },
  ];

  return response.status(200).json({
    success: true,
    data: { templates },
    correlationId: request.correlationId || null,
  });
});

/**
 * 5. GET /api/v1/quality/temperatures & POST /api/v1/quality/temperatures
 */
/**
 * 5. Temperature Monitoring & Excursions (Food Safety R02-01)
 */
const listTemperatures = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { cafeId: queryCafe, excursionsOnly, limit = 50 } = request.query || {};
  const scope = resolveSafetyRegisterScope(request, queryCafe);

  const logs = await FoodSafetyService.listTemperatures({
    organisationId,
    cafeId: scope.cafeId,
    cafeIds: scope.cafeIds,
    excursionsOnly: excursionsOnly === 'true',
    limit: Number(limit),
  });

  return response.status(200).json({
    success: true,
    data: {
      temperatures: logs,
      scope: scope.cafeId ? { cafeId: scope.cafeId } : { cafeIds: scope.cafeIds },
    },
    correlationId: request.correlationId || null,
  });
});

const recordTemperature = asyncHandler(async (request, response) => {
  const {
    cafeId: rawCafeId,
    monitoringPoint,
    monitoringPointName,
    equipmentId,
    equipmentName,
    location,
    readingCelsius,
    expectedMinCelsius = 1.0,
    expectedMaxCelsius = 4.0,
    minimumAllowedCelsius,
    maximumAllowedCelsius,
    operatorSessionId,
    notes = '',
    remarks = '',
  } = request.body || {};

  const cafeId = normalizeId(rawCafeId);
  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  assertCafeAccess(request, cafeId);

  if (readingCelsius === undefined || Number.isNaN(Number(readingCelsius))) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Numeric temperature reading in Celsius is required.');
  }

  const min = minimumAllowedCelsius !== undefined ? Number(minimumAllowedCelsius) : Number(expectedMinCelsius);
  const max = maximumAllowedCelsius !== undefined ? Number(maximumAllowedCelsius) : Number(expectedMaxCelsius);

  const logRecord = await FoodSafetyService.recordTemperature({
    organisationId: request.auth.organisationId,
    cafeId,
    monitoringPoint: monitoringPoint || 'REFRIGERATOR',
    monitoringPointName: monitoringPointName || location || 'Kitchen Unit',
    equipmentId: equipmentId || 'AST-CHILL-GEN',
    equipmentName: equipmentName || 'Refrigeration Unit',
    readingCelsius: Number(readingCelsius),
    minimumAllowedCelsius: min,
    maximumAllowedCelsius: max,
    recordedByUserId: request.auth.userId,
    actorRole: request.auth.role,
    operatorSessionId,
    remarks: remarks || notes,
  });

  return response.status(201).json({
    success: true,
    data: { temperature: logRecord },
    correlationId: request.correlationId || null,
  });
});

const applyCorrectiveAction = asyncHandler(async (request, response) => {
  const { id } = request.params;
  const { cafeId: rawCafeId, correctiveAction, resolvedReadingCelsius, remarks = '' } = request.body || {};

  const cafeId = normalizeId(rawCafeId);
  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  assertCafeAccess(request, cafeId);

  if (!correctiveAction || !correctiveAction.trim()) {
    throw new ApiError(400, 'ACTION_REQUIRED', 'Corrective action details are required.');
  }

  const updatedLog = await FoodSafetyService.applyCorrectiveAction({
    organisationId: request.auth.organisationId,
    cafeId,
    logId: id,
    correctiveAction: correctiveAction.trim(),
    resolvedReadingCelsius,
    actionTakenByUserId: request.auth.userId,
    actorRole: request.auth.role,
    remarks,
  });

  return response.status(200).json({
    success: true,
    data: { temperature: updatedLog },
    correlationId: request.correlationId || null,
  });
});

/**
 * 5b. Cleaning & Sanitation Tasks (Food Safety R02-01)
 */
const listCleaningTasks = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { cafeId: queryCafe, status, limit = 50 } = request.query || {};
  const scope = resolveSafetyRegisterScope(request, queryCafe);

  const tasks = await FoodSafetyService.listCleaningTasks({
    organisationId,
    cafeId: scope.cafeId,
    cafeIds: scope.cafeIds,
    status: status ? normalizeId(status) : null,
    limit: Number(limit),
  });

  return response.status(200).json({
    success: true,
    data: {
      tasks,
      scope: scope.cafeId ? { cafeId: scope.cafeId } : { cafeIds: scope.cafeIds },
    },
    correlationId: request.correlationId || null,
  });
});

const createCleaningTask = asyncHandler(async (request, response) => {
  const { cafeId: rawCafeId, areaOrEquipment, procedure, frequency, assignedRole, assignedUserId, dueDateTime, remarks } = request.body || {};

  const cafeId = normalizeId(rawCafeId);
  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  assertCafeAccess(request, cafeId);

  if (!areaOrEquipment || !procedure || !dueDateTime) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'areaOrEquipment, procedure, and dueDateTime are required.');
  }

  const task = await FoodSafetyService.createCleaningTask({
    organisationId: request.auth.organisationId,
    cafeId,
    areaOrEquipment,
    procedure,
    frequency,
    assignedRole,
    assignedUserId,
    dueDateTime,
    remarks,
  });

  return response.status(201).json({
    success: true,
    data: { task },
    correlationId: request.correlationId || null,
  });
});

const completeCleaningTask = asyncHandler(async (request, response) => {
  const { id } = request.params;
  const { cafeId: rawCafeId, verifiedByUserId, remarks } = request.body || {};

  const cafeId = normalizeId(rawCafeId);
  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  assertCafeAccess(request, cafeId);

  const task = await FoodSafetyService.completeCleaningTask({
    organisationId: request.auth.organisationId,
    cafeId,
    taskId: id,
    completedByUserId: request.auth.userId,
    actorRole: request.auth.role,
    verifiedByUserId,
    remarks,
  });

  return response.status(200).json({
    success: true,
    data: { task },
    correlationId: request.correlationId || null,
  });
});

/**
 * 5c. Pest Control Register (Food Safety R02-01)
 */
const listPestControl = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { cafeId: queryCafe, limit = 50 } = request.query || {};
  const scope = resolveSafetyRegisterScope(request, queryCafe);

  const records = await FoodSafetyService.listPestControl({
    organisationId,
    cafeId: scope.cafeId,
    cafeIds: scope.cafeIds,
    limit: Number(limit),
  });

  return response.status(200).json({
    success: true,
    data: {
      pestControlRecords: records,
      scope: scope.cafeId ? { cafeId: scope.cafeId } : { cafeIds: scope.cafeIds },
    },
    correlationId: request.correlationId || null,
  });
});

const recordPestControl = asyncHandler(async (request, response) => {
  const {
    cafeId: rawCafeId,
    serviceProvider,
    vendorId,
    serviceDate,
    areasTreated,
    treatmentAction,
    findings,
    followUpRequired,
    nextDueDate,
    certificateNumber,
    remarks,
  } = request.body || {};

  const cafeId = normalizeId(rawCafeId);
  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  assertCafeAccess(request, cafeId);

  if (!serviceProvider || !treatmentAction || !serviceDate || !nextDueDate) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'serviceProvider, treatmentAction, serviceDate, and nextDueDate are required.');
  }

  const record = await FoodSafetyService.recordPestControl({
    organisationId: request.auth.organisationId,
    cafeId,
    serviceProvider,
    vendorId,
    serviceDate,
    areasTreated,
    treatmentAction,
    findings,
    followUpRequired,
    nextDueDate,
    certificateNumber,
    recordedByUserId: request.auth.userId,
    remarks,
  });

  return response.status(201).json({
    success: true,
    data: { pestControlRecord: record },
    correlationId: request.correlationId || null,
  });
});

/**
 * 5d. Calibration Register (Food Safety R02-01)
 */
const listCalibrations = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { cafeId: queryCafe, limit = 50 } = request.query || {};
  const scope = resolveSafetyRegisterScope(request, queryCafe);

  const calibrations = await FoodSafetyService.listCalibrations({
    organisationId,
    cafeId: scope.cafeId,
    cafeIds: scope.cafeIds,
    limit: Number(limit),
  });

  return response.status(200).json({
    success: true,
    data: {
      calibrations,
      scope: scope.cafeId ? { cafeId: scope.cafeId } : { cafeIds: scope.cafeIds },
    },
    correlationId: request.correlationId || null,
  });
});

const recordCalibration = asyncHandler(async (request, response) => {
  const {
    cafeId: rawCafeId,
    assetId,
    assetName,
    equipmentType,
    calibrationDate,
    result,
    certificateNumber,
    nextDueDate,
    performedBy,
    remarks,
  } = request.body || {};

  const cafeId = normalizeId(rawCafeId);
  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  assertCafeAccess(request, cafeId);

  if (!assetId || !assetName || !calibrationDate || !nextDueDate || !performedBy) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'assetId, assetName, calibrationDate, nextDueDate, and performedBy are required.');
  }

  const cal = await FoodSafetyService.recordCalibration({
    organisationId: request.auth.organisationId,
    cafeId,
    assetId,
    assetName,
    equipmentType,
    calibrationDate,
    result,
    certificateNumber,
    nextDueDate,
    performedBy,
    recordedByUserId: request.auth.userId,
    remarks,
  });

  return response.status(201).json({
    success: true,
    data: { calibration: cal },
    correlationId: request.correlationId || null,
  });
});

/**
 * 6. Quality Holds: listQualityHolds, createQualityHold, releaseQualityHold
 */
function mapInventoryLotToQualityHold(lot) {
  if (!lot) return null;
  const status = String(lot.status || '').toUpperCase();
  const disposition = String(lot.dispositionStatus || 'NONE').toUpperCase();
  let holdStatus = 'ON_HOLD';
  if (status === 'AVAILABLE' || status === 'NEAR_EXPIRY' || status === 'DEPLETED') {
    holdStatus = disposition === 'RELEASE' ? 'RELEASED' : 'NOT_ON_HOLD';
  } else if (status === 'DISPOSED') {
    holdStatus = 'DISPOSED';
  } else if (status === 'RETURNED') {
    holdStatus = 'RETURNED';
  }

  return {
    holdId: `QHOLD-${lot.lotId}`,
    organisationId: lot.organisationId,
    cafeId: lot.cafeId,
    lotNumber: lot.lotId,
    supplierLot: lot.supplierLot || null,
    itemSku: lot.itemId,
    itemName: lot.itemId,
    quantityHeld: Number(lot.remainingQuantity ?? lot.quantityBase ?? 0),
    unit: lot.unit || 'units',
    reason: lot.quarantineReason || null,
    description: lot.quarantineReason || '',
    status: holdStatus,
    inventoryStatus: status,
    placedBy: lot.quarantinedByUserId || null,
    placedAt: lot.quarantineDate || null,
    disposition,
    dispositionNotes: lot.dispositionReason || lot.releaseReason || '',
    releasedBy: lot.releasedByUserId || lot.dispositionByUserId || null,
    releasedAt: lot.releaseDate || lot.dispositionDate || null,
    releaseAllowed: status === 'QUARANTINE',
    durableSource: 'INVENTORY_LOT',
  };
}

function qualityHoldLotId(holdId) {
  const value = String(holdId || '').trim().toUpperCase();
  return value.startsWith('QHOLD-') ? value.slice('QHOLD-'.length) : value;
}

function mapCapaRecordForQuality(record) {
  if (!record) return null;
  const status = String(record.status || '').toUpperCase();
  return {
    capaId: record.capaId,
    organisationId: record.organisationId,
    cafeId: record.cafeId,
    ncrId: record.source === 'OPERATIONAL_ANOMALY' ? record.sourceReferenceId : null,
    source: record.source,
    sourceReferenceId: record.sourceReferenceId,
    title: record.title,
    rootCauseAnalysis: record.rootCauseAnalysis,
    actionPlan: record.correctiveActionPlan,
    preventiveActionPlan: record.preventiveActionPlan,
    ownerUserId: record.assignedOwnerUserId,
    targetDate: record.dueDate,
    status,
    effectivenessStatus:
      status === 'CLOSED'
        ? 'EFFECTIVE'
        : (status === 'VERIFICATION' ? 'PENDING_VERIFICATION' : 'IN_PROGRESS'),
    verificationNotes: record.verificationNotes || '',
    verifiedBy: record.verifiedByUserId || null,
    verifiedAt: record.verifiedAt || null,
    durableSource: 'CAPA_RECORD',
  };
}

const listQualityHolds = asyncHandler(async (request, response) => {
  if (!qualitySourceConnected(QualityHold.find)) {
    return response.status(200).json({
      success: true,
      data: { holds: [], sourceStatus: 'UNAVAILABLE' },
      correlationId: request.correlationId || null,
    });
  }

  const filter = buildQualityScopeFilter(request);
  const query = QualityHold.find(filter).sort({ placedAt: -1 }).limit(250);
  const holds = query && typeof query.lean === 'function' ? await query.lean() : await query;

  return response.status(200).json({
    success: true,
    data: { holds: Array.isArray(holds) ? holds : [], sourceStatus: 'DURABLE' },
    correlationId: request.correlationId || null,
  });
});

const createQualityHold = asyncHandler(async (request, response) => {
  const {
    cafeId: rawCafeId,
    lotNumber,
    itemSku,
    itemName,
    quantityHeld,
    unit,
    reason,
    description,
  } = request.body || {};

  const cafeId = normalizeId(rawCafeId);
  const normalizedLotNumber = normalizeId(lotNumber);
  const holdQuantity = Number(quantityHeld);

  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  assertCafeAccess(request, cafeId);

  if (!normalizedLotNumber) {
    throw new ApiError(400, 'LOT_NUMBER_REQUIRED', 'lotNumber is required for a Quality Hold.');
  }
  if (!Number.isFinite(holdQuantity) || holdQuantity <= 0) {
    throw new ApiError(400, 'INVALID_HOLD_QUANTITY', 'quantityHeld must be greater than zero.');
  }
  if (!String(reason || '').trim()) {
    throw new ApiError(400, 'HOLD_REASON_REQUIRED', 'A quality hold reason is required.');
  }

  if (
    !qualitySourceConnected(InventoryLot.findOne) ||
    !qualitySourceConnected(QualityHold.findOne)
  ) {
    throw new ApiError(
      503,
      'QUALITY_HOLD_SOURCE_UNAVAILABLE',
      'The durable inventory/quality-hold source is unavailable.'
    );
  }

  const lotQuery = InventoryLot.findOne({
    organisationId: request.auth.organisationId,
    cafeId,
    $or: [
      { lotId: normalizedLotNumber },
      { supplierLot: normalizedLotNumber },
    ],
  });
  const lot = lotQuery && typeof lotQuery.lean === 'function'
    ? await lotQuery.lean()
    : await lotQuery;

  if (!lot) {
    throw new ApiError(
      404,
      'INVENTORY_LOT_NOT_FOUND',
      'The requested inventory lot does not exist in this café.'
    );
  }

  if (['QUARANTINE', 'RECALL_HOLD', 'DISPOSED', 'RETURNED', 'EXPIRED'].includes(String(lot.status || '').toUpperCase())) {
    throw new ApiError(
      409,
      'INVENTORY_LOT_NOT_HOLDABLE',
      `Inventory lot ${lot.lotId} is already in restricted status ${lot.status}.`
    );
  }

  const availableQuantity = Number(lot.remainingQuantity ?? lot.quantityBase ?? lot.initialQuantity ?? 0);
  if (!Number.isFinite(availableQuantity) || availableQuantity <= 0) {
    throw new ApiError(409, 'INVENTORY_LOT_EMPTY', 'The requested inventory lot has no remaining quantity to hold.');
  }
  if (holdQuantity > availableQuantity) {
    throw new ApiError(
      409,
      'HOLD_QUANTITY_EXCEEDS_AVAILABLE',
      'quantityHeld cannot exceed the lot remaining quantity.',
      { requestedQuantity: holdQuantity, availableQuantity }
    );
  }

  const duplicateQuery = QualityHold.findOne({
    organisationId: request.auth.organisationId,
    cafeId,
    inventoryLotId: lot.lotId,
    status: 'ON_HOLD',
  });
  const duplicate = duplicateQuery && typeof duplicateQuery.lean === 'function'
    ? await duplicateQuery.lean()
    : await duplicateQuery;
  if (duplicate) {
    throw new ApiError(409, 'QUALITY_HOLD_ALREADY_ACTIVE', 'This inventory lot already has an active Quality Hold.');
  }

  const holdId = await SequenceCounter.generateId({
    organisationId: request.auth.organisationId,
    sequenceKey: 'QUALITY_HOLD',
    prefix: 'QHOLD',
    minimumDigits: 4,
  });

  const now = new Date();
  const hold = await runQualityAtomic(async (session) => {
    const inventoryUpdate = await InventoryLot.findOneAndUpdate(
      {
        organisationId: request.auth.organisationId,
        cafeId,
        lotId: lot.lotId,
        status: lot.status,
      },
      {
        $set: {
          status: 'QUARANTINE',
          quarantineReason: String(reason).trim(),
          quarantineDate: now,
          quarantinedByUserId: request.auth.userId,
        },
      },
      {
        new: true,
        ...(session ? { session } : {}),
      }
    );

    if (!inventoryUpdate) {
      throw new ApiError(
        409,
        'INVENTORY_LOT_STATE_CHANGED',
        'The inventory lot state changed before the Quality Hold could be applied.'
      );
    }

    const record = new QualityHold({
      holdId,
      organisationId: request.auth.organisationId,
      cafeId,
      inventoryLotId: lot.lotId,
      supplierLot: lot.supplierLot || '',
      itemId: lot.itemId || itemSku || '',
      itemName: String(itemName || lot.itemId || 'Inventory lot').trim(),
      quantityHeld: holdQuantity,
      unit: String(unit || lot.unit || 'units').trim(),
      reason: String(reason).trim(),
      description: String(description || '').trim(),
      status: 'ON_HOLD',
      previousInventoryLotStatus: lot.status,
      placedByUserId: request.auth.userId,
      placedAt: now,
      auditHistory: [
        {
          action: 'PLACED_ON_HOLD',
          performedByUserId: request.auth.userId,
          performedAt: now,
          notes: String(description || '').trim(),
        },
      ],
    });

    await record.save(session ? { session } : undefined);
    return record;
  });

  const holdPayload = typeof hold?.toObject === 'function' ? hold.toObject() : hold;
  const durableHoldPayload = { ...holdPayload, durableSource: 'QUALITY_HOLD' };

  await recordRequestAudit({
    request,
    module: 'QUALITY',
    action: 'CREATE_QUALITY_HOLD',
    entityType: 'QUALITY_HOLD',
    entityId: holdId,
    cafeId,
    after: durableHoldPayload,
    result: 'SUCCESS',
    riskClassification: 'HIGH',
  });

  return response.status(201).json({
    success: true,
    data: { hold: durableHoldPayload },
    correlationId: request.correlationId || null,
  });
});

const releaseQualityHold = asyncHandler(async (request, response) => {
  const holdId = normalizeId(request.params.id);
  const disposition = normalizeId(request.body?.disposition || 'RELEASE');
  const dispositionNotes = String(request.body?.dispositionNotes || '').trim();

  if (!QUALITY_HOLD_DISPOSITIONS.includes(disposition)) {
    throw new ApiError(
      400,
      'INVALID_HOLD_DISPOSITION',
      `disposition must be one of: ${QUALITY_HOLD_DISPOSITIONS.join(', ')}.`
    );
  }

  if (!qualitySourceConnected(QualityHold.findOne)) {
    throw new ApiError(503, 'QUALITY_HOLD_SOURCE_UNAVAILABLE', 'The durable Quality Hold source is unavailable.');
  }

  const holdQuery = QualityHold.findOne({
    organisationId: request.auth.organisationId,
    holdId,
  });
  const hold = await holdQuery;

  if (!hold) {
    throw new ApiError(404, 'HOLD_NOT_FOUND', 'Quality hold record not found.');
  }
  assertCafeAccess(request, hold.cafeId);

  if (hold.status !== 'ON_HOLD') {
    throw new ApiError(409, 'QUALITY_HOLD_ALREADY_RESOLVED', 'Only an active Quality Hold may be released or disposed.');
  }

  const now = new Date();

  await runQualityAtomic(async (session) => {
    const lotQuery = InventoryLot.findOne({
      organisationId: request.auth.organisationId,
      cafeId: hold.cafeId,
      lotId: hold.inventoryLotId,
    });
    const inventoryLot = lotQuery && typeof lotQuery.lean === 'function'
      ? await lotQuery.lean()
      : await lotQuery;

    if (!inventoryLot) {
      throw new ApiError(
        409,
        'HELD_INVENTORY_LOT_MISSING',
        'The Quality Hold exists but its inventory lot cannot be located. Resolution is blocked.'
      );
    }

    const remainingQuantity = Number(inventoryLot.remainingQuantity ?? 0);
    let nextLotStatus;
    let dispositionStatus = inventoryLot.dispositionStatus || 'NONE';

    if (disposition === 'DISPOSE') {
      nextLotStatus = 'DISPOSED';
      dispositionStatus = 'DESTROY';
    } else if (disposition === 'RETURN_TO_VENDOR') {
      nextLotStatus = 'RETURNED';
      dispositionStatus = 'RETURN_TO_VENDOR';
    } else {
      nextLotStatus =
        remainingQuantity <= 0
          ? 'DEPLETED'
          : (['AVAILABLE', 'NEAR_EXPIRY'].includes(hold.previousInventoryLotStatus)
              ? hold.previousInventoryLotStatus
              : 'AVAILABLE');
      dispositionStatus = 'RELEASE';
    }

    const inventoryUpdate = await InventoryLot.findOneAndUpdate(
      {
        organisationId: request.auth.organisationId,
        cafeId: hold.cafeId,
        lotId: hold.inventoryLotId,
        status: { $in: ['QUARANTINE', 'RECALL_HOLD'] },
      },
      {
        $set: {
          status: nextLotStatus,
          dispositionStatus,
          dispositionReason: dispositionNotes,
          dispositionDate: disposition === 'RELEASE' ? null : now,
          dispositionByUserId: disposition === 'RELEASE' ? null : request.auth.userId,
          releaseReason: disposition === 'RELEASE' ? dispositionNotes : '',
          releaseDate: disposition === 'RELEASE' ? now : null,
          releasedByUserId: disposition === 'RELEASE' ? request.auth.userId : null,
        },
      },
      {
        new: true,
        ...(session ? { session } : {}),
      }
    );

    if (!inventoryUpdate) {
      throw new ApiError(
        409,
        'INVENTORY_LOT_NOT_QUARANTINED',
        'The linked inventory lot is no longer in the expected quarantined state.'
      );
    }

    hold.status =
      disposition === 'RELEASE'
        ? 'RELEASED'
        : (disposition === 'RETURN_TO_VENDOR' ? 'RETURNED_TO_VENDOR' : 'DISPOSED');
    hold.disposition = disposition;
    hold.dispositionNotes = dispositionNotes;
    hold.releasedByUserId = request.auth.userId;
    hold.releasedAt = now;
    hold.auditHistory.push({
      action: 'HOLD_RESOLVED',
      performedByUserId: request.auth.userId,
      performedAt: now,
      notes: `${disposition}: ${dispositionNotes}`,
    });
    await hold.save(session ? { session } : undefined);
  });

  const holdPayload = typeof hold?.toObject === 'function' ? hold.toObject() : hold;
  const durableHoldPayload = { ...holdPayload, durableSource: 'QUALITY_HOLD' };

  await recordRequestAudit({
    request,
    module: 'QUALITY',
    action: 'RELEASE_QUALITY_HOLD',
    entityType: 'QUALITY_HOLD',
    entityId: hold.holdId,
    cafeId: hold.cafeId,
    after: {
      holdId: hold.holdId,
      status: hold.status,
      disposition,
      inventoryLotId: hold.inventoryLotId,
    },
    result: 'SUCCESS',
    riskClassification: 'MEDIUM',
  });

  return response.status(200).json({
    success: true,
    data: { hold: durableHoldPayload },
    correlationId: request.correlationId || null,
  });
});

/**
 * 7. NCRs & CAPAs
 */
const listNcrs = asyncHandler(async (request, response) => {
  if (!qualitySourceConnected(QualityNonConformance.find)) {
    return response.status(200).json({
      success: true,
      data: { ncrs: [], sourceStatus: 'UNAVAILABLE' },
      correlationId: request.correlationId || null,
    });
  }

  const filter = buildQualityScopeFilter(request);
  const query = QualityNonConformance.find(filter).sort({ reportedAt: -1 }).limit(250);
  const ncrs = query && typeof query.lean === 'function' ? await query.lean() : await query;

  return response.status(200).json({
    success: true,
    data: { ncrs: Array.isArray(ncrs) ? ncrs : [], sourceStatus: 'DURABLE' },
    correlationId: request.correlationId || null,
  });
});

const createNcr = asyncHandler(async (request, response) => {
  const {
    cafeId: rawCafeId,
    title,
    source = 'MANUAL_OBSERVATION',
    severity = 'MAJOR',
    description,
    immediateAction,
  } = request.body || {};

  const cafeId = normalizeId(rawCafeId);
  const normalizedSource = normalizeId(source);
  const normalizedSeverity = normalizeId(severity);
  const titleText = String(title || '').trim();

  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  assertCafeAccess(request, cafeId);
  if (!titleText) throw new ApiError(400, 'VALIDATION_ERROR', 'NCR title is required.');
  if (!NCR_SOURCES.includes(normalizedSource)) {
    throw new ApiError(400, 'INVALID_NCR_SOURCE', `source must be one of: ${NCR_SOURCES.join(', ')}.`);
  }
  if (!NCR_SEVERITIES.includes(normalizedSeverity)) {
    throw new ApiError(400, 'INVALID_NCR_SEVERITY', `severity must be one of: ${NCR_SEVERITIES.join(', ')}.`);
  }
  if (!qualitySourceConnected(QualityNonConformance.findOne)) {
    throw new ApiError(503, 'NCR_SOURCE_UNAVAILABLE', 'The durable NCR source is unavailable.');
  }

  const ncrId = await SequenceCounter.generateId({
    organisationId: request.auth.organisationId,
    sequenceKey: 'QUALITY_NCR',
    prefix: 'NCR',
    minimumDigits: 4,
  });

  const now = new Date();
  const ncr = new QualityNonConformance({
    ncrId,
    organisationId: request.auth.organisationId,
    cafeId,
    source: normalizedSource,
    severity: normalizedSeverity,
    title: titleText,
    description: String(description || '').trim(),
    immediateAction: String(immediateAction || '').trim(),
    status: 'OPEN',
    reportedByUserId: request.auth.userId,
    reportedAt: now,
    auditHistory: [
      {
        action: 'NCR_CREATED',
        performedByUserId: request.auth.userId,
        performedAt: now,
        notes: String(immediateAction || '').trim(),
      },
    ],
  });

  await ncr.save();
  const ncrPayload = typeof ncr.toObject === 'function' ? ncr.toObject() : ncr;
  const durableNcrPayload = { ...ncrPayload, durableSource: 'QUALITY_NCR' };

  await recordRequestAudit({
    request,
    module: 'QUALITY',
    action: 'CREATE_NCR',
    entityType: 'NCR',
    entityId: ncrId,
    cafeId,
    after: durableNcrPayload,
    result: 'SUCCESS',
    riskClassification: normalizedSeverity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
  });

  return response.status(201).json({
    success: true,
    data: { ncr: durableNcrPayload },
    correlationId: request.correlationId || null,
  });
});

const listCapas = asyncHandler(async (request, response) => {
  if (!qualitySourceConnected(CapaRecord.find)) {
    return response.status(200).json({
      success: true,
      data: { capas: [], sourceStatus: 'UNAVAILABLE' },
      correlationId: request.correlationId || null,
    });
  }

  const filter = buildQualityScopeFilter(request);
  const query = CapaRecord.find(filter).sort({ createdAt: -1 }).limit(250);
  const capas = query && typeof query.lean === 'function' ? await query.lean() : await query;

  return response.status(200).json({
    success: true,
    data: { capas: Array.isArray(capas) ? capas : [], sourceStatus: 'DURABLE' },
    correlationId: request.correlationId || null,
  });
});

const createCapa = asyncHandler(async (request, response) => {
  const {
    cafeId: rawCafeId,
    ncrId: rawNcrId,
    title,
    rootCauseMethod = '5_WHY',
    rootCauseAnalysis,
    actionPlan,
    preventiveActionPlan,
    targetDate,
  } = request.body || {};

  const cafeId = normalizeId(rawCafeId);
  const ncrId = normalizeId(rawNcrId || '');
  const titleText = String(title || '').trim();
  const rootCauseText = String(rootCauseAnalysis || '').trim();
  const correctiveText = String(actionPlan || '').trim();

  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  assertCafeAccess(request, cafeId);
  if (!titleText) throw new ApiError(400, 'VALIDATION_ERROR', 'CAPA title is required.');
  if (!rootCauseText) {
    throw new ApiError(400, 'ROOT_CAUSE_REQUIRED', 'A human-confirmed rootCauseAnalysis is required.');
  }
  if (!correctiveText) {
    throw new ApiError(400, 'ACTION_PLAN_REQUIRED', 'A corrective actionPlan is required.');
  }
  if (!qualitySourceConnected(CapaRecord.findOne)) {
    throw new ApiError(503, 'CAPA_SOURCE_UNAVAILABLE', 'The durable CAPA source is unavailable.');
  }

  let ncr = null;
  if (ncrId) {
    const ncrQuery = QualityNonConformance.findOne({
      organisationId: request.auth.organisationId,
      cafeId,
      ncrId,
    });
    ncr = await ncrQuery;
    if (!ncr) {
      throw new ApiError(404, 'NCR_NOT_FOUND', 'The referenced NCR does not exist in this café.');
    }
  }

  const capaId = await SequenceCounter.generateId({
    organisationId: request.auth.organisationId,
    sequenceKey: 'QUALITY_CAPA',
    prefix: 'CAPA',
    minimumDigits: 4,
  });

  const dueDate = targetDate
    ? new Date(targetDate)
    : new Date(Date.now() + (14 * 24 * 60 * 60 * 1000));

  if (Number.isNaN(dueDate.getTime())) {
    throw new ApiError(400, 'INVALID_TARGET_DATE', 'targetDate must be a valid date.');
  }

  const now = new Date();
  const capa = await runQualityAtomic(async (session) => {
    const record = new CapaRecord({
      capaId,
      organisationId: request.auth.organisationId,
      cafeId,
      source: capaSourceFromNcr(ncr),
      sourceReferenceId: ncr?.ncrId || `MANUAL-${capaId}`,
      title: titleText,
      findingDescription: String(ncr?.description || titleText).trim(),
      rootCauseCategory: 'OTHER',
      rootCauseMethod: normalizeId(rootCauseMethod) || '5_WHY',
      rootCauseAnalysis: rootCauseText,
      rootCauseConfirmedByHuman: true,
      correctiveActionPlan: correctiveText,
      preventiveActionPlan: String(preventiveActionPlan || correctiveText).trim(),
      assignedOwnerUserId: request.auth.userId,
      dueDate,
      status: 'INVESTIGATING',
      effectivenessStatus: 'PENDING_VERIFICATION',
      auditHistory: [
        {
          action: 'CAPA_CREATED',
          performedBy: request.auth.userId,
          performedAt: now,
          previousStatus: null,
          newStatus: 'INVESTIGATING',
          notes: rootCauseText,
        },
      ],
    });

    await record.save(session ? { session } : undefined);

    if (ncr) {
      ncr.status = 'CAPA_REQUIRED';
      ncr.linkedCapaIds = Array.from(new Set([...(ncr.linkedCapaIds || []), capaId]));
      ncr.auditHistory.push({
        action: 'CAPA_LINKED',
        performedByUserId: request.auth.userId,
        performedAt: now,
        notes: capaId,
      });
      await ncr.save(session ? { session } : undefined);
    }

    return record;
  });

  const capaPayload = typeof capa.toObject === 'function' ? capa.toObject() : capa;
  const durableCapaPayload = { ...capaPayload, durableSource: 'CAPA_RECORD' };

  await recordRequestAudit({
    request,
    module: 'QUALITY',
    action: 'CREATE_CAPA',
    entityType: 'CAPA',
    entityId: capaId,
    cafeId,
    after: durableCapaPayload,
    result: 'SUCCESS',
    riskClassification: 'HIGH',
  });

  return response.status(201).json({
    success: true,
    data: { capa: durableCapaPayload },
    correlationId: request.correlationId || null,
  });
});

const verifyCapa = asyncHandler(async (request, response) => {
  const capaId = normalizeId(request.params.id);
  const effectiveness = normalizeId(request.body?.effectiveness || '');
  const notes = String(request.body?.notes || '').trim();

  if (!['EFFECTIVE', 'INEFFECTIVE'].includes(effectiveness)) {
    throw new ApiError(
      400,
      'INVALID_CAPA_EFFECTIVENESS',
      'effectiveness must be EFFECTIVE or INEFFECTIVE.'
    );
  }
  if (!notes) {
    throw new ApiError(400, 'CAPA_VERIFICATION_NOTES_REQUIRED', 'Verification notes are required.');
  }
  if (!qualitySourceConnected(CapaRecord.findOne)) {
    throw new ApiError(503, 'CAPA_SOURCE_UNAVAILABLE', 'The durable CAPA source is unavailable.');
  }

  const capaQuery = CapaRecord.findOne({
    organisationId: request.auth.organisationId,
    capaId,
  });
  const capa = await capaQuery;

  if (!capa) {
    throw new ApiError(404, 'CAPA_NOT_FOUND', 'CAPA record not found.');
  }
  assertCafeAccess(request, capa.cafeId);

  if (capa.status === 'CLOSED') {
    throw new ApiError(409, 'CAPA_ALREADY_CLOSED', 'The CAPA is already closed.');
  }

  const previousStatus = capa.status;
  const now = new Date();
  capa.effectivenessStatus = effectiveness;
  capa.status = effectiveness === 'EFFECTIVE' ? 'CLOSED' : 'REMEDIATION';
  capa.verificationNotes = notes;
  capa.verifiedByUserId = request.auth.userId;
  capa.verifiedAt = now;
  capa.closedAt = effectiveness === 'EFFECTIVE' ? now : null;
  capa.auditHistory.push({
    action: 'CAPA_EFFECTIVENESS_VERIFIED',
    performedBy: request.auth.userId,
    performedAt: now,
    previousStatus,
    newStatus: capa.status,
    notes: `${effectiveness}: ${notes}`,
  });
  await capa.save();

  const capaPayload = typeof capa.toObject === 'function' ? capa.toObject() : capa;
  const durableCapaPayload = { ...capaPayload, durableSource: 'CAPA_RECORD' };

  await recordRequestAudit({
    request,
    module: 'QUALITY',
    action: 'VERIFY_CAPA_EFFECTIVENESS',
    entityType: 'CAPA',
    entityId: capa.capaId,
    cafeId: capa.cafeId,
    after: {
      capaId: capa.capaId,
      status: capa.status,
      effectivenessStatus: effectiveness,
    },
    result: 'SUCCESS',
    riskClassification: effectiveness === 'EFFECTIVE' ? 'LOW' : 'HIGH',
  });

  return response.status(200).json({
    success: true,
    data: { capa: durableCapaPayload },
    correlationId: request.correlationId || null,
  });
});

/**
 * 8. Audits & Compliance
 */
const listAudits = asyncHandler(async (request, response) => {
  if (!qualitySourceConnected(AuditEvent.find)) {
    return response.status(200).json({
      success: true,
      data: {
        audits: [],
        sourceStatus: 'UNAVAILABLE',
        message: 'The durable quality audit-event source is unavailable.',
      },
      correlationId: request.correlationId || null,
    });
  }

  const filter = buildQualityScopeFilter(request, { module: 'QUALITY' });
  const query = AuditEvent.find(filter)
    .sort({ serverTimestamp: -1 })
    .limit(250);
  const audits = query && typeof query.lean === 'function' ? await query.lean() : await query;

  return response.status(200).json({
    success: true,
    data: {
      audits: Array.isArray(audits) ? audits : [],
      sourceStatus: 'DURABLE_AUDIT_EVENTS',
    },
    correlationId: request.correlationId || null,
  });
});

function qualitySourceConnected(modelMethod = null) {
  return Boolean(
    mongoose.connection?.readyState === 1 ||
    modelMethod?.mock ||
    typeof modelMethod?.restore === 'function'
  );
}

function calculateDaysRemaining(dateValue, now = new Date()) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function complianceStatusFromDate({ validUntil = null, isPerpetual = false, sourceStatus = null } = {}) {
  if (sourceStatus && !['ACTIVE', 'VALID', 'COMPLETED'].includes(String(sourceStatus).toUpperCase())) {
    return String(sourceStatus).toUpperCase();
  }
  if (isPerpetual) return 'CURRENT';
  const days = calculateDaysRemaining(validUntil);
  if (days === null) return 'VALIDITY_NOT_RECORDED';
  if (days < 0) return 'EXPIRED';
  if (days <= 30) return 'DUE_SOON';
  return 'CURRENT';
}

const getComplianceRegister = asyncHandler(async (request, response) => {
  const { organisationId, role, assignedCafeIds = [] } = request.auth;
  const requestedCafeId = normalizeId(request.query?.cafeId || '');

  if (requestedCafeId) assertCafeAccess(request, requestedCafeId);

  if (!qualitySourceConnected(Cafe.find)) {
    return response.status(200).json({
      success: true,
      data: {
        compliance: [],
        sourceStatus: 'UNAVAILABLE',
        message: 'Authoritative compliance sources are unavailable in the current runtime.',
      },
      correlationId: request.correlationId || null,
    });
  }

  const cafeFilter = { organisationId };
  if (requestedCafeId) {
    cafeFilter.cafeId = requestedCafeId;
  } else if (role !== 'MASTER' && Array.isArray(assignedCafeIds) && assignedCafeIds.length > 0) {
    cafeFilter.cafeId = { $in: assignedCafeIds.map(normalizeId) };
  }

  const cafes = await Cafe.find(cafeFilter)
    .select('cafeId name displayName registrations status')
    .lean();

  const cafeIds = (cafes || []).map((cafe) => cafe.cafeId).filter(Boolean);
  const scopedCafeFilter = cafeIds.length > 0 ? { cafeId: { $in: cafeIds } } : {};

  const [calibrations, fostacTrainings] = await Promise.all([
    qualitySourceConnected(CalibrationRecord.find)
      ? CalibrationRecord.find({ organisationId, ...scopedCafeFilter })
          .sort({ nextDueDate: 1 })
          .limit(200)
          .lean()
      : [],
    qualitySourceConnected(EmployeeTraining.find)
      ? EmployeeTraining.find({
          organisationId,
          ...scopedCafeFilter,
          trainingType: 'FOSTAC',
          status: 'COMPLETED',
        })
          .sort({ certificateExpiryDate: 1, completedAt: -1 })
          .limit(200)
          .lean()
      : [],
  ]);

  const compliance = [];
  const now = new Date();

  for (const cafe of cafes || []) {
    const fssai = cafe?.registrations?.fssai;
    if (fssai?.isApplicable !== false) {
      compliance.push({
        id: `FSSAI-${cafe.cafeId}`,
        requirement: 'FSSAI Food Business Operator Licence',
        authority: fssai?.issuingAuthority || 'FSSAI',
        category: 'STATUTORY_LICENCE',
        cafeId: cafe.cafeId,
        cafeName: cafe.displayName || cafe.name || cafe.cafeId,
        licenceNumber: fssai?.number || null,
        validFrom: fssai?.validFrom || null,
        validUntil: fssai?.validTill || null,
        isPerpetual: Boolean(fssai?.isPerpetual),
        daysRemaining: fssai?.isPerpetual ? null : calculateDaysRemaining(fssai?.validTill, now),
        status: fssai?.number
          ? complianceStatusFromDate({
              validUntil: fssai?.validTill,
              isPerpetual: Boolean(fssai?.isPerpetual),
              sourceStatus: fssai?.status,
            })
          : 'NOT_CONFIGURED',
        verificationStatus: fssai?.certificateAttachmentId
          ? 'DOCUMENT_RECORDED'
          : 'DOCUMENT_NOT_RECORDED',
        source: 'CAFE_REGISTRATION_MASTER',
      });
    }
  }

  for (const calibration of calibrations || []) {
    compliance.push({
      id: calibration.calibrationId,
      requirement: `Equipment Calibration — ${calibration.assetName}`,
      authority: calibration.performedBy || null,
      category: 'EQUIPMENT_CALIBRATION',
      cafeId: calibration.cafeId,
      assetId: calibration.assetId,
      licenceNumber: calibration.certificateNumber || null,
      validUntil: calibration.nextDueDate || null,
      daysRemaining: calculateDaysRemaining(calibration.nextDueDate, now),
      status: complianceStatusFromDate({
        validUntil: calibration.nextDueDate,
        sourceStatus: calibration.status,
      }),
      result: calibration.result,
      source: 'CALIBRATION_RECORD',
    });
  }

  for (const training of fostacTrainings || []) {
    compliance.push({
      id: training.trainingId,
      requirement: 'FoSTaC Food Safety Supervisor Certification',
      authority: training.provider || null,
      category: 'TRAINING_COMPETENCY',
      cafeId: training.cafeId || null,
      userId: training.userId,
      licenceNumber: training.fostacCertificateNumber || training.certificateRef || null,
      validUntil: training.certificateExpiryDate || training.validUntil || null,
      daysRemaining: calculateDaysRemaining(training.certificateExpiryDate || training.validUntil, now),
      status: complianceStatusFromDate({
        validUntil: training.certificateExpiryDate || training.validUntil,
        isPerpetual: training.certificateValidityStatus === 'PERPETUAL',
        sourceStatus:
          ['INVALID', 'EXPIRED'].includes(training.fostacVerificationStatus)
            ? training.fostacVerificationStatus
            : 'COMPLETED',
      }),
      verificationStatus: training.fostacVerificationStatus || 'RECORDED',
      isFoodSafetySupervisor: Boolean(training.isFoodSafetySupervisor),
      source: 'EMPLOYEE_TRAINING',
    });
  }

  return response.status(200).json({
    success: true,
    data: {
      compliance,
      sourceStatus: 'AUTHORITATIVE',
      sourceSummary: {
        cafes: (cafes || []).length,
        calibrationRecords: (calibrations || []).length,
        fostacRecords: (fostacTrainings || []).length,
      },
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * 9. GET /api/v1/quality/traceability
 */
const getTraceability = asyncHandler(async (request, response) => {
  const lotNumber = normalizeId(request.query?.lotNumber || '');
  if (!lotNumber) {
    throw new ApiError(400, 'LOT_NUMBER_REQUIRED', 'lotNumber is required for traceability lookup.');
  }

  if (!qualitySourceConnected(InventoryLot.findOne)) {
    return response.status(200).json({
      success: true,
      data: {
        trace: {
          searchedLot: lotNumber,
          sourceStatus: 'UNAVAILABLE',
          backwardTrace: null,
          forwardTrace: null,
          traceGapCheck: {
            status: 'NOT_VERIFIED',
            reason: 'Authoritative inventory/procurement data source is unavailable in the current runtime.',
          },
          recallReadiness: {
            status: 'NOT_ASSESSED',
            drillElapsedSeconds: null,
            affectedStockReconciled: null,
            reason: 'No durable recall-drill result is available.',
          },
        },
      },
      correlationId: request.correlationId || null,
    });
  }

  const organisationId = request.auth.organisationId;
  const lotQuery = InventoryLot.findOne({
    organisationId,
    $or: [
      { lotId: lotNumber },
      { supplierLot: lotNumber },
    ],
  });
  const lot = lotQuery && typeof lotQuery.lean === 'function'
    ? await lotQuery.lean()
    : await lotQuery;

  if (!lot) {
    throw new ApiError(404, 'LOT_NOT_FOUND', 'The requested inventory lot was not found.');
  }

  assertCafeAccess(request, lot.cafeId);

  let purchaseOrder = null;
  if (lot.procurementReference && qualitySourceConnected(PurchaseOrder.findOne)) {
    const poQuery = PurchaseOrder.findOne({
      organisationId,
      purchaseOrderId: normalizeId(lot.procurementReference),
      cafeId: lot.cafeId,
      ...(lot.vendorId ? { vendorId: lot.vendorId } : {}),
    });
    purchaseOrder = poQuery && typeof poQuery.lean === 'function'
      ? await poQuery.lean()
      : await poQuery;
  }

  let vendor = null;
  if (lot.vendorId && qualitySourceConnected(Vendor.findOne)) {
    const vendorQuery = Vendor.findOne({
      organisationId,
      vendorId: lot.vendorId,
    });
    vendor = vendorQuery && typeof vendorQuery.lean === 'function'
      ? await vendorQuery.lean()
      : await vendorQuery;
  }

  const supplierLot = String(lot.supplierLot || '').trim().toUpperCase();
  let matchingGrn = null;
  let matchingGrnItem = null;
  for (const grn of purchaseOrder?.grnReceipts || []) {
    const item = (grn.items || []).find((candidate) => {
      const candidateLot = String(candidate?.lotNumber || '').trim().toUpperCase();
      return (
        String(candidate?.itemId || '').trim().toUpperCase() === String(lot.itemId || '').trim().toUpperCase() &&
        (!supplierLot || candidateLot === supplierLot)
      );
    });
    if (item) {
      matchingGrn = grn;
      matchingGrnItem = item;
      break;
    }
  }

  let impactedBills = [];
  if (qualitySourceConnected(Bill.find)) {
    const billsQuery = Bill.find({
      organisationId,
      cafeId: lot.cafeId,
      'lineItems.consumedLots.lotId': lot.lotId,
      status: { $in: ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
      isTraining: { $ne: true },
    }).select('billId businessDate status lineItems');
    impactedBills = billsQuery && typeof billsQuery.lean === 'function'
      ? await billsQuery.lean()
      : await billsQuery;
    if (!Array.isArray(impactedBills)) impactedBills = [];
  }

  const initialQuantity = Number(lot.initialQuantity ?? lot.quantityBase ?? 0);
  const remainingQuantity = Number(lot.remainingQuantity ?? 0);
  const consumedQuantity = Math.max(0, initialQuantity - remainingQuantity);
  const supplierLinked = Boolean(lot.vendorId);
  const poLinked = Boolean(purchaseOrder);
  const grnLinked = Boolean(matchingGrn && matchingGrnItem);

  const traceChain = {
    searchedLot: lotNumber,
    resolvedLotId: lot.lotId,
    sourceStatus: 'AUTHORITATIVE',
    backwardTrace: {
      supplierId: lot.vendorId || null,
      supplierName: purchaseOrder?.vendorNameSnapshot || vendor?.name || null,
      supplierGstin: vendor?.gstNumber || null,
      purchaseOrder: purchaseOrder?.purchaseOrderId || null,
      goodsReceipt: matchingGrn?.grnId || null,
      receiptDate: matchingGrn?.receivedAt || lot.receivedAt || null,
      itemId: lot.itemId,
      supplierLot: lot.supplierLot || null,
      batchQuantityReceived: matchingGrnItem?.acceptedQty ?? initialQuantity,
      unit: lot.unit || null,
      receivingInspectionId: lot.receivingInspectionId || null,
      arrivalTemperature: null,
      arrivalTemperatureStatus: 'UNAVAILABLE_NO_CANONICAL_LOT_TEMPERATURE_LINK',
    },
    forwardTrace: {
      inventoryStatus: lot.status,
      currentLocation: lot.storageLocation || null,
      initialQuantity,
      remainingQuantity,
      consumedQuantity,
      unit: lot.unit || null,
      impactedBillCount: impactedBills.length,
      impactedBillIds: impactedBills.slice(0, 100).map((bill) => bill.billId),
      customerExposureAssessment:
        impactedBills.length > 0
          ? 'CONFIRMED_BILL_LINEAGE'
          : 'NO_CONFIRMED_BILL_LINEAGE',
    },
    traceGapCheck: {
      supplierLinked,
      poLinked,
      grnLinked,
      inventoryLotLinked: true,
      downstreamBillLineageQueryable: qualitySourceConnected(Bill.find),
      status:
        supplierLinked && poLinked && grnLinked
          ? 'BACKWARD_TRACE_COMPLETE'
          : 'BACKWARD_TRACE_GAPS_PRESENT',
      missingLinks: [
        ...(!supplierLinked ? ['SUPPLIER'] : []),
        ...(!poLinked ? ['PURCHASE_ORDER'] : []),
        ...(!grnLinked ? ['GOODS_RECEIPT'] : []),
      ],
    },
    recallReadiness: {
      status: 'NOT_ASSESSED',
      drillElapsedSeconds: null,
      affectedStockReconciled: null,
      reason: 'No durable recall-drill execution/result model is linked to this lot.',
    },
  };

  return response.status(200).json({
    success: true,
    data: { trace: traceChain },
    correlationId: request.correlationId || null,
  });
});

/**
 * 10. GET /api/v1/quality/integrity
 * Evidence-based integrity coverage report. A check is PASS only when the
 * current source can actually prove it; unimplemented probes remain explicit.
 */
const getQualityIntegrity = asyncHandler(async (request, response) => {
  const { organisationId, role, assignedCafeIds = [] } = request.auth;

  if (!qualitySourceConnected(QualityChecklist.countDocuments)) {
    const checks = [
      'Checklist Version Retention',
      'Non-Negative Excursion Counts',
      'Quality Hold Inventory Lock',
      'FSSAI Statutory Dates',
      'Zero Unauthenticated Sign-Off',
      'CAPA Effectiveness Verification',
      'Audit Finding Lineage',
      'Cold Chain Anomaly Alerting',
      'Cross-Café Isolation',
      'Traceability Chain Completeness',
      'Allergen Matrix Integrity',
      'PRP Verification Schedule',
      'Zero Hard Deletion',
      'Evidence Immutability',
      'FoSTaC Supervisor Coverage',
      'Management Review Snapshotting',
    ].map((rule) => ({
      rule,
      status: 'NOT_VERIFIED',
      description: 'Authoritative verification source is unavailable in the current runtime.',
    }));

    return response.status(200).json({
      success: true,
      data: {
        integrityScore: null,
        coveragePercent: 0,
        verifiedChecks: 0,
        totalChecks: checks.length,
        allPassed: false,
        checks,
        auditedAt: new Date().toISOString(),
        sourceStatus: 'UNAVAILABLE',
      },
      correlationId: request.correlationId || null,
    });
  }

  const cafeFilter = { organisationId };
  if (role !== 'MASTER' && Array.isArray(assignedCafeIds) && assignedCafeIds.length > 0) {
    cafeFilter.cafeId = { $in: assignedCafeIds.map(normalizeId) };
  }

  const [
    checklistCount,
    checklistMissingVersionCount,
    cafes,
    calibrationCount,
    overdueCalibrationCount,
    fostacSupervisorCount,
    lotCount,
    lotMissingProcurementLinkCount,
  ] = await Promise.all([
    qualitySourceConnected(QualityChecklist.countDocuments)
      ? QualityChecklist.countDocuments({ organisationId })
      : 0,
    qualitySourceConnected(QualityChecklist.countDocuments)
      ? QualityChecklist.countDocuments({
          organisationId,
          $or: [
            { templateId: { $in: [null, ''] } },
            { templateVersion: { $in: [null, ''] } },
          ],
        })
      : 0,
    qualitySourceConnected(Cafe.find)
      ? Cafe.find(cafeFilter).select('cafeId registrations.fssai').lean()
      : [],
    qualitySourceConnected(CalibrationRecord.countDocuments)
      ? CalibrationRecord.countDocuments({
          organisationId,
          ...(cafeFilter.cafeId ? { cafeId: cafeFilter.cafeId } : {}),
        })
      : 0,
    qualitySourceConnected(CalibrationRecord.countDocuments)
      ? CalibrationRecord.countDocuments({
          organisationId,
          ...(cafeFilter.cafeId ? { cafeId: cafeFilter.cafeId } : {}),
          $or: [
            { status: { $in: ['OVERDUE', 'FAILED'] } },
            { nextDueDate: { $lt: new Date() } },
          ],
        })
      : 0,
    qualitySourceConnected(EmployeeTraining.countDocuments)
      ? EmployeeTraining.countDocuments({
          organisationId,
          ...(cafeFilter.cafeId ? { cafeId: cafeFilter.cafeId } : {}),
          trainingType: 'FOSTAC',
          status: 'COMPLETED',
          isFoodSafetySupervisor: true,
          fostacVerificationStatus: {
            $in: ['MANUALLY_VERIFIED', 'OFFICIAL_VERIFICATION_CONFIRMED'],
          },
        })
      : 0,
    qualitySourceConnected(InventoryLot.countDocuments)
      ? InventoryLot.countDocuments({
          organisationId,
          ...(cafeFilter.cafeId ? { cafeId: cafeFilter.cafeId } : {}),
        })
      : 0,
    qualitySourceConnected(InventoryLot.countDocuments)
      ? InventoryLot.countDocuments({
          organisationId,
          ...(cafeFilter.cafeId ? { cafeId: cafeFilter.cafeId } : {}),
          $or: [
            { vendorId: { $in: [null, ''] } },
            { procurementReference: { $in: [null, ''] } },
          ],
        })
      : 0,
  ]);

  const fssaiApplicable = (cafes || []).filter((cafe) => cafe?.registrations?.fssai?.isApplicable !== false);
  const fssaiFailures = fssaiApplicable.filter((cafe) => {
    const fssai = cafe?.registrations?.fssai;
    if (!fssai?.number || fssai.status !== 'ACTIVE') return true;
    if (fssai.isPerpetual) return false;
    return !fssai.validTill || new Date(fssai.validTill) < new Date();
  });

  const checks = [
    {
      rule: 'Checklist Version Retention',
      status: checklistCount === 0 ? 'NOT_CONFIGURED' : (checklistMissingVersionCount === 0 ? 'PASS' : 'FAIL'),
      description: `${checklistCount} checklist(s) inspected; ${checklistMissingVersionCount} missing template/version lineage.`,
    },
    {
      rule: 'FSSAI Statutory Dates',
      status: fssaiApplicable.length === 0 ? 'NOT_CONFIGURED' : (fssaiFailures.length === 0 ? 'PASS' : 'FAIL'),
      description: `${fssaiApplicable.length} applicable café registration(s) inspected; ${fssaiFailures.length} incomplete/inactive/expired.`,
    },
    {
      rule: 'Calibration Validity',
      status: calibrationCount === 0 ? 'NOT_CONFIGURED' : (overdueCalibrationCount === 0 ? 'PASS' : 'FAIL'),
      description: `${calibrationCount} calibration record(s) inspected; ${overdueCalibrationCount} overdue/failed.`,
    },
    {
      rule: 'FoSTaC Supervisor Coverage',
      status: fostacSupervisorCount > 0 ? 'PASS' : 'NOT_CONFIGURED',
      description: `${fostacSupervisorCount} verified completed FoSTaC food-safety supervisor record(s) found in scope.`,
    },
    {
      rule: 'Traceability Procurement Linkage',
      status: lotCount === 0 ? 'NOT_CONFIGURED' : (lotMissingProcurementLinkCount === 0 ? 'PASS' : 'FAIL'),
      description: `${lotCount} inventory lot(s) inspected; ${lotMissingProcurementLinkCount} missing vendor/procurement linkage.`,
    },
    ...[
      'Non-Negative Excursion Counts',
      'Quality Hold Inventory Lock',
      'Zero Unauthenticated Sign-Off',
      'CAPA Effectiveness Verification',
      'Audit Finding Lineage',
      'Cold Chain Anomaly Alerting',
      'Cross-Café Isolation',
      'Allergen Matrix Integrity',
      'PRP Verification Schedule',
      'Zero Hard Deletion',
      'Evidence Immutability',
      'Management Review Snapshotting',
    ].map((rule) => ({
      rule,
      status: 'NOT_VERIFIED',
      description: 'No canonical runtime probe is implemented for this invariant; no PASS claim is made.',
    })),
  ];

  const verified = checks.filter((check) => ['PASS', 'FAIL'].includes(check.status));
  const passed = verified.filter((check) => check.status === 'PASS');
  const integrityScore = verified.length > 0
    ? Number(((passed.length / verified.length) * 100).toFixed(1))
    : null;
  const coveragePercent = Number(((verified.length / checks.length) * 100).toFixed(1));

  return response.status(200).json({
    success: true,
    data: {
      integrityScore,
      coveragePercent,
      verifiedChecks: verified.length,
      totalChecks: checks.length,
      allPassed: verified.length === checks.length && passed.length === checks.length,
      checks,
      auditedAt: new Date().toISOString(),
      sourceStatus: 'AUTHORITATIVE_PARTIAL_COVERAGE',
    },
    correlationId: request.correlationId || null,
  });
});

// ── Food Safety Incidents & Complaints (R02-06) ──────────────────────────────
const listFoodSafetyIncidents = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const cafeId = resolveEffectiveCafeScope(request);
  const { incidentType, severity, status } = request.query;

  const filter = { organisationId, cafeId };
  if (incidentType) filter.incidentType = incidentType.toUpperCase();
  if (severity) filter.severity = severity.toUpperCase();
  if (status) filter.status = status.toUpperCase();

  const incidents = await FoodSafetyIncident.find(filter).sort({ createdAt: -1 }).lean();

  return response.status(200).json({
    success: true,
    data: {
      incidents,
      totalCount: incidents.length,
    },
  });
});

const recordFoodSafetyIncident = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const cafeId = resolveEffectiveCafeScope(request);
  const {
    incidentType,
    severity = 'MEDIUM',
    customerName,
    customerContact,
    billId,
    menuItemId,
    menuItemName,
    lotId,
    description,
    sampleRetained,
    sampleStorageLocation,
  } = request.body || {};

  if (!incidentType || !description) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'incidentType and description are required.');
  }

  const count = await FoodSafetyIncident.countDocuments({ organisationId });
  const incidentId = `FSI-2026-${String(count + 1).padStart(4, '0')}`;

  const incident = await FoodSafetyIncident.create({
    incidentId,
    organisationId,
    cafeId,
    incidentType,
    severity,
    status: 'REPORTED',
    customerName: customerName || '',
    customerContact: customerContact || '',
    billId: billId || '',
    menuItemId: menuItemId || '',
    menuItemName: menuItemName || '',
    lotId: lotId || '',
    description,
    sampleRetained: Boolean(sampleRetained),
    sampleStorageLocation: sampleStorageLocation || '',
    reportedByUserId: userId,
    reportedAt: new Date(),
  });

  await recordRequestAudit(request, {
    action: 'FOOD_SAFETY_INCIDENT_RECORDED',
    entityType: 'FoodSafetyIncident',
    entityId: incidentId,
    cafeId,
    metadata: {
      incidentType,
      severity,
      menuItemId,
      billId,
    },
  });

  return response.status(201).json({
    success: true,
    message: `Food safety incident ${incidentId} logged.`,
    data: { incident },
  });
});

const resolveFoodSafetyIncident = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const cafeId = resolveEffectiveCafeScope(request);
  const { incidentId } = request.params;
  const { investigationFindings, correctiveAction, status = 'RESOLVED' } = request.body || {};

  const incident = await FoodSafetyIncident.findOne({
    organisationId,
    cafeId,
    incidentId: incidentId.toUpperCase(),
  });

  if (!incident) {
    throw new ApiError(404, 'NOT_FOUND', `Food safety incident ${incidentId} not found.`);
  }

  if (investigationFindings !== undefined) incident.investigationFindings = investigationFindings;
  if (correctiveAction !== undefined) incident.correctiveAction = correctiveAction;
  incident.status = status.toUpperCase();
  incident.resolvedAt = new Date();
  incident.resolvedByUserId = userId;

  await incident.save();

  await recordRequestAudit(request, {
    action: 'FOOD_SAFETY_INCIDENT_RESOLVED',
    entityType: 'FoodSafetyIncident',
    entityId: incidentId,
    cafeId,
    metadata: {
      status: incident.status,
      correctiveAction,
    },
  });

  return response.status(200).json({
    success: true,
    message: `Incident ${incidentId} updated to ${incident.status}.`,
    data: { incident },
  });
});

module.exports = {
  getQualityOverview,
  listChecklists,
  submitChecklist,
  listTemplates,
  listTemperatures,
  recordTemperature,
  applyCorrectiveAction,
  listCleaningTasks,
  createCleaningTask,
  completeCleaningTask,
  listPestControl,
  recordPestControl,
  listCalibrations,
  recordCalibration,
  listFoodSafetyIncidents,
  recordFoodSafetyIncident,
  resolveFoodSafetyIncident,
  listQualityHolds,
  createQualityHold,
  releaseQualityHold,
  listNcrs,
  createNcr,
  listCapas,
  createCapa,
  verifyCapa,
  listAudits,
  getComplianceRegister,
  getTraceability,
  getQualityIntegrity,
};
