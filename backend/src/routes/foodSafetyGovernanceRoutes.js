'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — FOOD SAFETY GOVERNANCE ROUTES (STAGE 01)
 * ============================================================================
 * Mounted at: /api/v1/food-safety
 */

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const {
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
} = require('../controllers/foodSafetyGovernanceController');

const router = express.Router();

router.use(authenticate);

// ── Overview ──────────────────────────────────────────────────────────────────
router.get(
  '/overview',
  authorize('QUALITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  getDashboardOverview
);

// ── Licences / Registrations ──────────────────────────────────────────────────
router.get(
  '/licences',
  authorize('QUALITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  listLicences
);

router.post(
  '/licences',
  authorize('QUALITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  registerLicence
);

router.patch(
  '/licences/:registrationId/status',
  authorize('QUALITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  updateLicenceStatus
);

// ── Hygiene Templates & Inspections ───────────────────────────────────────────
router.get(
  '/hygiene/templates',
  authorize('QUALITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  listTemplates
);

router.post(
  '/hygiene/templates',
  authorize('QUALITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  createTemplate
);

router.get(
  '/hygiene/inspections',
  authorize('QUALITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  listInspections
);

router.post(
  '/hygiene/inspections',
  authorize('QUALITY_WRITE', { allowedRoles: ['MASTER', 'CAFE_ADMIN'] }),
  submitInspection
);

router.patch(
  '/hygiene/inspections/:inspectionId/actions/:actionId',
  authorize('QUALITY_WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  updateInspectionAction
);

// ── Temperatures & Excursions ─────────────────────────────────────────────────
router.get(
  '/temperature/rules',
  authorize('QUALITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  listTemperatureRules
);

router.get(
  '/temperature/logs',
  authorize('QUALITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  listTemperatureLogs
);

// ── FoSTaC & Training ─────────────────────────────────────────────────────────
router.get(
  '/fostac/supervisors',
  authorize('QUALITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  listFoSTaC
);

// ── Traceability Graph & Gaps ─────────────────────────────────────────────────
router.get(
  '/traceability/forward',
  authorize('QUALITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  traceForward
);

router.get(
  '/traceability/backward',
  authorize('QUALITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  traceBackward
);

router.get(
  '/traceability/gaps',
  authorize('QUALITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  listTraceabilityGaps
);

router.post(
  '/traceability/gaps',
  authorize('QUALITY_WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  registerTraceabilityGap
);

// ── Food Recalls ──────────────────────────────────────────────────────────────
router.get(
  '/recalls',
  authorize('QUALITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  listRecalls
);

router.post(
  '/recalls',
  authorize('QUALITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  initiateRecall
);

router.post(
  '/recalls/:recallId/transition',
  authorize('QUALITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  transitionRecallState
);

router.put(
  '/recalls/:recallId/foscos-filing',
  authorize('QUALITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  updateFoscosFilingStatus
);

router.post(
  '/recalls/:recallId/communications',
  authorize('QUALITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  recordRecallCommunication
);

router.post(
  '/recalls/:recallId/affected-sales',
  authorize('QUALITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  mapPotentiallyAffectedSales
);

router.put(
  '/recalls/:recallId/dispositions',
  authorize('QUALITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  updateStockDispositions
);

// ── CAPA Engine ───────────────────────────────────────────────────────────────
router.get(
  '/capas',
  authorize('QUALITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  listCapas
);

router.post(
  '/capas',
  authorize('QUALITY_WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  createCapa
);

router.post(
  '/capas/:capaId/verify',
  authorize('QUALITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  verifyCapa
);

module.exports = router;
