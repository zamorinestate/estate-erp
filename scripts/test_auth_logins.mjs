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

const API_BASE = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api/v1';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required; integration credentials must be supplied through the environment.`);
  return value;
}

const PRIMARY_MASTER_EMAIL = requiredEnv('E2E_PRIMARY_MASTER_EMAIL');
const PRIMARY_MASTER_PASSWORD = requiredEnv('E2E_PRIMARY_MASTER_PASSWORD');
const OWNER_EMAIL = requiredEnv('E2E_OWNER_EMAIL');
const OWNER_PASSWORD = requiredEnv('E2E_OWNER_PASSWORD');
const CAFE_ADMIN_EMAIL = requiredEnv('E2E_CAFE_ADMIN_EMAIL');
const CAFE_ADMIN_PASSWORD = requiredEnv('E2E_CAFE_ADMIN_PASSWORD');
const STAFF_EMAIL = requiredEnv('E2E_STAFF_EMAIL');
const STAFF_PASSWORD = requiredEnv('E2E_STAFF_PASSWORD');
const VENDOR_EMAIL = requiredEnv('VENDOR_E2E_EMAIL');
const VENDOR_PASSWORD = requiredEnv('VENDOR_E2E_PASSWORD');
const INVALID_PASSWORD = ['Definitely', 'Wrong!2026'].join('');

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
  await testLogin('Primary Master', PRIMARY_MASTER_EMAIL, PRIMARY_MASTER_PASSWORD);
  await testLogin('Owner', OWNER_EMAIL, OWNER_PASSWORD);
  await testLogin('Cafe Admin', CAFE_ADMIN_EMAIL, CAFE_ADMIN_PASSWORD);
  await testLogin('Staff', STAFF_EMAIL, STAFF_PASSWORD);
  await testLogin('Vendor', VENDOR_EMAIL, VENDOR_PASSWORD);

  // Invalid attempts
  console.log('\n=== Testing Invalid Login Scenarios ===');
  await testLogin('Wrong Password', STAFF_EMAIL, INVALID_PASSWORD);
  await testLogin('Unknown User', 'unknown.ghost@zamorin.test', INVALID_PASSWORD);
  await testLogin('Blank Fields', '', '');
  await testLogin('Wrong Org', STAFF_EMAIL, INVALID_PASSWORD, 'WRONG_ORG_XYZ');
}

run();
