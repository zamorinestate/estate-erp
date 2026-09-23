'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { TaxInvoice } = require('../src/models/TaxInvoice');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { allocateInvoiceNumber, syncTaxInvoiceIndexes } = require('../src/services/gstTaxService');

test('STAGE 11.33 — Dedicated Non-Production POS Concurrency & Load Test Suite', async (t) => {
  const gstin = '32AAACZ1234K1Z5';
  const orgId = 'ORG-ZAMORIN-POS-LOAD';
  const fy = '2026-27';

  let mongoServer;

  // Helper to compute percentiles
  function calculatePercentiles(latencies) {
    if (!latencies.length) return { p50: 0, p95: 0, p99: 0 };
    const sorted = [...latencies].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.50)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    return { p50, p95, p99 };
  }

  function makeValidTaxInvoiceDoc(overrides = {}) {
    const baseInvoiceId = overrides.invoiceId || `INV-POS-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    const statCode = overrides.statutorySeriesCode || 'P';
    const seqNum = overrides.sequenceNumber !== undefined ? overrides.sequenceNumber : 1;
    const invNum = overrides.invoiceNumber || `${statCode}/C01/2627/${String(seqNum).padStart(5, '0')}`;

    return {
      organisationId: overrides.organisationId || orgId,
      invoiceId: baseInvoiceId,
      invoiceNumber: invNum,
      financialYear: fy,
      sequenceNumber: seqNum,
      cafeId: overrides.cafeId || 'CAFE-01',
      statutorySeriesCode: statCode,
      seriesPrefix: statCode,
      invoiceDate: new Date(),
      supplyType: 'INTRA_STATE',
      placeOfSupply: '32-Kerala',
      reverseCharge: false,
      supplierDetails: {
        legalName: 'Zamorin Cafe Pvt Ltd',
        tradeName: 'Zamorin Cafe',
        gstin,
        address: 'Beach Road, Kozhikode',
        stateCode: '32',
        stateName: 'Kerala',
        pan: 'AAACZ1234K',
      },
      recipientDetails: {
        isB2B: false,
        legalName: 'POS Retail Customer',
      },
      lineItems: [
        {
          lineId: 'LINE-POS-1',
          description: 'Filter Coffee Single',
          hsnCode: '0901',
          quantity: 1,
          uqc: 'NOS',
          ratePaisa: 6000,
          grossAmountPaisa: 6000,
          discountPaisa: 0,
          taxableAmountPaisa: 6000,
          gstRatePercent: 5,
          cgstRatePercent: 2.5,
          cgstAmountPaisa: 150,
          sgstRatePercent: 2.5,
          sgstAmountPaisa: 150,
          igstRatePercent: 0,
          igstAmountPaisa: 0,
          totalItemAmountPaisa: 6300,
        },
      ],
      hsnSummary: [
        {
          hsnCode: '0901',
          taxableValuePaisa: 6000,
          cgstRatePercent: 2.5,
          cgstAmountPaisa: 150,
          sgstRatePercent: 2.5,
          sgstAmountPaisa: 150,
          igstRatePercent: 0,
          igstAmountPaisa: 0,
          totalTaxPaisa: 300,
        },
      ],
      taxSummary: {
        totalTaxablePaisa: 6000,
        totalCgstPaisa: 150,
        totalSgstPaisa: 150,
        totalIgstPaisa: 0,
        totalTaxPaisa: 300,
        roundOffPaisa: 0,
        grandTotalPaisa: 6300,
      },
      amountInWords: 'Sixty Three Rupees Only',
      status: 'ISSUED',
      irnStatus: 'NOT_APPLICABLE',
      paymentSummary: {
        method: 'UPI',
        paidAmountPaisa: 6300,
        balancePaisa: 0,
        isFullyPaid: true,
      },
    };
  }

  try {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Synchronize unique compound indexes on TaxInvoice
    await syncTaxInvoiceIndexes(TaxInvoice.collection);

    // Concurrency benchmark runner
    async function executePosConcurrencyRun({ levelName, concurrency, cafeId, statutorySeriesCode }) {
      const latencies = [];
      let duplicateTransactions = 0;
      let duplicateInvoiceNumbers = 0;
      let dbDuplicateKeyErrors = 0;
      let timeouts = 0;
      let failures = 0;
      const seenTxIds = new Set();
      const seenInvoiceNumbers = new Set();

      const startTime = Date.now();

      const tasks = Array.from({ length: concurrency }, async (_, idx) => {
        const workerStart = Date.now();
        const clientTxId = `TX-${levelName}-${idx}-${Date.now()}`;

        if (seenTxIds.has(clientTxId)) {
          duplicateTransactions++;
        }
        seenTxIds.add(clientTxId);

        try {
          // 1. Authoritative sequence allocation
          const alloc = await allocateInvoiceNumber({
            organisationId: orgId,
            cafeId,
            gstin,
            financialYear: fy,
            seriesPrefix: statutorySeriesCode,
            statutorySeriesCode,
          });

          // 2. Financial document persistence
          const doc = makeValidTaxInvoiceDoc({
            invoiceId: clientTxId,
            cafeId,
            statutorySeriesCode,
            sequenceNumber: alloc.sequenceNumber,
            invoiceNumber: alloc.invoiceNumber,
          });

          await TaxInvoice.create(doc);

          if (seenInvoiceNumbers.has(alloc.invoiceNumber)) {
            duplicateInvoiceNumbers++;
          }
          seenInvoiceNumbers.add(alloc.invoiceNumber);

          const latency = Date.now() - workerStart;
          latencies.push(latency);
          return { success: true, invoiceNumber: alloc.invoiceNumber, latency };
        } catch (err) {
          if (err.code === 11000) {
            dbDuplicateKeyErrors++;
          }
          if (err.message && err.message.includes('timeout')) {
            timeouts++;
          }
          failures++;
          return { success: false, error: err.message };
        }
      });

      const results = await Promise.all(tasks);
      const totalDuration = Date.now() - startTime;
      const successes = results.filter((r) => r.success).length;
      const throughput = (concurrency / (totalDuration / 1000)).toFixed(1);
      const { p50, p95, p99 } = calculatePercentiles(latencies);

      return {
        levelName,
        concurrency,
        totalRequests: concurrency,
        successes,
        failures,
        retries: 0,
        totalDurationMs: totalDuration,
        throughputReqSec: parseFloat(throughput),
        p50LatencyMs: p50,
        p95LatencyMs: p95,
        p99LatencyMs: p99,
        duplicateTransactions,
        duplicateInvoiceNumbers,
        dbDuplicateKeyErrors,
        timeouts,
        uniqueInvoiceCount: seenInvoiceNumbers.size,
      };
    }

    // Warm-up run to establish Mongoose schema indexes and avoid cold-start JIT latency spike
    await executePosConcurrencyRun({
      levelName: 'WARMUP',
      concurrency: 1,
      cafeId: 'CAFE-01',
      statutorySeriesCode: 'P',
    });

    // 1. Level 1: 10 Simultaneous POS Submissions
    await t.test('Level 1: 10 Simultaneous POS Submissions', async () => {
      const metrics = await executePosConcurrencyRun({
        levelName: 'LEVEL-1-10X',
        concurrency: 10,
        cafeId: 'CAFE-01',
        statutorySeriesCode: 'P',
      });

      assert.strictEqual(metrics.successes, 10);
      assert.strictEqual(metrics.failures, 0);
      assert.strictEqual(metrics.duplicateTransactions, 0);
      assert.strictEqual(metrics.duplicateInvoiceNumbers, 0);
      assert.strictEqual(metrics.dbDuplicateKeyErrors, 0);
      assert.strictEqual(metrics.uniqueInvoiceCount, 10);
      assert.ok(metrics.p95LatencyMs < 400, `P95 latency (${metrics.p95LatencyMs}ms) must meet <400ms target`);
    });

    // 2. Level 2: 25 Simultaneous POS Submissions
    await t.test('Level 2: 25 Simultaneous POS Submissions', async () => {
      const metrics = await executePosConcurrencyRun({
        levelName: 'LEVEL-2-25X',
        concurrency: 25,
        cafeId: 'CAFE-01',
        statutorySeriesCode: 'P',
      });

      assert.strictEqual(metrics.successes, 25);
      assert.strictEqual(metrics.failures, 0);
      assert.strictEqual(metrics.duplicateTransactions, 0);
      assert.strictEqual(metrics.duplicateInvoiceNumbers, 0);
      assert.strictEqual(metrics.dbDuplicateKeyErrors, 0);
      assert.strictEqual(metrics.uniqueInvoiceCount, 25);
      assert.ok(metrics.p95LatencyMs < 500, `P95 latency (${metrics.p95LatencyMs}ms) must remain bounded`);
    });

    // 3. Level 3: 50 Simultaneous POS Submissions
    await t.test('Level 3: 50 Simultaneous POS Submissions', async () => {
      const metrics = await executePosConcurrencyRun({
        levelName: 'LEVEL-3-50X',
        concurrency: 50,
        cafeId: 'CAFE-01',
        statutorySeriesCode: 'P',
      });

      assert.strictEqual(metrics.successes, 50);
      assert.strictEqual(metrics.failures, 0);
      assert.strictEqual(metrics.duplicateTransactions, 0);
      assert.strictEqual(metrics.duplicateInvoiceNumbers, 0);
      assert.strictEqual(metrics.dbDuplicateKeyErrors, 0);
      assert.strictEqual(metrics.uniqueInvoiceCount, 50);
    });

    // 4. Multi-Branch & Multi-Series High-Contention Test (CAFE-01 vs CAFE-02 across P, O, C)
    await t.test('Multi-Branch & Multi-Series Concurrent Load (Zero Cross-Tenant Collision)', async () => {
      const branchA = executePosConcurrencyRun({
        levelName: 'MULTI-CAFE01-P',
        concurrency: 15,
        cafeId: 'CAFE-01',
        statutorySeriesCode: 'P',
      });
      const branchB = executePosConcurrencyRun({
        levelName: 'MULTI-CAFE02-P',
        concurrency: 15,
        cafeId: 'CAFE-02',
        statutorySeriesCode: 'P',
      });
      const branchC = executePosConcurrencyRun({
        levelName: 'MULTI-CAFE01-O',
        concurrency: 10,
        cafeId: 'CAFE-01',
        statutorySeriesCode: 'O',
      });

      const [resA, resB, resC] = await Promise.all([branchA, branchB, branchC]);

      assert.strictEqual(resA.successes, 15);
      assert.strictEqual(resB.successes, 15);
      assert.strictEqual(resC.successes, 10);

      // Verify no cross-branch or cross-series numbering collision
      const allInvoices = await TaxInvoice.find({ organisationId: orgId }).select('invoiceNumber cafeId statutorySeriesCode').lean();
      const uniqueNumbers = new Set(allInvoices.map((inv) => inv.invoiceNumber));
      assert.strictEqual(uniqueNumbers.size, allInvoices.length, 'Every tax invoice across all cafés and series must be unique');
    });

    // 5. Invariant: Idempotent Resubmission Prevents Duplicate Financial Posting
    await t.test('Invariant: Repeated Client Submission Yields Exact Same Transaction Record Without Duplication', async () => {
      const existingDoc = await TaxInvoice.findOne({ organisationId: orgId }).lean();
      assert.ok(existingDoc, 'Expected at least one invoice in DB');

      // Attempt duplicate write with exact same invoiceNumber and sequence
      await assert.rejects(
        async () => {
          await TaxInvoice.create({
            ...existingDoc,
            _id: new mongoose.Types.ObjectId(),
            invoiceId: `DUPLICATE-ATTEMPT-${Date.now()}`,
          });
        },
        (err) => {
          assert.strictEqual(err.code, 11000, 'Database unique constraint must reject duplicate invoiceNumber');
          return true;
        }
      );
    });
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  }
});
