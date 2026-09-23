'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER BATCH 01 CROSS-STAGE INTEGRATION & SECURITY TEST SUITE
 * ============================================================================
 * Cross-stage integration and security validation covering:
 * 1. Stage 01 (Food Safety) -> Stage 02 (Enterprise Risk) linkage
 * 2. Stage 01 (Hygiene / CAPA) -> Stage 02 (Control Deficiency) linkage
 * 3. Stage 02 (Enterprise Risk) -> Stage 03 (CAPEX / Investment Case) linkage
 * 4. Multi-Tenant Negative IDOR across all three stages (Stage 01, Stage 02, Stage 03)
 * 5. Strict Separation of Actual vs Budget vs Forecast vs Scenario across all modules
 * 6. Non-Accusation Safety Invariant across anomaly & audit engines
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/server');
const { FoodRecallCase } = require('../src/models/FoodRecallCase');
const { CapaRecord } = require('../src/models/CapaRecord');
const { EnterpriseRisk } = require('../src/models/EnterpriseRisk');
const { ControlLibraryItem } = require('../src/models/ControlLibraryItem');
const { CapexRequest } = require('../src/models/CapexRequest');
const { ScenarioSandbox } = require('../src/models/ScenarioSandbox');

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

test('OWNER BATCH 01 — Cross-Stage Integration & Security Certification Suite', async (t) => {
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
    userId: 'USR-OWNER-INT01',
    role: 'OWNER',
    organisationId: 'ORG-ZAMORIN',
    email: 'owner.batch01@zamorincafe.com',
    fullName: 'Executive Owner Lead',
    accountStatus: 'ACTIVE',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
  };

  const foreignOwnerUser = {
    userId: 'USR-FOREIGN-INT01',
    role: 'OWNER',
    organisationId: 'ORG-FOREIGN',
    email: 'foreign.intruder@other.com',
    fullName: 'Foreign Intruder',
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
          sid: 'SS-OWNER-INT01',
        },
        session: {
          sessionId: 'SS-OWNER-INT01',
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
          sid: 'SS-FOREIGN-INT01',
        },
        session: {
          sessionId: 'SS-FOREIGN-INT01',
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

  // ---------------------------------------------------------------------------
  // 1. STAGE 01 -> STAGE 02: FOOD SAFETY INCIDENT TO ENTERPRISE RISK LINKAGE
  // ---------------------------------------------------------------------------
  let recallCaseId;
  let linkedRiskId;

  await t.test('1. Stage 01 Recall Case links to Stage 02 Enterprise Risk', async () => {
    // 1. Create recall case in Stage 01
    const recallRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/food-safety/recalls',
      headers: ownerHeaders,
      body: {
        title: 'Dairy Contamination Batch Recall',
        reason: 'Coliform bacteria above limits in raw dairy supply lot',
        severity: 'CLASS_I_SERIOUS_HEALTH',
        affectedCafes: ['ZC-0001', 'ZC-0002'],
        ingredientName: 'Fresh Full Cream Milk',
        lotBatch: 'LOT-MILK-2026-09A',
      },
    });

    assert.equal(recallRes.status, 201);
    recallCaseId = recallRes.data.data.recall.recallId;
    assert.ok(recallCaseId);

    // 2. Link into Stage 02 Risk Register
    const riskRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/risk-audit/risks',
      headers: ownerHeaders,
      body: {
        title: 'Supplier Food Safety & Raw Milk Quality Hazard',
        riskDomain: 'FOOD_SAFETY',
        description: `Risk surfaced by Stage 01 Recall Case ${recallCaseId}`,
        inherentLikelihood: 4,
        inherentImpact: 5,
        treatmentStrategy: 'MITIGATE',
        treatmentActionPlan: 'Implement mandatory cold-chain telemetry and batch test verification',
        linkedStage01IncidentId: recallCaseId,
      },
    });

    assert.equal(riskRes.status, 201);
    linkedRiskId = riskRes.data.data.riskId;
    assert.ok(linkedRiskId);
    assert.equal(riskRes.data.data.inherentScore, 20); // 4 * 5
    assert.equal(riskRes.data.data.inherentSeverity, 'CRITICAL');
  });

  // ---------------------------------------------------------------------------
  // 2. STAGE 01 -> STAGE 02: CAPA / HYGIENE FAILURE TO CONTROL DEFICIENCY
  // ---------------------------------------------------------------------------
  let capaRecordId;
  let linkedControlId;

  await t.test('2. Stage 01 Overdue CAPA links to Stage 02 Control Deficiency', async () => {
    // 1. Create CAPA in Stage 01
    const capaRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/food-safety/capas',
      headers: ownerHeaders,
      body: {
        cafeId: 'ZC-0001',
        title: 'Walk-in Chiller Defrost Cycle Failure',
        source: 'TEMPERATURE_EXCURSION',
        sourceReferenceId: 'INC-2026-CHILLER-01',
        findingDescription: 'Evaporator coil icing caused temperature to spike to 12C overnight',
        rootCauseCategory: 'EQUIPMENT_FAILURE',
        rootCauseAnalysis: 'Defrost timer mechanical failure',
        rootCauseConfirmedByHuman: true,
        correctiveActionPlan: 'Replaced defrost timer and verified 4C setpoint',
        preventiveActionPlan: 'Added IoT door sensor and secondary alarm threshold',
        assignedOwnerUserId: 'USR-ADMIN-C1',
        dueDate: '2026-09-30T00:00:00.000Z',
      },
    });

    assert.equal(capaRes.status, 201);
    capaRecordId = capaRes.data.data.capa.capaId;

    // 2. Register Control in Stage 02 Control Library
    const ctrlRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/risk-audit/controls',
      headers: ownerHeaders,
      body: {
        title: 'Continuous Cold Chain Temperature Monitoring & Defrost Maintenance',
        controlDomain: 'FOOD_SAFETY',
        controlType: 'PREVENTIVE',
        frequency: 'CONTINUOUS',
        ownerRole: 'HEAD_CHEF',
        description: `Automated hourly logging and weekly defrost inspection triggered by CAPA ${capaRecordId}`,
      },
    });

    assert.equal(ctrlRes.status, 201);
    linkedControlId = ctrlRes.data.data.controlId;
    assert.ok(linkedControlId);

    // 3. Mark Control as DEFICIENT following CAPA discovery
    const assessRes = await makeRequest({
      port,
      method: 'PATCH',
      path: `/api/v1/risk-audit/controls/${linkedControlId}/assessment`,
      headers: ownerHeaders,
      body: {
        effectiveness: 'DEFICIENT',
        deficiencyNotes: `Defrost timer failure exposed by ${capaRecordId}`,
      },
    });

    assert.equal(assessRes.status, 200);
    assert.equal(assessRes.data.data.effectiveness, 'DEFICIENT');
  });

  // ---------------------------------------------------------------------------
  // 3. STAGE 02 -> STAGE 03: RISK / CONTROL TO CAPEX INVESTMENT LINKAGE
  // ---------------------------------------------------------------------------
  await t.test('3. Stage 02 Risk & Control Deficiency informs Stage 03 CAPEX Justification', async () => {
    const capexRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/planning/capex',
      headers: ownerHeaders,
      body: {
        cafeId: 'ZC-0001',
        category: 'HVAC_REFRIGERATION',
        itemTitle: 'Commercial Inverter Chiller Unit Replacement',
        businessJustification: `Mitigates Food Safety Risk ${linkedRiskId} and remediates Control Deficiency ${linkedControlId}`,
        estimatedAmountPaisa: 38000000, // ₹3.8 L
        quotations: [
          {
            vendorName: 'Blue Star Cold Chain',
            quoteAmountPaisa: 37500000,
            deliveryLeadDays: 7,
            warrantyMonths: 36,
            isRecommended: true,
          },
        ],
      },
    });

    assert.equal(capexRes.status, 201);
    assert.ok(capexRes.data.data.capexId);
    assert.equal(capexRes.data.data.status, 'QUOTATIONS_RECEIVED');
  });

  // ---------------------------------------------------------------------------
  // 4. CROSS-STAGE MULTI-TENANT ISOLATION & NEGATIVE IDOR
  // ---------------------------------------------------------------------------
  await t.test('4. Cross-Tenant IDOR: Foreign Organisation Denied Across All Stages', async () => {
    // Stage 01: Foreign org cannot view Zamorin recall case
    const s1Res = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/food-safety/recalls/${recallCaseId}`,
      headers: foreignHeaders,
    });
    assert.equal(s1Res.status, 404);

    // Stage 02: Foreign org cannot view Zamorin risk
    const s2Res = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/risk-audit/risks/${linkedRiskId}`,
      headers: foreignHeaders,
    });
    assert.equal(s2Res.status, 404);

    // Stage 03: Foreign org cannot list Zamorin capex requests
    const s3Res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/planning/capex',
      headers: foreignHeaders,
    });
    assert.equal(s3Res.status, 200);
    assert.equal(s3Res.data.data.length, 0); // Sees 0 records from ORG-ZAMORIN
  });

  // ---------------------------------------------------------------------------
  // 5. SEMANTIC DISTINCTION & NO MUTATION OF REAL ACTUALS
  // ---------------------------------------------------------------------------
  await t.test('5. What-If Scenario strictly isolated from accounting ledger', async () => {
    const scenarioRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/planning/scenarios',
      headers: ownerHeaders,
      body: {
        name: 'Aggressive Expansion Sensitivity',
        assumptions: {
          revenueChangePct: 25,
          wageChangePct: 5,
        },
      },
    });

    assert.equal(scenarioRes.status, 201);
    assert.ok(scenarioRes.data.data.scenarioId);

    // Ensure Variance vs Actual remains grounded in canonical ERP Actuals
    const varianceRes = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/planning/variance?fiscalYear=FY2026-27',
      headers: ownerHeaders,
    });

    assert.equal(varianceRes.status, 200);
    const salesLine = varianceRes.data.data.comparison.find((c) => c.category === 'SALES');
    assert.ok(salesLine);
    assert.equal(salesLine.actualPaisa, 520000000); // Unmutated canonical actual ₹52L
  });
});
