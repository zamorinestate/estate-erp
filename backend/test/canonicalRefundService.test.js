'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — CANONICAL REFUND SERVICE COMPREHENSIVE TEST SUITE
 * ============================================================================
 * Tests canonical shared refund business service covering:
 * - Normal: partial refund, full refund, remaining partial refund
 * - Eligibility: voided bill rejection, already fully refunded, amount > remaining
 * - Authorization & Scoping: wrong org, wrong café, cross-org spoofing, role barrier, delegated limits
 * - Idempotency: identical idempotency key retry returns existing refund without double-crediting
 * - Concurrency: optimistic locking collision detection
 * - Complaint Integration: service recovery delegates to refundService, records canonical refund ID
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { Bill } = require('../src/models/Bill');
const CustomerComplaint = require('../src/models/CustomerComplaint');
const refundService = require('../src/services/refundService');
const ownerComplaintsService = require('../src/services/ownerComplaintsService');

describe('PART A — Canonical Shared Refund Service Suite', () => {
  let mongoServer;
  const ORG_A = new mongoose.Types.ObjectId().toString();
  const ORG_B = new mongoose.Types.ObjectId().toString();
  const CAFE_A = new mongoose.Types.ObjectId().toString();
  const CAFE_B = new mongoose.Types.ObjectId().toString();

  const STAFF_USER = { userId: 'USR-STAFF-01', role: 'STAFF' };
  const MASTER_USER = { userId: 'USR-MASTER-01', role: 'MASTER' };
  const OWNER_USER = { userId: 'USR-OWNER-01', role: 'OWNER' };

  let billSeq = 1000;
  function getNextBillId() {
    billSeq += 1;
    return `BILL-20260914-${billSeq}`;
  }

  async function createTestBill(overrides = {}) {
    const billId = overrides.billId || getNextBillId();
    const totalPaisa = overrides.totalPaisa !== undefined ? overrides.totalPaisa : 50000;
    const subtotalPaisa = overrides.subtotalPaisa !== undefined ? overrides.subtotalPaisa : totalPaisa;
    const refundedTotalPaisa = overrides.refundedTotalPaisa !== undefined ? overrides.refundedTotalPaisa : 0;
    const status = overrides.status || 'COMPLETED';

    return await Bill.create({
      billId,
      organisationId: overrides.organisationId || ORG_A,
      cafeId: overrides.cafeId || CAFE_A,
      businessDate: '2026-09-14',
      cashierUserId: overrides.cashierUserId || 'USR-CASHIER-01',
      status,
      billStatus: status,
      paymentStatus: status === 'REFUNDED' ? 'REFUNDED' : (status === 'PARTIALLY_REFUNDED' ? 'PARTIALLY_REFUNDED' : 'PAID'),
      paymentMethod: overrides.paymentMethod || 'UPI',
      subtotalPaisa,
      totalPaisa,
      totalPayablePaisa: totalPaisa,
      grandTotal: totalPaisa / 100,
      refundedTotalPaisa,
      refunds: overrides.refunds || [],
      lineItems: overrides.lineItems || [{
        lineItemId: 'LINE-001',
        menuItemId: 'ITEM-001',
        itemNameSnapshot: 'Latte',
        quantity: 1,
        unitPricePaisa: totalPaisa,
        lineSubtotalPaisa: totalPaisa,
        lineTotalPaisa: totalPaisa
      }]
    });
  }

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(mongoServer.getUri());
  });

  after(async () => {
    await Bill.deleteMany({ organisationId: { $in: [ORG_A, ORG_B] } });
    await CustomerComplaint.deleteMany({ organisationId: { $in: [ORG_A, ORG_B] } });
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  test('1. Normal Partial Refund: Successfully reduces refundable amount and creates collision-resistant REF ID', async () => {
    const bill = await createTestBill({ totalPaisa: 50000 });

    const res = await refundService.processBillRefund(
      { organisationId: ORG_A, user: MASTER_USER, channel: 'POS' },
      { billId: bill.billId, refundType: 'PARTIAL', amount: 200, reason: 'Customer requested refund for delay' }
    );

    assert.ok(res.refund);
    assert.ok(res.refund.refundId.startsWith('REF-'));
    assert.equal(res.refund.amountPaisa, 20000);
    assert.equal(res.bill.refundedTotalPaisa, 20000);
    assert.equal(res.bill.status, 'PARTIALLY_REFUNDED');
    assert.equal(res.bill.refunds.length, 1);
  });

  test('2. Normal Remaining Partial Refund & Full Refund Transition: Reaches fully refunded status', async () => {
    const bill = await createTestBill({ totalPaisa: 50000, refundedTotalPaisa: 20000 });

    // Remaining is ₹300. Refund ₹300
    const res = await refundService.processBillRefund(
      { organisationId: ORG_A, user: MASTER_USER, channel: 'POS' },
      { billId: bill.billId, refundType: 'PARTIAL', amount: 300, reason: 'Remaining refund processed' }
    );

    assert.equal(res.bill.refundedTotalPaisa, 50000);
    assert.equal(res.bill.status, 'REFUNDED');
    assert.equal(res.bill.paymentStatus, 'REFUNDED');
  });

  test('3. Eligibility Rejection: Already fully refunded bill cannot be refunded further', async () => {
    const bill = await createTestBill({ totalPaisa: 50000, refundedTotalPaisa: 50000, status: 'REFUNDED' });

    await assert.rejects(
      async () => {
        await refundService.processBillRefund(
          { organisationId: ORG_A, user: MASTER_USER, channel: 'POS' },
          { billId: bill.billId, refundType: 'FULL', reason: 'Attempt refund on already refunded bill' }
        );
      },
      (err) => {
        assert.equal(err.code, 'NOTHING_TO_REFUND');
        return true;
      }
    );
  });

  test('4. Eligibility Rejection: Voided bill cannot be refunded', async () => {
    const voidedBill = await createTestBill({ totalPaisa: 30000, status: 'VOIDED' });

    await assert.rejects(
      async () => {
        await refundService.processBillRefund(
          { organisationId: ORG_A, user: MASTER_USER, channel: 'POS' },
          { billId: voidedBill.billId, refundType: 'FULL', reason: 'Attempt to refund voided check' }
        );
      },
      (err) => {
        assert.equal(err.code, 'CANNOT_REFUND_VOIDED');
        return true;
      }
    );
  });

  test('5. Eligibility Rejection: Refund amount greater than remaining refundable amount fails', async () => {
    const bill = await createTestBill({ totalPaisa: 40000, refundedTotalPaisa: 10000 });

    await assert.rejects(
      async () => {
        await refundService.processBillRefund(
          { organisationId: ORG_A, user: MASTER_USER, channel: 'POS' },
          { billId: bill.billId, refundType: 'PARTIAL', amount: 350, reason: 'Over-refund attempt' }
        );
      },
      (err) => {
        assert.equal(err.code, 'INVALID_REFUND_AMOUNT');
        assert.ok(err.message.includes('REFUND_AMOUNT_EXCEEDS_BILL_TOTAL'));
        return true;
      }
    );
  });

  test('6. Security & Scoping: Cross-organisation and cross-café access strictly denied', async () => {
    const bill = await createTestBill({ totalPaisa: 40000, cafeId: CAFE_A });

    // Cross-org lookup returns 404 NOT_FOUND (preventing enumeration)
    await assert.rejects(
      async () => {
        await refundService.processBillRefund(
          { organisationId: ORG_B, user: MASTER_USER, channel: 'POS' },
          { billId: bill.billId, refundType: 'PARTIAL', amount: 100, reason: 'Cross-org attack' }
        );
      },
      (err) => err.code === 'NOT_FOUND'
    );

    // Cross-café mismatch returns 404 NOT_FOUND (preventing cross-cafe resource existence disclosure)
    await assert.rejects(
      async () => {
        await refundService.processBillRefund(
          { organisationId: ORG_A, cafeId: CAFE_B, user: MASTER_USER, channel: 'POS' },
          { billId: bill.billId, refundType: 'PARTIAL', amount: 100, reason: 'Cross-cafe attack' }
        );
      },
      (err) => err.code === 'NOT_FOUND'
    );
  });

  test('7. POS Role Barrier: Owner role forbidden from direct cashier POS refund', async () => {
    const bill = await createTestBill({ totalPaisa: 40000 });

    await assert.rejects(
      async () => {
        await refundService.processBillRefund(
          { organisationId: ORG_A, user: OWNER_USER, channel: 'POS' },
          { billId: bill.billId, refundType: 'PARTIAL', amount: 100, reason: 'Owner direct cashier mutation' }
        );
      },
      (err) => err.code === 'REFUND_FORBIDDEN'
    );
  });

  test('8. Idempotency: Retrying same idempotencyKey returns existing refund without double-crediting', async () => {
    const bill = await createTestBill({ totalPaisa: 40000, refundedTotalPaisa: 0 });
    const key = 'IDEMP-' + Date.now();

    const first = await refundService.processBillRefund(
      { organisationId: ORG_A, user: MASTER_USER, channel: 'POS' },
      { billId: bill.billId, refundType: 'PARTIAL', amount: 100, reason: 'Idempotency test', idempotencyKey: key }
    );
    assert.equal(first.isIdempotentReplay, false);
    assert.equal(first.bill.refundedTotalPaisa, 10000);

    // Duplicate client retry with same key
    const second = await refundService.processBillRefund(
      { organisationId: ORG_A, user: MASTER_USER, channel: 'POS' },
      { billId: bill.billId, refundType: 'PARTIAL', amount: 100, reason: 'Idempotency test', idempotencyKey: key }
    );
    assert.equal(second.isIdempotentReplay, true);
    assert.equal(second.refund.refundId, first.refund.refundId);
    // Refunded total must NOT have increased!
    assert.equal(second.bill.refundedTotalPaisa, 10000);
  });

  test('9. Concurrency & Optimistic Lock Protection: Simultaneous race condition rejects over-allocation', async () => {
    const raceBill = await createTestBill({ totalPaisa: 50000, refundedTotalPaisa: 0 });

    // Fire two simultaneous refunds of ₹400 each (Total ₹800 > ₹500)
    const [p1, p2] = await Promise.allSettled([
      refundService.processBillRefund(
        { organisationId: ORG_A, user: MASTER_USER, channel: 'POS' },
        { billId: raceBill.billId, refundType: 'PARTIAL', amount: 400, reason: 'Concurrent racer 1' }
      ),
      refundService.processBillRefund(
        { organisationId: ORG_A, user: MASTER_USER, channel: 'POS' },
        { billId: raceBill.billId, refundType: 'PARTIAL', amount: 400, reason: 'Concurrent racer 2' }
      )
    ]);

    // One must succeed and one must be rejected (either 409 collision or 400 limit)
    const fulfilled = [p1, p2].filter(r => r.status === 'fulfilled');
    const rejected = [p1, p2].filter(r => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one concurrent refund must succeed');
    assert.equal(rejected.length, 1, 'Competing concurrent refund must be safely rejected');

    const updated = await Bill.findById(raceBill._id);
    assert.equal(updated.refundedTotalPaisa, 40000, 'Bill must strictly have ₹400 refunded, not ₹800');
  });

  test('10. Complaint Service Recovery: Delegates to refundService, records canonical refund reference', async () => {
    const bill = await createTestBill({ totalPaisa: 60000, refundedTotalPaisa: 0 });

    const complaint = await ownerComplaintsService.createComplaint(ORG_A, {
      cafeId: CAFE_A,
      billId: bill._id,
      description: 'Complaint triggering recovery refund'
    }, OWNER_USER);

    // Call service recovery refund
    const result = await ownerComplaintsService.issueServiceRecoveryRefund(ORG_A, complaint.complaintId, {
      amount: 250,
      reason: 'Approved goodwill service recovery'
    }, OWNER_USER);

    assert.ok(result.refundReference.startsWith('REF-'));
    assert.equal(result.billStatus, 'PARTIALLY_REFUNDED');

    // Complaint stores ONLY the canonical refund reference
    const savedComplaint = await CustomerComplaint.findOne({ complaintId: complaint.complaintId, organisationId: ORG_A });
    assert.equal(savedComplaint.serviceRecovery.refundReference, result.refundReference);
    assert.equal(savedComplaint.serviceRecovery.refundAmount, 250);

    // Bill was mutated authoritatively by refundService
    const updatedBill = await Bill.findById(bill._id);
    assert.equal(updatedBill.refundedTotalPaisa, 25000);
    assert.equal(updatedBill.refunds.length, 1);
    assert.equal(updatedBill.refunds[0].refundId, result.refundReference);
    assert.equal(updatedBill.refunds[0].channel, 'COMPLAINT_SERVICE_RECOVERY');
  });
});
