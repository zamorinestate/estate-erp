'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER BATCH 03 CROSS-STAGE INTEGRATION SUITE
 * ============================================================================
 * Verifies end-to-end integration workflows across Stages 11 through 15:
 * - Stage 11: Multi-channel complaint intake, lifecycle & food safety escalation
 * - Stage 12: Item economics with recipe costing & menu engineering matrix
 * - Stage 13: Customer loyalty points accrual, redemption & cohort analytics
 * - Stage 14: Used cooking oil RUCO 25% safety ceiling & SWM 2026 applicability
 * - Stage 15: Governance meeting minutes SHA-256 seal & authority delegation
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// Stage 11
const CustomerComplaintModule = require('../src/models/CustomerComplaint');
const CustomerComplaint = CustomerComplaintModule.CustomerComplaint || CustomerComplaintModule;
const BillModule = require('../src/models/Bill');
const Bill = BillModule.Bill || BillModule;
const ownerComplaintsService = require('../src/services/ownerComplaintsService');

// Stage 12
const MenuItemModule = require('../src/models/MenuItem');
const MenuItem = MenuItemModule.MenuItem || MenuItemModule;
const RecipeModule = require('../src/models/Recipe');
const Recipe = RecipeModule.Recipe || RecipeModule;
const ownerMenuPricingService = require('../src/services/ownerMenuPricingService');

// Stage 13
const CustomerModule = require('../src/models/Customer');
const Customer = CustomerModule.Customer || CustomerModule;
const LoyaltyLedgerModule = require('../src/models/LoyaltyLedger');
const LoyaltyLedger = LoyaltyLedgerModule.LoyaltyLedger || LoyaltyLedgerModule;
const ownerCustomerLoyaltyService = require('../src/services/ownerCustomerLoyaltyService');

// Stage 14
const UtilityMeterModule = require('../src/models/UtilityMeter');
const UtilityMeter = UtilityMeterModule.UtilityMeter || UtilityMeterModule;
const WasteRecordModule = require('../src/models/WasteRecord');
const WasteRecord = WasteRecordModule.WasteRecord || WasteRecordModule;
const UsedCookingOilLogModule = require('../src/models/UsedCookingOilLog');
const UsedCookingOilLog = UsedCookingOilLogModule.UsedCookingOilLog || UsedCookingOilLogModule;
const SolidWaste2026ApplicabilityModule = require('../src/models/SolidWaste2026Applicability');
const SolidWaste2026Applicability = SolidWaste2026ApplicabilityModule.SolidWaste2026Applicability || SolidWaste2026ApplicabilityModule;
const ownerUtilitiesWasteService = require('../src/services/ownerUtilitiesWasteService');

// Stage 15
const GovernanceMeetingModule = require('../src/models/GovernanceMeeting');
const GovernanceMeeting = GovernanceMeetingModule.GovernanceMeeting || GovernanceMeetingModule;
const DelegationOfAuthorityModule = require('../src/models/DelegationOfAuthority');
const DelegationOfAuthority = DelegationOfAuthorityModule.DelegationOfAuthority || DelegationOfAuthorityModule;
const ownerGovernanceDelegationService = require('../src/services/ownerGovernanceDelegationService');

describe('BATCH 03 — Cross-Stage (11-15) Strategic Integration Suite', () => {
  const TEST_ORG = new mongoose.Types.ObjectId().toString().toUpperCase();
  const FOREIGN_ORG = new mongoose.Types.ObjectId().toString().toUpperCase();
  const TEST_CAFE = new mongoose.Types.ObjectId().toString();

  const USER_OWNER = { userId: 'USR-OWNER-B3', name: 'Zamorin Owner', role: 'OWNER' };

  let testMenuItemId;
  let testCustomerId;
  let testBillId;

  let origEnableLoyalty;

  before(async () => {
    origEnableLoyalty = process.env.ENABLE_LOYALTY;
    process.env.ENABLE_LOYALTY = 'true';

    if (mongoose.connection.readyState === 0) {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/zamorin_erp_test';
      await mongoose.connect(uri);
    }

    await CustomerComplaint.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await Bill.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await MenuItem.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await Recipe.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await Customer.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    if (LoyaltyLedger) {
      await LoyaltyLedger.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    }
    await UtilityMeter.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await WasteRecord.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await UsedCookingOilLog.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await SolidWaste2026Applicability.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await GovernanceMeeting.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await DelegationOfAuthority.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
  });

  after(async () => {
    process.env.ENABLE_LOYALTY = origEnableLoyalty;
    await mongoose.disconnect();
  });

  test('1. Stage 11 Integration: Customer complaint intake with food-safety escalation', async () => {
    const complaint = await ownerComplaintsService.createComplaint(TEST_ORG, {
      cafeId: TEST_CAFE,
      channel: 'CAFE_IN_PERSON',
      complaintCategory: 'FOOD_SAFETY_ALLERGEN',
      severity: 'CRITICAL',
      title: 'Undeclared walnut pieces in dessert',
      description: 'Customer experienced mild allergen reaction. Immediate kitchen audit requested.',
      customerName: 'Kavita Menon',
      customerPhone: '9845011223',
      isFoodSafetyIssue: true
    }, USER_OWNER);

    assert.ok(complaint.complaintId);
    assert.equal(complaint.status, 'RECEIVED');
    assert.equal(complaint.foodSafetyEscalation.isEscalated, true);

    // Lifecycle progression: RECEIVED -> TRIAGED
    const triaged = await ownerComplaintsService.updateComplaintStatus(
      TEST_ORG,
      complaint.complaintId,
      'TRIAGED',
      USER_OWNER,
      'Triaged to Head Chef for immediate recipe review'
    );
    assert.equal(triaged.status, 'TRIAGED');
  });

  test('2. Stage 12 Integration: Menu item food costing & BCG matrix classification', async () => {
    const rand = Math.floor(Math.random() * 8999 + 1000);
    const item = await MenuItem.create({
      organisationId: TEST_ORG,
      menuItemId: `MENU-${rand}`,
      name: 'Kerala Malabar Chemmeen Roast',
      nameLower: 'kerala malabar chemmeen roast',
      sellingPrice: 450,
      pricing: { basePricePaisa: 45000 },
      currentPricePaisa: 45000,
      category: 'MAIN_COURSE',
      status: 'ACTIVE',
      createdByUserId: 'SYSTEM'
    });
    testMenuItemId = item._id;

    await Recipe.create({
      organisationId: TEST_ORG,
      recipeId: `RCP-${rand}`,
      name: 'Kerala Malabar Chemmeen Roast',
      recipeCode: `PLU-${rand}`,
      createdByUserId: USER_OWNER.userId,
      ingredients: [
        { ingredientName: 'Fresh Tiger Prawns', quantity: 0.25, uom: 'KG', costPerUnit: 800 }, // ₹200.00
        { ingredientName: 'Shallots & Spices Paste', quantity: 0.1, uom: 'KG', costPerUnit: 200 } // ₹20.00
      ],
      status: 'APPROVED'
    });

    const econ = await ownerMenuPricingService.getItemEconomics(TEST_ORG, testMenuItemId);
    assert.equal(econ.isCostAvailable, true);
    assert.equal(econ.recipeCost, 220); // 200 + 20
    assert.ok(econ.contributionAmount > 0);
    assert.equal(econ.dataQualityState, 'HEALTHY');

    const matrix = await ownerMenuPricingService.getMenuEngineeringMatrix(TEST_ORG);
    assert.ok(matrix.items.length >= 1);
  });

  test('3. Stage 13 Integration: Customer loyalty ledger points accrual and cohort analytics', async () => {
    const rand = Math.floor(Math.random() * 8999 + 1000);
    testBillId = `BILL-20260914-${rand}`;

    const customer = await Customer.create({
      organisationId: TEST_ORG,
      customerId: `CUST-${rand}`,
      name: 'Dr. Siddharth Varma',
      phone: '9847123456',
      email: 'siddharth.v@example.com',
      totalVisits: 4,
      totalSpendPaisa: 220000,
      pointsBalance: 150,
      loyaltyPoints: 150,
      lastVisitAt: new Date(),
      lastVisitDate: new Date(),
      status: 'ACTIVE',
      createdByUserId: 'SYSTEM'
    });
    testCustomerId = customer._id;

    await Bill.create({
      billId: testBillId,
      organisationId: TEST_ORG,
      cafeId: TEST_CAFE,
      businessDate: '2026-09-14',
      status: 'COMPLETED',
      billStatus: 'COMPLETED',
      cashierUserId: 'USR-CASHIER-01',
      customerId: testCustomerId.toString(),
      customerPhone: '9847123456',
      subtotalPaisa: 80000,
      totalPaisa: 80000,
      totalPayablePaisa: 80000,
      lineItems: [{
        lineItemId: 'LINE-001',
        menuItemId: 'MENU-001',
        itemNameSnapshot: 'Estate Special Blend',
        quantity: 2,
        unitPricePaisa: 40000,
        lineSubtotalPaisa: 80000,
        lineTotalPaisa: 80000
      }]
    });

    const rKey = Math.floor(Math.random() * 89999 + 10000);
    const idempotencyKey = `LOY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${rKey}`;
    const accrual = await ownerCustomerLoyaltyService.accrueLoyaltyPoints(TEST_ORG, {
      customerId: testCustomerId,
      billId: testBillId,
      billAmount: 800,
      pointsToAccrue: 40,
      idempotencyKey
    }, USER_OWNER);

    assert.equal(accrual.success, true);
    assert.equal(accrual.pointsAccrued, 40);
    assert.equal(accrual.currentBalance, 190); // 150 + 40

    const cohorts = await ownerCustomerLoyaltyService.getCohortDistribution(TEST_ORG);
    assert.ok(cohorts);
    assert.equal(cohorts.sensitiveTraitInferenceStatus, 'STRICTLY_PROHIBITED');
  });

  test('4. Stage 14 Integration: Used cooking oil RUCO safety limits & SWM 2026 applicability', async () => {
    // 1. Log safe oil
    const safeOil = await ownerUtilitiesWasteService.recordUsedCookingOil(TEST_ORG, {
      cafeId: TEST_CAFE,
      oilType: 'COCONUT_OIL',
      totalPolarCompoundsPercent: 19.5,
      quantityLiters: 15,
      collectorName: 'EcoBioFuels India Ltd',
      collectorFssaiRegistration: 'FSSAI-RUCO-KL-1002'
    }, USER_OWNER);

    assert.equal(safeOil.reentryBlocked, true);
    assert.ok(safeOil.tpcSafetyAlert.includes('within lawful food safety limits'));

    // 2. Log degraded oil exceeding 25% TPC boundary
    const degradedOil = await ownerUtilitiesWasteService.recordUsedCookingOil(TEST_ORG, {
      cafeId: TEST_CAFE,
      oilType: 'COCONUT_OIL',
      totalPolarCompoundsPercent: 26.8,
      quantityLiters: 10,
      collectorName: 'EcoBioFuels India Ltd',
      collectorFssaiRegistration: 'FSSAI-RUCO-KL-1002'
    }, USER_OWNER);

    assert.equal(degradedOil.reentryBlocked, true);
    assert.ok(degradedOil.tpcSafetyAlert.includes('CRITICAL_SAFETY_ALERT: TPC exceeds 25.0% FSSAI limit'));

    // 3. SWM 2026 evaluation
    const swm = await ownerUtilitiesWasteService.evaluateSWM2026Applicability(TEST_ORG, TEST_CAFE, USER_OWNER);
    assert.equal(swm.isBulkWasteGenerator, false);
  });

  test('5. Stage 15 Integration: Governance minutes SHA-256 seal & authority delegation bounds', async () => {
    const meeting = await ownerGovernanceDelegationService.createMeeting(TEST_ORG, {
      title: 'Batch 03 Governance Certification Meeting',
      meetingType: 'BOARD',
      meetingDate: new Date(),
      attendees: [
        { name: 'Managing Director', roleOrDesignation: 'Director', attendanceStatus: 'PRESENT' },
        { name: 'Independent Director', roleOrDesignation: 'Director', attendanceStatus: 'PRESENT' }
      ],
      quorumRequired: 2
    }, USER_OWNER);

    assert.ok(meeting.meetingId);

    const sealed = await ownerGovernanceDelegationService.finaliseMeetingMinutes(
      TEST_ORG,
      meeting.meetingId,
      'Final Board Minutes: All 5 strategic modules across Stages 11-15 verified and approved.',
      USER_OWNER
    );
    assert.ok(sealed.immutableMinutesHash);
    assert.equal(sealed.isMinutesSignedAndImmutable, true);

    const delegation = await ownerGovernanceDelegationService.grantDelegation(TEST_ORG, {
      delegateUserId: 'USR-MGR-B3',
      cafeScope: [TEST_CAFE],
      actionPermissions: ['APPROVE_PURCHASE_ORDER'],
      module: 'PROCUREMENT',
      maxMonetaryAmount: 20000,
      startAt: new Date(Date.now() - 60000),
      expiresAt: new Date(Date.now() + 86400000),
      reason: 'Temporary acting store manager procurement ceiling'
    }, USER_OWNER);

    assert.ok(delegation.delegationId);

    const authCheck = await ownerGovernanceDelegationService.checkDelegatedAuthority(TEST_ORG, {
      userId: 'USR-MGR-B3',
      cafeId: TEST_CAFE,
      actionPermission: 'APPROVE_PURCHASE_ORDER',
      module: 'PROCUREMENT',
      monetaryAmount: 15000
    });
    assert.equal(authCheck.isAuthorized, true);
  });
});
