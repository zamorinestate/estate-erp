'use strict';

/**
 * VEN-SCR-007: VENDOR OUTSTANDING RECEIVABLES & AGEING CONTRACT TEST SUITE
 *
 * Validates:
 * 1. Receivables Register listing & 6 Ageing Summary KPI cards:
 *    - totalOutstanding, currentBucket, bucket1_30, bucket31_60, bucket61_90, bucket90Plus, totalHeldDisputed
 * 2. Mathematical Ageing Classification:
 *    - Validates Current, 1–30d, 31–60d, 61–90d, 90+d based strictly on authoritative due dates
 *    - Preserves "Due date not available" without inventing arbitrary dates
 * 3. Segregation of Held / Disputed liabilities:
 *    - Confirms disputed variances are not hidden in standard buckets
 * 4. Multi-café scoping constraints (Authorized café allowed, foreign café rejected with 403 CROSS_CAFE_ACCESS_DENIED)
 * 5. Universal search & bucket filtering
 * 6. Document security & official A4 Receivables PDF generation (SYSTEM GENERATED - READ-ONLY VENDOR COPY)
 * 7. Standard CSV export security & data integrity
 * 8. Cross-Vendor BOLA / IDOR isolation (Vendor A cannot inspect Vendor B receivables)
 * 9. Strict server-side mutation prevention (POST/PUT/PATCH/DELETE blocked with 403 FORBIDDEN_VENDOR_WRITE)
 * 10. Frontend route allowlist integrity for vendor-receivables
 * 11. Responsive mobile & component rendering contract (No mutation controls in template)
 * 12. Development authentication production safety (NODE_ENV=production rejects dev bypass with 401)
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
const { APInvoice } = require('../src/models/APInvoice');
const { isRouteAllowed } = require('../../Frontend/src/js/navigation.js');
const { renderVendorReceivables } = require('../../Frontend/src/js/pages/vendorReceivables.js');
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

function getOffsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

test('VEN-SCR-007: Vendor Outstanding Receivables & Ageing Contract Test Suite', async (suite) => {
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
      email: 'staff@zamorin.com',
      name: 'Barista John',
      role: 'STAFF',
      primaryCafeId: CAFE_1,
      organisationId: ORG_ID,
      accountStatus: 'ACTIVE',
      createdBy: 'MU-0001',
      passwordHash,
    });

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

    // 4. Seed Open Invoices across Ageing Brackets for Vendor A:
    // Invoice 1: Current (Not overdue, dueDate in 10 days) -> Outstanding: ₹1,000 (100000 paisa)
    // Invoice 2: 1-30 Days Overdue (dueDate 15 days ago) -> Outstanding: ₹2,000 (200000 paisa)
    // Invoice 3: 31-60 Days Overdue (dueDate 45 days ago) -> Outstanding: ₹3,000 (300000 paisa)
    // Invoice 4: 61-90 Days Overdue (dueDate 75 days ago) -> Outstanding: ₹4,000 (400000 paisa)
    // Invoice 5: 90+ Days Overdue (dueDate 105 days ago) -> Outstanding: ₹5,000 (500000 paisa) (Cafe 2)
    // Invoice 6: On Hold / Disputed Variance (dueDate 10 days ago) -> Outstanding: ₹1,500 (150000 paisa), Held: ₹500 (50000 paisa) (Cafe 2)
    // Invoice 7: Due date not available -> Outstanding: ₹800 (80000 paisa)
    await APInvoice.create([
      {
        organisationId: ORG_ID,
        invoiceId: 'INV-REC-001',
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        cafeId: CAFE_1,
        supplierInvoiceNumber: 'INV-MALABAR-CURR',
        invoiceDate: getOffsetDate(-5),
        dueDate: getOffsetDate(10), // CURRENT
        amountPaisa: 100000,
        taxPaisa: 0,
        totalPaisa: 100000,
        supplierClaimedAmountPaisa: 100000,
        approvedPayableAmountPaisa: 100000,
        heldDisputedAmountPaisa: 0,
        paidPaisa: 0,
        outstandingPayableAmountPaisa: 100000, // ₹1,000
        paymentStatus: 'DUE',
        invoiceStatus: 'APPROVED',
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        invoiceId: 'INV-REC-002',
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        cafeId: CAFE_1,
        supplierInvoiceNumber: 'INV-MALABAR-1-30',
        invoiceDate: getOffsetDate(-45),
        dueDate: getOffsetDate(-15), // 1-30 DAYS
        amountPaisa: 200000,
        taxPaisa: 0,
        totalPaisa: 200000,
        supplierClaimedAmountPaisa: 200000,
        approvedPayableAmountPaisa: 200000,
        heldDisputedAmountPaisa: 0,
        paidPaisa: 0,
        outstandingPayableAmountPaisa: 200000, // ₹2,000
        paymentStatus: 'DUE',
        invoiceStatus: 'APPROVED',
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        invoiceId: 'INV-REC-003',
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        cafeId: CAFE_1,
        supplierInvoiceNumber: 'INV-MALABAR-31-60',
        invoiceDate: getOffsetDate(-75),
        dueDate: getOffsetDate(-45), // 31-60 DAYS
        amountPaisa: 300000,
        taxPaisa: 0,
        totalPaisa: 300000,
        supplierClaimedAmountPaisa: 300000,
        approvedPayableAmountPaisa: 300000,
        heldDisputedAmountPaisa: 0,
        paidPaisa: 0,
        outstandingPayableAmountPaisa: 300000, // ₹3,000
        paymentStatus: 'DUE',
        invoiceStatus: 'APPROVED',
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        invoiceId: 'INV-REC-004',
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        cafeId: CAFE_1,
        supplierInvoiceNumber: 'INV-MALABAR-61-90',
        invoiceDate: getOffsetDate(-105),
        dueDate: getOffsetDate(-75), // 61-90 DAYS
        amountPaisa: 400000,
        taxPaisa: 0,
        totalPaisa: 400000,
        supplierClaimedAmountPaisa: 400000,
        approvedPayableAmountPaisa: 400000,
        heldDisputedAmountPaisa: 0,
        paidPaisa: 0,
        outstandingPayableAmountPaisa: 400000, // ₹4,000
        paymentStatus: 'DUE',
        invoiceStatus: 'APPROVED',
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        invoiceId: 'INV-REC-005',
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        cafeId: CAFE_2,
        supplierInvoiceNumber: 'INV-MALABAR-90-PLUS',
        invoiceDate: getOffsetDate(-135),
        dueDate: getOffsetDate(-105), // 90+ DAYS
        amountPaisa: 500000,
        taxPaisa: 0,
        totalPaisa: 500000,
        supplierClaimedAmountPaisa: 500000,
        approvedPayableAmountPaisa: 500000,
        heldDisputedAmountPaisa: 0,
        paidPaisa: 0,
        outstandingPayableAmountPaisa: 500000, // ₹5,000
        paymentStatus: 'DUE',
        invoiceStatus: 'APPROVED',
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        invoiceId: 'INV-REC-006',
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        cafeId: CAFE_2,
        supplierInvoiceNumber: 'INV-MALABAR-HELD',
        invoiceDate: getOffsetDate(-40),
        dueDate: getOffsetDate(-10),
        amountPaisa: 200000,
        taxPaisa: 0,
        totalPaisa: 200000,
        supplierClaimedAmountPaisa: 200000,
        approvedPayableAmountPaisa: 150000,
        heldDisputedAmountPaisa: 50000, // ₹500 held
        paidPaisa: 0,
        outstandingPayableAmountPaisa: 150000, // ₹1,500
        paymentStatus: 'ON_HOLD',
        invoiceStatus: 'DISPUTED',
        createdByUserId: 'MU-0001',
      },
      // Vendor B isolation open invoice:
      {
        organisationId: ORG_ID,
        invoiceId: 'INV-REC-B-99',
        vendorId: VENDOR_B_ID,
        vendorName: 'Highland Coffee Roasters',
        cafeId: CAFE_1,
        supplierInvoiceNumber: 'INV-HIGHLAND-OVERDUE',
        invoiceDate: getOffsetDate(-50),
        dueDate: getOffsetDate(-20),
        amountPaisa: 999900,
        taxPaisa: 0,
        totalPaisa: 999900,
        supplierClaimedAmountPaisa: 999900,
        approvedPayableAmountPaisa: 999900,
        heldDisputedAmountPaisa: 0,
        paidPaisa: 0,
        outstandingPayableAmountPaisa: 999900,
        paymentStatus: 'DUE',
        invoiceStatus: 'APPROVED',
        createdByUserId: 'MU-0001',
      },
    ]);

    // Invoice 7: Due date not available -> Outstanding: ₹800 (80000 paisa)
    // Insert directly into collection to test legacy / unpopulated dueDate resilience
    await APInvoice.collection.insertOne({
      organisationId: ORG_ID,
      invoiceId: 'INV-REC-007',
      vendorId: VENDOR_A_ID,
      vendorName: 'Malabar Dairy & Creamery',
      cafeId: CAFE_1,
      supplierInvoiceNumber: 'INV-MALABAR-NODUE',
      invoiceDate: getOffsetDate(-2),
      dueDate: null, // Due date not available
      amountPaisa: 80000,
      taxPaisa: 0,
      totalPaisa: 80000,
      supplierClaimedAmountPaisa: 80000,
      approvedPayableAmountPaisa: 80000,
      heldDisputedAmountPaisa: 0,
      paidPaisa: 0,
      outstandingPayableAmountPaisa: 80000, // ₹800
      paymentStatus: 'DUE',
      invoiceStatus: 'APPROVED',
      createdByUserId: 'MU-0001',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  suite.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (mongoReplSet) await mongoReplSet.stop();
  });

  // ── TEST 1: Receivables Register Listing & 6 Ageing KPIs ───────────────────
  await suite.test('1. Receivables Register Listing & 6 Ageing Summary KPIs (GET /api/v1/vendor/receivables)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/receivables',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const { summary, receivables, vendor } = res.body.data;

    assert.equal(vendor.vendorId, VENDOR_A_ID);
    assert.equal(receivables.length, 7);

    // Sum of outstanding:
    // 100000 (Curr) + 200000 (1-30) + 300000 (31-60) + 400000 (61-90) + 500000 (90+) + 150000 (Held) + 80000 (NoDue)
    // = 1,730,000 paisa (₹17,300)
    assert.equal(summary.totalOutstandingPaisa, 1730000);
    // Overdue = 200000 + 300000 + 400000 + 500000 + 150000 = 1,550,000 paisa (₹15,500)
    assert.equal(summary.totalOverduePaisa, 1550000);
    // Current (not overdue + no due date) = 100000 + 80000 = 180,000 paisa (₹1,800)
    assert.equal(summary.currentBucketPaisa, 180000);
    // 1-30: 200000 + 150000 = 350000 paisa
    assert.equal(summary.bucket1_30Paisa, 350000);
    assert.equal(summary.bucket31_60Paisa, 300000);
    assert.equal(summary.bucket61_90Paisa, 400000);
    assert.equal(summary.bucket90PlusPaisa, 500000);
    assert.equal(summary.totalHeldDisputedPaisa, 50000);
    assert.equal(summary.openInvoicesCount, 7);
  });

  // ── TEST 2: Mathematical Ageing Classification ─────────────────────────────
  await suite.test('2. Mathematical Ageing Classification (Exact Brackets & Missing Due Date)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/receivables',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    const { receivables } = res.body.data;
    const curr = receivables.find((r) => r.invoiceId === 'INV-REC-001');
    assert.equal(curr.ageingBucket, 'CURRENT');
    assert.equal(curr.isOverdue, false);

    const b1_30 = receivables.find((r) => r.invoiceId === 'INV-REC-002');
    assert.equal(b1_30.ageingBucket, '1_30');
    assert.equal(b1_30.isOverdue, true);

    const b31_60 = receivables.find((r) => r.invoiceId === 'INV-REC-003');
    assert.equal(b31_60.ageingBucket, '31_60');

    const b61_90 = receivables.find((r) => r.invoiceId === 'INV-REC-004');
    assert.equal(b61_90.ageingBucket, '61_90');

    const b90plus = receivables.find((r) => r.invoiceId === 'INV-REC-005');
    assert.equal(b90plus.ageingBucket, '90_PLUS');

    const noDueDate = receivables.find((r) => r.invoiceId === 'INV-REC-007');
    assert.equal(noDueDate.dueDate, null);
    assert.equal(noDueDate.dueDateLabel, 'Due date not available');
    assert.equal(noDueDate.ageingBucket, 'NO_DUE_DATE');
  });

  // ── TEST 3: Multi-Café Scoping & Parameter Boundaries ───────────────────────
  await suite.test('3. Multi-Café Scoping & Parameter Boundaries', async () => {
    // 3.1 Scoped to Cafe 1 (5 invoices)
    const resCafe1 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/receivables?cafeId=${CAFE_1}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe1.statusCode, 200);
    assert.equal(resCafe1.body.data.receivables.length, 5);

    // 3.2 Scoped to Cafe 2 (2 invoices)
    const resCafe2 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/receivables?cafeId=${CAFE_2}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe2.statusCode, 200);
    assert.equal(resCafe2.body.data.receivables.length, 2);

    // 3.3 Unauthorized Cafe 3 -> 403 Forbidden
    const resCafe3 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/receivables?cafeId=${CAFE_3}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe3.statusCode, 403);
    assert.equal(resCafe3.body.error.code, 'CROSS_CAFE_ACCESS_DENIED');
  });

  // ── TEST 4: Bucket & Universal Search Filtering ────────────────────────────
  await suite.test('4. Bucket & Universal Search Filtering', async () => {
    // 4.1 Filter by bucket 90_PLUS
    const res90 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/receivables?bucket=90_PLUS',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(res90.statusCode, 200);
    assert.equal(res90.body.data.receivables.length, 1);
    assert.equal(res90.body.data.receivables[0].invoiceId, 'INV-REC-005');

    // 4.2 Filter by HELD bucket
    const resHeld = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/receivables?bucket=HELD',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resHeld.statusCode, 200);
    assert.equal(resHeld.body.data.receivables.length, 1);
    assert.equal(resHeld.body.data.receivables[0].invoiceId, 'INV-REC-006');
    assert.equal(resHeld.body.data.receivables[0].heldDisputedAmountPaisa, 50000);

    // 4.3 Search by invoice number
    const resSearch = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/receivables?search=INV-MALABAR-CURR',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resSearch.statusCode, 200);
    assert.equal(resSearch.body.data.receivables.length, 1);
    assert.equal(resSearch.body.data.receivables[0].invoiceId, 'INV-REC-001');
  });

  // ── TEST 5: Document Security & A4 Vector PDF Generation ──────────────────
  await suite.test('5. Document Security & A4 Vector PDF Generation (GET /api/v1/vendor/receivables/pdf)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/receivables/pdf',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.ok(res.headers['content-disposition'].includes('attachment; filename='));

    const pdfText = res.rawBuffer.toString('utf8');
    assert.ok(pdfText.startsWith('%PDF-1.4'));
    assert.ok(pdfText.includes('OUTSTANDING RECEIVABLES & AGEING'));
    assert.ok(pdfText.includes('SYSTEM GENERATED - READ-ONLY VENDOR COPY'));
    assert.ok(pdfText.includes('TOTAL RECEIVABLE'));
  });

  // ── TEST 6: Standard CSV Export Security & Data Integrity ──────────────────
  await suite.test('6. Standard CSV Export Security & Data Integrity (GET /api/v1/vendor/receivables/csv)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/receivables/csv',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
    assert.ok(res.headers['content-disposition'].includes('.csv'));

    const csvText = res.rawBuffer.toString('utf8');
    assert.ok(csvText.includes('Invoice Number,Internal ID,Invoice Date,Due Date,Days Overdue,Ageing Bucket,Cafe,PO Reference,Claimed (INR),Approved (INR),Held (INR),Paid (INR),Credits Applied (INR),Outstanding (INR),Payment Status'));
    assert.ok(csvText.includes('INV-MALABAR-CURR'));
    assert.ok(csvText.includes('INV-MALABAR-90-PLUS'));
    assert.equal(csvText.includes('INV-HIGHLAND-OVERDUE'), false); // No Vendor B leak
  });

  // ── TEST 7: Cross-Vendor BOLA / IDOR Isolation ─────────────────────────────
  await suite.test('7. Cross-Vendor BOLA / IDOR Isolation', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/receivables',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    for (const r of res.body.data.receivables) {
      assert.notEqual(r.invoiceId, 'INV-REC-B-99');
      assert.notEqual(r.supplierInvoiceNumber, 'INV-HIGHLAND-OVERDUE');
    }

    const resB = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/receivables',
      headers: { Authorization: `Bearer ${vendorBToken}` },
    });
    assert.equal(resB.statusCode, 200);
    assert.equal(resB.body.data.vendor.vendorId, VENDOR_B_ID);
    assert.equal(resB.body.data.receivables.length, 1);
    assert.equal(resB.body.data.receivables[0].invoiceId, 'INV-REC-B-99');
  });

  // ── TEST 8: Server-Side Mutation Denial (Strict Read-Only Enforcement) ──────
  await suite.test('8. Server-Side Mutation Denial (Read-Only Enforcement)', async () => {
    // Attempt POST on receivables
    const resPost = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/vendor/receivables',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { amountPaisa: 50000 },
    });
    assert.equal(resPost.statusCode, 403);
    assert.equal(resPost.body.error.code, 'FORBIDDEN_VENDOR_WRITE');

    // Attempt PUT on receivables
    const resPut = await makeRequest({
      port,
      method: 'PUT',
      path: '/api/v1/vendor/receivables/INV-REC-001',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { paymentStatus: 'DISPUTED' },
    });
    assert.equal(resPut.statusCode, 403);
    assert.equal(resPut.body.error.code, 'FORBIDDEN_VENDOR_WRITE');

    // Attempt DELETE on receivables
    const resDelete = await makeRequest({
      port,
      method: 'DELETE',
      path: '/api/v1/vendor/receivables/INV-REC-001',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resDelete.statusCode, 403);
    assert.equal(resDelete.body.error.code, 'FORBIDDEN_VENDOR_WRITE');
  });

  // ── TEST 9: Frontend Route Allowlist Integrity for Receivables ─────────────
  await suite.test('9. Frontend Route Allowlist Integrity for Receivables', () => {
    assert.equal(isRouteAllowed('VENDOR', 'vendor-receivables'), true);
    assert.equal(isRouteAllowed('VENDOR', 'vendor/receivables'), true);
    // Verify internal financial routes remain strictly blocked for vendor
    assert.equal(isRouteAllowed('VENDOR', 'expenses'), false);
    assert.equal(isRouteAllowed('VENDOR', 'sales-cash'), false);
    assert.equal(isRouteAllowed('VENDOR', 'passbook'), false);
    assert.equal(isRouteAllowed('VENDOR', 'ledger'), false);
  });

  // ── TEST 10: Responsive Component Rendering Contract (No Mutation Controls) 
  await suite.test('10. Responsive Component Rendering Contract (No Mutation Controls)', () => {
    const html = renderVendorReceivables();
    assert.ok(html.includes('READ-ONLY OUTSTANDING RECEIVABLES & AGEING'));
    assert.ok(html.includes('VEN-SCR-007'));
    assert.ok(html.includes('id="modal-receivable-detail"'));
    assert.ok(html.includes('id="btn-export-csv"'));
    assert.ok(html.includes('id="btn-download-pdf"'));

    // Verify zero write controls
    assert.equal(html.includes('Mark as Paid'), false);
    assert.equal(html.includes('Dispute Bill'), false);
    assert.equal(html.includes('btn-create-receivable'), false);
  });

  // ── TEST 11: Development Auth Production Safety ───────────────────────────
  await suite.test('11. Development Auth Production Safety (NODE_ENV=production Gating)', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const res = await makeRequest({
        port,
        method: 'GET',
        path: '/api/v1/vendor/receivables',
        headers: {
          'x-dev-vendor-id': VENDOR_A_ID,
          'x-dev-user-id': 'VU-0001',
        },
      });
      assert.equal(res.statusCode, 401);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
