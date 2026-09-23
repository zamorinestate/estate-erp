'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');

const { createApp } = require('../src/server');
const {
  sanitizeForLogging,
  logSecurityEvent,
  SECURITY_ACTIONS,
  isSensitiveKey,
  redactSensitiveString,
} = require('../src/services/securityLogger');
const { getDatabaseState } = require('../src/config/database');

function makeRequest({ port, method = 'GET', path = '/', headers = {}, body = null }) {
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
          let parsedData = null;
          try {
            parsedData = responseData ? JSON.parse(responseData) : null;
          } catch {
            parsedData = responseData;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsedData,
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

test('CAFÉ OPS-R01B Security Hardening Test Suite', async (t) => {
  let server;
  let port;
  const mockEnv = {
    nodeEnv: 'test',
    port: 0,
    allowedOrigins: ['http://localhost:3000'],
    jwtAccessSecret: 'test-access-secret-32-chars-long!',
    sessionAbsoluteTtlDays: 7,
    sessionIdleTimeoutMinutes: 30,
    stepUpAuthMaxAgeMinutes: 10,
  };

  const app = createApp(mockEnv);

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('1. Health probe returns 200 and process status without exposing secrets', async () => {
    const res = await makeRequest({ port, path: '/health' });
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'ok');
    assert.equal(res.data.success, true);
    assert.ok(res.data.timestamp);
    assert.ok(res.headers['x-correlation-id'], 'Must include x-correlation-id in response header');

    // Verify zero secret leakage
    const bodyStr = JSON.stringify(res.data);
    assert.ok(!bodyStr.includes('mongodb://'), 'Must not leak MongoDB URI');
    assert.ok(!bodyStr.includes('mongodb+srv://'), 'Must not leak Atlas SRV');
    assert.ok(!bodyStr.includes('secret'), 'Must not leak secrets');
  });

  await t.test('2. Readiness probe returns 200 or 503 depending on database readyState', async () => {
    const originalReadyState = mongoose.connection.readyState;

    // Test with readyState = 1 (simulated connected)
    Object.defineProperty(mongoose.connection, 'readyState', {
      value: 1,
      configurable: true,
    });

    const readyRes = await makeRequest({ port, path: '/readiness' });
    assert.equal(readyRes.status, 200);
    assert.equal(readyRes.data.status, 'ready');
    assert.equal(readyRes.data.success, true);
    assert.equal(readyRes.data.database, 'connected');
    assert.ok(readyRes.headers['x-correlation-id']);

    // Test with readyState = 0 (simulated disconnected)
    Object.defineProperty(mongoose.connection, 'readyState', {
      value: 0,
      configurable: true,
    });

    const unreadyRes = await makeRequest({ port, path: '/readiness' });
    assert.equal(unreadyRes.status, 503);
    assert.equal(unreadyRes.data.status, 'not_ready');
    assert.equal(unreadyRes.data.success, false);
    assert.equal(unreadyRes.data.database, 'disconnected');
    assert.ok(unreadyRes.headers['x-correlation-id']);

    // Restore readyState
    Object.defineProperty(mongoose.connection, 'readyState', {
      value: originalReadyState,
      configurable: true,
    });
  });

  await t.test('3. Correlation ID middleware preserves incoming valid correlation ID', async () => {
    const customId = 'req-trace-audit-9921';
    const res = await makeRequest({
      port,
      path: '/health',
      headers: { 'x-correlation-id': customId },
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers['x-correlation-id'], customId);
    assert.equal(res.data.correlationId, customId);
  });

  await t.test('4. Correlation ID middleware generates UUID when invalid or omitted', async () => {
    const res = await makeRequest({
      port,
      path: '/health',
      headers: { 'x-correlation-id': 'invalid@bad!chars#$$$%' },
    });

    assert.equal(res.status, 200);
    assert.notEqual(res.headers['x-correlation-id'], 'invalid@bad!chars#$$$%');
    assert.match(
      res.headers['x-correlation-id'],
      /^(REQ-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      'Should generate a valid random UUID'
    );
  });

  await t.test('5. Central log sanitiser strictly redacts passwords, tokens, cookies and secrets', async () => {
    const sensitivePayload = {
      user: {
        id: 'USR-001',
        name: 'Manager',
        password: 'SuperSecretPassword123!',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
        pin: '1234',
      },
      auth: {
        token: 'eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature',
        accessToken: 'access-token-12345',
        refreshToken: 'refresh-token-67890',
        sessionCookie: 'zamorin_session_id=abcdef123456',
        authorization: 'Bearer secret-bearer-token',
      },
      payment: {
        cardNumber: '4111222233334444',
        pan: '4111222233334444',
        cvv: '123',
      },
      infra: {
        mongodbUri: 'mongodb+srv://admin:mock_password@cluster0.example.mongodb.net/prod?retryWrites=true',
        apiSecret: 'top-secret-api-key',
      },
      safeField: 'This is public operational info',
      count: 42,
      active: true,
    };

    const sanitized = sanitizeForLogging(sensitivePayload);

    // Assert sensitive fields are redacted
    assert.equal(sanitized.user.password, '[REDACTED]');
    assert.equal(sanitized.user.passwordHash, '[REDACTED]');
    assert.equal(sanitized.user.pin, '[REDACTED]');
    assert.equal(sanitized.auth.token, '[REDACTED]');
    assert.equal(sanitized.auth.accessToken, '[REDACTED]');
    assert.equal(sanitized.auth.refreshToken, '[REDACTED]');
    assert.equal(sanitized.auth.sessionCookie, '[REDACTED]');
    assert.equal(sanitized.auth.authorization, '[REDACTED]');
    assert.equal(sanitized.payment.cardNumber, '[REDACTED]');
    assert.equal(sanitized.payment.pan, '[REDACTED]');
    assert.equal(sanitized.payment.cvv, '[REDACTED]');
    assert.equal(sanitized.infra.mongodbUri, '[REDACTED]');
    assert.equal(sanitized.infra.apiSecret, '[REDACTED]');

    // Assert non-sensitive fields are preserved
    assert.equal(sanitized.user.id, 'USR-001');
    assert.equal(sanitized.user.name, 'Manager');
    assert.equal(sanitized.safeField, 'This is public operational info');
    assert.equal(sanitized.count, 42);
    assert.equal(sanitized.active, true);
  });

  await t.test('6. Sanitiser safely handles circular object references without crashing', async () => {
    const circularObj = { name: 'RootNode' };
    circularObj.self = circularObj;

    const sanitized = sanitizeForLogging(circularObj);
    assert.equal(sanitized.name, 'RootNode');
    assert.equal(sanitized.self, '[CIRCULAR_REFERENCE]');
  });

  await t.test('7. Structured security event logging produces standardized compliant schema', async () => {
    const event = logSecurityEvent({
      correlationId: 'test-corr-1102',
      organisationId: 'ZAMORIN',
      cafeId: 'CAFE-01',
      actorId: 'EMP-009',
      operatorSessionId: 'SESS-8877',
      deviceId: 'DEV-101',
      action: SECURITY_ACTIONS.AUTHORIZATION_DENIED,
      targetType: 'BILL',
      targetId: 'BIL-2026-0001',
      outcome: 'DENIED',
      severity: 'WARN',
      metadata: {
        attemptedAmount: 5000,
        pin: '9999', // should be redacted
      },
    });

    assert.ok(event.timestamp);
    assert.equal(event.correlationId, 'test-corr-1102');
    assert.equal(event.organisationId, 'ZAMORIN');
    assert.equal(event.cafeId, 'CAFE-01');
    assert.equal(event.actorId, 'EMP-009');
    assert.equal(event.operatorSessionId, 'SESS-8877');
    assert.equal(event.deviceId, 'DEV-101');
    assert.equal(event.action, 'AUTHORIZATION_DENIED');
    assert.equal(event.targetType, 'BILL');
    assert.equal(event.targetId, 'BIL-2026-0001');
    assert.equal(event.outcome, 'DENIED');
    assert.equal(event.severity, 'WARN');
    assert.equal(event.metadata.attemptedAmount, 5000);
    assert.equal(event.metadata.pin, '[REDACTED]');
  });

  await t.test('8. Not-found and unauthenticated routes return correlationId and safe errors', async () => {
    // 404 on unhandled path
    const notFoundRes = await makeRequest({ port, path: '/non-existent-route-for-testing' });
    assert.equal(notFoundRes.status, 404);
    assert.equal(notFoundRes.data.success, false);
    assert.equal(notFoundRes.data.error.code, 'ROUTE_NOT_FOUND');
    assert.ok(notFoundRes.data.correlationId);

    // 401 on protected api route without auth token
    const unauthRes = await makeRequest({ port, path: '/api/v1/users' });
    assert.equal(unauthRes.status, 401);
    assert.ok(unauthRes.data.error);
    assert.ok(unauthRes.headers['x-correlation-id']);
  });
});
