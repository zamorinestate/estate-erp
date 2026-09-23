'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 10: MASTER DATA GOVERNANCE TEST SUITE
 * ============================================================================
 * Tests canonical master domain catalogue, governed duplicate candidate merging,
 * statutory/financial immutability, maker-checker change requests, and soft deactivation.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { MasterDataDomainCatalogue } = require('../src/models/MasterDataDomainCatalogue');
const { MasterDuplicateCandidate } = require('../src/models/MasterDuplicateCandidate');
const { MasterChangeRequest } = require('../src/models/MasterChangeRequest');
const { Vendor } = require('../src/models/Vendor');
const ownerMasterDataService = require('../src/services/ownerMasterDataService');

describe('STAGE 10 — Master Data Governance Centre Suite', () => {
  const TEST_ORG = 'ORG-TEST-STAGE10';
  const FOREIGN_ORG = 'ORG-TEST-FOREIGN10';
  const USER_MAKER = { userId: 'USR-MAKER-10', email: 'maker10@zamorin.com' };
  const USER_CHECKER = { userId: 'USR-CHECKER-10', email: 'checker10@zamorin.com' };

  let vendorAId = 'VEN-1001';
  let vendorBId = 'VEN-1002';

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/zamorin_erp_test';
      await mongoose.connect(uri);
    }

    await MasterDuplicateCandidate.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await MasterChangeRequest.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await Vendor.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });

    // Seed test vendors in canonical Vendor master
    await Vendor.create([
      {
        vendorId: vendorAId,
        organisationId: TEST_ORG,
        name: 'Malabar Coffee Traders Pvt Ltd',
        nameLower: 'malabar coffee traders pvt ltd',
        legalName: 'Malabar Coffee Traders Pvt Ltd',
        displayName: 'Malabar Coffee Traders',
        category: 'FOOD_BEVERAGE',
        taxIdentificationNumber: '32AABCM1111A1Z1',
        gstNumber: '32AABCM1111A1Z1',
        primaryContactPhone: '+919876543210',
        status: 'ACTIVE',
        createdByUserId: USER_MAKER.userId,
      },
      {
        vendorId: vendorBId,
        organisationId: TEST_ORG,
        name: 'Malabar Coffee Traders (Branch)',
        nameLower: 'malabar coffee traders (branch)',
        legalName: 'Malabar Coffee Traders (Branch)',
        displayName: 'Malabar Coffee Traders Br',
        category: 'FOOD_BEVERAGE',
        taxIdentificationNumber: '32AABCM1111A1Z1', // duplicate PAN/GSTIN
        gstNumber: '32AABCM1111A1Z1',
        primaryContactPhone: '+919876543210',
        status: 'ACTIVE',
        createdByUserId: USER_MAKER.userId,
      },
    ]);
  });

  after(async () => {
    await MasterDuplicateCandidate.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await MasterChangeRequest.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await Vendor.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await mongoose.disconnect();
  });

  test('1. Master Domains Catalogue: Declares all 14 canonical domains with zero duplicate database', async () => {
    const domains = await ownerMasterDataService.getDomainCatalogue();
    assert.equal(domains.length, 14);

    const supplierDomain = domains.find((d) => d.domainCode === 'SUPPLIER');
    assert.ok(supplierDomain);
    assert.equal(supplierDomain.canonicalModel, 'Vendor');

    const assetDomain = domains.find((d) => d.domainCode === 'ASSET');
    assert.ok(assetDomain);
    assert.equal(assetDomain.canonicalModel, 'Asset');
  });

  test('2. Duplicate Candidate Detection: Records match confidence and prevents auto-merge', async () => {
    const candidate = await ownerMasterDataService.recordDuplicateCandidate(
      TEST_ORG,
      {
        domainCode: 'SUPPLIER',
        recordAId: vendorAId,
        recordBId: vendorBId,
        fieldsCompared: ['taxIdentificationNumber', 'primaryContactPhone'],
        matchConfidencePercentage: 98,
        matchMethod: 'EXACT_PHONE_AND_GSTIN',
      },
      USER_MAKER
    );

    assert.ok(candidate.candidateId);
    assert.equal(candidate.status, 'CANDIDATE'); // Never auto-merged!
    assert.equal(candidate.matchConfidencePercentage, 98);
  });

  test('3. Governed Merge Workflow: CANDIDATE -> REVIEW -> SURVIVOR_SELECTION -> IMPACT_ANALYSIS -> APPROVED -> MERGED', async () => {
    const candidate = await ownerMasterDataService.recordDuplicateCandidate(
      TEST_ORG,
      {
        domainCode: 'SUPPLIER',
        recordAId: vendorAId,
        recordBId: vendorBId,
        matchConfidencePercentage: 95,
      },
      USER_MAKER
    );

    // REVIEW
    const review = await ownerMasterDataService.progressMergeWorkflow(TEST_ORG, candidate.candidateId, {
      targetStatus: 'REVIEW',
      user: USER_CHECKER,
    });
    assert.equal(review.status, 'REVIEW');

    // SURVIVOR_SELECTION
    const survivor = await ownerMasterDataService.progressMergeWorkflow(TEST_ORG, candidate.candidateId, {
      targetStatus: 'SURVIVOR_SELECTION',
      survivorRecordId: vendorAId,
      user: USER_CHECKER,
    });
    assert.equal(survivor.status, 'SURVIVOR_SELECTION');
    assert.equal(survivor.survivorRecordId, vendorAId);
    assert.equal(survivor.retiredRecordId, vendorBId);

    // IMPACT_ANALYSIS
    const impact = await ownerMasterDataService.progressMergeWorkflow(TEST_ORG, candidate.candidateId, {
      targetStatus: 'IMPACT_ANALYSIS',
      user: USER_CHECKER,
    });
    assert.equal(impact.status, 'IMPACT_ANALYSIS');
    assert.equal(impact.impactAnalysis.financialImmutabilityPreserved, true);

    // APPROVED
    const approved = await ownerMasterDataService.progressMergeWorkflow(TEST_ORG, candidate.candidateId, {
      targetStatus: 'APPROVED',
      user: USER_CHECKER,
    });
    assert.equal(approved.status, 'APPROVED');

    // MERGED
    const merged = await ownerMasterDataService.progressMergeWorkflow(TEST_ORG, candidate.candidateId, {
      targetStatus: 'MERGED',
      reason: 'Confirmed branch vendor duplicate. Alias redirect established to primary vendor record.',
      user: USER_CHECKER,
    });
    assert.equal(merged.status, 'MERGED');
    assert.equal(merged.impactAnalysis.aliasRedirectConfigured, true);
  });

  test('4. Illegal Merge transition is rejected (e.g. CANDIDATE directly to MERGED)', async () => {
    const candidate = await ownerMasterDataService.recordDuplicateCandidate(
      TEST_ORG,
      {
        domainCode: 'SUPPLIER',
        recordAId: vendorAId,
        recordBId: vendorBId,
        matchConfidencePercentage: 90,
      },
      USER_MAKER
    );

    await assert.rejects(
      async () => {
        await ownerMasterDataService.progressMergeWorkflow(TEST_ORG, candidate.candidateId, {
          targetStatus: 'MERGED',
          user: USER_CHECKER,
        });
      },
      (err) => err.message.includes('INVALID_MERGE_TRANSITION')
    );
  });

  test('5. High-Risk Master Change Request: Flags sensitive field banking changes', async () => {
    const cr = await ownerMasterDataService.submitChangeRequest(
      TEST_ORG,
      {
        domainCode: 'SUPPLIER',
        recordId: vendorAId,
        fieldName: 'bankDetails',
        currentValue: { accountNumber: '1234567890' },
        proposedValue: { accountNumber: '9876543210', ifscCode: 'HDFC0000123' },
        reason: 'Vendor provided bank change certificate duly signed by director.',
      },
      USER_MAKER
    );

    assert.ok(cr.requestId);
    assert.equal(cr.isSensitiveField, true);
    assert.equal(cr.status, 'PENDING_APPROVAL');
  });

  test('6. Maker-Checker Enforcement: Requester CANNOT approve their own sensitive change request', async () => {
    const cr = await ownerMasterDataService.submitChangeRequest(
      TEST_ORG,
      {
        domainCode: 'SUPPLIER',
        recordId: vendorAId,
        fieldName: 'gstin',
        proposedValue: '32AABCM9999Z1Z5',
        reason: 'GSTIN update following company conversion',
      },
      USER_MAKER
    );

    // Requester attempting to approve must fail
    await assert.rejects(
      async () => {
        await ownerMasterDataService.reviewChangeRequest(TEST_ORG, cr.requestId, {
          decision: 'APPROVED',
          user: USER_MAKER, // same user!
        });
      },
      (err) => err.message.includes('MAKER_CHECKER_VIOLATION')
    );

    // Independent checker approving must succeed
    const approved = await ownerMasterDataService.reviewChangeRequest(TEST_ORG, cr.requestId, {
      decision: 'APPROVED',
      notes: 'Verified against GST portal registration certificate.',
      user: USER_CHECKER,
    });
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.approvedByUserId, USER_CHECKER.userId);
  });

  test('7. Governed Soft Deactivation: Retires master record rather than destructive deletion', async () => {
    const result = await ownerMasterDataService.deactivateMasterRecord(
      TEST_ORG,
      'SUPPLIER',
      vendorBId,
      {
        reason: 'Merged into primary supplier record. Soft deactivated.',
        user: USER_CHECKER,
      }
    );

    assert.equal(result.action, 'SOFT_DEACTIVATED');
    assert.equal(result.status, 'ARCHIVED');

    // Verify record still exists in database (not hard-deleted)
    const vendorStillExists = await Vendor.findOne({ organisationId: TEST_ORG, vendorId: vendorBId });
    assert.ok(vendorStillExists);
    assert.equal(vendorStillExists.status, 'ARCHIVED');
  });

  test('8. Multi-Tenant IDOR: Foreign organisation denied access to master governance records', async () => {
    const dashboard = await ownerMasterDataService.getExecutiveMasterDataDashboard(FOREIGN_ORG);
    assert.equal(dashboard.openDuplicateCandidatesCount, 0);
    assert.equal(dashboard.pendingChangeRequestsCount, 0);
  });
});
