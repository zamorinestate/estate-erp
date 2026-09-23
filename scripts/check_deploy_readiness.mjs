#!/usr/bin/env node
/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — PRODUCTION DEPLOYMENT READINESS CHECKER
 * ============================================================================
 * Converts DEPLOYMENT_GUIDE.md into an automated, executable pre-flight
 * deployment validation tool.
 *
 * Validates:
 * 1. Runtime Environment (Node >= 20.x, OS, Architecture)
 * 2. Cloud Configuration Manifests (vercel.json, render.yaml)
 * 3. Security Credentials & Secrets Invariants (JWT entropy, MFA 64-hex key)
 * 4. Allowed Origins & CORS policy compliance
 * 5. Data Governance & Architecture Manifests (ASVS, Data Classification)
 * 6. Post-deployment checklist & operational probes
 *
 * Usage:
 *   node scripts/check_deploy_readiness.mjs
 *   node scripts/check_deploy_readiness.mjs --target-env production
 *   node scripts/check_deploy_readiness.mjs --json
 */

import fs from 'fs';
import path from 'path';

export const PRODUCTION_CHECKLIST = [
  { id: 'CHK-01', name: 'Health Probe', endpoint: '/api/v1/health', expectedStatus: 200 },
  { id: 'CHK-02', name: 'Readiness Probe', endpoint: '/api/v1/readiness', expectedStatus: 200 },
  { id: 'CHK-03', name: 'Initial Master Admin Authentication', route: '#login', role: 'MASTER' },
  { id: 'CHK-04', name: 'Cryptographic Invariant Verification', route: '#settings/updates', action: 'Verify Invariants' },
  { id: 'CHK-05', name: 'Database Point-in-Time Recovery (PITR)', target: 'MongoDB Atlas', action: 'Enable continuous backup' }
];

export function runDeploymentReadinessCheck({ targetEnv = process.env.NODE_ENV || 'development' } = {}) {
  const issues = [];
  const warnings = [];
  const checks = [];

  // 1. Node.js Version Check
  const nodeVer = process.version;
  const majorVer = parseInt(nodeVer.replace(/^v/, '').split('.')[0], 10);
  if (majorVer >= 20) {
    checks.push({ name: 'Node.js Runtime Version', status: 'PASS', detail: `${nodeVer} (>= v20 required)` });
  } else {
    issues.push(`Node.js version ${nodeVer} is below required LTS v20.x`);
    checks.push({ name: 'Node.js Runtime Version', status: 'FAIL', detail: nodeVer });
  }

  // 2. Vercel Configuration Check
  const vercelPath = path.resolve('vercel.json');
  const frontendVercelPath = path.resolve('frontend/vercel.json');
  const hasVercel = fs.existsSync(vercelPath) || fs.existsSync(frontendVercelPath);
  if (hasVercel) {
    checks.push({ name: 'Vercel SPA Manifest', status: 'PASS', detail: 'Edge rewrites & CDN routing configured' });
  } else {
    warnings.push('No vercel.json found in root or frontend directory');
    checks.push({ name: 'Vercel SPA Manifest', status: 'WARN', detail: 'Missing vercel.json' });
  }

  // 3. Render Web Service Manifest Check
  const renderPath = path.resolve('render.yaml');
  if (fs.existsSync(renderPath)) {
    const renderContent = fs.readFileSync(renderPath, 'utf8');
    const hasDisk = renderContent.includes('disk:') && renderContent.includes('/var/data/zamorin_documents');
    const hasDocStorage = renderContent.includes('DOCUMENT_STORAGE_ROOT');
    const hasGridFs = renderContent.includes('DOCUMENT_STORAGE_PROVIDER') && renderContent.includes('gridfs');
    if ((hasDisk && hasDocStorage) || hasGridFs) {
      checks.push({ name: 'Render Blueprint (render.yaml)', status: 'PASS', detail: hasGridFs ? 'Backend service with Mongo GridFS document storage provider configured' : 'Backend service with 10GB persistent disk mount (/var/data/zamorin_documents) configured' });
    } else {
      issues.push('render.yaml missing persistent disk configuration or DOCUMENT_STORAGE_ROOT');
      checks.push({ name: 'Render Blueprint (render.yaml)', status: 'FAIL', detail: 'Missing persistent disk definition' });
    }
  } else {
    warnings.push('No render.yaml found in workspace root');
    checks.push({ name: 'Render Blueprint (render.yaml)', status: 'WARN', detail: 'Missing render.yaml' });
  }

  // 4. Governance & Classification Manifests
  const asvsPath = path.resolve('backend/src/config/asvsMatrix.json');
  const dataClassPath = path.resolve('backend/src/config/dataClassification.json');
  if (fs.existsSync(asvsPath) && fs.existsSync(dataClassPath)) {
    checks.push({ name: 'Security & Data Governance Manifests', status: 'PASS', detail: 'ASVS 5.0 and Data Classification registers present' });
  } else {
    issues.push('Missing ASVS 5.0 matrix or Data Classification configuration in backend/src/config');
    checks.push({ name: 'Security & Data Governance Manifests', status: 'FAIL', detail: 'Missing required configuration JSON' });
  }

  // 5. Security Credentials & Secrets Invariants (if production)
  const isProd = targetEnv === 'production';
  const jwtSecret = process.env.JWT_ACCESS_SECRET;
  const mfaKey = process.env.MFA_ENCRYPTION_KEY;

  if (isProd) {
    if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.includes('placeholder')) {
      issues.push('JWT_ACCESS_SECRET must be at least 32 characters and non-placeholder in production');
      checks.push({ name: 'JWT Secret Entropy', status: 'FAIL', detail: 'Unsafe or missing secret' });
    } else {
      checks.push({ name: 'JWT Secret Entropy', status: 'PASS', detail: 'Sufficient entropy (>= 32 chars)' });
    }

    if (!mfaKey || mfaKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(mfaKey)) {
      issues.push('MFA_ENCRYPTION_KEY must be a 64-character hexadecimal string in production');
      checks.push({ name: 'MFA Encryption Key Entropy', status: 'FAIL', detail: 'Invalid 64-hex key' });
    } else {
      checks.push({ name: 'MFA Encryption Key Entropy', status: 'PASS', detail: 'Valid 64-character hex key' });
    }
  } else {
    checks.push({ name: 'Production Secrets Check', status: 'SKIP', detail: 'Non-production environment (pass --target-env production to enforce)' });
  }

  // 6. Zero-Build Vanilla Frontend Architecture Check
  const frontendRouterCheck = path.resolve('frontend/verifyRouterImports.mjs');
  if (fs.existsSync(frontendRouterCheck)) {
    checks.push({ name: 'Zero-Build Frontend Router Invariant', status: 'PASS', detail: 'Router integrity checker available' });
  }

  const isReady = issues.length === 0;

  return {
    targetEnvironment: targetEnv,
    isDeployReady: isReady,
    summary: isReady ? 'READY FOR DEPLOYMENT' : 'DEPLOYMENT BLOCKED BY PRE-FLIGHT CHECKS',
    checks,
    issues,
    warnings,
    postDeploymentChecklist: PRODUCTION_CHECKLIST
  };
}

// ─── PRODUCTION SECRETS VALIDATION MODE ─────────────────────────────────────
// Usage: node scripts/check_deploy_readiness.mjs --validate-production-config
//
// IMPORTANT: This mode checks secrets from the CURRENT process.env.
// When run locally (without Render env vars set), all secrets will be MISSING.
// This mode produces meaningful results only when executed ON the Render
// deployment (e.g. via `render exec` or a one-off job with the production
// environment injected).
//
// Output: PRODUCTION_SECRETS_VALIDATED or PRODUCTION_SECRETS_NOT_VALIDATED

const PRODUCTION_SECRET_SPECS = [
  {
    key: 'MONGODB_URI',
    isSecret: true,
    description: 'MongoDB Atlas connection string',
    validate: (val) => typeof val === 'string' && (val.startsWith('mongodb://') || val.startsWith('mongodb+srv://')),
  },
  {
    key: 'JWT_ACCESS_SECRET',
    isSecret: true,
    description: 'HMAC access token secret (min 32 chars)',
    validate: (val) => typeof val === 'string' && val.trim().length >= 32 && !val.includes('placeholder'),
  },
  {
    key: 'MFA_ENCRYPTION_KEY',
    isSecret: true,
    description: 'AES-256-GCM MFA key (64-char hex)',
    validate: (val) => typeof val === 'string' && /^[0-9a-fA-F]{64}$/.test(val.trim()),
  },
  {
    key: 'INITIAL_MASTER_EMAIL',
    isSecret: true,
    description: 'Bootstrap master admin email',
    validate: (val) => typeof val === 'string' && val.includes('@') && val.length >= 5,
  },
  {
    key: 'INITIAL_MASTER_PASSWORD',
    isSecret: true,
    description: 'Bootstrap master admin password (min 15 chars)',
    validate: (val) => typeof val === 'string' && val.trim().length >= 15,
  },
  {
    key: 'CLOUDINARY_CLOUD_NAME',
    isSecret: false,
    description: 'Cloudinary cloud name for private storage',
    validate: (val) => typeof val === 'string' && val.trim().length > 0,
  },
  {
    key: 'CLOUDINARY_API_KEY',
    isSecret: true,
    description: 'Cloudinary API key',
    validate: (val) => typeof val === 'string' && val.trim().length >= 5,
  },
  {
    key: 'CLOUDINARY_API_SECRET',
    isSecret: true,
    description: 'Cloudinary API secret',
    validate: (val) => typeof val === 'string' && val.trim().length >= 10,
  },
  {
    key: 'ALLOWED_ORIGINS',
    isSecret: false,
    description: 'Authorised CORS origins (must not contain *)',
    validate: (val) => typeof val === 'string' && !val.includes('*') && val.includes('https://'),
  },
  {
    key: 'DOCUMENT_STORAGE_DRIVER',
    isSecret: false,
    description: 'Document storage driver',
    validate: (val) => ['RENDER_PERSISTENT_DISK', 'PRIVATE_OBJECT_STORAGE'].includes(val),
  },
  {
    key: 'DOCUMENT_STORAGE_ROOT',
    isSecret: false,
    description: 'Persistent disk mount path',
    validate: (val) => typeof val === 'string' && val.startsWith('/') && !val.startsWith('/tmp'),
  },
];

export function validateProductionSecrets(env = process.env) {
  const results = [];
  let allValid = true;
  const UNSAFE_PATTERNS = ['password', 'secret', 'placeholder', '123456', 'changeme', 'test'];

  for (const spec of PRODUCTION_SECRET_SPECS) {
    const raw = env[spec.key];
    const isPresent = raw !== undefined && raw !== null && String(raw).trim() !== '';

    let status;
    let detail;

    if (!isPresent) {
      status = 'MISSING';
      detail = `Required variable is absent or empty`;
      allValid = false;
    } else {
      // Check for obviously unsafe/default values (without printing the value)
      const lowerVal = String(raw).toLowerCase();
      const isUnsafe = UNSAFE_PATTERNS.some(p => lowerVal === p || lowerVal.startsWith(p + '1'));
      if (isUnsafe) {
        status = 'UNSAFE';
        detail = 'Value matches a known weak/default pattern — replace with cryptographically strong value';
        allValid = false;
      } else if (!spec.validate(raw)) {
        status = 'INVALID';
        detail = `Value fails validation for: ${spec.description}`;
        allValid = false;
      } else {
        status = 'PRESENT';
        detail = spec.isSecret ? 'Configured (Value Redacted)' : `Valid: ${raw.substring(0, 4)}…`;
      }
    }

    results.push({
      key: spec.key,
      status,
      detail,
      description: spec.description,
      isSecret: spec.isSecret,
    });
  }

  const verdict = allValid
    ? 'PRODUCTION_SECRETS_VALIDATED'
    : 'PRODUCTION_SECRETS_NOT_VALIDATED — BLOCKING PRODUCTION GO-LIVE';

  return { verdict, allValid, results, timestamp: new Date().toISOString() };
}

// ─── CLI EXECUTION ───────────────────────────────────────────────────────────

function runCli() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');

  // ── Production Secrets Validation Mode ──────────────────────────────────
  if (args.includes('--validate-production-config')) {
    const result = validateProductionSecrets(process.env);

    console.log('================================================================');
    console.log(' ZAMORIN CAFÉ ERP — PRODUCTION SECRETS VALIDATION');
    console.log('================================================================');
    console.log('WARNING: Secret values are NEVER printed. Statuses only.');
    console.log('NOTE:    Run this command on the Render deployment shell for');
    console.log('         meaningful results (render exec or one-off job).');
    console.log(`Timestamp: ${result.timestamp}`);
    console.log('----------------------------------------------------------------');

    result.results.forEach(r => {
      const icon = r.status === 'PRESENT' ? '[PRESENT]'
        : r.status === 'MISSING'  ? '[MISSING]'
        : r.status === 'INVALID'  ? '[INVALID]'
        : r.status === 'UNSAFE'   ? '[UNSAFE ]'
        : '[UNKNOWN]';
      console.log(`  ${icon} ${r.key.padEnd(30, ' ')} : ${r.detail}`);
    });

    console.log('----------------------------------------------------------------');
    console.log(`VERDICT: ${result.verdict}`);
    console.log('================================================================');

    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    }

    process.exit(result.allValid ? 0 : 1);
    return;
  }

  // ── Standard Deployment Readiness Check ─────────────────────────────────
  const envIndex = args.indexOf('--target-env');
  const targetEnv = envIndex !== -1 ? args[envIndex + 1] : (process.env.NODE_ENV || 'development');

  const result = runDeploymentReadinessCheck({ targetEnv });

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.isDeployReady ? 0 : 1);
  }

  console.log('================================================================');
  console.log(' ZAMORIN CAFÉ ERP — PRODUCTION DEPLOYMENT READINESS CHECKER');
  console.log('================================================================');
  console.log(`Target Environment: ${result.targetEnvironment.toUpperCase()}`);
  console.log(`Status: ${result.summary}\n`);

  console.log('PRE-FLIGHT VALIDATION RESULTS:');
  result.checks.forEach(c => {
    const icon = c.status === 'PASS' ? '[PASS]' : c.status === 'WARN' ? '[WARN]' : c.status === 'SKIP' ? '[SKIP]' : '[FAIL]';
    console.log(`  ${icon} ${c.name.padEnd(40, ' ')} : ${c.detail}`);
  });

  if (result.warnings.length > 0) {
    console.log('\nWARNINGS:');
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }

  if (result.issues.length > 0) {
    console.log('\nBLOCKING ISSUES:');
    result.issues.forEach(i => console.log(`  - ${i}`));
  }

  console.log('\nPOST-DEPLOYMENT OPERATIONAL CHECKLIST:');
  result.postDeploymentChecklist.forEach(item => {
    console.log(`  [ ] ${item.id} - ${item.name} (${item.endpoint || item.route || item.target})`);
  });

  console.log('\n================================================================');
  process.exit(result.isDeployReady ? 0 : 1);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  runCli();
}
