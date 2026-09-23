'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 08: DATA PRIVACY & CYBERSECURITY TEST SUITE
 * ============================================================================
 * Tests DPDP phased commencement modeling, RoPA, lawful retention overrides
 * against automated erasure, NIST CSF 2.0 internal governance, and privacy incidents.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const {
  PersonalDataProcessingRegister,
} = require('../src/models/PersonalDataProcessingRegister');
const { ThirdPartyProcessor } = require('../src/models/ThirdPartyProcessor');
const { PrivacyIncident } = require('../src/models/PrivacyIncident');
const { SecurityControlItem } = require('../src/models/SecurityControlItem');
const { PrivacyRequest } = require('../src/models/PrivacyRequest');
const ownerPrivacyCyberService = require('../src/services/ownerPrivacyCyberService');

describe('STAGE 08 — Data Privacy & Cybersecurity Governance Suite', () => {
  const TEST_ORG = 'ORG-TEST-STAGE08';
  const FOREIGN_ORG = 'ORG-TEST-FOREIGN08';
  const USER_OWNER = { userId: 'USR-OWNER-08', email: 'owner08@zamorin.com' };

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/zamorin_erp_test';
      await mongoose.connect(uri);
    }

    await PersonalDataProcessingRegister.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await ThirdPartyProcessor.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await PrivacyIncident.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await SecurityControlItem.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await PrivacyRequest.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
  });

  after(async () => {
    await PersonalDataProcessingRegister.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await ThirdPartyProcessor.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await PrivacyIncident.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await SecurityControlItem.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await PrivacyRequest.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await mongoose.disconnect();
  });

  test('1. DPDP Phased Commencement: Validates September 14, 2026 current vs future enforcement', () => {
    const schedule = ownerPrivacyCyberService.getDpdpCommencementSchedule();
    assert.equal(schedule.length, 3);

    // Phase 1 (13 Nov 2025) is IN_FORCE
    const phase1 = schedule.find((s) => s.provisionCode === 'DPDP-PHASE-1');
    assert.equal(phase1.currentStatus, 'IN_FORCE');
    assert.equal(phase1.isCurrentlyEnforceable, true);

    // Phase 2 (13 Nov 2026) is FUTURE_EFFECTIVE
    const phase2 = schedule.find((s) => s.provisionCode === 'DPDP-PHASE-2');
    assert.equal(phase2.currentStatus, 'FUTURE_EFFECTIVE');
    assert.equal(phase2.isCurrentlyEnforceable, false);

    // Phase 3 (13 May 2027) is FUTURE_EFFECTIVE
    const phase3 = schedule.find((s) => s.provisionCode === 'DPDP-PHASE-3');
    assert.equal(phase3.currentStatus, 'FUTURE_EFFECTIVE');
    assert.equal(phase3.isCurrentlyEnforceable, false);
  });

  test('2. Personal Data RoPA: Registers processing activities with non-blanket statutory retention', async () => {
    const payrollRopa = await ownerPrivacyCyberService.createDataProcessingRegister(TEST_ORG, {
      processName: 'Employee Monthly Payroll & TDS Compliance',
      businessOwner: 'Head of Finance & HR',
      systemModule: 'PAYROLL',
      dataPrincipalType: 'EMPLOYEE',
      personalDataCategories: ['NAME', 'PAN', 'BANK_ACCOUNT', 'EPFO_UAN', 'SALARY'],
      purpose: 'Disbursement of monthly wages and statutory reporting to ITD/EPFO.',
      processingGround: 'STATUTORY_EMPLOYMENT_OBLIGATION',
      retentionPeriodYears: 7,
      retentionBasis: 'Income-tax Act, 2025 & Income-tax Rules, 2026 Rule 46(9) (7 tax years from end of relevant tax year; reopened-assessment extension) & Zamorin Internal EPF Policy',
      securityClassification: 'RESTRICTED',
    });

    assert.ok(payrollRopa.registerId);
    assert.equal(payrollRopa.retentionPeriodYears, 7);
    assert.equal(payrollRopa.currentLegalStatus, 'IN_FORCE');

    const customerRopa = await ownerPrivacyCyberService.createDataProcessingRegister(TEST_ORG, {
      processName: 'POS Billing & GST Invoicing',
      businessOwner: 'Cafe Store Manager',
      systemModule: 'POS_BILLING',
      dataPrincipalType: 'CUSTOMER',
      personalDataCategories: ['PHONE', 'NAME', 'TAX_INVOICE_DETAILS'],
      purpose: 'Issuance of GST Tax Invoices and statutory sales recording.',
      processingGround: 'STATUTORY_COMPLIANCE_GST_ACT',
      retentionPeriodYears: 6,
      retentionBasis: 'Central Goods and Services Tax Act 2017 Section 36',
      securityClassification: 'CONFIDENTIAL',
    });

    assert.ok(customerRopa.registerId);
    assert.equal(customerRopa.retentionPeriodYears, 6);
    assert.notEqual(payrollRopa.retentionPeriodYears, customerRopa.retentionPeriodYears); // Proves no blanket retention!
  });

  test('3. Lawful Retention Blocks Automated Erasure: GST and Income Tax prevent unlawful data destruction', async () => {
    // Customer requests erasure of billing history
    const evaluation = await ownerPrivacyCyberService.evaluateErasureSafety(TEST_ORG, {
      dataPrincipalType: 'CUSTOMER',
      categories: ['TAX_INVOICE_DETAILS', 'TRANSACTION_RECORDS'],
    });

    assert.equal(evaluation.isErasureBlockedByLaw, true);
    assert.equal(evaluation.decision, 'ERASURE_RESTRICTED_BY_STATUTORY_RETENTION');
    assert.ok(evaluation.governingRetentionRules.some((r) => r.basis.includes('GST Act 2017')));
  });

  test('4. Governed Privacy Request Decline: Enforces statutory retention justification audit', async () => {
    const pr = await PrivacyRequest.create({
      requestId: 'PRV-260914-00101',
      organisationId: TEST_ORG,
      subjectUserId: 'CUST-0099',
      requestType: 'ERASURE',
      status: 'SUBMITTED',
      reason: 'Requesting erasure of all my past coffee purchase invoices.',
    });

    const declined = await ownerPrivacyCyberService.handlePrivacyRequestAction(
      TEST_ORG,
      pr.requestId,
      {
        action: 'DECLINE_DUE_TO_STATUTORY_RETENTION',
        reason: 'Section 36 of CGST Act 2017 mandates 72-month retention of tax invoices from annual return filing date.',
        user: USER_OWNER,
      }
    );

    assert.equal(declined.status, 'DECLINED');
    assert.ok(declined.retentionJustification.includes('Section 36 of CGST Act'));
    assert.ok(declined.auditHistory.some((a) => a.action === 'DECLINED_STATUTORY_RETENTION'));
  });

  test('5. Third-Party Processor Register: Tracks domestic storage and mandatory exit deletion', async () => {
    const processor = await ownerPrivacyCyberService.registerThirdPartyProcessor(TEST_ORG, {
      providerName: 'AWS Mumbai Region (MeitY Empaneled Data Centre)',
      serviceDescription: 'Managed Cloud Infrastructure, S3 Attachment Storage, and MongoDB Atlas Hosting',
      dataCategoriesProcessed: ['ATTACHMENTS', 'INVOICES', 'EMPLOYEE_RECORDS'],
      purpose: 'High-availability ERP data persistence and disaster recovery storage',
      contractReference: 'MSA-AWS-IN-2024-001',
      dataStorageGeography: 'India (ap-south-1 Mumbai)',
    });

    assert.ok(processor.processorId);
    assert.equal(processor.dataStorageGeography, 'India (ap-south-1 Mumbai)');
    assert.ok(processor.exitDeletionObligation.includes('Mandatory certificate of destruction'));

    // ── Rule 46(8) Localisation & Daily India Backup Verification ──
    // 1. Accounting records (Cash book, ledger, sales invoices): India backup applies
    const cashBookPolicy = ownerPrivacyCyberService.evaluateRule46LocalisationPolicy('CASH_BOOK');
    assert.equal(cashBookPolicy.rule46Scope, true);
    assert.equal(cashBookPolicy.dailyIndiaBackupRequired, true);

    const invoicePolicy = ownerPrivacyCyberService.evaluateRule46LocalisationPolicy('SALES_INVOICES_AND_RECEIPTS');
    assert.equal(invoicePolicy.rule46Scope, true);
    assert.equal(invoicePolicy.dailyIndiaBackupRequired, true);

    // 2. Personal profiles (Employee HR, Customer Profile): Rule 46 does NOT apply merely because it is personal data
    const employeePolicy = ownerPrivacyCyberService.evaluateRule46LocalisationPolicy('EMPLOYEE_HR_PROFILE');
    assert.equal(employeePolicy.rule46Scope, false);
    assert.equal(employeePolicy.dailyIndiaBackupRequired, false);
    assert.equal(employeePolicy.status, 'OUTSIDE_RULE46_SCOPE — GOVERNED SEPARATELY');

    const customerPolicy = ownerPrivacyCyberService.evaluateRule46LocalisationPolicy('CUSTOMER_PROFILE_AND_LOYALTY');
    assert.equal(customerPolicy.rule46Scope, false);
    assert.equal(customerPolicy.dailyIndiaBackupRequired, false);
    assert.equal(customerPolicy.status, 'OUTSIDE_RULE46_SCOPE — GOVERNED SEPARATELY');

    // 3. Application Telemetry / ICT Logs: Outside Rule 46, but inside CERT-In 180-day retention within India
    const telemetryPolicy = ownerPrivacyCyberService.evaluateRule46LocalisationPolicy('APPLICATION_TELEMETRY_LOGS');
    assert.equal(telemetryPolicy.rule46Scope, false);
    assert.equal(telemetryPolicy.status, 'OUTSIDE_RULE46_SCOPE — GOVERNED SEPARATELY');
    assert.ok(telemetryPolicy.legalReference.includes('CERT-In'));
  });

  test('6. Governed Privacy Incident Response: DETECTED -> TRIAGED -> CONTAINED -> ASSESSED -> ACTION -> RECOVERED -> CLOSED', async () => {
    const incident = await ownerPrivacyCyberService.reportPrivacyIncident(
      TEST_ORG,
      {
        title: 'Unintended Email Autocomplete in Shift Handover Note',
        description: 'Employee phone number included in shift log sent to broad team mailing list.',
        severity: 'LOW',
        affectedDataCategories: ['PHONE_NUMBER'],
        estimatedAffectedPrincipals: 1,
      },
      USER_OWNER
    );

    assert.ok(incident.incidentId);
    assert.equal(incident.status, 'DETECTED');

    // Progression
    const triaged = await ownerPrivacyCyberService.updatePrivacyIncidentStatus(TEST_ORG, incident.incidentId, {
      targetStatus: 'TRIAGED',
      user: USER_OWNER,
    });
    assert.equal(triaged.status, 'TRIAGED');

    const contained = await ownerPrivacyCyberService.updatePrivacyIncidentStatus(TEST_ORG, incident.incidentId, {
      targetStatus: 'CONTAINED',
      containmentActions: 'Email recalled from internal mail server; shift log redacted.',
      user: USER_OWNER,
    });
    assert.equal(contained.status, 'CONTAINED');

    const assessed = await ownerPrivacyCyberService.updatePrivacyIncidentStatus(TEST_ORG, incident.incidentId, {
      targetStatus: 'ASSESSED',
      notificationRationale: 'Internal error contained within authenticated staff; does not exceed DPDP Board notification threshold.',
      user: USER_OWNER,
    });
    assert.equal(assessed.status, 'ASSESSED');

    const notificationAssessed = await ownerPrivacyCyberService.updatePrivacyIncidentStatus(TEST_ORG, incident.incidentId, {
      targetStatus: 'NOTIFICATION_ASSESSMENT',
      user: USER_OWNER,
    });
    assert.equal(notificationAssessed.status, 'NOTIFICATION_ASSESSMENT');

    const action = await ownerPrivacyCyberService.updatePrivacyIncidentStatus(TEST_ORG, incident.incidentId, {
      targetStatus: 'ACTION',
      user: USER_OWNER,
    });
    assert.equal(action.status, 'ACTION');

    const recovered = await ownerPrivacyCyberService.updatePrivacyIncidentStatus(TEST_ORG, incident.incidentId, {
      targetStatus: 'RECOVERED',
      user: USER_OWNER,
    });
    assert.equal(recovered.status, 'RECOVERED');

    const closed = await ownerPrivacyCyberService.updatePrivacyIncidentStatus(TEST_ORG, incident.incidentId, {
      targetStatus: 'CLOSED',
      user: USER_OWNER,
    });
    assert.equal(closed.status, 'CLOSED');
    assert.ok(closed.closedAt);
  });

  test('7. Illegal Privacy Incident transition jump is rejected', async () => {
    const inc = await ownerPrivacyCyberService.reportPrivacyIncident(
      TEST_ORG,
      {
        title: 'Draft incident for testing invalid transition',
        description: 'Test incident',
        severity: 'LOW',
      },
      USER_OWNER
    );

    // Cannot jump from DETECTED directly to CLOSED
    await assert.rejects(
      async () => {
        await ownerPrivacyCyberService.updatePrivacyIncidentStatus(TEST_ORG, inc.incidentId, {
          targetStatus: 'CLOSED',
          user: USER_OWNER,
        });
      },
      (err) => err.message.includes('INVALID_INCIDENT_TRANSITION')
    );
  });

  test('8. NIST CSF 2.0 Mapping: Validates 6 core functions without statutory or certification claims', async () => {
    const control = await ownerPrivacyCyberService.registerSecurityControl(TEST_ORG, {
      controlId: 'CTL-PR-AC-01',
      csfFunction: 'PROTECT',
      categoryCode: 'PR.AC',
      title: 'Device Trust & Credential Hashing Safeguards',
      objective: 'Enforce cryptographic scrypt hashing, device trust tokens, and session revocation.',
      technicalMechanism: 'crypto.scrypt with individual salts; App-generated stable Device UUIDs.',
      effectiveness: 'HIGHLY_EFFECTIVE',
    });

    assert.ok(control._id);
    assert.equal(control.csfFunction, 'PROTECT');
    assert.equal(control.isNistStatutory, false);
    assert.equal(control.isExternalCertified, false);
    assert.ok(control.frameworkNotice.includes('Not a statutory regulation or third-party certification'));

    // ── Authorised Privacy Contact & DPO Governance Model Verification ──
    // 1. Zamorin is not formally designated a Significant Data Fiduciary (SDF) -> voluntary grievance contact
    const standardContact = ownerPrivacyCyberService.getPrivacyContactGovernance(TEST_ORG, {
      isSignificantDataFiduciary: false,
    });
    assert.equal(standardContact.isSignificantDataFiduciary, false);
    assert.equal(standardContact.privacyContactType, 'AUTHORISED_PRIVACY_GRIEVANCE_CONTACT');
    assert.equal(standardContact.sdfDesignationStatus, 'NOT_EVIDENCED');
    assert.ok(standardContact.roleLabel.includes('Authorised Privacy / Grievance Contact'));

    // 2. Configurable DPO role where formally designated SDF
    const sdfContact = ownerPrivacyCyberService.getPrivacyContactGovernance(TEST_ORG, {
      isSignificantDataFiduciary: true,
      title: 'Data Protection Officer',
    });
    assert.equal(sdfContact.isSignificantDataFiduciary, true);
    assert.equal(sdfContact.sdfDesignationStatus, 'DESIGNATED_SDF');
    assert.equal(sdfContact.privacyContactType, 'DATA_PROTECTION_OFFICER');
    assert.equal(sdfContact.mandateStatus, 'STATUTORY_MANDATORY_SDF');
  });

  test('9. Multi-Tenant IDOR: Foreign organisation denied access to privacy registers & incidents', async () => {
    const foreignRegisters = await ownerPrivacyCyberService.getDataProcessingRegisters(FOREIGN_ORG);
    assert.equal(foreignRegisters.length, 0);

    const foreignProcessors = await ownerPrivacyCyberService.getThirdPartyProcessors(FOREIGN_ORG);
    assert.equal(foreignProcessors.length, 0);
  });
});
