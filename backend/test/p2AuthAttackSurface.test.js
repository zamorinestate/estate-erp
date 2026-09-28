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
