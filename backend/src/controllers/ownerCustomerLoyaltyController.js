'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER CUSTOMER & LOYALTY CONTROLLER (STAGE 13)
 * ============================================================================
 */

const ownerCustomerLoyaltyService = require('../services/ownerCustomerLoyaltyService');

class OwnerCustomerLoyaltyController {
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

  async getCustomerAnalytics(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const analytics = await ownerCustomerLoyaltyService.getCustomerAnalytics(organisationId, req.query);
      return res.status(200).json({ success: true, data: analytics });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getCohortDistribution(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const distribution = await ownerCustomerLoyaltyService.getCohortDistribution(organisationId);
      return res.status(200).json({ success: true, data: distribution });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async accrueLoyaltyPoints(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const result = await ownerCustomerLoyaltyService.accrueLoyaltyPoints(organisationId, req.body, user);
      return res.status(200).json({ success: true, data: result });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async redeemLoyaltyPoints(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const result = await ownerCustomerLoyaltyService.redeemLoyaltyPoints(organisationId, req.body, user);
      return res.status(200).json({ success: true, data: result });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async calculateLoyaltyExposure(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const exposure = await ownerCustomerLoyaltyService.calculateLoyaltyExposure(organisationId);
      return res.status(200).json({ success: true, data: exposure });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async calculateLoyaltyLiability(req, res) {
    return this.calculateLoyaltyExposure(req, res);
  }

  async verifyComplaintMarketingSeparation(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const status = await ownerCustomerLoyaltyService.verifyComplaintMarketingSeparation(organisationId, req.params.customerId);
      return res.status(200).json({ success: true, data: status });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async exportCustomerData(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const exportResult = await ownerCustomerLoyaltyService.exportCustomerData(organisationId, req.body, user);
      return res.status(200).json({ success: true, data: exportResult });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }
}

module.exports = new OwnerCustomerLoyaltyController();
