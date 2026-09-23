'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — FOOD SAFETY GOVERNANCE SERVICE (STAGE 01)
 * ============================================================================
 * Central business logic authority for Food Safety, Hygiene Checklists,
 * Temperature Controls, FoSTaC Supervision, Forward/Backward Traceability,
 * Food Recall Master with 8-state server validation, and CAPA Engine.
 */

const { FoodSafetyRegistration, REGULATORY_STATUSES, INTERNAL_COMPLIANCE_STATES } = require('../models/FoodSafetyRegistration');
const { HygieneChecklistTemplate } = require('../models/HygieneChecklistTemplate');
const { HygieneInspection } = require('../models/HygieneInspection');
const { FoodRecallCase, VALID_TRANSITIONS } = require('../models/FoodRecallCase');
const { CapaRecord } = require('../models/CapaRecord');
const { TraceabilityGap } = require('../models/TraceabilityGap');
const { FoodSafetyIncident } = require('../models/FoodSafetyIncident');
const { FoodSafetyTemperatureRule } = require('../models/FoodSafetyTemperatureRule');
const { TemperatureLog } = require('../models/TemperatureLog');
const { InventoryLot } = require('../models/InventoryLot');
const { EmployeeTraining } = require('../models/EmployeeTraining');
const { Bill } = require('../models/Bill');
const { Recipe } = require('../models/Recipe');
const { MenuItem } = require('../models/MenuItem');
const { PurchaseOrder } = require('../models/PurchaseOrder');
const { StockMovement } = require('../models/StockMovement');
const { AuditEvent } = require('../models/AuditEvent');
const { ApiError } = require('../utils/ApiError');

class FoodSafetyGovernanceService {
  // ===========================================================================
  // 1. FOOD SAFETY REGISTRATION & LICENCE GOVERNANCE (2026 PERPETUAL REGIME)
  // ===========================================================================

  static async registerLicence({
    organisationId,
    cafeId,
    fssaiNumber,
    registrationType = 'STATE_LICENSE',
    businessCategory = 'Food Service / Catering Establishments',
    authority = 'Food Safety and Standards Authority of India (FSSAI)',
    regimeVersion = '2026_AMENDMENT_PERPETUAL',
    isPerpetual = true,
    issueDate,
    legacyExpiryDate = null,
    responsiblePerson,
    complianceOwner,
    conditions = [],
    certificateAttachmentId = null,
    nextComplianceDate = null,
    performedByUserId,
  }) {
    if (!organisationId || !cafeId || !fssaiNumber || !issueDate || !responsiblePerson || !complianceOwner) {
      throw new ApiError(400, 'MISSING_MANDATORY_FIELDS', 'Missing mandatory food safety registration fields.');
    }

    // Validate 14-digit FSSAI Number
    if (!/^\d{14}$/.test(String(fssaiNumber).trim())) {
      throw new ApiError(400, 'INVALID_FSSAI_NUMBER', 'FSSAI licence/registration must be an exact 14-digit numeric string.');
    }

    // Invariant: If operating under 2026 Perpetual Validity Regime, expiry date must NOT be fabricated
    if (isPerpetual && legacyExpiryDate != null) {
      throw new ApiError(
        400,
        'PROHIBITED_EXPIRY_DATE',
        'Expiry dates are prohibited under the 2026 FSSAI perpetual validity regime. Perpetual licences do not expire unless suspended, cancelled, or surrendered.'
      );
    }

    const registrationId = `FSSAI-${String(cafeId).toUpperCase()}-${Date.now().toString().slice(-6)}`;

    const registration = await FoodSafetyRegistration.create({
      registrationId,
      organisationId: organisationId.toUpperCase(),
      cafeId: cafeId.toUpperCase(),
      fssaiNumber: String(fssaiNumber).trim(),
      registrationType,
      businessCategory,
      authority,
      regimeVersion,
      isPerpetual: Boolean(isPerpetual),
      issueDate: new Date(issueDate),
      legacyExpiryDate: isPerpetual ? null : (legacyExpiryDate ? new Date(legacyExpiryDate) : null),
      status: 'ACTIVE',
      responsiblePerson: String(responsiblePerson).trim(),
      complianceOwner: String(complianceOwner).trim(),
      conditions: Array.isArray(conditions) ? conditions : [],
      certificateAttachmentId: certificateAttachmentId || null,
      lastVerificationDate: new Date(),
      nextComplianceDate: nextComplianceDate ? new Date(nextComplianceDate) : null,
      auditHistory: [
        {
          action: 'REGISTER_LICENCE',
          performedBy: performedByUserId || 'SYSTEM',
          performedAt: new Date(),
          previousStatus: null,
          newStatus: 'ACTIVE',
          reason: 'Initial registration under 2026 FSSAI framework',
        },
      ],
    });

    return registration;
  }

  static async updateLicenceStatus({
    organisationId,
    registrationId,
    newStatus,
    reason,
    performedByUserId,
    performedByRole = 'OWNER',
    regulatorOrderReference = null,
  }) {
    if (!REGULATORY_STATUSES.includes(newStatus)) {
      throw new ApiError(400, 'INVALID_STATUS', `Status must be one of: ${REGULATORY_STATUSES.join(', ')}`);
    }

    const reg = await FoodSafetyRegistration.findOne({
      organisationId: organisationId.toUpperCase(),
      registrationId: registrationId.toUpperCase(),
    });

    if (!reg) {
      throw new ApiError(404, 'NOT_FOUND', 'Food safety registration record not found.');
    }

    const oldStatus = reg.status;
    if (performedByRole && performedByRole !== 'OWNER' && performedByRole !== 'MASTER') {
      throw new ApiError(403, 'FORBIDDEN', 'Unauthorized role denied: Only OWNER or MASTER may modify official FSSAI regulatory licence status.');
    }

    if ((newStatus === 'SUSPENDED' || newStatus === 'CANCELLED') && !regulatorOrderReference) {
      throw new ApiError(400, 'AUTHORITATIVE_REGULATOR_EVIDENCE_REQUIRED', 'Official regulatory suspension or cancellation requires verified regulator order/reference or FoSCoS notice.');
    }

    reg.status = newStatus;
    if (regulatorOrderReference) {
      reg.regulatorOrderReference = String(regulatorOrderReference).trim();
    }

    reg.auditHistory.push({
      action: 'REGULATORY_STATUS_CHANGE',
      performedBy: performedByUserId || 'SYSTEM',
      performedAt: new Date(),
      previousStatus: oldStatus,
      newStatus,
      reason: reason || 'Authoritative regulator status update backed by official evidence',
    });

    await reg.save();
    return reg;
  }

  static async updateInternalComplianceState({
    organisationId,
    registrationId,
    internalComplianceState,
    reason,
    performedByUserId,
  }) {
    if (!INTERNAL_COMPLIANCE_STATES.includes(internalComplianceState)) {
      throw new ApiError(400, 'INVALID_COMPLIANCE_STATE', `Compliance state must be one of: ${INTERNAL_COMPLIANCE_STATES.join(', ')}`);
    }

    const reg = await FoodSafetyRegistration.findOne({
      organisationId: organisationId.toUpperCase(),
      registrationId: registrationId.toUpperCase(),
    });

    if (!reg) {
      throw new ApiError(404, 'NOT_FOUND', 'Food safety registration record not found.');
    }

    const oldState = reg.internalComplianceState;
    reg.internalComplianceState = internalComplianceState;
    reg.auditHistory.push({
      action: 'INTERNAL_COMPLIANCE_STATE_CHANGE',
      performedBy: performedByUserId || 'SYSTEM',
      performedAt: new Date(),
      previousStatus: oldState,
      newStatus: internalComplianceState,
      reason: reason || 'Internal compliance state transition (FSSAI regulatory licence status remains unchanged)',
    });

    await reg.save();
    return reg;
  }

  static getSchedule4HygieneMapping({ kindOfBusiness = 'FOOD_SERVICE_RESTAURANT_CAFE', licenceType = 'STATE_LICENSE', hasMilkProcessing = false } = {}) {
    const kob = String(kindOfBusiness).toUpperCase();
    if (kob.includes('PETTY') || licenceType === 'REGISTRATION') {
      return {
        schedule4Part: 'PART_I',
        title: 'Schedule 4 Part I: General Hygienic and Sanitary Practices for Petty Food Business Operators applying for Registration',
        applicable: true,
        rationale: 'Mandatory hygiene baseline for Petty Food Business registration tier under Section 31(1)',
      };
    }
    if (hasMilkProcessing && (kob.includes('MILK') || kob.includes('DAIRY'))) {
      return {
        schedule4Part: 'PART_III',
        title: 'Schedule 4 Part III: Specific Hygienic and Sanitary Practices for Milk & Milk Products',
        applicable: true,
        rationale: 'Specific dairy processing standard applied only where dedicated commercial milk processing operations exist',
      };
    }
    if (kob.includes('MANUFACTURING') || kob.includes('COMMISSARY_FACTORY')) {
      return {
        schedule4Part: 'PART_II',
        title: 'Schedule 4 Part II: General Hygienic and Sanitary Practices for Food Manufacturing/Processing',
        applicable: true,
        rationale: 'Mandatory for centralized production commissaries exceeding food service preparation limits',
      };
    }
    // Default for Zamorin café & restaurant operations
    return {
      schedule4Part: 'PART_V',
      title: 'Schedule 4 Part V: Specific Hygienic and Sanitary Practices for Catering / Food Service Establishments',
      applicable: true,
      rationale: 'Primary statutory food service and restaurant hygiene baseline for Zamorin Café operations',
    };
  }

  static calculateSupervisoryRatio({ foodHandlersCount = 0, licenceType = 'STATE_LICENSE', certifiedSupervisorsCount = 0 } = {}) {
    if (licenceType === 'REGISTRATION') {
      return {
        licenceType: 'REGISTRATION',
        statutoryRatioApplies: false,
        requiredSupervisors: 0,
        currentSupervisors: certifiedSupervisorsCount,
        compliant: true,
        rationale: 'Registration-class Petty FBOs are encouraged to undergo basic FoSTaC, but mandatory 1:25 statutory quota applies to State/Central Licences.',
      };
    }

    if (foodHandlersCount <= 0) {
      return {
        licenceType,
        statutoryRatioApplies: true,
        requiredSupervisors: 0,
        currentSupervisors: certifiedSupervisorsCount,
        compliant: true,
        rationale: 'Premises has zero active food handlers registered.',
      };
    }

    const requiredSupervisors = Math.ceil(foodHandlersCount / 25);
    const compliant = certifiedSupervisorsCount >= requiredSupervisors;

    return {
      licenceType,
      statutoryRatioApplies: true,
      foodHandlersCount,
      requiredSupervisors,
      currentSupervisors: certifiedSupervisorsCount,
      compliant,
      ratioRule: '1 trained and certified Food Safety Supervisor per 25 food handlers or part thereof per premises',
      source: 'FSSAI FoSTaC Standardized Operational Guidelines (Procedure dated 5 August 2026)',
    };
  }

  static async listLicences({ organisationId, cafeId = null, status = null }) {
    const query = { organisationId: organisationId.toUpperCase() };
    if (cafeId) query.cafeId = cafeId.toUpperCase();
    if (status) query.status = status;

    return await FoodSafetyRegistration.find(query).sort({ createdAt: -1 }).lean();
  }

  // ===========================================================================
  // 2. HYGIENE CHECKLIST ENGINE & TEMPLATES
  // ===========================================================================

  static async createChecklistTemplate({
    organisationId,
    templateId,
    title,
    frequency,
    classification = 'STATUTORY_SCHEDULE_4',
    applicableCafes = [],
    applicableRoles = ['CAFE_ADMIN', 'STAFF'],
    questions,
    createdByUserId,
  }) {
    if (!organisationId || !templateId || !title || !frequency || !Array.isArray(questions) || questions.length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Template ID, title, frequency, and at least one question are required.');
    }

    const cleanOrg = organisationId.toUpperCase();
    const cleanId = templateId.toUpperCase();

    // Check existing templates to calculate version (immutability rule)
    const latest = await HygieneChecklistTemplate.findOne({
      organisationId: cleanOrg,
      templateId: cleanId,
    }).sort({ version: -1 });

    const newVersion = latest ? latest.version + 1 : 1;

    // If superseding previous version, mark it SUPERSEDED
    if (latest && latest.status === 'ACTIVE') {
      latest.status = 'SUPERSEDED';
      latest.supersededDate = new Date();
      await latest.save();
    }

    const template = await HygieneChecklistTemplate.create({
      templateId: cleanId,
      version: newVersion,
      organisationId: cleanOrg,
      title: String(title).trim(),
      frequency,
      classification,
      applicableCafes: Array.isArray(applicableCafes) ? applicableCafes.map((c) => c.toUpperCase()) : [],
      applicableRoles,
      questions,
      effectiveDate: new Date(),
      status: 'ACTIVE',
      createdByUserId,
    });

    return template;
  }

  static async submitHygieneInspection({
    organisationId,
    cafeId,
    templateId,
    inspectedByUserId,
    responses,
    metadata = {},
  }) {
    if (!organisationId || !cafeId || !templateId || !inspectedByUserId || !Array.isArray(responses)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Missing required inspection execution fields.');
    }

    const cleanOrg = organisationId.toUpperCase();
    const cleanCafe = cafeId.toUpperCase();
    const cleanTplId = templateId.toUpperCase();

    // Find active template
    const template = await HygieneChecklistTemplate.findOne({
      organisationId: cleanOrg,
      templateId: cleanTplId,
      status: 'ACTIVE',
    });

    if (!template) {
      throw new ApiError(404, 'TEMPLATE_NOT_FOUND', `Active checklist template ${cleanTplId} not found.`);
    }

    // Verify café applicability
    if (template.applicableCafes.length > 0 && !template.applicableCafes.includes(cleanCafe)) {
      throw new ApiError(403, 'CAFE_NOT_APPLICABLE', `Template ${cleanTplId} is not assigned to café ${cleanCafe}.`);
    }

    // Evaluate responses and detect exceptions
    const evaluatedResponses = [];
    const correctiveActions = [];
    let criticalFail = false;
    let anyFail = false;

    for (const item of responses) {
      const q = template.questions.find((question) => question.questionId === item.questionId);
      if (!q) continue;

      let isException = false;
      const respVal = item.response;

      if (q.responseType === 'PASS_FAIL_NA') {
        if (respVal === 'FAIL') {
          isException = true;
          anyFail = true;
          if (q.criticality === 'CRITICAL') criticalFail = true;
        }
      } else if (q.responseType === 'NUMERIC_VALUE' || q.responseType === 'TEMPERATURE_C') {
        const numVal = Number(respVal);
        if (q.exceptionThreshold?.min != null && numVal < q.exceptionThreshold.min) isException = true;
        if (q.exceptionThreshold?.max != null && numVal > q.exceptionThreshold.max) isException = true;
        if (isException) {
          anyFail = true;
          if (q.criticality === 'CRITICAL') criticalFail = true;
        }
      }

      // Mandatory evidence check
      if (q.mandatoryEvidence && !item.evidenceAttachmentId && isException) {
        throw new ApiError(400, 'MANDATORY_EVIDENCE_MISSING', `Evidence attachment is mandatory for exception on ${q.title}`);
      }

      evaluatedResponses.push({
        questionId: q.questionId,
        response: respVal,
        isException,
        notes: item.notes || '',
        evidenceAttachmentId: item.evidenceAttachmentId || null,
      });

      if (isException) {
        const actionId = `ACT-${cleanCafe}-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 100)}`;
        correctiveActions.push({
          actionId,
          finding: `Hygiene breach on ${q.title}: response ${respVal}`,
          severity: q.criticality === 'CRITICAL' ? 'CRITICAL' : q.criticality === 'MAJOR' ? 'MAJOR' : 'MINOR',
          assignedToUserId: item.assignedToUserId || inspectedByUserId,
          dueDate: item.actionDueDate ? new Date(item.actionDueDate) : new Date(Date.now() + 24 * 3600000),
          actionPlan: item.actionPlan || 'Immediate sanitisation and re-inspection required.',
          status: 'ASSIGNED',
        });
      }
    }

    const overallResult = criticalFail ? 'CRITICAL_FAIL' : anyFail ? 'FAILED_WITH_ACTION' : 'PASSED';
    const status = anyFail ? 'ACTION_REQUIRED' : 'COMPLETED';

    const inspectionId = `HYG-${cleanCafe}-${Date.now().toString().slice(-7)}`;

    const inspection = await HygieneInspection.create({
      inspectionId,
      templateId: cleanTplId,
      templateVersion: template.version,
      organisationId: cleanOrg,
      cafeId: cleanCafe,
      inspectedAt: new Date(),
      inspectedByUserId,
      responses: evaluatedResponses,
      overallResult,
      correctiveActions,
      status,
      metadata,
      auditHistory: [
        {
          action: 'EXECUTE_INSPECTION',
          performedBy: inspectedByUserId,
          performedAt: new Date(),
          notes: `Inspection completed with overall result: ${overallResult}`,
        },
      ],
    });

    if (criticalFail || anyFail) {
      await FoodSafetyRegistration.updateOne(
        { organisationId: cleanOrg, cafeId: cleanCafe, status: 'ACTIVE' },
        {
          $set: {
            internalComplianceState: criticalFail ? 'SERIOUS_NONCOMPLIANCE' : 'ACTION_REQUIRED',
          },
          $push: {
            auditHistory: {
              action: 'INSPECTION_COMPLIANCE_FLAG',
              performedBy: inspectedByUserId,
              performedAt: new Date(),
              reason: `Internal hygiene failure detected: ${overallResult}. Legal FSSAI licence status remains ACTIVE.`,
            },
          },
        }
      );
    }

    return inspection;
  }

  static async updateHygieneAction({
    organisationId,
    inspectionId,
    actionId,
    actionTaken,
    evidenceAttachmentId = null,
    verifiedByUserId = null,
    escalateToCapa = false,
    performedByUserId,
  }) {
    const inspection = await HygieneInspection.findOne({
      organisationId: organisationId.toUpperCase(),
      inspectionId: inspectionId.toUpperCase(),
    });

    if (!inspection) throw new ApiError(404, 'NOT_FOUND', 'Hygiene inspection record not found.');

    const action = inspection.correctiveActions.find((a) => a.actionId === actionId);
    if (!action) throw new ApiError(404, 'ACTION_NOT_FOUND', 'Corrective action item not found in inspection.');

    if (actionTaken) {
      action.actionTaken = String(actionTaken).trim();
      action.actionTakenAt = new Date();
      action.actionEvidenceAttachmentId = evidenceAttachmentId || action.actionEvidenceAttachmentId;
      action.status = 'ACTION_TAKEN';
    }

    if (verifiedByUserId) {
      action.verifiedByUserId = verifiedByUserId;
      action.verifiedAt = new Date();
      action.status = 'CLOSED';
    }

    if (escalateToCapa && !action.escalatedCapaId) {
      const capa = await this.createCapa({
        organisationId,
        cafeId: inspection.cafeId,
        source: 'HYGIENE_CHECKLIST',
        sourceReferenceId: `${inspectionId}:${actionId}`,
        title: `CAPA from Hygiene Failure: ${action.finding}`,
        findingDescription: action.finding,
        rootCauseCategory: 'CLEANING_PROTOCOL',
        rootCauseAnalysis: 'Systematic failure detected during routine hygiene inspection.',
        rootCauseConfirmedByHuman: true,
        correctiveActionPlan: action.actionPlan,
        preventiveActionPlan: 'Implement updated sanitisation checklist with supervisor verification.',
        assignedOwnerUserId: action.assignedToUserId,
        dueDate: action.dueDate,
        evidenceAttachmentIds: action.actionEvidenceAttachmentId ? [action.actionEvidenceAttachmentId] : [],
        performedByUserId,
      });

      action.escalatedCapaId = capa.capaId;
      action.status = 'ESCALATED';
    }

    // Check if all actions are closed
    const allClosed = inspection.correctiveActions.every((a) => a.status === 'CLOSED' || a.status === 'ESCALATED');
    if (allClosed) inspection.status = 'ALL_ACTIONS_CLOSED';

    inspection.auditHistory.push({
      action: 'UPDATE_CORRECTIVE_ACTION',
      performedBy: performedByUserId || 'SYSTEM',
      performedAt: new Date(),
      notes: `Action ${actionId} updated to ${action.status}`,
    });

    await inspection.save();
    return inspection;
  }

  // ===========================================================================
  // 3. TEMPERATURE EXCURSION & POLICY RECONCILIATION
  // ===========================================================================

  static async listTemperatureRules({ organisationId, cafeId = null }) {
    const query = { organisationId: organisationId.toUpperCase(), status: 'ACTIVE' };
    if (cafeId) query.$or = [{ cafeId: cafeId.toUpperCase() }, { cafeId: null }];
    return await FoodSafetyTemperatureRule.find(query).lean();
  }

  static async listTemperatureLogs({ organisationId, cafeId = null, limit = 100 }) {
    const query = { organisationId: organisationId.toUpperCase() };
    if (cafeId) query.cafeId = cafeId.toUpperCase();
    return await TemperatureLog.find(query).sort({ recordedAt: -1 }).limit(limit).lean();
  }

  // ===========================================================================
  // 4. FoSTaC & SUPERVISOR PROCEDURE (5 AUG 2026 PROCEDURE BASELINE)
  // ===========================================================================

  static async listFoSTaCSupervisors({ organisationId, cafeId = null }) {
    const query = {
      organisationId: organisationId.toUpperCase(),
      trainingType: 'FOSTAC',
    };
    if (cafeId) query.cafeId = cafeId.toUpperCase();

    const records = await EmployeeTraining.find(query).sort({ createdAt: -1 }).lean();
    return records;
  }

  // ===========================================================================
  // 5. TRACEABILITY GRAPH (FORWARD & BACKWARD) & GAP REGISTER
  // ===========================================================================

  static async traceForward({ organisationId, lotId = null, supplierLot = null, itemId = null }) {
    if (!organisationId) throw new ApiError(400, 'ORG_REQUIRED', 'Organisation ID is required.');
    const cleanOrg = organisationId.toUpperCase();

    const lotFilter = { organisationId: cleanOrg };
    if (lotId) lotFilter.lotId = lotId.toUpperCase();
    if (supplierLot) lotFilter.supplierLot = supplierLot;
    if (itemId) lotFilter.itemId = itemId.toUpperCase();

    const matchingLots = await InventoryLot.find(lotFilter).lean();
    const lotIds = matchingLots.map((l) => l.lotId);

    // 1. Identify Stock Locations & Cafes
    const cafeIds = Array.from(new Set(matchingLots.map((l) => l.cafeId).filter(Boolean)));

    // 2. Identify Stock Movements
    const movements = lotIds.length > 0
      ? await StockMovement.find({ organisationId: cleanOrg, lotId: { $in: lotIds } }).sort({ createdAt: -1 }).limit(100).lean()
      : [];

    // 3. Downstream Menu Recipes
    const itemIds = Array.from(new Set(matchingLots.map((l) => l.itemId).filter(Boolean)));
    const affectedRecipes = itemIds.length > 0
      ? await Recipe.find({ organisationId: cleanOrg, 'ingredients.itemId': { $in: itemIds } }).lean()
      : [];
    const recipeMenuItemIds = affectedRecipes.map((r) => r.menuItemId);

    // 4. Affected Customer Bills (Consuming either direct lot or recipe menu item)
    let affectedBills = [];
    if (lotIds.length > 0 || recipeMenuItemIds.length > 0) {
      const bills = await Bill.find({
        organisationId: cleanOrg,
        $or: [
          { 'lineItems.consumedLots.lotId': { $in: lotIds } },
          { 'lineItems.menuItemId': { $in: recipeMenuItemIds } },
        ],
      })
        .select('billId invoiceNumber cafeId createdAt totalPaisa lineItems')
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();

      // Mask customer PII
      affectedBills = bills.map((b) => ({
        billId: b.billId,
        invoiceNumber: b.invoiceNumber,
        cafeId: b.cafeId,
        createdAt: b.createdAt,
        totalPaisa: b.totalPaisa,
        lineItemsCount: b.lineItems?.length || 0,
        maskedCustomer: 'MASKED_FOR_PRIVACY',
      }));
    }

    // Determine Chain Confidence
    let chainStatus = 'COMPLETE';
    if (matchingLots.length === 0) chainStatus = 'UNAVAILABLE';
    else if (!matchingLots.every((l) => l.supplierLot) || affectedRecipes.length === 0) chainStatus = 'PARTIAL';

    return {
      chainStatus,
      lots: matchingLots,
      cafes: cafeIds,
      movements,
      recipes: affectedRecipes,
      bills: affectedBills,
    };
  }

  static async traceBackward({ organisationId, billId = null, menuItemId = null }) {
    if (!organisationId) throw new ApiError(400, 'ORG_REQUIRED', 'Organisation ID is required.');
    const cleanOrg = organisationId.toUpperCase();

    let targetMenuItemId = menuItemId;
    let targetCafeId = null;

    if (billId) {
      const bill = await Bill.findOne({ organisationId: cleanOrg, billId: billId.toUpperCase() }).lean();
      if (!bill) throw new ApiError(404, 'BILL_NOT_FOUND', `Bill ${billId} not found.`);
      targetCafeId = bill.cafeId;
      if (!targetMenuItemId && bill.lineItems?.length > 0) {
        targetMenuItemId = bill.lineItems[0].menuItemId;
      }
    }

    if (!targetMenuItemId) {
      throw new ApiError(400, 'MENU_ITEM_REQUIRED', 'A menuItemId or billId with line items is required.');
    }

    // 1. Trace to Recipe
    const recipe = await Recipe.findOne({ organisationId: cleanOrg, menuItemId: targetMenuItemId }).lean();
    const ingredients = recipe?.ingredients || [];

    // 2. Trace to Inventory Lots for each ingredient
    const ingredientItemIds = ingredients.map((i) => i.itemId);
    const lots = ingredientItemIds.length > 0
      ? await InventoryLot.find({
          organisationId: cleanOrg,
          itemId: { $in: ingredientItemIds },
          ...(targetCafeId ? { cafeId: targetCafeId } : {}),
        }).lean()
      : [];

    // 3. Trace to Purchase Orders / Suppliers
    const poNumbers = Array.from(new Set(lots.map((l) => l.poNumber).filter(Boolean)));
    const purchaseOrders = poNumbers.length > 0
      ? await PurchaseOrder.find({ organisationId: cleanOrg, poNumber: { $in: poNumbers } }).lean()
      : [];

    let chainStatus = 'COMPLETE';
    if (!recipe) chainStatus = 'UNAVAILABLE';
    else if (lots.length === 0 || purchaseOrders.length === 0) chainStatus = 'PARTIAL';

    return {
      chainStatus,
      menuItemId: targetMenuItemId,
      recipe,
      lots,
      purchaseOrders,
    };
  }

  static async listTraceabilityGaps({ organisationId, cafeId = null }) {
    const query = { organisationId: organisationId.toUpperCase() };
    if (cafeId) query.cafeId = cafeId.toUpperCase();
    return await TraceabilityGap.find(query).sort({ createdAt: -1 }).lean();
  }

  static async registerTraceabilityGap({
    organisationId,
    cafeId,
    gapType,
    affectedEntity,
    severity = 'MEDIUM',
    description,
    assignedOwnerUserId,
    dueDate = null,
  }) {
    const gapId = `GAP-${cafeId.toUpperCase()}-${Date.now().toString().slice(-6)}`;
    const gap = await TraceabilityGap.create({
      gapId,
      organisationId: organisationId.toUpperCase(),
      cafeId: cafeId.toUpperCase(),
      gapType,
      affectedEntity,
      severity,
      description,
      assignedOwnerUserId,
      dueDate: dueDate ? new Date(dueDate) : null,
      status: 'OPEN',
    });
    return gap;
  }

  // ===========================================================================
  // 6. FOOD RECALL MASTER & SERVER-VALIDATED 8-STATE LIFECYCLE
  // ===========================================================================

  static async initiateRecall({
    organisationId,
    title,
    reason,
    source = 'INTERNAL_INSPECTION',
    severity = 'CLASS_II_TEMPORARY_HEALTH',
    affectedCafes,
    supplierId = null,
    supplierName = '',
    ingredientId = null,
    ingredientName = '',
    sku = '',
    lotBatch = '',
    affectedMenuItems = [],
    regulatoryApplicability = 'NOT_ASSESSED',
    foscosFilingStatus = null,
    foscosRegulatoryReference = null, // Strictly optional
    responsiblePersonUserId,
  }) {
    if (!organisationId || !title || !reason || !Array.isArray(affectedCafes) || affectedCafes.length === 0 || !responsiblePersonUserId) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Mandatory recall parameters missing.');
    }

    const cleanOrg = organisationId.toUpperCase();
    const cleanCafes = affectedCafes.map((c) => c.toUpperCase());
    const recallId = `REC-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

    const determinedFilingStatus = foscosFilingStatus ||
      (regulatoryApplicability === 'MANDATORY_REGULATORY' ? 'REQUIRED_PENDING' : 'NOT_ASSESSED');

    const recall = await FoodRecallCase.create({
      recallId,
      foscosRegulatoryReference: foscosRegulatoryReference ? String(foscosRegulatoryReference).trim() : null,
      regulatoryApplicability,
      foscosFilingStatus: determinedFilingStatus,
      title: String(title).trim(),
      reason: String(reason).trim(),
      source,
      detectionDate: new Date(),
      severity,
      organisationId: cleanOrg,
      affectedCafes: cleanCafes,
      supplierId,
      supplierName,
      ingredientId,
      ingredientName,
      sku,
      lotBatch,
      affectedMenuItems,
      status: 'DETECTED',
      responsiblePersonUserId,
      auditHistory: [
        {
          fromState: null,
          toState: 'DETECTED',
          transitionedBy: responsiblePersonUserId,
          transitionedAt: new Date(),
          rationale: 'Initial recall detection and case registration',
        },
      ],
    });

    return recall;
  }

  static async transitionRecallState({
    organisationId,
    recallId,
    nextState,
    rationale = '',
    performedByUserId,
  }) {
    const cleanOrg = organisationId.toUpperCase();
    const cleanId = recallId.toUpperCase();

    const recall = await FoodRecallCase.findOne({ organisationId: cleanOrg, recallId: cleanId });
    if (!recall) throw new ApiError(404, 'NOT_FOUND', `Recall case ${cleanId} not found.`);

    // Server-side state transition validation
    if (!recall.canTransitionTo(nextState)) {
      throw new ApiError(
        400,
        'ILLEGAL_STATE_TRANSITION',
        `Cannot transition recall from ${recall.status} to ${nextState}. Permitted transitions: ${(VALID_TRANSITIONS[recall.status] || []).join(', ') || 'None (Terminal state)'}`
      );
    }

    // Section 8: Formal Recall Closure Control
    if (nextState === 'CLOSED') {
      if (
        recall.regulatoryApplicability === 'MANDATORY_REGULATORY' &&
        !['COMPLETED', 'ACKNOWLEDGED'].includes(recall.foscosFilingStatus) &&
        !recall.regulatoryAssessment?.closureExemptionReason
      ) {
        throw new ApiError(
          400,
          'FOSCOS_REGULATORY_FILING_UNRESOLVED',
          'Cannot close formal regulatory recall while FoSCoS filing remains unresolved without an authorized documented exemption reason.'
        );
      }
    }

    const previousState = recall.status;
    recall.status = nextState;
    recall.auditHistory.push({
      fromState: previousState,
      toState: nextState,
      transitionedBy: performedByUserId || 'SYSTEM',
      transitionedAt: new Date(),
      rationale: rationale || `Transitioned to ${nextState}`,
    });

    await recall.save();
    return recall;
  }

  static async updateFoscosFilingStatus({
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
    performedByUserId,
  }) {
    const cleanOrg = organisationId.toUpperCase();
    const cleanId = recallId.toUpperCase();

    const recall = await FoodRecallCase.findOne({ organisationId: cleanOrg, recallId: cleanId });
    if (!recall) throw new ApiError(404, 'NOT_FOUND', `Recall case ${cleanId} not found.`);

    if (regulatoryApplicability) recall.regulatoryApplicability = regulatoryApplicability;
    if (foscosFilingStatus) recall.foscosFilingStatus = foscosFilingStatus;
    if (filingCompletedDate) recall.filingCompletedDate = new Date(filingCompletedDate);
    if (foscosRecallReference) recall.foscosRegulatoryReference = foscosRecallReference;
    if (filingEvidenceAttachmentId) recall.filingEvidenceAttachmentId = filingEvidenceAttachmentId;
    if (filingResponsiblePerson) recall.filingResponsiblePerson = filingResponsiblePerson;
    if (authorityNotes) recall.authorityNotes = authorityNotes;

    if (!recall.regulatoryAssessment) recall.regulatoryAssessment = {};
    if (regulatoryAssessment?.rationale) recall.regulatoryAssessment.rationale = regulatoryAssessment.rationale;
    if (regulatoryAssessment?.assessedBy || performedByUserId) {
      recall.regulatoryAssessment.assessedBy = regulatoryAssessment?.assessedBy || performedByUserId;
      recall.regulatoryAssessment.assessedAt = new Date();
    }
    if (closureExemptionReason) recall.regulatoryAssessment.closureExemptionReason = closureExemptionReason;
    if (closureExemptionAuthorizedBy) recall.regulatoryAssessment.closureExemptionAuthorizedBy = closureExemptionAuthorizedBy;

    recall.auditHistory.push({
      fromState: recall.status,
      toState: recall.status,
      transitionedBy: performedByUserId || 'SYSTEM',
      transitionedAt: new Date(),
      rationale: `FoSCoS Filing Governance Updated: status=${recall.foscosFilingStatus}, applicability=${recall.regulatoryApplicability}`,
    });

    await recall.save();
    return recall;
  }

  static async recordRecallCommunication({
    organisationId,
    recallId,
    communicationType,
    audience,
    authority,
    contentReference,
    evidenceAttachmentId,
    responsiblePerson,
    communicatedAt,
    performedByUserId,
  }) {
    const cleanOrg = organisationId.toUpperCase();
    const cleanId = recallId.toUpperCase();

    const recall = await FoodRecallCase.findOne({ organisationId: cleanOrg, recallId: cleanId });
    if (!recall) throw new ApiError(404, 'NOT_FOUND', `Recall case ${cleanId} not found.`);

    if (!communicationType || !audience || !contentReference || !responsiblePerson) {
      throw new ApiError(400, 'MISSING_MANDATORY_FIELDS', 'Missing required recall communication fields.');
    }

    const comm = {
      communicationType,
      audience,
      authority: authority || 'FSSAI / FoSCoS',
      communicatedAt: communicatedAt ? new Date(communicatedAt) : new Date(),
      contentReference,
      evidenceAttachmentId: evidenceAttachmentId || null,
      responsiblePerson,
    };

    recall.communications.push(comm);
    recall.auditHistory.push({
      fromState: recall.status,
      toState: recall.status,
      transitionedBy: performedByUserId || responsiblePerson,
      transitionedAt: new Date(),
      rationale: `Logged ${communicationType} communication to ${audience}`,
    });

    await recall.save();
    return recall;
  }

  static async mapPotentiallyAffectedSales({
    organisationId,
    recallId,
    sales = [],
    performedByUserId,
  }) {
    const cleanOrg = organisationId.toUpperCase();
    const cleanId = recallId.toUpperCase();

    const recall = await FoodRecallCase.findOne({ organisationId: cleanOrg, recallId: cleanId });
    if (!recall) throw new ApiError(404, 'NOT_FOUND', `Recall case ${cleanId} not found.`);

    // Enforce PII minimization: mask customer identifiers!
    const formattedSales = sales.map((s) => ({
      billId: s.billId,
      cafeId: s.cafeId || recall.affectedCafes[0],
      soldAt: s.soldAt ? new Date(s.soldAt) : new Date(),
      menuItemId: s.menuItemId,
      menuItemName: s.menuItemName || '',
      quantity: Number(s.quantity) || 1,
      lotConfidence: s.lotConfidence || 'DIRECT_BOM_CONFIRMED',
      maskedCustomerIdentifier: s.customerPhone
        ? `***-***-${String(s.customerPhone).slice(-4)}`
        : (s.maskedCustomerIdentifier || 'ANONYMOUS_OR_MASKED'),
    }));

    recall.potentiallyAffectedSales.push(...formattedSales);
    recall.auditHistory.push({
      fromState: recall.status,
      toState: recall.status,
      transitionedBy: performedByUserId || 'SYSTEM',
      transitionedAt: new Date(),
      rationale: `Mapped ${formattedSales.length} potentially affected sales with customer PII minimization`,
    });

    await recall.save();
    return recall;
  }

  static async updateStockDispositions({
    organisationId,
    recallId,
    dispositions,
    performedByUserId,
  }) {
    const cleanOrg = organisationId.toUpperCase();
    const cleanId = recallId.toUpperCase();

    const recall = await FoodRecallCase.findOne({ organisationId: cleanOrg, recallId: cleanId });
    if (!recall) throw new ApiError(404, 'NOT_FOUND', `Recall case ${cleanId} not found.`);

    // Validate quantity reconciliation: no quantity may disappear silently!
    for (const d of dispositions) {
      const totalResolved = (d.returnedToSupplierQty || 0) + (d.destroyedQty || 0) + (d.releasedQty || 0) + (d.disposedQty || 0);
      if (totalResolved > d.quarantinedQty) {
        throw new ApiError(
          400,
          'DISPOSITION_RECONCILIATION_ERROR',
          `Resolved quantity (${totalResolved}) exceeds quarantined quantity (${d.quarantinedQty}) for lot ${d.lotId}.`
        );
      }
    }

    recall.stockDispositions = dispositions;
    recall.auditHistory.push({
      fromState: recall.status,
      toState: recall.status,
      transitionedBy: performedByUserId || 'SYSTEM',
      transitionedAt: new Date(),
      rationale: 'Updated stock dispositions and quantity reconciliation',
    });

    await recall.save();
    return recall;
  }

  static async listRecalls({ organisationId, status = null }) {
    const query = { organisationId: organisationId.toUpperCase() };
    if (status) query.status = status;
    return await FoodRecallCase.find(query).sort({ createdAt: -1 }).lean();
  }

  // ===========================================================================
  // 7. FOOD SAFETY INCIDENT & CAPA ENGINE
  // ===========================================================================

  static async createCapa({
    organisationId,
    cafeId,
    source,
    sourceReferenceId,
    title,
    findingDescription,
    rootCauseCategory = 'OTHER',
    rootCauseAnalysis,
    rootCauseConfirmedByHuman = true,
    correctiveActionPlan,
    preventiveActionPlan,
    assignedOwnerUserId,
    dueDate,
    evidenceAttachmentIds = [],
    performedByUserId,
  }) {
    if (!organisationId || !cafeId || !source || !sourceReferenceId || !title || !findingDescription || !correctiveActionPlan || !preventiveActionPlan || !assignedOwnerUserId || !dueDate) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Missing required CAPA creation fields.');
    }

    // Invariant: Root cause cannot be purely fabricated; must be human confirmed
    if (!rootCauseConfirmedByHuman) {
      throw new ApiError(400, 'HUMAN_ROOT_CAUSE_REQUIRED', 'Root cause analysis must be confirmed by human authority before CAPA initiation.');
    }

    const capaId = `CAPA-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

    const capa = await CapaRecord.create({
      capaId,
      organisationId: organisationId.toUpperCase(),
      cafeId: cafeId.toUpperCase(),
      source,
      sourceReferenceId,
      title: String(title).trim(),
      findingDescription: String(findingDescription).trim(),
      rootCauseCategory,
      rootCauseAnalysis: String(rootCauseAnalysis || 'Root cause investigation completed.').trim(),
      rootCauseConfirmedByHuman: true,
      correctiveActionPlan: String(correctiveActionPlan).trim(),
      preventiveActionPlan: String(preventiveActionPlan).trim(),
      assignedOwnerUserId,
      dueDate: new Date(dueDate),
      status: 'OPEN',
      evidenceAttachmentIds: Array.isArray(evidenceAttachmentIds) ? evidenceAttachmentIds : [],
      auditHistory: [
        {
          action: 'CREATE_CAPA',
          performedBy: performedByUserId || 'SYSTEM',
          performedAt: new Date(),
          previousStatus: null,
          newStatus: 'OPEN',
          notes: 'CAPA initiated with human-confirmed root cause analysis',
        },
      ],
    });

    await FoodSafetyRegistration.updateOne(
      { organisationId: organisationId.toUpperCase(), cafeId: cafeId.toUpperCase(), status: 'ACTIVE' },
      {
        $set: { internalComplianceState: 'ACTION_REQUIRED' },
        $push: {
          auditHistory: {
            action: 'CAPA_INITIATED',
            performedBy: performedByUserId || 'SYSTEM',
            performedAt: new Date(),
            reason: `CAPA ${capaId} initiated. Internal compliance state updated to ACTION_REQUIRED. Regulatory licence remains ACTIVE.`,
          },
        },
      }
    );

    return capa;
  }

  static async verifyAndCloseCapa({
    organisationId,
    capaId,
    verificationNotes,
    verifiedByUserId,
  }) {
    const cleanOrg = organisationId.toUpperCase();
    const cleanId = capaId.toUpperCase();

    const capa = await CapaRecord.findOne({ organisationId: cleanOrg, capaId: cleanId });
    if (!capa) throw new ApiError(404, 'NOT_FOUND', `CAPA record ${cleanId} not found.`);

    capa.verifiedByUserId = verifiedByUserId;
    capa.verifiedAt = new Date();
    capa.verificationNotes = verificationNotes || 'Corrective and preventive actions verified effective.';
    capa.closedAt = new Date();
    capa.status = 'CLOSED';

    capa.auditHistory.push({
      action: 'VERIFY_AND_CLOSE',
      performedBy: verifiedByUserId,
      performedAt: new Date(),
      previousStatus: capa.status,
      newStatus: 'CLOSED',
      notes: verificationNotes || 'Verification completed and closed',
    });

    await capa.save();
    return capa;
  }

  static async listCapas({ organisationId, cafeId = null, status = null }) {
    const query = { organisationId: organisationId.toUpperCase() };
    if (cafeId) query.cafeId = cafeId.toUpperCase();
    if (status) query.status = status;
    return await CapaRecord.find(query).sort({ createdAt: -1 }).lean();
  }

  // ===========================================================================
  // 8. OWNER FOOD SAFETY DASHBOARD AGGREGATION
  // ===========================================================================

  static async getOwnerDashboardOverview({ organisationId, cafeId = null }) {
    const cleanOrg = organisationId.toUpperCase();
    const cafeFilter = cafeId ? { cafeId: cafeId.toUpperCase() } : {};

    // 1. Licences / Registrations
    const licences = await FoodSafetyRegistration.find({ organisationId: cleanOrg, ...cafeFilter }).lean();
    const activeLicences = licences.filter((l) => l.status === 'ACTIVE').length;
    const perpetualLicences = licences.filter((l) => l.isPerpetual).length;
    const legacyLicences = licences.filter((l) => !l.isPerpetual).length;

    // 2. Open Recalls
    const recalls = await FoodRecallCase.find({ organisationId: cleanOrg, ...(cafeId ? { affectedCafes: cafeId.toUpperCase() } : {}) }).lean();
    const activeRecalls = recalls.filter((r) => r.status !== 'CLOSED').length;
    const quarantinedStockLots = recalls.reduce((sum, r) => sum + (r.stockDispositions?.reduce((dSum, d) => dSum + (d.quarantinedQty || 0), 0) || 0), 0);

    // 3. Open Incidents
    const incidents = await FoodSafetyIncident.find({ organisationId: cleanOrg, ...cafeFilter }).lean();
    const activeIncidents = incidents.filter((i) => i.status !== 'CLOSED').length;
    const criticalIncidents = incidents.filter((i) => i.severity === 'CRITICAL' && i.status !== 'CLOSED').length;

    // 4. Overdue CAPAs
    const now = new Date();
    const capas = await CapaRecord.find({ organisationId: cleanOrg, ...cafeFilter }).lean();
    const openCapas = capas.filter((c) => c.status !== 'CLOSED').length;
    const overdueCapas = capas.filter((c) => c.status !== 'CLOSED' && c.dueDate && new Date(c.dueDate) < now).length;

    // 5. Hygiene Inspections & Pass Rate
    const inspections = await HygieneInspection.find({ organisationId: cleanOrg, ...cafeFilter }).sort({ inspectedAt: -1 }).limit(100).lean();
    const passedInspections = inspections.filter((i) => i.overallResult === 'PASSED').length;
    const hygienePassRate = inspections.length > 0 ? Math.round((passedInspections / inspections.length) * 100) : null;

    // 6. Temperature Excursions
    const tempLogs = await TemperatureLog.find({ organisationId: cleanOrg, ...cafeFilter, isExcursion: true }).limit(50).lean();
    const excursionCount = tempLogs.length;

    // 7. FoSTaC Trained Supervisors
    const fostacRecords = await EmployeeTraining.find({ organisationId: cleanOrg, trainingType: 'FOSTAC', ...cafeFilter }).lean();
    const certifiedSupervisors = fostacRecords.filter((r) => r.fostacVerificationStatus === 'MANUALLY_VERIFIED' || r.fostacVerificationStatus === 'OFFICIAL_VERIFICATION_CONFIRMED').length;

    // 8. Traceability Gaps
    const gaps = await TraceabilityGap.find({ organisationId: cleanOrg, ...cafeFilter, status: 'OPEN' }).lean();
    const openGapsCount = gaps.length;

    return {
      organisationId: cleanOrg,
      cafeScope: cafeId ? cafeId.toUpperCase() : 'PORTFOLIO_ALL_AUTHORIZED',
      licences: {
        total: licences.length,
        active: activeLicences,
        perpetual: perpetualLicences,
        legacy: legacyLicences,
      },
      recalls: {
        total: recalls.length,
        active: activeRecalls,
        quarantinedStockTotalQty: quarantinedStockLots,
      },
      incidents: {
        total: incidents.length,
        active: activeIncidents,
        critical: criticalIncidents,
      },
      capas: {
        total: capas.length,
        open: openCapas,
        overdue: overdueCapas,
      },
      hygiene: {
        inspectionsCount: inspections.length,
        passRatePercentage: hygienePassRate,
      },
      temperature: {
        recentExcursionsCount: excursionCount,
      },
      fostac: {
        totalRecords: fostacRecords.length,
        verifiedSupervisors: certifiedSupervisors,
      },
      traceability: {
        openGapsCount,
      },
    };
  }
}

module.exports = {
  FoodSafetyGovernanceService,
};
