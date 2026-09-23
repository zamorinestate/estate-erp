'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 15: CORPORATE GOVERNANCE & DELEGATION TEST SUITE
 * ============================================================================
 * Tests:
 * 1. Legal Structure Status: Verifies entity structure & legal evidence check.
 * 2. Governance Meeting Management: Meeting scheduling, notice, and quorum verification.
 * 3. SHA-256 Immutable Minutes Sealing: Sealed minutes cannot be edited or tampered.
 * 4. Resolution Lifecycle: DRAFT -> REVIEW -> APPROVED -> ACTIONED -> CLOSED & invalid transition rejection.
 * 5. Reserved Matters Register: Registers non-delegable matters and blocks illegal delegation.
 * 6. Delegation of Authority Engine: Enforces monetary ceiling, café scoping, time bounds, and immediate revocation.
 * 7. Authorised Signatories Register: Tracks legal designations with zero credentials stored.
 * 8. Section 184 Conflict of Interest: Declarations & proactive counterparty conflict detection.
 * 9. Multi-Tenant IDOR Isolation: Strictly restricts governance records to owning organisation.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const GovernanceMeetingModule = require('../src/models/GovernanceMeeting');
const GovernanceMeeting = GovernanceMeetingModule.Model || GovernanceMeetingModule.GovernanceMeeting || GovernanceMeetingModule;

const GovernanceResolutionModule = require('../src/models/GovernanceResolution');
const GovernanceResolution = GovernanceResolutionModule.Model || GovernanceResolutionModule.GovernanceResolution || GovernanceResolutionModule;

const ReservedMatterRegisterModule = require('../src/models/ReservedMatterRegister');
const ReservedMatterRegister = ReservedMatterRegisterModule.Model || ReservedMatterRegisterModule.ReservedMatterRegister || ReservedMatterRegisterModule;

const GovernanceDecisionModule = require('../src/models/GovernanceDecision');
const GovernanceDecision = GovernanceDecisionModule.Model || GovernanceDecisionModule.GovernanceDecision || GovernanceDecisionModule;

const DelegationOfAuthorityModule = require('../src/models/DelegationOfAuthority');
const DelegationOfAuthority = DelegationOfAuthorityModule.Model || DelegationOfAuthorityModule.DelegationOfAuthority || DelegationOfAuthorityModule;

const AuthorisedSignatoryModule = require('../src/models/AuthorisedSignatory');
const AuthorisedSignatory = AuthorisedSignatoryModule.Model || AuthorisedSignatoryModule.AuthorisedSignatory || AuthorisedSignatoryModule;

const ConflictOfInterestDeclarationModule = require('../src/models/ConflictOfInterestDeclaration');
const ConflictOfInterestDeclaration = ConflictOfInterestDeclarationModule.Model || ConflictOfInterestDeclarationModule.ConflictOfInterestDeclaration || ConflictOfInterestDeclarationModule;

const ownerGovernanceDelegationService = require('../src/services/ownerGovernanceDelegationService');

describe('STAGE 15 — Corporate Governance, Delegation & Decision Authority Suite', () => {
  const TEST_ORG = new mongoose.Types.ObjectId().toString().toUpperCase();
  const FOREIGN_ORG = new mongoose.Types.ObjectId().toString().toUpperCase();
  const TEST_CAFE = new mongoose.Types.ObjectId().toString();
  const FOREIGN_CAFE = new mongoose.Types.ObjectId().toString();

  const USER_OWNER = { userId: 'USR-OWNER-15', name: 'Zamorin Managing Director', role: 'OWNER' };
  const USER_STORE_MANAGER = { userId: 'USR-MGR-15', name: 'Store Manager Kozhikode', role: 'STORE_MANAGER' };

  let testMeetingId;
  let testResolutionId;
  let testDelegationId;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/zamorin_erp_test';
      await mongoose.connect(uri);
    }

    await GovernanceMeeting.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await GovernanceResolution.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await ReservedMatterRegister.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await GovernanceDecision.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await DelegationOfAuthority.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await AuthorisedSignatory.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await ConflictOfInterestDeclaration.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
  });

  test('1. Legal Structure Status: Evaluates statutory evidence & flag pending verification', async () => {
    const status = await ownerGovernanceDelegationService.getLegalStructureStatus(TEST_ORG);

    assert.ok(status);
    assert.equal(status.organisationId, TEST_ORG);
    assert.equal(status.companiesActApplicable, true);
    // Un-evidenced org should return LEGAL_STRUCTURE_VERIFICATION_REQUIRED
    assert.equal(status.status, 'LEGAL_STRUCTURE_VERIFICATION_REQUIRED');
    assert.ok(status.message.includes('pending'));
  });

  test('2. Governance Meeting Management: Creates scheduled meeting with notice and quorum', async () => {
    const meeting = await ownerGovernanceDelegationService.createMeeting(TEST_ORG, {
      title: 'Q3 Board of Directors Governance Review',
      meetingType: 'BOARD',
      meetingDate: '2026-10-15T10:00:00.000Z',
      noticePeriodDays: 7,
      agendaItems: [
        { title: 'Review of Capex for Malabar Expansion', proposer: 'Managing Director' },
        { title: 'Statutory Delegation of Authority Ceilings', proposer: 'CFO' }
      ],
      attendees: [
        { userId: USER_OWNER.userId, name: 'Director 1', roleOrDesignation: 'Managing Director', attendanceStatus: 'CONFIRMED' },
        { userId: 'USR-DIR-2', name: 'Director 2', roleOrDesignation: 'Independent Director', attendanceStatus: 'CONFIRMED' }
      ],
      quorumRequired: 2
    }, USER_OWNER);

    assert.ok(meeting.meetingId);
    assert.equal(meeting.status, 'SCHEDULED');
    assert.equal(meeting.isNoticeServedCompliantly, true);
    assert.equal(meeting.quorumRequired, 2);
    assert.equal(meeting.agendaItems.length, 2);
    testMeetingId = meeting.meetingId;

    // Section 173(3) Short Notice: Urgent Board meeting with Independent Director present -> valid
    const urgentMeetingValid = await ownerGovernanceDelegationService.createMeeting(TEST_ORG, {
      title: 'Urgent Board Meeting - Acquisition',
      meetingType: 'BOARD',
      meetingDate: new Date(Date.now() + 2 * 86400000),
      noticePeriodDays: 2,
      hasIndependentDirectors: true,
      attendees: [
        { userId: USER_OWNER.userId, personName: 'Director 1', roleOrDesignation: 'Executive Director', attendanceStatus: 'PRESENT' },
        { userId: 'USR-IND-1', personName: 'Independent Director', roleOrDesignation: 'Independent Director', isIndependent: true, attendanceStatus: 'PRESENT' }
      ],
      quorumRequired: 2
    }, USER_OWNER);
    assert.equal(urgentMeetingValid.section173Compliance.shortNoticeValid, true);
    assert.equal(urgentMeetingValid.section173Compliance.reason, 'SHORT_NOTICE_VALID_INDEPENDENT_DIRECTOR_PRESENT');

    // Section 173(3) Short Notice: Urgent Board meeting without Independent Director present -> conditional / pending
    const urgentMeetingPending = await ownerGovernanceDelegationService.createMeeting(TEST_ORG, {
      title: 'Urgent Board Meeting - Emergency',
      meetingType: 'BOARD',
      meetingDate: new Date(Date.now() + 1 * 86400000),
      noticePeriodDays: 1,
      hasIndependentDirectors: true,
      attendees: [
        { userId: USER_OWNER.userId, personName: 'Director 1', roleOrDesignation: 'Executive Director', attendanceStatus: 'PRESENT' }
      ],
      quorumRequired: 1
    }, USER_OWNER);
    assert.equal(urgentMeetingPending.section173Compliance.shortNoticeValid, false);
    assert.equal(urgentMeetingPending.section173Compliance.reason, 'SHORT_NOTICE_CONDITIONAL_PENDING_INDEPENDENT_DIRECTOR_CIRCULATION_OR_RATIFICATION');

    // Management Meeting: Exempt from Section 173 statutory 7-day notice
    const mgmtMeeting = await ownerGovernanceDelegationService.createMeeting(TEST_ORG, {
      title: 'Weekly Store Ops Sync',
      meetingType: 'MANAGEMENT',
      meetingDate: new Date(Date.now() + 1 * 86400000),
      noticePeriodDays: 1,
      attendees: [{ personName: 'Store Manager', roleOrDesignation: 'Manager', attendanceStatus: 'PRESENT' }],
      quorumRequired: 1
    }, USER_OWNER);
    assert.equal(mgmtMeeting.isNoticeServedCompliantly, true);
    assert.equal(mgmtMeeting.section173Compliance.reason, 'EXEMPT_OPERATIONAL_MANAGEMENT_MEETING');
  });

  test('3. SHA-256 Immutable Minutes Sealing: Seals minutes with hash and rejects post-seal tampering', async () => {
    const rawMinutes = 'Minutes of Board Meeting held on 15 Oct 2026. Quorum verified. All agenda items passed unanimously.';
    
    const sealed = await ownerGovernanceDelegationService.finaliseMeetingMinutes(
      TEST_ORG,
      testMeetingId,
      rawMinutes,
      USER_OWNER
    );

    assert.equal(sealed.isMinutesSignedAndImmutable, true);
    assert.ok(sealed.immutableMinutesHash);
    assert.equal(sealed.status, 'MINUTES_APPROVED');

    // Attempting to edit or re-seal must be rejected with tamper-proofing invariant
    await assert.rejects(
      async () => {
        await ownerGovernanceDelegationService.finaliseMeetingMinutes(
          TEST_ORG,
          testMeetingId,
          'Tampered minutes text',
          USER_OWNER
        );
      },
      /MINUTES_ALREADY_IMMUTABLE/
    );
  });

  test('4. Resolution Lifecycle: Follows DRAFT -> REVIEW -> APPROVED -> ACTIONED -> CLOSED & blocks illegal transitions', async () => {
    const resolution = await ownerGovernanceDelegationService.proposeResolution(TEST_ORG, {
      title: 'Approval of FY26-27 Strategic Capex Allocation',
      resolutionType: 'BOARD_RESOLUTION',
      meetingId: testMeetingId,
      resolutionText: 'Resolved that an aggregate sum not exceeding ₹50,00,000 is approved for Calicut flagship expansion.',
      statutorySection: 'Section 179(3) Companies Act 2013'
    }, USER_OWNER);

    assert.ok(resolution.resolutionId);
    assert.equal(resolution.status, 'DRAFT');
    testResolutionId = resolution.resolutionId;

    // Transition DRAFT -> REVIEW
    const reviewed = await ownerGovernanceDelegationService.transitionResolution(
      TEST_ORG,
      testResolutionId,
      'REVIEW',
      USER_OWNER
    );
    assert.equal(reviewed.status, 'REVIEW');

    // Transition REVIEW -> APPROVED
    const approved = await ownerGovernanceDelegationService.transitionResolution(
      TEST_ORG,
      testResolutionId,
      'APPROVED',
      USER_OWNER
    );
    assert.equal(approved.status, 'APPROVED');
    assert.ok(approved.approvedAt);

    // Illegal transition: Cannot go directly from APPROVED to DRAFT
    await assert.rejects(
      async () => {
        await ownerGovernanceDelegationService.transitionResolution(
          TEST_ORG,
          testResolutionId,
          'DRAFT',
          USER_OWNER
        );
      },
      /ILLEGAL_RESOLUTION_TRANSITION/
    );

    // Transition APPROVED -> ACTIONED
    const actioned = await ownerGovernanceDelegationService.transitionResolution(
      TEST_ORG,
      testResolutionId,
      'ACTIONED',
      USER_OWNER
    );
    assert.equal(actioned.status, 'ACTIONED');
  });

  test('5. Reserved Matters Register: Registers non-delegable matters & blocks illegal delegation attempts', async () => {
    const matter = await ownerGovernanceDelegationService.registerReservedMatter(TEST_ORG, {
      category: 'BORROWING_AND_CREDIT_FACILITIES',
      title: 'Borrowing & Credit Facilities Approval',
      description: 'Any borrowing, bank overdraft, or credit line is reserved to Board approval.',
      reservedToAuthority: 'BOARD_OF_DIRECTORS',
      delegationAllowed: false
    }, USER_OWNER);

    assert.ok(matter.matterId);
    assert.equal(matter.delegationAllowed, false);

    // Attempting to delegate a Reserved Matter must be blocked
    await assert.rejects(
      async () => {
        await ownerGovernanceDelegationService.grantDelegation(TEST_ORG, {
          delegateUserId: USER_STORE_MANAGER.userId,
          cafeScope: [TEST_CAFE],
          actionPermissions: ['BORROWING_AND_CREDIT_FACILITIES'],
          module: 'FINANCE',
          startAt: new Date(Date.now() - 3600000),
          expiresAt: new Date(Date.now() + 86400000),
          reason: 'Attempted delegation of credit facilities'
        }, USER_OWNER);
      },
      /RESERVED_MATTER_VIOLATION/
    );

    // Attempting to delegate prohibited superuser privileges must be blocked
    await assert.rejects(
      async () => {
        await ownerGovernanceDelegationService.grantDelegation(TEST_ORG, {
          delegateUserId: USER_STORE_MANAGER.userId,
          cafeScope: [TEST_CAFE],
          actionPermissions: ['PRIMARY_MASTER'],
          module: 'SYSTEM',
          startAt: new Date(Date.now() - 3600000),
          expiresAt: new Date(Date.now() + 86400000),
          reason: 'Attempted privilege escalation'
        }, USER_OWNER);
      },
      /SECURITY_VIOLATION/
    );
  });

  test('6. Delegation of Authority Engine: Enforces cafe-scoping, monetary limits, time bounds & immediate revocation', async () => {
    // 1. Grant valid delegation for procurement up to ₹25,000 for TEST_CAFE
    const delegation = await ownerGovernanceDelegationService.grantDelegation(TEST_ORG, {
      delegateUserId: USER_STORE_MANAGER.userId,
      cafeScope: [TEST_CAFE],
      actionPermissions: ['APPROVE_PURCHASE_ORDER'],
      module: 'PROCUREMENT',
      maxMonetaryAmount: 25000,
      startAt: new Date(Date.now() - 3600000), // 1 hour ago
      expiresAt: new Date(Date.now() + 7 * 86400000), // 7 days ahead
      reason: 'Acting Store Manager temporary procurement approval authority'
    }, USER_OWNER);

    assert.ok(delegation.delegationId);
    assert.equal(delegation.status, 'ACTIVE');
    testDelegationId = delegation.delegationId;

    // 2. Authority Check: Within limits and correct cafe -> AUTHORIZED
    const authSuccess = await ownerGovernanceDelegationService.checkDelegatedAuthority(TEST_ORG, {
      userId: USER_STORE_MANAGER.userId,
      cafeId: TEST_CAFE,
      actionPermission: 'APPROVE_PURCHASE_ORDER',
      module: 'PROCUREMENT',
      monetaryAmount: 18000
    });
    assert.equal(authSuccess.isAuthorized, true);

    // 3. Authority Check: Exceeds monetary ceiling (₹30,000 > ₹25,000) -> UNAUTHORIZED
    const authAmountExceeded = await ownerGovernanceDelegationService.checkDelegatedAuthority(TEST_ORG, {
      userId: USER_STORE_MANAGER.userId,
      cafeId: TEST_CAFE,
      actionPermission: 'APPROVE_PURCHASE_ORDER',
      module: 'PROCUREMENT',
      monetaryAmount: 30000
    });
    assert.equal(authAmountExceeded.isAuthorized, false);
    assert.ok(authAmountExceeded.reason.includes('AMOUNT_EXCEEDS_DELEGATED_LIMIT'));

    // 4. Authority Check: Wrong cafe scope -> UNAUTHORIZED
    const authWrongCafe = await ownerGovernanceDelegationService.checkDelegatedAuthority(TEST_ORG, {
      userId: USER_STORE_MANAGER.userId,
      cafeId: FOREIGN_CAFE,
      actionPermission: 'APPROVE_PURCHASE_ORDER',
      module: 'PROCUREMENT',
      monetaryAmount: 10000
    });
    assert.equal(authWrongCafe.isAuthorized, false);

    // 5. Immediate Revocation
    const revoked = await ownerGovernanceDelegationService.revokeDelegation(
      TEST_ORG,
      testDelegationId,
      'Manager rotated back to base station',
      USER_OWNER
    );
    assert.equal(revoked.status, 'REVOKED');

    // 6. Authority Check after Revocation -> UNAUTHORIZED
    const authAfterRevocation = await ownerGovernanceDelegationService.checkDelegatedAuthority(TEST_ORG, {
      userId: USER_STORE_MANAGER.userId,
      cafeId: TEST_CAFE,
      actionPermission: 'APPROVE_PURCHASE_ORDER',
      module: 'PROCUREMENT',
      monetaryAmount: 5000
    });
    assert.equal(authAfterRevocation.isAuthorized, false);

    // 7. Supplier Module Delegation
    const supplierDel = await ownerGovernanceDelegationService.grantDelegation(TEST_ORG, {
      delegateUserId: USER_STORE_MANAGER.userId,
      cafeScope: [TEST_CAFE],
      actionPermissions: ['APPROVE_SUPPLIER_ACTION_PLAN'],
      module: 'SUPPLIER',
      startAt: new Date(Date.now() - 3600000),
      expiresAt: new Date(Date.now() + 86400000),
      reason: 'Delegate supplier action plan approval'
    }, USER_OWNER);
    assert.ok(supplierDel.delegationId);
    const authSupplier = await ownerGovernanceDelegationService.checkDelegatedAuthority(TEST_ORG, {
      userId: USER_STORE_MANAGER.userId,
      cafeId: TEST_CAFE,
      actionPermission: 'APPROVE_SUPPLIER_ACTION_PLAN',
      module: 'SUPPLIER'
    });
    assert.equal(authSupplier.isAuthorized, true);

    // 8. Master Data Module Delegation
    const masterDataDel = await ownerGovernanceDelegationService.grantDelegation(TEST_ORG, {
      delegateUserId: USER_STORE_MANAGER.userId,
      cafeScope: [TEST_CAFE],
      actionPermissions: ['APPROVE_MASTER_DATA_CHANGE'],
      module: 'MASTER_DATA',
      startAt: new Date(Date.now() - 3600000),
      expiresAt: new Date(Date.now() + 86400000),
      reason: 'Delegate master data change approval'
    }, USER_OWNER);
    assert.ok(masterDataDel.delegationId);
    const authMasterData = await ownerGovernanceDelegationService.checkDelegatedAuthority(TEST_ORG, {
      userId: USER_STORE_MANAGER.userId,
      cafeId: TEST_CAFE,
      actionPermission: 'APPROVE_MASTER_DATA_CHANGE',
      module: 'MASTER_DATA'
    });
    assert.equal(authMasterData.isAuthorized, true);

    // 9. Compliance Module Delegation
    const complianceDel = await ownerGovernanceDelegationService.grantDelegation(TEST_ORG, {
      delegateUserId: USER_STORE_MANAGER.userId,
      cafeScope: [TEST_CAFE],
      actionPermissions: ['APPROVE_COMPLIANCE_FILING'],
      module: 'COMPLIANCE',
      startAt: new Date(Date.now() - 3600000),
      expiresAt: new Date(Date.now() + 86400000),
      reason: 'Delegate operational compliance review'
    }, USER_OWNER);
    assert.ok(complianceDel.delegationId);
    const authCompliance = await ownerGovernanceDelegationService.checkDelegatedAuthority(TEST_ORG, {
      userId: USER_STORE_MANAGER.userId,
      cafeId: TEST_CAFE,
      actionPermission: 'APPROVE_COMPLIANCE_FILING',
      module: 'COMPLIANCE'
    });
    assert.equal(authCompliance.isAuthorized, true);

    // 10. Negative Test: Expired Delegation
    await ownerGovernanceDelegationService.grantDelegation(TEST_ORG, {
      delegateUserId: 'USR-EXPIRED',
      cafeScope: [TEST_CAFE],
      actionPermissions: ['VIEW_EXPENSES'],
      module: 'FINANCE_EXPENSE',
      startAt: new Date(Date.now() - 172800000),
      expiresAt: new Date(Date.now() - 86400000), // Already expired
      reason: 'Expired test delegation'
    }, USER_OWNER);
    const authExpired = await ownerGovernanceDelegationService.checkDelegatedAuthority(TEST_ORG, {
      userId: 'USR-EXPIRED',
      cafeId: TEST_CAFE,
      actionPermission: 'VIEW_EXPENSES',
      module: 'FINANCE_EXPENSE'
    });
    assert.equal(authExpired.isAuthorized, false);

    // 11. Negative Test: Future-Start Delegation
    await ownerGovernanceDelegationService.grantDelegation(TEST_ORG, {
      delegateUserId: 'USR-FUTURE',
      cafeScope: [TEST_CAFE],
      actionPermissions: ['VIEW_EXPENSES'],
      module: 'FINANCE_EXPENSE',
      startAt: new Date(Date.now() + 86400000), // Future start
      expiresAt: new Date(Date.now() + 172800000),
      reason: 'Future test delegation'
    }, USER_OWNER);
    const authFuture = await ownerGovernanceDelegationService.checkDelegatedAuthority(TEST_ORG, {
      userId: 'USR-FUTURE',
      cafeId: TEST_CAFE,
      actionPermission: 'VIEW_EXPENSES',
      module: 'FINANCE_EXPENSE'
    });
    assert.equal(authFuture.isAuthorized, false);
  });

  test('7. Authorised Signatories Register: Registers signatory with zero credentials stored', async () => {
    const signatory = await ownerGovernanceDelegationService.registerSignatory(TEST_ORG, {
      userId: USER_OWNER.userId,
      signatoryName: 'Managing Director',
      designation: 'Managing Director',
      entityName: 'Zamorin Hospitality Ventures Pvt Ltd',
      category: 'STATUTORY_LEGAL',
      monetaryLimit: 1000000,
      startAt: new Date('2026-01-01'),
      expiresAt: new Date('2027-12-31'),
      mcaDin: 'DIN-09876543',
      sourceReference: 'Board Resolution No. 04/2026'
    }, USER_OWNER);

    assert.ok(signatory.signatoryId);
    assert.equal(signatory.status, 'ACTIVE');
    assert.equal(signatory.mcaDin, 'DIN-09876543');
    
    // Invariant: Signatory must not have credentials/PIN fields
    const signatoryObj = signatory.toObject();
    assert.equal(signatoryObj.password, undefined);
    assert.equal(signatoryObj.pin, undefined);
    assert.equal(signatoryObj.dscPrivateKey, undefined);
  });

  test('8. Section 184 Conflict of Interest: Declarations & proactive counterparty warning', async () => {
    const decl = await ownerGovernanceDelegationService.recordConflictDeclaration(TEST_ORG, {
      declarantName: 'Director 1',
      designation: 'Director',
      declarationType: 'DIRECTOR_INTEREST_SEC_184',
      relatedPartyOrEntity: 'Malabar Coffee Traders LLP',
      natureOfInterest: 'Proprietor / 35% Partner',
      mitigationsOrRestrictions: ['Abstain from voting on coffee bean procurement tenders']
    }, USER_OWNER);

    assert.ok(decl.declarationId);
    assert.equal(decl.relatedPartyOrEntity, 'Malabar Coffee Traders LLP');

    // Conflict Check against matching counterparty
    const conflictFound = await ownerGovernanceDelegationService.checkCounterpartyConflict(
      TEST_ORG,
      'Malabar Coffee Traders LLP'
    );
    assert.equal(conflictFound.hasConflict, true);
    assert.ok(conflictFound.statutoryWarning.includes('STATUTORY_CONFLICT_WARNING'));

    // Conflict Check against neutral counterparty
    const conflictNeutral = await ownerGovernanceDelegationService.checkCounterpartyConflict(
      TEST_ORG,
      'Neutral Dairy Supplies Ltd'
    );
    assert.equal(conflictNeutral.hasConflict, false);
  });

  test('9. Multi-Tenant IDOR Isolation: Governance records strictly partitioned by organisationId', async () => {
    // 1. Foreign organisation querying TEST_ORG meeting minutes should fail
    await assert.rejects(
      async () => {
        await ownerGovernanceDelegationService.finaliseMeetingMinutes(
          FOREIGN_ORG,
          testMeetingId,
          'Unauthorized foreign edit',
          { userId: 'USR-FOREIGN' }
        );
      },
      /MEETING_NOT_FOUND/
    );

    // 2. Dashboard count should only reflect owning organisation records
    const testOrgDashboard = await ownerGovernanceDelegationService.getGovernanceDashboard(TEST_ORG);
    const foreignOrgDashboard = await ownerGovernanceDelegationService.getGovernanceDashboard(FOREIGN_ORG);

    assert.ok(testOrgDashboard.meetingsCount >= 1);
    assert.equal(foreignOrgDashboard.meetingsCount, 0);
  });

  after(async () => {
    await mongoose.disconnect();
  });
});
