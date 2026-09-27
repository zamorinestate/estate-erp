'use strict';

const express = require('express');

const { authenticate } = require('../middleware/authenticate');
const {
  getPublicQrContext,
  getPublicLinkContext,
  resolveGateway,
  getAccessSummary,
  revealPermanentPin,
  rotateQr,
  regenerateQr,
  revokeQr,
  rotateLink,
  regenerateLink,
  emergencyLock,
  emergencyUnlock,
  runAccessTest,
  verifyCafeBinding,
  resetCafePin,
  disableAccess,
  enableAccess,
} = require('../controllers/cafeAccessController');

const router = express.Router();

// 1. Gateway Resolution (Public resolver: resolves QR, Link, or setup code to safe public context or Gateway Context)
router.get('/qr/:token', getPublicQrContext);
router.get('/c/:token', getPublicQrContext);
router.get('/link/:token', getPublicLinkContext);
router.post('/resolve', resolveGateway);

// 2. Post-auth Café Binding (Requires valid authentication)
router.use(authenticate);

router.post('/verify-binding', verifyCafeBinding);
router.get('/:cafeId', getAccessSummary);
router.post('/:cafeId/reveal-pin', revealPermanentPin);
router.post('/:cafeId/reset-pin', resetCafePin);
router.post('/:cafeId/rotate-qr', rotateQr);
router.post('/:cafeId/regenerate-qr', regenerateQr);
router.post('/:cafeId/revoke-qr', revokeQr);
router.post('/:cafeId/rotate-link', rotateLink);
router.post('/:cafeId/regenerate-link', regenerateLink);
router.post('/:cafeId/emergency-lock', emergencyLock);
router.post('/:cafeId/emergency-unlock', emergencyUnlock);
router.post('/:cafeId/disable', disableAccess);
router.post('/:cafeId/enable', enableAccess);
router.post('/:cafeId/test-access', runAccessTest);

module.exports = router;
