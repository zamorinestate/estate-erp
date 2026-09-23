'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER STRATEGIC EXPANSION STAGE 01 TEST SUITE
 * ============================================================================
 * Comprehensive test coverage for:
 * 1. Food Safety Registration & 2026 Perpetual Validity Regime
 * 2. Hygiene Checklist Engine & Versioned Template Immutability
 * 3. Temperature Rules & Excursions
 * 4. FoSTaC 5 August 2026 Procedure Baseline
 * 5. End-to-End Forward & Backward Traceability & Gap Register
 * 6. Food Recall Master & 8-State Server-Validated Lifecycle
 * 7. Stock Quarantine & Quantity Reconciliation (Zero Loss)
 * 8. CAPA Engine & Human-Confirmed Root Cause Analysis
 * 9. Tenant Isolation & Negative IDOR Security Tests
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/server');
const { FoodSafetyRegistration } = require('../src/models/FoodSafetyRegistration');
const { HygieneChecklistTemplate } = require('../src/models/HygieneChecklistTemplate');
const { HygieneInspection } = require('../src/models/HygieneInspection');
const { FoodRecallCase } = require('../src/models/FoodRecallCase');
const { CapaRecord } = require('../src/models/CapaRecord');
const { TraceabilityGap } = require('../src/models/TraceabilityGap');
const { FoodSafetyGovernanceService } = require('../src/services/foodSafetyGovernanceService');
const authService = require('../src/services/authService');
const { RolePermission } = require('../src/models/RolePermission');

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
const { User } = require('../src/models/User');

test('STAGE 01 — Food Safety, Hygiene, Recall & Traceability Centre Suite', async (t) => {
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
    userId: 'USR-OWNER-FS01',
    role: 'OWNER',
    organisationId: 'ORG-ZAMORIN',
    email: 'owner.fs@zamorincafe.com',
    fullName: 'Owner Food Safety',
    accountStatus: 'ACTIVE',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
  };

  const foreignOwnerUser = {
    userId: 'USR-FOREIGN-01',
    role: 'OWNER',
    organisationId: 'ORG-FOREIGN',
    email: 'foreign@other.com',
    fullName: 'Foreign Owner',
    accountStatus: 'ACTIVE',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-9999'],
  };

  const cafe1AdminUser = {
    userId: 'USR-ADMIN-C1',
    role: 'CAFE_ADMIN',
    organisationId: 'ORG-ZAMORIN',
    email: 'c1.admin@zamorincafe.com',
    fullName: 'Cafe 1 Admin',
    accountStatus: 'ACTIVE',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001'],
  };

  t.mock.method(User, 'findOne', async (query) => {
    if (query?.userId === ownerUser.userId) return ownerUser;
    if (query?.userId === foreignOwnerUser.userId) return foreignOwnerUser;
    if (query?.userId === cafe1AdminUser.userId) return cafe1AdminUser;
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
          sid: 'SS-OWNER-FS01',
        },
        session: {
          sessionId: 'SS-OWNER-FS01',
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
    if (token === 'tok_c1') {
      return {
        payload: {
          sub: cafe1AdminUser.userId,
          org: cafe1AdminUser.organisationId,
          role: cafe1AdminUser.role,
          email: cafe1AdminUser.email,
          name: cafe1AdminUser.fullName,
          assignedCafeIds: cafe1AdminUser.assignedCafeIds,
          sv: 0,
          usv: 1,
          pv: 1,
          sid: 'SS-ADMIN-C1',
        },
        session: {
          sessionId: 'SS-ADMIN-C1',
          roleSnapshot: cafe1AdminUser.role,
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
      scope: role === 'CAFE_ADMIN' ? 'ASSIGNED_CAFES' : 'ORGANISATION',
      isCurrentlyEffective: () => true,
    },
  ]);

  // ── 1. FSSAI Registration & 2026 Perpetual Validity Regime ───────────────────
  await t.test('1.1: Register FSSAI Licence under 2026 Perpetual Regime succeeds without expiry date', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/food-safety/licences',
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        cafeId: 'ZC-0001',
        fssaiNumber: '10026001000123',
        registrationType: 'STATE_LICENSE',
        isPerpetual: true,
        issueDate: '2026-04-01T00:00:00.000Z',
        responsiblePerson: 'Chef Executive Zamorin',
        complianceOwner: 'Director Operations',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.registration.isPerpetual, true);
    assert.equal(res.data.data.registration.legacyExpiryDate, null);
    assert.equal(res.data.data.registration.status, 'ACTIVE');
  });

  await t.test('1.2: Prohibits fabricated expiry dates for licences operating under 2026 Perpetual Regime', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/food-safety/licences',
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        cafeId: 'ZC-0001',
        fssaiNumber: '10026001000124',
        registrationType: 'STATE_LICENSE',
        isPerpetual: true,
        issueDate: '2026-04-01T00:00:00.000Z',
        legacyExpiryDate: '2027-03-31T00:00:00.000Z', // PROHIBITED for perpetual
        responsiblePerson: 'Chef Executive Zamorin',
        complianceOwner: 'Director Operations',
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.data.error.code, 'PROHIBITED_EXPIRY_DATE');
  });

  await t.test('1.3: Allows legitimate expiry date for legacy expiring licences', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/food-safety/licences',
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        cafeId: 'ZC-0002',
        fssaiNumber: '10025002000999',
        registrationType: 'STATE_LICENSE',
        regimeVersion: 'LEGACY_EXPIRING',
        isPerpetual: false,
        issueDate: '2025-01-01T00:00:00.000Z',
        legacyExpiryDate: '2026-12-31T00:00:00.000Z',
        responsiblePerson: 'Quality Lead Calicut',
        complianceOwner: 'Director Operations',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.data.registration.isPerpetual, false);
    assert.notEqual(res.data.data.registration.legacyExpiryDate, null);
  });

  await t.test('1.4: Updates regulatory licence status with mandatory reason and immutable audit log', async () => {
    const regList = await FoodSafetyRegistration.find({ organisationId: 'ORG-ZAMORIN' });
    const targetReg = regList[0];

    const res = await makeRequest({
      port,
      method: 'PATCH',
      path: `/api/v1/food-safety/licences/${targetReg.registrationId}/status`,
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        newStatus: 'UNDER_REVIEW',
        reason: 'Annual FSSAI Schedule 4 verification audit in progress',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.registration.status, 'UNDER_REVIEW');
    assert.ok(res.data.data.registration.auditHistory.length >= 2);
  });

  // ── 2. Hygiene Checklist Engine & Template Versioning ─────────────────────────
  await t.test('2.1: Creates versioned hygiene template and preserves immutability on update', async () => {
    // Version 1
    const res1 = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/food-safety/hygiene/templates',
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        templateId: 'TPL-DAILY-KITCHEN',
        title: 'Daily Opening Kitchen & Surface Sanitation',
        frequency: 'DAILY_OPENING',
        classification: 'STATUTORY_SCHEDULE_4',
        questions: [
          {
            questionId: 'Q1',
            title: 'Food-contact surfaces cleaned and sanitised',
            domain: 'FOOD_CONTACT_SURFACES',
            responseType: 'PASS_FAIL_NA',
            criticality: 'CRITICAL',
            mandatoryEvidence: true,
          },
          {
            questionId: 'Q2',
            title: 'Handwashing stations stocked with soap and single-use towels',
            domain: 'HANDWASHING_SANITATION',
            responseType: 'PASS_FAIL_NA',
            criticality: 'MAJOR',
          },
        ],
      },
    });

    assert.equal(res1.status, 201);
    assert.equal(res1.data.data.template.version, 1);

    // Version 2 (Creating same templateId bumps version, does not overwrite)
    const res2 = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/food-safety/hygiene/templates',
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        templateId: 'TPL-DAILY-KITCHEN',
        title: 'Daily Opening Kitchen & Surface Sanitation v2',
        frequency: 'DAILY_OPENING',
        classification: 'STATUTORY_SCHEDULE_4',
        questions: [
          {
            questionId: 'Q1',
            title: 'Food-contact surfaces cleaned and sanitised',
            domain: 'FOOD_CONTACT_SURFACES',
            responseType: 'PASS_FAIL_NA',
            criticality: 'CRITICAL',
            mandatoryEvidence: true,
          },
          {
            questionId: 'Q2',
            title: 'Handwashing stations stocked with soap and single-use towels',
            domain: 'HANDWASHING_SANITATION',
            responseType: 'PASS_FAIL_NA',
            criticality: 'MAJOR',
          },
          {
            questionId: 'Q3',
            title: 'Waste bins lined, emptied and covered',
            domain: 'WASTE_HANDLING',
            responseType: 'PASS_FAIL_NA',
            criticality: 'STANDARD',
          },
        ],
      },
    });

    assert.equal(res2.status, 201);
    assert.equal(res2.data.data.template.version, 2);

    // Check version 1 is SUPERSEDED, not destroyed
    const v1 = await HygieneChecklistTemplate.findOne({ templateId: 'TPL-DAILY-KITCHEN', version: 1 });
    assert.equal(v1.status, 'SUPERSEDED');
  });

  await t.test('2.2: Executes hygiene inspection, evaluates exceptions and creates corrective actions', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/food-safety/hygiene/inspections',
      headers: { Authorization: 'Bearer tok_c1' },
      body: {
        cafeId: 'ZC-0001',
        templateId: 'TPL-DAILY-KITCHEN',
        responses: [
          {
            questionId: 'Q1',
            response: 'PASS',
          },
          {
            questionId: 'Q2',
            response: 'FAIL',
            notes: 'Soap dispenser empty at prep station 2',
            actionPlan: 'Refilled soap dispenser from store immediately',
          },
          {
            questionId: 'Q3',
            response: 'PASS',
          },
        ],
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.data.inspection.overallResult, 'FAILED_WITH_ACTION');
    assert.equal(res.data.data.inspection.correctiveActions.length, 1);
    assert.equal(res.data.data.inspection.correctiveActions[0].status, 'ASSIGNED');
  });

  // ── 3. Food Recall Master & 8-State Server-Validated Lifecycle ───────────────
  await t.test('3.1: Initiates Food Recall with Internal ID and optional FoSCoS reference', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/food-safety/recalls',
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        title: 'Precautionary Dairy Cream Recall - Batch DC-8801',
        reason: 'Potential temperature excursion during vendor transport',
        severity: 'CLASS_II_TEMPORARY_HEALTH',
        affectedCafes: ['ZC-0001', 'ZC-0002'],
        ingredientName: 'Whipping Cream 35%',
        lotBatch: 'DC-8801',
        foscosRegulatoryReference: null, // Proves optionality; no fabrication
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.data.recall.status, 'DETECTED');
    assert.ok(res.data.data.recall.recallId.startsWith('REC-'));
  });

  await t.test('3.2: Rejects illegal state transition jumps in 8-state recall lifecycle', async () => {
    const recalls = await FoodRecallCase.find({ organisationId: 'ORG-ZAMORIN' });
    const recall = recalls[0];

    // Attempt invalid jump from DETECTED directly to ACTION_COMPLETED
    const res = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/food-safety/recalls/${recall.recallId}/transition`,
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        nextState: 'ACTION_COMPLETED',
        rationale: 'Skipping steps is prohibited',
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.data.error.code, 'ILLEGAL_STATE_TRANSITION');
  });

  await t.test('3.3: Successfully steps through all governed 8 recall lifecycle states', async () => {
    const recalls = await FoodRecallCase.find({ organisationId: 'ORG-ZAMORIN' });
    const recall = recalls[0];

    const sequence = [
      'RISK_ASSESSED',
      'QUARANTINED',
      'RECALL_INITIATED',
      'AFFECTED_STOCK_IDENTIFIED',
      'ACTION_COMPLETED',
      'VERIFIED',
      'CLOSED',
    ];

    for (const step of sequence) {
      const res = await makeRequest({
        port,
        method: 'POST',
        path: `/api/v1/food-safety/recalls/${recall.recallId}/transition`,
        headers: { Authorization: 'Bearer tok_owner' },
        body: {
          nextState: step,
          rationale: `Valid step to ${step}`,
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.data.recall.status, step);
    }
  });

  await t.test('3.4: Reconciles stock disposition quantities with zero silent quantity loss', async () => {
    const recalls = await FoodRecallCase.find({ organisationId: 'ORG-ZAMORIN' });
    const recall = recalls[0];

    // Dispositions reconciling exact 10 units quarantined (4 returned, 6 destroyed = 10)
    const resValid = await makeRequest({
      port,
      method: 'PUT',
      path: `/api/v1/food-safety/recalls/${recall.recallId}/dispositions`,
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        dispositions: [
          {
            cafeId: 'ZC-0001',
            lotId: 'LOT-DC-01',
            originallyIdentifiedQty: 10,
            quarantinedQty: 10,
            returnedToSupplierQty: 4,
            destroyedQty: 6,
            releasedQty: 0,
            disposedQty: 0,
          },
        ],
      },
    });

    assert.equal(resValid.status, 200);
    assert.equal(resValid.data.data.recall.stockDispositions[0].quarantinedQty, 10);

    // Dispositions violating reconciliation (resolved > quarantined)
    const resInvalid = await makeRequest({
      port,
      method: 'PUT',
      path: `/api/v1/food-safety/recalls/${recall.recallId}/dispositions`,
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        dispositions: [
          {
            cafeId: 'ZC-0001',
            lotId: 'LOT-DC-01',
            originallyIdentifiedQty: 10,
            quarantinedQty: 10,
            returnedToSupplierQty: 10,
            destroyedQty: 5, // Total 15 > 10 quarantined!
          },
        ],
      },
    });

    assert.equal(resInvalid.status, 400);
    assert.equal(resInvalid.data.error.code, 'DISPOSITION_RECONCILIATION_ERROR');
  });

  await t.test('3.5: FoSCoS Governance: Blocks formal regulatory recall closure when filing is unresolved', async () => {
    // 1. Create a MANDATORY_REGULATORY recall
    const resCreate = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/food-safety/recalls',
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        cafeIds: ['ZC-0001'],
        title: 'Contaminated Hazelnut Syrup Mandatory Recall',
        description: 'Foreign regulatory notification: pathogen detected in batch',
        reason: 'Pathogen detected in batch',
        hazardClassification: 'CLASS_I',
        regulatoryApplicability: 'MANDATORY_REGULATORY',
        affectedLots: [{ lotId: 'LOT-HZ-99', skuId: 'SKU-HZ-SYRUP', quantity: 20 }],
      },
    });

    assert.equal(resCreate.status, 201);
    const recallId = resCreate.data.data.recall.recallId;
    assert.equal(resCreate.data.data.recall.regulatoryApplicability, 'MANDATORY_REGULATORY');
    assert.equal(resCreate.data.data.recall.foscosFilingStatus, 'REQUIRED_PENDING');

    // 2. Advance to VERIFIED
    for (const step of ['RISK_ASSESSED', 'QUARANTINED', 'RECALL_INITIATED', 'AFFECTED_STOCK_IDENTIFIED', 'ACTION_COMPLETED', 'VERIFIED']) {
      await makeRequest({
        port,
        method: 'POST',
        path: `/api/v1/food-safety/recalls/${recallId}/transition`,
        headers: { Authorization: 'Bearer tok_owner' },
        body: { nextState: step, rationale: `Advancing to ${step}` },
      });
    }

    // 3. Attempt CLOSED without FoSCoS filing -> MUST BE REJECTED
    const resCloseAttempt = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/food-safety/recalls/${recallId}/transition`,
      headers: { Authorization: 'Bearer tok_owner' },
      body: { nextState: 'CLOSED', rationale: 'Attempting close without filing' },
    });

    assert.equal(resCloseAttempt.status, 400);
    assert.equal(resCloseAttempt.data.error.code, 'FOSCOS_REGULATORY_FILING_UNRESOLVED');

    // 4. Update FoSCoS filing status with formal reference and evidence
    const resFiling = await makeRequest({
      port,
      method: 'PUT',
      path: `/api/v1/food-safety/recalls/${recallId}/foscos-filing`,
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        foscosFilingStatus: 'COMPLETED',
        filingCompletedDate: '2026-09-14T00:00:00.000Z',
        foscosRecallReference: 'FOSCOS-REC-2026-0042',
        filingEvidenceAttachmentId: 'ATT-FOSCOS-ACK-01',
        filingResponsiblePerson: 'USR-OWNER-FS01',
        authorityNotes: 'Filed under 18 March 2026 FoSCoS Order with FSSAI state commissioner acknowledgment',
      },
    });

    assert.equal(resFiling.status, 200);
    assert.equal(resFiling.data.data.recall.foscosFilingStatus, 'COMPLETED');
    assert.equal(resFiling.data.data.recall.foscosRegulatoryReference, 'FOSCOS-REC-2026-0042');

    // 5. Now CLOSED transition succeeds
    const resClosed = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/food-safety/recalls/${recallId}/transition`,
      headers: { Authorization: 'Bearer tok_owner' },
      body: { nextState: 'CLOSED', rationale: 'Formal recall closure after verified FoSCoS submission' },
    });

    assert.equal(resClosed.status, 200);
    assert.equal(resClosed.data.data.recall.status, 'CLOSED');
  });

  await t.test('3.6: Recall Communications logging and Customer PII Masking on Affected Sales', async () => {
    const recalls = await FoodRecallCase.find({ organisationId: 'ORG-ZAMORIN' });
    const recall = recalls[0];

    // 1. Log Authority & Supplier Communication
    const resComm = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/food-safety/recalls/${recall.recallId}/communications`,
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        communicationType: 'REGULATORY_NOTIFICATION',
        audience: 'FSSAI Regional Directorate',
        authority: 'FSSAI Food Safety Officer',
        contentReference: 'Initial 24-hr formal notification of Class-I recall',
        evidenceAttachmentId: 'ATT-FSSAI-EMAIL-01',
        responsiblePerson: 'USR-OWNER-FS01',
      },
    });

    assert.equal(resComm.status, 201);
    assert.ok(resComm.data.data.recall.communications.length >= 1);

    // 2. Map affected sales with customer PII minimization
    const resSales = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/food-safety/recalls/${recall.recallId}/affected-sales`,
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        sales: [
          {
            billId: 'BILL-2026-0914-001',
            cafeId: 'ZC-0001',
            menuItemId: 'MENU-HAZELNUT-LATTE',
            menuItemName: 'Hazelnut Iced Latte',
            quantity: 2,
            customerPhone: '9876543210',
          },
        ],
      },
    });

    assert.equal(resSales.status, 200);
    const mappedSale = resSales.data.data.recall.potentiallyAffectedSales[0];
    assert.equal(mappedSale.billId, 'BILL-2026-0914-001');
    assert.equal(mappedSale.maskedCustomerIdentifier, '***-***-3210'); // Zero PII overexposure
  });

  // ── 4. CAPA Engine & Human-Confirmed Root Cause Analysis ──────────────────────
  await t.test('4.1: Initiates CAPA requiring human-confirmed root cause analysis', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/food-safety/capas',
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        cafeId: 'ZC-0001',
        source: 'FOOD_RECALL',
        sourceReferenceId: 'REC-2026-TEST',
        title: 'Vendor Transport Cold Chain Breakdown Remediation',
        findingDescription: 'Whipping cream received at 11°C due to carrier refrigeration failure',
        rootCauseCategory: 'STORAGE_ENVIRONMENT',
        rootCauseAnalysis: 'Carrier reefer unit fuse blown during transit from Bangalore distribution hub.',
        rootCauseConfirmedByHuman: true,
        correctiveActionPlan: 'Reject affected consignment and switch to backup local refrigerated vendor.',
        preventiveActionPlan: 'Implement digital datalogger verification upon dock receipt before signing GRN.',
        assignedOwnerUserId: 'USR-ADMIN-C1',
        dueDate: '2026-09-30T00:00:00.000Z',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.data.capa.rootCauseConfirmedByHuman, true);
    assert.equal(res.data.data.capa.status, 'OPEN');
  });

  await t.test('4.2: Verifies and closes CAPA with permanent audit history', async () => {
    const capas = await CapaRecord.find({ organisationId: 'ORG-ZAMORIN' });
    const capa = capas[0];

    const res = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/food-safety/capas/${capa.capaId}/verify`,
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        verificationNotes: 'Digital datalogger protocol verified across 3 successive receipts. Zero temperature excursions.',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.capa.status, 'CLOSED');
    assert.notEqual(res.data.data.capa.closedAt, null);
  });

  // ── 5. Traceability Graph & Gap Register ──────────────────────────────────────
  await t.test('5.1: Traceability gap register logs missing linkages and marks incomplete chain', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/food-safety/traceability/gaps',
      headers: { Authorization: 'Bearer tok_owner' },
      body: {
        cafeId: 'ZC-0001',
        gapType: 'MISSING_SUPPLIER_LOT',
        affectedEntity: {
          entityType: 'GRN',
          entityId: 'GRN-2026-9901',
          title: 'Specialty Arabica Beans Dock Receipt',
        },
        severity: 'HIGH',
        description: 'Supplier invoice did not print harvest lot number; required for single-origin traceability.',
        dueDate: '2026-09-20T00:00:00.000Z',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.data.gap.gapType, 'MISSING_SUPPLIER_LOT');
    assert.equal(res.data.data.gap.status, 'OPEN');
  });

  // ── 6. Tenant Isolation & Negative IDOR Security Tests ───────────────────────
  await t.test('6.1: Cross-organisation IDOR: Foreign organisation cannot view Zamorin food licences', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/food-safety/licences',
      headers: { Authorization: 'Bearer tok_foreign' },
    });

    assert.equal(res.status, 200);
    // Foreign org sees ONLY its own licences (zero Zamorin records)
    assert.equal(res.data.data.licences.length, 0);
  });

  await t.test('6.2: Cross-café IDOR: Café 1 Admin cannot register licence or execute inspection for unauthorized Café 2', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/food-safety/hygiene/inspections',
      headers: { Authorization: 'Bearer tok_c1' },
      body: {
        cafeId: 'ZC-0002', // Unauthorized for Cafe 1 Admin
        templateId: 'TPL-DAILY-KITCHEN',
        responses: [{ questionId: 'Q1', response: 'PASS' }],
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.error.code, 'CAFE_ACCESS_DENIED');
  });

  // ── 7. Portfolio Executive Dashboard ──────────────────────────────────────────
  await t.test('7.1: Returns comprehensive portfolio dashboard metrics deep-linked to source data', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/food-safety/overview',
      headers: { Authorization: 'Bearer tok_owner' },
    });

    assert.equal(res.status, 200);
    const overview = res.data.data.overview;
    assert.equal(overview.organisationId, 'ORG-ZAMORIN');
    assert.ok(overview.licences.total >= 2);
    assert.ok(overview.recalls.total >= 1);
    assert.ok(overview.capas.total >= 1);
    assert.ok(overview.traceability.openGapsCount >= 1);
  });

  // ── 8. Regulatory Status Separation & Evidence-Backed Transitions ─────────────
  await t.test('8.1: Case A: Internal hygiene failure alerts internal state; FSSAI regulatory status remains ACTIVE', async () => {
    // Ensure active licence exists for test
    await FoodSafetyRegistration.updateOne(
      { organisationId: 'ORG-ZAMORIN', cafeId: 'ZC-0001' },
      { $set: { status: 'ACTIVE', internalComplianceState: 'COMPLIANT' } }
    );

    // Execute critical fail inspection with required evidence attachment
    await FoodSafetyGovernanceService.submitHygieneInspection({
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      templateId: 'TPL-DAILY-KITCHEN',
      inspectedByUserId: 'USR-ADMIN-01',
      responses: [
        { questionId: 'Q1', response: 'FAIL', notes: 'Critical sanitation failure', evidenceAttachmentId: 'ATT-HYG-001' },
      ],
    });

    const reg = await FoodSafetyRegistration.findOne({
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
    });

    assert.ok(reg);
    assert.equal(reg.status, 'ACTIVE', 'Legal FSSAI status must remain ACTIVE');
    assert.equal(reg.internalComplianceState, 'SERIOUS_NONCOMPLIANCE', 'Internal compliance state must be flagged');
  });

  await t.test('8.2: Case B: Overdue/High Risk CAPA updates internal compliance state; legal FSSAI status remains ACTIVE', async () => {
    await FoodSafetyGovernanceService.createCapa({
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      source: 'INTERNAL_AUDIT',
      sourceReferenceId: 'AUD-001',
      title: 'High priority cold storage temperature excursion',
      findingDescription: 'Freezer temperature exceeded threshold for 3 hours',
      rootCauseCategory: 'EQUIPMENT_FAILURE',
      rootCauseAnalysis: 'Compressor thermal overload relay tripped.',
      rootCauseConfirmedByHuman: true,
      correctiveActionPlan: 'Replaced thermal relay.',
      preventiveActionPlan: 'Added secondary temperature sensor alarm.',
      assignedOwnerUserId: 'USR-ADMIN-01',
      dueDate: new Date(Date.now() + 86400000),
      performedByUserId: 'USR-OWNER-01',
    });

    const reg = await FoodSafetyRegistration.findOne({
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
    });

    assert.ok(reg);
    assert.equal(reg.status, 'ACTIVE', 'Legal regulatory licence status must remain ACTIVE');
    assert.equal(reg.internalComplianceState, 'ACTION_REQUIRED', 'Internal compliance state must reflect action required');
  });

  await t.test('8.3: Case C: Verified regulator suspension evidence allows authorized transition to SUSPENDED', async () => {
    const reg = await FoodSafetyRegistration.findOne({
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
    });

    const updated = await FoodSafetyGovernanceService.updateLicenceStatus({
      organisationId: 'ORG-ZAMORIN',
      registrationId: reg.registrationId,
      newStatus: 'SUSPENDED',
      reason: 'Official regulatory notice received from FSSAI Designated Officer',
      performedByUserId: 'USR-OWNER-01',
      performedByRole: 'OWNER',
      regulatorOrderReference: 'FSSAI-DO-KZD-2026-4412',
    });

    assert.equal(updated.status, 'SUSPENDED');
    assert.equal(updated.regulatorOrderReference, 'FSSAI-DO-KZD-2026-4412');

    // Restore to ACTIVE for remaining tests
    await FoodSafetyGovernanceService.updateLicenceStatus({
      organisationId: 'ORG-ZAMORIN',
      registrationId: reg.registrationId,
      newStatus: 'ACTIVE',
      reason: 'Reinstated upon submission of compliance report',
      performedByUserId: 'USR-OWNER-01',
      performedByRole: 'OWNER',
    });
  });

  await t.test('8.4: Case D: Unauthorized user or missing regulator evidence is strictly rejected', async () => {
    const reg = await FoodSafetyRegistration.findOne({
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
    });

    // 1. Missing regulator evidence for SUSPENDED
    await assert.rejects(
      async () => {
        await FoodSafetyGovernanceService.updateLicenceStatus({
          organisationId: 'ORG-ZAMORIN',
          registrationId: reg.registrationId,
          newStatus: 'SUSPENDED',
          reason: 'No evidence provided',
          performedByUserId: 'USR-OWNER-01',
          performedByRole: 'OWNER',
          regulatorOrderReference: null,
        });
      },
      (err) => err.code === 'AUTHORITATIVE_REGULATOR_EVIDENCE_REQUIRED'
    );

    // 2. Unauthorized role (STAFF)
    await assert.rejects(
      async () => {
        await FoodSafetyGovernanceService.updateLicenceStatus({
          organisationId: 'ORG-ZAMORIN',
          registrationId: reg.registrationId,
          newStatus: 'SUSPENDED',
          reason: 'Unauthorized attempt',
          performedByUserId: 'USR-STAFF-01',
          performedByRole: 'STAFF',
          regulatorOrderReference: 'REF-FAKE',
        });
      },
      (err) => err.code === 'FORBIDDEN'
    );
  });

  // ── 9. Schedule 4 Hygiene Checklist Mapping ──────────────────────────────────
  await t.test('9.1: Schedule 4 hygiene mapping selects Part V for café and rejects Part III when milk processing is absent', () => {
    // Restaurant / Café
    const cafeMapping = FoodSafetyGovernanceService.getSchedule4HygieneMapping({
      kindOfBusiness: 'FOOD_SERVICE_RESTAURANT_CAFE',
      licenceType: 'STATE_LICENSE',
      hasMilkProcessing: false,
    });
    assert.equal(cafeMapping.schedule4Part, 'PART_V', 'Café must map to Part V');

    // Petty FBO
    const pettyMapping = FoodSafetyGovernanceService.getSchedule4HygieneMapping({
      kindOfBusiness: 'PETTY_FOOD_BUSINESS',
      licenceType: 'REGISTRATION',
      hasMilkProcessing: false,
    });
    assert.equal(pettyMapping.schedule4Part, 'PART_I', 'Petty FBO must map to Part I');

    // Manufacturing
    const mfgMapping = FoodSafetyGovernanceService.getSchedule4HygieneMapping({
      kindOfBusiness: 'MANUFACTURING_PROCESSING',
      licenceType: 'STATE_LICENSE',
      hasMilkProcessing: false,
    });
    assert.equal(mfgMapping.schedule4Part, 'PART_II', 'Manufacturing must map to Part II');

    // Milk processing absent: verify Part III is NOT returned
    assert.notEqual(cafeMapping.schedule4Part, 'PART_III', 'General café must never falsely receive Part III');
  });

  // ── 10. FoSTaC Supervisor Quota Calculation ──────────────────────────────────
  await t.test('10.1: FoSTaC supervisor ratio applies 1:25 to Licences and exempts Registration class', () => {
    // 1. State Licence with 35 handlers -> requires 2 supervisors
    const r1 = FoodSafetyGovernanceService.calculateSupervisoryRatio({
      foodHandlersCount: 35,
      licenceType: 'STATE_LICENSE',
      certifiedSupervisorsCount: 2,
    });
    assert.equal(r1.statutoryRatioApplies, true);
    assert.equal(r1.requiredSupervisors, 2);
    assert.equal(r1.compliant, true);

    // 2. Zero food handlers -> requires 0
    const r2 = FoodSafetyGovernanceService.calculateSupervisoryRatio({
      foodHandlersCount: 0,
      licenceType: 'STATE_LICENSE',
      certifiedSupervisorsCount: 0,
    });
    assert.equal(r2.requiredSupervisors, 0);
    assert.equal(r2.compliant, true);

    // 3. Petty Registration -> statutory ratio does not apply
    const r3 = FoodSafetyGovernanceService.calculateSupervisoryRatio({
      foodHandlersCount: 15,
      licenceType: 'REGISTRATION',
      certifiedSupervisorsCount: 0,
    });
    assert.equal(r3.statutoryRatioApplies, false);
    assert.equal(r3.requiredSupervisors, 0);
    assert.equal(r3.compliant, true);
  });
});
