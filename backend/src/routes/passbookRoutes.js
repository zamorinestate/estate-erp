'use strict';

/**
 * PASSBOOK & MULTI-CAFÉ TREASURY ROUTES
 * Mounted at /api/v1/passbook
 * Strictly guarded: Primary Master & Owner only. Normal Master, Cafe Admin, and Staff receive 403.
 */

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const {
  getPassbookOverview,
  listAccounts,
  createAccount,
  getAccountById,
  updateAccount,
  rebuildAccountBalance,
  listTransactions,
  postTransaction,
  directBalanceAdjustment,
  reverseTransaction,
  createTransfer,
  commitStatementImport,
  confirmBalance,
  createReservation,
  runIntegrityAudit,
  getAnalytics,
  exportPassbookPdf,
} = require('../controllers/passbookController');

const router = express.Router();

function requirePrimaryMasterOrOwner(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    });
  }

  const isOwner = req.auth.role === 'OWNER';
  const isPrimaryMaster = req.auth.role === 'MASTER' && req.auth.isPrimaryMaster === true;

  if (!isOwner && !isPrimaryMaster) {
    return res.status(403).json({
      error: {
        code: 'PASSBOOK_ACCESS_RESTRICTED',
        message: 'Passbook & Multi-Café Treasury Control is accessible exclusively to Primary Master and Owner.',
      },
    });
  }

  return next();
}

router.use(authenticate);
router.use(requirePrimaryMasterOrOwner);

// Overview & KPIs
router.get('/overview', getPassbookOverview);

// Accounts
router.get('/accounts', listAccounts);
router.post('/accounts', createAccount);
router.get('/accounts/:accountId', getAccountById);
router.patch('/accounts/:accountId', updateAccount);
router.post('/accounts/:accountId/rebuild-balance', rebuildAccountBalance);
router.post('/accounts/:accountId/adjust-balance', directBalanceAdjustment);

// Transactions
router.get('/transactions', listTransactions);
router.post('/transactions', postTransaction);
router.post('/transactions/:transactionId/reverse', reverseTransaction);

// Transfers
router.post('/transfers', createTransfer);

// Reconciliations & Statements
router.post('/statements/imports', commitStatementImport);
router.post('/reconciliations/confirm', confirmBalance);
router.post('/reconciliations/:reconciliationId/confirm', confirmBalance);

// Reserved Funds
router.post('/reservations', createReservation);

// Integrity & Analytics
router.get('/integrity', runIntegrityAudit);
router.get('/analytics', getAnalytics);
router.get('/export', exportPassbookPdf);
router.get('/export/pdf', exportPassbookPdf);

module.exports = router;
