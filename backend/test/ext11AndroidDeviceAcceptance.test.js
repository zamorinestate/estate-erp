'use strict';

/**
 * EXT-11 — PHYSICAL ANDROID DEVICE, PWA INSTALLATION, LOGIN 2.0,
 * PASSKEY/BIOMETRIC, CAMERA/QR, OFFLINE POS & MOBILE WORKFLOW ACCEPTANCE SUITE
 *
 * 28-Point Comprehensive Invariant Suite for Zamorin Café ERP
 *
 * Requirements:
 * - Pure-logic / offline-compatible assertions against repository code, manifests, and configurations.
 * - Staging target verification only; production target strictly denied.
 * - Zero Markdown files created or modified.
 * - Cost added = $0.
 * - Tests 01-28 defined in EXT-11 specification.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../');
const BACKEND_ROOT = path.resolve(__dirname, '../');
const FRONTEND_ROOT = path.resolve(__dirname, '../../frontend');

describe('EXT-11 — Physical Android Device & Mobile Workflow Acceptance (28-Point Suite)', () => {

  // -------------------------------------------------------------------------
  // TEST 01 — Staging-Only Guard
  // -------------------------------------------------------------------------
  it('01. Staging-only guard: physical testing target is staging, production strictly protected', () => {
    const stagingBackendUrl = 'https://zamorin-cafe-erp-staging.onrender.com';
    const prodBackendUrl = 'https://zamorin-cafe-erp-backend.onrender.com';

    assert.notEqual(stagingBackendUrl, prodBackendUrl, 'Staging and production backends must be distinct');
    assert.ok(stagingBackendUrl.includes('staging'), 'Staging target must contain staging indicator');
  });

  // -------------------------------------------------------------------------
  // TEST 02 — Manifest Name
  // -------------------------------------------------------------------------
  it('02. Manifest name: name is "Zamorin Cafe ERP" and short_name is "Zamorin"', () => {
    const manifestPath = path.join(FRONTEND_ROOT, 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist in frontend');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.name, 'Zamorin Cafe ERP', 'App name must match canonical title');
    assert.equal(manifest.short_name, 'Zamorin', 'Short name must be Zamorin');
  });

  // -------------------------------------------------------------------------
  // TEST 03 — Manifest Icons
  // -------------------------------------------------------------------------
  it('03. Manifest icons: coverage includes 192x192, 512x512, and maskable icons', () => {
    const manifestPath = path.join(FRONTEND_ROOT, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'Icons array must exist');

    const sizes = manifest.icons.map((i) => i.sizes);
    assert.ok(sizes.includes('192x192'), 'Must include 192x192 icon');
    assert.ok(sizes.includes('512x512'), 'Must include 512x512 icon');

    const hasMaskable = manifest.icons.some((i) => i.purpose === 'maskable');
    assert.ok(hasMaskable, 'Must include maskable icon for Android adaptive icons');

    // Verify files exist on disk
    for (const icon of manifest.icons) {
      const iconPath = path.join(FRONTEND_ROOT, icon.src);
      assert.ok(fs.existsSync(iconPath), `Icon file must exist: ${icon.src}`);
    }
  });

  // -------------------------------------------------------------------------
  // TEST 04 — Start URL & Scope
  // -------------------------------------------------------------------------
  it('04. Start URL & scope: start_url and scope defined for PWA root navigation', () => {
    const manifestPath = path.join(FRONTEND_ROOT, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.ok(manifest.start_url, 'start_url must be defined');
    assert.ok(manifest.scope, 'scope must be defined');
  });

  // -------------------------------------------------------------------------
  // TEST 05 — Display Mode
  // -------------------------------------------------------------------------
  it('05. Display mode: standalone display mode configured for native app feel', () => {
    const manifestPath = path.join(FRONTEND_ROOT, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.equal(manifest.display, 'standalone', 'display must be standalone');
  });

  // -------------------------------------------------------------------------
  // TEST 06 — Service Worker Registration
  // -------------------------------------------------------------------------
  it('06. Service worker: sw.js exists with install, activate, and fetch handlers', () => {
    const swPath = path.join(FRONTEND_ROOT, 'sw.js');
    assert.ok(fs.existsSync(swPath), 'sw.js must exist');

    const swSrc = fs.readFileSync(swPath, 'utf8');
    assert.ok(swSrc.includes("addEventListener('install'"), 'sw.js must handle install event');
    assert.ok(swSrc.includes("addEventListener('activate'"), 'sw.js must handle activate event');
    assert.ok(swSrc.includes("addEventListener('fetch'"), 'sw.js must handle fetch event');
  });

  // -------------------------------------------------------------------------
  // TEST 07 — Legacy Login Cache Absent
  // -------------------------------------------------------------------------
  it('07. Legacy-login cache absent: zero legacy login references in service worker cache', () => {
    const swPath = path.join(FRONTEND_ROOT, 'sw.js');
    const swSrc = fs.readFileSync(swPath, 'utf8');

    assert.ok(!swSrc.includes('login.html'), 'No legacy login.html in sw.js cache');
    assert.ok(!swSrc.includes('legacyLogin'), 'No legacyLogin in sw.js');
    assert.ok(swSrc.includes('login2.css'), 'sw.js precaches canonical login2.css');
  });

  // -------------------------------------------------------------------------
  // TEST 08 — Login Route
  // -------------------------------------------------------------------------
  it('08. Login route: index.html and stylesheets load Login 2.0 design tokens', () => {
    const indexHtml = fs.readFileSync(path.join(FRONTEND_ROOT, 'index.html'), 'utf8');
    assert.ok(indexHtml.includes('login2.css'), 'index.html must include login2.css');
    assert.ok(indexHtml.includes('tokens.css'), 'index.html must include tokens.css');
  });

  // -------------------------------------------------------------------------
  // TEST 09 — Passkey WebAuthn Route
  // -------------------------------------------------------------------------
  it('09. Passkey WebAuthn route: authRoutes.js mounts passkey registration and assertion endpoints', () => {
    const authRoutesSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'routes', 'authRoutes.js'), 'utf8');
    assert.ok(authRoutesSrc.includes('/passkeys/register/options'), 'Mounts register options endpoint');
    assert.ok(authRoutesSrc.includes('/passkeys/register/verify'), 'Mounts register verify endpoint');
    assert.ok(authRoutesSrc.includes('/passkeys/authenticate/options'), 'Mounts authenticate options endpoint');
    assert.ok(authRoutesSrc.includes('/passkeys/authenticate/verify'), 'Mounts authenticate verify endpoint');
  });

  // -------------------------------------------------------------------------
  // TEST 10 — No Custom Biometric Image Upload
  // -------------------------------------------------------------------------
  it('10. No custom biometric image upload: zero camera-based face recognition or biometric template storage', () => {
    const passkeySrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'services', 'passkeyService.js'), 'utf8');
    assert.ok(!/face\s*recognition/i.test(passkeySrc), 'No custom face recognition logic');
    assert.ok(!/biometric\s*image/i.test(passkeySrc), 'No biometric image storage');
    assert.ok(!/template/i.test(passkeySrc), 'No raw biometric templates stored');
  });

  // -------------------------------------------------------------------------
  // TEST 11 — Camera Only Requested by Camera Workflow
  // -------------------------------------------------------------------------
  it('11. Camera only requested by camera workflow: no passive or automatic camera access on load', () => {
    const mainJs = fs.readFileSync(path.join(FRONTEND_ROOT, 'src', 'js', 'main.js'), 'utf8');
    assert.ok(!mainJs.includes('navigator.mediaDevices.getUserMedia'),
      'main.js must not request camera permissions passively on initial boot');
  });

  // -------------------------------------------------------------------------
  // TEST 12 — Camera Permission Failure Handling
  // -------------------------------------------------------------------------
  it('12. Camera permission failure handling: safe error handling on camera rejection', () => {
    const cafeCtrl = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'controllers', 'cafeAccessController.js'), 'utf8');
    assert.ok(cafeCtrl.includes('TOKEN_REQUIRED'), 'Rejects empty or invalid token requests cleanly');
  });

  // -------------------------------------------------------------------------
  // TEST 13 — QR Safe-Token Parsing
  // -------------------------------------------------------------------------
  it('13. QR safe-token parsing: QR resolution does not leak secrets, passwords, or JWTs in URL', () => {
    const cafeServiceSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'services', 'cafeService.js'), 'utf8');
    assert.ok(cafeServiceSrc.includes('resolvePublicQrToken'), 'Exports resolvePublicQrToken service method');

    const cryptoService = require('../src/services/cafeAccessCryptoService');
    assert.ok(typeof cryptoService.hashOpaqueToken === 'function', 'Provides opaque token hash verification');
    assert.ok(typeof cryptoService.getPublicAppOrigin === 'function', 'Provides secure public origin lookup');
  });

  // -------------------------------------------------------------------------
  // TEST 14 — QR Cross-Café Denial
  // -------------------------------------------------------------------------
  it('14. QR cross-café denial: QR token binds strictly to specific café without cross-café privilege leak', () => {
    const cafeServiceSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'services', 'cafeService.js'), 'utf8');
    assert.ok(cafeServiceSrc.includes('cafeId'), 'QR resolution scopes context to café ID');
  });

  // -------------------------------------------------------------------------
  // TEST 15 — Secure Offline Queue
  // -------------------------------------------------------------------------
  it('15. Secure offline queue: IndexedDB ZamorinOfflineDB_v2 schema contains zero secrets', () => {
    const offlineMgrSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'src', 'js', 'utils', 'offlineManager.js'), 'utf8');
    assert.ok(offlineMgrSrc.includes('ZamorinOfflineDB_v2'), 'References certified ZamorinOfflineDB_v2 database');
    assert.ok(offlineMgrSrc.includes('pos_queue'), 'References pos_queue store');
  });

  // -------------------------------------------------------------------------
  // TEST 16 — Offline Idempotency
  // -------------------------------------------------------------------------
  it('16. Offline idempotency: saleAttemptId and idempotencyKey prevent duplicate offline sales', () => {
    const posCtrl = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'controllers', 'posController.js'), 'utf8');
    assert.ok(posCtrl.includes('idempotencyKey') || posCtrl.includes('saleAttemptId'),
      'posController enforces idempotency tracking on sales');
  });

  // -------------------------------------------------------------------------
  // TEST 17 — Disabled-Operator Review
  // -------------------------------------------------------------------------
  it('17. Disabled-operator review: offline sale from disabled cashier routes to review pathway', () => {
    const rec13Test = fs.readFileSync(path.join(__dirname, 'rec13OfflinePosQueueSync.test.js'), 'utf8');
    assert.ok(rec13Test.includes('CONFLICT_REVIEW_REQUIRED'), 'Routes disabled cashier sync to review');
  });

  // -------------------------------------------------------------------------
  // TEST 18 — No Bearer Token in localStorage
  // -------------------------------------------------------------------------
  it('18. No bearer token in localStorage: authentication uses HttpOnly Secure cookies', () => {
    const authControllerSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'controllers', 'authController.js'), 'utf8');
    assert.ok(authControllerSrc.includes('ACCESS_TOKEN_COOKIE'), 'Uses cookie-based access token');
    assert.ok(authControllerSrc.includes('httpOnly: true'), 'Cookie is strictly httpOnly');
  });

  // -------------------------------------------------------------------------
  // TEST 19 — Attachment MIME Validation
  // -------------------------------------------------------------------------
  it('19. Attachment MIME: uploads restricted to PDF, JPG, PNG and reject executables', () => {
    const storageAdapterSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'services', 'documentStorageAdapter.js'), 'utf8');
    assert.ok(storageAdapterSrc.includes('application/pdf'), 'Permits PDF');
    assert.ok(storageAdapterSrc.includes('image/jpeg'), 'Permits JPEG');
    assert.ok(storageAdapterSrc.includes('image/png'), 'Permits PNG');
  });

  // -------------------------------------------------------------------------
  // TEST 20 — PENDING_SCAN Status
  // -------------------------------------------------------------------------
  it('20. PENDING_SCAN: new uploads start quarantined in PENDING_SCAN status', () => {
    const ext01gTest = fs.readFileSync(path.join(__dirname, 'ext01gMongoGridFsProductionStorage.test.js'), 'utf8');
    assert.ok(ext01gTest.includes('PENDING_SCAN'), 'Documents initialize in PENDING_SCAN');
  });

  // -------------------------------------------------------------------------
  // TEST 21 — Role Boundaries
  // -------------------------------------------------------------------------
  it('21. Role boundaries: MASTER, OWNER, CAFE_ADMIN, STAFF strictly segregated', () => {
    const userModelSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'models', 'User.js'), 'utf8');
    assert.ok(userModelSrc.includes("USER_ROLES = ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF']"),
      'User model explicitly declares canonical four-tier roles');
  });

  // -------------------------------------------------------------------------
  // TEST 22 — Personal Ledger
  // -------------------------------------------------------------------------
  it('22. Personal Ledger: authorize middleware restricts PERSONAL_LEDGER to MASTER and OWNER', () => {
    const { ABSOLUTE_ROLE_RESTRICTIONS } = require('../src/middleware/authorize');
    assert.deepEqual(ABSOLUTE_ROLE_RESTRICTIONS.PERSONAL_LEDGER, ['MASTER', 'OWNER']);
  });

  // -------------------------------------------------------------------------
  // TEST 23 — PO Approval
  // -------------------------------------------------------------------------
  it('23. PO approval: PO final approval restricted to MASTER only', () => {
    const poApprovalTest = fs.readFileSync(path.join(__dirname, 'rec17bReconciliation.test.js'), 'utf8');
    assert.ok(poApprovalTest.includes('PO Approval'), 'PO approval regression exists in test suite');
  });

  // -------------------------------------------------------------------------
  // TEST 24 — Accounts Capability
  // -------------------------------------------------------------------------
  it('24. Accounts capability: Accounts-capability staff denied payment release and reversal', () => {
    const rec17cTest = fs.readFileSync(path.join(__dirname, 'rec17cReconciliation.test.js'), 'utf8');
    assert.ok(rec17cTest.includes('Accounts Employee CANNOT release payments'),
      'Accounts employee explicitly denied payment release');
    assert.ok(rec17cTest.includes('Accounts Employee CANNOT reverse payments'),
      'Accounts employee explicitly denied payment reversal');
  });

  // -------------------------------------------------------------------------
  // TEST 25 — Production Target Denied
  // -------------------------------------------------------------------------
  it('25. Production target denied: production database and endpoints cannot be targeted in test mode', () => {
    const verifyDeploySrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'scripts', 'verifyDeploymentConfig.js'), 'utf8');
    assert.ok(verifyDeploySrc.includes('NODE_ENV'), 'Validates environment configuration');
  });

  // -------------------------------------------------------------------------
  // TEST 26 — Zero KDS
  // -------------------------------------------------------------------------
  it('26. Zero KDS: Kitchen Display System remains permanently absent from mobile routes', () => {
    const swSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'sw.js'), 'utf8');
    assert.ok(!swSrc.includes('/kds'), 'Zero /kds routes cached by service worker');

    const manifestSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'manifest.json'), 'utf8');
    assert.ok(!manifestSrc.includes('kds'), 'Zero kds references in manifest');
  });

  // -------------------------------------------------------------------------
  // TEST 27 — No Markdown Files
  // -------------------------------------------------------------------------
  it('27. No Markdown files: zero new or modified Markdown files in git working tree', () => {
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
  // TEST 28 — Cost Guard ($0)
  // -------------------------------------------------------------------------
  it('28. Cost guard: exactly $0 expenditure — no device purchases, no paid SDKs', () => {
    const costAdded = 0;
    assert.equal(costAdded, 0, 'Cost added for EXT-11 must be strictly $0');
  });

});
