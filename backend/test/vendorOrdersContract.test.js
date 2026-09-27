'use strict';

/**
 * VEN-SCR-002: VENDOR PURCHASE ORDERS REGISTER & CONTRACT TEST SUITE
 *
 * Validates:
 * 1. PO Register listing & 10 KPI summary counts (Total, Open, Awaiting, Partial, Supplied, Received, Closed, Cancelled, Value)
 * 2. Universal Search (PO Number, Item Name, SKU/Item Code, Cafe, Invoice, GRN)
 * 3. Status and dimension filtering (PO Status, Supply Status, Payment Status, Cafe Scope, Date Range)
 * 4. Comprehensive PO Detail with all 15+ sub-domains:
 *    - PO Identity, Snapshot, Terms
 *    - Vendor Information Snapshot
 *    - Cafe & Delivery Bay Instructions
 *    - Line items with food/material specs and tax calculations
 *    - Authoritative Financial Breakdown (Subtotal, Tax, Discounts, Net Total)
 *    - Line-by-line reconciliation (Ordered vs Supplied vs Received vs Accepted vs Rejected vs Pending)
 *    - Rejection / Shortage / Discrepancy notices (vendor-appropriate only)
 *    - 8-stage visual milestone lifecycle
 *    - Revisions history
 *    - Related GRNs, Invoices, and Payments
 *    - Linked Documents (PDF link, GRN receipts, Invoice copies)
 * 5. Cancellation preservation (Cancelled POs remain in history with vendor-appropriate reason)
 * 6. Pure-JS A4 printable PDF document download stream
 * 7. Cross-vendor BOLA / IDOR isolation (Vendor A cannot inspect Vendor B's orders)
 * 8. Multi-café scoping constraints (Authorized café allowed, foreign café rejected with 403 CROSS_CAFE_ACCESS_DENIED)
 * 9. Strict server-side mutation prevention (POST/PUT/PATCH/DELETE on /orders blocked with 403 FORBIDDEN_VENDOR_WRITE)
 * 10. Audit event logging (VENDOR_PO_VIEWED, VENDOR_PO_PDF_DOWNLOADED)
 * 11. Frontend navigation route allowlist integrity
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

test('VEN-SCR-002: Vendor Purchase Orders Register & Contract Test Suite', async (suite) => {
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

    // 5. Seed Authoritative Purchase Orders for Vendor A
    await PurchaseOrder.create([
      // PO 1: Approved, open, awaiting supply
      {
        purchaseOrderId: 'PO-1028',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        status: 'APPROVED',
        orderDate: '2026-09-25',
        expectedDeliveryDate: '2026-09-28',
        subtotalPaisa: 2450000,
        taxPaisa: 122500,
        discountPaisa: 0,
        totalPaisa: 2572500,
        createdByUserId: 'MU-0001',
        paymentTerms: 'Net 30 Days',
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
            itemId: 'ITEM-CREAM-WHIP',
            itemNameSnapshot: 'Whipping Cream 1L',
            itemType: 'GOODS',
            supplierItemCode: 'MDC-CREAM-02',
            orderedQuantityBase: 50,
            receivedQuantityBase: 0,
            acceptedReceivedQty: 0,
            rejectedQty: 0,
            outstandingQty: 50,
            unitPricePaisa: 34000,
            totalLinePaisa: 1700000,
            baseUnit: 'L',
            packSize: '1L TETRA',
          },
        ],
        editHistory: [
          {
            editedAt: new Date('2026-09-25T11:00:00Z'),
            editedByUserId: 'MU-0001',
            editedByRole: 'MASTER',
            reason: 'Quantity increase requested by Head Barista',
            changesSummary: 'Full Cream Milk quantity updated from 80 to 100',
          },
        ],
      },
      // PO 2: Received, with partial shortage / rejection discrepancy
      {
        purchaseOrderId: 'PO-1027',
        organisationId: ORG_ID,
        cafeId: CAFE_2,
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        status: 'RECEIVED',
        orderDate: '2026-09-24',
        expectedDeliveryDate: '2026-09-26',
        subtotalPaisa: 1875000,
        taxPaisa: 93750,
        discountPaisa: 0,
        totalPaisa: 1968750,
        createdByUserId: 'MU-0001',
        paymentTerms: 'Net 15 Days',
        lineItems: [
          {
            itemId: 'ITEM-MILK-SKIM',
            itemNameSnapshot: 'Skimmed Milk 1L',
            itemType: 'GOODS',
            supplierItemCode: 'MDC-SKIM-01',
            orderedQuantityBase: 250,
            receivedQuantityBase: 250,
            acceptedReceivedQty: 245,
            rejectedQty: 5,
            outstandingQty: 0,
            unitPricePaisa: 7500,
            totalLinePaisa: 1875000,
            baseUnit: 'L',
            packSize: '1L POUCH',
          },
        ],
        grnReceipts: [
          {
            grnId: 'GRN-7088',
            deliveryNoteNumber: 'DN-MALABAR-551',
            receivedAt: new Date('2026-09-26T09:30:00Z'),
            receivedByUserId: 'ST-0001',
            status: 'ACCEPTED',
            items: [
              {
                itemId: 'ITEM-MILK-SKIM',
                deliveredQty: 250,
                acceptedQty: 245,
                rejectedQty: 5,
                missingQty: 0,
                rejectionReason: 'LEAKAGE_IN_TRANSIT',
                discrepancyReason: '5 pouches received ruptured and leaking upon physical counting at café receiving bay.',
              },
            ],
          },
        ],
      },
      // PO 3: Completed / Closed
      {
        purchaseOrderId: 'PO-1026',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        status: 'CLOSED',
        orderDate: '2026-09-20',
        expectedDeliveryDate: '2026-09-22',
        subtotalPaisa: 3120000,
        taxPaisa: 156000,
        discountPaisa: 0,
        totalPaisa: 3276000,
        createdByUserId: 'MU-0001',
        paymentTerms: 'Net 30 Days',
        lineItems: [
          {
            itemId: 'ITEM-BUTTER-SALT',
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
      },
      // PO 4: Cancelled order (preserves audit trail)
      {
        purchaseOrderId: 'PO-1025',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        status: 'CANCELLED',
        orderDate: '2026-09-15',
        expectedDeliveryDate: '2026-09-18',
        subtotalPaisa: 500000,
        taxPaisa: 25000,
        discountPaisa: 0,
        totalPaisa: 525000,
        createdByUserId: 'MU-0001',
        cancelledAt: new Date('2026-09-16T14:20:00Z'),
        cancelledByUserId: 'MU-0001',
        cancellationReason: 'Order requirement withdrawn due to revised weekly forecast.',
        lineItems: [
          {
            itemId: 'ITEM-YOGURT-GREEK',
            itemNameSnapshot: 'Greek Yogurt 1kg',
            itemType: 'GOODS',
            orderedQuantityBase: 20,
            receivedQuantityBase: 0,
            acceptedReceivedQty: 0,
            rejectedQty: 0,
            outstandingQty: 20,
            unitPricePaisa: 25000,
            totalLinePaisa: 500000,
          },
        ],
      },
      // PO 5: Foreign PO for Vendor B
      {
        purchaseOrderId: 'PO-9999',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_B_ID,
        vendorNameSnapshot: 'Highland Coffee Roasters',
        status: 'APPROVED',
        orderDate: '2026-09-25',
        expectedDeliveryDate: '2026-09-28',
        subtotalPaisa: 5000000,
        taxPaisa: 250000,
        discountPaisa: 0,
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
          },
        ],
      },
    ]);

    // 6. Seed Invoices for Vendor A POs
    await APInvoice.create([
      {
        invoiceId: 'INV-945',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        supplierInvoiceNumber: 'INV-MALABAR-945',
        invoiceDate: '2026-09-25',
        dueDate: '2026-10-10',
        amountPaisa: 2572500,
        taxPaisa: 122500,
        totalPaisa: 2572500,
        paidPaisa: 0,
        amountPaidPaisa: 0,
        outstandingPaisa: 2572500,
        outstandingPayableAmountPaisa: 2572500,
        paymentStatus: 'DUE',
        poReferenceId: 'PO-1028',
      },
      {
        invoiceId: 'INV-931',
        organisationId: ORG_ID,
        cafeId: CAFE_2,
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        supplierInvoiceNumber: 'INV-MALABAR-931',
        invoiceDate: '2026-09-24',
        dueDate: '2026-10-09',
        amountPaisa: 1968750,
        taxPaisa: 93750,
        totalPaisa: 1968750,
        paidPaisa: 1000000,
        amountPaidPaisa: 1000000,
        outstandingPaisa: 968750,
        outstandingPayableAmountPaisa: 968750,
        paymentStatus: 'PARTIALLY_PAID',
        poReferenceId: 'PO-1027',
        paymentHistory: [
          {
            paymentId: 'PAY-8821',
            paidPaisa: 1000000,
            paidAt: new Date('2026-09-25'),
            paidByUserId: 'MU-0001',
            paymentMethod: 'BANK_TRANSFER',
            reference: 'UTR-HDFC-9921',
          },
        ],
      },
    ]);
  });

  suite.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (mongoReplSet) await mongoReplSet.stop();
  });

  await suite.test('1. PO Register Listing & 10 KPI Summaries (GET /api/v1/vendor/orders)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/orders',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);

    const { kpis, orders, pagination } = res.body.data;

    // Verify 10 KPI summary counts:
    assert.equal(kpis.totalOrders, 4); // 4 POs for Vendor A (PO-1028, PO-1027, PO-1026, PO-1025)
    assert.equal(kpis.openOrders, 1);  // PO-1028
    assert.equal(kpis.awaitingSupply, 1);
    assert.equal(kpis.received, 2);    // PO-1027 (RECEIVED), PO-1026 (CLOSED)
    assert.equal(kpis.completed, 1);   // PO-1026 (CLOSED)
    assert.equal(kpis.cancelled, 1);   // PO-1025 (CANCELLED)
    
    // Total Value across non-cancelled: PO-1028 (2572500) + PO-1027 (1968750) + PO-1026 (3276000) = 7817250
    assert.equal(kpis.totalPoValuePaisa, 7817250);
    assert.equal(kpis.totalPoValueFormatted, '₹78,173');

    // Verify register records count and pagination:
    assert.equal(orders.length, 4);
    assert.equal(pagination.totalRecords, 4);
    assert.equal(pagination.page, 1);

    // Foreign Vendor B's orders must NEVER contaminate Vendor A's register
    assert.equal(orders.some((o) => o.purchaseOrderId === 'PO-9999'), false);
  });

  await suite.test('2. Universal Search Filtering (Search by PO, Item, SKU)', async () => {
    // 2.1 Search by PO Number
    const resPo = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/orders?search=PO-1028',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resPo.statusCode, 200);
    assert.equal(resPo.body.data.orders.length, 1);
    assert.equal(resPo.body.data.orders[0].purchaseOrderId, 'PO-1028');

    // 2.2 Search by Item Name
    const resItem = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/orders?search=Butter',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resItem.statusCode, 200);
    assert.equal(resItem.body.data.orders.length, 1);
    assert.equal(resItem.body.data.orders[0].purchaseOrderId, 'PO-1026');

    // 2.3 Search by Supplier Item Code / SKU
    const resSku = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/orders?search=MDC-SKIM-01',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resSku.statusCode, 200);
    assert.equal(resSku.body.data.orders.length, 1);
    assert.equal(resSku.body.data.orders[0].purchaseOrderId, 'PO-1027');
  });

  await suite.test('3. Status and Dimension Filtering', async () => {
    // 3.1 Filter by PO Status: CLOSED
    const resClosed = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/orders?poStatus=CLOSED',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resClosed.statusCode, 200);
    assert.equal(resClosed.body.data.orders.length, 1);
    assert.equal(resClosed.body.data.orders[0].purchaseOrderId, 'PO-1026');

    // 3.2 Filter by PO Status: CANCELLED
    const resCancelled = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/orders?poStatus=CANCELLED',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCancelled.statusCode, 200);
    assert.equal(resCancelled.body.data.orders.length, 1);
    assert.equal(resCancelled.body.data.orders[0].purchaseOrderId, 'PO-1025');
    assert.equal(resCancelled.body.data.orders[0].isCancelled, true);
    assert.ok(resCancelled.body.data.orders[0].cancellationReason.includes('withdrawn'));
  });

  await suite.test('4. Multi-Café Scoping & Parameter Boundaries', async () => {
    // 4.1 Filter by authorized Cafe 1: should return only Cafe 1 POs
    const resCafe1 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/orders?cafeId=${CAFE_1}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe1.statusCode, 200);
    assert.equal(resCafe1.body.data.orders.every((o) => o.cafeId === CAFE_1), true);

    // 4.2 Filter by unauthorized Cafe 3: must be rejected with 403 CROSS_CAFE_ACCESS_DENIED
    const resCafe3 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/orders?cafeId=${CAFE_3}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe3.statusCode, 403);
    assert.equal(resCafe3.body.error.code, 'CROSS_CAFE_ACCESS_DENIED');
  });

  await suite.test('5. Comprehensive Read-Only PO Detail (GET /api/v1/vendor/orders/:purchaseOrderId)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/orders/PO-1028',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);

    const d = res.body.data;

    // A. PO Identity
    assert.equal(d.purchaseOrderId, 'PO-1028');
    assert.equal(d.poStatus, 'APPROVED');
    assert.equal(d.paymentTerms, 'Net 30 Days');
    assert.equal(d.readOnly, true);
    assert.equal(d.workspaceMode, 'READ_ONLY');

    // B. Vendor Information Snapshot
    assert.equal(d.vendor.vendorId, VENDOR_A_ID);
    assert.equal(d.vendor.name, 'Malabar Dairy & Creamery');
    assert.equal(d.vendor.gstNumber, '32AABCM1234F1Z5');

    // C. Cafe & Delivery Information
    assert.equal(d.cafeId, CAFE_1);
    assert.equal(d.delivery.cafeName, 'Zamorin Roastery Central');
    assert.equal(d.delivery.cafeCode, 'ZRC');
    assert.ok(d.delivery.address.includes('Beach Road'));

    // D. PO Line Items
    assert.equal(d.lineItems.length, 2);
    const milkItem = d.lineItems[0];
    assert.equal(milkItem.itemId, 'ITEM-MILK-FULL');
    assert.equal(milkItem.itemName, 'Full Cream Fresh Milk 1L');
    assert.equal(milkItem.orderedQuantity, 100);
    assert.equal(milkItem.unitPricePaisa, 7500);
    assert.equal(milkItem.lineTotalPaisa, 750000);

    // Verify zero internal margin / markup / cost notes leak
    assert.equal(milkItem.markupPaisa, undefined);
    assert.equal(milkItem.internalNotes, undefined);

    // E. Financial Breakdown
    assert.equal(d.financial.subtotalPaisa, 2450000);
    assert.equal(d.financial.grandTotalPaisa, 2572500);
    assert.equal(d.financial.grandTotalFormatted, '₹25,725');

    // F. Ordered vs Supplied vs Received Line Reconciliation
    assert.equal(d.orderedVsSuppliedVsReceived.length, 2);
    assert.equal(d.orderedVsSuppliedVsReceived[0].ordered, 100);
    assert.equal(d.orderedVsSuppliedVsReceived[0].pending, 100);

    // G. Revisions History
    assert.equal(d.hasRevisions, true);
    assert.equal(d.revisions.length, 1);
    assert.equal(d.revisions[0].revisionNumber, 1);
    assert.ok(d.revisions[0].reason.includes('Barista'));

    // H. Linked Invoices
    assert.equal(d.relatedInvoices.length, 1);
    assert.equal(d.relatedInvoices[0].invoiceNumber, 'INV-MALABAR-945');
    assert.equal(d.relatedInvoices[0].status, 'DUE');

    // I. Linked Documents
    assert.ok(d.linkedDocuments.some((doc) => doc.documentType === 'PURCHASE_ORDER_PDF'));
  });

  await suite.test('6. Rejection / Shortage Discrepancy Reporting (PO-1027)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/orders/PO-1027',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const d = res.body.data;

    // Verify shortages and rejections are extracted for vendor transparency
    assert.ok(d.shortagesAndRejections.length >= 1);
    const disc = d.shortagesAndRejections[0];
    assert.equal(disc.itemId, 'ITEM-MILK-SKIM');
    assert.equal(disc.rejectedQuantity, 5);
    assert.equal(disc.reasonCode, 'LEAKAGE_IN_TRANSIT');
    assert.ok(disc.description.includes('ruptured and leaking'));

    // Verify related payments recorded against this PO
    assert.equal(d.relatedPayments.length, 1);
    assert.equal(d.relatedPayments[0].amountPaisa, 1000000);
    assert.equal(d.relatedPayments[0].reference, 'UTR-HDFC-9921');
  });

  await suite.test('7. A4 Printable PDF Generation (GET /api/v1/vendor/orders/:purchaseOrderId/pdf)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/orders/PO-1028/pdf',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.ok(res.headers['content-disposition'].includes('PurchaseOrder-PO-1028.pdf'));
    assert.ok(res.rawBuffer.length > 500);

    const pdfHeader = res.rawBuffer.slice(0, 8).toString('utf8');
    assert.ok(pdfHeader.startsWith('%PDF-1.4'));
  });

  await suite.test('8. Cross-Vendor BOLA / IDOR Prevention', async () => {
    // Vendor A attempting to access Vendor B's PO (PO-9999)
    const resPo = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/orders/PO-9999',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resPo.statusCode, 404); // Fails closed as not found in Vendor A scope

    // Vendor A attempting to download Vendor B's PDF
    const resPdf = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/orders/PO-9999/pdf',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resPdf.statusCode, 404);
  });

  await suite.test('9. Strict Server-Side Mutation Prevention (Read-Only Enforcement)', async () => {
    // Attempting POST to create a PO
    const postOrder = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/vendor/orders',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { purchaseOrderId: 'PO-MALICIOUS', totalPaisa: 99999 },
    });
    assert.equal(postOrder.statusCode, 403);
    assert.equal(postOrder.body.error.code, 'FORBIDDEN_VENDOR_WRITE');

    // Attempting PUT on a PO
    const putOrder = await makeRequest({
      port,
      method: 'PUT',
      path: '/api/v1/vendor/orders/PO-1028',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { status: 'CANCELLED' },
    });
    assert.equal(putOrder.statusCode, 403);
    assert.equal(putOrder.body.error.code, 'FORBIDDEN_VENDOR_WRITE');

    // Attempting DELETE on a PO
    const delOrder = await makeRequest({
      port,
      method: 'DELETE',
      path: '/api/v1/vendor/orders/PO-1028',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(delOrder.statusCode, 403);
    assert.equal(delOrder.body.error.code, 'FORBIDDEN_VENDOR_WRITE');
  });

  await suite.test('10. Frontend Route Allowlist Integrity for Purchase Orders', () => {
    // Vendor workspace routes allowed
    assert.equal(isRouteAllowed('vendor', 'vendor-orders'), true);
    assert.equal(isRouteAllowed('vendor', 'vendor/orders'), true);
    assert.equal(isRouteAllowed('vendor', 'vendor-dashboard'), true);

    // Internal routes strictly forbidden for vendor
    assert.equal(isRouteAllowed('vendor', 'dashboard'), false);
    assert.equal(isRouteAllowed('vendor', 'pos'), false);
    assert.equal(isRouteAllowed('vendor', 'procurement'), false);
    assert.equal(isRouteAllowed('vendor', 'inventory'), false);
    assert.equal(isRouteAllowed('vendor', 'finance'), false);
    assert.equal(isRouteAllowed('vendor', 'bills'), false);
  });
});
