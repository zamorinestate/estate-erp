'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER MASTER DATA CONTROLLER (STAGE 10)
 * ============================================================================
 */

const ownerMasterDataService = require('../services/ownerMasterDataService');

class OwnerMasterDataController {
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

  async getDomains(req, res) {
    try {
      const domains = await ownerMasterDataService.getDomainCatalogue();
      return res.status(200).json({ success: true, data: domains });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async recordDuplicateCandidate(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const candidate = await ownerMasterDataService.recordDuplicateCandidate(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: candidate });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async progressMergeWorkflow(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const { candidateId } = req.params;
      const updated = await ownerMasterDataService.progressMergeWorkflow(organisationId, candidateId, {
        ...req.body,
        user,
      });
      return res.status(200).json({ success: true, data: updated });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async submitChangeRequest(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const cr = await ownerMasterDataService.submitChangeRequest(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: cr });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async reviewChangeRequest(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const { requestId } = req.params;
      const reviewed = await ownerMasterDataService.reviewChangeRequest(organisationId, requestId, {
        ...req.body,
        user,
      });
      return res.status(200).json({ success: true, data: reviewed });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async deactivateRecord(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) {
        return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });
      }
      const { domainCode, recordId } = req.params;
      const deactivated = await ownerMasterDataService.deactivateMasterRecord(organisationId, domainCode, recordId, {
        ...req.body,
        user,
      });
      return res.status(200).json({ success: true, data: deactivated });
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
      const dashboard = await ownerMasterDataService.getExecutiveMasterDataDashboard(organisationId);
      return res.status(200).json({ success: true, data: dashboard });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }
}

const controller = new OwnerMasterDataController();
module.exports = {
  getDomains: controller.getDomains.bind(controller),
  recordDuplicateCandidate: controller.recordDuplicateCandidate.bind(controller),
  progressMergeWorkflow: controller.progressMergeWorkflow.bind(controller),
  submitChangeRequest: controller.submitChangeRequest.bind(controller),
  reviewChangeRequest: controller.reviewChangeRequest.bind(controller),
  deactivateRecord: controller.deactivateRecord.bind(controller),
  getExecutiveDashboard: controller.getExecutiveDashboard.bind(controller),
};
