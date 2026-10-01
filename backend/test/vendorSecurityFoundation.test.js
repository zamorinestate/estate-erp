'use strict';

/**
 * STAGE V-00: VENDOR FOUNDATION & SECURITY BOUNDARY TEST SUITE
 *
 * Validates:
 * 1. Vendor Authentication & Token Issuance (vid & role in session/token)
 * 2. Strict Server-Side Read-Only Enforcement (POST, PUT, PATCH, DELETE blocked with 403 FORBIDDEN_VENDOR_WRITE)
 * 3. Internal Module Isolation (Vendor blocked from Master, Owner, Cafe Admin, Staff, and POS endpoints)
 * 4. Cross-Vendor IDOR / BOLA Prevention (Rejecting parameter tampering with foreign vendorId)
 * 5. Multi-Café Scoping & Boundary Isolation (Authorized cafes allowed, unauthorized cafes denied)
 * 6. Account Status Restrictions (Suspended/Blacklisted vendors blocked)
 * 7. Identity & Scope Sanitization (No internal notes, margins, or private bank account leaks)
 * 8. Frontend Route Allowlist Integrity (Vendor blocked from IMPLICIT_ROUTES_ALL employee pages)
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
const authService = require('../src/services/authService');

let isRouteAllowed;
let ROLES;

const ORG_ID = 'ORG-ZAMORIN';
const CAFE_A = 'ZC-0001';
const CAFE_B = 'ZC-0002';
const CAFE_C = 'ZC-0003'; // Unauthorized cafe for Vendor A

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
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          let parsedJson = null;
          try {
            parsedJson = responseData ? JSON.parse(responseData) : null;
          } catch (_) {
            parsedJson = responseData;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedJson,
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

test('STAGE V-00: Vendor Foundation & Security Boundary Suite', async (suite) => {
  let mongoReplSet;
  let server;
  let port;

  let vendorAToken;
  let vendorBToken;
  let staffToken;
  let masterToken;
  let unboundVendorToken;
  let suspendedVendorToken;
  const originalJwtAccessSecret = process.env.JWT_ACCESS_SECRET;
  const originalJwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

  suite.before(async () => {
    process.env.JWT_ACCESS_SECRET = 'vendor_security_test_access_secret_32_chars_minimum!';
    process.env.JWT_REFRESH_SECRET = 'vendor_security_test_refresh_secret_32_chars_minimum!';

    ({ isRouteAllowed, ROLES } = await import('../../frontend/src/js/navigation.js'));

    mongoReplSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongoReplSet.getUri());

    const app = createApp({ allowedOrigins: ['*'], production: false });
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;

    // Seed Cafés
    await Cafe.create([
      {
        cafeId: CAFE_A,
        organisationId: ORG_ID,
        name: 'Zamorin Beach Café',
        displayName: 'Zamorin Beach Café',
        createdBy: 'MU-0001',
        code: 'ZBC',
        status: 'ACTIVE',
        isOperational: true,
      },
      {
        cafeId: CAFE_B,
        organisationId: ORG_ID,
        name: 'Zamorin Downtown',
        displayName: 'Zamorin Downtown',
        createdBy: 'MU-0001',
        code: 'ZDT',
        status: 'ACTIVE',
        isOperational: true,
      },
      {
        cafeId: CAFE_C,
        organisationId: ORG_ID,
        name: 'Zamorin Airport Outlet',
        displayName: 'Zamorin Airport Outlet',
        createdBy: 'MU-0001',
        code: 'ZAO',
        status: 'ACTIVE',
        isOperational: true,
      },
    ]);

    // Seed Vendor Records
    await Vendor.create([
      {
        vendorId: VENDOR_A_ID,
        organisationId: ORG_ID,
        name: 'Malabar Dairy & Creamery',
        tradeName: 'Malabar Fresh',
        category: 'FOOD_BEVERAGE',
        supplierType: 'GOODS',
        approvedCafeIds: [CAFE_A, CAFE_B],
        status: 'ACTIVE',
        createdByUserId: 'MU-0001',
        gstNumber: '32AAAAA0000A1Z5',
        notes: 'CONFIDENTIAL INTERNAL NOTE: 8% discount negotiated.',
      },
      {
        vendorId: VENDOR_B_ID,
        organisationId: ORG_ID,
        name: 'Calicut Roast Roasters',
        tradeName: 'Calicut Beans',
        category: 'FOOD_BEVERAGE',
        supplierType: 'GOODS',
        approvedCafeIds: [CAFE_C],
        status: 'ACTIVE',
        createdByUserId: 'MU-0001',
        gstNumber: '32BBBBB0000B1Z6',
        notes: 'CONFIDENTIAL INTERNAL NOTE: Margin review required.',
      },
      {
        vendorId: 'VEN-9999',
        organisationId: ORG_ID,
        name: 'Suspended Quality Vendor',
        category: 'FOOD_BEVERAGE',
        supplierType: 'GOODS',
        approvedCafeIds: [CAFE_A],
        status: 'SUSPENDED',
        createdByUserId: 'MU-0001',
      },
    ]);

    // Seed Users
    const passwordHash = await authService.hashPassword('TEST_FIXTURE_HASH_ONLY_NOT_FOR_LOGIN#999');

    const vendorAUser = await User.create({
      userId: 'VU-0001',
      email: 'vendorA@malabar.test',
      organisationId: ORG_ID,
      role: 'VENDOR',
      vendorId: VENDOR_A_ID,
      accountStatus: 'ACTIVE',
      name: 'Malabar Account Manager',
      createdBy: 'MU-0001',
      passwordHash,
    });

    const vendorBUser = await User.create({
      userId: 'VU-0002',
      email: 'vendorB@calicut.test',
      organisationId: ORG_ID,
      role: 'VENDOR',
      vendorId: VENDOR_B_ID,
      accountStatus: 'ACTIVE',
      name: 'Calicut Rep',
      createdBy: 'MU-0001',
      passwordHash,
    });

    const unboundUser = await User.create({
      userId: 'VU-9001',
      email: 'unbound@vendor.test',
      organisationId: ORG_ID,
      role: 'VENDOR',
      vendorId: null,
      accountStatus: 'ACTIVE',
      name: 'Unbound User',
      createdBy: 'MU-0001',
      passwordHash,
    });

    const suspendedUser = await User.create({
      userId: 'VU-9002',
      email: 'suspended@vendor.test',
      organisationId: ORG_ID,
      role: 'VENDOR',
      vendorId: 'VEN-9999',
      accountStatus: 'ACTIVE',
      name: 'Suspended Vendor Rep',
      createdBy: 'MU-0001',
      passwordHash,
    });

    const staffUser = await User.create({
      userId: 'ST-0001',
      email: 'staff@zamorin.test',
      organisationId: ORG_ID,
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      name: 'Staff Cashier',
      createdBy: 'MU-0001',
      passwordHash,
    });

    const masterUser = await User.create({
      userId: 'MU-0001',
      email: 'master@zamorin.test',
      organisationId: ORG_ID,
      role: 'MASTER',
      isPrimaryMaster: true,
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'MU-0001',
      primaryMasterDesignationReason: 'Canonical Primary Master bootstrap',
      accountStatus: 'ACTIVE',
      name: 'Pradeesh Master',
      createdBy: 'MU-0001',
      passwordHash,
    });

    // Helper to issue test session tokens
    const issueToken = async (user) => {
      const sessionResult = await authService.createSession({
        user,
        device: { deviceId: `DEV-${user.userId}` },
        mfaVerified: true,
      });
      return sessionResult.accessToken;
    };

    vendorAToken = await issueToken(vendorAUser);
    vendorBToken = await issueToken(vendorBUser);
    unboundVendorToken = await issueToken(unboundUser);
    suspendedVendorToken = await issueToken(suspendedUser);
    staffToken = await issueToken(staffUser);
    masterToken = await issueToken(masterUser);
  });

  suite.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (mongoReplSet) await mongoReplSet.stop();

    if (originalJwtAccessSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = originalJwtAccessSecret;

    if (originalJwtRefreshSecret === undefined) delete process.env.JWT_REFRESH_SECRET;
    else process.env.JWT_REFRESH_SECRET = originalJwtRefreshSecret;
  });

  // ── 1. AUTHENTICATION & IDENTITY BINDING ───────────────────────────────────
  await suite.test('1.1: Vendor session derives authoritative vendorId into req.auth and returns sanitized profile', async () => {
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
    assert.equal(res.body.data.user.role, 'VENDOR');
    assert.equal(res.body.data.workspaceMode, 'READ_ONLY');

    // Multi-café list included
    assert.ok(Array.isArray(res.body.data.approvedCafes));
    assert.equal(res.body.data.approvedCafes.length, 2);
    assert.equal(res.body.data.approvedCafes[0].cafeId, CAFE_A);

    // Strict sanitization: internal notes must NOT leak
    assert.equal(res.body.data.notes, undefined);
    assert.equal(res.body.data.user.passwordHash, undefined);
  });

  await suite.test('1.2: Unbound vendor user (missing vendorId) is rejected with 403 VENDOR_IDENTITY_UNBOUND', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/me',
      headers: { Authorization: `Bearer ${unboundVendorToken}` },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'VENDOR_IDENTITY_UNBOUND');
  });

  await suite.test('1.3: Suspended vendor master status is rejected with 403 VENDOR_INACTIVE', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/me',
      headers: { Authorization: `Bearer ${suspendedVendorToken}` },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'VENDOR_INACTIVE');
  });

  // ── 2. SERVER-SIDE READ-ONLY ENFORCEMENT ───────────────────────────────────
  await suite.test('2.1: POST mutation on vendor business endpoint is blocked with 403 FORBIDDEN_VENDOR_WRITE', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/vendor/me',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { name: 'Attempted Name Mutation' },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN_VENDOR_WRITE');
  });

  await suite.test('2.2: PUT mutation on vendor business endpoint is blocked with 403 FORBIDDEN_VENDOR_WRITE', async () => {
    const res = await makeRequest({
      port,
      method: 'PUT',
      path: '/api/v1/vendor/me',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { bankDetails: 'Hacked Bank Account' },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN_VENDOR_WRITE');
  });

  await suite.test('2.3: PATCH mutation on vendor business endpoint is blocked with 403 FORBIDDEN_VENDOR_WRITE', async () => {
    const res = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/vendor/me',
      headers: { Authorization: `Bearer ${vendorAToken}` },
      body: { status: 'ACTIVE' },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN_VENDOR_WRITE');
  });

  await suite.test('2.4: DELETE operation on vendor business endpoint is blocked with 403 FORBIDDEN_VENDOR_WRITE', async () => {
    const res = await makeRequest({
      port,
      method: 'DELETE',
      path: '/api/v1/vendor/me',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN_VENDOR_WRITE');
  });

  // ── 3. INTERNAL MODULE ISOLATION ───────────────────────────────────────────
  await suite.test('3.1: Vendor is blocked from internal user administration (/api/v1/users)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/users',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 403);
  });

  await suite.test('3.2: Vendor is blocked from internal café administration (/api/v1/cafes)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/cafes',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 403);
  });

  await suite.test('3.3: Vendor is blocked from internal procurement orders (/api/v1/procurement/orders)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/procurement/orders',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 403);
  });

  await suite.test('3.4: Vendor is blocked from internal POS registers (/api/v1/pos/registers)', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/pos/registers',
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 403);
  });

  await suite.test('3.5: Non-vendor user (STAFF / MASTER) is blocked from Vendor Workspace (/api/v1/vendor/*)', async () => {
    const staffRes = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/me',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert.equal(staffRes.statusCode, 403);
    assert.equal(staffRes.body.error.code, 'FORBIDDEN_VENDOR_ACCESS');

    const masterRes = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/me',
      headers: { Authorization: `Bearer ${masterToken}` },
    });
    assert.equal(masterRes.statusCode, 403);
    assert.equal(masterRes.body.error.code, 'FORBIDDEN_VENDOR_ACCESS');
  });

  // ── 4. CROSS-VENDOR IDOR / BOLA PREVENTION ─────────────────────────────────
  await suite.test('4.1: Vendor A attempting to pass Vendor B ID in query parameter is rejected with 403 CROSS_VENDOR_ACCESS_DENIED', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/me?vendorId=${VENDOR_B_ID}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'CROSS_VENDOR_ACCESS_DENIED');
  });

  await suite.test('4.2: Vendor A attempting to pass Vendor B ID in custom header (x-vendor-id) is rejected with 403 CROSS_VENDOR_ACCESS_DENIED', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/vendor/me',
      headers: {
        Authorization: `Bearer ${vendorAToken}`,
        'x-vendor-id': VENDOR_B_ID,
      },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'CROSS_VENDOR_ACCESS_DENIED');
  });

  // ── 5. MULTI-CAFÉ SCOPING & BOUNDARY ISOLATION ─────────────────────────────
  await suite.test('5.1: Vendor A requesting an authorized café (CAFE_A) is allowed', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/me?cafeId=${CAFE_A}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
  });

  await suite.test('5.2: Vendor A requesting an unauthorized café (CAFE_C) is rejected with 403 CROSS_CAFE_ACCESS_DENIED', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/vendor/me?cafeId=${CAFE_C}`,
      headers: { Authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'CROSS_CAFE_ACCESS_DENIED');
  });

  // ── 6. FRONTEND ROUTE ISOLATION INTEGRITY ──────────────────────────────────
  await suite.test('6.1: isRouteAllowed denies VENDOR from internal employee implicit routes', () => {
    assert.equal(isRouteAllowed('vendor', 'staff-attendance'), false);
    assert.equal(isRouteAllowed('vendor', 'staff-payslips'), false);
    assert.equal(isRouteAllowed('vendor', 'staff-leave'), false);
    assert.equal(isRouteAllowed('vendor', 'staff-loans-advances'), false);
    assert.equal(isRouteAllowed('vendor', 'staff-documents'), false);
    assert.equal(isRouteAllowed('vendor', 'employee-profile'), false);
    assert.equal(isRouteAllowed('vendor', 'announcements'), false);
    assert.equal(isRouteAllowed('vendor', 'kiosk-attendance'), false);
    assert.equal(isRouteAllowed('vendor', 'settings'), false);
  });

  await suite.test('6.2: isRouteAllowed denies VENDOR from internal command and operational routes', () => {
    assert.equal(isRouteAllowed('vendor', 'dashboard'), false);
    assert.equal(isRouteAllowed('vendor', 'pos'), false);
    assert.equal(isRouteAllowed('vendor', 'inventory'), false);
    assert.equal(isRouteAllowed('vendor', 'procurement'), false);
    assert.equal(isRouteAllowed('vendor', 'finance'), false);
    assert.equal(isRouteAllowed('vendor', 'bills'), false);
    assert.equal(isRouteAllowed('vendor', 'ledger'), false);
  });

  await suite.test('6.3: isRouteAllowed permits VENDOR to access authorized vendor workspace route', () => {
    assert.equal(isRouteAllowed('vendor', 'vendor-dashboard'), true);
  });

  await suite.test('6.4: Regression: internal roles retain proper route access', () => {
    assert.equal(isRouteAllowed(ROLES.MASTER, 'dashboard', true), true);
    assert.equal(isRouteAllowed(ROLES.MASTER, 'ledger', true), true);
    assert.equal(isRouteAllowed(ROLES.STAFF, 'staff-home', false), true);
    assert.equal(isRouteAllowed(ROLES.STAFF, 'staff-attendance', false), true);
    assert.equal(isRouteAllowed(ROLES.CAFE_ADMIN, 'pos', false), true);
    assert.equal(isRouteAllowed(ROLES.OWNER, 'owner-planning', false), true);
  });
});
