'use strict';

/**
 * BILL ROUTES (SCREEN 005)
 * Mounted at: /api/v1/bills (registered in routes/index.js)
 */

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { attachDeviceContext } = require('../middleware/deviceContext');
const {
  getBillsOverview,
  listBills,
  getBill,
  getBillPdf,
  syncOfflineBills,
  reprintBill,
  voidBill,
  refundBill,
  getGstRegister,
  getReconciliationStatus,
  closeBusinessDayBilling,
  getPastOrdersSummary,
  getSalesCalendar,
  holdBill,
  listOpenTickets,
  openRegisterSession,
  recordCashEvent,
  closeRegisterSession,
  getRegisterSession,
} = require('../controllers/billController');

const router = express.Router();

router.use(authenticate);
router.use(attachDeviceContext);

// Overview & Registers
router.get('/overview', getBillsOverview);
router.get('/tax/gst-register', getGstRegister);
router.get('/reconciliation/status', getReconciliationStatus);
router.post('/eod/close', closeBusinessDayBilling);

// History, Stats & Calendar
router.get('/history/stats', getPastOrdersSummary);
router.get('/history/calendar', getSalesCalendar);

// Open Tickets & Holds
router.get('/tickets/open', listOpenTickets);
router.post('/tickets/hold', holdBill);

// Register Session & Cash Drawer
router.get('/register/session/current', getRegisterSession);
router.post('/register/session/open', openRegisterSession);
router.post('/register/session/event', recordCashEvent);
router.post('/register/session/close', closeRegisterSession);

// Bill Listing & Detail
router.get('/', listBills);
router.get('/:billId/pdf', getBillPdf);
router.get('/:billId', getBill);

// POS Sale Creation & Settlement
const { commitOrder: canonicalCommitOrder } = require('../controllers/posController');

router.post('/', canonicalCommitOrder);
router.post('/commit', canonicalCommitOrder);
router.post('/preview', require('../controllers/posController').previewOrder);
router.post('/offline-sync', syncOfflineBills);
router.post('/:billId/split', (request, response) => {
  return response.status(410).json({
    success: false,
    error: {
      code: 'LEGACY_POS_SETTLEMENT_RETIRED',
      message: 'Post-hoc split settlement is retired. Submit the complete tender allocation through the canonical POS commit endpoint.',
    },
    correlationId: request.correlationId || null,
  });
});

// Post-Sale Adjustments
router.post('/:billId/reprint', reprintBill);
router.post('/:billId/void', authorize('POS_VOID', { allowedRoles: ['MASTER', 'OWNER'] }), voidBill);
router.post('/:billId/refund', refundBill);

module.exports = router;
