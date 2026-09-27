'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routerSource = fs.readFileSync(path.join(__dirname, '../../Frontend/src/js/router.js'), 'utf8').replace(/\r\n/g, '\n');
const adminSource = fs.readFileSync(path.join(__dirname, '../../Frontend/src/js/pages/administration.js'), 'utf8').replace(/\r\n/g, '\n');
const swSource = fs.readFileSync(path.join(__dirname, '../../Frontend/sw.js'), 'utf8').replace(/\r\n/g, '\n');
const indexHtmlSource = fs.readFileSync(path.join(__dirname, '../../Frontend/index.html'), 'utf8').replace(/\r\n/g, '\n');

test('1. Administration Cafés route hydrates fully with async loadAdminData and render', () => {
  assert.ok(adminSource.includes('export async function hydrateAdmin(root, subroute)'), 'hydrateAdmin must be an async function');
  assert.ok(adminSource.includes('await loadAdminData(root);'), 'hydrateAdmin must await loadAdminData');
  assert.ok(adminSource.includes('ensureAdminDelegation(root);'), 'hydrateAdmin must ensure delegation on stable root');
  assert.ok(adminSource.includes('export const wireAdmin = hydrateAdmin;'), 'wireAdmin must alias hydrateAdmin');
});

test('2. wireAdmin is awaited by router in all entry points', () => {
  // router.js case "admin" must await wireAdmin
  assert.ok(
    routerSource.includes('case "admin":') &&
    routerSource.includes('await wireAdmin(content, subroute);'),
    'router.js case "admin" must await wireAdmin(content, subroute)'
  );
  // Settings -> Administration must also await wireAdmin
  assert.ok(
    routerSource.includes('await wireAdmin(content);'),
    'router.js Settings -> Admin path must await wireAdmin(content)'
  );
});

test('3. View button handler fires and has robust delegation', () => {
  assert.ok(adminSource.includes('event.target.closest("[data-view-cafe]");'), 'Delegation must check [data-view-cafe]');
  assert.ok(adminSource.includes('openCafeViewModal(root, cafeId);'), 'Delegation must invoke openCafeViewModal');
  assert.ok(adminSource.includes('async function openCafeViewModal(root, cafeId)'), 'openCafeViewModal function must exist');
});

test('4. Access button handler fires and has robust delegation', () => {
  assert.ok(adminSource.includes('event.target.closest("[data-access-cafe]");'), 'Delegation must check [data-access-cafe]');
  assert.ok(adminSource.includes('openCafeAccessManagementModal(root, cafeId);'), 'Delegation must invoke openCafeAccessManagementModal');
  assert.ok(
    adminSource.includes('import { openCafeAccessManagementModal } from "./cafeAccessManagementModal.js";'),
    'openCafeAccessManagementModal must be imported and wired'
  );
});

test('5. Edit button handler fires and has robust delegation', () => {
  assert.ok(adminSource.includes('event.target.closest("[data-edit-cafe]");'), 'Delegation must check [data-edit-cafe]');
  assert.ok(adminSource.includes('openCafeEditModal(root, cafeId);'), 'Delegation must invoke openCafeEditModal');
  assert.ok(adminSource.includes('async function openCafeEditModal(root, cafeId)'), 'openCafeEditModal function must exist');
});

test('6. More button handler fires and has robust delegation', () => {
  assert.ok(adminSource.includes('event.target.closest("[data-cafe-actions-menu]");'), 'Delegation must check [data-cafe-actions-menu]');
  assert.ok(adminSource.includes('openCafeActionsMenu(root, cafeId);'), 'Delegation must invoke openCafeActionsMenu');
  assert.ok(adminSource.includes('async function openCafeActionsMenu(root, cafeId)'), 'openCafeActionsMenu function must exist');
});

test('7. Actions survive loadAdminData() rerender via root delegation', () => {
  assert.ok(adminSource.includes('function ensureAdminDelegation(root)'), 'ensureAdminDelegation must be defined');
  assert.ok(adminSource.includes('if (!root || root.dataset.adminDelegationActive === "true") return;'), 'Must prevent duplicate listeners');
  assert.ok(adminSource.includes('root.dataset.adminDelegationActive = "true";'), 'Must mark root as delegation active');
  assert.ok(adminSource.includes('root.addEventListener("click", async (event) => {'), 'Single listener on stable root container');
});

test('8. Actions survive Refresh button', () => {
  assert.ok(adminSource.includes('event.target.closest("#admin-refresh-cafes-btn")'), 'Delegation must handle refresh button');
  assert.ok(adminSource.includes('await loadAdminData(root);'), 'Refresh must re-fetch admin data');
});

test('9. Structured address displays correctly using addressFormatter', async () => {
  const { formatCafeAddress, getCafeCity } = await import('../../Frontend/src/js/utils/addressFormatter.js');

  const structuredCafe = {
    cafeId: 'ZC-0001',
    name: 'Zamorin Koramangala',
    address: {
      building: 'Suite 401, Prestige Trade Tower',
      street: '100 Feet Road, 4th Block',
      locality: 'Koramangala',
      city: 'Bengaluru',
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      pinCode: '560034'
    }
  };

  const formatted = formatCafeAddress(structuredCafe);
  assert.ok(formatted.includes('Suite 401, Prestige Trade Tower'), 'Must include building');
  assert.ok(formatted.includes('100 Feet Road, 4th Block'), 'Must include street');
  assert.ok(formatted.includes('Koramangala'), 'Must include locality');
  assert.ok(formatted.includes('Bengaluru'), 'Must include city');
  assert.ok(formatted.includes('560034'), 'Must include pinCode');
  assert.ok(!formatted.includes('[object Object]'), 'Must never include [object Object]');

  const city = getCafeCity(structuredCafe);
  assert.equal(city, 'Bengaluru');
});

test('10. Legacy string address displays correctly', async () => {
  const { formatCafeAddress, getCafeCity } = await import('../../Frontend/src/js/utils/addressFormatter.js');

  const legacyCafe = {
    cafeId: 'CAFE-001',
    name: 'Historic Heritage Café',
    city: 'Kozhikode',
    address: 'Beach Road, Near Old Pier, Kozhikode — 673032'
  };

  const formatted = formatCafeAddress(legacyCafe);
  assert.equal(formatted, 'Beach Road, Near Old Pier, Kozhikode — 673032');
  assert.equal(getCafeCity(legacyCafe), 'Kozhikode');
});

test('11. [object Object] never appears under any circumstances', async () => {
  const { formatCafeAddress } = await import('../../Frontend/src/js/utils/addressFormatter.js');

  // Corrupted strings or empty objects
  assert.equal(formatCafeAddress({ address: '[object Object]' }), '');
  assert.equal(formatCafeAddress({}), '');
  assert.equal(formatCafeAddress(null), '');
  assert.equal(formatCafeAddress(undefined), '');
  assert.equal(formatCafeAddress({ address: {} }), '');
  assert.equal(formatCafeAddress('[object Object]'), '');

  // Verify renderCafesTab does not contain unsafe string concatenation
  assert.ok(!adminSource.includes('${escHtml(c.address || "")}'), 'renderCafesTab must not directly interpolate c.address');
  assert.ok(adminSource.includes('formatCafeAddress(c)'), 'renderCafesTab must use formatCafeAddress');
  assert.ok(adminSource.includes('getCafeCity(c)'), 'renderCafesTab must use getCafeCity');
});

test('12. Failed API produces visible toast error instead of silent swallow', () => {
  assert.ok(adminSource.includes('showToast(err.message || "Unable to load Café details.", "danger");'), 'openCafeViewModal must show error toast');
  assert.ok(adminSource.includes('showToast(err.message || "Unable to load Café details.", "danger");'), 'openCafeEditModal load must show error toast');
  assert.ok(adminSource.includes('showToast(err.message || "Unable to save Café changes.", "danger");'), 'openCafeEditModal save must show error toast');
});

test('13. Service-worker cache version bumped to zamorin-pwa-v3.10.0 and index.html versioned', () => {
  assert.ok(swSource.includes("CACHE_VERSION = 'zamorin-pwa-v3.10.0'"), 'Service worker CACHE_VERSION must be bumped to zamorin-pwa-v3.10.0');
  assert.ok(indexHtmlSource.includes('src="/src/js/main.js?v=3.10.0"'), 'index.html entry module must be versioned with ?v=3.10.0');
  assert.ok(swSource.includes("url.pathname.startsWith('/api/')"), 'sw.js must keep /api/ network-only');
});
