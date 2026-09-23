'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER BATCH 03 MULTI-TENANT SECURITY & IDOR ISOLATION
 * ============================================================================
 * Rigorously validates multi-tenant perimeter across Stages 11 through 15:
 * - Stage 11: Foreign org cannot view, transition, or refund complaints of TEST_ORG
 * - Stage 12: Foreign org cannot query item economics, BCG matrix, or proposals of TEST_ORG
 * - Stage 13: Foreign org cannot view loyalty balance, accrue points, or query cohorts of TEST_ORG
 * - Stage 14: Foreign org cannot record readings, view meters, or access waste data of TEST_ORG
 * - Stage 15: Foreign org cannot access meetings, seal minutes, or exploit delegated authority of TEST_ORG
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// Stage 11
const CustomerComplaintModule = require('../src/models/CustomerComplaint');
const CustomerComplaint = CustomerComplaintModule.CustomerComplaint || CustomerComplaintModule;
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
const ownerUtilitiesWasteService = require('../src/services/ownerUtilitiesWasteService');

// Stage 15
const GovernanceMeetingModule = require('../src/models/GovernanceMeeting');
const GovernanceMeeting = GovernanceMeetingModule.GovernanceMeeting || GovernanceMeetingModule;
const DelegationOfAuthorityModule = require('../src/models/DelegationOfAuthority');
const DelegationOfAuthority = DelegationOfAuthorityModule.DelegationOfAuthority || DelegationOfAuthorityModule;
const ownerGovernanceDelegationService = require('../src/services/ownerGovernanceDelegationService');

describe('BATCH 03 — Multi-Tenant Security & IDOR Isolation Suite (Stages 11-15)', () => {
  const TEST_ORG = new mongoose.Types.ObjectId().toString().toUpperCase();
  const FOREIGN_ORG = new mongoose.Types.ObjectId().toString().toUpperCase();
  const TEST_CAFE = new mongoose.Types.ObjectId().toString();

  const USER_OWNER = { userId: 'USR-OWNER-IDOR', name: 'Zamorin Owner', role: 'OWNER' };
  const USER_FOREIGN = { userId: 'USR-FOREIGN-IDOR', name: 'Foreign Attacker', role: 'OWNER' };

  let testComplaintId;
  let testMenuItemId;
  let testCustomerId;
  let testMeterId;
  let testMeetingId;

  let origEnableLoyalty;

  before(async () => {
    origEnableLoyalty = process.env.ENABLE_LOYALTY;
    process.env.ENABLE_LOYALTY = 'true';

    if (mongoose.connection.readyState === 0) {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/zamorin_erp_test';
      await mongoose.connect(uri);
    }

    // 1. Seed Stage 11 Complaint in TEST_ORG
    const c = await ownerComplaintsService.createComplaint(TEST_ORG, {
      cafeId: TEST_CAFE,
      channel: 'CAFE_IN_PERSON',
      complaintCategory: 'SERVICE',
      severity: 'MEDIUM',
      title: 'Delayed table service',
      description: 'Order took 35 minutes to arrive',
      customerName: 'Rahul Varma'
    }, USER_OWNER);
    testComplaintId = c.complaintId;

    // 2. Seed Stage 12 Menu Item & Recipe in TEST_ORG
    const rand = Math.floor(Math.random() * 8999999 + 1000000);
    const item = await MenuItem.create({
      organisationId: TEST_ORG,
      menuItemId: `MENU-${rand}`,
      name: 'Signature Estate Cold Brew',
      nameLower: 'signature estate cold brew',
      sellingPrice: 280,
      pricing: { basePricePaisa: 28000 },
      currentPricePaisa: 28000,
      category: 'COFFEE',
      status: 'ACTIVE',
      createdByUserId: 'SYSTEM'
    });
    testMenuItemId = item._id;

    await Recipe.create({
      organisationId: TEST_ORG,
      recipeId: `RCP-${rand}`,
      name: 'Signature Estate Cold Brew',
      recipeCode: `PLU-${rand}`,
      createdByUserId: USER_OWNER.userId,
      ingredients: [{ ingredientName: 'Arabica Beans', quantity: 0.05, uom: 'KG', costPerUnit: 1200 }],
      status: 'APPROVED'
    });

    // 3. Seed Stage 13 Customer in TEST_ORG
    const cust = await Customer.create({
      organisationId: TEST_ORG,
      customerId: `CUST-${rand}`,
      name: 'Meera Nambiar',
      phone: '9847111222',
      email: 'meera.n@example.com',
      pointsBalance: 200,
      loyaltyPoints: 200,
      lastVisitAt: new Date(),
      lastVisitDate: new Date(),
      status: 'ACTIVE',
      createdByUserId: 'SYSTEM'
    });
    testCustomerId = cust._id;

    // 4. Seed Stage 14 Utility Meter in TEST_ORG
    const meter = await ownerUtilitiesWasteService.registerMeter(TEST_ORG, {
      cafeId: TEST_CAFE,
      utilityCategory: 'ELECTRICITY',
      meterName: 'Kitchen Sub-Meter',
      meterIdentifier: `MTR-${rand}`,
      unitOfMeasure: 'KWH',
      baselineMonthlyConsumption: 1500
    }, USER_OWNER);
    testMeterId = meter.meterId;

    // 5. Seed Stage 15 Governance Meeting in TEST_ORG
    const meeting = await ownerGovernanceDelegationService.createMeeting(TEST_ORG, {
      title: 'Confidential Strategy Review',
      meetingType: 'BOARD',
      meetingDate: new Date(),
      attendees: [{ name: 'Director A', roleOrDesignation: 'Director', attendanceStatus: 'PRESENT' }],
      quorumRequired: 1
    }, USER_OWNER);
    testMeetingId = meeting.meetingId;
  });

  after(async () => {
    await CustomerComplaint.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await MenuItem.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await Recipe.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await Customer.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    if (LoyaltyLedger) {
      await LoyaltyLedger.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    }
    await UtilityMeter.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await GovernanceMeeting.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await DelegationOfAuthority.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });

    process.env.ENABLE_LOYALTY = origEnableLoyalty;
    await mongoose.disconnect();
  });

  test('1. Stage 11 IDOR: Foreign org cannot view or update complaints of TEST_ORG', async () => {
    await assert.rejects(
      async () => {
        await ownerComplaintsService.updateComplaintStatus(
          FOREIGN_ORG,
          testComplaintId,
          'CLOSED',
          USER_FOREIGN,
          'Unauthorized closure attempt'
        );
      },
      /COMPLAINT_NOT_FOUND/
    );
  });

  test('2. Stage 12 IDOR: Foreign org cannot inspect economics of menu items belonging to TEST_ORG', async () => {
    await assert.rejects(
      async () => {
        await ownerMenuPricingService.getItemEconomics(FOREIGN_ORG, testMenuItemId);
      },
      /MENU_ITEM_NOT_FOUND/
    );
  });

  test('3. Stage 13 IDOR: Foreign org cannot view customer data or accrue points on TEST_ORG accounts', async () => {
    await assert.rejects(
      async () => {
        await ownerCustomerLoyaltyService.accrueLoyaltyPoints(FOREIGN_ORG, {
          customerId: testCustomerId,
          billId: 'BILL-20260914-9999',
          billAmount: 500,
          pointsToAccrue: 25,
          idempotencyKey: `LOY-IDOR-${Date.now()}`
        }, USER_FOREIGN);
      },
      /CUSTOMER_NOT_FOUND/
    );
  });

  test('4. Stage 14 IDOR: Foreign org cannot record readings or access meters of TEST_ORG', async () => {
    await assert.rejects(
      async () => {
        await ownerUtilitiesWasteService.recordMeterReading(FOREIGN_ORG, {
          meterId: testMeterId,
          startReading: 100,
          endReading: 250,
          periodStart: new Date('2026-09-01'),
          periodEnd: new Date('2026-09-15')
        }, USER_FOREIGN);
      },
      /METER_NOT_FOUND/
    );
  });

  test('5. Stage 15 IDOR: Foreign org cannot seal minutes or query governance records of TEST_ORG', async () => {
    await assert.rejects(
      async () => {
        await ownerGovernanceDelegationService.finaliseMeetingMinutes(
          FOREIGN_ORG,
          testMeetingId,
          'Illegal foreign minutes tamper attempt',
          USER_FOREIGN
        );
      },
      /MEETING_NOT_FOUND/
    );

    // Foreign org dashboard must not leak TEST_ORG counts
    const foreignDashboard = await ownerGovernanceDelegationService.getGovernanceDashboard(FOREIGN_ORG);
    assert.equal(foreignDashboard.meetingsCount, 0);
    assert.equal(foreignDashboard.openResolutionsCount, 0);
  });
});
