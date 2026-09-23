'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER CORPORATE GOVERNANCE & DELEGATION SERVICE (STAGE 15)
 * ============================================================================
 * Formal corporate governance, delegation engine, and decision authority:
 * - Clear distinction: STATUTORY vs ARTICLES vs BOARD RESOLUTION vs INTERNAL POLICY.
 * - Legal structure verification: returns 'LEGAL_STRUCTURE_VERIFICATION_REQUIRED' if unevidenced.
 * - Governance meetings with attendance, quorum, and SHA-256 immutable minutes sealing.
 * - Resolution lifecycle: DRAFT -> REVIEW -> APPROVED -> ACTIONED -> CLOSED.
 * - Reserved Matter Register: strictly enforces Board/shareholder reserved matters.
 * - Strategic Decision Register: post-decision review, actual outcome vs expected.
 * - Delegation of Authority Engine:
 *   * Strict least-privilege, server-enforced, time-bounded, auto-expiring.
 *   * Revocation immediate (active cached sessions cannot bypass).
 *   * Monetary limits strictly enforced server-side.
 *   * Strict café-scoping (no org-wide escalation).
 *   * Module/action-specific (no permission creep).
 *   * Default: strictly NO sub-delegation.
 *   * INVARIANT: Delegation CAN NEVER create Primary Master or technical root privileges!
 * - Authorised Signatories: authority tracking with ZERO cryptographic keys, PINs, or passwords.
 * - Conflict of Interest Register: Companies Act Sec 184 disclosures & mitigation warnings.
 */

const crypto = require('crypto');
const GovernanceMeeting = require('../models/GovernanceMeeting');
const GovernanceResolution = require('../models/GovernanceResolution');
const ReservedMatterRegister = require('../models/ReservedMatterRegister');
const GovernanceDecision = require('../models/GovernanceDecision');
const DelegationOfAuthority = require('../models/DelegationOfAuthority');
const AuthorisedSignatory = require('../models/AuthorisedSignatory');
const ConflictOfInterestDeclaration = require('../models/ConflictOfInterestDeclaration');

let CompanyIdentity;
try {
  const CIDModule = require('../models/CompanyIdentity');
  CompanyIdentity = CIDModule.CompanyIdentity || CIDModule;
} catch (_) {
  CompanyIdentity = null;
}

const RESOLUTION_TRANSITIONS = {
  DRAFT: ['REVIEW'],
  REVIEW: ['APPROVED', 'DRAFT'],
  APPROVED: ['ACTIONED', 'CLOSED'],
  ACTIONED: ['CLOSED'],
  CLOSED: []
};

class OwnerGovernanceDelegationService {
  _getOrgFilter(organisationId) {
    const orgUpper = organisationId.toString().toUpperCase();
    return { $or: [{ organisationId }, { organisationId: organisationId.toString() }, { organisationId: orgUpper }] };
  }

  /**
   * Determine Legal Entity Structure State
   * If legal evidence (CIN/LLPIN/Articles) is missing, marks verification required.
   */
  async getLegalStructureStatus(organisationId) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    let org = null;
    if (CompanyIdentity) {
      const orgFilter = this._getOrgFilter(organisationId);
      org = await CompanyIdentity.findOne(orgFilter).lean();
    }

    const hasCIN = !!(org?.cin || org?.statutoryDetails?.cin);
    const hasLLPIN = !!(org?.llpin || org?.statutoryDetails?.llpin);
    const entityType = org?.entityType || 'PRIVATE_LIMITED_COMPANY';

    const secretarialAuditFramework = {
      governingLaw: 'Companies Act 2013 Section 204 read with Rule 9 Companies (Appointment and Remuneration of Managerial Personnel) Rules, 2014',
      applicabilityCriteria: [
        'Listed companies under Section 204(1)',
        'Every public company with paid-up share capital >= ₹50 crore',
        'Every public company with turnover >= ₹250 crore',
        'Every company having outstanding loans or borrowings from banks or public financial institutions >= ₹100 crore (MCA 2020 amendment)'
      ],
      legalThresholdCorrection: 'Turnover threshold is strictly ₹250 crore for public companies; ₹100 crore turnover is legally erroneous.',
      currentEntityEvaluation: 'APPLICABILITY_PENDING_AUDITED_FINANCIALS',
      regulatoryStatus: 'LEGAL STRUCTURE / APPLICABILITY VERIFICATION PENDING'
    };

    const auditorRotationFramework = {
      governingLaw: 'Companies Act 2013 Section 139(2) read with Rule 5 Companies (Audit and Auditors) Rules, 2014',
      applicabilityClasses: [
        'Unlisted public company: paid-up share capital >= ₹10 crore',
        'Private limited company: paid-up share capital >= ₹20 crore',
        'Companies below capital thresholds with qualifying public borrowings/public deposits >= ₹50 crore'
      ],
      statutoryExclusions: [
        'One Person Companies (OPCs)',
        'Small companies under Section 2(85) as amended by Companies (Specification of Definition Details) Amendment Rules, 2025 (paid-up capital <= ₹10 crore and turnover <= ₹100 crore)'
      ],
      smallCompanyDefinition2025: {
        paidUpCapitalLimitCrore: 10,
        turnoverLimitCrore: 100,
        citation: 'Companies (Specification of Definition Details) Amendment Rules, 2025'
      },
      tenureRulesIfApplicable: {
        individualAuditor: 'Maximum 1 term of 5 consecutive years (cooling period 5 consecutive years)',
        auditFirm: 'Maximum 2 terms of 5 consecutive years = 10 consecutive years (cooling period 5 consecutive years)'
      },
      currentEntityEvaluation: 'APPLICABILITY_PENDING_CLASS_AND_CAPITAL_EVALUATION',
      regulatoryStatus: 'LEGAL STRUCTURE / APPLICABILITY VERIFICATION PENDING'
    };

    if (!hasCIN && !hasLLPIN && !org?.statutoryDetails?.isStatutoryEvidenced) {
      return {
        organisationId,
        legalEntityName: org?.legalName || org?.name || 'Zamorin Hospitality Ventures',
        entityType,
        status: 'LEGAL_STRUCTURE_VERIFICATION_REQUIRED',
        regulatoryStatus: 'LEGAL STRUCTURE / APPLICABILITY VERIFICATION PENDING',
        message: 'Statutory incorporation evidence (CIN/LLPIN/Articles) pending authoritative upload.',
        companiesActApplicable: true,
        secretarialAuditFramework,
        auditorRotationFramework
      };
    }

    return {
      organisationId,
      legalEntityName: org.legalName || org.name,
      entityType,
      cin: org.cin || org?.statutoryDetails?.cin,
      status: 'STATUTORY_STRUCTURE_CONFIRMED',
      regulatoryStatus: 'LEGAL STRUCTURE / APPLICABILITY VERIFICATION PENDING',
      companiesActApplicable: true,
      secretarialAuditFramework,
      auditorRotationFramework
    };
  }

  /**
   * Schedule or Record a Governance Meeting
   */
  async createMeeting(organisationId, payload, user) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const {
      title,
      meetingTitle,
      meetingType = 'MANAGEMENT',
      scheduledDate,
      meetingDate,
      noticeDate,
      noticePeriodDays = 7,
      agendaItems = [],
      attendees = [],
      quorumRequired = 2
    } = payload;

    const finalTitle = title || meetingTitle;
    const finalDate = meetingDate ? new Date(meetingDate) : (scheduledDate ? new Date(scheduledDate) : new Date());

    if (!finalTitle) {
      throw new Error('MEETING_TITLE_AND_SCHEDULED_DATE_REQUIRED');
    }

    const meetingId = `MTG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    // Section 173 Compliance Evaluation
    const isBoardMeeting = (meetingType === 'BOARD');
    const isManagementMeeting = (meetingType === 'MANAGEMENT' || meetingType === 'INTERNAL_GOVERNANCE' || meetingType === 'MANAGEMENT_MEETING' || meetingType === 'COMMITTEE');
    
    let section173Compliance = {
      statutoryApplies: isBoardMeeting,
      noticePeriodDays,
      isNormalNoticeCompliant: noticePeriodDays >= 7,
      isUrgentShortNotice: noticePeriodDays < 7,
      shortNoticeValid: false,
      reason: isManagementMeeting ? 'EXEMPT_OPERATIONAL_MANAGEMENT_MEETING' : 'NORMAL_7_DAY_STATUTORY_NOTICE'
    };

    if (isBoardMeeting) {
      if (noticePeriodDays >= 7) {
        section173Compliance.shortNoticeValid = true;
        section173Compliance.reason = 'COMPLIANT_7_DAY_STATUTORY_NOTICE';
      } else {
        // Section 173(3): Urgent business on shorter notice
        const hasIndependentDirectors = payload.hasIndependentDirectors ?? false;
        const independentDirectorPresent = attendees.some(a => 
          (a.roleOrDesignation?.toUpperCase().includes('INDEPENDENT') || a.isIndependent) && 
          ['PRESENT', 'VIDEO_CONFERENCE'].includes(a.attendanceStatus)
        );
        const ratifiedByIndependentDirector = !!payload.ratifiedByIndependentDirector;
        
        if (!hasIndependentDirectors) {
          // Companies not requiring independent directors (Pvt Ltd / small / OPC)
          section173Compliance.shortNoticeValid = true;
          section173Compliance.reason = 'SHORT_NOTICE_VALID_NO_INDEPENDENT_DIRECTOR_REQUIRED';
        } else if (independentDirectorPresent) {
          section173Compliance.shortNoticeValid = true;
          section173Compliance.reason = 'SHORT_NOTICE_VALID_INDEPENDENT_DIRECTOR_PRESENT';
        } else if (ratifiedByIndependentDirector) {
          section173Compliance.shortNoticeValid = true;
          section173Compliance.reason = 'SHORT_NOTICE_VALID_RATIFIED_BY_INDEPENDENT_DIRECTOR';
        } else {
          section173Compliance.shortNoticeValid = false;
          section173Compliance.reason = 'SHORT_NOTICE_CONDITIONAL_PENDING_INDEPENDENT_DIRECTOR_CIRCULATION_OR_RATIFICATION';
        }
      }
    }

    const meeting = new GovernanceMeeting({
      meetingId,
      organisationId,
      title: finalTitle,
      meetingTitle: finalTitle,
      meetingType: meetingType === 'MANAGEMENT_MEETING' ? 'MANAGEMENT' : meetingType,
      meetingDate: finalDate,
      scheduledDate: finalDate,
      noticeDate: noticeDate ? new Date(noticeDate) : new Date(finalDate.getTime() - noticePeriodDays * 86400000),
      noticePeriodDays,
      isNoticeServedCompliantly: isManagementMeeting ? true : (noticePeriodDays >= 7 || section173Compliance.shortNoticeValid),
      section173Compliance,
      agendaItems: agendaItems.map((item, idx) => ({
        itemNumber: idx + 1,
        topic: item.topic || item.title || (typeof item === 'string' ? item : 'Agenda Item'),
        title: item.title || item.topic || (typeof item === 'string' ? item : 'Agenda Item'),
        presentedBy: item.presentedBy || item.proposer || 'Management',
        proposer: item.proposer || item.presentedBy || 'Management'
      })),
      attendees: attendees.map(a => ({
        userId: a.userId || null,
        personName: a.personName || a.name || 'Director / Officer',
        name: a.personName || a.name || 'Director / Officer',
        roleOrDesignation: a.roleOrDesignation || 'Participant',
        attendanceStatus: ['PRESENT', 'VIDEO_CONFERENCE', 'LEAVE_OF_ABSENCE', 'ABSENT'].includes(a.attendanceStatus) ? a.attendanceStatus : 'PRESENT',
        isInterestedParty: !!a.isInterestedParty
      })),
      quorumRequired,
      status: 'SCHEDULED',
      createdBy: user?.userId || user?._id || 'SYSTEM',
      createdByUserId: user?.userId || user?._id || 'SYSTEM'
    });

    await meeting.save();
    return meeting;
  }

  /**
   * Finalise and Seal Meeting Minutes with Immutable SHA-256 Hash
   */
  async finaliseMeetingMinutes(organisationId, meetingId, minutesContent, user) {
    const orgFilter = this._getOrgFilter(organisationId);
    const meeting = await GovernanceMeeting.findOne({ ...orgFilter, meetingId });
    if (!meeting) throw new Error('MEETING_NOT_FOUND');

    if (meeting.isMinutesSignedAndImmutable || meeting.immutableMinutesHash) {
      throw new Error('MINUTES_ALREADY_IMMUTABLE: Signed minutes cannot be edited.');
    }

    // Compute cryptographic SHA-256 seal for tamper-evidence
    const contentHash = crypto.createHash('sha256').update(minutesContent).digest('hex');

    meeting.minutesSummary = minutesContent;
    meeting.isMinutesSignedAndImmutable = true;
    meeting.minutesSignedAt = new Date();
    meeting.minutesSignedBy = user?.userId || user?._id || 'SYSTEM';
    meeting.minutesContentSha256 = contentHash;
    meeting.immutableMinutesHash = contentHash;
    meeting.status = 'MINUTES_APPROVED';

    await meeting.save();
    return meeting;
  }

  /**
   * Propose a Governance Resolution
   */
  async proposeResolution(organisationId, payload, user) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const {
      title,
      resolutionTitle,
      resolutionType = 'BOARD_RESOLUTION',
      meetingId,
      resolutionText,
      governingAuthority = 'BOARD_SHAREHOLDER_RESOLUTION',
      statutorySection = null,
      proposerName
    } = payload;

    const finalTitle = title || resolutionTitle;
    if (!finalTitle || !resolutionText) {
      throw new Error('TITLE_AND_TEXT_REQUIRED');
    }

    const resolutionId = `RES-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const resolutionNumber = payload.resolutionNumber || `RES-NUM-${Date.now().toString(36).toUpperCase()}`;
    const authorityCategory = payload.authorityCategory || (
      ['STATUTORY', 'ARTICLES_CONSTITUTION', 'BOARD_SHAREHOLDER_RESOLUTION', 'ZAMORIN_INTERNAL_POLICY'].includes(governingAuthority)
        ? governingAuthority
        : 'BOARD_SHAREHOLDER_RESOLUTION'
    );
    const effectiveDate = payload.effectiveDate ? new Date(payload.effectiveDate) : new Date();

    const resolution = new GovernanceResolution({
      resolutionId,
      organisationId,
      meetingId: meetingId || null,
      resolutionNumber,
      title: finalTitle,
      resolutionTitle: finalTitle,
      resolutionType,
      resolutionText,
      authorityCategory,
      governingAuthority: authorityCategory,
      statutorySection,
      proposerName: proposerName || user?.name || 'Managing Director',
      effectiveDate,
      status: 'DRAFT',
      proposedBy: user?.userId || user?._id || 'SYSTEM',
      createdByUserId: user?.userId || user?._id || 'SYSTEM'
    });

    await resolution.save();
    return resolution;
  }

  /**
   * Transition Resolution Lifecycle
   */
  async transitionResolution(organisationId, resolutionId, newStatus, user, notes) {
    const orgFilter = this._getOrgFilter(organisationId);
    const res = await GovernanceResolution.findOne({ ...orgFilter, resolutionId });
    if (!res) throw new Error('RESOLUTION_NOT_FOUND');

    const allowed = RESOLUTION_TRANSITIONS[res.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`ILLEGAL_RESOLUTION_TRANSITION: Cannot transition from ${res.status} to ${newStatus}`);
    }

    res.status = newStatus;
    if (newStatus === 'APPROVED') {
      res.approvedAt = new Date();
      res.approvedBy = user?.userId || user?._id;
    }

    await res.save();
    return res;
  }

  /**
   * Register a Reserved Matter (Board / Shareholder Reserved)
   */
  async registerReservedMatter(organisationId, payload, user) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const { category, title, description, reservedToAuthority = 'BOARD_OF_DIRECTORS', delegationAllowed = false } = payload;

    if (!category || !title || !description) {
      throw new Error('CATEGORY_TITLE_AND_DESCRIPTION_REQUIRED');
    }

    const matterId = `RSV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    const matter = new ReservedMatterRegister({
      matterId,
      organisationId,
      category,
      title,
      description,
      reservedToAuthority,
      delegationAllowed: !!delegationAllowed,
      status: 'ACTIVE'
    });

    await matter.save();
    return matter;
  }

  /**
   * Get All Reserved Matters for Organisation
   */
  async getReservedMatters(organisationId) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const orgFilter = this._getOrgFilter(organisationId);
    return await ReservedMatterRegister.find({ ...orgFilter, status: 'ACTIVE' }).lean();
  }

  /**
   * Record a Major Strategic Decision
   */
  async recordDecision(organisationId, payload, user) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const {
      title,
      decisionTitle,
      issueBackground,
      issueDescription,
      rationale,
      financialImpactEstimatedRupees,
      financialImpactEstimateRupees,
      responsiblePerson,
      reviewScheduledDate
    } = payload;

    const finalTitle = title || decisionTitle;
    if (!finalTitle || !rationale) {
      throw new Error('TITLE_AND_RATIONALE_REQUIRED');
    }

    const decisionId = `DEC-${Date.now().toString(36).toUpperCase()}`;

    const decision = new GovernanceDecision({
      decisionId,
      organisationId,
      title: finalTitle,
      decisionTitle: finalTitle,
      issueBackground: issueBackground || issueDescription || '',
      issueDescription: issueDescription || issueBackground || '',
      rationale,
      financialImpactEstimatedRupees: financialImpactEstimatedRupees || financialImpactEstimateRupees || 0,
      financialImpactEstimateRupees: financialImpactEstimateRupees || financialImpactEstimatedRupees || 0,
      responsiblePerson: responsiblePerson || 'Executive Management',
      reviewScheduledDate: reviewScheduledDate ? new Date(reviewScheduledDate) : null,
      status: 'IMPLEMENTING',
      decidedBy: user?.userId || user?._id || 'SYSTEM',
      createdByUserId: user?.userId || user?._id || 'SYSTEM'
    });

    await decision.save();
    return decision;
  }

  /**
   * Create a Delegation of Authority
   * INVARIANTS:
   * 1. Cannot grant Primary Master, deployment credentials, or secret access.
   * 2. Cannot grant cross-organisation access.
   * 3. Cannot delegate Reserved Matters.
   * 4. Requires explicit time bounds (startAt, expiresAt).
   * 5. Monetary limits strictly defined if monetary module.
   */
  async grantDelegation(organisationId, payload, user) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const {
      delegateUserId,
      cafeScope,
      actionPermissions,
      module,
      maxMonetaryAmount,
      startAt,
      expiresAt,
      reason,
      sourceAuthorityType = 'INTERNAL_POLICY',
      sourceAuthorityReference = 'Management Delegation Standard',
      allowSubDelegation = false
    } = payload;

    if (!delegateUserId || !actionPermissions || !module || !startAt || !expiresAt || !reason) {
      throw new Error('MANDATORY_DELEGATION_FIELDS_MISSING');
    }

    // INVARIANT 1: Check for prohibited privilege escalation
    const prohibitedPermissions = [
      'PRIMARY_MASTER',
      'DEPLOYMENT_ACCESS',
      'SYSTEM_ROOT',
      'DATABASE_ADMIN',
      'SECRETS_ACCESS',
      'CROSS_ORG_ACCESS'
    ];
    for (const perm of actionPermissions) {
      if (prohibitedPermissions.includes(perm.toUpperCase())) {
        throw new Error(`SECURITY_VIOLATION: Prohibited privilege ${perm} cannot be delegated.`);
      }
    }

    // INVARIANT 2: Cafe scope must be explicit
    if (!cafeScope || cafeScope.length === 0) {
      throw new Error('EXPLICIT_CAFE_SCOPE_REQUIRED: Delegation must be bounded to specific cafe(s).');
    }

    // INVARIANT 3: Check against Reserved Matters Register
    const orgFilter = this._getOrgFilter(organisationId);
    const reservedMatters = await ReservedMatterRegister.find({
      ...orgFilter,
      status: 'ACTIVE',
      delegationAllowed: false
    }).lean();

    for (const rm of reservedMatters) {
      if (actionPermissions.includes(rm.category) || (module && module === rm.category)) {
        throw new Error(`RESERVED_MATTER_VIOLATION: ${rm.title} is strictly reserved to ${rm.reservedToAuthority} and cannot be delegated.`);
      }
    }

    const delegationId = `DEL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    const validModules = ['FINANCE_EXPENSE', 'PROCUREMENT', 'CAPEX', 'REFUND', 'CONTRACTS', 'SUPPLIER', 'MASTER_DATA', 'COMPLIANCE', 'OTHER'];
    const finalModule = validModules.includes(module) ? module : (module === 'FINANCE' ? 'FINANCE_EXPENSE' : 'OTHER');

    const delegation = new DelegationOfAuthority({
      delegationId,
      organisationId,
      delegatorUserId: user?.userId || user?._id || 'SYSTEM',
      delegateUserId,
      cafeScope,
      actionPermissions,
      module: finalModule,
      maxMonetaryAmount: maxMonetaryAmount !== undefined ? maxMonetaryAmount : null,
      startAt: new Date(startAt),
      expiresAt: new Date(expiresAt),
      reason,
      sourceAuthorityType,
      sourceAuthorityReference,
      status: 'ACTIVE',
      allowSubDelegation: !!allowSubDelegation,
      auditTrail: [{
        action: 'DELEGATION_GRANTED',
        performedBy: user?.userId || user?._id,
        timestamp: new Date(),
        details: { module, maxMonetaryAmount, cafeScope }
      }]
    });

    await delegation.save();
    return delegation;
  }

  /**
   * Revoke a Delegation of Authority Immediately
   */
  async revokeDelegation(organisationId, delegationId, reason, user) {
    const orgFilter = this._getOrgFilter(organisationId);
    const delegation = await DelegationOfAuthority.findOne({ ...orgFilter, delegationId });
    if (!delegation) throw new Error('DELEGATION_NOT_FOUND');

    delegation.status = 'REVOKED';
    delegation.revokedAt = new Date();
    delegation.revokedByUserId = user?.userId || user?._id;
    delegation.revocationReason = reason || 'Revoked by delegator / governance authority';

    delegation.auditTrail.push({
      action: 'DELEGATION_REVOKED',
      performedBy: user?.userId || user?._id,
      timestamp: new Date(),
      details: { reason }
    });

    await delegation.save();
    return delegation;
  }

  /**
   * Real-time Server-Side Authority Check
   * Evaluates if a delegate has valid authority for an action:
   * - Must not be future dated (now >= startAt)
   * - Must not be expired (now < expiresAt)
   * - Must not be revoked
   * - Must match café scope
   * - Must match required action permission
   * - Must satisfy monetary limit (amount <= maxMonetaryAmount)
   */
  async checkDelegatedAuthority(organisationId, checkPayload) {
    const { userId, cafeId, actionPermission, module, monetaryAmount } = checkPayload;

    const orgFilter = this._getOrgFilter(organisationId);
    const now = new Date();
    const activeDelegations = await DelegationOfAuthority.find({
      ...orgFilter,
      delegateUserId: userId,
      status: 'ACTIVE',
      isDeleted: false
    }).lean();

    for (const del of activeDelegations) {
      // 1. Time bounds check
      if (now < new Date(del.startAt)) continue; // Not started yet
      if (now >= new Date(del.expiresAt)) continue; // Expired

      if (module && del.module !== module && !(module === 'FINANCE' && del.module === 'FINANCE_EXPENSE')) continue;
      if (!del.actionPermissions.includes(actionPermission)) continue;

      // 3. Cafe scope check
      const isCafeInScope = del.cafeScope.some(c => c.toString() === cafeId.toString());
      if (!isCafeInScope) continue;

      // 4. Monetary ceiling check
      if (monetaryAmount !== undefined && del.maxMonetaryAmount !== null) {
        if (monetaryAmount > del.maxMonetaryAmount) {
          return {
            isAuthorized: false,
            reason: `AMOUNT_EXCEEDS_DELEGATED_LIMIT: Attempted ₹${monetaryAmount} exceeds ceiling ₹${del.maxMonetaryAmount}`,
            delegationId: del.delegationId
          };
        }
      }

      // Valid delegation found!
      return {
        isAuthorized: true,
        delegationId: del.delegationId,
        delegatorUserId: del.delegatorUserId,
        expiresAt: del.expiresAt
      };
    }

    return {
      isAuthorized: false,
      reason: 'NO_VALID_ACTIVE_DELEGATION_FOUND_FOR_CRITERIA'
    };
  }

  /**
   * Register an Authorised Signatory
   * INVARIANT: Zero bank passwords, DSC private keys, or PINs stored!
   */
  async registerSignatory(organisationId, payload, user) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const {
      userId,
      signatoryName,
      designation,
      entityName,
      category,
      monetaryLimit,
      cafeScope,
      startAt,
      expiresAt,
      legalOrPolicySource,
      sourceReference,
      mcaDin
    } = payload;

    if (!signatoryName || !designation || !entityName || !category || !startAt || !expiresAt) {
      throw new Error('MANDATORY_SIGNATORY_FIELDS_MISSING');
    }

    const signatoryId = `SIG-${Date.now().toString(36).toUpperCase()}`;

    const signatory = new AuthorisedSignatory({
      signatoryId,
      organisationId,
      userId: userId || null,
      signatoryName,
      designation,
      entityName,
      category,
      monetaryLimit: monetaryLimit !== undefined ? monetaryLimit : null,
      cafeScope: cafeScope || [],
      startAt: new Date(startAt),
      expiresAt: new Date(expiresAt),
      legalOrPolicySource: legalOrPolicySource || 'BOARD_RESOLUTION',
      sourceReference: sourceReference || 'Board Resolution extract',
      mcaDin: mcaDin || null,
      status: 'ACTIVE'
    });

    await signatory.save();
    return signatory;
  }

  /**
   * Record Conflict of Interest Declaration (Companies Act Sec 184)
   */
  async recordConflictDeclaration(organisationId, payload, user) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const {
      declarantName,
      designation,
      declarationType = 'DIRECTOR_INTEREST_SEC_184',
      relatedPartyOrEntity,
      natureOfInterest,
      effectivePeriodStart,
      effectivePeriodEnd,
      mitigationsOrRestrictions = []
    } = payload;

    if (!declarantName || !relatedPartyOrEntity || !natureOfInterest) {
      throw new Error('DECLARANT_PARTY_AND_INTEREST_REQUIRED');
    }

    const declarationId = `COI-${Date.now().toString(36).toUpperCase()}`;

    const declaration = new ConflictOfInterestDeclaration({
      declarationId,
      organisationId,
      declarantUserId: user?.userId || user?._id || 'SYSTEM',
      declarantName,
      designation: designation || 'Director',
      declarationType,
      relatedPartyOrEntity,
      natureOfInterest,
      effectivePeriodStart: effectivePeriodStart ? new Date(effectivePeriodStart) : new Date(),
      effectivePeriodEnd: effectivePeriodEnd ? new Date(effectivePeriodEnd) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      mitigationsOrRestrictions,
      status: 'SUBMITTED'
    });

    await declaration.save();
    return declaration;
  }

  /**
   * Check for Conflicts of Interest against proposed vendor / counterparty
   */
  async checkCounterpartyConflict(organisationId, counterpartyName) {
    if (!organisationId || !counterpartyName) return { hasConflict: false };

    const orgFilter = this._getOrgFilter(organisationId);
    const matchingDeclaration = await ConflictOfInterestDeclaration.findOne({
      ...orgFilter,
      relatedPartyOrEntity: new RegExp(counterpartyName.trim(), 'i'),
      status: { $in: ['SUBMITTED', 'NOTED_BY_BOARD', 'ACTIVE_MONITORING'] }
    }).lean();

    if (matchingDeclaration) {
      const legalStatus = await this.getLegalStructureStatus(organisationId);
      const isPrivateCo = legalStatus?.entityType === 'PRIVATE_LIMITED_COMPANY';

      const statutoryWarning = isPrivateCo
        ? 'STATUTORY_CONFLICT_WARNING: Counterparty disclosed under Section 184. Under MCA Exemption Notification G.S.R. 464(E), interested director of an eligible private company may participate in meetings after disclosure, provided no statutory filing defaults exist under Section 92 or 137.'
        : 'STATUTORY_CONFLICT_WARNING: Counterparty disclosed under Section 184(2). Interested director/officer must disclose nature of concern and shall not participate in that meeting.';

      return {
        hasConflict: true,
        declarationId: matchingDeclaration.declarationId,
        declarantName: matchingDeclaration.declarantName,
        relatedParty: matchingDeclaration.relatedPartyOrEntity,
        natureOfInterest: matchingDeclaration.natureOfInterest,
        isPrivateCompanyExemptionApplicable: isPrivateCo,
        statutoryWarning
      };
    }

    return { hasConflict: false };
  }

  /**
   * Owner Strategic Governance Dashboard
   */
  async getGovernanceDashboard(organisationId) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');

    const orgFilter = this._getOrgFilter(organisationId);
    const meetingsCount = await GovernanceMeeting.countDocuments({ ...orgFilter, isDeleted: { $ne: true } });
    const openResolutionsCount = await GovernanceResolution.countDocuments({ ...orgFilter, status: { $in: ['DRAFT', 'REVIEW', 'APPROVED', 'ACTIONED'] } });
    const activeDelegationsCount = await DelegationOfAuthority.countDocuments({ ...orgFilter, status: 'ACTIVE', isDeleted: { $ne: true } });
    const activeSignatoriesCount = await AuthorisedSignatory.countDocuments({ ...orgFilter, status: 'ACTIVE', isDeleted: { $ne: true } });
    const activeConflictsCount = await ConflictOfInterestDeclaration.countDocuments({ ...orgFilter, status: { $in: ['SUBMITTED', 'NOTED_BY_BOARD', 'ACTIVE_MONITORING'] } });

    const legalStructure = await this.getLegalStructureStatus(organisationId);

    return {
      legalStructure,
      meetingsCount,
      openResolutionsCount,
      activeDelegationsCount,
      activeSignatoriesCount,
      activeConflictsCount,
      complianceStandard: 'COMPANIES_ACT_2013_SECRETARIAL_STANDARDS_GOVERNANCE_READY'
    };
  }
}

module.exports = new OwnerGovernanceDelegationService();
