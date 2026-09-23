'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { createApp } = require('../src/server');
const { ComplianceObligation } = require('../src/models/ComplianceObligation');
const { BusinessLicence } = require('../src/models/BusinessLicence');
const { BusinessContract } = require('../src/models/BusinessContract');
const { ContractObligation } = require('../src/models/ContractObligation');
const { InsurancePolicy } = require('../src/models/InsurancePolicy');
const { InsuranceClaim } = require('../src/models/InsuranceClaim');
const { ownerComplianceService } = require('../src/services/ownerComplianceService');
const authService = require('../src/services/authService');

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

test('STAGE 04 — Compliance, Licence, Contract & Insurance Governance Suite', async (t) => {
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
      fullName: 'Owner Compliance Lead',
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
      fullName: 'Foreign Owner Compliance',
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

  // ── 1. Obligations ────────────────────────────────────────────────────────
  await t.test('1. Create compliance obligation with active effective date', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/compliance/obligations',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        obligationId: 'OBL-0001',
        domain: 'FOOD_SAFETY',
        authority: 'FSSAI',
        source: 'Food Safety and Standards Act, 2006',
        requirementSummary: 'Maintain perpetual licence and Schedule 4 sanitary guidelines',
        status: 'APPLICABLE',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.obligationId, 'OBL-0001');
  });

  await t.test('2. Future commencement date models UPCOMING and FUTURE_EFFECTIVE state', async () => {
    const futureDate = new Date(Date.now() + 60 * 86400000); // 60 days in future
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/compliance/obligations',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        obligationId: 'OBL-0002',
        domain: 'DATA_PRIVACY',
        authority: 'Data Protection Board of India',
        source: 'Digital Personal Data Protection Rules, 2026',
        futureCommencementDate: futureDate,
        requirementSummary: 'Notice and consent manager requirements (Tranche 2)',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.data.status, 'UPCOMING');

    const listRes = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/compliance/obligations',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    const obligation = listRes.data.data.find((o) => o.obligationId === 'OBL-0002');
    assert.ok(obligation);
    assert.equal(obligation.effectiveState, 'FUTURE_EFFECTIVE');
  });

  await t.test('3. Past due date decorates obligation as OVERDUE', async () => {
    const pastDate = new Date(Date.now() - 10 * 86400000);
    await ComplianceObligation.create({
      organisationId: ORG_ID,
      obligationId: 'OBL-0003',
      domain: 'TAX_FINANCE',
      authority: 'GSTN',
      source: 'CGST Act, 2017',
      requirementSummary: 'GSTR-3B Monthly Return Filing',
      dueDate: pastDate,
      status: 'ACTION_REQUIRED',
    });

    const listRes = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/compliance/obligations',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    const item = listRes.data.data.find((o) => o.obligationId === 'OBL-0003');
    assert.ok(item);
    assert.equal(item.effectiveState, 'OVERDUE');
  });

  await t.test('4. Update obligation status', async () => {
    const res = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/compliance/obligations/OBL-0001/status',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { status: 'COMPLETED' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.status, 'COMPLETED');
  });

  // ── 2. Licences ───────────────────────────────────────────────────────────
  await t.test('5. Register FSSAI perpetual licence: zero fake expiry date', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/compliance/licences',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        licenceId: 'LIC-FSSAI-01',
        licenceType: 'FSSAI_STATE_LICENCE',
        authority: 'Commissioner of Food Safety, Kerala',
        referenceNumber: '11326001000123',
        issueDate: new Date('2026-01-15'),
        isPerpetual: true,
        expiryDate: new Date('2030-01-01'), // Should be wiped because isPerpetual=true
        conditions: ['Display FSSAI logo and 14-digit number at entrance', 'Maintain FoSTaC certified supervisor'],
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.data.isPerpetual, true);
    assert.equal(res.data.data.expiryDate, null); // Zero false expiry
  });

  await t.test('6. Register term-based licence with genuine expiry date', async () => {
    const expiry = new Date(Date.now() + 365 * 86400000);
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/compliance/licences',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        licenceId: 'LIC-TRADE-01',
        licenceType: 'LOCAL_TRADE_HEALTH',
        authority: 'Kozhikode Municipal Corporation',
        referenceNumber: 'KMC/H4/2026/994',
        issueDate: new Date(),
        isPerpetual: false,
        expiryDate: expiry,
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.data.isPerpetual, false);
    assert.ok(res.data.data.expiryDate);
  });

  await t.test('7. Record periodic licence review without calling it renewal', async () => {
    const nextReview = new Date(Date.now() + 180 * 86400000);
    const res = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/compliance/licences/LIC-FSSAI-01/review',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { nextReviewDate: nextReview, status: 'ACTIVE' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.status, 'ACTIVE');
  });

  // ── 3. Contracts & Lifecycle ──────────────────────────────────────────────
  await t.test('8. Create Contract Draft with version 1 and audit lineage', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/compliance/contracts',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        contractId: 'CTR-LEASE-01',
        contractType: 'COMMERCIAL_LEASE',
        title: 'Kozhikode Beach Promenade Flagship Lease Agreement',
        counterpartyName: 'Malabar Properties Pvt Ltd',
        commercialValue: 2400000,
        renewalNoticeDays: 60,
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.data.status, 'DRAFT');
    assert.equal(res.data.data.version, 1);
    assert.equal(res.data.data.lineage.length, 1);
  });

  await t.test('9. Contract lifecycle follows valid state transitions', async () => {
    // DRAFT -> REVIEW
    let res = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/compliance/contracts/CTR-LEASE-01/status',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { status: 'REVIEW' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.data.status, 'REVIEW');

    // REVIEW -> APPROVAL
    res = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/compliance/contracts/CTR-LEASE-01/status',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { status: 'APPROVAL' },
    });
    assert.equal(res.status, 200);

    // APPROVAL -> EXECUTION_PENDING
    res = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/compliance/contracts/CTR-LEASE-01/status',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { status: 'EXECUTION_PENDING' },
    });
    assert.equal(res.status, 200);

    // EXECUTION_PENDING -> EXECUTED
    res = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/compliance/contracts/CTR-LEASE-01/status',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { status: 'EXECUTED' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.data.executedDate);
  });

  await t.test('10. Illegal contract lifecycle jump is strictly rejected', async () => {
    const res = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/compliance/contracts/CTR-LEASE-01/status',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { status: 'DRAFT' }, // Cannot jump backward from EXECUTED to DRAFT
    });

    assert.equal(res.status, 400);
    assert.ok(res.data.error.includes('Illegal contract status transition'));
  });

  await t.test('11. Amend executed contract: increments version and preserves lineage without overwrite', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/compliance/contracts/CTR-LEASE-01/amend',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        amendmentType: 'ADDENDUM',
        changeSummary: 'Additional outdoor patio seating area expansion',
        commercialValue: 2700000,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.version, 2);
    assert.equal(res.data.data.commercialValue, 2700000);
    assert.equal(res.data.data.lineage.length, 2);
    assert.equal(res.data.data.lineage[0].version, 1);
    assert.equal(res.data.data.lineage[1].version, 2);
  });

  await t.test('12. Contract obligation tracking: records exception without automated breach conclusion', async () => {
    const addRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/compliance/contracts/CTR-LEASE-01/obligations',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        obligationId: 'COBL-01',
        title: 'Provide quarterly central air conditioning filter servicing certificate',
        responsibleParty: 'COUNTERPARTY',
        dueDate: new Date(),
      },
    });
    assert.equal(addRes.status, 201);

    const updateRes = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/compliance/contracts/CTR-LEASE-01/obligations/COBL-01',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        status: 'POTENTIAL_EXCEPTION',
        observation: 'Q3 maintenance report delayed by 14 days pending technician sign-off',
      },
    });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.data.data.status, 'POTENTIAL_EXCEPTION');
  });

  // ── 4. Insurance & Claims ─────────────────────────────────────────────────
  await t.test('13. Register IRDAI compliant Insurance Policy', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/compliance/insurance/policies',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        policyId: 'POL-FIRE-01',
        policyNumber: 'NIA/SFSP/2026/09981',
        insurerName: 'New India Assurance Co. Ltd.',
        policyType: 'STANDARD_FIRE_SPECIAL_PERILS',
        coverageSummary: 'Building, plant, kitchen machinery, espresso units and stocks',
        sumInsured: 15000000,
        deductibleAmount: 25000,
        premiumAmount: 48500,
        startDate: new Date('2026-04-01'),
        endDate: new Date('2027-03-31'),
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.data.policyId, 'POL-FIRE-01');
  });

  await t.test('14. File insurance claim and verify lifecycle state machine', async () => {
    const fileRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/compliance/insurance/claims',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        claimId: 'CLM-2026-01',
        policyId: 'POL-FIRE-01',
        incidentDate: new Date(),
        description: 'Electrical surge damage to commercial blender and cold-brew dispenser',
        estimatedLoss: 120000,
        claimedAmount: 95000,
      },
    });

    assert.equal(fileRes.status, 201);
    assert.equal(fileRes.data.data.status, 'INCIDENT_RECORDED');

    // Valid transition: INCIDENT_RECORDED -> CLAIM_ASSESSMENT
    const transRes = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/compliance/insurance/claims/CLM-2026-01/status',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { status: 'CLAIM_ASSESSMENT' },
    });
    assert.equal(transRes.status, 200);
    assert.equal(transRes.data.data.status, 'CLAIM_ASSESSMENT');

    // Invalid transition: CLAIM_ASSESSMENT directly to SETTLED is rejected
    const badRes = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/compliance/insurance/claims/CLM-2026-01/status',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { status: 'SETTLED', settlementAmount: 90000 },
    });
    assert.equal(badRes.status, 400);
    assert.ok(badRes.data.error.includes('Illegal insurance claim transition'));
  });

  // ── 5. Executive Dashboard & Isolation ────────────────────────────────────
  await t.test('15. Executive Dashboard aggregates compliance metrics', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/compliance/dashboard',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    assert.equal(res.status, 200);
    const { obligations, licences, contracts, insurance } = res.data.data;
    assert.ok(obligations.total >= 3);
    assert.ok(licences.perpetual >= 1);
    assert.ok(insurance.policiesActive >= 1);
    assert.ok(insurance.activeClaims >= 1);
  });

  await t.test('16. Multi-Tenant IDOR: Foreign organisation denied access to compliance records', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/compliance/obligations',
      headers: { Authorization: `Bearer ${foreignToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.length, 0); // Completely isolated, zero cross-tenant leak
  });
});
