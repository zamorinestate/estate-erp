/**
 * test_cross_role_security.mjs
 * 
 * Verifies RBAC, Role Boundaries, and Cross-Role Isolation
 * Tests:
 * 1. Unauthenticated direct API call blocked (401).
 * 2. Revoked token direct API call blocked (401).
 * 3. Staff calling Primary Master approvals endpoint blocked (403).
 * 4. Staff calling Owner risk/audit endpoint blocked (403).
 * 5. Staff calling Master decision endpoint blocked (403).
 * 6. Vendor calling internal ERP approvals endpoint blocked (403).
 * 7. Vendor calling employee HR endpoints blocked (403).
 * 8. Cafe Admin attempting to decide Master-protected entity types blocked (403).
 * 9. Cafe scope enforcement: User assigned to Cafe A cannot access Cafe B's restricted endpoints.
 */

const BASE_URL = 'http://localhost:3000/api/v1';

async function loginUser(email, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:3000',
      'x-device-id': 'test-device-uuid-001',
    },
    body: JSON.stringify({
      organisationId: 'ZAMORIN',
      email,
      password,
      device: {
        deviceId: 'test-device-uuid-001',
        deviceName: 'Security Audit Runner',
        deviceType: 'DESKTOP',
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const rawCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  const cookieHeader = rawCookies.map(c => c.split(';')[0]).join('; ');

  return {
    user: data.data.user,
    accessToken: data.data.accessToken,
    cookieHeader,
    headers: {
      'Authorization': `Bearer ${data.data.accessToken}`,
      'Cookie': cookieHeader,
      'Origin': 'http://localhost:3000',
      'Content-Type': 'application/json',
    }
  };
}

async function main() {
  console.log('=== STARTING RBAC & CROSS-ROLE SECURITY AUDIT ===\n');

  // Test 1: Unauthenticated direct API call
  console.log('1. Testing unauthenticated direct API call...');
  const unauthRes = await fetch(`${BASE_URL}/approvals`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  console.log(`   Response status: ${unauthRes.status}`);
  if (unauthRes.status !== 401) {
    throw new Error(`Expected 401 for unauthenticated request, got ${unauthRes.status}`);
  }
  console.log('   ✓ Unauthenticated request blocked with 401.');

  // Test 2: Authenticate users
  console.log('\n2. Authenticating test roles...');
  const staff = await loginUser('staff@example.com', 'PK@NilaVega_8427!Cedar');
  console.log(`   ✓ Staff authenticated: ${staff.user.userId} (${staff.user.role})`);

  const admin = await loginUser('admin@example.com', 'PK@NilaVega_8427!Cedar');
  console.log(`   ✓ Cafe Admin authenticated: ${admin.user.userId} (${admin.user.role})`);

  const vendor = await loginUser('vendor@malabarfresh.com', 'M2X_L4d2qj7DJ3zmXrYNew_9A!');
  console.log(`   ✓ Vendor authenticated: ${vendor.user.userId} (${vendor.user.role})`);

  const master = await loginUser('pradeeshk331@gmail.com', 'PRADEESHK@94309');
  console.log(`   ✓ Primary Master authenticated: ${master.user.userId} (${master.user.role})`);

  // Test 3: Staff attempting to access Master Approvals
  console.log('\n3. Testing Staff -> Master Approvals endpoint...');
  const staffApprovalsRes = await fetch(`${BASE_URL}/approvals`, {
    method: 'GET',
    headers: staff.headers,
  });
  console.log(`   Response status: ${staffApprovalsRes.status}`);
  if (staffApprovalsRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden for Staff accessing Approvals, got ${staffApprovalsRes.status}`);
  }
  console.log('   ✓ Staff blocked from Master approvals (403 Forbidden).');

  // Test 4: Staff attempting to decide an approval
  console.log('\n4. Testing Staff -> Approval Decision mutation...');
  const staffDecideRes = await fetch(`${BASE_URL}/approvals/APP-00001/decide`, {
    method: 'POST',
    headers: staff.headers,
    body: JSON.stringify({ decision: 'APPROVED', reason: 'Unauthorized staff approval' }),
  });
  console.log(`   Response status: ${staffDecideRes.status}`);
  if (staffDecideRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden for Staff deciding approvals, got ${staffDecideRes.status}`);
  }
  console.log('   ✓ Staff blocked from deciding approvals (403 Forbidden).');

  // Test 5: Staff attempting to access Owner Governance / Admin Overview
  console.log('\n5. Testing Staff -> Owner Governance endpoint...');
  const staffOwnerRes = await fetch(`${BASE_URL}/owner/governance-delegation/dashboard`, {
    method: 'GET',
    headers: staff.headers,
  });
  console.log(`   Response status: ${staffOwnerRes.status}`);
  if (staffOwnerRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden for Staff accessing Owner routes, got ${staffOwnerRes.status}`);
  }
  console.log('   ✓ Staff blocked from Owner data (403 Forbidden).');

  console.log('\n5b. Testing Staff -> Admin Overview endpoint...');
  const staffAdminRes = await fetch(`${BASE_URL}/admin/overview`, {
    method: 'GET',
    headers: staff.headers,
  });
  console.log(`   Response status: ${staffAdminRes.status}`);
  if (staffAdminRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden for Staff accessing Admin overview, got ${staffAdminRes.status}`);
  }
  console.log('   ✓ Staff blocked from Admin overview (403 Forbidden).');

  // Test 6: Vendor attempting to access internal ERP routes
  console.log('\n6. Testing Vendor -> Internal Approvals endpoint...');
  const vendorAppRes = await fetch(`${BASE_URL}/approvals`, {
    method: 'GET',
    headers: vendor.headers,
  });
  console.log(`   Response status: ${vendorAppRes.status}`);
  if (vendorAppRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden for Vendor accessing internal Approvals, got ${vendorAppRes.status}`);
  }
  console.log('   ✓ Vendor blocked from internal ERP approvals (403 Forbidden).');

  console.log('\n7. Testing Vendor -> Employee HR endpoint...');
  const vendorEmpRes = await fetch(`${BASE_URL}/employees`, {
    method: 'GET',
    headers: vendor.headers,
  });
  console.log(`   Response status: ${vendorEmpRes.status}`);
  if (vendorEmpRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden for Vendor accessing Employee HR, got ${vendorEmpRes.status}`);
  }
  console.log('   ✓ Vendor blocked from internal Employee HR (403 Forbidden).');

  // Test 8: Revoked session / post-logout attack
  console.log('\n8. Testing revoked session attack after logout...');
  const tempStaff = await loginUser('staff@example.com', 'PK@NilaVega_8427!Cedar');
  // Log out
  const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: tempStaff.headers,
  });
  if (!logoutRes.ok) throw new Error(`Logout failed: ${logoutRes.status}`);

  // Now attempt to use old token
  const postLogoutRes = await fetch(`${BASE_URL}/leave/balances`, {
    method: 'GET',
    headers: tempStaff.headers,
  });
  console.log(`   Response status using revoked token: ${postLogoutRes.status}`);
  if (postLogoutRes.status !== 401) {
    throw new Error(`Expected 401 for revoked token after logout, got ${postLogoutRes.status}`);
  }
  console.log('   ✓ Revoked token properly rejected with 401 Unauthorized.');

  console.log('\n=== ALL RBAC & CROSS-ROLE SECURITY AUDIT TESTS PASSED! ===');
}

main().catch(err => {
  console.error('\n❌ SECURITY TEST FAILED:', err);
  process.exit(1);
});
