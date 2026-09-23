'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const http = require('http');

const { createApp } = require('../src/server');
const authService = require('../src/services/authService');
const { StandardOperatingProcedure } = require('../src/models/StandardOperatingProcedure');
const { SopAcknowledgement } = require('../src/models/SopAcknowledgement');
const { TrainingCourse } = require('../src/models/TrainingCourse');
const { EmployeeCompetency } = require('../src/models/EmployeeCompetency');

function makeRequest({ port, method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    let serializedBody = null;
    const reqHeaders = { ...headers };

    if (body) {
      serializedBody = JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(serializedBody);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path,
        headers: reqHeaders,
      },
      (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(responseData);
          } catch (e) {
            json = { raw: responseData };
          }
          resolve({ status: res.statusCode, data: json });
        });
      }
    );

    req.on('error', reject);
    if (serializedBody) req.write(serializedBody);
    req.end();
  });
}

test('STAGE 06 — SOP, Training & Competency Academy Suite', async (t) => {
  let mongod;
  let server;
  let port;
  let ownerToken;
  let foreignToken;

  const ORG_ID = 'ORG-ZAMORIN-TEST';
  const FOREIGN_ORG_ID = 'ORG-FOREIGN-TEST';

  t.before(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);

    const app = createApp({ allowedOrigins: ['*'], production: false });
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });

    const ownerUser = {
      userId: 'USR-OWNER-01',
      role: 'OWNER',
      organisationId: ORG_ID,
      email: 'owner@zamorincafe.com',
      fullName: 'Owner Academy Lead',
      accountStatus: 'ACTIVE',
      sessionVersion: 1,
      permissionsVersion: 1,
      assignedCafeIds: ['ZC-0001'],
    };

    const foreignOwnerUser = {
      userId: 'USR-FOREIGN-01',
      role: 'OWNER',
      organisationId: FOREIGN_ORG_ID,
      email: 'foreign.owner@other.com',
      fullName: 'Foreign Owner Academy',
      accountStatus: 'ACTIVE',
      sessionVersion: 1,
      permissionsVersion: 1,
      assignedCafeIds: ['ZC-9999'],
    };

    const { User } = require('../src/models/User');
    const { RolePermission } = require('../src/models/RolePermission');

    t.mock.method(User, 'findOne', async (query) => {
      if (query?.userId === ownerUser.userId) return ownerUser;
      if (query?.userId === foreignOwnerUser.userId) return foreignOwnerUser;
      return null;
    });

    t.mock.method(authService, 'verifyAccessToken', async (token) => {
      if (token === 'tok_owner') {
        return {
          payload: {
            sub: ownerUser.userId,
            org: ownerUser.organisationId,
            role: ownerUser.role,
            email: ownerUser.email,
            name: ownerUser.fullName,
            assignedCafeIds: ownerUser.assignedCafeIds,
            sv: 0,
            usv: 1,
            pv: 1,
            sid: 'SS-OWNER-01',
          },
          session: {
            sessionId: 'SS-OWNER-01',
            roleSnapshot: ownerUser.role,
            sessionVersion: 0,
            mfaVerified: true,
            stepUpVerifiedAt: new Date().toISOString(),
          },
        };
      }
      if (token === 'tok_foreign') {
        return {
          payload: {
            sub: foreignOwnerUser.userId,
            org: foreignOwnerUser.organisationId,
            role: foreignOwnerUser.role,
            email: foreignOwnerUser.email,
            name: foreignOwnerUser.fullName,
            assignedCafeIds: foreignOwnerUser.assignedCafeIds,
            sv: 0,
            usv: 1,
            pv: 1,
            sid: 'SS-FOREIGN-01',
          },
          session: {
            sessionId: 'SS-FOREIGN-01',
            roleSnapshot: foreignOwnerUser.role,
            sessionVersion: 0,
            mfaVerified: true,
            stepUpVerifiedAt: new Date().toISOString(),
          },
        };
      }
      throw new Error('Invalid token');
    });

    t.mock.method(RolePermission, 'findEffectiveRules', async ({ role, permissionCode }) => [
      {
        role,
        permissionCode,
        effect: 'ALLOW',
        scope: 'ORGANISATION',
        isCurrentlyEffective: () => true,
      },
    ]);

    ownerToken = 'tok_owner';
    foreignToken = 'tok_foreign';
  });

  t.after(async () => {
    if (server) server.close();
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  // ── 1. Create SOP Draft with Version 1 Lineage ───────────────────────────
  await t.test('1. Create SOP Draft with version 1 and cryptographic checksum', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/academy/sops',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        sopId: 'SOP-HYG-001',
        title: 'High-Temperature Dishwashing & Sanitisation Protocol',
        domain: 'HYGIENE_CLEANING',
        applicableRoles: ['STAFF', 'CAFE_ADMIN'],
        content: 'Step 1: Scrape food debris. Step 2: Wash at 65°C minimum. Step 3: Rinse at 82°C for thermal sanitisation.',
        changeSummary: 'Initial Baseline Hygiene Standard',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.data.status, 'DRAFT');
    assert.equal(res.data.data.version, 1);
    assert.equal(res.data.data.versionLineage.length, 1);
    assert.ok(res.data.data.versionLineage[0].checksum);
  });

  // ── 2. SOP Lifecycle State Machine ────────────────────────────────────────
  await t.test('2. SOP lifecycle transitions: DRAFT -> REVIEW -> APPROVED -> EFFECTIVE', async () => {
    // DRAFT -> REVIEW
    let res = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/academy/sops/SOP-HYG-001/status',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { status: 'REVIEW' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.data.status, 'REVIEW');

    // REVIEW -> APPROVED
    res = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/academy/sops/SOP-HYG-001/status',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { status: 'APPROVED' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.data.status, 'APPROVED');
    assert.ok(res.data.data.approverUserId);

    // APPROVED -> EFFECTIVE
    res = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/academy/sops/SOP-HYG-001/status',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { status: 'EFFECTIVE' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.data.status, 'EFFECTIVE');
    assert.ok(res.data.data.effectiveDate);
  });

  // ── 3. Illegal Lifecycle Jump Rejected ────────────────────────────────────
  await t.test('3. Illegal SOP lifecycle transition is strictly rejected', async () => {
    const res = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/academy/sops/SOP-HYG-001/status',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { status: 'DRAFT' }, // Cannot jump directly from EFFECTIVE to DRAFT
    });

    assert.equal(res.status, 400);
    assert.ok(res.data.error.includes('Illegal SOP status transition'));
  });

  // ── 4. SOP Amendment (v1 -> v2) & Historical Immutability ──────────────────
  await t.test('4. Amend effective SOP: Increments version, preserves v1 lineage without overwrite', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/academy/sops/SOP-HYG-001/amend',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        title: 'High-Temperature Dishwashing & Sanitisation Protocol (Revised)',
        content: 'Step 1: Scrape debris. Step 2: Wash at 68°C. Step 3: Rinse at 85°C. Step 4: Air dry on stainless racks.',
        changeSummary: 'Elevated wash & rinse temperature thresholds for monsoon hygiene protocol',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.previousVersion, 1);
    assert.equal(res.data.data.newVersion, 2);
    assert.equal(res.data.data.sop.version, 2);
    assert.equal(res.data.data.sop.status, 'DRAFT'); // New version enters review cycle

    // Verify database record has both versions preserved in lineage
    const sopDoc = await StandardOperatingProcedure.findOne({ organisationId: ORG_ID, sopId: 'SOP-HYG-001' });
    assert.equal(sopDoc.versionLineage.length, 2);
    assert.equal(sopDoc.versionLineage[0].version, 1);
    assert.equal(sopDoc.versionLineage[1].version, 2);
  });

  // ── 5. Version-Specific SOP Acknowledgement (v1 != v2) ───────────────────
  await t.test('5. Version-specific acknowledgement: Acknowledging v1 does NOT acknowledge v2', async () => {
    // Assign acknowledgement for v1 to employee
    await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/academy/sops/SOP-HYG-001/assign-acknowledgements',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        version: 1,
        targetUsers: [{ userId: 'USR-OWNER-01', name: 'Owner Lead', role: 'OWNER', cafeId: 'ZC-0001' }],
        dueDate: new Date(Date.now() + 7 * 86400000),
      },
    });

    // Employee acknowledges v1
    const ackRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/academy/sops/SOP-HYG-001/acknowledge',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { version: 1 },
    });
    assert.equal(ackRes.status, 200);
    assert.equal(ackRes.data.data.status, 'ACKNOWLEDGED');

    // Verify v2 remains unacknowledged and requires distinct assignment
    const ackV2 = await SopAcknowledgement.findOne({
      organisationId: ORG_ID,
      sopId: 'SOP-HYG-001',
      sopVersion: 2,
      userId: 'USR-OWNER-01',
    });
    assert.equal(ackV2, null); // v2 must NOT be automatically marked acknowledged
  });

  // ── 6. Training Module with FoSTaC 5 August 2026 Integration ──────────────
  await t.test('6. Training module links official FoSTaC procedure dated 5 August 2026', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/academy/courses',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        courseId: 'CRS-FOSTAC-ADV-01',
        title: 'FoSTaC Food Safety Supervisor — Catering & Food Service',
        durationMinutes: 480,
        passThresholdPercent: 80,
        isFostacLinked: true,
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.data.isFostacLinked, true);
    assert.equal(res.data.data.fostacProcedureDate, '2026-08-05');

    // ── Authoritative FoSTaC FSS Certificate Validity Engine Verification ──
    const { EmployeeTraining } = require('../src/models/EmployeeTraining');

    // 1. Calendar-Year Addition (Strict 2-year calendar arithmetic, not 730 days)
    // Leap-year test: 29 February 2024 -> 28 February 2026 (non-leap year)
    const leapIssue = new Date('2024-02-29T00:00:00.000Z');
    const leapExpiry = EmployeeTraining.addTwoYearsCalendar(leapIssue);
    assert.equal(leapExpiry.toISOString().split('T')[0], '2026-02-28');

    // Standard year test: 15 July 2024 -> 15 July 2026
    const stdIssue = new Date('2024-07-15T00:00:00.000Z');
    const stdExpiry = EmployeeTraining.addTwoYearsCalendar(stdIssue);
    assert.equal(stdExpiry.toISOString().split('T')[0], '2026-07-15');

    // 2. Active 2 Calendar-Year Validity under FSSAI Notice 1 Feb 2024
    const validEval = EmployeeTraining.evaluateFoSTaCCertificateValidity({
      issuedDate: new Date('2025-06-01T00:00:00.000Z'),
      kob: 'CATERING',
      operationalKob: 'CATERING',
      asOfDate: new Date('2026-06-01T00:00:00.000Z'),
    });
    assert.equal(validEval.certificateStatus, 'VALID');
    assert.equal(validEval.isCurrentlyValid, true);
    assert.equal(validEval.validityYears, 2);
    assert.equal(validEval.refresherRequired, true);
    assert.equal(validEval.isPerpetual, false);

    // 3. Expired Certificate after 2 Calendar Years without Refresher
    const expiredEval = EmployeeTraining.evaluateFoSTaCCertificateValidity({
      issuedDate: new Date('2024-06-01T00:00:00.000Z'),
      kob: 'CATERING',
      operationalKob: 'CATERING',
      asOfDate: new Date('2026-06-02T00:00:00.000Z'),
    });
    assert.equal(expiredEval.certificateStatus, 'EXPIRED');
    assert.equal(expiredEval.isCurrentlyValid, false);
    assert.equal(expiredEval.retrainingRequired, true);
    assert.equal(expiredEval.isPerpetual, false);

    // 4. Refresher Completion Renews Certificate for 2 Calendar Years
    const renewedEval = EmployeeTraining.evaluateFoSTaCCertificateValidity({
      issuedDate: new Date('2024-06-01T00:00:00.000Z'),
      kob: 'CATERING',
      operationalKob: 'CATERING',
      refresherCompletedDate: new Date('2026-05-20T00:00:00.000Z'),
      asOfDate: new Date('2026-06-02T00:00:00.000Z'),
    });
    assert.equal(renewedEval.certificateStatus, 'VALID');
    assert.equal(renewedEval.isCurrentlyValid, true);
    assert.equal(renewedEval.isRenewed, true);
    assert.equal(renewedEval.certificateExpiryDate.toISOString().split('T')[0], '2028-05-20');

    // 5. Kind of Business (KoB) Mismatch Strictly Invalidates Certificate
    const kobMismatchEval = EmployeeTraining.evaluateFoSTaCCertificateValidity({
      issuedDate: new Date('2025-06-01T00:00:00.000Z'),
      kob: 'CATERING',
      operationalKob: 'MANUFACTURING',
      asOfDate: new Date('2026-06-01T00:00:00.000Z'),
    });
    assert.equal(kobMismatchEval.certificateStatus, 'INVALID_KOB_MISMATCH');
    assert.equal(kobMismatchEval.isCurrentlyValid, false);
    assert.equal(kobMismatchEval.retrainingRequired, true);

    // 6. Zero Historical Perpetual Grandfathering (Pre-Feb 2024 Certificates Must Comply with 2-Year Rule)
    const pre2024Eval = EmployeeTraining.evaluateFoSTaCCertificateValidity({
      issuedDate: new Date('2023-08-01T00:00:00.000Z'),
      kob: 'CATERING',
      operationalKob: 'CATERING',
      asOfDate: new Date('2026-09-14T00:00:00.000Z'), // More than 2 years passed
    });
    assert.equal(pre2024Eval.certificateStatus, 'EXPIRED');
    assert.equal(pre2024Eval.isCurrentlyValid, false);
    assert.equal(pre2024Eval.isPerpetual, false);
  });

  // ── 7. Attendance Alone Recorded as ATTENDED (Competent is Strictly False) ─
  await t.test('7. Attendance != Competency: Attendance records ATTENDED with isCompetent false', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/academy/competency/USR-EMP-001/CMP-ESPRESSO/attendance',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        skillName: 'Dial-in & Sensory Espresso Calibration',
        domain: 'OPERATIONS',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.status, 'ATTENDED');
    assert.equal(res.data.data.isCompetent, false); // ZERO false equivalence
  });

  // ── 8. Formal Competency Assessment (Passing Score Marks COMPETENT) ───────
  await t.test('8. Formal assessment with passing score marks COMPETENT and isCompetent true', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/academy/competency/USR-EMP-001/CMP-ESPRESSO/assessment',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        score: 92,
        passThreshold: 80,
        evidenceType: 'PRACTICAL_CHECK',
        assessmentNotes: 'Demonstrated precise grind dial-in within 28 seconds extraction window',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.status, 'COMPETENT');
    assert.equal(res.data.data.isCompetent, true);
    assert.ok(res.data.data.validUntil);
  });

  // ── 9. Failed Competency Assessment Marks NEEDS_RETRAINING ─────────────────
  await t.test('9. Failed assessment marks NEEDS_RETRAINING with isCompetent false', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/academy/competency/USR-EMP-002/CMP-ESPRESSO/assessment',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        score: 65,
        passThreshold: 80,
        evidenceType: 'ASSESSMENT_PASSED',
        assessmentNotes: 'Channeling observed and dosage inconsistency during peak rush simulation',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.status, 'NEEDS_RETRAINING');
    assert.equal(res.data.data.isCompetent, false);
  });

  // ── 10. Academy Executive Summary ─────────────────────────────────────────
  await t.test('10. Executive Academy summary aggregates SOPs, acknowledgements and competency', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/academy/overview',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    assert.equal(res.status, 200);
    const data = res.data.data;
    assert.ok(data.totalSopsCount >= 1);
    assert.equal(data.fostacGoverningProcedureDate, '2026-08-05');
    assert.ok(data.competentPersonnelCount >= 1);
    assert.ok(data.needsRetrainingCount >= 1);
  });

  // ── 11. Multi-Tenant IDOR Protection ──────────────────────────────────────
  await t.test('11. Multi-Tenant IDOR: Foreign organisation denied access to SOPs and Academy', async () => {
    const res = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/academy/sops/SOP-HYG-001/status',
      headers: { Authorization: `Bearer ${foreignToken}` },
      body: { status: 'REVIEW' },
    });

    assert.equal(res.status, 400); // SOP not found in foreign organisation
  });
});
