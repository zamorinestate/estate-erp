'use strict';

const { ownerComplianceService } = require('../services/ownerComplianceService');

function getAuth(req) {
  return req.auth || req.user || req.authenticatedUser || {};
}

async function getDashboardSummary(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const cafeId = req.query.cafeId || null;
    const summary = await ownerComplianceService.getExecutiveComplianceSummary(organisationId, cafeId);
    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

// ── Obligations ─────────────────────────────────────────────────────────────

async function createObligation(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const obligation = await ownerComplianceService.createObligation(organisationId, req.body, auth);
    return res.status(201).json({ success: true, data: obligation });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function listObligations(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const obligations = await ownerComplianceService.getObligations(organisationId, req.query);
    return res.status(200).json({ success: true, data: obligations });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function updateObligationStatus(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const { obligationId } = req.params;
    const { status } = req.body;
    const obligation = await ownerComplianceService.updateObligationStatus(organisationId, obligationId, status, auth);
    return res.status(200).json({ success: true, data: obligation });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

// ── Licences ────────────────────────────────────────────────────────────────

async function registerLicence(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const licence = await ownerComplianceService.registerLicence(organisationId, req.body, auth);
    return res.status(201).json({ success: true, data: licence });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function listLicences(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const licences = await ownerComplianceService.getLicences(organisationId, req.query);
    return res.status(200).json({ success: true, data: licences });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function recordLicenceReview(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const { licenceId } = req.params;
    const licence = await ownerComplianceService.recordLicenceReview(organisationId, licenceId, req.body, auth);
    return res.status(200).json({ success: true, data: licence });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

// ── Contracts ───────────────────────────────────────────────────────────────

async function createContractDraft(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const contract = await ownerComplianceService.createContractDraft(organisationId, req.body, auth);
    return res.status(201).json({ success: true, data: contract });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function transitionContractStatus(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const { contractId } = req.params;
    const { status } = req.body;
    const contract = await ownerComplianceService.transitionContractStatus(organisationId, contractId, status, auth);
    return res.status(200).json({ success: true, data: contract });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function amendContract(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const { contractId } = req.params;
    const contract = await ownerComplianceService.amendContract(organisationId, contractId, req.body, auth);
    return res.status(200).json({ success: true, data: contract });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function addContractObligation(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const { contractId } = req.params;
    const obligation = await ownerComplianceService.addContractObligation(organisationId, contractId, req.body);
    return res.status(201).json({ success: true, data: obligation });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function updateContractObligationStatus(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const { contractId, obligationId } = req.params;
    const { status, observation, breachDetails } = req.body;
    const obligation = await ownerComplianceService.updateContractObligationStatus(
      organisationId,
      contractId,
      obligationId,
      status,
      observation,
      breachDetails
    );
    return res.status(200).json({ success: true, data: obligation });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

// ── Insurance ───────────────────────────────────────────────────────────────

async function createPolicy(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const policy = await ownerComplianceService.createPolicy(organisationId, req.body, auth);
    return res.status(201).json({ success: true, data: policy });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function listPolicies(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const policies = await ownerComplianceService.getPolicies(organisationId, req.query);
    return res.status(200).json({ success: true, data: policies });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function fileClaim(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const claim = await ownerComplianceService.fileClaim(organisationId, req.body, auth);
    return res.status(201).json({ success: true, data: claim });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function transitionClaimStatus(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const { claimId } = req.params;
    const { status, rejectionReason, settlementAmount, surveyorDetails } = req.body;
    const claim = await ownerComplianceService.transitionClaimStatus(
      organisationId,
      claimId,
      status,
      { rejectionReason, settlementAmount, surveyorDetails },
      auth
    );
    return res.status(200).json({ success: true, data: claim });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

module.exports = {
  getDashboardSummary,
  createObligation,
  listObligations,
  updateObligationStatus,
  registerLicence,
  listLicences,
  recordLicenceReview,
  createContractDraft,
  transitionContractStatus,
  amendContract,
  addContractObligation,
  updateContractObligationStatus,
  createPolicy,
  listPolicies,
  fileClaim,
  transitionClaimStatus,
};
