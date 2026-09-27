import fs from 'node:fs';

const API_BASE = 'http://localhost:4000/api/v1';

async function testSessionLifecycle() {
  console.log('=== Testing Session Lifecycle & Refresh ===\n');

  // 1. Login as Staff
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-id': 'lifecycle-device-01' },
    body: JSON.stringify({
      organisationId: 'ZAMORIN',
      email: 'staff@example.com',
      password: 'PK@NilaVega_8427!Cedar',
      device: { deviceId: 'lifecycle-device-01', deviceName: 'Lifecycle Test', deviceType: 'DESKTOP' }
    })
  });
  const rawCookies = loginRes.headers.getSetCookie();
  const loginCookies = rawCookies.map(c => c.split(';')[0]).join('; ');
  const loginJson = await loginRes.json();
  const accessToken = loginJson.data?.accessToken;
  const refreshToken = loginJson.data?.refreshToken;
  const sessionId = loginJson.data?.session?.sessionId;

  console.log(`1. Login Staff: ${loginRes.status} | Session: ${sessionId} | AccessToken: ${Boolean(accessToken)}`);

  // 2. Call /auth/me with Bearer token
  const meRes = await fetch(`${API_BASE}/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-device-id': 'lifecycle-device-01',
      Origin: 'http://localhost:3000',
      Cookie: loginCookies
    }
  });
  const meJson = await meRes.json();
  console.log(`2. /auth/me: ${meRes.status} | User: ${meJson.data?.user?.email} | Role: ${meJson.data?.user?.role}`);

  // 3. Call /auth/refresh
  const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': 'lifecycle-device-01',
      Origin: 'http://localhost:3000',
      Cookie: loginCookies
    },
    body: JSON.stringify({
      sessionId,
      refreshToken,
      deviceId: 'lifecycle-device-01'
    })
  });
  const newRawCookies = refreshRes.headers.getSetCookie();
  const newCookies = newRawCookies.length ? newRawCookies.map(c => c.split(';')[0]).join('; ') : loginCookies;
  const refreshJson = await refreshRes.json();
  const newAccessToken = refreshJson.data?.accessToken;
  console.log(`3. /auth/refresh: ${refreshRes.status} | New AccessToken: ${Boolean(newAccessToken)} | Status: ${refreshJson.success}`);

  // 4. Verify new token works with /auth/me
  const meAfterRefresh = await fetch(`${API_BASE}/auth/me`, {
    headers: {
      Authorization: `Bearer ${newAccessToken}`,
      'x-device-id': 'lifecycle-device-01',
      Origin: 'http://localhost:3000',
      Cookie: newCookies
    }
  });
  const meAfterJson = await meAfterRefresh.json();
  console.log(`4. /auth/me with new token: ${meAfterRefresh.status} | User: ${meAfterJson.data?.user?.email}`);

  // 5. Call /auth/logout
  const logoutRes = await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${newAccessToken}`,
      'x-device-id': 'lifecycle-device-01',
      Origin: 'http://localhost:3000',
      Cookie: newCookies
    }
  });
  const logoutJson = await logoutRes.json();
  console.log(`5. /auth/logout: ${logoutRes.status} | Success: ${logoutJson.success}`);

  // 6. Verify stale token is blocked after logout
  const meAfterLogout = await fetch(`${API_BASE}/auth/me`, {
    headers: {
      Authorization: `Bearer ${newAccessToken}`,
      'x-device-id': 'lifecycle-device-01'
    }
  });
  const meAfterLogoutJson = await meAfterLogout.json();
  console.log(`6. /auth/me after logout: ${meAfterLogout.status} | Error: ${meAfterLogoutJson.error?.code}`);

  // 7. Verify refresh with revoked session fails
  const refreshAfterLogout = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': 'lifecycle-device-01'
    },
    body: JSON.stringify({
      sessionId,
      refreshToken,
      deviceId: 'lifecycle-device-01'
    })
  });
  const refreshAfterLogoutJson = await refreshAfterLogout.json();
  console.log(`7. /auth/refresh after logout: ${refreshAfterLogout.status} | Error: ${refreshAfterLogoutJson.error?.code}`);

  console.log('\n=== Session Lifecycle Verification Complete ===');
}

testSessionLifecycle().catch(console.error);
