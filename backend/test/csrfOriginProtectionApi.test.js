'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { createApp } = require('../src/server');

const ALLOWED_ORIGIN = 'https://app.example.test';

function request(server, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://127.0.0.1:${server.address().port}`);

    const req = http.request(
      {
        method: options.method || 'GET',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: {
          Accept: 'application/json',
          ...(options.origin ? { Origin: options.origin } : {}),
          ...(options.cookie ? { Cookie: options.cookie } : {}),
          ...(options.body
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
      },
      (res) => {
        let raw = '';

        res.on('data', (chunk) => {
          raw += chunk;
        });

        res.on('end', () => {
          let body;

          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = raw;
          }

          resolve({
            status: res.statusCode,
            body,
            headers: res.headers,
          });
        });
      }
    );

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function startServer(t) {
  const app = createApp({
    allowedOrigins: [ALLOWED_ORIGIN],
    production: false,
  });

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  t.after(() => new Promise((resolve) => server.close(resolve)));

  return server;
}

test('cookie-authenticated state change requires an Origin header', async (t) => {
  const server = await startServer(t);

  const response = await request(
    server,
    '/api/v1/auth/refresh',
    {
      method: 'POST',
      cookie: 'zamorin_session_id=SS-20260808-0001',
    }
  );

  assert.equal(response.status, 403);
  assert.equal(
    response.body.error?.code,
    'CSRF_ORIGIN_REQUIRED'
  );
});

test('cookie-authenticated state change accepts an exact allowed Origin', async (t) => {
  const server = await startServer(t);

  const response = await request(
    server,
    '/api/v1/auth/refresh',
    {
      method: 'POST',
      origin: ALLOWED_ORIGIN,
      cookie: 'zamorin_session_id=SS-20260808-0001',
    }
  );

  assert.equal(response.status, 401);
  assert.equal(
    response.body.error?.code,
    'REFRESH_SESSION_REQUIRED'
  );
  assert.equal(
    response.headers['access-control-allow-origin'],
    ALLOWED_ORIGIN
  );
  assert.equal(
    response.headers['access-control-allow-credentials'],
    'true'
  );
});

test('unsafe request without authentication cookies is not CSRF-blocked', async (t) => {
  const server = await startServer(t);

  const response = await request(
    server,
    '/api/v1/auth/refresh',
    {
      method: 'POST',
    }
  );

  assert.equal(response.status, 401);
  assert.equal(
    response.body.error?.code,
    'REFRESH_SESSION_REQUIRED'
  );
});

test('safe GET request with authentication cookies does not require Origin', async (t) => {
  const server = await startServer(t);

  const response = await request(
    server,
    '/api/v1/health',
    {
      cookie: 'zamorin_access_token=stale-token',
    }
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.status, 'ok');
});


test('credentialed state change rejects a similarly named Vercel origin', async (t) => {
  const server = await startServer(t);

  const response = await request(
    server,
    '/api/v1/auth/refresh',
    {
      method: 'POST',
      origin: 'https://evil-estate-preview.vercel.app',
      cookie: 'zamorin_session_id=SS-20260808-0001',
    }
  );

  assert.equal(response.status, 403);
  assert.equal(response.body.error?.code, 'CORS_ORIGIN_DENIED');
});

test('canonical Vercel origin remains explicitly trusted', async (t) => {
  const app = createApp({
    allowedOrigins: [],
    production: true,
    staging: false,
  });

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await request(
    server,
    '/api/v1/auth/refresh',
    {
      method: 'POST',
      origin: 'https://zamorin-cafe-erp.vercel.app',
      cookie: 'zamorin_session_id=SS-20260808-0001',
    }
  );

  assert.equal(response.status, 401);
  assert.equal(response.body.error?.code, 'REFRESH_SESSION_REQUIRED');
  assert.equal(
    response.headers['access-control-allow-origin'],
    'https://zamorin-cafe-erp.vercel.app'
  );
});
