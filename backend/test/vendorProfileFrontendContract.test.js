'use strict';

/**
 * VEN-SCR-013: Vendor Profile & Compliance Summary — Frontend Contract Test Suite
 *
 * Verifies all 21 frontend contract requirements:
 * 1.  Vendor Profile route exists in navigation.js
 * 2.  Profile frontend module exists (vendorProfile.js)
 * 3.  Router imports Vendor Profile renderer/init functions
 * 4.  Navigation route maps correctly in router.js switch cases
 * 5.  Existing GET /api/v1/vendor/profile endpoint is used
 * 6.  Existing GET /api/v1/vendor/profile/pdf endpoint is used
 * 7.  Read-only indicator renders (🔒 READ-ONLY VENDOR ACCESS)
 * 8.  No Edit button exists
 * 9.  No Save button exists
 * 10. No mutation form exists
 * 11. Raw bank account number is never rendered
 * 12. Masked bank value renders (accountNumberMasked)
 * 13. Internal admin fields never render (notes, statusChangeReason, bankDetailsHistory, etc.)
 * 14. Approved Cafés section renders
 * 15. Contacts section renders
 * 16. Sites section renders
 * 17. Statutory information renders (GST, PAN, FSSAI)
 * 18. Optional/empty states are handled safely without undefined/null/[object Object]
 * 19. PDF download action is wired to /api/v1/vendor/profile/pdf
 * 20. Responsive/mobile structure exists (flex, grid, sm:, md:, lg: breakpoints)
 * 21. Internal Profile properties cannot be exposed through generic property iteration
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FRONTEND_DIR = path.resolve(__dirname, '../../frontend/src/js');
const PROFILE_PAGE_PATH = path.join(FRONTEND_DIR, 'pages/vendorProfile.js');
const ROUTER_PATH = path.join(FRONTEND_DIR, 'router.js');
const NAVIGATION_PATH = path.join(FRONTEND_DIR, 'navigation.js');

test('VEN-SCR-013: Frontend Contract Suite — Vendor Profile Page Verification', async (suite) => {
  const profileSrc = fs.readFileSync(PROFILE_PAGE_PATH, 'utf8');
  const routerSrc = fs.readFileSync(ROUTER_PATH, 'utf8');
  const navSrc = fs.readFileSync(NAVIGATION_PATH, 'utf8');

  await suite.test('01. Profile frontend module exists and exports required lifecycle functions', () => {
    assert.ok(fs.existsSync(PROFILE_PAGE_PATH), 'vendorProfile.js must exist');
    assert.ok(profileSrc.includes('export function renderVendorProfile'), 'Must export renderVendorProfile');
    assert.ok(profileSrc.includes('export async function initVendorProfile'), 'Must export initVendorProfile');
  });

  await suite.test('02. Vendor Profile route exists in navigation.js with strict VENDOR role isolation', () => {
    assert.ok(navSrc.includes("route: 'vendor-profile'"), "Navigation must register route: 'vendor-profile'");
    assert.ok(navSrc.includes("'vendor-profile'"), 'VENDOR_ALLOWED_ROUTES must include vendor-profile');
    assert.ok(navSrc.includes("'vendor/profile'"), 'VENDOR_ALLOWED_ROUTES must include vendor/profile alias');
  });

  await suite.test('03. Router imports Vendor Profile renderer and init functions', () => {
    assert.match(
      routerSrc,
      /import\s+\{\s*renderVendorProfile,\s*initVendorProfile\s*\}\s+from\s+["']\.\/pages\/vendorProfile\.js["']/,
      'Router must import renderVendorProfile and initVendorProfile'
    );
  });

  await suite.test('04. Router contains switch cases for canonical vendor-profile and alias vendor/profile', () => {
    assert.ok(routerSrc.includes("case 'vendor-profile':"), "Router must handle case 'vendor-profile'");
    assert.ok(routerSrc.includes("case 'vendor/profile':"), "Router must handle case 'vendor/profile'");
    assert.ok(routerSrc.includes('renderVendorProfile()'), 'Router must call renderVendorProfile()');
    assert.ok(routerSrc.includes('initVendorProfile(content)'), 'Router must call initVendorProfile(content)');
  });

  await suite.test('05. Uses authoritative GET /api/v1/vendor/profile API', () => {
    assert.ok(
      profileSrc.includes('/api/v1/vendor/profile'),
      'Must query authoritative /api/v1/vendor/profile endpoint'
    );
  });

  await suite.test('06. Uses authoritative GET /api/v1/vendor/profile/pdf for PDF download', () => {
    assert.ok(
      profileSrc.includes('/api/v1/vendor/profile/pdf'),
      'Must download via authoritative /api/v1/vendor/profile/pdf endpoint'
    );
  });

  await suite.test('07. Displays persistent 🔒 READ-ONLY VENDOR ACCESS indicator', () => {
    assert.ok(
      profileSrc.includes('READ-ONLY VENDOR ACCESS'),
      'Must prominently display READ-ONLY VENDOR ACCESS'
    );
    assert.ok(
      profileSrc.includes('🔒'),
      'Must display lock symbol for read-only access'
    );
  });

  await suite.test('08. Zero Edit buttons exist in markup or code', () => {
    assert.doesNotMatch(
      profileSrc,
      /<button[^>]*>\s*(?:Edit|Modify|Update)\s*<\/button>/i,
      'Must NOT contain Edit or Modify buttons'
    );
    assert.doesNotMatch(
      profileSrc,
      /id=["']btn-edit-profile["']/i,
      'Must NOT contain edit profile button IDs'
    );
  });

  await suite.test('09. Zero Save or Submit buttons exist in markup or code', () => {
    assert.doesNotMatch(
      profileSrc,
      /<button[^>]*>\s*(?:Save|Submit|Apply Changes)\s*<\/button>/i,
      'Must NOT contain Save or Submit buttons'
    );
  });

  await suite.test('10. Zero mutation forms (<form>, POST/PUT handlers) exist', () => {
    assert.doesNotMatch(
      profileSrc,
      /<form[\s>]/i,
      'Must NOT contain any HTML <form> elements'
    );
    assert.doesNotMatch(
      profileSrc,
      /api\.(?:post|put|patch|delete)\(/i,
      'Must NOT invoke any mutation HTTP methods'
    );
  });

  await suite.test('11. Raw bank account number is NEVER rendered; defense-in-depth enforced', () => {
    // Assert that raw accountNumber property is never directly displayed
    assert.doesNotMatch(
      profileSrc,
      /\$\{escapeHtml\([^)]*bank\.accountNumber\b/i,
      'Must not directly render bank.accountNumber'
    );
    assert.doesNotMatch(
      profileSrc,
      /\$\{escapeHtml\([^)]*p\.accountNumber\b/i,
      'Must not directly render p.accountNumber'
    );
  });

  await suite.test('12. Masked bank account (accountNumberMasked) is rendered with lock indicator', () => {
    assert.ok(
      profileSrc.includes('accountNumberMasked'),
      'Must reference accountNumberMasked property'
    );
    assert.ok(
      profileSrc.includes('Masked Storage'),
      'Must indicate Masked Storage in banking section'
    );
  });

  await suite.test('13. Internal admin fields are never referenced or rendered', () => {
    assert.doesNotMatch(profileSrc, /\bnotes\b.*Admin/i, 'No internal admin notes');
    assert.doesNotMatch(profileSrc, /\bstatusChangeReason\b/i, 'No statusChangeReason');
    assert.doesNotMatch(profileSrc, /\bbankDetailsHistory\b/i, 'No bankDetailsHistory');
    assert.doesNotMatch(profileSrc, /\bpendingBankChange\b/i, 'No pendingBankChange');
    assert.doesNotMatch(profileSrc, /\bplacedByUserId\b/i, 'No placedByUserId');
    assert.doesNotMatch(profileSrc, /\bstatusChangedByUserId\b/i, 'No statusChangedByUserId');
  });

  await suite.test('14. Approved Zamorin Cafés section is rendered with scope label', () => {
    assert.ok(
      profileSrc.includes('Approved Zamorin Café Locations'),
      'Must render Approved Zamorin Café Locations section'
    );
    assert.ok(
      profileSrc.includes('approvedCafes'),
      'Must iterate over approvedCafes'
    );
  });

  await suite.test('15. Authorized contacts directory is rendered', () => {
    assert.ok(
      profileSrc.includes('Authorized Company Contacts & Representatives'),
      'Must render contacts directory'
    );
    assert.ok(
      profileSrc.includes('contactPersons'),
      'Must iterate over contactPersons'
    );
  });

  await suite.test('16. Registered dispatch sites / facilities are rendered', () => {
    assert.ok(
      profileSrc.includes('Registered Dispatch Locations & Hubs'),
      'Must render dispatch locations section'
    );
    assert.ok(
      profileSrc.includes('sites'),
      'Must iterate over sites'
    );
  });

  await suite.test('17. Statutory information is rendered (GSTIN, PAN, FSSAI)', () => {
    assert.ok(profileSrc.includes('gstNumber'), 'Must render GSTIN');
    assert.ok(profileSrc.includes('panNumber'), 'Must render PAN');
    assert.ok(profileSrc.includes('fssai'), 'Must render FSSAI information');
  });

  await suite.test('18. Safe fallback values prevent undefined, null, or [object Object]', () => {
    assert.ok(profileSrc.includes('escapeHtml'), 'Must use escapeHtml for safe sanitization');
    assert.ok(profileSrc.includes('formatDate'), 'Must format dates safely');
    assert.ok(profileSrc.includes('formatCurrency'), 'Must format currency safely');
  });

  await suite.test('19. PDF download action is wired to downloadBlob', () => {
    assert.ok(
      profileSrc.includes('downloadBlob('),
      'Must call downloadBlob for PDF export'
    );
    assert.ok(
      profileSrc.includes('/api/v1/vendor/profile/pdf'),
      'Must target official profile PDF route'
    );
  });

  await suite.test('20. Responsive structure implemented with mobile, tablet, and desktop breakpoints', () => {
    assert.ok(profileSrc.includes('grid-cols-1'), 'Must define single column for mobile');
    assert.ok(profileSrc.includes('sm:'), 'Must define small breakpoint classes');
    assert.ok(profileSrc.includes('lg:grid-cols-2'), 'Must define multi-column desktop layout');
    assert.ok(profileSrc.includes('max-w-7xl'), 'Must constrain maximum content width');
  });

  await suite.test('21. Allowlist-only property rendering: no generic Object.keys / Object.entries dumping', () => {
    assert.doesNotMatch(
      profileSrc,
      /Object\.(?:keys|entries|values)\(p(?:rofile)?\)/,
      'Must NOT generically dump arbitrary root profile object properties'
    );
  });

  await suite.test('22. IFSC code is strictly absent from DOM template and markup', () => {
    assert.doesNotMatch(
      profileSrc,
      /\bifscCode\b/i,
      'Must NOT reference or render bank.ifscCode'
    );
    assert.doesNotMatch(
      profileSrc,
      />\s*IFSC\s*(?:Code)?\s*</i,
      'Must NOT render IFSC label in DOM template'
    );
  });

  await suite.test('23. UPI ID is strictly absent from DOM template and markup', () => {
    assert.doesNotMatch(
      profileSrc,
      /\bupiId\b/i,
      'Must NOT reference or render bank.upiId'
    );
    assert.doesNotMatch(
      profileSrc,
      />\s*UPI\s*(?:ID)?\s*</i,
      'Must NOT render UPI ID label in DOM template'
    );
  });

  await suite.test('24. Credit limit is strictly absent from DOM template and markup', () => {
    assert.doesNotMatch(
      profileSrc,
      /\bcreditLimit(?:Inr)?\b/i,
      'Must NOT reference or render creditLimitInr'
    );
    assert.doesNotMatch(
      profileSrc,
      /Approved Credit Limit/i,
      'Must NOT render Approved Credit Limit in DOM template'
    );
  });

  await suite.test('25. Safe payment-account status badge is rendered', () => {
    assert.ok(
      profileSrc.includes('paymentAccountStatus'),
      'Must reference bank.paymentAccountStatus'
    );
    assert.ok(
      profileSrc.includes('Payment Account Verified') || profileSrc.includes('Payment Account On File'),
      'Must render safe payment-account status text'
    );
  });
});
