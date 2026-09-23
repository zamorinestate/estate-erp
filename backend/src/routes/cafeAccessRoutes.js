'use strict';

const express = require('express');

const { authenticate } = require('../middleware/authenticate');
const {
  getPublicQrContext,
  resolveGateway,
  getAccessSummary,
  revealPermanentPin,
  rotateQr,
  revokeQr,
  rotateLink,
  emergencyLock,
  emergencyUnlock,
  runAccessTest,
  verifyCafeBinding,
} = require('../controllers/cafeAccessController');

const router = express.Router();

// 1. Gateway Resolution (Public resolver: resolves QR, Link, or setup code to safe public context or Gateway Context)
router.get('/qr/:token', getPublicQrContext);
router.get('/c/:token', getPublicQrContext);
router.post('/resolve', resolveGateway);

// 2. Post-auth Café Binding (Requires valid authentication)
router.use(authenticate);

router.post('/verify-binding', verifyCafeBinding);
router.get('/:cafeId', getAccessSummary);
router.post('/:cafeId/reveal-pin', revealPermanentPin);
router.post('/:cafeId/rotate-qr', rotateQr);
router.post('/:cafeId/revoke-qr', revokeQr);
router.post('/:cafeId/rotate-link', rotateLink);
router.post('/:cafeId/emergency-lock', emergencyLock);
router.post('/:cafeId/emergency-unlock', emergencyUnlock);
router.post('/:cafeId/test-access', runAccessTest);

module.exports = router;
