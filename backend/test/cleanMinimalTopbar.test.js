'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const components = fs.readFileSync(path.join(root, 'frontend/src/js/components.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'frontend/sw.js'), 'utf8');

const renderStart = components.indexOf('export function renderTopbar');
const profileStart = components.indexOf('<div id="profilePopover"', renderStart);
const topbarVisible = components.slice(renderStart, profileStart);
const profileBlock = components.slice(profileStart, components.indexOf('export function wireBell', profileStart));

test('TOPBAR-CLEAN-001: permanent topbar keeps only core global controls', () => {
  assert.ok(topbarVisible.includes('id="global-cafe-selector"'));
  assert.ok(topbarVisible.includes('id="topbar-search-input"'));
  assert.ok(topbarVisible.includes('id="theme-btn"'));
  assert.ok(topbarVisible.includes('id="notif-bell-btn"'));
  assert.ok(topbarVisible.includes('id="profile-avatar-btn"'));
});

test('TOPBAR-CLEAN-002: redundant permanent controls are removed', () => {
  assert.equal(topbarVisible.includes('Quick Hub'), false);
  assert.equal(topbarVisible.includes('id="topbar-qr-quick-btn"'), false);
  assert.equal(topbarVisible.includes('id="theme-toggle"'), false);
  assert.equal(topbarVisible.includes('Supervise: None (Self)'), false);
  assert.equal(topbarVisible.includes('🛡️ Primary Master'), false);
});

test('TOPBAR-CLEAN-003: workspace and supervision capability remain available inside profile', () => {
  assert.ok(profileBlock.includes('id="global-workspace-selector"'));
  assert.ok(profileBlock.includes('id="global-supervised-employee-selector"'));
  assert.ok(profileBlock.includes('Workspace'));
  assert.ok(profileBlock.includes('Employee preview'));
});

test('TOPBAR-CLEAN-004: connectivity status is exceptional, not permanent clutter', () => {
  assert.ok(topbarVisible.includes('id="topbar-system-status"'));
  assert.ok(topbarVisible.includes("navigator.onLine ? 'none' : 'inline-flex'"));
  assert.equal(topbarVisible.includes('System Connected & Synced'), false);
});

test('TOPBAR-CLEAN-005: rollout versions are bumped', () => {
  assert.ok(indexHtml.includes('/src/js/main.js?v=3.9.3'));
  assert.ok(serviceWorker.includes("const CACHE_VERSION = 'zamorin-pwa-v3.9.2';"));
});
