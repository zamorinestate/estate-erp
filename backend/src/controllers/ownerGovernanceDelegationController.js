'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER GOVERNANCE & DELEGATION CONTROLLER (STAGE 15)
 * ============================================================================
 */

const ownerGovernanceDelegationService = require('../services/ownerGovernanceDelegationService');

class OwnerGovernanceDelegationController {
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

  async getLegalStructureStatus(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const status = await ownerGovernanceDelegationService.getLegalStructureStatus(organisationId);
      return res.status(200).json({ success: true, data: status });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async createMeeting(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const meeting = await ownerGovernanceDelegationService.createMeeting(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: meeting });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async finaliseMeetingMinutes(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const meeting = await ownerGovernanceDelegationService.finaliseMeetingMinutes(organisationId, req.params.meetingId, req.body.minutesContent, user);
      return res.status(200).json({ success: true, data: meeting });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async proposeResolution(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const resolution = await ownerGovernanceDelegationService.proposeResolution(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: resolution });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async transitionResolution(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const { status, notes } = req.body;
      const updated = await ownerGovernanceDelegationService.transitionResolution(organisationId, req.params.resolutionId, status, user, notes);
      return res.status(200).json({ success: true, data: updated });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async recordDecision(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const decision = await ownerGovernanceDelegationService.recordDecision(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: decision });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async grantDelegation(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const delegation = await ownerGovernanceDelegationService.grantDelegation(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: delegation });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async revokeDelegation(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const revoked = await ownerGovernanceDelegationService.revokeDelegation(organisationId, req.params.delegationId, req.body.reason, user);
      return res.status(200).json({ success: true, data: revoked });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async checkDelegatedAuthority(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const result = await ownerGovernanceDelegationService.checkDelegatedAuthority(organisationId, req.body);
      return res.status(200).json({ success: true, data: result });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async registerSignatory(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const signatory = await ownerGovernanceDelegationService.registerSignatory(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: signatory });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async recordConflictDeclaration(req, res) {
    try {
      const { organisationId, user } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const declaration = await ownerGovernanceDelegationService.recordConflictDeclaration(organisationId, req.body, user);
      return res.status(201).json({ success: true, data: declaration });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async checkCounterpartyConflict(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const conflict = await ownerGovernanceDelegationService.checkCounterpartyConflict(organisationId, req.query.counterpartyName);
      return res.status(200).json({ success: true, data: conflict });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getGovernanceDashboard(req, res) {
    try {
      const { organisationId } = this._getAuth(req);
      if (!organisationId) return res.status(401).json({ success: false, error: 'ORGANISATION_REQUIRED' });

      const dashboard = await ownerGovernanceDelegationService.getGovernanceDashboard(organisationId);
      return res.status(200).json({ success: true, data: dashboard });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }
}

module.exports = new OwnerGovernanceDelegationController();
