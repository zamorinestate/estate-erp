'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER UTILITIES & WASTE CONTROLLER (STAGE 14)
 * ============================================================================
 */

const ownerUtilitiesWasteService = require('../services/ownerUtilitiesWasteService');

class OwnerUtilitiesWasteController {
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

  async registerMeter(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const meter = await ownerUtilitiesWasteService.registerMeter(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: meter });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async recordMeterReading(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const reading = await ownerUtilitiesWasteService.recordMeterReading(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: reading });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async recordWaste(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const record = await ownerUtilitiesWasteService.recordWaste(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: record });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async recordUsedCookingOil(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const result = await ownerUtilitiesWasteService.recordUsedCookingOil(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: result });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async evaluateSWM2026Applicability(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const record = await ownerUtilitiesWasteService.evaluateSWM2026Applicability(organisationId, req.params.cafeId);
      return res.status(200).json({ success: true, data: record });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getUtilitiesDashboard(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const dashboard = await ownerUtilitiesWasteService.getUtilitiesDashboard(organisationId, req.query);
      return res.status(200).json({ success: true, data: dashboard });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }
}

module.exports = new OwnerUtilitiesWasteController();
