'use strict';

const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { attachDeviceContext } = require('../middleware/deviceContext');
const deviceController = require('../controllers/deviceController');
const deviceEnrollmentRoutes = require('../cafe-operations/routes/deviceEnrollmentRoutes');

// Canonical Stage-2 Device Enrollment alias (/enroll, /status, /policy)
router.use('/', deviceEnrollmentRoutes);

// List devices for cafe / fleet management
router.get(
  '/',
  authenticate,
  authorize('CAFE:MANAGE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  attachDeviceContext,
  (req, res, next) => deviceController.listDevices(req, res, next)
);

// 1. Device Enrollment Initialization (Tablet creates pending enrollment)
router.post('/enrollment/start', (req, res, next) => deviceController.startEnrollment(req, res, next));

// 2. Device Enrollment Approval (MASTER only + Step-up Auth)
router.post(
  '/:deviceId/approve',
  authenticate,
  authorize('USER:MANAGE'),
  attachDeviceContext,
  (req, res, next) => deviceController.approveEnrollment(req, res, next)
);

// 3. Emergency Device Revocation (MASTER only + Step-up Auth)
router.post(
  '/:deviceId/revoke',
  authenticate,
  authorize('USER:MANAGE'),
  attachDeviceContext,
  (req, res, next) => deviceController.revokeDevice(req, res, next)
);

// 3b. Mark Device as Lost
router.post(
  '/:deviceId/lost',
  authenticate,
  authorize('USER:MANAGE'),
  attachDeviceContext,
  (req, res, next) => deviceController.reportDeviceLost(req, res, next)
);

// 3c. Retire Device
router.post(
  '/:deviceId/retire',
  authenticate,
  authorize('USER:MANAGE'),
  attachDeviceContext,
  (req, res, next) => deviceController.retireDevice(req, res, next)
);

// 3d. Replace Device
router.post(
  '/:deviceId/replace',
  authenticate,
  authorize('USER:MANAGE'),
  attachDeviceContext,
  (req, res, next) => deviceController.replaceDevice(req, res, next)
);

// Attendance QR issuance is canonicalized under GET /devices/attendance/qr via deviceEnrollmentRoutes.

// 5. Issue Offline Signing Lease (CAFE_ADMIN / MASTER on CAFE_OWNED device)
router.post(
  '/attendance/leases',
  authenticate,
  attachDeviceContext,
  (req, res, next) => deviceController.issueOfflineLease(req, res, next)
);

module.exports = router;
