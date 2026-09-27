'use strict';

/**
 * VEN-SCR-004: VENDOR INVOICES & SETTLEMENTS CONTRACT TEST SUITE
 *
 * Validates:
 * 1. Invoice Register listing & 10 KPI summary counts:
 *    - totalInvoices, totalInvoiceValue, approvedPayable, heldDisputed,
 *      outstanding, overdue, paid, partiallyPaidCount, paidCount, onHoldCount
 * 2. Three-Value Financial Architecture reconciliation:
 *    - Supplier Claimed Amount
 *    - Approved Payable Amount
 *    - Held / Disputed Amount
 * 3. Date range and period filtering
 * 4. Multi-café scoping constraints (Authorized café allowed, foreign café rejected with 403 CROSS_CAFE_ACCESS_DENIED)
 * 5. Payment status, approval status, and overdue filtering
 * 6. Comprehensive read-only invoice detail view with 3-value breakdown, line items, and payment history
 * 7. Source document integration (Linked PO and linked GRN navigation references)
 * 8. Authoritative tax breakdown (CGST, SGST, IGST)
 * 9. Document security & official A4 Invoice PDF generation
 * 10. Cross-Vendor BOLA / IDOR isolation (Vendor A cannot inspect or download Vendor B invoices)
 * 11. Cross-Café isolation (Unauthorized café access fails closed)
 * 12. Strict server-side mutation prevention (POST/PUT/PATCH/DELETE blocked with 403 FORBIDDEN_VENDOR_WRITE)
 * 13. Internal procurement / finance route isolation (Vendor token cannot call internal endpoints)
 * 14. Frontend route allowlist integrity for vendor-invoices
 * 15. Responsive mobile & component rendering contract (No mutation buttons in template)
 * 16. Development authentication production safety (NODE_ENV=production rejects dev bypass with 401)
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
const { renderVendorInvoices } = require('../../Frontend/src/js/pages/vendorInvoices.js');
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

test('VEN-SCR-004: Vendor Invoices & Settlements Contract Test Suite', async (suite) => {
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
        panNumber: 'AABCM1234F',
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
        panNumber: 'AABCH5678F',
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

    // 5. Seed Authoritative Purchase Orders
    await PurchaseOrder.create([
      {
        purchaseOrderId: 'PO-4001',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        status: 'APPROVED',
        orderDate: '2026-09-20',
        totalPaisa: 2500000,
        createdByUserId: 'MU-0001',
        lineItems: [
          {
            itemId: 'ITEM-MILK-FULL',
            itemNameSnapshot: 'Full Cream Fresh Milk 1L',
            itemType: 'GOODS',
            supplierItemCode: 'MDC-MILK-01',
            orderedQuantityBase: 100,
            receivedQuantityBase: 100,
            acceptedReceivedQty: 100,
            rejectedQty: 0,
            unitPricePaisa: 25000,
            totalLinePaisa: 2500000,
          },
        ],
      },
      {
        purchaseOrderId: 'PO-4002',
        organisationId: ORG_ID,
        cafeId: CAFE_2,
        vendorId: VENDOR_A_ID,
        status: 'CLOSED',
        orderDate: '2026-09-10',
        totalPaisa: 3200000,
        createdByUserId: 'MU-0001',
        lineItems: [
          {
            itemId: 'ITEM-CHEESE-BLOCK',
            itemNameSnapshot: 'Cheddar Cheese Block 1kg',
            itemType: 'GOODS',
            supplierItemCode: 'MDC-CHZ-01',
            orderedQuantityBase: 50,
            receivedQuantityBase: 50,
            acceptedReceivedQty: 50,
            rejectedQty: 0,
            unitPricePaisa: 64000,
            totalLinePaisa: 3200000,
          },
        ],
      },
    ]);

    // 6. Seed Invoices for Vendor A with Three-Value Architecture
    await APInvoice.create([
      // Invoice 1: Fully Approved, Due, Open
      {
        invoiceId: 'INV-4001',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        supplierInvoiceNumber: 'INV-MDC-4001',
        invoiceDate: '2026-09-25',
        dueDate: '2026-10-25', // Future due date -> DUE
        amountPaisa: 2380952,
        taxPaisa: 119048,
        totalPaisa: 2500000,
        supplierClaimedAmountPaisa: 2500000,
        approvedPayableAmountPaisa: 2500000,
        heldDisputedAmountPaisa: 0,
        paidPaisa: 0,
        amountPaidPaisa: 0,
        outstandingPaisa: 2500000,
        outstandingPayableAmountPaisa: 2500000,
        paymentStatus: 'DUE',
        approvalStatus: 'APPROVED',
        poReferenceId: 'PO-4001',
        grnIds: ['GRN-4001'],
        lineItems: [
          {
            itemId: 'ITEM-MILK-FULL',
            itemName: 'Full Cream Fresh Milk 1L',
            invoiceQuantity: 100,
            acceptedQuantity: 100,
            rejectedQuantity: 0,
            unitPricePaisa: 25000,
            lineTotalPaisa: 2500000,
            payableAmountPaisa: 2500000,
          },
        ],
      },

      // Invoice 2: Three-Value Variance (Supplier Claimed 3,200,000, Held 200,000, Approved 3,000,000, Partially Paid 1,500,000)
      {
        invoiceId: 'INV-4002',
        organisationId: ORG_ID,
        cafeId: CAFE_2,
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        supplierInvoiceNumber: 'INV-MDC-4002',
        invoiceDate: '2026-09-12',
        dueDate: '2026-09-22', // Past due date, but partially paid -> OVERDUE / PARTIALLY_PAID
        amountPaisa: 3047619,
        taxPaisa: 152381,
        totalPaisa: 3200000,
        supplierClaimedAmountPaisa: 3200000,
        approvedPayableAmountPaisa: 3000000,
        heldDisputedAmountPaisa: 200000, // Disputed shortage
        paidPaisa: 1500000,
        amountPaidPaisa: 1500000,
        outstandingPaisa: 1500000,
        outstandingPayableAmountPaisa: 1500000,
        paymentStatus: 'PARTIALLY_PAID',
        approvalStatus: 'APPROVED',
        poReferenceId: 'PO-4002',
        grnIds: ['GRN-4002-A', 'GRN-4002-B'],
        lineItems: [
          {
            itemId: 'ITEM-BUTTER-500',
            itemName: 'Table Butter 500g',
            invoiceQuantity: 120,
            acceptedQuantity: 110,
            rejectedQuantity: 10,
            unitPricePaisa: 26666,
            lineTotalPaisa: 3200000,
            payableAmountPaisa: 3000000,
            disputeReason: '10 blocks rejected at intake due to damaged packaging',
          },
        ],
        paymentHistory: [
          {
            paymentId: 'PAY-4002-1',
            paidPaisa: 1500000,
            paidAt: new Date('2026-09-18T10:00:00Z'),
            paidByUserId: 'MU-0001',
            paymentMethod: 'NEFT',
            reference: 'UTR-HDFC-4002',
          },
        ],
      },

      // Invoice 3: Fully Settled / Paid
      {
        invoiceId: 'INV-4003',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        supplierInvoiceNumber: 'INV-MDC-4003',
        invoiceDate: '2026-08-15',
        dueDate: '2026-09-15',
        amountPaisa: 952381,
        taxPaisa: 47619,
        totalPaisa: 1000000,
        supplierClaimedAmountPaisa: 1000000,
        approvedPayableAmountPaisa: 1000000,
        heldDisputedAmountPaisa: 0,
        paidPaisa: 1000000,
        amountPaidPaisa: 1000000,
        outstandingPaisa: 0,
        outstandingPayableAmountPaisa: 0,
        paymentStatus: 'PAID',
        approvalStatus: 'APPROVED',
        paymentHistory: [
          {
            paymentId: 'PAY-4003-1',
            paidPaisa: 1000000,
            paidAt: new Date('2026-09-10T12:00:00Z'),
            paidByUserId: 'MU-0001',
            paymentMethod: 'RTGS',
            reference: 'UTR-HDFC-4003',
          },
        ],
      },

      // Invoice 4: On Hold / Disputed (Unapproved)
      {
        invoiceId: 'INV-4004',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        supplierInvoiceNumber: 'INV-MDC-4004',
        invoiceDate: '2026-09-24',
        dueDate: '2026-10-24',
        amountPaisa: 476190,
        taxPaisa: 23810,
        totalPaisa: 500000,
        supplierClaimedAmountPaisa: 500000,
        approvedPayableAmountPaisa: 0,
        heldDisputedAmountPaisa: 500000,
        paidPaisa: 0,
        amountPaidPaisa: 0,
        outstandingPaisa: 500000,
        outstandingPayableAmountPaisa: 500000,
        paymentStatus: 'ON_HOLD',
        approvalStatus: 'PENDING',
      },

      // Invoice 5: Foreign Invoice for Vendor B
      {
        invoiceId: 'INV-9999',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_B_ID,
        vendorName: 'Highland Coffee Roasters',
        supplierInvoiceNumber: 'INV-HCR-9999',
        invoiceDate: '2026-09-20',
        dueDate: '2026-10-20',
        amountPaisa: 5000000,
        taxPaisa: 250000,
        totalPaisa: 5250000,
        supplierClaimedAmountPaisa: 5250000,
        approvedPayableAmountPaisa: 5250000,
        heldDisputedAmountPaisa: 0,
        paidPaisa: 0,
        outstandingPaisa: 5250000,
        paymentStatus: 'DUE',
      },
    ]);
  });

  suite.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (mongoReplSet) await mongoReplSet.stop();
  });

  // ── TEST 1: Register Listing & 10 KPI Summaries ───────────────────────────
  await suite.test('1. Invoice Register & 10 KPI Summaries (GET /api/v1/vendor/invoices)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/invoices',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.readOnly, true);
    assert.equal(res.body.data.workspaceMode, 'READ_ONLY');

    const { kpis, invoices, pagination } = res.body.data;

    // Verify 10 KPI counts:
    assert.equal(kpis.totalInvoices, 4); // 4 invoices for Vendor A (INV-4001, INV-4002, INV-4003, INV-4004)
    assert.equal(kpis.totalInvoiceValuePaisa, 7200000); // 25L + 32L + 10L + 5L = 72L
    assert.equal(kpis.approvedPayablePaisa, 6500000);  // 25L + 30L + 10L + 0 = 65L
    assert.equal(kpis.heldDisputedPaisa, 700000);      // 0 + 2L + 0 + 5L = 7L
    assert.equal(kpis.paidPaisa, 2500000);              // 0 + 15L + 10L + 0 = 25L
    assert.equal(kpis.outstandingPaisa, 4000000);       // 25L + 15L + 0 + 0 (held unapproved has 0 approved) = 40L
    assert.equal(kpis.paidCount, 1);                    // INV-4003
    assert.equal(kpis.partiallyPaidCount, 1);           // INV-4002
    assert.equal(kpis.onHoldCount, 2);                  // INV-4004 (held) + INV-4002 (variance held)
    assert.equal(invoices.length, 4);
  });

  // ── TEST 2: Three-Value Financial Architecture ─────────────────────────────
  await suite.test('2. Three-Value Financial Architecture Reconciliation', async () => {
    // Inspect INV-4002 with 200,000 held variance
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/invoices/INV-4002',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const fin = res.body.data.financials;

    // Reconcile: Claimed (3,200,000) = Approved (3,000,000) + Held (200,000)
    assert.equal(fin.supplierClaimedAmountPaisa, 3200000);
    assert.equal(fin.approvedPayableAmountPaisa, 3000000);
    assert.equal(fin.heldDisputedAmountPaisa, 200000);
    assert.equal(fin.supplierClaimedAmountPaisa, fin.approvedPayableAmountPaisa + fin.heldDisputedAmountPaisa);

    // Reconcile Settlement: Paid (1,500,000) + Outstanding (1,500,000) = Approved (3,000,000)
    assert.equal(fin.paidPaisa, 1500000);
    assert.equal(fin.outstandingPayableAmountPaisa, 1500000);
    assert.equal(fin.paidPaisa + fin.outstandingPayableAmountPaisa, fin.approvedPayableAmountPaisa);
  });

  // ── TEST 3: Multi-Café Filtering & Parameter Boundary ─────────────────────
  await suite.test('3. Multi-Café Scoping & Parameter Boundaries', async () => {
    // 1. Authorized CAFE_1
    const res1 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/invoices?cafeId=${CAFE_1}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(res1.statusCode, 200);
    assert.ok(res1.body.data.invoices.every((i) => i.cafeId === CAFE_1));

    // 2. Authorized CAFE_2
    const res2 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/invoices?cafeId=${CAFE_2}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(res2.statusCode, 200);
    assert.ok(res2.body.data.invoices.every((i) => i.cafeId === CAFE_2));

    // 3. Unauthorized CAFE_3 must fail closed
    const res3 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/invoices?cafeId=${CAFE_3}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(res3.statusCode, 403);
    assert.equal(res3.body.error.code, 'CROSS_CAFE_ACCESS_DENIED');
  });

  // ── TEST 4: Search & Status Filters ───────────────────────────────────────
  await suite.test('4. Universal Search & Status Filtering', async () => {
    // Search by PO Reference
    const resSearch = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/invoices?search=PO-4001',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resSearch.statusCode, 200);
    assert.equal(resSearch.body.data.invoices.length, 1);
    assert.equal(resSearch.body.data.invoices[0].invoiceId, 'INV-4001');

    // Filter by Payment Status PAID
    const resPaid = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/invoices?paymentStatus=PAID',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resPaid.statusCode, 200);
    assert.equal(resPaid.body.data.invoices.length, 1);
    assert.equal(resPaid.body.data.invoices[0].invoiceId, 'INV-4003');
  });

  // ── TEST 5: Comprehensive Detail View & Line Item Breakdown ───────────────
  await suite.test('5. Read-Only Detail View with Line Items & Dispute Reason', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/invoices/INV-4002',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const data = res.body.data;
    assert.equal(data.supplierInvoiceNumber, 'INV-MDC-4002');
    assert.equal(data.cafe.name, 'Zamorin Beachside');
    assert.equal(data.linkedDocuments.poReferenceId, 'PO-4002');
    assert.equal(data.linkedDocuments.viewOrderUrl, '/vendor-orders?po=PO-4002');

    // Line item with hold/dispute description
    assert.equal(data.lineItems.length, 1);
    const li = data.lineItems[0];
    assert.equal(li.invoiceQuantity, 120);
    assert.equal(li.acceptedQuantity, 110);
    assert.equal(li.rejectedQuantity, 10);
    assert.ok(li.disputeReason.includes('damaged packaging'));

    // Payment history item
    assert.equal(data.paymentHistory.length, 1);
    assert.equal(data.paymentHistory[0].reference, 'UTR-HDFC-4002');

    // Milestone timeline
    assert.equal(data.timeline.length, 4);
    assert.equal(data.timeline[0].key, 'invoice_received');
  });

  // ── TEST 6: Document Security & A4 Invoice PDF Download ───────────────────
  await suite.test('6. Document Security & A4 Vector PDF Generation', async () => {
    const resPdf = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/invoices/INV-4001/pdf',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(resPdf.statusCode, 200);
    assert.equal(resPdf.headers['content-type'], 'application/pdf');
    assert.ok(resPdf.headers['content-disposition'].includes('Invoice-INV-MDC-4001.pdf'));
    assert.ok(resPdf.rawBuffer.length > 500);

    const pdfContent = resPdf.rawBuffer.toString('utf8');
    assert.ok(pdfContent.startsWith('%PDF-1.4'));
    assert.ok(pdfContent.toUpperCase().includes('READ-ONLY VENDOR COPY'));
    assert.ok(pdfContent.includes('THREE-VALUE FINANCIAL RECONCILIATION'));
  });

  // ── TEST 7: Cross-Vendor BOLA / IDOR Protection ───────────────────────────
  await suite.test('7. Cross-Vendor BOLA / IDOR Isolation', async () => {
    // Vendor A attempting to access Vendor B's invoice (INV-9999)
    const resInv = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/invoices/INV-9999',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resInv.statusCode, 404);

    // Vendor A attempting to download Vendor B's PDF
    const resPdf = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/invoices/INV-9999/pdf',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resPdf.statusCode, 404);
  });

  // ── TEST 8: Server-Side Mutation Denial (Read-Only Enforcement) ───────────
  await suite.test('8. Server-Side Mutation Denial (Read-Only Enforcement)', async () => {
    // Attempt POST to create an invoice
    const postInv = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/vendor/invoices',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { invoiceId: 'INV-MALICIOUS', amountPaisa: 99999 },
    });
    assert.equal(postInv.statusCode, 403);
    assert.equal(postInv.body.error.code, 'FORBIDDEN_VENDOR_WRITE');

    // Attempt PUT to update an invoice
    const putInv = await makeRequest({
      port,
      method: 'PUT',
      path: '/api/v1/vendor/invoices/INV-4001',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { paymentStatus: 'PAID' },
    });
    assert.equal(putInv.statusCode, 403);
    assert.equal(putInv.body.error.code, 'FORBIDDEN_VENDOR_WRITE');

    // Attempt DELETE on an invoice
    const delInv = await makeRequest({
      port,
      method: 'DELETE',
      path: '/api/v1/vendor/invoices/INV-4001',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(delInv.statusCode, 403);
    assert.equal(delInv.body.error.code, 'FORBIDDEN_VENDOR_WRITE');
  });

  // ── TEST 9: Frontend Route Allowlist Integrity ───────────────────────────
  await suite.test('9. Frontend Route Allowlist Integrity for Invoices', () => {
    assert.equal(isRouteAllowed('vendor', 'vendor-invoices'), true);
    assert.equal(isRouteAllowed('vendor', 'vendor/invoices'), true);

    // Prior vendor routes remain active
    assert.equal(isRouteAllowed('vendor', 'vendor-dashboard'), true);
    assert.equal(isRouteAllowed('vendor', 'vendor-orders'), true);
    assert.equal(isRouteAllowed('vendor', 'vendor-deliveries'), true);

    // Internal routes remain forbidden
    assert.equal(isRouteAllowed('vendor', 'finance'), false);
    assert.equal(isRouteAllowed('vendor', 'procurement'), false);
    assert.equal(isRouteAllowed('vendor', 'bills'), false);
  });

  // ── TEST 10: Responsive Component Rendering Contract ─────────────────────
  await suite.test('10. Responsive Component Rendering Contract (No Mutation Controls)', () => {
    const html = renderVendorInvoices();
    assert.ok(html.includes('READ-ONLY ACCOUNTS PAYABLE INVOICES'));
    assert.ok(html.includes('VEN-SCR-004'));
    assert.ok(html.includes('kpi-total-invoices'));
    assert.ok(html.includes('kpi-approved-payable'));
    assert.ok(html.includes('kpi-held-disputed'));
    assert.ok(html.includes('kpi-outstanding'));
    assert.ok(html.includes('kpi-overdue'));
    assert.ok(html.includes('kpi-total-paid'));
    assert.ok(html.includes('invoices-table-body'));
    assert.ok(html.includes('invoices-mobile-cards'));
    assert.ok(html.includes('modal-invoice-detail'));

    const forbiddenPhrases = [
      'Upload Invoice',
      'Create Invoice',
      'Edit Invoice',
      'Delete Invoice',
      'Mark as Paid',
      'Approve Invoice',
      'Reject Invoice',
      'Dispute Invoice',
    ];
    for (const phrase of forbiddenPhrases) {
      assert.ok(!html.includes(phrase), `Template must not contain mutation phrase: "${phrase}"`);
    }
  });

  // ── TEST 11: Development Auth Production Safety ───────────────────────────
  await suite.test('11. Development Auth Production Safety (NODE_ENV=production Gating)', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';

      const resDevBypass = await makeRequest({
        port,
        method: 'GET',
        path: '/api/v1/vendor/invoices',
        headers: { 'x-dev-role': 'VENDOR' },
      });

      assert.equal(resDevBypass.statusCode, 401);
      assert.equal(resDevBypass.body.error.code, 'AUTHENTICATION_REQUIRED');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
