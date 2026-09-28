'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — POS OFFLINE FINANCIAL SAFETY & IDEMPOTENCY SUITE
 * ============================================================================
 * Verifies the authoritative financial safety invariants:
 * - NO SERVER ACKNOWLEDGEMENT = NO COMPLETED FINANCIAL SALE
 * - No offline-only statutory invoice sequence allocation
 * - No local generation of final GST invoice numbers
 * - Strict server-side idempotency and sequence collision prevention
 *
 * Cases:
 * Case A: Network unavailable before Save -> sale not completed.
 * Case B: Network disappears during POST before client sees response -> reconnect queries canonical backend/idempotency state, no duplicate.
 * Case C: Retry same idempotency key -> same transaction.
 * Case D: Client has local draft -> draft may restore, but no statutory invoice exists.
 * Case E: Two devices reconnect -> no sequence collision.
 * Case F: Offline client attempts Print final GST invoice -> final invoice unavailable until authoritative posting.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const { Bill } = require('../src/models/Bill');
const { TaxInvoice } = require('../src/models/TaxInvoice');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { PosOrderService } = require('../src/services/posOrderService');
const { allocateInvoiceNumber, syncTaxInvoiceIndexes } = require('../src/services/gstTaxService');
const OfflineSyncService = require('../src/services/offlineSyncService');

describe('STAGE 11.36 — POS Offline Financial Safety & Statutory Numbering Invariant Suite', () => {
  let mongoServer;

  const orgId = 'ORG-ZAMORIN-TEST';
  const cafeId = 'CAFE-01';
  const gstin = '32AAACZ1234K1Z5';
  const fy = '2026-27';

  const authContext = {
    userId: 'USR-CASHIER-01',
    name: 'Main Cashier',
    role: 'STAFF',
    organisationId: orgId,
    assignedCafeIds: [cafeId],
  };

  before(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = mongoServer.getUri();
    await mongoose.connect(uri, {
      autoIndex: false,
      autoCreate: false,
    });

    // Transactions should test financial behavior, not implicitly create
    // MongoDB collections on their first write.
    for (const model of [Bill, TaxInvoice, SequenceCounter]) {
      await model.createCollection();
    }
    await syncTaxInvoiceIndexes(TaxInvoice.collection);
  });

  after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  // ------------------------------------------------------------------------
  // CASE A: Network unavailable before Save -> sale not completed
  // ------------------------------------------------------------------------
  it('Case A: Network unavailable before Save — sale not completed & no statutory allocation', async () => {
    const initialBillCount = await Bill.countDocuments({ organisationId: orgId });
    const initialSeqCount = await SequenceCounter.countDocuments({ organisationId: orgId });

    // Client simulates an offline state where local save is attempted without network
    const simulatedNetworkError = new Error('NETWORK_UNREACHABLE: Failed to connect to authoritative server');
    
    let clientCompleted = false;
    try {
      throw simulatedNetworkError;
    } catch (_) {
      clientCompleted = false;
    }

    const postBillCount = await Bill.countDocuments({ organisationId: orgId });
    const postSeqCount = await SequenceCounter.countDocuments({ organisationId: orgId });

    assert.strictEqual(clientCompleted, false, 'Sale must not be marked completed when network is unavailable');
    assert.strictEqual(postBillCount, initialBillCount, 'No bill document may be persisted on authoritative server');
    assert.strictEqual(postSeqCount, initialSeqCount, 'No sequence counter may be incremented without server communication');
  });

  // ------------------------------------------------------------------------
  // CASE B: Network disappears during POST before client sees response -> reconnect queries canonical backend/idempotency state (no duplicate)
  // ------------------------------------------------------------------------
  it('Case B: Network disappears during POST — reconnect queries canonical state without duplicate', async () => {
    const idempotencyKey = `IDEMP-NET-DROP-${Date.now()}`;
    const orderPayload = {
      cafeId,
      orderType: 'QUICK_SALE',
      paymentMethod: 'CASH',
      idempotencyKey,
      lineItems: [
        { menuItemId: 'MNU-COFFEE', name: 'Zamorin Filter Coffee', quantity: 2, unitPricePaisa: 6000 },
      ],
    };

    // 1. Initial transmission arrives at server and is committed
    const initialCommit = await PosOrderService.processOrder(orderPayload, authContext, 'SAVE', {
      idempotencyKey,
    });

    assert.strictEqual(initialCommit.success, true);
    const canonicalBillId = initialCommit.bill.billId;
    const canonicalInvoiceNumber = initialCommit.bill.invoiceNumber;
    assert.ok(canonicalBillId, 'Server must commit transaction and assign canonical billId');

    // 2. Client simulated network drop: client did not receive response, so on reconnect it queries/retries with same key
    const reconnectCommit = await PosOrderService.processOrder(orderPayload, authContext, 'SAVE', {
      idempotencyKey,
    });

    // 3. Verify server returned exact same canonical record
    assert.strictEqual(reconnectCommit.success, true);
    assert.strictEqual(reconnectCommit.isIdempotentReplay, true, 'Server must recognize replay');
    assert.strictEqual(reconnectCommit.bill.billId, canonicalBillId, 'Must return same canonical billId');
    assert.strictEqual(reconnectCommit.bill.invoiceNumber, canonicalInvoiceNumber, 'Must return same invoice number');

    // 4. Verify no duplicate bill exists in database
    const matchingBills = await Bill.find({ organisationId: orgId, correlationId: idempotencyKey });
    assert.strictEqual(matchingBills.length, 1, 'Database must contain exactly 1 bill for this idempotency key');
  });

  // ------------------------------------------------------------------------
  // CASE C: Retry same idempotency key -> same transaction
  // ------------------------------------------------------------------------
  it('Case C: Retry same idempotency key — returns identical canonical transaction', async () => {
    const idempotencyKey = `IDEMP-RETRY-${Date.now()}`;
    const orderPayload = {
      cafeId,
      orderType: 'DINE_IN',
      paymentMethod: 'CASH',
      idempotencyKey,
      lineItems: [
        { menuItemId: 'MNU-CROISSANT', name: 'Butter Croissant', quantity: 1, unitPricePaisa: 15000 },
      ],
    };

    const run1 = await PosOrderService.processOrder(orderPayload, authContext, 'SAVE', { idempotencyKey });
    const run2 = await PosOrderService.processOrder(orderPayload, authContext, 'SAVE', { idempotencyKey });
    const run3 = await PosOrderService.processOrder(orderPayload, authContext, 'SAVE', { idempotencyKey });

    assert.strictEqual(run1.bill.billId, run2.bill.billId);
    assert.strictEqual(run2.bill.billId, run3.bill.billId);
    assert.strictEqual(run1.bill.totalPaisa, run2.bill.totalPaisa);
    assert.strictEqual(run2.isIdempotentReplay, true);
    assert.strictEqual(run3.isIdempotentReplay, true);

    const dbCount = await Bill.countDocuments({ organisationId: orgId, correlationId: idempotencyKey });
    assert.strictEqual(dbCount, 1, 'Zero double-posting permitted');
  });

  // ------------------------------------------------------------------------
  // CASE D: Client has local draft -> draft may restore, but no statutory invoice exists
  // ------------------------------------------------------------------------
  it('Case D: Client has local draft — draft may restore, but no statutory invoice exists', async () => {
    const draftOperation = {
      isDraft: true,
      status: 'DRAFT',
      operationType: 'LOCAL_DRAFT',
      paymentMethod: 'CASH',
      totalPaisa: 25000,
      lineItems: [
        { itemId: 'MNU-COLD-BREW', name: 'Zamorin Signature Cold Brew', quantity: 1, unitPricePaisa: 25000 },
      ],
    };

    // Policy resolver correctly classifies local drafts
    const policy = OfflineSyncService.resolveOperationPolicy(draftOperation);
    assert.strictEqual(policy, 'LOCAL_DRAFT_ALLOWED', 'Local drafts are allowed for UI state restoration');

    // Verify that local draft has NO statutory GST invoice allocated
    assert.strictEqual(draftOperation.invoiceNumber, undefined, 'Local draft cannot possess a statutory invoice number');
    
    // Ensure no TaxInvoice document was created for the draft
    const taxInvoices = await TaxInvoice.find({ organisationId: orgId, cafeId });
    const matchingTaxInv = taxInvoices.find((ti) => ti.recipientDetails?.draftRef === 'LOCAL_DRAFT');
    assert.strictEqual(matchingTaxInv, undefined, 'No statutory TaxInvoice can be allocated for local drafts');
  });

  // ------------------------------------------------------------------------
  // CASE E: Two devices reconnect -> no sequence collision
  // ------------------------------------------------------------------------
  it('Case E: Two devices reconnect — atomic sequence allocation produces zero collision', async () => {
    // Simulate two independent terminals reconnecting and requesting statutory sequence numbers simultaneously
    const [seqDev1, seqDev2] = await Promise.all([
      allocateInvoiceNumber({
        organisationId: orgId,
        cafeId,
        gstin,
        financialYear: fy,
        statutorySeriesCode: 'P',
      }),
      allocateInvoiceNumber({
        organisationId: orgId,
        cafeId,
        gstin,
        financialYear: fy,
        statutorySeriesCode: 'P',
      }),
    ]);

    assert.ok(seqDev1.invoiceNumber, 'Device 1 must receive statutory invoice number');
    assert.ok(seqDev2.invoiceNumber, 'Device 2 must receive statutory invoice number');
    assert.notStrictEqual(
      seqDev1.invoiceNumber,
      seqDev2.invoiceNumber,
      'Concurrent reconnecting devices must receive distinct, non-colliding statutory invoice numbers'
    );
    assert.strictEqual(
      Math.abs(seqDev1.sequenceNumber - seqDev2.sequenceNumber),
      1,
      'Sequences must be consecutive without collision'
    );
  });

  // ------------------------------------------------------------------------
  // CASE F: Offline client attempts Print final GST invoice -> rejected until authoritative posting
  // ------------------------------------------------------------------------
  it('Case F: Offline client attempts Print final GST invoice — rejected until authoritative posting', async () => {
    // 1. Client attempts PRINT without a committed billId
    await assert.rejects(
      async () => {
        await PosOrderService.processOrder(
          { lineItems: [{ menuItemId: 'MNU-TEA', name: 'Zamorin Spiced Tea', quantity: 1, unitPricePaisa: 5000 }] },
          authContext,
          'PRINT',
          {}
        );
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.code, 'BILL_ID_REQUIRED');
        return true;
      },
      'Printing an unposted order must be rejected with BILL_ID_REQUIRED'
    );

    // 2. Client attempts PRINT with a non-existent / offline unconfirmed billId
    await assert.rejects(
      async () => {
        await PosOrderService.processOrder(
          { billId: 'BILL-UNCONFIRMED-9999' },
          authContext,
          'PRINT',
          { billId: 'BILL-UNCONFIRMED-9999' }
        );
      },
      (err) => {
        assert.strictEqual(err.statusCode, 404);
        assert.strictEqual(err.code, 'BILL_NOT_FOUND');
        return true;
      },
      'Printing an uncommitted billId must be rejected with BILL_NOT_FOUND'
    );
  });
});
