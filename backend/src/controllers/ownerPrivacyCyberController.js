'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER DATA PRIVACY & CYBERSECURITY CONTROLLER (STAGE 08)
 * ============================================================================
 */

const ownerPrivacyCyberService = require('../services/ownerPrivacyCyberService');

class OwnerPrivacyCyberController {
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

  async getDpdpSchedule(req, res) {
    try {
      const schedule = ownerPrivacyCyberService.getDpdpCommencementSchedule();
      return res.status(200).json({ success: true, data: schedule });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async createProcessingRegister(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const register = await ownerPrivacyCyberService.createDataProcessingRegister(organisationId, req.body);
      return res.status(201).json({ success: true, data: register });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getProcessingRegisters(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const list = await ownerPrivacyCyberService.getDataProcessingRegisters(organisationId, req.query);
      return res.status(200).json({ success: true, data: list });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async evaluateErasureSafety(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const evaluation = await ownerPrivacyCyberService.evaluateErasureSafety(organisationId, req.body);
      return res.status(200).json({ success: true, data: evaluation });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async handlePrivacyRequestAction(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const { requestId } = req.params;
      const updated = await ownerPrivacyCyberService.handlePrivacyRequestAction(organisationId, requestId, {
        ...req.body,
        user,
      });
      return res.status(200).json({ success: true, data: updated });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async submitPrivacyRequest(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const request = await ownerPrivacyCyberService.submitPrivacyRequest(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: request });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getMyPrivacyRequests(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const list = await ownerPrivacyCyberService.getMyPrivacyRequests(organisationId, user.userId);
      return res.status(200).json({ success: true, data: list });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async discoverPersonalDataForRequest(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const { requestId } = req.params;
      const discovered = await ownerPrivacyCyberService.discoverPersonalDataForRequest(organisationId, requestId);
      return res.status(200).json({ success: true, data: discovered });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async registerProcessor(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const processor = await ownerPrivacyCyberService.registerThirdPartyProcessor(organisationId, req.body);
      return res.status(201).json({ success: true, data: processor });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getProcessors(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const list = await ownerPrivacyCyberService.getThirdPartyProcessors(organisationId);
      return res.status(200).json({ success: true, data: list });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async reportPrivacyIncident(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const incident = await ownerPrivacyCyberService.reportPrivacyIncident(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: incident });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async updatePrivacyIncidentStatus(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const { incidentId } = req.params;
      const updated = await ownerPrivacyCyberService.updatePrivacyIncidentStatus(organisationId, incidentId, {
        ...req.body,
        user,
      });
      return res.status(200).json({ success: true, data: updated });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async registerSecurityControl(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const control = await ownerPrivacyCyberService.registerSecurityControl(organisationId, req.body);
      return res.status(201).json({ success: true, data: control });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getSecurityControls(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const { csfFunction } = req.query;
      const list = await ownerPrivacyCyberService.getSecurityControls(organisationId, csfFunction);
      return res.status(200).json({ success: true, data: list });
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
      const dashboard = await ownerPrivacyCyberService.getExecutivePrivacyCyberDashboard(organisationId);
      return res.status(200).json({ success: true, data: dashboard });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }
}

const controller = new OwnerPrivacyCyberController();
module.exports = {
  getDpdpSchedule: controller.getDpdpSchedule.bind(controller),
  createProcessingRegister: controller.createProcessingRegister.bind(controller),
  getProcessingRegisters: controller.getProcessingRegisters.bind(controller),
  evaluateErasureSafety: controller.evaluateErasureSafety.bind(controller),
  handlePrivacyRequestAction: controller.handlePrivacyRequestAction.bind(controller),
  submitPrivacyRequest: controller.submitPrivacyRequest.bind(controller),
  getMyPrivacyRequests: controller.getMyPrivacyRequests.bind(controller),
  discoverPersonalDataForRequest: controller.discoverPersonalDataForRequest.bind(controller),
  registerProcessor: controller.registerProcessor.bind(controller),
  getProcessors: controller.getProcessors.bind(controller),
  reportPrivacyIncident: controller.reportPrivacyIncident.bind(controller),
  updatePrivacyIncidentStatus: controller.updatePrivacyIncidentStatus.bind(controller),
  registerSecurityControl: controller.registerSecurityControl.bind(controller),
  getSecurityControls: controller.getSecurityControls.bind(controller),
  getExecutiveDashboard: controller.getExecutiveDashboard.bind(controller),
};
