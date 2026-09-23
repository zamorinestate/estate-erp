'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER STRATEGIC EXPANSION STAGE 02 TEST SUITE
 * ============================================================================
 * Comprehensive test coverage for:
 * 1. Enterprise Risk Register (Inherent vs Residual Separation)
 * 2. 5x5 Risk Matrix Scoring & Configured Rating Boundaries
 * 3. Control Library Management & Effectiveness Assessments
 * 4. Internal Audit Plan & Work Programme Execution
 * 5. Audit Observations & Governed 6-State Lifecycle Transitions
 * 6. Invalid Finding Transition Rejection
 * 7. Operational Anomaly Cases (Continuous Safe Detector)
 * 8. Absolute Fraud-Safety Rule: Zero Automatic Accusations / Zero Disciplinary Actions
 * 9. Human Review of Anomalies & False-Positive Retention for Audit
 * 10. Multi-Tenant Isolation & Negative IDOR Security Tests
 * 11. Executive Dashboard 5x5 Heat Map Aggregation
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/server');
const { EnterpriseRisk } = require('../src/models/EnterpriseRisk');
const { ControlLibraryItem } = require('../src/models/ControlLibraryItem');
const { InternalAuditPlan } = require('../src/models/InternalAuditPlan');
const { AuditObservation } = require('../src/models/AuditObservation');
const { OperationalAnomalyCase } = require('../src/models/OperationalAnomalyCase');
const OwnerRiskAuditService = require('../src/services/ownerRiskAuditService');
const authService = require('../src/services/authService');
const { RolePermission } = require('../src/models/RolePermission');
const { User } = require('../src/models/User');

function makeRequest({ port, method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const serializedBody = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (serializedBody) {
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

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

test('STAGE 02 — Owner Risk, Internal Audit & Fraud Control Centre Suite', async (t) => {
  let mongoServer;

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  const ownerUser = {
    userId: 'USR-OWNER-RA01',
    role: 'OWNER',
    organisationId: 'ORG-ZAMORIN',
    email: 'owner.ra@zamorincafe.com',
    fullName: 'Owner Risk Audit',
    accountStatus: 'ACTIVE',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
  };

  const foreignOwnerUser = {
    userId: 'USR-FOREIGN-RA01',
    role: 'OWNER',
    organisationId: 'ORG-FOREIGN',
    email: 'foreign.ra@other.com',
    fullName: 'Foreign Owner Risk Audit',
    accountStatus: 'ACTIVE',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-9999'],
  };

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
          sid: 'SS-OWNER-RA01',
        },
        session: {
          sessionId: 'SS-OWNER-RA01',
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
          sid: 'SS-FOREIGN-RA01',
        },
        session: {
          sessionId: 'SS-FOREIGN-RA01',
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

  const ownerHeaders = {
    Authorization: 'Bearer tok_owner',
    'x-organisation-id': 'ORG-ZAMORIN',
  };

  const foreignHeaders = {
    Authorization: 'Bearer tok_foreign',
    'x-organisation-id': 'ORG-FOREIGN',
  };

  // --------------------------------------------------------------------------
  // TEST 1: Enterprise Risk Creation & Inherent vs Residual Score Calculation
  // --------------------------------------------------------------------------
  await t.test(
    'TC-S02-01: Enterprise Risk Creation calculates inherent vs residual scores',
    async () => {
      const res = await makeRequest({
        port,
        method: 'POST',
        path: '/api/v1/risk-audit/risks',
        headers: ownerHeaders,
        body: {
          riskDomain: 'FINANCIAL',
          title: 'Manual Journal Entry Discrepancy Risk',
          description: 'Risk of unapproved adjustments in manual journals',
          inherentLikelihood: 4,
          inherentImpact: 4, // 4 x 4 = 16 -> CRITICAL
          residualLikelihood: 2,
          residualImpact: 3, // 2 x 3 = 6 -> MEDIUM
          treatment: 'MITIGATE',
          treatmentPlan: 'Implement dual-authorization on all manual journals over ₹5000',
        },
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      const risk = res.data.data;
      assert.match(risk.riskId, /^RSK-\d{4}$/);
      assert.equal(risk.inherentRisk.score, 16);
      assert.equal(risk.inherentRisk.rating, 'CRITICAL');
      assert.equal(risk.residualRisk.score, 6);
      assert.equal(risk.residualRisk.rating, 'MEDIUM');
      assert.equal(risk.treatment, 'MITIGATE');
      assert.equal(risk.status, 'ACTIVE');
    }
  );

  // --------------------------------------------------------------------------
  // TEST 2: Inherent vs Residual Separation
  // --------------------------------------------------------------------------
  await t.test(
    'TC-S02-02: Updating residual risk preserves inherent risk unchanged',
    async () => {
      const list = await makeRequest({
        port,
        method: 'GET',
        path: '/api/v1/risk-audit/risks',
        headers: ownerHeaders,
      });
      const riskId = list.data.data[0].riskId;

      const updateRes = await makeRequest({
        port,
        method: 'PATCH',
        path: `/api/v1/risk-audit/risks/${riskId}`,
        headers: ownerHeaders,
        body: {
          residualLikelihood: 1,
          residualImpact: 2, // 1 x 2 = 2 -> LOW
          reason: 'Dual authorization control deployed and tested effective',
        },
      });

      assert.equal(updateRes.status, 200);
      const updated = updateRes.data.data;
      // Inherent must NOT have changed
      assert.equal(updated.inherentRisk.score, 16);
      assert.equal(updated.inherentRisk.rating, 'CRITICAL');
      // Residual must be updated
      assert.equal(updated.residualRisk.score, 2);
      assert.equal(updated.residualRisk.rating, 'LOW');
      // Audit history must record previous vs new
      assert.ok(updated.auditHistory.length >= 2);
      assert.equal(updated.auditHistory[1].action, 'RISK_UPDATED');
    }
  );

  // --------------------------------------------------------------------------
  // TEST 3: 5x5 Matrix Rating Boundary Tests
  // --------------------------------------------------------------------------
  await t.test('TC-S02-03: 5x5 Risk Matrix boundaries (LOW, MEDIUM, HIGH, CRITICAL)', async () => {
    const low = OwnerRiskAuditService.calculateRiskScore(1, 4); // 4
    assert.equal(low.rating, 'LOW');

    const med = OwnerRiskAuditService.calculateRiskScore(2, 3); // 6
    assert.equal(med.rating, 'MEDIUM');

    const high = OwnerRiskAuditService.calculateRiskScore(3, 4); // 12
    assert.equal(high.rating, 'HIGH');

    const crit = OwnerRiskAuditService.calculateRiskScore(5, 4); // 20
    assert.equal(crit.rating, 'CRITICAL');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Negative IDOR Test on Risk Register
  // --------------------------------------------------------------------------
  await t.test(
    'TC-S02-04: Negative IDOR — Foreign Org cannot view or modify Zamorin risks',
    async () => {
      const foreignList = await makeRequest({
        port,
        method: 'GET',
        path: '/api/v1/risk-audit/risks',
        headers: foreignHeaders,
      });

      assert.equal(foreignList.status, 200);
      assert.equal(foreignList.data.count, 0); // Zero cross-tenant leakage

      const zamorinRisk = (
        await makeRequest({
          port,
          method: 'GET',
          path: '/api/v1/risk-audit/risks',
          headers: ownerHeaders,
        })
      ).data.data[0];

      const patchAttempt = await makeRequest({
        port,
        method: 'PATCH',
        path: `/api/v1/risk-audit/risks/${zamorinRisk.riskId}`,
        headers: foreignHeaders,
        body: { title: 'Malicious Overwrite' },
      });

      assert.equal(patchAttempt.status, 404); // Not found in foreign tenant
    }
  );

  // --------------------------------------------------------------------------
  // TEST 5: Control Library Creation & Types
  // --------------------------------------------------------------------------
  await t.test(
    'TC-S02-05: Control Library registers PREVENTIVE control with verification',
    async () => {
      const res = await makeRequest({
        port,
        method: 'POST',
        path: '/api/v1/risk-audit/controls',
        headers: ownerHeaders,
        body: {
          controlDomain: 'FINANCIAL',
          controlType: 'PREVENTIVE',
          title: 'Dual Approval for Payments Over ₹10,000',
          objective: 'Prevent unauthorized outflows by enforcing maker-checker segregation',
          frequency: 'PER_OCCURRENCE',
          responsibleOwner: 'Finance Controller',
          evidenceRequirement: 'Digital signature on payment release order',
        },
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      const control = res.data.data;
      assert.match(control.controlId, /^CTL-\d{4}$/);
      assert.equal(control.controlType, 'PREVENTIVE');
      assert.equal(control.effectiveness, 'NOT_TESTED');
    }
  );

  // --------------------------------------------------------------------------
  // TEST 6: Control Effectiveness Assessment & Deficiency Logging
  // --------------------------------------------------------------------------
  await t.test(
    'TC-S02-06: Assessing control effectiveness logs deficiency and updates audit trail',
    async () => {
      const list = await makeRequest({
        port,
        method: 'GET',
        path: '/api/v1/risk-audit/controls',
        headers: ownerHeaders,
      });
      const controlId = list.data.data[0].controlId;

      const assessRes = await makeRequest({
        port,
        method: 'POST',
        path: `/api/v1/risk-audit/controls/${controlId}/assess`,
        headers: ownerHeaders,
        body: {
          effectiveness: 'PARTIALLY_EFFECTIVE',
          deficiencyDescription: 'Sampling detected 1 of 20 payments lacked second signature',
          notes: 'Exception occurred during weekend shift hand-off',
        },
      });

      assert.equal(assessRes.status, 200);
      const c = assessRes.data.data;
      assert.equal(c.effectiveness, 'PARTIALLY_EFFECTIVE');
      assert.equal(c.deficiencies.length, 1);
      assert.equal(c.deficiencies[0].status, 'OPEN');
      assert.ok(c.lastTestedDate);
    }
  );

  // --------------------------------------------------------------------------
  // TEST 7: Internal Audit Plan & Work Programme
  // --------------------------------------------------------------------------
  await t.test('TC-S02-07: Internal Audit Plan creation with procedures', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/risk-audit/audits/plan',
      headers: ownerHeaders,
      body: {
        auditTitle: 'Q3 Financial & POS Cash Integrity Audit',
        auditDomain: 'FINANCIAL',
        objective: 'Verify end-to-end cash reconciliation and void controls',
        scopeDescription: 'All transactions across ZC-0001 and ZC-0002 for July-Sept',
        cafeIds: ['ZC-0001', 'ZC-0002'],
        procedures: [
          {
            procedureId: 'PROC-CASH-01',
            title: 'Verify Daily Safe Drop to Passbook Deposit',
            description: 'Compare cash handover log with bank passbook deposit',
          },
          {
            procedureId: 'PROC-VOID-02',
            title: 'Audit Supervisor Approval on POS Voided Bills',
            description: 'Sample 50 voided bills across peak trading hours',
          },
        ],
      },
    });

    assert.equal(res.status, 201);
    const audit = res.data.data;
    assert.match(audit.auditId, /^AUD-\d{4}$/);
    assert.equal(audit.procedures.length, 2);
    assert.equal(audit.procedures[0].status, 'PENDING');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Execute Audit Procedure
  // --------------------------------------------------------------------------
  await t.test(
    'TC-S02-08: Executing audit procedure records PASS and EXCEPTION_NOTED',
    async () => {
      const plan = await InternalAuditPlan.findOne({ organisationId: 'ORG-ZAMORIN' });
      assert.ok(plan);

      const execRes = await makeRequest({
        port,
        method: 'POST',
        path: `/api/v1/risk-audit/audits/${plan.auditId}/procedures/PROC-CASH-01/execute`,
        headers: ownerHeaders,
        body: {
          result: 'PASS',
          evidenceNotes: 'Sample of 30 days verified 100% matched to bank passbook credits',
        },
      });

      assert.equal(execRes.status, 200);
      const proc = execRes.data.data.procedures.find((p) => p.procedureId === 'PROC-CASH-01');
      assert.equal(proc.result, 'PASS');
      assert.equal(proc.status, 'COMPLETED');
    }
  );

  // --------------------------------------------------------------------------
  // TEST 9: Audit Observation Creation & 6-State Lifecycle
  // --------------------------------------------------------------------------
  let testFindingId = null;
  await t.test('TC-S02-09: Log Audit Finding with fact condition and criteria', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/risk-audit/observations',
      headers: ownerHeaders,
      body: {
        auditId: 'AUD-0001',
        title: 'Missing Physical Cash Drop Slip for ZC-0001 Weekend Shift',
        conditionFact: 'Drop envelope #4489 lacked physical verification signature',
        criteriaPolicy: 'Cash Handling Standard Operating Procedure v2.1 Sec 3',
        severity: 'HIGH',
        recommendation: 'Enforce digital barcode scanning at safe drop time',
        responsibleOwner: 'Shift Manager',
      },
    });

    assert.equal(res.status, 201);
    const finding = res.data.data;
    assert.match(finding.findingId, /^FND-\d{4}$/);
    assert.equal(finding.status, 'OPEN');
    testFindingId = finding.findingId;
  });

  // --------------------------------------------------------------------------
  // TEST 10: Reject Invalid Finding State Transitions
  // --------------------------------------------------------------------------
  await t.test(
    'TC-S02-10: Server rejects illegal state jump (e.g. OPEN -> CLOSED directly)',
    async () => {
      const illegalJump = await makeRequest({
        port,
        method: 'POST',
        path: `/api/v1/risk-audit/observations/${testFindingId}/transition`,
        headers: ownerHeaders,
        body: {
          toState: 'CLOSED', // Illegal jump from OPEN directly to CLOSED
          reason: 'Attempting invalid shortcut',
        },
      });

      assert.equal(illegalJump.status, 400);
      const msg = typeof illegalJump.data?.error === 'object'
        ? illegalJump.data.error?.message
        : illegalJump.data?.message || illegalJump.data?.error || '';
      assert.match(msg, /Invalid finding transition/);
    }
  );

  // --------------------------------------------------------------------------
  // TEST 11: Governed Lifecycle Progression to Closure
  // --------------------------------------------------------------------------
  await t.test(
    'TC-S02-11: Valid progression through governed lifecycle OPEN -> INVESTIGATING -> ACTION_AGREED -> REMEDIATION -> VERIFICATION -> CLOSED',
    async () => {
      // 1. OPEN -> INVESTIGATING
      const step1 = await makeRequest({
        port,
        method: 'POST',
        path: `/api/v1/risk-audit/observations/${testFindingId}/transition`,
        headers: ownerHeaders,
        body: { toState: 'INVESTIGATING', reason: 'Assigned auditor investigating shift log' },
      });
      assert.equal(step1.status, 200);
      assert.equal(step1.data.data.status, 'INVESTIGATING');

      // 2. INVESTIGATING -> ACTION_AGREED
      const step2 = await makeRequest({
        port,
        method: 'POST',
        path: `/api/v1/risk-audit/observations/${testFindingId}/transition`,
        headers: ownerHeaders,
        body: {
          toState: 'ACTION_AGREED',
          managementResponse: 'Management accepts finding; corrective protocol formulated',
          actionPlan: 'Deploy dual-staff signoff sheet by end of week',
        },
      });
      assert.equal(step2.status, 200);
      assert.equal(step2.data.data.status, 'ACTION_AGREED');

      // 3. ACTION_AGREED -> REMEDIATION
      const step3 = await makeRequest({
        port,
        method: 'POST',
        path: `/api/v1/risk-audit/observations/${testFindingId}/transition`,
        headers: ownerHeaders,
        body: { toState: 'REMEDIATION', reason: 'Staff training initiated on new signoff' },
      });
      assert.equal(step3.status, 200);
      assert.equal(step3.data.data.status, 'REMEDIATION');

      // 4. REMEDIATION -> VERIFICATION
      const step4 = await makeRequest({
        port,
        method: 'POST',
        path: `/api/v1/risk-audit/observations/${testFindingId}/transition`,
        headers: ownerHeaders,
        body: {
          toState: 'VERIFICATION',
          verificationEvidence: 'Audited 14 subsequent drop slips; 100% compliant',
        },
      });
      assert.equal(step4.status, 200);
      assert.equal(step4.data.data.status, 'VERIFICATION');

      // 5. VERIFICATION -> CLOSED
      const step5 = await makeRequest({
        port,
        method: 'POST',
        path: `/api/v1/risk-audit/observations/${testFindingId}/transition`,
        headers: ownerHeaders,
        body: { toState: 'CLOSED', reason: 'Verification successful; closing observation' },
      });
      assert.equal(step5.status, 200);
      assert.equal(step5.data.data.status, 'CLOSED');
      assert.ok(step5.data.data.closedAt);
    }
  );

  // --------------------------------------------------------------------------
  // TEST 12: Operational Anomaly Recording (Zero Accusation Rule)
  // --------------------------------------------------------------------------
  let testCaseId = null;
  await t.test(
    'TC-S02-12: Anomaly case captures pattern indicator without automated accusations',
    async () => {
      const res = await makeRequest({
        port,
        method: 'POST',
        path: '/api/v1/risk-audit/anomalies',
        headers: ownerHeaders,
        body: {
          anomalyType: 'EXCESSIVE_REFUNDS',
          title: 'Unusual Volume of POS Bill Refunds on Saturday Evening',
          description: '5 refunds totaling ₹4,200 recorded between 21:00 and 21:30',
          detectionRuleId: 'RULE-POS-REFUND-SPIKE',
          sourceEntity: 'BILL',
          sourceEntityId: 'BILL-88901',
          monetaryValue: 4200,
          severity: 'MEDIUM',
        },
      });

      assert.equal(res.status, 201);
      const anomaly = res.data.data;
      assert.match(anomaly.caseId, /^ANO-\d{4}$/);
      assert.equal(anomaly.reviewStatus, 'INVESTIGATING');
      testCaseId = anomaly.caseId;
    }
  );

  // --------------------------------------------------------------------------
  // TEST 13: ABSOLUTE FRAUD SAFETY RULE
  // --------------------------------------------------------------------------
  await t.test(
    'TC-S02-13: Absolute Fraud Safety Rule — System never triggers automatic termination or salary deductions',
    async () => {
      const anomaly = await OperationalAnomalyCase.findOne({ caseId: testCaseId });
      assert.ok(anomaly);

      // Verify no automated punitive actions were taken
      assert.equal(anomaly.actionTaken, undefined);
      assert.equal(anomaly.reviewedBy, undefined);
      // Status remains purely INVESTIGATING until human reviews
      assert.equal(anomaly.reviewStatus, 'INVESTIGATING');
    }
  );

  // --------------------------------------------------------------------------
  // TEST 14: Human Review Workflow & False-Positive Retention
  // --------------------------------------------------------------------------
  await t.test(
    'TC-S02-14: Human Review classifies anomaly as DUPLICATE_FALSE_POSITIVE and retains record for audit',
    async () => {
      const reviewRes = await makeRequest({
        port,
        method: 'POST',
        path: `/api/v1/risk-audit/anomalies/${testCaseId}/review`,
        headers: ownerHeaders,
        body: {
          disposition: 'DUPLICATE_FALSE_POSITIVE',
          reviewNotes:
            'KDS printer ran out of paper causing duplicate order entry that was promptly refunded before preparation.',
          actionTaken: 'No misconduct found. Paper roll sensor replaced on KDS printer.',
        },
      });

      assert.equal(reviewRes.status, 200);
      const reviewed = reviewRes.data.data;
      assert.equal(reviewed.reviewStatus, 'DUPLICATE_FALSE_POSITIVE');
      assert.equal(reviewed.reviewedBy, ownerUser.userId);
      assert.ok(reviewed.reviewedAt);

      // Record MUST STILL EXIST in database (not deleted merely because it was cleared!)
      const dbRecord = await OperationalAnomalyCase.findOne({ caseId: testCaseId });
      assert.ok(dbRecord);
      assert.equal(dbRecord.reviewStatus, 'DUPLICATE_FALSE_POSITIVE');
      assert.equal(dbRecord.auditHistory.length, 2);
    }
  );

  // --------------------------------------------------------------------------
  // TEST 15: Negative IDOR Test on Anomaly Cases
  // --------------------------------------------------------------------------
  await t.test(
    'TC-S02-15: Negative IDOR — Foreign Org cannot access Zamorin anomaly cases',
    async () => {
      const foreignAnomalies = await makeRequest({
        port,
        method: 'GET',
        path: '/api/v1/risk-audit/anomalies',
        headers: foreignHeaders,
      });

      assert.equal(foreignAnomalies.status, 200);
      assert.equal(foreignAnomalies.data.count, 0); // Complete tenant isolation
    }
  );

  // --------------------------------------------------------------------------
  // TEST 16: Executive Dashboard Summary & 5x5 Heat Map Aggregation
  // --------------------------------------------------------------------------
  await t.test(
    'TC-S02-16: Executive Dashboard aggregates 5x5 Heat Map and Control effectiveness',
    async () => {
      const res = await makeRequest({
        port,
        method: 'GET',
        path: '/api/v1/risk-audit/dashboard',
        headers: ownerHeaders,
      });

      assert.equal(res.status, 200);
      const d = res.data.data;
      assert.ok(d.totalRisks >= 1);
      assert.ok(d.totalControls >= 1);
      assert.equal(d.heatMap.length, 25); // Full 5x5 grid (25 cells)
      assert.ok(d.controlEffectiveness);
      assert.equal(typeof d.totalOpenFindings, 'number');
    }
  );

  // --------------------------------------------------------------------------
  // TEST 17: Stage 01 Integration Linkage (Incident to Risk)
  // --------------------------------------------------------------------------
  await t.test('TC-S02-17: Stage 01 Integration — Link Food Safety Incident to Risk', async () => {
    const linkedRisk = await OwnerRiskAuditService.createRisk({
      organisationId: 'ORG-ZAMORIN',
      riskDomain: 'FOOD_SAFETY_HYGIENE',
      title: 'Perishable Dairy Cold Storage Temperature Excursion',
      inherentLikelihood: 3,
      inherentImpact: 5,
      residualLikelihood: 2,
      residualImpact: 3,
      linkedStage01IncidentId: 'INC-FS-0001',
      linkedStage01CapaId: 'CAPA-0001',
      actorId: ownerUser.userId,
      actorRole: 'OWNER',
    });

    assert.equal(linkedRisk.riskDomain, 'FOOD_SAFETY_HYGIENE');
    assert.equal(linkedRisk.linkedStage01IncidentId, 'INC-FS-0001');
    assert.equal(linkedRisk.linkedStage01CapaId, 'CAPA-0001');
  });

  // --------------------------------------------------------------------------
  // TEST 18: Configurable Risk Methodology (Requirement 17)
  // --------------------------------------------------------------------------
  await t.test('TC-S02-18: Configurable Risk Methodology dynamically reclassifies scores without code modification', async () => {
    // 1. Get default methodology
    const defaultRes = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/risk-audit/methodology',
      headers: ownerHeaders,
    });
    assert.equal(defaultRes.status, 200);
    assert.equal(defaultRes.data.data.version, '5X5_MATRIX_V1');

    // Baseline calculation: 3 x 3 = 9 is 'MEDIUM'
    const baselineScore = OwnerRiskAuditService.calculateRiskScore(3, 3, 'ORG-ZAMORIN');
    assert.equal(baselineScore.score, 9);
    assert.equal(baselineScore.rating, 'MEDIUM');

    // 2. Configure a tighter risk methodology: threshold for HIGH lowered to >= 8
    const updatedRes = await makeRequest({
      port,
      method: 'PUT',
      path: '/api/v1/risk-audit/methodology',
      headers: ownerHeaders,
      body: {
        version: 'CUSTOM_STRICT_ENTERPRISE_2026',
        bands: [
          { min: 1, max: 3, severity: 'LOW', label: 'Low' },
          { min: 4, max: 7, severity: 'MEDIUM', label: 'Medium' },
          { min: 8, max: 14, severity: 'HIGH', label: 'High' },
          { min: 15, max: 25, severity: 'CRITICAL', label: 'Critical' },
        ],
      },
    });
    assert.equal(updatedRes.status, 200);
    assert.equal(updatedRes.data.data.version, 'CUSTOM_STRICT_ENTERPRISE_2026');

    // 3. Same inputs (3, 3) -> score 9 is now evaluated as 'HIGH' purely via configuration
    const strictScore = OwnerRiskAuditService.calculateRiskScore(3, 3, 'ORG-ZAMORIN');
    assert.equal(strictScore.score, 9);
    assert.equal(strictScore.rating, 'HIGH');
    assert.equal(strictScore.methodologyVersion, 'CUSTOM_STRICT_ENTERPRISE_2026');
  });

  // --------------------------------------------------------------------------
  // TEST 19: Automatic Risk Review Candidate Creation & Human Confirmation (Requirement 18)
  // --------------------------------------------------------------------------
  await t.test('TC-S02-19: Automatic Stage 01 -> Stage 02 Risk Candidate Creation requires governed human confirmation', async () => {
    // 1. System flags a risk review candidate from a critical recall incident
    const candRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/risk-audit/risks/candidates',
      headers: ownerHeaders,
      body: {
        cafeId: 'ZC-0001',
        incidentId: 'INC-2026-RECALL-HAZELNUT',
        incidentTitle: 'Hazelnut Syrup Pathogen Detection in Batch',
        recallId: 'REC-2026-0042',
        suggestedLikelihood: 4,
        suggestedImpact: 5,
        rationale: 'Class-I recall flagged potential supply chain quality vulnerability.',
      },
    });

    assert.equal(candRes.status, 201);
    const candidate = candRes.data.data;
    assert.ok(candidate.riskId);
    assert.equal(candidate.status, 'UNDER_REVIEW'); // Must NOT be immediately approved
    assert.equal(candidate.inherentLikelihood, 4);
    assert.equal(candidate.inherentImpact, 5);

    // 2. Human confirms and formally approves candidate into Enterprise Risk Register
    const confirmRes = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/risk-audit/risks/${candidate.riskId}/confirm`,
      headers: ownerHeaders,
      body: {
        confirmedLikelihood: 3, // Adjusted by human risk manager
        confirmedImpact: 4,
        confirmedTreatment: 'MITIGATE',
        treatmentPlan: 'Dual-testing protocol on all dairy and syrup consignments at central dock',
        responsibleOwner: ownerUser.userId,
        notes: 'Human risk owner confirmed risk assessment and mitigation roadmap.',
      },
    });

    assert.equal(confirmRes.status, 200);
    const confirmed = confirmRes.data.data;
    assert.equal(confirmed.status, 'ACTIVE');
    assert.equal(confirmed.inherentLikelihood, 3);
    assert.equal(confirmed.inherentImpact, 4);
  });

  // --------------------------------------------------------------------------
  // TEST 20: Governed Anomaly Rule Catalogue for 11 Domains (Requirements 14, 15, 16)
  // --------------------------------------------------------------------------
  await t.test('TC-S02-20: Retrieves governed anomaly rule catalogue across all 11 required domains', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/risk-audit/anomalies/rules',
      headers: ownerHeaders,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.count >= 11);

    const rules = res.data.data;
    const ruleIds = rules.map((r) => r.ruleId);
    assert.ok(ruleIds.includes('ANO-RULE-001')); // Excessive refunds
    assert.ok(ruleIds.includes('ANO-RULE-002')); // Void patterns
    assert.ok(ruleIds.includes('ANO-RULE-003')); // Unusual discounts
    assert.ok(ruleIds.includes('ANO-RULE-004')); // Duplicate expenses
    assert.ok(ruleIds.includes('ANO-RULE-005')); // Duplicate payments
    assert.ok(ruleIds.includes('ANO-RULE-006')); // Cash variance
    assert.ok(ruleIds.includes('ANO-RULE-007')); // Vendor bank modifications
    assert.ok(ruleIds.includes('ANO-RULE-008')); // Payroll anomalies
    assert.ok(ruleIds.includes('ANO-RULE-009')); // Attendance indicators
    assert.ok(ruleIds.includes('ANO-RULE-010')); // Data exports
    assert.ok(ruleIds.includes('ANO-RULE-011')); // Privileged security events

    // Verify governance metadata is complete on every rule (Requirement 16)
    rules.forEach((rule) => {
      assert.ok(rule.ruleId, 'Rule ID is required');
      assert.ok(rule.name, 'Name is required');
      assert.ok(rule.description, 'Description is required');
      assert.ok(rule.authoritativeSource, 'Authoritative source is required');
      assert.ok(rule.threshold, 'Threshold is required');
      assert.ok(rule.lookbackPeriod, 'Lookback period is required');
      assert.ok(rule.severity, 'Severity is required');
      assert.ok(rule.rationale, 'Rationale is required');
      assert.ok(rule.version, 'Version is required');
      assert.ok(rule.effectiveDate, 'Effective date is required');
      assert.equal(typeof rule.enabled, 'boolean', 'Enabled flag must be boolean');
    });

    const rule11 = rules.find((r) => r.ruleId === 'ANO-RULE-011');
    assert.ok(rule11, 'ANO-RULE-011 must exist');
    assert.ok(rule11.authoritativeSource.includes('AuditEvent'), 'Rule 11 must be backed by authentic AuditEvent source');
    assert.ok(!rule11.description.includes('MFA'), 'Rule 11 must not reference phantom MFA bypass');
    assert.ok(!rule11.threshold.includes('MFA'), 'Rule 11 threshold must not reference MFA bypass');
  });
});
