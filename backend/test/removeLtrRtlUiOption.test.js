'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const components = fs.readFileSync(path.join(root, 'frontend/src/js/components.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const designSystem = fs.readFileSync(path.join(root, 'frontend/src/js/pages/designSystem.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'frontend/sw.js'), 'utf8');

test('UI-LTR-001: global topbar no longer renders LTR/RTL toggle', () => {
  assert.equal(components.includes('id="rtl-toggle"'), false);
  assert.equal(components.includes('id="rtl-toggle-label"'), false);
  assert.equal(components.includes('Toggle LTR / RTL text direction'), false);
});

test('UI-LTR-002: global shell no longer wires RTL direction control', () => {
  assert.equal(components.includes("initRtlToggle('rtl-toggle'"), false);
  assert.equal(components.includes('initRtlToggle,'), false);
});

test('UI-LTR-003: persisted user direction state is retired and shell remains fixed LTR', () => {
  assert.ok(indexHtml.includes('<html lang="en" dir="ltr"'));
  assert.equal(indexHtml.includes("localStorage.getItem('zamorin-dir')"), false);
  assert.ok(indexHtml.includes("localStorage.removeItem('zamorin-dir')"));
});

test('UI-LTR-004: UI Components & Suite no longer exposes RTL/i18n section', () => {
  assert.equal(designSystem.includes("id: 'rtl'"), false);
  assert.equal(designSystem.includes("label: 'RTL / i18n'"), false);
  assert.equal(designSystem.includes('renderFlowbiteRtlNav,'), false);
});

test('UI-LTR-005: service worker cache version is bumped for rollout', () => {
  assert.ok(serviceWorker.includes("const CACHE_VERSION = 'zamorin-pwa-v3.9.1';"));
});
