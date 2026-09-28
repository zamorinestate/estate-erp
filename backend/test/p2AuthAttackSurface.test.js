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
