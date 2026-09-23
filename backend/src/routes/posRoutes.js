'use strict';

/**
 * POS ROUTES (SCREEN 005 / PRIMARY MASTER PROGRAMME STAGE 06)
 * Mounted at: /api/v1/pos
 */

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { attachDeviceContext } = require('../middleware/deviceContext');
const {
  commitOrder,
  previewOrder,
  printOrder,
  reprintOrder,
  getActiveOrders,
  getLastCommittedBill,
  getOrderStatusByIdempotency,
  getPendingReconciliations,
  retryReconciliation,
  syncOfflineOrders,
  getPendingOfflineReviews,
  reviewOfflineOrder,
} = require('../controllers/posController');

const router = express.Router();

router.use(authenticate);
router.use(attachDeviceContext);

// POS Order pipeline actions
router.post('/orders/commit', commitOrder);
router.post('/offline-sync', syncOfflineOrders);
router.post('/orders/preview', previewOrder);
router.post('/orders/:billId/print', printOrder);
router.post('/orders/:billId/reprint', reprintOrder);
router.get('/orders/active/:cafeId', getActiveOrders);
router.get('/orders/last/:cafeId', getLastCommittedBill);

// REC-04B: Transaction status & unknown-outcome recovery
router.get('/orders/status/:transactionId', getOrderStatusByIdempotency);

// REC-04B: Durable side-effect reconciliation management
router.get('/reconciliation/pending', getPendingReconciliations);
router.post('/reconciliation/:jobId/retry', retryReconciliation);

// REC-13A: Disabled operator & offline review management
router.get('/offline-reviews/pending', getPendingOfflineReviews);
router.post('/offline-reviews/:reviewId/review', reviewOfflineOrder);

module.exports = router;


