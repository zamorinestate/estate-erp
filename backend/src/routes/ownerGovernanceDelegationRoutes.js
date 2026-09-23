'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER GOVERNANCE & DELEGATION ROUTES (STAGE 15)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/ownerGovernanceDelegationController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

router.use(authenticate);

// Governance Dashboard & Legal Structure Status
router.get(
  '/dashboard',
  authorize('ADMIN_READ', { allowedRoles: ['MASTER', 'OWNER'] }),
  (req, res) => controller.getGovernanceDashboard(req, res)
);

router.get(
  '/legal-structure',
  authorize('ADMIN_READ', { allowedRoles: ['MASTER', 'OWNER'] }),
  (req, res) => controller.getLegalStructureStatus(req, res)
);

// Meetings & Immutable Minutes (SHA-256 sealed)
router.post(
  '/meetings',
  authorize('ADMIN_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  (req, res) => controller.createMeeting(req, res)
);

router.post(
  '/meetings/:meetingId/minutes/finalise',
  authorize('ADMIN_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  (req, res) => controller.finaliseMeetingMinutes(req, res)
);

// Governance Resolutions
router.post(
  '/resolutions',
  authorize('ADMIN_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  (req, res) => controller.proposeResolution(req, res)
);

router.patch(
  '/resolutions/:resolutionId/status',
  authorize('ADMIN_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  (req, res) => controller.transitionResolution(req, res)
);

// Strategic Decisions
router.post(
  '/decisions',
  authorize('ADMIN_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  (req, res) => controller.recordDecision(req, res)
);

// Delegation of Authority (Strict limits, least-privilege, no root escalation)
router.post(
  '/delegations',
  authorize('ADMIN_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  (req, res) => controller.grantDelegation(req, res)
);

router.post(
  '/delegations/:delegationId/revoke',
  authorize('ADMIN_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  (req, res) => controller.revokeDelegation(req, res)
);

router.post(
  '/delegations/check-authority',
  authorize('ADMIN_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STORE_MANAGER'] }),
  (req, res) => controller.checkDelegatedAuthority(req, res)
);

// Authorised Signatories (Evidence only, ZERO secrets/PINs)
router.post(
  '/signatories',
  authorize('ADMIN_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  (req, res) => controller.registerSignatory(req, res)
);

// Conflict of Interest Declarations (Sec 184)
router.post(
  '/conflicts',
  authorize('ADMIN_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  (req, res) => controller.recordConflictDeclaration(req, res)
);

router.get(
  '/conflicts/check',
  authorize('ADMIN_READ', { allowedRoles: ['MASTER', 'OWNER'] }),
  (req, res) => controller.checkCounterpartyConflict(req, res)
);

module.exports = router;
