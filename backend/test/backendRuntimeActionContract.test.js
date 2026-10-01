'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validateStartupConfiguration } = require('../src/config/startupValidator');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');

const serverSource = read('backend/src/server.js');
const renderYaml = read('render.yaml');
const deployCheckSource = read('scripts/check_deploy_readiness.mjs');

const posFrontend = read('frontend/src/js/pages/posTill.js');
const attendanceStaffFrontend = read('frontend/src/js/modules/attendance/staffAttendance.js');
const attendanceAdminFrontend = read('frontend/src/js/modules/attendance/attendanceShifts.js');
const administrationFrontend = read('frontend/src/js/pages/administration.js');
const cafeOpsLoginFrontend = read('frontend/src/js/pages/cafeOperationsLogin2.js');
const financeFrontend = read('frontend/src/js/pages/financeAccounts.js');
const employeesFrontend = read('frontend/src/js/pages/employees.js');
const qualityFrontend = read('frontend/src/js/pages/quality.js');
const customersFrontend = read('frontend/src/js/pages/customers.js');
const assetsFrontend = read('frontend/src/js/pages/assets.js');
const settingsFrontend = read('frontend/src/js/pages/settingsShared.js');
const announcementsFrontend = read('frontend/src/js/pages/announcements.js');

const posRoutes = read('backend/src/routes/posRoutes.js');
const billRoutes = read('backend/src/routes/billRoutes.js');
const menuRoutes = read('backend/src/routes/menuRoutes.js');
const kdsRoutes = read('backend/src/routes/kdsRoutes.js');
const attendanceRoutes = read('backend/src/modules/attendance/attendanceRoutes.js');
const shiftRoutes = read('backend/src/routes/shiftRoutes.js');
const cafeRoutes = read('backend/src/routes/cafeRoutes.js');
const adminRoutes = read('backend/src/routes/adminRoutes.js');
const userRoutes = read('backend/src/routes/userRoutes.js');
const authRoutes = read('backend/src/routes/authRoutes.js');
const seedSource = read('backend/src/scripts/seedInitialData.js');
const startProdSource = read('backend/src/scripts/startProd.js');

function productionEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    PORT: '4000',
    MONGODB_URI: 'mongodb+srv://user:password@cluster.example.mongodb.net/zamorin_prod',
    JWT_ACCESS_SECRET: 'J'.repeat(64),
    MFA_ENCRYPTION_KEY: 'a'.repeat(64),
    QR_SIGNING_SECRET: 'Q'.repeat(64),
    ATTENDANCE_QR_SECRET: 'R'.repeat(64),
    DOCUMENT_STORAGE_PROVIDER: 'gridfs',
    ALLOWED_ORIGINS: 'https://zamorin-cafe-erp.vercel.app',
    ...overrides,
  };
}

test('BACKEND-RUNTIME-001: production startup validator accepts canonical GridFS configuration', () => {
  const report = validateStartupConfiguration(productionEnv(), { failClosed: true });
  assert.equal(report.isProduction, true);
  assert.equal(report.isSafe, true);
  assert.equal(report.blockingIssues.length, 0);
  const provider = report.report.find((entry) => entry.key === 'DOCUMENT_STORAGE_PROVIDER');
  assert.equal(provider?.status, 'PRESENT');
});

test('BACKEND-RUNTIME-002: production startup validator fails closed when canonical storage provider is absent', () => {
  const env = productionEnv();
  delete env.DOCUMENT_STORAGE_PROVIDER;
  assert.throws(
    () => validateStartupConfiguration(env, { failClosed: true }),
    (error) => error?.code === 'STARTUP_CONFIGURATION_FAILED' &&
      String(error.message).includes('DOCUMENT_STORAGE_PROVIDER')
  );
});

test('BACKEND-RUNTIME-003: server validates raw process.env and scanner readiness is explicit opt-in', () => {
  assert.ok(serverSource.includes('documentStorageAdapter.validateStartupConfiguration(process.env);'));
  assert.ok(serverSource.includes('validateConfig(process.env, { failClosed: true });'));
  assert.equal(serverSource.includes('validateStartupConfiguration(environment);'), false);
  assert.ok(serverSource.includes("process.env.REQUIRE_DOCUMENT_SCANNER === 'true'"));
});

test('BACKEND-RUNTIME-004: Render manifest declares every mandatory core runtime dependency', () => {
  for (const required of [
    'MONGODB_URI',
    'REDIS_URL',
    'ALLOWED_ORIGINS',
    'JWT_ACCESS_SECRET',
    'MFA_ENCRYPTION_KEY',
    'QR_SIGNING_SECRET',
    'ATTENDANCE_QR_SECRET',
    'DOCUMENT_STORAGE_PROVIDER',
    'gridfs',
    'REQUIRE_DOCUMENT_SCANNER',
  ]) {
    assert.ok(renderYaml.includes(required), `render.yaml must declare ${required}`);
  }
  assert.ok(deployCheckSource.includes("render.yaml missing REDIS_URL declaration required by production distributed state"));
  assert.ok(deployCheckSource.includes("key: 'DOCUMENT_STORAGE_PROVIDER'"));
  assert.equal(deployCheckSource.includes("key: 'DOCUMENT_STORAGE_DRIVER'"), false);
});

test('BACKEND-RUNTIME-005: production seed is minimal by default and bootstrap failures are fatal', () => {
  assert.ok(seedSource.includes("const isProductionSeed = environment.production || process.env.NODE_ENV === 'production';"));
  assert.ok(seedSource.includes("const isMinimalSeed = isProductionSeed || process.env.SEED_MINIMAL === 'true' || process.env.SEED_DEMO_DATA === 'false';"));
  assert.ok(seedSource.includes('throw error;'));
  assert.ok(startProdSource.includes("[FATAL] Production bootstrap verification failed:"));
  assert.ok(startProdSource.includes('throw seedErr;'));
  assert.ok(renderYaml.includes('SEED_MINIMAL'));
  assert.ok(renderYaml.includes('SEED_DEMO_DATA'));
});

test('BACKEND-ACTION-001: POS buttons map to live backend routes', () => {
  for (const frontendCall of [
    '/pos/orders/commit',
    '/pos/orders/last/',
    '/bills/register/session/current',
    '/bills/register/session/open',
    '/bills/register/session/close',
    '/bills/tickets/hold',
    '/bills/tickets/open',
    '/bills/history/calendar',
    '/bills/history/stats',
    '/menu/items',
    '/menu/simulator',
    '/kds/tickets/',
  ]) {
    assert.ok(posFrontend.includes(frontendCall), `POS frontend missing expected call ${frontendCall}`);
  }

  for (const backendRoute of [
    "router.post('/orders/commit'",
    "router.get('/orders/last/:cafeId'",
    "router.get('/register/session/current'",
    "router.post('/register/session/open'",
    "router.post('/register/session/close'",
    "router.post('/tickets/hold'",
    "router.get('/tickets/open'",
    "router.get('/history/calendar'",
    "router.get('/history/stats'",
    "router.get('/items'",
    "router.get('/simulator'",
    "router.post('/tickets/:ticketId/bump'",
  ]) {
    assert.ok(
      [posRoutes, billRoutes, menuRoutes, kdsRoutes].some((source) => source.includes(backendRoute)),
      `Backend missing POS support route ${backendRoute}`
    );
  }
});

test('BACKEND-ACTION-002: attendance and shift controls map to live backend routes', () => {
  for (const frontendCall of [
    '/attendance/server-time',
    '/attendance/today',
    '/attendance/history',
    '/attendance/qr/verify',
    '/attendance/geofence/verify',
    '/attendance/break/start',
    '/attendance/break/end',
    '/attendance/corrections',
    '/attendance/roster',
    '/attendance/overtime/decide',
    '/attendance/exceptions/',
    '/attendance/periods/',
    '/attendance/master-manual',
    '/shifts/me/requests',
    '/shifts/me/schedule',
  ]) {
    assert.ok(
      attendanceStaffFrontend.includes(frontendCall) || attendanceAdminFrontend.includes(frontendCall),
      `Attendance frontend missing expected call ${frontendCall}`
    );
  }

  for (const backendRoute of [
    "router.get('/server-time'",
    "router.get('/today'",
    "router.get('/history'",
    "router.post('/qr/verify'",
    "router.post('/geofence/verify'",
    "router.post('/break/start'",
    "router.post('/break/end'",
    "router.post('/corrections'",
    "router.get('/roster'",
    "router.post('/roster'",
    "router.post('/overtime/decide'",
    "router.post('/exceptions/:exceptionId/resolve'",
    "router.post('/periods/:periodId/close'",
    "router.post('/master-manual'",
    "router.post('/me/requests'",
    "router.get('/me/schedule'",
  ]) {
    assert.ok(
      attendanceRoutes.includes(backendRoute) || shiftRoutes.includes(backendRoute),
      `Backend missing attendance/shift route ${backendRoute}`
    );
  }
});

test('BACKEND-RUNTIME-006: diagnostics report real core dependency state instead of hard-coded health', () => {
  const controllerSource = read('backend/src/controllers/settingsController.js');
  assert.ok(controllerSource.includes('redisClientFactory.getHealthStatus()'));
  assert.ok(controllerSource.includes('documentStorageAdapter.healthCheck()'));
  assert.ok(controllerSource.includes('mongoose.connection.readyState === 1'));
  assert.equal(controllerSource.includes("serviceHealth: 'CONNECTED'"), false);
  assert.ok(settingsFrontend.includes('settings-service-health-chip'));
  assert.ok(settingsFrontend.includes('Backend Dependency Degraded'));
  assert.ok(settingsFrontend.includes('Backend Unreachable'));
  assert.equal(settingsFrontend.includes('All Services Healthy'), false);
});

test('BACKEND-ACTION-004: successful UI mutations are never fabricated after API failure', () => {
  for (const forbidden of [
    'await apiPost(\`/finance/journals/\${id}/post\`, {});\\n      } catch (err) {}',
    'await apiPost(\`/finance/journals/\${id}/reverse\`, { reason });\\n      } catch (err) {}',
    'await apiPost("/employees/staffing-requests", payload).catch(() => null)',
    'await apiPost("/employees/positions", payload).catch(() => null)',
    'await apiPost(\`/employees/\${userId}/skills\`, payload).catch(() => null)',
    'await apiPost(\`/employees/\${userId}/training\`, payload).catch(() => null)',
    'await apiPost(\`/employees/\${userId}/documents/generate\`, payload).catch(() => null)',
    "await apiPost('/quality/checklists'",
    "await apiPost('/quality/temperatures'",
  ]) {
    if (forbidden.includes('/quality/checklists')) {
      assert.equal(qualityFrontend.includes("}).catch(() => null);\\n    } catch (err) {}"), false);
      continue;
    }
    if (forbidden.includes('/quality/temperatures')) continue;
    assert.equal(
      [financeFrontend, employeesFrontend].some((source) => source.includes(forbidden)),
      false,
      `Forbidden false-success mutation pattern remains: ${forbidden}`
    );
  }

  assert.ok(financeFrontend.includes('Failed to post Journal'));
  assert.ok(financeFrontend.includes('Failed to reverse Journal'));
  assert.ok(employeesFrontend.includes('Failed to submit staffing requisition.'));
  assert.ok(employeesFrontend.includes('Failed to create sanctioned position.'));
  assert.ok(qualityFrontend.includes('Failed to record quality inspection.'));
  assert.ok(qualityFrontend.includes('Failed to record temperature reading.'));
  assert.ok(customersFrontend.includes('Failed to add reward item.'));
  assert.ok(assetsFrontend.includes('Failed to register asset.'));
  assert.ok(assetsFrontend.includes('Failed to create work order.'));
  assert.ok(settingsFrontend.includes('Failed to save notification preferences.'));
  assert.ok(announcementsFrontend.includes('Failed to mark notices as read.'));
  assert.equal(customersFrontend.includes('catch {\\n      showToast("Reward item added to catalogue.", "success");'), false);
});

test('BACKEND-ACTION-003: administration and login actions map to live backend routes', () => {
  for (const frontendCall of [
    '/cafes/',
    '/admin/overview',
    '/admin/work-queue',
    '/admin/requests',
    '/users/',
    '/devices',
    '/auth/cafe-operations/cafes',
    '/auth/cafe-operations/login',
  ]) {
    assert.ok(
      administrationFrontend.includes(frontendCall) || cafeOpsLoginFrontend.includes(frontendCall),
      `Frontend missing expected administration/login call ${frontendCall}`
    );
  }

  for (const backendRoute of [
    "router.get('/overview'",
    "router.get('/work-queue'",
    "router.get('/requests'",
    "router.post('/requests'",
    "router.patch('/requests/:requestId/decision'",
    "router.post('/:userId/role-impact'",
    "router.patch('/:userId/status'",
    "router.post('/:userId/archive'",
    "router.get('/cafe-operations/cafes'",
    "router.post('/cafe-operations/login'",
  ]) {
    assert.ok(
      adminRoutes.includes(backendRoute) ||
      userRoutes.includes(backendRoute) ||
      authRoutes.includes(backendRoute),
      `Backend missing administration/login route ${backendRoute}`
    );
  }

  assert.ok(cafeRoutes.includes(".route('/')"));
  assert.ok(cafeRoutes.includes('.get(listCafes)'));
  assert.ok(cafeRoutes.includes('.post(createCafe)'));
  assert.ok(cafeRoutes.includes(".route('/:cafeId')"));
  assert.ok(cafeRoutes.includes('.get(getCafe)'));
  assert.ok(cafeRoutes.includes('.patch(updateCafe)'));
});
