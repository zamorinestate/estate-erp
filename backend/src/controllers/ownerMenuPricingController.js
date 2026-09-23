'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER MENU PRICING CONTROLLER (STAGE 12)
 * ============================================================================
 */

const ownerMenuPricingService = require('../services/ownerMenuPricingService');
const MenuPriceProposalModule = require('../models/MenuPriceProposal');
const MenuPriceProposal = MenuPriceProposalModule.MenuPriceProposal || MenuPriceProposalModule;

class OwnerMenuPricingController {
  _getAuth(req) {
    const auth = req.auth || req.user || req.authenticatedUser || {};
    return {
      organisationId: auth.organisationId,
      user: {
        userId: auth.userId || auth.id || auth.email || 'USER',
        email: auth.email || 'user@zamorincafe.com',
        role: auth.role || auth.userType || 'OWNER'
      }
    };
  }

  async getItemEconomics(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const economics = await ownerMenuPricingService.getItemEconomics(organisationId, req.params.menuItemId, req.query.cafeId);
      return res.status(200).json({ success: true, data: economics });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getMenuEngineeringMatrix(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const matrix = await ownerMenuPricingService.getMenuEngineeringMatrix(organisationId, req.query);
      return res.status(200).json({ success: true, data: matrix });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async simulatePriceScenario(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const simulation = await ownerMenuPricingService.simulatePriceScenario(organisationId, req.body);
      return res.status(200).json({ success: true, data: simulation });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async createPriceProposal(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const proposal = await ownerMenuPricingService.createPriceProposal(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: proposal });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async transitionPriceProposal(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const { status, notes } = req.body;
      const updated = await ownerMenuPricingService.transitionPriceProposal(organisationId, req.params.proposalId, status, user, notes);
      return res.status(200).json({ success: true, data: updated });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async listPriceProposals(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const query = { $or: [{ organisationId }, { organisationId: organisationId.toString() }] };
      if (req.query.cafeId) query.cafeId = req.query.cafeId;
      if (req.query.status) query.status = req.query.status;

      const proposals = await MenuPriceProposal.find(query).sort({ createdAt: -1 });
      return res.status(200).json({ success: true, data: proposals });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  async evaluateMenuLabelling(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const record = await ownerMenuPricingService.evaluateMenuLabellingApplicability(organisationId, req.query.cafeId);
      return res.status(200).json({ success: true, data: record });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getItemLabellingDisplay(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const display = await ownerMenuPricingService.getItemLabellingDisplay(organisationId, req.params.menuItemId);
      return res.status(200).json({ success: true, data: display });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async analyzePromotions(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const analysis = await ownerMenuPricingService.analyzePromotions(organisationId, req.query);
      return res.status(200).json({ success: true, data: analysis });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }
}

module.exports = new OwnerMenuPricingController();
