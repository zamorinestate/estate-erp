'use strict';

/**
 * LOAN & SALARY ADVANCES ROUTES — SCR-014
 * Mounted at: /api/v1/loan-advances (registered in routes/index.js)
 */

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const {
  listMyLoanAdvances,
  getMyLoanAdvance,
  requestLoan,
  requestSalaryAdvance,
  withdrawMyRequest,
  reportManualRepayment,
  requestRepaymentPause,
  decideRepaymentPause,
  getMySettlementQuote,
  requestEarlySettlement,
  listOrgLoans,
  approveLoan,
  rejectLoan,
  disburseLoan,
  verifyManualRepayment,
  postLoanSettlement,
  getLoanIntegrityAudit,
} = require('../controllers/loanAdvanceController');

const router = express.Router();

router.use(authenticate);

// ── 1. Employee Self-Service (Staff, Cafe Admin, Owner, Primary Master) ─────

router.get(
  '/me',
  authorize('LOAN_ADVANCE_READ_SELF', {
    allowedRoles: ['STAFF', 'CAFE_ADMIN', 'OWNER', 'MASTER'],
    targetUserIdResolver: (req) => req.auth?.userId,
  }),
  listMyLoanAdvances
);

router.get(
  '/me/:loanAdvanceId',
  authorize('LOAN_ADVANCE_READ_SELF', {
    allowedRoles: ['STAFF', 'CAFE_ADMIN', 'OWNER', 'MASTER'],
    targetUserIdResolver: (req) => req.auth?.userId,
  }),
  getMyLoanAdvance
);

router.post(
  '/me/requests/loan',
  authorize('LOAN_ADVANCE_WRITE_SELF', {
    allowedRoles: ['STAFF', 'CAFE_ADMIN', 'OWNER', 'MASTER'],
    targetUserIdResolver: (req) => req.auth?.userId,
  }),
  requestLoan
);

router.post(
  '/me/requests/advance',
  authorize('LOAN_ADVANCE_WRITE_SELF', {
    allowedRoles: ['STAFF', 'CAFE_ADMIN', 'OWNER', 'MASTER'],
    targetUserIdResolver: (req) => req.auth?.userId,
  }),
  requestSalaryAdvance
);

router.post(
  '/me/requests/:loanAdvanceId/withdraw',
  authorize('LOAN_ADVANCE_WRITE_SELF', {
    allowedRoles: ['STAFF', 'CAFE_ADMIN', 'OWNER', 'MASTER'],
    targetUserIdResolver: (req) => req.auth?.userId,
  }),
  withdrawMyRequest
);

router.post(
  '/me/loans/:loanAdvanceId/repayments/manual',
  authorize('LOAN_ADVANCE_WRITE_SELF', {
    allowedRoles: ['STAFF', 'CAFE_ADMIN', 'OWNER', 'MASTER'],
    targetUserIdResolver: (req) => req.auth?.userId,
  }),
  reportManualRepayment
);

router.post(
  '/me/loans/:loanAdvanceId/pause',
  authorize('LOAN_ADVANCE_WRITE_SELF', {
    allowedRoles: ['STAFF', 'CAFE_ADMIN', 'OWNER', 'MASTER'],
    targetUserIdResolver: (req) => req.auth?.userId,
  }),
  requestRepaymentPause
);

router.get(
  '/me/loans/:loanAdvanceId/settlement-quote',
  authorize('LOAN_ADVANCE_READ_SELF', {
    allowedRoles: ['STAFF', 'CAFE_ADMIN', 'OWNER', 'MASTER'],
    targetUserIdResolver: (req) => req.auth?.userId,
  }),
  getMySettlementQuote
);

router.post(
  '/me/loans/:loanAdvanceId/settlement-request',
  authorize('LOAN_ADVANCE_WRITE_SELF', {
    allowedRoles: ['STAFF', 'CAFE_ADMIN', 'OWNER', 'MASTER'],
    targetUserIdResolver: (req) => req.auth?.userId,
  }),
  requestEarlySettlement
);

// ── 2. Primary Master Organisation-Wide Administration ──────────────────────

router.get(
  '/admin/loans',
  authorize('LOAN_ADVANCE_ADMIN', { allowedRoles: ['MASTER'], requirePrimaryMaster: true }),
  listOrgLoans
);

router.post(
  '/admin/loans/:loanAdvanceId/approve',
  authorize('LOAN_ADVANCE_ADMIN', { allowedRoles: ['MASTER'], requirePrimaryMaster: true }),
  approveLoan
);

router.post(
  '/admin/loans/:loanAdvanceId/reject',
  authorize('LOAN_ADVANCE_ADMIN', { allowedRoles: ['MASTER'], requirePrimaryMaster: true }),
  rejectLoan
);

router.post(
  '/admin/loans/:loanAdvanceId/disburse',
  authorize('LOAN_ADVANCE_ADMIN', { allowedRoles: ['MASTER'], requirePrimaryMaster: true }),
  disburseLoan
);

router.post(
  '/admin/loans/:loanAdvanceId/pause-decision',
  authorize('LOAN_ADVANCE_ADMIN', { allowedRoles: ['MASTER', 'OWNER'] }),
  decideRepaymentPause
);

router.post(
  '/admin/transactions/:transactionId/verify',
  authorize('LOAN_ADVANCE_ADMIN', { allowedRoles: ['MASTER'], requirePrimaryMaster: true }),
  verifyManualRepayment
);

router.post(
  '/admin/loans/:loanAdvanceId/settlement',
  authorize('LOAN_ADVANCE_ADMIN', { allowedRoles: ['MASTER'], requirePrimaryMaster: true }),
  postLoanSettlement
);

router.get(
  '/admin/integrity',
  authorize('LOAN_ADVANCE_ADMIN', { allowedRoles: ['MASTER'], requirePrimaryMaster: true }),
  getLoanIntegrityAudit
);

module.exports = router;
