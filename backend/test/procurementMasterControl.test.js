'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/server');
const { PurchaseOrder } = require('../src/models/PurchaseOrder');
const { GlobalInventoryItem } = require('../src/models/GlobalInventoryItem');
const { CafeInventoryConfig } = require('../src/models/CafeInventoryConfig');
const { StockMovement } = require('../src/models/StockMovement');
const { Vendor } = require('../src/models/Vendor');
const { User } = require('../src/models/User');
const { AuditEvent } = require('../src/models/AuditEvent');
const { RolePermission } = require('../src/models/RolePermission');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { PurchaseRequisition } = require('../src/models/PurchaseRequisition');
const { InventoryLot } = require('../src/models/InventoryLot');
const authService = require('../src/services/authService');
const auditService = require('../src/services/auditService');

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

test('SCR-020: Procurement Master Control & Source-to-Pay Integration Suite', async (t) => {
  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = server.address().port;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const primaryMasterUser = {
    userId: 'MU-PRIMARY-01',
    role: 'MASTER',
    isPrimaryMaster: true,
    organisationId: 'ORG-ZAMORIN',
    email: 'primary@zamorincafe.com',
    fullName: 'Primary Master',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
    accountStatus: 'ACTIVE',
  };

  const ownerUser = {
    userId: 'OU-OWNER-01',
    role: 'OWNER',
    organisationId: 'ORG-ZAMORIN',
    email: 'owner@zamorincafe.com',
    fullName: 'Owner User',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
    accountStatus: 'ACTIVE',
  };

  const staffUser = {
    userId: 'SU-STAFF-01',
    role: 'STAFF',
    organisationId: 'ORG-ZAMORIN',
    email: 'staff@zamorincafe.com',
    fullName: 'Staff User',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001'],
    accountStatus: 'ACTIVE',
  };

  t.mock.method(authService, 'verifyAccessToken', async (token) => {
    if (token === 'token_owner') {
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
    if (token === 'token_staff') {
      return {
        payload: {
          sub: staffUser.userId,
          org: staffUser.organisationId,
          role: staffUser.role,
          email: staffUser.email,
          name: staffUser.fullName,
          assignedCafeIds: staffUser.assignedCafeIds,
          sv: 0,
          usv: 1,
          pv: 1,
          sid: 'SS-STAFF-01',
        },
        session: {
          sessionId: 'SS-STAFF-01',
          roleSnapshot: staffUser.role,
          sessionVersion: 0,
          mfaVerified: true,
          stepUpVerifiedAt: new Date().toISOString(),
        },
      };
    }
    return {
      payload: {
        sub: primaryMasterUser.userId,
        org: primaryMasterUser.organisationId,
        role: primaryMasterUser.role,
        email: primaryMasterUser.email,
        name: primaryMasterUser.fullName,
        isPrimaryMaster: true,
        assignedCafeIds: primaryMasterUser.assignedCafeIds,
        sv: 0,
        usv: 1,
        pv: 1,
        sid: 'SS-MASTER-01',
      },
      session: {
        sessionId: 'SS-MASTER-01',
        roleSnapshot: primaryMasterUser.role,
        sessionVersion: 0,
        mfaVerified: true,
        stepUpVerifiedAt: new Date().toISOString(),
      },
    };
  });

  t.mock.method(User, 'findOne', async (query) => {
    if (query?.userId === 'OU-OWNER-01') return ownerUser;
    if (query?.userId === 'SU-STAFF-01') return staffUser;
    return primaryMasterUser;
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

  t.mock.method(auditService, 'recordRequestAudit', async () => ({}));
  t.mock.method(auditService, 'recordAuditEvent', async () => ({}));

  SequenceCounter.generateId = async function (opts) {
    if (typeof opts === 'string') return `${opts}-2026-0001`;
    const pfx = opts?.prefix || 'PO-20260820';
    return `${pfx}-0001`;
  };
  t.mock.method(SequenceCounter, 'generateId', SequenceCounter.generateId);
  t.mock.method(SequenceCounter, 'getNextNumber', async () => 1);

  // Mock in-memory state
  const mockOrders = [];
  let currentStock = 100;

  const sampleVendor = {
    vendorId: 'VEND-0001',
    organisationId: 'ORG-ZAMORIN',
    legalName: 'Wayanad Organic Estates',
    name: 'Wayanad Organic Estates',
    status: 'ACTIVE',
  };

  t.mock.method(Vendor, 'findOne', () => ({
    lean: async () => sampleVendor,
  }));

  const sampleItems = [
    {
      itemId: 'ITM-COF-01',
      organisationId: 'ORG-ZAMORIN',
      sku: 'SKU-COF-01',
      name: 'Arabica Green Beans',
      baseUnit: 'kg',
      costPricePaisa: 62000,
      status: 'ACTIVE',
    },
  ];

  t.mock.method(GlobalInventoryItem, 'find', () => ({
    lean: async () => sampleItems,
  }));

  t.mock.method(CafeInventoryConfig, 'findOne', async () => ({
    cafeId: 'ZC-0001',
    itemId: 'ITM-COF-01',
    organisationId: 'ORG-ZAMORIN',
    currentQuantityBase: currentStock,
  }));

  t.mock.method(CafeInventoryConfig, 'find', async () => [
    {
      cafeId: 'ZC-0001',
      itemId: 'ITM-COF-01',
      organisationId: 'ORG-ZAMORIN',
      currentQuantityBase: currentStock,
    },
  ]);

  t.mock.method(CafeInventoryConfig, 'findOneAndUpdate', async (filter, update) => {
    if (update.$inc?.currentQuantityBase) {
      currentStock += update.$inc.currentQuantityBase;
    }
    return {
      cafeId: 'ZC-0001',
      itemId: 'ITM-COF-01',
      currentQuantityBase: currentStock,
    };
  });

  t.mock.method(AuditEvent, 'create', async (data) => data);
  AuditEvent.prototype.save = async function () { return this; };
  t.mock.method(StockMovement, 'create', async (movement) => movement);
  StockMovement.prototype.save = async function () { return this; };
  t.mock.method(InventoryLot, 'create', async (data) => data);
  InventoryLot.prototype.save = async function () { return this; };

  PurchaseOrder.prototype.save = async function () {
    const existingIndex = mockOrders.findIndex((o) => o.purchaseOrderId === this.purchaseOrderId);
    if (existingIndex >= 0) {
      mockOrders[existingIndex] = this;
    } else {
      mockOrders.push(this);
    }
    return this;
  };

  t.mock.method(PurchaseOrder, 'find', () => ({
    lean: async () => mockOrders.map((o) => (o.toObject ? o.toObject() : o)),
    skip: () => ({
      limit: () => ({
        lean: async () => mockOrders.map((o) => (o.toObject ? o.toObject() : o)),
      }),
    }),
  }));

  t.mock.method(PurchaseOrder, 'findOne', async (query) => {
    const match = mockOrders.find((o) => o.purchaseOrderId === query.purchaseOrderId);
    if (!match) return null;
    return match;
  });

  t.mock.method(PurchaseOrder, 'countDocuments', async () => mockOrders.length);

  const mockRequisitions = [];
  PurchaseRequisition.prototype.save = async function () {
    mockRequisitions.push(this);
    return this;
  };
  t.mock.method(PurchaseRequisition, 'findOne', async (query) => {
    return mockRequisitions.find((r) => r.requisitionId === query?.requisitionId) || null;
  });

  let createdPoId = null;

  await t.test('1. GET /api/v1/procurement/overview returns headline KPIs for Master', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/procurement/overview',
      headers: { Authorization: 'Bearer token_master' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.kpis);
    assert.ok(typeof res.data.data.kpis.openOrdersCount === 'number');
    assert.ok(typeof res.data.data.kpis.openCommitmentPaise === 'number');
  });

  await t.test('2. GET /api/v1/procurement/overview is accessible to OWNER', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/procurement/overview',
      headers: { Authorization: 'Bearer token_owner' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
  });

  await t.test('3. STAFF is strictly forbidden (403) from Procurement endpoints', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/procurement/overview',
      headers: { Authorization: 'Bearer token_staff' },
    });

    assert.equal(res.status, 403);
  });

  await t.test('4. POST /api/v1/procurement/requisitions creates an internal demand PRQ', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/procurement/requisitions',
      headers: { Authorization: 'Bearer token_master' },
      body: {
        title: 'Specialty Cold Brew Beans Q3',
        cafeId: 'ZC-0001',
        priority: 'HIGH',
        estimatedAmountPaise: 3500000,
        notes: 'Required for peak summer cold brew launch',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.requisition.requisitionId.startsWith('PRQ'));
    assert.equal(res.data.data.requisition.estimatedAmountPaise, 3500000);
  });

  await t.test('5. POST /api/v1/procurement/orders creates a PO with server-calculated integer paise total', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/procurement/orders',
      headers: { Authorization: 'Bearer token_master' },
      body: {
        vendorId: 'VEND-0001',
        cafeId: 'ZC-0001',
        lineItems: [
          {
            itemId: 'ITM-COF-01',
            orderedQuantityBase: 50,
            unitPricePaisa: 62000, // ₹620/kg
            baseUnit: 'kg',
          },
        ],
        notes: 'Fresh crop delivery',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    createdPoId = res.data.data.order.purchaseOrderId;
    assert.ok(createdPoId.startsWith('PO-'));
    assert.equal(res.data.data.order.totalPaisa || res.data.data.order.totalAmountPaisa, 3100000); // 50 * 62000 = 3,100,000 paise (₹31,000)
    assert.equal(res.data.data.order.status, 'DRAFT');
  });

  await t.test('6. POST /api/v1/procurement/orders/:id/submit transitions to SUBMITTED', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/procurement/orders/${createdPoId}/submit`,
      headers: { Authorization: 'Bearer token_master' },
      body: {},
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.order.status, 'SUBMITTED');
  });

  await t.test('7. POST /api/v1/procurement/orders/:id/approve transitions to APPROVED', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/procurement/orders/${createdPoId}/approve`,
      headers: { Authorization: 'Bearer token_master' },
      body: {},
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.order.status, 'APPROVED');
  });

  await t.test('8. POST /api/v1/procurement/orders/:id/order marks order as sent to vendor', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/procurement/orders/${createdPoId}/order`,
      headers: { Authorization: 'Bearer token_master' },
      body: {},
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.order.status, 'ORDERED');
  });

  await t.test('9. POST /api/v1/procurement/orders/:id/receive records GRN and increments stock', async () => {
    const initialQty = currentStock;

    const res = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/procurement/orders/${createdPoId}/receive`,
      headers: { Authorization: 'Bearer token_master' },
      body: {
        deliveries: [
          {
            itemId: 'ITM-COF-01',
            quantityReceived: 50,
          },
        ],
        deliveryNote: 'DN-WOE-9941',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.order.status, 'RECEIVED');
    assert.equal(currentStock, initialQty + 50);
  });

  await t.test('10. GET /api/v1/procurement/integrity performs 16-point audit verification', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/procurement/integrity',
      headers: { Authorization: 'Bearer token_master' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.status, 'CERTIFIED_INTEGRITY');
    assert.equal(res.data.data.totalChecks, 16);
    assert.equal(res.data.data.passedChecks, 16);
  });
});
