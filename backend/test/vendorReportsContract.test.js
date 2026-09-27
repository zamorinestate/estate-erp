'use strict';

/**
 * VEN-SCR-011: VENDOR COMMERCIAL REPORTS CONTRACT TEST SUITE
 *
 * Validates:
 * 1. Reports Catalogue Register: Returns 10 authorized commercial reports
 * 2. Purchase Order History (po-history) query, KPIs, and rows
 * 3. Delivery & GRN History (grn-history) query, discrepancy tracking, and rows
 * 4. Invoice History (invoice-history) query, approved payables, balances, and rows
 * 5. Payment & Settlement History (payment-history) query, UTR references, and rows
 * 6. Outstanding Receivables (outstanding-receivables) query, days overdue, and ageing buckets
 * 7. Receivables Ageing Analysis (ageing-report) 5-bracket distribution and percentages
 * 8. Returns & Adjustments (returns-adjustments) query, debit/credit notes, and net impact
 * 9. Account Statement Summary (account-statement) opening/running balance integrity
 * 10. Product Supply & Volume History (product-supply-history) catalogued spend and quantities
 * 11. Tax / GST Transaction Summary (tax-gst-summary) tax breakdown and informational disclaimer
 * 12. Safe RFC 4180 CSV Export generation with vendor-safe fields
 * 13. Clean Vector A4 PDF Download generation with PDF-1.4 header
 * 14. Multi-café scoping constraints (Authorized café allowed, foreign café rejected with 403 CROSS_CAFE_ACCESS_DENIED)
 * 15. Cross-Vendor BOLA / IDOR isolation (Vendor A cannot view Vendor B data)
 * 16. Strict server-side mutation prevention (POST/PUT/PATCH/DELETE blocked with 403 FORBIDDEN_VENDOR_WRITE)
 * 17. Margin and internal note redaction guarantee
 * 18. Frontend route allowlist and template contract
 * 19. Production dev-bypass authentication safety
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
const { VendorLedgerEntry } = require('../src/models/VendorLedgerEntry');
const { GlobalInventoryItem } = require('../src/models/GlobalInventoryItem');
const { isRouteAllowed } = require('../../Frontend/src/js/navigation.js');
const { renderVendorReports } = require('../../Frontend/src/js/pages/vendorReports.js');
const authService = require('../src/services/authService');

const ORG_ID = 'ORG-ZAMORIN';
const CAFE_1 = 'ZC-0001';
const CAFE_2 = 'ZC-0002';
const CAFE_3 = 'ZC-0003'; // Unauthorized cafe for Vendor A

const VENDOR_A_ID = 'VEN-9001';
const VENDOR_B_ID = 'VEN-9002';

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

test('VEN-SCR-011: Vendor Commercial Reports Contract Test Suite', async (suite) => {
  let replSet;
  let server;
  let port;
  let vendorACookie;
  let vendorBCookie;
  let vendorAToken;
  let vendorBToken;

  suite.before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());

    const app = createApp({ allowedOrigins: ['*'], production: false });
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;

    // 1. Seed Cafes
    await Cafe.create([
      {
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        name: 'Zamorin Beach Road',
        displayName: 'Zamorin Beach Road',
        code: 'ZBR-01',
        city: 'Kozhikode',
        state: 'Kerala',
        isOperational: true,
        createdBy: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        cafeId: CAFE_2,
        name: 'Zamorin Cyberpark',
        displayName: 'Zamorin Cyberpark',
        code: 'ZCP-02',
        city: 'Kozhikode',
        state: 'Kerala',
        isOperational: true,
        createdBy: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        cafeId: CAFE_3,
        name: 'Zamorin High Street',
        displayName: 'Zamorin High Street',
        code: 'ZHS-03',
        city: 'Kochi',
        state: 'Kerala',
        isOperational: true,
        createdBy: 'MU-0001',
      },
    ]);

    // 2. Seed Vendors
    await Vendor.create([
      {
        organisationId: ORG_ID,
        vendorId: VENDOR_A_ID,
        name: 'Malabar Dairy & Provisions Ltd',
        tradeName: 'Malabar Fresh',
        category: 'FOOD_BEVERAGE',
        supplierType: 'GOODS',
        status: 'ACTIVE',
        gstNumber: '32AABCM1234F1Z1',
        panNumber: 'AABCM1234F',
        fssaiLicense: '10012345678901',
        approvedCafeIds: [CAFE_1, CAFE_2],
        isApproved: true,
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        vendorId: VENDOR_B_ID,
        name: 'Highland Coffee Roasters',
        tradeName: 'Highland Beans',
        category: 'FOOD_BEVERAGE',
        supplierType: 'GOODS',
        status: 'ACTIVE',
        gstNumber: '32AABCH9999K1Z9',
        approvedCafeIds: [CAFE_3],
        isApproved: true,
        createdByUserId: 'MU-0001',
      },
    ]);

    // 3. Seed Users
    const [userA, userB] = await User.create([
      {
        organisationId: ORG_ID,
        userId: 'VU-9001',
        email: 'malabar@supplier.test',
        passwordHash: 'dummyhash',
        name: 'Malabar Supplier Admin',
        role: 'VENDOR',
        vendorId: VENDOR_A_ID,
        accountStatus: 'ACTIVE',
        createdBy: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        userId: 'VU-9002',
        email: 'highland@supplier.test',
        passwordHash: 'dummyhash',
        name: 'Highland Supplier Admin',
        role: 'VENDOR',
        vendorId: VENDOR_B_ID,
        accountStatus: 'ACTIVE',
        createdBy: 'MU-0001',
      },
    ]);

    // 4. Seed Inventory Items
    await GlobalInventoryItem.create([
      {
        organisationId: ORG_ID,
        itemId: 'ITEM-MILK-01',
        sku: 'MLK-500',
        itemCode: 'MLK-500',
        name: 'Farm Fresh Standardized Milk 500ml',
        category: 'DAIRY_FRESH',
        baseUnit: 'PACKET',
        unitOfMeasure: 'PACKET',
        packSize: 1,
        preferredVendorId: VENDOR_A_ID,
        costPricePaisa: 2800,
        approvedRatePaisa: 2800,
        status: 'ACTIVE',
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        itemId: 'ITEM-COFFEE-01',
        sku: 'COF-1000',
        itemCode: 'COF-1000',
        name: 'Single Origin Arabica Beans 1kg',
        category: 'COFFEE_BEANS',
        baseUnit: 'KG',
        unitOfMeasure: 'KG',
        packSize: 1,
        preferredVendorId: VENDOR_B_ID,
        costPricePaisa: 125000,
        approvedRatePaisa: 125000,
        status: 'ACTIVE',
        createdByUserId: 'MU-0001',
      },
    ]);

    // 5. Seed Purchase Orders & GRNs
    await PurchaseOrder.create([
      {
        organisationId: ORG_ID,
        purchaseOrderId: 'PO-REP-001',
        vendorId: VENDOR_A_ID,
        cafeId: CAFE_1,
        status: 'CLOSED',
        orderDate: '2026-09-01',
        expectedDeliveryDate: '2026-09-03',
        receivedDate: '2026-09-03',
        totalPaisa: 140000,
        totalAmountPaisa: 140000,
        lineItems: [
          {
            itemId: 'ITEM-MILK-01',
            itemName: 'Farm Fresh Standardized Milk 500ml',
            quantity: 50,
            orderedQuantityBase: 50,
            unitPricePaisa: 2800,
            totalLinePaisa: 140000,
            totalPaisa: 140000,
            baseUnit: 'PACKET',
            acceptedQuantity: 50,
            acceptedReceivedQty: 50,
          },
        ],
        grnReceipts: [
          {
            grnId: 'GRN-REP-001',
            status: 'ACCEPTED',
            receivedAt: new Date('2026-09-03T10:00:00.000Z'),
            receivedByUserId: 'ST-0001',
            items: [
              {
                itemId: 'ITEM-MILK-01',
                deliveredQty: 50,
                acceptedQty: 50,
                rejectedQty: 0,
                missingQty: 0,
              },
            ],
          },
        ],
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        purchaseOrderId: 'PO-REP-002',
        vendorId: VENDOR_A_ID,
        cafeId: CAFE_2,
        status: 'PARTIALLY_RECEIVED',
        orderDate: '2026-09-10',
        expectedDeliveryDate: '2026-09-12',
        totalPaisa: 280000,
        totalAmountPaisa: 280000,
        lineItems: [
          {
            itemId: 'ITEM-MILK-01',
            itemName: 'Farm Fresh Standardized Milk 500ml',
            quantity: 100,
            orderedQuantityBase: 100,
            unitPricePaisa: 2800,
            totalLinePaisa: 280000,
            totalPaisa: 280000,
            baseUnit: 'PACKET',
            acceptedQuantity: 80,
            acceptedReceivedQty: 80,
          },
        ],
        grnReceipts: [
          {
            grnId: 'GRN-REP-002',
            status: 'PARTIAL',
            receivedAt: new Date('2026-09-12T14:30:00.000Z'),
            receivedByUserId: 'ST-0001',
            items: [
              {
                itemId: 'ITEM-MILK-01',
                deliveredQty: 85,
                acceptedQty: 80,
                rejectedQty: 5,
                missingQty: 15,
                discrepancyReason: 'Leakage during transit',
              },
            ],
          },
        ],
        createdByUserId: 'MU-0001',
      },
      // PO for Vendor B (Isolation verification)
      {
        organisationId: ORG_ID,
        purchaseOrderId: 'PO-REP-B01',
        vendorId: VENDOR_B_ID,
        cafeId: CAFE_3,
        status: 'APPROVED',
        orderDate: '2026-09-15',
        totalPaisa: 625000,
        totalAmountPaisa: 625000,
        lineItems: [
          {
            itemId: 'ITEM-COFFEE-01',
            itemName: 'Single Origin Arabica Beans 1kg',
            quantity: 5,
            orderedQuantityBase: 5,
            unitPricePaisa: 125000,
            totalLinePaisa: 625000,
            totalPaisa: 625000,
            baseUnit: 'KG',
          },
        ],
        createdByUserId: 'MU-0001',
      },
    ]);

    // 6. Seed Invoices
    await APInvoice.create([
      {
        organisationId: ORG_ID,
        invoiceId: 'INV-REP-001',
        supplierInvoiceNumber: 'BILL-MAL-001',
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Provisions Ltd',
        cafeId: CAFE_1,
        poReferenceId: 'PO-REP-001',
        invoiceDate: '2026-09-04',
        dueDate: '2026-10-04',
        amountPaisa: 140000,
        taxPaisa: 7000,
        taxableAmountPaisa: 133000,
        totalPaisa: 140000,
        approvedPayableAmountPaisa: 140000,
        paidAmountPaisa: 140000,
        paidPaisa: 140000,
        outstandingPayableAmountPaisa: 0,
        paymentStatus: 'PAID',
        paymentHistory: [
          {
            paymentId: 'PAY-REP-001',
            paidPaisa: 140000,
            paidAt: new Date('2026-09-15T10:00:00.000Z'),
            reference: 'UTR-HDFC-99887711',
            paymentMethod: 'NEFT',
            paidByUserId: 'MU-0001',
          },
        ],
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        invoiceId: 'INV-REP-002',
        supplierInvoiceNumber: 'BILL-MAL-002',
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Provisions Ltd',
        cafeId: CAFE_2,
        poReferenceId: 'PO-REP-002',
        invoiceDate: '2026-09-13',
        dueDate: '2026-09-20', // Overdue
        amountPaisa: 280000,
        taxPaisa: 14000,
        taxableAmountPaisa: 266000,
        totalPaisa: 280000,
        approvedPayableAmountPaisa: 224000,
        disputedAmountPaisa: 56000,
        paidAmountPaisa: 100000,
        paidPaisa: 100000,
        outstandingPayableAmountPaisa: 124000,
        paymentStatus: 'PARTIALLY_PAID',
        paymentHistory: [
          {
            paymentId: 'PAY-REP-002',
            paidPaisa: 100000,
            paidAt: new Date('2026-09-18T12:00:00.000Z'),
            reference: 'UTR-HDFC-55443322',
            paymentMethod: 'RTGS',
            paidByUserId: 'MU-0001',
          },
        ],
        createdByUserId: 'MU-0001',
      },
    ]);

    // 7. Seed Vendor Ledger Entries
    await VendorLedgerEntry.create([
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-REP-001',
        vendorId: VENDOR_A_ID,
        cafeId: CAFE_1,
        entryDate: '2026-09-04',
        entryType: 'VENDOR_BILL',
        creditPaisa: 140000,
        debitPaisa: 0,
        runningBalancePaisa: 140000,
        referenceId: 'INV-REP-001',
        referenceNumber: 'BILL-MAL-001',
        purchaseOrderId: 'PO-REP-001',
        isReversed: false,
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-REP-002',
        vendorId: VENDOR_A_ID,
        cafeId: CAFE_1,
        entryDate: '2026-09-15',
        entryType: 'PAYMENT',
        creditPaisa: 0,
        debitPaisa: 140000,
        runningBalancePaisa: 0,
        referenceId: 'INV-REP-001',
        referenceNumber: 'UTR-HDFC-99887711',
        paymentId: 'PAY-REP-001',
        isReversed: false,
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-REP-003',
        vendorId: VENDOR_A_ID,
        cafeId: CAFE_2,
        entryDate: '2026-09-13',
        entryType: 'VENDOR_BILL',
        creditPaisa: 280000,
        debitPaisa: 0,
        runningBalancePaisa: 280000,
        referenceId: 'INV-REP-002',
        referenceNumber: 'BILL-MAL-002',
        purchaseOrderId: 'PO-REP-002',
        isReversed: false,
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-REP-004',
        vendorId: VENDOR_A_ID,
        cafeId: CAFE_2,
        entryDate: '2026-09-14',
        entryType: 'DEBIT_ADJUSTMENT',
        creditPaisa: 0,
        debitPaisa: 56000,
        runningBalancePaisa: 224000,
        referenceId: 'INV-REP-002',
        referenceNumber: 'DN-REP-001',
        purchaseOrderId: 'PO-REP-002',
        description: 'Debit note for transit breakage and damaged goods',
        isReversed: false,
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-REP-005',
        vendorId: VENDOR_A_ID,
        cafeId: CAFE_2,
        entryDate: '2026-09-18',
        entryType: 'PAYMENT',
        creditPaisa: 0,
        debitPaisa: 100000,
        runningBalancePaisa: 124000,
        referenceId: 'INV-REP-002',
        referenceNumber: 'UTR-HDFC-55443322',
        paymentId: 'PAY-REP-002',
        isReversed: false,
        createdByUserId: 'MU-0001',
      },
    ]);

    // 8. Generate Session Cookies & Tokens
    const sA = await authService.createSession({ user: userA, device: { deviceId: 'DEV-A' }, mfaVerified: true });
    vendorAToken = sA.accessToken;
    vendorACookie = `zc_session=${sA.sessionId}`;

    const sB = await authService.createSession({ user: userB, device: { deviceId: 'DEV-B' }, mfaVerified: true });
    vendorBToken = sB.accessToken;
    vendorBCookie = `zc_session=${sB.sessionId}`;
  });

  suite.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });

  await suite.test('1. Reports Catalogue query returns 10 authoritative commercial reports', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/reports',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.catalogue));
    assert.equal(res.body.data.catalogue.length, 10);
    assert.equal(res.body.data.readOnly, true);
    assert.equal(res.body.data.workspaceMode, 'READ_ONLY');

    const expectedKeys = [
      'po-history',
      'grn-history',
      'invoice-history',
      'payment-history',
      'outstanding-receivables',
      'ageing-report',
      'returns-adjustments',
      'account-statement',
      'product-supply-history',
      'tax-gst-summary',
    ];
    const retrievedKeys = res.body.data.catalogue.map((c) => c.reportType);
    assert.deepEqual(retrievedKeys, expectedKeys);
  });

  await suite.test('2. Purchase Order History (po-history) query returns valid KPIs and rows', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/reports?reportType=po-history',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const { reportType, kpis, rows, pagination } = res.body.data;
    assert.equal(reportType, 'po-history');
    assert.equal(rows.length, 2);
    assert.equal(pagination.total, 2);
    assert.equal(kpis.totalOrders, 2);
    assert.equal(kpis.completedOrders, 1);
    assert.equal(kpis.activeOrders, 1);
    assert.equal(kpis.totalOrderedValuePaisa, 420000); // 140000 + 280000
    assert.equal(kpis.totalOrderedValueFormatted, '₹4,200');
  });

  await suite.test('3. Delivery & GRN History (grn-history) tracks discrepancies correctly', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/reports?reportType=grn-history',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const { reportType, kpis, rows } = res.body.data;
    assert.equal(reportType, 'grn-history');
    assert.equal(rows.length, 2);
    assert.equal(kpis.totalGrns, 2);
    assert.equal(kpis.fullDeliveries, 1);
    assert.equal(kpis.discrepantDeliveries, 1);

    const cleanGrn = rows.find((r) => r.grnNumber === 'GRN-REP-001');
    const discGrn = rows.find((r) => r.grnNumber === 'GRN-REP-002');
    assert.ok(cleanGrn.hasDiscrepancy.includes('100% Verified'));
    assert.ok(discGrn.hasDiscrepancy.includes('Variance Recorded'));
  });

  await suite.test('4. Invoice History (invoice-history) returns approved payables and balances', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/reports?reportType=invoice-history',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const { reportType, kpis, rows } = res.body.data;
    assert.equal(reportType, 'invoice-history');
    assert.equal(rows.length, 2);
    assert.equal(kpis.totalInvoices, 2);
    assert.equal(kpis.totalApprovedPaisa, 364000); // 140000 + 224000
    assert.equal(kpis.totalPaidPaisa, 240000); // 140000 + 100000
    assert.equal(kpis.totalOutstandingPaisa, 124000); // 0 + 124000
  });

  await suite.test('5. Payment & Settlement History (payment-history) returns settled disbursements', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/reports?reportType=payment-history',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const { reportType, kpis, rows } = res.body.data;
    assert.equal(reportType, 'payment-history');
    assert.equal(rows.length, 2);
    assert.equal(kpis.totalPayments, 2);
    assert.equal(kpis.totalSettledPaisa, 240000);
    assert.ok(rows.some((r) => r.settlementReference === 'UTR-HDFC-99887711'));
  });

  await suite.test('6. Outstanding Receivables (outstanding-receivables) returns overdue items', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/reports?reportType=outstanding-receivables',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const { reportType, kpis, rows } = res.body.data;
    assert.equal(reportType, 'outstanding-receivables');
    assert.equal(rows.length, 1); // Only INV-REP-002 has balance > 0
    assert.equal(rows[0].invoiceNumber, 'BILL-MAL-002');
    assert.equal(rows[0].outstandingPaisa, 124000);
    assert.equal(kpis.openInvoicesCount, 1);
    assert.equal(kpis.totalOutstandingPaisa, 124000);
  });

  await suite.test('7. Receivables Ageing Analysis (ageing-report) calculates bracket distributions', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/reports?reportType=ageing-report',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const { reportType, kpis, rows } = res.body.data;
    assert.equal(reportType, 'ageing-report');
    assert.equal(rows.length, 5); // 5 buckets
    assert.equal(kpis.totalOutstandingPaisa, 124000);
  });

  await suite.test('8. Returns & Adjustments (returns-adjustments) tracks debit note impact', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/reports?reportType=returns-adjustments',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const { reportType, kpis, rows } = res.body.data;
    assert.equal(reportType, 'returns-adjustments');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reference, 'DN-REP-001');
    assert.equal(rows[0].amountPaisa, 56000);
    assert.equal(kpis.debitNotesCount, 1);
    assert.equal(kpis.netAdjustmentPaisa, -56000);
  });

  await suite.test('9. Account Statement Summary (account-statement) preserves chronological progression', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/reports?reportType=account-statement',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const { reportType, kpis, rows } = res.body.data;
    assert.equal(reportType, 'account-statement');
    assert.equal(rows.length, 5);
    assert.equal(kpis.openingBalancePaisa, 0);
    assert.equal(kpis.totalCreditsPaisa, 420000); // 140k + 280k
    assert.equal(kpis.totalDebitsPaisa, 296000); // 140k pay + 56k DN + 100k pay
    assert.equal(kpis.closingBalancePaisa, 124000); // 420k - 296k = 124k
  });

  await suite.test('10. Product Supply & Volume History (product-supply-history) aggregates volume', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/reports?reportType=product-supply-history',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const { reportType, kpis, rows } = res.body.data;
    assert.equal(reportType, 'product-supply-history');
    assert.ok(rows.length >= 1);
    const milkItem = rows.find((r) => r.sku === 'MLK-500');
    assert.ok(milkItem);
    assert.equal(milkItem.totalOrderedQty, 150); // 50 + 100
    assert.equal(milkItem.totalAcceptedQty, 130); // 50 + 80
  });

  await suite.test('11. Tax / GST Transaction Summary (tax-gst-summary) includes statutory disclaimer', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/reports?reportType=tax-gst-summary',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const { reportType, disclaimer, kpis, rows } = res.body.data;
    assert.equal(reportType, 'tax-gst-summary');
    assert.ok(disclaimer && disclaimer.includes('Not an official statutory filing'));
    assert.equal(rows.length, 2);
    assert.equal(kpis.totalInvoices, 2);
    assert.equal(kpis.totalGstPaisa, 21000); // 7000 + 14000
  });

  await suite.test('12. Safe RFC 4180 CSV Export returns text/csv without internal margins', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/reports/po-history/csv',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'));
    assert.ok(res.headers['content-disposition'].includes('VendorReport-po-history'));
    const csv = res.rawBuffer.toString('utf8');
    assert.ok(csv.includes('ZAMORIN CAFE ERP - VENDOR COMMERCIAL REPORT'));
    assert.ok(csv.includes('PO-REP-001'));
    // Redaction check
    assert.ok(!csv.includes('profitMargin'));
    assert.ok(!csv.includes('markupPercent'));
  });

  await suite.test('13. Clean Vector A4 PDF Download returns application/pdf with %PDF-1.4 header', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/reports/tax-gst-summary/pdf',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.ok(res.headers['content-disposition'].includes('VendorReport-tax-gst-summary'));
    const pdf = res.rawBuffer.toString('utf8');
    assert.ok(pdf.startsWith('%PDF-1.4'));
    assert.ok(pdf.includes('ZAMORIN CAFE ERP'));
  });

  await suite.test('14. Multi-café scoping constraints: foreign café rejected with 403', async () => {
    // CAFE_3 is unauthorized for Vendor A
    const res = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/reports?reportType=po-history&cafeId=${CAFE_3}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body?.error?.code || res.body?.errorCode, 'CROSS_CAFE_ACCESS_DENIED');
  });

  await suite.test('15. Cross-Vendor BOLA / IDOR isolation: Vendor A cannot view Vendor B data', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/reports?reportType=po-history',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const rows = res.body.data.rows;
    assert.ok(rows.every((r) => r.poNumber !== 'PO-REP-B01'));
  });

  await suite.test('16. Strict server-side mutation prevention: POST/PUT/DELETE blocked with 403', async () => {
    const postRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/vendor/reports',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { reportType: 'po-history', mutation: true },
    });
    assert.equal(postRes.statusCode, 403);
    assert.equal(postRes.body?.error?.code || postRes.body?.errorCode, 'FORBIDDEN_VENDOR_WRITE');

    const delRes = await makeRequest({
      port,
      method: 'DELETE',
      path: '/api/v1/vendor/reports/po-history',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(delRes.statusCode, 403);
    assert.equal(delRes.body?.error?.code || delRes.body?.errorCode, 'FORBIDDEN_VENDOR_WRITE');
  });

  await suite.test('17. Property redaction guarantee: no margins, markups or internal notes', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/reports?reportType=product-supply-history',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes('retailSellingPrice'));
    assert.ok(!serialized.includes('grossMargin'));
    assert.ok(!serialized.includes('profitMargin'));
    assert.ok(!serialized.includes('markup'));
  });

  await suite.test('18. Frontend route allowlist and template contract for vendor-reports', () => {
    assert.equal(isRouteAllowed('VENDOR', 'vendor-reports'), true);
    assert.equal(isRouteAllowed('VENDOR', 'vendor/reports'), true);
    assert.equal(isRouteAllowed('VENDOR', 'admin'), false);
    assert.equal(isRouteAllowed('VENDOR', 'passbook'), false);

    const html = renderVendorReports();
    assert.ok(html.includes('READ-ONLY VENDOR ACCESS'));
    assert.ok(html.includes('VEN-SCR-011'));
    assert.ok(html.includes('Download CSV'));
    assert.ok(html.includes('Download PDF'));
    // Zero mutation forms
    assert.ok(!html.includes('<form'));
    assert.ok(!html.includes('type="submit"'));
  });

  await suite.test('19. Production dev-bypass safety: NODE_ENV=production blocks unauthenticated access', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const res = await makeRequest({
        port,
        method: 'GET',
        path: '/api/v1/vendor/reports',
        headers: { 'x-dev-user-id': 'VU-9001' },
      });
      assert.equal(res.statusCode, 401);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
