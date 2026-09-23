'use strict';

const { ownerSupplierIntelligenceService } = require('../services/ownerSupplierIntelligenceService');

function getAuth(req) {
  return req.auth || req.user || req.authenticatedUser || {};
}

async function getSupplier360(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const { vendorId } = req.params;
    const dossier = await ownerSupplierIntelligenceService.getSupplier360(organisationId, vendorId, auth);
    return res.status(200).json({ success: true, data: dossier });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function getProcurementAnalytics(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const analytics = await ownerSupplierIntelligenceService.getProcurementAnalytics(organisationId, req.query);
    return res.status(200).json({ success: true, data: analytics });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function getSupplierDependencyRisk(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const risk = await ownerSupplierIntelligenceService.getSupplierDependencyRisk(organisationId);
    return res.status(200).json({ success: true, data: risk });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function createActionPlan(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const actionPlan = await ownerSupplierIntelligenceService.createActionPlan(organisationId, req.body, auth);
    return res.status(201).json({ success: true, data: actionPlan });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function updateActionPlanStatus(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const { actionId } = req.params;
    const { status, evidenceNotes, closureReason } = req.body;
    const updated = await ownerSupplierIntelligenceService.updateActionPlanStatus(
      organisationId,
      actionId,
      status,
      { evidenceNotes, closureReason },
      auth
    );
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function updateScorecardConfig(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const config = await ownerSupplierIntelligenceService.updateScorecardConfig(organisationId, req.body, auth);
    return res.status(200).json({ success: true, data: config });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

module.exports = {
  getSupplier360,
  getProcurementAnalytics,
  getSupplierDependencyRisk,
  createActionPlan,
  updateActionPlanStatus,
  updateScorecardConfig,
};
