'use strict';

const express = require('express');
const router = express.Router();
const controller = require('../controllers/ownerAcademyController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

router.use(authenticate);

// ── Academy Executive Overview ──────────────────────────────────────────────
router.get(
  '/overview',
  authorize('TRAINING_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.getAcademySummary
);

// ── Standard Operating Procedures (SOP) ─────────────────────────────────────
router.get(
  '/sops',
  authorize('TRAINING_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'] }),
  controller.listSops
);

router.post(
  '/sops',
  authorize('TRAINING_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.createSop
);

router.patch(
  '/sops/:sopId/status',
  authorize('TRAINING_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.transitionSopStatus
);

router.post(
  '/sops/:sopId/amend',
  authorize('TRAINING_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.amendSop
);

// ── SOP Acknowledgements ───────────────────────────────────────────────────
router.post(
  '/sops/:sopId/assign-acknowledgements',
  authorize('TRAINING_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.assignSopAcknowledgements
);

router.post(
  '/sops/:sopId/acknowledge',
  authorize('TRAINING_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'] }),
  controller.recordAcknowledgement
);

// ── Training Courses & Competency Assessments ──────────────────────────────
router.get(
  '/courses',
  authorize('TRAINING_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'] }),
  controller.listCourses
);

router.post(
  '/courses',
  authorize('TRAINING_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.createCourse
);

router.post(
  '/competency/:userId/:competencyId/attendance',
  authorize('TRAINING_WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  controller.recordTrainingAttendance
);

router.post(
  '/competency/:userId/:competencyId/assessment',
  authorize('TRAINING_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  controller.assessCompetency
);

module.exports = router;
