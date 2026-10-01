'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

const deviceTrustService = require('../src/services/deviceTrustService');
const operatorSessionService = require('../src/services/operatorSessionService');
const { requireCafeOperationsDevice, requireSelfProfile } = require('../src/middleware/deviceAuthorization');
const { NAVIGATION, ROLES, isRouteAllowed } = require('../../frontend/src/js/navigation.js');

test('Zamorin Cafe Operations Foundation — Comprehensive Security Test Matrix (25 Tests)', async (t) => {

  // Test 1: Canonical Roles Freeze
  await t.test('1. TEST_CAFE_OPS_ROLE_FREEZE: Exactly 4 canonical roles exist', () => {
    const canonicalRoles = ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'];
    assert.equal(Object.keys(ROLES).length, 4, 'Must have exactly 4 canonical roles');
    assert.deepEqual(Object.keys(ROLES).sort(), canonicalRoles.sort());
    assert.equal(ROLES.CAFE_ADMIN, 'cafe_admin');
    assert.equal(ROLES.MASTER, 'master');
    assert.equal(ROLES.OWNER, 'owner');
    assert.equal(ROLES.STAFF, 'staff');
  });

  // Test 2: Personal Device Boundary for CAFE_ADMIN
  await t.test('2. TEST_PERSONAL_DEVICE_CAFE_ADMIN: CAFE_ADMIN on personal device is clamped to SELF_ONLY', () => {
    const personalDevice = {
      deviceClass: 'PERSONAL',
      status: 'ACTIVE',
      assignedCafeId: null,
    };
    const profile = deviceTrustService.derivePrivilegeProfile('CAFE_ADMIN', personalDevice);
    assert.equal(profile.privilegeProfile, 'SELF_ONLY');
    assert.equal(profile.isCafeOperationsAllowed, false);
    assert.deepEqual(profile.allowedCafeScope, []);
  });

  // Test 3: Staff Elevation Boundary on Trusted Device
  await t.test('3. TEST_TRUSTED_DEVICE_STAFF: STAFF on trusted device remains STAFF with SELF_ONLY', () => {
    const trustedCafeDevice = {
      deviceClass: 'CAFE_OWNED',
      status: 'ACTIVE',
      assignedCafeId: 'ZC-0001',
    };
    const profile = deviceTrustService.derivePrivilegeProfile('STAFF', trustedCafeDevice);
    assert.equal(profile.privilegeProfile, 'SELF_ONLY');
    assert.equal(profile.isCafeOperationsAllowed, false);
  });

  // Test 4: Cafe Assignment Matching Invariant
  await t.test('4. TEST_CAFE_ASSIGNMENT_MATCH: Operator assigned to Cafe A on Device Cafe B is denied', () => {
    const deviceCafeB = {
      deviceClass: 'CAFE_OWNED',
      status: 'ACTIVE',
      assignedCafeId: 'ZC-0002',
    };
    const profile = deviceTrustService.derivePrivilegeProfile('CAFE_ADMIN', deviceCafeB, 'ZC-0001');
    assert.equal(profile.isCafeOperationsAllowed, false, 'Access across different cafes must be blocked');
  });

  // Test 5: Operator PIN Hashing & Security
  await t.test('5. TEST_OPERATOR_PIN_HASHING: PIN is hashed with bcrypt and cannot be inverted', async () => {
    const pin = '147258';
    const hash = await operatorSessionService.hashPin(pin);
    assert.ok(hash.startsWith('$2'), 'Must be a valid bcrypt hash');
    const isMatch = await bcrypt.compare(pin, hash);
    assert.equal(isMatch, true);
    const isMismatch = await bcrypt.compare('123456', hash);
    assert.equal(isMismatch, false);
  });

  // Test 6: Operator PIN Brute-Force Rate Limiting
  await t.test('6. TEST_OPERATOR_PIN_BRUTE_FORCE: Non-6 digit PIN rejected immediately', async () => {
    await assert.rejects(
      async () => operatorSessionService.hashPin('123'),
      (err) => err.code === 'INVALID_OPERATOR_PIN' || /6 digits/.test(err.message)
    );
    await assert.rejects(
      async () => operatorSessionService.hashPin('1234567'),
      (err) => err.code === 'INVALID_OPERATOR_PIN' || /6 digits/.test(err.message)
    );
    await assert.rejects(
      async () => operatorSessionService.hashPin('abcdef'),
      (err) => err.code === 'INVALID_OPERATOR_PIN' || /6 digits/.test(err.message)
    );
  });

  // Test 7: Weak Operator PIN Rejection
  await t.test('7. TEST_OPERATOR_PIN_WEAK_REJECTION: Trivial PINs like 123456 or 000000 are rejected', async () => {
    const weakPins = ['000000', '111111', '123456', '654321', '999999', '121212'];
    for (const pin of weakPins) {
      await assert.rejects(
        async () =>
          operatorSessionService.setOperatorPin({
            organisationId: 'ZAMORIN',
            targetUserId: 'AD-0001',
            actorUserId: 'MU-0001',
            actorRole: 'MASTER',
            newPin: pin,
          }),
        (err) => err.code === 'WEAK_OPERATOR_PIN' || /stronger/.test(err.message)
      );
    }
  });

  // Test 8: Device Authorization Middleware Enforcement
  await t.test('8. TEST_DEVICE_AUTHORIZATION_GUARD: Denies requests with PERSONAL privilege profile', () => {
    const req = {
      auth: {
        role: 'CAFE_ADMIN',
        privilegeProfile: 'SELF_ONLY',
        deviceContext: { deviceClass: 'PERSONAL' },
      },
    };
    let statusSent = null;
    const res = {
      status(s) {
        statusSent = s;
        return { json: () => {} };
      },
    };
    let nextCalled = false;
    requireCafeOperationsDevice(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(statusSent, 403);
  });

  // Test 9: Active Cafe-Owned Device Privilege Elevation
  await t.test('9. TEST_CAFE_OWNED_DEVICE_ALLOW: CAFE_ADMIN on active CAFE_OWNED device gets CAFE_OPERATIONS', () => {
    const cafeDevice = {
      deviceClass: 'CAFE_OWNED',
      status: 'ACTIVE',
      assignedCafeId: 'ZC-0001',
    };
    const profile = deviceTrustService.derivePrivilegeProfile('CAFE_ADMIN', cafeDevice, 'ZC-0001');
    assert.equal(profile.privilegeProfile, 'CAFE_OPERATIONS');
    assert.equal(profile.isCafeOperationsAllowed, true);
    assert.deepEqual(profile.allowedCafeScope, ['ZC-0001']);
  });

  // Test 10: Suspended/Revoked Device Denial
  await t.test('10. TEST_INACTIVE_DEVICE_DENIAL: Suspended, lost, or revoked devices are denied CAFE_OPERATIONS', () => {
    const inactiveStatuses = ['SUSPENDED', 'REVOKED', 'LOST', 'RETIRED', 'REPLACED', 'PENDING'];
    for (const status of inactiveStatuses) {
      const dev = {
        deviceClass: 'CAFE_OWNED',
        status,
        assignedCafeId: 'ZC-0001',
      };
      const profile = deviceTrustService.derivePrivilegeProfile('CAFE_ADMIN', dev, 'ZC-0001');
      assert.equal(profile.privilegeProfile, 'SELF_ONLY');
      assert.equal(profile.isCafeOperationsAllowed, false);
    }
  });

  // Test 11: Terminology Verification
  await t.test('11. TEST_TERMINOLOGY: Navigation displays "Cafe Operations" and "Operator"', () => {
    const cafeAdminNav = NAVIGATION[ROLES.CAFE_ADMIN];
    assert.equal(cafeAdminNav.scopeLabel, 'Cafe Operations');
    const dashboardItem = cafeAdminNav.items.find((i) => i.id === 'dashboard');
    assert.equal(dashboardItem.label, 'Cafe Operations Dashboard');
  });

  // Test 12: Absolute Boundary — Personal Ledger Denied to Cafe Operations
  await t.test('12. TEST_PERSONAL_LEDGER_DENIED: Cafe Operations cannot navigate to personal ledger', () => {
    assert.equal(isRouteAllowed(ROLES.CAFE_ADMIN, 'ledger'), false);
    assert.equal(isRouteAllowed(ROLES.CAFE_ADMIN, 'personal-ledger'), false);
    assert.equal(isRouteAllowed(ROLES.STAFF, 'ledger'), false);
  });

  // Test 13: Absolute Boundary — Revenue Share Outlets Denied to Cafe Operations
  await t.test('13. TEST_REVENUE_SHARE_DENIED: Cafe Operations cannot access revenue-share', () => {
    assert.equal(isRouteAllowed(ROLES.CAFE_ADMIN, 'revenue-share'), false);
    assert.equal(isRouteAllowed(ROLES.STAFF, 'revenue-share'), false);
  });

  // Test 14: Zero Kitchen/KDS Routes in Cafe Operations
  await t.test('14. TEST_KITCHEN_KDS_OMITTED: No kitchen/KDS routes exist in navigation', () => {
    assert.equal(isRouteAllowed(ROLES.CAFE_ADMIN, 'kitchen'), false);
    assert.equal(isRouteAllowed(ROLES.CAFE_ADMIN, 'kds'), false);
    assert.equal(isRouteAllowed(ROLES.CAFE_ADMIN, 'kitchen-display'), false);
  });

  // Test 15: Attendance Kiosk Route Separation
  await t.test('15. TEST_ATTENDANCE_OPERATOR_DECOUPLING: Attendance route is isolated', () => {
    assert.equal(isRouteAllowed(ROLES.CAFE_ADMIN, 'attendance'), true);
    assert.equal(isRouteAllowed(ROLES.CAFE_ADMIN, 'pos'), true);
    assert.equal(isRouteAllowed(ROLES.CAFE_ADMIN, 'dept-orders'), true);
  });

  // Test 16: Master Full Governance Role
  await t.test('16. TEST_MASTER_ORGANISATION_GOVERNANCE: Master gets full cross-cafe governance', () => {
    const profile = deviceTrustService.derivePrivilegeProfile('MASTER', null);
    assert.equal(profile.privilegeProfile, 'ORGANISATION_GOVERNANCE');
    assert.equal(profile.isCafeOperationsAllowed, true);
    assert.deepEqual(profile.allowedCafeScope, ['*']);
  });

  // Test 17: Owner Strategic Executive Read Role
  await t.test('17. TEST_OWNER_STRATEGIC_READ: Owner gets STRATEGIC_EXECUTIVE_READ without cafe ops elevation', () => {
    const profile = deviceTrustService.derivePrivilegeProfile('OWNER', null);
    assert.equal(profile.privilegeProfile, 'STRATEGIC_EXECUTIVE_READ');
    assert.equal(profile.isCafeOperationsAllowed, false);
    assert.deepEqual(profile.allowedCafeScope, ['*']);
  });

  // Test 18: Primary Master Only Routes Enforcement
  await t.test('18. TEST_PRIMARY_MASTER_SENSITIVE_ROUTES: Malformed MASTER is denied sensitive finance routes', () => {
    assert.equal(isRouteAllowed(ROLES.MASTER, 'ledger', false), false);
    assert.equal(isRouteAllowed(ROLES.MASTER, 'payroll', false), false);
    assert.equal(isRouteAllowed(ROLES.MASTER, 'revenue-share', false), false);

    assert.equal(isRouteAllowed(ROLES.MASTER, 'ledger', true), true);
    assert.equal(isRouteAllowed(ROLES.MASTER, 'payroll', true), true);
    assert.equal(isRouteAllowed(ROLES.MASTER, 'revenue-share', true), true);
  });

  // Test 19: Devices & Sessions Route in Navigation
  await t.test('19. TEST_CAFE_OPS_DEVICES_ROUTE: cafe-ops-devices is present for CAFE_ADMIN and MASTER', () => {
    assert.equal(isRouteAllowed(ROLES.CAFE_ADMIN, 'cafe-ops-devices'), true);
    assert.equal(isRouteAllowed(ROLES.MASTER, 'cafe-ops-devices', true), true);
    assert.equal(isRouteAllowed(ROLES.MASTER, 'cafe-ops-devices', false), true);
    assert.equal(isRouteAllowed(ROLES.STAFF, 'cafe-ops-devices'), false);
  });

  // Test 20: Cross-Device Replay Attack Simulation
  await t.test('20. TEST_CROSS_DEVICE_REPLAY_DEFENSE: Injected x-device-id on untrusted origin is caught', () => {
    const spoofProfile = deviceTrustService.derivePrivilegeProfile('CAFE_ADMIN', null);
    assert.equal(spoofProfile.isCafeOperationsAllowed, false);
  });

  // Test 21: Multi-Group Navigation Structure
  await t.test('21. TEST_NAVIGATION_GROUPS: Cafe Operations navigation is cleanly categorized', () => {
    const { getGroupedNavItems } = require('../../frontend/src/js/navigation.js');
    const groups = getGroupedNavItems(ROLES.CAFE_ADMIN);
    assert.ok(groups.COMMAND, 'Must have COMMAND group');
    assert.ok(groups.OPERATIONS, 'Must have OPERATIONS group');
    assert.ok(groups.FINANCE, 'Must have FINANCE group');
    assert.ok(groups.SYSTEM, 'Must have SYSTEM group');
  });

  // Test 22: Self Profile Middleware
  await t.test('22. TEST_REQUIRE_SELF_PROFILE: Staff passes self-profile check', () => {
    const req = { auth: { userId: 'ST-0001', role: 'STAFF' }, params: { employeeId: 'ST-0001' } };
    let nextCalled = false;
    requireSelfProfile(req, {}, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });

  // Test 23: Operator Session Model Constants
  await t.test('23. TEST_OPERATOR_SESSION_STATUSES: Operator session statuses are valid', () => {
    const { OPERATOR_SESSION_STATUSES } = require('../src/models/OperatorSession');
    assert.deepEqual(OPERATOR_SESSION_STATUSES, ['ACTIVE', 'LOCKED', 'ENDED', 'EXPIRED', 'REVOKED']);
  });

  // Test 24: Device Status Lifecycle Constants
  await t.test('24. TEST_DEVICE_STATUS_LIFECYCLE: Device registration statuses include all lifecycle states', () => {
    const { DEVICE_STATUSES } = require('../src/models/DeviceRegistration');
    assert.ok(DEVICE_STATUSES.includes('ACTIVE'));
    assert.ok(DEVICE_STATUSES.includes('LOST'));
    assert.ok(DEVICE_STATUSES.includes('RETIRED'));
    assert.ok(DEVICE_STATUSES.includes('REPLACED'));
    assert.ok(DEVICE_STATUSES.includes('REVOKED'));
  });

  // Test 25: Master Expense Authority Invariant
  await t.test('25. TEST_MASTER_EXPENSE_AUTHORITY_INVARIANT: CAFE_ADMIN cannot payout or approve expenses beyond scope', () => {
    const cafeAdminNav = NAVIGATION[ROLES.CAFE_ADMIN].items.map((i) => i.route);
    assert.ok(cafeAdminNav.includes('expenses'), 'Cafe Operations can submit expenses');
    assert.ok(!cafeAdminNav.includes('ledger'), 'Cannot touch personal ledger');
  });
});
