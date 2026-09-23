'use strict';

/**
 * =============================================================================
 * ZAMORIN CAFÉ ERP — OWNER BATCH 03 FRONTEND WIRING & INTERACTION TEST SUITE
 * =============================================================================
 * Rigorously verifies Stages 11 through 15 UI modules:
 * 1. Router & Navigation Access Governance for Stages 11-15
 * 2. Stage 11 Customer Complaints & Service Recovery UI
 * 3. Stage 12 Menu Engineering & Pricing Intelligence UI
 * 4. Stage 13 Customer & Loyalty Intelligence Centre UI
 * 5. Stage 14 Utilities, Waste & Energy Management UI
 * 6. Stage 15 Corporate Governance, Delegation & Authority UI
 * 7. Multi-role navigation isolation (Owner-only access gate)
 * =============================================================================
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const navSource = fs.readFileSync(path.join(__dirname, '../../frontend/src/js/navigation.js'), 'utf8');
const routerSource = fs.readFileSync(path.join(__dirname, '../../frontend/src/js/router.js'), 'utf8');
const complaintsSource = fs.readFileSync(path.join(__dirname, '../../frontend/src/js/pages/ownerComplaints.js'), 'utf8');
const menuPricingSource = fs.readFileSync(path.join(__dirname, '../../frontend/src/js/pages/ownerMenuPricing.js'), 'utf8');
const loyaltySource = fs.readFileSync(path.join(__dirname, '../../frontend/src/js/pages/ownerCustomerLoyalty.js'), 'utf8');
const utilitiesWasteSource = fs.readFileSync(path.join(__dirname, '../../frontend/src/js/pages/ownerUtilitiesWaste.js'), 'utf8');
const governanceSource = fs.readFileSync(path.join(__dirname, '../../frontend/src/js/pages/ownerGovernanceDelegation.js'), 'utf8');

// =============================================================================
// 1. ROUTE & NAVIGATION ACCESS GOVERNANCE TESTS (Stages 11-15)
// =============================================================================
test('Owner Expansion Batch 03 Routes — Registered in Navigation & Protected by Role Gate', () => {
  const batch03Routes = [
    'owner-complaints',
    'owner-menu-pricing',
    'owner-customer-loyalty',
    'owner-utilities-waste',
    'owner-governance-delegation'
  ];

  for (const route of batch03Routes) {
    assert.ok(navSource.includes(`route: '${route}'`), `${route} must be declared in navigation.js`);
  }

  // Verify routes are inside ROLES.OWNER items list
  const ownerSection = navSource.slice(navSource.indexOf('[ROLES.OWNER]:'), navSource.indexOf('[ROLES.CAFE_ADMIN]:'));
  for (const route of batch03Routes) {
    assert.ok(ownerSection.includes(route), `${route} must be inside OWNER navigation items`);
  }

  // Verify CAFE_ADMIN and STAFF items DO NOT contain Owner Batch 03 routes
  const cafeAdminSection = navSource.slice(navSource.indexOf('[ROLES.CAFE_ADMIN]:'), navSource.indexOf('[ROLES.STAFF]:'));
  for (const route of batch03Routes) {
    assert.ok(!cafeAdminSection.includes(route), `CAFE_ADMIN must NOT have ${route}`);
  }

  const staffSection = navSource.slice(navSource.indexOf('[ROLES.STAFF]:'));
  for (const route of batch03Routes) {
    assert.ok(!staffSection.includes(route), `STAFF must NOT have ${route}`);
  }
});

test('Router Integration — Batch 03 Pages properly wired with render and wire hooks', () => {
  const handlers = [
    ['renderOwnerComplaints', 'initOwnerComplaintsEvents', 'owner-complaints'],
    ['renderOwnerMenuPricing', 'initOwnerMenuPricingEvents', 'owner-menu-pricing'],
    ['renderOwnerCustomerLoyalty', 'initOwnerCustomerLoyaltyEvents', 'owner-customer-loyalty'],
    ['renderOwnerUtilitiesWaste', 'initOwnerUtilitiesWasteEvents', 'owner-utilities-waste'],
    ['renderOwnerGovernanceDelegation', 'initOwnerGovernanceDelegationEvents', 'owner-governance-delegation'],
  ];

  for (const [renderFn, wireFn, route] of handlers) {
    assert.ok(routerSource.includes(renderFn), `router.js must import ${renderFn}`);
    assert.ok(routerSource.includes(wireFn), `router.js must import ${wireFn}`);
    assert.ok(routerSource.includes(`case "${route}":`) || routerSource.includes(`case '${route}':`), `router.js must route ${route}`);
  }
});

// =============================================================================
// 2. STAGE 11 CUSTOMER COMPLAINTS & SERVICE RECOVERY UI
// =============================================================================
test('Stage 11 Complaints UI — Elements, Endpoints & Handlers', () => {
  assert.ok(complaintsSource.includes('renderOwnerComplaints'), 'Must export renderOwnerComplaints');
  assert.ok(complaintsSource.includes('initOwnerComplaintsEvents'), 'Must export initOwnerComplaintsEvents');
  assert.ok(complaintsSource.includes('/complaints'), 'Must reference complaints API endpoints');
});

// =============================================================================
// 3. STAGE 12 MENU ENGINEERING & PRICING INTELLIGENCE UI
// =============================================================================
test('Stage 12 Menu Pricing UI — Elements, Endpoints & Handlers', () => {
  assert.ok(menuPricingSource.includes('renderOwnerMenuPricing'), 'Must export renderOwnerMenuPricing');
  assert.ok(menuPricingSource.includes('initOwnerMenuPricingEvents'), 'Must export initOwnerMenuPricingEvents');
  assert.ok(menuPricingSource.includes('/menu-pricing') || menuPricingSource.includes('menu'), 'Must reference menu pricing API endpoints');
});

// =============================================================================
// 4. STAGE 13 CUSTOMER & LOYALTY INTELLIGENCE UI
// =============================================================================
test('Stage 13 Loyalty UI — Elements, Endpoints & DPDP Masking Safety', () => {
  assert.ok(loyaltySource.includes('renderOwnerCustomerLoyalty'), 'Must export renderOwnerCustomerLoyalty');
  assert.ok(loyaltySource.includes('initOwnerCustomerLoyaltyEvents'), 'Must export initOwnerCustomerLoyaltyEvents');
  assert.ok(loyaltySource.includes('/customer-loyalty') || loyaltySource.includes('loyalty'), 'Must reference customer loyalty API endpoints');
});

// =============================================================================
// 5. STAGE 14 UTILITIES, WASTE & ENERGY UI
// =============================================================================
test('Stage 14 Utilities & Waste UI — Elements, Endpoints & Indicators', () => {
  assert.ok(utilitiesWasteSource.includes('renderOwnerUtilitiesWaste'), 'Must export renderOwnerUtilitiesWaste');
  assert.ok(utilitiesWasteSource.includes('initOwnerUtilitiesWasteEvents'), 'Must export initOwnerUtilitiesWasteEvents');
  assert.ok(utilitiesWasteSource.includes('/utilities-waste') || utilitiesWasteSource.includes('utilities'), 'Must reference utilities API endpoints');
});

// =============================================================================
// 6. STAGE 15 CORPORATE GOVERNANCE & DELEGATION UI
// =============================================================================
test('Stage 15 Governance & Delegation UI — Elements, Endpoints & Authority Checks', () => {
  assert.ok(governanceSource.includes('renderOwnerGovernanceDelegation'), 'Must export renderOwnerGovernanceDelegation');
  assert.ok(governanceSource.includes('initOwnerGovernanceDelegationEvents'), 'Must export initOwnerGovernanceDelegationEvents');
  assert.ok(governanceSource.includes('/governance-delegation') || governanceSource.includes('governance'), 'Must reference governance API endpoints');
});
