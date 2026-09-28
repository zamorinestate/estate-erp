'use strict';

/**
 * PERSONAL LEDGER & OWNER ACCOUNT ROUTES (SCR-018)
 *
 * AUTHORIZATION:
 *   - PRIMARY MASTER (role = MASTER && isPrimaryMaster === true): Full authority.
 *   - OWNER (role = OWNER): Authorized according to authorized Owner-account scope.
 *   - CAFE_ADMIN and STAFF: Strictly DENIED (403/404). Malformed MASTER claims fail closed upstream.
 *
 * Mounted at: /api/v1/personal-ledger (registered in routes/index.js)
 */

const express = require('express');

const {
  authenticate,
} = require('../middleware/authenticate');

const {
  authorize,
  requireReason,
} = require('../middleware/authorize');

const {
  getLedgerOverview,
  getBalance,
  listEntries,
  getEntry,
  createEntry,
  classifyToBusinessBooks,
  reverseClassification,
  reverseEntry,
  settleBalances,
  confirmBalance,
  getReconciliation,
  exportPersonalLedger,
} = require('../controllers/personalLedgerController');

const router = express.Router();

// All routes require an authenticated session.
router.use(authenticate);

// ── GET /personal-ledger/export ──────────────────────────────────────────────
router.get(
  '/export',
  authorize('PERSONAL_LEDGER_READ', {
    absoluteRestriction: 'PERSONAL_LEDGER',
    allowedRoles: ['MASTER', 'OWNER'],
  }),
  exportPersonalLedger
);

// ── GET /personal-ledger/overview ────────────────────────────────────────────
router.get(
  '/overview',
  authorize('PERSONAL_LEDGER_READ', {
    absoluteRestriction: 'PERSONAL_LEDGER',
    allowedRoles: ['MASTER', 'OWNER'],
  }),
  getLedgerOverview
);

// ── GET /personal-ledger/balance ─────────────────────────────────────────────
router.get(
  '/balance',
  authorize('PERSONAL_LEDGER_READ', {
    absoluteRestriction: 'PERSONAL_LEDGER',
    allowedRoles: ['MASTER', 'OWNER'],
  }),
  getBalance
);

// ── GET /personal-ledger/reconciliation ──────────────────────────────────────
router.get(
  '/reconciliation',
  authorize('PERSONAL_LEDGER_READ', {
    absoluteRestriction: 'PERSONAL_LEDGER',
    allowedRoles: ['MASTER', 'OWNER'],
  }),
  getReconciliation
);

// ── GET /personal-ledger/entries (and /personal-ledger) ──────────────────────
router.get(
  '/entries',
  authorize('PERSONAL_LEDGER_READ', {
    absoluteRestriction: 'PERSONAL_LEDGER',
    allowedRoles: ['MASTER', 'OWNER'],
  }),
  listEntries
);

router.get(
  '/',
  authorize('PERSONAL_LEDGER_READ', {
    absoluteRestriction: 'PERSONAL_LEDGER',
    allowedRoles: ['MASTER', 'OWNER'],
  }),
  listEntries
);

// ── GET /personal-ledger/entries/:ledgerEntryId ──────────────────────────────
router.get(
  '/entries/:ledgerEntryId',
  authorize('PERSONAL_LEDGER_READ', {
    absoluteRestriction: 'PERSONAL_LEDGER',
    allowedRoles: ['MASTER', 'OWNER'],
  }),
  getEntry
);

router.get(
  '/:ledgerEntryId',
  authorize('PERSONAL_LEDGER_READ', {
    absoluteRestriction: 'PERSONAL_LEDGER',
    allowedRoles: ['MASTER', 'OWNER'],
  }),
  getEntry
);

// ── POST /personal-ledger/entries (and /personal-ledger) ─────────────────────
router.post(
  '/entries',
  authorize('PERSONAL_LEDGER_WRITE', {
    absoluteRestriction: 'PERSONAL_LEDGER',
    allowedRoles: ['MASTER', 'OWNER'],
  }),
  createEntry
);

router.post(
  '/',
  authorize('PERSONAL_LEDGER_WRITE', {
    absoluteRestriction: 'PERSONAL_LEDGER',
    allowedRoles: ['MASTER', 'OWNER'],
  }),
  createEntry
);

// ── POST /personal-ledger/entries/:ledgerEntryId/classify ────────────────────
router.post(
  '/entries/:ledgerEntryId/classify',
  authorize('PERSONAL_LEDGER_WRITE', {
    absoluteRestriction: 'PERSONAL_LEDGER',
    allowedRoles: ['MASTER', 'OWNER'],
  }),
  classifyToBusinessBooks
);

// ── POST /personal-ledger/entries/:ledgerEntryId/reverse-classification ──────
router.post(
  '/entries/:ledgerEntryId/reverse-classification',
  authorize('PERSONAL_LEDGER_WRITE', {
    absoluteRestriction: 'PERSONAL_LEDGER',
    allowedRoles: ['MASTER', 'OWNER'],
    requiresReason: true,
  }),
  requireReason,
  reverseClassification
);

// ── POST /personal-ledger/entries/:ledgerEntryId/reverse ─────────────────────
router.post(
  '/entries/:ledgerEntryId/reverse',
  authorize('PERSONAL_LEDGER_WRITE', {
    absoluteRestriction: 'PERSONAL_LEDGER',
    allowedRoles: ['MASTER', 'OWNER'],
    requiresReason: true,
  }),
  requireReason,
  reverseEntry
);

router.post(
  '/:ledgerEntryId/reverse',
  authorize('PERSONAL_LEDGER_WRITE', {
    absoluteRestriction: 'PERSONAL_LEDGER',
    allowedRoles: ['MASTER', 'OWNER'],
    requiresReason: true,
  }),
  requireReason,
  reverseEntry
);

// ── POST /personal-ledger/settlements ────────────────────────────────────────
router.post(
  '/settlements',
  authorize('PERSONAL_LEDGER_WRITE', {
    absoluteRestriction: 'PERSONAL_LEDGER',
    allowedRoles: ['MASTER', 'OWNER'],
  }),
  settleBalances
);

// ── POST /personal-ledger/confirmations ──────────────────────────────────────
router.post(
  '/confirmations',
  authorize('PERSONAL_LEDGER_WRITE', {
    absoluteRestriction: 'PERSONAL_LEDGER',
    allowedRoles: ['MASTER', 'OWNER'],
  }),
  confirmBalance
);

module.exports = router;
