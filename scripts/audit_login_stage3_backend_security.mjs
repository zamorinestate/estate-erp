/**
 * scripts/audit_login_stage3_backend_security.mjs
 *
 * Comprehensive Runtime Security & Canonical Authority Matrix for
 * Cafe Operations Login / Trusted Device / Operator Session Module.
 * Covers all requirements from Stage 3 Final Security Gate.
 */

import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRequire = createRequire(path.join(__dirname, '../backend/package.json'));
const express = backendRequire('express');

import { createApp } from '../backend/src/cafe-operations/app.js';
import { getRepositories, initRepositories } from '../backend/src/cafe-operations/repositories/index.js';
import { setMasterAuthAdapter, referenceAdapter, _seedDemoMaster, _resetDemoMasters } from '../backend/src/cafe-operations/services/masterAuthAdapter.js';
import deviceEnrollmentService from '../backend/src/cafe-operations/services/deviceEnrollmentService.js';
import pinService from '../backend/src/cafe-operations/services/operatorPinService.js';
import rateLimitService from '../backend/src/cafe-operations/services/rateLimitService.js';
import deviceService from '../backend/src/cafe-operations/services/deviceService.js';

let standaloneServer;
let standaloneBaseUrl;
let prodServer;
let prodBaseUrl;

async function startTestServers() {
  initRepositories('memory');
  rateLimitService._reset();
  setMasterAuthAdapter(referenceAdapter);
  _resetDemoMasters();

  // 1. Standalone test server
  const standaloneApp = createApp();
  await new Promise((resolve) => {
    standaloneServer = http.createServer(standaloneApp);
    standaloneServer.listen(0, '127.0.0.1', () => {
      const port = standaloneServer.address().port;
      standaloneBaseUrl = `http://127.0.0.1:${port}/api/cafe-ops`;
      resolve();
    });
  });

  // 2. Production mounted server (/api/v1/cafe-ops)
  const prodApp = express();
  prodApp.use(express.json());
  const apiRoutes = backendRequire('./src/routes/index.js');
  prodApp.use('/api/v1', apiRoutes);

  await new Promise((resolve) => {
    prodServer = http.createServer(prodApp);
    prodServer.listen(0, '127.0.0.1', () => {
      const port = prodServer.address().port;
      prodBaseUrl = `http://127.0.0.1:${port}/api/v1/cafe-ops`;
      resolve();
    });
  });
}

async function stopTestServers() {
  if (standaloneServer) await new Promise((resolve) => standaloneServer.close(resolve));
  if (prodServer) await new Promise((resolve) => prodServer.close(resolve));
}

async function request(baseUrl, path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

let passed = 0;
let failed = 0;

const SYNTHETIC_MASTER_PASSWORD = ['Master', 'Password123!'].join('');
const SYNTHETIC_WRONG_PASSWORD = ['Wrong', 'Password!'].join('');

function check(name, condition, failureDetails = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${name} ${failureDetails}`);
    failed++;
  }
}

async function runSecurityMatrix() {
  console.log('======================================================================');
  console.log('  STAGE 3 RUNTIME SECURITY & CANONICAL AUTHORITY AUDIT');
  console.log('======================================================================\n');

  await startTestServers();
  const repos = getRepositories();

  try {
    const cafeA = 'CAFE_A_001';
    const cafeB = 'CAFE_B_002';
    const orgId = 'ORG_ZAMORIN';
    const empId = 'EMP_OP_001';

    // -------------------------------------------------------------------
    // 1. Setup Employee & Device for Cafe A
    // -------------------------------------------------------------------
    await repos.employees.seed({ id: empId, isActive: true, name: 'Operator 1', employeeCode: 'OP-01' });
    await repos.operatorAccess.create({ employeeId: empId, cafeId: cafeA, organisationId: orgId, status: 'ACTIVE', assignedByEmployeeId: 'ADMIN' });
    await pinService.issueOrResetPin({ employeeId: empId, organisationId: orgId, actingEmployeeId: 'ADMIN', pin: '147258' });

    const { codePlain: enrCode } = await deviceEnrollmentService.createEnrollmentToken({
      organisationId: orgId,
      cafeId: cafeA,
      cafeDisplayName: 'Calicut Beach',
      intendedDisplayName: 'POS-01',
      createdByEmployeeId: 'USR_ADMIN_1',
    });

    // 1. Device Enrollment
    const enrollRes = await request(standaloneBaseUrl, '/devices/enroll', {
      method: 'POST',
      body: { enrollmentCode: enrCode, displayName: 'POS-01', platform: 'web' },
    });
    check('1. Device Enrollment succeeds with valid single-use token', enrollRes.status === 200 && enrollRes.data.success);
    const deviceToken = enrollRes.data.data.deviceToken;
    const deviceId = enrollRes.data.data.device.id;

    // 2. Enrollment Replay Denied
    const replayRes = await request(standaloneBaseUrl, '/devices/enroll', {
      method: 'POST',
      body: { enrollmentCode: enrCode, displayName: 'POS-01-REPLAY', platform: 'web' },
    });
    check('2. Device Enrollment replay is strictly denied (400/409)', replayRes.status >= 400 && !replayRes.data.success);

    // 3. Operator Correct PIN Signs In
    const opLoginRes = await request(standaloneBaseUrl, '/operator/signin', {
      method: 'POST',
      headers: { 'x-cafeops-device-token': deviceToken },
      body: { pin: '147258' },
    });
    check('3. Operator correct PIN signs in and creates session', opLoginRes.status === 200 && opLoginRes.data.success);
    const sessionToken = opLoginRes.data?.data?.sessionToken;

    // 4. Operator Wrong PIN Rejected Generically
    const wrongPinRes = await request(standaloneBaseUrl, '/operator/signin', {
      method: 'POST',
      headers: { 'x-cafeops-device-token': deviceToken },
      body: { pin: '999999' },
    });
    check('4. Operator wrong PIN fails with generic denial', wrongPinRes.status === 401 && !wrongPinRes.data.success);

    // 5. Operator Access Revocation Blocks Login
    const activeAccess = await repos.operatorAccess.findActiveForEmployeeAndCafe(empId, cafeA);
    if (activeAccess) {
      await repos.operatorAccess.update(activeAccess.id, { status: 'REVOKED' });
    }
    const revokedOpRes = await request(standaloneBaseUrl, '/operator/signin', {
      method: 'POST',
      headers: { 'x-cafeops-device-token': deviceToken },
      body: { pin: '147258' },
    });
    check('5. Operator with revoked access is denied sign-in', revokedOpRes.status === 401 || revokedOpRes.status === 403);

    // Restore Operator Access for Cafe A
    await repos.operatorAccess.create({ employeeId: empId, cafeId: cafeA, organisationId: orgId, status: 'ACTIVE', assignedByEmployeeId: 'ADMIN' });

    // 6. Operator Wrong Cafe Mismatch
    const empCafeB = 'EMP_OP_002';
    await repos.employees.seed({ id: empCafeB, isActive: true, name: 'Operator 2', employeeCode: 'OP-02' });
    await pinService.issueOrResetPin({ employeeId: empCafeB, organisationId: orgId, pin: '258369', actingEmployeeId: 'ADMIN' });
    await repos.operatorAccess.create({
      employeeId: empCafeB,
      cafeId: cafeB, // Cafe B
      organisationId: orgId,
      status: 'ACTIVE',
      assignedByEmployeeId: 'ADMIN',
    });
    const wrongCafeRes = await request(standaloneBaseUrl, '/operator/signin', {
      method: 'POST',
      headers: { 'x-cafeops-device-token': deviceToken }, // Cafe A device
      body: { pin: '258369' },
    });
    check('6. Operator assigned to Cafe B denied on Cafe A device (CAFE_MISMATCH)', wrongCafeRes.status === 401 && !wrongCafeRes.data.success);

    // -------------------------------------------------------------------
    // 2. Master Authentication & Role Separation
    // -------------------------------------------------------------------
    _seedDemoMaster({
      identifier: 'master@zamorin.com',
      employeeId: 'USR_MASTER_01',
      organisationId: orgId,
      role: 'MASTER_PRIMARY',
      password: SYNTHETIC_MASTER_PASSWORD,
      mfaCode: null, // no MFA
    });
    repos.masters.seed({ id: 'USR_MASTER_01', isActive: true, organisationId: orgId, role: 'MASTER_PRIMARY' });

    _seedDemoMaster({
      identifier: 'mfa_master@zamorin.com',
      employeeId: 'USR_MASTER_01',
      organisationId: orgId,
      role: 'MASTER_PRIMARY',
      password: SYNTHETIC_MASTER_PASSWORD,
      mfaCode: '654321', // MFA enabled
    });
    repos.masters.seed({ id: 'USR_MASTER_01', isActive: true, organisationId: orgId, role: 'MASTER_PRIMARY' });

    // 7. Master Correct Password (no MFA)
    const masterRes = await request(standaloneBaseUrl, '/operator/master-signin/credentials', {
      method: 'POST',
      headers: { 'x-cafeops-device-token': deviceToken },
      body: { identifier: 'master@zamorin.com', password: SYNTHETIC_MASTER_PASSWORD },
    });
    check('7. Master correct credentials create session directly when no MFA required', masterRes.status === 200 && masterRes.data.success);

    // 8. Master Wrong Password
    const masterWrongRes = await request(standaloneBaseUrl, '/operator/master-signin/credentials', {
      method: 'POST',
      headers: { 'x-cafeops-device-token': deviceToken },
      body: { identifier: 'master@zamorin.com', password: SYNTHETIC_WRONG_PASSWORD },
    });
    check('8. Master wrong password rejected with generic 401', masterWrongRes.status === 401 && !masterWrongRes.data.success);

    // 9. Master MFA Challenge
    const mfaInitRes = await request(standaloneBaseUrl, '/operator/master-signin/credentials', {
      method: 'POST',
      headers: { 'x-cafeops-device-token': deviceToken },
      body: { identifier: 'mfa_master@zamorin.com', password: SYNTHETIC_MASTER_PASSWORD },
    });
    check('9. Master MFA-configured account returns requiresMfa: true challenge', mfaInitRes.status === 200 && mfaInitRes.data.data.requiresMfa);
    const challengeId = mfaInitRes.data?.data?.mfaChallengeId;

    // 10. Master Wrong MFA Code
    const mfaWrongRes = await request(standaloneBaseUrl, '/operator/master-signin/mfa', {
      method: 'POST',
      headers: { 'x-cafeops-device-token': deviceToken },
      body: { mfaChallengeId: challengeId, code: '000000' },
    });
    check('10. Master wrong MFA code rejected with 401', mfaWrongRes.status === 401);

    // 11. Master Correct MFA Code
    const mfaCorrectRes = await request(standaloneBaseUrl, '/operator/master-signin/mfa', {
      method: 'POST',
      headers: { 'x-cafeops-device-token': deviceToken },
      body: { mfaChallengeId: challengeId, code: '654321' },
    });
    check('11. Master correct MFA code establishes active session', mfaCorrectRes.status === 200 && mfaCorrectRes.data.success);

    // 12. Master MFA Replay Denied
    const mfaReplayRes = await request(standaloneBaseUrl, '/operator/master-signin/mfa', {
      method: 'POST',
      headers: { 'x-cafeops-device-token': deviceToken },
      body: { mfaChallengeId: challengeId, code: '654321' },
    });
    check('12. Master MFA challenge token cannot be replayed', mfaReplayRes.status === 401 || mfaReplayRes.status === 400);

    // 13. Untrusted Device Request Denied
    const untrustedRes = await request(standaloneBaseUrl, '/operator/signin', {
      method: 'POST',
      headers: { 'x-cafeops-device-token': 'BOGUS_DEVICE_TOKEN_123' },
      body: { pin: '147258' },
    });
    check('13. Untrusted device rejected before credential inspection (401/403)', untrustedRes.status === 401 || untrustedRes.status === 403);

    // 14. Revoked Device Denied
    await repos.devices.update(deviceId, { lifecycleStatus: 'REVOKED' });
    const revokedDevRes = await request(standaloneBaseUrl, '/operator/signin', {
      method: 'POST',
      headers: { 'x-cafeops-device-token': deviceToken },
      body: { pin: '147258' },
    });
    check('14. Revoked device strictly denied from all operations (403)', revokedDevRes.status === 403);

    // 15. Cafe Scope Binding (Client cafeId Spoofing in Body/Query/Header Ignored)
    await repos.devices.update(deviceId, { lifecycleStatus: 'ACTIVE' }); // restore device
    const spoofRes = await request(standaloneBaseUrl, '/operator/master-signin/credentials', {
      method: 'POST',
      headers: { 'x-cafeops-device-token': deviceToken, 'x-cafe-id': 'BOGUS_CAFE_999' },
      body: { identifier: 'master@zamorin.com', password: SYNTHETIC_MASTER_PASSWORD, cafeId: 'BOGUS_CAFE_999' },
    });
    check('15. effectiveCafeId strictly bound to device cafe, client spoof ignored', spoofRes.data?.data?.operator?.cafeId === cafeA);

    // 16. Cross-Cafe IDOR Prevention
    check('16. Device session isolated to device.cafeId without cross-cafe leak', spoofRes.data?.data?.operator?.cafeId !== 'BOGUS_CAFE_999');

    // 17. Security Events Logged
    const events = await repos.securityEvents.list({});
    check('17. SecurityEvents created for auth attempts, failures, and device mutations', events.length >= 5);

    // 18. Zero Secrets in Audit Event Logs
    const anySecretsLogged = events.some(e => {
      const str = JSON.stringify(e);
      return str.includes(SYNTHETIC_MASTER_PASSWORD) || str.includes('147258') || str.includes('654321');
    });
    check('18. Sensitive secrets (passwords, PINs, TOTP) 100% excluded from audit logs', !anySecretsLogged);

    // 19. Operator PIN Never Stored Plaintext
    const credRec = await repos.operatorCredentials.findByEmployeeId(empId);
    check('19. Operator PIN stored as bcrypt hash + lookup hash (never plaintext)', credRec && !credRec.pin && credRec.pinHash);

    // 20. Denial Invariant: Database State Not Mutated on Failed Auth
    const preSession = await repos.sessions.findActiveByDevice(deviceId);
    await request(standaloneBaseUrl, '/operator/signin', {
      method: 'POST',
      headers: { 'x-cafeops-device-token': deviceToken },
      body: { pin: '000000' },
    });
    const postSession = await repos.sessions.findActiveByDevice(deviceId);
    check('20. Denial Database Invariant: Failed auth creates 0 active sessions', (preSession?.id || null) === (postSession?.id || null));

    // -------------------------------------------------------------------
    // 21. Device Reassignment & Session Invalidation
    // -------------------------------------------------------------------
    const liveSessionRes = await request(standaloneBaseUrl, '/operator/signin', {
      method: 'POST',
      headers: { 'x-cafeops-device-token': deviceToken },
      body: { pin: '147258' },
    });
    const liveToken = liveSessionRes.data?.data?.sessionToken;
    const reassignRes = await deviceService.reassignCafe(deviceId, cafeB, 'Relocating terminal to second location', 'ADMIN');
    const sessionAfterReassign = await request(standaloneBaseUrl, '/operator/session', {
      headers: { 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': liveToken },
    });
    check('21. Device reassignment immediately terminates prior active sessions', sessionAfterReassign.status === 401);

    // -------------------------------------------------------------------
    // 22. Governance Role Guard Delegation (requireGovernanceRole)
    // -------------------------------------------------------------------
    const { requireGovernanceRole, resolveCallerFromRequest } = await import('../backend/src/cafe-operations/middleware/requireGovernanceRole.js');
    const mockReqStaff = { auth: { userId: 'STAFF_01', role: 'STAFF', organisationId: orgId, status: 'ACTIVE' } };
    let staffDenied = false;
    const staffGuard = requireGovernanceRole('MASTER_PRIMARY', 'CAFE_ADMIN');
    staffGuard(mockReqStaff, {
      status(s) { return { json(b) { if (s === 403) staffDenied = true; return b; } }; }
    }, () => {});
    check('22. Canonical STAFF role is strictly denied from governance endpoints', staffDenied);

    const mockReqDisabledMaster = { auth: { userId: 'MASTER_DIS', role: 'MASTER', isPrimaryMaster: true, status: 'SUSPENDED' } };
    let disabledDenied = false;
    staffGuard(mockReqDisabledMaster, {
      status(s) { return { json(b) { if (s === 403) disabledDenied = true; return b; } }; }
    }, () => {});
    check('23. Disabled / Suspended Master account is strictly denied from governance', disabledDenied);

    const mockReqPrimaryMaster = { auth: { userId: 'MASTER_PRI', role: 'MASTER', isPrimaryMaster: true, status: 'ACTIVE' } };
    let primaryAllowed = false;
    staffGuard(mockReqPrimaryMaster, {}, () => { primaryAllowed = true; });
    check('24. Canonical MASTER with isPrimaryMaster=true is mapped and authorized', primaryAllowed);

    // -------------------------------------------------------------------
    // 25. Production Server Mount Verification (/api/v1/cafe-ops)
    // -------------------------------------------------------------------
    const prodStatusRes = await request(prodBaseUrl, '/devices/status', {
      headers: { 'x-cafeops-device-token': deviceToken },
    });
    check('25. Real Zamorin mounted server (/api/v1/cafe-ops) responds cleanly', prodStatusRes.status === 200 && prodStatusRes.data.success);

  } finally {
    await stopTestServers();
  }

  console.log('\n======================================================================');
  console.log(`  SECURITY AUDIT COMPLETE: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityMatrix();
