'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER RISK & AUDIT ROUTES (STAGE 02)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const OwnerRiskAuditController = require('../controllers/ownerRiskAuditController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

// Enforce authentication on all routes
router.use(authenticate);

// Dashboard
router.get(
  '/dashboard',
  authorize('AUDIT_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerRiskAuditController.getDashboard
);

// Methodology Configuration (Requirement 17)
router.get(
  '/methodology',
  authorize('AUDIT_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerRiskAuditController.getRiskMethodology
);
router.put(
  '/methodology',
  authorize('AUDIT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerRiskAuditController.updateRiskMethodology
);

// Risk Register
router.get(
  '/risks',
  authorize('AUDIT_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerRiskAuditController.listRisks
);
router.post(
  '/risks',
  authorize('AUDIT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerRiskAuditController.createRisk
);
router.post(
  '/risks/candidates',
  authorize('AUDIT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerRiskAuditController.createRiskCandidate
);
router.post(
  '/risks/:riskId/confirm',
  authorize('AUDIT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerRiskAuditController.confirmRiskCandidate
);
router.patch(
  '/risks/:riskId',
  authorize('AUDIT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerRiskAuditController.updateRisk
);

// Control Library
router.get(
  '/controls',
  authorize('AUDIT_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerRiskAuditController.listControls
);
router.post(
  '/controls',
  authorize('AUDIT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerRiskAuditController.createControl
);
router.post(
  '/controls/:controlId/assess',
  authorize('AUDIT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerRiskAuditController.assessControl
);
router.patch(
  '/controls/:controlId/assess',
  authorize('AUDIT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerRiskAuditController.assessControl
);
router.patch(
  '/controls/:controlId/assessment',
  authorize('AUDIT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerRiskAuditController.assessControl
);

// Audit Plans & Procedures
router.post(
  '/audits/plan',
  authorize('AUDIT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerRiskAuditController.createAuditPlan
);
router.post(
  '/audits/:auditId/procedures/:procedureId/execute',
  authorize('AUDIT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerRiskAuditController.executeProcedure
);

// Audit Findings / Observations
router.get(
  '/observations',
  authorize('AUDIT_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerRiskAuditController.listObservations
);
router.post(
  '/observations',
  authorize('AUDIT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerRiskAuditController.createObservation
);
router.post(
  '/observations/:findingId/transition',
  authorize('AUDIT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerRiskAuditController.transitionObservation
);

// Operational Anomaly Cases (Zero accusation rule)
router.get(
  '/anomalies/rules',
  authorize('AUDIT_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerRiskAuditController.getAnomalyRules
);
router.get(
  '/anomalies',
  authorize('AUDIT_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerRiskAuditController.listAnomalies
);
router.post(
  '/anomalies',
  authorize('AUDIT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerRiskAuditController.recordAnomaly
);
router.post(
  '/anomalies/:caseId/review',
  authorize('AUDIT_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerRiskAuditController.reviewAnomaly
);

module.exports = router;
