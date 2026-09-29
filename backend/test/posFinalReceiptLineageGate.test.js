'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..');
const repoRoot = path.join(backendRoot, '..');

function readRepo(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('FINAL POS RECEIPT LINEAGE — canonical CI retains every authoritative sale/print/evidence suite', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(backendRoot, 'package.json'), 'utf8'));
  const command = pkg.scripts.test;
  const required = [
    'test/rec04aTransactionIntegrityCertification.test.js',
    'test/rec04bDistributedIdempotencyReconciliation.test.js',
    'test/recoveryPosSavePrintReprintLifecycle.test.js',
    'test/rec04cPhysicalPrintAcknowledgement.test.js',
    'test/rec04dDeviceAttestation.test.js',
    'test/rec04eContentBoundTransport.test.js',
    'test/posFinalReceiptLineageGate.test.js',
  ];

  for (const suite of required) {
    assert.match(
      command,
      new RegExp(suite.replace(/[.*+?^$()|[\]{}]/g, '\\$&')),
      `${suite} must stay in canonical backend CI`
    );
  }
});

test('FINAL POS RECEIPT LINEAGE — sale commits before PrintJob dispatch and carries statutory identity', () => {
  const source = readRepo('backend/src/services/posOrderService.js');

  assert.match(source, /allocateInvoiceNumber/);
  assert.match(source, /saleFinalized:\s*true/);
  assert.match(source, /const printJobId = createPrintJobId\('RECEIPT'\)/);
  assert.match(source, /billId,/);
  assert.match(source, /invoiceNumber,/);
  assert.match(source, /printDispatchAuthorized = printTrackingPersisted === true/);
  assert.match(source, /printJobId: printDispatchAuthorized \? printJobId : null/);
});

test('FINAL POS RECEIPT LINEAGE — exact ESC\/POS bytes are frozen and SHA-256 bound to every dispatch', () => {
  const source = readRepo('backend/src/services/posOrderService.js');
  const lifecycle = readRepo('backend/test/recoveryPosSavePrintReprintLifecycle.test.js');

  assert.match(source, /rawBuffer: escPosBuffer/);
  assert.match(source, /printBufferBase64: escPosBuffer\.toString\('base64'\)/);
  assert.match(source, /payloadSha256: crypto\.createHash\('sha256'\)\.update\(escPosBuffer\)\.digest\('hex'\)/);
  assert.match(source, /payloadBytes: escPosBuffer\.length/);
  assert.match(source, /printBufferBase64: printResult\.printBufferBase64/);

  assert.match(lifecycle, /SAVE_AND_PRINT response hash must bind the exact returned ESC\/POS bytes/);
  assert.match(lifecycle, /PRINT must allocate a distinct PrintJob/);
  assert.match(lifecycle, /REPRINT must allocate its own PrintJob/);
});

test('FINAL POS RECEIPT LINEAGE — local transport verifies exact content before physical write and blocks ambiguous resend', () => {
  const bridge = readRepo('scripts/zamorin_local_printer_bridge.mjs');
  const till = readRepo('frontend/src/js/pages/posTill.js');

  assert.match(bridge, /PRINT_PAYLOAD_HASH_MISMATCH/);
  assert.match(bridge, /PRINT_PAYLOAD_LENGTH_MISMATCH/);
  assert.match(bridge, /state: 'WRITE_STARTED'/);
  assert.match(bridge, /state: 'TRANSPORT_ACCEPTED'/);
  assert.match(bridge, /PRINT_TRANSPORT_OUTCOME_UNKNOWN/);
  assert.match(bridge, /contentBindingVerified: true/);
  assert.match(bridge, /printerIdentityVerified: false/);
  assert.match(bridge, /physicalCompletionVerified: false/);

  const rawIndex = till.indexOf('hardwareBridge.printCanonicalEscPos(dispatch)');
  const browserIndex = till.indexOf('window.print();');
  assert.ok(rawIndex >= 0, 'POS must attempt exact-byte local transport');
  assert.ok(browserIndex > rawIndex, 'Browser print remains a later unverified fallback');
});

test('FINAL POS RECEIPT LINEAGE — terminal evidence is atomically copied from PrintJob into Bill audit lineage', () => {
  const source = readRepo('backend/src/services/posOrderService.js');

  assert.match(source, /executeTransactionWithRetry\(async \(session\) =>/);
  assert.match(source, /PRINT_ACK_TRANSACTION_REQUIRED/);
  assert.match(source, /await job\.save\(session \? \{ session \} : undefined\)/);
  assert.match(source, /billPrintJob\.payloadSha256 = job\.payloadSha256/);
  assert.match(source, /billPrintJob\.payloadBytes = job\.payloadBytes/);
  assert.match(source, /billPrintJob\.transportMode = job\.transportMode/);
  assert.match(source, /billPrintJob\.evidenceLevel = job\.evidenceLevel/);
  assert.match(source, /billPrintJob\.ackSignatureHash = job\.ackSignatureHash/);
  assert.match(source, /await bill\.save\(session \? \{ session \} : undefined\)/);
});

test('FINAL POS RECEIPT LINEAGE — reprints are separate immutable print events and can never reopen the drawer', () => {
  const source = readRepo('backend/src/services/posOrderService.js');
  const lifecycle = readRepo('backend/test/recoveryPosSavePrintReprintLifecycle.test.js');

  assert.match(source, /allowDrawerKick:\s*false/);
  assert.match(source, /jobType:\s*'REPRINT'/);
  assert.match(source, /drawerKickRequested:\s*false/);
  assert.match(source, /drawerKickStatus:\s*'NOT_REQUESTED'/);

  assert.match(lifecycle, /REPRINT must allocate its own PrintJob/);
  assert.match(lifecycle, /assert\.equal\(printJob\.drawerKickRequested, false\)/);
  assert.match(lifecycle, /assert\.equal\(printJob\.drawerKickStatus, 'NOT_REQUESTED'\)/);
});

test('FINAL POS RECEIPT LINEAGE — offline capture cannot impersonate the server-issued statutory receipt', () => {
  const till = readRepo('frontend/src/js/pages/posTill.js');
  const offline = readRepo('backend/src/services/offlineSyncService.js');

  assert.match(till, /OFFLINE SALE — PENDING SYNCHRONIZATION/);
  assert.match(till, /Official statutory GST invoice will be allocated upon server synchronization/);
  assert.match(offline, /LOCAL_DRAFT_ALLOWED/);
  assert.doesNotMatch(
    offline,
    /invoiceNumber\s*=\s*[\`'"][^\`'"]*[\`'"]/,
    'Offline queue must never allocate a final statutory invoice'
  );
});


test('FINAL POS RECEIPT LINEAGE — deployment pre-flight cannot overclaim release certification', () => {
  const preflight = readRepo('backend/src/scripts/verifyDeploymentConfig.js');
  const readiness = readRepo('scripts/check_deploy_readiness.mjs');
  const finalGate = readRepo('scripts/check_pr16_merge_readiness.mjs');
  const rootPkg = JSON.parse(readRepo('package.json'));

  assert.doesNotMatch(preflight, /READY FOR PRODUCTION LAUNCH/);
  assert.match(preflight, /Release certification still requires exact-head CI/);
  assert.match(readiness, /PRE-FLIGHT CONFIGURATION PASSED — RELEASE CERTIFICATION STILL REQUIRED/);

  assert.match(finalGate, /REC04E_HARDWARE_REPORT_REQUIRED/);
  assert.match(finalGate, /CANDIDATE_SHA_MISMATCH/);
  assert.match(finalGate, /WORKING_TREE_NOT_CLEAN/);
  assert.match(finalGate, /retiredMasterPersonaInvariant\.test\.js/);
  assert.match(finalGate, /posFinalReceiptLineageGate\.test\.js/);
  assert.match(finalGate, /posFinalFinancialIntegrityGate\.test\.js/);
  assert.match(finalGate, /verify_rec04e_hardware_acceptance\.mjs/);
  assert.equal(
    rootPkg.scripts['check:pr16-merge-readiness'],
    'node scripts/check_pr16_merge_readiness.mjs'
  );
});


test('FINAL POS RECEIPT LINEAGE — physical acceptance evidence defaults outside the Git working tree', () => {
  const runner = readRepo('scripts/run_rec04e_hardware_acceptance.mjs');
  const gitignore = readRepo('.gitignore');

  assert.match(
    runner,
    /\.local-evidence-storage\/rec04e-hardware/
  );
  assert.match(gitignore, /\.local-evidence-storage\//);
  assert.doesNotMatch(
    runner,
    /args\.output \|\| 'artifacts\/rec04e-hardware'/
  );
});


test('FINAL POS RECEIPT LINEAGE — generic deploy readiness cannot report fully deploy-ready without release evidence', () => {
  const readiness = readRepo('scripts/check_deploy_readiness.mjs');
  const releaseGate = readRepo('.github/workflows/release-gate.yml');

  assert.match(readiness, /isPreflightReady: isReady/);
  assert.match(readiness, /isDeployReady: false/);
  assert.match(readiness, /releaseCertificationRequired: true/);
  assert.match(readiness, /process\.exit\(result\.isPreflightReady \? 0 : 1\)/);

  assert.match(releaseGate, /Run Canonical Regression Suite/);
  assert.match(releaseGate, /run: npm test/);
  assert.match(releaseGate, /Hardware Acceptance: EXTERNAL REC-04E CERTIFIED REPORT REQUIRED/);
  assert.match(releaseGate, /Production Verdict : NOT ISSUED BY THIS SOFTWARE-ONLY WORKFLOW/);
});


test('FINAL POS RECEIPT LINEAGE — canonical CI includes repository-wide retired-persona and hard-coded café fallback guards', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(backendRoot, 'package.json'), 'utf8'));
  const command = String(pkg.scripts?.test || '');

  for (const suite of [
    'test/retiredMasterPersonaInvariant.test.js',
    'test/cafeScopeFallbackInvariant.test.js',
    'test/hardcodedCafeFallbackInvariant.test.js',
  ]) {
    assert.ok(command.includes(suite), `${suite} must remain in canonical CI`);
  }
});
