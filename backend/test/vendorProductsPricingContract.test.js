'use strict';

/**
 * VEN-SCR-009: PRODUCTS & APPROVED PRICING CONTRACT TEST SUITE
 *
 * Validates:
 * 1. Product Register listing & 4 Summary KPI cards:
 *    - totalProducts, activeProducts, categoriesCount, averageLeadTimeDays
 * 2. Rate specification correctness & formatting:
 *    - approvedPurchaseRatePaisa, approvedPurchaseRateFormatted, gstRatePercent, hsnSac, uom, packSize, moq, leadTimeDays
 * 3. Single Product Detail View (6-Zone Detail Payload without internal margin exposure)
 * 4. Strict Margin Redaction Guarantee (Retail selling prices, menu prices, markups, and margins are stripped)
 * 5. Multi-café scoping constraints (Authorized café allowed, foreign café rejected with 403 CROSS_CAFE_ACCESS_DENIED)
 * 6. Universal search & filter functionality (Category, status, search keyword, and sorting)
 * 7. Document security & official Vector A4 Rate Schedule PDF generation (SYSTEM GENERATED - READ-ONLY VENDOR COPY)
 * 8. Standard CSV export security & data integrity
 * 9. Cross-Vendor BOLA / IDOR isolation (Vendor A cannot inspect or access Vendor B products or rates)
 * 10. Strict server-side mutation prevention (POST/PUT/PATCH/DELETE blocked with 403 FORBIDDEN_VENDOR_WRITE)
 * 11. Frontend route allowlist integrity for vendor-products
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
const { PurchaseOrder } = require('../src/models/PurchaseOrder');
const { GlobalInventoryItem } = require('../src/models/GlobalInventoryItem');
const { isRouteAllowed } = require('../../Frontend/src/js/navigation.js');
const { renderVendorProducts } = require('../../Frontend/src/js/pages/vendorProducts.js');
const authService = require('../src/services/authService');

const ORG_ID = 'ORG-ZAMORIN';
const CAFE_1 = 'ZC-0001';
const CAFE_2 = 'ZC-0002';
const CAFE_3 = 'ZC-0003'; // Unauthorized cafe for Vendor A

const VENDOR_A_ID = 'VEN-8001';
const VENDOR_B_ID = 'VEN-8002';

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

test('VEN-SCR-009: Vendor Products & Approved Pricing Contract Test Suite', async (suite) => {
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

    // 2. Seed Global Inventory Items
    await GlobalInventoryItem.create([
      {
        organisationId: ORG_ID,
        itemId: 'ITEM-COF-01',
        sku: 'SKU-COF-01',
        name: 'Arabica Dark Roast AA',
        category: 'COFFEE_BEANS',
        baseUnit: 'kg',
        packSize: 1,
        barcode: 'HSN-0901',
        status: 'ACTIVE',
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        itemId: 'ITEM-COF-02',
        sku: 'SKU-COF-02',
        name: 'Monsooned Malabar Premium',
        category: 'COFFEE_BEANS',
        baseUnit: 'kg',
        packSize: 1,
        barcode: 'HSN-0901',
        status: 'ACTIVE',
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        itemId: 'ITEM-MLK-01',
        sku: 'SKU-MLK-01',
        name: 'Farm Fresh Organic Whole Milk',
        category: 'DAIRY_FRESH',
        baseUnit: 'liter',
        packSize: 1,
        barcode: 'HSN-0401',
        status: 'ACTIVE',
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        itemId: 'ITEM-PKG-01',
        sku: 'SKU-PKG-01',
        name: 'Biodegradable Zamorin Coffee Cup 250ml',
        category: 'PACKAGING_CONSUMABLES',
        baseUnit: 'unit',
        packSize: 100,
        barcode: 'HSN-4823',
        status: 'ACTIVE',
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        itemId: 'ITEM-VB-01',
        sku: 'SKU-VB-01',
        name: 'Vendor B Exclusive Chai Masala',
        category: 'OTHER_CONTROLLED_MATERIALS',
        baseUnit: 'kg',
        packSize: 1,
        barcode: 'HSN-0910',
        status: 'ACTIVE',
        createdByUserId: 'MU-0001',
      },
    ]);

    // 3. Seed Vendor A (Malabar Plantation Supplies)
    const effectivePast = new Date(Date.now() - 60 * 24 * 3600 * 1000);
    const effectivePresent = new Date(Date.now() - 10 * 24 * 3600 * 1000);

    await Vendor.create({
      organisationId: ORG_ID,
      vendorId: VENDOR_A_ID,
      name: 'Malabar Plantation Supplies LLP',
      legalName: 'Malabar Plantation Supplies LLP',
      tradeName: 'Malabar Coffee Co.',
      category: 'FOOD_BEVERAGE',
      supplierType: 'GOODS',
      gstNumber: '32AAACM1234D1Z5',
      panNumber: 'AAACM1234D',
      status: 'ACTIVE',
      isApproved: true,
      approvedCafeIds: [CAFE_1, CAFE_2],
      createdByUserId: 'MU-0001',
      itemCatalogue: [
        {
          itemId: 'ITEM-COF-01',
          supplierItemCode: 'MPS-ARB-DARK',
          itemName: 'Arabica Dark Roast AA',
          uom: 'kg',
          packSize: '1 kg Foil Bag',
          currentPricePaisa: 95000, // ₹950.00
          taxPercent: 5,
          moq: 10,
          leadTimeDays: 2,
          status: 'ACTIVE',
          priceHistory: [
            {
              effectiveFrom: effectivePast,
              effectiveTo: effectivePresent,
              pricePaisa: 90000,
              previousPricePaisa: 85000,
              changeReason: 'Annual supplier rate indexation',
              agreementReference: 'AGR-2025-MPS-01',
            },
            {
              effectiveFrom: effectivePresent,
              effectiveTo: null,
              pricePaisa: 95000,
              previousPricePaisa: 90000,
              changeReason: 'Green bean market revision',
              agreementReference: 'AGR-2026-MPS-02',
            },
          ],
        },
        {
          itemId: 'ITEM-COF-02',
          supplierItemCode: 'MPS-MAL-PREM',
          itemName: 'Monsooned Malabar Premium',
          uom: 'kg',
          packSize: '1 kg Foil Bag',
          currentPricePaisa: 110000, // ₹1,100.00
          taxPercent: 5,
          moq: 5,
          leadTimeDays: 3,
          status: 'ACTIVE',
          priceHistory: [],
        },
        {
          itemId: 'ITEM-PKG-01',
          supplierItemCode: 'MPS-CUP-250',
          itemName: 'Biodegradable Zamorin Coffee Cup 250ml',
          uom: 'unit',
          packSize: 'Sleeve of 100',
          currentPricePaisa: 350, // ₹3.50
          taxPercent: 18,
          moq: 500,
          leadTimeDays: 5,
          status: 'INACTIVE',
          priceHistory: [],
        },
      ],
    });

    // 4. Seed Vendor B (Nilgiri Tea & Spice Corp)
    await Vendor.create({
      organisationId: ORG_ID,
      vendorId: VENDOR_B_ID,
      name: 'Nilgiri Tea & Spice Corp',
      legalName: 'Nilgiri Tea & Spice Corp',
      tradeName: 'Nilgiri Blends',
      category: 'FOOD_BEVERAGE',
      supplierType: 'GOODS',
      gstNumber: '33AABCN5678E1Z9',
      status: 'ACTIVE',
      isApproved: true,
      approvedCafeIds: [CAFE_1],
      createdByUserId: 'MU-0001',
      itemCatalogue: [
        {
          itemId: 'ITEM-VB-01',
          supplierItemCode: 'NIL-TEA-001',
          itemName: 'Vendor B Exclusive Chai Masala',
          uom: 'kg',
          packSize: '1 kg Tin',
          currentPricePaisa: 65000, // ₹650.00
          taxPercent: 5,
          moq: 5,
          leadTimeDays: 4,
          status: 'ACTIVE',
          priceHistory: [],
        },
      ],
    });

    // 5. Seed Users & Sessions
    const passwordHash = await authService.hashPassword('TEST_FIXTURE_HASH_ONLY_NOT_FOR_LOGIN#999');

    const userA = await User.create({
      organisationId: ORG_ID,
      userId: 'VU-0001',
      email: 'vendorA@malabarplantations.com',
      name: 'Suresh Menon',
      role: 'VENDOR',
      vendorId: VENDOR_A_ID,
      accountStatus: 'ACTIVE',
      createdBy: 'MU-0001',
      passwordHash,
    });

    const userB = await User.create({
      organisationId: ORG_ID,
      userId: 'VU-0002',
      email: 'vendorB@nilgiri.com',
      name: 'Ravi Verma',
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

  // 1. PRODUCT REGISTER LISTING & 4 SUMMARY KPIS
  await suite.test('1. Products Register returns list and 4 authoritative summary KPIs', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/products',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);

    const { summary, data } = res.body;
    assert.ok(summary, 'Summary object must exist');
    assert.equal(summary.totalProducts, 3, 'Should list 3 products for Vendor A');
    assert.equal(summary.activeProducts, 2, 'Should have 2 ACTIVE products');
    assert.equal(summary.categoriesCount, 2, 'Should span 2 categories (COFFEE_BEANS, PACKAGING_CONSUMABLES)');
    // Average lead time: (2 + 3 + 5) / 3 = 10 / 3 = 3.3 days
    assert.equal(summary.averageLeadTimeDays, 3.3, 'Average lead time should match');
    assert.equal(data.length, 3, 'Data array length must match total products');
  });

  // 2. RATE SPECIFICATION & ACCURACY VERIFICATION
  await suite.test('2. Rate specifications and financial attributes are accurately reported', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/products',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const itemDark = res.body.data.find((p) => p.itemId === 'ITEM-COF-01');
    assert.ok(itemDark, 'ITEM-COF-01 must be present');
    assert.equal(itemDark.vendorSku, 'MPS-ARB-DARK');
    assert.equal(itemDark.productName, 'Arabica Dark Roast AA');
    assert.equal(itemDark.approvedPurchaseRatePaisa, 95000);
    assert.ok(itemDark.approvedPurchaseRateFormatted.includes('950'), 'Formatted rate should show ₹950');
    assert.equal(itemDark.uom, 'kg');
    assert.equal(itemDark.packSize, '1 kg Foil Bag');
    assert.equal(itemDark.moq, 10);
    assert.equal(itemDark.leadTimeDays, 2);
    assert.equal(itemDark.status, 'ACTIVE');
  });

  // 3. SINGLE PRODUCT DETAIL VIEW (6-ZONE ARCHITECTURE)
  await suite.test('3. Single Product Detail View returns 6-zone payload and price history', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/products/ITEM-COF-01',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);

    const { itemIdentity, procurementSpec, pricingAndTax, applicableCafes, priceHistory } = res.body.data;
    assert.ok(itemIdentity, 'Zone 1: itemIdentity must exist');
    assert.equal(itemIdentity.itemId, 'ITEM-COF-01');
    assert.equal(itemIdentity.category, 'COFFEE_BEANS');

    assert.ok(procurementSpec, 'Zone 2: procurementSpec must exist');
    assert.equal(procurementSpec.uom, 'kg');
    assert.equal(procurementSpec.moq, 10);

    assert.ok(pricingAndTax, 'Zone 3: pricingAndTax must exist');
    assert.equal(pricingAndTax.approvedPurchaseRatePaisa, 95000);
    assert.equal(pricingAndTax.gstRatePercent, 5);

    assert.ok(Array.isArray(applicableCafes), 'Zone 4: applicableCafes must be an array');
    assert.equal(applicableCafes.length, 2, 'Vendor A has 2 approved cafes');

    assert.ok(Array.isArray(priceHistory), 'Zone 5: priceHistory must be an array');
    assert.equal(priceHistory.length, 2, 'Should have 2 historical rate revisions');
    assert.equal(priceHistory[0].approvedRatePaisa, 90000);
    assert.equal(priceHistory[1].approvedRatePaisa, 95000);
    assert.equal(priceHistory[1].changeReason, 'Green bean market revision');
  });

  // 4. STRICT MARGIN REDACTION GUARANTEE
  await suite.test('4. Strict Margin Redaction Guarantee: Zero internal markups or selling prices leaked', async () => {
    const resList = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/products',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(resList.statusCode, 200);
    const rawListJson = JSON.stringify(resList.body);
    assert.equal(rawListJson.includes('retailSellingPrice'), false, 'retailSellingPrice must not leak');
    assert.equal(rawListJson.includes('menuPrice'), false, 'menuPrice must not leak');
    assert.equal(rawListJson.includes('grossMargin'), false, 'grossMargin must not leak');
    assert.equal(rawListJson.includes('contributionMargin'), false, 'contributionMargin must not leak');
    assert.equal(rawListJson.includes('targetNegotiatedPrice'), false, 'targetNegotiatedPrice must not leak');

    const resDetail = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/products/ITEM-COF-01',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(resDetail.statusCode, 200);
    const rawDetailJson = JSON.stringify(resDetail.body);
    assert.equal(rawDetailJson.includes('retailSellingPrice'), false, 'Detail must redact retailSellingPrice');
    assert.equal(rawDetailJson.includes('menuPrice'), false, 'Detail must redact menuPrice');
    assert.equal(rawDetailJson.includes('grossMargin'), false, 'Detail must redact grossMargin');
  });

  // 5. MULTI-CAFÉ SCOPING CONSTRAINTS
  await suite.test('5. Multi-café scoping: Authorized cafe allowed, unauthorized rejected with 403', async () => {
    // Authorized: CAFE_1
    const resAuth = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/products?cafeId=${CAFE_1}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resAuth.statusCode, 200);
    assert.equal(resAuth.body.success, true);

    // Unauthorized: CAFE_3
    const resUnauth = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/products?cafeId=${CAFE_3}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resUnauth.statusCode, 403);
    assert.equal(resUnauth.body?.error?.code || resUnauth.body?.code, 'CROSS_CAFE_ACCESS_DENIED');
  });

  // 6. UNIVERSAL SEARCH, FILTER & SORTING FUNCTIONALITY
  await suite.test('6. Filter by category, status, search keyword, and sort orders', async () => {
    // Filter by category: COFFEE_BEANS
    const resCat = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/products?category=COFFEE_BEANS',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCat.statusCode, 200);
    assert.equal(resCat.body.data.length, 2);

    // Filter by status: INACTIVE
    const resStatus = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/products?status=INACTIVE',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resStatus.statusCode, 200);
    assert.equal(resStatus.body.data.length, 1);
    assert.equal(resStatus.body.data[0].itemId, 'ITEM-PKG-01');

    // Search by SKU: MAL-PREM
    const resSearch = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/products?search=MAL-PREM',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resSearch.statusCode, 200);
    assert.equal(resSearch.body.data.length, 1);
    assert.equal(resSearch.body.data[0].itemId, 'ITEM-COF-02');

    // Sort by price descending
    const resSortDesc = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/products?sortBy=price_desc',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resSortDesc.statusCode, 200);
    assert.equal(resSortDesc.body.data[0].itemId, 'ITEM-COF-02', 'Highest price first (₹1100)');
    assert.equal(resSortDesc.body.data[2].itemId, 'ITEM-PKG-01', 'Lowest price last (₹3.50)');
  });

  // 7. VECTOR A4 RATE SCHEDULE PDF GENERATION
  await suite.test('7. Official Vector A4 Rate Schedule PDF generation', async () => {
    const resPdf = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/products/ITEM-COF-01/pdf',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(resPdf.statusCode, 200);
    assert.equal(resPdf.headers['content-type'], 'application/pdf');
    assert.ok(resPdf.headers['content-disposition'].includes('RateSchedule-ITEM-COF-01.pdf'));
    const pdfMagic = resPdf.rawBuffer.slice(0, 5).toString('utf8');
    assert.equal(pdfMagic, '%PDF-', 'Must be valid PDF stream');
    const pdfText = resPdf.rawBuffer.toString('utf8');
    assert.ok(pdfText.includes('APPROVED PROCUREMENT RATE SCHEDULE'));
    assert.ok(pdfText.includes('ITEM-COF-01'));
  });

  // 8. STANDARD CSV EXPORT
  await suite.test('8. Standard CSV export security and data integrity', async () => {
    const resCsv = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/products/csv',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(resCsv.statusCode, 200);
    assert.ok(resCsv.headers['content-type'].includes('text/csv'));
    assert.ok(resCsv.headers['content-disposition'].includes('VendorProducts-'));
    const csvText = resCsv.rawBuffer.toString('utf8');
    assert.ok(csvText.includes('ERP Item Code,Vendor SKU,Product Name'));
    assert.ok(csvText.includes('ITEM-COF-01'));
    assert.ok(csvText.includes('ITEM-COF-02'));
  });

  // 9. CROSS-VENDOR BOLA / IDOR ISOLATION
  await suite.test('9. Cross-Vendor BOLA / IDOR isolation: Vendor A cannot access Vendor B products', async () => {
    // Vendor A requesting Vendor B exclusive product detail
    const resIdor = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/products/ITEM-VB-01',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(resIdor.statusCode, 404, 'Must return 404 PRODUCT_NOT_FOUND when accessing foreign vendor item');

    // Vendor B listing products should only see Vendor B items
    const resBList = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/products',
      headers: { Authorization: `Bearer ${vendorBToken}` },
    });

    assert.equal(resBList.statusCode, 200);
    assert.equal(resBList.body.summary.totalProducts, 1);
    assert.equal(resBList.body.data[0].itemId, 'ITEM-VB-01');
    assert.equal(resBList.body.data.some((p) => p.itemId === 'ITEM-COF-01'), false, 'Vendor B must not see Vendor A items');
  });

  // 10. STRICT SERVER-SIDE MUTATION PREVENTION
  await suite.test('10. Server-side blocks POST/PUT/PATCH/DELETE with 403 FORBIDDEN_VENDOR_WRITE', async () => {
    const methods = [
      { method: 'POST', path: '/api/v1/vendor/products', body: { name: 'Hacked Item' } },
      { method: 'PUT', path: '/api/v1/vendor/products/ITEM-COF-01', body: { pricePaisa: 100 } },
      { method: 'PATCH', path: '/api/v1/vendor/products/ITEM-COF-01', body: { status: 'DISCONTINUED' } },
      { method: 'DELETE', path: '/api/v1/vendor/products/ITEM-COF-01', body: null },
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
      assert.equal(res.body?.error?.code || res.body?.code, 'FORBIDDEN_VENDOR_WRITE', `${m.method} must have FORBIDDEN_VENDOR_WRITE code`);
    }
  });

  // 11. FRONTEND ROUTE ALLOWLIST INTEGRITY
  await suite.test('11. Frontend navigation allowlist integrity for vendor-products', () => {
    assert.equal(isRouteAllowed('vendor', 'vendor-products'), true);
    assert.equal(isRouteAllowed('vendor', 'vendor/products'), true);
    assert.equal(isRouteAllowed('vendor', 'vendor-pricing'), true);
    assert.equal(isRouteAllowed('vendor', 'vendor/pricing'), true);

    // Disallowed internal routes
    assert.equal(isRouteAllowed('vendor', 'staff-payroll'), false);
    assert.equal(isRouteAllowed('vendor', 'ledger'), false);
    assert.equal(isRouteAllowed('vendor', 'kiosk-attendance'), false);
    assert.equal(isRouteAllowed('vendor', 'cafe-operator-signin'), false);
  });

  // 12. RESPONSIVE COMPONENT RENDERING & ZERO MUTATION CONTROLS
  await suite.test('12. Component rendering outputs 4 KPI cards, modal zones, and zero mutation controls', () => {
    const html = renderVendorProducts();
    assert.ok(html.includes('id="vendor-products-container"'), 'Container must exist');
    assert.ok(html.includes('id="card-total-products"'), 'Card 1 must exist');
    assert.ok(html.includes('id="card-active-products"'), 'Card 2 must exist');
    assert.ok(html.includes('id="card-categories-count"'), 'Card 3 must exist');
    assert.ok(html.includes('id="card-avg-lead-time"'), 'Card 4 must exist');
    assert.ok(html.includes('id="input-products-search"'), 'Search input must exist');
    assert.ok(html.includes('id="select-product-category"'), 'Category select must exist');
    assert.ok(html.includes('id="select-product-status"'), 'Status select must exist');
    assert.ok(html.includes('id="select-product-sort"'), 'Sort select must exist');
    assert.ok(html.includes('id="vendor-product-detail-modal"'), 'Detail modal must exist');
    assert.ok(html.includes('btn-export-products-csv'), 'CSV export button must exist');

    // Strict Read-Only Verification
    assert.equal(html.includes('<form'), false, 'Template must NOT contain <form>');
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
        path: '/api/v1/vendor/products',
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
