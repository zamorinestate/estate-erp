'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER MENU ENGINEERING & PRICING ROUTES (STAGE 12)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/ownerMenuPricingController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

router.use(authenticate);

// Menu Engineering Matrix & Economics
router.get(
  '/matrix',
  authorize('ADMIN_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  (req, res) => controller.getMenuEngineeringMatrix(req, res)
);

router.get(
  '/economics/:menuItemId',
  authorize('ADMIN_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  (req, res) => controller.getItemEconomics(req, res)
);

// Mathematical Price Simulation (pure projection, does NOT mutate POS)
router.post(
  '/simulate',
  authorize('ADMIN_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  (req, res) => controller.simulatePriceScenario(req, res)
);

// Governed Price Proposals
router.get(
  '/proposals',
  authorize('ADMIN_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  (req, res) => controller.listPriceProposals(req, res)
);

router.post(
  '/proposals',
  authorize('ADMIN_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  (req, res) => controller.createPriceProposal(req, res)
);

router.patch(
  '/proposals/:proposalId/status',
  authorize('ADMIN_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  (req, res) => controller.transitionPriceProposal(req, res)
);

// FSSAI 2020 Menu Labelling & Display Applicability
router.get(
  '/labelling/applicability',
  authorize('ADMIN_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  (req, res) => controller.evaluateMenuLabelling(req, res)
);

router.get(
  '/labelling/items/:menuItemId',
  authorize('ADMIN_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  (req, res) => controller.getItemLabellingDisplay(req, res)
);

// Promotions Analysis
router.get(
  '/promotions/analysis',
  authorize('ADMIN_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  (req, res) => controller.analyzePromotions(req, res)
);

module.exports = router;
