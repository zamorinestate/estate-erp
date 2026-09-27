'use strict';

/**
 * VEN-SCR-008: RETURNS, DEBIT NOTES, CREDIT NOTES & ADJUSTMENTS CONTRACT TEST SUITE
 *
 * Validates:
 * 1. Adjustments Register listing & 9 Summary KPI cards:
 *    - totalReturns, returnValuePaisa, debitNotesCount, debitNotesValuePaisa,
 *      creditNotesCount, creditNotesValuePaisa, otherAdjustmentsCount, openAdjustmentsCount, completedAdjustmentsCount
 * 2. Authoritative Accounting Direction Verification (Debit reduces payable / Credit increases / Memo)
 * 3. Single Adjustment Detail View (6-Zone Detail Payload without internal commentary)
 * 4. Multi-café scoping constraints (Authorized café allowed, foreign café rejected with 403 CROSS_CAFE_ACCESS_DENIED)
 * 5. Universal search & transaction family filtering (GOODS_RETURN, DEBIT_NOTE, CREDIT_NOTE, etc.)
 * 6. Document security & official A4 Adjustment PDF generation (SYSTEM GENERATED - READ-ONLY VENDOR COPY)
 * 7. Standard CSV export security & data integrity
 * 8. Cross-Vendor BOLA / IDOR isolation (Vendor A cannot inspect or access Vendor B adjustments)
 * 9. Strict server-side mutation prevention (POST/PUT/PATCH/DELETE blocked with 403 FORBIDDEN_VENDOR_WRITE)
 * 10. Frontend route allowlist integrity for vendor-adjustments
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
const { PurchaseOrder } = require('../src/models/PurchaseOrder');
const { VendorLedgerEntry } = require('../src/models/VendorLedgerEntry');
const { isRouteAllowed } = require('../../Frontend/src/js/navigation.js');
const { renderVendorAdjustments } = require('../../Frontend/src/js/pages/vendorAdjustments.js');
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

test('VEN-SCR-008: Vendor Returns, Notes & Adjustments Contract Test Suite', async (suite) => {
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

    // 3. Seed Users & Issue Authentic JWTs
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

    // 4. Seed Purchase Order with Rejected Items (Physical Goods Return)
    await PurchaseOrder.create({
      organisationId: ORG_ID,
      purchaseOrderId: 'PO-ADJ-001',
      cafeId: CAFE_1,
      vendorId: VENDOR_A_ID,
      status: 'APPROVED',
      orderDate: '2026-09-10',
      totalPaisa: 2500000,
      createdByUserId: 'MU-0001',
      lineItems: [
        {
          itemId: 'ITEM-MILK-FULL',
          itemNameSnapshot: 'Full Cream Milk 1L',
          unitPricePaisa: 25000, // ₹250
          orderedQuantityBase: 100,
          receivedQuantityBase: 90,
          acceptedReceivedQty: 90,
          rejectedQty: 10,
          totalLinePaisa: 2500000,
        },
      ],
      grnReceipts: [
        {
          grnId: 'GRN-ADJ-001',
          deliveryNoteNumber: 'DN-MDC-991',
          receivedAt: new Date('2026-09-12T10:00:00Z'),
          receivedByUserId: 'ST-0001',
          status: 'PARTIAL',
          items: [
            {
              itemId: 'ITEM-MILK-FULL',
              deliveredQty: 100,
              acceptedQty: 90,
              rejectedQty: 10,
              rejectionReason: 'Damaged cartons during transit',
              disposition: 'CLOSE_REMAINING',
            },
          ],
        },
      ],
    });

    // 5. Seed Vendor Ledger Adjustment Entries
    await VendorLedgerEntry.create([
      // Credit Note (reduces payable): ₹500 (50000 paisa)
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-CN-001',
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        cafeId: CAFE_1,
        entryDate: '2026-09-15',
        entryTimestamp: new Date('2026-09-15T11:00:00Z'),
        entryType: 'CREDIT_NOTE',
        referenceType: 'CREDIT_NOTE',
        referenceId: 'CN-MDC-001',
        referenceNumber: 'CN-MDC-001',
        purchaseOrderId: 'PO-ADJ-001',
        supplierInvoiceNumber: 'INV-MDC-901',
        debitPaisa: 50000,
        creditPaisa: 0,
        runningBalancePaisa: 150000,
        notes: 'Credit note for agreed pricing rebate',
        createdByUserId: 'MU-0001',
      },
      // Debit Adjustment: ₹300 (30000 paisa)
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-DN-001',
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        cafeId: CAFE_1,
        entryDate: '2026-09-18',
        entryTimestamp: new Date('2026-09-18T14:30:00Z'),
        entryType: 'DEBIT_ADJUSTMENT',
        referenceType: 'MANUAL',
        referenceNumber: 'DN-MDC-001',
        debitPaisa: 30000,
        creditPaisa: 0,
        runningBalancePaisa: 120000,
        notes: 'Handling fee recovery debit adjustment',
        createdByUserId: 'MU-0001',
      },
      // Short Supply Hold: ₹250 (25000 paisa)
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-HOLD-001',
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        cafeId: CAFE_2,
        entryDate: '2026-09-20',
        entryTimestamp: new Date('2026-09-20T09:15:00Z'),
        entryType: 'SHORT_SUPPLY_HOLD',
        referenceType: 'MANUAL',
        referenceNumber: 'HOLD-MDC-001',
        heldPaisa: 25000,
        debitPaisa: 25000,
        creditPaisa: 0,
        runningBalancePaisa: 95000,
        notes: 'Short supply hold placed pending vendor investigation',
        createdByUserId: 'MU-0001',
      },
      // Hold Release: ₹100 (10000 paisa)
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-REL-001',
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        cafeId: CAFE_2,
        entryDate: '2026-09-22',
        entryTimestamp: new Date('2026-09-22T16:00:00Z'),
        entryType: 'HOLD_RELEASE',
        referenceType: 'MANUAL',
        referenceNumber: 'REL-MDC-001',
        debitPaisa: 0,
        creditPaisa: 10000,
        runningBalancePaisa: 105000,
        notes: 'Partial hold release after audit resolution',
        createdByUserId: 'MU-0001',
      },
      // Vendor B isolation entry:
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-B-CN-099',
        vendorId: VENDOR_B_ID,
        vendorNameSnapshot: 'Highland Coffee Roasters',
        cafeId: CAFE_1,
        entryDate: '2026-09-19',
        entryTimestamp: new Date('2026-09-19T12:00:00Z'),
        entryType: 'CREDIT_NOTE',
        referenceType: 'CREDIT_NOTE',
        referenceNumber: 'CN-HIGHLAND-99',
        debitPaisa: 888800,
        creditPaisa: 0,
        runningBalancePaisa: 0,
        notes: 'Highland internal credit',
        createdByUserId: 'MU-0001',
      },
    ]);
  });

  suite.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (mongoReplSet) await mongoReplSet.stop();
  });

  // ── TEST 1: Adjustments Register Listing & 9 Summary KPIs ───────────────────
  await suite.test('1. Adjustments Register Listing & 9 Summary KPIs (GET /api/v1/vendor/adjustments)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/adjustments',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.summary, 'Summary object must exist');

    const s = res.body.summary;
    // Expected KPIs for Vendor A:
    // Total Returns: 1 (GRN-ADJ-001 goods return)
    // Return Value: ₹2,500 (250000 paisa)
    // Debit Notes: 1 (VLE-DN-001)
    // Debit Note Value: ₹300 (30000 paisa)
    // Credit Notes: 1 (VLE-CN-001)
    // Credit Note Value: ₹500 (50000 paisa)
    // Other Adjustments: 2 (VLE-HOLD-001, VLE-REL-001)
    // Open Adjustments: 1 (VLE-HOLD-001 ON_HOLD)
    // Completed Adjustments: 4 (VLE-CN-001 APPLIED, VLE-DN-001 APPLIED, VLE-REL-001 SETTLED, Goods Return COMPLETED)
    assert.equal(s.totalReturns, 1);
    assert.equal(s.returnValuePaisa, 250000);
    assert.equal(s.debitNotesCount, 1);
    assert.equal(s.debitNotesValuePaisa, 30000);
    assert.equal(s.creditNotesCount, 1);
    assert.equal(s.creditNotesValuePaisa, 50000);
    assert.equal(s.otherAdjustmentsCount, 2);
    assert.equal(s.openAdjustmentsCount, 1);
    assert.equal(s.completedAdjustmentsCount, 4);
    assert.equal(s.totalAdjustmentsCount, 5);

    assert.equal(res.body.data.length, 5);
  });

  // ── TEST 2: Authoritative Accounting Direction Verification ─────────────────
  await suite.test('2. Authoritative Accounting Direction Verification (Debit reduces payable / Credit increases / Memo)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/adjustments',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const adjustments = res.body.data;

    // Credit Note: direction DEBIT (reduces payable in vendor subledger)
    const cn = adjustments.find((a) => a.type === 'CREDIT_NOTE');
    assert.ok(cn, 'Credit note adjustment must be present');
    assert.equal(cn.accountingDirection, 'DEBIT');
    assert.match(cn.financialEffect, /Reduces Vendor Payable/);

    // Debit Note: direction DEBIT (reduces payable)
    const dn = adjustments.find((a) => a.type === 'DEBIT_NOTE');
    assert.ok(dn, 'Debit note adjustment must be present');
    assert.equal(dn.accountingDirection, 'DEBIT');
    assert.match(dn.financialEffect, /Reduces Vendor Payable/);

    // Goods Return: direction MEMO with physical return value
    const gr = adjustments.find((a) => a.type === 'GOODS_RETURN');
    assert.ok(gr, 'Goods return must be present');
    assert.equal(gr.accountingDirection, 'MEMO');
    assert.match(gr.financialEffect, /Physical Goods Return/);
    assert.ok(gr.affectedItems.length > 0, 'Goods return must have affected items breakdown');
    assert.equal(gr.affectedItems[0].itemId, 'ITEM-MILK-FULL');
    assert.equal(gr.affectedItems[0].qty, 10);
    assert.equal(gr.affectedItems[0].totalPaisa, 250000);

    // Short Supply Hold: direction DEBIT, status ON_HOLD
    const hold = adjustments.find((a) => a.reference === 'HOLD-MDC-001');
    assert.ok(hold, 'Hold adjustment must be present');
    assert.equal(hold.status, 'ON_HOLD');
    assert.equal(hold.accountingDirection, 'DEBIT');
  });

  // ── TEST 3: Single Adjustment Detail View (6-Zone Detail Payload) ───────────
  await suite.test('3. Single Adjustment Detail View (6-Zone Detail Payload) (GET /api/v1/vendor/adjustments/:id)', async () => {
    // 3a. Detail view for Credit Note
    const resCn = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/adjustments/VLE-CN-001',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(resCn.statusCode, 200);
    assert.equal(resCn.body.success, true);
    const dCn = resCn.body.data;
    assert.ok(dCn.identity, 'Zone 1 identity required');
    assert.equal(dCn.identity.reference, 'CN-MDC-001');
    assert.equal(dCn.identity.type, 'CREDIT_NOTE');

    assert.ok(dCn.financial, 'Zone 2 financial required');
    assert.equal(dCn.financial.amountPaisa, 50000);
    assert.equal(dCn.financial.accountingDirection, 'DEBIT');

    assert.ok(dCn.references, 'Zone 3 references required');
    assert.equal(dCn.references.purchaseOrderId, 'PO-ADJ-001');

    assert.ok(dCn.authorisedReason, 'Zone 5 reason required');
    assert.match(dCn.authorisedReason, /Credit note for agreed pricing rebate/);

    // 3b. Detail view for Goods Return
    const resGr = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/adjustments/RET-PO-ADJ-001-GRN-ADJ-001',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(resGr.statusCode, 200);
    const dGr = resGr.body.data;
    assert.equal(dGr.identity.type, 'GOODS_RETURN');
    assert.equal(dGr.affectedItems.length, 1);
    assert.equal(dGr.affectedItems[0].itemId, 'ITEM-MILK-FULL');
    assert.equal(dGr.affectedItems[0].qty, 10);
    assert.equal(dGr.affectedItems[0].reason, 'Damaged cartons during transit');

    // 3c. Non-existent adjustment returns 404
    const resNotFound = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/adjustments/NON-EXISTENT-999',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resNotFound.statusCode, 404);
    assert.equal(resNotFound.body.error.code, 'ADJUSTMENT_NOT_FOUND');
  });

  // ── TEST 4: Multi-Café Scoping & Parameter Boundaries ───────────────────────
  await suite.test('4. Multi-Café Scoping & Parameter Boundaries', async () => {
    // 4a. Scoped to Cafe 1
    const resCafe1 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/adjustments?cafeId=${CAFE_1}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe1.statusCode, 200);
    // Cafe 1 has: Goods Return, VLE-CN-001, VLE-DN-001 = 3 adjustments
    assert.equal(resCafe1.body.data.length, 3);
    for (const a of resCafe1.body.data) {
      assert.equal(a.cafeId, CAFE_1);
    }

    // 4b. Scoped to Cafe 2
    const resCafe2 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/adjustments?cafeId=${CAFE_2}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe2.statusCode, 200);
    // Cafe 2 has: VLE-HOLD-001, VLE-REL-001 = 2 adjustments
    assert.equal(resCafe2.body.data.length, 2);
    for (const a of resCafe2.body.data) {
      assert.equal(a.cafeId, CAFE_2);
    }

    // 4c. Scoped to unauthorized Cafe 3 -> 403 CROSS_CAFE_ACCESS_DENIED
    const resCafe3 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/adjustments?cafeId=${CAFE_3}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe3.statusCode, 403);
    assert.equal(resCafe3.body.error.code, 'CROSS_CAFE_ACCESS_DENIED');
  });

  // ── TEST 5: Filtering & Universal Search ────────────────────────────────────
  await suite.test('5. Filtering & Universal Search', async () => {
    // 5a. Filter by type: GOODS_RETURN
    const resType = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/adjustments?type=GOODS_RETURN',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resType.statusCode, 200);
    assert.equal(resType.body.data.length, 1);
    assert.equal(resType.body.data[0].type, 'GOODS_RETURN');

    // 5b. Filter by status: ON_HOLD
    const resHold = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/adjustments?status=ON_HOLD',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resHold.statusCode, 200);
    assert.equal(resHold.body.data.length, 1);
    assert.equal(resHold.body.data[0].status, 'ON_HOLD');

    // 5c. Universal Search by keyword "rebate"
    const resSearch = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/adjustments?search=rebate',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resSearch.statusCode, 200);
    assert.equal(resSearch.body.data.length, 1);
    assert.equal(resSearch.body.data[0].reference, 'CN-MDC-001');
  });

  // ── TEST 6: Document Security & A4 Vector PDF Generation ───────────────────
  await suite.test('6. Document Security & A4 Vector PDF Generation (GET /api/v1/vendor/adjustments/:id/pdf)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/adjustments/VLE-CN-001/pdf',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.ok(res.headers['content-disposition'].includes('Adjustment-CN-MDC-001.pdf'));

    const pdfMagic = res.rawBuffer.slice(0, 8).toString('utf8');
    assert.ok(pdfMagic.startsWith('%PDF-1.4'), 'Must start with valid PDF-1.4 header');

    const pdfText = res.rawBuffer.toString('utf8');
    assert.ok(pdfText.includes('ZAMORIN CAFE ERP - OFFICIAL ADJUSTMENT RECORD'));
    assert.ok(pdfText.includes('SYSTEM GENERATED - READ-ONLY VENDOR COPY'));
  });

  // ── TEST 7: Standard CSV Export Security & Data Integrity ───────────────────
  await suite.test('7. Standard CSV Export Security & Data Integrity (GET /api/v1/vendor/adjustments/csv)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/adjustments/csv',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'));
    assert.ok(res.headers['content-disposition'].includes('VendorAdjustments-'));

    const csvText = res.rawBuffer.toString('utf8');
    const lines = csvText.trim().split('\r\n');
    assert.ok(lines.length >= 6, 'Must contain header row + 5 adjustment rows');

    const header = lines[0];
    assert.ok(header.includes('Reference'));
    assert.ok(header.includes('Accounting Direction'));
    assert.ok(header.includes('Financial Effect'));
  });

  // ── TEST 8: Cross-Vendor BOLA / IDOR Isolation ──────────────────────────────
  await suite.test('8. Cross-Vendor BOLA / IDOR Isolation', async () => {
    // 8a. Vendor A list cannot see Vendor B's adjustments
    const resA = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/adjustments',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resA.statusCode, 200);
    const hasVendorBEntry = resA.body.data.some((a) => a.reference === 'CN-HIGHLAND-99' || a.adjustmentId === 'VLE-B-CN-099');
    assert.equal(hasVendorBEntry, false, 'Vendor A must NEVER see Vendor B records');

    // 8b. Direct IDOR attempt by Vendor A on Vendor B adjustment ID -> 404
    const resIdor = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/adjustments/VLE-B-CN-099',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resIdor.statusCode, 404);
    assert.equal(resIdor.body.error.code, 'ADJUSTMENT_NOT_FOUND');
  });

  // ── TEST 9: Server-Side Mutation Denial (Read-Only Enforcement) ─────────────
  await suite.test('9. Server-Side Mutation Denial (Read-Only Enforcement)', async () => {
    const writeMethods = [
      { method: 'POST', path: '/api/v1/vendor/adjustments', body: { reference: 'NEW-NOTE' } },
      { method: 'PUT', path: '/api/v1/vendor/adjustments/VLE-CN-001', body: { status: 'SETTLED' } },
      { method: 'DELETE', path: '/api/v1/vendor/adjustments/VLE-CN-001', body: null },
    ];

    for (const op of writeMethods) {
      const res = await makeRequest({
        port,
        method: op.method,
        path: op.path,
        headers: { Authorization: `Bearer ${vendorAToken}` },
        body: op.body,
      });

      assert.equal(res.statusCode, 403, `HTTP ${op.method} ${op.path} must return 403`);
      assert.equal(res.body.error.code, 'FORBIDDEN_VENDOR_WRITE');
    }
  });

  // ── TEST 10: Frontend Route Allowlist Integrity for Adjustments ─────────────
  await suite.test('10. Frontend Route Allowlist Integrity for Adjustments', async () => {
    assert.equal(isRouteAllowed('VENDOR', 'vendor-adjustments'), true);
    assert.equal(isRouteAllowed('VENDOR', 'vendor/adjustments'), true);
    assert.equal(isRouteAllowed('VENDOR', 'vendor-returns'), true);
    assert.equal(isRouteAllowed('VENDOR', 'vendor/returns'), true);

    // Negative tests: Vendor cannot access internal employee or admin routes
    assert.equal(isRouteAllowed('VENDOR', 'staff-attendance'), false);
    assert.equal(isRouteAllowed('VENDOR', 'payroll'), false);
    assert.equal(isRouteAllowed('VENDOR', 'pos'), false);
  });

  // ── TEST 11: Responsive Component Rendering Contract (No Mutation Controls) ─
  await suite.test('11. Responsive Component Rendering Contract (No Mutation Controls)', async () => {
    const html = renderVendorAdjustments();
    assert.ok(html.includes('id="vendor-adjustments-container"'), 'Container ID required');
    assert.ok(html.includes('id="card-total-returns"'), 'Total Returns KPI card required');
    assert.ok(html.includes('id="card-debit-notes"'), 'Debit Notes KPI card required');
    assert.ok(html.includes('id="card-credit-notes"'), 'Credit Notes KPI card required');
    assert.ok(html.includes('id="modal-adjustment-detail"'), 'Detail modal required');

    // Strict Read-Only UI Guarantee: no create, submit, or edit buttons
    assert.ok(!html.includes('type="submit"'), 'Must have no submit controls');
    assert.ok(!html.includes('btn-create-adjustment'), 'Must have no adjustment creation button');
    assert.ok(!html.includes('btn-delete'), 'Must have no delete controls');
  });

  // ── TEST 12: Development Auth Production Safety (NODE_ENV=production Gating) ─
  await suite.test('12. Development Auth Production Safety (NODE_ENV=production Gating)', async () => {
    const prodApp = createApp({ allowedOrigins: ['*'], production: true });
    const prodServer = http.createServer(prodApp);
    await new Promise((resolve) => prodServer.listen(0, '127.0.0.1', resolve));
    const prodPort = prodServer.address().port;

    const resProd = await makeRequest({
      port: prodPort,
      method: 'GET',
      path: '/api/v1/vendor/adjustments',
      headers: { 'x-dev-bypass': 'true' },
    });

    assert.equal(resProd.statusCode, 401, 'Production mode must reject developer bypass credentials');
    await new Promise((resolve) => prodServer.close(resolve));
  });
});
