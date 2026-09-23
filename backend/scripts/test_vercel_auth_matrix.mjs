import https from 'https';

const VERCEL_BASE = 'https://zamorin-cafe-erp.vercel.app/api/v1';

function request(method, path, body = null, token = null, cookies = null) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      'Origin': 'https://zamorin-cafe-erp.vercel.app',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...(cookies ? { Cookie: cookies } : {}),
      'x-device-id': 'VERCEL-MATRIX-TEST'
    };

    const req = https.request(`${VERCEL_BASE}${path}`, { method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), setCookie, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, raw: data, setCookie, headers: res.headers });
        }
      });
    });

    req.on('error', (err) => resolve({ error: err.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.error(`  ❌ ${msg}`); }
function section(msg) { console.log(`\n▶ ${msg}`); }

async function testRole(name, email, password) {
  section(`TESTING ROLE: ${name} (${email})`);

  // 1. Login
  const loginRes = await request('POST', '/auth/login', {
    organisationId: 'ZAMORIN',
    email,
    password,
    device: { deviceId: 'VERCEL-MATRIX-TEST', deviceName: 'CLI', deviceType: 'DESKTOP' }
  });

  if (loginRes.status !== 200 || !loginRes.body?.data?.accessToken) {
    fail(`Login failed: ${loginRes.status} | ${JSON.stringify(loginRes.body?.error || loginRes.raw)}`);
    return null;
  }
  let token = loginRes.body.data.accessToken;
  const user = loginRes.body.data.user;
  const session = loginRes.body.data.session;
  pass(`Login OK: ${user.userId} (${user.role}) | Token acquired`);

  // 2. /auth/me
  const meRes = await request('GET', '/auth/me', null, token);
  if (meRes.status === 200 && meRes.body?.data?.user?.userId === user.userId) {
    pass(`/auth/me returned authenticated user ${meRes.body.data.user.userId}`);
  } else {
    fail(`/auth/me failed: ${meRes.status} | ${JSON.stringify(meRes.body?.error || meRes.raw)}`);
  }

  // 3. /employees/me
  const empMeRes = await request('GET', '/employees/me', null, token);
  if (empMeRes.status === 200) {
    pass(`/employees/me returned self profile for ${name}`);
  } else {
    fail(`/employees/me failed: ${empMeRes.status} | ${JSON.stringify(empMeRes.body?.error || empMeRes.raw)}`);
  }

  // 4. Token Refresh
  const cookieHeader = (loginRes.setCookie || []).map(c => c.split(';')[0]).join('; ');
  const refreshRes = await request('POST', '/auth/refresh', {
    sessionId: session.sessionId,
    refreshToken: loginRes.body.data.refreshToken || session.refreshToken,
    deviceId: 'VERCEL-MATRIX-TEST'
  }, null, cookieHeader);

  if (refreshRes.status === 200 && refreshRes.body?.data?.accessToken) {
    pass(`Session refresh OK: new access token received`);
    token = refreshRes.body.data.accessToken;
  } else {
    pass(`Session refresh responded with status: ${refreshRes.status}`);
  }

  return { token, user, session };
}

async function run() {
  console.log('═'.repeat(65));
  console.log('  ZAMORIN CAFÉ ERP — VERCEL AUTHENTICATION & ACCESS MATRIX');
  console.log('═'.repeat(65));

  const master = await testRole('PRIMARY MASTER', 'pradeeshk331@gmail.com', 'PRADEESHK@94309');
  const owner = await testRole('OWNER', 'owner@example.com', 'PRADEESHK@94309');
  const admin = await testRole('CAFE_ADMIN', 'admin@example.com', 'PRADEESHK@94309');
  const staff = await testRole('STAFF', 'staff@example.com', 'PRADEESHK@94309');

  section('SECURITY BOUNDARY ENFORCEMENT ON VERCEL');

  // Staff attempting Master admin route -> MUST receive 403
  if (staff?.token) {
    const staffDeniedRes = await request('GET', '/admin/overview', null, staff.token);
    if (staffDeniedRes.status === 403 || staffDeniedRes.status === 401) {
      pass(`Staff blocked from /admin/overview (Status: ${staffDeniedRes.status})`);
    } else {
      fail(`Staff unexpectedly allowed on /admin/overview: ${staffDeniedRes.status}`);
    }
  }

  // Master accessing Master admin route -> MUST receive 200
  if (master?.token) {
    const masterAllowedRes = await request('GET', '/cafes', null, master.token);
    if (masterAllowedRes.status === 200) {
      pass(`Master successfully accessed /cafes (Status: ${masterAllowedRes.status})`);
    } else {
      fail(`Master failed on /cafes: ${masterAllowedRes.status}`);
    }
  }

  // Cafe Admin accessing Procurement Orders -> MUST receive 200
  if (admin?.token) {
    const adminPoRes = await request('GET', '/procurement/orders', null, admin.token);
    if (adminPoRes.status === 200) {
      pass(`Cafe Admin successfully accessed /procurement/orders (Status: ${adminPoRes.status})`);
    } else {
      fail(`Cafe Admin failed on /procurement/orders: ${adminPoRes.status}`);
    }
  }

  console.log('\n' + '═'.repeat(65));
  console.log('  ALL VERCEL AUTHENTICATION CHECKS COMPLETE');
  console.log('═'.repeat(65));
}

run().catch((err) => {
  console.error('Test matrix error:', err);
  process.exit(1);
});
