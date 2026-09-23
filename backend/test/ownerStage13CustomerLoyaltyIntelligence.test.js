'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 13: CUSTOMER & LOYALTY INTELLIGENCE TEST SUITE
 * ============================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const CustomerModule = require('../src/models/Customer');
const Customer = CustomerModule.Customer || CustomerModule;
const BillModule = require('../src/models/Bill');
const Bill = BillModule.Bill || BillModule;
const CustomerComplaintModule = require('../src/models/CustomerComplaint');
const CustomerComplaint = CustomerComplaintModule.CustomerComplaint || CustomerComplaintModule;
const LoyaltyLedgerModule = require('../src/models/LoyaltyLedger');
const LoyaltyLedger = LoyaltyLedgerModule.LoyaltyLedger || LoyaltyLedgerModule;
const ownerCustomerLoyaltyService = require('../src/services/ownerCustomerLoyaltyService');

describe('STAGE 13 — Customer & Loyalty Intelligence Suite', () => {
  const TEST_ORG = new mongoose.Types.ObjectId().toString().toUpperCase();
  const FOREIGN_ORG = new mongoose.Types.ObjectId().toString().toUpperCase();
  const TEST_CAFE = new mongoose.Types.ObjectId().toString();

  const USER_OWNER = { userId: 'USR-OWNER-13', email: 'owner13@zamorin.com', role: 'OWNER' };
  const USER_DPO = { userId: 'USR-DPO-01', email: 'dpo@zamorin.com', role: 'DATA_PROTECTION_OFFICER' };

  let testCustomerId;
  let testBillId;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/zamorin_erp_test';
      await mongoose.connect(uri);
    }

    await Customer.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await Bill.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    await CustomerComplaint.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    if (LoyaltyLedger) {
      await LoyaltyLedger.deleteMany({ organisationId: { $in: [TEST_ORG, FOREIGN_ORG] } });
    }

    const rand = Math.floor(Math.random() * 8999999 + 1000000);
    testBillId = `BILL-20260914-${rand}`;

    // 1. Seed customer
    const customer = await Customer.create({
      organisationId: TEST_ORG,
      customerId: `CUST-${rand}`,
      name: 'Aditi Sharma',
      phone: '9876543210',
      email: 'aditi@example.com',
      totalVisits: 3,
      totalSpendPaisa: 150000, // ₹1,500
      pointsBalance: 120,
      loyaltyPoints: 120,
      lastVisitDate: new Date(),
      lastVisitAt: new Date(),
      createdByUserId: 'SYSTEM',
      status: 'ACTIVE'
    });
    testCustomerId = customer._id;

    // Seed regular customer (5+ visits)
    await Customer.create({
      organisationId: TEST_ORG,
      customerId: `CUST-${rand}2`,
      name: 'Rahul Varma',
      phone: '9876543211',
      email: 'rahul@example.com',
      totalVisits: 6,
      totalSpendPaisa: 300000,
      pointsBalance: 250,
      loyaltyPoints: 250,
      lastVisitDate: new Date(),
      lastVisitAt: new Date(),
      createdByUserId: 'SYSTEM',
      status: 'ACTIVE'
    });

    // Seed lapsed customer (> 90 days)
    const ninetyFiveDaysAgo = new Date(Date.now() - 95 * 86400000);
    await Customer.create({
      organisationId: TEST_ORG,
      customerId: `CUST-${rand}3`,
      name: 'Sneha Patel',
      phone: '9876543212',
      email: 'sneha@example.com',
      totalVisits: 2,
      totalSpendPaisa: 90000,
      pointsBalance: 40,
      loyaltyPoints: 40,
      lastVisitDate: ninetyFiveDaysAgo,
      lastVisitAt: ninetyFiveDaysAgo,
      createdByUserId: 'SYSTEM',
      status: 'ACTIVE'
    });

    // Seed bills: 1 customer linked, 2 anonymous POS bills
    await Bill.create({
      billId: testBillId,
      organisationId: TEST_ORG,
      cafeId: TEST_CAFE,
      businessDate: '2026-09-14',
      status: 'COMPLETED',
      billStatus: 'COMPLETED',
      cashierUserId: 'USR-CASHIER-01',
      customerId: testCustomerId.toString(),
      customerPhone: '9876543210',
      subtotalPaisa: 75000,
      totalPaisa: 75000,
      totalPayablePaisa: 75000,
      lineItems: [{
        lineItemId: 'LINE-001',
        menuItemId: 'MENU-101',
        itemNameSnapshot: 'Filter Coffee',
        quantity: 1,
        unitPricePaisa: 75000,
        lineSubtotalPaisa: 75000,
        lineTotalPaisa: 75000
      }]
    });

    await Bill.create({
      billId: `BILL-20260914-${rand + 1}`,
      organisationId: TEST_ORG,
      cafeId: TEST_CAFE,
      businessDate: '2026-09-14',
      status: 'COMPLETED',
      billStatus: 'COMPLETED',
      cashierUserId: 'USR-CASHIER-01',
      customerId: null,
      customerPhone: null,
      subtotalPaisa: 30000,
      totalPaisa: 30000,
      totalPayablePaisa: 30000,
      lineItems: [{
        lineItemId: 'LINE-002',
        menuItemId: 'MENU-101',
        itemNameSnapshot: 'Filter Coffee',
        quantity: 1,
        unitPricePaisa: 30000,
        lineSubtotalPaisa: 30000,
        lineTotalPaisa: 30000
      }]
    });

    await Bill.create({
      billId: `BILL-20260914-${rand + 2}`,
      organisationId: TEST_ORG,
      cafeId: TEST_CAFE,
      businessDate: '2026-09-14',
      status: 'COMPLETED',
      billStatus: 'COMPLETED',
      cashierUserId: 'USR-CASHIER-01',
      customerId: null,
      customerPhone: null,
      subtotalPaisa: 45000,
      totalPaisa: 45000,
      totalPayablePaisa: 45000,
      lineItems: [{
        lineItemId: 'LINE-003',
        menuItemId: 'MENU-101',
        itemNameSnapshot: 'Filter Coffee',
        quantity: 1,
        unitPricePaisa: 45000,
        lineSubtotalPaisa: 45000,
        lineTotalPaisa: 45000
      }]
    });
  });

  test('1. Anonymous Sales Segregation: Distinguishes anonymous POS sales without forced stitching', async () => {
    const analytics = await ownerCustomerLoyaltyService.getCustomerAnalytics(TEST_ORG);
    assert.equal(analytics.totalBillsProcessed, 3);
    assert.equal(analytics.verifiedCustomerBillsCount, 1);
    assert.equal(analytics.anonymousBillsCount, 2);
    assert.ok(analytics.profilingNotice.includes('ZERO_INTRUSIVE_PROFILING'));
  });

  test('2. Versioned Cohort Distribution: Classifies Repeat, Regular, and Lapsed without demographic inference', async () => {
    const cohorts = await ownerCustomerLoyaltyService.getCohortDistribution(TEST_ORG);
    assert.equal(cohorts.cohortRuleVersion, 'V2026.1-STANDARD');
    assert.ok(cohorts.distribution.REPEAT >= 1);
    assert.ok(cohorts.distribution.REGULAR >= 1);
    assert.ok(cohorts.distribution.LAPSED >= 1);
    assert.equal(cohorts.sensitiveTraitInferenceStatus, 'STRICTLY_PROHIBITED');
  });

  test('3. Idempotent Loyalty Points Accrual: Enforces default-off, rejects client overrides, requires server config', async () => {
    // 1. Default-off invariant: Calling accrueLoyaltyPoints without ENABLE_LOYALTY=true is rejected
    process.env.ENABLE_LOYALTY = 'false';
    await assert.rejects(
      async () => {
        await ownerCustomerLoyaltyService.accrueLoyaltyPoints(TEST_ORG, {
          customerId: testCustomerId,
          billId: testBillId,
          billAmount: 750,
          pointsToAccrue: 25
        }, USER_OWNER);
      },
      (err) => err.message.includes('LOYALTY_PROGRAMME_DISABLED')
    );

    // 2. Client-controlled payload bypass attempt is strictly rejected
    await assert.rejects(
      async () => {
        await ownerCustomerLoyaltyService.accrueLoyaltyPoints(TEST_ORG, {
          customerId: testCustomerId,
          billId: testBillId,
          billAmount: 750,
          pointsToAccrue: 25,
          enableLoyaltyOverride: true // Untrusted client payload attempt
        }, USER_OWNER);
      },
      (err) => err.message.includes('CLIENT_LOYALTY_OVERRIDE_PROHIBITED')
    );

    // 3. Approved server-side environment / configuration decision enables loyalty
    process.env.ENABLE_LOYALTY = 'true';
    const rKey = Math.floor(Math.random() * 89999 + 10000);
    const idempotencyKey = `LOY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${rKey}`;
    const accrual1 = await ownerCustomerLoyaltyService.accrueLoyaltyPoints(TEST_ORG, {
      customerId: testCustomerId,
      billId: testBillId,
      billAmount: 750,
      pointsToAccrue: 25,
      idempotencyKey
    }, USER_OWNER);

    assert.equal(accrual1.success, true);
    assert.equal(accrual1.pointsAccrued, 25);
    assert.equal(accrual1.currentBalance, 145); // 120 + 25

    // Second accrual with same billId must be rejected
    await assert.rejects(
      async () => {
        await ownerCustomerLoyaltyService.accrueLoyaltyPoints(TEST_ORG, {
          customerId: testCustomerId,
          billId: testBillId,
          billAmount: 750,
          pointsToAccrue: 25,
          idempotencyKey: `LOY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${rKey + 1}`
        }, USER_OWNER);
      },
      (err) => err.message.includes('Duplicate loyalty accrual rejected')
    );
    process.env.ENABLE_LOYALTY = 'false';
  });

  test('4. Loyalty Points Redemption: Enforces default-off, rejects client overrides, checks balance & idempotency', async () => {
    // 1. Default-off invariant: Calling redeemLoyaltyPoints without ENABLE_LOYALTY=true is rejected
    process.env.ENABLE_LOYALTY = 'false';
    await assert.rejects(
      async () => {
        await ownerCustomerLoyaltyService.redeemLoyaltyPoints(TEST_ORG, {
          customerId: testCustomerId,
          pointsToRedeem: 45
        }, USER_OWNER);
      },
      (err) => err.message.includes('LOYALTY_PROGRAMME_DISABLED')
    );

    // 2. Client-controlled payload bypass attempt is strictly rejected
    await assert.rejects(
      async () => {
        await ownerCustomerLoyaltyService.redeemLoyaltyPoints(TEST_ORG, {
          customerId: testCustomerId,
          pointsToRedeem: 45,
          enableLoyaltyOverride: true // Untrusted client payload attempt
        }, USER_OWNER);
      },
      (err) => err.message.includes('CLIENT_LOYALTY_OVERRIDE_PROHIBITED')
    );

    // 3. Approved server-side configuration enables redemption
    process.env.ENABLE_LOYALTY = 'true';
    const rRedKey = Math.floor(Math.random() * 89999 + 10000);
    const redemptionKey = `LOY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${rRedKey}`;
    const redemption = await ownerCustomerLoyaltyService.redeemLoyaltyPoints(TEST_ORG, {
      customerId: testCustomerId,
      pointsToRedeem: 45,
      idempotencyKey: redemptionKey
    }, USER_OWNER);

    assert.equal(redemption.success, true);
    assert.equal(redemption.pointsRedeemed, 45);
    assert.equal(redemption.remainingBalance, 100); // 145 - 45

    // Duplicate redemption key rejected
    await assert.rejects(
      async () => {
        await ownerCustomerLoyaltyService.redeemLoyaltyPoints(TEST_ORG, {
          customerId: testCustomerId,
          pointsToRedeem: 45,
          idempotencyKey: redemptionKey
        }, USER_OWNER);
      },
      (err) => err.message.includes('Duplicate redemption rejected')
    );

    // Insufficient points rejected
    await assert.rejects(
      async () => {
        await ownerCustomerLoyaltyService.redeemLoyaltyPoints(TEST_ORG, {
          customerId: testCustomerId,
          pointsToRedeem: 500,
          idempotencyKey: `LOY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${rRedKey + 1}`
        }, USER_OWNER);
      },
      (err) => err.message.includes('INSUFFICIENT_LOYALTY_POINTS')
    );
    process.env.ENABLE_LOYALTY = 'false';
  });

  test('5. Estimated Programme Exposure: computes authorised scenario exposure without GL posting or liability recognition', async () => {
    // Computes mathematical simulation exposure from configured assumption (default 0.25 simulation rate)
    const exposure = await ownerCustomerLoyaltyService.calculateLoyaltyExposure(TEST_ORG, 0.25);
    assert.equal(exposure.pointConversionRateRupees, 0.25);
    // Customers: Aditi (100), Rahul (250), Sneha (40) -> Total 390
    assert.equal(exposure.totalOutstandingPoints, 390);
    assert.equal(exposure.estimatedExposureRupees, 97.5); // 390 * 0.25
    assert.equal(exposure.isSimulationOnly, true);
    assert.equal(exposure.glPostingRecognised, false);
    assert.equal(exposure.balanceSheetLiabilityRecognised, false);
    assert.ok(exposure.exposureNotice.includes('ESTIMATED OUTSTANDING LOYALTY VALUE'));
    assert.ok(exposure.exposureNotice.includes('NO AUTOMATIC GL POSTING'));
  });

  test('6. Purpose Limitation: Enforces separation between complaints and marketing consent', async () => {
    await CustomerComplaint.create({
      complaintId: 'CMP-TEST-1301',
      organisationId: TEST_ORG,
      cafeId: TEST_CAFE,
      customerId: testCustomerId.toString(),
      customerName: 'Aditi Sharma',
      customerPhone: '9876543210',
      intakeChannel: 'IN_PERSON',
      complaintCategory: 'SPEED_OF_SERVICE',
      description: 'Slow table service',
      status: 'RECEIVED'
    });

    const purposeCheck = await ownerCustomerLoyaltyService.verifyComplaintMarketingSeparation(TEST_ORG, testCustomerId);
    assert.equal(purposeCheck.isPurposeSeparated, true);
    assert.equal(purposeCheck.complaintDataUsage, 'SERVICE_RECOVERY_ONLY');
    assert.equal(purposeCheck.marketingConsentInherited, false);
  });

  test('7. Privacy-Masked Customer Export: DPDP masking for general staff vs DPO', async () => {
    // Owner export -> Masked
    const ownerExport = await ownerCustomerLoyaltyService.exportCustomerData(TEST_ORG, { requestedByRole: 'OWNER' }, USER_OWNER);
    assert.equal(ownerExport.isContactMasked, true);
    const aditiOwner = ownerExport.records.find(r => r.name === 'Aditi Sharma');
    assert.ok(aditiOwner.phone.includes('****'));
    assert.ok(aditiOwner.email.includes('***@'));

    // DPO export -> Unmasked
    const dpoExport = await ownerCustomerLoyaltyService.exportCustomerData(TEST_ORG, { requestedByRole: 'DATA_PROTECTION_OFFICER' }, USER_DPO);
    assert.equal(dpoExport.isContactMasked, false);
    const aditiDpo = dpoExport.records.find(r => r.name === 'Aditi Sharma');
    assert.equal(aditiDpo.phone, '9876543210');
    assert.equal(aditiDpo.email, 'aditi@example.com');
  });

  test('8. Multi-Tenant IDOR: Foreign organization denied access to loyalty data', async () => {
    process.env.ENABLE_LOYALTY = 'true';
    await assert.rejects(
      async () => {
        await ownerCustomerLoyaltyService.accrueLoyaltyPoints(FOREIGN_ORG, {
          customerId: testCustomerId,
          billId: 'BILL-FOREIGN-99',
          pointsToAccrue: 10
        }, USER_OWNER);
      },
      (err) => err.message.includes('CUSTOMER_NOT_FOUND')
    );
    process.env.ENABLE_LOYALTY = 'false';
  });

  after(async () => {
    await mongoose.disconnect();
  });
});
