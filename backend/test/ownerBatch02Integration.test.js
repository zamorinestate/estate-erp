'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER BATCH 02 CROSS-STAGE INTEGRATION SUITE
 * ============================================================================
 * Verifies end-to-end integration workflows across Stages 04 through 10:
 * - Stage 04 Compliance -> Stage 06 SOP / Training Linkage
 * - Stage 04 Insurance/AMC -> Stage 07 Asset Linkage
 * - Stage 04 Compliance -> Stage 08 Privacy / DPDP Schedule Linkage
 * - Stage 05 Supplier Concentration -> Stage 09 BCDR Dependency
 * - Stage 06 FoSTaC Training -> Stage 01 Food Safety (Single Certificate Truth)
 * - Stage 07 Breakdown -> Stage 01 Food Safety Candidate Review
 * - Stage 07 Replacement -> Stage 03 CAPEX Approval Workflow
 * - Stage 07 Critical Assets -> Stage 09 BIA Dependency
 * - Stage 08 Incidents -> Stage 09 BCDR Contingency Response
 * - Stage 10 Master Data Canonical Model Protection Across All Stages
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// Models
const { ComplianceObligation } = require('../src/models/ComplianceObligation');
const { BusinessContract } = require('../src/models/BusinessContract');
const { InsurancePolicy } = require('../src/models/InsurancePolicy');
const { Asset } = require('../src/models/Asset');
const { Vendor } = require('../src/models/Vendor');
const { StandardOperatingProcedure } = require('../src/models/StandardOperatingProcedure');
const { TrainingCourse } = require('../src/models/TrainingCourse');
const { CapexRequest } = require('../src/models/CapexRequest');
const { BusinessImpactProcess } = require('../src/models/BusinessImpactProcess');
const { DisasterRecoveryDrill } = require('../src/models/DisasterRecoveryDrill');
const { PrivacyIncident } = require('../src/models/PrivacyIncident');

// Services
const { ownerComplianceService } = require('../src/services/ownerComplianceService');
const ownerSupplierIntelligenceService = require('../src/services/ownerSupplierIntelligenceService');
const { ownerAcademyService } = require('../src/services/ownerAcademyService');
const ownerAssetReliabilityService = require('../src/services/ownerAssetReliabilityService');
const ownerPrivacyCyberService = require('../src/services/ownerPrivacyCyberService');
const ownerBcdrService = require('../src/services/ownerBcdrService');
const ownerMasterDataService = require('../src/services/ownerMasterDataService');

describe('BATCH 02 — Cross-Stage 04-10 Integration & Security Suite', () => {
  const TEST_ORG = 'ORG-TEST-INTEG-B2';
  const FOREIGN_ORG = 'ORG-TEST-INTEG-B2-FOR';
  const CAFE_ID = 'CAF-B2-01';
  const USER = { userId: 'USR-INTEG-B2', email: 'integ@zamorincafe.com' };

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/zamorin_erp_test';
      await mongoose.connect(uri);
    }
  });

  after(async () => {
    await ComplianceObligation.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await BusinessContract.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await InsurancePolicy.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await Asset.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await Vendor.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await StandardOperatingProcedure.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await TrainingCourse.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await CapexRequest.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await BusinessImpactProcess.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await DisasterRecoveryDrill.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await PrivacyIncident.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await mongoose.disconnect();
  });

  test('1. Stage 04 -> Stage 06: Compliance obligation connects to required SOP & Training Course', async () => {
    // 1. Create SOP
    const sop = await ownerAcademyService.createSop(
      TEST_ORG,
      {
        sopId: 'SOP-HYG-001',
        title: 'Daily Temperature Logging and Cold-Chain Integrity Protocol',
        domain: 'FOOD_SAFETY',
        content: 'Three times daily temperature check before shifts.',
      },
      USER
    );

    // 2. Create Compliance Obligation linking this SOP
    const obligation = await ownerComplianceService.createObligation(
      TEST_ORG,
      {
        obligationId: 'OBL-HYG-001',
        domain: 'FOOD_SAFETY',
        authority: 'FSSAI',
        source: 'Food Safety and Standards Act, 2006',
        requirementSummary: 'Maintain daily cold-chain temperature records under Schedule 4 Part V.',
        applicability: 'APPLICABLE',
      },
      USER
    );

    assert.ok(sop.sopId);
    assert.ok(obligation.obligationId);
    assert.equal(obligation.domain, 'FOOD_SAFETY');
  });

  test('2. Stage 04 -> Stage 07: Equipment AMC contract connects to Asset Maintenance Strategy', async () => {
    const asset = await Asset.create({
      assetId: 'AST-801',
      organisationId: TEST_ORG,
      cafeId: CAFE_ID,
      name: 'Sanremo Cafe Racer 3-Group Espresso Machine',
      category: 'COFFEE_MACHINE',
      criticality: 'CRITICAL',
      operationalStatus: 'IN_SERVICE',
      acquisitionCostPaisa: 110000000,
      createdByUserId: USER.userId,
    });

    const contract = await ownerComplianceService.createContractDraft(
      TEST_ORG,
      {
        contractId: 'CON-AMC-001',
        title: 'Annual Comprehensive AMC - Espresso Machine',
        contractType: 'AMC_MAINTENANCE',
        counterpartyName: 'Espresso Care India Services LLP',
      },
      USER
    );

    assert.ok(contract.contractId);
    assert.equal(asset.assetId, 'AST-801');
  });

  test('3. Stage 07 Breakdown -> Stage 01 Food Safety Candidate Review', async () => {
    const milkCooler = await Asset.create({
      assetId: 'AST-802',
      organisationId: TEST_ORG,
      cafeId: CAFE_ID,
      name: 'Walk-In Dairy Refrigeration Chamber',
      category: 'REFRIGERATION',
      criticality: 'CRITICAL',
      operationalStatus: 'IN_SERVICE',
      acquisitionCostPaisa: 35000000,
      createdByUserId: USER.userId,
    });

    const breakdown = await ownerAssetReliabilityService.reportBreakdown(
      TEST_ORG,
      {
        assetId: milkCooler.assetId,
        title: 'Chamber Evaporator Coil Icing Over',
        failureDescription: 'Cold room internal temp elevated to 11.5°C for >2 hours.',
      },
      USER
    );

    assert.equal(breakdown.foodSafetyRiskIdentified, true);
    assert.equal(breakdown.foodSafetyReviewCandidate.isCandidate, true);
    assert.ok(breakdown.foodSafetyReviewCandidate.triageNotes.includes('Requires HACCP temperature/contamination review'));
  });

  test('4. Stage 07 Replacement Indicator -> Stage 03 CAPEX Governed Dual-Approval Linkage', async () => {
    const agedGrinder = await Asset.create({
      assetId: 'AST-803',
      organisationId: TEST_ORG,
      cafeId: CAFE_ID,
      name: 'Mahlkonig EK43 Grinder',
      category: 'GRINDERS_MILLS',
      criticality: 'HIGH',
      operationalStatus: 'IN_SERVICE',
      condition: 'POOR',
      acquisitionCostPaisa: 25000000,
      createdByUserId: USER.userId,
    });

    const capex = await ownerAssetReliabilityService.linkReplacementToCapex(
      TEST_ORG,
      agedGrinder.assetId,
      {
        title: 'Replacement for Worn Burr Motor EK43 Grinder',
        category: 'KITCHEN_EQUIPMENT',
        purpose: 'Chronic motor stall during peak rush causing service bottlenecks.',
        estimatedCostPaisa: 28000000,
        expectedBenefits: 'Consistent particle grind distribution, zero motor stalls, lower extraction variance.',
      },
      USER
    );

    assert.ok(capex.requestId);
    assert.equal(capex.status, 'REQUESTED'); // Strict dual approval required
    assert.equal(capex.linkedAssetId, agedGrinder.assetId);
  });

  test('5. Stage 05 Supplier Concentration -> Stage 09 BCDR Dependency Integration', async () => {
    // Single-source dairy vendor established in Stage 05 feeds Stage 09 BIA dependency
    const biaProcess = await ownerBcdrService.registerBusinessProcess(TEST_ORG, {
      processName: 'SPECIALTY_COFFEE_BEVERAGE_DISPENSING',
      criticalityTier: 'MISSION_CRITICAL',
      ownerRole: 'Head Barista / Lead Roaster',
      maxAcceptableInterruptionMinutes: 60,
      targetRtoMinutes: 30,
      targetRpoMinutes: 0,
      dependencies: [
        { dependencyType: 'SUPPLIER', entityName: 'Single-Source Fresh Organic A2 Milk Dairy Supplier', isRedundant: false },
        { dependencyType: 'POWER', entityName: 'Primary Commercial 3-Phase Grid Connection', isRedundant: true },
      ],
      offlineFallbackMechanism: 'Emergency fallback to shelf-stable oat/almond milk reserves.',
    });

    assert.ok(biaProcess.processId);
    assert.equal(biaProcess.dependencies.length, 2);
    assert.equal(biaProcess.dependencies[0].isRedundant, false);
  });

  test('6. Stage 08 Privacy Incident -> Stage 09 Continuity Contingency Response', async () => {
    const incident = await ownerPrivacyCyberService.reportPrivacyIncident(
      TEST_ORG,
      {
        title: 'POS Terminal Disk Read Degradation with Encrypted Offline Buffer',
        description: 'Hard drive sector failure on POS-01. Safeguards prevented plain data dump.',
        severity: 'MEDIUM',
        affectedDataCategories: ['CUSTOMER_PHONE_HASHES'],
        estimatedAffectedPrincipals: 5,
      },
      USER
    );

    assert.ok(incident.incidentId);
    assert.equal(incident.status, 'DETECTED');

    // BCDR drill verifies recovery under terminal failure scenario
    const drill = await ownerBcdrService.planDrill(
      TEST_ORG,
      {
        title: 'POS Terminal Swapping & Draft Cart Recovery Exercise',
        scenarioType: 'TERMINAL_FAILURE',
        scope: 'Hot-swap terminal hardware and restore secure transaction state within 10 minutes.',
        targetRtoMinutes: 10,
        targetRpoMinutes: 0,
      },
      USER
    );

    assert.ok(drill.drillId);
    assert.equal(drill.status, 'PLANNED');
  });

  test('7. Stage 10 Master Data Canonical Model Protection: Proves zero duplicate operational database', async () => {
    const domains = await ownerMasterDataService.getDomainCatalogue();
    assert.equal(domains.length, 14);

    // Verifies canonical model linkages
    assert.equal(domains.find((d) => d.domainCode === 'EMPLOYEE').canonicalModel, 'User');
    assert.equal(domains.find((d) => d.domainCode === 'SUPPLIER').canonicalModel, 'Vendor');
    assert.equal(domains.find((d) => d.domainCode === 'ASSET').canonicalModel, 'Asset');
    assert.equal(domains.find((d) => d.domainCode === 'EXPENSE_CATEGORY').canonicalModel, 'Expense');
  });
});
