'use strict';

/**
 * VEN-SCR-006: VENDOR ACCOUNT STATEMENT CONTRACT TEST SUITE
 *
 * Validates:
 * 1. Statement Register listing & 4 Subledger Progression KPI cards:
 *    - openingBalance, periodCredit (Bills +), periodDebit (Payments/Credits -), closingBalance (=)
 * 2. Strict mathematical subledger reconciliation:
 *    - openingBalance + periodCredit - periodDebit === closingBalance
 * 3. Authoritative date-range filtering (prior entries accumulate into openingBalance, period entries shown)
 * 4. Multi-café scoping constraints (Authorized café allowed, foreign café rejected with 403 CROSS_CAFE_ACCESS_DENIED)
 * 5. Universal search & transaction type filtering (Bills, Payments, Credit Notes, etc.)
 * 6. Pagination safety (Section 30: paginating entries does NOT corrupt opening, period, or closing balances)
 * 7. Document security & official A4 Statement PDF generation (SYSTEM GENERATED - READ-ONLY VENDOR COPY)
 * 8. Standard CSV export security & field sanitization
 * 9. Cross-Vendor BOLA / IDOR isolation (Vendor A cannot inspect Vendor B ledger)
 * 10. Strict server-side mutation prevention (POST/PUT/PATCH/DELETE blocked with 403 FORBIDDEN_VENDOR_WRITE)
 * 11. Frontend route allowlist integrity for vendor-statement
 * 12. Responsive mobile & component rendering contract (No mutation controls in template)
 * 13. Development authentication production safety (NODE_ENV=production rejects dev bypass with 401)
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
const { VendorLedgerEntry } = require('../src/models/VendorLedgerEntry');
const { isRouteAllowed } = require('../../Frontend/src/js/navigation.js');
const { renderVendorStatement } = require('../../Frontend/src/js/pages/vendorStatement.js');
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

test('VEN-SCR-006: Vendor Account Statement Contract Test Suite', async (suite) => {
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

    // 4. Seed Chronological Subledger Records for Vendor A:
    // Prior to September 2026:
    // Entry 1: 2026-08-15 Opening Balance: Credit 50000 (₹500) -> Bal 50000
    // Entry 2: 2026-08-20 Vendor Bill: Credit 100000 (₹1,000) -> Bal 150000
    // Entry 3: 2026-08-28 Payment: Debit 60000 (₹600) -> Bal 90000
    // Prior Net Opening Balance as of 2026-09-01 = 150000 - 60000 = 90000 paisa (₹900)
    await VendorLedgerEntry.create([
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-20260815-00001',
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        cafeId: CAFE_1,
        entryDate: '2026-08-15',
        entryType: 'OPENING_BALANCE',
        referenceType: 'MANUAL',
        referenceNumber: 'OB-2026-01',
        debitPaisa: 0,
        creditPaisa: 50000,
        runningBalancePaisa: 50000,
        notes: 'Initial subledger opening balance verified by USR-MASTER-01',
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-20260820-00002',
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        cafeId: CAFE_1,
        entryDate: '2026-08-20',
        entryType: 'VENDOR_BILL',
        referenceType: 'AP_INVOICE',
        referenceNumber: 'INV-AUG-01',
        supplierInvoiceNumber: 'INV-AUG-01',
        debitPaisa: 0,
        creditPaisa: 100000,
        runningBalancePaisa: 150000,
        notes: 'Approved payable bill for dairy supply processed by USR-ACCOUNTS-02',
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-20260828-00003',
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        cafeId: CAFE_1,
        entryDate: '2026-08-28',
        entryType: 'PAYMENT',
        referenceType: 'PAYMENT',
        referenceNumber: 'UTR-HDFC-8001',
        paymentId: 'PAY-AUG-01',
        debitPaisa: 60000,
        creditPaisa: 0,
        runningBalancePaisa: 90000,
        notes: 'Disbursed bank settlement via NEFT processed by USR-FINANCE-01',
        createdByUserId: 'MU-0001',
      },

      // Inside September 2026 (Selected Period):
      // Entry 4: 2026-09-05 Vendor Bill: Credit 200000 (₹2,000) -> Bal 290000
      // Entry 5: 2026-09-12 Payment: Debit 120000 (₹1,200) -> Bal 170000
      // Entry 6: 2026-09-18 Credit Note: Debit 10000 (₹100) -> Bal 160000 (Cafe 2)
      // Entry 7: 2026-09-22 Vendor Bill: Credit 50000 (₹500) -> Bal 210000 (Cafe 2)
      // Period Credits = 250000 paisa (₹2,500)
      // Period Debits  = 130000 paisa (₹1,300)
      // Closing Balance as of 2026-09-30 = 90000 + 250000 - 130000 = 210000 paisa (₹2,100)
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-20260905-00004',
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        cafeId: CAFE_1,
        entryDate: '2026-09-05',
        entryType: 'VENDOR_BILL',
        referenceType: 'AP_INVOICE',
        referenceNumber: 'INV-SEP-01',
        supplierInvoiceNumber: 'INV-SEP-01',
        purchaseOrderId: 'PO-6001',
        debitPaisa: 0,
        creditPaisa: 200000,
        runningBalancePaisa: 290000,
        notes: 'Approved invoice INV-SEP-01 against PO-6001 by USR-ACCOUNTS-01',
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-20260912-00005',
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        cafeId: CAFE_1,
        entryDate: '2026-09-12',
        entryType: 'PAYMENT',
        referenceType: 'PAYMENT',
        referenceNumber: 'UTR-HDFC-9001',
        paymentId: 'PAY-SEP-01',
        debitPaisa: 120000,
        creditPaisa: 0,
        runningBalancePaisa: 170000,
        notes: 'RTGS disbursement to vendor account on file',
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-20260918-00006',
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        cafeId: CAFE_2,
        entryDate: '2026-09-18',
        entryType: 'CREDIT_NOTE',
        referenceType: 'CREDIT_NOTE',
        referenceNumber: 'CN-SEP-01',
        debitPaisa: 10000,
        creditPaisa: 0,
        runningBalancePaisa: 160000,
        notes: 'Credit note adjustment for damaged milk crates',
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-20260922-00007',
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        cafeId: CAFE_2,
        entryDate: '2026-09-22',
        entryType: 'VENDOR_BILL',
        referenceType: 'AP_INVOICE',
        referenceNumber: 'INV-SEP-02',
        supplierInvoiceNumber: 'INV-SEP-02',
        debitPaisa: 0,
        creditPaisa: 50000,
        runningBalancePaisa: 210000,
        notes: 'Beachside weekly dairy replenishment bill',
        createdByUserId: 'MU-0001',
      },

      // Vendor B isolation entry:
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-B-00001',
        vendorId: VENDOR_B_ID,
        vendorNameSnapshot: 'Highland Coffee Roasters',
        cafeId: CAFE_1,
        entryDate: '2026-09-10',
        entryType: 'VENDOR_BILL',
        referenceType: 'AP_INVOICE',
        referenceNumber: 'INV-COFFEE-99',
        supplierInvoiceNumber: 'INV-COFFEE-99',
        debitPaisa: 0,
        creditPaisa: 999999,
        runningBalancePaisa: 999999,
        notes: 'Confidential Highland Coffee bill',
        createdByUserId: 'MU-0001',
      },
    ]);
  });

  suite.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (mongoReplSet) await mongoReplSet.stop();
  });

  // ── TEST 1: Statement Register & 4 Progression KPIs ────────────────────────
  await suite.test('1. Statement Register & 4 Progression KPIs (GET /api/v1/vendor/statement)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/statement?fromDate=2026-09-01&toDate=2026-09-30',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const { summary, entries, period, vendor } = res.body.data;

    // Check identity
    assert.equal(vendor.vendorId, VENDOR_A_ID);
    assert.equal(vendor.name, 'Malabar Dairy & Creamery');

    // Check Period
    assert.equal(period.fromDate, '2026-09-01');
    assert.equal(period.toDate, '2026-09-30');

    // 4 Authoritative KPIs
    assert.equal(summary.openingBalancePaisa, 90000); // ₹900
    assert.equal(summary.totalCreditPaisa, 250000);   // ₹2,500
    assert.equal(summary.totalDebitPaisa, 130000);    // ₹1,300
    assert.equal(summary.closingBalancePaisa, 210000); // ₹2,100
    assert.equal(summary.periodTotalEntries, 4);

    // Entries in period
    assert.equal(entries.length, 4);
    assert.equal(entries[0].ledgerEntryId, 'VLE-20260905-00004');
    assert.equal(entries[0].creditPaisa, 200000);
    assert.equal(entries[0].runningBalancePaisa, 290000);

    assert.equal(entries[3].ledgerEntryId, 'VLE-20260922-00007');
    assert.equal(entries[3].runningBalancePaisa, 210000);
  });

  // ── TEST 2: Authoritative Accounting Direction Reconciliation ──────────────
  await suite.test('2. Authoritative Accounting Direction & Progression Verification', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/statement?fromDate=2026-09-01&toDate=2026-09-30',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    const { summary, entries } = res.body.data;
    // Core accounting equation: Opening Balance + Total Credits - Total Debits === Closing Balance
    const expectedClosing = summary.openingBalancePaisa + summary.totalCreditPaisa - summary.totalDebitPaisa;
    assert.equal(summary.closingBalancePaisa, expectedClosing);

    // Verify employee ID redaction in notes
    for (const e of entries) {
      assert.equal(e.notes.includes('USR-ACCOUNTS'), false);
      assert.equal(e.notes.includes('USR-FINANCE'), false);
      assert.equal(e.notes.includes('USR-MASTER'), false);
    }
  });

  // ── TEST 3: Multi-Café Scoping & Parameter Boundaries ───────────────────────
  await suite.test('3. Multi-Café Scoping & Parameter Boundaries', async () => {
    // 3.1 Scoped to Cafe 1
    const resCafe1 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/statement?cafeId=${CAFE_1}&fromDate=2026-09-01&toDate=2026-09-30`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe1.statusCode, 200);
    // Cafe 1 has 2 entries in period (VLE-4, VLE-5)
    assert.equal(resCafe1.body.data.entries.length, 2);

    // 3.2 Scoped to Cafe 2
    const resCafe2 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/statement?cafeId=${CAFE_2}&fromDate=2026-09-01&toDate=2026-09-30`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe2.statusCode, 200);
    // Cafe 2 has 2 entries in period (VLE-6, VLE-7)
    assert.equal(resCafe2.body.data.entries.length, 2);

    // 3.3 Unauthorized Cafe 3 -> 403 Forbidden
    const resCafe3 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/statement?cafeId=${CAFE_3}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe3.statusCode, 403);
    assert.equal(resCafe3.body.error.code, 'CROSS_CAFE_ACCESS_DENIED');
  });

  // ── TEST 4: Universal Search & Transaction Type Filtering ───────────────────
  await suite.test('4. Universal Search & Transaction Type Filtering', async () => {
    // 4.1 Search by UTR reference
    const resSearch = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/statement?search=UTR-HDFC-9001&fromDate=2026-09-01&toDate=2026-09-30',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resSearch.statusCode, 200);
    assert.equal(resSearch.body.data.entries.length, 1);
    assert.equal(resSearch.body.data.entries[0].referenceNumber, 'UTR-HDFC-9001');

    // 4.2 Filter by entryType CREDIT_NOTE
    const resType = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/statement?entryType=CREDIT_NOTE&fromDate=2026-09-01&toDate=2026-09-30',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resType.statusCode, 200);
    assert.equal(resType.body.data.entries.length, 1);
    assert.equal(resType.body.data.entries[0].entryType, 'CREDIT_NOTE');
  });

  // ── TEST 5: Pagination Safety (Section 30 Balance Integrity) ───────────────
  await suite.test('5. Pagination Safety (Section 30 Balance Integrity)', async () => {
    // Request page 1 with limit=2 (there are 4 total entries in the period)
    const resPage1 = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/statement?fromDate=2026-09-01&toDate=2026-09-30&page=1&limit=2',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(resPage1.statusCode, 200);
    const { summary, entries, pagination } = resPage1.body.data;

    // Entries are paginated
    assert.equal(entries.length, 2);
    assert.equal(pagination.page, 1);
    assert.equal(pagination.limit, 2);
    assert.equal(pagination.totalPages, 2);
    assert.equal(pagination.totalCount, 4);

    // CRITICAL: Global period summary must NOT be truncated or corrupted by the page size!
    assert.equal(summary.openingBalancePaisa, 90000);
    assert.equal(summary.totalCreditPaisa, 250000);
    assert.equal(summary.totalDebitPaisa, 130000);
    assert.equal(summary.closingBalancePaisa, 210000);
  });

  // ── TEST 6: Document Security & A4 Vector PDF Generation ──────────────────
  await suite.test('6. Document Security & A4 Vector PDF Generation (GET /api/v1/vendor/statement/pdf)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/statement/pdf?fromDate=2026-09-01&toDate=2026-09-30',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.ok(res.headers['content-disposition'].includes('attachment; filename='));

    const pdfText = res.rawBuffer.toString('utf8');
    assert.ok(pdfText.startsWith('%PDF-1.4'));
    assert.ok(pdfText.includes('OFFICIAL VENDOR ACCOUNT STATEMENT'));
    assert.ok(pdfText.includes('SYSTEM GENERATED - READ-ONLY VENDOR COPY'));
    assert.ok(pdfText.includes('OPENING BALANCE'));
    assert.ok(pdfText.includes('CLOSING BALANCE'));
  });

  // ── TEST 7: Standard CSV Export Security & Data Integrity ──────────────────
  await suite.test('7. Standard CSV Export Security & Data Integrity (GET /api/v1/vendor/statement/csv)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/statement/csv?fromDate=2026-09-01&toDate=2026-09-30',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
    assert.ok(res.headers['content-disposition'].includes('.csv'));

    const csvText = res.rawBuffer.toString('utf8');
    assert.ok(csvText.includes('Date,Entry ID,Reference,Transaction Type,PO Reference,Invoice Number,Payment ID,Cafe,Debit (INR),Credit (INR),Running Balance (INR),Description'));
    assert.ok(csvText.includes('VLE-20260905-00004'));
    assert.ok(csvText.includes('VLE-20260912-00005'));
    assert.equal(csvText.includes('VLE-B-00001'), false); // No Vendor B leak
  });

  // ── TEST 8: Cross-Vendor BOLA / IDOR Isolation ─────────────────────────────
  await suite.test('8. Cross-Vendor BOLA / IDOR Isolation', async () => {
    // Vendor A queries statement -> MUST NOT receive Vendor B records
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/statement?fromDate=2026-09-01&toDate=2026-09-30',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    for (const e of res.body.data.entries) {
      assert.notEqual(e.ledgerEntryId, 'VLE-B-00001');
      assert.notEqual(e.referenceNumber, 'INV-COFFEE-99');
    }

    // Vendor B queries statement -> gets ONLY Vendor B records
    const resB = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/statement?fromDate=2026-09-01&toDate=2026-09-30',
      headers: { Authorization: `Bearer ${vendorBToken}` },
    });
    assert.equal(resB.statusCode, 200);
    assert.equal(resB.body.data.vendor.vendorId, VENDOR_B_ID);
    assert.equal(resB.body.data.entries.length, 1);
    assert.equal(resB.body.data.entries[0].ledgerEntryId, 'VLE-B-00001');
  });

  // ── TEST 9: Server-Side Mutation Denial (Strict Read-Only Enforcement) ──────
  await suite.test('9. Server-Side Mutation Denial (Read-Only Enforcement)', async () => {
    // Attempt POST on statement
    const resPost = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/vendor/statement',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { debitPaisa: 50000, creditPaisa: 0, notes: 'MALICIOUS_LEDGER_POST' },
    });
    assert.equal(resPost.statusCode, 403);
    assert.equal(resPost.body.error.code, 'FORBIDDEN_VENDOR_WRITE');

    // Attempt PUT on statement
    const resPut = await makeRequest({
      port,
      method: 'PUT',
      path: '/api/v1/vendor/statement/VLE-20260905-00004',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { runningBalancePaisa: 0 },
    });
    assert.equal(resPut.statusCode, 403);
    assert.equal(resPut.body.error.code, 'FORBIDDEN_VENDOR_WRITE');

    // Attempt DELETE on statement
    const resDelete = await makeRequest({
      port,
      method: 'DELETE',
      path: '/api/v1/vendor/statement/VLE-20260905-00004',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resDelete.statusCode, 403);
    assert.equal(resDelete.body.error.code, 'FORBIDDEN_VENDOR_WRITE');
  });

  // ── TEST 10: Frontend Route Allowlist Integrity for Statement ──────────────
  await suite.test('10. Frontend Route Allowlist Integrity for Statement', () => {
    assert.equal(isRouteAllowed('VENDOR', 'vendor-statement'), true);
    assert.equal(isRouteAllowed('VENDOR', 'vendor/statement'), true);
    // Verify internal financial routes remain strictly blocked for vendor
    assert.equal(isRouteAllowed('VENDOR', 'expenses'), false);
    assert.equal(isRouteAllowed('VENDOR', 'sales-cash'), false);
    assert.equal(isRouteAllowed('VENDOR', 'passbook'), false);
    assert.equal(isRouteAllowed('VENDOR', 'ledger'), false);
    assert.equal(isRouteAllowed('VENDOR', 'personal-ledger'), false);
  });

  // ── TEST 11: Responsive Component Rendering Contract (No Mutation Controls) 
  await suite.test('11. Responsive Component Rendering Contract (No Mutation Controls)', () => {
    const html = renderVendorStatement();
    assert.ok(html.includes('READ-ONLY ACCOUNT STATEMENT'));
    assert.ok(html.includes('VEN-SCR-006'));
    assert.ok(html.includes('id="modal-entry-detail"'));
    assert.ok(html.includes('id="btn-export-csv"'));
    assert.ok(html.includes('id="btn-download-pdf"'));

    // Verify zero write controls in UI
    assert.equal(html.includes('btn-create-entry'), false);
    assert.equal(html.includes('Adjust Balance'), false);
    assert.equal(html.includes('Dispute Entry'), false);
    assert.equal(html.includes('btn-delete-entry'), false);
  });

  // ── TEST 12: Development Auth Production Safety ───────────────────────────
  await suite.test('12. Development Auth Production Safety (NODE_ENV=production Gating)', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const res = await makeRequest({
        port,
        method: 'GET',
        path: '/api/v1/vendor/statement',
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
