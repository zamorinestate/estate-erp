'use strict';

/**
 * ============================================================================
 * CAFÉ OPS-R02D: TRUSTED PROXY, CLIENT-IP INTEGRITY & AUTHENTICATION RATE-LIMIT
 * SECURITY HARDENING TEST SUITE
 * ============================================================================
 * Covers:
 * Area 1: Express trust proxy & spoofed X-Forwarded-For defense (direct vs proxy)
 * Area 2: Startup validation & environment-driven TRUSTED_PROXY_CIDRS configuration
 * Area 3: express-rate-limit version verification & IPv4/IPv6 key normalization (no subnet collapse)
 * Area 4: Independent Login Rate Limiters (Per-IP vs Per-Account counters & credential stuffing / brute force defense)
 * Area 5: Password Reset dual-limiter protection & anti-automation
 * Area 6: Optional MFA & Passkey route rate limiting & non-mandatory TOTP preservation
 * Area 7: Frontend 429 recovery resilience (no permanent disablement)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// Project Utilities
const {
  getTrustedClientIp,
  getClientIp,
  getTrustedProxies,
  isValidProxyEntry,
  DEFAULT_TRUSTED_PROXIES,
} = require('../src/utils/clientIp');

const {
  normalizeAccountKey,
  createLoginIpRateLimiter,
  createLoginAccountRateLimiter,
  createPasswordResetIpRateLimiter,
  createPasswordResetAccountRateLimiter,
} = require('../src/routes/authRoutes');

test('CAFÉ OPS-R02D: Trusted Proxy, Client-IP Integrity & Dual-Bucket Rate Limiting Suite', async (t) => {

  // ==========================================================================
  // AREA 1: Express Trust Proxy & Spoofed X-Forwarded-For Defense
  // ==========================================================================
  await t.test('Area 1: Express Trust Proxy & Spoofed X-Forwarded-For Defense', async () => {
    // Setup an Express app configured with canonical trusted proxy settings
    const app = express();
    app.set('trust proxy', getTrustedProxies());

    app.get('/test-client-ip', (req, res) => {
      res.json({
        trustedIp: getTrustedClientIp(req),
        expressIp: req.ip,
        expressIps: req.ips,
      });
    });

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Direct connection with spoofed X-Forwarded-For header
      // Since socket connects from 127.0.0.1 (trusted loopback), Express examines the XFF chain.
      // Forwarding chain: "fake-victim-ip, attacker-real-ip"
      // The nearest untrusted hop before loopback is attacker-real-ip (203.0.113.50).
      // Express and getTrustedClientIp must resolve to 203.0.113.50, NEVER to fake-victim-ip (198.51.100.99).
      const spoofRes = await fetch(`${baseUrl}/test-client-ip`, {
        headers: {
          'X-Forwarded-For': '198.51.100.99, 203.0.113.50',
        },
      });
      const spoofData = await spoofRes.json();
      assert.equal(spoofData.trustedIp, '203.0.113.50', 'First untrusted client address must be resolved, not spoofed leftmost IP');
      assert.notEqual(spoofData.trustedIp, '198.51.100.99', 'Leftmost spoofed IP must NOT be trusted');

      // 2. Multi-hop forwarding chain through trusted reverse proxies
      // e.g. Client (203.0.113.77) -> Cloud Proxy (10.0.0.1, uniquelocal) -> Express (127.0.0.1, loopback)
      const multiHopRes = await fetch(`${baseUrl}/test-client-ip`, {
        headers: {
          'X-Forwarded-For': '203.0.113.77, 10.0.0.1',
        },
      });
      const multiHopData = await multiHopRes.json();
      assert.equal(multiHopData.trustedIp, '203.0.113.77', 'Multi-hop traversal must correctly stop at first untrusted client IP');

      // 3. Malformed and edge-case headers fail safely without crash
      const malformedCases = [
        { name: 'empty header', value: '' },
        { name: 'whitespace only', value: '   ' },
        { name: 'malformed string', value: 'not-an-ip, random-text' },
        { name: 'ip with port', value: '198.51.100.10:8080' },
        { name: 'very long chain', value: Array.from({ length: 50 }, (_, i) => `192.168.1.${i}`).join(', ') + ', 203.0.113.1' },
      ];

      for (const c of malformedCases) {
        const edgeRes = await fetch(`${baseUrl}/test-client-ip`, {
          headers: { 'X-Forwarded-For': c.value },
        });
        assert.equal(edgeRes.status, 200, `Malformed XFF case "${c.name}" must not crash the server`);
        const edgeData = await edgeRes.json();
        assert.ok(typeof edgeData.trustedIp === 'string' && edgeData.trustedIp.length > 0, `Valid string IP returned for ${c.name}`);
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ==========================================================================
  // AREA 2: Startup Validation & Environment-Driven Configuration
  // ==========================================================================
  await t.test('Area 2: Startup Validation & Environment-Driven Configuration', () => {
    // 1. Defaults contain loopback, linklocal, uniquelocal
    const defaults = getTrustedProxies();
    assert.deepEqual(defaults, ['loopback', 'linklocal', 'uniquelocal']);

    // 2. Custom valid CIDRs and IPs
    const customValid = getTrustedProxies('loopback, 198.51.100.0/24, 2001:db8::/32, 192.0.2.1');
    assert.ok(customValid.includes('198.51.100.0/24'));
    assert.ok(customValid.includes('2001:db8::/32'));
    assert.ok(customValid.includes('192.0.2.1'));
    assert.ok(customValid.includes('loopback'));

    // 3. Malformed entries throw clear configuration error on startup
    assert.throws(
      () => getTrustedProxies('loopback, invalid-subnet-syntax'),
      /INVALID_PROXY_CONFIGURATION/
    );
    assert.throws(
      () => getTrustedProxies('10.0.0.0/999'),
      /INVALID_PROXY_CONFIGURATION/
    );

    // 4. Proxy entry validator utility
    assert.equal(isValidProxyEntry('loopback'), true);
    assert.equal(isValidProxyEntry('linklocal'), true);
    assert.equal(isValidProxyEntry('uniquelocal'), true);
    assert.equal(isValidProxyEntry('127.0.0.1'), true);
    assert.equal(isValidProxyEntry('::1'), true);
    assert.equal(isValidProxyEntry('10.0.0.0/8'), true);
    assert.equal(isValidProxyEntry('fe80::/10'), true);
    assert.equal(isValidProxyEntry(''), false);
    assert.equal(isValidProxyEntry('malformed'), false);
    assert.equal(isValidProxyEntry(123), false);
  });

  // ==========================================================================
  // AREA 3: express-rate-limit Version & IPv4/IPv6 Key Normalization
  // ==========================================================================
  await t.test('Area 3: express-rate-limit Version & IPv4/IPv6 Key Normalization', () => {
    const pkg = require('../../backend/node_modules/express-rate-limit/package.json');
    const version = pkg.version;
    const [major, minor, patch] = version.split('.').map(Number);

    // Verify installed version is NOT in known vulnerable list (8.0.0, 8.0.1, 8.1.0, 8.2.0, 8.2.1)
    const knownVulnerable = ['8.0.0', '8.0.1', '8.1.0', '8.2.0', '8.2.1'];
    assert.ok(!knownVulnerable.includes(version), `Installed express-rate-limit (${version}) must not be a known vulnerable release`);
    assert.ok(major >= 8 && (minor > 2 || (minor === 2 && patch >= 2) || (minor === 1 && patch >= 1) || (minor === 0 && patch >= 2)), 'Version must be on a patched release line');

    // IPv4 address normalization
    const ipv4Key = ipKeyGenerator('198.51.100.25');
    assert.equal(ipv4Key, '198.51.100.25');

    // IPv4-mapped IPv6 normalization (does NOT collapse into IPv6 subnet)
    const mappedIpv4KeyA = ipKeyGenerator('::ffff:192.0.2.10');
    const mappedIpv4KeyB = ipKeyGenerator('::ffff:198.51.100.20');
    assert.equal(mappedIpv4KeyA, '192.0.2.10');
    assert.equal(mappedIpv4KeyB, '198.51.100.20');
    assert.notEqual(mappedIpv4KeyA, mappedIpv4KeyB, 'Distinct IPv4-mapped IPv6 clients must not collide');

    // Normal IPv6 subnet behavior: addresses in the same /56 share a subnet bucket
    const ipv6A = ipKeyGenerator('2001:db8:85a3:0000:0000:8a2e:0370:7334');
    const ipv6B = ipKeyGenerator('2001:db8:85a3:0000:0000:8a2e:0370:7335');
    assert.equal(ipv6A, ipv6B, 'IPv6 rotation inside the same allocation must share the /56 subnet bucket');

    // Distinct IPv6 subnets do NOT collide
    const ipv6Other = ipKeyGenerator('2001:db8:9999:0000:0000:8a2e:0370:7334');
    assert.notEqual(ipv6A, ipv6Other, 'Distinct IPv6 allocations must have separate buckets');
  });

  // ==========================================================================
  // AREA 4: Independent Login Rate Limiters (Dual-Bucket Architecture)
  // ==========================================================================
  await t.test('Area 4: Independent Login Rate Limiters (Dual-Bucket Architecture)', async () => {
    // Create an app with low test thresholds: IP Limit = 5, Account Limit = 3
    const testApp = express();
    testApp.use(express.json());
    testApp.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

    const testIpLimiter = createLoginIpRateLimiter({ limit: 5, windowMs: 60000 });
    const testAccountLimiter = createLoginAccountRateLimiter({ limit: 3, windowMs: 60000 });

    testApp.post('/login', testIpLimiter, testAccountLimiter, (req, res) => {
      if (req.body?.password === 'CorrectPassword!') {
        req.authCredentialVerified = true;
        return res.status(200).json({ success: true, message: 'Authenticated' });
      }
      return res.status(401).json({ success: false, error: { code: 'INVALID_LOGIN' } });
    });

    const server = http.createServer(testApp);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. One IP -> Many Accounts (Credential Stuffing Attack)
      // Attacker from IP 198.51.100.1 sends 5 requests targeting 5 DIFFERENT accounts
      for (let i = 1; i <= 5; i++) {
        const res = await fetch(`${baseUrl}/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '198.51.100.1',
          },
          body: JSON.stringify({
            organisationId: 'ZAMORIN',
            email: `victim_${i}@zamorin.com`,
            password: 'Password123!',
          }),
        });
        assert.equal(res.status, 401, `Failed request ${i} under IP limit should reach authentication`);
      }

      // 6th request from the SAME IP targeting yet another new account must be BLOCKED by the IP limiter
      const ipBlockedRes = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '198.51.100.1',
        },
        body: JSON.stringify({
          organisationId: 'ZAMORIN',
          email: 'victim_6@zamorin.com',
          password: 'Password123!',
        }),
      });
      assert.equal(ipBlockedRes.status, 429, '6th request from same IP must be rejected with 429');
      const ipBlockedData = await ipBlockedRes.json();
      assert.equal(ipBlockedData.error.code, 'TOO_MANY_REQUESTS');
      assert.equal(ipBlockedData.error.message, 'Too many sign-in attempts detected. Please wait a moment before trying again.');

      // 2. Many IPs -> One Account (Distributed Brute Force Attack)
      // Attacker uses distinct IPs (203.0.113.10, 203.0.113.11, 203.0.113.12) targeting ONE single account
      for (let i = 1; i <= 3; i++) {
        const res = await fetch(`${baseUrl}/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': `203.0.113.${10 + i}`,
          },
          body: JSON.stringify({
            organisationId: 'ZAMORIN',
            email: 'target_executive@zamorin.com',
            password: 'Password123!',
          }),
        });
        assert.equal(res.status, 401, `Failed distributed attempt ${i} under account limit should reach authentication`);
      }

      // 4th request from a BRAND NEW IP (203.0.113.14) targeting the SAME account must be BLOCKED by Account limiter
      const acctBlockedRes = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '203.0.113.14',
        },
        body: JSON.stringify({
          organisationId: 'ZAMORIN',
          email: 'target_executive@zamorin.com',
          password: 'Password123!',
        }),
      });
      assert.equal(acctBlockedRes.status, 429, '4th request on same account must be rejected with 429 regardless of new IP');
      const acctBlockedData = await acctBlockedRes.json();
      assert.equal(acctBlockedData.error.code, 'TOO_MANY_REQUESTS');
      // Generic error message preserves anti-enumeration (identical to IP limiter)
      assert.equal(acctBlockedData.error.message, 'Too many sign-in attempts detected. Please wait a moment before trying again.');

      // 3. Unrelated legitimate client is NOT affected (No global collapse)
      const legitimateRes = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '198.51.100.99',
        },
        body: JSON.stringify({
          organisationId: 'ZAMORIN',
          email: 'innocent_staff@zamorin.com',
          password: 'CorrectPassword!',
        }),
      });
      assert.equal(legitimateRes.status, 200, 'Unrelated client and account must NOT be blocked by other throttles');

      // Successful sign-ins do not accumulate in failed-attempt buckets.
      for (let i = 0; i < 8; i++) {
        const successRes = await fetch(`${baseUrl}/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '198.51.100.150',
          },
          body: JSON.stringify({
            organisationId: 'ZAMORIN',
            email: 'repeat_success@zamorin.com',
            password: 'CorrectPassword!',
          }),
        });
        assert.equal(successRes.status, 200, `Successful sign-in ${i + 1} must not consume brute-force quota`);
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ==========================================================================
  // AREA 5: Password Reset Dual-Limiter Protection & Anti-Automation
  // ==========================================================================
  await t.test('Area 5: Password Reset Dual-Limiter Protection & Anti-Automation', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

    const resetIpLimiter = createPasswordResetIpRateLimiter({ limit: 4, windowMs: 60000 });
    const resetAccountLimiter = createPasswordResetAccountRateLimiter({ limit: 2, windowMs: 60000 });

    testApp.post('/password/forgot', resetIpLimiter, resetAccountLimiter, (req, res) => {
      res.status(200).json({ success: true, message: 'Reset email queued' });
    });

    const server = http.createServer(testApp);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Rotating IPs flooding the same employee account
      for (let i = 1; i <= 2; i++) {
        const res = await fetch(`${baseUrl}/password/forgot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': `198.51.100.${50 + i}`,
          },
          body: JSON.stringify({ email: 'victim@zamorin.com' }),
        });
        assert.equal(res.status, 200, `Reset attempt ${i} allowed`);
      }

      // 3rd attempt from a 3rd IP is blocked by account limiter (protecting employee inbox)
      const floodBlockedRes = await fetch(`${baseUrl}/password/forgot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '198.51.100.99',
        },
        body: JSON.stringify({ email: 'victim@zamorin.com' }),
      });
      assert.equal(floodBlockedRes.status, 429, '3rd reset on same email must be throttled');
      const floodData = await floodBlockedRes.json();
      assert.equal(floodData.error.code, 'TOO_MANY_REQUESTS');
      assert.equal(floodData.error.message, 'Too many password reset requests. Please try again later.');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ==========================================================================
  // AREA 6: Account Identifier Normalization & Privacy Pseudonymization
  // ==========================================================================
  await t.test('Area 6: Account Identifier Normalization & Privacy Pseudonymization', () => {
    // 1. Case-insensitivity and trimming
    const key1 = normalizeAccountKey({
      body: { organisationId: '  zamorin  ', email: '  User@Example.COM  ' },
    });
    const key2 = normalizeAccountKey({
      body: { organisationId: 'ZAMORIN', email: 'user@example.com' },
    });
    assert.equal(key1, key2, 'Normalized keys must match regardless of whitespace and case');

    // 2. Different organisation with same email yields different bucket
    const keyOtherOrg = normalizeAccountKey({
      body: { organisationId: 'OTHER_ORG', email: 'user@example.com' },
    });
    assert.notEqual(key1, keyOtherOrg, 'Different organisation with same email must yield distinct bucket');

    // 3. Privacy-safe: key does not contain plaintext email
    assert.ok(!key1.includes('user@example.com'), 'Key must be a pseudonym and not contain plaintext email');
    assert.ok(key1.startsWith('auth:acct:'), 'Key must have prefix auth:acct:');
  });

  // ==========================================================================
  // AREA 7: Frontend 429 Resilience & Submission Recovery
  // ==========================================================================
  await t.test('Area 7: Frontend 429 Resilience & Submission Recovery', () => {
    // Verify frontend/src/js/pages/login2.js contains explicit 429 handling and finally recovery
    const login2Path = path.resolve(__dirname, '../../frontend/src/js/pages/login2.js');
    const content = fs.readFileSync(login2Path, 'utf8');

    assert.ok(content.includes('TOO_MANY_REQUESTS'), 'login2.js must check for TOO_MANY_REQUESTS error code');
    assert.ok(content.includes('429'), 'login2.js must check for status 429');
    assert.ok(
      content.includes('Too many sign-in attempts detected. Please wait a moment before trying again.'),
      'login2.js must present the canonical user-friendly 429 message'
    );
    assert.ok(
      content.includes('finally'),
      'login2.js must have a finally block to unconditionally reset submission state'
    );
    assert.ok(
      content.includes('isSubmitting = false'),
      'login2.js must clear isSubmitting flag in error/finally block'
    );
    assert.ok(
      content.includes('submitBtn.disabled = false'),
      'login2.js must re-enable submit button on failure'
    );
  });
});
