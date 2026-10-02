#!/usr/bin/env node
/**
 * Zamorin Café ERP — Backup Configuration & DR Precondition Verifier
 *
 * Verifies structural preconditions for continuous cloud backup and PITR
 * WITHOUT automating or executing any destructive database restoration drills.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DR_RUNBOOK_PATH = path.resolve(SCRIPT_DIR, '../config/disasterRecoveryRunbook.json');

export function verifyBackupPreconditions(env = process.env) {
  const uri = env.MONGODB_URI || '';
  const isSrv = uri.startsWith('mongodb+srv://');
  const isDirect = uri.startsWith('mongodb://');
  const hasUri = isSrv || isDirect;

  const atlasProjectId = env.ATLAS_PROJECT_ID || null;
  const atlasClusterName = env.ATLAS_CLUSTER_NAME || null;

  let drRunbook = null;
  try {
    drRunbook = JSON.parse(fs.readFileSync(DR_RUNBOOK_PATH, 'utf8'));
  } catch (_error) {
    drRunbook = null;
  }
  const dr10 = drRunbook?.procedures?.find((p) => p.id === 'DR-10') || null;
  const restoreGuardValid = Boolean(
    drRunbook?.safety?.automaticProductionRestoreAllowed === false &&
    drRunbook?.safety?.restoreTargetPolicy === 'ISOLATED_NON_PRODUCTION_TARGET_ONLY' &&
    dr10
  );

  const checks = [
    {
      name: 'MongoDB Connection String Configured',
      passed: hasUri,
      status: hasUri ? 'CONFIGURED' : 'MISSING',
      details: hasUri ? (isSrv ? 'Atlas SRV connection format detected' : 'Standard replica-set URI') : 'MONGODB_URI not found',
    },
    {
      name: 'Atlas High-Availability / Replica Set Protocol',
      passed: isSrv || uri.includes('replicaSet'),
      status: isSrv ? 'ATLAS_SRV' : uri.includes('replicaSet') ? 'REPLICA_SET' : 'SINGLE_INSTANCE_OR_DEV',
      details: 'Continuous cloud backup / oplog PITR requires replica set or Atlas cluster',
    },
    {
      name: 'Atlas Project & Cluster Identifiers (Optional for CLI DR)',
      passed: Boolean(atlasProjectId && atlasClusterName) || hasUri,
      status: (atlasProjectId && atlasClusterName) ? 'CONFIGURED' : 'UNSET_OPTIONAL',
      details: (atlasProjectId && atlasClusterName) ? 'Atlas identifiers present' : 'Atlas API keys and IDs optional; managed via Atlas Cloud Console',
    },
    {
      name: 'Machine-Verifiable DR Runbook',
      passed: restoreGuardValid,
      status: restoreGuardValid ? 'PROTECTED' : 'MISSING_OR_INVALID',
      details: restoreGuardValid
        ? 'config/disasterRecoveryRunbook.json DR-10 requires isolated non-production restore and prohibits automatic production restore'
        : 'DR runbook is missing or does not enforce the production-restore safety guard',
    },
    {
      name: 'Automated Restore Safeguard',
      passed: restoreGuardValid,
      status: restoreGuardValid ? 'PROTECTED' : 'UNSAFE',
      details: 'Automatic production restore is disabled; restore verification is restricted to isolated non-production targets.',
    },
  ];

  return {
    timestamp: new Date().toISOString(),
    tool: 'zamorin-backup-config-verifier',
    preconditionsMet: checks.filter((c) => c.name !== 'Atlas Project & Cluster Identifiers (Optional for CLI DR)').every((c) => c.passed),
    checks,
    destructiveRestorePermitted: false,
    continuousPitrCertified: false,
    externalBlockers: ['EXT-03', 'EXT-05'],
    drRunbookPath: 'config/disasterRecoveryRunbook.json',
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('[BACKUP_VERIFY] Checking Disaster Recovery and Backup Preconditions:\n');
  const result = verifyBackupPreconditions();
  
  for (const c of result.checks) {
    const pad = c.name.padEnd(45, ' ');
    console.log(`  ${pad} [${c.status}] -> ${c.details}`);
  }

  console.log(`\nOverall Backup Readiness: ${result.preconditionsMet ? 'PRECONDITIONS_MET' : 'PRECONDITIONS_INCOMPLETE'}`);
  console.log('(Production overwrite remains prohibited; EXT-03 PITR and EXT-05 offsite redundancy are still external blockers.)');
}
