'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcrypt');

const { createApp } = require('../src/server');
const { Cafe } = require('../src/models/Cafe');
const { CafeAccess } = require('../src/models/CafeAccess');
const { CafePinReservation } = require('../src/models/CafePinReservation');
const { CafeGatewayContext } = require('../src/models/CafeGatewayContext');
const { OperatorSession } = require('../src/models/OperatorSession');
const { User } = require('../src/models/User');
const cafeAccessCryptoService = require('../src/services/cafeAccessCryptoService');
const cafeService = require('../src/services/cafeService');
const operatorSessionService = require('../src/services/operatorSessionService');
const repositories = require('../src/cafe-operations/repositories');
const { generateQrSvg, generateQrMatrix, decodeQrMatrix } = require('../src/utils/qrCodeGen');

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
          let json = null;
          try {
            json = JSON.parse(responseData);
          } catch (e) {
            json = { raw: responseData };
          }
          resolve({ status: res.statusCode, data: json });
        });
      }
    );

    req.on('error', reject);
    if (serializedBody) req.write(serializedBody);
    req.end();
  });
}

test('P0 Remediation Verification Suite — Create Café & Café Operations Access', async (t) => {
  let mongoServer;
  let masterUser;
  let adminUser;
  let createdCafe;
  let createdAccess;
  let server;
  let port;

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    cafeAccessCryptoService.verifySecretKeys();

    const passwordHash = await bcrypt.hash('StandardSecurePassword!123', 10);

    masterUser = await User.create({
      userId: 'MU-0001',
      organisationId: 'ZAMORIN',
      name: 'Primary Master User',
      email: 'pm@zamorin.cafe',
      role: 'MASTER',
      isPrimaryMaster: true,
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'SYSTEM',
      primaryMasterDesignationReason: 'Initial bootstrap',
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash,
    });

    const adminPinHash = await bcrypt.hash('654321', 10);
    adminUser = await User.create({
      userId: 'AD-0001',
      employeeId: 'EMP-001',
      organisationId: 'ZAMORIN',
      name: 'Cafe Admin Kannan',
      email: 'kannan@zamorin.cafe',
      role: 'CAFE_ADMIN',
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash,
      operatorPinHash: adminPinHash,
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
    });

    // Create cafe with access
    const res = await cafeService.createCafeWithAccess({
      cafeData: {
        name: 'Zamorin Beach Road Flagship',
        displayName: 'Beach Road Branch',
        cafeType: 'STANDARD_CAFE',
        city: 'Kozhikode',
      },
      auth: masterUser,
    });

    createdCafe = res.cafe;
    createdAccess = res.access;

    const app = createApp({ allowedOrigins: ['*'], production: false });
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  // ---------------------------------------------------------------------------
  // P0-01 & P0-01B: AUTHORITATIVE GATEWAY CONTEXT & STRICT EXPIRATION
  // ---------------------------------------------------------------------------
  await t.test('P0-01: Permanent PIN in authentication flow is strictly rejected (PIN_AUTH_DISALLOWED)', async () => {
    const testPin = '123456';

    await assert.rejects(
      async () => {
        await cafeService.resolveGatewayCredential({
          method: 'PIN',
          credential: testPin,
          clientIp: '127.0.0.1',
          userAgent: 'TestBrowser/1.0',
        });
      },
      (err) => {
        assert.equal(err.code, 'PIN_AUTH_DISALLOWED');
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  await t.test('P0-01: QR resolution creates authoritative CafeGatewayContext and operator signs in', async () => {
    const gatewayRes = await cafeService.resolveGatewayCredential({
      method: 'QR',
      credential: createdAccess.qrToken,
      clientIp: '127.0.0.1',
      userAgent: 'TestBrowser/1.0',
    });

    assert.ok(gatewayRes.gatewayContextToken, 'Gateway must issue gatewayContextToken');
    assert.equal(gatewayRes.cafe.cafeId, createdCafe.cafeId);
    assert.equal(gatewayRes.cafe.displayName, 'Beach Road Branch');
    assert.equal(gatewayRes.cafe.city, 'Kozhikode');
    assert.ok(gatewayRes.expiresAt, 'Must have expiration');

    // Verify record in Mongo
    const contextDoc = await CafeGatewayContext.findOne({
      cafeId: createdCafe.cafeId,
    }).sort({ createdAt: -1 });

    assert.ok(contextDoc, 'CafeGatewayContext document must exist in database');
    assert.equal(contextDoc.status, 'ACTIVE');
    assert.equal(contextDoc.organisationId, 'ZAMORIN');
    assert.equal(contextDoc.cafeId, 'ZC-0001');

    // Operator sign-in using authoritative gateway token
    const signInResult = await operatorSessionService.signInOperator({
      gatewayContextToken: gatewayRes.gatewayContextToken,
      operatorUserId: adminUser.userId,
      pin: '654321',
      clientIp: '127.0.0.1',
      userAgent: 'TestBrowser/1.0',
    });

    assert.ok(signInResult.sessionToken, 'Must generate operator sessionToken');
    assert.equal(signInResult.operatorSession.operatorUserId, adminUser.userId);
    assert.equal(signInResult.operatorSession.cafeId, createdCafe.cafeId);
    assert.equal(signInResult.cafeContext.cafeId, createdCafe.cafeId);

    // Verify context status transitioned to CONSUMED
    const updatedContext = await CafeGatewayContext.findById(contextDoc._id);
    assert.equal(updatedContext.status, 'CONSUMED');

    // Verify operator session stored in database
    const sessionInDb = await OperatorSession.findOne({
      operatorUserId: adminUser.userId,
      cafeId: createdCafe.cafeId,
    });
    assert.ok(sessionInDb, 'OperatorSession record must exist in database');
    assert.ok(sessionInDb.sessionTokenHash, 'OperatorSession must have sessionTokenHash');
  });

  await t.test('P0-01: Consumed CafeGatewayContext cannot be reused', async () => {
    // Generate new gateway context
    const gatewayRes = await cafeService.resolveGatewayCredential({
      method: 'QR',
      credential: createdAccess.qrToken,
      clientIp: '127.0.0.1',
    });

    // Sign in first time -> succeeds
    await operatorSessionService.signInOperator({
      gatewayContextToken: gatewayRes.gatewayContextToken,
      operatorUserId: adminUser.userId,
      pin: '654321',
    });

    // Second attempt with same gateway context -> rejected
    await assert.rejects(
      async () => {
        await operatorSessionService.signInOperator({
          gatewayContextToken: gatewayRes.gatewayContextToken,
          operatorUserId: adminUser.userId,
          pin: '654321',
        });
      },
      (err) => {
        assert.equal(err.code, 'GATEWAY_CONTEXT_CONSUMED');
        assert.equal(err.statusCode, 401);
        return true;
      }
    );
  });

  await t.test('P0-01B: Expired CafeGatewayContext is strictly rejected by server independently of Mongo TTL', async () => {
    // Create an expired context directly in database
    const expiredToken = 'GWC-EXPIRED-TEST-001';
    const expiredHash = cafeAccessCryptoService.hashOpaqueToken(expiredToken);

    await CafeGatewayContext.create({
      gatewayContextId: expiredToken,
      accessMethod: 'PIN',
      gatewayContextTokenHash: expiredHash,
      organisationId: 'ZAMORIN',
      cafeId: createdCafe.cafeId,
      status: 'ACTIVE', // Status is active, but expiresAt is in the past!
      expiresAt: new Date(Date.now() - 60000), // 1 minute in the past
      createdAt: new Date(Date.now() - 120000),
    });

    // Calling signInOperator must fail with GATEWAY_CONTEXT_EXPIRED
    await assert.rejects(
      async () => {
        await operatorSessionService.signInOperator({
          gatewayContextToken: expiredToken,
          operatorUserId: adminUser.userId,
          pin: '654321',
        });
      },
      (err) => {
        assert.equal(err.code, 'GATEWAY_CONTEXT_EXPIRED');
        assert.equal(err.statusCode, 401);
        return true;
      }
    );
  });

  await t.test('P0-01: Client cafeId tampering is rejected (CAFE_MISMATCH)', async () => {
    const gatewayRes = await cafeService.resolveGatewayCredential({
      method: 'QR',
      credential: createdAccess.qrToken,
    });

    // Client maliciously passes a different cafeId ('ZC-9999')
    await assert.rejects(
      async () => {
        await operatorSessionService.signInOperator({
          gatewayContextToken: gatewayRes.gatewayContextToken,
          cafeId: 'ZC-9999', // Mismatched client cafeId
          operatorUserId: adminUser.userId,
          pin: '654321',
        });
      },
      (err) => {
        assert.equal(err.code, 'CAFE_MISMATCH');
        assert.equal(err.statusCode, 403);
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // P0-02 & P0-02B: QR & LOGIN LINK RESOLUTION
  // ---------------------------------------------------------------------------
  await t.test('P0-02: QR token resolution resolves cafe and issues CafeGatewayContext', async () => {
    const qrRes = await cafeService.resolveGatewayCredential({
      method: 'QR',
      credential: createdAccess.qrToken,
    });

    assert.ok(qrRes.gatewayContextToken);
    assert.equal(qrRes.cafe.cafeId, createdCafe.cafeId);
    assert.equal(qrRes.cafe.displayName, 'Beach Road Branch');

    // Operator sign-in with QR gateway context
    const signRes = await operatorSessionService.signInOperator({
      gatewayContextToken: qrRes.gatewayContextToken,
      operatorUserId: adminUser.userId,
      pin: '654321',
    });
    assert.ok(signRes.sessionToken);
  });

  await t.test('P0-02B: Login Link token resolution resolves cafe and issues CafeGatewayContext', async () => {
    const linkRes = await cafeService.resolveGatewayCredential({
      method: 'LINK',
      credential: createdAccess.linkToken,
    });

    assert.ok(linkRes.gatewayContextToken);
    assert.equal(linkRes.cafe.cafeId, createdCafe.cafeId);
    assert.equal(linkRes.cafe.displayName, 'Beach Road Branch');

    // Operator sign-in with Link gateway context
    const signRes = await operatorSessionService.signInOperator({
      gatewayContextToken: linkRes.gatewayContextToken,
      operatorUserId: adminUser.userId,
      pin: '654321',
    });
    assert.ok(signRes.sessionToken);
  });

  // ---------------------------------------------------------------------------
  // P0-04: CANONICAL DEVICE ENROLLMENT ROUTE & ALIAS
  // ---------------------------------------------------------------------------
  await t.test('P0-04: Canonical route POST /api/v1/cafe-ops/devices/enroll is mounted and operational', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/cafe-ops/devices/enroll',
      body: { invalid: 'payload' },
    });

    // Should NOT be 404
    assert.notEqual(res.status, 404, 'Canonical device enrollment endpoint must not return 404');
    // Valid controller validation should reject invalid payload with 400 or 401
    assert.ok(res.status === 400 || res.status === 401);
  });

  await t.test('P0-04: Legacy route alias POST /api/v1/cafe-operations/devices/enroll routes to same handler', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/cafe-operations/devices/enroll',
      body: { invalid: 'payload' },
    });

    assert.notEqual(res.status, 404, 'Legacy device enrollment alias must not return 404');
    assert.ok(res.status === 400 || res.status === 401);
  });

  // ---------------------------------------------------------------------------
  // P0-05: FAIL-CLOSED REPOSITORIES IN PRODUCTION
  // ---------------------------------------------------------------------------
  await t.test('P0-05: Fail-closed: production forbids in-memory repository fallback', () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';

      // 1. Calling getRepositories before initialization in production
      repositories.resetRepositories();

      assert.throws(
        () => {
          repositories.getRepositories();
        },
        (err) => {
          assert.ok(err.message.includes('REPOSITORIES_NOT_INITIALIZED'));
          return true;
        }
      );

      // 2. Explicitly attempting to initialize memory fallback in production
      assert.throws(
        () => {
          repositories.initRepositories('memory');
        },
        (err) => {
          assert.ok(err.message.includes('MEMORY_REPOSITORY_FORBIDDEN_IN_PRODUCTION'));
          return true;
        }
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
      // Re-initialize for test environment
      repositories.initRepositories('memory');
    }
  });

  // ---------------------------------------------------------------------------
  // P0-03: PURE-JAVASCRIPT ISO 18004 QR CODE GENERATION ENGINE
  // ---------------------------------------------------------------------------
  await t.test('P0-03: Pure-JS QR generator produces valid ISO 18004 matrix & SVG', () => {
    const testUrl = 'https://zamorin.cafe/cafe-access/qr/test-opaque-token-12345';
    const qrResult = generateQrMatrix(testUrl);
    const matrix = qrResult.matrix;

    assert.ok(Array.isArray(matrix), 'Matrix must be 2D array');
    assert.ok(matrix.length >= 21, 'QR matrix size must be >= 21x21 modules');
    assert.equal(matrix.length, matrix[0].length, 'Matrix must be square');

    // Finder pattern checks: top-left corner must have 7x7 pattern
    assert.equal(matrix[0][0], true, 'Top-left finder outer corner');
    assert.equal(matrix[0][6], true, 'Top-left finder outer corner');
    assert.equal(matrix[6][0], true, 'Top-left finder outer corner');

    // Decode round-trip
    const decoded = decodeQrMatrix(matrix);
    assert.equal(decoded, testUrl, 'Decoded QR string must match original');

    const svg = generateQrSvg(testUrl, { size: 256, margin: 4 });
    assert.ok(typeof svg === 'string', 'SVG must be string');
    assert.ok(svg.startsWith('<svg'), 'SVG must start with <svg tag');
    assert.ok(svg.includes('viewBox='), 'SVG must include viewBox');
    assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'SVG must declare XML namespace');
    assert.ok(svg.includes('<rect width='), 'SVG must render background');
    assert.ok(svg.includes('<path d="'), 'SVG must render QR module paths');
  });
});
