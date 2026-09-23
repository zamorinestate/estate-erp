'use strict';

/**
 * ASSET & EQUIPMENT MAINTENANCE ROUTES
 * Mounted at: /api/v1/assets (registered in routes/index.js)
 */

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { attachDeviceContext } = require('../middleware/deviceContext');
const {
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
} = require('../controllers/assetController');

const router = express.Router();

router.use(authenticate);
router.use(attachDeviceContext);

// Overview
router.get('/overview', getAssetOverview);

// Work Orders
router.get('/work-orders', listWorkOrders);
router.post('/work-orders', createWorkOrder);
router.patch('/work-orders/:workOrderId', updateWorkOrder);
router.post('/work-orders/:workOrderId/resolve', updateWorkOrder);

// Inspections
router.post('/inspections', recordInspection);

// Maintenance Backlog, Schedules & Alert Evaluation
router.get('/maintenance/backlog', getMaintenanceBacklog);
router.get('/maintenance/history', getMaintenanceHistory);
router.post('/maintenance/evaluate-alerts', runMaintenanceAlertEvaluation);
router.post('/maintenance/complete', completeMaintenanceJob);
router.post('/maintenance/reschedule', rescheduleMaintenanceJob);
router.post('/maintenance/jobs/:jobId/complete', completeMaintenanceJob);
router.post('/maintenance/jobs/:jobId/reschedule', rescheduleMaintenanceJob);

// Maintenance Plans
router.get('/plans', listMaintenancePlans);
router.post('/plans', createMaintenancePlan);
router.post('/plans/:planId/cancel', cancelMaintenancePlan);

// Asset Register CRUD & Lifecycle
router.get('/', listAssets);
router.get('/items', listAssets);
router.post('/', createAsset);
router.get('/:assetId', getAssetDetail);
router.post('/:assetId/commission', commissionAsset);
router.post('/:assetId/transfer', transferAsset);
router.post('/:assetId/safety-hold', toggleSafetyHold);
router.post('/:assetId/retire', retireAsset);
router.get('/:assetId/maintenance', getMaintenanceHistory);
router.post('/:assetId/maintenance', logMaintenanceJob);

module.exports = router;
