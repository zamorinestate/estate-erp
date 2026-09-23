'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER ASSET RELIABILITY CONTROLLER (STAGE 07)
 * ============================================================================
 */

const ownerAssetReliabilityService = require('../services/ownerAssetReliabilityService');

class OwnerAssetReliabilityController {
  _getAuth(req) {
    const auth = req.auth || req.user || req.authenticatedUser || {};
    return {
      organisationId: auth.organisationId,
      user: {
        userId: auth.userId || auth.email || 'OWNER',
        email: auth.email || 'owner@zamorincafe.com',
      },
    };
  }

  async reportBreakdown(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const breakdown = await ownerAssetReliabilityService.reportBreakdown(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: breakdown });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async updateBreakdownStatus(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const { breakdownId } = req.params;
      const updated = await ownerAssetReliabilityService.updateBreakdownStatus(organisationId, breakdownId, {
        ...req.body,
        user,
      });
      return res.status(200).json({ success: true, data: updated });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async createWorkOrder(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const wo = await ownerAssetReliabilityService.createWorkOrder(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: wo });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async updateWorkOrderStatus(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const { workOrderId } = req.params;
      const updated = await ownerAssetReliabilityService.updateWorkOrderStatus(organisationId, workOrderId, {
        ...req.body,
        user,
      });
      return res.status(200).json({ success: true, data: updated });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async recordCalibration(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const cal = await ownerAssetReliabilityService.recordCalibration(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: cal });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getAssetReliabilityMetrics(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const { assetId } = req.params;
      const periodDays = Number(req.query.periodDays) || 90;
      const metrics = await ownerAssetReliabilityService.getAssetReliabilityMetrics(organisationId, assetId, periodDays);
      return res.status(200).json({ success: true, data: metrics });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getReplacementIndicators(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const { assetId } = req.params;
      const indicators = await ownerAssetReliabilityService.getReplacementIndicators(organisationId, assetId);
      return res.status(200).json({ success: true, data: indicators });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async linkReplacementToCapex(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const { assetId } = req.params;
      const capex = await ownerAssetReliabilityService.linkReplacementToCapex(organisationId, assetId, req.body, user);
      return res.status(201).json({ success: true, data: capex });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getExecutiveReliabilityDashboard(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const { cafeId } = req.query;
      const dashboard = await ownerAssetReliabilityService.getExecutiveReliabilityDashboard(organisationId, cafeId);
      return res.status(200).json({ success: true, data: dashboard });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }
}

const controller = new OwnerAssetReliabilityController();
module.exports = {
  reportBreakdown: controller.reportBreakdown.bind(controller),
  updateBreakdownStatus: controller.updateBreakdownStatus.bind(controller),
  createWorkOrder: controller.createWorkOrder.bind(controller),
  updateWorkOrderStatus: controller.updateWorkOrderStatus.bind(controller),
  recordCalibration: controller.recordCalibration.bind(controller),
  getAssetReliabilityMetrics: controller.getAssetReliabilityMetrics.bind(controller),
  getReplacementIndicators: controller.getReplacementIndicators.bind(controller),
  linkReplacementToCapex: controller.linkReplacementToCapex.bind(controller),
  getExecutiveReliabilityDashboard: controller.getExecutiveReliabilityDashboard.bind(controller),
};
