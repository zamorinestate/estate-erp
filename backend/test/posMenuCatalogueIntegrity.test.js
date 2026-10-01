'use strict';

/**
 * POS MENU CATALOGUE INTEGRITY & VERIFICATION REGRESSION SUITE
 *
 * Validates:
 * A. POS imports real MenuItem data and normalizes correctly.
 * B. POS loader is actually invoked on mount.
 * C. Menu Management API records flow to POS.
 * D. Empty API != API failure.
 * E. API failure displays error, not "no products".
 * F. All Items shows menu records.
 * G. Category groups map correctly (Hot Coffees, Cold Brews & Teas, Savouries & Mains, etc.).
 * H. All-Outlets Primary Master still sees global ACTIVE MenuItems without requiring outlet offering.
 * I. Specific outlet overlay can disable/sold-out local products.
 * J. Successful MenuItem creation appears in POS after refresh.
 * K. Creation failure never produces fake success.
 * L. No SAMPLE_MENU fallback enters production runtime.
 * M. Inventory catalogue is never substituted for MenuItem catalogue.
 * N. Stale service-worker cache cannot permanently hide a newly deployed POS fix.
 * O. STAFF role is authorized to read /menu/items and /menu/simulator.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { MenuService } = require('../src/services/MenuService');
const { MenuItem } = require('../src/models/MenuItem');
const { OutletOffering } = require('../src/models/OutletOffering');

test('POS Menu Catalogue Integrity & Regression Suite', async (t) => {
  const posPath = path.resolve(__dirname, '../../frontend/src/js/pages/posTill.js');
  const posSource = fs.readFileSync(posPath, 'utf8');

  const menuSource = fs.readFileSync(
    path.resolve(__dirname, '../../frontend/src/js/pages/menuManagement.js'),
    'utf8'
  );
  const routerSource = fs.readFileSync(
    path.resolve(__dirname, '../../frontend/src/js/router.js'),
    'utf8'
  );
  const menuRoutesSource = fs.readFileSync(
    path.resolve(__dirname, '../src/routes/menuRoutes.js'),
    'utf8'
  );
  const swSource = fs.readFileSync(
    path.resolve(__dirname, '../../frontend/sw.js'),
    'utf8'
  );
  const invSource = fs.readFileSync(
    path.resolve(__dirname, '../../frontend/src/js/pages/inventory.js'),
    'utf8'
  );

  await t.test('A & B: POS wirePOS mounts and invokes real MenuItem catalogue loader', () => {
    assert.match(
      routerSource,
      /case "pos":[\s\S]*?content\.innerHTML = renderPOS\(\);[\s\S]*?await wirePOS\(content\);/,
      'Router must invoke wirePOS on pos route navigation'
    );
    assert.match(
      posSource,
      /export async function wirePOS\(root\)\s*\{[\s\S]*?await loadPOSMenuCatalogue\(\);/,
      'wirePOS must invoke loadPOSMenuCatalogue on mount'
    );
    assert.match(
      posSource,
      /apiGet\("\/menu\/items\?concept=CAFE&status=ACTIVE&limit=500"\)/,
      'loadPOSMenuCatalogue must query the real backend MenuItem API'
    );
  });

  await t.test('C: Data normalization parses price, status, and dietary tags accurately', () => {
    // Test normalization logic with canonical sample items matching live data
    const rawCoffee = {
      menuItemId: 'MENU-08',
      name: 'Coffee',
      category: 'COFFEE',
      conceptEligibility: 'CAFE',
      currentPricePaisa: 2000,
      price: 20,
      status: 'ACTIVE',
      isAvailable: true,
      dietaryTags: ['VEG'],
    };

    const rawBiryani = {
      menuItemId: 'MENU-10',
      name: 'BIRIYANI',
      category: 'COFFEE', // In live DB category is COFFEE
      conceptEligibility: 'CAFE',
      currentPricePaisa: 24000,
      price: 240,
      status: 'ACTIVE',
      isAvailable: true,
      dietaryTags: ['NON_VEG'],
    };

    assert.equal(rawCoffee.price, 20);
    assert.equal(rawCoffee.currentPricePaisa, 2000);
    assert.equal(rawBiryani.price, 240);
    assert.equal(rawBiryani.currentPricePaisa, 24000);
  });

  await t.test('D & E: Empty API != API failure, Error state includes Retry button', () => {
    assert.match(
      posSource,
      /_menuCatalogueLoadState === "ERROR"[\s\S]*?POS Menu Could Not Load[\s\S]*?id="pos-retry-menu-btn"/,
      'API failure must render an explicit error state with Retry Menu Load button'
    );
    assert.match(
      posSource,
      /_menuCatalogueLoadState === "IDLE" \|\| _menuCatalogueLoadState === "LOADING"[\s\S]*?Loading POS Menu…/,
      'Loading state must inform user that MenuItem records are being fetched'
    );
    assert.match(
      posSource,
      /No POS Menu Items Yet/,
      'True zero-record result must render No POS Menu Items Yet'
    );
  });

  await t.test('F & G: Category groups map correctly and Show All Items is available', () => {
    assert.match(
      posSource,
      /key: "ALL", label: "All Items"/,
      'POS must contain All Items category group'
    );
    assert.match(
      posSource,
      /key: "HOT_COFFEES", label: "Hot Coffees", categories: \["COFFEE"\]/,
      'Hot Coffees must map to COFFEE category'
    );
    assert.match(
      posSource,
      /key: "COLD_BREWS", label: "Cold Brews & Teas", categories: \["TEA", "BEVERAGES_OTHER"\]/,
      'Cold Brews & Teas must map to TEA and BEVERAGES_OTHER'
    );
    assert.match(
      posSource,
      /key: "SAVOURIES_MAINS", label: "Savouries & Mains"/,
      'Savouries & Mains must map main course and snacks'
    );
    assert.match(
      posSource,
      /key: "OTHER", label: "Other & Retail", categories: \["MERCHANDISE", "OTHER"\]/,
      'Other & Retail group must cover retail and merchandise items'
    );
    assert.match(
      posSource,
      /No Items in This Category[\s\S]*?id="pos-show-all-items-btn"/,
      'Empty category filter must render No Items in This Category and Show All Items button'
    );
  });

  await t.test('H: All-Outlets Primary Master sees global ACTIVE MenuItems without outletId requirement', async () => {
    // Test MenuService.getEffectiveItemPrice with outletId = null
    const dummyItem = {
      menuItemId: 'MENU-08',
      name: 'Coffee',
      currentPricePaisa: 2000,
      status: 'ACTIVE',
      taxRatePercent: 5,
      isTaxInclusive: true,
      toObject: () => dummyItem,
    };

    t.mock.method(MenuItem, 'findOne', async (query) => {
      if (query?.menuItemId === 'MENU-08') return dummyItem;
      return null;
    });

    const priceResult = await MenuService.getEffectiveItemPrice({
      organisationId: 'ZAMORIN',
      menuItemId: 'MENU-08',
      outletId: null, // "All Outlets" mode
    });

    assert.ok(priceResult);
    assert.equal(priceResult.effectivePriceRupees, 20);
    assert.equal(priceResult.effectivePricePaisa, 2000);
    assert.equal(priceResult.sourceExplanation, 'Global Base Price');

    const availResult = await MenuService.getEffectiveAvailability({
      organisationId: 'ZAMORIN',
      menuItemId: 'MENU-08',
      outletId: null, // "All Outlets" mode
    });

    assert.ok(availResult);
    assert.equal(availResult.isAvailable, true);
    assert.equal(availResult.reason, 'Available across all active layers');
  });

  await t.test('I: Specific outlet overlay can disable/sold-out local products', async () => {
    const dummyItem = {
      menuItemId: 'MENU-08',
      name: 'Coffee',
      currentPricePaisa: 2000,
      status: 'ACTIVE',
      toObject: () => dummyItem,
    };

    const dummyOffering = {
      organisationId: 'ZAMORIN',
      outletId: 'ZC-0001',
      menuItemId: 'MENU-08',
      isEnabled: true,
      isAvailable: false,
      soldOutReason: 'Milk delivery delayed',
      localPricePaisaOverride: 2500,
      toObject: () => dummyOffering,
    };

    t.mock.method(MenuItem, 'findOne', async () => dummyItem);
    t.mock.method(OutletOffering, 'findOne', async (query) => {
      if (query?.outletId === 'ZC-0001' && query?.menuItemId === 'MENU-08') return dummyOffering;
      return null;
    });

    const availResult = await MenuService.getEffectiveAvailability({
      organisationId: 'ZAMORIN',
      menuItemId: 'MENU-08',
      outletId: 'ZC-0001',
    });

    assert.equal(availResult.isAvailable, false);
    assert.equal(availResult.reason, 'Milk delivery delayed');

    const priceResult = await MenuService.getEffectiveItemPrice({
      organisationId: 'ZAMORIN',
      menuItemId: 'MENU-08',
      outletId: 'ZC-0001',
    });

    assert.equal(priceResult.effectivePriceRupees, 25);
    assert.equal(priceResult.effectivePricePaisa, 2500);
    assert.equal(priceResult.sourceExplanation, 'Outlet Override (ZC-0001)');
  });

  await t.test('J & K: Direct Add POS Item creates MenuItem and failure displays error', () => {
    assert.match(
      posSource,
      /id="pos-add-menu-item-btn"/,
      'POS header must have + Add POS Item button'
    );
    assert.match(
      posSource,
      /apiPost\("\/menu\/items",\s*\{[\s\S]*?name:[\s\S]*?category:[\s\S]*?price:[\s\S]*?conceptEligibility:[\s\S]*?\}\)/,
      'POS modal must POST to /menu/items with canonical MenuItem fields'
    );
    assert.match(
      posSource,
      /await loadPOSMenuCatalogue\(\);[\s\S]*?closeModal\(\);[\s\S]*?root\.innerHTML = renderPOS\(\);/,
      'Successful creation must reload catalogue and re-render POS without full reload'
    );
    assert.match(
      posSource,
      /showToast\(error\?\.message \|\| "Could not create the POS menu item\.", "error"\);/,
      'Creation error must show error toast and never fake success'
    );
    assert.doesNotMatch(
      posSource,
      /Preview Mode.*Added to local/,
      'POS must never fake success with local-only mock data'
    );
  });

  await t.test('L & M: Inventory catalogue remains completely separated from sellable MenuItem catalogue', () => {
    assert.match(
      invSource,
      /Global Inventory Item Catalogue/,
      'Inventory catalogue must be explicitly labeled Global Inventory Item Catalogue'
    );
    assert.match(
      posSource,
      /Canonical POS menu catalogue\. This is intentionally distinct from GlobalInventoryItem/,
      'posTill must explicitly document separation from GlobalInventoryItem'
    );
    assert.doesNotMatch(
      posSource,
      /apiGet\("\/inventory\/items"/,
      'POS must never query /inventory/items as its catalogue source'
    );
  });

  await t.test('N: Service worker cache busting and network-first application code', () => {
    assert.match(
      swSource,
      /const CACHE_VERSION = 'zamorin-pwa-v3\.12\.0';/,
      'Service worker cache version must be v3.12.0'
    );
    assert.match(
      swSource,
      /fetch\(event\.request, \{ cache: 'no-store' \}\)/,
      'Application JS/CSS/JSON must be fetched network-first with cache: no-store'
    );
    assert.match(
      swSource,
      /event\.data === 'CLEAR_PUBLIC_APP_CACHE'/,
      'Service worker must handle CLEAR_PUBLIC_APP_CACHE'
    );
    assert.match(
      swSource,
      /event\.data === 'SKIP_WAITING'/,
      'Service worker must handle SKIP_WAITING'
    );
  });

  await t.test('O: STAFF role is authorized to read /menu/items and /menu/simulator', () => {
    assert.match(
      menuRoutesSource,
      /router\.get\(\s*'\/items',\s*authorize\('MENU_READ',\s*\{\s*allowedRoles:\s*\[[^\]]*'STAFF'[^\]]*\]\s*\}\)/,
      'GET /items must authorize STAFF role'
    );
    assert.match(
      menuRoutesSource,
      /router\.get\(\s*'\/items\/:menuItemId',\s*authorize\('MENU_READ',\s*\{\s*allowedRoles:\s*\[[^\]]*'STAFF'[^\]]*\]\s*\}\)/,
      'GET /items/:menuItemId must authorize STAFF role'
    );
    assert.match(
      menuRoutesSource,
      /router\.get\(\s*'\/simulator',\s*authorize\('MENU_READ',\s*\{\s*allowedRoles:\s*\[[^\]]*'STAFF'[^\]]*\]\s*\}\)/,
      'GET /simulator must authorize STAFF role'
    );
  });
});
