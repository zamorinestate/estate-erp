'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — FOOD SAFETY GOVERNANCE CONTROLLER (STAGE 01)
 * ============================================================================
 * Handles HTTP requests for Owner & Operational Food Safety Governance:
 * Licences, Hygiene Inspections, Temperatures, FoSTaC, Traceability,
 * Food Recalls, and CAPA Engine.
 */

const { FoodSafetyGovernanceService } = require('../services/foodSafetyGovernanceService');
const { HygieneInspection } = require('../models/HygieneInspection');
const { HygieneChecklistTemplate } = require('../models/HygieneChecklistTemplate');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { resolveEffectiveCafeScope, assertResourceCafeOwnership } = require('../utils/cafeScope');
const { recordRequestAudit } = require('../services/auditService');

function assertCafeAccess(request, cafeId) {
  if (!cafeId) return;
  const cleanCafe = cafeId.trim().toUpperCase();
  const { role, assignedCafeIds } = request.auth;

  if (role === 'MASTER') return;
  if (role === 'OWNER') {
    if (Array.isArray(assignedCafeIds) && assignedCafeIds.length > 0 && !assignedCafeIds.includes(cleanCafe)) {
      throw new ApiError(403, 'CAFE_SCOPE_DENIED', `Access to café ${cleanCafe} is not authorized for this Owner account.`);
    }
    return;
  }
  if (Array.isArray(assignedCafeIds) && !assignedCafeIds.includes(cleanCafe)) {
    throw new ApiError(403, 'CAFE_SCOPE_DENIED', `Access to café ${cleanCafe} is not permitted.`);
  }
}

// ── 1. Dashboard & Portfolio Overview ──────────────────────────────────────────
const getDashboardOverview = asyncHandler(async (req, res) => {
  const { organisationId } = req.auth;
  const requestedCafe = req.query.cafeId ? req.query.cafeId.trim().toUpperCase() : null;
  if (requestedCafe) assertCafeAccess(req, requestedCafe);

  const overview = await FoodSafetyGovernanceService.getOwnerDashboardOverview({
    organisationId,
    cafeId: requestedCafe,
  });

  return res.status(200).json({
    success: true,
    data: { overview },
    correlationId: req.correlationId || null,
  });
});

// ── 2. Registration & Licences ─────────────────────────────────────────────────
const listLicences = asyncHandler(async (req, res) => {
  const { organisationId } = req.auth;
  const requestedCafe = req.query.cafeId ? req.query.cafeId.trim().toUpperCase() : null;
  if (requestedCafe) assertCafeAccess(req, requestedCafe);

  const licences = await FoodSafetyGovernanceService.listLicences({
    organisationId,
    cafeId: requestedCafe,
    status: req.query.status || null,
  });

  return res.status(200).json({
    success: true,
    data: { licences },
    correlationId: req.correlationId || null,
  });
});

const registerLicence = asyncHandler(async (req, res) => {
  const { organisationId, userId } = req.auth;
  const { cafeId, fssaiNumber, registrationType, businessCategory, authority, regimeVersion, isPerpetual, issueDate, legacyExpiryDate, responsiblePerson, complianceOwner, conditions, certificateAttachmentId, nextComplianceDate } = req.body || {};

  assertCafeAccess(req, cafeId);

  const registration = await FoodSafetyGovernanceService.registerLicence({
    organisationId,
    cafeId,
    fssaiNumber,
    registrationType,
    businessCategory,
    authority,
    regimeVersion,
    isPerpetual,
    issueDate,
    legacyExpiryDate,
    responsiblePerson,
    complianceOwner,
    conditions,
    certificateAttachmentId,
    nextComplianceDate,
    performedByUserId: userId,
  });

  await recordRequestAudit({
    request: req,
    module: 'FOOD_SAFETY',
    action: 'REGISTER_LICENCE',
    entityType: 'FOOD_SAFETY_LICENCE',
    entityId: registration.registrationId,
    after: registration.toObject(),
    result: 'SUCCESS',
  });

  return res.status(201).json({
    success: true,
    data: { registration },
    correlationId: req.correlationId || null,
  });
});

const updateLicenceStatus = asyncHandler(async (req, res) => {
  const { organisationId, userId, role } = req.auth;
  const { registrationId } = req.params;
  const { newStatus, reason, regulatorOrderReference } = req.body || {};

  const registration = await FoodSafetyGovernanceService.updateLicenceStatus({
    organisationId,
    registrationId,
    newStatus,
    reason,
    performedByUserId: userId,
    performedByRole: role,
    regulatorOrderReference,
  });

  await recordRequestAudit({
    request: req,
    module: 'FOOD_SAFETY',
    action: 'UPDATE_LICENCE_STATUS',
    entityType: 'FOOD_SAFETY_LICENCE',
    entityId: registrationId,
    after: registration.toObject(),
    result: 'SUCCESS',
  });

  return res.status(200).json({
    success: true,
    data: { registration },
    correlationId: req.correlationId || null,
  });
});

// ── 3. Hygiene Templates & Inspections ─────────────────────────────────────────
const listTemplates = asyncHandler(async (req, res) => {
  const { organisationId } = req.auth;
  const templates = await HygieneChecklistTemplate.find({
    organisationId: organisationId.toUpperCase(),
    status: req.query.status || 'ACTIVE',
  }).sort({ templateId: 1, version: -1 }).lean();

  return res.status(200).json({
    success: true,
    data: { templates },
    correlationId: req.correlationId || null,
  });
});

const createTemplate = asyncHandler(async (req, res) => {
  const { organisationId, userId } = req.auth;
  const { templateId, title, frequency, classification, applicableCafes, applicableRoles, questions } = req.body || {};

  const template = await FoodSafetyGovernanceService.createChecklistTemplate({
    organisationId,
    templateId,
    title,
    frequency,
    classification,
    applicableCafes,
    applicableRoles,
    questions,
    createdByUserId: userId,
  });

  await recordRequestAudit({
    request: req,
    module: 'FOOD_SAFETY',
    action: 'CREATE_HYGIENE_TEMPLATE',
    entityType: 'HYGIENE_TEMPLATE',
    entityId: template.templateId,
    after: template.toObject(),
    result: 'SUCCESS',
  });

  return res.status(201).json({
    success: true,
    data: { template },
    correlationId: req.correlationId || null,
  });
});

const listInspections = asyncHandler(async (req, res) => {
  const { organisationId } = req.auth;
  const requestedCafe = req.query.cafeId ? req.query.cafeId.trim().toUpperCase() : null;
  if (requestedCafe) assertCafeAccess(req, requestedCafe);

  const query = { organisationId: organisationId.toUpperCase() };
  if (requestedCafe) query.cafeId = requestedCafe;
  if (req.query.overallResult) query.overallResult = req.query.overallResult;

  const inspections = await HygieneInspection.find(query).sort({ inspectedAt: -1 }).limit(100).lean();

  return res.status(200).json({
    success: true,
    data: { inspections },
    correlationId: req.correlationId || null,
  });
});

const submitInspection = asyncHandler(async (req, res) => {
  const { organisationId, userId } = req.auth;
  const { cafeId, templateId, responses } = req.body || {};

  assertCafeAccess(req, cafeId);

  const inspection = await FoodSafetyGovernanceService.submitHygieneInspection({
    organisationId,
    cafeId,
    templateId,
    inspectedByUserId: userId,
    responses,
    metadata: {
      deviceId: req.headers['x-device-id'] || null,
      correlationId: req.correlationId || null,
    },
  });

  await recordRequestAudit({
    request: req,
    module: 'FOOD_SAFETY',
    action: 'SUBMIT_HYGIENE_INSPECTION',
    entityType: 'HYGIENE_INSPECTION',
    entityId: inspection.inspectionId,
    after: inspection.toObject(),
    result: 'SUCCESS',
  });

  return res.status(201).json({
    success: true,
    data: { inspection },
    correlationId: req.correlationId || null,
  });
});

const updateInspectionAction = asyncHandler(async (req, res) => {
  const { organisationId, userId } = req.auth;
  const { inspectionId, actionId } = req.params;
  const { actionTaken, evidenceAttachmentId, verified, escalateToCapa } = req.body || {};

  const inspection = await FoodSafetyGovernanceService.updateHygieneAction({
    organisationId,
    inspectionId,
    actionId,
    actionTaken,
    evidenceAttachmentId,
    verifiedByUserId: verified ? userId : null,
    escalateToCapa,
    performedByUserId: userId,
  });

  return res.status(200).json({
    success: true,
    data: { inspection },
    correlationId: req.correlationId || null,
  });
});

// ── 4. Temperature Controls ───────────────────────────────────────────────────
const listTemperatureRules = asyncHandler(async (req, res) => {
  const { organisationId } = req.auth;
  const requestedCafe = req.query.cafeId ? req.query.cafeId.trim().toUpperCase() : null;
  if (requestedCafe) assertCafeAccess(req, requestedCafe);

  const rules = await FoodSafetyGovernanceService.listTemperatureRules({
    organisationId,
    cafeId: requestedCafe,
  });

  return res.status(200).json({
    success: true,
    data: { rules },
    correlationId: req.correlationId || null,
  });
});

const listTemperatureLogs = asyncHandler(async (req, res) => {
  const { organisationId } = req.auth;
  const requestedCafe = req.query.cafeId ? req.query.cafeId.trim().toUpperCase() : null;
  if (requestedCafe) assertCafeAccess(req, requestedCafe);

  const logs = await FoodSafetyGovernanceService.listTemperatureLogs({
    organisationId,
    cafeId: requestedCafe,
    limit: req.query.limit ? parseInt(req.query.limit, 10) : 100,
  });

  return res.status(200).json({
    success: true,
    data: { logs },
    correlationId: req.correlationId || null,
  });
});

// ── 5. FoSTaC & Supervisor Records ───────────────────────────────────────────
const listFoSTaC = asyncHandler(async (req, res) => {
  const { organisationId } = req.auth;
  const requestedCafe = req.query.cafeId ? req.query.cafeId.trim().toUpperCase() : null;
  if (requestedCafe) assertCafeAccess(req, requestedCafe);

  const supervisors = await FoodSafetyGovernanceService.listFoSTaCSupervisors({
    organisationId,
    cafeId: requestedCafe,
  });

  return res.status(200).json({
    success: true,
    data: { supervisors },
    correlationId: req.correlationId || null,
  });
});

// ── 6. Traceability Graph & Gap Register ───────────────────────────────────────
const traceForward = asyncHandler(async (req, res) => {
  const { organisationId } = req.auth;
  const { lotId, supplierLot, itemId } = req.query;

  const result = await FoodSafetyGovernanceService.traceForward({
    organisationId,
    lotId,
    supplierLot,
    itemId,
  });

  return res.status(200).json({
    success: true,
    data: result,
    correlationId: req.correlationId || null,
  });
});

const traceBackward = asyncHandler(async (req, res) => {
  const { organisationId } = req.auth;
  const { billId, menuItemId } = req.query;

  const result = await FoodSafetyGovernanceService.traceBackward({
    organisationId,
    billId,
    menuItemId,
  });

  return res.status(200).json({
    success: true,
    data: result,
    correlationId: req.correlationId || null,
  });
});

const listTraceabilityGaps = asyncHandler(async (req, res) => {
  const { organisationId } = req.auth;
  const requestedCafe = req.query.cafeId ? req.query.cafeId.trim().toUpperCase() : null;
  if (requestedCafe) assertCafeAccess(req, requestedCafe);

  const gaps = await FoodSafetyGovernanceService.listTraceabilityGaps({
    organisationId,
    cafeId: requestedCafe,
  });

  return res.status(200).json({
    success: true,
    data: { gaps },
    correlationId: req.correlationId || null,
  });
});

const registerTraceabilityGap = asyncHandler(async (req, res) => {
  const { organisationId, userId } = req.auth;
  const { cafeId, gapType, affectedEntity, severity, description, dueDate } = req.body || {};

  assertCafeAccess(req, cafeId);

  const gap = await FoodSafetyGovernanceService.registerTraceabilityGap({
    organisationId,
    cafeId,
    gapType,
    affectedEntity,
    severity,
    description,
    assignedOwnerUserId: userId,
    dueDate,
  });

  return res.status(201).json({
    success: true,
    data: { gap },
    correlationId: req.correlationId || null,
  });
});

// ── 7. Food Recall Master & Lifecycle ──────────────────────────────────────────
const listRecalls = asyncHandler(async (req, res) => {
  const { organisationId } = req.auth;
  const recalls = await FoodSafetyGovernanceService.listRecalls({
    organisationId,
    status: req.query.status || null,
  });

  return res.status(200).json({
    success: true,
    data: { recalls },
    correlationId: req.correlationId || null,
  });
});

const initiateRecall = asyncHandler(async (req, res) => {
  const { organisationId, userId } = req.auth;
  const {
    title,
    reason,
    source,
    severity,
    affectedCafes,
    cafeIds,
    supplierId,
    supplierName,
    ingredientId,
    ingredientName,
    sku,
    lotBatch,
    affectedMenuItems,
    regulatoryApplicability,
    foscosFilingStatus,
    foscosRegulatoryReference,
  } = req.body || {};

  const targetCafes = affectedCafes || cafeIds;
  if (Array.isArray(targetCafes)) {
    for (const c of targetCafes) assertCafeAccess(req, c);
  }

  const recall = await FoodSafetyGovernanceService.initiateRecall({
    organisationId,
    title,
    reason,
    source,
    severity,
    affectedCafes: targetCafes,
    supplierId,
    supplierName,
    ingredientId,
    ingredientName,
    sku,
    lotBatch,
    affectedMenuItems,
    regulatoryApplicability,
    foscosFilingStatus,
    foscosRegulatoryReference,
    responsiblePersonUserId: userId,
  });

  await recordRequestAudit({
    request: req,
    module: 'FOOD_SAFETY',
    action: 'INITIATE_FOOD_RECALL',
    entityType: 'FOOD_RECALL',
    entityId: recall.recallId,
    after: recall.toObject(),
    result: 'SUCCESS',
    riskClassification: 'CRITICAL',
  });

  return res.status(201).json({
    success: true,
    data: { recall },
    correlationId: req.correlationId || null,
  });
});

const transitionRecallState = asyncHandler(async (req, res) => {
  const { organisationId, userId } = req.auth;
  const { recallId } = req.params;
  const { nextState, rationale } = req.body || {};

  const recall = await FoodSafetyGovernanceService.transitionRecallState({
    organisationId,
    recallId,
    nextState,
    rationale,
    performedByUserId: userId,
  });

  await recordRequestAudit({
    request: req,
    module: 'FOOD_SAFETY',
    action: 'TRANSITION_RECALL_STATE',
    entityType: 'FOOD_RECALL',
    entityId: recallId,
    after: recall.toObject(),
    result: 'SUCCESS',
    riskClassification: 'HIGH',
  });

  return res.status(200).json({
    success: true,
    data: { recall },
    correlationId: req.correlationId || null,
  });
});

const updateStockDispositions = asyncHandler(async (req, res) => {
  const { organisationId, userId } = req.auth;
  const { recallId } = req.params;
  const { dispositions } = req.body || {};

  const recall = await FoodSafetyGovernanceService.updateStockDispositions({
    organisationId,
    recallId,
    dispositions: Array.isArray(dispositions) ? dispositions : [],
    performedByUserId: userId,
  });

  return res.status(200).json({
    success: true,
    data: { recall },
    correlationId: req.correlationId || null,
  });
});

const updateFoscosFilingStatus = asyncHandler(async (req, res) => {
  const { organisationId, userId } = req.auth;
  const { recallId } = req.params;
  const {
    regulatoryApplicability,
    regulatoryAssessment,
    foscosFilingStatus,
    filingCompletedDate,
    foscosRecallReference,
    filingEvidenceAttachmentId,
    filingResponsiblePerson,
    authorityNotes,
    closureExemptionReason,
    closureExemptionAuthorizedBy,
  } = req.body || {};

  const recall = await FoodSafetyGovernanceService.updateFoscosFilingStatus({
    organisationId,
    recallId,
    regulatoryApplicability,
    regulatoryAssessment,
    foscosFilingStatus,
    filingCompletedDate,
    foscosRecallReference,
    filingEvidenceAttachmentId,
    filingResponsiblePerson,
    authorityNotes,
    closureExemptionReason,
    closureExemptionAuthorizedBy,
    performedByUserId: userId,
  });

  await recordRequestAudit({
    request: req,
    module: 'FOOD_SAFETY',
    action: 'UPDATE_FOSCOS_FILING',
    entityType: 'FOOD_RECALL',
    entityId: recallId,
    after: recall.toObject(),
    result: 'SUCCESS',
    riskClassification: 'CRITICAL',
  });

  return res.status(200).json({
    success: true,
    data: { recall },
    correlationId: req.correlationId || null,
  });
});

const recordRecallCommunication = asyncHandler(async (req, res) => {
  const { organisationId, userId } = req.auth;
  const { recallId } = req.params;
  const {
    communicationType,
    audience,
    authority,
    contentReference,
    evidenceAttachmentId,
    responsiblePerson,
    communicatedAt,
  } = req.body || {};

  const recall = await FoodSafetyGovernanceService.recordRecallCommunication({
    organisationId,
    recallId,
    communicationType,
    audience,
    authority,
    contentReference,
    evidenceAttachmentId,
    responsiblePerson: responsiblePerson || userId,
    communicatedAt,
    performedByUserId: userId,
  });

  return res.status(201).json({
    success: true,
    data: { recall },
    correlationId: req.correlationId || null,
  });
});

const mapPotentiallyAffectedSales = asyncHandler(async (req, res) => {
  const { organisationId, userId } = req.auth;
  const { recallId } = req.params;
  const { sales } = req.body || {};

  const recall = await FoodSafetyGovernanceService.mapPotentiallyAffectedSales({
    organisationId,
    recallId,
    sales: Array.isArray(sales) ? sales : [],
    performedByUserId: userId,
  });

  return res.status(200).json({
    success: true,
    data: { recall },
    correlationId: req.correlationId || null,
  });
});

// ── 8. CAPA Engine ────────────────────────────────────────────────────────────
const listCapas = asyncHandler(async (req, res) => {
  const { organisationId } = req.auth;
  const requestedCafe = req.query.cafeId ? req.query.cafeId.trim().toUpperCase() : null;
  if (requestedCafe) assertCafeAccess(req, requestedCafe);

  const capas = await FoodSafetyGovernanceService.listCapas({
    organisationId,
    cafeId: requestedCafe,
    status: req.query.status || null,
  });

  return res.status(200).json({
    success: true,
    data: { capas },
    correlationId: req.correlationId || null,
  });
});

const createCapa = asyncHandler(async (req, res) => {
  const { organisationId, userId } = req.auth;
  const { cafeId, source, sourceReferenceId, title, findingDescription, rootCauseCategory, rootCauseAnalysis, rootCauseConfirmedByHuman, correctiveActionPlan, preventiveActionPlan, assignedOwnerUserId, dueDate, evidenceAttachmentIds } = req.body || {};

  assertCafeAccess(req, cafeId);

  const capa = await FoodSafetyGovernanceService.createCapa({
    organisationId,
    cafeId,
    source,
    sourceReferenceId,
    title,
    findingDescription,
    rootCauseCategory,
    rootCauseAnalysis,
    rootCauseConfirmedByHuman,
    correctiveActionPlan,
    preventiveActionPlan,
    assignedOwnerUserId: assignedOwnerUserId || userId,
    dueDate,
    evidenceAttachmentIds,
    performedByUserId: userId,
  });

  await recordRequestAudit({
    request: req,
    module: 'FOOD_SAFETY',
    action: 'CREATE_CAPA',
    entityType: 'CAPA',
    entityId: capa.capaId,
    after: capa.toObject(),
    result: 'SUCCESS',
  });

  return res.status(201).json({
    success: true,
    data: { capa },
    correlationId: req.correlationId || null,
  });
});

const verifyCapa = asyncHandler(async (req, res) => {
  const { organisationId, userId } = req.auth;
  const { capaId } = req.params;
  const { verificationNotes } = req.body || {};

  const capa = await FoodSafetyGovernanceService.verifyAndCloseCapa({
    organisationId,
    capaId,
    verificationNotes,
    verifiedByUserId: userId,
  });

  await recordRequestAudit({
    request: req,
    module: 'FOOD_SAFETY',
    action: 'VERIFY_AND_CLOSE_CAPA',
    entityType: 'CAPA',
    entityId: capaId,
    after: capa.toObject(),
    result: 'SUCCESS',
  });

  return res.status(200).json({
    success: true,
    data: { capa },
    correlationId: req.correlationId || null,
  });
});

module.exports = {
  getDashboardOverview,
  listLicences,
  registerLicence,
  updateLicenceStatus,
  listTemplates,
  createTemplate,
  listInspections,
  submitInspection,
  updateInspectionAction,
  listTemperatureRules,
  listTemperatureLogs,
  listFoSTaC,
  traceForward,
  traceBackward,
  listTraceabilityGaps,
  registerTraceabilityGap,
  listRecalls,
  initiateRecall,
  transitionRecallState,
  updateFoscosFilingStatus,
  recordRecallCommunication,
  mapPotentiallyAffectedSales,
  updateStockDispositions,
  listCapas,
  createCapa,
  verifyCapa,
};
