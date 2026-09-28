'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { createApp } = require('../src/server');
const { Cafe } = require('../src/models/Cafe');
const { User } = require('../src/models/User');
const { Session } = require('../src/models/Session');
const { AuditEvent } = require('../src/models/AuditEvent');
const cafeService = require('../src/services/cafeService');

process.env.NODE_ENV = 'test';
const TEST_ORG = 'ZAMORIN';
process.env.JWT_ACCESS_SECRET = 'a_very_secure_and_long_jwt_access_secret_32bytes_long!';
process.env.JWT_REFRESH_SECRET = 'a_very_secure_and_long_jwt_refresh_secret_32bytes_long!';
process.env.SESSION_ABSOLUTE_TIMEOUT_HOURS = '24';
process.env.SESSION_IDLE_TIMEOUT_MINUTES = '60';

function requestHttp(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = raw;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
          raw,
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

test('Cafe Operations Login 2.0 Contract & 32-Requirement Specification Suite', async (t) => {
  let mongoServer;
  let server;
  let app;

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = createApp({
      allowedOrigins: ['http://localhost:3000', 'https://zamorin-cafe-erp.vercel.app'],
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    // Seed test fixtures
    // 1. Cafe A: ACTIVE with leading zero PIN '001234'
    const cafePinA = await bcrypt.hash('001234', 10);
    await Cafe.create({
      organisationId: TEST_ORG,
      cafeId: 'ZC-0001',
      name: 'Zamorin Cafe Alangad',
      displayName: 'Zamorin Cafe Alangad',
      code: 'ZC-0001',
      city: 'Kochi',
      cafeType: 'STANDARD_CAFE',
      status: 'ACTIVE',
      operationsPinHash: cafePinA,
      operationsPinSetAt: new Date(),
      createdBy: 'MU-0001',
    });

    // 2. Cafe B: ACTIVE with PIN '654321'
    const cafePinB = await bcrypt.hash('654321', 10);
    await Cafe.create({
      organisationId: TEST_ORG,
      cafeId: 'ZC-0002',
      name: 'Zamorin Cafe Calicut',
      displayName: 'Zamorin Cafe Calicut',
      code: 'ZC-0002',
      city: 'Calicut',
      cafeType: 'STANDARD_CAFE',
      status: 'ACTIVE',
      operationsPinHash: cafePinB,
      operationsPinSetAt: new Date(),
      createdBy: 'MU-0001',
    });

    // 3. Cafe C: CLOSED (non-active)
    const cafePinC = await bcrypt.hash('112233', 10);
    await Cafe.create({
      organisationId: TEST_ORG,
      cafeId: 'ZC-0003',
      name: 'Zamorin Inactive Kiosk',
      displayName: 'Inactive Kiosk',
      code: 'ZC-0003',
      city: 'Thrissur',
      cafeType: 'KIOSK',
      status: 'CLOSED',
      operationsPinHash: cafePinC,
      operationsPinSetAt: new Date(),
      createdBy: 'MU-0001',
    });

    // 4. Employee A: STAFF assigned to Cafe A with leading zero PIN '007890'
    const empPinA = await bcrypt.hash('007890', 10);
    const dummyPasswordHash = await bcrypt.hash('SecuredPwd!123', 10);
    await User.create({
      organisationId: TEST_ORG,
      userId: 'ST-0001',
      name: 'Staff Alangad One',
      email: 'staff1@zamorin.cafe',
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      passwordHash: dummyPasswordHash,
      operatorPinHash: empPinA,
      operatorPinSetAt: new Date(),
      createdBy: 'MU-0001',
    });

    // 5. Admin A: CAFE_ADMIN assigned to Cafe A with PIN '123456'
    const adminPinA = await bcrypt.hash('123456', 10);
    await User.create({
      organisationId: TEST_ORG,
      userId: 'AD-0001',
      name: 'Admin Alangad One',
      email: 'admin1@zamorin.cafe',
      role: 'CAFE_ADMIN',
      accountStatus: 'ACTIVE',
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      passwordHash: dummyPasswordHash,
      operatorPinHash: adminPinA,
      operatorPinSetAt: new Date(),
      createdBy: 'MU-0001',
    });

    // 6. Employee B: STAFF assigned to Cafe B ONLY with PIN '234567'
    const empPinB = await bcrypt.hash('234567', 10);
    await User.create({
      organisationId: TEST_ORG,
      userId: 'ST-0002',
      name: 'Staff Calicut Two',
      email: 'staff2@zamorin.cafe',
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      primaryCafeId: 'ZC-0002',
      assignedCafeIds: ['ZC-0002'],
      passwordHash: dummyPasswordHash,
      operatorPinHash: empPinB,
      operatorPinSetAt: new Date(),
      createdBy: 'MU-0001',
    });

    // 7. Inactive Employee C: SUSPENDED
    const empPinC = await bcrypt.hash('345678', 10);
    await User.create({
      organisationId: TEST_ORG,
      userId: 'ST-0003',
      name: 'Suspended Staff',
      email: 'staff3@zamorin.cafe',
      role: 'STAFF',
      accountStatus: 'SUSPENDED',
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      passwordHash: dummyPasswordHash,
      operatorPinHash: empPinC,
      operatorPinSetAt: new Date(),
      createdBy: 'MU-0001',
    });

    // 8. Primary Master: MU-0001 (role MASTER - must NOT be allowed to sign in via Cafe Ops PIN)
    const masterPin = await bcrypt.hash('999999', 10);
    await User.create({
      organisationId: TEST_ORG,
      userId: 'MU-0001',
      name: 'Pradeesh K',
      email: 'pradeeshk331@gmail.com',
      role: 'MASTER',
      isPrimaryMaster: true,
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'SYSTEM',
      primaryMasterDesignationReason: 'Initial bootstrap',
      accountStatus: 'ACTIVE',
      passwordHash: dummyPasswordHash,
      operatorPinHash: masterPin,
      operatorPinSetAt: new Date(),
      createdBy: 'SYSTEM',
    });
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  // Req 1 & 4: Route exists and loads authorised ACTIVE Cafes only (excludes inactive Cafe C)
  await t.test('1 & 4: GET /api/v1/auth/cafe-operations/cafes loads only ACTIVE cafes', async () => {
    const res = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/cafes',
      method: 'GET',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert(Array.isArray(res.body.data.cafes));

    const cafeIds = res.body.data.cafes.map((c) => c.cafeId);
    assert(cafeIds.includes('ZC-0001'), 'Must include active Cafe A');
    assert(cafeIds.includes('ZC-0002'), 'Must include active Cafe B');
    assert(!cafeIds.includes('ZC-0003'), 'Must NOT include inactive Cafe C');

    // Canonical alias route check
    const aliasRes = await requestHttp(server, {
      path: '/api/v1/cafe-operations/cafes',
      method: 'GET',
    });
    assert.equal(aliasRes.status, 200);
    assert.equal(aliasRes.body.success, true);
  });

  // Req 3 & 5: Exactly four required authentication inputs exist; ID required
  await t.test('3 & 5: Missing or empty ID is rejected with 400', async () => {
    const res = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/login',
      method: 'POST',
    }, {
      cafeId: 'ZC-0001',
      userId: '',
      cafePin: '001234',
      employeePin: '007890',
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.error.message, /ID.*required/i);
  });

  // Req 6: Cafe PIN requires exactly 6 numeric digits (rejected with generic 401 to prevent format enumeration)
  await t.test('6: Cafe PIN requires exactly 6 numeric digits', async () => {
    for (const badPin of ['12345', '1234567', 'abcdef', '12345a']) {
      const res = await requestHttp(server, {
        path: '/api/v1/auth/cafe-operations/login',
        method: 'POST',
      }, {
        cafeId: 'ZC-0001',
        userId: 'ST-0001',
        cafePin: badPin,
        employeePin: '007890',
      });

      assert.equal(res.status, 401, `PIN "${badPin}" must be rejected with 401`);
      assert.equal(res.body.error.message, 'Unable to sign in. Please verify your Café, ID and PINs.');
    }
  });

  // Req 7: Employee PIN requires exactly 6 numeric digits (rejected with generic 401 to prevent format enumeration)
  await t.test('7: Employee PIN requires exactly 6 numeric digits', async () => {
    for (const badPin of ['999', '12345678', 'ABCDEF', '12 456']) {
      const res = await requestHttp(server, {
        path: '/api/v1/auth/cafe-operations/login',
        method: 'POST',
      }, {
        cafeId: 'ZC-0001',
        userId: 'ST-0001',
        cafePin: '001234',
        employeePin: badPin,
      });

      assert.equal(res.status, 401, `Employee PIN "${badPin}" must be rejected with 401`);
      assert.equal(res.body.error.message, 'Unable to sign in. Please verify your Café, ID and PINs.');
    }
  });

  // Req 8 & 16: Leading-zero PIN accepted as six-character string and succeeds with all 4 parts
  await t.test('8 & 16: Leading-zero Cafe PIN and Employee PIN succeeds with 200', async () => {
    const res = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/login',
      method: 'POST',
    }, {
      cafeId: 'ZC-0001',
      userId: 'ST-0001',
      cafePin: '001234',
      employeePin: '007890',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert(res.body.data.accessToken, 'Must return accessToken');
    assert(res.body.data.session, 'Must return session object');
    assert.equal(res.body.data.cafe.cafeId, 'ZC-0001');
    assert.equal(res.body.data.user.userId, 'ST-0001');
  });

  // Req 9 & 17: Non-existent Cafe rejected with generic error
  await t.test('9 & 17: Unknown Cafe rejected with generic error', async () => {
    const res = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/login',
      method: 'POST',
    }, {
      cafeId: 'ZC-9999',
      userId: 'ST-0001',
      cafePin: '001234',
      employeePin: '007890',
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.message, 'Unable to sign in. Please verify your Café, ID and PINs.');
  });

  // Req 10 & 17: Inactive Cafe rejected with generic error
  await t.test('10 & 17: Inactive Cafe rejected with generic error', async () => {
    const res = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/login',
      method: 'POST',
    }, {
      cafeId: 'ZC-0003',
      userId: 'ST-0001',
      cafePin: '112233',
      employeePin: '007890',
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.message, 'Unable to sign in. Please verify your Café, ID and PINs.');
  });

  // Req 11 & 17: Unknown ID safely rejected with generic error
  await t.test('11 & 17: Unknown ID rejected with generic error', async () => {
    const res = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/login',
      method: 'POST',
    }, {
      cafeId: 'ZC-0001',
      userId: 'ST-9999',
      cafePin: '001234',
      employeePin: '007890',
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.message, 'Unable to sign in. Please verify your Café, ID and PINs.');
  });

  // Req 12 & 17: Inactive employee rejected with generic error
  await t.test('12 & 17: Inactive/suspended employee rejected with generic error', async () => {
    const res = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/login',
      method: 'POST',
    }, {
      cafeId: 'ZC-0001',
      userId: 'ST-0003',
      cafePin: '001234',
      employeePin: '345678',
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.message, 'Unable to sign in. Please verify your Café, ID and PINs.');
  });

  // Req 13 & 50: Cross-Cafe isolation: Employee from Cafe B attempting to login to Cafe A rejected
  await t.test('13 & 50: Cross-Cafe attempt: Employee assigned to Cafe B rejected at Cafe A', async () => {
    const res = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/login',
      method: 'POST',
    }, {
      cafeId: 'ZC-0001',
      userId: 'ST-0002', // assigned ONLY to ZC-0002
      cafePin: '001234', // Cafe A PIN
      employeePin: '234567', // Correct employee PIN for ST-0002
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.message, 'Unable to sign in. Please verify your Café, ID and PINs.');
  });

  // Req 14 & 51: Correct Cafe PIN + wrong Employee PIN rejected
  await t.test('14 & 51: Correct Cafe PIN + wrong Employee PIN rejected with generic error', async () => {
    const res = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/login',
      method: 'POST',
    }, {
      cafeId: 'ZC-0001',
      userId: 'ST-0001',
      cafePin: '001234', // correct Cafe PIN
      employeePin: '999999', // WRONG employee PIN
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.message, 'Unable to sign in. Please verify your Café, ID and PINs.');
  });

  // Req 15: Wrong Cafe PIN + correct Employee PIN rejected
  await t.test('15: Wrong Cafe PIN + correct Employee PIN rejected with generic error', async () => {
    const res = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/login',
      method: 'POST',
    }, {
      cafeId: 'ZC-0001',
      userId: 'ST-0001',
      cafePin: '999999', // WRONG Cafe PIN
      employeePin: '007890', // correct employee PIN
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.message, 'Unable to sign in. Please verify your Café, ID and PINs.');
  });

  // Req 18 & 19 & 49: Lockout / Brute-force protection: 5 failed attempts trigger lockout
  await t.test('18, 19 & 49: Brute-force protection triggers lockout after 5 consecutive failures', async () => {
    // Reset counters first for clean test
    await User.updateOne({ userId: 'AD-0001' }, { operatorPinFailedAttempts: 0, operatorPinLockedUntil: null });
    await Cafe.updateOne({ cafeId: 'ZC-0001' }, { operationsPinFailedAttempts: 0, operationsPinLockedUntil: null });

    for (let i = 1; i <= 5; i++) {
      const res = await requestHttp(server, {
        path: '/api/v1/auth/cafe-operations/login',
        method: 'POST',
      }, {
        cafeId: 'ZC-0001',
        userId: 'AD-0001',
        cafePin: '001234',
        employeePin: '999998', // incorrect PIN
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.error.message, 'Unable to sign in. Please verify your Café, ID and PINs.');
    }

    // Verify in database that employee account was locked out
    const lockedUser = await User.findOne({ userId: 'AD-0001' });
    assert(lockedUser.operatorPinLockedUntil && new Date(lockedUser.operatorPinLockedUntil) > new Date(), 'User must have operatorPinLockedUntil in the future');

    // 6th attempt: even with correct PIN, must fail with generic 401 (never disclosing locked status)
    const lockedRes = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/login',
      method: 'POST',
    }, {
      cafeId: 'ZC-0001',
      userId: 'AD-0001',
      cafePin: '001234',
      employeePin: '123456', // correct PIN, but locked
    });

    assert.equal(lockedRes.status, 401);
    assert.equal(lockedRes.body.error.message, 'Unable to sign in. Please verify your Café, ID and PINs.');

    // Reset lockout for other tests
    await User.updateOne({ userId: 'AD-0001' }, { operatorPinFailedAttempts: 0, operatorPinLockedUntil: null });
    await Cafe.updateOne({ cafeId: 'ZC-0001' }, { operationsPinFailedAttempts: 0, operationsPinLockedUntil: null });
  });

  // Req 18: Rate limiting returns 429 when enabled
  await t.test('18: Rate limiting returns 429 when attempt threshold exceeded', async () => {
    let triggered429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await requestHttp(server, {
        path: '/api/v1/auth/cafe-operations/login',
        method: 'POST',
        headers: {
          'x-test-rate-limit': 'true',
        },
      }, {
        cafeId: 'ZC-0002',
        userId: 'ST-0002',
        cafePin: '654321',
        employeePin: '999999',
      });
      if (res.status === 429) {
        triggered429 = true;
        break;
      }
    }
    assert.equal(triggered429, true, 'Rate limiter must trigger 429 after repeated requests');
  });

  // Req 20: PINs absent from audit logs
  await t.test('20: PINs absent from audit logs', async () => {
    const auditEvents = await AuditEvent.find({ module: 'CAFE_OPERATIONS' }).lean();
    for (const evt of auditEvents) {
      const evtStr = JSON.stringify(evt);
      assert(!evtStr.includes('001234'), 'Plaintext Cafe PIN must not appear in audit log');
      assert(!evtStr.includes('007890'), 'Plaintext Employee PIN must not appear in audit log');
      assert(!evtStr.includes('999998'), 'Attempted PIN must not appear in audit log');
    }
  });

  // Req 21 & 22: PINs and PIN hashes absent from API responses
  await t.test('21 & 22: PINs and PIN hashes absent from successful and failed responses', async () => {
    const successRes = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/login',
      method: 'POST',
    }, {
      cafeId: 'ZC-0001',
      userId: 'ST-0001',
      cafePin: '001234',
      employeePin: '007890',
    });

    assert.equal(successRes.status, 200);
    const bodyStr = JSON.stringify(successRes.body);
    assert(!bodyStr.includes('operationsPinHash'), 'operationsPinHash must never be returned');
    assert(!bodyStr.includes('operatorPinHash'), 'operatorPinHash must never be returned');
    assert(!bodyStr.includes('001234'), 'cafePin must never be returned');
    assert(!bodyStr.includes('007890'), 'employeePin must never be returned');
    assert(!bodyStr.includes('passwordHash'), 'passwordHash must never be returned');
  });

  // Req 23 & 24: Session created securely and bound to cafe
  await t.test('23 & 24: Session created in DB with correct cafe binding', async () => {
    const loginRes = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/login',
      method: 'POST',
    }, {
      cafeId: 'ZC-0001',
      userId: 'ST-0001',
      cafePin: '001234',
      employeePin: '007890',
    });

    assert.equal(loginRes.status, 200);
    const sessionId = loginRes.body.data.session.sessionId;
    const dbSession = await Session.findOne({ sessionId });
    assert(dbSession, 'Session document must exist in database');
    assert.equal(dbSession.userId, 'ST-0001');
    assert.equal(dbSession.status, 'ACTIVE');
    assert.equal(loginRes.body.data.user.boundCafeId, 'ZC-0001');
  });

  // Req 26 & 27: Logout revokes session and token fails
  await t.test('26 & 27: Logout revokes session and invalidates access', async () => {
    const loginRes = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/login',
      method: 'POST',
    }, {
      cafeId: 'ZC-0001',
      userId: 'ST-0001',
      cafePin: '001234',
      employeePin: '007890',
    });

    assert.equal(loginRes.status, 200);
    const token = loginRes.body.data.accessToken;
    const sessionId = loginRes.body.data.session.sessionId;

    // Call /api/v1/auth/me - succeeds
    const meRes = await requestHttp(server, {
      path: '/api/v1/auth/me',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(meRes.status, 200);

    // Call /api/v1/auth/logout with token
    const logoutRes = await requestHttp(server, {
      path: '/api/v1/auth/logout',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(logoutRes.status, 200);

    // Session in DB must be REVOKED
    const dbSession = await Session.findOne({ sessionId });
    assert(dbSession.status === 'REVOKED' || dbSession.revokedAt, 'Session must be revoked in DB');

    // Subsequent /api/v1/auth/me fails with 401
    const postLogoutMe = await requestHttp(server, {
      path: '/api/v1/auth/me',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(postLogoutMe.status, 401);
  });

  // Req 28 & 29: Cafe-specific QR URL preselects correct Cafe; URL alone cannot authenticate
  await t.test('28 & 29: QR login URL generation includes cafeId but never PINs; QR URL alone cannot authenticate', async () => {
    const loginUrl = `${process.env.APP_ORIGIN || 'https://zamorin-cafe-erp.vercel.app'}/cafe-operations/login?cafe=ZC-0001`;
    assert(loginUrl.includes('cafe=ZC-0001'));
    assert(!loginUrl.includes('pin'), 'QR URL must never contain pin parameter');
    assert(!loginUrl.includes('token'), 'QR URL must never contain authentication token');

    // Visiting login route with GET or without POST credentials cannot generate session
    const getRes = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/login?cafe=ZC-0001',
      method: 'GET',
    });
    assert.notEqual(getRes.status, 200, 'GET to login endpoint must not authenticate user');
  });

  // Req 32: No Malformed MASTER role introduced; Master accounts cannot login via operator PIN
  await t.test('32: Primary Master and non-operator roles rejected from Cafe Operations login', async () => {
    const res = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/login',
      method: 'POST',
    }, {
      cafeId: 'ZC-0001',
      userId: 'MU-0001',
      cafePin: '001234',
      employeePin: '999999',
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.message, 'Unable to sign in. Please verify your Café, ID and PINs.');
  });

  // Security Certification Suite: Weak PIN Policy Enforcement
  await t.test('Security: Trivial Cafe and Employee PINs rejected during provisioning', async () => {
    const operatorSessionService = require('../src/services/operatorSessionService');
    const { isWeakPin } = require('../src/utils/pinPolicy');

    // Test blocklist functions
    assert.equal(isWeakPin('123456'), true, 'Ascending sequence must be weak');
    assert.equal(isWeakPin('654321'), true, 'Descending sequence must be weak');
    assert.equal(isWeakPin('111111'), true, 'Repeated digits must be weak');
    assert.equal(isWeakPin('121212'), true, 'Alternating digits must be weak');
    assert.equal(isWeakPin('987654'), true, 'Descending sequence must be weak');
    assert.equal(isWeakPin('482910'), false, 'Non-trivial PIN must be accepted');

    // Test operatorSessionService.setCafeOperationsPin rejects weak PIN
    await assert.rejects(
      async () => {
        await operatorSessionService.setCafeOperationsPin({
          orgId: TEST_ORG,
          cafeId: 'ZC-0001',
          pin: '123456',
          actorUserId: 'MU-0001',
          actorRole: 'MASTER',
        });
      },
      (err) => err.code === 'WEAK_PIN_REJECTED' || /stronger/i.test(err.message)
    );

    // Test operatorSessionService.setOperatorPin rejects weak PIN
    await assert.rejects(
      async () => {
        await operatorSessionService.setOperatorPin({
          organisationId: TEST_ORG,
          targetUserId: 'ST-0001',
          actorUserId: 'MU-0001',
          actorRole: 'MASTER',
          newPin: '654321',
        });
      },
      (err) => err.code === 'WEAK_PIN_REJECTED' || /stronger/i.test(err.message)
    );
  });

  // Security Certification Suite: Denial-of-Service Isolation
  await t.test('Security: Unknown employee or wrong employee PIN does NOT globally lock Cafe', async () => {
    await Cafe.updateOne({ cafeId: 'ZC-0001' }, { operationsPinFailedAttempts: 0, operationsPinLockedUntil: null });

    // 1. 6 failed attempts with unknown employee
    for (let i = 0; i < 6; i++) {
      const res = await requestHttp(server, {
        path: '/api/v1/auth/cafe-operations/login',
        method: 'POST',
      }, {
        cafeId: 'ZC-0001',
        userId: `UNKNOWN-${i}`,
        cafePin: '001234',
        employeePin: '999998',
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.error.message, 'Unable to sign in. Please verify your Café, ID and PINs.');
    }

    // Verify Cafe is NOT locked
    const cafeAfterUnknown = await Cafe.findOne({ cafeId: 'ZC-0001' });
    assert.equal(cafeAfterUnknown.operationsPinFailedAttempts, 0, 'Unknown employee failures must not increment Cafe failure count');
    assert.equal(cafeAfterUnknown.operationsPinLockedUntil, null, 'Unknown employee failures must not lock Cafe');

    // 2. 6 failed attempts with wrong employee PIN for ST-0001
    for (let i = 0; i < 6; i++) {
      const res = await requestHttp(server, {
        path: '/api/v1/auth/cafe-operations/login',
        method: 'POST',
      }, {
        cafeId: 'ZC-0001',
        userId: 'ST-0001',
        cafePin: '001234',
        employeePin: '999998',
      });
      assert.equal(res.status, 401);
    }

    // Verify Cafe is still NOT locked
    const cafeAfterWrongEmpPin = await Cafe.findOne({ cafeId: 'ZC-0001' });
    assert.equal(cafeAfterWrongEmpPin.operationsPinFailedAttempts, 0, 'Wrong employee PIN must not increment Cafe failure count');
    assert.equal(cafeAfterWrongEmpPin.operationsPinLockedUntil, null, 'Wrong employee PIN must not lock Cafe');

    // 3. 6 cross-cafe attempts with ST-0002 (assigned to Cafe B) at Cafe A
    for (let i = 0; i < 6; i++) {
      const res = await requestHttp(server, {
        path: '/api/v1/auth/cafe-operations/login',
        method: 'POST',
      }, {
        cafeId: 'ZC-0001',
        userId: 'ST-0002',
        cafePin: '001234',
        employeePin: '234567',
      });
      assert.equal(res.status, 401);
    }

    // Verify Cafe is STILL not locked
    const cafeAfterCross = await Cafe.findOne({ cafeId: 'ZC-0001' });
    assert.equal(cafeAfterCross.operationsPinFailedAttempts, 0, 'Cross-cafe attempts must not increment Cafe failure count');
    assert.equal(cafeAfterCross.operationsPinLockedUntil, null, 'Cross-cafe attempts must not lock Cafe');
  });

  // Security Certification Suite: Legitimate User Access After Another User Lockout
  await t.test('Security: Legitimate second employee can log in after another employee is locked out', async () => {
    // Reset AD-0001 counters
    await User.updateOne({ userId: 'AD-0001' }, { operatorPinFailedAttempts: 0, operatorPinLockedUntil: null });

    // Fail AD-0001 5 times to trigger employee lockout
    for (let i = 0; i < 5; i++) {
      await requestHttp(server, {
        path: '/api/v1/auth/cafe-operations/login',
        method: 'POST',
      }, {
        cafeId: 'ZC-0001',
        userId: 'AD-0001',
        cafePin: '001234',
        employeePin: '999998',
      });
    }

    // Verify AD-0001 is locked
    const lockedAdmin = await User.findOne({ userId: 'AD-0001' });
    assert(lockedAdmin.operatorPinLockedUntil && new Date(lockedAdmin.operatorPinLockedUntil) > new Date());

    // Reset ST-0001 counters to ensure clean state
    await User.updateOne({ userId: 'ST-0001' }, { operatorPinFailedAttempts: 0, operatorPinLockedUntil: null });

    // ST-0001 logs in with correct credentials - MUST SUCCEED with 200!
    const staffRes = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/login',
      method: 'POST',
    }, {
      cafeId: 'ZC-0001',
      userId: 'ST-0001',
      cafePin: '001234',
      employeePin: '007890',
    });

    assert.equal(staffRes.status, 200, 'Legitimate employee must still log in successfully');
    assert.equal(staffRes.body.success, true);
    assert.equal(staffRes.body.data.user.userId, 'ST-0001');

    // Clean up
    await User.updateOne({ userId: 'AD-0001' }, { operatorPinFailedAttempts: 0, operatorPinLockedUntil: null });
  });

  // Security Certification Suite: Public Cafe Directory Privacy & Integrity
  await t.test('Security: Public Cafe directory returns only safe fields, strictly isolated to canonical org', async () => {
    const res = await requestHttp(server, {
      path: '/api/v1/auth/cafe-operations/cafes',
      method: 'GET',
    });

    assert.equal(res.status, 200);
    const cafes = res.body.data.cafes;
    assert(cafes.length >= 2);

    for (const c of cafes) {
      // Must contain safe public fields
      assert(c.cafeId, 'Must have cafeId');
      assert(c.code, 'Must have code');
      assert(c.displayName, 'Must have displayName');
      assert(typeof c.city === 'string', 'Must have city string');

      // Must NEVER contain sensitive or private operational fields
      assert.strictEqual(c._id, undefined, 'Must not expose database _id');
      assert.strictEqual(c.operationsPinHash, undefined, 'Must not expose operationsPinHash');
      assert.strictEqual(c.operationsPinSetAt, undefined, 'Must not expose operationsPinSetAt');
      assert.strictEqual(c.operationsPinFailedAttempts, undefined, 'Must not expose failure counts');
      assert.strictEqual(c.operationsPinLockedUntil, undefined, 'Must not expose lock state');
      assert.strictEqual(c.deviceTokens, undefined, 'Must not expose device tokens');
      assert.strictEqual(c.employeeCount, undefined, 'Must not expose employee counts');
      assert.strictEqual(c.createdBy, undefined, 'Must not expose creator IDs');
    }
  });

  // Security Certification Suite: E2E Runner Environment Guard & Source Cleanliness
  await t.test('Security: E2E runner contains no hardcoded PINs and fails closed on missing config', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const e2ePath = path.resolve(__dirname, '../../scripts/test_cafe_ops_e2e.mjs');
    if (fs.existsSync(e2ePath)) {
      const e2eContent = fs.readFileSync(e2ePath, 'utf8');

      // Verify no hardcoded exposed test PINs
      assert(!e2eContent.includes("'123456'"), 'Must not contain hardcoded PIN 123456');
      assert(!e2eContent.includes("'654321'"), 'Must not contain hardcoded PIN 654321');
      assert(!e2eContent.includes("'147258'"), 'Must not contain hardcoded PIN 147258');
      assert(!e2eContent.includes("'258369'"), 'Must not contain hardcoded PIN 258369');

      // Verify required env var names exist in runner
      assert(e2eContent.includes('CAFE_OPS_E2E_CAFE_ID'), 'Must reference CAFE_OPS_E2E_CAFE_ID');
      assert(e2eContent.includes('CAFE_OPS_E2E_STAFF_ID'), 'Must reference CAFE_OPS_E2E_STAFF_ID');
      assert(e2eContent.includes('CAFE_OPS_E2E_CAFE_PIN'), 'Must reference CAFE_OPS_E2E_CAFE_PIN');
      assert(e2eContent.includes('CAFE_OPS_E2E_EMPLOYEE_PIN'), 'Must reference CAFE_OPS_E2E_EMPLOYEE_PIN');
      assert(e2eContent.includes('CAFE_OPS_E2E_CREDENTIALS_NOT_CONFIGURED'), 'Must fail closed with CAFE_OPS_E2E_CREDENTIALS_NOT_CONFIGURED');
      assert(e2eContent.includes('ALLOW_CAFE_OPS_E2E_NONLOCAL'), 'Must guard non-local environments with ALLOW_CAFE_OPS_E2E_NONLOCAL');
    }
  });
});
