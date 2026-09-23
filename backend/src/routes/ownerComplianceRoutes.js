'use strict';

const express = require('express');
const router = express.Router();
const controller = require('../controllers/ownerComplianceController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

router.use(authenticate);

// ── Dashboard Overview ──────────────────────────────────────────────────────
router.get(
  '/dashboard',
  authorize('COMPLIANCE_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getDashboardSummary
);
router.get(
  '/overview',
  authorize('COMPLIANCE_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getDashboardSummary
);

// ── Obligations ─────────────────────────────────────────────────────────────
router.get(
  '/obligations',
  authorize('COMPLIANCE_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.listObligations
);
router.post(
  '/obligations',
  authorize('COMPLIANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.createObligation
);
router.patch(
  '/obligations/:obligationId/status',
  authorize('COMPLIANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.updateObligationStatus
);

// ── Licences ────────────────────────────────────────────────────────────────
router.get(
  '/licences',
  authorize('COMPLIANCE_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.listLicences
);
router.post(
  '/licences',
  authorize('COMPLIANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.registerLicence
);
router.patch(
  '/licences/:licenceId/review',
  authorize('COMPLIANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.recordLicenceReview
);

// ── Contracts ───────────────────────────────────────────────────────────────
router.post(
  '/contracts',
  authorize('CONTRACTS_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.createContractDraft
);
router.patch(
  '/contracts/:contractId/status',
  authorize('CONTRACTS_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.transitionContractStatus
);
router.post(
  '/contracts/:contractId/amend',
  authorize('CONTRACTS_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.amendContract
);
router.post(
  '/contracts/:contractId/obligations',
  authorize('CONTRACTS_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.addContractObligation
);
router.patch(
  '/contracts/:contractId/obligations/:obligationId',
  authorize('CONTRACTS_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.updateContractObligationStatus
);

// ── Insurance ───────────────────────────────────────────────────────────────
router.get(
  '/insurance/policies',
  authorize('COMPLIANCE_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.listPolicies
);
router.post(
  '/insurance/policies',
  authorize('COMPLIANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.createPolicy
);
router.post(
  '/insurance/claims',
  authorize('COMPLIANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.fileClaim
);
router.patch(
  '/insurance/claims/:claimId/status',
  authorize('COMPLIANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.transitionClaimStatus
);

module.exports = router;
