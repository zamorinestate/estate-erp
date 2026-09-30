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

// In-memory persistent state stores for extended FSMS domains
const inMemoryQualityHolds = [];
const inMemoryNcrs = [];
const inMemoryCapas = [];
const inMemoryTemperatures = [];
const inMemoryAudits = [];

/**
 * 1. GET /api/v1/quality/overview
 */
const getQualityOverview = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const effectiveCafe = resolveEffectiveCafeScope(request);

  const filter = { organisationId };
  if (effectiveCafe) {
    filter.cafeId = effectiveCafe;
  } else if (request.query.cafeId && request.query.cafeId !== 'ALL') {
    const requestedCafeId = normalizeId(request.query.cafeId);
    assertCafeAccess(request, requestedCafeId);
    filter.cafeId = requestedCafeId;
  }

  const [dbChecklists, totalChecklists] = await Promise.all([
    QualityChecklist.find(filter)
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    QualityChecklist.countDocuments(filter),
  ]);

  const activeHolds = inMemoryQualityHolds.filter(
    (h) =>
      h.organisationId === organisationId &&
      h.status === 'ON_HOLD' &&
      (!filter.cafeId || h.cafeId === filter.cafeId)
  );
  const openNcrs = inMemoryNcrs.filter(
    (n) =>
      n.organisationId === organisationId &&
      n.status !== 'CLOSED' &&
      (!filter.cafeId || n.cafeId === filter.cafeId)
  );
  const openCapas = inMemoryCapas.filter(
    (entry) =>
      entry.organisationId === organisationId &&
      entry.status !== 'CLOSED' &&
      (!filter.cafeId || entry.cafeId === filter.cafeId)
  );

  let temperatures = [];
  if (filter.cafeId && qualitySourceConnected(FoodSafetyService.listTemperatures)) {
    try {
      temperatures = await FoodSafetyService.listTemperatures({
        organisationId,
        cafeId: filter.cafeId,
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
      description: `${activeHolds[0].itemName} (${activeHolds[0].lotNumber}) isolated due to ${String(activeHolds[0].reason || 'quality hold').toLowerCase().replace(/_/g, ' ')}.`,
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
        checksDueTodayStatus: 'NOT_AVAILABLE_NO_DURABLE_CHECKLIST_SCHEDULE',
        overdueActions: null,
        overdueActionsStatus: 'NOT_AVAILABLE_VOLATILE_NCR_CAPA_STATE',
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
        temperatureRecords: filter.cafeId ? 'DURABLE_IF_AVAILABLE' : 'CAFE_SCOPE_REQUIRED',
        qualityHolds: 'VOLATILE_RUNTIME_ONLY',
        ncrs: 'VOLATILE_RUNTIME_ONLY',
        capas: 'VOLATILE_RUNTIME_ONLY',
        audits: 'VOLATILE_RUNTIME_ONLY',
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

  const filter = { organisationId: request.auth.organisationId };
  const { cafeId, date } = request.query;

  if (cafeId) {
    const normCafeId = normalizeId(cafeId);
    assertCafeAccess(request, normCafeId);
    filter.cafeId = normCafeId;
  } else if (!['MASTER', 'OWNER'].includes(request.auth.role)) {
    filter.cafeId = { $in: request.auth.assignedCafeIds };
  }

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
    frequency: frequency ? normalizeId(frequency) : 'DAILY',
    items,
    overallResult: normResult,
    inspectionDate: getIstBusinessDate(),
    inspectedByUserId: request.auth.userId,
    actionRequired: typeof actionRequired === 'string' ? actionRequired.trim() : '',
  });

  await checklist.save();

  // If Critical Fail, auto-trigger NCR
  if (normResult === 'CRITICAL_FAIL') {
    const ncrSeqId = `NCR-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    inMemoryNcrs.unshift({
      ncrId: ncrSeqId,
      organisationId: request.auth.organisationId,
      cafeId,
      source: 'CHECKLIST_CRITICAL_FAIL',
      severity: 'CRITICAL',
      title: `Critical Failure in ${titleText}`,
      description: actionRequired || 'Inspection failed critical sanitation or temperature standard.',
      immediateAction: 'Operations suspended in affected station until sanitised and re-inspected.',
      status: 'OPEN',
      reportedBy: request.auth.userId,
      reportedAt: new Date().toISOString(),
      checklistId: seqId,
    });
  }

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
    data: { checklist: checklist.toObject() },
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
  const { organisationId, role, assignedCafeIds } = request.auth;
  const { cafeId: queryCafe, excursionsOnly, limit = 50 } = request.query || {};

  let targetCafe = queryCafe ? normalizeId(queryCafe) : null;
  if (targetCafe) {
    assertCafeAccess(request, targetCafe);
  } else if (role !== 'MASTER' && role !== 'OWNER' && assignedCafeIds?.length > 0) {
    targetCafe = assignedCafeIds[0];
  }

  let logs = [];
  try {
    logs = await FoodSafetyService.listTemperatures({
      organisationId,
      cafeId: targetCafe || 'CAFE-001',
      excursionsOnly: excursionsOnly === 'true',
      limit: Number(limit),
    });
  } catch (err) {
    logs = [];
  }


  return response.status(200).json({
    success: true,
    data: { temperatures: logs },
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

  let logRecord;
  try {
    logRecord = await FoodSafetyService.recordTemperature({
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
      operatorSessionId,
      remarks: remarks || notes,
    });
  } catch (err) {
    // In-memory fallback
    const isExcursion = Number(readingCelsius) < min || Number(readingCelsius) > max;
    const logId = `TEMP-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    logRecord = {
      logId,
      organisationId: request.auth.organisationId,
      cafeId,
      assetId: equipmentId || 'AST-CHILL-GEN',
      assetName: equipmentName || 'Refrigeration Unit',
      location: location || 'Kitchen',
      readingCelsius: Number(readingCelsius),
      expectedMinCelsius: min,
      expectedMaxCelsius: max,
      isExcursion,
      notes: remarks || notes,
      status: isExcursion ? 'OUT_OF_RANGE' : 'WITHIN_RANGE',
      recordedBy: request.auth.userId,
      recordedAt: new Date().toISOString(),
    };
    inMemoryTemperatures.unshift(logRecord);
  }

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
  const { organisationId, role, assignedCafeIds } = request.auth;
  const { cafeId: queryCafe, status, limit = 50 } = request.query || {};

  let targetCafe = queryCafe ? normalizeId(queryCafe) : null;
  if (targetCafe) {
    assertCafeAccess(request, targetCafe);
  } else if (role !== 'MASTER' && role !== 'OWNER' && assignedCafeIds?.length > 0) {
    targetCafe = assignedCafeIds[0];
  }

  const tasks = await FoodSafetyService.listCleaningTasks({
    organisationId,
    cafeId: targetCafe || 'CAFE-001',
    status: status ? normalizeId(status) : null,
    limit: Number(limit),
  });

  return response.status(200).json({
    success: true,
    data: { tasks },
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
  const { organisationId, role, assignedCafeIds } = request.auth;
  const { cafeId: queryCafe, limit = 50 } = request.query || {};

  let targetCafe = queryCafe ? normalizeId(queryCafe) : null;
  if (targetCafe) {
    assertCafeAccess(request, targetCafe);
  } else if (role !== 'MASTER' && role !== 'OWNER' && assignedCafeIds?.length > 0) {
    targetCafe = assignedCafeIds[0];
  }

  const records = await FoodSafetyService.listPestControl({
    organisationId,
    cafeId: targetCafe || 'CAFE-001',
    limit: Number(limit),
  });

  return response.status(200).json({
    success: true,
    data: { pestControlRecords: records },
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
  const { organisationId, role, assignedCafeIds } = request.auth;
  const { cafeId: queryCafe, limit = 50 } = request.query || {};

  let targetCafe = queryCafe ? normalizeId(queryCafe) : null;
  if (targetCafe) {
    assertCafeAccess(request, targetCafe);
  } else if (role !== 'MASTER' && role !== 'OWNER' && assignedCafeIds?.length > 0) {
    targetCafe = assignedCafeIds[0];
  }

  const calibrations = await FoodSafetyService.listCalibrations({
    organisationId,
    cafeId: targetCafe || 'CAFE-001',
    limit: Number(limit),
  });

  return response.status(200).json({
    success: true,
    data: { calibrations },
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
const listQualityHolds = asyncHandler(async (request, response) => {
  const { organisationId, role, assignedCafeIds } = request.auth;

  let holds = inMemoryQualityHolds.filter((h) => h.organisationId === organisationId);
  if (role !== 'MASTER' && role !== 'OWNER') {
    holds = holds.filter((h) => assignedCafeIds.includes(h.cafeId));
  }

  return response.status(200).json({
    success: true,
    data: { holds },
    correlationId: request.correlationId || null,
  });
});

const createQualityHold = asyncHandler(async (request, response) => {
  const { cafeId: rawCafeId, lotNumber, itemSku, itemName, quantityHeld, unit = 'kg', reason, description } = request.body || {};

  const cafeId = normalizeId(rawCafeId);
  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  assertCafeAccess(request, cafeId);

  if (!lotNumber || !itemName) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'lotNumber and itemName are required for Quality Hold.');
  }

  const holdId = `QHOLD-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const holdEntry = {
    holdId,
    organisationId: request.auth.organisationId,
    cafeId,
    lotNumber: String(lotNumber).trim().toUpperCase(),
    itemSku: itemSku || 'SKU-GEN',
    itemName: String(itemName).trim(),
    quantityHeld: Number(quantityHeld) || 1,
    unit,
    reason: reason || 'INSPECTION_PENDING',
    description: description || 'Material quarantined pending quality assessment.',
    status: 'ON_HOLD',
    placedBy: request.auth.userId,
    placedAt: new Date().toISOString(),
    disposition: null,
    releasedAt: null,
  };

  inMemoryQualityHolds.unshift(holdEntry);

  await recordRequestAudit({
    request,
    module: 'QUALITY',
    action: 'CREATE_QUALITY_HOLD',
    entityType: 'QUALITY_HOLD',
    entityId: holdId,
    after: holdEntry,
    result: 'SUCCESS',
    riskClassification: 'HIGH',
  });

  return response.status(201).json({
    success: true,
    data: { hold: holdEntry },
    correlationId: request.correlationId || null,
  });
});

const releaseQualityHold = asyncHandler(async (request, response) => {
  const { id } = request.params;
  const { disposition = 'RELEASE', dispositionNotes = '' } = request.body || {};

  const hold = inMemoryQualityHolds.find(
    (h) => h.holdId === id && h.organisationId === request.auth.organisationId
  );
  if (!hold) {
    throw new ApiError(404, 'HOLD_NOT_FOUND', 'Quality hold record not found.');
  }
  assertCafeAccess(request, hold.cafeId);

  hold.status = disposition === 'RELEASE' ? 'RELEASED' : 'DISPOSED';
  hold.disposition = disposition;
  hold.dispositionNotes = dispositionNotes;
  hold.releasedBy = request.auth.userId;
  hold.releasedAt = new Date().toISOString();

  await recordRequestAudit({
    request,
    module: 'QUALITY',
    action: 'RELEASE_QUALITY_HOLD',
    entityType: 'QUALITY_HOLD',
    entityId: hold.holdId,
    after: { holdId: hold.holdId, status: hold.status, disposition },
    result: 'SUCCESS',
    riskClassification: 'MEDIUM',
  });

  return response.status(200).json({
    success: true,
    data: { hold },
    correlationId: request.correlationId || null,
  });
});

/**
 * 7. NCRs & CAPAs
 */
const listNcrs = asyncHandler(async (request, response) => {
  const { organisationId, role, assignedCafeIds } = request.auth;

  let ncrs = inMemoryNcrs.filter((n) => n.organisationId === organisationId);
  if (role !== 'MASTER' && role !== 'OWNER') {
    ncrs = ncrs.filter((n) => assignedCafeIds.includes(n.cafeId));
  }

  return response.status(200).json({
    success: true,
    data: { ncrs },
    correlationId: request.correlationId || null,
  });
});

const createNcr = asyncHandler(async (request, response) => {
  const { cafeId: rawCafeId, title, source = 'MANUAL_OBSERVATION', severity = 'MAJOR', description, immediateAction } = request.body || {};

  const cafeId = normalizeId(rawCafeId);
  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  assertCafeAccess(request, cafeId);

  if (!title) throw new ApiError(400, 'VALIDATION_ERROR', 'NCR title is required.');

  const ncrId = `NCR-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const ncrEntry = {
    ncrId,
    organisationId: request.auth.organisationId,
    cafeId,
    source,
    severity,
    title: String(title).trim(),
    description: description || '',
    immediateAction: immediateAction || 'Immediate containment enacted.',
    status: 'OPEN',
    reportedBy: request.auth.userId,
    reportedAt: new Date().toISOString(),
  };

  inMemoryNcrs.unshift(ncrEntry);

  await recordRequestAudit({
    request,
    module: 'QUALITY',
    action: 'CREATE_NCR',
    entityType: 'NCR',
    entityId: ncrId,
    after: ncrEntry,
    result: 'SUCCESS',
    riskClassification: severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
  });

  return response.status(201).json({
    success: true,
    data: { ncr: ncrEntry },
    correlationId: request.correlationId || null,
  });
});

const listCapas = asyncHandler(async (request, response) => {
  const { organisationId, role, assignedCafeIds } = request.auth;

  let capas = inMemoryCapas.filter((c) => c.organisationId === organisationId);
  if (role !== 'MASTER' && role !== 'OWNER') {
    capas = capas.filter((c) => assignedCafeIds.includes(c.cafeId));
  }

  return response.status(200).json({
    success: true,
    data: { capas },
    correlationId: request.correlationId || null,
  });
});

const createCapa = asyncHandler(async (request, response) => {
  const { cafeId: rawCafeId, ncrId, title, rootCauseMethod = '5_WHY', rootCauseAnalysis, actionPlan, targetDate } = request.body || {};

  const cafeId = normalizeId(rawCafeId);
  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  assertCafeAccess(request, cafeId);

  if (!title) throw new ApiError(400, 'VALIDATION_ERROR', 'CAPA title is required.');

  const capaId = `CAPA-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const capaEntry = {
    capaId,
    organisationId: request.auth.organisationId,
    cafeId,
    ncrId: ncrId || null,
    title: String(title).trim(),
    rootCauseMethod,
    rootCauseAnalysis: rootCauseAnalysis || 'Root cause investigation in progress.',
    actionPlan: actionPlan || 'Corrective action scheduled.',
    ownerUserId: request.auth.userId,
    targetDate: targetDate || getIstBusinessDate(new Date(Date.now() + 14 * 86400000)),
    status: 'IN_PROGRESS',
    effectivenessStatus: 'PENDING_VERIFICATION',
    verifiedBy: null,
    verifiedAt: null,
  };

  inMemoryCapas.unshift(capaEntry);

  await recordRequestAudit({
    request,
    module: 'QUALITY',
    action: 'CREATE_CAPA',
    entityType: 'CAPA',
    entityId: capaId,
    after: capaEntry,
    result: 'SUCCESS',
    riskClassification: 'HIGH',
  });

  return response.status(201).json({
    success: true,
    data: { capa: capaEntry },
    correlationId: request.correlationId || null,
  });
});

const verifyCapa = asyncHandler(async (request, response) => {
  const { id } = request.params;
  const { effectiveness = 'EFFECTIVE', notes = '' } = request.body || {};

  const capa = inMemoryCapas.find(
    (c) => c.capaId === id && c.organisationId === request.auth.organisationId
  );
  if (!capa) {
    throw new ApiError(404, 'CAPA_NOT_FOUND', 'CAPA record not found.');
  }
  assertCafeAccess(request, capa.cafeId);

  capa.effectivenessStatus = effectiveness;
  capa.status = effectiveness === 'EFFECTIVE' ? 'CLOSED' : 'REOPENED';
  capa.verificationNotes = notes;
  capa.verifiedBy = request.auth.userId;
  capa.verifiedAt = new Date().toISOString();

  await recordRequestAudit({
    request,
    module: 'QUALITY',
    action: 'VERIFY_CAPA_EFFECTIVENESS',
    entityType: 'CAPA',
    entityId: capa.capaId,
    after: { capaId: capa.capaId, status: capa.status, effectivenessStatus: effectiveness },
    result: 'SUCCESS',
    riskClassification: 'LOW',
  });

  return response.status(200).json({
    success: true,
    data: { capa },
    correlationId: request.correlationId || null,
  });
});

/**
 * 8. Audits & Compliance
 */
const listAudits = asyncHandler(async (request, response) => {
  const { organisationId, role, assignedCafeIds } = request.auth;

  let audits = inMemoryAudits.filter((a) => a.organisationId === organisationId);
  if (role !== 'MASTER' && role !== 'OWNER') {
    audits = audits.filter((a) => assignedCafeIds.includes(a.cafeId));
  }

  return response.status(200).json({
    success: true,
    data: { audits },
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
    QualityChecklist.countDocuments({ organisationId }),
    QualityChecklist.countDocuments({
      organisationId,
      $or: [
        { templateId: { $in: [null, ''] } },
        { templateVersion: { $in: [null, ''] } },
      ],
    }),
    Cafe.find(cafeFilter).select('cafeId registrations.fssai').lean(),
    CalibrationRecord.countDocuments({ organisationId, ...(cafeFilter.cafeId ? { cafeId: cafeFilter.cafeId } : {}) }),
    CalibrationRecord.countDocuments({
      organisationId,
      ...(cafeFilter.cafeId ? { cafeId: cafeFilter.cafeId } : {}),
      $or: [
        { status: { $in: ['OVERDUE', 'FAILED'] } },
        { nextDueDate: { $lt: new Date() } },
      ],
    }),
    EmployeeTraining.countDocuments({
      organisationId,
      ...(cafeFilter.cafeId ? { cafeId: cafeFilter.cafeId } : {}),
      trainingType: 'FOSTAC',
      status: 'COMPLETED',
      isFoodSafetySupervisor: true,
      fostacVerificationStatus: {
        $in: ['MANUALLY_VERIFIED', 'OFFICIAL_VERIFICATION_CONFIRMED'],
      },
    }),
    InventoryLot.countDocuments({ organisationId, ...(cafeFilter.cafeId ? { cafeId: cafeFilter.cafeId } : {}) }),
    InventoryLot.countDocuments({
      organisationId,
      ...(cafeFilter.cafeId ? { cafeId: cafeFilter.cafeId } : {}),
      $or: [
        { vendorId: { $in: [null, ''] } },
        { procurementReference: { $in: [null, ''] } },
      ],
    }),
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
