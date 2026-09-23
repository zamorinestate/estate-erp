'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 11: CUSTOMER COMPLAINTS & SERVICE RECOVERY TEST SUITE
 * ============================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const CustomerComplaint = require('../src/models/CustomerComplaint');
const { Bill } = require('../src/models/Bill');
const FoodSafetyIncident = require('../src/models/FoodSafetyIncident');
const CapaRecord = require('../src/models/CapaRecord');
const ownerComplaintsService = require('../src/services/ownerComplaintsService');

describe('STAGE 11 — Customer Complaints & Service Recovery Centre Suite', () => {
  const TEST_ORG = new mongoose.Types.ObjectId();
  const FOREIGN_ORG = new mongoose.Types.ObjectId();
  const TEST_CAFE = new mongoose.Types.ObjectId();
  const FOREIGN_CAFE = new mongoose.Types.ObjectId();

  const USER_OWNER = { userId: 'USR-OWNER-11', email: 'owner11@zamorin.com', role: 'OWNER' };
  const USER_STAFF = { userId: 'USR-STAFF-11', email: 'staff11@zamorin.com', role: 'STAFF' };

  let testBillId;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/zamorin_erp_test';
      await mongoose.connect(uri);
    }

    await CustomerComplaint.deleteMany({ organisationId: { $in: [TEST_ORG.toString(), FOREIGN_ORG.toString()] } });
    await Bill.deleteMany({ organisationId: { $in: [TEST_ORG.toString(), FOREIGN_ORG.toString()] } });

    const uniqueBillCode = 'BILL-20260914-' + Math.floor(Math.random() * 8999 + 1000);
    // Seed a valid Bill in TEST_CAFE
    const bill = await Bill.create({
      billId: uniqueBillCode,
      organisationId: TEST_ORG.toString(),
      cafeId: TEST_CAFE.toString(),
      businessDate: '2026-09-14',
      status: 'COMPLETED',
      billStatus: 'COMPLETED',
      cashierUserId: 'USR-CASHIER-01',
      subtotalPaisa: 50000,
      totalPaisa: 50000,
      totalPayablePaisa: 50000, // ₹500.00
      grandTotal: 500,
      lineItems: [{
        lineItemId: 'LINE-001',
        menuItemId: 'ITEM-001',
        itemNameSnapshot: 'Latte',
        quantity: 1,
        unitPricePaisa: 50000,
        lineSubtotalPaisa: 50000,
        lineTotalPaisa: 50000
      }]
    });
    testBillId = bill._id;
  });

  test('1. Multi-Channel Intake: In-person, phone, and delivery platform intake succeeds', async () => {
    const c1 = await ownerComplaintsService.createComplaint(TEST_ORG, {
      cafeId: TEST_CAFE,
      channel: 'CAFE_IN_PERSON',
      complaintCategory: 'FOOD_QUALITY',
      severity: 'MEDIUM',
      description: 'Latte served lukewarm',
      customerName: 'Aarav Nair',
      customerPhone: '9876543210'
    }, USER_OWNER);

    assert.ok(c1.complaintId);
    assert.equal(c1.status, 'RECEIVED');
    assert.equal(c1.channel, 'CAFE_IN_PERSON');

    const c2 = await ownerComplaintsService.createComplaint(TEST_ORG, {
      cafeId: TEST_CAFE,
      channel: 'DELIVERY_PLATFORM',
      channelReference: 'SWIGGY-ORDER-9982',
      complaintCategory: 'DELIVERY_PACKAGING',
      severity: 'LOW',
      description: 'Packaging seal broken on delivery'
    }, USER_OWNER);

    assert.equal(c2.channel, 'DELIVERY_PLATFORM');
    assert.equal(c2.channelReference, 'SWIGGY-ORDER-9982');
  });

  test('2. Lifecycle Enforcement: Rejects illegal state jumps', async () => {
    const complaint = await ownerComplaintsService.createComplaint(TEST_ORG, {
      cafeId: TEST_CAFE,
      description: 'Cold croissant served',
      complaintCategory: 'FOOD_QUALITY'
    }, USER_OWNER);

    // Illegal jump from RECEIVED directly to RESOLVED must fail
    await assert.rejects(
      async () => {
        await ownerComplaintsService.updateComplaintStatus(TEST_ORG, complaint.complaintId, 'RESOLVED', USER_OWNER);
      },
      (err) => err.message.includes('ILLEGAL_LIFECYCLE_TRANSITION')
    );

    // Valid progression: RECEIVED -> TRIAGED -> ASSIGNED -> INVESTIGATING -> ACTIONED -> CUSTOMER_RESPONSE -> RESOLVED -> CLOSED
    const triaged = await ownerComplaintsService.updateComplaintStatus(TEST_ORG, complaint.complaintId, 'TRIAGED', USER_OWNER);
    assert.equal(triaged.status, 'TRIAGED');

    const assigned = await ownerComplaintsService.updateComplaintStatus(TEST_ORG, complaint.complaintId, 'ASSIGNED', USER_OWNER, 'Allocated to Store Manager');
    assert.equal(assigned.status, 'ASSIGNED');

    const investigating = await ownerComplaintsService.updateComplaintStatus(TEST_ORG, complaint.complaintId, 'INVESTIGATING', USER_OWNER, 'Reviewing prep timestamp');
    assert.equal(investigating.status, 'INVESTIGATING');

    const actioned = await ownerComplaintsService.updateComplaintStatus(TEST_ORG, complaint.complaintId, 'ACTIONED', USER_OWNER, 'Fresh croissant prepared and QA approved');
    assert.equal(actioned.status, 'ACTIONED');

    const customerResponse = await ownerComplaintsService.updateComplaintStatus(TEST_ORG, complaint.complaintId, 'CUSTOMER_RESPONSE', USER_OWNER, 'Customer contacted in dining area');
    assert.equal(customerResponse.status, 'CUSTOMER_RESPONSE');

    const resolved = await ownerComplaintsService.updateComplaintStatus(TEST_ORG, complaint.complaintId, 'RESOLVED', USER_OWNER, 'Replacement accepted with thanks');
    assert.equal(resolved.status, 'RESOLVED');

    const closed = await ownerComplaintsService.updateComplaintStatus(TEST_ORG, complaint.complaintId, 'CLOSED', USER_OWNER, 'Guest fully satisfied');
    assert.equal(closed.status, 'CLOSED');
    assert.ok(closed.resolutionDetails.closedAt);

    // Reopen closed complaint
    const reopened = await ownerComplaintsService.updateComplaintStatus(TEST_ORG, complaint.complaintId, 'REOPENED', USER_OWNER, 'Customer contacted again');
    assert.equal(reopened.status, 'REOPENED');
  });

  test('3. Bill Linkage & Anti-Fabrication: Links real bill, rejects non-existent bill', async () => {
    const validLinked = await ownerComplaintsService.createComplaint(TEST_ORG, {
      cafeId: TEST_CAFE,
      billId: testBillId,
      description: 'Wrong billing on bill #001'
    }, USER_OWNER);

    assert.equal(validLinked.orderLink.billId.toString(), testBillId.toString());

    // Fake billId must fail validation
    const fakeBillId = new mongoose.Types.ObjectId();
    await assert.rejects(
      async () => {
        await ownerComplaintsService.createComplaint(TEST_ORG, {
          cafeId: TEST_CAFE,
          billId: fakeBillId,
          description: 'Fabricated bill test'
        }, USER_OWNER);
      },
      (err) => err.message.includes('BILL_NOT_FOUND_IN_SPECIFIED_CAFE')
    );
  });

  test('4. Canonical Service Recovery Refund: Enforces limits and links canonical bill', async () => {
    const complaint = await ownerComplaintsService.createComplaint(TEST_ORG, {
      cafeId: TEST_CAFE,
      billId: testBillId,
      description: 'Excess salt in meal'
    }, USER_OWNER);

    // Refund exceeding bill total (₹500) must fail
    await assert.rejects(
      async () => {
        await ownerComplaintsService.issueServiceRecoveryRefund(TEST_ORG, complaint.complaintId, {
          amount: 750,
          reason: 'Excessive refund attempt'
        }, USER_OWNER);
      },
      (err) => err.message.includes('REFUND_AMOUNT_EXCEEDS_BILL_TOTAL')
    );

    // Valid partial refund (₹200)
    const refundRes = await ownerComplaintsService.issueServiceRecoveryRefund(TEST_ORG, complaint.complaintId, {
      amount: 200,
      reason: 'Partial refund for salted dish'
    }, USER_OWNER);

    assert.ok(refundRes.refundReference.startsWith('REF-'));
    assert.equal(refundRes.billStatus, 'PARTIALLY_REFUNDED');
    assert.equal(refundRes.complaint.serviceRecovery.refundAmount, 200);
  });

  test('5. Canonical Food-Safety Escalation: Auto-links Stage 01 incident & CAPA', async () => {
    const complaint = await ownerComplaintsService.createComplaint(TEST_ORG, {
      cafeId: TEST_CAFE,
      complaintCategory: 'FOOD_SAFETY_ALLERGEN',
      severity: 'CRITICAL',
      description: 'Severe peanut allergy reaction triggered by undeclared nuts',
      isFoodSafetyIssue: true
    }, USER_OWNER);

    assert.ok(complaint.foodSafetyLink.isFoodSafetyEscalated);
    assert.ok(complaint.foodSafetyLink.incidentId);
    assert.ok(complaint.foodSafetyLink.capaId);
  });

  test('6. DPDP Privacy Masking: Staff sees masked phone/email; Owner sees unmasked', async () => {
    const raw = await ownerComplaintsService.createComplaint(TEST_ORG, {
      cafeId: TEST_CAFE,
      description: 'Masking test complaint',
      customerName: 'Priya Sharma',
      customerPhone: '9876543210',
      customerEmail: 'priya.sharma@example.com'
    }, USER_OWNER);

    // Owner view: unmasked
    assert.equal(raw.customerDetails.phone, '9876543210');
    assert.equal(raw.customerDetails.email, 'priya.sharma@example.com');

    // Staff view: masked
    const staffView = await ownerComplaintsService.getComplaintById(TEST_ORG, raw.complaintId, USER_STAFF);
    assert.ok(staffView.customerDetails.phone.includes('****'));
    assert.ok(staffView.customerDetails.email.includes('***@'));
  });

  test('7. Evidence Attachments & Communication Log', async () => {
    const complaint = await ownerComplaintsService.createComplaint(TEST_ORG, {
      cafeId: TEST_CAFE,
      description: 'Cracked cup handle'
    }, USER_OWNER);

    const withEvidence = await ownerComplaintsService.attachEvidence(TEST_ORG, complaint.complaintId, {
      name: 'broken_cup.jpg',
      url: 'https://storage.zamorin.com/attachments/broken_cup.jpg',
      fileType: 'image/jpeg'
    }, USER_OWNER);
    assert.equal(withEvidence.evidenceAttachments.length, 1);

    const withComm = await ownerComplaintsService.addCommunication(TEST_ORG, complaint.complaintId, {
      channel: 'PHONE',
      direction: 'OUTBOUND',
      summary: 'Spoke with guest, offered replacement coffee voucher'
    }, USER_OWNER);
    assert.equal(withComm.communicationLog.length, 1);
  });

  test('8. Dashboard Metrics: Authoritative bill denominator, zero fake CSAT', async () => {
    const metrics = await ownerComplaintsService.getOwnerDashboardMetrics(TEST_ORG);
    assert.ok(metrics.totalComplaints > 0);
    assert.equal(metrics.authoritativeBillDenominator, 1);
    assert.ok(metrics.complaintRatePerThousandBills !== null);
    assert.equal(metrics.satisfactionScoreStatus, 'UNAVAILABLE / NO_VERIFIED_SURVEY_DATA');
  });

  test('9. Tenant Isolation: Foreign organization denied complaint access', async () => {
    const foreignList = await ownerComplaintsService.listComplaints(FOREIGN_ORG, {}, USER_OWNER);
    assert.equal(foreignList.length, 0);

    const foreignMetrics = await ownerComplaintsService.getOwnerDashboardMetrics(FOREIGN_ORG);
    assert.equal(foreignMetrics.totalComplaints, 0);
    assert.equal(foreignMetrics.authoritativeBillDenominator, 0);
    assert.equal(foreignMetrics.complaintRatePerThousandBills, null); // Strictly null when zero bills
  });

  after(async () => {
    await mongoose.disconnect();
  });
});
