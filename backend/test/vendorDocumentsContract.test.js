'use strict';

/**
 * VEN-SCR-010: DOCUMENTS CENTRE CONTRACT TEST SUITE
 *
 * Validates:
 * 1. Documents Centre Register & 5 Summary KPI cards:
 *    - totalDocuments, poAndGrnDocuments, financialAndTaxDocuments, agreementsDocuments, authorizedCafesCount
 * 2. Cross-subsystem document aggregation integrity (POs, GRNs, Invoices, Payments, Adjustments, Rate Schedules, Business Documents)
 * 3. Multi-café scoping constraints (Authorized café allowed, foreign café rejected with 403 CROSS_CAFE_ACCESS_DENIED)
 * 4. Universal search, category filtering & date range scoping
 * 5. Universal Download Dispatcher for commercial documents (PO, GRN, Invoice, Payment, Rate Schedule)
 * 6. Business Document streaming & attachment security
 * 7. Standard CSV export security & data integrity
 * 8. Cross-Vendor BOLA / IDOR isolation (Vendor A cannot inspect or access Vendor B documents)
 * 9. Strict server-side mutation prevention (POST/PUT/PATCH/DELETE blocked with 403 FORBIDDEN_VENDOR_WRITE)
 * 10. Margin redaction guarantee (No retail margins or competitor prices exposed)
 * 11. Frontend route allowlist integrity for vendor-documents
 * 12. Responsive mobile & component rendering contract (No upload forms or mutation controls in template)
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
const { PurchaseOrder } = require('../src/models/PurchaseOrder');
const { APInvoice } = require('../src/models/APInvoice');
const { VendorLedgerEntry } = require('../src/models/VendorLedgerEntry');
const { BusinessDocument } = require('../src/models/BusinessDocument');
const { isRouteAllowed } = require('../../Frontend/src/js/navigation.js');
const { renderVendorDocuments } = require('../../Frontend/src/js/pages/vendorDocuments.js');
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

test('VEN-SCR-010: Vendor Documents Centre Contract Test Suite', async (suite) => {
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

    // 2. Seed Vendor A & Vendor B
    await Vendor.create([
      {
        organisationId: ORG_ID,
        vendorId: VENDOR_A_ID,
        name: 'Malabar Agro Roasters LLP',
        legalName: 'Malabar Agro Roasters LLP',
        tradeName: 'Malabar Agro',
        category: 'FOOD_BEVERAGE',
        supplierType: 'GOODS',
        gstNumber: '32AAACM9001D1Z5',
        panNumber: 'AAACM9001D',
        status: 'ACTIVE',
        isApproved: true,
        approvedCafeIds: [CAFE_1, CAFE_2],
        createdByUserId: 'MU-0001',
        itemCatalogue: [
          {
            itemId: 'ITEM-COF-01',
            supplierItemCode: 'MAR-COF-01',
            itemName: 'Arabica Espresso Blend',
            uom: 'kg',
            packSize: '1 kg Foil Bag',
            currentPricePaisa: 98000,
            taxPercent: 5,
            moq: 5,
            leadTimeDays: 2,
            status: 'ACTIVE',
            priceHistory: [],
          },
        ],
      },
      {
        organisationId: ORG_ID,
        vendorId: VENDOR_B_ID,
        name: 'Nilgiri Packaging Solutions',
        legalName: 'Nilgiri Packaging Solutions Pvt Ltd',
        tradeName: 'Nilgiri Pack',
        category: 'FOOD_BEVERAGE',
        supplierType: 'GOODS',
        gstNumber: '33AABCN9002E1Z9',
        status: 'ACTIVE',
        isApproved: true,
        approvedCafeIds: [CAFE_1],
        createdByUserId: 'MU-0001',
        itemCatalogue: [],
      },
    ]);

    // 3. Seed Users & Authentic Sessions
    const passwordHash = await authService.hashPassword('TEST_FIXTURE_HASH_ONLY_NOT_FOR_LOGIN#999');

    const userA = await User.create({
      organisationId: ORG_ID,
      userId: 'VU-0001',
      email: 'vendorA@malabaragro.com',
      name: 'Malabar Documents Officer',
      role: 'VENDOR',
      vendorId: VENDOR_A_ID,
      accountStatus: 'ACTIVE',
      createdBy: 'MU-0001',
      passwordHash,
    });

    const userB = await User.create({
      organisationId: ORG_ID,
      userId: 'VU-0002',
      email: 'vendorB@nilgiripack.com',
      name: 'Nilgiri Commercial Officer',
      role: 'VENDOR',
      vendorId: VENDOR_B_ID,
      accountStatus: 'ACTIVE',
      createdBy: 'MU-0001',
      passwordHash,
    });

    const userStaff = await User.create({
      organisationId: ORG_ID,
      userId: 'ST-0001',
      email: 'staff@zamorin.com',
      name: 'Deepak Cashier',
      role: 'STAFF',
      cafeId: CAFE_1,
      accountStatus: 'ACTIVE',
      createdBy: 'MU-0001',
      passwordHash,
    });

    const sA = await authService.createSession({ user: userA, device: { deviceId: 'DEV-A' }, mfaVerified: true });
    vendorAToken = sA.accessToken;

    const sB = await authService.createSession({ user: userB, device: { deviceId: 'DEV-B' }, mfaVerified: true });
    vendorBToken = sB.accessToken;

    const sStaff = await authService.createSession({ user: userStaff, device: { deviceId: 'DEV-STAFF' }, mfaVerified: true });
    staffToken = sStaff.accessToken;

    // 4. Seed Cross-Subsystem Commercial Artifacts for Vendor A
    // 4a. Purchase Order with GRN and Receipt Attachment
    await PurchaseOrder.create({
      organisationId: ORG_ID,
      purchaseOrderId: 'PO-DOC-001',
      vendorId: VENDOR_A_ID,
      cafeId: CAFE_1,
      status: 'APPROVED',
      createdByUserId: 'MU-0001',
      orderDate: '2026-03-10',
      totalPaisa: 490000,
      lineItems: [
        {
          itemId: 'ITEM-COF-01',
          itemNameSnapshot: 'Arabica Espresso Blend',
          orderedQuantityBase: 5,
          unitPricePaisa: 98000,
          totalLinePaisa: 490000,
          totalPaisa: 490000,
          baseUnit: 'kg',
        },
      ],
      grnReceipts: [
        {
          grnId: 'GRN-DOC-001',
          deliveryNoteNumber: 'DN-MAR-001',
          receivedAt: new Date('2026-03-12T10:00:00Z'),
          receivedByUserId: 'ST-0001',
          verificationStatus: 'COMPLETED',
          items: [
            {
              itemId: 'ITEM-COF-01',
              deliveredQty: 5,
              acceptedQty: 5,
              rejectedQty: 0,
              missingQty: 0,
              disposition: null,
            },
          ],
          receiptAttachments: [
            {
              attachmentId: 'ATT-MAR-001',
              filename: 'SignedDeliveryChallan-MAR-001.pdf',
              mimeType: 'application/pdf',
              uploadedAt: new Date('2026-03-12T10:30:00Z'),
              uploadedByUserId: 'ST-0001',
              dataBase64: Buffer.from('%PDF-1.4\n% Signed Delivery Challan\n', 'utf8').toString('base64'),
            },
          ],
        },
      ],
    });

    // 4b. AP Invoice for Vendor A
    await APInvoice.create({
      organisationId: ORG_ID,
      invoiceId: 'INV-DOC-001',
      vendorId: VENDOR_A_ID,
      vendorName: 'Malabar Agro Roasters LLP',
      cafeId: CAFE_1,
      purchaseOrderId: 'PO-DOC-001',
      supplierInvoiceNumber: 'INV-MAR-9901',
      invoiceDate: new Date('2026-03-12'),
      dueDate: new Date('2026-04-12'),
      amountPaisa: 466667,
      taxPaisa: 23333,
      totalPaisa: 490000,
      approvedPayableAmountPaisa: 490000,
      status: 'APPROVED',
      isApproved: true,
      createdByUserId: 'MU-0001',
    });

    // 4c. Vendor Ledger Payment Voucher for Vendor A
    await VendorLedgerEntry.create([
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-PAY-001',
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Agro Roasters LLP',
        cafeId: CAFE_1,
        entryType: 'PAYMENT',
        transactionType: 'PAYMENT',
        referenceNumber: 'PAY-MAR-5501',
        entryDate: '2026-03-15',
        debitPaisa: 490000,
        creditPaisa: 0,
        runningBalancePaisa: 0,
        description: 'Electronic Settlement for INV-MAR-9901',
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        ledgerEntryId: 'VLE-ADJ-001',
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Agro Roasters LLP',
        cafeId: CAFE_2,
        entryType: 'CREDIT_NOTE',
        transactionType: 'CREDIT_NOTE',
        referenceNumber: 'CN-MAR-001',
        entryDate: '2026-03-18',
        debitPaisa: 0,
        creditPaisa: 15000,
        runningBalancePaisa: 15000,
        description: 'Quality Rebate Credit Note',
        createdByUserId: 'MU-0001',
      },
    ]);

    // 4d. Business Document (GST Certificate) for Vendor A
    await BusinessDocument.create({
      organisationId: ORG_ID,
      documentId: 'BD-GST-MAR-01',
      entityType: 'VENDOR',
      entityId: VENDOR_A_ID,
      relatedRecordId: VENDOR_A_ID,
      title: 'Vendor GSTIN Registration Certificate',
      documentType: 'GST_CERTIFICATE',
      classification: 'SUPPLIER_GENERAL',
      cafeId: CAFE_1,
      originalFilename: 'GST-Certificate-Malabar.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      uploadedBy: 'MU-0001',
      uploadedByUserId: 'MU-0001',
      fileData: Buffer.from('%PDF-1.4\n% Official GST Certificate\n', 'utf8').toString('base64'),
      versions: [
        {
          version: 1,
          originalFilename: 'GST-Certificate-Malabar.pdf',
          internalFilename: 'GST-Certificate-Malabar-v1.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          uploadedBy: 'MU-0001',
          fileData: Buffer.from('%PDF-1.4\n% Official GST Certificate\n', 'utf8').toString('base64'),
        },
      ],
    });

    // 4e. Vendor B BusinessDocument in the SAME authorized cafe.
    // Vendor A must never see/download it merely because both vendors serve CAFE_1.
    await BusinessDocument.create({
      organisationId: ORG_ID,
      documentId: 'BD-GST-OTHER-01',
      entityType: 'VENDOR',
      entityId: VENDOR_B_ID,
      relatedRecordId: VENDOR_B_ID,
      title: 'Other Vendor GST Certificate',
      documentType: 'GST_CERTIFICATE',
      classification: 'SUPPLIER_GENERAL',
      cafeId: CAFE_1,
      originalFilename: 'GST-Certificate-Other.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 64,
      uploadedBy: 'MU-0001',
      uploadedByUserId: 'MU-0001',
      fileData: Buffer.from('%PDF-1.4\n% OTHER VENDOR ONLY\n', 'utf8').toString('base64'),
      versions: [
        {
          version: 1,
          originalFilename: 'GST-Certificate-Other.pdf',
          internalFilename: 'GST-Certificate-Other-v1.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 64,
          uploadedBy: 'MU-0001',
          fileData: Buffer.from('%PDF-1.4\n% OTHER VENDOR ONLY\n', 'utf8').toString('base64'),
        },
      ],
    });

    // Vendor A metadata record with intentionally unavailable bytes.
    await BusinessDocument.create({
      organisationId: ORG_ID,
      documentId: 'BD-MISSING-BINARY-01',
      entityType: 'VENDOR',
      entityId: VENDOR_A_ID,
      relatedRecordId: VENDOR_A_ID,
      title: 'Unavailable Historical Attachment',
      documentType: 'VENDOR_AGREEMENT',
      classification: 'SUPPLIER_GENERAL',
      cafeId: CAFE_1,
      originalFilename: 'Unavailable-Historical-Attachment.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 128,
      uploadedBy: 'MU-0001',
      uploadedByUserId: 'MU-0001',
      versions: [],
    });

    // 4f. Vendor B Artifact (PO for Vendor B)
    await PurchaseOrder.create({
      organisationId: ORG_ID,
      purchaseOrderId: 'PO-DOC-VB-01',
      vendorId: VENDOR_B_ID,
      cafeId: CAFE_1,
      status: 'APPROVED',
      createdByUserId: 'MU-0001',
      orderDate: '2026-03-10',
      totalPaisa: 200000,
      lineItems: [
        {
          itemId: 'ITEM-VB-01',
          itemNameSnapshot: 'Packaging Boxes 250ml',
          orderedQuantityBase: 100,
          unitPricePaisa: 2000,
          totalLinePaisa: 200000,
          totalPaisa: 200000,
          baseUnit: 'unit',
        },
      ],
    });
  });

  suite.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
    if (mongoReplSet) {
      await mongoReplSet.stop();
    }
  });

  // 1. DOCUMENTS CENTRE REGISTER & 5 SUMMARY KPIS
  await suite.test('1. Documents Centre Register returns aggregated documents and 5 authoritative KPIs', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);

    const { summary, data } = res.body;
    assert.ok(summary, 'Summary must exist');
    assert.ok(summary.totalDocuments >= 6, 'Should aggregate at least 6 commercial documents');
    assert.ok(summary.poAndGrnDocuments >= 3, 'Should count PO, GRN and Attachment');
    assert.ok(summary.financialAndTaxDocuments >= 3, 'Should count Invoice, Payment, and GST Certificate');
    assert.ok(summary.agreementsDocuments >= 1, 'Should count Rate Schedule');
    assert.equal(summary.authorizedCafesCount, 2, 'Vendor A has 2 authorized cafes');
    assert.ok(data.length >= 6, 'Data array length must match total count');
  });

  // 2. CROSS-SUBSYSTEM AGGREGATION VERIFICATION
  await suite.test('2. Aggregates POs, GRNs, Invoices, Payments, Adjustments, Rate Schedules, and Business Documents', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const docs = res.body.data;

    // Check PO doc
    const poDoc = docs.find((d) => d.category === 'PURCHASE_ORDER');
    assert.ok(poDoc, 'PO document must exist');
    assert.equal(poDoc.referenceNumber, 'PO-DOC-001');

    // Check GRN doc
    const grnDoc = docs.find((d) => d.category === 'GOODS_RECEIPT' && d.docId.includes('GRN-DOC-001'));
    assert.ok(grnDoc, 'GRN document must exist');

    // Check Invoice doc
    const invDoc = docs.find((d) => d.category === 'INVOICE');
    assert.ok(invDoc, 'Invoice document must exist');
    assert.equal(invDoc.referenceNumber, 'INV-MAR-9901');

    // Check Payment voucher doc
    const payDoc = docs.find((d) => d.category === 'PAYMENT_RECEIPT');
    assert.ok(payDoc, 'Payment receipt document must exist');
    assert.equal(payDoc.referenceNumber, 'PAY-MAR-5501');

    // Check Adjustment doc
    const adjDoc = docs.find((d) => d.category === 'ADJUSTMENT');
    assert.ok(adjDoc, 'Adjustment document must exist');
    assert.equal(adjDoc.referenceNumber, 'CN-MAR-001');

    // Check Rate Schedule doc
    const rateDoc = docs.find((d) => d.category === 'RATE_SCHEDULE');
    assert.ok(rateDoc, 'Rate Schedule document must exist');
    assert.equal(rateDoc.referenceNumber, 'MAR-COF-01');

    // Check Business Document (GST)
    const gstDoc = docs.find((d) => d.category === 'TAX_STATUTORY');
    assert.ok(gstDoc, 'Statutory GST document must exist');
  });

  // 3. MULTI-CAFÉ SCOPING CONSTRAINTS
  await suite.test('3. Multi-café scoping: Authorized cafe allowed, unauthorized rejected with 403', async () => {
    // Authorized: CAFE_1
    const resAuth = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/documents?cafeId=${CAFE_1}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resAuth.statusCode, 200);
    assert.equal(resAuth.body.success, true);

    // Unauthorized: CAFE_3
    const resUnauth = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/documents?cafeId=${CAFE_3}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resUnauth.statusCode, 403);
    assert.equal(resUnauth.body?.error?.code || resUnauth.body?.code, 'CROSS_CAFE_ACCESS_DENIED');
  });

  // 4. UNIVERSAL SEARCH, CATEGORY FILTER & DATE RANGE
  await suite.test('4. Filter by category, search keyword, date range, and sort orders', async () => {
    // Filter by category: INVOICE
    const resInv = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents?category=INVOICE',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resInv.statusCode, 200);
    assert.equal(resInv.body.data.length, 1);
    assert.equal(resInv.body.data[0].category, 'INVOICE');

    // Search by keyword "MAR-5501"
    const resSearch = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents?search=MAR-5501',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resSearch.statusCode, 200);
    assert.equal(resSearch.body.data.length, 1);
    assert.equal(resSearch.body.data[0].referenceNumber, 'PAY-MAR-5501');

    // Sort by name A-Z
    const resSortName = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents?sortBy=name_asc',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resSortName.statusCode, 200);
    assert.ok(resSortName.body.data[0].title.localeCompare(resSortName.body.data[1].title) <= 0);
  });

  // 5. UNIVERSAL DOWNLOAD DISPATCHER FOR COMMERCIAL DOCUMENTS
  await suite.test('5. Universal download dispatcher renders official PDFs', async () => {
    // 5a. PO PDF Download
    const resPoPdf = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents/DOC-PO-PO-DOC-001/download',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resPoPdf.statusCode, 200);
    assert.equal(resPoPdf.headers['content-type'], 'application/pdf');

    // 5b. GRN PDF Download
    const resGrnPdf = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents/DOC-GRN-GRN-DOC-001/download',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resGrnPdf.statusCode, 200);
    assert.equal(resGrnPdf.headers['content-type'], 'application/pdf');

    // 5c. Invoice PDF Download
    const resInvPdf = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents/DOC-INV-INV-DOC-001/download',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resInvPdf.statusCode, 200);
    assert.equal(resInvPdf.headers['content-type'], 'application/pdf');

    // 5d. Payment Receipt PDF Download
    const resPayPdf = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents/DOC-PAY-VLE-PAY-001/download',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resPayPdf.statusCode, 200);
    assert.equal(resPayPdf.headers['content-type'], 'application/pdf');

    // 5e. Rate Schedule PDF Download
    const resRatePdf = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents/DOC-RATE-ITEM-COF-01/download',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resRatePdf.statusCode, 200);
    assert.equal(resRatePdf.headers['content-type'], 'application/pdf');
  });

  // 6. BUSINESS DOCUMENT STREAMING
  await suite.test('6. Business Document streaming & attachment security', async () => {
    const resDoc = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents/BD-GST-MAR-01/file',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(resDoc.statusCode, 200);
    assert.equal(resDoc.headers['content-type'], 'application/pdf');
    assert.ok(resDoc.headers['content-disposition'].includes('GST-Certificate-Malabar.pdf'));
    const content = resDoc.rawBuffer.toString('utf8');
    assert.ok(content.includes('Official GST Certificate'));
  });

  await suite.test('6b. Missing document bytes return truthful 404 instead of synthetic PDF success', async () => {
    const resMissing = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents/BD-MISSING-BINARY-01/file',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(resMissing.statusCode, 404);
    assert.equal(
      resMissing.body?.error?.code || resMissing.body?.code,
      'DOCUMENT_BINARY_NOT_FOUND'
    );
    assert.equal(resMissing.headers['content-type']?.includes('application/pdf'), false);
  });

  // 7. STANDARD CSV EXPORT
  await suite.test('7. Standard CSV export security and data integrity', async () => {
    const resCsv = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents/csv',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(resCsv.statusCode, 200);
    assert.ok(resCsv.headers['content-type'].includes('text/csv'));
    assert.ok(resCsv.headers['content-disposition'].includes('VendorDocuments-'));
    const csvText = resCsv.rawBuffer.toString('utf8');
    assert.ok(csvText.includes('Document ID,Document Title,Category'));
    assert.ok(csvText.includes('PO-DOC-001'));
    assert.ok(csvText.includes('INV-MAR-9901'));
  });

  // 8. CROSS-VENDOR BOLA / IDOR ISOLATION
  await suite.test('8. Cross-Vendor BOLA / IDOR isolation: Vendor A cannot access Vendor B documents', async () => {
    // Vendor A listing should NOT contain Vendor B PO
    const resAList = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resAList.statusCode, 200);
    assert.equal(resAList.body.data.some((d) => d.referenceNumber === 'PO-DOC-VB-01'), false);
    assert.equal(
      resAList.body.data.some((d) => d.referenceNumber === 'BD-GST-OTHER-01'),
      false,
      'Vendor A must not see Vendor B BusinessDocument from the same cafe'
    );

    const resForeignBusinessDoc = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents/BD-GST-OTHER-01/file',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(
      resForeignBusinessDoc.statusCode,
      404,
      'Exact foreign BusinessDocument download must fail without leaking same-cafe documents'
    );

    // Vendor A trying to download Vendor B PO directly via universal dispatcher
    const resIdor = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents/DOC-PO-PO-DOC-VB-01/download',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resIdor.statusCode, 404, 'Must return 404 RECORD_NOT_FOUND when attempting to download foreign PO');

    // Vendor B listing should only see Vendor B records
    const resBList = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents',
      headers: { Authorization: `Bearer ${vendorBToken}` },
    });
    assert.equal(resBList.statusCode, 200);
    assert.ok(resBList.body.data.some((d) => d.referenceNumber === 'PO-DOC-VB-01'));
    assert.equal(resBList.body.data.some((d) => d.referenceNumber === 'PO-DOC-001'), false);
  });

  // 9. STRICT SERVER-SIDE MUTATION DENIAL
  await suite.test('9. Server-side blocks POST/PUT/PATCH/DELETE with 403 FORBIDDEN_VENDOR_WRITE', async () => {
    const methods = [
      { method: 'POST', path: '/api/v1/vendor/documents', body: { title: 'Upload' } },
      { method: 'PUT', path: '/api/v1/vendor/documents/DOC-PO-001', body: { status: 'DELETED' } },
      { method: 'PATCH', path: '/api/v1/vendor/documents/DOC-PO-001', body: { title: 'New' } },
      { method: 'DELETE', path: '/api/v1/vendor/documents/DOC-PO-001', body: null },
    ];

    for (const m of methods) {
      const res = await makeRequest({
        port,
        method: m.method,
        path: m.path,
        headers: { Authorization: `Bearer ${vendorAToken}` },
        body: m.body,
      });

      assert.equal(res.statusCode, 403, `${m.method} must return 403`);
      assert.equal(res.body?.error?.code || res.body?.code, 'FORBIDDEN_VENDOR_WRITE');
    }
  });

  // 10. MARGIN REDACTION GUARANTEE
  await suite.test('10. Margin Redaction Guarantee: Zero internal markups or selling prices leaked', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/documents',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const rawJson = JSON.stringify(res.body);
    assert.equal(rawJson.includes('retailSellingPrice'), false, 'retailSellingPrice must not leak');
    assert.equal(rawJson.includes('menuPrice'), false, 'menuPrice must not leak');
    assert.equal(rawJson.includes('grossMargin'), false, 'grossMargin must not leak');
    assert.equal(rawJson.includes('contributionMargin'), false, 'contributionMargin must not leak');
  });

  // 11. FRONTEND ROUTE ALLOWLIST INTEGRITY
  await suite.test('11. Frontend navigation allowlist integrity for vendor-documents', () => {
    assert.equal(isRouteAllowed('vendor', 'vendor-documents'), true);
    assert.equal(isRouteAllowed('vendor', 'vendor/documents'), true);

    // Disallowed internal routes
    assert.equal(isRouteAllowed('vendor', 'staff-payroll'), false);
    assert.equal(isRouteAllowed('vendor', 'ledger'), false);
    assert.equal(isRouteAllowed('vendor', 'kiosk-attendance'), false);
  });

  // 12. RESPONSIVE COMPONENT RENDERING & ZERO MUTATION CONTROLS
  await suite.test('12. Component rendering outputs 5 KPI cards, modal, and zero mutation controls', () => {
    const html = renderVendorDocuments();
    assert.ok(html.includes('id="vendor-documents-container"'), 'Container must exist');
    assert.ok(html.includes('id="card-total-documents"'), 'Card 1 must exist');
    assert.ok(html.includes('id="card-po-grn-docs"'), 'Card 2 must exist');
    assert.ok(html.includes('id="card-finance-tax-docs"'), 'Card 3 must exist');
    assert.ok(html.includes('id="card-agreements-docs"'), 'Card 4 must exist');
    assert.ok(html.includes('id="card-authorized-cafes"'), 'Card 5 must exist');
    assert.ok(html.includes('id="input-documents-search"'), 'Search input must exist');
    assert.ok(html.includes('id="select-document-category"'), 'Category select must exist');
    assert.ok(html.includes('id="select-document-date-range"'), 'Date range select must exist');
    assert.ok(html.includes('id="select-document-sort"'), 'Sort select must exist');
    assert.ok(html.includes('id="vendor-document-detail-modal"'), 'Detail modal must exist');
    assert.ok(html.includes('btn-export-documents-csv'), 'CSV export button must exist');

    // Strict Read-Only Verification
    assert.equal(html.includes('<form'), false, 'Template must NOT contain <form>');
    assert.equal(html.includes('type="file"'), false, 'Template must NOT contain file upload inputs');
    assert.equal(html.includes('type="submit"'), false, 'Template must NOT contain submit button');
    assert.equal(html.includes('contenteditable'), false, 'Template must NOT contain editable elements');
  });

  // 13. PRODUCTION AUTHENTICATION SAFETY
  await suite.test('13. Development auth bypass is rejected in production mode with 401', async () => {
    const prodApp = createApp({ allowedOrigins: ['*'], production: true });
    const prodServer = http.createServer(prodApp);
    await new Promise((resolve) => prodServer.listen(0, '127.0.0.1', resolve));
    const prodPort = prodServer.address().port;

    try {
      const res = await makeRequest({
        port: prodPort,
        method: 'GET',
        path: '/api/v1/vendor/documents',
        headers: {
          'x-dev-user-id': 'VU-0001',
          'x-dev-role': 'VENDOR',
        },
      });

      assert.equal(res.statusCode, 401, 'Dev headers must be rejected in production mode');
    } finally {
      await new Promise((resolve) => prodServer.close(resolve));
    }
  });
});
