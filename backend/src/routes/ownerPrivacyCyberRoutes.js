'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER DATA PRIVACY & CYBERSECURITY ROUTES (STAGE 08)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/ownerPrivacyCyberController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

// All privacy & cybersecurity routes require authentication
router.use(authenticate);

// Executive Dashboard & DPDP Schedule
router.get(
  '/dashboard',
  authorize('SECURITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getExecutiveDashboard
);
router.get(
  '/dpdp-schedule',
  authorize('SECURITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getDpdpSchedule
);

// RoPA / Personal Data Processing Register
router.post(
  '/processing-registers',
  authorize('SECURITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.createProcessingRegister
);
router.get(
  '/processing-registers',
  authorize('SECURITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getProcessingRegisters
);

// Data Principal Request Evaluation (Statutory Retention vs Erasure)
router.post(
  '/requests',
  authorize('PRIVACY_REQUEST', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'] }),
  controller.submitPrivacyRequest
);
router.get(
  '/requests/my',
  authorize('PRIVACY_REQUEST', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'] }),
  controller.getMyPrivacyRequests
);
router.get(
  '/requests/:requestId/discover-data',
  authorize('SECURITY_READ', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.discoverPersonalDataForRequest
);
router.post(
  '/requests/evaluate-erasure',
  authorize('SECURITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.evaluateErasureSafety
);
router.patch(
  '/requests/:requestId/action',
  authorize('SECURITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.handlePrivacyRequestAction
);

// Third-Party Processors
router.post(
  '/processors',
  authorize('SECURITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.registerProcessor
);
router.get(
  '/processors',
  authorize('SECURITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getProcessors
);

// Privacy Incidents & Governed Response (Single canonical incident entry point across all roles)
router.post(
  '/incidents',
  authorize('SECURITY_WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'] }),
  controller.reportPrivacyIncident
);
router.patch(
  '/incidents/:incidentId/status',
  authorize('SECURITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.updatePrivacyIncidentStatus
);

// NIST CSF 2.0 Security Controls
router.post(
  '/security-controls',
  authorize('SECURITY_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.registerSecurityControl
);
router.get(
  '/security-controls',
  authorize('SECURITY_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getSecurityControls
);

module.exports = router;
