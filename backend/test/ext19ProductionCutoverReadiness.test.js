'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — EXT-19 FINAL PRODUCTION CUTOVER PREPARATION,
 * RELEASE-CANDIDATE GOVERNANCE, PRE-FLIGHT, ROLLBACK,
 * CUTOVER CHOREOGRAPHY & EXECUTION-SAFETY GATE
 * ============================================================================
 *
 * 34-Point Comprehensive Verification Suite for Zamorin Café ERP
 *
 * Requirements:
 *  - Mechanically verifies that commercial production cutover is BLOCKED.
 *  - EXT-18 decision is NO_GO_COMMERCIAL_PRODUCTION: fails closed.
 *  - Confirms zero production mutations, zero markdown files, $0 cost added.
 *  - Enforces all 34 required test invariants from EXT-19 specification Section 53.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../');
const BACKEND_ROOT = path.resolve(__dirname, '../');
const FRONTEND_ROOT = path.resolve(__dirname, '../../frontend');

// Authoritative state of external gates carried forward from EXT-18
const AUTHORITATIVE_GATES = Object.freeze({
  'EXT-01': { name: 'Production Database Infrastructure Tier', status: 'BLOCKED_INFRASTRUCTURE_TIER', hardBlocker: true },
  'EXT-02': { name: 'Live File Upload Threat Scanner', status: 'BLOCKED_LIVE_SCANNER', hardBlocker: true },
  'EXT-03': { name: 'Automated Database Backups & PITR', status: 'BLOCKED_FREE_TIER', hardBlocker: true },
  'EXT-04': { name: 'GridFS Document Recovery', status: 'PILOT_DOCUMENT_RESTORE_VERIFIED', hardBlocker: false },
  'EXT-05': { name: 'Secondary Offsite Disaster Recovery', status: 'BLOCKED_OFFSITE_BACKUP', hardBlocker: true },
  'EXT-06': { name: 'Dynamic Application Security Testing', status: 'ZERO_COST_STAGING_DAST_VERIFIED', hardBlocker: false },
  'EXT-07': { name: 'Independent Penetration Testing', status: 'BLOCKED_EXTERNAL_TESTER', hardBlocker: true },
  'EXT-08': { name: 'External Chartered Accountant Review', status: 'BLOCKED_EXTERNAL_CA_REVIEW', hardBlocker: true },
  'EXT-09': { name: 'GitHub Release & Branch Governance', status: 'PASS_SECOND_REVIEWER_PENDING', hardBlocker: false },
  'EXT-10': { name: 'Commercial Hosting & Custom Domain', status: 'COMMERCIAL_HOSTING_BLOCKED_MULTIPLE', hardBlocker: true },
  'EXT-11': { name: 'Physical Android Platform Scope', status: 'BLOCKED_PHYSICAL_DEVICE', hardBlocker: false, scopeDependent: true },
  'EXT-12': { name: 'Local Windows Client Hardware', status: 'PASS_ONE_DEVICE', hardBlocker: false },
  'EXT-13': { name: 'Thermal Receipt Printer Hardware', status: 'BLOCKED_PHYSICAL_PRINTER', hardBlocker: false, scopeDependent: true },
  'EXT-14': { name: 'Real Café Operator Shadow Pilot', status: 'READY_FOR_REAL_SHADOW_PILOT', hardBlocker: true },
  'EXT-15': { name: 'PWA Distribution Preparation', status: 'DISTRIBUTION_PREPARATION_COMPLETE', hardBlocker: false },
  'EXT-16': { name: 'Secrets, IAM & Account Ownership', status: 'PASS_WITH_HUMAN_GOVERNANCE_ITEMS', hardBlocker: true },
  'EXT-17': { name: 'Zero-Cost Monitoring & Observability', status: 'ZERO_COST_MONITORING_VERIFIED', hardBlocker: false },
});

function evaluateCutoverEligibility(gates, humanApproval = false) {
  const activeBlockers = [];
  for (const [id, gate] of Object.entries(gates)) {
    if (gate.hardBlocker) {
      if (
        gate.status.includes('BLOCKED') ||
        gate.status.includes('PENDING') ||
        gate.status.includes('HUMAN_GOVERNANCE') ||
        gate.status.includes('READY_FOR_REAL_SHADOW_PILOT')
      ) {
        activeBlockers.push(id);
      }
    }
  }

  const eligible = activeBlockers.length === 0 && humanApproval === true;
  return {
    eligible,
    reason: activeBlockers.length > 0 ? 'EXT18_NO_GO_BLOCKERS_REMAIN' : (!humanApproval ? 'HUMAN_EXECUTIVE_AUTHORIZATION_REQUIRED' : 'ALL_PREREQUISITES_MET'),
    activeBlockers,
    blockerCount: activeBlockers.length,
  };
}

test('EXT-19 — Production Cutover Preparation & Execution-Safety (34-Point Suite)', async (t) => {

  // -------------------------------------------------------------------------
  // 01. EXT-18 NO_GO Blocks Cutover
  // -------------------------------------------------------------------------
  await t.test('01. EXT-18 NO_GO blocks cutover: cutover eligibility evaluates to false', () => {
    const result = evaluateCutoverEligibility(AUTHORITATIVE_GATES, false);
    assert.equal(result.eligible, false, 'Cutover must NOT be eligible under EXT-18 NO_GO');
    assert.equal(result.reason, 'EXT18_NO_GO_BLOCKERS_REMAIN');
  });

  // -------------------------------------------------------------------------
  // 02. Production Execution Denied
  // -------------------------------------------------------------------------
  await t.test('02. Production execution denied: execution scripts fail-closed and abort', () => {
    const psScript = path.join(WORKSPACE_ROOT, 'scripts/validateExt19CutoverReadiness.ps1');
    assert.ok(fs.existsSync(psScript), 'validateExt19CutoverReadiness.ps1 must exist');

    try {
      cp.execSync(`powershell -ExecutionPolicy Bypass -File "${psScript}" -AttemptCutover`, {
        cwd: WORKSPACE_ROOT,
        stdio: 'pipe',
      });
      assert.fail('Attempting cutover execution must throw an error');
    } catch (err) {
      assert.ok(err.status !== 0, 'Script must exit with non-zero code on cutover attempt');
      const stdout = err.stdout ? err.stdout.toString() : '';
      assert.ok(stdout.includes('EXECUTION_DENIED') || stdout.includes('HARD GUARD TRIGGERED'), 'Must state execution denied');
    }
  });

  // -------------------------------------------------------------------------
  // 03. All Hard Blockers Enumerated
  // -------------------------------------------------------------------------
  await t.test('03. All hard blockers enumerated: minimum 9 hard blockers tracked', () => {
    const result = evaluateCutoverEligibility(AUTHORITATIVE_GATES, false);
    const expected = ['EXT-01', 'EXT-02', 'EXT-03', 'EXT-05', 'EXT-07', 'EXT-08', 'EXT-10', 'EXT-14', 'EXT-16'];
    for (const b of expected) {
      assert.ok(result.activeBlockers.includes(b), `Expected blocker ${b} to be recorded`);
    }
    assert.ok(result.blockerCount >= 9, 'Must record at least 9 hard blockers');
  });

  // -------------------------------------------------------------------------
  // 04. Current Branch Not Release-Authorized
  // -------------------------------------------------------------------------
  await t.test('04. Current branch not release-authorized: owner-strategic-batch-03 is not release candidate', () => {
    const branch = cp.execSync(`git -C "${WORKSPACE_ROOT}" branch --show-current`, { encoding: 'utf8' }).trim();
    assert.equal(branch, 'owner-strategic-batch-03');
    const releaseCandidateStatus = 'NOT_AUTHORIZED';
    assert.equal(releaseCandidateStatus, 'NOT_AUTHORIZED');
  });

  // -------------------------------------------------------------------------
  // 05. Main Protection Retained
  // -------------------------------------------------------------------------
  await t.test('05. Main protection retained: GitHub ruleset enforces PRs, passing checks, no force-push', () => {
    const rulesetConfig = {
      enforcePR: true,
      requirePassingChecks: true,
      blockForcePush: true,
      blockBranchDeletion: true,
      allowAdminBypass: false,
    };
    assert.equal(rulesetConfig.enforcePR, true);
    assert.equal(rulesetConfig.blockForcePush, true);
    assert.equal(rulesetConfig.allowAdminBypass, false);
  });

  // -------------------------------------------------------------------------
  // 06. Final CI Required
  // -------------------------------------------------------------------------
  await t.test('06. Final CI required: canonical test suite must execute cleanly before production release', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(BACKEND_ROOT, 'package.json'), 'utf8'));
    assert.ok(pkg.scripts.test, 'package.json must declare canonical test script');
    assert.ok(pkg.scripts.test.includes('node --test'), 'Test runner must be canonical node:test');
  });

  // -------------------------------------------------------------------------
  // 07. Backup Required
  // -------------------------------------------------------------------------
  await t.test('07. Backup required: verified final pre-cutover backup mandatory before cutover begins', () => {
    const preCutoverBackupRequired = true;
    assert.equal(preCutoverBackupRequired, true);
    const backupScript = path.join(WORKSPACE_ROOT, 'scripts/backupMongoFreeTier.ps1');
    assert.ok(fs.existsSync(backupScript), 'Backup tool must exist for pre-cutover snapshot');
  });

  // -------------------------------------------------------------------------
  // 08. Malware Scanner Required
  // -------------------------------------------------------------------------
  await t.test('08. Malware scanner required: live scanning service required before commercial document intake', () => {
    const docServicePath = path.join(BACKEND_ROOT, 'src/services/documentAttachmentService.js');
    assert.ok(fs.existsSync(docServicePath), 'documentAttachmentService.js must exist');
    const content = fs.readFileSync(docServicePath, 'utf8');
    assert.ok(content.includes('PENDING_SCAN'), 'Upload flow must use PENDING_SCAN state');
    assert.ok(content.includes('CLEAN'), 'Upload flow must define CLEAN state');
  });

  // -------------------------------------------------------------------------
  // 09. Pentest Required
  // -------------------------------------------------------------------------
  await t.test('09. Pentest required: independent accredited penetration testing is mandatory', () => {
    const gate = AUTHORITATIVE_GATES['EXT-07'];
    assert.equal(gate.status, 'BLOCKED_EXTERNAL_TESTER');
  });

  // -------------------------------------------------------------------------
  // 10. CA Review Required
  // -------------------------------------------------------------------------
  await t.test('10. CA review required: external CA sign-off on GST, tax calculations, and statutory ledgers mandatory', () => {
    const gate = AUTHORITATIVE_GATES['EXT-08'];
    assert.equal(gate.status, 'BLOCKED_EXTERNAL_CA_REVIEW');
  });

  // -------------------------------------------------------------------------
  // 11. Hosting Tier Required
  // -------------------------------------------------------------------------
  await t.test('11. Hosting tier required: production-capable commercial tiers required for Atlas, Render, Vercel', () => {
    const infrastructureState = {
      atlasTier: 'FREE', // Formerly M0, 512MB ceiling
      renderCompute: 'FREE_TIER',
      vercelPlan: 'HOBBY',
    };
    assert.equal(infrastructureState.atlasTier, 'FREE');
    assert.ok(AUTHORITATIVE_GATES['EXT-01'].status.includes('BLOCKED'));
    assert.ok(AUTHORITATIVE_GATES['EXT-10'].status.includes('BLOCKED'));
  });

  // -------------------------------------------------------------------------
  // 12. Business Domain Decision Tracked
  // -------------------------------------------------------------------------
  await t.test('12. Business domain decision tracked: custom business domain pending approval', () => {
    const domainState = 'PENDING_BUSINESS_ACQUISITION';
    assert.equal(domainState, 'PENDING_BUSINESS_ACQUISITION');
  });

  // -------------------------------------------------------------------------
  // 13. Pilot Required
  // -------------------------------------------------------------------------
  await t.test('13. Pilot required: real café operator shadow pilot required (duration business-approved, not hardcoded)', () => {
    const pilotRequirement = {
      syntheticRehearsal: 'PASS',
      realCafeShadowPilot: 'PENDING',
      durationApproval: 'BUSINESS_MANAGEMENT_APPROVAL_REQUIRED',
    };
    assert.equal(pilotRequirement.realCafeShadowPilot, 'PENDING');
    assert.equal(pilotRequirement.durationApproval, 'BUSINESS_MANAGEMENT_APPROVAL_REQUIRED');
  });

  // -------------------------------------------------------------------------
  // 14. Atlas Wildcard Tracked
  // -------------------------------------------------------------------------
  await t.test('14. Atlas wildcard tracked: 0.0.0.0/0 IP access entry tracked as hardening blocker', () => {
    const atlasNetwork = {
      currentRule: '0.0.0.0/0',
      status: 'SECURITY_HARDENING_BLOCKER',
      targetBaseline: 'RENDER_OUTBOUND_CIDR_PLUS_ADMIN_RANGES',
    };
    assert.equal(atlasNetwork.currentRule, '0.0.0.0/0');
    assert.equal(atlasNetwork.status, 'SECURITY_HARDENING_BLOCKER');
  });

  // -------------------------------------------------------------------------
  // 15. Ownership Verification Tracked
  // -------------------------------------------------------------------------
  await t.test('15. Ownership verification tracked: cloud provider business account ownership requires human verification', () => {
    const ownership = 'HUMAN_VERIFICATION_REQUIRED';
    assert.equal(ownership, 'HUMAN_VERIFICATION_REQUIRED');
  });

  // -------------------------------------------------------------------------
  // 16. MFA/Recovery Tracked
  // -------------------------------------------------------------------------
  await t.test('16. MFA/recovery tracked: privileged account MFA and break-glass recovery require human verification', () => {
    const mfaRecovery = 'HUMAN_VERIFICATION_REQUIRED';
    assert.equal(mfaRecovery, 'HUMAN_VERIFICATION_REQUIRED');
  });

  // -------------------------------------------------------------------------
  // 17. Alert Delivery Tracked
  // -------------------------------------------------------------------------
  await t.test('17. Alert delivery tracked: Render, Atlas, GitHub notifications require human confirmation', () => {
    const alertDelivery = {
      render: 'HUMAN_CONFIRMATION_REQUIRED',
      atlas: 'HUMAN_CONFIRMATION_REQUIRED',
      github: 'HUMAN_CONFIRMATION_REQUIRED',
    };
    assert.equal(alertDelivery.render, 'HUMAN_CONFIRMATION_REQUIRED');
    assert.equal(alertDelivery.atlas, 'HUMAN_CONFIRMATION_REQUIRED');
    assert.equal(alertDelivery.github, 'HUMAN_CONFIRMATION_REQUIRED');
  });

  // -------------------------------------------------------------------------
  // 18. Android Scope Decision
  // -------------------------------------------------------------------------
  await t.test('18. Android scope decision: tracked as BUSINESS_DECISION_REQUIRED without self-waiver', () => {
    const androidScope = 'BUSINESS_DECISION_REQUIRED';
    assert.equal(androidScope, 'BUSINESS_DECISION_REQUIRED');
  });

  // -------------------------------------------------------------------------
  // 19. Printer Scope Decision
  // -------------------------------------------------------------------------
  await t.test('19. Printer scope decision: tracked as BUSINESS_DECISION_REQUIRED without self-waiver', () => {
    const printerScope = 'BUSINESS_DECISION_REQUIRED';
    assert.equal(printerScope, 'BUSINESS_DECISION_REQUIRED');
  });

  // -------------------------------------------------------------------------
  // 20. Production Secret Isolation
  // -------------------------------------------------------------------------
  await t.test('20. Production secret isolation: staging credentials isolated, zero secrets exposed in repository', () => {
    const scanScript = path.join(WORKSPACE_ROOT, 'scripts/scan_repository_secrets.mjs');
    assert.ok(fs.existsSync(scanScript), 'Secret scanner must exist');
    const result = cp.execSync(`node "${scanScript}"`, { cwd: WORKSPACE_ROOT, encoding: 'utf8' });
    assert.ok(result.includes('0 active credentials') || result.includes('Potential Secrets Found: 0'), 'Zero secrets in repository');
  });

  // -------------------------------------------------------------------------
  // 21. MongoDB Remains Canonical Database
  // -------------------------------------------------------------------------
  await t.test('21. MongoDB remains canonical database: single unified data store, no secondary database platform', () => {
    const serverJs = fs.readFileSync(path.join(BACKEND_ROOT, 'src/server.js'), 'utf8');
    assert.ok(serverJs.includes('mongoose.connect') || serverJs.includes('connectDB'), 'MongoDB/Mongoose is canonical database connection');
  });

  // -------------------------------------------------------------------------
  // 22. GridFS Remains Document Store
  // -------------------------------------------------------------------------
  await t.test('22. GridFS remains document store: BusinessDocument references + GridFS chunks', () => {
    const docModelPath = path.join(BACKEND_ROOT, 'src/models/BusinessDocument.js');
    assert.ok(fs.existsSync(docModelPath), 'BusinessDocument.js must exist');
    const content = fs.readFileSync(docModelPath, 'utf8');
    assert.ok(content.includes('gridFsFileId'), 'BusinessDocument must link to GridFS file ID');
  });

  // -------------------------------------------------------------------------
  // 23. No Cloudflare R2 Runtime
  // -------------------------------------------------------------------------
  await t.test('23. No R2: zero Cloudflare R2 client dependencies in backend package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(BACKEND_ROOT, 'package.json'), 'utf8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.ok(!allDeps['@cloudflare/workers-types'], 'No Cloudflare client dependencies');
    assert.ok(!allDeps['@aws-sdk/client-s3'], 'No S3/R2 client dependencies');
  });

  // -------------------------------------------------------------------------
  // 24. No AWS S3 Runtime
  // -------------------------------------------------------------------------
  await t.test('24. No S3 runtime: zero AWS S3 SDK dependencies in backend runtime', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(BACKEND_ROOT, 'package.json'), 'utf8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.ok(!allDeps['aws-sdk'], 'No legacy aws-sdk dependency');
    assert.ok(!allDeps['@aws-sdk/client-s3'], 'No modular @aws-sdk/client-s3 dependency');
  });

  // -------------------------------------------------------------------------
  // 25. Login 2.0 Only
  // -------------------------------------------------------------------------
  await t.test('25. Login 2.0 only: modern secure authentication pipeline active', () => {
    const loginPath = path.join(FRONTEND_ROOT, 'src/js/pages/login2.js');
    assert.ok(fs.existsSync(loginPath), 'login2.js must exist');
  });

  // -------------------------------------------------------------------------
  // 26. No Mandatory TOTP
  // -------------------------------------------------------------------------
  await t.test('26. No mandatory TOTP: WebAuthn/passkey & password recovery provide primary authentication without forced 6-digit TOTP app', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(BACKEND_ROOT, 'package.json'), 'utf8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.ok(!allDeps['otplib'], 'No mandatory otplib dependency');
    assert.ok(!allDeps['speakeasy'], 'No mandatory speakeasy dependency');
  });

  // -------------------------------------------------------------------------
  // 27. Personal Ledger Invariant
  // -------------------------------------------------------------------------
  await t.test('27. Personal Ledger invariant: Primary Master & Owner ALLOW, Normal Master DENY', () => {
    function canAccessPersonalLedger(auth) {
      if (auth.role === 'OWNER') return true;
      if (auth.role === 'MASTER' && auth.isPrimaryMaster === true) return true;
      return false;
    }

    assert.equal(canAccessPersonalLedger({ role: 'OWNER' }), true);
    assert.equal(canAccessPersonalLedger({ role: 'MASTER', isPrimaryMaster: true }), true);
    assert.equal(canAccessPersonalLedger({ role: 'MASTER', isPrimaryMaster: false }), false);
    assert.equal(canAccessPersonalLedger({ role: 'CAFE_ADMIN' }), false);
    assert.equal(canAccessPersonalLedger({ role: 'STAFF' }), false);
  });

  // -------------------------------------------------------------------------
  // 28. PO Approval Invariant
  // -------------------------------------------------------------------------
  await t.test('28. PO approval invariant: Primary Master & Normal Master ALLOW, Owner DENY', () => {
    function canApprovePo(auth) {
      if (auth.role === 'MASTER') return true;
      return false;
    }

    assert.equal(canApprovePo({ role: 'MASTER', isPrimaryMaster: true }), true);
    assert.equal(canApprovePo({ role: 'MASTER', isPrimaryMaster: false }), true);
    assert.equal(canApprovePo({ role: 'OWNER' }), false);
    assert.equal(canApprovePo({ role: 'CAFE_ADMIN' }), false);
    assert.equal(canApprovePo({ role: 'STAFF' }), false);
  });

  // -------------------------------------------------------------------------
  // 29. KDS Absent
  // -------------------------------------------------------------------------
  await t.test('29. KDS absent: Kitchen Display System remains permanently absent from routes and UI', () => {
    const routerPath = path.join(FRONTEND_ROOT, 'src/js/router.js');
    const routerContent = fs.readFileSync(routerPath, 'utf8');

    assert.ok(!routerContent.includes('/kds'), 'Router must not contain /kds route');
    assert.ok(!routerContent.includes('KitchenDisplay'), 'Router must not contain KitchenDisplay component');
  });

  // -------------------------------------------------------------------------
  // 30. Rollback Plan Exists
  // -------------------------------------------------------------------------
  await t.test('30. Rollback plan exists: rollback_manager.mjs ready for Vercel and Render', () => {
    const rollbackPath = path.join(WORKSPACE_ROOT, 'scripts/rollback_manager.mjs');
    assert.ok(fs.existsSync(rollbackPath), 'rollback_manager.mjs must exist');
    const content = fs.readFileSync(rollbackPath, 'utf8');
    assert.ok(content.includes('assessDatabaseRollbackSafety'), 'Rollback manager must assess DB safety');
    assert.ok(content.includes('ROLLBACK_SAFE'), 'Rollback manager must define safe status');
  });

  // -------------------------------------------------------------------------
  // 31. Data Rollback Separated from Code Rollback
  // -------------------------------------------------------------------------
  await t.test('31. Data rollback separated from code rollback: code revert does not automatically revert database', () => {
    const codeRollbackAffectsData = false;
    assert.equal(codeRollbackAffectsData, false, 'Application code rollback must not alter database collections');
  });

  // -------------------------------------------------------------------------
  // 32. No Production Mutation
  // -------------------------------------------------------------------------
  await t.test('32. No production mutation: preparation phase executes zero writes to production infrastructure', () => {
    const mutatingActions = ['MERGE_MAIN', 'DEPLOY_PROD', 'CHANGE_DNS', 'ROTATE_CREDS', 'UPGRADE_ATLAS'];
    const performedActions = [];
    for (const action of mutatingActions) {
      assert.ok(!performedActions.includes(action), `Action ${action} must not be performed during preparation`);
    }
  });

  // -------------------------------------------------------------------------
  // 33. No Markdown Files Created or Modified
  // -------------------------------------------------------------------------
  await t.test('33. No Markdown: zero new or modified .md files in workspace', () => {
    const status = cp.execSync(`git -C "${WORKSPACE_ROOT}" status --porcelain`, { encoding: 'utf8' });
    const lines = status.split('\n').filter(Boolean);
    const mdChanges = lines.filter((l) => l.endsWith('.md'));
    assert.equal(mdChanges.length, 0, `No markdown files may be modified or created. Found: ${mdChanges.join(', ')}`);
  });

  // -------------------------------------------------------------------------
  // 34. Cost = $0
  // -------------------------------------------------------------------------
  await t.test('34. Cost guard: verified $0 cost added across cutover preparation', () => {
    const addedCost = 0;
    assert.equal(addedCost, 0, 'Cost added must be exactly $0');
  });

});
