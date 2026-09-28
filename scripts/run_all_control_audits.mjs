#!/usr/bin/env node
// =============================================================================
// ZAMORIN CAFÉ ERP — MASTER AUDIT SUITE RUNNER
// scripts/run_all_control_audits.mjs
// =============================================================================

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AUDITS = [
  'audit_final_control_arithmetic.mjs',
  'audit_final_route_set.mjs',
  'audit_user_visible_stubs.mjs',
  'audit_interactive_control_contract_smoke.mjs',
  'audit_all_navigation_controls.mjs',
  'audit_readonly_actions.mjs',
  'audit_mutation_actions.mjs',
  'audit_all_forms.mjs',
  'audit_all_modals.mjs',
  'audit_all_table_actions.mjs',
  'audit_all_file_actions.mjs',
  'audit_all_pickers.mjs',
  'audit_control_postconditions.mjs',
  'audit_control_actionability.mjs',
  'audit_control_keyboard_access.mjs'
];

console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║        ZAMORIN CAFÉ ERP — CONTROL AUDIT RUNNER            ║');
console.log('║        STATIC/CONTRACT CHECKS · REAL-BROWSER RELEASE GATE SEPARATE   ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

let allPass = true;

for (const script of AUDITS) {
  const fullPath = join(__dirname, script);
  console.log(`▶ Running: ${script}...`);
  const res = spawnSync(process.execPath, [fullPath], { stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`❌ Audit Failed: ${script}`);
    allPass = false;
    break;
  }
  console.log('');
}

console.log('═'.repeat(72));
if (allPass) {
  console.log(`✅ CONTROL AUDIT RESULT: PASS ACROSS ${AUDITS.length} SUITES`);
  console.log('STATIC/CONTRACT AUDITS PASSED · REAL-BROWSER RELEASE GATE REMAINS REQUIRED');
  process.exit(0);
} else {
  console.error('❌ ONE OR MORE AUDITS FAILED');
  process.exit(1);
}
