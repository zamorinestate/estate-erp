'use strict';

const express = require('express');
const router = express.Router();
const controller = require('../controllers/ownerSupplierIntelligenceController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

router.use(authenticate);

// ── Analytics & Dependency Risk ─────────────────────────────────────────────
router.get(
  '/analytics',
  authorize('PROCUREMENT_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getProcurementAnalytics
);

router.get(
  '/dependency-risk',
  authorize('PROCUREMENT_READ', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.getSupplierDependencyRisk
);

// ── Supplier 360 Dossier ───────────────────────────────────────────────────
router.get(
  '/suppliers/:vendorId/360',
  authorize('PROCUREMENT_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getSupplier360
);

// ── Scorecard Configuration ────────────────────────────────────────────────
router.put(
  '/scorecard-config',
  authorize('PROCUREMENT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.updateScorecardConfig
);

// ── Supplier Action Plans (CAPA) ───────────────────────────────────────────
router.post(
  '/action-plans',
  authorize('PROCUREMENT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.createActionPlan
);

router.patch(
  '/action-plans/:actionId/status',
  authorize('PROCUREMENT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.updateActionPlanStatus
);

module.exports = router;
