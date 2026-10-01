'use strict';

/**
 * STAGE 10: REPORTING + ANALYTICS + DASHBOARDS MASTER TEST SUITE
 *
 * Verifies:
 *  1. Mathematical Consistency: POS Bill transactions match Executive KPI aggregates (Net, Gross, Tax, AOV, Covers).
 *  2. Menu Engineering & BCG Matrix: Correct categorization (Stars, Plowhorses, Puzzles, Dogs) and Universal Sl. No.
 *  3. Hourly Sales Heatmap: Exact 24-hour distribution, IST hour parsing, and normalized 0-100 intensity scoring.
 *  4. Food Cost & Wastage Shrinkage: Theoretical BOM cost vs actual wastage variance and health status flagging.
 *  5. Consolidated Multi-Café Benchmarks: Portfolio ranking by Net Sales with ranks and Sl. No.
 *  6. Multi-Tenant RBAC Boundary: Café Admin prevented from accessing other café analytics (403 CROSS_CAFE_ACCESS_DENIED).
 *  7. Non-Management Role Rejection: Staff / Cashier roles rejected with 403 ANALYTICS_FORBIDDEN.
 *  8. Universal Export Integration: Executive summary export to standard PDF (%PDF-1.4) and Excel (.xlsx PK signature).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const analyticsBiService = require('../src/services/analyticsBiService');
const analyticsController = require('../src/controllers/analyticsController');
const { Bill } = require('../src/models/Bill');
const { Cafe } = require('../src/models/Cafe');
const { WastageRecord } = require('../src/models/WastageRecord');

test('STAGE 10 — Executive Analytics, BCG Matrix & BI Dashboard Master Suite', async (t) => {
  const orgId = 'ORG-ZAMORIN';
  const cafeOne = 'ZC-0001';
  const cafeTwo = 'ZC-0002';

  // Seed sample bills
  const sampleBills = [
    {
      billId: 'BILL-001',
      organisationId: orgId,
      cafeId: cafeOne,
      status: 'COMPLETED',
      subtotalPaisa: 50000, // ₹500.00
      totalPaisa: 52500,    // ₹525.00
      taxPaisa: 2500,       // ₹25.00
      discountPaisa: 0,
      paymentMethod: 'UPI',
      coversCount: 2,
      createdAt: new Date('2026-09-13T04:30:00.000Z'), // 10:00 AM IST
      lineItems: [
        { itemCode: 'ITEM-ESP-01', description: 'Double Espresso', quantity: 2, ratePaisa: 15000, totalItemAmountPaisa: 30000 },
        { itemCode: 'ITEM-CRS-01', description: 'Butter Croissant', quantity: 1, ratePaisa: 20000, totalItemAmountPaisa: 20000 },
      ],
    },
    {
      billId: 'BILL-002',
      organisationId: orgId,
      cafeId: cafeOne,
      status: 'PAID',
      subtotalPaisa: 30000, // ₹300.00
      totalPaisa: 31500,    // ₹315.00
      taxPaisa: 1500,       // ₹15.00
      discountPaisa: 0,
      paymentMethod: 'CASH',
      coversCount: 1,
      createdAt: new Date('2026-09-13T04:45:00.000Z'), // 10:15 AM IST
      lineItems: [
        { itemCode: 'ITEM-ESP-01', description: 'Double Espresso', quantity: 2, ratePaisa: 15000, totalItemAmountPaisa: 30000 },
      ],
    },
    {
      billId: 'BILL-003',
      organisationId: orgId,
      cafeId: cafeOne,
      status: 'SETTLED',
      subtotalPaisa: 40000, // ₹400.00
      totalPaisa: 42000,    // ₹420.00
      taxPaisa: 2000,       // ₹20.00
      discountPaisa: 0,
      paymentMethod: 'CARD',
      coversCount: 3,
      createdAt: new Date('2026-09-13T09:30:00.000Z'), // 15:00 (3 PM IST)
      lineItems: [
        { itemCode: 'ITEM-SND-01', description: 'Paneer Panini', quantity: 2, ratePaisa: 20000, totalItemAmountPaisa: 40000 },
      ],
    },
    // Bill for cafeTwo
    {
      billId: 'BILL-004',
      organisationId: orgId,
      cafeId: cafeTwo,
      status: 'PAID',
      subtotalPaisa: 200000, // ₹2,000.00
      totalPaisa: 210000,    // ₹2,100.00
      taxPaisa: 10000,       // ₹100.00
      discountPaisa: 0,
      paymentMethod: 'UPI',
      coversCount: 5,
      createdAt: new Date('2026-09-13T05:00:00.000Z'), // 10:30 AM IST
      lineItems: [
        { itemCode: 'ITEM-ESP-01', description: 'Double Espresso', quantity: 10, ratePaisa: 15000, totalItemAmountPaisa: 150000 },
      ],
    },
  ];

  // Seed sample cafes
  const sampleCafes = [
    { cafeId: cafeOne, tradeName: 'Zamorin Koramangala', status: 'ACTIVE' },
    { cafeId: cafeTwo, tradeName: 'Zamorin Indiranagar', status: 'ACTIVE' },
  ];

  // Seed sample wastage
  const sampleWastage = [
    { organisationId: orgId, cafeId: cafeOne, costPaisa: 3500, createdAt: new Date('2026-09-13T06:00:00.000Z') }, // ₹35.00
  ];

  // Mock Bill.find
  t.mock.method(Bill, 'find', (filter = {}) => {
    let list = [...sampleBills];
    if (filter.organisationId) list = list.filter(b => b.organisationId === filter.organisationId);
    if (filter.cafeId && filter.cafeId !== 'ALL') list = list.filter(b => b.cafeId === filter.cafeId);
    return {
      lean: async () => list,
      then: (resolve, reject) => Promise.resolve(list).then(resolve, reject),
    };
  });

  // Mock Cafe.find
  t.mock.method(Cafe, 'find', (filter = {}) => {
    let list = [...sampleCafes];
    return {
      lean: async () => list,
      then: (resolve, reject) => Promise.resolve(list).then(resolve, reject),
    };
  });

  // Mock WastageRecord.find
  t.mock.method(WastageRecord, 'find', (filter = {}) => {
    let list = [...sampleWastage];
    if (filter.cafeId && filter.cafeId !== 'ALL') list = list.filter(w => w.cafeId === filter.cafeId);
    return {
      lean: async () => list,
      then: (resolve, reject) => Promise.resolve(list).then(resolve, reject),
    };
  });

  // ── TEST 1: Executive KPI Mathematical Consistency ────────────────────────
  await t.test('1. Executive KPI calculations strictly match POS Bill transactions', async () => {
    const summary = await analyticsBiService.getExecutiveSummary({
      organisationId: orgId,
      cafeId: cafeOne,
      period: 'TODAY',
    });

    assert.ok(summary, 'Summary object must exist');
    assert.equal(summary.kpis.totalOrders, 3, 'Should have 3 orders for cafeOne');

    // Net sales: 52500 + 31500 + 42000 = 126000 paisa (₹1,260.00)
    assert.equal(summary.kpis.totalNetSalesPaisa, 126000);
    assert.equal(summary.kpis.totalNetSalesRupees, '1260.00');

    // Taxes: 2500 + 1500 + 2000 = 6000 paisa (₹60.00)
    assert.equal(summary.kpis.totalTaxPaisa, 6000);

    // Covers: 2 + 1 + 3 = 6
    assert.equal(summary.kpis.totalCovers, 6);

    // AOV: 126000 / 3 = 42000 paisa (₹420.00)
    assert.equal(summary.kpis.averageOrderValuePaisa, 42000);
    assert.equal(summary.kpis.averageOrderValueRupees, '420.00');

    // Tenders: Cash 31500, UPI 52500, Card 42000
    assert.equal(summary.tenders.cashPaisa, 31500);
    assert.equal(summary.tenders.upiPaisa, 52500);
    assert.equal(summary.tenders.cardPaisa, 42000);
    assert.equal(summary.tenders.cashPaisa + summary.tenders.upiPaisa + summary.tenders.cardPaisa, 126000);
  });

  // ── TEST 2: BCG Matrix Menu Engineering ───────────────────────────────────
  await t.test('2. Menu Engineering correctly classifies BCG Matrix & assigns Universal Sl. No.', async () => {
    const bcg = await analyticsBiService.getMenuEngineering({
      organisationId: orgId,
      cafeId: cafeOne,
      period: 'TODAY',
    });

    assert.ok(bcg.matrix, 'BCG matrix must exist');
    assert.ok(Array.isArray(bcg.allRankedItems), 'allRankedItems must be an array');
    assert.equal(bcg.totalItemsSold, 7, 'Total items sold: 2+1+2+2 = 7');

    // Check Universal Sl. No. strictly 1-indexed and sequential (Rule X.04)
    bcg.allRankedItems.forEach((it, idx) => {
      assert.equal(it.slNo, idx + 1, `Item at index ${idx} must have slNo ${idx + 1}`);
      assert.ok(['STAR', 'PLOWHORSE', 'PUZZLE', 'DOG'].includes(it.classification), 'Must have valid BCG classification');
    });

    // Double Espresso has 4 sold (highest volume) and healthy margin -> STAR
    const espresso = bcg.allRankedItems.find(i => i.itemCode === 'ITEM-ESP-01');
    assert.ok(espresso, 'Espresso must be present');
    assert.equal(espresso.quantitySold, 4);
    assert.equal(espresso.classification, 'STAR');
  });

  // ── TEST 3: Hourly Sales Heatmap ──────────────────────────────────────────
  await t.test('3. Hourly Heatmap generates 24 slots with accurate IST hour distribution', async () => {
    const heatmap = await analyticsBiService.getHourlyHeatmap({
      organisationId: orgId,
      cafeId: cafeOne,
      period: 'TODAY',
    });

    assert.equal(heatmap.hourlySlots.length, 24, 'Must have exactly 24 hourly slots');

    // Slot 10 (10:00 - 10:59 AM IST) had 2 orders (BILL-001 at 10:00, BILL-002 at 10:15)
    const slot10 = heatmap.hourlySlots[10];
    assert.equal(slot10.orderCount, 2, 'Hour 10 should have 2 orders');
    assert.equal(slot10.revenuePaisa, 84000, 'Hour 10 revenue: 52500 + 31500 = 84000');
    assert.equal(slot10.intensityScore, 100, 'Hour 10 is peak hour with intensity 100');

    // Slot 15 (15:00 - 15:59 IST) had 1 order (BILL-003 at 15:00)
    const slot15 = heatmap.hourlySlots[15];
    assert.equal(slot15.orderCount, 1, 'Hour 15 should have 1 order');
    assert.equal(slot15.intensityScore, 50, 'Hour 15 has 1/2 intensity = 50');

    // Unused slot (e.g. 02:00 AM)
    assert.equal(heatmap.hourlySlots[2].orderCount, 0);
    assert.equal(heatmap.hourlySlots[2].intensityScore, 0);
  });

  // ── TEST 4: Food Cost & Wastage Shrinkage ──────────────────────────────────
  await t.test('4. Food cost analysis tracks theoretical vs actual and flags variance', async () => {
    const foodCost = await analyticsBiService.getFoodCostAndWastage({
      organisationId: orgId,
      cafeId: cafeOne,
      period: 'TODAY',
    });

    assert.equal(foodCost.totalFoodSalesPaisa, 126000);
    // Theoretical 29.2% of 126000 = 36792 paisa
    assert.equal(foodCost.theoreticalCostPaisa, 36792);
    // Actual = theoretical + wastage (3500) = 40292 paisa
    assert.equal(foodCost.wastageShrinkageCostPaisa, 3500);
    assert.equal(foodCost.actualCostPaisa, 40292);
    assert.equal(foodCost.variancePaisa, 3500);
    // 40292 / 126000 = 31.98% <= 32% => HEALTHY_TARGET
    assert.equal(foodCost.status, 'HEALTHY_TARGET');
  });

  // ── TEST 5: Consolidated Multi-Café Benchmarks ─────────────────────────────
  await t.test('5. Multi-café consolidated benchmarks ranks stores by Net Sales descending', async () => {
    const benchmarks = await analyticsBiService.getConsolidatedBenchmarks({
      organisationId: orgId,
      period: 'TODAY',
    });

    assert.equal(benchmarks.totalCafes, 2);
    assert.equal(benchmarks.benchmarks.length, 2);

    // Cafe Two had 210000 paisa, Cafe One had 126000 paisa
    // Rank 1 must be Cafe Two
    const rank1 = benchmarks.benchmarks[0];
    const rank2 = benchmarks.benchmarks[1];

    assert.equal(rank1.cafeId, cafeTwo);
    assert.equal(rank1.rank, 1);
    assert.equal(rank1.totalNetSalesPaisa, 210000);

    assert.equal(rank2.cafeId, cafeOne);
    assert.equal(rank2.rank, 2);
    assert.equal(rank2.totalNetSalesPaisa, 126000);
  });

  // ── TEST 6: Multi-Tenant RBAC Boundary (Cross-Café Prevention) ─────────────
  await t.test('6. Café Admin is strictly blocked from accessing other café analytics (403)', async () => {
    const adminUser = {
      role: 'CAFE_ADMIN',
      primaryCafeId: cafeOne,
      assignedCafeIds: [cafeOne],
      organisationId: orgId,
    };

    // Calling for cafeTwo should throw CROSS_CAFE_ACCESS_DENIED
    let thrownError = null;
    const req = {
      auth: adminUser,
      params: { cafeId: cafeTwo },
      query: {},
    };
    const res = {
      status: (c) => ({ json: (d) => ({ statusCode: c, data: d }) }),
    };

    try {
      await analyticsController.getExecutiveSummary(req, res, (err) => {
        if (err) throw err;
      });
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError, 'Must throw an error for cross-café access');
    assert.equal(thrownError.statusCode, 403);
    assert.equal(thrownError.code || thrownError.errorCode, 'CROSS_CAFE_ACCESS_DENIED');
  });

  // ── TEST 7: Role Exclusion (Staff Role Forbidden) ──────────────────────────
  await t.test('7. Staff / Cashier roles are denied access to analytics endpoints (403)', async () => {
    const staffUser = {
      role: 'STAFF',
      primaryCafeId: cafeOne,
      organisationId: orgId,
    };

    let thrownError = null;
    const req = {
      auth: staffUser,
      params: { cafeId: cafeOne },
      query: {},
    };
    const res = {};

    try {
      await analyticsController.getExecutiveSummary(req, res, (err) => {
        if (err) throw err;
      });
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError, 'Must reject staff user');
    assert.equal(thrownError.statusCode, 403);
    assert.equal(thrownError.code || thrownError.errorCode, 'ANALYTICS_FORBIDDEN');
  });

  // ── TEST 8: Universal Export Generation (PDF and XLSX) ────────────────────
  await t.test('8. Universal Export returns valid PDF (%PDF-1.4) and Excel binary buffers', async () => {
    const masterUser = {
      role: 'MASTER',
      isPrimaryMaster: true,
      organisationId: orgId,
    };

    let sentBuffer = null;
    let sentHeaders = {};
    const mockRes = {
      setHeader: (k, v) => { sentHeaders[k] = v; },
      status: (code) => {
        assert.equal(code, 200);
        return {
          send: (buf) => { sentBuffer = buf; },
        };
      },
    };

    // Test PDF export
    const reqPdf = {
      auth: masterUser,
      params: { cafeId: cafeOne },
      query: { format: 'PDF', period: 'TODAY' },
    };

    await analyticsController.getExecutiveSummary(reqPdf, mockRes, (err) => {
      if (err) throw err;
    });

    assert.ok(sentBuffer, 'PDF buffer must be sent');
    assert.equal(sentHeaders['Content-Type'], 'application/pdf');
    assert.ok(sentBuffer.toString('utf8', 0, 8).startsWith('%PDF-1.4'), 'Must have %PDF-1.4 header');

    // Test XLSX export
    sentBuffer = null;
    sentHeaders = {};
    const reqXlsx = {
      auth: masterUser,
      params: { cafeId: cafeOne },
      query: { format: 'XLSX', period: 'TODAY' },
    };

    await analyticsController.getExecutiveSummary(reqXlsx, mockRes, (err) => {
      if (err) throw err;
    });

    assert.ok(sentBuffer, 'XLSX buffer must be sent');
    assert.equal(sentHeaders['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    // OpenXML ZIP magic bytes PK\x03\x04
    assert.equal(sentBuffer[0], 0x50);
    assert.equal(sentBuffer[1], 0x4b);
    assert.equal(sentBuffer[2], 0x03);
    assert.equal(sentBuffer[3], 0x04);
  });
});
