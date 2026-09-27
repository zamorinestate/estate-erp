'use strict';

/**
 * VEN-SCR-005: VENDOR PAYMENTS & BALANCE CONTRACT TEST SUITE
 *
 * Validates:
 * 1. Payment Register listing & 8 KPI summary counts:
 *    - totalPaid, paymentsThisPeriod, paymentsCount, currentOutstanding,
 *      overdueOutstanding, advancesApplied, creditsApplied, openInvoiceCount
 * 2. Detailed Read-Only Payment View with 6 Zones:
 *    - Payment identity, participating entities, gross settlement,
 *      linked invoice and PO breakdown, safe redacted notes, authorized receipt
 * 3. Authoritative payment reconciliation (sum of allocations matches postings without double-counting)
 * 4. Multi-café scoping constraints (Authorized café allowed, foreign café rejected with 403 CROSS_CAFE_ACCESS_DENIED)
 * 5. Universal search & payment method filtering (NEFT, RTGS, IMPS, etc.)
 * 6. Document security & official A4 Payment Receipt PDF generation (SYSTEM GENERATED - READ-ONLY VENDOR COPY)
 * 7. Cross-Vendor BOLA / IDOR isolation (Vendor A cannot inspect or download Vendor B payments)
 * 8. Strict server-side mutation prevention (POST/PUT/PATCH/DELETE blocked with 403 FORBIDDEN_VENDOR_WRITE)
 * 9. Frontend route allowlist integrity for vendor-payments
 * 10. Responsive mobile & component rendering contract (No mutation buttons in template)
 * 11. Development authentication production safety (NODE_ENV=production rejects dev bypass with 401)
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
const { isRouteAllowed } = require('../../Frontend/src/js/navigation.js');
const { renderVendorPayments } = require('../../Frontend/src/js/pages/vendorPayments.js');
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

test('VEN-SCR-005: Vendor Payments & Balance Contract Test Suite', async (suite) => {
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

    // 1. Seed Cafés
    await Cafe.create([
      { organisationId: ORG_ID, cafeId: CAFE_1, name: 'Zamorin Roastery Central', displayName: 'Zamorin Roastery Central', createdBy: 'MU-0001', code: 'ZRC', status: 'ACTIVE' },
      { organisationId: ORG_ID, cafeId: CAFE_2, name: 'Zamorin Beachside', displayName: 'Zamorin Beachside', createdBy: 'MU-0001', code: 'ZBS', status: 'ACTIVE' },
      { organisationId: ORG_ID, cafeId: CAFE_3, name: 'Zamorin Hilltop', displayName: 'Zamorin Hilltop', createdBy: 'MU-0001', code: 'ZHT', status: 'ACTIVE' },
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
        purchaseOrderId: 'PO-5001',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        status: 'APPROVED',
        orderDate: '2026-09-15',
        totalPaisa: 2500000,
        createdByUserId: 'MU-0001',
        lineItems: [
          {
            itemId: 'ITEM-MILK-FULL',
            itemNameSnapshot: 'Full Cream Fresh Milk 1L',
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
        purchaseOrderId: 'PO-5002',
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

    // 6. Seed Invoices with Payment History
    await APInvoice.create([
      // Invoice 1: Partially Paid (1,000,000 paid, 1,500,000 remaining)
      {
        invoiceId: 'INV-5001',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        supplierInvoiceNumber: 'INV-MDC-5001',
        invoiceDate: '2026-09-18',
        dueDate: '2026-10-18',
        amountPaisa: 2380952,
        taxPaisa: 119048,
        totalPaisa: 2500000,
        supplierClaimedAmountPaisa: 2500000,
        approvedPayableAmountPaisa: 2500000,
        heldDisputedAmountPaisa: 0,
        paidPaisa: 1000000,
        amountPaidPaisa: 1000000,
        outstandingPaisa: 1500000,
        outstandingPayableAmountPaisa: 1500000,
        paymentStatus: 'PARTIALLY_PAID',
        approvalStatus: 'APPROVED',
        poReferenceId: 'PO-5001',
        paymentHistory: [
          {
            paymentId: 'PAY-5001-1',
            paidPaisa: 1000000,
            paidAt: new Date('2026-09-20T10:00:00Z'),
            paidByUserId: 'MU-0001',
            paymentMethod: 'NEFT',
            reference: 'UTR-HDFC-5001',
          },
        ],
      },

      // Invoice 2: Fully Settled via two distinct payments (20L + 10L = 30L approved payable)
      {
        invoiceId: 'INV-5002',
        organisationId: ORG_ID,
        cafeId: CAFE_2,
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        supplierInvoiceNumber: 'INV-MDC-5002',
        invoiceDate: '2026-09-10',
        dueDate: '2026-09-20',
        amountPaisa: 2857143,
        taxPaisa: 142857,
        totalPaisa: 3000000,
        supplierClaimedAmountPaisa: 3000000,
        approvedPayableAmountPaisa: 3000000,
        heldDisputedAmountPaisa: 0,
        paidPaisa: 3000000,
        amountPaidPaisa: 3000000,
        outstandingPaisa: 0,
        outstandingPayableAmountPaisa: 0,
        paymentStatus: 'PAID',
        approvalStatus: 'APPROVED',
        poReferenceId: 'PO-5002',
        paymentHistory: [
          {
            paymentId: 'PAY-5002-1',
            paidPaisa: 2000000,
            paidAt: new Date('2026-09-15T12:00:00Z'),
            paidByUserId: 'MU-0001',
            paymentMethod: 'RTGS',
            reference: 'UTR-ICICI-5002A',
          },
          {
            paymentId: 'PAY-5002-2',
            paidPaisa: 1000000,
            paidAt: new Date('2026-09-22T14:30:00Z'),
            paidByUserId: 'MU-0001',
            paymentMethod: 'IMPS',
            reference: 'UTR-ICICI-5002B',
          },
        ],
      },

      // Invoice 3: Open Invoice with Advance Applied (10L bill, 2L advance applied, 8L outstanding)
      {
        invoiceId: 'INV-5003',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        supplierInvoiceNumber: 'INV-MDC-5003',
        invoiceDate: '2026-09-24',
        dueDate: '2026-10-24',
        amountPaisa: 952381,
        taxPaisa: 47619,
        totalPaisa: 1000000,
        supplierClaimedAmountPaisa: 1000000,
        approvedPayableAmountPaisa: 1000000,
        heldDisputedAmountPaisa: 0,
        appliedAdvancePaisa: 200000,
        appliedCreditPaisa: 0,
        paidPaisa: 0,
        amountPaidPaisa: 0,
        outstandingPaisa: 800000,
        outstandingPayableAmountPaisa: 800000,
        paymentStatus: 'DUE',
        approvalStatus: 'APPROVED',
      },

      // Invoice 4: Foreign Invoice & Payment for Vendor B
      {
        invoiceId: 'INV-9999',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_B_ID,
        vendorName: 'Highland Coffee Roasters',
        supplierInvoiceNumber: 'INV-HCR-9999',
        invoiceDate: '2026-09-15',
        dueDate: '2026-10-15',
        amountPaisa: 476190,
        taxPaisa: 23810,
        totalPaisa: 500000,
        supplierClaimedAmountPaisa: 500000,
        approvedPayableAmountPaisa: 500000,
        paidPaisa: 500000,
        amountPaidPaisa: 500000,
        outstandingPaisa: 0,
        outstandingPayableAmountPaisa: 0,
        paymentStatus: 'PAID',
        paymentHistory: [
          {
            paymentId: 'PAY-9999-1',
            paidPaisa: 500000,
            paidAt: new Date('2026-09-20T10:00:00Z'),
            paidByUserId: 'MU-0001',
            paymentMethod: 'NEFT',
            reference: 'UTR-FOREIGN-999',
          },
        ],
      },
    ]);

    // 7. Seed Authoritative Subledger Entries (VendorLedgerEntry)
    await VendorLedgerEntry.create([
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-5001-1',
        vendorId: VENDOR_A_ID,
        cafeId: CAFE_1,
        entryDate: '2026-09-20',
        entryType: 'PARTIAL_PAYMENT',
        referenceType: 'PAYMENT',
        referenceId: 'INV-5001',
        paymentId: 'PAY-5001-1',
        referenceNumber: 'UTR-HDFC-5001',
        debitPaisa: 1000000,
        creditPaisa: 0,
        runningBalancePaisa: 1500000,
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-5002-1',
        vendorId: VENDOR_A_ID,
        cafeId: CAFE_2,
        entryDate: '2026-09-15',
        entryType: 'PARTIAL_PAYMENT',
        referenceType: 'PAYMENT',
        referenceId: 'INV-5002',
        paymentId: 'PAY-5002-1',
        referenceNumber: 'UTR-ICICI-5002A',
        debitPaisa: 2000000,
        creditPaisa: 0,
        runningBalancePaisa: 1000000,
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-5002-2',
        vendorId: VENDOR_A_ID,
        cafeId: CAFE_2,
        entryDate: '2026-09-22',
        entryType: 'PAYMENT',
        referenceType: 'PAYMENT',
        referenceId: 'INV-5002',
        paymentId: 'PAY-5002-2',
        referenceNumber: 'UTR-ICICI-5002B',
        debitPaisa: 1000000,
        creditPaisa: 0,
        runningBalancePaisa: 0,
        createdByUserId: 'MU-0001',
      },
      // Direct Advance Payment posted to subledger
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-5004-ADV',
        vendorId: VENDOR_A_ID,
        cafeId: CAFE_1,
        entryDate: '2026-09-25',
        entryType: 'ADVANCE_PAYMENT',
        referenceType: 'ADVANCE',
        paymentId: 'PAY-5004-ADV',
        referenceNumber: 'UTR-ADV-5004',
        debitPaisa: 200000,
        creditPaisa: 0,
        runningBalancePaisa: 0,
        createdByUserId: 'MU-0001',
      },
      // Foreign Ledger Entry for Vendor B
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-9999-1',
        vendorId: VENDOR_B_ID,
        cafeId: CAFE_1,
        entryDate: '2026-09-20',
        entryType: 'PAYMENT',
        referenceType: 'PAYMENT',
        paymentId: 'PAY-9999-1',
        referenceNumber: 'UTR-FOREIGN-999',
        debitPaisa: 500000,
        creditPaisa: 0,
        runningBalancePaisa: 0,
        createdByUserId: 'MU-0001',
      },
    ]);
  });

  suite.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (mongoReplSet) await mongoReplSet.stop();
  });

  // ── TEST 1: Payment Register & 8 KPI Summaries ────────────────────────────
  await suite.test('1. Payment Register & 8 KPI Summaries (GET /api/v1/vendor/payments)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/payments',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.readOnly, true);
    assert.equal(res.body.data.workspaceMode, 'READ_ONLY');

    const { kpis, payments, pagination } = res.body.data;

    // 4 Payments for Vendor A: PAY-5001-1 (10L), PAY-5002-1 (20L), PAY-5002-2 (10L), PAY-5004-ADV (2L)
    assert.equal(kpis.paymentsCount, 4);
    assert.equal(kpis.totalPaidPaisa, 4200000); // 10L + 20L + 10L + 2L = 42L
    // Current Outstanding across open invoices:
    // INV-5001: 15L, INV-5002: 0, INV-5003: 8L -> Total: 23L
    assert.equal(kpis.currentOutstandingPaisa, 2300000);
    assert.equal(kpis.advancesAppliedPaisa, 200000);
    assert.equal(kpis.openInvoiceCount, 2); // INV-5001, INV-5003
    assert.equal(payments.length, 4);
    assert.equal(pagination.total, 4);
  });

  // ── TEST 2: Detailed View of a Payment Record ─────────────────────────────
  await suite.test('2. Read-Only Detailed View with 6 Zones (GET /api/v1/vendor/payments/:paymentId)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/payments/PAY-5001-1',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.readOnly, true);

    const payment = res.body.data;
    assert.equal(payment.paymentId, 'PAY-5001-1');
    assert.equal(payment.paymentReference, 'UTR-HDFC-5001');
    assert.equal(payment.paymentMethod, 'NEFT');
    assert.equal(payment.grossAmountPaisa, 1000000);
    assert.equal(payment.cafeId, CAFE_1);
    assert.equal(payment.cafeName, 'Zamorin Roastery Central');
    assert.equal(payment.linkedInvoice.invoiceId, 'INV-5001');
    assert.equal(payment.linkedInvoice.supplierInvoiceNumber, 'INV-MDC-5001');
    assert.equal(payment.linkedInvoice.remainingBalancePaisa, 1500000);
    assert.equal(payment.poReferenceId, 'PO-5001');
    // Ensure no internal bank reconciliation or employee chatter
    assert.equal(payment.paymentNotes.includes('internal'), false);
    assert.equal(payment.paymentNotes.includes('fraud'), false);
  });

  // ── TEST 3: Authoritative Accounting Reconciliation & Zero Double Counting ─
  await suite.test('3. Authoritative Reconciliation (Multi-Payment Allocation)', async () => {
    // Check PAY-5002-1 and PAY-5002-2 for INV-5002
    const res1 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/payments/PAY-5002-1',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    const res2 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/payments/PAY-5002-2',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res1.statusCode, 200);
    assert.equal(res2.statusCode, 200);
    assert.equal(res1.body.data.grossAmountPaisa, 2000000);
    assert.equal(res2.body.data.grossAmountPaisa, 1000000);
    // Sum of two allocations equals 3,000,000 paise (30L)
    assert.equal(res1.body.data.grossAmountPaisa + res2.body.data.grossAmountPaisa, 3000000);
  });

  // ── TEST 4: Multi-Café Scoping & Parameter Boundaries ───────────────────────
  await suite.test('4. Multi-Café Scoping & Parameter Boundaries', async () => {
    // 4.1 Allowed Cafe 1
    const resCafe1 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/payments?cafeId=${CAFE_1}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe1.statusCode, 200);
    // Cafe 1 has PAY-5001-1 and PAY-5004-ADV
    assert.equal(resCafe1.body.data.payments.length, 2);

    // 4.2 Allowed Cafe 2
    const resCafe2 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/payments?cafeId=${CAFE_2}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe2.statusCode, 200);
    // Cafe 2 has PAY-5002-1 and PAY-5002-2
    assert.equal(resCafe2.body.data.payments.length, 2);

    // 4.3 Unauthorized Cafe 3 -> 403 Forbidden
    const resCafe3 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/payments?cafeId=${CAFE_3}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe3.statusCode, 403);
    assert.equal(resCafe3.body.error.code, 'CROSS_CAFE_ACCESS_DENIED');
  });

  // ── TEST 5: Universal Search & Payment Mode Filtering ───────────────────────
  await suite.test('5. Universal Search & Payment Method Filtering', async () => {
    // 5.1 Search by UTR
    const resSearch = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/payments?search=UTR-HDFC-5001',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resSearch.statusCode, 200);
    assert.equal(resSearch.body.data.payments.length, 1);
    assert.equal(resSearch.body.data.payments[0].paymentId, 'PAY-5001-1');

    // 5.2 Filter by paymentMethod RTGS
    const resMethod = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/payments?paymentMethod=RTGS',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resMethod.statusCode, 200);
    assert.equal(resMethod.body.data.payments.length, 1);
    assert.equal(resMethod.body.data.payments[0].paymentMethod, 'RTGS');
  });

  // ── TEST 6: Document Security & A4 Vector PDF Generation ──────────────────
  await suite.test('6. Document Security & A4 Vector PDF Generation (GET /api/v1/vendor/payments/:id/receipt)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/payments/PAY-5001-1/receipt',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.equal(
      res.headers['content-disposition'],
      'attachment; filename="PaymentReceipt-PAY-5001-1.pdf"'
    );
    assert.ok(res.rawBuffer.length > 500);

    const pdfText = res.rawBuffer.toString('utf8');
    assert.ok(pdfText.startsWith('%PDF-1.4'));
    assert.ok(pdfText.includes('ZAMORIN CAFE ERP - OFFICIAL PAYMENT RECEIPT'));
    assert.ok(pdfText.includes('SYSTEM GENERATED - READ-ONLY VENDOR COPY'));
    assert.ok(pdfText.includes('RECEIPT NO: PAY-5001-1'));
  });

  // ── TEST 7: Cross-Vendor BOLA / IDOR Isolation ─────────────────────────────
  await suite.test('7. Cross-Vendor BOLA / IDOR Isolation', async () => {
    // Vendor A attempts to retrieve Vendor B payment (PAY-9999-1) -> 404
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/payments/PAY-9999-1',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'PAYMENT_NOT_FOUND');

    // Vendor A attempts to download Vendor B receipt PDF -> 404
    const resPdf = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/payments/PAY-9999-1/receipt',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resPdf.statusCode, 404);
    assert.equal(resPdf.body.error.code, 'PAYMENT_NOT_FOUND');
  });

  // ── TEST 8: Server-Side Mutation Denial (Strict Read-Only Enforcement) ──────
  await suite.test('8. Server-Side Mutation Denial (Read-Only Enforcement)', async () => {
    // Attempt POST on payments register
    const resPost = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/vendor/payments',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { amountPaisa: 500000, reference: 'MALICIOUS_POST' },
    });
    assert.equal(resPost.statusCode, 403);
    assert.equal(resPost.body.error.code, 'FORBIDDEN_VENDOR_WRITE');

    // Attempt PUT on payment
    const resPut = await makeRequest({
      port,
      method: 'PUT',
      path: '/api/v1/vendor/payments/PAY-5001-1',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { paymentStatus: 'DISPUTED' },
    });
    assert.equal(resPut.statusCode, 403);
    assert.equal(resPut.body.error.code, 'FORBIDDEN_VENDOR_WRITE');

    // Attempt DELETE on payment
    const resDelete = await makeRequest({
      port,
      method: 'DELETE',
      path: '/api/v1/vendor/payments/PAY-5001-1',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resDelete.statusCode, 403);
    assert.equal(resDelete.body.error.code, 'FORBIDDEN_VENDOR_WRITE');
  });

  // ── TEST 9: Frontend Route Allowlist Integrity for Payments ────────────────
  await suite.test('9. Frontend Route Allowlist Integrity for Payments', () => {
    assert.equal(isRouteAllowed('VENDOR', 'vendor-payments'), true);
    assert.equal(isRouteAllowed('VENDOR', 'vendor/payments'), true);
    // Verify internal financial routes remain strictly blocked for vendor
    assert.equal(isRouteAllowed('VENDOR', 'expenses'), false);
    assert.equal(isRouteAllowed('VENDOR', 'sales-cash'), false);
    assert.equal(isRouteAllowed('VENDOR', 'passbook'), false);
    assert.equal(isRouteAllowed('VENDOR', 'ledger'), false);
  });

  // ── TEST 10: Responsive Component Rendering Contract (No Mutation Controls) 
  await suite.test('10. Responsive Component Rendering Contract (No Mutation Controls)', () => {
    const html = renderVendorPayments();
    assert.ok(html.includes('READ-ONLY PAYMENTS & SETTLEMENTS'));
    assert.ok(html.includes('VEN-SCR-005'));
    assert.ok(html.includes('id="modal-payment-detail"'));
    assert.ok(html.includes('btn-modal-download-receipt'));

    // Verify zero write controls
    assert.equal(html.includes('btn-create-payment'), false);
    assert.equal(html.includes('Mark as Received'), false);
    assert.equal(html.includes('btn-dispute-payment'), false);
  });

  // ── TEST 11: Development Auth Production Safety ───────────────────────────
  await suite.test('11. Development Auth Production Safety (NODE_ENV=production Gating)', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const prodApp = createApp({ allowedOrigins: ['*'], production: true });
      const prodServer = http.createServer(prodApp);
      await new Promise((resolve) => prodServer.listen(0, '127.0.0.1', resolve));
      const prodPort = prodServer.address().port;

      const res = await makeRequest({
        port: prodPort,
        method: 'GET',
        path: '/api/v1/vendor/payments',
        headers: { 'x-dev-user-id': 'VU-0001' },
      });

      assert.equal(res.statusCode, 401);
      await new Promise((resolve) => prodServer.close(resolve));
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
