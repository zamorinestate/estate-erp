'use strict';

const express = require('express');

const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const {
  getAdminOverview,
  getGovernanceWorkQueue,
  listAdminRequests,
  submitAdminRequest,
  decideAdminRequest,
  listAccessReviews,
  createAccessReview,
  decideAccessFinding,
  listServiceIdentities,
} = require('../controllers/adminGovernanceController');

const router = express.Router();

router.use(authenticate);
router.use(authorize(['MASTER', 'OWNER']));

// Overview & Work Queue (Master & Owner)
router.get('/overview', getAdminOverview);
router.get('/work-queue', getGovernanceWorkQueue);

// Administrative Requests (Request Primary Action)
router.get('/requests', listAdminRequests);
router.post('/requests', submitAdminRequest);
router.patch('/requests/:requestId/decision', decideAdminRequest);

// Access Reviews & Certifications
router.get('/access-reviews', listAccessReviews);
router.post('/access-reviews', createAccessReview);
router.patch('/access-reviews/:reviewId/findings/:targetUserId', decideAccessFinding);

// Service & Integration Identities
router.get('/service-identities', listServiceIdentities);

module.exports = router;
