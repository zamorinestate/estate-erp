'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER BCDR CONTROLLER (STAGE 09)
 * ============================================================================
 */

const ownerBcdrService = require('../services/ownerBcdrService');

class OwnerBcdrController {
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

  async registerBusinessProcess(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const process = await ownerBcdrService.registerBusinessProcess(organisationId, req.body);
      return res.status(201).json({ success: true, data: process });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getBusinessProcesses(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const list = await ownerBcdrService.getBusinessProcesses(organisationId);
      return res.status(200).json({ success: true, data: list });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async planDrill(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const drill = await ownerBcdrService.planDrill(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: drill });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async updateDrillStatus(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const { drillId } = req.params;
      const updated = await ownerBcdrService.updateDrillStatus(organisationId, drillId, {
        ...req.body,
        user,
      });
      return res.status(200).json({ success: true, data: updated });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getBackupStatus(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const status = await ownerBcdrService.getBackupStatus(organisationId);
      return res.status(200).json({ success: true, data: status });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async validateSaleSyncState(req, res) {
    try {
      const validation = ownerBcdrService.validateSaleSyncState(req.body);
      return res.status(200).json({ success: true, data: validation });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getCafeContinuityPlan(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const cafeId = req.params.cafeId ? String(req.params.cafeId).trim().toUpperCase() : null;
      const plan = await ownerBcdrService.getCafeContinuityPlan(organisationId, cafeId);
      return res.status(200).json({ success: true, data: plan });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getExecutiveDashboard(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const dashboard = await ownerBcdrService.getExecutiveBcdrDashboard(organisationId);
      return res.status(200).json({ success: true, data: dashboard });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }
}

const controller = new OwnerBcdrController();
module.exports = {
  registerBusinessProcess: controller.registerBusinessProcess.bind(controller),
  getBusinessProcesses: controller.getBusinessProcesses.bind(controller),
  planDrill: controller.planDrill.bind(controller),
  updateDrillStatus: controller.updateDrillStatus.bind(controller),
  getBackupStatus: controller.getBackupStatus.bind(controller),
  validateSaleSyncState: controller.validateSaleSyncState.bind(controller),
  getCafeContinuityPlan: controller.getCafeContinuityPlan.bind(controller),
  getExecutiveDashboard: controller.getExecutiveDashboard.bind(controller),
};
