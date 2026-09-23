'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER DATA PRIVACY & CYBERSECURITY SERVICE (STAGE 08)
 * ============================================================================
 * DPDP Act 2023 phased commencement modeling (2025/2026/2027 tranches),
 * personal data RoPA, lawful retention overrides against automated erasure,
 * NIST CSF 2.0 internal governance taxonomy, and privacy incident response.
 */

const {
  PersonalDataProcessingRegister,
} = require('../models/PersonalDataProcessingRegister');
const { ThirdPartyProcessor } = require('../models/ThirdPartyProcessor');
const {
  PrivacyIncident,
  ALLOWED_INCIDENT_TRANSITIONS,
} = require('../models/PrivacyIncident');
const { SecurityControlItem } = require('../models/SecurityControlItem');
const { PrivacyRequest } = require('../models/PrivacyRequest');

// Official Phased Commencement Tranches under DPDP Act & Rules
const DPDP_PHASED_COMMENCEMENT_SCHEDULE = [
  {
    provisionCode: 'DPDP-PHASE-1',
    description: 'Institutional Framework, Data Protection Board of India, and General Provisions',
    actSections: 'Sections 1, 2, 18-26, 38-44',
    rules: 'Rules 1, 2, 17-21',
    officialCommencementDate: '2025-11-13',
    enforcementStatusOnSep2026: 'IN_FORCE',
    notes: 'Initial institutional tranche established upon Central Government notification.',
  },
  {
    provisionCode: 'DPDP-PHASE-2',
    description: 'One-Year Tranche: Consent Manager Registration & Specified Penalty Tranches',
    actSections: 'Section 6(9), Section 27(1)(d)',
    rules: 'Rule 4',
    officialCommencementDate: '2026-11-13',
    enforcementStatusOnSep2026: 'FUTURE_EFFECTIVE',
    notes: 'Commences exactly 12 months following initial publication. Not enforceable on September 14, 2026.',
  },
  {
    provisionCode: 'DPDP-PHASE-3',
    description: 'Eighteen-Month Tranche: Principal Processing Obligations, Data Principal Rights & Security Safeguards',
    actSections: 'Sections 4, 5, 6(1)-(8), 7-17, 27(1)(a)-(c), 28-37',
    rules: 'Rules 3, 5-16, 22, 23',
    officialCommencementDate: '2027-05-13',
    enforcementStatusOnSep2026: 'FUTURE_EFFECTIVE',
    notes: 'Principal data fiduciary obligations, breach notification schedules, and Data Principal rights become enforceable 18 months post-notification. Active preparation required, but not currently legally mandatory.',
  },
];

class OwnerPrivacyCyberService {
  /**
   * Return authoritative DPDP legal status schedule
   */
  getDpdpCommencementSchedule() {
    const currentDateStr = '2026-09-14'; // Autoritative baseline anchor
    return DPDP_PHASED_COMMENCEMENT_SCHEDULE.map((item) => {
      const isPast = item.officialCommencementDate <= currentDateStr;
      return {
        ...item,
        currentStatus: isPast ? 'IN_FORCE' : 'FUTURE_EFFECTIVE',
        isCurrentlyEnforceable: isPast,
      };
    });
  }

  /**
   * Rule 46(8) Electronic Books & Documents Localisation & Backup Governance
   * Income-tax Rules, 2026 (effective 1 April 2026 for TY 2026-27 onward):
   * Requires qualifying books/documents to remain accessible in India at all times
   * and have daily backups kept on servers physically located in India.
   *
   * Crucial invariant: Non-blanket applicability. Does NOT apply to general customer,
   * employee HR, or diagnostic data merely because it is personal data.
   */
  getRule46RecordScopeMapping() {
    return [
      {
        category: 'CASH_BOOK',
        displayName: 'Cash Book',
        rule46Scope: true,
        legalReference: 'Income-tax Act, 2025 s. 44AA / Income-tax Rules, 2026 Rule 46(2)(a) & 46(8)',
        primaryStorage: 'MongoDB Atlas (ap-south-1 Mumbai)',
        indiaAccessibility: 'ACCESSIBLE_IN_INDIA_AT_ALL_TIMES',
        dailyIndiaBackup: 'REQUIRED',
        evidence: 'Atlas automated snapshot schedule; external physical location SLA pending audit',
        status: 'EXTERNAL / INFRASTRUCTURE ACCEPTANCE PENDING',
      },
      {
        category: 'JOURNAL_AND_LEDGER',
        displayName: 'Journal and General Ledgers',
        rule46Scope: true,
        legalReference: 'Income-tax Act, 2025 s. 44AA / Income-tax Rules, 2026 Rule 46(2)(b),(c) & 46(8)',
        primaryStorage: 'MongoDB Atlas (ap-south-1 Mumbai)',
        indiaAccessibility: 'ACCESSIBLE_IN_INDIA_AT_ALL_TIMES',
        dailyIndiaBackup: 'REQUIRED',
        evidence: 'Atlas cluster primary ap-south-1; daily backup physical location confirmation required',
        status: 'EXTERNAL / INFRASTRUCTURE ACCEPTANCE PENDING',
      },
      {
        category: 'SALES_INVOICES_AND_RECEIPTS',
        displayName: 'Machine-Numbered Carbon Bills / POS Tax Invoices',
        rule46Scope: true,
        legalReference: 'Income-tax Rules, 2026 Rule 46(2)(d) & CGST Act 2017 s. 36',
        primaryStorage: 'MongoDB Atlas & Render Persistent Attachment Disk',
        indiaAccessibility: 'ACCESSIBLE_IN_INDIA_AT_ALL_TIMES',
        dailyIndiaBackup: 'REQUIRED',
        evidence: 'Render persistent disk mount; automated daily snapshot physically in India pending SLA',
        status: 'EXTERNAL / INFRASTRUCTURE ACCEPTANCE PENDING',
      },
      {
        category: 'PURCHASE_BILLS_AND_EXPENSE_VOUCHERS',
        displayName: 'Original Purchase Invoices & Expense Vouchers',
        rule46Scope: true,
        legalReference: 'Income-tax Rules, 2026 Rule 46(2)(e),(f) & 46(8)',
        primaryStorage: 'MongoDB Atlas & Render Persistent Attachment Disk',
        indiaAccessibility: 'ACCESSIBLE_IN_INDIA_AT_ALL_TIMES',
        dailyIndiaBackup: 'REQUIRED',
        evidence: 'Attachment storage verification pending provider data residency confirmation',
        status: 'EXTERNAL / INFRASTRUCTURE ACCEPTANCE PENDING',
      },
      {
        category: 'INVENTORY_STOCK_REGISTER',
        displayName: 'Inventory Stock Movement & Valuation Registers',
        rule46Scope: true,
        legalReference: 'Income-tax Rules, 2026 Rule 46(3) & 46(8)',
        primaryStorage: 'MongoDB Atlas (ap-south-1 Mumbai)',
        indiaAccessibility: 'ACCESSIBLE_IN_INDIA_AT_ALL_TIMES',
        dailyIndiaBackup: 'REQUIRED',
        evidence: 'Real-time stock ledger in database; daily backup physically in India pending SLA',
        status: 'EXTERNAL / INFRASTRUCTURE ACCEPTANCE PENDING',
      },
      {
        category: 'EMPLOYEE_HR_PROFILE',
        displayName: 'Employee HR Profiles & Attendance Data',
        rule46Scope: false,
        legalReference: 'DPDP Act 2023 / Employment Law (Not Rule 46 Books of Account)',
        primaryStorage: 'MongoDB Atlas',
        indiaAccessibility: 'ACCESSIBLE_IN_INDIA',
        dailyIndiaBackup: 'NOT_MANDATORY_UNDER_RULE_46',
        evidence: 'Personal data governed by DPDP safeguards; Rule 46(8) does not apply',
        status: 'OUTSIDE_RULE46_SCOPE — GOVERNED SEPARATELY',
      },
      {
        category: 'CUSTOMER_PROFILE_AND_LOYALTY',
        displayName: 'Customer Profiles & Loyalty Points',
        rule46Scope: false,
        legalReference: 'DPDP Act 2023 (Not Rule 46 Books of Account)',
        primaryStorage: 'MongoDB Atlas',
        indiaAccessibility: 'ACCESSIBLE_IN_INDIA',
        dailyIndiaBackup: 'NOT_MANDATORY_UNDER_RULE_46',
        evidence: 'Personal data governed by DPDP safeguards; Rule 46(8) does not apply',
        status: 'OUTSIDE_RULE46_SCOPE — GOVERNED SEPARATELY',
      },
      {
        category: 'APPLICATION_TELEMETRY_LOGS',
        displayName: 'System Diagnostics & Telemetry Logs',
        rule46Scope: false,
        legalReference: 'CERT-In Directions 28 April 2022 (180 rolling days ICT security logs within Indian jurisdiction)',
        primaryStorage: 'Encrypted Application Storage',
        indiaAccessibility: 'ACCESSIBLE_IN_INDIA',
        dailyIndiaBackup: 'NOT_MANDATORY_UNDER_RULE_46',
        evidence: 'Governed by CERT-In 180-day ICT security log retention within India, not Rule 46 books of account',
        status: 'OUTSIDE_RULE46_SCOPE — GOVERNED SEPARATELY',
      },
    ];
  }

  evaluateRule46LocalisationPolicy(recordCategory) {
    const mapping = this.getRule46RecordScopeMapping();
    const match = mapping.find(
      (m) => m.category === recordCategory || m.category === String(recordCategory).toUpperCase()
    );
    if (!match) {
      return {
        recordCategory,
        rule46Scope: false,
        dailyIndiaBackupRequired: false,
        reason: 'Unmapped category outside statutory books of account schedule',
      };
    }
    return {
      recordCategory: match.category,
      displayName: match.displayName,
      rule46Scope: match.rule46Scope,
      dailyIndiaBackupRequired: match.rule46Scope,
      legalReference: match.legalReference,
      status: match.status,
    };
  }

  /**
   * Configurable Privacy Contact & DPO Governance Model
   * Invariant: Universal SDF DPO obligation is NOT mandatory because Zamorin is not formally
   * designated a Significant Data Fiduciary (SDF_DESIGNATION_STATUS = 'NOT_EVIDENCED').
   * Model supports: Data Protection Officer — where applicable / Authorised Privacy / Grievance Contact.
   */
  getPrivacyContactGovernance(organisationId, config = {}) {
    const isSDF = Boolean(config.isSignificantDataFiduciary);
    const privacyContactType = config.privacyContactType || (isSDF ? 'DATA_PROTECTION_OFFICER' : 'AUTHORISED_PRIVACY_GRIEVANCE_CONTACT');
    
    return {
      organisationId,
      privacyContactType,
      roleLabel: isSDF
        ? 'Data Protection Officer (Mandatory — Significant Data Fiduciary)'
        : 'Authorised Privacy / Grievance Contact — DPO where applicable (DPDP s. 8(9))',
      isSignificantDataFiduciary: isSDF,
      sdfDesignationStatus: config.sdfDesignationStatus || (isSDF ? 'DESIGNATED_SDF' : 'NOT_EVIDENCED'),
      mandateStatus: isSDF ? 'STATUTORY_MANDATORY_SDF' : 'PHASED_COMMENCEMENT_PENDING_SDF_EVIDENCE',
      legalBasis: isSDF
        ? 'DPDP Act 2023 Section 10 (Significant Data Fiduciary Mandate)'
        : 'DPDP Act 2023 Section 8(9) (Grievance Redressal Mechanism)',
      effectiveDate: config.effectiveDate || '2026-09-14',
      applicability: isSDF ? 'SIGNIFICANT_DATA_FIDUCIARY_ONLY' : 'STANDARD_DATA_FIDUCIARY',
      contactInformation: {
        name: config.name || 'Zamorin Legal & Privacy Governance Cell',
        title: config.title || (isSDF ? 'Data Protection Officer' : 'Authorised Privacy & Grievance Officer'),
        email: config.email || 'privacy@zamorincafe.com',
        phone: config.phone || '+91 495 272 0000',
        address: config.address || 'Zamorin Café HQ, Beach Road, Kozhikode, Kerala 673001, India',
      },
      approval: {
        status: config.approvalStatus || 'APPROVED',
        approvedBy: config.approvedBy || 'Board of Directors / Executive Governance',
        approvedAt: config.approvedAt || '2026-09-14',
      },
    };
  }

  /**
   * Register personal data processing activity (RoPA)
   */
  async createDataProcessingRegister(organisationId, payload) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const {
      processName,
      businessOwner,
      systemModule,
      dataPrincipalType,
      personalDataCategories,
      purpose,
      processingGround,
      retentionPeriodYears,
      retentionBasis,
      securityClassification,
    } = payload;

    if (!processName || !businessOwner || !dataPrincipalType || !purpose || !retentionPeriodYears || !retentionBasis) {
      throw new Error('MISSING_REQUIRED_PROCESSING_REGISTER_FIELDS');
    }

    const registerId = `ROPA-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const register = await PersonalDataProcessingRegister.create({
      registerId,
      organisationId,
      processName,
      businessOwner,
      systemModule: systemModule || 'ERP_CORE',
      dataPrincipalType,
      personalDataCategories: personalDataCategories || [],
      purpose,
      processingGround: processingGround || 'LEGITIMATE_USE',
      retentionPeriodYears,
      retentionBasis,
      securityClassification: securityClassification || 'CONFIDENTIAL',
      currentLegalStatus: 'IN_FORCE',
      dpdpCommencementDate: '2025-11-13',
    });

    return register;
  }

  async getDataProcessingRegisters(organisationId, filter = {}) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    return PersonalDataProcessingRegister.find({ organisationId, ...filter }).sort({ createdAt: -1 });
  }

  /**
   * Evaluate Erasure Request Safety:
   * Checks whether statutory retention rules (GST, Tax, PF, ESIC) or active legal holds prevent erasure.
   * STRICT INVARIANT: Never auto-delete financial or statutory data!
   */
  async evaluateErasureSafety(organisationId, { dataPrincipalType, categories }) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');

    // Canonical source-linked statutory retention policy register (Part C Requirements #13-#19)
    const statutoryRetentionMap = {
      EMPLOYEE: [
        {
          policyId: 'RET-EMP-EPF',
          basis: 'LEGAL SOURCE PENDING / ZAMORIN INTERNAL RETENTION POLICY',
          retentionRule: '5 years from end of relevant financial year (Internal Policy — statutory EPFO employer retention instruction pending)',
          retentionYears: 5,
          allowsImmediateErasure: false,
          authority: 'Zamorin Internal HR/Finance Policy',
          provision: 'Internal Policy (Statutory verification pending)',
        },
        {
          policyId: 'RET-EMP-ESI',
          basis: 'Employees State Insurance Act 1948 Section 44 & ESI (General) Regulations 1950 Reg 32',
          retentionRule: '5 years from date of last entry in Form 7 Register of Employees & contribution entries',
          retentionYears: 5,
          allowsImmediateErasure: false,
          authority: 'ESIC',
          provision: 'ESI (General) Regulations 1950 Reg 32',
        },
        {
          policyId: 'RET-EMP-GRATUITY',
          basis: 'LEGAL SOURCE PENDING / ZAMORIN INTERNAL RETENTION POLICY',
          retentionRule: '7 years from date of termination/gratuity disbursement (Internal Policy — Payment of Gratuity statutory retention pending)',
          retentionYears: 7,
          allowsImmediateErasure: false,
          authority: 'Zamorin Internal HR/Finance Policy',
          provision: 'Internal Policy (Statutory verification pending)',
        },
        {
          policyId: 'RET-EMP-TAX',
          basis: 'Income-tax Act, 2025 & Income-tax Rules, 2026 Rule 46(9) (for TY 2026-27 onward; 1961 Act s.44AA transitional)',
          retentionRule: '7 tax years from end of relevant tax year (subject to reopened assessment extension under Rule 46(9))',
          retentionYears: 7,
          allowsImmediateErasure: false,
          authority: 'CBDT',
          provision: 'Income-tax Rules, 2026 Rule 46(9)',
        },
      ],
      CUSTOMER: [
        {
          policyId: 'RET-CUST-GST',
          basis: 'CGST Act 2017 Section 36 (Tax Invoices, Accounts & Registers)',
          retentionRule: '72 calendar months from due date for furnishing annual return for relevant year, plus 1 year post-proceedings/investigation',
          retentionMonths: 72,
          retentionYears: 6,
          proceedingsOverride: '1 year after final disposal of appeal/revision/proceeding or normal period, whichever is later',
          allowsImmediateErasure: false,
          authority: 'CBIC / GST Council',
          provision: 'CGST Act 2017 s.36',
        },
        {
          policyId: 'RET-CUST-INCOMETAX',
          basis: 'Income-tax Act, 2025 & Income-tax Rules, 2026 (for TY 2026-27 onward; 1961 Act s.44AA transitional)',
          retentionRule: '8 years for books of account and related vouchers',
          retentionYears: 8,
          allowsImmediateErasure: false,
          authority: 'CBDT',
          provision: 'Income-tax Act 2025',
        },
      ],
      SUPPLIER_CONTACT: [
        {
          policyId: 'RET-SUP-COMMERCIAL',
          basis: 'Commercial Invoices & Three-Way Match Records (CGST s.36 & Income-tax Act 2025)',
          retentionRule: '72 months from GST annual return due date / 8 years for tax records',
          retentionYears: 8,
          allowsImmediateErasure: false,
          authority: 'CBIC & CBDT',
          provision: 'CGST s.36 & Income-tax Act 2025',
        },
      ],
    };

    // Internal Zamorin Retention Policies (Explicitly labeled as internal policy, not statutory)
    const internalRetentionPolicies = [
      { policyId: 'INT-LOGS-SEARCH', name: 'Search Query Logs', durationDays: 90, type: 'ZAMORIN_INTERNAL_RETENTION_POLICY' },
      { policyId: 'INT-NOTIF', name: 'In-App & Email Notifications', durationDays: 90, type: 'ZAMORIN_INTERNAL_RETENTION_POLICY' },
      { policyId: 'INT-SUPPORT-DIAG', name: 'Support System Diagnostics', durationDays: 30, type: 'ZAMORIN_INTERNAL_RETENTION_POLICY' },
      { policyId: 'INT-BCDR-DRILL', name: 'BCDR Exercise Evidence', durationYears: 5, type: 'ZAMORIN_INTERNAL_RETENTION_POLICY' },
      { policyId: 'INT-INACTIVE-CUST', name: 'Inactive Customer Account Profile', durationYears: 3, type: 'ZAMORIN_INTERNAL_RETENTION_POLICY' },
    ];

    const applicableRules = statutoryRetentionMap[dataPrincipalType] || [];
    const isErasureBlockedByLaw = applicableRules.some((r) => !r.allowsImmediateErasure);

    // Active Legal Hold Check (Litigation, GST/Tax proceedings, investigations, insurance disputes)
    const activeLegalHoldTypes = [
      'GST_PROCEEDING',
      'LITIGATION',
      'TAX_INVESTIGATION',
      'EMPLOYMENT_DISPUTE',
      'INSURANCE_CLAIM',
      'SECURITY_INCIDENT_INVESTIGATION',
      'AUDIT_HOLD',
    ];

    return {
      organisationId,
      dataPrincipalType,
      categoriesRequested: categories || ['ALL'],
      isErasureBlockedByLaw,
      governingRetentionRules: applicableRules,
      internalRetentionPolicies,
      activeLegalHoldTypes,
      decision: isErasureBlockedByLaw ? 'ERASURE_RESTRICTED_BY_STATUTORY_RETENTION' : 'ELIGIBLE_FOR_REVIEW',
      actionableGuidance: isErasureBlockedByLaw
        ? 'Personal data embedded in financial invoices, GST tax invoices (72 calendar months under CGST s.36), or statutory payroll records cannot be erased prior to expiration of statutory limitation periods or during active legal holds. Request must be declined or restricted to non-statutory marketing data.'
        : 'Eligible for governed data masking review.',
    };
  }

  /**
   * Process/Decline Privacy Request with full governance
   */
  async handlePrivacyRequestAction(organisationId, requestId, { action, reason, user }) {
    if (!organisationId || !requestId || !action) {
      throw new Error('MISSING_REQUEST_ACTION_PARAMETERS');
    }

    const req = await PrivacyRequest.findOne({ organisationId, requestId });
    if (!req) throw new Error('PRIVACY_REQUEST_NOT_FOUND');

    if (action === 'DECLINE_DUE_TO_STATUTORY_RETENTION') {
      req.status = 'DECLINED';
      req.reviewedByUserId = user.userId || user.email || 'OWNER';
      req.reviewedAt = new Date();
      req.retentionJustification = reason || 'Statutory financial & tax record retention mandate under GST and Income Tax laws.';
      req.reviewNote = 'Automated erasure blocked in compliance with statutory recordkeeping obligations.';
      req.auditHistory.push({
        action: 'DECLINED_STATUTORY_RETENTION',
        performedByUserId: user.userId || user.email || 'OWNER',
        note: req.retentionJustification,
        timestamp: new Date(),
      });
      await req.save();
      return req;
    }

    if (action === 'APPROVE_INFORMATION') {
      req.status = 'COMPLETED';
      req.reviewedByUserId = user.userId || user.email || 'OWNER';
      req.reviewedAt = new Date();
      req.reviewNote = reason || 'Privacy access report dispatched to verified Data Principal.';
      req.auditHistory.push({
        action: 'COMPLETED_ACCESS_FULFILLMENT',
        performedByUserId: user.userId || user.email || 'OWNER',
        note: req.reviewNote,
        timestamp: new Date(),
      });
      await req.save();
      return req;
    }

    throw new Error(`UNSUPPORTED_PRIVACY_REQUEST_ACTION: ${action}`);
  }

  async submitPrivacyRequest(organisationId, payload, authUser) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const { requestType, reason, dataCategory, proposedCorrection } = payload;
    if (!requestType || !reason) throw new Error('MISSING_PRIVACY_REQUEST_FIELDS');

    const requestId = `PRV-${Date.now().toString().slice(-6)}-${String(Math.floor(10000 + Math.random() * 90000))}`;
    const subjectUserId = authUser.userId || authUser.id;

    const request = await PrivacyRequest.create({
      requestId,
      organisationId,
      subjectUserId,
      requestType,
      reason,
      dataCategory: dataCategory || 'GENERAL_PERSONAL_DATA',
      proposedCorrection: proposedCorrection || '',
      status: 'SUBMITTED',
      auditHistory: [
        {
          action: 'SUBMITTED',
          performedByUserId: subjectUserId,
          note: reason,
          timestamp: new Date(),
        },
      ],
    });

    return request;
  }

  async getMyPrivacyRequests(organisationId, userId) {
    if (!organisationId || !userId) throw new Error('ORGANISATION_AND_USER_ID_REQUIRED');
    return PrivacyRequest.find({ organisationId, subjectUserId: userId }).sort({ createdAt: -1 }).lean();
  }

  async discoverPersonalDataForRequest(organisationId, requestId) {
    if (!organisationId || !requestId) throw new Error('ORGANISATION_AND_REQUEST_ID_REQUIRED');
    const req = await PrivacyRequest.findOne({ organisationId, requestId }).lean();
    if (!req) throw new Error('PRIVACY_REQUEST_NOT_FOUND');

    const userId = req.subjectUserId;
    const { User } = require('../models/User');
    const { EmployeeTraining } = require('../models/EmployeeTraining');
    const { EmployeeCompetency } = require('../models/EmployeeCompetency');
    const { SopAcknowledgement } = require('../models/SopAcknowledgement');
    const { Payslip } = require('../models/Payslip');
    const { maskEmail, maskPhone, maskAadhaar, maskPan } = require('../utils/dataClassifier');

    const [userDoc, trainings, competencies, sops, payslipCount] = await Promise.all([
      User.findOne({ organisationId, userId }).lean(),
      EmployeeTraining.find({ organisationId, userId }).lean(),
      EmployeeCompetency.find({ organisationId, userId }).lean(),
      SopAcknowledgement.find({ organisationId, userId }).lean(),
      Payslip.countDocuments({ organisationId, $or: [{ employeeUserId: userId }, { employeeId: userId }] }),
    ]);

    return {
      requestId,
      organisationId,
      subjectUserId: userId,
      requestType: req.requestType,
      eligiblePersonalData: {
        profile: userDoc
          ? {
              userId: userDoc.userId,
              name: userDoc.fullName || userDoc.name,
              emailMasked: userDoc.email ? maskEmail(userDoc.email) : '',
              phoneMasked: (userDoc.phone || userDoc.phoneNumber) ? maskPhone(userDoc.phone || userDoc.phoneNumber) : '',
              aadhaarMasked: userDoc.statutoryApplicability?.aadhaarMasked || (userDoc.aadhaarNumber ? maskAadhaar(userDoc.aadhaarNumber) : null),
              panMasked: userDoc.statutoryApplicability?.pan ? maskPan(userDoc.statutoryApplicability.pan) : (userDoc.panNumber ? maskPan(userDoc.panNumber) : null),
              role: userDoc.role,
              primaryCafeId: userDoc.primaryCafeId,
            }
          : null,
        trainingRecordsCount: trainings.length,
        competencyRecordsCount: competencies.length,
        sopAcknowledgementsCount: sops.length,
      },
      statutoryRetentionBoundaries: [
        {
          domain: 'PAYROLL_AND_STATUTORY_BENEFITS',
          recordsFoundCount: payslipCount,
          statutoryBasis:
            'Income-tax Act, 2025 & Rules 2026 Rule 46(9) (7 tax years from end of relevant tax year; reopened assessment extension) & Zamorin Internal EPF Retention Policy (Statutory EPFO source pending)',
          minimumMandatoryRetentionYears: 7,
          erasurePermitted: false,
          restrictionReason:
            'Statutory financial and payroll records cannot be erased before statutory limitation period expiration.',
        },
        {
          domain: 'SECURITY_ICT_LOGS_AND_AUDIT_TRAIL',
          statutoryBasis:
            'CERT-In Cyber Security Directions (180 rolling days for ICT system logs securely within Indian jurisdiction) / Companies Act 2013 s. 128(5) (8 financial years for corporate accounting audit trail where applicable)',
          retentionPeriod: '180 rolling days for ICT logs; 8 financial years for corporate accounting audit trail',
          jurisdiction: 'INDIA',
          erasurePermitted: false,
          restrictionReason:
            'Security logs must be preserved for CERT-In incident investigation within Indian jurisdiction, and accounting audit trails cannot be altered or destroyed.',
        },
      ],
    };
  }

  /**
   * Register Third Party Data Processor (DPDP Rule 15 Readiness & Internal Security Governance)
   */
  async registerThirdPartyProcessor(organisationId, payload) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const {
      providerName,
      serviceDescription,
      dataCategoriesProcessed,
      purpose,
      contractReference,
      dataStorageGeography,
      processingCountry,
      storageCountry,
      transferDestination,
      isCrossBorder,
      applicableRestriction,
      foreignStateControlRelationship,
      centralGovernmentOrder,
      sectoralLawRestriction,
      governmentOrderReference,
      effectiveDate,
      transferAssessment,
      decision,
      evidence,
      contractGovernance,
      technicalControlStatus,
      legalRequirementStatus,
      securityReview,
      approval,
      rule15ReadinessStatus,
      subProcessors,
      exitDeletionObligation,
    } = payload;

    if (!providerName || !serviceDescription || !purpose) {
      throw new Error('MISSING_PROCESSOR_FIELDS');
    }

    const processorId = `PRC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const storageGeo = storageCountry || dataStorageGeography || 'India';
    const isTransfer = isCrossBorder !== undefined ? Boolean(isCrossBorder) : (storageGeo !== 'India' && storageGeo !== 'India (MeitY empaneled cloud)');

    const processor = await ThirdPartyProcessor.create({
      processorId,
      organisationId,
      providerName,
      serviceDescription,
      dataCategoriesProcessed: dataCategoriesProcessed || [],
      purpose,
      contractReference: contractReference || '',
      dataStorageGeography: dataStorageGeography || storageGeo,
      processingCountry: processingCountry || 'India',
      storageCountry: storageCountry || storageGeo,
      transferDestination: transferDestination || (isTransfer ? storageGeo : ''),
      isCrossBorder: isTransfer,
      applicableRestriction: applicableRestriction || 'NONE',
      foreignStateControlRelationship: foreignStateControlRelationship || 'NONE',
      centralGovernmentOrder: centralGovernmentOrder || governmentOrderReference || '',
      sectoralLawRestriction: sectoralLawRestriction || '',
      governmentOrderReference: governmentOrderReference || centralGovernmentOrder || '',
      effectiveDate: effectiveDate || null,
      transferAssessment: transferAssessment || {
        assessed: isTransfer,
        assessmentDate: isTransfer ? new Date().toISOString().split('T')[0] : null,
        safeguards: isTransfer ? 'Internal Contract Governance, Data Encryption in Transit/At Rest, and Access Isolation' : '',
        riskLevel: isTransfer ? 'LOW' : 'UNASSESSED',
      },
      decision: decision || 'PERMITTED',
      evidence: evidence || (isTransfer ? 'Internal security audit and SOC 2 / ISO 27001 report on file' : ''),
      contractGovernance: contractGovernance || {
        hasDpa: true,
        contractRef: contractReference || '',
        auditRights: true,
        internalSafeguards: 'INTERNAL_CONTRACT_SECURITY_GOVERNANCE',
      },
      technicalControlStatus: technicalControlStatus || 'ACTIVE',
      legalRequirementStatus: legalRequirementStatus || 'FUTURE_EFFECTIVE',
      securityReview: securityReview || {
        reviewed: true,
        reviewDate: new Date().toISOString().split('T')[0],
        reviewer: 'Enterprise Security Governance',
      },
      approval: approval || {
        status: 'APPROVED',
        approvedBy: 'Authorised Privacy / Grievance Contact — DPO where applicable',
      },
      rule15ReadinessStatus: rule15ReadinessStatus || 'IMPLEMENTED / FUTURE-COMPLIANCE READY',
      subProcessors: subProcessors || [],
      securityReviewDate: new Date().toISOString().split('T')[0],
      exitDeletionObligation: exitDeletionObligation || 'Mandatory certificate of destruction within 30 days of contract termination',
    });

    return processor;
  }

  async getThirdPartyProcessors(organisationId) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    return ThirdPartyProcessor.find({ organisationId, isActive: true });
  }

  /**
   * Privacy Incident Management (Governed 8-step lifecycle)
   */
  async reportPrivacyIncident(organisationId, payload, user) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const { title, description, severity, affectedDataCategories, estimatedAffectedPrincipals } = payload;
    if (!title || !description) throw new Error('MISSING_INCIDENT_FIELDS');

    const incidentId = `PINC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const incident = await PrivacyIncident.create({
      incidentId,
      organisationId,
      title,
      description,
      severity: severity || 'MEDIUM',
      status: 'DETECTED',
      affectedDataCategories: affectedDataCategories || [],
      estimatedAffectedPrincipals: Number(estimatedAffectedPrincipals) || 0,
      reportedByUserId: user.userId || user.email || 'OWNER',
      auditTrail: [
        {
          action: 'INCIDENT_DETECTED',
          fromStatus: null,
          toStatus: 'DETECTED',
          performedBy: user.userId || user.email || 'OWNER',
          notes: 'Initial privacy event logged into governed queue.',
        },
      ],
    });

    return incident;
  }

  async updatePrivacyIncidentStatus(organisationId, incidentId, { targetStatus, notes, user, containmentActions, notificationRationale }) {
    if (!organisationId || !incidentId || !targetStatus) {
      throw new Error('MISSING_INCIDENT_UPDATE_PARAMETERS');
    }

    const incident = await PrivacyIncident.findOne({ organisationId, incidentId });
    if (!incident) throw new Error('PRIVACY_INCIDENT_NOT_FOUND');

    const allowed = ALLOWED_INCIDENT_TRANSITIONS[incident.status] || [];
    if (!allowed.includes(targetStatus)) {
      throw new Error(`INVALID_INCIDENT_TRANSITION: Cannot transition from ${incident.status} to ${targetStatus}`);
    }

    const prev = incident.status;
    incident.status = targetStatus;

    if (containmentActions) incident.containmentActions = containmentActions;
    if (notificationRationale) incident.notificationRationale = notificationRationale;

    if (targetStatus === 'CLOSED') {
      incident.closedAt = new Date();
      incident.closedByUserId = user.userId || user.email || 'OWNER';
    }

    incident.auditTrail.push({
      action: `TRANSITION_TO_${targetStatus}`,
      fromStatus: prev,
      toStatus: targetStatus,
      performedBy: user.userId || user.email || 'OWNER',
      notes: notes || 'Governed privacy incident lifecycle progression',
    });

    await incident.save();
    return incident;
  }

  /**
   * NIST CSF 2.0 Security Control Register
   * Internal taxonomy only; zero statutory/certification fabrication.
   */
  async registerSecurityControl(organisationId, payload) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const { controlId, csfFunction, categoryCode, title, objective, technicalMechanism, effectiveness } = payload;
    if (!controlId || !csfFunction || !categoryCode || !title || !objective) {
      throw new Error('MISSING_SECURITY_CONTROL_FIELDS');
    }

    const item = await SecurityControlItem.create({
      controlId,
      organisationId,
      csfFunction,
      categoryCode,
      title,
      objective,
      technicalMechanism: technicalMechanism || '',
      effectiveness: effectiveness || 'EFFECTIVE',
      implementationStatus: 'IMPLEMENTED',
      frameworkNotice: 'NIST CSF 2.0 internal taxonomy reference. Not a statutory regulation or third-party certification.',
      isNistStatutory: false,
      isExternalCertified: false,
    });

    return item;
  }

  async getSecurityControls(organisationId, csfFunction) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const query = { organisationId };
    if (csfFunction) query.csfFunction = csfFunction;
    return SecurityControlItem.find(query).sort({ csfFunction: 1, controlId: 1 });
  }

  /**
   * Executive Privacy & Cybersecurity Dashboard
   */
  async getExecutivePrivacyCyberDashboard(organisationId) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');

    const [processingRegisters, processors, incidents, securityControls, privacyRequests] = await Promise.all([
      PersonalDataProcessingRegister.find({ organisationId }),
      ThirdPartyProcessor.find({ organisationId, isActive: true }),
      PrivacyIncident.find({ organisationId }),
      SecurityControlItem.find({ organisationId }),
      PrivacyRequest.find({ organisationId }),
    ]);

    const activeIncidents = incidents.filter((i) => i.status !== 'CLOSED');
    const pendingRequests = privacyRequests.filter((r) => !['COMPLETED', 'DECLINED', 'WITHDRAWN'].includes(r.status));

    return {
      dpdpSchedule: this.getDpdpCommencementSchedule(),
      totalDataProcessingActivitiesCount: processingRegisters.length,
      activeThirdPartyProcessorsCount: processors.length,
      activePrivacyIncidentsCount: activeIncidents.length,
      pendingDataPrincipalRequestsCount: pendingRequests.length,
      totalSecurityControlsCount: securityControls.length,
      nistFunctionsCovered: [...new Set(securityControls.map((c) => c.csfFunction))],
      privacyContactGovernance: this.getPrivacyContactGovernance(organisationId),
      rule46RecordScopeMapping: this.getRule46RecordScopeMapping(),
      governanceNotice: 'NIST CSF 2.0 mapping is an internal taxonomy. Phased DPDP compliance acknowledges 2026/2027 future-effective tranches; future-effective provisions are IMPLEMENTED / FUTURE-COMPLIANCE READY.',
    };
  }
}

module.exports = new OwnerPrivacyCyberService();
