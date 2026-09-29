#!/usr/bin/env node

/**
 * PR #16 FINAL MERGE-READINESS CERTIFIER
 *
 * This command is intentionally stricter than configuration/deployment
 * pre-flight. It refuses certification unless:
 *   - the working tree is exactly the requested candidate SHA and is clean;
 *   - canonical backend CI contains the final financial, receipt-lineage,
 *     REC-04E and retired-persona gates;
 *   - a real-hardware REC-04E acceptance report exists and passes the
 *     dedicated verifier.
 *
 * GitHub workflow conclusions still need to be checked on the same SHA before
 * changing the PR from draft; this local certifier never merges or deploys.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const [rawKey, inline] = current.slice(2).split('=', 2);
    if (inline !== undefined) {
      args[rawKey] = inline;
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[rawKey] = argv[i + 1];
      i += 1;
    } else {
      args[rawKey] = 'true';
    }
  }
  return args;
}

function git(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const err = new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
    err.code = 'GIT_COMMAND_FAILED';
    throw err;
  }
  return String(result.stdout || '').trim();
}

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

const args = parseArgs(process.argv.slice(2));
const expectedSha = String(args['expected-sha'] || '').trim().toLowerCase();
const hardwareReport = String(args['hardware-report'] || '').trim();

if (!/^[a-f0-9]{40}$/.test(expectedSha)) {
  fail(
    'EXPECTED_SHA_REQUIRED',
    'Usage: npm run check:pr16-merge-readiness -- --expected-sha=<40-char-sha> --hardware-report=<report.json>'
  );
}
if (!hardwareReport) {
  fail(
    'REC04E_HARDWARE_REPORT_REQUIRED',
    'A certified REC-04E real-hardware acceptance report is required.'
  );
}

const actualSha = git(['rev-parse', 'HEAD']).toLowerCase();
if (actualSha !== expectedSha) {
  fail(
    'CANDIDATE_SHA_MISMATCH',
    `Expected candidate ${expectedSha}, but working tree HEAD is ${actualSha}.`
  );
}

const porcelain = git(['status', '--porcelain']);
if (porcelain) {
  fail(
    'WORKING_TREE_NOT_CLEAN',
    'Final certification requires a clean working tree.'
  );
}

const backendPkg = JSON.parse(
  fs.readFileSync(path.resolve('backend/package.json'), 'utf8')
);
const canonical = String(backendPkg.scripts?.test || '');
const requiredSuites = [
  'test/recoveryPosSavePrintReprintLifecycle.test.js',
  'test/rec04eContentBoundTransport.test.js',
  'test/retiredMasterPersonaInvariant.test.js',
  'test/posFinalReceiptLineageGate.test.js',
  'test/posFinalFinancialIntegrityGate.test.js',
];
for (const suite of requiredSuites) {
  if (!canonical.includes(suite)) {
    fail(
      'CANONICAL_CI_GATE_MISSING',
      `${suite} is missing from backend canonical CI.`
    );
  }
}

const reportPath = path.resolve(hardwareReport);
if (!fs.existsSync(reportPath)) {
  fail(
    'REC04E_HARDWARE_REPORT_NOT_FOUND',
    `Hardware acceptance report not found: ${reportPath}`
  );
}

const verify = spawnSync(
  process.execPath,
  [
    path.resolve('scripts/verify_rec04e_hardware_acceptance.mjs'),
    reportPath,
  ],
  {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);
if (verify.status !== 0) {
  fail(
    'REC04E_HARDWARE_ACCEPTANCE_NOT_CERTIFIED',
    String(verify.stderr || verify.stdout || 'Hardware acceptance verification failed.').trim()
  );
}

console.log(JSON.stringify({
  certified: true,
  candidateSha: actualSha,
  workingTreeClean: true,
  canonicalGatesVerified: requiredSuites,
  hardwareAcceptanceReport: reportPath,
  githubExactHeadCiRequired: true,
  prMustRemainDraftUntilExplicitApproval: true,
  mergePerformed: false,
  deploymentPerformed: false,
}, null, 2));
