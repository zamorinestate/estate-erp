'use strict';

const { ComplianceObligation } = require('../models/ComplianceObligation');
const { BusinessLicence } = require('../models/BusinessLicence');
const { BusinessContract } = require('../models/BusinessContract');
const { ContractObligation } = require('../models/ContractObligation');
const { InsurancePolicy } = require('../models/InsurancePolicy');
const { InsuranceClaim } = require('../models/InsuranceClaim');
const { auditService } = require('./auditService');

class OwnerComplianceService {
  // ── 1. COMPLIANCE OBLIGATIONS ──────────────────────────────────────────────

  async createObligation(organisationId, data, actor) {
    if (!organisationId) throw new Error('organisationId is required');
    if (!data.obligationId || !data.authority || !data.source || !data.requirementSummary) {
      throw new Error('Missing mandatory obligation fields (obligationId, authority, source, requirementSummary)');
    }

    // Determine current/future effective state
    const now = new Date();
    let initialStatus = data.status || 'NOT_ASSESSED';
    if (data.futureCommencementDate && new Date(data.futureCommencementDate) > now) {
      initialStatus = 'UPCOMING';
    }

    const obligation = new ComplianceObligation({
      ...data,
      organisationId,
      status: initialStatus,
    });

    await obligation.save();

    if (auditService && auditService.recordEvent) {
      await auditService.recordEvent({
        actorId: actor?.id || actor?.userId || 'SYSTEM',
        action: 'COMPLIANCE_OBLIGATION_CREATED',
        organisationId,
        details: { obligationId: obligation.obligationId, domain: obligation.domain },
      }).catch(() => {});
    }

    return obligation;
  }

  async getObligations(organisationId, filters = {}) {
    const query = { organisationId, isDeleted: false };
    if (filters.domain) query.domain = filters.domain;
    if (filters.status) query.status = filters.status;
    if (filters.cafeId) query.applicableCafes = filters.cafeId;

    const obligations = await ComplianceObligation.find(query).sort({ effectiveDate: -1, createdAt: -1 });

    // Dynamic state decoration
    const now = new Date();
    return obligations.map((o) => {
      const doc = o.toObject ? o.toObject() : o;
      if (doc.futureCommencementDate && new Date(doc.futureCommencementDate) > now) {
        doc.effectiveState = 'FUTURE_EFFECTIVE';
      } else if (doc.dueDate && new Date(doc.dueDate) < now && doc.status !== 'COMPLETED') {
        doc.effectiveState = 'OVERDUE';
      } else {
        doc.effectiveState = 'IN_FORCE';
      }
      return doc;
    });
  }

  async updateObligationStatus(organisationId, obligationId, newStatus, actor) {
    const obligation = await ComplianceObligation.findOne({ organisationId, obligationId, isDeleted: false });
    if (!obligation) throw new Error('Compliance obligation not found');

    const previousStatus = obligation.status;
    obligation.status = newStatus;
    await obligation.save();

    if (auditService && auditService.recordEvent) {
      await auditService.recordEvent({
        actorId: actor?.id || actor?.userId || 'SYSTEM',
        action: 'COMPLIANCE_OBLIGATION_STATUS_CHANGED',
        organisationId,
        details: { obligationId, previousStatus, newStatus },
      }).catch(() => {});
    }

    return obligation;
  }

  // ── 2. LICENCE / PERMIT GOVERNANCE ──────────────────────────────────────────

  async registerLicence(organisationId, data, actor) {
    if (!organisationId) throw new Error('organisationId is required');
    if (!data.licenceId || !data.licenceType || !data.authority || !data.referenceNumber) {
      throw new Error('Missing mandatory licence parameters');
    }

    // Safety rule: Perpetual licences must NOT have false renewal/expiry fabricated
    if (data.isPerpetual) {
      data.expiryDate = null;
      data.renewalPeriodDays = null;
    }

    const licence = new BusinessLicence({
      ...data,
      organisationId,
    });

    await licence.save();

    if (auditService && auditService.recordEvent) {
      await auditService.recordEvent({
        actorId: actor?.id || actor?.userId || 'SYSTEM',
        action: 'BUSINESS_LICENCE_REGISTERED',
        organisationId,
        details: { licenceId: licence.licenceId, licenceType: licence.licenceType, isPerpetual: licence.isPerpetual },
      }).catch(() => {});
    }

    return licence;
  }

  async getLicences(organisationId, filters = {}) {
    const query = { organisationId, isDeleted: false };
    if (filters.cafeId) query.cafeId = filters.cafeId;
    if (filters.licenceType) query.licenceType = filters.licenceType;
    if (filters.status) query.status = filters.status;

    return BusinessLicence.find(query).sort({ issueDate: -1 });
  }

  async recordLicenceReview(organisationId, licenceId, reviewData, actor) {
    const licence = await BusinessLicence.findOne({ organisationId, licenceId, isDeleted: false });
    if (!licence) throw new Error('Licence record not found');

    licence.nextReviewDate = reviewData.nextReviewDate || new Date(Date.now() + 365 * 86400000);
    if (reviewData.status) licence.status = reviewData.status;
    if (reviewData.conditions) licence.conditions = reviewData.conditions;
    await licence.save();

    return licence;
  }

  // ── 3. CONTRACT MASTER & VERSIONING ─────────────────────────────────────────

  static get CONTRACT_VALID_TRANSITIONS() {
    return {
      DRAFT: ['REVIEW'],
      REVIEW: ['APPROVAL', 'DRAFT'],
      APPROVAL: ['EXECUTION_PENDING', 'DRAFT'],
      EXECUTION_PENDING: ['EXECUTED', 'DRAFT'],
      EXECUTED: ['ACTIVE'],
      ACTIVE: ['RENEWAL_REVIEW', 'TERMINATED', 'EXPIRED'],
      RENEWAL_REVIEW: ['RENEWED', 'TERMINATED', 'EXPIRED'],
      RENEWED: ['ACTIVE'],
      EXPIRED: [],
      TERMINATED: [],
    };
  }

  async createContractDraft(organisationId, data, actor) {
    if (!organisationId) throw new Error('organisationId is required');
    if (!data.contractId || !data.title || !data.counterpartyName) {
      throw new Error('Missing mandatory contract draft fields');
    }

    const contract = new BusinessContract({
      ...data,
      organisationId,
      status: 'DRAFT',
      version: 1,
      lineage: [
        {
          version: 1,
          amendmentType: 'ORIGINAL',
          amendedAt: new Date(),
          amendedBy: actor?.id || 'OWNER',
          changeSummary: 'Initial Contract Execution Draft',
        },
      ],
    });

    await contract.save();
    return contract;
  }

  async transitionContractStatus(organisationId, contractId, newStatus, actor) {
    const contract = await BusinessContract.findOne({ organisationId, contractId, isDeleted: false });
    if (!contract) throw new Error('Contract not found');

    const validNextStates = OwnerComplianceService.CONTRACT_VALID_TRANSITIONS[contract.status] || [];
    if (!validNextStates.includes(newStatus)) {
      throw new Error(`Illegal contract status transition from ${contract.status} to ${newStatus}`);
    }

    const previousStatus = contract.status;
    contract.status = newStatus;
    if (newStatus === 'EXECUTED' && !contract.executedDate) {
      contract.executedDate = new Date();
    }
    await contract.save();

    if (auditService && auditService.recordEvent) {
      await auditService.recordEvent({
        actorId: actor?.id || actor?.userId || 'SYSTEM',
        action: 'CONTRACT_STATUS_TRANSITION',
        organisationId,
        details: { contractId, previousStatus, newStatus },
      }).catch(() => {});
    }

    return contract;
  }

  async amendContract(organisationId, contractId, amendmentData, actor) {
    const contract = await BusinessContract.findOne({ organisationId, contractId, isDeleted: false });
    if (!contract) throw new Error('Contract not found');

    // Never overwrite historical text/metadata: bump version and append to lineage
    const nextVersion = contract.version + 1;
    contract.version = nextVersion;
    contract.lineage.push({
      version: nextVersion,
      amendmentType: amendmentData.amendmentType || 'AMENDMENT',
      amendedAt: new Date(),
      amendedBy: actor?.id || 'OWNER',
      changeSummary: amendmentData.changeSummary || 'Formal Contract Amendment',
      documentId: amendmentData.documentId || null,
    });

    if (amendmentData.title) contract.title = amendmentData.title;
    if (amendmentData.commercialValue !== undefined) contract.commercialValue = amendmentData.commercialValue;
    if (amendmentData.endDate) contract.endDate = amendmentData.endDate;
    if (amendmentData.renewalNoticeDays) contract.renewalNoticeDays = amendmentData.renewalNoticeDays;

    await contract.save();
    return contract;
  }

  async addContractObligation(organisationId, contractId, data) {
    const contract = await BusinessContract.findOne({ organisationId, contractId, isDeleted: false });
    if (!contract) throw new Error('Contract not found');

    const obligation = new ContractObligation({
      ...data,
      organisationId,
      contractId,
      status: 'PENDING',
    });

    await obligation.save();
    return obligation;
  }

  async updateContractObligationStatus(organisationId, contractId, obligationId, status, observation, breachDetails = null) {
    const obligation = await ContractObligation.findOne({ organisationId, contractId, obligationId });
    if (!obligation) throw new Error('Contract obligation not found');

    if (status === 'BREACHED') {
      if (!breachDetails || !breachDetails.reviewer || !breachDetails.evidence || !breachDetails.reason) {
        throw new Error('LEGAL_BREACH_DECISION_REQUIRES_AUTHORISATION_EVIDENCE_AND_REVIEWER');
      }
      obligation.breachDecision = {
        reviewer: breachDetails.reviewer,
        evidence: breachDetails.evidence,
        reason: breachDetails.reason,
        authority: breachDetails.authority || 'LEGAL_COUNSEL',
        date: new Date(),
      };
    }

    obligation.status = status;
    if (observation) obligation.exceptionObservation = observation;
    await obligation.save();
    return obligation;
  }

  // ── 4. INSURANCE POLICY & CLAIMS ───────────────────────────────────────────

  static get CLAIM_VALID_TRANSITIONS() {
    return {
      INCIDENT_RECORDED: ['CLAIM_ASSESSMENT'],
      CLAIM_ASSESSMENT: ['DOCUMENTS_PENDING', 'SUBMITTED', 'WITHDRAWN'],
      DOCUMENTS_PENDING: ['SUBMITTED', 'WITHDRAWN'],
      SUBMITTED: ['ACKNOWLEDGEMENT'],
      ACKNOWLEDGEMENT: ['ASSESSMENT'],
      ASSESSMENT: ['DECISION'],
      DECISION: ['SETTLEMENT_PENDING', 'REJECTED', 'CLOSED'],
      SETTLEMENT_PENDING: ['SETTLED', 'CLOSED'],
      SETTLED: ['CLOSED'],
      REJECTED: ['CLOSED'],
      WITHDRAWN: ['CLOSED'],
      CLOSED: [],
    };
  }

  async createPolicy(organisationId, data, actor) {
    if (!organisationId) throw new Error('organisationId is required');
    if (!data.policyId || !data.policyNumber || !data.insurerName || !data.sumInsured) {
      throw new Error('Missing mandatory insurance policy fields');
    }

    const policy = new InsurancePolicy({
      ...data,
      organisationId,
    });

    await policy.save();
    return policy;
  }

  async getPolicies(organisationId, filters = {}) {
    const query = { organisationId, isDeleted: false };
    if (filters.cafeId) query.insuredCafeId = filters.cafeId;
    if (filters.policyType) query.policyType = filters.policyType;
    return InsurancePolicy.find(query).sort({ endDate: 1 });
  }

  async fileClaim(organisationId, data, actor) {
    if (!organisationId) throw new Error('organisationId is required');
    if (!data.claimId || !data.policyId || !data.estimatedLoss || !data.claimedAmount) {
      throw new Error('Missing mandatory insurance claim fields');
    }

    const policy = await InsurancePolicy.findOne({ organisationId, policyId: data.policyId, isDeleted: false });
    if (!policy) throw new Error(`Insurance policy ${data.policyId} does not exist in organisation`);

    const claim = new InsuranceClaim({
      ...data,
      organisationId,
      status: 'INCIDENT_RECORDED',
    });

    await claim.save();
    return claim;
  }

  async transitionClaimStatus(organisationId, claimId, newStatus, metadata = {}, actor) {
    const claim = await InsuranceClaim.findOne({ organisationId, claimId, isDeleted: false });
    if (!claim) throw new Error('Insurance claim not found');

    const validNext = OwnerComplianceService.CLAIM_VALID_TRANSITIONS[claim.status] || [];
    if (!validNext.includes(newStatus)) {
      throw new Error(`Illegal insurance claim transition from ${claim.status} to ${newStatus}`);
    }

    if (newStatus === 'REJECTED') {
      if (!metadata.rejectionReason && !metadata.insurerReference && !metadata.evidenceDocumentId) {
        throw new Error('INSURER_REPUDIATION_REQUIRES_COMMUNICATION_OR_EVIDENCE');
      }
    }

    claim.status = newStatus;
    if (metadata.rejectionReason) claim.rejectionReason = metadata.rejectionReason;
    if (metadata.insurerReference) claim.insurerReference = metadata.insurerReference;
    if (metadata.settlementAmount !== undefined) claim.settlementAmount = metadata.settlementAmount;
    if (metadata.surveyorDetails) claim.surveyorDetails = metadata.surveyorDetails;

    await claim.save();
    return claim;
  }

  // ── 5. EXECUTIVE GOVERNANCE DASHBOARD ──────────────────────────────────────

  async getExecutiveComplianceSummary(organisationId, cafeId = null) {
    const baseQuery = { organisationId, isDeleted: false };
    const cafeQuery = cafeId ? { ...baseQuery, cafeId } : baseQuery;

    const [obligations, licences, contracts, claims, policies] = await Promise.all([
      ComplianceObligation.find(baseQuery),
      BusinessLicence.find(cafeQuery),
      BusinessContract.find(cafeQuery),
      InsuranceClaim.find(cafeQuery),
      InsurancePolicy.find(cafeQuery),
    ]);

    const now = new Date();
    const overdueObligations = obligations.filter((o) => o.dueDate && new Date(o.dueDate) < now && o.status !== 'COMPLETED').length;
    const actionRequiredObligations = obligations.filter((o) => o.status === 'ACTION_REQUIRED' || o.status === 'EVIDENCE_PENDING').length;
    const perpetualLicences = licences.filter((l) => l.isPerpetual).length;
    const expiringContracts = contracts.filter((c) => {
      if (!c.endDate || c.status !== 'ACTIVE') return false;
      const daysRemaining = (new Date(c.endDate) - now) / (1000 * 60 * 60 * 24);
      return daysRemaining > 0 && daysRemaining <= (c.renewalNoticeDays || 30);
    }).length;
    const activeClaims = claims.filter((cl) => !['SETTLED', 'REJECTED', 'CLOSED', 'WITHDRAWN'].includes(cl.status)).length;
    const totalLossEstimated = claims.reduce((acc, c) => acc + (c.estimatedLoss || 0), 0);
    const totalSettledAmount = claims.reduce((acc, c) => acc + (c.settlementAmount || 0), 0);

    return {
      obligations: {
        total: obligations.length,
        overdue: overdueObligations,
        actionRequired: actionRequiredObligations,
        completed: obligations.filter((o) => o.status === 'COMPLETED').length,
      },
      licences: {
        total: licences.length,
        active: licences.filter((l) => l.status === 'ACTIVE').length,
        perpetual: perpetualLicences,
        reviewPending: licences.filter((l) => l.nextReviewDate && new Date(l.nextReviewDate) <= now).length,
      },
      contracts: {
        total: contracts.length,
        active: contracts.filter((c) => c.status === 'ACTIVE').length,
        expiringWithinNotice: expiringContracts,
        draftOrReview: contracts.filter((c) => ['DRAFT', 'REVIEW', 'APPROVAL'].includes(c.status)).length,
      },
      insurance: {
        policiesActive: policies.filter((p) => p.status === 'ACTIVE').length,
        activeClaims,
        totalLossEstimated,
        totalSettledAmount,
      },
    };
  }
}

const ownerComplianceService = new OwnerComplianceService();

module.exports = {
  OwnerComplianceService,
  ownerComplianceService,
};
