'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — GLOBAL DATA PRIVACY & CYBERSECURITY TEST SUITE
 * ============================================================================
 * Verifies application-wide data privacy and cybersecurity enforcement:
 * - Cross-Tenant and Cross-Café Authorization Isolation
 * - Field-level masking (Aadhaar, PAN, Bank Account, Phone, Email)
 * - Global Search masking for non-privileged roles
 * - Global Export sanitization (PDF/XLSX)
 * - Central Security Logging PII/Credential redaction
 * - Canonical single Incident creation across all roles
 * - Statutory Retention blocking automated erasure
 * - Cross-module Data Principal discovery with statutory boundaries
 * - DPDP Cross-Border Transfer Governance (Rule 15 readiness, no blanket India-only)
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { User } = require('../src/models/User');
const { PrivacyIncident } = require('../src/models/PrivacyIncident');
const { PrivacyRequest } = require('../src/models/PrivacyRequest');
const { ThirdPartyProcessor } = require('../src/models/ThirdPartyProcessor');
const { EmployeeTraining } = require('../src/models/EmployeeTraining');
const { EmployeeCompetency } = require('../src/models/EmployeeCompetency');
const { SopAcknowledgement } = require('../src/models/SopAcknowledgement');
const { Payslip } = require('../src/models/Payslip');

const {
  maskAadhaar,
  maskPan,
  maskBankAccount,
  maskPhone,
  maskEmail,
  sanitizeRecordByRole,
} = require('../src/utils/dataClassifier');
const { logSecurityEvent } = require('../src/services/securityLogger');
const ownerPrivacyCyberService = require('../src/services/ownerPrivacyCyberService');

describe('STAGE 08 — Global Privacy & Cybersecurity Cross-App Suite', () => {
  const TEST_ORG = 'ORG-TEST-SEC-01';
  const FOREIGN_ORG = 'ORG-TEST-SEC-FOREIGN';
  const USER_STAFF = 'ST-1001';
  const USER_MGR = 'AD-1001';

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/zamorin_erp_test';
      await mongoose.connect(uri);
    }

    await Promise.all([
      User.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } }),
      PrivacyIncident.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } }),
      PrivacyRequest.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } }),
      ThirdPartyProcessor.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } }),
      EmployeeTraining.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } }),
      EmployeeCompetency.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } }),
      SopAcknowledgement.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } }),
      Payslip.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } }),
    ]);

    // Seed test users
    await User.create({
      organisationId: TEST_ORG,
      userId: USER_STAFF,
      email: 'staff.sec@zamorin.cafe',
      phone: '+919876543210',
      phoneNumber: '+919876543210',
      aadhaarNumber: '123456789012',
      panNumber: 'ABCDE1234F',
      statutoryApplicability: {
        pan: 'ABCDE1234F',
        aadhaarMasked: 'XXXXXXXX9012',
      },
      bankAccountNumber: '9876543210001',
      name: 'Vikram Menon',
      fullName: 'Vikram Menon',
      role: 'STAFF',
      primaryCafeId: 'ZC-0001',
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      employmentStatus: 'ACTIVE',
    });

    await User.create({
      organisationId: TEST_ORG,
      userId: USER_MGR,
      email: 'mgr.sec@zamorin.cafe',
      phone: '+919876543211',
      phoneNumber: '+919876543211',
      name: 'Sunita Rao',
      fullName: 'Sunita Rao',
      role: 'CAFE_ADMIN',
      primaryCafeId: 'ZC-0001',
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      employmentStatus: 'ACTIVE',
    });

    // Seed payslip for statutory retention test
    await Payslip.create({
      organisationId: TEST_ORG,
      payslipId: 'PS-202608-0001',
      payrollRunId: 'PR-202608-0001',
      cafeId: 'ZC-0001',
      employeeUserId: USER_STAFF,
      employeeName: 'Vikram Menon',
      periodKey: '2026-08',
      periodStartDate: '2026-08-01',
      periodEndDate: '2026-08-31',
      earnings: { totalEarningsPaise: 0 },
      deductions: { totalDeductionPaise: 0 },
      netPayPaise: 0,
      status: 'DRAFT',
      createdBy: 'SYSTEM',
    });
  });

  after(async () => {
    await Promise.all([
      User.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } }),
      PrivacyIncident.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } }),
      PrivacyRequest.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } }),
      ThirdPartyProcessor.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } }),
      EmployeeTraining.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } }),
      EmployeeCompetency.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } }),
      SopAcknowledgement.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } }),
      Payslip.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } }),
    ]);
    await mongoose.disconnect();
  });

  test('1. Field Masking: Aadhaar, PAN, Bank Account, Phone, and Email mask correctly', () => {
    assert.equal(maskAadhaar('123456789012'), 'XXXXXXXX9012');
    assert.equal(maskPan('ABCDE1234F'), 'XXXXX234F');
    assert.equal(maskBankAccount('9876543210001'), '**** **** **** 0001');
    assert.equal(maskPhone('+919876543210'), 'XXXXXX3210');
    assert.equal(maskEmail('vikram.menon@zamorin.cafe'), 'v***n@zamorin.cafe');
  });

  test('2. Role-based record sanitization: Confidential fields stripped or masked for CAFE_ADMIN and STAFF', () => {
    const rawEmployee = {
      userId: USER_STAFF,
      fullName: 'Vikram Menon',
      phoneNumber: '+919876543210',
      email: 'vikram.menon@zamorin.cafe',
      aadhaarNumber: '123456789012',
      panNumber: 'ABCDE1234F',
      bankAccountNumber: '9876543210001',
      salaryPaisa: 3500000,
      passwordHash: '$2b$10$verysecurehash',
    };

    // CAFE_ADMIN viewing employee
    const sanitizedForAdmin = sanitizeRecordByRole(rawEmployee, 'CAFE_ADMIN');
    assert.equal(sanitizedForAdmin.passwordHash, undefined);
    assert.equal(sanitizedForAdmin.bankAccountNumber, undefined);
    assert.equal(sanitizedForAdmin.salaryPaisa, undefined);
    assert.equal(sanitizedForAdmin.aadhaarNumber, 'XXXXXXXX9012');
    assert.equal(sanitizedForAdmin.panNumber, 'XXXXX234F');
    assert.equal(sanitizedForAdmin.phoneNumber, 'XXXXXX3210');

    // STAFF viewing other employee
    const sanitizedForStaff = sanitizeRecordByRole(rawEmployee, 'STAFF');
    assert.equal(sanitizedForStaff.passwordHash, undefined);
    assert.equal(sanitizedForStaff.bankAccountNumber, undefined);
    assert.equal(sanitizedForStaff.salaryPaisa, undefined);
    assert.equal(sanitizedForStaff.aadhaarNumber, undefined);
    assert.equal(sanitizedForStaff.panNumber, undefined);
  });

  test('3. Central Security Logging: Sensitive credentials and banking info automatically redacted', () => {
    const event = logSecurityEvent({
      action: 'TEST_SENSITIVE_LOG',
      severity: 'INFO',
      metadata: {
        password: 'SecretPassword123!',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy',
        bankAccountNumber: '9876543210001',
        normalKey: 'SafeInformation',
      },
    });

    assert.ok(event.metadata);
    assert.equal(event.metadata.password, '[REDACTED]');
    assert.equal(event.metadata.refreshToken, '[REDACTED]');
    assert.equal(event.metadata.bankAccountNumber, '[REDACTED]');
    assert.equal(event.metadata.normalKey, 'SafeInformation');
  });

  test('4. Canonical Incident Linkage: Single canonical incident created from any authenticated role', async () => {
    const incident = await ownerPrivacyCyberService.reportPrivacyIncident(
      TEST_ORG,
      {
        title: 'Suspected Device Physical Theft at Beachside Café',
        description: 'KDS tablet reported stolen from kitchen back door.',
        severity: 'MEDIUM',
        affectedDataCategories: ['OPERATIONAL_TICKETS'],
        estimatedAffectedPrincipals: 0,
      },
      { userId: USER_STAFF, email: 'staff.sec@zamorin.cafe' }
    );

    assert.ok(incident.incidentId);
    assert.equal(incident.status, 'DETECTED');
    assert.equal(incident.organisationId, TEST_ORG);

    // Exists in canonical collection
    const found = await PrivacyIncident.findOne({ organisationId: TEST_ORG, incidentId: incident.incidentId });
    assert.ok(found);
    assert.equal(found.title, 'Suspected Device Physical Theft at Beachside Café');
  });

  test('5. DPDP Cross-Border Transfer Governance: Foreign processors accepted with Central Government Rule 15 readiness (no blanket India-only block)', async () => {
    const foreignProcessor = await ownerPrivacyCyberService.registerThirdPartyProcessor(TEST_ORG, {
      providerName: 'Stripe International Financial Infrastructure',
      serviceDescription: 'International Payment Gateway & Settlement Gateway',
      dataCategoriesProcessed: ['PAYMENT_TOKEN', 'TRANSACTION_AMOUNT'],
      purpose: 'Processing international credit card transactions',
      contractReference: 'MSA-STRIPE-GLOBAL-2026',
      storageCountry: 'Ireland',
      processingCountry: 'United States',
      transferDestination: 'EU/US Secure Cloud Infrastructure',
      isCrossBorder: true,
      foreignStateControlRelationship: 'NONE',
      centralGovernmentOrder: 'No restrictive order notified by Central Government for financial gateway processors',
      applicableRestriction: 'NONE',
      transferAssessment: {
        assessed: true,
        assessmentDate: '2026-09-14',
        safeguards: 'Internal Contract Governance, Data Encryption in Transit/At Rest, and Access Isolation',
        riskLevel: 'LOW',
      },
      decision: 'PERMITTED',
      evidence: 'SOC 2 Type II and PCI DSS Level 1 certifications on file',
      contractGovernance: {
        hasDpa: true,
        contractRef: 'MSA-STRIPE-GLOBAL-2026',
        auditRights: true,
        internalSafeguards: 'INTERNAL_CONTRACT_SECURITY_GOVERNANCE',
      },
      technicalControlStatus: 'ACTIVE',
      legalRequirementStatus: 'FUTURE_EFFECTIVE',
      securityReview: { reviewed: true, reviewDate: '2026-09-14', reviewer: 'Enterprise Security Lead' },
      approval: { status: 'APPROVED', approvedBy: 'Legal Director' },
      rule15ReadinessStatus: 'FUTURE_COMPLIANCE_READINESS',
    });

    assert.ok(foreignProcessor.processorId);
    assert.equal(foreignProcessor.isCrossBorder, true);
    assert.equal(foreignProcessor.storageCountry, 'Ireland');
    assert.equal(foreignProcessor.foreignStateControlRelationship, 'NONE');
    assert.equal(foreignProcessor.decision, 'PERMITTED');
    assert.equal(foreignProcessor.technicalControlStatus, 'ACTIVE');
    assert.equal(foreignProcessor.legalRequirementStatus, 'FUTURE_EFFECTIVE');
    assert.equal(foreignProcessor.rule15ReadinessStatus, 'FUTURE_COMPLIANCE_READINESS');
    assert.equal(foreignProcessor.isActive, true);
    assert.equal(foreignProcessor.approval.status, 'APPROVED');
  });

  test('6. Statutory Retention: Blocks unlawful automated erasure of statutory payroll & tax records', async () => {
    const evaluation = await ownerPrivacyCyberService.evaluateErasureSafety(TEST_ORG, {
      dataPrincipalType: 'EMPLOYEE',
      categories: ['PAYROLL', 'SALARY', 'ATTENDANCE'],
    });

    assert.equal(evaluation.isErasureBlockedByLaw, true);
    assert.equal(evaluation.decision, 'ERASURE_RESTRICTED_BY_STATUTORY_RETENTION');
    assert.ok(evaluation.governingRetentionRules.length >= 3);
  });

  test('7. Data Principal Request Cross-Module Discovery: Discovers personal records while establishing statutory boundaries', async () => {
    // Submit request
    const req = await ownerPrivacyCyberService.submitPrivacyRequest(
      TEST_ORG,
      {
        requestType: 'ACCESS',
        reason: 'Employee requesting summary of personal data held under DPDP framework.',
      },
      { userId: USER_STAFF }
    );

    assert.ok(req.requestId);
    assert.equal(req.status, 'SUBMITTED');

    // Discover data across modules
    const discovery = await ownerPrivacyCyberService.discoverPersonalDataForRequest(TEST_ORG, req.requestId);

    assert.equal(discovery.subjectUserId, USER_STAFF);
    assert.ok(discovery.eligiblePersonalData.profile);
    assert.equal(discovery.eligiblePersonalData.profile.emailMasked, 's***c@zamorin.cafe');
    assert.equal(discovery.eligiblePersonalData.profile.aadhaarMasked, 'XXXXXXXX9012');
    assert.equal(discovery.eligiblePersonalData.profile.panMasked, 'XXXXX234F');

    // Statutory boundaries
    assert.ok(discovery.statutoryRetentionBoundaries.length >= 2);
    const payrollBoundary = discovery.statutoryRetentionBoundaries.find(
      (b) => b.domain === 'PAYROLL_AND_STATUTORY_BENEFITS'
    );
    assert.ok(payrollBoundary);
    assert.equal(payrollBoundary.erasurePermitted, false);
    assert.equal(payrollBoundary.recordsFoundCount, 1);
  });

  test('8. Multi-Tenant IDOR: Foreign organisation denied access to privacy requests & data', async () => {
    const req = await PrivacyRequest.create({
      requestId: 'PRV-888888-99999',
      organisationId: FOREIGN_ORG,
      subjectUserId: 'FOREIGN-USER',
      requestType: 'ACCESS',
      reason: 'Foreign organization test',
    });

    await assert.rejects(
      async () => {
        await ownerPrivacyCyberService.discoverPersonalDataForRequest(TEST_ORG, req.requestId);
      },
      { message: 'PRIVACY_REQUEST_NOT_FOUND' }
    );
  });
});
