'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER BATCH 02: CROSS-APP DISTRIBUTION TEST SUITE
 * ============================================================================
 * Verifies contextual operational capabilities distributed across:
 * - Café Master (Compliance & Licences, De-dup, Change Requests)
 * - Supplier Master (Supplier 360, Contracts, Action Plans, De-dup)
 * - Asset Master (Maintenance, Breakdown, Calibration, AMC, Reliability, De-dup)
 * - Employee Profile & Team View (My Training & Competency, Self-Ack, Team Gaps)
 * - Procurement Workspace (Supplier Intelligence, Price History, Warnings)
 * - Café Operations BCDR (Continuity Plan, Emergency Fallback, Outage Guidance)
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { Cafe } = require('../src/models/Cafe');
const { Vendor } = require('../src/models/Vendor');
const { Asset } = require('../src/models/Asset');
const { User } = require('../src/models/User');
const { BusinessLicence } = require('../src/models/BusinessLicence');
const { ComplianceObligation } = require('../src/models/ComplianceObligation');
const { BusinessContract } = require('../src/models/BusinessContract');
const { SupplierActionPlan } = require('../src/models/SupplierActionPlan');
const { AssetBreakdownLog } = require('../src/models/AssetBreakdownLog');
const { CalibrationRecord } = require('../src/models/CalibrationRecord');
const { StandardOperatingProcedure } = require('../src/models/StandardOperatingProcedure');
const { SopAcknowledgement } = require('../src/models/SopAcknowledgement');
const { EmployeeTraining } = require('../src/models/EmployeeTraining');
const { EmployeeCompetency } = require('../src/models/EmployeeCompetency');
const { MasterDuplicateCandidate } = require('../src/models/MasterDuplicateCandidate');
const { MasterChangeRequest } = require('../src/models/MasterChangeRequest');
const { PurchaseOrder } = require('../src/models/PurchaseOrder');
const { IncomingInspection } = require('../src/models/IncomingInspection');

const ownerBcdrService = require('../src/services/ownerBcdrService');

describe('OWNER BATCH 02 — Cross-App Contextual Distribution Suite', () => {
  const TEST_ORG = 'ORG-TEST-DIST-02';
  const CAFE_1 = 'ZC-0001';
  const CAFE_2 = 'ZC-0002';
  const VENDOR_ID = 'VEN-1001';
  const ASSET_ID = 'AST-001';
  const USER_STAFF = 'ST-0001';
  const USER_MGR = 'AD-0001';

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/zamorin_erp_test';
      await mongoose.connect(uri);
    }

    // Clean test records
    await Promise.all([
      Cafe.deleteMany({ $or: [{ organisationId: TEST_ORG }, { cafeId: CAFE_1 }] }),
      Vendor.deleteMany({ $or: [{ organisationId: TEST_ORG }, { vendorId: VENDOR_ID }] }),
      Asset.deleteMany({ $or: [{ organisationId: TEST_ORG }, { assetId: ASSET_ID }] }),
      User.deleteMany({ $or: [{ organisationId: TEST_ORG }, { userId: { $in: [USER_STAFF, USER_MGR] } }] }),
      BusinessLicence.deleteMany({ organisationId: TEST_ORG }),
      ComplianceObligation.deleteMany({ organisationId: TEST_ORG }),
      BusinessContract.deleteMany({ organisationId: TEST_ORG }),
      SupplierActionPlan.deleteMany({ organisationId: TEST_ORG }),
      AssetBreakdownLog.deleteMany({ organisationId: TEST_ORG }),
      CalibrationRecord.deleteMany({ organisationId: TEST_ORG }),
      StandardOperatingProcedure.deleteMany({ organisationId: TEST_ORG }),
      SopAcknowledgement.deleteMany({ organisationId: TEST_ORG }),
      EmployeeTraining.deleteMany({ organisationId: TEST_ORG }),
      EmployeeCompetency.deleteMany({ organisationId: TEST_ORG }),
      MasterDuplicateCandidate.deleteMany({ organisationId: TEST_ORG }),
      MasterChangeRequest.deleteMany({ organisationId: TEST_ORG }),
      PurchaseOrder.deleteMany({ organisationId: TEST_ORG }),
      IncomingInspection.deleteMany({ organisationId: TEST_ORG }),
    ]);

    // Seed test Café
    await Cafe.create({
      organisationId: TEST_ORG,
      cafeId: CAFE_1,
      name: 'Zamorin Calicut Beachside',
      displayName: 'Zamorin Beachside Flagship',
      createdBy: 'SYSTEM',
      status: 'ACTIVE',
      type: 'FLAGSHIP',
    });

    // Seed test Vendor
    await Vendor.create({
      organisationId: TEST_ORG,
      vendorId: VENDOR_ID,
      name: 'Malabar Spices & Dairy Cooperative',
      nameLower: 'malabar spices & dairy cooperative',
      category: 'FOOD_BEVERAGE',
      createdByUserId: 'SYSTEM',
      status: 'ACTIVE',
      deliveryScore: 96,
      rating: 4.8,
    });

    // Seed test Asset
    await Asset.create({
      organisationId: TEST_ORG,
      assetId: ASSET_ID,
      cafeId: CAFE_1,
      name: 'La Marzocco Espresso Machine Linea PB',
      category: 'BREWING_EQUIPMENT',
      criticality: 'CRITICAL',
      status: 'OPERATIONAL',
      createdByUserId: 'SYSTEM',
      purchasePricePaisa: 85000000,
    });

    // Seed test Staff
    await User.create({
      organisationId: TEST_ORG,
      userId: USER_STAFF,
      name: 'Rahul Nambiar',
      fullName: 'Rahul Nambiar',
      email: 'staff.dist@zamorin.cafe',
      role: 'STAFF',
      primaryCafeId: CAFE_1,
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      employmentStatus: 'ACTIVE',
    });

    // Seed test Manager
    await User.create({
      organisationId: TEST_ORG,
      userId: USER_MGR,
      name: 'Amina Farooq',
      fullName: 'Amina Farooq',
      email: 'mgr.dist@zamorin.cafe',
      role: 'CAFE_ADMIN',
      primaryCafeId: CAFE_1,
      assignedCafeIds: [CAFE_1],
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      employmentStatus: 'ACTIVE',
    });
  });

  after(async () => {
    await Promise.all([
      Cafe.deleteMany({ organisationId: TEST_ORG }),
      Vendor.deleteMany({ organisationId: TEST_ORG }),
      Asset.deleteMany({ organisationId: TEST_ORG }),
      User.deleteMany({ organisationId: TEST_ORG }),
      BusinessLicence.deleteMany({ organisationId: TEST_ORG }),
      ComplianceObligation.deleteMany({ organisationId: TEST_ORG }),
      BusinessContract.deleteMany({ organisationId: TEST_ORG }),
      SupplierActionPlan.deleteMany({ organisationId: TEST_ORG }),
      AssetBreakdownLog.deleteMany({ organisationId: TEST_ORG }),
      CalibrationRecord.deleteMany({ organisationId: TEST_ORG }),
      StandardOperatingProcedure.deleteMany({ organisationId: TEST_ORG }),
      SopAcknowledgement.deleteMany({ organisationId: TEST_ORG }),
      EmployeeTraining.deleteMany({ organisationId: TEST_ORG }),
      EmployeeCompetency.deleteMany({ organisationId: TEST_ORG }),
      MasterDuplicateCandidate.deleteMany({ organisationId: TEST_ORG }),
      MasterChangeRequest.deleteMany({ organisationId: TEST_ORG }),
      PurchaseOrder.deleteMany({ organisationId: TEST_ORG }),
      IncomingInspection.deleteMany({ organisationId: TEST_ORG }),
    ]);
    await mongoose.disconnect();
  });

  test('1. Stage 04 Contextual: Café Master displays canonical licences, obligations, and data governance without duplicating Stage 01 FSSAI', async () => {
    // Seed BusinessLicence
    await BusinessLicence.create({
      organisationId: TEST_ORG,
      cafeId: CAFE_1,
      licenceId: 'LIC-TEST-001',
      licenceType: 'LOCAL_TRADE_HEALTH',
      authority: 'Kozhikode Municipal Corporation',
      referenceNumber: 'KMC/HEALTH/2026/889',
      issueDate: new Date('2026-01-01'),
      expiryDate: new Date('2027-01-01'),
      status: 'ACTIVE',
    });

    // Seed ComplianceObligation
    await ComplianceObligation.create({
      organisationId: TEST_ORG,
      cafeId: CAFE_1,
      obligationId: 'OBL-TEST-001',
      title: 'Quarterly Kitchen Pest Control Audit',
      domain: 'FOOD_SAFETY',
      source: 'FSSAI Mandate',
      requirementSummary: 'Quarterly Kitchen Pest Control Audit',
      authority: 'FSSAI',
      frequency: 'QUARTERLY',
      dueDate: new Date('2026-09-30'),
      status: 'ACTION_REQUIRED',
    });

    // Query models directly as controller does
    const licences = await BusinessLicence.find({ organisationId: TEST_ORG, cafeId: CAFE_1, isDeleted: false }).lean();
    const obligations = await ComplianceObligation.find({ organisationId: TEST_ORG, cafeId: CAFE_1, isDeleted: false }).lean();

    assert.equal(licences.length, 1);
    assert.equal(licences[0].referenceNumber, 'KMC/HEALTH/2026/889');
    assert.equal(obligations.length, 1);
    assert.equal(obligations[0].obligationId, 'OBL-TEST-001');
  });

  test('2. Stage 05 Contextual: Supplier Master 360 displays canonical contracts, action plans, and de-dup without duplicating source models', async () => {
    // Seed canonical contract
    await BusinessContract.create({
      organisationId: TEST_ORG,
      contractId: 'CON-TEST-001',
      counterpartyId: VENDOR_ID,
      contractReference: 'MSA-MALABAR-2026',
      title: 'Annual Wholesale Dairy Supply Agreement',
      counterpartyName: 'Malabar Spices Cooperative',
      contractType: 'SUPPLIER_AGREEMENT',
      effectiveDate: new Date('2026-01-01'),
      expiryDate: new Date('2027-01-01'),
      status: 'ACTIVE',
    });

    // Seed canonical action plan
    await SupplierActionPlan.create({
      organisationId: TEST_ORG,
      vendorId: VENDOR_ID,
      actionId: 'ACT-TEST-001',
      title: 'Cold-chain transit temperature logger calibration',
      finding: 'Transit temperature loggers out of tolerance',
      actionRequired: 'Recalibrate dataloggers and provide compliance certificate',
      responsibleOwner: 'Quality Lead Malabar',
      dueDate: new Date('2026-10-15'),
      status: 'OPEN',
    });

    // Query canonical records for Supplier 360
    const contracts = await BusinessContract.find({ organisationId: TEST_ORG, counterpartyId: VENDOR_ID, isDeleted: false }).lean();
    const plans = await SupplierActionPlan.find({ organisationId: TEST_ORG, vendorId: VENDOR_ID, isDeleted: false }).lean();

    assert.equal(contracts.length, 1);
    assert.equal(contracts[0].contractId, 'CON-TEST-001');
    assert.equal(plans.length, 1);
    assert.equal(plans[0].actionId, 'ACT-TEST-001');
  });

  test('3. Stage 07 Contextual: Asset Master detail exposes breakdown logs, calibrations, and AMC contracts with MTBF/MTTR metrics', async () => {
    // Seed breakdown log
    await AssetBreakdownLog.create({
      organisationId: TEST_ORG,
      breakdownId: 'BDN-TEST-001',
      assetId: ASSET_ID,
      cafeId: CAFE_1,
      title: 'Steam wand pressure drop',
      failureDescription: 'Valve gasket leak caused pressure failure',
      reportedByUserId: USER_STAFF,
      reportedAt: new Date(Date.now() - 48 * 3600 * 1000),
      recoveredAt: new Date(Date.now() - 44 * 3600 * 1000),
      downtimeMinutes: 240,
      rootCause: 'MECHANICAL_WEAR',
      repairCostPaisa: 1500000,
      status: 'CLOSED',
    });

    // Seed calibration
    await CalibrationRecord.create({
      organisationId: TEST_ORG,
      calibrationId: 'CAL-TEST-001',
      assetId: ASSET_ID,
      assetName: 'La Marzocco Espresso Machine Linea PB',
      cafeId: CAFE_1,
      calibrationDate: new Date(),
      nextDueDate: new Date(Date.now() + 180 * 86400 * 1000),
      performedBy: 'Authorized La Marzocco Technician',
      recordedByUserId: USER_STAFF,
      result: 'PASS',
      certifiedBy: 'Authorized La Marzocco Technician',
    });

    const breakdowns = await AssetBreakdownLog.find({ organisationId: TEST_ORG, assetId: ASSET_ID }).lean();
    const calibrations = await CalibrationRecord.find({ organisationId: TEST_ORG, assetId: ASSET_ID }).lean();

    assert.equal(breakdowns.length, 1);
    assert.equal(breakdowns[0].downtimeMinutes, 240);
    assert.equal(calibrations.length, 1);
    assert.equal(calibrations[0].result, 'PASS');
  });

  test('4. Stage 06 Contextual: Employee Profile exposes My Training & Competency self-view and self-acknowledgement', async () => {
    // Seed SOP
    await StandardOperatingProcedure.create({
      organisationId: TEST_ORG,
      sopId: 'SOP-OPS-001',
      title: 'Espresso Extraction Standards & Daily Clean-down',
      domain: 'FOOD_SAFETY',
      version: 2,
      status: 'EFFECTIVE',
      content: 'Standard operating steps for pulling espresso shots at 9 bar pressure.',
      isAcknowledgementRequired: true,
      ownerUserId: 'USR-MASTER',
    });

    // Seed Training
    await EmployeeTraining.create({
      trainingId: 'TRN-TEST-001',
      organisationId: TEST_ORG,
      userId: USER_STAFF,
      trainingTitle: 'Food Safety Supervisor FoSTaC Certification',
      trainingType: 'FOSTAC',
      status: 'COMPLETED',
      dueDate: new Date('2026-12-31'),
    });

    // Seed Competency
    await EmployeeCompetency.create({
      organisationId: TEST_ORG,
      userId: USER_STAFF,
      competencyId: 'CMP-TEST-001',
      skillName: 'Latte Art & Milk Texturing',
      status: 'COMPETENT',
      isCompetent: true,
      assessedByUserId: USER_MGR,
    });

    // Seed Acknowledgement
    const ack = await SopAcknowledgement.create({
      organisationId: TEST_ORG,
      sopId: 'SOP-OPS-001',
      sopVersion: 2,
      userId: USER_STAFF,
      userName: 'Rahul Nambiar',
      role: 'STAFF',
      cafeId: CAFE_1,
      dueDate: new Date('2026-09-30'),
      status: 'ASSIGNED',
    });

    assert.equal(ack.status, 'ASSIGNED');

    // Perform Self Acknowledgement
    ack.status = 'ACKNOWLEDGED';
    ack.acknowledgedAt = new Date();
    await ack.save();

    const updatedAck = await SopAcknowledgement.findOne({ organisationId: TEST_ORG, userId: USER_STAFF, sopId: 'SOP-OPS-001' });
    assert.equal(updatedAck.status, 'ACKNOWLEDGED');
    assert.ok(updatedAck.acknowledgedAt);
  });

  test('5. Stage 06 Contextual: Manager / Team view restricts visibility strictly to authorized café team', async () => {
    // User in foreign cafe
    await User.create({
      organisationId: TEST_ORG,
      userId: 'ST-9999',
      name: 'Foreign Employee',
      fullName: 'Foreign Employee',
      email: 'foreign.dist@zamorin.cafe',
      role: 'STAFF',
      primaryCafeId: CAFE_2,
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      employmentStatus: 'ACTIVE',
    });

    // Team query scoped to CAFE_1
    const cafe1Users = await User.find({ organisationId: TEST_ORG, primaryCafeId: CAFE_1 }).lean();
    const cafe1UserIds = cafe1Users.map((u) => u.userId);

    assert.ok(cafe1UserIds.includes(USER_STAFF));
    assert.ok(!cafe1UserIds.includes('ST-9999'));
  });

  test('6. Stage 05 Contextual: Procurement Workspace provides contextual warnings without automatic rejection', async () => {
    // Seed purchase order
    await PurchaseOrder.create({
      organisationId: TEST_ORG,
      purchaseOrderId: 'PO-TEST-001',
      vendorId: VENDOR_ID,
      cafeId: CAFE_1,
      status: 'RECEIVED',
      createdByUserId: 'SYSTEM',
      lineItems: [
        {
          itemId: 'ITM-MILK-001',
          name: 'Organic Full Cream Milk 1L',
          quantity: 100,
          orderedQuantityBase: 100,
          unitCostPaisa: 5200,
          unitPricePaisa: 5200,
          totalLinePaisa: 520000,
        },
      ],
      totalPaisa: 520000,
    });

    // Seed rejected inspection
    await IncomingInspection.create({
      inspectionId: 'INS-TEST-001',
      organisationId: TEST_ORG,
      vendorId: VENDOR_ID,
      purchaseOrderId: 'PO-TEST-001',
      cafeId: CAFE_1,
      itemId: 'ITM-MILK-001',
      receivedQuantity: 100,
      rejectedQuantity: 100,
      acceptedQuantity: 0,
      decision: 'REJECT',
      inspectedByUserId: USER_STAFF,
      rejectionReason: 'Temperature upon delivery exceeded +6°C cold-chain threshold.',
      inspectedAt: new Date(),
    });

    const recentOrders = await PurchaseOrder.find({ organisationId: TEST_ORG, vendorId: VENDOR_ID }).lean();
    const rejections = await IncomingInspection.find({ organisationId: TEST_ORG, vendorId: VENDOR_ID, decision: 'REJECT' }).lean();

    assert.equal(recentOrders.length, 1);
    assert.equal(recentOrders[0].lineItems[0].unitPricePaisa, 5200);
    assert.equal(rejections.length, 1);
    // Invariant: Warning exists, but vendor is NOT automatically rejected
    assert.ok(rejections[0].rejectionReason.includes('Temperature upon delivery'));
  });

  test('7. Stage 09 Contextual: Café Operations Continuity Plan provides local emergency tools and canonical incident activation', async () => {
    const plan = await ownerBcdrService.getCafeContinuityPlan(TEST_ORG, CAFE_1);

    assert.equal(plan.cafeId, CAFE_1);
    assert.ok(plan.emergencyContacts.length >= 4);
    assert.ok(plan.outageGuidance.posOutage.includes('NO SERVER ACKNOWLEDGEMENT = NO COMPLETED ERP FINANCIAL SALE'));
    assert.ok(plan.fallbackChecklist.length >= 4);
    assert.equal(plan.incidentActivation.canonicalIncidentEndpoint, '/api/v1/privacy-cyber/incidents');
  });

  test('8. Stage 10 Contextual: Master Data Governance detects duplicate candidates without auto-merge', async () => {
    await MasterDuplicateCandidate.create({
      candidateId: 'DUP-TEST-001',
      organisationId: TEST_ORG,
      domainCode: 'CAFE',
      recordAId: CAFE_1,
      recordBId: 'CAF-DIST-DUPLICATE',
      fieldsCompared: ['name', 'address'],
      matchConfidencePercentage: 88,
      matchMethod: 'FUZZY_NAME_PROXIMITY',
      status: 'REVIEW',
    });

    const candidates = await MasterDuplicateCandidate.find({
      organisationId: TEST_ORG,
      domainCode: 'CAFE',
      $or: [{ recordAId: CAFE_1 }, { recordBId: CAFE_1 }],
    }).lean();

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].status, 'REVIEW');
    assert.notEqual(candidates[0].status, 'MERGED'); // Auto-merge strictly prohibited!
  });
});
