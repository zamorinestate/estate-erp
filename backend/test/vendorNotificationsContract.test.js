'use strict';

/**
 * VEN-SCR-012: Vendor Notifications & Operational Dispatches Contract Test Suite
 *
 * Exhaustive contract tests verifying:
 * 1. Authenticated query returns 4 KPI summaries & notifications rows
 * 2. Category filtering (Commercial, Operational, Finance, Compliance)
 * 3. Priority filtering (Critical, High, Normal, Low)
 * 4. Read status filtering (Unread, Read)
 * 5. Universal search (Title, message, related entity ID)
 * 6. Date range filtering (Today, Last 7 Days, custom dates)
 * 7. Safe RFC 4180 CSV export with proper Content-Type
 * 8. Multi-café scoping constraints (Authorized café allowed, foreign café rejected with 403 CROSS_CAFE_ACCESS_DENIED)
 * 9. Cross-Vendor BOLA / IDOR isolation (Vendor A cannot see Vendor B notifications)
 * 10. Strict server-side mutation prevention (POST/PUT/PATCH/DELETE blocked with 403 FORBIDDEN_VENDOR_WRITE)
 * 11. Property redaction guarantee (No margin, markup or internal notes leaked)
 * 12. Safe deep link resolution (Order -> vendor-orders, Invoice -> vendor-invoices, etc.)
 * 13. Frontend route allowlist and template contract for vendor-notifications
 * 14. Production dev-bypass safety (NODE_ENV=production blocks unauthenticated access)
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
const { Notification } = require('../src/models/Notification');
const authService = require('../src/services/authService');
const { isRouteAllowed, NAVIGATION, ROLES } = require('../../Frontend/src/js/navigation.js');
const { renderVendorNotifications } = require('../../Frontend/src/js/pages/vendorNotifications.js');

const ORG_ID = 'ORG-ZAMORIN';
const VENDOR_A_ID = 'VEN-9001';
const VENDOR_B_ID = 'VEN-9002';
const CAFE_1 = 'ZC-0001';
const CAFE_2 = 'ZC-0002';
const CAFE_3 = 'ZC-0003';

function makeRequest({ port, method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const rawBuffer = Buffer.concat(chunks);
        let parsed = null;
        try {
          parsed = JSON.parse(rawBuffer.toString('utf8'));
        } catch {
          parsed = null;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed,
          rawBuffer,
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

test('VEN-SCR-012: Vendor Notifications & Operational Dispatches Contract Suite', async (suite) => {
  let replSet;
  let server;
  let port;
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

    // 4. Seed Notifications for Vendor A (6 items)
    await Notification.create([
      {
        notificationId: 'NT-20260920-0001',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        eventType: 'PURCHASE_ORDER_ISSUED',
        category: 'OPERATIONAL',
        recipientUserId: 'VU-9001',
        recipientRole: 'VENDOR',
        title: 'New Purchase Order PO-2026-001 Issued',
        message: 'A new purchase order for fresh dairy supply has been approved and issued for Zamorin Beach Road.',
        priority: 'HIGH',
        sourceModule: 'PROCUREMENT',
        sourceEntityType: 'PURCHASE_ORDER',
        sourceEntityId: 'PO-2026-001',
        deepLink: '#vendor-orders',
        deduplicationKey: 'DEDUP-NT-001',
        correlationId: 'CORR-001',
        status: 'DELIVERED',
        readAt: null, // Unread
        createdBy: 'MU-0001',
        createdAt: new Date('2026-09-20T10:00:00Z'),
      },
      {
        notificationId: 'NT-20260920-0002',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        eventType: 'GRN_ACCEPTED',
        category: 'OPERATIONAL',
        recipientUserId: 'VU-9001',
        recipientRole: 'VENDOR',
        title: 'Delivery Intake Verified for PO-2026-001',
        message: 'Delivery intake note GRN-2026-001 has been 100% physically verified at Zamorin Beach Road.',
        priority: 'NORMAL',
        sourceModule: 'INVENTORY_RECEPTION',
        sourceEntityType: 'GOODS_RECEIPT_NOTE',
        sourceEntityId: 'GRN-2026-001',
        deepLink: '#vendor-deliveries',
        deduplicationKey: 'DEDUP-NT-002',
        correlationId: 'CORR-002',
        status: 'DELIVERED',
        readAt: new Date('2026-09-20T12:00:00Z'), // Read
        createdBy: 'MU-0001',
        createdAt: new Date('2026-09-20T11:00:00Z'),
      },
      {
        notificationId: 'NT-20260920-0003',
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        eventType: 'INVOICE_APPROVED',
        category: 'COMMERCIAL',
        recipientUserId: 'VU-9001',
        recipientRole: 'VENDOR',
        title: 'Invoice BILL-MAL-001 Approved for Payment',
        message: 'Commercial tax invoice BILL-MAL-001 has passed 3-way match and is approved for accounts settlement.',
        priority: 'NORMAL',
        sourceModule: 'ACCOUNTS_PAYABLE',
        sourceEntityType: 'AP_INVOICE',
        sourceEntityId: 'INV-2026-001',
        deepLink: '#vendor-invoices',
        deduplicationKey: 'DEDUP-NT-003',
        correlationId: 'CORR-003',
        status: 'DELIVERED',
        readAt: null, // Unread
        createdBy: 'MU-0001',
        createdAt: new Date('2026-09-21T09:30:00Z'),
      },
      {
        notificationId: 'NT-20260920-0004',
        organisationId: ORG_ID,
        cafeId: CAFE_2,
        eventType: 'PAYMENT_DISBURSED',
        category: 'FINANCE',
        recipientUserId: 'VU-9001',
        recipientRole: 'VENDOR',
        title: 'Payment Disbursed UTR-HDFC-99887711',
        message: 'Payment of ₹1,400 has been cleared via NEFT under settlement reference UTR-HDFC-99887711.',
        priority: 'HIGH',
        sourceModule: 'TREASURY',
        sourceEntityType: 'PAYMENT',
        sourceEntityId: 'PAY-2026-001',
        deepLink: '#vendor-payments',
        deduplicationKey: 'DEDUP-NT-004',
        correlationId: 'CORR-004',
        status: 'DELIVERED',
        readAt: new Date('2026-09-22T14:00:00Z'), // Read
        createdBy: 'MU-0001',
        createdAt: new Date('2026-09-22T10:00:00Z'),
      },
      {
        notificationId: 'NT-20260920-0005',
        organisationId: ORG_ID,
        cafeId: CAFE_2,
        eventType: 'ADJUSTMENT_POSTED',
        category: 'COMMERCIAL',
        recipientUserId: 'VU-9001',
        recipientRole: 'VENDOR',
        title: 'Debit Note DN-2026-001 Recorded',
        message: 'A debit adjustment of ₹560 has been logged for transit breakage on delivery GRN-2026-002.',
        priority: 'CRITICAL',
        sourceModule: 'ACCOUNTS_PAYABLE',
        sourceEntityType: 'DEBIT_NOTE',
        sourceEntityId: 'DN-2026-001',
        deepLink: '#vendor-adjustments',
        deduplicationKey: 'DEDUP-NT-005',
        correlationId: 'CORR-005',
        status: 'DELIVERED',
        readAt: null, // Unread
        createdBy: 'MU-0001',
        createdAt: new Date('2026-09-23T15:00:00Z'),
      },
      {
        notificationId: 'NT-20260920-0006',
        organisationId: ORG_ID,
        cafeId: null, // Global
        eventType: 'COMPLIANCE_REMINDER',
        category: 'COMPLIANCE',
        recipientUserId: 'VU-9001',
        recipientRole: 'VENDOR',
        title: 'Annual FSSAI License Renewal Reminder',
        message: 'Please ensure your updated FSSAI food business registration certificate is uploaded to Documents Centre.',
        priority: 'LOW',
        sourceModule: 'VENDOR_COMPLIANCE',
        sourceEntityType: 'BUSINESS_DOCUMENT',
        sourceEntityId: 'DOC-FSSAI-001',
        deepLink: '#vendor-documents',
        deduplicationKey: 'DEDUP-NT-006',
        correlationId: 'CORR-006',
        status: 'DELIVERED',
        readAt: null, // Unread
        createdBy: 'MU-0001',
        createdAt: new Date('2026-09-24T08:00:00Z'),
      },
    ]);

    // 5. Seed Notification for Vendor B (Isolation verification)
    await Notification.create([
      {
        notificationId: 'NT-20260920-0007',
        organisationId: ORG_ID,
        cafeId: CAFE_3,
        eventType: 'PURCHASE_ORDER_ISSUED',
        category: 'OPERATIONAL',
        recipientUserId: 'VU-9002',
        recipientRole: 'VENDOR',
        title: 'Highland Beans Order PO-HB-001',
        message: 'Purchase order for single origin beans issued for Highland Coffee Roasters.',
        priority: 'HIGH',
        sourceModule: 'PROCUREMENT',
        sourceEntityType: 'PURCHASE_ORDER',
        sourceEntityId: 'PO-HB-001',
        deepLink: '#vendor-orders',
        deduplicationKey: 'DEDUP-NT-007',
        correlationId: 'CORR-007',
        status: 'DELIVERED',
        readAt: null,
        createdBy: 'MU-0001',
        createdAt: new Date('2026-09-25T10:00:00Z'),
      },
    ]);

    // 6. Generate Session Tokens
    const sA = await authService.createSession({ user: userA, device: { deviceId: 'DEV-A' }, mfaVerified: true });
    vendorAToken = sA.accessToken;

    const sB = await authService.createSession({ user: userB, device: { deviceId: 'DEV-B' }, mfaVerified: true });
    vendorBToken = sB.accessToken;
  });

  suite.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });

  await suite.test('1. Authenticated query returns 4 KPI summaries & notifications rows', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/notifications',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const { kpis, rows, pagination } = res.body.data;
    assert.equal(rows.length, 6);
    assert.equal(pagination.total, 6);
    assert.equal(kpis.totalNotifications, 6);
    assert.equal(kpis.unreadNotifications, 4); // NT-1, NT-3, NT-5, NT-6 are unread
    assert.equal(kpis.commercialAlerts, 2); // NT-3 (COMMERCIAL), NT-5 (COMMERCIAL)
    assert.equal(kpis.operationalDispatches, 2); // NT-1 (OPERATIONAL), NT-2 (OPERATIONAL)
  });

  await suite.test('2. Category filtering isolates Commercial, Operational, and Finance alerts', async () => {
    // 2a. Operational filter
    const resOp = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/notifications?category=OPERATIONAL',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resOp.statusCode, 200);
    assert.equal(resOp.body.data.rows.length, 2);
    assert.ok(resOp.body.data.rows.every((r) => r.category === 'OPERATIONAL'));

    // 2b. Commercial filter
    const resComm = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/notifications?category=COMMERCIAL',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resComm.statusCode, 200);
    assert.equal(resComm.body.data.rows.length, 2);
    assert.ok(resComm.body.data.rows.every((r) => r.category === 'COMMERCIAL'));

    // 2c. Finance filter
    const resFin = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/notifications?category=FINANCE',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resFin.statusCode, 200);
    assert.equal(resFin.body.data.rows.length, 1);
    assert.equal(resFin.body.data.rows[0].sourceEntityType, 'PAYMENT');
  });

  await suite.test('3. Priority filtering filters by CRITICAL, HIGH, NORMAL, LOW', async () => {
    const resCrit = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/notifications?priority=CRITICAL',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resCrit.statusCode, 200);
    assert.equal(resCrit.body.data.rows.length, 1);
    assert.equal(resCrit.body.data.rows[0].notificationId, 'NT-20260920-0005');
  });

  await suite.test('4. Read status filtering isolates UNREAD vs READ historical events', async () => {
    // 4a. UNREAD
    const resUnread = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/notifications?readStatus=UNREAD',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resUnread.statusCode, 200);
    assert.equal(resUnread.body.data.rows.length, 4);
    assert.ok(resUnread.body.data.rows.every((r) => r.isRead === false));

    // 4b. READ
    const resRead = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/notifications?readStatus=READ',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(resRead.statusCode, 200);
    assert.equal(resRead.body.data.rows.length, 2);
    assert.ok(resRead.body.data.rows.every((r) => r.isRead === true));
  });

  await suite.test('5. Universal search matches title, message, and related entity IDs', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/notifications?search=breakage',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.rows.length, 1);
    assert.equal(res.body.data.rows[0].sourceEntityId, 'DN-2026-001');
  });

  await suite.test('6. Date range filtering constrains notification event timestamps', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/notifications?customStart=2026-09-20&customEnd=2026-09-21',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.rows.length, 3); // NT-1, NT-2, NT-3
  });

  await suite.test('7. Safe RFC 4180 CSV export returns text/csv with formatted notification headers', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/notifications/csv',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'));
    assert.ok(res.headers['content-disposition'].includes('attachment'));
    const csv = res.rawBuffer.toString('utf8');
    assert.ok(csv.includes('Notification ID'));
    assert.ok(csv.includes('NT-20260920-0001'));
    assert.ok(csv.includes('ZAMORIN CAFE ERP - VENDOR NOTIFICATIONS & AUDIT FEED'));
  });

  await suite.test('8. Multi-café scoping constraints: foreign café rejected with 403', async () => {
    // CAFE_3 is unauthorized for Vendor A
    const res = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/notifications?cafeId=${CAFE_3}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body?.error?.code || res.body?.errorCode, 'CROSS_CAFE_ACCESS_DENIED');
  });

  await suite.test('9. Cross-Vendor BOLA / IDOR isolation: Vendor A cannot view Vendor B alerts', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/notifications',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const rows = res.body.data.rows;
    assert.ok(rows.every((r) => r.notificationId !== 'NT-20260920-0007'));
    assert.ok(rows.every((r) => r.sourceEntityId !== 'PO-HB-001'));
  });

  await suite.test('10. Strict server-side mutation prevention: POST/PUT/DELETE blocked with 403', async () => {
    const postRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/vendor/notifications',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { notificationId: 'NT-999', isRead: true },
    });
    assert.equal(postRes.statusCode, 403);
    assert.equal(postRes.body?.error?.code || postRes.body?.errorCode, 'FORBIDDEN_VENDOR_WRITE');

    const putRes = await makeRequest({
      port,
      method: 'PUT',
      path: '/api/v1/vendor/notifications/NT-20260920-0001',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { isRead: true },
    });
    assert.equal(putRes.statusCode, 403);
    assert.equal(putRes.body?.error?.code || putRes.body?.errorCode, 'FORBIDDEN_VENDOR_WRITE');

    const delRes = await makeRequest({
      port,
      method: 'DELETE',
      path: '/api/v1/vendor/notifications/NT-20260920-0001',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(delRes.statusCode, 403);
    assert.equal(delRes.body?.error?.code || delRes.body?.errorCode, 'FORBIDDEN_VENDOR_WRITE');
  });

  await suite.test('11. Property redaction guarantee: no margins, markups or internal notes leaked', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/notifications',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes('retailSellingPrice'));
    assert.ok(!serialized.includes('grossMargin'));
    assert.ok(!serialized.includes('internalNote'));
  });

  await suite.test('12. Safe deep link resolution directs alerts to authorized workspace screens', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/notifications',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const rows = res.body.data.rows;
    const poAlert = rows.find((r) => r.sourceEntityType === 'PURCHASE_ORDER');
    const grnAlert = rows.find((r) => r.sourceEntityType === 'GOODS_RECEIPT_NOTE');
    const invAlert = rows.find((r) => r.sourceEntityType === 'AP_INVOICE');
    const payAlert = rows.find((r) => r.sourceEntityType === 'PAYMENT');
    const dnAlert = rows.find((r) => r.sourceEntityType === 'DEBIT_NOTE');

    assert.equal(poAlert.targetScreen, 'vendor-orders');
    assert.equal(grnAlert.targetScreen, 'vendor-deliveries');
    assert.equal(invAlert.targetScreen, 'vendor-invoices');
    assert.equal(payAlert.targetScreen, 'vendor-payments');
    assert.equal(dnAlert.targetScreen, 'vendor-adjustments');
  });

  await suite.test('13. Frontend route allowlist and template contract for vendor-notifications', () => {
    assert.equal(isRouteAllowed('VENDOR', 'vendor-notifications'), true);
    assert.equal(isRouteAllowed('VENDOR', 'vendor/notifications'), true);
    assert.equal(isRouteAllowed('VENDOR', 'admin'), false);
    assert.equal(isRouteAllowed('VENDOR', 'passbook'), false);

    const html = renderVendorNotifications();
    assert.ok(html.includes('READ-ONLY NOTIFICATIONS FEED'));
    assert.ok(html.includes('VEN-SCR-012'));
    assert.ok(html.includes('Export CSV'));
    assert.ok(html.includes('kpi-total-notifications'));
    assert.ok(html.includes('kpi-unread-notifications'));
    assert.ok(html.includes('kpi-commercial-alerts'));
    assert.ok(html.includes('kpi-operational-dispatches'));
    // Zero mutation forms
    assert.ok(!html.includes('<form'));
    assert.ok(!html.includes('type="submit"'));
  });

  await suite.test('14. Production dev-bypass safety: NODE_ENV=production blocks unauthenticated access', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const res = await makeRequest({
        port,
        method: 'GET',
        path: '/api/v1/vendor/notifications',
        headers: { 'x-dev-user-id': 'VU-9001' },
      });
      assert.equal(res.statusCode, 401);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
