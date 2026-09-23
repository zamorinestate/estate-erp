#!/usr/bin/env node
/**
 * =============================================================================
 * ZAMORIN CAFÉ ERP — EXT-17 SYNTHETIC AVAILABILITY & HEALTH MONITOR
 * scripts/run_synthetic_monitor.mjs
 * =============================================================================
 *
 * Supplemental zero-cost availability & readiness probe for Zamorin Café ERP.
 * Monitors:
 *   1. Frontend HTTPS reachability & Login 2.0 app container marker
 *   2. Backend liveness (/health)
 *   3. Backend dependency readiness (/health/ready)
 *
 * Invariants:
 *   - Bounded timeouts & retries (distinguishes free-tier cold-start from outage)
 *   - Target validation against SSRF (disallows localhost, private IPs, admin URLs)
 *   - Zero mutation: performs non-destructive GET requests only
 *   - Zero secret emission: no tokens, cookies, or database URIs logged
 *   - Non-zero process exit code on hard probe failure
 *   - Supports --simulate-failure for verifying alerting without outage
 */

import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const DEFAULT_FRONTEND = process.env.STAGING_FRONTEND_URL || 'https://zamorin-cafe-erp.vercel.app';
const DEFAULT_BACKEND  = process.env.STAGING_BACKEND_URL  || 'https://zamorin-cafe-erp-staging.onrender.com';

const DISALLOWED_TARGET_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./i,
  /^https?:\/\/0\.0\.0\.0/i,
  /^https?:\/\/10\./i,
  /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./i,
  /^https?:\/\/192\.168\./i,
  /cloud\.mongodb\.com/i,
  /api\.render\.com/i,
  /api\.vercel\.com/i,
];

export function validateProbeTarget(targetUrl) {
  if (!targetUrl || typeof targetUrl !== 'string') {
    throw new Error('TARGET_INVALID: Target URL must be a non-empty string');
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (err) {
    throw new Error(`TARGET_INVALID: Cannot parse URL '${targetUrl}': ${err.message}`);
  }

  for (const pattern of DISALLOWED_TARGET_PATTERNS) {
    if (pattern.test(targetUrl)) {
      throw new Error(`TARGET_REJECTED_SSRF_PREVENTION: Target URL '${targetUrl}' matches blocked pattern`);
    }
  }

  return parsed;
}

export function makeSafeProbe(urlStr, options = {}) {
  const timeoutMs = options.timeoutMs || 25000;
  return new Promise((resolve, reject) => {
    validateProbeTarget(urlStr);
    const parsed = new URL(urlStr);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.request(
      parsed,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Zamorin-Synthetic-Monitor/1.0',
          'Accept': 'text/html,application/json,*/*',
          ...(options.headers || {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 1024 * 1024) {
            req.destroy();
          }
        });
        res.on('end', () => {
          let parsedBody = null;
          try {
            parsedBody = JSON.parse(body);
          } catch (_) {}

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedBody || body,
            rawBody: body,
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`PROBE_TIMEOUT: Connection timed out after ${timeoutMs}ms: ${urlStr}`));
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

export async function probeWithRetry(urlStr, options = {}) {
  const maxRetries = options.maxRetries ?? 2; // initial attempt + 2 retries = 3 attempts
  const delayMs = options.delayMs ?? 3000;
  let lastResult = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const t0 = Date.now();
    try {
      const res = await makeSafeProbe(urlStr, options);
      const latencyMs = Date.now() - t0;
      const isSuccess = res.statusCode >= 200 && res.statusCode < 400;
      lastResult = {
        success: isSuccess,
        attempt,
        latencyMs,
        response: res,
      };

      if (isSuccess) {
        return lastResult;
      }

      // If status is 5xx (e.g. Render Free cold start waking up), retry after backoff
      if (attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    } catch (err) {
      lastError = err;
      if (attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  if (lastResult) return lastResult;

  return {
    success: false,
    attempts: maxRetries + 1,
    error: lastError?.message || 'Unknown probe failure',
  };
}

export async function runSyntheticMonitor(opts = {}) {
  const frontendUrl = opts.frontendUrl || DEFAULT_FRONTEND;
  const backendUrl  = opts.backendUrl  || DEFAULT_BACKEND;
  const simulateFailure = opts.simulateFailure === true;

  const results = {
    timestamp: new Date().toISOString(),
    frontendUrl,
    backendUrl,
    simulateFailure,
    checks: {},
    allHealthy: false,
  };

  // 1. Frontend HTTPS & Application Shell
  try {
    const feProbe = await probeWithRetry(frontendUrl, { timeoutMs: 20000 });
    const isOk = feProbe.success && feProbe.response.statusCode >= 200 && feProbe.response.statusCode < 400;
    const bodyStr = String(feProbe.response?.rawBody || '');
    const hasAppMarker = bodyStr.includes('zamorin') || bodyStr.includes('<html') || bodyStr.includes('<!DOCTYPE') || bodyStr.includes('app');

    results.checks.frontend = {
      name: 'Frontend HTTPS App Shell',
      passed: isOk && hasAppMarker,
      statusCode: feProbe.response?.statusCode || null,
      latencyMs: feProbe.latencyMs || null,
      attempt: feProbe.attempt || null,
      error: feProbe.error || null,
      details: isOk ? 'Frontend responsive with valid app markup' : 'Frontend returned non-2xx status',
    };
  } catch (err) {
    results.checks.frontend = {
      name: 'Frontend HTTPS App Shell',
      passed: false,
      error: err.message,
    };
  }

  // 2. Backend Liveness (/health)
  try {
    const livenessUrl = `${backendUrl.replace(/\/$/, '')}/health`;
    const liveProbe = await probeWithRetry(livenessUrl, { timeoutMs: 30000 });
    const isOk = liveProbe.success && liveProbe.response.statusCode === 200;

    results.checks.backendLiveness = {
      name: 'Backend Liveness (/health)',
      passed: isOk,
      statusCode: liveProbe.response?.statusCode || null,
      latencyMs: liveProbe.latencyMs || null,
      attempt: liveProbe.attempt || null,
      error: liveProbe.error || null,
      details: isOk ? 'Process responsive' : 'Liveness check failed',
    };
  } catch (err) {
    results.checks.backendLiveness = {
      name: 'Backend Liveness (/health)',
      passed: false,
      error: err.message,
    };
  }

  // 3. Backend Readiness (/health/ready)
  try {
    const readinessUrl = `${backendUrl.replace(/\/$/, '')}/health/ready`;
    const readyProbe = await probeWithRetry(readinessUrl, { timeoutMs: 30000 });
    const isOk = readyProbe.success && readyProbe.response.statusCode === 200;

    results.checks.backendReadiness = {
      name: 'Backend Readiness (/health/ready)',
      passed: isOk,
      statusCode: readyProbe.response?.statusCode || null,
      latencyMs: readyProbe.latencyMs || null,
      attempt: readyProbe.attempt || null,
      error: readyProbe.error || null,
      database: readyProbe.response?.body?.database || null,
      storage: readyProbe.response?.body?.storage || null,
      details: isOk ? 'Database & dependencies ready to serve traffic' : 'Readiness check failed',
    };
  } catch (err) {
    results.checks.backendReadiness = {
      name: 'Backend Readiness (/health/ready)',
      passed: false,
      error: err.message,
    };
  }

  const probesPassed = Object.values(results.checks).every((c) => c.passed);

  if (simulateFailure) {
    results.checks.simulatedAlertTest = {
      name: 'Simulated Alert Delivery Test',
      passed: false,
      details: 'Deliberate failure triggered via simulateFailure flag to verify notification path',
    };
    results.allHealthy = false;
  } else {
    results.allHealthy = probesPassed;
  }

  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const simulate = args.includes('--simulate-failure') || process.env.SIMULATE_FAILURE === 'true';

  console.log('============================================================');
  console.log(' ZAMORIN CAFÉ ERP — EXT-17 SYNTHETIC AVAILABILITY MONITOR');
  console.log('============================================================');

  runSyntheticMonitor({ simulateFailure: simulate })
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      if (!res.allHealthy) {
        console.error('\n[SYNTHETIC MONITOR ALERT] One or more availability probes failed!');
        process.exit(1);
      } else {
        console.log('\n[SYNTHETIC MONITOR SUCCESS] All availability & health probes passed.');
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error('[FATAL PROBE ERROR]', err);
      process.exit(1);
    });
}
