import fs from 'node:fs';

const envText = fs.readFileSync('backend/.env', 'utf8');
for (const line of envText.split('\n')) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    value = value.trim().replace(/^['"](.*)['"]$/, '$1');
    process.env[key] = value;
  }
}

const API_BASE = 'http://localhost:4000/api/v1';

async function testLogin(label, email, password, orgId = 'ZAMORIN') {
  console.log(`\n--- Testing ${label} (${email}) ---`);
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': 'test-device-uuid-001'
      },
      body: JSON.stringify({
        organisationId: orgId,
        email,
        password,
        device: {
          deviceId: 'test-device-uuid-001',
          deviceName: 'Node Test Runner',
          deviceType: 'DESKTOP'
        }
      })
    });

    const setCookies = res.headers.get('set-cookie');
    const json = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(`Success: ${json.success}`);
    if (json.data) {
      console.log(`User: ${json.data.user?.name} | Role: ${json.data.user?.role} | isPrimaryMaster: ${json.data.user?.isPrimaryMaster}`);
      console.log(`Has accessToken: ${Boolean(json.data.accessToken)}`);
      console.log(`Session ID: ${json.data.session?.sessionId}`);
      console.log(`MFA required: ${Boolean(json.data.mfaRequired || json.data.requiresMfa)}`);
    } else {
      console.log(`Error:`, json.error || json);
    }
    return { status: res.status, json, setCookies };
  } catch (err) {
    console.error(`Fetch error:`, err.message);
    return { error: err.message };
  }
}

async function run() {
  // Valid accounts
  await testLogin('Primary Master', 'pradeeshk331@gmail.com', 'PRADEESHK@94309');
  await testLogin('Owner', 'owner@example.com', 'PK@NilaVega_8427!Cedar');
  await testLogin('Cafe Admin', 'admin@example.com', 'PK@NilaVega_8427!Cedar');
  await testLogin('Staff', 'staff@example.com', 'PK@NilaVega_8427!Cedar');
  await testLogin('Vendor', 'vendor@malabarfresh.com', process.env.VENDOR_E2E_PASSWORD || 'M2X_L4d2qj7DJ3zmXrYNew_9A!');

  // Invalid attempts
  console.log('\n=== Testing Invalid Login Scenarios ===');
  await testLogin('Wrong Password', 'staff@example.com', 'WrongPassword123!');
  await testLogin('Unknown User', 'unknown.ghost@zamorin.com', 'PRADEESHK@94309');
  await testLogin('Blank Fields', '', '');
  await testLogin('Wrong Org', 'staff@example.com', 'PRADEESHK@94309', 'WRONG_ORG_XYZ');
}

run();
