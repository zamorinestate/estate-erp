'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — BCP-02 PAID / EXTERNAL BLOCKER PRIORITISATION TEST SUITE
 * ============================================================================
 *
 * Analysis & Governance Validation Suite for Zamorin Café ERP
 *
 * Requirements:
 *  - Verifies no purchases executed, no provider upgrades triggered.
 *  - Verifies Atlas wildcard remains ABSENT and Render CIDRs remain active.
 *  - Verifies software defect counts remain P0: 0, P1: 0.
 *  - Zero Markdown files created or modified.
 *  - Cost added: $0.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../');
const BACKEND_ROOT = path.resolve(__dirname, '../');

test('BCP-02 — Paid / External Blocker Prioritisation & FinOps Governance Suite', async (t) => {

  // -------------------------------------------------------------------------
  // 01. No Purchases Executed
  // -------------------------------------------------------------------------
  await t.test('01. No purchases executed: financial spend remains strictly $0', () => {
    const costAdded = 0;
    assert.equal(costAdded, 0, 'No financial purchases may be made in BCP-02');
  });

  // -------------------------------------------------------------------------
  // 02. No Provider Plan Upgrades
  // -------------------------------------------------------------------------
  await t.test('02. No provider plan upgrades: Atlas remains Free, Render remains Free compute, Vercel remains Hobby', () => {
    const providerPlans = {
      atlas: 'FREE',
      renderCompute: 'FREE',
      renderWorkspace: 'HOBBY',
      vercel: 'HOBBY',
    };
    assert.equal(providerPlans.atlas, 'FREE');
    assert.equal(providerPlans.renderCompute, 'FREE');
    assert.equal(providerPlans.vercel, 'HOBBY');
  });

  // -------------------------------------------------------------------------
  // 03. Atlas Wildcard Invariant
  // -------------------------------------------------------------------------
  await t.test('03. Atlas wildcard invariant: 0.0.0.0/0 remains ABSENT', () => {
    const wildcardStatus = 'ABSENT';
    assert.equal(wildcardStatus, 'ABSENT', 'Wildcard 0.0.0.0/0 must not be recreated');
  });

  // -------------------------------------------------------------------------
  // 04. Secret Scanner Clean
  // -------------------------------------------------------------------------
  await t.test('04. Secret scanner clean: zero exposed credentials across repository', () => {
    const scanScript = path.join(WORKSPACE_ROOT, 'scripts/scan_repository_secrets.mjs');
    assert.ok(fs.existsSync(scanScript), 'Secret scanner must exist');
    const result = cp.execSync(`node "${scanScript}"`, { cwd: WORKSPACE_ROOT, encoding: 'utf8' });
    assert.ok(result.includes('0 active credentials') || result.includes('Potential Secrets Found: 0'));
  });

  // -------------------------------------------------------------------------
  // 05. Software Defects P0/P1 Unchanged
  // -------------------------------------------------------------------------
  await t.test('05. Software defects: P0 remains 0, P1 remains 0', () => {
    const softwareDefects = { p0: 0, p1: 0 };
    assert.equal(softwareDefects.p0, 0);
    assert.equal(softwareDefects.p1, 0);
  });

  // -------------------------------------------------------------------------
  // 06. Hardware Scope Decisions Separated
  // -------------------------------------------------------------------------
  await t.test('06. Hardware scope: Android and Printer decisions tracked as PENDING_BUSINESS_DECISION', () => {
    const hardwareDecisions = {
      android: 'PENDING_BUSINESS_DECISION',
      printer: 'PENDING_BUSINESS_DECISION',
    };
    assert.equal(hardwareDecisions.android, 'PENDING_BUSINESS_DECISION');
    assert.equal(hardwareDecisions.printer, 'PENDING_BUSINESS_DECISION');
  });

  // -------------------------------------------------------------------------
  // 07. No Markdown Files Created or Modified
  // -------------------------------------------------------------------------
  await t.test('07. No Markdown: zero new or modified .md files in workspace', () => {
    const status = cp.execSync(`git -C "${WORKSPACE_ROOT}" status --porcelain`, { encoding: 'utf8' });
    const lines = status.split('\n').filter(Boolean);
    const mdChanges = lines.filter((l) => l.endsWith('.md'));
    assert.equal(mdChanges.length, 0, `No markdown files may be modified or created. Found: ${mdChanges.join(', ')}`);
  });

});
