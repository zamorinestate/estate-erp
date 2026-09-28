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
