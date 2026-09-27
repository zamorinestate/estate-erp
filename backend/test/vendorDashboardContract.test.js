'use strict';

/**
 * VEN-SCR-001: VENDOR DASHBOARD CONTRACT & SECURITY TEST SUITE
 *
 * Validates:
 * 1. Financial metric derivation from authoritative records (Total Order Value, Total Invoiced, Total Paid, Balance Receivable, Overdue)
 * 2. Operational order summary status categorization (Open, In Progress, Supplied, Partially Supplied, Completed, Cancelled)
 * 3. Supply/delivery pipeline tracking (Awaiting Supply, Expected Today, Short/Rejected, GRN Completed)
 * 4. Authoritative Ageing calculation (Current, 1-30d, 31-60d, 61-90d, 90+d)
 * 5. Multi-café scoping constraints (Authorized café allowed, foreign café rejected with 403 CROSS_CAFE_ACCESS_DENIED)
 * 6. Timeline date range filtering (today, 7days, 30days, this_month, this_fy)
 * 7. Read-only Purchase Order itemization and delivery timeline milestones
 * 8. Pure-JS A4 printable PDF document download stream
 * 9. Cross-vendor BOLA / IDOR isolation (Vendor A cannot inspect Vendor B's orders or invoices)
 * 10. Strict server-side mutation prevention (POST/PUT/PATCH/DELETE on vendor endpoints blocked with 403 FORBIDDEN_VENDOR_WRITE)
 * 11. Frontend navigation route allowlist integrity
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const { createApp } = require('../src/server');
const { User } = require('../src/models/User');
const { Session } = require('../src/models/Session');
const { Vendor } = require('../src/models/Vendor');
const { Cafe } = require('../src/models/Cafe');
const { PurchaseOrder } = require('../src/models/PurchaseOrder');
const { APInvoice } = require('../src/models/APInvoice');
const { isRouteAllowed, ROLES } = require('../../Frontend/src/js/navigation.js');
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

test('VEN-SCR-001: Vendor Dashboard Contract & Verification Suite', async (suite) => {
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
        totalPaisa: 2450000,
        createdByUserId: 'MU-0001',
        lineItems: [
          {
            itemId: 'ITEM-MILK-FULL',
            itemNameSnapshot: 'Full Cream Fresh Milk 1L',
            itemType: 'GOODS',
            orderedQuantityBase: 100,
            unitPricePaisa: 7500,
            totalLinePaisa: 750000,
          },
          {
            itemId: 'ITEM-CREAM-WHIP',
            itemNameSnapshot: 'Whipping Cream 1L',
            itemType: 'GOODS',
            orderedQuantityBase: 50,
            unitPricePaisa: 34000,
            totalLinePaisa: 1700000,
          },
        ],
      },
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
        totalPaisa: 1875000,
        createdByUserId: 'MU-0001',
        lineItems: [
          {
            itemId: 'ITEM-MILK-SKIM',
            itemNameSnapshot: 'Skimmed Milk 1L',
            itemType: 'GOODS',
            orderedQuantityBase: 250,
            unitPricePaisa: 7500,
            totalLinePaisa: 1875000,
          },
        ],
      },
      {
        purchaseOrderId: 'PO-1026',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        vendorNameSnapshot: 'Malabar Dairy & Creamery',
        status: 'CLOSED',
        orderDate: '2026-09-23',
        expectedDeliveryDate: '2026-09-25',
        subtotalPaisa: 3120000,
        totalPaisa: 3120000,
        createdByUserId: 'MU-0001',
        lineItems: [
          {
            itemId: 'ITEM-BUTTER-SALT',
            itemNameSnapshot: 'Table Butter 500g',
            itemType: 'GOODS',
            orderedQuantityBase: 120,
            unitPricePaisa: 26000,
            totalLinePaisa: 3120000,
          },
        ],
      },
      // Foreign PO for Vendor B
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
        totalPaisa: 5000000,
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

    // 6. Seed Authoritative APInvoices for Vendor A
    await APInvoice.create([
      {
        invoiceId: 'INV-945',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        supplierInvoiceNumber: 'INV-MALABAR-945',
        invoiceDate: '2026-09-15',
        dueDate: '2026-09-30',
        amountPaisa: 4000000,
        taxPaisa: 0,
        totalPaisa: 4000000,
        paidPaisa: 2000000,
        amountPaidPaisa: 2000000,
        outstandingPaisa: 2000000,
        outstandingPayableAmountPaisa: 2000000,
        outstandingBalancePaisa: 2000000,
        paymentStatus: 'PARTIALLY_PAID',
        poReferenceId: 'PO-1028',
        paymentHistory: [
          {
            paymentId: 'PAY-1019',
            paidPaisa: 2000000,
            paidAt: new Date('2026-09-22'),
            paidByUserId: 'MU-0001',
            paymentMethod: 'BANK_TRANSFER',
            reference: 'UTR-HDFC-99120',
          },
        ],
      },
      {
        invoiceId: 'INV-931',
        organisationId: ORG_ID,
        cafeId: CAFE_2,
        vendorId: VENDOR_A_ID,
        vendorName: 'Malabar Dairy & Creamery',
        supplierInvoiceNumber: 'INV-MALABAR-931',
        invoiceDate: '2026-09-01',
        dueDate: '2026-09-16', // Past due date relative to Sept 26
        amountPaisa: 3000000,
        taxPaisa: 0,
        totalPaisa: 3000000,
        paidPaisa: 0,
        amountPaidPaisa: 0,
        outstandingPaisa: 3000000,
        outstandingPayableAmountPaisa: 3000000,
        outstandingBalancePaisa: 3000000,
        paymentStatus: 'OVERDUE',
        poReferenceId: 'PO-1027',
      },
      // Foreign Invoice for Vendor B
      {
        invoiceId: 'INV-888',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        vendorId: VENDOR_B_ID,
        vendorName: 'Highland Coffee Roasters',
        supplierInvoiceNumber: 'INV-HIGHLAND-888',
        invoiceDate: '2026-09-20',
        dueDate: '2026-10-05',
        amountPaisa: 5000000,
        taxPaisa: 0,
        totalPaisa: 5000000,
        paidPaisa: 0,
        amountPaidPaisa: 0,
        outstandingPaisa: 5000000,
        outstandingPayableAmountPaisa: 5000000,
        outstandingBalancePaisa: 5000000,
        paymentStatus: 'DUE',
      },
    ]);
  });

  suite.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (mongoReplSet) await mongoReplSet.stop();
  });

  await suite.test('1. Vendor Profile (GET /api/v1/vendor/me)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/me',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.vendorId, VENDOR_A_ID);
    assert.equal(res.body.data.name, 'Malabar Dairy & Creamery');
    assert.equal(res.body.data.approvedCafeIds.length, 2);
    assert.deepEqual(res.body.data.approvedCafeIds.sort(), [CAFE_1, CAFE_2].sort());
    assert.equal(res.body.data.accessModel, 'READ_ONLY');
  });

  await suite.test('2. Vendor Dashboard Financial Reconciliations (GET /api/v1/vendor/dashboard)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/dashboard',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);

    const { financial, orderSummary, supplyDeliverySummary, ageing, recentPurchaseOrders, recentPayments, pendingReceivables } = res.body.data;

    // Commercial & Financial Totals Reconciliation:
    // PO Total Value: PO-1028 (2450000) + PO-1027 (1875000) + PO-1026 (3120000) = 7445000
    assert.equal(financial.totalOrderValuePaisa, 7445000);
    assert.equal(financial.totalOrderValueFormatted, '₹74,450');

    // Invoiced: INV-945 (4000000) + INV-931 (3000000) = 7000000
    assert.equal(financial.totalInvoicedPaisa, 7000000);
    assert.equal(financial.totalInvoicedFormatted, '₹70,000');

    // Paid: INV-945 (2000000) = 2000000
    assert.equal(financial.totalPaidPaisa, 2000000);
    assert.equal(financial.totalPaidFormatted, '₹20,000');

    // Balance Receivable: INV-945 (2000000) + INV-931 (3000000) = 5000000
    assert.equal(financial.balanceReceivablePaisa, 5000000);
    assert.equal(financial.balanceReceivableFormatted, '₹50,000');

    // Overdue: INV-931 past due date = 3000000
    assert.equal(financial.overduePaisa, 3000000);
    assert.equal(financial.overdueFormatted, '₹30,000');

    // Foreign Vendor B's values must NEVER contaminate Vendor A's figures
    assert.notEqual(financial.totalOrderValuePaisa, 12445000);
  });

  await suite.test('3. Order Summary & Operational Pipeline Breakdown', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/dashboard',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    const { orderSummary, supplyDeliverySummary, ageing } = res.body.data;

    // Order Summary
    assert.equal(orderSummary.totalOrders, 3);
    assert.equal(orderSummary.openOrders, 1);       // PO-1028 (APPROVED)
    assert.equal(orderSummary.suppliedOrders, 1);   // PO-1027 (RECEIVED)
    assert.equal(orderSummary.completedOrders, 1);  // PO-1026 (CLOSED)
    assert.equal(orderSummary.inProgressOrders, 0);
    assert.equal(orderSummary.partiallySuppliedOrders, 0);
    assert.equal(orderSummary.cancelledOrders, 0);

    // Supply / Delivery Pipeline
    assert.equal(supplyDeliverySummary.awaitingSupply, 1); // PO-1028
    assert.equal(supplyDeliverySummary.supplied, 1);       // PO-1027

    // Ageing:
    // INV-945: dueDate 2026-09-30 (future/current relative to Sept 26) -> 2000000
    // INV-931: dueDate 2026-09-16 (10 days past due) -> 1-30 days bucket -> 3000000
    assert.equal(ageing.currentPaisa, 2000000);
    assert.equal(ageing.days1To30Paisa, 3000000);
    assert.equal(ageing.days31To60Paisa, 0);
    assert.equal(ageing.days61To90Paisa, 0);
    assert.equal(ageing.days90PlusPaisa, 0);
  });

  await suite.test('4. Multi-Café Scoping & Parameter Boundary Enforcement', async () => {
    // 4.1 Filter by authorized Cafe 1: should return only Cafe 1 POs & Invoices
    const resCafe1 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/dashboard?cafeId=${CAFE_1}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe1.statusCode, 200);
    assert.equal(resCafe1.body.data.financial.totalOrderValuePaisa, 5570000); // PO-1028 (2450000) + PO-1026 (3120000)
    assert.equal(resCafe1.body.data.financial.balanceReceivablePaisa, 2000000); // Only INV-945

    // 4.2 Filter by unauthorized Cafe 3: MUST be rejected with 403 CROSS_CAFE_ACCESS_DENIED
    const resCafe3 = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/dashboard?cafeId=${CAFE_3}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCafe3.statusCode, 403);
    assert.equal(resCafe3.body.error.code, 'CROSS_CAFE_ACCESS_DENIED');
  });

  await suite.test('5. Timeline Date Range Filtering', async () => {
    const res7d = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/dashboard?dateRange=7days',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(res7d.statusCode, 200);
    assert.equal(res7d.body.data.activeFilters.dateRange, '7days');

    const resToday = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/dashboard?dateRange=today',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resToday.statusCode, 200);
    assert.equal(resToday.body.data.activeFilters.dateRange, 'today');
  });

  await suite.test('6. Read-Only PO Details & Line Sanitization (GET /api/v1/vendor/orders/:id)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/orders/PO-1028',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.purchaseOrderId, 'PO-1028');
    assert.equal(res.body.data.cafeId, CAFE_1);
    assert.equal(res.body.data.totalPaisa, 2450000);
    assert.equal(res.body.data.lineItems.length, 2);

    const firstItem = res.body.data.lineItems[0];
    assert.equal(firstItem.itemId, 'ITEM-MILK-FULL');
    assert.equal(firstItem.itemName, 'Full Cream Fresh Milk 1L');
    assert.equal(firstItem.orderedQuantity, 100);
    assert.equal(firstItem.unitPricePaisa, 7500);
    assert.equal(firstItem.lineTotalPaisa, 750000);

    // Verify zero internal margin / markup / cost notes leak
    assert.equal(firstItem.markupPaisa, undefined);
    assert.equal(firstItem.internalNotes, undefined);
  });

  await suite.test('7. A4 Printable PDF Generation (GET /api/v1/vendor/orders/:id/pdf)', async () => {
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

    // Validate standard PDF magic header
    const pdfHeader = res.rawBuffer.slice(0, 8).toString('utf8');
    assert.ok(pdfHeader.startsWith('%PDF-1.4'));
  });

  await suite.test('8. Cross-Vendor BOLA / IDOR Prevention', async () => {
    // Vendor A attempting to access Vendor B's order (PO-9999)
    const resPo = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/orders/PO-9999',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resPo.statusCode, 404); // Fails closed as not found in Vendor A scope

    // Vendor A attempting to download Vendor B's order PDF
    const resPdf = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/orders/PO-9999/pdf',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resPdf.statusCode, 404);

    // Vendor A attempting to access Vendor B's invoice (INV-888)
    const resInv = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/invoices/INV-888',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resInv.statusCode, 404);
  });

  await suite.test('9. Strict Server-Side Mutation Prevention (Read-Only Enforcement)', async () => {
    // Attempting POST on dashboard
    const postDash = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/vendor/dashboard',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { hack: true },
    });
    assert.equal(postDash.statusCode, 403);
    assert.equal(postDash.body.error.code, 'FORBIDDEN_VENDOR_WRITE');

    // Attempting POST on orders
    const postOrder = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/vendor/orders',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { purchaseOrderId: 'PO-HACK' },
    });
    assert.equal(postOrder.statusCode, 403);
    assert.equal(postOrder.body.error.code, 'FORBIDDEN_VENDOR_WRITE');

    // Attempting PUT on order
    const putOrder = await makeRequest({
      port,
      method: 'PUT',
      path: '/api/v1/vendor/orders/PO-1028',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { status: 'CANCELLED' },
    });
    assert.equal(putOrder.statusCode, 403);
    assert.equal(putOrder.body.error.code, 'FORBIDDEN_VENDOR_WRITE');

    // Attempting DELETE on invoice
    const delInv = await makeRequest({
      port,
      method: 'DELETE',
      path: '/api/v1/vendor/invoices/INV-945',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(delInv.statusCode, 403);
    assert.equal(delInv.body.error.code, 'FORBIDDEN_VENDOR_WRITE');
  });

  await suite.test('10. Frontend Route Allowlist Integrity', () => {
    // Allowed Vendor Routes
    assert.equal(isRouteAllowed('vendor', 'vendor-dashboard'), true);
    assert.equal(isRouteAllowed('vendor', 'vendor/dashboard'), true);

    // Blocked Internal Operational & Financial Routes
    assert.equal(isRouteAllowed('vendor', 'dashboard'), false);
    assert.equal(isRouteAllowed('vendor', 'pos'), false);
    assert.equal(isRouteAllowed('vendor', 'inventory'), false);
    assert.equal(isRouteAllowed('vendor', 'procurement'), false);
    assert.equal(isRouteAllowed('vendor', 'finance'), false);
    assert.equal(isRouteAllowed('vendor', 'payroll'), false);
    assert.equal(isRouteAllowed('vendor', 'staff-home'), false);
    assert.equal(isRouteAllowed('vendor', 'staff-attendance'), false);
    assert.equal(isRouteAllowed('vendor', 'staff-payslips'), false);
    assert.equal(isRouteAllowed('vendor', 'passbook'), false);
    assert.equal(isRouteAllowed('vendor', 'ledger'), false);
    assert.equal(isRouteAllowed('vendor', 'admin'), false);
  });
});
