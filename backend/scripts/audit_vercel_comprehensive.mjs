import https from 'https';

const VERCEL_BASE = 'https://zamorin-cafe-erp.vercel.app/api/v1';

function request(method, path, body = null, token = null) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      'Origin': 'https://zamorin-cafe-erp.vercel.app',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      'x-device-id': 'VERCEL-AUDIT'
    };
    const req = https.request(`${VERCEL_BASE}${path}`, { method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, raw: data }); }
      });
    });
    req.on('error', (e) => resolve({ error: e.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('═'.repeat(70));
  console.log('  ZAMORIN CAFÉ ERP — VERCEL END-TO-END AUTHENTICATION MATRIX');
  console.log('═'.repeat(70));

  // 1. Primary Master Login
  const masterLogin = await request('POST', '/auth/login', {
    organisationId: 'ZAMORIN', email: 'pradeeshk331@gmail.com', password: 'PRADEESHK@94309',
    device: { deviceId: 'VERCEL-AUDIT', deviceName: 'CLI', deviceType: 'DESKTOP' }
  });
  const mToken = masterLogin.body?.data?.accessToken;
  console.log('1. Primary Master Login:   ', masterLogin.status === 200 ? '✅ 200 OK' : `❌ ${masterLogin.status}`);

  // 2. Cafe Admin Login
  const adminLogin = await request('POST', '/auth/login', {
    organisationId: 'ZAMORIN', email: 'admin@example.com', password: 'PRADEESHK@94309',
    device: { deviceId: 'VERCEL-AUDIT', deviceName: 'CLI', deviceType: 'DESKTOP' }
  });
  const aToken = adminLogin.body?.data?.accessToken;
  console.log('2. Cafe Admin Login:       ', adminLogin.status === 200 ? '✅ 200 OK' : `❌ ${adminLogin.status}`);

  // 3. Owner Login
  const ownerLogin = await request('POST', '/auth/login', {
    organisationId: 'ZAMORIN', email: 'owner@example.com', password: 'PRADEESHK@94309',
    device: { deviceId: 'VERCEL-AUDIT', deviceName: 'CLI', deviceType: 'DESKTOP' }
  });
  const oToken = ownerLogin.body?.data?.accessToken;
  console.log('3. Owner Login:            ', ownerLogin.status === 200 ? '✅ 200 OK' : `❌ ${ownerLogin.status}`);

  // 4. Staff Login
  const staffLogin = await request('POST', '/auth/login', {
    organisationId: 'ZAMORIN', email: 'staff@example.com', password: 'PRADEESHK@94309',
    device: { deviceId: 'VERCEL-AUDIT', deviceName: 'CLI', deviceType: 'DESKTOP' }
  });
  const sToken = staffLogin.body?.data?.accessToken;
  console.log('4. Staff Login:            ', staffLogin.status === 200 ? '✅ 200 OK' : `❌ ${staffLogin.status}`);

  // Test endpoints suite
  const testCases = [
    // Self-Service Profile Checks (all 4 windows have full access to own profile)
    { desc: 'Master accesses /employees/me', method: 'GET', path: '/employees/me', token: mToken, expect: [200] },
    { desc: 'Owner accesses /employees/me', method: 'GET', path: '/employees/me', token: oToken, expect: [200] },
    { desc: 'Admin accesses /employees/me', method: 'GET', path: '/employees/me', token: aToken, expect: [200] },
    { desc: 'Staff accesses /employees/me', method: 'GET', path: '/employees/me', token: sToken, expect: [200] },

    // Core Operational & Governance Read Endpoints
    { desc: 'Master accesses /cafes', method: 'GET', path: '/cafes', token: mToken, expect: [200] },
    { desc: 'Master accesses /vendors', method: 'GET', path: '/vendors', token: mToken, expect: [200] },
    { desc: 'Master accesses /inventory/items', method: 'GET', path: '/inventory/items', token: mToken, expect: [200] },
    { desc: 'Master accesses /reports/overview', method: 'GET', path: '/reports/overview', token: mToken, expect: [200] },
    { desc: 'Admin accesses /procurement/orders', method: 'GET', path: '/procurement/orders', token: aToken, expect: [200] },
    { desc: 'Admin accesses /vendors', method: 'GET', path: '/vendors', token: aToken, expect: [200] },
    { desc: 'Admin accesses /inventory/items', method: 'GET', path: '/inventory/items', token: aToken, expect: [200] },
    { desc: 'Owner accesses /cafes', method: 'GET', path: '/cafes', token: oToken, expect: [200] },
    { desc: 'Staff accesses /notifications', method: 'GET', path: '/notifications', token: sToken, expect: [200] },

    // Role-Boundary Security Enforcement (Staff MUST be denied governance & mutation routes)
    { desc: 'Staff blocked from /admin/overview', method: 'GET', path: '/admin/overview', token: sToken, expect: [401, 403] },
    { desc: 'Staff blocked from /reports/overview', method: 'GET', path: '/reports/overview', token: sToken, expect: [401, 403] },
    { desc: 'Staff blocked from creating café', method: 'POST', path: '/cafes', body: { name: 'Unauthorized Cafe' }, token: sToken, expect: [401, 403] },
    { desc: 'Staff blocked from creating vendor', method: 'POST', path: '/vendors', body: { name: 'Unauthorized Vendor' }, token: sToken, expect: [401, 403] },

    // Unauthenticated Rejections
    { desc: 'Unauthenticated blocked from /cafes', method: 'GET', path: '/cafes', token: null, expect: [401] },
    { desc: 'Unauthenticated blocked from /vendors', method: 'GET', path: '/vendors', token: null, expect: [401] }
  ];

  console.log('\n▶ RUNNING VERCEL SECURITY & FUNCTIONALITY SUITE:');
  let passCount = 0;
  for (const tc of testCases) {
    const res = await request(tc.method, tc.path, tc.body || null, tc.token);
    const passed = tc.expect.includes(res.status);
    if (passed) passCount++;
    const icon = passed ? '✅' : '❌';
    console.log(`  ${icon} [${tc.method.padEnd(4)} ${tc.path.padEnd(22)}] ${tc.desc.padEnd(40)} (Status: ${res.status})`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`  OVERALL VERCEL SCORE: ${passCount} / ${testCases.length} TESTS PASSED`);
  console.log('═'.repeat(70));
}

run().catch((err) => {
  console.error('Audit error:', err);
  process.exit(1);
});
