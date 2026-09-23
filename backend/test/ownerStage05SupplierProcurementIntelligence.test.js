'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const http = require('http');

const { createApp } = require('../src/server');
const authService = require('../src/services/authService');
const { Vendor } = require('../src/models/Vendor');
const { PurchaseOrder } = require('../src/models/PurchaseOrder');
const { SupplierScorecardConfig } = require('../src/models/SupplierScorecardConfig');
const { SupplierActionPlan } = require('../src/models/SupplierActionPlan');
const { FoodSafetyIncident } = require('../src/models/FoodSafetyIncident');

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

test('STAGE 05 — Supplier & Procurement Intelligence Suite', async (t) => {
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
      fullName: 'Owner Procurement Lead',
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
      fullName: 'Foreign Owner Procurement',
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

    // Seed test vendors complying with Vendor model regex /^VEN-\d{4,}$/ and required fields
    await Vendor.create([
      {
        organisationId: ORG_ID,
        vendorId: 'VEN-0001',
        name: 'Malabar Dairy Cooperative',
        supplierType: 'GOODS',
        category: 'FOOD_BEVERAGE',
        status: 'ACTIVE',
        createdByUserId: 'USR-OWNER-01',
        fssai: {
          isApplicable: true,
          licenseNumber: '11322001000123',
          isValid: true,
        },
        bankDetails: {
          accountNumber: '999888777666',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'Malabar Dairy Co-op',
        },
        itemCatalogue: [
          { itemId: 'RAW-MILK-01', supplierItemCode: 'MILK-01', itemName: 'Fresh Buffalo Milk', currentPricePaisa: 6000 },
          { itemId: 'RAW-PANEER-01', supplierItemCode: 'PANEER-01', itemName: 'Fresh Artisanal Paneer', currentPricePaisa: 38000 },
        ],
      },
      {
        organisationId: ORG_ID,
        vendorId: 'VEN-0002',
        name: 'Wayanad High-Grown Estate Coffee',
        supplierType: 'GOODS',
        category: 'FOOD_BEVERAGE',
        status: 'ACTIVE',
        createdByUserId: 'USR-OWNER-01',
        itemCatalogue: [
          { itemId: 'RAW-COFFEE-ROBUSTA', supplierItemCode: 'COFFEE-ROBUSTA', itemName: 'Wayanad Robusta Cherry A', currentPricePaisa: 42000 },
        ],
      },
    ]);
  });

  t.after(async () => {
    if (server) server.close();
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  // ── 1. Supplier 360 & Confidential Banking Isolation ─────────────────────
  await t.test('1. Supplier 360: Aggregates profile and masks sensitive banking data', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/supplier-intelligence/suppliers/VEN-0001/360',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.supplier.name, 'Malabar Dairy Cooperative');
    // Confidential banking data must NOT be exposed in general owner dashboard
    assert.equal(res.data.data.supplier.bankAccounts, undefined);
    assert.equal(res.data.data.supplier.bankDetails, undefined);
    assert.equal(res.data.data.supplier.bankDetailsRestricted, true);
  });

  // ── 2. Defensible Delivery OTIF (No Fabrication when Promised Date Absent) ─
  await t.test('2. Missing promised delivery date returns OTIF as UNAVAILABLE (no fabrication)', async () => {
    // PO with no promised delivery date
    await PurchaseOrder.create({
      organisationId: ORG_ID,
      purchaseOrderId: 'PO-TEST-0001',
      cafeId: 'ZC-0001',
      vendorId: 'VEN-0001',
      vendorNameSnapshot: 'Malabar Dairy Cooperative',
      createdByUserId: 'USR-OWNER-01',
      totalPaisa: 120000,
      createdAt: new Date(),
      lineItems: [{ itemId: 'RAW-MILK-01', orderedQuantityBase: 20, unitPricePaisa: 6000, totalLinePaisa: 120000 }],
    });

    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/supplier-intelligence/suppliers/VEN-0001/360',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    assert.equal(res.status, 200);
    const del = res.data.data.deliveryMetrics;
    assert.equal(del.status, 'UNAVAILABLE');
    assert.equal(del.otifPercent, null);
    assert.ok(del.reason.includes('cannot be fabricated'));
  });

  // ── 3. Defensible Delivery OTIF (Calculated with Authoritative Dates) ──────
  await t.test('3. Authoritative promised and actual delivery dates calculate real OTIF', async () => {
    await PurchaseOrder.create({
      organisationId: ORG_ID,
      purchaseOrderId: 'PO-TEST-0002',
      cafeId: 'ZC-0001',
      vendorId: 'VEN-0001',
      vendorNameSnapshot: 'Malabar Dairy Cooperative',
      createdByUserId: 'USR-OWNER-01',
      totalPaisa: 150000,
      expectedDeliveryDate: '2026-09-10',
      receivedDate: '2026-09-09',
      status: 'RECEIVED',
      createdAt: new Date(),
      lineItems: [{ itemId: 'RAW-MILK-01', orderedQuantityBase: 25, unitPricePaisa: 6000, totalLinePaisa: 150000 }],
      grnReceipts: [
        {
          grnId: 'GRN-0002',
          receivedAt: new Date('2026-09-09T18:00:00Z'),
          receivedByUserId: 'USR-OWNER-01',
          items: [{ itemId: 'RAW-MILK-01', deliveredQty: 25, acceptedQty: 25, rejectedQty: 0 }],
        },
      ],
    });

    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/supplier-intelligence/suppliers/VEN-0001/360',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    assert.equal(res.status, 200);
    const del = res.data.data.deliveryMetrics;
    assert.equal(del.status, 'AVAILABLE');
    assert.equal(del.onTimeDeliveryPercent, 100);
    assert.equal(del.fullDeliveryPercent, 100);
    assert.equal(del.otifPercent, 100);
  });

  // ── 4. Quality & Stage 01 Food Safety Linkage ─────────────────────────────
  await t.test('4. Quality metrics capture rejections and link Stage 01 Food Safety Incidents', async () => {
    // Record rejection on PO
    await PurchaseOrder.create({
      organisationId: ORG_ID,
      purchaseOrderId: 'PO-TEST-0003',
      cafeId: 'ZC-0001',
      vendorId: 'VEN-0001',
      vendorNameSnapshot: 'Malabar Dairy Cooperative',
      createdByUserId: 'USR-OWNER-01',
      totalPaisa: 60000,
      createdAt: new Date(),
      lineItems: [{ itemId: 'RAW-MILK-01', orderedQuantityBase: 10, unitPricePaisa: 6000, totalLinePaisa: 60000 }],
      grnReceipts: [
        {
          grnId: 'GRN-0003',
          receivedAt: new Date(),
          receivedByUserId: 'USR-OWNER-01',
          items: [{ itemId: 'RAW-MILK-01', deliveredQty: 10, acceptedQty: 8, rejectedQty: 2 }],
        },
      ],
    });

    // Record linked food safety incident
    await FoodSafetyIncident.create({
      organisationId: ORG_ID,
      incidentId: 'FSI-DAIRY-01',
      cafeId: 'ZC-0001',
      supplierId: 'VEN-0001',
      reportedByUserId: 'USR-OWNER-01',
      title: 'Sour milk batch with elevated temperature at receiving',
      description: 'Milk batch delivered by VEN-0001 at 12C instead of 4C target',
      incidentType: 'UNDERCOOKED_TEMPERATURE',
      severity: 'HIGH',
      occurredAt: new Date(),
    });

    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/supplier-intelligence/suppliers/VEN-0001/360',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    assert.equal(res.status, 200);
    const qual = res.data.data.qualityMetrics;
    assert.ok(qual.totalRejectedQty >= 2);
    assert.ok(qual.rejectionRatePercent > 0);
    assert.equal(qual.linkedSafetyIncidentsCount, 1);
  });

  // ── 5. Scorecard Transparency & Zero Opaque Scores ────────────────────────
  await t.test('5. Scorecard exposes explicit components, weights and pro-rated formula', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/supplier-intelligence/suppliers/VEN-0001/360',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    assert.equal(res.status, 200);
    const sc = res.data.data.scorecard;
    assert.ok(typeof sc.overallScore === 'number');
    assert.ok(sc.formula.includes('Sum(Available Component Score * Weight)'));
    assert.ok(sc.components.quality.available);
    assert.ok(sc.components.compliance.available);
  });

  // ── 6. Scorecard Configuration Update (Weights Must Sum to 100) ───────────
  await t.test('6. Scorecard weights update enforces exact 100% sum constraint', async () => {
    // Attempt invalid sum (30 + 20 = 50 != 100)
    let res = await makeRequest({
      port,
      method: 'PUT',
      path: '/api/v1/supplier-intelligence/scorecard-config',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        weights: {
          qualityWeight: 30,
          deliveryWeight: 20,
        },
      },
    });
    assert.equal(res.status, 400);
    assert.ok(res.data.error.includes('must sum to 100'));

    // Valid sum: 35 + 25 + 20 + 10 + 10 = 100
    res = await makeRequest({
      port,
      method: 'PUT',
      path: '/api/v1/supplier-intelligence/scorecard-config',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        weights: {
          qualityWeight: 35,
          deliveryWeight: 25,
          priceCompetitivenessWeight: 20,
          complianceWeight: 10,
          responsivenessWeight: 10,
        },
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.data.weights.qualityWeight, 35);
  });

  // ── 7. Supplier Dependency & Single-Source Concentration ──────────────────
  await t.test('7. Dependency Risk detects single-source items neutrally without fraud accusations', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/supplier-intelligence/dependency-risk',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    assert.equal(res.status, 200);
    const data = res.data.data;
    assert.ok(data.totalActiveSuppliers >= 2);
    assert.ok(typeof data.top3ConcentrationPercent === 'number');
    assert.ok(data.singleSourceItems.some((i) => i.itemCode === 'RAW-COFFEE-ROBUSTA'));
  });

  // ── 8. Procurement Analytics ──────────────────────────────────────────────
  await t.test('8. Procurement Analytics aggregates spend, categories and top suppliers', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/supplier-intelligence/analytics',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    assert.equal(res.status, 200);
    assert.ok(res.data.data.totalSpendRupees > 0);
    assert.ok(res.data.data.topVendors.length > 0);
  });

  // ── 9. Supplier Action Plan (CAPA) Lifecycle ──────────────────────────────
  await t.test('9. Register and update Supplier Corrective Action Plan', async () => {
    const resCreate = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/supplier-intelligence/action-plans',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        actionId: 'ACT-SUP-001',
        vendorId: 'VEN-0001',
        title: 'Cold-chain temperature logging calibration',
        finding: 'Temperature variance observed on morning milk delivery',
        actionRequired: 'Provide calibrated data logger logs on next 5 dispatches',
        category: 'QUALITY_DEFECT',
        dueDate: new Date(Date.now() + 7 * 86400000),
      },
    });

    assert.equal(resCreate.status, 201);
    assert.equal(resCreate.data.data.status, 'OPEN');

    // Update status to VERIFIED
    const resUpdate = await makeRequest({
      port,
      method: 'PATCH',
      path: '/api/v1/supplier-intelligence/action-plans/ACT-SUP-001/status',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: {
        status: 'VERIFIED',
        evidenceNotes: 'Received certified calibration certificate from vendor laboratory',
      },
    });

    assert.equal(resUpdate.status, 200);
    assert.equal(resUpdate.data.data.status, 'VERIFIED');
    assert.ok(resUpdate.data.data.verifiedBy);
  });

  // ── 10. Multi-Tenant IDOR Protection ──────────────────────────────────────
  await t.test('10. Multi-Tenant IDOR: Foreign organisation denied access to supplier dossier', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/supplier-intelligence/suppliers/VEN-0001/360',
      headers: { Authorization: `Bearer ${foreignToken}` },
    });

    assert.equal(res.status, 404);
  });
});
