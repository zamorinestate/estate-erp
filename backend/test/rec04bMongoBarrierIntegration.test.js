'use strict';

/**
 * REC-04B — REAL MONGODB DISTRIBUTED BARRIER INTEGRATION
 *
 * This suite complements the service-level mock/fault-injection suite by
 * exercising the actual MongoDB indexes and immutable checkout identity against
 * a replica-set topology. It proves that correctness does not depend on the
 * local Node process lock map.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const { Bill } = require('../src/models/Bill');
const { IdempotencyRecord } = require('../src/models/IdempotencyRecord');

describe('REC-04B — Real MongoDB distributed idempotency barrier', () => {
  let replSet;

  const organisationId = 'ORG-REC04B-INTEGRATION';
  const cafeId = 'ZC-REC04B-DB';

  before(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });

    await mongoose.connect(replSet.getUri(), {
      dbName: 'rec04b_distributed_barrier',
      autoIndex: false,
      autoCreate: false,
    });

    for (const model of [Bill, IdempotencyRecord]) {
      try {
        await model.createCollection();
      } catch (err) {
        if (err?.codeName !== 'NamespaceExists' && err?.code !== 48) throw err;
      }
      await model.syncIndexes();
    }
  });

  after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (replSet) {
      await replSet.stop();
    }
  });

  it('runs against a replica set and installs the authoritative uniqueness indexes', async () => {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    assert.ok(hello.setName, 'REC-04B integration must execute against a replica-set topology');

    const idempotencyIndexes = await IdempotencyRecord.collection.indexes();
    assert.ok(
      idempotencyIndexes.some((idx) =>
        idx.unique === true &&
        idx.key?.organisationId === 1 &&
        idx.key?.cafeId === 1 &&
        idx.key?.idempotencyKey === 1
      ),
      'MongoDB must enforce organisation+cafe+idempotencyKey uniqueness'
    );

    const billIndexes = await Bill.collection.indexes();
    assert.ok(
      billIndexes.some((idx) =>
        idx.name === 'org_cafe_sale_attempt_unique' &&
        idx.unique === true &&
        idx.key?.organisationId === 1 &&
        idx.key?.cafeId === 1 &&
        idx.key?.saleAttemptId === 1
      ),
      'MongoDB must enforce the canonical saleAttemptId uniqueness barrier'
    );
  });

  it('allows exactly one concurrent idempotency-key claimant at the database layer', async () => {
    const idempotencyKey = 'IDEM-REC04B-REAL-RACE-001';

    const attempts = await Promise.allSettled([
      IdempotencyRecord.create({
        organisationId,
        cafeId,
        idempotencyKey,
        requestFingerprint: 'fingerprint-worker-a',
        status: 'PROCESSING',
        saleAttemptId: 'ATT-REC04B-IDEM-001',
      }),
      IdempotencyRecord.create({
        organisationId,
        cafeId,
        idempotencyKey,
        requestFingerprint: 'fingerprint-worker-b',
        status: 'PROCESSING',
        saleAttemptId: 'ATT-REC04B-IDEM-002',
      }),
    ]);

    const fulfilled = attempts.filter((result) => result.status === 'fulfilled');
    const rejected = attempts.filter((result) => result.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one worker may claim a given idempotency key');
    assert.equal(rejected.length, 1, 'The competing worker must be rejected by MongoDB');
    assert.equal(rejected[0].reason?.code, 11000, 'The database barrier must surface duplicate-key E11000');
    assert.equal(
      await IdempotencyRecord.countDocuments({ organisationId, cafeId, idempotencyKey }),
      1,
      'Exactly one durable idempotency record may exist after a concurrent race'
    );
  });

  it('allows exactly one concurrent bill for the same saleAttemptId', async () => {
    const saleAttemptId = 'ATT-REC04B-REAL-BILL-RACE-001';

    const makeBill = (billId) => ({
      billId,
      invoiceNumber: `INV-${billId}`,
      organisationId,
      cafeId,
      businessDate: '2026-09-28',
      orderType: 'QUICK_SALE',
      serviceMode: 'QUICK_SALE',
      lineItems: [{
        menuItemId: 'MNU-REC04B-COFFEE',
        itemNameSnapshot: 'REC-04B Integration Coffee',
        quantity: 1,
        unitPricePaisa: 10000,
        taxRatePercent: 5,
        taxClassification: 'GST_5',
        discountPaisa: 0,
        lineSubtotalPaisa: 10000,
        cgstPaisa: 250,
        sgstPaisa: 250,
        igstPaisa: 0,
        lineTotalPaisa: 10500,
      }],
      subtotalPaisa: 10000,
      taxPaisa: 500,
      cgstPaisa: 250,
      sgstPaisa: 250,
      igstPaisa: 0,
      preRoundingTotalPaisa: 10500,
      roundOffPaisa: 0,
      totalPaisa: 10500,
      paymentStatus: 'PAID',
      paymentMethod: 'CASH',
      status: 'COMPLETED',
      cashierUserId: 'EMP-REC04B-DB',
      correlationId: 'IDEM-REC04B-REAL-BILL-RACE-001',
      saleAttemptId,
    });

    const attempts = await Promise.allSettled([
      Bill.create(makeBill('BILL-20260928-9401')),
      Bill.create(makeBill('BILL-20260928-9402')),
    ]);

    const fulfilled = attempts.filter((result) => result.status === 'fulfilled');
    const rejected = attempts.filter((result) => result.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one bill may win the same saleAttemptId race');
    assert.equal(rejected.length, 1, 'The competing bill must be rejected by MongoDB');
    assert.equal(rejected[0].reason?.code, 11000, 'The saleAttemptId barrier must surface duplicate-key E11000');
    assert.equal(
      await Bill.countDocuments({ organisationId, cafeId, saleAttemptId }),
      1,
      'The database must contain exactly one bill for the checkout identity'
    );
  });

  it('keeps saleAttemptId immutable after the bill has been persisted', async () => {
    const bill = await Bill.create({
      billId: 'BILL-20260928-9403',
      invoiceNumber: 'INV-BILL-20260928-9403',
      organisationId,
      cafeId,
      businessDate: '2026-09-28',
      orderType: 'QUICK_SALE',
      serviceMode: 'QUICK_SALE',
      lineItems: [{
        menuItemId: 'MNU-REC04B-TEA',
        itemNameSnapshot: 'REC-04B Integration Tea',
        quantity: 1,
        unitPricePaisa: 5000,
        taxRatePercent: 5,
        taxClassification: 'GST_5',
        discountPaisa: 0,
        lineSubtotalPaisa: 5000,
        cgstPaisa: 125,
        sgstPaisa: 125,
        igstPaisa: 0,
        lineTotalPaisa: 5250,
      }],
      subtotalPaisa: 5000,
      taxPaisa: 250,
      cgstPaisa: 125,
      sgstPaisa: 125,
      igstPaisa: 0,
      preRoundingTotalPaisa: 5250,
      roundOffPaisa: 0,
      totalPaisa: 5250,
      paymentStatus: 'PAID',
      paymentMethod: 'CASH',
      status: 'COMPLETED',
      cashierUserId: 'EMP-REC04B-DB',
      correlationId: 'IDEM-REC04B-IMMUTABLE-001',
      saleAttemptId: 'ATT-REC04B-IMMUTABLE-001',
    });

    bill.saleAttemptId = 'ATT-REC04B-TAMPERED-999';
    await bill.save();

    const reloaded = await Bill.findOne({ billId: 'BILL-20260928-9403' }).lean();
    assert.equal(
      reloaded.saleAttemptId,
      'ATT-REC04B-IMMUTABLE-001',
      'Persisted checkout identity must not be mutable after creation'
    );
  });
});
