'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { createApp } = require('../src/server');
const { User } = require('../src/models/User');
const { Session } = require('../src/models/Session');
const { PasskeyCredential } = require('../src/models/PasskeyCredential');
const { PasskeyChallenge } = require('../src/models/PasskeyChallenge');
const { TrustedDevice } = require('../src/models/TrustedDevice');
const { hashPassword } = require('../src/services/authService');

function makeRequest(server, path, { method = 'GET', body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://127.0.0.1:${server.address().port}`);
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      Accept: 'application/json',
      ...headers,
    };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: reqHeaders,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({
            status: res.statusCode,
            body: parsed,
            headers: res.headers,
          });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('AUTHENTICATION BASELINE: PASSKEY DISABLED & CANONICAL PASSWORD SUITE', async (t) => {
  let mongoServer;
  let server;
  const TEST_ORG = 'ZAMORIN';
  const TEST_EMAIL = 'owner@zamorin.com';
  const TEST_PASSWORD = 'StrongPassword!2026';

  // Ensure passkey feature is explicitly disabled for this suite
  process.env.ENABLE_PASSKEY_AUTH = 'false';
  process.env.JWT_ACCESS_SECRET = 'a_very_secure_jwt_access_secret_32bytes_min!';
  process.env.JWT_REFRESH_SECRET = 'a_very_secure_jwt_refresh_secret_32bytes_min!';
  process.env.DISABLE_MFA = 'true'; // Mandatory TOTP removed

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const passwordHash = await hashPassword(TEST_PASSWORD);

    await User.create({
      organisationId: TEST_ORG,
      userId: 'OW-0001',
      name: 'Strategic Owner',
      email: TEST_EMAIL,
      passwordHash,
      role: 'OWNER',
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      isPrimaryMaster: false,
      mfaEnabled: false,
      assignedCafeIds: ['ZC-0001'],
      createdBy: 'SYSTEM',
    });

    const app = createApp({ allowedOrigins: ['*'], production: false });
    server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
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

  // Case A: Passkey registration options requested while disabled
  await t.test('Case A: Passkey registration options returns 404 disabled, no challenge created', async () => {
    const res = await makeRequest(server, '/api/v1/auth/passkeys/register/options', {
      method: 'POST',
      body: { authenticatorType: 'PLATFORM' },
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'FEATURE_DISABLED');
    const challengesCount = await PasskeyChallenge.countDocuments();
    assert.equal(challengesCount, 0, 'No PasskeyChallenge record should be created');
  });

  // Case B: Passkey authentication options requested while disabled
  await t.test('Case B: Passkey authentication options returns 404 disabled, no challenge created', async () => {
    const res = await makeRequest(server, '/api/v1/auth/passkeys/authenticate/options', {
      method: 'POST',
      body: { organisationId: TEST_ORG, email: TEST_EMAIL },
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'FEATURE_DISABLED');
    const challengesCount = await PasskeyChallenge.countDocuments();
    assert.equal(challengesCount, 0, 'No PasskeyChallenge record should be created');
  });

  // Case C: Existing dormant credential data exists, cannot authenticate while feature disabled
  await t.test('Case C: Existing dormant credential data exists but cannot authenticate while disabled', async () => {
    // Seed a dormant passkey credential
    await PasskeyCredential.create({
      credentialId: 'dormant-cred-id-001',
      rawCredentialId: 'dormant-cred-raw-001',
      organisationId: TEST_ORG,
      userId: 'OW-0001',
      publicKey: 'dummy-base64-public-key',
      counter: 0,
      transports: ['internal'],
      deviceName: 'Dormant iPhone 15',
      status: 'ACTIVE',
      createdBy: 'OW-0001',
    });

    const res = await makeRequest(server, '/api/v1/auth/passkeys/authenticate/verify', {
      method: 'POST',
      body: {
        challengeId: 'PKC-MOCK-001',
        response: { id: 'dormant-cred-id-001' },
      },
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'FEATURE_DISABLED');
  });

  let activeAccessToken = '';
  let activeSessionId = '';

  // Case D: Normal Organisation ID + Email + Password login
  await t.test('Case D: Normal Organisation ID + Email + Password login succeeds (canonical)', async () => {
    const res = await makeRequest(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        organisationId: TEST_ORG,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        rememberDevice: false,
        device: {
          deviceId: 'TEST-DEV-UUID-001',
          deviceName: 'Owner Workstation',
          deviceType: 'LAPTOP',
          operatingSystem: 'Windows',
          browser: 'Edge',
        },
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.accessToken);
    assert.ok(res.body.data.session.sessionId);
    assert.equal(res.body.data.user.email, TEST_EMAIL);
    assert.equal(res.body.data.user.role, 'OWNER');

    activeAccessToken = res.body.data.accessToken;
    activeSessionId = res.body.data.session.sessionId;
  });

  // Case E: Remember This Device
  await t.test('Case E: Remember This Device sets trusted device cookie and registration', async () => {
    const res = await makeRequest(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        organisationId: TEST_ORG,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        rememberDevice: true,
        device: {
          deviceId: 'TEST-DEV-UUID-TRUSTED',
          deviceName: 'Owner Trusted iPad',
          deviceType: 'TABLET',
          operatingSystem: 'iOS',
          browser: 'Safari',
        },
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // Verify Set-Cookie header contains trusted device cookie
    const setCookie = res.headers['set-cookie'] || [];
    const hasTrustedCookie = setCookie.some((c) => c.includes('zamorin_trusted_device'));
    assert.ok(hasTrustedCookie, 'Must set zamorin_trusted_device cookie');

    // Verify database registration
    const trustedRecord = await TrustedDevice.findOne({
      organisationId: TEST_ORG,
      userId: 'OW-0001',
      status: 'ACTIVE',
    });
    assert.ok(trustedRecord, 'TrustedDevice record must exist');
    assert.ok(trustedRecord.deviceTrustId.startsWith('TD-'));
    assert.ok(!trustedRecord.macAddress, 'Must not store MAC address');
    assert.ok(!trustedRecord.imei, 'Must not store IMEI');
  });

  // Case F: Session and Device Revocation
  await t.test('Case F: Session and device revocation succeeds', async () => {
    // 1. Revoke trusted devices first while session is active
    const revokeDevicesRes = await makeRequest(
      server,
      '/api/v1/auth/trusted-devices',
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${activeAccessToken}` },
      }
    );
    assert.equal(revokeDevicesRes.status, 200);

    const activeDevicesCount = await TrustedDevice.countDocuments({
      organisationId: TEST_ORG,
      userId: 'OW-0001',
      status: 'ACTIVE',
    });
    assert.equal(activeDevicesCount, 0, 'All trusted devices must be revoked');

    // 2. Revoke session by ID
    const revokeSessionRes = await makeRequest(
      server,
      `/api/v1/auth/sessions/${activeSessionId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${activeAccessToken}` },
      }
    );
    assert.equal(revokeSessionRes.status, 200);
    assert.equal(revokeSessionRes.body.success, true);

    const revokedSession = await Session.findOne({ sessionId: activeSessionId });
    assert.equal(revokedSession.status, 'REVOKED');
  });
});
