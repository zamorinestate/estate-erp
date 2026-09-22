'use strict';

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const {
  getWorkforceOverview,
  listEmployees,
  getEmployee360,
  onboardEmployee,
  setEmployeeCredentials,
  updateEmployeeProfile,
  createEmployeeMovement,
  submitProbationReview,
  addEmployeeSkill,
  assignEmployeeTraining,
  listFoodSafetyTrainings,
  generateEmployeeLetter,
  initiateOffboarding,
  deleteEmployeeAccount,
  getWorkforceIntegrity,
  listPositions,
  createPosition,
  listStaffingRequests,
  createStaffingRequest,
  getSelfDashboard,
  getSelfProfile,
  updateSelfProfile,
  listSelfChangeRequests,
  createSelfChangeRequest,
  withdrawSelfChangeRequest,
  getSelfProfileHistory,
  submitSelfProfileAttestation,
  listSelfDocuments,
  uploadSelfDocument,
  downloadSelfDocument,
  deleteSelfDocument,
  exportProfileSummary,
  searchEmployees,
  getEmployeeProfile,
  registerEmployeeExtended,
  getEmployeeReadiness,
  updateEmployeeReadiness,
  transitionEmployeeLifecycleState,
  generateEmployeeBadgeQrCode,
  getEmployeeComplianceAlertsController,
  viewSensitiveFieldUnmasked,
  getSelfTrainingAndCompetency,
  acknowledgeSopSelf,
  getTeamTrainingGaps,
} = require('../controllers/employeeController');

const router = express.Router();

router.use(authenticate);

// 1. Overview & Workforce KPIs
router.get(
  '/overview',
  authorize('EMPLOYEE:READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  getWorkforceOverview
);

// 2. Positions & Org Structure
router.get(
  '/positions',
  authorize('EMPLOYEE:READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  listPositions
);
router.post(
  '/positions',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  createPosition
);

// 3. Staffing Requests
router.get(
  '/staffing-requests',
  authorize('EMPLOYEE:READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  listStaffingRequests
);
router.post(
  '/staffing-requests',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  createStaffingRequest
);

// 4. Workforce Integrity Checks
router.get(
  '/integrity',
  authorize('EMPLOYEE:READ', { allowedRoles: ['MASTER', 'OWNER'] }),
  getWorkforceIntegrity
);

// 5. Employee Directory Listing & Search
router.get(
  '/',
  authorize('EMPLOYEE:READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  listEmployees
);

router.get(
  '/search',
  authorize('EMPLOYEE:READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  searchEmployees
);

// 6. Onboard New Employee
router.post(
  '/',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  onboardEmployee
);

// Set / Reset Employee Credentials (Password & Operator PIN)
router.post(
  '/:userId/credentials',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  setEmployeeCredentials
);

// Update Employee Profile (Position, Window, Department, Café & Details)
router.patch(
  '/:userId',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  updateEmployeeProfile
);

// Stage 04: 9-Section Extended Registration
router.post(
  '/register',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  registerEmployeeExtended
);

// Stage 04: Compliance Alerts (Document and Training Expiries)
router.get(
  '/alerts/compliance',
  authorize('EMPLOYEE:READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  getEmployeeComplianceAlertsController
);

// 7. Self Employee Dashboard & Self Profile (Self-Scoped Endpoints)
router.get(
  '/me/dashboard',
  authorize('EMPLOYEE:READ_SELF', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.auth?.userId,
    selfOnly: true,
  }),
  getSelfDashboard
);

router.get(
  '/me',
  authorize('EMPLOYEE:READ_SELF', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.auth?.userId,
    selfOnly: true,
  }),
  getSelfProfile
);

router.patch(
  '/me',
  authorize('EMPLOYEE:WRITE_SELF', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.auth?.userId,
    selfOnly: true,
  }),
  updateSelfProfile
);

router.get(
  '/me/change-requests',
  authorize('EMPLOYEE:READ_SELF', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.auth?.userId,
    selfOnly: true,
  }),
  listSelfChangeRequests
);

router.post(
  '/me/change-requests',
  authorize('EMPLOYEE:WRITE_SELF', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.auth?.userId,
    selfOnly: true,
  }),
  createSelfChangeRequest
);

router.post(
  '/me/change-requests/:requestId/withdraw',
  authorize('EMPLOYEE:WRITE_SELF', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.auth?.userId,
    selfOnly: true,
  }),
  withdrawSelfChangeRequest
);

router.get(
  '/me/history',
  authorize('EMPLOYEE:READ_SELF', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.auth?.userId,
    selfOnly: true,
  }),
  getSelfProfileHistory
);

router.post(
  '/me/attestation',
  authorize('EMPLOYEE:WRITE_SELF', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.auth?.userId,
    selfOnly: true,
  }),
  submitSelfProfileAttestation
);

router.get(
  '/me/documents',
  authorize('EMPLOYEE:READ_SELF', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.auth?.userId,
    selfOnly: true,
  }),
  listSelfDocuments
);

router.post(
  '/me/documents/upload',
  authorize('EMPLOYEE:WRITE_SELF', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.auth?.userId,
    selfOnly: true,
  }),
  uploadSelfDocument
);

router.get(
  '/me/documents/:documentId/download',
  authorize('EMPLOYEE:READ_SELF', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.auth?.userId,
    selfOnly: true,
  }),
  downloadSelfDocument
);

router.delete(
  '/me/documents/:documentId',
  authorize('EMPLOYEE:WRITE_SELF', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.auth?.userId,
    selfOnly: true,
  }),
  deleteSelfDocument
);

router.get(
  '/me/profile-summary/export',
  authorize('EMPLOYEE:READ_SELF', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.auth?.userId,
    selfOnly: true,
  }),
  exportProfileSummary
);

// Stage 06 Contextual: Employee Self Training & Competency
router.get(
  '/me/training',
  authorize('EMPLOYEE:READ_SELF', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.auth?.userId,
    selfOnly: true,
  }),
  getSelfTrainingAndCompetency
);

router.post(
  '/me/sops/:sopId/acknowledge',
  authorize('EMPLOYEE:WRITE_SELF', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.auth?.userId,
    selfOnly: true,
  }),
  acknowledgeSopSelf
);

// Stage 06 Contextual: Manager / Team Training Gaps (Authorized Café Scoped)
router.get(
  '/team/training',
  authorize('EMPLOYEE:READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  getTeamTrainingGaps
);

// 8. Individual Employee Profile (Administrative Access & Staff Self-Read)
router.get(
  '/:userId',
  authorize('EMPLOYEE:READ', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.params?.userId,
  }),
  getEmployee360
);

router.get(
  '/:userId/360',
  authorize('EMPLOYEE:READ', {
    allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    targetUserIdResolver: (req) => req.params?.userId,
  }),
  getEmployee360
);

// 9. Employee Movements (Transfer / Promotion / Acting)
router.post(
  '/:userId/movements',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  createEmployeeMovement
);

// 10. Probation Review
router.post(
  '/:userId/probation',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  submitProbationReview
);

// 11. Skills Verification
router.post(
  '/:userId/skills',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  addEmployeeSkill
);

// 12. Training Assignment & Food Safety Verification (R02-05)
router.get(
  '/food-safety/trainings',
  authorize('EMPLOYEE:READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  listFoodSafetyTrainings
);

router.post(
  '/:userId/training',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  assignEmployeeTraining
);

// 13. Document & HR Letter Generation
router.post(
  '/:userId/documents/generate',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  generateEmployeeLetter
);

// 14. Offboarding Initiation & Permanent Account Deletion
router.post(
  '/:userId/offboard',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  initiateOffboarding
);

router.delete(
  '/:userId',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  deleteEmployeeAccount
);

router.post(
  '/:userId/delete',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  deleteEmployeeAccount
);

// ── Stage 04: Onboarding Readiness Checklist ─────────────────────────────────
router.get(
  '/:userId/readiness',
  authorize('EMPLOYEE:READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  getEmployeeReadiness
);

router.patch(
  '/:userId/readiness',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  updateEmployeeReadiness
);

// ── Stage 04: Employee Lifecycle State Transition ───────────────────────────
router.post(
  '/:userId/lifecycle',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  transitionEmployeeLifecycleState
);

// ── Stage 04: Generate / Rotate Universal QR Employee Badge ──────────────────
router.post(
  '/:userId/qr/generate',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  generateEmployeeBadgeQrCode
);

// ── Stage 04: DPDP Act 2023 / Rules 2025 Sensitive Field View with Audit ─────
router.post(
  '/:userId/sensitive/view',
  authorize('EMPLOYEE:WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  viewSensitiveFieldUnmasked
);

module.exports = router;
