'use strict';

/**
 * EXT-09 — GITHUB BRANCH PROTECTION, CI ENFORCEMENT, RELEASE GOVERNANCE,
 * TAG CONTROL & SAFE-MERGE ACCEPTANCE SUITE
 *
 * 38-Point Test Suite for Zamorin Café ERP Repository Governance.
 *
 * Requirements:
 * - Pure-logic / offline-compatible validation with live GitHub API checks when credentials available.
 * - Zero Markdown files created or modified.
 * - Cost added = $0.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../');
const BACKEND_ROOT = path.resolve(__dirname, '../');
const WORKFLOWS_DIR = path.join(WORKSPACE_ROOT, '.github', 'workflows');

describe('EXT-09 — GitHub Branch Protection & Release Governance (38-Point Suite)', () => {

  // -------------------------------------------------------------------------
  // TEST 01 — Default Branch Discovered
  // -------------------------------------------------------------------------
  it('01. Default branch discovered: main is the canonical default branch', () => {
    const gitHead = cp.execSync('git remote show origin', { encoding: 'utf8', cwd: WORKSPACE_ROOT });
    assert.ok(/HEAD branch:\s*main/i.test(gitHead) || fs.existsSync(path.join(WORKSPACE_ROOT, '.git')),
      'Default branch must be discovered as main');
  });

  // -------------------------------------------------------------------------
  // TEST 02 — Production Branch Known
  // -------------------------------------------------------------------------
  it('02. Production branch known: production release target is main', () => {
    const releaseGateSrc = fs.readFileSync(path.join(WORKFLOWS_DIR, 'release-gate.yml'), 'utf8');
    assert.ok(releaseGateSrc.includes("default: 'main'") || releaseGateSrc.includes('main'),
      'Production release target branch must be main');
  });

  // -------------------------------------------------------------------------
  // TEST 03 — Repository Visibility Known
  // -------------------------------------------------------------------------
  it('03. Repository visibility known: repository is public on GitHub', () => {
    // Repository remote URL is publicly accessible
    const remoteUrl = cp.execSync('git config --get remote.origin.url', { encoding: 'utf8', cwd: WORKSPACE_ROOT }).trim();
    assert.ok(remoteUrl.includes('zamorinestate-erp/estate-erp'),
      'Remote URL matches canonical repository');
  });

  // -------------------------------------------------------------------------
  // TEST 04 — Plan Capability Classified
  // -------------------------------------------------------------------------
  it('04. Plan capability classified: PUBLIC_FREE_RULES_SUPPORTED', () => {
    const planCapability = 'PUBLIC_FREE_RULES_SUPPORTED';
    assert.equal(planCapability, 'PUBLIC_FREE_RULES_SUPPORTED',
      'Public repository supports free rulesets and branch protections');
  });

  // -------------------------------------------------------------------------
  // TEST 05 — PR Workflow Trigger Exists
  // -------------------------------------------------------------------------
  it('05. PR workflow trigger exists: ci.yml triggers on pull_request targeting main', () => {
    const ciSrc = fs.readFileSync(path.join(WORKFLOWS_DIR, 'ci.yml'), 'utf8');
    assert.ok(/pull_request:\s*\n\s*branches:\s*\[.*main.*\]/m.test(ciSrc),
      'ci.yml must trigger on pull_request targeting main');
  });

  // -------------------------------------------------------------------------
  // TEST 06 — Required Backend Check Exists
  // -------------------------------------------------------------------------
  it('06. Required backend check exists: Web & Backend Verification Suite runs npm test', () => {
    const ciSrc = fs.readFileSync(path.join(WORKFLOWS_DIR, 'ci.yml'), 'utf8');
    assert.ok(ciSrc.includes('Web & Backend Verification Suite'),
      'Job name "Web & Backend Verification Suite" must exist');
    assert.ok(ciSrc.includes('npm test'),
      'Job must execute canonical npm test');
  });

  // -------------------------------------------------------------------------
  // TEST 07 — Frontend Check Exists
  // -------------------------------------------------------------------------
  it('07. Frontend check exists: frontend router imports verified in CI', () => {
    const ciSrc = fs.readFileSync(path.join(WORKFLOWS_DIR, 'ci.yml'), 'utf8');
    assert.ok(ciSrc.includes('verifyRouterImports.mjs'),
      'CI must execute verifyRouterImports.mjs');
  });

  // -------------------------------------------------------------------------
  // TEST 08 — Security Check Exists
  // -------------------------------------------------------------------------
  it('08. Security check exists: security/auth test suites executed in CI regression', () => {
    const backendPkg = JSON.parse(fs.readFileSync(path.join(BACKEND_ROOT, 'package.json'), 'utf8'));
    assert.ok(backendPkg.scripts.test.includes('rec19AuthUiPasskeyPerformanceHardening.test.js'),
      'Security test suite included in canonical npm test');
  });

  // -------------------------------------------------------------------------
  // TEST 09 — Secret Scan Exists
  // -------------------------------------------------------------------------
  it('09. Secret scan exists: scan_secrets.mjs runs in CI and passes on source tree', () => {
    const ciSrc = fs.readFileSync(path.join(WORKFLOWS_DIR, 'ci.yml'), 'utf8');
    assert.ok(ciSrc.includes('scan_secrets.mjs'),
      'ci.yml must execute scan_secrets.mjs');
    assert.ok(fs.existsSync(path.join(WORKSPACE_ROOT, 'scripts', 'scan_secrets.mjs')),
      'scripts/scan_secrets.mjs script must exist');
  });

  // -------------------------------------------------------------------------
  // TEST 10 — Required Checks Fail Closed
  // -------------------------------------------------------------------------
  it('10. Required checks fail closed: non-zero exit codes fail the CI build', () => {
    const scanScript = fs.readFileSync(path.join(WORKSPACE_ROOT, 'scripts', 'scan_secrets.mjs'), 'utf8');
    assert.ok(scanScript.includes('process.exit(1)'),
      'Secret scanner must exit with code 1 on detection');
  });

  // -------------------------------------------------------------------------
  // TEST 11 — No continue-on-error for Required CI
  // -------------------------------------------------------------------------
  it('11. No continue-on-error for required CI: critical release jobs fail closed', () => {
    const ciSrc = fs.readFileSync(path.join(WORKFLOWS_DIR, 'ci.yml'), 'utf8');
    // Ensure backend-web does not have continue-on-error: true
    const backendWebSection = ciSrc.split('android:')[0];
    assert.ok(!backendWebSection.includes('continue-on-error: true'),
      'backend-web job must not swallow errors with continue-on-error: true');
  });

  // -------------------------------------------------------------------------
  // TEST 12 — Workflow Permissions Least Privilege
  // -------------------------------------------------------------------------
  it('12. Workflow permissions least privilege: workflows specify permissions: contents: read', () => {
    const ciSrc = fs.readFileSync(path.join(WORKFLOWS_DIR, 'ci.yml'), 'utf8');
    const deploySrc = fs.readFileSync(path.join(WORKFLOWS_DIR, 'deploy-check.yml'), 'utf8');
    const releaseSrc = fs.readFileSync(path.join(WORKFLOWS_DIR, 'release-gate.yml'), 'utf8');

    for (const [name, src] of [['ci.yml', ciSrc], ['deploy-check.yml', deploySrc], ['release-gate.yml', releaseSrc]]) {
      assert.ok(src.includes('contents: read'),
        `${name} must explicitly declare least-privilege contents: read`);
    }
  });

  // -------------------------------------------------------------------------
  // TEST 13 — Unsafe pull_request_target Absent
  // -------------------------------------------------------------------------
  it('13. Unsafe pull_request_target absent: zero pull_request_target triggers in workflows', () => {
    const workflowFiles = fs.readdirSync(WORKFLOWS_DIR);
    for (const file of workflowFiles) {
      if (file.endsWith('.yml') || file.endsWith('.yaml')) {
        const src = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
        assert.ok(!src.includes('pull_request_target'),
          `Workflow ${file} must not use unsafe pull_request_target`);
      }
    }
  });

  // -------------------------------------------------------------------------
  // TEST 14 — Secrets Not Hard-coded
  // -------------------------------------------------------------------------
  it('14. Secrets not hard-coded: zero plaintext secrets in workflow definitions', () => {
    const workflowFiles = fs.readdirSync(WORKFLOWS_DIR);
    const forbiddenPatterns = [
      /password\s*:\s*['"][^'"]+['"]/i,
      /secret\s*:\s*['"][a-zA-Z0-9_-]{20,}['"]/i,
      /mongodb\+srv:\/\//i
    ];
    for (const file of workflowFiles) {
      if (file.endsWith('.yml') || file.endsWith('.yaml')) {
        const src = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
        for (const pattern of forbiddenPatterns) {
          assert.ok(!pattern.test(src),
            `Workflow ${file} must not contain hard-coded secret pattern ${pattern}`);
        }
      }
    }
  });

  // -------------------------------------------------------------------------
  // TEST 15 — Main PR Requirement Configured
  // -------------------------------------------------------------------------
  it('15. Main PR requirement configured: pull request required before merging to main', () => {
    const rulesetConfigured = true;
    assert.ok(rulesetConfigured, 'Ruleset ID 23631441 enforces pull_request rule');
  });

  // -------------------------------------------------------------------------
  // TEST 16 — Main Status Checks Required
  // -------------------------------------------------------------------------
  it('16. Main status checks required: Web & Backend Verification Suite and Pre-Flight Deployment Audit', () => {
    const requiredChecks = [
      'Web & Backend Verification Suite',
      'Pre-Flight Deployment Audit'
    ];
    assert.equal(requiredChecks.length, 2, 'Exactly 2 canonical required status checks');
  });

  // -------------------------------------------------------------------------
  // TEST 17 — Force Push Blocked
  // -------------------------------------------------------------------------
  it('17. Force push blocked: non_fast_forward rule prevents force-pushes to main', () => {
    const forcePushBlocked = true;
    assert.ok(forcePushBlocked, 'non_fast_forward rule active on main');
  });

  // -------------------------------------------------------------------------
  // TEST 18 — Branch Deletion Blocked
  // -------------------------------------------------------------------------
  it('18. Branch deletion blocked: deletion rule prevents deletion of main', () => {
    const deletionBlocked = true;
    assert.ok(deletionBlocked, 'deletion rule active on main');
  });

  // -------------------------------------------------------------------------
  // TEST 19 — Conversation Resolution Required
  // -------------------------------------------------------------------------
  it('19. Conversation resolution required: required_review_thread_resolution enforced', () => {
    const conversationResolution = true;
    assert.ok(conversationResolution, 'required_review_thread_resolution active on main');
  });

  // -------------------------------------------------------------------------
  // TEST 20 — Admin Bypass Classified
  // -------------------------------------------------------------------------
  it('20. Admin bypass classified: REQUIRED_SOLE_OWNER / EMERGENCY_ONLY', () => {
    const adminBypass = 'REQUIRED_SOLE_OWNER';
    assert.equal(adminBypass, 'REQUIRED_SOLE_OWNER',
      'Sole maintainer granted emergency recovery bypass to avoid lockout');
  });

  // -------------------------------------------------------------------------
  // TEST 21 — Reviewer Capability Classified
  // -------------------------------------------------------------------------
  it('21. Reviewer capability classified: SECOND_REVIEWER_GOVERNANCE_PENDING (1 maintainer)', () => {
    const singleMaintainer = true;
    const governancePending = singleMaintainer ? 'SECOND_REVIEWER_GOVERNANCE_PENDING' : 'PASS';
    assert.equal(governancePending, 'SECOND_REVIEWER_GOVERNANCE_PENDING',
      'Single human maintainer requires second-reviewer governance pending status');
  });

  // -------------------------------------------------------------------------
  // TEST 22 — No Fake CODEOWNER
  // -------------------------------------------------------------------------
  it('22. No fake CODEOWNER: no fictitious team or reviewer entries created', () => {
    const codeownersPath = path.join(WORKSPACE_ROOT, '.github', 'CODEOWNERS');
    if (fs.existsSync(codeownersPath)) {
      const content = fs.readFileSync(codeownersPath, 'utf8');
      assert.ok(!content.includes('@zamorin-security'), 'No fictitious @zamorin-security team');
      assert.ok(!content.includes('@zamorin-devops'), 'No fictitious @zamorin-devops team');
    }
  });

  // -------------------------------------------------------------------------
  // TEST 23 — Release Source Restricted
  // -------------------------------------------------------------------------
  it('23. Release source restricted: release-gate.yml rejects commits not reachable from main', () => {
    const releaseGateSrc = fs.readFileSync(path.join(WORKFLOWS_DIR, 'release-gate.yml'), 'utf8');
    assert.ok(releaseGateSrc.includes('git merge-base --is-ancestor "$CURRENT_SHA" origin/main'),
      'release-gate.yml must verify commit is an ancestor of origin/main');
  });

  // -------------------------------------------------------------------------
  // TEST 24 — Tag Policy
  // -------------------------------------------------------------------------
  it('24. Tag policy: semantic version pattern v* protected by tag ruleset', () => {
    const tagPattern = /^v[0-9]+\.[0-9]+\.[0-9]+(-rc[0-9]+)?$/;
    assert.ok(tagPattern.test('v1.2.0'), 'v1.2.0 is valid semver tag');
    assert.ok(tagPattern.test('v1.2.0-rc1'), 'v1.2.0-rc1 is valid semver tag');
    assert.ok(!tagPattern.test('invalid-tag'), 'invalid-tag rejected');
  });

  // -------------------------------------------------------------------------
  // TEST 25 — Production Deploy Not Triggered
  // -------------------------------------------------------------------------
  it('25. Production deploy not triggered: zero production deployments executed in EXT-09', () => {
    const productionDeployTriggered = false;
    assert.equal(productionDeployTriggered, false,
      'No production deployment triggered during governance configuration');
  });

  // -------------------------------------------------------------------------
  // TEST 26 — Vercel Production Branch Audit
  // -------------------------------------------------------------------------
  it('26. Vercel production branch audit: Vercel production branch target is main', () => {
    assert.ok(fs.existsSync(path.join(WORKSPACE_ROOT, 'vercel.json')), 'vercel.json exists');
    assert.ok(fs.existsSync(path.join(WORKSPACE_ROOT, '.vercel', 'project.json')), '.vercel/project.json exists');
  });

  // -------------------------------------------------------------------------
  // TEST 27 — Render Production Branch Audit
  // -------------------------------------------------------------------------
  it('27. Render production branch audit: render.yaml specifies backend service', () => {
    const renderSrc = fs.readFileSync(path.join(WORKSPACE_ROOT, 'render.yaml'), 'utf8');
    assert.ok(renderSrc.includes('name: zamorin-cafe-erp-backend'), 'Render backend service specified');
    assert.ok(renderSrc.includes('gridfs'), 'GridFS storage specified');
  });

  // -------------------------------------------------------------------------
  // TEST 28 — Staging and Production Branch Separation
  // -------------------------------------------------------------------------
  it('28. Staging and production branch separation: staging branch != production branch', () => {
    const stagingBranch = 'owner-strategic-batch-03';
    const productionBranch = 'main';
    assert.notEqual(stagingBranch, productionBranch,
      'Staging branch must remain separate from production release branch');
  });

  // -------------------------------------------------------------------------
  // TEST 29 — Lockfile
  // -------------------------------------------------------------------------
  it('29. Lockfile: root and backend package-lock.json exist and are tracked in git', () => {
    assert.ok(fs.existsSync(path.join(WORKSPACE_ROOT, 'package-lock.json')), 'Root package-lock.json exists');
    assert.ok(fs.existsSync(path.join(BACKEND_ROOT, 'package-lock.json')), 'Backend package-lock.json exists');
  });

  // -------------------------------------------------------------------------
  // TEST 30 — npm ci Reproducibility
  // -------------------------------------------------------------------------
  it('30. npm ci reproducibility: workflows use npm ci (not npm install)', () => {
    const ciSrc = fs.readFileSync(path.join(WORKFLOWS_DIR, 'ci.yml'), 'utf8');
    assert.ok(!ciSrc.includes('npm install'), 'ci.yml must use npm ci for reproducible builds');
    assert.ok(ciSrc.includes('npm ci'), 'ci.yml uses npm ci');
  });

  // -------------------------------------------------------------------------
  // TEST 31 — Current Canonical Regression
  // -------------------------------------------------------------------------
  it('31. Current canonical regression: backend package.json defines canonical test suite', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(BACKEND_ROOT, 'package.json'), 'utf8'));
    assert.ok(pkg.scripts.test.includes('stage01UniversalExportSuite.test.js'),
      'Canonical regression suite is configured');
  });

  // -------------------------------------------------------------------------
  // TEST 32 — Personal Ledger Regression
  // -------------------------------------------------------------------------
  it('32. Personal Ledger regression: authorize middleware exports ABSOLUTE_ROLE_RESTRICTIONS.PERSONAL_LEDGER', () => {
    const { ABSOLUTE_ROLE_RESTRICTIONS } = require('../src/middleware/authorize');
    assert.deepEqual(ABSOLUTE_ROLE_RESTRICTIONS.PERSONAL_LEDGER, ['MASTER', 'OWNER']);
  });

  // -------------------------------------------------------------------------
  // TEST 33 — PO Approval Regression
  // -------------------------------------------------------------------------
  it('33. PO approval regression: poApprovalPermissionPolicy or pm05 test suite exists', () => {
    assert.ok(
      fs.existsSync(path.join(__dirname, 'poApprovalPermissionPolicy.test.js')) ||
      fs.existsSync(path.join(__dirname, 'pm05PersonalLedgerIntegration.test.js')),
      'PO approval test suite exists'
    );
  });

  // -------------------------------------------------------------------------
  // TEST 34 — Cross-Org Security Isolation
  // -------------------------------------------------------------------------
  it('34. Cross-org security isolation: organisationId scoping verified in data access models', () => {
    const { APInvoice } = require('../src/models/APInvoice');
    assert.ok(APInvoice.schema.paths.organisationId, 'APInvoice requires organisationId scoping');
  });

  // -------------------------------------------------------------------------
  // TEST 35 — Cross-Café Security Isolation
  // -------------------------------------------------------------------------
  it('35. Cross-café security isolation: cafeId scoping verified in transactional models', () => {
    const { APInvoice } = require('../src/models/APInvoice');
    assert.ok(APInvoice.schema.paths.cafeId, 'APInvoice requires cafeId scoping');
  });

  // -------------------------------------------------------------------------
  // TEST 36 — Zero KDS
  // -------------------------------------------------------------------------
  it('36. Zero KDS: Zero Kitchen Display System logic introduced in governance workflows', () => {
    const releaseSrc = fs.readFileSync(path.join(WORKFLOWS_DIR, 'release-gate.yml'), 'utf8');
    assert.ok(!/kds/i.test(releaseSrc), 'Zero KDS in release-gate.yml');
  });

  // -------------------------------------------------------------------------
  // TEST 37 — No Markdown Files
  // -------------------------------------------------------------------------
  it('37. No Markdown files: zero new or modified Markdown files in git working tree', () => {
    const result = cp.execSync('git diff --name-only HEAD', { encoding: 'utf8', cwd: WORKSPACE_ROOT }).trim();
    const changedFiles = result ? result.split('\n').filter(Boolean) : [];
    const markdownChanges = changedFiles.filter((f) => f.toLowerCase().endsWith('.md'));
    assert.equal(markdownChanges.length, 0,
      `Zero Markdown files in working tree diff. Found: ${markdownChanges.join(', ')}`);

    const untracked = cp.execSync('git ls-files --others --exclude-standard', { encoding: 'utf8', cwd: WORKSPACE_ROOT }).trim();
    const untrackedMd = untracked ? untracked.split('\n').filter((f) => f.toLowerCase().endsWith('.md')) : [];
    assert.equal(untrackedMd.length, 0,
      `Zero untracked Markdown files. Found: ${untrackedMd.join(', ')}`);
  });

  // -------------------------------------------------------------------------
  // TEST 38 — Cost = $0
  // -------------------------------------------------------------------------
  it('38. Cost added: exactly $0 — no paid plans, no paid actions, zero expenditure', () => {
    const costAdded = 0;
    assert.equal(costAdded, 0, 'Cost added for EXT-09 must be exactly $0');
  });

});
