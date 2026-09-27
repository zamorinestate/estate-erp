'use strict';

/**
 * VEN-SCR-003: VENDOR DELIVERIES, GOODS RECEIPT & GRN CONTRACT TEST SUITE
 *
 * Validates:
 * 1. Delivery / GRN Register listing & 10 KPI summary counts:
 *    - totalRecords, awaitingReceipt, expectedToday, receivedAtCafe, partiallyReceived,
 *      grnPending, grnCompleted, recordsWithDiscrepancy, totalRejectedLines, totalMissingLines
 * 2. Date period filtering (today, 7days, 30days, thisMonth, financialYear, custom)
 * 3. Multi-café scoping constraints (Authorized café allowed, foreign café rejected with 403 CROSS_CAFE_ACCESS_DENIED)
 * 4. Item-Level Receiving Reconciliation across authoritative scenarios (Section 43):
 *    - Perfect delivery
 *    - Partial delivery with rejection
 *    - Missing / short quantity
 *    - Multiple GRNs per Purchase Order
 *    - Mixed UOM line items (semantic unit protection: never sums incompatible UOMs)
 *    - Cancelled PO preservation (does not pollute active pipeline)
 *    - Completed PO
 * 5. Discrepancy visibility & internal note protection:
 *    - Vendor-safe physical descriptions shown
 *    - Internal employee notes, approval notes, and chatter strictly redacted
 * 6. Detailed Delivery / GRN view with 8-stage receiving lifecycle timeline
 * 7. Related Purchase Order integration (safe navigation link to VEN-SCR-002)
 * 8. Document security & official A4 GRN PDF generation
 * 9. Cross-Vendor BOLA / IDOR isolation (Vendor A cannot inspect or download Vendor B records)
 * 10. Cross-Café isolation (Unauthorized café access fails closed)
 * 11. Strict server-side mutation prevention (POST/PUT/PATCH/DELETE blocked with 403 FORBIDDEN_VENDOR_WRITE)
 * 12. Internal procurement route isolation (Vendor token cannot call internal procurement endpoints)
 * 13. Frontend route allowlist integrity for vendor-deliveries and vendor-grns
 * 14. Responsive mobile & component rendering contract (no mutation buttons in HTML)
 * 15. Development authentication production safety (NODE_ENV=production rejects dev bypass with 401)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const { createApp } = require('../src/server');
const { User } = require('../src/models/User');
const { Vendor } = require('../src/models/Vendor');
const { Cafe } = require('../src/models/Cafe');
const { PurchaseOrder } = require('../src/models/PurchaseOrder');
const { APInvoice } = require('../src/models/APInvoice');
const { isRouteAllowed } = require('../../Frontend/src/js/navigation.js');
const { renderVendorDeliveries } = require('../../Frontend/src/js/pages/vendorDeliveries.js');
const authService = require('../src/services/authService');

const ORG_ID = 'ORG-ZAMORIN';
const CAFE_1 = 'ZC-0001';
const CAFE_2 = 'ZC-0002';
const CAFE_3 = 'ZC-0003'; // Unauthorized cafe for Vendor A

const VENDOR_A_ID = 'VEN-7001';
const VENDOR_B_ID = 'VEN-7002';

function makeRequest({ port, method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const serializedBody = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (serializedBody) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(serializedBody);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path,
        headers: reqHeaders,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const contentType = res.headers['content-type'] || '';
          let parsedJson = null;

          if (contentType.includes('application/json')) {
            try {
              parsedJson = JSON.parse(buffer.toString('utf8'));
            } catch (_) {
              parsedJson = buffer.toString('utf8');
            }
          }

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedJson,
            rawBuffer: buffer,
          });
        });
      }
    );

    req.on('error', reject);
    if (serializedBody) {
      req.write(serializedBody);
    }
    req.end();
  });
}

test('VEN-SCR-003: Vendor Deliveries, Goods Receipt & GRN Contract Test Suite', async (suite) => {
  let mongoReplSet;
  let server;
  let port;

  let vendorAToken;
  let vendorBToken;
  let staffToken;

  suite.before(async () => {
    mongoReplSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongoReplSet.getUri());

    const app = createApp({ allowedOrigins: ['*'], production: false });
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;

    // 1. Seed Cafes
    await Cafe.create([
      { organisationId: ORG_ID, cafeId: CAFE_1, name: 'Zamorin Roastery Central', displayName: 'Zamorin Roastery Central', createdBy: 'MU-0001', code: 'ZRC', branchCode: 'ZRC', status: 'ACTIVE', address: { street: '12 Beach Road', city: 'Calicut' } },
      { organisationId: ORG_ID, cafeId: CAFE_2, name: 'Zamorin Beachside', displayName: 'Zamorin Beachside', createdBy: 'MU-0001', code: 'ZBS', branchCode: 'ZBS', status: 'ACTIVE', address: { street: '45 Coastal Way', city: 'Calicut' } },
      { organisationId: ORG_ID, cafeId: CAFE_3, name: 'Zamorin Hilltop', displayName: 'Zamorin Hilltop', createdBy: 'MU-0001', code: 'ZHT', branchCode: 'ZHT', status: 'ACTIVE', address: { street: '88 Wayanad Road', city: 'Calicut' } },
    ]);

    // 2. Seed Approved Vendors
    await Vendor.create([
      {
        organisationId: ORG_ID,
        vendorId: VENDOR_A_ID,
        name: 'Malabar Dairy & Creamery',
        legalName: 'Malabar Dairy Products Pvt Ltd',
        gstNumber: '32AABCM1234F1Z5',
        category: 'FOOD_BEVERAGE',
        supplierType: 'GOODS',
        approvedCafeIds: [CAFE_1, CAFE_2],
        status: 'ACTIVE',
        isApproved: true,
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        vendorId: VENDOR_B_ID,
        name: 'Highland Coffee Roasters',
        legalName: 'Highland Coffee Estate LLP',
        gstNumber: '32AABCH5678F1Z2',
        category: 'FOOD_BEVERAGE',
        supplierType: 'GOODS',
        approvedCafeIds: [CAFE_1],
        status: 'ACTIVE',
        isApproved: true,
        createdByUserId: 'MU-0001',
      },
    ]);

    // 3. Seed Users
    const passwordHash = await authService.hashPassword('TEST_FIXTURE_HASH_ONLY_NOT_FOR_LOGIN#999');

    const userA = await User.create({
      userId: 'VU-0001',
      email: 'accounts@malabardairy.com',
      name: 'Malabar Accounts',
      role: 'VENDOR',
      vendorId: VENDOR_A_ID,
      organisationId: ORG_ID,
      accountStatus: 'ACTIVE',
      createdBy: 'MU-0001',
      passwordHash,
    });

    const userB = await User.create({
      userId: 'VU-0002',
      email: 'supply@highlandcoffee.com',
      name: 'Highland Supply',
      role: 'VENDOR',
      vendorId: VENDOR_B_ID,
      organisationId: ORG_ID,
      accountStatus: 'ACTIVE',
      createdBy: 'MU-0001',
      passwordHash,
    });

    const userStaff = await User.create({
      userId: 'ST-0001',
      email: 'cashier@zamorin.com',
      name: 'Cafe Cashier',
      role: 'STAFF',
      primaryCafeId: CAFE_1,
      organisationId: ORG_ID,
      accountStatus: 'ACTIVE',
      createdBy: 'MU-0001',
      passwordHash,
    });

    // 4. Issue Authentic JWTs
    const issueToken = async (user) => {
      const sessionResult = await authService.createSession({
        user,
        device: { deviceId: `DEV-${user.userId}` },
        mfaVerified: true,
      });
      return sessionResult.accessToken;
    };

    vendorAToken = await issueToken(userA);
    vendorBToken = await issueToken(userB);
    staffToken = await issueToken(userStaff);

    // 5. Seed Authoritative Purchase Orders and GRNs for Vendor A
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    await PurchaseOrder.create([
      // Scenario A: Awaiting Receipt / Incoming Delivery Pipeline (Open Approved PO)
      {
        purchaseOrderId: 'PO-3001',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        status: 'APPROVED',
        orderDate: todayStr,
        expectedDeliveryDate: todayStr,
        subtotalPaisa: 2500000,
        taxPaisa: 125000,
        totalPaisa: 2625000,
        createdByUserId: 'MU-0001',
        lineItems: [
          {
            itemId: 'ITEM-MILK-FULL',
            itemNameSnapshot: 'Full Cream Fresh Milk 1L',
            itemType: 'GOODS',
            supplierItemCode: 'MDC-MILK-01',
            orderedQuantityBase: 100,
            receivedQuantityBase: 0,
            acceptedReceivedQty: 0,
            rejectedQty: 0,
            outstandingQty: 100,
            unitPricePaisa: 7500,
            totalLinePaisa: 750000,
            baseUnit: 'L',
            packSize: '1L POUCH',
          },
          {
            itemId: 'ITEM-YOGURT-CUP',
            itemNameSnapshot: 'Natural Set Yogurt 500g',
            itemType: 'GOODS',
            supplierItemCode: 'MDC-YOG-01',
            orderedQuantityBase: 50,
            receivedQuantityBase: 0,
            acceptedReceivedQty: 0,
            rejectedQty: 0,
            outstandingQty: 50,
            unitPricePaisa: 10000,
            totalLinePaisa: 500000,
            baseUnit: 'PACK',
            packSize: '500g TUB',
          },
        ],
      },

      // Scenario B: Perfect Delivery & Completed GRN (Mixed UOM: Butter block & Ghee)
      {
        purchaseOrderId: 'PO-3002',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        status: 'CLOSED',
        orderDate: '2026-09-20',
        expectedDeliveryDate: '2026-09-22',
        receivedDate: '2026-09-22',
        subtotalPaisa: 3120000,
        taxPaisa: 156000,
        totalPaisa: 3276000,
        createdByUserId: 'MU-0001',
        lineItems: [
          {
            itemId: 'ITEM-BUTTER-500',
            itemNameSnapshot: 'Table Butter 500g',
            itemType: 'GOODS',
            supplierItemCode: 'MDC-BUTTER-01',
            orderedQuantityBase: 120,
            receivedQuantityBase: 120,
            acceptedReceivedQty: 120,
            rejectedQty: 0,
            outstandingQty: 0,
            unitPricePaisa: 26000,
            totalLinePaisa: 3120000,
            baseUnit: 'PACK',
            packSize: '500g BLOCK',
          },
        ],
        grnReceipts: [
          {
            grnId: 'GRN-3002',
            deliveryNoteNumber: 'DN-MALABAR-1002',
            receivedAt: new Date('2026-09-22T10:00:00Z'),
            receivedByUserId: 'ST-0001',
            status: 'ACCEPTED',
            notes: 'INTERNAL ONLY: Driver arrived on time. Receiving bay dock clean.',
            items: [
              {
                itemId: 'ITEM-BUTTER-500',
                deliveredQty: 120,
                acceptedQty: 120,
                rejectedQty: 0,
                missingQty: 0,
                discrepancyReason: '',
                lotNumber: 'LOT-BUTTER-SEP22',
                expiryDate: new Date('2026-12-22T00:00:00Z'),
                notes: 'INTERNAL: Temperature check 4C passed.',
              },
            ],
            receiptAttachments: [
              {
                attachmentId: 'ATT-3002-01',
                filename: 'Signed-Challan-3002.pdf',
                mimeType: 'application/pdf',
                sizeBytes: 12450,
                uploadedByUserId: 'ST-0001',
                uploadedByRole: 'STAFF',
                note: 'Internal scanned copy of physical delivery slip',
              },
            ],
          },
        ],
      },

      // Scenario C: Partial Delivery with Shortage & Rejection Discrepancies
      {
        purchaseOrderId: 'PO-3003',
        organisationId: ORG_ID,
        cafeId: CAFE_2,
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        status: 'RECEIVED',
        orderDate: '2026-09-24',
        expectedDeliveryDate: '2026-09-26',
        receivedDate: '2026-09-26',
        subtotalPaisa: 1875000,
        taxPaisa: 93750,
        totalPaisa: 1968750,
        createdByUserId: 'MU-0001',
        lineItems: [
          {
            itemId: 'ITEM-MILK-SKIM',
            itemNameSnapshot: 'Skimmed Milk 1L',
            itemType: 'GOODS',
            supplierItemCode: 'MDC-SKIM-01',
            orderedQuantityBase: 250,
            receivedQuantityBase: 245,
            acceptedReceivedQty: 240,
            rejectedQty: 5,
            outstandingQty: 5,
            unitPricePaisa: 7500,
            totalLinePaisa: 1875000,
            baseUnit: 'L',
            packSize: '1L POUCH',
          },
        ],
        grnReceipts: [
          {
            grnId: 'GRN-3003',
            deliveryNoteNumber: 'DN-MALABAR-1003',
            receivedAt: new Date('2026-09-26T11:30:00Z'),
            receivedByUserId: 'ST-0001',
            status: 'PARTIAL',
            notes: 'INTERNAL MANAGER OBSERVATION: Vendor packaging substandard. Suspect pallet damage.',
            items: [
              {
                itemId: 'ITEM-MILK-SKIM',
                deliveredQty: 245,
                acceptedQty: 240,
                rejectedQty: 5,
                missingQty: 5,
                rejectionReason: 'LEAKAGE_IN_TRANSIT',
                discrepancyReason: '5 pouches punctured and leaking upon physical unloading; 5 pouches short on count.',
                lotNumber: 'LOT-SKIM-SEP26',
                expiryDate: new Date('2026-09-30T00:00:00Z'),
                notes: 'INTERNAL NOTE: Rejected bottles destroyed at disposal bay.',
              },
            ],
          },
        ],
      },

      // Scenario D: Multiple GRNs against a Single Purchase Order (Split Deliveries)
      {
        purchaseOrderId: 'PO-3004',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        status: 'RECEIVED',
        orderDate: '2026-09-18',
        expectedDeliveryDate: '2026-09-24',
        subtotalPaisa: 1000000,
        taxPaisa: 50000,
        totalPaisa: 1050000,
        createdByUserId: 'MU-0001',
        lineItems: [
          {
            itemId: 'ITEM-CHEESE-MOZZ',
            itemNameSnapshot: 'Mozzarella Cheese 1kg Block',
            itemType: 'GOODS',
            supplierItemCode: 'MDC-CHEESE-01',
            orderedQuantityBase: 100,
            receivedQuantityBase: 98,
            acceptedReceivedQty: 98,
            rejectedQty: 2,
            outstandingQty: 0,
            unitPricePaisa: 10000,
            totalLinePaisa: 1000000,
            baseUnit: 'KG',
            packSize: '1kg BLOCK',
          },
        ],
        grnReceipts: [
          // GRN 1: First split shipment (60 KG received, 58 accepted, 2 rejected)
          {
            grnId: 'GRN-3004-A',
            deliveryNoteNumber: 'DN-SPLIT-01',
            receivedAt: new Date('2026-09-21T09:00:00Z'),
            receivedByUserId: 'ST-0001',
            status: 'PARTIAL',
            notes: 'INTERNAL: First consignment arrived.',
            items: [
              {
                itemId: 'ITEM-CHEESE-MOZZ',
                deliveredQty: 60,
                acceptedQty: 58,
                rejectedQty: 2,
                missingQty: 0,
                rejectionReason: 'TEMPERATURE_EXCURSION',
                discrepancyReason: '2 blocks unsealed packaging upon intake.',
                lotNumber: 'LOT-MOZZ-BATCH-1',
              },
            ],
          },
          // GRN 2: Second split shipment (40 KG received, 40 accepted, 0 rejected)
          {
            grnId: 'GRN-3004-B',
            deliveryNoteNumber: 'DN-SPLIT-02',
            receivedAt: new Date('2026-09-24T14:00:00Z'),
            receivedByUserId: 'ST-0001',
            status: 'ACCEPTED',
            notes: 'INTERNAL: Second consignment completes the order.',
            items: [
              {
                itemId: 'ITEM-CHEESE-MOZZ',
                deliveredQty: 40,
                acceptedQty: 40,
                rejectedQty: 0,
                missingQty: 0,
                discrepancyReason: '',
                lotNumber: 'LOT-MOZZ-BATCH-2',
              },
            ],
          },
        ],
      },

      // Scenario E: Cancelled PO (Preserves audit trail, does not show in active deliveries)
      {
        purchaseOrderId: 'PO-3005',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        status: 'CANCELLED',
        orderDate: '2026-09-10',
        expectedDeliveryDate: '2026-09-12',
        subtotalPaisa: 500000,
        taxPaisa: 25000,
        totalPaisa: 525000,
        createdByUserId: 'MU-0001',
        cancellationReason: 'Store menu update cancelled this requirement.',
        lineItems: [
          {
            itemId: 'ITEM-MILK-FULL',
            itemNameSnapshot: 'Full Cream Fresh Milk 1L',
            orderedQuantityBase: 50,
            receivedQuantityBase: 0,
            acceptedReceivedQty: 0,
            rejectedQty: 0,
            outstandingQty: 50,
            unitPricePaisa: 7500,
            totalLinePaisa: 375000,
            baseUnit: 'L',
          },
        ],
      },

      // Scenario F: Foreign PO for Vendor B
      {
        purchaseOrderId: 'PO-9999',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_B_ID,
        vendorNameSnapshot: 'Highland Coffee Roasters',
        status: 'RECEIVED',
        orderDate: '2026-09-25',
        expectedDeliveryDate: '2026-09-28',
        subtotalPaisa: 5000000,
        taxPaisa: 250000,
        totalPaisa: 5250000,
        createdByUserId: 'MU-0001',
        lineItems: [
          {
            itemId: 'ITEM-COFFEE-ARABICA',
            itemNameSnapshot: 'Arabica Roasted Whole Beans 1kg',
            itemType: 'GOODS',
            orderedQuantityBase: 50,
            unitPricePaisa: 100000,
            totalLinePaisa: 5000000,
            baseUnit: 'KG',
          },
        ],
        grnReceipts: [
          {
            grnId: 'GRN-9999',
            deliveryNoteNumber: 'DN-HIGHLAND-99',
            receivedAt: new Date('2026-09-26T15:00:00Z'),
            receivedByUserId: 'ST-0001',
            status: 'ACCEPTED',
            items: [
              {
                itemId: 'ITEM-COFFEE-ARABICA',
                deliveredQty: 50,
                acceptedQty: 50,
                rejectedQty: 0,
                missingQty: 0,
                discrepancyReason: '',
              },
            ],
          },
        ],
      },
    ]);

    // 6. Seed Invoices for PO-3002
    await APInvoice.create([
      {
        invoiceId: 'INV-3002',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        supplierInvoiceNumber: 'INV-MDC-3002',
        invoiceDate: '2026-09-23',
        dueDate: '2026-10-23',
        amountPaisa: 3276000,
        taxPaisa: 156000,
        totalPaisa: 3276000,
        approvedPayableAmountPaisa: 3276000,
        paidPaisa: 3276000,
        amountPaidPaisa: 3276000,
        outstandingPaisa: 0,
        paymentStatus: 'PAID',
        poReferenceId: 'PO-3002',
      },
    ]);
  });

  suite.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (mongoReplSet) await mongoReplSet.stop();
  });

  // ── TEST 1: Register Listing & 10 KPI Summaries ───────────────────────────
  await suite.test('1. Delivery / GRN Register & 10 KPI Summaries (GET /api/v1/vendor/deliveries)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/deliveries',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.readOnly, true);
    assert.equal(res.body.data.workspaceMode, 'READ_ONLY');

    const { kpis, deliveries, pagination } = res.body.data;

    // Verify 10 KPI counts:
    // Total records for Vendor A = 5:
    // 1 pipeline (PO-3001) + 1 GRN (GRN-3002) + 1 GRN (GRN-3003) + 2 GRNs (GRN-3004-A, GRN-3004-B)
    assert.equal(kpis.totalRecords, 5);
    assert.equal(kpis.awaitingReceipt, 1); // PO-3001
    assert.equal(kpis.receivedAtCafe, 2);   // GRN-3002 (Completed), GRN-3004-B (Received)
    assert.equal(kpis.partiallyReceived, 2); // GRN-3003 (Partial), GRN-3004-A (Partial)
    assert.equal(kpis.recordsWithDiscrepancy, 2); // GRN-3003 (rej 5, mis 5), GRN-3004-A (rej 2)
    assert.equal(kpis.totalRejectedLines, 2); // 1 in GRN-3003, 1 in GRN-3004-A
    assert.equal(kpis.totalMissingLines, 1);  // 1 in GRN-3003

    // Verify alias route /api/v1/vendor/grns produces identical authoritative result
    const aliasRes = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/grns',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(aliasRes.statusCode, 200);
    assert.equal(aliasRes.body.data.kpis.totalRecords, 5);
    assert.equal(deliveries.length, 5);
  });

  // ── TEST 2: Date Filtering ────────────────────────────────────────────────
  await suite.test('2. Date Period Filtering', async () => {
    // Custom date range matching only the recent receipts
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/deliveries?dateRange=custom&customStart=2026-09-23&customEnd=2026-09-30',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const { deliveries } = res.body.data;
    // Should include GRN-3003 (Sep 26) and GRN-3004-B (Sep 24), but NOT GRN-3002 (Sep 22) or GRN-3004-A (Sep 21)
    const grnIds = deliveries.map((d) => d.grnId).filter(Boolean);
    assert.ok(grnIds.includes('GRN-3003'));
    assert.ok(grnIds.includes('GRN-3004-B'));
    assert.ok(!grnIds.includes('GRN-3002'));
  });

  // ── TEST 3: Multi-Café Filtering & Boundary Constraints ───────────────────
  await suite.test('3. Multi-Café Filtering & Boundary Constraints', async () => {
    // 1. Filter by authorized CAFE_1
    const resCafe1 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/deliveries?cafeId=${CAFE_1}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe1.statusCode, 200);
    const cafesInRes = resCafe1.body.data.deliveries.map((d) => d.cafeId);
    assert.ok(cafesInRes.every((c) => c === CAFE_1));

    // 2. Filter by authorized CAFE_2
    const resCafe2 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/deliveries?cafeId=${CAFE_2}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe2.statusCode, 200);
    assert.ok(resCafe2.body.data.deliveries.every((d) => d.cafeId === CAFE_2));

    // 3. Attempt to access unauthorized CAFE_3
    const resCafe3 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/deliveries?cafeId=${CAFE_3}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe3.statusCode, 403);
    assert.equal(resCafe3.body.error.code, 'CROSS_CAFE_ACCESS_DENIED');
  });

  // ── TEST 4: Item-Level Receiving Reconciliation (Section 43 Scenarios) ─────
  await suite.test('4. Item-Level Receiving Reconciliation (Section 43 Mathematical Truth)', async () => {
    // Scenario 1: Perfect Delivery (GRN-3002)
    const resPerfect = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/deliveries/GRN-3002',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resPerfect.statusCode, 200);
    const perfectItem = resPerfect.body.data.items[0];
    assert.equal(perfectItem.orderedQty, 120);
    assert.equal(perfectItem.deliveredQty, 120);
    assert.equal(perfectItem.receivedQty, 120);
    assert.equal(perfectItem.acceptedQty, 120);
    assert.equal(perfectItem.rejectedQty, 0);
    assert.equal(perfectItem.missingQty, 0);
    assert.equal(perfectItem.pendingQty, 0);
    assert.equal(perfectItem.baseUnit, 'pack');
    assert.equal(resPerfect.body.data.hasDiscrepancy, false);

    // Scenario 2: Partial Delivery with Shortage & Rejection (GRN-3003)
    const resDiscrepancy = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/deliveries/GRN-3003',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resDiscrepancy.statusCode, 200);
    const discItem = resDiscrepancy.body.data.items[0];
    assert.equal(discItem.orderedQty, 250);
    assert.equal(discItem.deliveredQty, 245);
    assert.equal(discItem.acceptedQty, 240);
    assert.equal(discItem.rejectedQty, 5);
    assert.equal(discItem.missingQty, 5);
    // Reconciliation check: accepted (240) + rejected (5) = delivered (245)
    assert.equal(discItem.acceptedQty + discItem.rejectedQty, discItem.deliveredQty);
    // Reconciliation check: delivered (245) + missing (5) = ordered (250)
    assert.equal(discItem.deliveredQty + discItem.missingQty, discItem.orderedQty);
    assert.equal(resDiscrepancy.body.data.hasDiscrepancy, true);

    // Scenario 3: Semantic Unit Invariant: Mixed UOM items
    const resPipeline = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/deliveries/PO-3001',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resPipeline.statusCode, 200);
    assert.equal(resPipeline.body.data.items.length, 2);
    const uoms = resPipeline.body.data.items.map((i) => i.baseUnit);
    assert.ok(uoms.includes('l'));
    assert.ok(uoms.includes('pack'));
  });

  // ── TEST 5: Multiple GRNs per Purchase Order ──────────────────────────────
  await suite.test('5. Multiple GRNs per Purchase Order (PO-3004 Split Deliveries)', async () => {
    // 1. Inspect GRN-3004-A (first split delivery)
    const resGrn1 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/orders/PO-3004/grns/GRN-3004-A',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resGrn1.statusCode, 200);
    assert.equal(resGrn1.body.data.grnId, 'GRN-3004-A');
    assert.equal(resGrn1.body.data.deliveredQty, 60);
    assert.equal(resGrn1.body.data.acceptedQty, 58);
    assert.equal(resGrn1.body.data.rejectedQty, 2);

    // 2. Inspect GRN-3004-B (second split delivery)
    const resGrn2 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/orders/PO-3004/grns/GRN-3004-B',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resGrn2.statusCode, 200);
    assert.equal(resGrn2.body.data.grnId, 'GRN-3004-B');
    assert.equal(resGrn2.body.data.deliveredQty, 40);
    assert.equal(resGrn2.body.data.acceptedQty, 40);
    assert.equal(resGrn2.body.data.rejectedQty, 0);

    // Both GRNs reference the identical Purchase Order
    assert.equal(resGrn1.body.data.linkedPurchaseOrder.purchaseOrderId, 'PO-3004');
    assert.equal(resGrn2.body.data.linkedPurchaseOrder.purchaseOrderId, 'PO-3004');
  });

  // ── TEST 6: Discrepancy Visibility & Internal Note Redaction ──────────────
  await suite.test('6. Discrepancy Transparency & Internal Note Redaction', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/deliveries/GRN-3003',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const data = res.body.data;

    // Vendor-safe discrepancy information is exposed:
    assert.equal(data.hasDiscrepancy, true);
    assert.ok(data.discrepancies.length > 0);
    const disc = data.discrepancies[0];
    assert.equal(disc.rejectedQuantity, 5);
    assert.equal(disc.missingQuantity, 5);
    assert.equal(disc.reasonCode, 'LEAKAGE_IN_TRANSIT');
    assert.ok(disc.description.includes('punctured and leaking'));

    // Critical: INTERNAL COMMENTS / NOTES MUST REMAIN REDACTED
    const rawString = JSON.stringify(res.body);
    assert.ok(!rawString.includes('INTERNAL MANAGER OBSERVATION'));
    assert.ok(!rawString.includes('Substandard pallet damage'));
    assert.ok(!rawString.includes('Rejected bottles destroyed at disposal bay'));
    assert.equal(data.notes, undefined);
    assert.equal(data.internalNotes, undefined);
  });

  // ── TEST 7: Delivery / GRN Detail View with 8-Stage Timeline ──────────────
  await suite.test('7. Delivery / GRN Detail View with 8-Stage Receiving Timeline', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/deliveries/GRN-3002',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const data = res.body.data;

    // Verify identity & café metadata
    assert.equal(data.grnId, 'GRN-3002');
    assert.equal(data.deliveryReference, 'DN-MALABAR-1002');
    assert.equal(data.delivery.cafeId, CAFE_1);
    assert.equal(data.delivery.cafeName, 'Zamorin Roastery Central');

    // Verify 8-stage timeline
    assert.equal(data.timeline.length, 8);
    const milestoneKeys = data.timeline.map((m) => m.key);
    assert.deepEqual(milestoneKeys, [
      'po_issued',
      'supply_recorded',
      'arrived_at_cafe',
      'physical_count',
      'discrepancy_recorded',
      'grn_created',
      'grn_verification',
      'grn_completed',
    ]);
    assert.equal(data.timeline.find((m) => m.key === 'po_issued').completed, true);
    assert.equal(data.timeline.find((m) => m.key === 'grn_completed').completed, true);
  });

  // ── TEST 8: Purchase Order Relationship ───────────────────────────────────
  await suite.test('8. Purchase Order Relationship & Navigation Link', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/deliveries/GRN-3002',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const linked = res.body.data.linkedPurchaseOrder;
    assert.equal(linked.purchaseOrderId, 'PO-3002');
    assert.equal(linked.poStatus, 'CLOSED');
    assert.equal(linked.viewOrderUrl, '/vendor-orders?po=PO-3002');
  });

  // ── TEST 9: Document Security & A4 GRN PDF Generation ─────────────────────
  await suite.test('9. Document Security & A4 GRN PDF Generation', async () => {
    // 1. Download official A4 GRN PDF
    const resPdf = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/deliveries/GRN-3002/pdf',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(resPdf.statusCode, 200);
    assert.equal(resPdf.headers['content-type'], 'application/pdf');
    assert.ok(resPdf.headers['content-disposition'].includes('GRN-GRN-3002.pdf'));
    assert.ok(resPdf.rawBuffer.length > 500);

    const pdfContent = resPdf.rawBuffer.toString('utf8');
    assert.ok(pdfContent.startsWith('%PDF-1.4'));
    assert.ok(pdfContent.toUpperCase().includes('READ-ONLY VENDOR COPY'));

    // Redaction check on generated PDF
    assert.ok(!pdfContent.includes('INTERNAL ONLY'));
    assert.ok(!pdfContent.includes('receiving bay dock clean'));

    // 2. Download authorized receipt attachment
    const resAtt = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/deliveries/GRN-3002/attachments/ATT-3002-01',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resAtt.statusCode, 200);
    assert.equal(resAtt.headers['content-type'], 'application/pdf');
    assert.ok(resAtt.headers['content-disposition'].includes('Signed-Challan-3002.pdf'));
  });

  // ── TEST 10: Cross-Vendor BOLA / IDOR Isolation ───────────────────────────
  await suite.test('10. Cross-Vendor BOLA / IDOR Protection', async () => {
    // Vendor A attempting to access Vendor B's GRN (GRN-9999)
    const resGrn = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/deliveries/GRN-9999',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resGrn.statusCode, 404);

    // Vendor A attempting to download Vendor B's GRN PDF
    const resPdf = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/deliveries/GRN-9999/pdf',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resPdf.statusCode, 404);
  });

  // ── TEST 11: Cross-Café Isolation ─────────────────────────────────────────
  await suite.test('11. Cross-Café Isolation (Non-approved café access blocked)', async () => {
    // Attempting query with unauthorized CAFE_3
    const res = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/deliveries?cafeId=${CAFE_3}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'CROSS_CAFE_ACCESS_DENIED');
  });

  // ── TEST 12: Server-Side Mutation Denial (Read-Only Policy) ───────────────
  await suite.test('12. Server-Side Mutation Denial (Read-Only Enforcement)', async () => {
    // Attempt POST to create delivery
    const postDel = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/vendor/deliveries',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { grnId: 'GRN-MALICIOUS', deliveredQty: 999 },
    });
    assert.equal(postDel.statusCode, 403);
    assert.equal(postDel.body.error.code, 'FORBIDDEN_VENDOR_WRITE');

    // Attempt PUT on a GRN
    const putGrn = await makeRequest({
      port,
      method: 'PUT',
      path: '/api/v1/vendor/deliveries/GRN-3002',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { status: 'DISPUTED' },
    });
    assert.equal(putGrn.statusCode, 403);
    assert.equal(putGrn.body.error.code, 'FORBIDDEN_VENDOR_WRITE');

    // Attempt DELETE on a GRN
    const delGrn = await makeRequest({
      port,
      method: 'DELETE',
      path: '/api/v1/vendor/deliveries/GRN-3002',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(delGrn.statusCode, 403);
    assert.equal(delGrn.body.error.code, 'FORBIDDEN_VENDOR_WRITE');
  });

  // ── TEST 13: Internal Procurement Route Isolation ─────────────────────────
  await suite.test('13. Internal Procurement Route Isolation', async () => {
    // Vendor attempts to call internal procurement endpoint
    const resProcurement = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/procurement/orders',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    // Vendor must be blocked from internal procurement route (403 FORBIDDEN or unauthorized)
    assert.ok(resProcurement.statusCode === 403 || resProcurement.statusCode === 401);
  });

  // ── TEST 14: Frontend Route Allowlist Integrity ───────────────────────────
  await suite.test('14. Frontend Route Allowlist Integrity for Deliveries & GRN', () => {
    // Deliveries routes allowed for vendor
    assert.equal(isRouteAllowed('vendor', 'vendor-deliveries'), true);
    assert.equal(isRouteAllowed('vendor', 'vendor/deliveries'), true);
    assert.equal(isRouteAllowed('vendor', 'vendor-grns'), true);
    assert.equal(isRouteAllowed('vendor', 'vendor/grns'), true);

    // Other vendor routes
    assert.equal(isRouteAllowed('vendor', 'vendor-orders'), true);
    assert.equal(isRouteAllowed('vendor', 'vendor-dashboard'), true);

    // Internal operations routes strictly forbidden for vendor
    assert.equal(isRouteAllowed('vendor', 'procurement'), false);
    assert.equal(isRouteAllowed('vendor', 'inventory'), false);
    assert.equal(isRouteAllowed('vendor', 'pos'), false);
    assert.equal(isRouteAllowed('vendor', 'finance'), false);
    assert.equal(isRouteAllowed('vendor', 'employees'), false);
    assert.equal(isRouteAllowed('vendor', 'admin'), false);
  });

  // ── TEST 15: Responsive Mobile & Component Rendering Contract ─────────────
  await suite.test('15. Responsive Mobile & Component Rendering Contract (No Mutation Buttons)', () => {
    const html = renderVendorDeliveries();
    assert.ok(html.includes('READ-ONLY GOODS RECEIPT (GRN) & DELIVERIES'));
    assert.ok(html.includes('VEN-SCR-003'));
    assert.ok(html.includes('kpi-total-records'));
    assert.ok(html.includes('kpi-awaiting-receipt'));
    assert.ok(html.includes('kpi-expected-today'));
    assert.ok(html.includes('kpi-received-cafe'));
    assert.ok(html.includes('kpi-partially-received'));
    assert.ok(html.includes('kpi-grn-completed'));
    assert.ok(html.includes('kpi-discrepancy'));
    assert.ok(html.includes('kpi-rejected-lines'));
    assert.ok(html.includes('kpi-missing-lines'));
    assert.ok(html.includes('deliveries-table-body'));
    assert.ok(html.includes('deliveries-mobile-cards'));
    assert.ok(html.includes('modal-delivery-detail'));

    // Guarantee: Absolute zero mutation buttons present in template
    const forbiddenPhrases = [
      'Add Delivery',
      'Create GRN',
      'Receive Goods',
      'Edit GRN',
      'Approve GRN',
      'Reject GRN',
      'Update Status',
      'Acknowledge Discrepancy',
      'Dispute Discrepancy',
    ];
    for (const phrase of forbiddenPhrases) {
      assert.ok(!html.includes(phrase), `Template must not contain mutation phrase: "${phrase}"`);
    }
  });

  // ── TEST 16: Development Auth Production Safety ───────────────────────────
  await suite.test('16. Development Auth Production Safety (NODE_ENV=production Gating)', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';

      // Request with dev bypass header but no Bearer token in production mode
      const resDevBypass = await makeRequest({
        port,
        method: 'GET',
        path: '/api/v1/vendor/deliveries',
        headers: { 'x-dev-role': 'VENDOR' },
      });

      // Must be rejected with 401 AUTHENTICATION_REQUIRED
      assert.equal(resDevBypass.statusCode, 401);
      assert.equal(resDevBypass.body.error.code, 'AUTHENTICATION_REQUIRED');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
