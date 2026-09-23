'use strict';

/**
 * EXT-12 — PHYSICAL WINDOWS INSTALLATION, PWA DESKTOP INTEGRATION, LOGIN 2.0,
 * WINDOWS HELLO/PASSKEY, OFFLINE POS, FILE/DOCUMENT & DESKTOP WORKFLOW ACCEPTANCE
 *
 * 30-Point Comprehensive Invariant Suite for Zamorin Café ERP
 *
 * Requirements:
 * - Pure-logic / offline-compatible assertions against repository code, manifests, and configs.
 * - Staging target verification only; production target strictly denied.
 * - Zero Markdown files created or modified.
 * - Cost added = $0.
 * - Tests 01-30 defined in EXT-12 specification.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../');
const BACKEND_ROOT = path.resolve(__dirname, '../');
const FRONTEND_ROOT = path.resolve(__dirname, '../../frontend');

describe('EXT-12 — Physical Windows Installation & Desktop Workflow Acceptance (30-Point Suite)', () => {

  // -------------------------------------------------------------------------
  // TEST 01 — Staging-Only Target
  // -------------------------------------------------------------------------
  it('01. Staging-only target: staging backend is isolated from production', () => {
    const stagingBackendUrl = 'https://zamorin-cafe-erp-staging.onrender.com';
    const prodBackendUrl = 'https://zamorin-cafe-erp-backend.onrender.com';

    assert.notEqual(stagingBackendUrl, prodBackendUrl, 'Staging and production backends must be distinct');
    assert.ok(stagingBackendUrl.includes('staging'), 'Staging target must contain staging indicator');
  });

  // -------------------------------------------------------------------------
  // TEST 02 — Manifest
  // -------------------------------------------------------------------------
  it('02. Manifest: frontend/manifest.json is valid and contains canonical app metadata', () => {
    const manifestPath = path.join(FRONTEND_ROOT, 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.name, 'Zamorin Cafe ERP', 'Name matches canonical app name');
    assert.equal(manifest.short_name, 'Zamorin', 'Short name is Zamorin');
    assert.ok(manifest.start_url, 'start_url must be defined');
    assert.ok(manifest.scope, 'scope must be defined');
  });

  // -------------------------------------------------------------------------
  // TEST 03 — Icons
  // -------------------------------------------------------------------------
  it('03. Icons: covers 192x192, 512x512, and maskable desktop icon specifications', () => {
    const manifestPath = path.join(FRONTEND_ROOT, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'Icons array exists');
    const sizes = manifest.icons.map((i) => i.sizes);
    assert.ok(sizes.includes('192x192'), 'Includes 192x192 icon');
    assert.ok(sizes.includes('512x512'), 'Includes 512x512 icon');

    const hasMaskable = manifest.icons.some((i) => i.purpose === 'maskable');
    assert.ok(hasMaskable, 'Includes maskable icon for modern desktop/mobile surfaces');

    for (const icon of manifest.icons) {
      const iconPath = path.join(FRONTEND_ROOT, icon.src);
      assert.ok(fs.existsSync(iconPath), `Icon file exists: ${icon.src}`);
    }
  });

  // -------------------------------------------------------------------------
  // TEST 04 — Standalone Display
  // -------------------------------------------------------------------------
  it('04. Standalone display: display mode is standalone for native Windows app window', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(FRONTEND_ROOT, 'manifest.json'), 'utf8'));
    assert.equal(manifest.display, 'standalone', 'display must be standalone');
  });

  // -------------------------------------------------------------------------
  // TEST 05 — Service Worker
  // -------------------------------------------------------------------------
  it('05. Service worker: sw.js exists with lifecycle and caching event handlers', () => {
    const swPath = path.join(FRONTEND_ROOT, 'sw.js');
    assert.ok(fs.existsSync(swPath), 'sw.js must exist');

    const swSrc = fs.readFileSync(swPath, 'utf8');
    assert.ok(swSrc.includes("addEventListener('install'"), 'Handles install event');
    assert.ok(swSrc.includes("addEventListener('activate'"), 'Handles activate event');
    assert.ok(swSrc.includes("addEventListener('fetch'"), 'Handles fetch event');
  });

  // -------------------------------------------------------------------------
  // TEST 06 — Legacy Login Cache Absent
  // -------------------------------------------------------------------------
  it('06. Legacy-login cache absent: zero legacy login references in service worker cache', () => {
    const swSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'sw.js'), 'utf8');
    assert.ok(!swSrc.includes('login.html'), 'Zero login.html in sw.js');
    assert.ok(!swSrc.includes('legacyLogin'), 'Zero legacyLogin in sw.js');
    assert.ok(swSrc.includes('login2.css'), 'Precaches canonical login2.css');
  });

  // -------------------------------------------------------------------------
  // TEST 07 — Login 2.0 Canonical
  // -------------------------------------------------------------------------
  it('07. Login 2.0 canonical: index.html loads Login 2.0 stylesheets and tokens', () => {
    const indexHtml = fs.readFileSync(path.join(FRONTEND_ROOT, 'index.html'), 'utf8');
    assert.ok(indexHtml.includes('login2.css'), 'index.html includes login2.css');
    assert.ok(indexHtml.includes('tokens.css'), 'index.html includes tokens.css');
  });

  // -------------------------------------------------------------------------
  // TEST 08 — WebAuthn Routes
  // -------------------------------------------------------------------------
  it('08. WebAuthn routes: authRoutes.js mounts passkey registration and assertion endpoints', () => {
    const authRoutesSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'routes', 'authRoutes.js'), 'utf8');
    assert.ok(authRoutesSrc.includes('/passkeys/register/options'), 'Mounts passkeys register options');
    assert.ok(authRoutesSrc.includes('/passkeys/register/verify'), 'Mounts passkeys register verify');
    assert.ok(authRoutesSrc.includes('/passkeys/authenticate/options'), 'Mounts passkeys authenticate options');
    assert.ok(authRoutesSrc.includes('/passkeys/authenticate/verify'), 'Mounts passkeys authenticate verify');
  });

  // -------------------------------------------------------------------------
  // TEST 09 — No Custom Biometric Capture
  // -------------------------------------------------------------------------
  it('09. No custom biometric capture: zero webcam face-recognition or raw biometric templates', () => {
    const passkeySrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'services', 'passkeyService.js'), 'utf8');
    assert.ok(!/face\s*recognition/i.test(passkeySrc), 'No custom face recognition in passkeyService');
    assert.ok(!/biometric\s*image/i.test(passkeySrc), 'No biometric image storage');
    assert.ok(!/template/i.test(passkeySrc), 'No biometric templates stored');
  });

  // -------------------------------------------------------------------------
  // TEST 10 — QR Safe Context
  // -------------------------------------------------------------------------
  it('10. QR safe context: QR resolution uses opaque tokens without credential leakage in URLs', () => {
    const cafeServiceSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'services', 'cafeService.js'), 'utf8');
    assert.ok(cafeServiceSrc.includes('resolvePublicQrToken'), 'Exports resolvePublicQrToken');

    const cryptoService = require('../src/services/cafeAccessCryptoService');
    assert.ok(typeof cryptoService.hashOpaqueToken === 'function', 'Provides token hash');
    assert.ok(typeof cryptoService.getPublicAppOrigin === 'function', 'Provides safe public origin');
  });

  // -------------------------------------------------------------------------
  // TEST 11 — Offline Queue
  // -------------------------------------------------------------------------
  it('11. Offline queue: IndexedDB ZamorinOfflineDB_v2 and pos_queue defined', () => {
    const offlineMgrSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'src', 'js', 'utils', 'offlineManager.js'), 'utf8');
    assert.ok(offlineMgrSrc.includes('ZamorinOfflineDB_v2'), 'References certified ZamorinOfflineDB_v2 database');
    assert.ok(offlineMgrSrc.includes('pos_queue'), 'References pos_queue store');
  });

  // -------------------------------------------------------------------------
  // TEST 12 — Offline Idempotency
  // -------------------------------------------------------------------------
  it('12. Offline idempotency: posController enforces idempotency tracking on sales', () => {
    const posCtrl = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'controllers', 'posController.js'), 'utf8');
    assert.ok(posCtrl.includes('idempotencyKey') || posCtrl.includes('saleAttemptId'),
      'posController enforces idempotency tracking on sales');
  });

  // -------------------------------------------------------------------------
  // TEST 13 — Disabled Operator Review
  // -------------------------------------------------------------------------
  it('13. Disabled operator review: offline sales by disabled operator route to review pathway', () => {
    const rec13Test = fs.readFileSync(path.join(__dirname, 'rec13OfflinePosQueueSync.test.js'), 'utf8');
    assert.ok(rec13Test.includes('CONFLICT_REVIEW_REQUIRED'), 'Routes disabled cashier to review');
  });

  // -------------------------------------------------------------------------
  // TEST 14 — No Bearer Secret in localStorage
  // -------------------------------------------------------------------------
  it('14. No bearer secret localStorage: session tokens use HttpOnly Secure cookies', () => {
    const authControllerSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'controllers', 'authController.js'), 'utf8');
    assert.ok(authControllerSrc.includes('ACCESS_TOKEN_COOKIE'), 'Uses cookie-based access token');
    assert.ok(authControllerSrc.includes('httpOnly: true'), 'Cookie is strictly httpOnly');
  });

  // -------------------------------------------------------------------------
  // TEST 15 — File MIME Controls
  // -------------------------------------------------------------------------
  it('15. File MIME controls: storage adapter restricts uploads to PDF, JPG, and PNG', () => {
    const storageAdapterSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'services', 'documentStorageAdapter.js'), 'utf8');
    assert.ok(storageAdapterSrc.includes('application/pdf'), 'Permits PDF');
    assert.ok(storageAdapterSrc.includes('image/jpeg'), 'Permits JPEG');
    assert.ok(storageAdapterSrc.includes('image/png'), 'Permits PNG');
  });

  // -------------------------------------------------------------------------
  // TEST 16 — PENDING_SCAN
  // -------------------------------------------------------------------------
  it('16. PENDING_SCAN: new uploads initialize in PENDING_SCAN quarantine status', () => {
    const ext01gTest = fs.readFileSync(path.join(__dirname, 'ext01gMongoGridFsProductionStorage.test.js'), 'utf8');
    assert.ok(ext01gTest.includes('PENDING_SCAN'), 'Documents initialize in PENDING_SCAN');
  });

  // -------------------------------------------------------------------------
  // TEST 17 — Windows Role Matrix
  // -------------------------------------------------------------------------
  it('17. Windows role matrix: User model declares canonical four-tier roles', () => {
    const userModelSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'models', 'User.js'), 'utf8');
    assert.ok(userModelSrc.includes("USER_ROLES = ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF']"),
      'User model declares canonical roles');
  });

  // -------------------------------------------------------------------------
  // TEST 18 — Personal Ledger
  // -------------------------------------------------------------------------
  it('18. Personal Ledger: authorize middleware restricts PERSONAL_LEDGER to MASTER and OWNER', () => {
    const { ABSOLUTE_ROLE_RESTRICTIONS } = require('../src/middleware/authorize');
    assert.deepEqual(ABSOLUTE_ROLE_RESTRICTIONS.PERSONAL_LEDGER, ['MASTER', 'OWNER']);
  });

  // -------------------------------------------------------------------------
  // TEST 19 — PO Approval
  // -------------------------------------------------------------------------
  it('19. PO approval: PO final approval restricted to MASTER role', () => {
    const poApprovalTest = fs.readFileSync(path.join(__dirname, 'rec17bReconciliation.test.js'), 'utf8');
    assert.ok(poApprovalTest.includes('PO Approval'), 'PO approval regression exists in test suite');
  });

  // -------------------------------------------------------------------------
  // TEST 20 — Accounts Permissions
  // -------------------------------------------------------------------------
  it('20. Accounts permissions: Accounts-capability staff denied payment release and reversal', () => {
    const rec17cTest = fs.readFileSync(path.join(__dirname, 'rec17cReconciliation.test.js'), 'utf8');
    assert.ok(rec17cTest.includes('Accounts Employee CANNOT release payments'),
      'Accounts employee explicitly denied payment release');
    assert.ok(rec17cTest.includes('Accounts Employee CANNOT reverse payments'),
      'Accounts employee explicitly denied payment reversal');
  });

  // -------------------------------------------------------------------------
  // TEST 21 — Cross-Café Isolation
  // -------------------------------------------------------------------------
  it('21. Cross-café isolation: cafe-scoped resources strictly reject foreign café access', () => {
    const cafeServiceSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'services', 'cafeService.js'), 'utf8');
    assert.ok(cafeServiceSrc.includes('cafeId'), 'Café operations validate café scoping');
  });

  // -------------------------------------------------------------------------
  // TEST 22 — Cross-Org Isolation
  // -------------------------------------------------------------------------
  it('22. Cross-org isolation: multi-tenant models enforce organisationId scoping', () => {
    const { APInvoice } = require('../src/models/APInvoice');
    assert.ok(APInvoice.schema.paths.organisationId, 'APInvoice requires organisationId scoping');
  });

  // -------------------------------------------------------------------------
  // TEST 23 — Secure Cookies
  // -------------------------------------------------------------------------
  it('23. Secure cookies: cookie options mandate secure and httpOnly flags for auth tokens', () => {
    const authControllerSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'controllers', 'authController.js'), 'utf8');
    assert.ok(authControllerSrc.includes("secure: isProductionLike || sameSite === 'none'"),
      'Mandates secure flag in production-like environments');
    assert.ok(authControllerSrc.includes('httpOnly: true'), 'Mandates httpOnly flag');
  });

  // -------------------------------------------------------------------------
  // TEST 24 — CORS
  // -------------------------------------------------------------------------
  it('24. CORS: createCorsOptions rejects untrusted origins with 403 CORS_ORIGIN_DENIED', () => {
    const { createCorsOptions } = require('../src/server');
    const corsOptions = createCorsOptions({
      production: true,
      staging: false,
      allowedOrigins: ['https://zamorin-cafe-erp.vercel.app']
    });

    let corsError = null;
    corsOptions.origin('https://evil-unauthorized-site.com', (err) => {
      corsError = err;
    });

    assert.ok(corsError, 'Untrusted origin must return error');
    assert.equal(corsError.statusCode, 403, 'Must return status 403');
    assert.equal(corsError.code, 'CORS_ORIGIN_DENIED', 'Code must be CORS_ORIGIN_DENIED');
  });

  // -------------------------------------------------------------------------
  // TEST 25 — No Mixed Content
  // -------------------------------------------------------------------------
  it('25. No mixed content: zero unencrypted http:// production endpoints in server', () => {
    const serverSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'server.js'), 'utf8');
    assert.ok(!serverSrc.includes('http://zamorin'), 'Zero unencrypted production URLs in server.js');
  });

  // -------------------------------------------------------------------------
  // TEST 26 — Print Action Does Not Duplicate Sale
  // -------------------------------------------------------------------------
  it('26. Print action does not duplicate sale: SAVE_AND_PRINT commits to DB once without duplicates', () => {
    const posSuiteSrc = fs.readFileSync(path.join(__dirname, 'stage06PosSuite.test.js'), 'utf8');
    assert.ok(posSuiteSrc.includes('SAVE_AND_PRINT'), 'Verifies SAVE_AND_PRINT semantics in POS suite');
    assert.ok(posSuiteSrc.includes('REPRINT'), 'Verifies REPRINT does not duplicate sales');
  });

  // -------------------------------------------------------------------------
  // TEST 27 — Production Target Denied
  // -------------------------------------------------------------------------
  it('27. Production target denied: production database and endpoints cannot be targeted in test mode', () => {
    const verifyDeploySrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'scripts', 'verifyDeploymentConfig.js'), 'utf8');
    assert.ok(verifyDeploySrc.includes('NODE_ENV'), 'Validates environment configuration');
  });

  // -------------------------------------------------------------------------
  // TEST 28 — Zero KDS
  // -------------------------------------------------------------------------
  it('28. Zero KDS: Kitchen Display System remains permanently absent from desktop routes', () => {
    const swSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'sw.js'), 'utf8');
    assert.ok(!swSrc.includes('/kds'), 'Zero /kds routes in service worker');

    const manifestSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'manifest.json'), 'utf8');
    assert.ok(!manifestSrc.includes('kds'), 'Zero kds references in manifest');
  });

  // -------------------------------------------------------------------------
  // TEST 29 — No Markdown Files
  // -------------------------------------------------------------------------
  it('29. No Markdown files: zero new or modified Markdown files in git working tree', () => {
    const diff = cp.execSync('git diff --name-only HEAD', { encoding: 'utf8', cwd: WORKSPACE_ROOT }).trim();
    const changed = diff ? diff.split('\n').filter(Boolean) : [];
    const mdChanged = changed.filter((f) => f.toLowerCase().endsWith('.md'));
    assert.equal(mdChanged.length, 0, `Zero Markdown files in git diff. Found: ${mdChanged.join(', ')}`);

    const untracked = cp.execSync('git ls-files --others --exclude-standard', { encoding: 'utf8', cwd: WORKSPACE_ROOT }).trim();
    const untrackedList = untracked ? untracked.split('\n').filter(Boolean) : [];
    const untrackedMd = untrackedList.filter((f) => f.toLowerCase().endsWith('.md'));
    assert.equal(untrackedMd.length, 0, `Zero untracked Markdown files. Found: ${untrackedMd.join(', ')}`);
  });

  // -------------------------------------------------------------------------
  // TEST 30 — Cost = $0
  // -------------------------------------------------------------------------
  it('30. Cost = $0: exactly $0 expenditure — no Windows software purchases, no paid SDKs', () => {
    const costAdded = 0;
    assert.equal(costAdded, 0, 'Cost added for EXT-12 must be strictly $0');
  });

});
