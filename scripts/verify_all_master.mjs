#!/usr/bin/env node
// =============================================================================
// ZAMORIN CAFÉ ERP — MASTER UNIFIED VERIFICATION & AUDIT ORCHESTRATOR
// =============================================================================

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SUITES = [
  {
    name: "1. Repository Secret & Hygiene Scanner",
    cmd: "node",
    args: ["scripts/scan_repository_secrets.mjs"],
    cwd: rootDir,
  },
  {
    name: "2. Backend JavaScript Syntax Validation",
    cmd: "node",
    args: ["backend/src/scripts/checkAllJavaScript.js"],
    cwd: rootDir,
  },
  {
    name: "3. Frontend Router Import Integrity",
    cmd: "node",
    args: ["verifyRouterImports.mjs"],
    cwd: path.join(rootDir, "frontend"),
  },
  {
    name: "4. UI/UX Design Quality & 4-Theme Consistency",
    cmd: "node",
    args: ["scripts/test_ui_ux_design_audit.mjs"],
    cwd: rootDir,
  },
  {
    name: "5. Auth Token & Session Security Runtime",
    cmd: "node",
    args: ["scripts/test_token_session_runtime.mjs"],
    cwd: rootDir,
  },
  {
    name: "6. Loading, Status & Error Runtime Recovery",
    cmd: "node",
    args: ["scripts/test_loading_error_runtime.mjs"],
    cwd: rootDir,
  },
  {
    name: "7. Treasury Passbook (25 Subroutes) & Personal Ledger (7 Tabs)",
    cmd: "node",
    args: ["scripts/verify_ledger_and_passbook_standalone.mjs"],
    cwd: rootDir,
  },
  {
    name: "8. Supported-Persona Browser Runtime & Authorization Boundaries",
    cmd: "node",
    args: ["scripts/audit_all_supported_personas.mjs"],
    cwd: rootDir,
  },
  {
    name: "9. Full Responsive Screen Matrix",
    cmd: "node",
    args: ["scripts/test_responsive_screens.mjs"],
    cwd: rootDir,
  },
  {
    name: "10. UI/UX Edge-Cases, Contrast, Text-Spacing & Human-Quality (10 ACs)",
    cmd: "node",
    args: ["scripts/test_ui_edge_cases.mjs"],
    cwd: rootDir,
  },
  {
    name: "11. Production Pre-Flight & Environment Invariants Audit",
    cmd: "node",
    args: ["scripts/audit_production_preflight.mjs"],
    cwd: rootDir,
  },
  {
    name: "12. Backend Functional Regression Test Suite",
    cmd: "npm",
    args: ["test"],
    cwd: path.join(rootDir, "backend"),
  },
];

function runSuite(suite) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const proc = spawn(suite.cmd, suite.args, {
      cwd: suite.cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      resolve({
        name: suite.name,
        code,
        passed: code === 0,
        durationMs,
        stdout,
        stderr,
      });
    });
  });
}

async function main() {
  console.log("\n===============================================================================");
  console.log("       ZAMORIN CAFÉ ERP — MASTER UNIFIED VERIFICATION RUNNER");
  console.log("===============================================================================\n");

  const results = [];
  let allPassed = true;

  for (const suite of SUITES) {
    process.stdout.write(`▶ Running: ${suite.name}... `);
    const res = await runSuite(suite);
    results.push(res);

    if (res.passed) {
      console.log(`\x1b[32mPASS\x1b[0m (${(res.durationMs / 1000).toFixed(1)}s)`);
    } else {
      console.log(`\x1b[31mFAIL\x1b[0m (exit code: ${res.code}, ${(res.durationMs / 1000).toFixed(1)}s)`);
      allPassed = false;
    }
  }

  console.log("\n===============================================================================");
  console.log("                          MASTER VERIFICATION SCORECARD");
  console.log("===============================================================================");

  for (const r of results) {
    const statusTag = r.passed ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
    const dur = `${(r.durationMs / 1000).toFixed(1)}s`.padStart(6);
    console.log(`  ${statusTag}  ${dur}  ${r.name}`);
  }

  console.log("===============================================================================");
  const passCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log(`Summary: ${passCount} / ${totalCount} Suites Passed | Total Time: ${(results.reduce((a, b) => a + b.durationMs, 0) / 1000).toFixed(1)}s`);
  console.log(`Status : ${allPassed ? '\x1b[32mCORE VERIFICATION SUITES PASSED — RELEASE GATES STILL REQUIRED\x1b[0m' : '\x1b[31mFAILURES DETECTED\x1b[0m'}`);
  console.log("===============================================================================\n");

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL MASTER RUNNER ERROR:", err);
  process.exit(1);
});
