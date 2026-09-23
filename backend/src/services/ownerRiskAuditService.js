'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER RISK, INTERNAL AUDIT & FRAUD CONTROL SERVICE (STAGE 02)
 * ============================================================================
 * Authoritative business service for enterprise risks, control library,
 * internal audit programs, observations lifecycle, and operational anomaly review.
 *
 * CRITICAL SAFETY RULES:
 * 1. Absolute fraud-safety rule: System must NEVER accuse anyone of fraud or
 *    automatically apply disciplinary action/salary deductions.
 * 2. Inherent vs Residual risk strictly separated.
 * 3. Human review decides anomaly disposition; false positives are retained for audit.
 * 4. Audit observation lifecycle is strictly validated server-side.
 */

const { EnterpriseRisk } = require('../models/EnterpriseRisk');
const { ControlLibraryItem } = require('../models/ControlLibraryItem');
const { InternalAuditPlan } = require('../models/InternalAuditPlan');
const { AuditObservation } = require('../models/AuditObservation');
const { OperationalAnomalyCase } = require('../models/OperationalAnomalyCase');

const ORGANISATION_RISK_METHODOLOGIES = new Map();

const DEFAULT_RISK_METHODOLOGY = {
  version: '5X5_MATRIX_V1',
  effectiveDate: '2026-01-01',
  likelihoodScale: { min: 1, max: 5, step: 1, labels: ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'] },
  impactScale: { min: 1, max: 5, step: 1, labels: ['Insignificant', 'Minor', 'Moderate', 'Major', 'Catastrophic'] },
  scoreMethod: 'PRODUCT', // 'PRODUCT' (L x I) or 'SUM' (L + I)
  bands: [
    { min: 1, max: 4, severity: 'LOW', label: 'Low Risk' },
    { min: 5, max: 9, severity: 'MEDIUM', label: 'Medium Risk' },
    { min: 10, max: 14, severity: 'HIGH', label: 'High Risk' },
    { min: 15, max: 25, severity: 'CRITICAL', label: 'Critical Risk' },
  ],
};

class OwnerRiskAuditService {
  /**
   * Configurable risk methodology management (Requirement 17)
   */
  static getOrganisationRiskMethodology(organisationId) {
    const cleanOrg = (organisationId || '').toUpperCase();
    return ORGANISATION_RISK_METHODOLOGIES.get(cleanOrg) || { ...DEFAULT_RISK_METHODOLOGY };
  }

  static setOrganisationRiskMethodology(organisationId, config) {
    const cleanOrg = (organisationId || '').toUpperCase();
    const updated = {
      ...DEFAULT_RISK_METHODOLOGY,
      ...config,
      version: config.version || `CUSTOM_MATRIX_${Date.now()}`,
      effectiveDate: config.effectiveDate || new Date().toISOString().slice(0, 10),
    };
    ORGANISATION_RISK_METHODOLOGIES.set(cleanOrg, updated);
    return updated;
  }

  /**
   * Calculate risk score and rating using configurable methodology
   */
  static calculateRiskScore(likelihood, impact, organisationIdOrConfig = null) {
    let config = DEFAULT_RISK_METHODOLOGY;
    if (typeof organisationIdOrConfig === 'string') {
      config = this.getOrganisationRiskMethodology(organisationIdOrConfig);
    } else if (organisationIdOrConfig && typeof organisationIdOrConfig === 'object') {
      config = { ...DEFAULT_RISK_METHODOLOGY, ...organisationIdOrConfig };
    }

    const minL = config.likelihoodScale?.min || 1;
    const maxL = config.likelihoodScale?.max || 5;
    const minI = config.impactScale?.min || 1;
    const maxI = config.impactScale?.max || 5;

    const l = Math.min(Math.max(Number(likelihood) || minL, minL), maxL);
    const i = Math.min(Math.max(Number(impact) || minI, minI), maxI);

    const score = config.scoreMethod === 'SUM' ? (l + i) : (l * i);

    let rating = 'LOW';
    if (Array.isArray(config.bands)) {
      for (const band of config.bands) {
        if (score >= band.min && score <= band.max) {
          rating = band.severity;
          break;
        }
      }
    } else {
      if (score >= 17) rating = 'CRITICAL';
      else if (score >= 10) rating = 'HIGH';
      else if (score >= 5) rating = 'MEDIUM';
    }

    return { likelihood: l, impact: i, score, rating, methodologyVersion: config.version };
  }

  /**
   * Automatic Stage 01 -> Stage 02 Risk Candidate Creation (Requirement 18)
   * Surfaces a candidate risk requiring human confirmation before formal approval.
   */
  static async createRiskCandidateFromIncident({
    organisationId,
    cafeId,
    incidentId,
    incidentTitle,
    recallId,
    suggestedLikelihood = 4,
    suggestedImpact = 4,
    rationale,
    actorId = 'FOOD_SAFETY_SYSTEM',
  }) {
    if (!organisationId || !incidentId) {
      const err = new Error('organisationId and incidentId are required');
      err.statusCode = 400;
      throw err;
    }

    const count = await EnterpriseRisk.countDocuments({ organisationId });
    const riskId = `RSK-CAND-${String(count + 1).padStart(4, '0')}`;

    const methodology = this.getOrganisationRiskMethodology(organisationId);
    const suggestedScore = this.calculateRiskScore(suggestedLikelihood, suggestedImpact, methodology);

    const risk = new EnterpriseRisk({
      riskId,
      organisationId,
      cafeId: cafeId || null,
      domain: 'FOOD_SAFETY_HYGIENE',
      title: `[Candidate] Risk Review: ${incidentTitle || incidentId}`,
      description: rationale || `Operational incident ${incidentId} flagged as potential enterprise risk candidate for review.`,
      businessObjective: 'Food Safety & Regulatory Compliance',
      inherentLikelihood: suggestedScore.likelihood,
      inherentImpact: suggestedScore.impact,
      inherentScore: suggestedScore.score,
      inherentSeverity: suggestedScore.rating,
      residualLikelihood: suggestedScore.likelihood,
      residualImpact: suggestedScore.impact,
      residualScore: suggestedScore.score,
      residualSeverity: suggestedScore.rating,
      riskOwnerUserId: actorId,
      reviewDate: new Date(Date.now() + 14 * 86400000),
      treatment: 'MITIGATE',
      status: 'UNDER_REVIEW', // Candidate state, requires human review before formal approval
      scoringMethodologyVersion: methodology.version,
      linkedIncidentIds: [incidentId],
      linkedRecallIds: recallId ? [recallId] : [],
      auditHistory: [
        {
          action: 'RISK_CANDIDATE_FLAGGED_FROM_INCIDENT',
          performedBy: actorId,
          performedAt: new Date(),
          rationale: rationale || `Candidate flagged from ${incidentId}; requires human confirmation before formal approval.`,
        },
      ],
    });

    await risk.save();
    return risk;
  }

  static async confirmRiskCandidate({
    riskId,
    organisationId,
    confirmedLikelihood,
    confirmedImpact,
    confirmedTreatment,
    treatmentPlan,
    responsibleOwner,
    actorId,
    notes,
  }) {
    const risk = await EnterpriseRisk.findOne({ riskId, organisationId });
    if (!risk) {
      const err = new Error(`Risk candidate ${riskId} not found`);
      err.statusCode = 404;
      throw err;
    }

    const inherent = this.calculateRiskScore(confirmedLikelihood || risk.inherentLikelihood, confirmedImpact || risk.inherentImpact, organisationId);
    risk.inherentLikelihood = inherent.likelihood;
    risk.inherentImpact = inherent.impact;
    risk.inherentScore = inherent.score;
    risk.inherentSeverity = inherent.rating;

    risk.residualLikelihood = inherent.likelihood;
    risk.residualImpact = inherent.impact;
    risk.residualScore = inherent.score;
    risk.residualSeverity = inherent.rating;

    if (confirmedTreatment) risk.treatment = confirmedTreatment;
    if (treatmentPlan) risk.treatmentPlan = treatmentPlan;
    if (responsibleOwner) risk.riskOwnerUserId = responsibleOwner;
    risk.status = 'ACTIVE';

    risk.auditHistory.push({
      action: 'RISK_CANDIDATE_CONFIRMED_BY_HUMAN',
      performedBy: actorId,
      performedAt: new Date(),
      rationale: notes || 'Formally approved and incorporated into active Enterprise Risk Register by authorized human owner.',
    });

    await risk.save();
    return risk;
  }

  /**
   * Governed Anomaly Rule Catalogue across all 11 required domains (Requirements 14, 15, 16)
   */
  static getAnomalyRuleCatalogue(organisationId = null) {
    return [
      {
        ruleId: 'ANO-RULE-001',
        name: 'Excessive Refunds Detection',
        description: 'Monitors total refunds exceeding daily threshold or refund volume spikes per register/cashier',
        authoritativeSource: 'Bill & Refund Transactions (POS/Billing Ledger)',
        threshold: 'Refunds > ₹5,000 or > 5 refunds in single shift',
        lookbackPeriod: '24 Hours',
        scope: 'CAFE',
        severity: 'HIGH',
        rationale: 'Protects against unapproved cash outflows and inventory shrink',
        version: '1.0.0',
        effectiveDate: '2026-01-01',
        enabled: true,
      },
      {
        ruleId: 'ANO-RULE-002',
        name: 'Repeated Bill Voids Pattern',
        description: 'Detects post-kitchen-print line voids and bill cancellations without supervisor override key',
        authoritativeSource: 'Order Line Voids & Cancellation Audit Stream',
        threshold: '> 3 order item voids per shift without documented waste disposition',
        lookbackPeriod: '24 Hours',
        scope: 'CAFE',
        severity: 'MEDIUM',
        rationale: 'Identifies potential discrepancies between prep queue and collected tenders',
        version: '1.0.0',
        effectiveDate: '2026-01-01',
        enabled: true,
      },
      {
        ruleId: 'ANO-RULE-003',
        name: 'Unusual Discounts & Comp Pattern',
        description: 'Detects manual price overrides and complimentary items outside promotional campaigns',
        authoritativeSource: 'Bill Discount Audit Ledger',
        threshold: 'Discount > 20% on non-promotional SKU or staff discount off-duty',
        lookbackPeriod: '48 Hours',
        scope: 'CAFE',
        severity: 'MEDIUM',
        rationale: 'Prevents unauthorized margin erosion while maintaining customer goodwill discretion',
        version: '1.0.0',
        effectiveDate: '2026-01-01',
        enabled: true,
      },
      {
        ruleId: 'ANO-RULE-004',
        name: 'Duplicate Expense Entries',
        description: 'Flags petty cash and vendor expense submissions matching identical amount, vendor, and date window',
        authoritativeSource: 'Petty Cash & Operating Expense Submissions',
        threshold: 'Identical amount ± 3 days with matching vendor/category',
        lookbackPeriod: '7 Days',
        scope: 'ORGANISATION',
        severity: 'HIGH',
        rationale: 'Prevents double-reimbursement and bookkeeping duplication',
        version: '1.0.0',
        effectiveDate: '2026-01-01',
        enabled: true,
      },
      {
        ruleId: 'ANO-RULE-005',
        name: 'Duplicate Payment Transactions',
        description: 'Scans vendor disbursements and bank payouts for matching invoice reference and payment amount',
        authoritativeSource: 'Accounts Payable Disbursement Register',
        threshold: 'Same supplier and invoice reference with multiple payout records',
        lookbackPeriod: '30 Days',
        scope: 'ORGANISATION',
        severity: 'CRITICAL',
        rationale: 'Enforces treasury controls against duplicate vendor settlement',
        version: '1.0.0',
        effectiveDate: '2026-01-01',
        enabled: true,
      },
      {
        ruleId: 'ANO-RULE-006',
        name: 'Unexplained Cash Drawer Variance',
        description: 'Compares recorded cash tenders against physical count at shift handover and end-of-day closing',
        authoritativeSource: 'CashDrawerSession / Shift Closing Reconciliation',
        threshold: 'Net cash difference > ₹500 per shift handover',
        lookbackPeriod: '24 Hours',
        scope: 'CAFE',
        severity: 'HIGH',
        rationale: 'Early identification of cashier counting errors or unrecorded petty cash disbursements',
        version: '1.0.0',
        effectiveDate: '2026-01-01',
        enabled: true,
      },
      {
        ruleId: 'ANO-RULE-007',
        name: 'Vendor Bank Account Modification Review',
        description: 'Alerts on changes to approved vendor IFSC, bank account numbers, or beneficiary names prior to payout',
        authoritativeSource: 'Supplier Master Audit History',
        threshold: 'Bank detail modification followed by payment within 72 hours',
        lookbackPeriod: '72 Hours',
        scope: 'ORGANISATION',
        severity: 'CRITICAL',
        rationale: 'Mitigates vendor email compromise and unauthorized redirection of supplier funds',
        version: '1.0.0',
        effectiveDate: '2026-01-01',
        enabled: true,
      },
      {
        ruleId: 'ANO-RULE-008',
        name: 'Payroll Variance Review',
        description: 'Flags unexplained deviations in overtime, gross wages, or newly inserted bank accounts',
        authoritativeSource: 'PayrollRun / Salary Disbursement Master',
        threshold: 'Gross salary variance > 25% compared to 3-month average for same role',
        lookbackPeriod: '30 Days',
        scope: 'ORGANISATION',
        severity: 'HIGH',
        rationale: 'Ensures wage accuracy and prevents unauthorized payroll file manipulation',
        version: '1.0.0',
        effectiveDate: '2026-01-01',
        enabled: true,
      },
      {
        ruleId: 'ANO-RULE-009',
        name: 'Attendance Manipulation Indicators',
        description: 'Detects impossible punch timings, manual punch overrides, and remote geo-fence violations',
        authoritativeSource: 'Biometric & Mobile Clock-in Attendance Stream',
        threshold: '> 2 manual punch edits in one pay cycle without manager note',
        lookbackPeriod: '14 Days',
        scope: 'CAFE',
        severity: 'MEDIUM',
        rationale: 'Maintains statutory attendance integrity and fair wage distribution',
        version: '1.0.0',
        effectiveDate: '2026-01-01',
        enabled: true,
      },
      {
        ruleId: 'ANO-RULE-010',
        name: 'Unusual & High-Volume Data Exports',
        description: 'Monitors bulk exports of customer PII, recipes, sales summaries, and employee directories',
        authoritativeSource: 'AuditLog / Export Security Event Stream',
        threshold: 'Export of > 500 rows or > 3 exports within 1 hour by single account',
        lookbackPeriod: '24 Hours',
        scope: 'ORGANISATION',
        severity: 'HIGH',
        rationale: 'Protects proprietary recipe data, customer privacy, and competitive trade secrets',
        version: '1.0.0',
        effectiveDate: '2026-01-01',
        enabled: true,
      },
      {
        ruleId: 'ANO-RULE-011',
        name: 'Privileged Security & Role Escalation Events',
        description: 'Tracks unauthorized role elevation attempts, denied privileged route access, revoked-session reuse, revoked-device access, and security-setting modifications',
        authoritativeSource: 'AuditEvent (Security & Access Control Audit Log)',
        threshold: 'Any unauthorized role elevation attempt or > 2 privileged access denials / revoked-session reuses within 1 hour',
        lookbackPeriod: '24 Hours',
        scope: 'ORGANISATION',
        severity: 'CRITICAL',
        rationale: 'Protects system administrative access and privilege boundaries based on authentic AuditEvent log events',
        version: '1.0.0',
        effectiveDate: '2026-01-01',
        enabled: true,
      },
    ];
  }

  // ==========================================================================
  // ENTERPRISE RISK REGISTER
  // ==========================================================================

  static async createRisk({
    organisationId,
    cafeId,
    riskDomain,
    category,
    title,
    description,
    businessProcess,
    inherentLikelihood,
    inherentImpact,
    residualLikelihood,
    residualImpact,
    treatment = 'MITIGATE',
    treatmentPlan,
    responsibleOwner,
    reviewFrequencyDays = 90,
    linkedControlIds = [],
    linkedStage01IncidentId,
    linkedStage01CapaId,
    actorId,
    actorRole,
  }) {
    if (!organisationId || !title || !riskDomain) {
      const err = new Error('organisationId, riskDomain and title are required');
      err.statusCode = 400;
      throw err;
    }

    const count = await EnterpriseRisk.countDocuments({ organisationId });
    const riskId = `RSK-${String(count + 1).padStart(4, '0')}`;

    const inherent = this.calculateRiskScore(inherentLikelihood, inherentImpact);
    const residual = this.calculateRiskScore(
      residualLikelihood || inherentLikelihood,
      residualImpact || inherentImpact
    );

    const nextReviewDate = new Date(Date.now() + reviewFrequencyDays * 86400000);

    const validDomain = [
      'FINANCIAL',
      'CASH_TREASURY',
      'PROCUREMENT_SUPPLY',
      'PAYROLL_WORKFORCE',
      'FOOD_SAFETY_HYGIENE',
      'PEOPLE_OPERATIONS',
      'CYBERSECURITY_ACCESS',
      'PRIVACY_PII',
      'STATUTORY_COMPLIANCE',
      'ASSET_RELIABILITY',
      'BUSINESS_CONTINUITY',
      'BRAND_REPUTATION',
      'OPERATIONAL_EXCELLENCE',
      'OTHER',
    ].includes(riskDomain)
      ? riskDomain
      : 'OTHER';

    const risk = new EnterpriseRisk({
      riskId,
      organisationId,
      cafeId: cafeId || null,
      domain: validDomain,
      title,
      description: description || title,
      businessObjective: businessProcess || '',
      inherentLikelihood: inherent.likelihood,
      inherentImpact: inherent.impact,
      inherentScore: inherent.score,
      inherentSeverity: inherent.rating,
      controlIds: linkedControlIds,
      residualLikelihood: residual.likelihood,
      residualImpact: residual.impact,
      residualScore: residual.score,
      residualSeverity: residual.rating,
      riskOwnerUserId: responsibleOwner || actorId,
      reviewDate: nextReviewDate,
      treatment,
      treatmentPlan: treatmentPlan || '',
      status: 'ACTIVE',
      linkedIncidentIds: linkedStage01IncidentId ? [linkedStage01IncidentId] : [],
      linkedCapaIds: linkedStage01CapaId ? [linkedStage01CapaId] : [],
      auditHistory: [
        {
          action: 'RISK_REGISTERED',
          performedBy: actorId,
          performedAt: new Date(),
          rationale: 'Initial risk registration',
        },
      ],
    });

    await risk.save();

    // Attach nested objects for backwards-compatibility with serializers
    const obj = risk.toObject ? risk.toObject() : risk;
    obj.riskDomain = obj.domain;
    obj.inherentRisk = {
      likelihood: obj.inherentLikelihood,
      impact: obj.inherentImpact,
      score: obj.inherentScore,
      rating: obj.inherentSeverity,
    };
    obj.residualRisk = {
      likelihood: obj.residualLikelihood,
      impact: obj.residualImpact,
      score: obj.residualScore,
      rating: obj.residualSeverity,
    };
    return obj;
  }

  static async updateRisk({
    riskId,
    organisationId,
    cafeId,
    updates,
    actorId,
    actorRole,
    reason,
  }) {
    const filter = { riskId, organisationId };
    if (cafeId) {
      filter.$or = [{ cafeId }, { cafeId: null }];
    }

    const risk = await EnterpriseRisk.findOne(filter);
    if (!risk) {
      const err = new Error('Risk record not found or access denied');
      err.statusCode = 404;
      throw err;
    }

    const previousInherent = {
      likelihood: risk.inherentLikelihood,
      impact: risk.inherentImpact,
      score: risk.inherentScore,
      rating: risk.inherentSeverity,
    };
    const previousResidual = {
      likelihood: risk.residualLikelihood,
      impact: risk.residualImpact,
      score: risk.residualScore,
      rating: risk.residualSeverity,
    };

    if (updates.inherentLikelihood || updates.inherentImpact) {
      const inherent = this.calculateRiskScore(
        updates.inherentLikelihood || risk.inherentLikelihood,
        updates.inherentImpact || risk.inherentImpact
      );
      risk.inherentLikelihood = inherent.likelihood;
      risk.inherentImpact = inherent.impact;
      risk.inherentScore = inherent.score;
      risk.inherentSeverity = inherent.rating;
    }

    if (updates.residualLikelihood || updates.residualImpact) {
      const residual = this.calculateRiskScore(
        updates.residualLikelihood || risk.residualLikelihood,
        updates.residualImpact || risk.residualImpact
      );
      risk.residualLikelihood = residual.likelihood;
      risk.residualImpact = residual.impact;
      risk.residualScore = residual.score;
      risk.residualSeverity = residual.rating;
    }

    if (updates.title) risk.title = updates.title;
    if (updates.description) risk.description = updates.description;
    if (updates.treatment) risk.treatment = updates.treatment;
    if (updates.treatmentPlan) risk.treatmentPlan = updates.treatmentPlan;
    if (updates.status) risk.status = updates.status;
    if (updates.responsibleOwner) risk.riskOwnerUserId = updates.responsibleOwner;
    if (updates.nextReviewDate) risk.reviewDate = new Date(updates.nextReviewDate);
    if (Array.isArray(updates.linkedControlIds)) risk.controlIds = updates.linkedControlIds;

    risk.auditHistory.push({
      action: 'RISK_UPDATED',
      performedBy: actorId,
      performedAt: new Date(),
      rationale: reason || 'Routine risk assessment update',
    });

    await risk.save();

    const obj = risk.toObject ? risk.toObject() : risk;
    obj.riskDomain = obj.domain;
    obj.inherentRisk = {
      likelihood: obj.inherentLikelihood,
      impact: obj.inherentImpact,
      score: obj.inherentScore,
      rating: obj.inherentSeverity,
    };
    obj.residualRisk = {
      likelihood: obj.residualLikelihood,
      impact: obj.residualImpact,
      score: obj.residualScore,
      rating: obj.residualSeverity,
    };
    return obj;
  }

  static async listRisks({ organisationId, cafeId, domain, status, rating, search }) {
    const filter = { organisationId };
    if (cafeId) filter.$or = [{ cafeId }, { cafeId: null }];
    if (domain) filter.domain = domain;
    if (status) filter.status = status;
    if (rating) filter.residualSeverity = rating;
    if (search) {
      filter.$or = [
        { riskId: new RegExp(search, 'i') },
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
      ];
    }

    const records = await EnterpriseRisk.find(filter).sort({ residualScore: -1, createdAt: -1 }).lean();
    return records.map((r) => ({
      ...r,
      riskDomain: r.domain,
      inherentRisk: {
        likelihood: r.inherentLikelihood,
        impact: r.inherentImpact,
        score: r.inherentScore,
        rating: r.inherentSeverity,
      },
      residualRisk: {
        likelihood: r.residualLikelihood,
        impact: r.residualImpact,
        score: r.residualScore,
        rating: r.residualSeverity,
      },
    }));
  }

  // ==========================================================================
  // CONTROL LIBRARY
  // ==========================================================================

  static async createControl({
    organisationId,
    cafeId,
    controlDomain,
    controlType = 'PREVENTIVE',
    title,
    objective,
    description,
    frequency = 'DAILY',
    responsibleOwner,
    evidenceRequirement,
    linkedRiskIds = [],
    actorId,
    actorRole,
  }) {
    if (!organisationId || !title || !controlDomain) {
      const err = new Error('organisationId, controlDomain and title are required');
      err.statusCode = 400;
      throw err;
    }

    const count = await ControlLibraryItem.countDocuments({ organisationId });
    const controlId = `CTL-${String(count + 1).padStart(4, '0')}`;

    const validFreq = ['CONTINUOUS_AUTOMATED', 'TRANSACTIONAL', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'].includes(frequency)
      ? frequency
      : 'DAILY';

    const control = new ControlLibraryItem({
      controlId,
      organisationId,
      domain: controlDomain || 'FINANCIAL',
      controlType: ['PREVENTIVE', 'DETECTIVE', 'CORRECTIVE'].includes(controlType) ? controlType : 'PREVENTIVE',
      title,
      controlObjective: objective || title,
      description: description || title,
      frequency: validFreq,
      controlOwnerUserId: responsibleOwner || actorId,
      evidenceRequirement: evidenceRequirement || 'Documented verification log',
      applicableCafes: cafeId ? [cafeId] : [],
      relatedRiskIds: linkedRiskIds,
      effectiveness: 'UNTESTED',
      auditHistory: [
        {
          action: 'CONTROL_REGISTERED',
          performedBy: actorId,
          performedAt: new Date(),
          notes: 'Initial control registration',
        },
      ],
    });

    await control.save();

    const obj = control.toObject ? control.toObject() : control;
    obj.controlDomain = obj.domain;
    obj.effectiveness = 'NOT_TESTED';
    obj.deficiencies = [];
    return obj;
  }

  static async assessControlEffectiveness({
    controlId,
    organisationId,
    effectiveness,
    deficiencyDescription,
    actorId,
    actorRole,
    notes,
  }) {
    const control = await ControlLibraryItem.findOne({ controlId, organisationId });
    if (!control) {
      const err = new Error('Control not found');
      err.statusCode = 404;
      throw err;
    }

    control.effectiveness = effectiveness;
    control.lastTestedDate = new Date();
    control.deficiencyNotes = deficiencyDescription || '';
    control.deficiencies = control.deficiencies || [];
    if (deficiencyDescription) {
      control.deficiencies.push({
        description: deficiencyDescription,
        detectedDate: new Date(),
        status: 'OPEN',
      });
    }

    control.auditHistory.push({
      action: 'CONTROL_EFFECTIVENESS_ASSESSED',
      performedBy: actorId,
      performedAt: new Date(),
      notes: notes || `Assessed as ${effectiveness}`,
    });

    await control.save();

    const obj = control.toObject ? control.toObject() : control;
    obj.controlDomain = obj.domain;
    obj.deficiencies = control.deficiencies;
    return obj;
  }

  static async listControls({ organisationId, cafeId, domain, effectiveness }) {
    const filter = { organisationId };
    if (cafeId) filter.$or = [{ applicableCafes: cafeId }, { applicableCafes: { $size: 0 } }];
    if (domain) filter.domain = domain;
    if (effectiveness) filter.effectiveness = effectiveness;

    const list = await ControlLibraryItem.find(filter).sort({ controlId: 1 }).lean();
    return list.map((c) => ({
      ...c,
      controlDomain: c.domain,
    }));
  }

  // ==========================================================================
  // INTERNAL AUDIT PLAN & PROGRAMME
  // ==========================================================================

  static async createAuditPlan({
    organisationId,
    cafeIds = [],
    auditTitle,
    auditDomain,
    objective,
    scopeDescription,
    plannedStartDate,
    plannedEndDate,
    leadAuditor,
    participatingAuditors = [],
    linkedRiskIds = [],
    procedures = [],
    actorId,
    actorRole,
  }) {
    if (!organisationId || !auditTitle || !auditDomain) {
      const err = new Error('organisationId, auditTitle and auditDomain are required');
      err.statusCode = 400;
      throw err;
    }

    const count = await InternalAuditPlan.countDocuments({ organisationId });
    const auditId = `AUD-${String(count + 1).padStart(4, '0')}`;

    const formattedProcedures = procedures.map((p, idx) => ({
      procedureId: p.procedureId || `PROC-${idx + 1}`,
      procedureTitle: p.title,
      description: p.description || p.title,
      controlTestedId: p.controlId || null,
      sampleDataSource: p.sampleSource || 'Sample Source',
      responsibleAuditorUserId: actorId,
      status: 'NOT_STARTED',
    }));

    const start = new Date(plannedStartDate || Date.now());
    const end = plannedEndDate ? new Date(plannedEndDate) : new Date(start.getTime() + 30 * 86400000);

    const audit = new InternalAuditPlan({
      auditId,
      organisationId,
      cafes: cafeIds,
      auditDomain,
      objective,
      scopeDescription: scopeDescription || objective,
      auditPeriod: { from: start, to: end },
      leadAuditorUserId: leadAuditor || actorId,
      plannedStartDate: start,
      plannedCompletionDate: end,
      status: 'DRAFT',
      linkedRiskIds,
      programme: formattedProcedures,
      auditHistory: [
        {
          action: 'AUDIT_PLAN_CREATED',
          performedBy: actorId,
          performedAt: new Date(),
          notes: 'Audit plan created',
        },
      ],
    });

    await audit.save();

    const obj = audit.toObject ? audit.toObject() : audit;
    obj.procedures = formattedProcedures.map((p) => ({
      ...p,
      status: 'PENDING',
    }));
    return obj;
  }

  static async updateProcedureResult({
    auditId,
    procedureId,
    organisationId,
    result, // 'PASS', 'EXCEPTION_NOTED', 'FAIL'
    evidenceNotes,
    exceptionDetails,
    actorId,
    actorRole,
  }) {
    const audit = await InternalAuditPlan.findOne({ auditId, organisationId });
    if (!audit) {
      const err = new Error('Audit plan not found');
      err.statusCode = 404;
      throw err;
    }

    const proc = (audit.programme || []).find((p) => p.procedureId === procedureId);
    if (!proc) {
      const err = new Error(`Procedure ${procedureId} not found in audit plan`);
      err.statusCode = 404;
      throw err;
    }

    proc.status = result === 'PASS' ? 'TESTED_SATISFACTORY' : 'EXCEPTION_IDENTIFIED';
    proc.completedAt = new Date();
    proc.auditorConclusion = evidenceNotes || '';

    audit.auditHistory.push({
      action: 'PROCEDURE_EXECUTED',
      performedBy: actorId,
      performedAt: new Date(),
      notes: `Executed procedure ${procedureId}: ${result}`,
    });

    await audit.save();

    const obj = audit.toObject ? audit.toObject() : audit;
    obj.procedures = (audit.programme || []).map((p) => ({
      procedureId: p.procedureId,
      status: 'COMPLETED',
      result: p.status === 'TESTED_SATISFACTORY' ? 'PASS' : 'EXCEPTION_NOTED',
      completedAt: p.completedAt,
      evidenceNotes: p.auditorConclusion,
    }));
    return obj;
  }

  // ==========================================================================
  // AUDIT OBSERVATIONS / FINDINGS LIFECYCLE
  // ==========================================================================

  static async createObservation({
    organisationId,
    auditId,
    cafeId,
    title,
    conditionFact,
    criteriaPolicy,
    rootCause,
    riskImpact,
    severity = 'MEDIUM',
    recommendation,
    responsibleOwner,
    targetClosureDate,
    linkedControlId,
    linkedRiskId,
    actorId,
    actorRole,
  }) {
    if (!organisationId || !auditId || !title || !conditionFact) {
      const err = new Error('organisationId, auditId, title and conditionFact are required');
      err.statusCode = 400;
      throw err;
    }

    const count = await AuditObservation.countDocuments({ organisationId });
    const findingId = `FND-${String(count + 1).padStart(4, '0')}`;

    const observation = new AuditObservation({
      findingId,
      organisationId,
      auditId,
      cafeId: cafeId || null,
      title,
      conditionFact,
      criteriaPolicy: criteriaPolicy || 'Standard Operating Procedure',
      cause: rootCause || 'Under review during audit fieldwork',
      riskImpact: riskImpact || 'Operational control gap',
      recommendation: recommendation || 'Formulate corrective action plan',
      responsibleOwnerUserId: responsibleOwner || actorId,
      dueDate: targetClosureDate ? new Date(targetClosureDate) : new Date(Date.now() + 30 * 86400000),
      severity,
      status: 'OPEN',
      auditHistory: [
        {
          fromState: 'NONE',
          toState: 'OPEN',
          performedBy: actorId,
          performedAt: new Date(),
          notes: 'Initial audit observation registered',
        },
      ],
    });

    await observation.save();

    const obj = observation.toObject ? observation.toObject() : observation;
    obj.targetClosureDate = obj.dueDate;
    obj.responsibleOwner = obj.responsibleOwnerUserId;
    return obj;
  }

  static async transitionObservationStatus({
    findingId,
    organisationId,
    toState,
    actorId,
    actorRole,
    reason,
    managementResponse,
    actionPlan,
    verificationEvidence,
  }) {
    const ALLOWED_TRANSITIONS = {
      OPEN: ['INVESTIGATING', 'ACTION_AGREED'],
      INVESTIGATING: ['ACTION_AGREED', 'REMEDIATION', 'CLOSED'],
      ACTION_AGREED: ['REMEDIATION'],
      REMEDIATION: ['VERIFICATION'],
      VERIFICATION: ['CLOSED', 'REMEDIATION'],
      CLOSED: ['OPEN'], // explicit reopen only
    };

    const obs = await AuditObservation.findOne({ findingId, organisationId });
    if (!obs) {
      const err = new Error('Audit observation not found');
      err.statusCode = 404;
      throw err;
    }

    const allowed = ALLOWED_TRANSITIONS[obs.status] || [];
    if (!allowed.includes(toState)) {
      const err = new Error(
        `Invalid finding transition from ${obs.status} to ${toState}. Allowed: ${allowed.join(', ')}`
      );
      err.statusCode = 400;
      throw err;
    }

    const fromState = obs.status;
    obs.status = toState;

    if (managementResponse) obs.managementResponse = managementResponse;
    if (toState === 'CLOSED') {
      obs.closedAt = new Date();
      obs.closedByUserId = actorId;
    }

    obs.auditHistory.push({
      fromState,
      toState,
      performedBy: actorId,
      performedAt: new Date(),
      notes: reason || `Transitioned to ${toState}`,
    });

    await obs.save();

    const obj = obs.toObject ? obs.toObject() : obs;
    obj.targetClosureDate = obj.dueDate;
    obj.responsibleOwner = obj.responsibleOwnerUserId;
    return obj;
  }

  static async listObservations({ organisationId, cafeId, auditId, status, severity }) {
    const filter = { organisationId };
    if (cafeId) filter.$or = [{ cafeId }, { cafeId: null }];
    if (auditId) filter.auditId = auditId;
    if (status) filter.status = status;
    if (severity) filter.severity = severity;

    const list = await AuditObservation.find(filter).sort({ createdAt: -1 }).lean();
    return list.map((o) => ({
      ...o,
      targetClosureDate: o.dueDate,
      responsibleOwner: o.responsibleOwnerUserId,
    }));
  }

  // ==========================================================================
  // OPERATIONAL ANOMALY REVIEW ENGINE (ZERO ACCUSATIONS RULE)
  // ==========================================================================

  static async recordAnomalyCase({
    organisationId,
    cafeId,
    anomalyType,
    severity = 'MEDIUM',
    title,
    description,
    detectionRuleId,
    sourceEntity,
    sourceEntityId,
    monetaryValue = 0,
    evidenceData = {},
    actorId = 'SYSTEM_DETECTOR',
  }) {
    if (!organisationId || !anomalyType || !title) {
      const err = new Error('organisationId, anomalyType and title are required');
      err.statusCode = 400;
      throw err;
    }

    const count = await OperationalAnomalyCase.countDocuments({ organisationId });
    const caseId = `ANO-${String(count + 1).padStart(4, '0')}`;

    const validRuleType = [
      'EXCESSIVE_REFUNDS',
      'REPEATED_VOIDS',
      'UNUSUAL_DISCOUNTS',
      'POTENTIAL_DUPLICATE_EXPENSE',
      'POTENTIAL_DUPLICATE_SUPPLIER_INVOICE',
      'POTENTIAL_DUPLICATE_PAYMENT',
      'UNEXPLAINED_CASH_DRAWER_VARIANCE',
      'VENDOR_BANK_MODIFICATION_REVIEW',
      'PAYROLL_VARIANCE_REVIEW',
      'ATTENDANCE_PATTERN_EXCEPTION',
      'HIGH_VOLUME_DATA_EXPORT',
      'ELEVATED_PRIVILEGE_EVENT',
    ].includes(anomalyType)
      ? anomalyType
      : 'EXCESSIVE_REFUNDS';

    const anomaly = new OperationalAnomalyCase({
      caseId,
      ruleType: validRuleType,
      organisationId,
      cafeId: cafeId || null,
      title,
      description: description || title,
      patternSummary: description || title,
      detectedValuePaisa: Math.round(Number(monetaryValue || 0) * 100),
      severity,
      status: 'UNDER_REVIEW',
      auditHistory: [
        {
          action: 'ANOMALY_RECORDED',
          performedBy: actorId,
          performedAt: new Date(),
          notes: 'Pattern indicator detected. Safe non-accusatory record created.',
        },
      ],
    });

    await anomaly.save();

    const obj = anomaly.toObject ? anomaly.toObject() : anomaly;
    obj.anomalyType = obj.ruleType;
    obj.monetaryValue = obj.detectedValuePaisa / 100;
    obj.reviewStatus = 'INVESTIGATING';
    return obj;
  }

  static async reviewAnomalyCase({
    caseId,
    organisationId,
    disposition,
    reviewNotes,
    actionTaken,
    actorId,
    actorRole,
  }) {
    const anomaly = await OperationalAnomalyCase.findOne({ caseId, organisationId });
    if (!anomaly) {
      const err = new Error('Anomaly case not found');
      err.statusCode = 404;
      throw err;
    }

    const dispositionMap = {
      EXPLAINED_BENIGN: 'EXPLAINED_LEGITIMATE_OPERATION',
      DUPLICATE_FALSE_POSITIVE: 'FALSE_POSITIVE_DUPLICATE',
      DATA_QUALITY_ISSUE: 'DATA_QUALITY_ANOMALY',
      CONFIRMED_ISSUE: 'CONFIRMED_CONTROL_DEFICIENCY',
      REQUIRES_FURTHER_EVIDENCE: 'PENDING_MANAGEMENT_ACTION',
    };

    const mappedDisposition = dispositionMap[disposition] || 'EXPLAINED_LEGITIMATE_OPERATION';

    anomaly.disposition = mappedDisposition;
    anomaly.status = 'REVIEW_CONCLUDED';
    anomaly.reviewOwnerUserId = actorId;
    anomaly.reviewedBy = actorId;
    anomaly.reviewedAt = new Date();
    anomaly.reviewNotes = reviewNotes;
    anomaly.actionTaken = actionTaken;

    anomaly.auditHistory.push({
      action: 'ANOMALY_REVIEWED_BY_HUMAN',
      performedBy: actorId,
      performedAt: new Date(),
      notes: reviewNotes || 'Human reviewer disposition recorded.',
    });

    await anomaly.save();

    const obj = anomaly.toObject ? anomaly.toObject() : anomaly;
    obj.anomalyType = obj.ruleType;
    obj.monetaryValue = obj.detectedValuePaisa / 100;
    obj.reviewStatus = disposition;
    obj.reviewedBy = actorId;
    obj.reviewedAt = anomaly.reviewedAt;
    return obj;
  }

  static async listAnomalies({ organisationId, cafeId, type, status, severity }) {
    const filter = { organisationId };
    if (cafeId) filter.$or = [{ cafeId }, { cafeId: null }];
    if (type) filter.ruleType = type;
    if (status) filter.status = status;
    if (severity) filter.severity = severity;

    const list = await OperationalAnomalyCase.find(filter).sort({ createdAt: -1 }).lean();
    return list.map((a) => ({
      ...a,
      anomalyType: a.ruleType,
      monetaryValue: (a.detectedValuePaisa || 0) / 100,
      reviewStatus: a.disposition || 'INVESTIGATING',
    }));
  }

  // ==========================================================================
  // DASHBOARD SUMMARY & HEAT MAP
  // ==========================================================================

  static async getRiskAuditDashboard({ organisationId, cafeId }) {
    const riskFilter = { organisationId };
    const controlFilter = { organisationId };
    const findingFilter = { organisationId };
    const anomalyFilter = { organisationId };

    if (cafeId) {
      riskFilter.$or = [{ cafeId }, { cafeId: null }];
      controlFilter.$or = [{ cafeId }, { cafeId: null }];
      findingFilter.$or = [{ cafeId }, { cafeId: null }];
      anomalyFilter.$or = [{ cafeId }, { cafeId: null }];
    }

    const [risks, controls, findings, anomalies] = await Promise.all([
      EnterpriseRisk.find(riskFilter).lean(),
      ControlLibraryItem.find(controlFilter).lean(),
      AuditObservation.find(findingFilter).lean(),
      OperationalAnomalyCase.find(anomalyFilter).lean(),
    ]);

    // Build 5x5 Heat Map using residualLikelihood and residualImpact
    const heatMap = [];
    for (let l = 1; l <= 5; l++) {
      for (let i = 1; i <= 5; i++) {
        const matching = risks.filter(
          (r) => (r.residualLikelihood || 1) === l && (r.residualImpact || 1) === i
        );
        heatMap.push({
          likelihood: l,
          impact: i,
          count: matching.length,
          score: l * i,
        });
      }
    }

    const openFindings = findings.filter((f) => f.status !== 'CLOSED');
    const overdueFindings = openFindings.filter(
      (f) => f.dueDate && new Date(f.dueDate) < new Date()
    );

    const activeAnomalies = anomalies.filter(
      (a) => a.status === 'UNDER_REVIEW' || a.status === 'DETECTED'
    );

    const controlEffectiveness = {
      EFFECTIVE: controls.filter((c) => c.effectiveness === 'EFFECTIVE').length,
      PARTIALLY_EFFECTIVE: controls.filter((c) => c.effectiveness === 'PARTIALLY_EFFECTIVE').length,
      INEFFECTIVE: controls.filter((c) => c.effectiveness === 'INEFFECTIVE').length,
      NOT_TESTED: controls.filter((c) => c.effectiveness === 'NOT_TESTED').length,
    };

    return {
      totalRisks: risks.length,
      criticalRisks: risks.filter((r) => r.residualSeverity === 'CRITICAL').length,
      highRisks: risks.filter((r) => r.residualSeverity === 'HIGH').length,
      totalControls: controls.length,
      controlEffectiveness,
      totalOpenFindings: openFindings.length,
      overdueFindings: overdueFindings.length,
      activeAnomaliesCount: activeAnomalies.length,
      heatMap,
      recentAnomalies: activeAnomalies.slice(0, 5),
      recentCriticalRisks: risks.filter((r) => r.residualSeverity === 'CRITICAL').slice(0, 5),
    };
  }
}

module.exports = OwnerRiskAuditService;
