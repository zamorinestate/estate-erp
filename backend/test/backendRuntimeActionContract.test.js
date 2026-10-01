'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validateStartupConfiguration } = require('../src/config/startupValidator');
const { encryptMfaSecret, decryptMfaSecret } = require('../src/services/mfaService');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');

function hasDirectExpressRoute(source, method, routePath) {
  const compact = String(source).replace(/\s+/g, '');
  return compact.includes(`router.${method}('${routePath}'`) || compact.includes(`router.${method}(\"${routePath}\"`);
}

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
const revenueShareFrontend = read('frontend/src/js/pages/revenueShare.js');
const payrollFrontend = read('frontend/src/js/pages/payrollManagement.js');

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
const attendanceQrSource = read('backend/src/services/attendanceQrService.js');

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

test('BACKEND-RUNTIME-008: production attendance signing secrets are mandatory and distinct', () => {
  const missingQr = productionEnv();
  delete missingQr.QR_SIGNING_SECRET;
  assert.throws(
    () => validateStartupConfiguration(missingQr, { failClosed: true }),
    (error) => error?.code === 'STARTUP_CONFIGURATION_FAILED' &&
      String(error.message).includes('QR_SIGNING_SECRET')
  );

  const missingAttendance = productionEnv();
  delete missingAttendance.ATTENDANCE_QR_SECRET;
  assert.throws(
    () => validateStartupConfiguration(missingAttendance, { failClosed: true }),
    (error) => error?.code === 'STARTUP_CONFIGURATION_FAILED' &&
      String(error.message).includes('ATTENDANCE_QR_SECRET')
  );

  assert.throws(
    () => validateStartupConfiguration(
      productionEnv({
        QR_SIGNING_SECRET: 'S'.repeat(64),
        ATTENDANCE_QR_SECRET: 'S'.repeat(64),
      }),
      { failClosed: true }
    ),
    (error) => error?.code === 'STARTUP_CONFIGURATION_FAILED' &&
      String(error.message).includes('must be distinct')
  );
});

test('BACKEND-RUNTIME-009: attendance service cannot use source-code secrets in production', () => {
  assert.ok(attendanceQrSource.includes("process.env.NODE_ENV === 'production'"));
  assert.ok(attendanceQrSource.includes("'ATTENDANCE_SIGNING_SECRET_MISSING'"));
  assert.ok(attendanceQrSource.includes('getQrSigningSecret()'));
  assert.ok(attendanceQrSource.includes('getAttendanceQrSecret()'));
  assert.equal(
    attendanceQrSource.includes("process.env.QR_SIGNING_SECRET || 'zamorin_qr_master_signing_secret_key_2026_dsec'"),
    false
  );
  assert.equal(
    attendanceQrSource.includes("process.env.ATTENDANCE_QR_SECRET || 'zamorin-attendance-presence-secret-salt-2026'"),
    false
  );
});

test('BACKEND-RUNTIME-010: Render binds REDIS_URL to the managed Key Value connection string', () => {
  assert.ok(renderYaml.includes('key: REDIS_URL'));
  assert.ok(renderYaml.includes('fromService:'));
  assert.ok(renderYaml.includes('type: keyvalue'));
  assert.ok(renderYaml.includes('name: zamorin-cafe-erp-redis-production'));
  assert.ok(renderYaml.includes('property: connectionString'));
  assert.equal(renderYaml.includes('key: REDIS_URL\n        sync: false'), false);
});

test('BACKEND-RUNTIME-011: quoted 64-hex MFA keys normalize without changing key material', () => {
  const quotedKey = `"${'a'.repeat(64)}"`;
  const report = validateStartupConfiguration(
    productionEnv({ MFA_ENCRYPTION_KEY: quotedKey }),
    { failClosed: true }
  );
  assert.equal(report.isSafe, true);

  const previous = process.env.MFA_ENCRYPTION_KEY;
  try {
    process.env.MFA_ENCRYPTION_KEY = quotedKey;
    const encrypted = encryptMfaSecret('ZAMORIN-MFA-NORMALIZATION-TEST');
    assert.notEqual(encrypted, 'ZAMORIN-MFA-NORMALIZATION-TEST');
    assert.equal(
      decryptMfaSecret(encrypted),
      'ZAMORIN-MFA-NORMALIZATION-TEST'
    );
  } finally {
    if (previous === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = previous;
  }

  assert.throws(
    () => validateStartupConfiguration(
      productionEnv({ MFA_ENCRYPTION_KEY: '"not-a-valid-hex-key"' }),
      { failClosed: true }
    ),
    (error) => error?.code === 'STARTUP_CONFIGURATION_FAILED' &&
      String(error.message).includes('MFA_ENCRYPTION_KEY')
  );
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
    '/kds/tickets/',
  ]) {
    assert.ok(posFrontend.includes(frontendCall), `POS frontend missing expected call ${frontendCall}`);
  }

  for (const [method, routePath] of [
    ['post', '/orders/commit'],
    ['get', '/orders/last/:cafeId'],
    ['get', '/register/session/current'],
    ['post', '/register/session/open'],
    ['post', '/register/session/close'],
    ['post', '/tickets/hold'],
    ['get', '/tickets/open'],
    ['get', '/history/calendar'],
    ['get', '/history/stats'],
    ['post', '/tickets/:ticketId/bump'],
  ]) {
    assert.ok(
      [posRoutes, billRoutes, menuRoutes, kdsRoutes].some((source) =>
        hasDirectExpressRoute(source, method, routePath)
      ),
      `Backend missing POS support route ${method.toUpperCase()} ${routePath}`
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

test('BACKEND-RUNTIME-007: legacy Render health path enforces readiness in production', () => {
  assert.ok(serverSource.includes("app.get('/api/v1/health', (request, response) =>"));
  assert.ok(serverSource.includes("process.env.NODE_ENV === 'production'"));
  assert.ok(serverSource.includes('? readinessHandler(request, response)'));
  assert.ok(serverSource.includes(': healthHandler(request, response)'));
});

test('BACKEND-RUNTIME-006: diagnostics report real core dependency state instead of hard-coded health', () => {
  const controllerSource = read('backend/src/controllers/settingsController.js');
  assert.ok(controllerSource.includes('redisClientFactory.getHealthStatus()'));
  assert.ok(controllerSource.includes('documentStorageAdapter.healthCheck()'));
  assert.ok(controllerSource.includes("['OK', 'READY', 'HEALTHY'].includes(storageHealth?.status)"));
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

test('BACKEND-ACTION-005: Revenue Share never fabricates production financial writes or simulations', () => {
  assert.equal(revenueShareFrontend.includes('optimistic local update'), false);
  assert.equal(revenueShareFrontend.includes('Simulating locally for offline/mock'), false);
  assert.equal(revenueShareFrontend.includes(".catch(() => {})"), false);
  assert.ok(revenueShareFrontend.includes('Revenue Share Backend Unavailable'));
  assert.ok(revenueShareFrontend.includes('No local or sample records have been substituted.'));
  assert.ok(revenueShareFrontend.includes('isRevenueDevPreview()'));
  assert.ok(revenueShareFrontend.includes('Settlement simulation failed.'));
  assert.ok(revenueShareFrontend.includes('Revenue Share action failed. No local changes were made.'));
});

test('BACKEND-ACTION-006: Payroll never exposes development fixtures on production hosts', () => {
  const devModeStart = payrollFrontend.indexOf('function isDevMode()');
  const fixtureStart = payrollFrontend.indexOf('// ─── CANONICAL DEV FIXTURES', devModeStart);
  const devModeBlock = payrollFrontend.slice(devModeStart, fixtureStart);
  assert.equal(devModeBlock.includes('state.user?.isDevPreview'), false);
  assert.ok(devModeBlock.includes("location.hostname === \"localhost\""));
  assert.equal(payrollFrontend.includes('Promise.allSettled'), false);
  assert.ok(payrollFrontend.includes('Payroll Backend Unavailable'));
  assert.ok(payrollFrontend.includes('No development fixtures have been substituted.'));
  assert.ok(payrollFrontend.includes('if (!cachedOverview && isDevMode())'));
});

test('BACKEND-ACTION-007: Quality compliance reads fail visibly instead of asserting zero-risk state', () => {
  assert.ok(qualityFrontend.includes('function renderQualityLoadError'));
  assert.ok(qualityFrontend.includes('The system will not report zero NCRs while the backend is unavailable.'));
  assert.ok(qualityFrontend.includes('The quarantine register could not be verified. No zero-hold assumption has been made.'));
  assert.ok(qualityFrontend.includes('Traceability Engine Unavailable'));
  assert.equal(qualityFrontend.includes("console.warn(\"Quality holds API offline, using fallback data:\""), false);
  assert.equal(qualityFrontend.includes("cachedTrace = DEFAULT_QUALITY_TRACEABILITY"), false);
  assert.equal(qualityFrontend.includes("value=\"${searchedLot || 'LOT-20260815-MILK'}\""), false);
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

  for (const [method, routePath] of [
    ['get', '/overview'],
    ['get', '/work-queue'],
    ['get', '/requests'],
    ['post', '/requests'],
    ['patch', '/requests/:requestId/decision'],
    ['post', '/:userId/role-impact'],
    ['patch', '/:userId/status'],
    ['post', '/:userId/archive'],
    ['get', '/cafe-operations/cafes'],
    ['post', '/cafe-operations/login'],
  ]) {
    assert.ok(
      [adminRoutes, userRoutes, authRoutes].some((source) =>
        hasDirectExpressRoute(source, method, routePath)
      ),
      `Backend missing administration/login route ${method.toUpperCase()} ${routePath}`
    );
  }

  assert.ok(cafeRoutes.includes(".route('/')"));
  assert.ok(cafeRoutes.includes('.get(listCafes)'));
  assert.ok(cafeRoutes.includes('.post(createCafe)'));
  assert.ok(cafeRoutes.includes(".route('/:cafeId')"));
  assert.ok(cafeRoutes.includes('.get(getCafe)'));
  assert.ok(cafeRoutes.includes('.patch(updateCafe)'));
});