'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER BCDR ROUTES (STAGE 09)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/ownerBcdrController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

// All BCDR routes require authentication
router.use(authenticate);

// Executive Dashboard & Backup Status
router.get(
  '/dashboard',
  authorize('SECURITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getExecutiveDashboard
);
router.get(
  '/backup-status',
  authorize('SECURITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getBackupStatus
);

// Business Impact Analysis
router.post(
  '/processes',
  authorize('SECURITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.registerBusinessProcess
);
router.get(
  '/processes',
  authorize('SECURITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getBusinessProcesses
);

// DR Drills & Governed Execution
router.post(
  '/drills',
  authorize('SECURITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.planDrill
);
router.patch(
  '/drills/:drillId/status',
  authorize('SECURITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.updateDrillStatus
);

// Offline Financial Safety Invariant Verification
router.post(
  '/validate-sale-sync',
  authorize('POS_BILLING', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'] }),
  controller.validateSaleSyncState
);

// Stage 09 Contextual: Café Operations / Manager Local Continuity Plan
router.get(
  '/cafes/:cafeId/continuity-plan',
  authorize('SECURITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getCafeContinuityPlan
);

module.exports = router;
