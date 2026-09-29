'use strict';

/**
 * =============================================================================
 * PRE-FLIGHT PRODUCTION DEPLOYMENT VALIDATOR — ZAMORIN CAFE ERP
 * =============================================================================
 * Executes comprehensive pre-flight diagnostics on environment variables,
 * secret invariants, database replica set capability, and CORS configuration.
 *
 * Usage:
 *   node backend/src/scripts/verifyDeploymentConfig.js
 * =============================================================================
 */

require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { loadEnvironment } = require('../config/environment');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

async function runPreFlightCheck() {
  console.log(`\n${BOLD}${CYAN}===============================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}         ZAMORIN CAFE ERP — PRE-FLIGHT DEPLOYMENT AUDITOR & DIAGNOSTIC          ${RESET}`);
  console.log(`${BOLD}${CYAN}===============================================================================${RESET}\n`);

  let totalChecks = 0;
  let passedChecks = 0;
  let failedChecks = 0;
  const issues = [];

  function recordResult(name, pass, details = '') {
    totalChecks++;
    if (pass) {
      passedChecks++;
      console.log(`  ${GREEN}[PASS]${RESET} ${name}${details ? ` (${details})` : ''}`);
    } else {
      failedChecks++;
      console.log(`  ${RED}[FAIL]${RESET} ${name} — ${RED}${details}${RESET}`);
      issues.push({ name, details });
    }
  }

  // 1. Environment & Mode Verification
  console.log(`${BOLD}[1/5] Auditing Environment & Security Mode...${RESET}`);
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  recordResult('NODE_ENV Configuration', ['development', 'test', 'production'].includes(nodeEnv), `Active mode: ${nodeEnv}`);

  // 2. Secret Invariant Sanity
  console.log(`\n${BOLD}[2/5] Verifying Cryptographic Secrets & Token Keys...${RESET}`);
  const jwtSecret = process.env.JWT_ACCESS_SECRET || '';
  const isJwtValid = jwtSecret.length >= 32 && !jwtSecret.includes('replace-with') && !jwtSecret.includes('placeholder');
  recordResult('JWT Access Secret Strength', isJwtValid, isJwtValid ? `Length: ${jwtSecret.length} chars` : 'Must be >= 32 random chars without placeholders');

  const mfaKey = process.env.MFA_ENCRYPTION_KEY || '';
  const isMfaValid = mfaKey.length === 64 && /^[0-9a-fA-F]+$/.test(mfaKey);
  recordResult('MFA 64-Hex Encryption Key', isMfaValid, isMfaValid ? '64-hex key verified' : 'Must be exact 64-character hexadecimal key');

  // 3. CORS, Domain & Android Attestation Policy Validation
  console.log(`\n${BOLD}[3/5] Validating CORS, Domain Bindings & Android Attestation Policy...${RESET}`);
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const isCorsValid = allowedOrigins.length > 0 && !allowedOrigins.includes('*') && allowedOrigins.every((o) => o.startsWith('http://') || o.startsWith('https://'));
  recordResult('CORS Allowed Origins Policy', isCorsValid, isCorsValid ? `${allowedOrigins.length} origin(s) mapped: ${allowedOrigins.join(', ')}` : 'Must define explicit http(s) origins without wildcards');

  const androidPackage = String(
    process.env.ZAMORIN_ANDROID_APP_PACKAGE || 'com.zamorin.cafe.erp'
  ).trim();
  const androidCertDigests = String(
    process.env.ZAMORIN_ANDROID_APP_CERT_SHA256 || ''
  )
    .split(/[,;\s]+/)
    .map((value) => value.trim().toLowerCase().replace(/[^a-f0-9]/g, ''))
    .filter(Boolean);
  const androidPackageValid = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(androidPackage);
  const androidCertPolicyValid =
    androidCertDigests.length > 0 &&
    androidCertDigests.every((value) => /^[a-f0-9]{64}$/.test(value));

  recordResult(
    'Android Application Package Policy',
    androidPackageValid,
    androidPackageValid
      ? `Package: ${androidPackage}`
      : 'ZAMORIN_ANDROID_APP_PACKAGE must be a valid Android applicationId'
  );
  recordResult(
    'Android App Signing Certificate SHA-256 Policy',
    nodeEnv !== 'production' || androidCertPolicyValid,
    nodeEnv !== 'production'
      ? (androidCertPolicyValid ? `${androidCertDigests.length} digest(s) configured` : 'Optional outside production')
      : (androidCertPolicyValid
        ? `${androidCertDigests.length} production signing digest(s) configured`
        : 'ZAMORIN_ANDROID_APP_CERT_SHA256 must contain one or more 64-hex SHA-256 digests')
  );

  // 4. Initial Master Credentials & Storage Config
  console.log(`\n${BOLD}[4/5] Auditing Initial Master Credentials & Storage Driver...${RESET}`);
  const masterEmail = process.env.INITIAL_MASTER_EMAIL || '';
  const isMasterEmailValid = Boolean(masterEmail && masterEmail.includes('@') && !masterEmail.includes('placeholder'));
  recordResult('Initial Master Admin Email', isMasterEmailValid, isMasterEmailValid ? `Configured: ${masterEmail}` : 'INITIAL_MASTER_EMAIL missing or placeholder');

  const masterPassword = process.env.INITIAL_MASTER_PASSWORD || '';
  const isMasterPasswordValid = masterPassword.length >= 8 && !masterPassword.includes('placeholder');
  recordResult('Initial Master Admin Password Strength', isMasterPasswordValid, isMasterPasswordValid ? 'Master password configured (>= 8 chars)' : 'INITIAL_MASTER_PASSWORD must be >= 8 characters');

  const storageDriver = (process.env.PRIVATE_STORAGE_DRIVER || (nodeEnv === 'production' ? 'cloudinary' : 'local')).toLowerCase();
  const isStorageValid = ['local', 'cloudinary'].includes(storageDriver);
  recordResult('Private Storage Driver Mode', isStorageValid, `Driver: ${storageDriver}`);

  // 5. Database Connection & Transaction Capability
  console.log(`\n${BOLD}[5/5] Probing Database Connectivity & Transaction Support...${RESET}`);
  const mongoUri = process.env.MONGODB_URI || '';
  const isUriConfigured = Boolean(mongoUri && !mongoUri.includes('DB_USER') && !mongoUri.includes('DB_PASSWORD') && !mongoUri.includes('CLUSTER.mongodb.net'));

  if (!isUriConfigured) {
    recordResult('MongoDB Connection URI', false, 'MONGODB_URI missing or contains template placeholders');
  } else {
    try {
      const dns = require('dns');
      dns.setDefaultResultOrder('ipv4first');
      const customDns = (process.env.DNS_SERVERS || '').split(',').map(s => s.trim()).filter(Boolean);
      if (customDns.length > 0) {
        dns.setServers(customDns);
      }

      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
      recordResult('MongoDB Cluster Connectivity', true, 'Connected successfully to cluster');

      // Check if cluster supports transactions (Replica Set)
      const isReplicaSet = Boolean(mongoose.connection.client?.topology?.description?.setName || mongoose.connection.client?.topology?.description?.type?.includes('ReplicaSet'));
      
      if (isReplicaSet) {
        recordResult('MongoDB Multi-Document Transaction Support', true, 'Replica Set active (ACID Transactions Supported)');
      } else {
        // Test a lightweight transaction probe
        let txSuccess = false;
        try {
          const session = await mongoose.startSession();
          await session.withTransaction(async () => {});
          await session.endSession();
          txSuccess = true;
        } catch {
          txSuccess = false;
        }
        recordResult(
          'MongoDB Multi-Document Transaction Support',
          txSuccess,
          txSuccess ? 'Replica set transaction verified' : 'Standalone Mongo detected (Transactions require Replica Set rs0 or MongoDB Atlas)'
        );
      }

      await mongoose.disconnect();
    } catch (dbErr) {
      recordResult('MongoDB Cluster Connectivity', false, dbErr.message);
    }
  }

  // Final Summary Scorecard
  console.log(`\n${BOLD}${CYAN}===============================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}                             DEPLOYMENT SCORECARD                              ${RESET}`);
  console.log(`${BOLD}${CYAN}===============================================================================${RESET}`);
  console.log(`Total Checks Executed : ${totalChecks}`);
  console.log(`Passed Checks         : ${GREEN}${passedChecks}${RESET}`);
  console.log(`Failed / Action Items : ${failedChecks > 0 ? `${RED}${failedChecks}${RESET}` : `${GREEN}0${RESET}`}`);

  if (failedChecks === 0) {
    console.log(`\n${BOLD}${GREEN}✔ ALL CONFIGURATION PRE-FLIGHT INVARIANTS PASSED.${RESET}`);
    console.log(`${YELLOW}Release certification still requires exact-head CI, repository invariants, and REC-04E real-hardware acceptance.${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`\n${BOLD}${YELLOW}⚠ ACTION REQUIRED BEFORE DEPLOYMENT:${RESET}`);
    issues.forEach((iss, idx) => {
      console.log(`  ${idx + 1}. [${iss.name}] ${iss.details}`);
    });
    console.log(`\nPlease address the items above in your production environment variables (.env / Render).\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  runPreFlightCheck().catch((err) => {
    console.error(`${RED}[FATAL] Deployment pre-flight check crashed:${RESET}`, err);
    process.exit(1);
  });
}

module.exports = { runPreFlightCheck };
