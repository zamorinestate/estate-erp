'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');

test('Clean UI & Navigation Architecture Suite — Phase 1', async (t) => {
  const navUrl = pathToFileURL(path.join(root, 'frontend/src/js/navigation.js')).href;
  const navModule = await import(navUrl);
  const { NAVIGATION, ROLES, isRouteAllowed, getGroupedNavItems } = navModule;

  await t.test('NAV-001: Primary Master sidebar has exactly 19 first-level items in exact order', () => {
    const pmItems = NAVIGATION.master.items;
    assert.equal(pmItems.length, 19, 'Primary Master must have exactly 19 first-level items');

    const expectedOrder = [
      { order: 1, group: 'COMMAND', label: 'Command Centre', route: 'dashboard' },
      { order: 2, group: 'OPERATIONS', label: 'POS & Billing', route: 'pos' },
      { order: 3, group: 'OPERATIONS', label: 'Inventory', route: 'inventory' },
      { order: 4, group: 'OPERATIONS', label: 'Procurement & Orders', route: 'procurement' },
      { order: 5, group: 'OPERATIONS', label: 'Vendors', route: 'vendors' },
      { order: 6, group: 'OPERATIONS', label: 'Action Centre', route: 'approvals' },
      { order: 7, group: 'FINANCE', label: 'Sales & Cash Book', route: 'sales-cash' },
      { order: 8, group: 'FINANCE', label: 'Expenses', route: 'expenses' },
      { order: 9, group: 'FINANCE', label: 'Finance & Accounts', route: 'finance' },
      { order: 10, group: 'FINANCE', label: 'Personal Ledger', route: 'ledger' },
      { order: 11, group: 'FINANCE', label: 'Revenue Share & Outlets', route: 'revenue-share' },
      { order: 12, group: 'PEOPLE', label: 'Attendance & Shifts', route: 'attendance' },
      { order: 13, group: 'PEOPLE', label: 'Employees', route: 'employees' },
      { order: 14, group: 'PEOPLE', label: 'Payroll', route: 'payroll' },
      { order: 15, group: 'COMMERCIAL', label: 'Menu & Pricing', route: 'menu' },
      { order: 16, group: 'INSIGHTS', label: 'Reports', route: 'reports' },
      { order: 17, group: 'INSIGHTS', label: 'Export Centre', route: 'exports' },
      { order: 18, group: 'ADMINISTRATION', label: 'Cafés & Administration', route: 'admin' },
      { order: 19, group: 'SYSTEM', label: 'Settings', route: 'settings' },
    ];

    expectedOrder.forEach((expected, idx) => {
      const actual = pmItems[idx];
      assert.equal(actual.route, expected.route, `Item ${idx + 1} route mismatch: expected ${expected.route}, got ${actual.route}`);
      assert.equal(actual.label, expected.label, `Item ${idx + 1} label mismatch: expected ${expected.label}, got ${actual.label}`);
      assert.equal(actual.group, expected.group, `Item ${idx + 1} group mismatch: expected ${expected.group}, got ${actual.group}`);
    });
  });

  await t.test('NAV-002: Owner sidebar has exactly 17 first-level items in exact order', () => {
    const ownerItems = NAVIGATION.owner.items;
    assert.equal(ownerItems.length, 17, 'Owner must have exactly 17 first-level items');

    const expectedOrder = [
      { order: 1, group: 'COMMAND', label: 'Overview', route: 'dashboard' },
      { order: 2, group: 'COMMAND', label: 'Café Performance', route: 'performance' },
      { order: 3, group: 'OPERATIONS', label: 'Inventory & Stock', route: 'inventory' },
      { order: 4, group: 'OPERATIONS', label: 'Purchasing & Vendors', route: 'procurement' },
      { order: 5, group: 'OPERATIONS', label: 'Action Centre', route: 'approvals' },
      { order: 6, group: 'FINANCE', label: 'Sales & Cash Book', route: 'sales-cash' },
      { order: 7, group: 'FINANCE', label: 'Expenses', route: 'expenses' },
      { order: 8, group: 'FINANCE', label: 'Finance Summary', route: 'finance' },
      { order: 9, group: 'FINANCE', label: 'Personal Ledger', route: 'ledger' },
      { order: 10, group: 'FINANCE', label: 'Revenue Share & Outlets', route: 'revenue-share' },
      { order: 11, group: 'PEOPLE', label: 'Attendance & Shifts', route: 'attendance' },
      { order: 12, group: 'PEOPLE', label: 'Employees', route: 'employees' },
      { order: 13, group: 'PEOPLE', label: 'Payroll', route: 'payroll' },
      { order: 14, group: 'COMMERCIAL', label: 'Menu & Pricing', route: 'owner-menu-pricing' },
      { order: 15, group: 'INSIGHTS', label: 'Reports', route: 'reports' },
      { order: 16, group: 'INSIGHTS', label: 'Export Centre', route: 'exports' },
      { order: 17, group: 'SYSTEM', label: 'Settings & Governance', route: 'settings' },
    ];

    expectedOrder.forEach((expected, idx) => {
      const actual = ownerItems[idx];
      assert.equal(actual.route, expected.route, `Owner item ${idx + 1} route mismatch: expected ${expected.route}, got ${actual.route}`);
      assert.equal(actual.label, expected.label, `Owner item ${idx + 1} label mismatch: expected ${expected.label}, got ${actual.label}`);
      assert.equal(actual.group, expected.group, `Owner item ${idx + 1} group mismatch: expected ${expected.group}, got ${actual.group}`);
    });
  });

  await t.test('NAV-003: 4 permanently locked first-level destinations exist in BOTH sidebars', () => {
    const lockedRoutes = ['ledger', 'revenue-share', 'reports', 'exports'];

    const pmRoutes = NAVIGATION.master.items.map((i) => i.route);
    const ownerRoutes = NAVIGATION.owner.items.map((i) => i.route);

    for (const r of lockedRoutes) {
      assert.ok(pmRoutes.includes(r), `Locked route #${r} must be in Primary Master first-level navigation`);
      assert.ok(ownerRoutes.includes(r), `Locked route #${r} must be in Owner first-level navigation`);
    }
  });

  await t.test('NAV-004: UI Components & Suite is absent from production sidebar', () => {
    for (const roleKey of Object.keys(NAVIGATION)) {
      const items = NAVIGATION[roleKey].items || [];
      const hasDesignSystem = items.some((i) => i.route === 'design-system' || i.id === 'design-system');
      assert.equal(hasDesignSystem, false, `UI Components & Suite must not be in ${roleKey} sidebar`);
    }
  });

  await t.test('NAV-005: Customers & Loyalty is removed from Primary Master first-level but remains allowed', () => {
    const pmRoutes = NAVIGATION.master.items.map((i) => i.route);
    assert.equal(pmRoutes.includes('customers'), false, 'Customers & Loyalty must NOT be first-level');

    // Route remains allowed for backward compatibility
    assert.equal(isRouteAllowed(ROLES.MASTER, 'customers', true), true, '#customers must remain allowed for Primary Master');
    assert.equal(isRouteAllowed(ROLES.MASTER, 'menu/customers', true), true, '#menu/customers must be allowed');
  });

  await t.test('NAV-006: Relocated Primary Master operational routes remain allowed via isRouteAllowed', () => {
    const relocatedRoutes = [
      'bills',
      'passbook',
      'dept-orders',
      'assets',
      'quality',
      'mailops',
      'system-health',
      'cafe-ops-devices',
      'trash',
    ];

    for (const r of relocatedRoutes) {
      assert.equal(isRouteAllowed(ROLES.MASTER, r, true), true, `Route #${r} must remain allowed for Primary Master`);
    }
  });

  await t.test('NAV-007: Relocated Owner strategic modules remain allowed via isRouteAllowed', () => {
    const ownerConsolidatedRoutes = [
      'owner-planning',
      'owner-complaints',
      'owner-food-safety',
      'owner-utilities',
      'owner-risk-audit',
      'owner-compliance',
      'owner-bcdr',
      'owner-privacy-cyber',
      'owner-master-data',
      'owner-governance',
      'owner-asset-reliability',
      'owner-academy',
      'owner-supplier-intelligence',
      'owner-customer-loyalty',
    ];

    for (const r of ownerConsolidatedRoutes) {
      assert.equal(isRouteAllowed(ROLES.OWNER, r, false), true, `Owner route #${r} must remain allowed`);
    }
  });

  await t.test('NAV-008: Export Centre authorization strictly isolates access to Primary Master and Owner', () => {
    // Primary Master: allowed
    assert.equal(isRouteAllowed(ROLES.MASTER, 'exports', true), true);
    assert.equal(isRouteAllowed(ROLES.MASTER, 'export-centre', true), true);

    // Owner: allowed
    assert.equal(isRouteAllowed(ROLES.OWNER, 'exports', false), true);
    assert.equal(isRouteAllowed(ROLES.OWNER, 'export-centre', false), true);

    // Non-primary master: denied
    assert.equal(isRouteAllowed(ROLES.MASTER, 'exports', false), false);

    // Staff: denied
    assert.equal(isRouteAllowed(ROLES.STAFF, 'exports', false), false);

    // Cafe Admin: denied
    assert.equal(isRouteAllowed(ROLES.CAFE_ADMIN, 'exports', false), false);

    // Vendor: denied
    assert.equal(isRouteAllowed(ROLES.VENDOR, 'exports', false), false);
  });

  await t.test('NAV-009: Normal Master remains permanently retired across system', () => {
    const forbiddenTokens = [
      ['MASTER', 'NORMAL'].join('_'),
      ['NORMAL', 'MASTER'].join('_'),
      ['master', 'normal'].join('_'),
    ];
    for (const token of forbiddenTokens) {
      assert.equal(token in ROLES, false, `No ${token} in ROLES`);
    }

    // Check that OPERATIONAL MASTER is absent from frontend source pages
    const frontendPagesDir = path.join(root, 'frontend/src/js/pages');
    const pageFiles = fs.readdirSync(frontendPagesDir).filter((f) => f.endsWith('.js'));
    for (const file of pageFiles) {
      const content = fs.readFileSync(path.join(frontendPagesDir, file), 'utf8');
      assert.equal(content.includes('OPERATIONAL MASTER'), false, `File ${file} must not contain OPERATIONAL MASTER`);
    }
  });

  await t.test('NAV-010: Export Centre frontend workspace is implemented with real categories & controls', () => {
    const exportFile = path.join(root, 'frontend/src/js/pages/exportCentre.js');
    assert.ok(fs.existsSync(exportFile), 'exportCentre.js must exist');

    const content = fs.readFileSync(exportFile, 'utf8');
    assert.ok(content.includes('export function renderExportCentre'), 'Must export renderExportCentre');
    assert.ok(content.includes('export async function wireExportCentre'), 'Must export wireExportCentre');

    // Check required 7 categories
    const categories = [
      'Sales & Revenue',
      'Finance & Tax',
      'Inventory & Stock',
      'Procurement',
      'Vendors',
      'Workforce & HR',
      'Commercial',
    ];
    categories.forEach((cat) => {
      assert.ok(content.includes(cat), `Export Centre must include category: ${cat}`);
    });

    // Check header and subtitle
    assert.ok(content.includes('Export Centre'), 'Header must contain Export Centre');
    assert.ok(content.includes('Generate and download authorized business records and statements.'), 'Subtitle match');
  });

  await t.test('NAV-011: Engineering badges and stage chips are removed from production views', () => {
    const checkFiles = [
      'inventory.js',
      'financeAccounts.js',
      'menuManagement.js',
      'procurement.js',
      'vendors.js',
      'trashBin.js',
      'ownerAcademy.js',
      'ownerAssetReliability.js',
      'ownerBcdr.js',
      'ownerComplaints.js',
      'ownerCompliance.js',
      'ownerCustomerLoyalty.js',
      'ownerFoodSafety.js',
      'ownerGovernanceDelegation.js',
      'ownerMasterData.js',
      'ownerMenuPricing.js',
      'ownerPlanning.js',
      'ownerPrivacyCyber.js',
      'ownerRiskAudit.js',
      'ownerSupplierIntelligence.js',
      'ownerUtilitiesWaste.js',
    ];

    for (const f of checkFiles) {
      const p = path.join(root, 'frontend/src/js/pages', f);
      const content = fs.readFileSync(p, 'utf8');
      assert.equal(content.includes('OWNER STRATEGIC EXPANSION'), false, `${f} must not contain OWNER STRATEGIC EXPANSION`);
    }
  });
});
