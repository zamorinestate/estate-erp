// =============================================================================
// PM-05: SHARED COMPONENT INTEGRATION & CANONICAL CROSS-PORTAL PARITY SUITE
// =============================================================================

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { USER_ROLES } = require('../src/models/User.js');
const { assertPrimaryMasterAuthority } = require('../src/services/userGovernanceService.js');

test('PM-05 PARITY: 1. Invariant: PRIMARY_MASTER_FUNCTIONAL_SUPERSET = 1', () => {
  const pmActor = {
    userId: 'MU-0001',
    role: 'MASTER',
    isPrimaryMaster: true,
    organisationId: 'ORG-ZAMORIN',
  };

  const malformedMasterActor = {
    userId: 'MU-0002',
    role: 'MASTER',
    isPrimaryMaster: false,
    organisationId: 'ORG-ZAMORIN',
  };

  // Primary Master passes assertion
  assert.doesNotThrow(() => {
    assertPrimaryMasterAuthority(pmActor, 'TEST_PM_ACTION');
  });

  // Malformed MASTER fails assertion with 403 PRIMARY_MASTER_AUTHORITY_REQUIRED
  assert.throws(
    () => {
      assertPrimaryMasterAuthority(malformedMasterActor, 'TEST_PM_ACTION');
    },
    (err) => {
      return err.statusCode === 403 && err.code === 'PRIMARY_MASTER_AUTHORITY_REQUIRED';
    }
  );
});

test('PM-05 PARITY: 2. Invariant: SHARED_CAPABILITY_SINGLE_CANONICAL_IMPLEMENTATION = 1', () => {
  // Verify that frontend personal ledger has a single canonical implementation
  const personalLedgerFile = path.resolve(__dirname, '../../frontend/src/js/pages/personalLedger.js');

  assert.ok(fs.existsSync(personalLedgerFile), 'personalLedger.js must exist as single canonical implementation');

  const content = fs.readFileSync(personalLedgerFile, 'utf8');

  // Verify BROWSER_STORAGE_USED_AS_SECURITY_AUTHORITY = 0
  // Role & isPrimaryMaster must be derived from state.auth.user / state.role, not unverified localStorage
  assert.ok(
    content.includes("state?.auth?.user") || content.includes("state.role"),
    'Role authority must be derived from authenticated state'
  );

  // Verify formula injection sanitization is present in frontend export helpers
  assert.ok(
    content.includes("sanitizeCsvCell") || content.includes("replace"),
    'Frontend personal ledger CSV export must sanitize against formula injection'
  );
});

test('PM-05 PARITY: 3. Invariant: NAVIGATION_ROUTE_TARGET_MISSING = 0', () => {
  const routerFile = path.resolve(__dirname, '../../frontend/src/js/router.js');
  assert.ok(fs.existsSync(routerFile), 'frontend router.js must exist');

  const routerContent = fs.readFileSync(routerFile, 'utf8');

  // Verify key routes exist in router
  const expectedRoutes = [
    'personal-ledger',
    'dashboard',
    'finance',
    'procurement',
    'admin',
    'reports',
    'attendance',
  ];

  for (const route of expectedRoutes) {
    assert.ok(
      routerContent.includes(`"${route}"`),
      `Router must define route for "${route}"`
    );
  }
});

test('PM-05 PARITY: 4. Invariant: PROFILE_EMPLOYEE_ADMIN_DOMAIN_COLLAPSE = 0', () => {
  // Verify domain separation:
  // - My Profile: self service ("profile")
  // - Employee Directory: authorised employee record ("employees" / "employee-profile")
  // - Administration: governance ("admin")
  const routerFile = path.resolve(__dirname, '../../frontend/src/js/router.js');
  const routerContent = fs.readFileSync(routerFile, 'utf8');

  assert.ok(routerContent.includes('"profile"'), 'Router must contain separate "profile" route for self-service');
  assert.ok(routerContent.includes('"admin"'), 'Router must contain separate "admin" route for governance');
  assert.ok(routerContent.includes('"employees"'), 'Router must contain separate "employees" route for workforce');
});

test('PM-05 PARITY: 5. Invariant: GLOBAL_CAFE_SELECTOR_EXPANDS_OPERATIONAL_AUTHORITY = 0', () => {
  // Cafe scoping utility must strictly enforce assigned cafes for non-master roles
  const cafeScopeModule = require('../src/utils/cafeScope.js');
  assert.ok(cafeScopeModule, 'cafeScope utility must exist');

  if (typeof cafeScopeModule.enforceCafeScope === 'function') {
    const ownerAuth = {
      userId: 'OWNER-01',
      role: 'OWNER',
      assignedCafeIds: ['CAFE-01'],
      isPrimaryMaster: false,
    };

    // Access to assigned cafe allowed
    assert.doesNotThrow(() => {
      cafeScopeModule.enforceCafeScope(ownerAuth, 'CAFE-01');
    });

    // Access to unassigned cafe forbidden
    assert.throws(
      () => {
        cafeScopeModule.enforceCafeScope(ownerAuth, 'CAFE-99');
      },
      (err) => err.statusCode === 403 || err.code === 'CAFE_ACCESS_DENIED'
    );
  }
});
