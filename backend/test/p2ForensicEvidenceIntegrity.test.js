'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('P2 forensic evidence integrity: smoke/static checks cannot masquerade as production certification', () => {
  const oldRuntimePath = path.join(ROOT, 'scripts', 'audit_all_interactive_controls_runtime.mjs');
  const oldPersonaPath = path.join(ROOT, 'scripts', 'audit_all_five_personas.mjs');
  const strayZero = path.join(ROOT, '0');

  assert.equal(fs.existsSync(oldRuntimePath), false, 'misleading real-runtime audit filename must stay retired');
  assert.equal(fs.existsSync(oldPersonaPath), false, 'stale five-persona audit filename must stay retired');
  assert.equal(fs.existsSync(strayZero), false, 'stray root test artifact must stay absent');

  const smoke = read('scripts/audit_interactive_control_contract_smoke.mjs');
  assert.match(smoke, /not a real-browser certification/i);
  assert.doesNotMatch(smoke, /REAL RUNTIME AUDIT RESULT|ZERO DEAD BUTTONS/i);

  const arithmetic = read('scripts/audit_final_control_arithmetic.mjs');
  assert.doesNotMatch(arithmetic, /final_control_runtime_results\.json|REAL_POINTER_CLICKS|mutationsCommitted:\s*141/i);
  assert.match(arithmetic, /DECLARED_CLASSIFICATION_BASELINE/);

  const staticVerifier = read('scripts/master_system_verification.mjs');
  assert.doesNotMatch(staticVerifier, /100% PRODUCTION READY & CERTIFIED/i);
  assert.match(staticVerifier, /RELEASE GATES STILL REQUIRED/);

  const verifier = read('scripts/verify_all_master.mjs');
  assert.doesNotMatch(verifier, /100% PRODUCTION READY & CERTIFIED|Five-Persona/i);
  assert.match(verifier, /RELEASE GATES STILL REQUIRED/);

  const runner = read('scripts/run_all_control_audits.mjs');
  assert.doesNotMatch(runner, /FINAL CLOSURE RESULT: 100% PASS|ZERO DEAD BUTTONS/i);
  assert.match(runner, /REAL-BROWSER RELEASE GATE REMAINS REQUIRED/);
});


test('P2 forensic credential integrity: executable scripts cannot bypass hardcoded-password scanning', () => {
  const scanner = read('scripts/scan_repository_secrets.mjs');
  assert.doesNotMatch(scanner, /filePath\.includes\(['"]scripts['"]\)/, 'scripts directory must not be blanket-exempt from password scanning');

  for (const rel of [
    'scripts/test_staff_login_reload.mjs',
    'scripts/test_staff_buttons_and_master_approvals.mjs',
    'scripts/test_session_lifecycle.mjs',
  ]) {
    const source = read(rel);
    assert.match(source, /requiredEnv\(/, `${rel} must require environment-supplied credentials`);
    assert.doesNotMatch(source, /password\s*:\s*['"][^'"]{8,}['"]/i, `${rel} must not embed a reusable password literal`);
  }
});


test('P2 runtime credential invariant: application source contains no built-in reusable login credentials', () => {
  const runtimeFiles = [
    'backend/src/config/environment.js',
    'backend/src/scripts/startDev.js',
    'backend/src/scripts/seedInitialData.js',
    'frontend/src/js/main.js',
    'backend/scripts/seed_canonical_users.mjs',
  ];

  for (const rel of runtimeFiles) {
    const source = read(rel);
    assert.doesNotMatch(source, /password\s*:\s*['"][^'"]{8,}['"]/i, `${rel} must not embed reusable password literals`);
  }

  const frontendMain = read('frontend/src/js/main.js');
  assert.doesNotMatch(frontendMain, /DEV_CREDENTIALS|Automatically acquire authentic JWT session/i);
  assert.doesNotMatch(frontendMain, /userId\s*===\s*["']MU-0001["']\s*&&[\s\S]{0,160}email/i);
  assert.match(frontendMain, /isPrimaryMaster:\s*user\?\.isPrimaryMaster\s*===\s*true/);
});


test('P2 forensic hygiene: obsolete live-like credential utilities stay retired', () => {
  for (const rel of [
    'backend/scripts/audit_vercel_comprehensive.mjs',
    'backend/scripts/certify_final_real_data_gate.mjs',
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, rel)), false, `${rel} must remain retired`);
  }
});


test('P2 forensic evidence integrity: supporting-file evidence cannot self-certify production readiness', () => {
  const docsGenerator = read('scripts/generate_supporting_files_docs.mjs');
  assert.doesNotMatch(docsGenerator, /CLOSED AND CERTIFIED 100% COMPLETE|100% Certified Standard Compliant|100% Single Authority Certified/i);

  const browserAudit = read('scripts/audit_supporting_files_browser_runtime.mjs');
  assert.doesNotMatch(browserAudit, /certified 100% operational/i);
  assert.match(browserAudit, /not a production certification/i);
});


test('P2 credential integrity: seed PINs must never be source-code defaults', () => {
  const seed = read('backend/src/scripts/seedInitialData.js');
  assert.doesNotMatch(seed, /bcrypt\.hash\(['"]\d{6}['"]/);
  for (const name of ['SEED_CAFE_OPERATIONS_PIN', 'SEED_OPERATOR_PIN_1', 'SEED_OPERATOR_PIN_2']) {
    assert.match(seed, new RegExp(name));
  }
});


test('P2 persona integrity: supported persona arithmetic stays canonical', () => {
  const routeAudit = read('scripts/audit_final_route_set.mjs');
  assert.match(routeAudit, /const PERSONAS_COUNT = 4;/);
  assert.doesNotMatch(routeAudit, /const PERSONAS_COUNT = 5;/);

  const personaAudit = read('scripts/audit_all_supported_personas.mjs');
  assert.doesNotMatch(personaAudit, /FIVE-PERSONA/i);

  const docsGenerator = read('scripts/generate_supporting_files_docs.mjs');
  assert.doesNotMatch(docsGenerator, /FIVE-PERSONA/i);
});


test('P2 runtime authority/secret logging: malformed MASTER fails closed and bootstrap passwords are never logged', () => {
  const frontendMain = read('frontend/src/js/main.js');
  assert.match(frontendMain, /if \(user\?\.isPrimaryMaster !== true\)[\s\S]{0,180}role:\s*["']staff["']/);
  assert.doesNotMatch(frontendMain, /role:\s*["']master["'][\s\S]{0,120}isPrimaryMaster:\s*false/);

  const startDev = read('backend/src/scripts/startDev.js');
  assert.doesNotMatch(startDev, /Seed complete[^\n]*\$\{masterPassword\}/);
  assert.match(startDev, /password intentionally not logged/i);
});


test('P2 seed integrity: production/minimal seed cannot create demo identities and runSeed cannot be shadowed', () => {
  const seed = read('backend/src/scripts/seedInitialData.js');
  assert.equal((seed.match(/async function runSeed\s*\(/g) || []).length, 1, 'runSeed must have exactly one authoritative implementation');
  assert.match(seed, /Minimal\/production seed mode: demo Café Operations users/);
  assert.doesNotMatch(seed, /organisationId[^\n]*\|\|\s*['"]ZAMORIN['"]/);
  assert.doesNotMatch(seed, /masterUserId[^\n]*\|\|\s*['"]MU-0001['"]/);

  const startDev = read('backend/src/scripts/startDev.js');
  assert.doesNotMatch(startDev, /masterUser\?\.userId\s*\|\|\s*['"]MU-0001['"]/);

  const envTemplate = read('backend/.env.example');
  for (const name of ['SEED_DEMO_PASSWORD', 'SEED_CAFE_OPERATIONS_PIN', 'SEED_OPERATOR_PIN_1', 'SEED_OPERATOR_PIN_2']) {
    assert.match(envTemplate, new RegExp(name));
  }
});
