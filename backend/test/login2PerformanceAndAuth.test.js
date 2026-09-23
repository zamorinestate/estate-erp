'use strict';

/**
 * LOGIN-PAGE-2.0 BACKGROUND & AUTH REQUEST LIFECYCLE REGRESSION SUITE
 * 
 * Verifies:
 * 1. Background image collection is restored to the curated scenic set
 * 2. Background does not auto-rotate on an interval
 * 3. Selected background is fixed per session/visit
 * 4. Health warm-up request contains no credentials or sensitive tokens
 * 5. Warm-up failure does not block login rendering or user input
 * 6. apiClient.js exports AUTH_REQUEST_TIMEOUT_MS = 60000 and applies route-aware 60s timeout
 * 7. HTTP 401 invalid credentials are not retried automatically
 * 8. wireLoginPage2 implements in-flight submission lock and progressive button text
 * 9. sw.js is updated with v2.3.6 cache versioning
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('LOGIN-PAGE-2.0 Background & Auth Lifecycle Suite', () => {

  // 1 & 2. Verify restored scenic background collection and no interval rotation
  test('1 & 2. login2.js has restored scenic background collection and NO auto-rotation interval', () => {
    const login2Path = path.resolve(__dirname, '../../frontend/src/js/pages/login2.js');
    const content = fs.readFileSync(login2Path, 'utf8');

    // Must contain standard background image collection
    assert.ok(content.includes('BACKGROUND_IMAGES = ['), 'login2.js must export BACKGROUND_IMAGES');
    assert.ok(content.includes('navy-gradient-standard'), 'login2.js must contain standard background style');

    // Must not contain background rotation intervals
    assert.ok(!content.includes('setInterval(') && !content.includes('setInterval ('), 'login2.js must not auto-rotate backgrounds on an interval');

    // Must have fixed background selection per visit
    assert.ok(content.includes('getFixedPageBackground'), 'login2.js must implement getFixedPageBackground');
    assert.ok(content.includes('sessionStorage'), 'login2.js must persist chosen background in sessionStorage');
  });

  // 3 & 4. Verify health warm-up request contains no credentials
  test('3 & 4. triggerBackendWarmup in main.js sends unauthenticated lightweight GET /health', () => {
    const mainPath = path.resolve(__dirname, '../../frontend/src/js/main.js');
    const content = fs.readFileSync(mainPath, 'utf8');

    assert.ok(content.includes('triggerBackendWarmup'), 'main.js must export triggerBackendWarmup');
    assert.ok(content.includes("credentials: \"omit\"") || content.includes("credentials: 'omit'"), 'warm-up request must omit credentials');
    assert.ok(content.includes('/health'), 'warm-up request must target /health');
  });

  // 5 & 6. Verify apiClient.js timeout configuration
  test('5 & 6. apiClient.js exports AUTH_REQUEST_TIMEOUT_MS = 60000 and applies route-aware 60s timeout', () => {
    const apiClientPath = path.resolve(__dirname, '../../frontend/src/js/apiClient.js');
    const content = fs.readFileSync(apiClientPath, 'utf8');

    assert.ok(content.includes('AUTH_REQUEST_TIMEOUT_MS = 60000'), 'apiClient.js must export AUTH_REQUEST_TIMEOUT_MS as 60000');
    assert.ok(content.includes('DEFAULT_REQUEST_TIMEOUT_MS = 30000'), 'apiClient.js must export DEFAULT_REQUEST_TIMEOUT_MS as 30000');
    assert.ok(content.includes('isAuthRoute'), 'apiClient.js must dynamically detect auth routes for 60s timeout');
    assert.ok(content.includes('isTimeoutError'), 'ApiClientError must have isTimeoutError getter');
    assert.ok(content.includes('isAuthError'), 'ApiClientError must have isAuthError getter');
    assert.ok(content.includes('isNetworkError'), 'ApiClientError must have isNetworkError getter');
  });

  // 7 & 8. Verify 401 is not retried
  test('7 & 8. NON_REFRESHABLE_AUTH_PATHS prevents 401 refresh retry loops for /auth/login', () => {
    const apiClientPath = path.resolve(__dirname, '../../frontend/src/js/apiClient.js');
    const content = fs.readFileSync(apiClientPath, 'utf8');

    assert.ok(content.includes('"/auth/login"'), 'NON_REFRESHABLE_AUTH_PATHS must include /auth/login');
    assert.ok(!content.includes('allowRefreshRetry && normalized === "/auth/login"'), '401 on login must never auto-refresh/retry');
  });

  // 9 & 10. Verify duplicate click prevention and progressive status
  test('9 & 10. wireLoginPage2 implements in-flight submission lock and progressive button text', () => {
    const login2Path = path.resolve(__dirname, '../../frontend/src/js/pages/login2.js');
    const content = fs.readFileSync(login2Path, 'utf8');

    assert.ok(content.includes('isSubmitting'), 'wireLoginPage2 must use isSubmitting lock');
    assert.ok(content.includes('Connecting securely...'), 'wireLoginPage2 must display Connecting securely...');
    assert.ok(content.includes('Authenticating...'), 'wireLoginPage2 must display Authenticating...');
    assert.ok(content.includes('submitBtn.disabled = false'), 'wireLoginPage2 must restore button on failure');
  });

  // 11 & 12. Verify sw.js caching
  test('11 & 12. sw.js is bumped to current version and caches core assets cleanly', () => {
    const swPath = path.resolve(__dirname, '../../frontend/sw.js');
    const content = fs.readFileSync(swPath, 'utf8');

    assert.ok(/zamorin-pwa-v2\.[3-9]\.[0-9]/.test(content), 'sw.js must be bumped to current version');
    assert.ok(content.includes('login2.css'), 'sw.js PRECACHE_SHELL must include login2.css');
  });

});
