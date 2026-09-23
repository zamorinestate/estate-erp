'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER ASSET RELIABILITY & MAINTENANCE ROUTES (STAGE 07)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/ownerAssetReliabilityController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

// Apply authentication to all asset reliability routes
router.use(authenticate);

// Executive Dashboard
router.get(
  '/dashboard',
  authorize('ASSET_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getExecutiveReliabilityDashboard
);

// Breakdown Logging & Governed Lifecycle
router.post(
  '/breakdowns',
  authorize('ASSET_WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'] }),
  controller.reportBreakdown
);
router.patch(
  '/breakdowns/:breakdownId/status',
  authorize('ASSET_WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.updateBreakdownStatus
);

// Work Orders & Strict Lifecycle
router.post(
  '/work-orders',
  authorize('ASSET_WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.createWorkOrder
);
router.patch(
  '/work-orders/:workOrderId/status',
  authorize('ASSET_WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.updateWorkOrderStatus
);

// Calibrations
router.post(
  '/calibrations',
  authorize('ASSET_WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.recordCalibration
);

// Reliability Metrics (MTBF, MTTR, Uptime) & Replacement Indicators
router.get(
  '/assets/:assetId/metrics',
  authorize('ASSET_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getAssetReliabilityMetrics
);
router.get(
  '/assets/:assetId/replacement-indicators',
  authorize('ASSET_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getReplacementIndicators
);

// Governed Stage 03 CAPEX Linkage
router.post(
  '/assets/:assetId/replacement-capex',
  authorize('ASSET_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.linkReplacementToCapex
);

module.exports = router;
