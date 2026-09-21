'use strict';

const express = require('express');

const {
  authenticate,
} = require('../middleware/authenticate');

const {
  listCafes,
  getCafe,
  createCafe,
  updateCafe,
  changeCafeStatus,
  archiveCafe,
  getCafeReadiness,
  updateReadinessChecklist,
  transitionLifecycleState,
  getComplianceAlerts,
  regenerateCafeLoginQr,
  downloadPrintableQrCardPdf,
  getCafeComplianceAndLicences,
  validateCafe,
  previewCafe,
  createDraft,
  updateDraft,
  provisionCafe,
  verifyCafe,
  activateCafe,
  listCafeTemplates,
  createCafeTemplate,
  previewTemplateOverrides,
  applyTemplateToCafe,
} = require('../controllers/cafeController');

const router = express.Router();

router.use(authenticate);

router.get('/compliance/alerts', getComplianceAlerts);

// Café Configuration Templates
router.get('/templates', listCafeTemplates);
router.post('/templates', createCafeTemplate);

// REC-02: Multi-stage New Café Onboarding Lifecycle Endpoints
router.post('/validate', validateCafe);
router.post('/preview', previewCafe);
router.post('/draft', createDraft);
router.put('/:cafeId/draft', updateDraft);
router.post('/:cafeId/provision', provisionCafe);
router.post('/:cafeId/verify', verifyCafe);
router.post('/:cafeId/activate', activateCafe);

// Template preview and apply per cafe
router.get('/:cafeId/template-preview', previewTemplateOverrides);
router.post('/:cafeId/apply-template', applyTemplateToCafe);

router
  .route('/')
  .get(listCafes)
  .post(createCafe);

router
  .route('/:cafeId')
  .get(getCafe)
  .patch(updateCafe);

router.patch(
  '/:cafeId/status',
  changeCafeStatus
);

router.post(
  '/:cafeId/archive',
  archiveCafe
);

// Stage 03: Café Readiness Engine & Lifecycle States
router.get(
  '/:cafeId/readiness',
  getCafeReadiness
);

router.post(
  '/:cafeId/readiness/checklist',
  updateReadinessChecklist
);

router.post(
  '/:cafeId/readiness/transition',
  transitionLifecycleState
);

router.get(
  '/:cafeId/compliance-alerts',
  getComplianceAlerts
);

router.get(
  '/:cafeId/compliance-licences',
  getCafeComplianceAndLicences
);

// Stage 03: Stage 02 Universal QR Integration & A4 Printable Card
router.post(
  '/:cafeId/qr/regenerate',
  regenerateCafeLoginQr
);

router.get(
  '/:cafeId/qr/card',
  downloadPrintableQrCardPdf
);

module.exports = router;