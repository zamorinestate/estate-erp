'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { authenticate } = require('../src/middleware/authenticate');

const ROOT = path.resolve(__dirname, '../..');

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('P2-02: x-dev-role cannot manufacture an authenticated identity', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousBypass = process.env.ALLOW_DEV_AUTH_BYPASS;

  process.env.NODE_ENV = 'development';
  process.env.ALLOW_DEV_AUTH_BYPASS = 'true';

  try {
    const response = makeResponse();
    let nextCalled = false;

    const request = {
      auth: null,
      cookies: {},
      query: { devRole: 'MASTER', role: 'MASTER' },
      get(name) {
        const key = String(name || '').toLowerCase();
        if (key === 'authorization') return null;
        if (key === 'x-dev-role') return 'MASTER';
        return null;
      },
    };

    await authenticate(request, response, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body?.error?.code, 'AUTHENTICATION_REQUIRED');
    assert.equal(request.auth, null);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;

    if (previousBypass === undefined) delete process.env.ALLOW_DEV_AUTH_BYPASS;
    else process.env.ALLOW_DEV_AUTH_BYPASS = previousBypass;
  }
});

test('P2-02: frontend API client never emits x-dev-role as an authority header', () => {
  const apiClient = fs.readFileSync(
    path.join(ROOT, 'frontend', 'src', 'js', 'apiClient.js'),
    'utf8'
  );

  assert.doesNotMatch(apiClient, /requestHeaders\s*\[\s*['"]x-dev-role['"]\s*\]/i);
});

test('P2-02: backend authentication middleware has no dev-role identity lookup path', () => {
  const middleware = fs.readFileSync(
    path.join(ROOT, 'backend', 'src', 'middleware', 'authenticate.js'),
    'utf8'
  );

  assert.doesNotMatch(middleware, /x-dev-role|DEV-LOCAL-SESSION|roleEmailMap|explicitDevRole/);
  assert.match(middleware, /AUTHENTICATION_REQUIRED/);
});


test('P2-02: mock governance headers are test-only, opt-in, and loopback-bound', () => {
  const middlewarePath = require.resolve('../src/cafe-operations/middleware/requireGovernanceRole');
  delete require.cache[middlewarePath];
  const {
    resolveCallerFromRequest,
    allowExplicitTestIdentityHeaders,
  } = require(middlewarePath);

  const previousNodeEnv = process.env.NODE_ENV;
  const previousFlag = process.env.ALLOW_TEST_AUTH_HEADERS;

  const makeRequest = (remoteAddress = '127.0.0.1') => ({
    headers: {
      'x-mock-user-role': 'MASTER_PRIMARY',
      'x-mock-user-id': 'TEST-MASTER',
      'x-mock-user-is-primary': 'true',
    },
    socket: { remoteAddress },
  });

  try {
    process.env.NODE_ENV = 'staging';
    process.env.ALLOW_TEST_AUTH_HEADERS = 'true';
    assert.equal(allowExplicitTestIdentityHeaders(makeRequest()), false);
    assert.equal(resolveCallerFromRequest(makeRequest()), null);

    process.env.NODE_ENV = 'production';
    assert.equal(allowExplicitTestIdentityHeaders(makeRequest()), false);
    assert.equal(resolveCallerFromRequest(makeRequest()), null);

    process.env.NODE_ENV = 'test';
    delete process.env.ALLOW_TEST_AUTH_HEADERS;
    assert.equal(allowExplicitTestIdentityHeaders(makeRequest()), false);
    assert.equal(resolveCallerFromRequest(makeRequest()), null);

    process.env.ALLOW_TEST_AUTH_HEADERS = 'true';
    assert.equal(allowExplicitTestIdentityHeaders(makeRequest('203.0.113.8')), false);
    assert.equal(resolveCallerFromRequest(makeRequest('203.0.113.8')), null);

    assert.equal(allowExplicitTestIdentityHeaders(makeRequest('127.0.0.1')), true);
    const caller = resolveCallerFromRequest(makeRequest('127.0.0.1'));
    assert.equal(caller?.canonicalRole, 'MASTER');
    assert.equal(caller?.isPrimaryMaster, true);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;

    if (previousFlag === undefined) delete process.env.ALLOW_TEST_AUTH_HEADERS;
    else process.env.ALLOW_TEST_AUTH_HEADERS = previousFlag;
  }
});


test('P2-02: distributed auth rate limiter fails closed in staging and production', async () => {
  const authRoutes = require('../src/routes/authRoutes');
  const { redisClientFactory } = require('../src/services/redisClientFactory');

  const previousNodeEnv = process.env.NODE_ENV;
  const previousAppMode = process.env.APP_MODE;
  const previousAdapter = redisClientFactory.adapterService;

  function makeRequest() {
    return {
      body: {
        organisationId: 'ORG-TEST',
        email: 'user@example.test',
      },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      get() { return null; },
      originalUrl: '/api/v1/auth/login',
      correlationId: 'P2-DIST-RL',
    };
  }

  function makeResponse() {
    return {
      statusCode: 200,
      body: null,
      headers: {},
      setHeader(name, value) {
        this.headers[String(name).toLowerCase()] = String(value);
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
  }

  const middleware = authRoutes.createDistributedAuthRateLimiter({
    scope: 'AUTH_LOGIN_TEST',
    ipLimit: 5,
    accountLimit: 3,
  });

  try {
    process.env.NODE_ENV = 'staging';
    delete process.env.APP_MODE;
    redisClientFactory.adapterService = null;

    let response = makeResponse();
    let nextCalled = false;
    await middleware(makeRequest(), response, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body?.error?.code, 'AUTH_RATE_LIMITER_UNAVAILABLE');

    process.env.NODE_ENV = 'development';
    response = makeResponse();
    nextCalled = false;
    await middleware(makeRequest(), response, () => { nextCalled = true; });
    assert.equal(nextCalled, true);

    process.env.NODE_ENV = 'production';
    redisClientFactory.adapterService = {
      async checkRateLimit() {
        throw new Error('redis unavailable');
      },
    };
    response = makeResponse();
    nextCalled = false;
    await middleware(makeRequest(), response, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 503);
  } finally {
    redisClientFactory.adapterService = previousAdapter;

    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;

    if (previousAppMode === undefined) delete process.env.APP_MODE;
    else process.env.APP_MODE = previousAppMode;
  }
});

test('P2-02: distributed auth rate limiter enforces atomic adapter denial', async () => {
  const authRoutes = require('../src/routes/authRoutes');
  const { redisClientFactory } = require('../src/services/redisClientFactory');

  const previousNodeEnv = process.env.NODE_ENV;
  const previousAdapter = redisClientFactory.adapterService;
  const calls = [];

  process.env.NODE_ENV = 'production';
  redisClientFactory.adapterService = {
    async checkRateLimit(scope, identifier, limit, windowMs) {
      calls.push({ scope, identifier, limit, windowMs });
      if (scope.endsWith(':ACCOUNT')) {
        return { allowed: false, remaining: 0, resetAfterSeconds: 42 };
      }
      return { allowed: true, remaining: 4, resetAfterSeconds: 42 };
    },
  };

  const middleware = authRoutes.createDistributedAuthRateLimiter({
    scope: 'AUTH_LOGIN_TEST',
    ipLimit: 5,
    accountLimit: 3,
  });

  const request = {
    body: { organisationId: 'ORG-TEST', email: 'user@example.test' },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
    get() { return null; },
    originalUrl: '/api/v1/auth/login',
  };
  const response = {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  try {
    let nextCalled = false;
    await middleware(request, response, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 429);
    assert.equal(response.body?.error?.code, 'TOO_MANY_REQUESTS');
    assert.equal(response.headers['retry-after'], '42');
    assert.equal(calls.length, 2);
    assert.ok(calls.some((call) => call.scope === 'AUTH_LOGIN_TEST:IP'));
    assert.ok(calls.some((call) => call.scope === 'AUTH_LOGIN_TEST:ACCOUNT'));
  } finally {
    redisClientFactory.adapterService = previousAdapter;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});


test('P2-02: live vendor binding overrides stale token claims', () => {
  const middleware = fs.readFileSync(
    path.join(ROOT, 'backend', 'src', 'middleware', 'authenticate.js'),
    'utf8'
  );

  assert.doesNotMatch(
    middleware,
    /vendorId:\s*user\.vendorId\s*\|\|\s*payload\.vid/i,
    'JWT vendor claim must never restore authority removed from the live user record'
  );
  assert.match(middleware, /vendorId:\s*user\.vendorId\s*\|\|\s*null/);
});
