'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER MASTER DATA GOVERNANCE ROUTES (STAGE 10)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/ownerMasterDataController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

// All master data governance routes require authentication
router.use(authenticate);

// Executive Dashboard & Domain Catalogue
router.get(
  '/dashboard',
  authorize('ADMIN_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getExecutiveDashboard
);
router.get(
  '/domains',
  authorize('ADMIN_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getDomains
);

// Duplicate Candidate Management & Governed Merge Workflow
router.post(
  '/duplicates',
  authorize('ADMIN_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.recordDuplicateCandidate
);
router.patch(
  '/duplicates/:candidateId/status',
  authorize('ADMIN_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.progressMergeWorkflow
);

// High-Risk Master Change Requests (Maker-Checker Enforced)
router.post(
  '/change-requests',
  authorize('ADMIN_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.submitChangeRequest
);
router.patch(
  '/change-requests/:requestId/review',
  authorize('ADMIN_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.reviewChangeRequest
);

// Governed Soft Deactivation
router.post(
  '/domains/:domainCode/records/:recordId/deactivate',
  authorize('ADMIN_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.deactivateRecord
);

module.exports = router;
