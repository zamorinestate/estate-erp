'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/server');
const { QualityChecklist } = require('../src/models/QualityChecklist');
const { User } = require('../src/models/User');
const { AuditEvent } = require('../src/models/AuditEvent');
const { RolePermission } = require('../src/models/RolePermission');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const authService = require('../src/services/authService');
const auditService = require('../src/services/auditService');
const { FoodSafetyService } = require('../src/services/foodSafetyService');
const { InventoryLot } = require('../src/models/InventoryLot');
const { CapaRecord } = require('../src/models/CapaRecord');
const { QualityHold } = require('../src/models/QualityHold');
const { QualityNonConformance } = require('../src/models/QualityNonConformance');

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

test('SCR-021: Quality & Compliance Master Control & FSMS Integration Suite', async (t) => {
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

  let qualityAuditCounter = 0;
  t.mock.method(auditService, 'recordRequestAudit', async () => ({
    auditEventId: `AUD-QUALITY-TEST-${++qualityAuditCounter}`,
  }));
  t.mock.method(auditService, 'recordAuditEvent', async () => ({
    auditEventId: `AUD-QUALITY-EVENT-${++qualityAuditCounter}`,
  }));
  t.mock.method(AuditEvent, 'create', async (data) => data);
  AuditEvent.prototype.save = async function () { return this; };

  t.mock.method(FoodSafetyService, 'recordTemperature', async (payload) => ({
    logId: 'TEMP-TEST-0001',
    organisationId: payload.organisationId,
    cafeId: payload.cafeId,
    monitoringPoint: payload.monitoringPoint,
    equipmentId: payload.equipmentId,
    equipmentName: payload.equipmentName,
    readingCelsius: payload.readingCelsius,
    minimumAllowedCelsius: payload.minimumAllowedCelsius,
    maximumAllowedCelsius: payload.maximumAllowedCelsius,
    isExcursion:
      payload.readingCelsius < payload.minimumAllowedCelsius ||
      payload.readingCelsius > payload.maximumAllowedCelsius,
    status:
      payload.readingCelsius < payload.minimumAllowedCelsius ||
      payload.readingCelsius > payload.maximumAllowedCelsius
        ? 'OUT_OF_RANGE'
        : 'WITHIN_RANGE',
    recordedByUserId: payload.recordedByUserId,
    recordedAt: new Date(),
  }));

  SequenceCounter.generateId = async function (opts) {
    if (typeof opts === 'string') return `${opts}-2026-0001`;
    const pfx = opts?.prefix || 'QC';
    return `${pfx}-2026-0001`;
  };
  t.mock.method(SequenceCounter, 'generateId', SequenceCounter.generateId);
  t.mock.method(SequenceCounter, 'getNextNumber', async () => 1);

  const mockChecklists = [];
  t.mock.method(QualityChecklist, 'find', (query) => {
    let results = [...mockChecklists];
    if (query?.organisationId) {
      results = results.filter((c) => c.organisationId === query.organisationId);
    }
    return {
      select: () => ({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: async () => results,
            }),
          }),
        }),
      }),
      sort: () => ({
        limit: () => ({
          lean: async () => results,
        }),
      }),
    };
  });

  t.mock.method(QualityChecklist, 'countDocuments', async () => mockChecklists.length);
  QualityChecklist.prototype.save = async function () {
    mockChecklists.push(this.toObject());
    return this;
  };

  const mockLots = [{
    _id: 'LOT-MONGO-1',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    lotId: 'LOT-20260820-CREAM',
    supplierLot: 'SUP-CREAM-20260820',
    itemId: 'SKU-CREAM',
    vendorId: 'VEN-TEST-01',
    procurementReference: 'PO-TEST-CREAM-01',
    unit: 'L',
    initialQuantity: 12,
    quantityBase: 12,
    remainingQuantity: 12,
    status: 'AVAILABLE',
    quarantineReason: '',
    quarantineDate: null,
    quarantinedByUserId: null,
    releaseReason: '',
    releaseDate: null,
    releasedByUserId: null,
    dispositionStatus: 'NONE',
    dispositionReason: '',
    dispositionDate: null,
    dispositionByUserId: null,
  }];

  const matchesLot = (lot, query = {}) => {
    if (query.organisationId && lot.organisationId !== query.organisationId) return false;
    if (query.cafeId && typeof query.cafeId === 'string' && lot.cafeId !== query.cafeId) return false;
    if (query.lotId && lot.lotId !== query.lotId) return false;
    if (query.status && typeof query.status === 'string' && lot.status !== query.status) return false;
    if (query.status?.$in && !query.status.$in.includes(lot.status)) return false;
    if (query.$or) {
      const matched = query.$or.some((clause) =>
        (clause.lotId && lot.lotId === clause.lotId) ||
        (clause.supplierLot && lot.supplierLot === clause.supplierLot)
      );
      if (!matched) return false;
    }
    return true;
  };

  t.mock.method(InventoryLot, 'findOne', (query) => ({
    lean: async () => mockLots.find((lot) => matchesLot(lot, query)) || null,
  }));
  t.mock.method(InventoryLot, 'find', (query) => ({
    sort() { return this; },
    limit() { return this; },
    lean: async () => mockLots.filter((lot) => matchesLot(lot, query)),
  }));
  t.mock.method(InventoryLot, 'findOneAndUpdate', async (filter, update) => {
    const lot = mockLots.find((entry) => matchesLot(entry, filter));
    if (!lot) return null;
    Object.assign(lot, update?.$set || {});
    return { ...lot };
  });
  t.mock.method(InventoryLot, 'countDocuments', async (query) =>
    mockLots.filter((lot) => matchesLot(lot, query)).length
  );

  const mockHolds = [];
  const matchesScoped = (entry, query = {}) => {
    if (query.organisationId && entry.organisationId !== query.organisationId) return false;
    if (query.cafeId && typeof query.cafeId === 'string' && entry.cafeId !== query.cafeId) return false;
    if (query.cafeId?.$in && !query.cafeId.$in.includes(entry.cafeId)) return false;
    return true;
  };

  const matchesHold = (hold, query = {}) => {
    if (!matchesScoped(hold, query)) return false;
    if (query.holdId && hold.holdId !== query.holdId) return false;
    if (query.inventoryLotId && hold.inventoryLotId !== query.inventoryLotId) return false;
    if (query.status && typeof query.status === 'string' && hold.status !== query.status) return false;
    if (query.status?.$ne && hold.status === query.status.$ne) return false;
    return true;
  };

  t.mock.method(QualityHold, 'find', (query) => ({
    sort() { return this; },
    limit() { return this; },
    lean: async () => mockHolds.filter((hold) => matchesHold(hold, query)).map((hold) => hold.toObject()),
  }));
  t.mock.method(QualityHold, 'findOne', async (query) =>
    mockHolds.find((hold) => matchesHold(hold, query)) || null
  );
  QualityHold.prototype.save = async function () {
    const idx = mockHolds.findIndex((hold) => hold.holdId === this.holdId);
    if (idx >= 0) mockHolds[idx] = this;
    else mockHolds.push(this);
    return this;
  };

  const mockNcrs = [];
  const matchesNcr = (ncr, query = {}) => {
    if (!matchesScoped(ncr, query)) return false;
    if (query.ncrId && ncr.ncrId !== query.ncrId) return false;
    if (query.status && typeof query.status === 'string' && ncr.status !== query.status) return false;
    if (query.status?.$ne && ncr.status === query.status.$ne) return false;
    return true;
  };

  t.mock.method(QualityNonConformance, 'find', (query) => ({
    sort() { return this; },
    limit() { return this; },
    lean: async () => mockNcrs.filter((ncr) => matchesNcr(ncr, query)).map((ncr) => ncr.toObject()),
  }));
  t.mock.method(QualityNonConformance, 'findOne', async (query) =>
    mockNcrs.find((ncr) => matchesNcr(ncr, query)) || null
  );
  QualityNonConformance.prototype.save = async function () {
    const idx = mockNcrs.findIndex((ncr) => ncr.ncrId === this.ncrId);
    if (idx >= 0) mockNcrs[idx] = this;
    else mockNcrs.push(this);
    return this;
  };

  const mockCapas = [];
  const matchesCapa = (capa, query = {}) => {
    if (!matchesScoped(capa, query)) return false;
    if (query.capaId && capa.capaId !== query.capaId) return false;
    if (query.status && typeof query.status === 'string' && capa.status !== query.status) return false;
    if (query.status?.$ne && capa.status === query.status.$ne) return false;
    return true;
  };

  t.mock.method(CapaRecord, 'find', (query) => ({
    sort() { return this; },
    limit() { return this; },
    lean: async () => mockCapas.filter((capa) => matchesCapa(capa, query)).map((capa) => capa.toObject()),
  }));
  t.mock.method(CapaRecord, 'findOne', async (query) =>
    mockCapas.find((capa) => matchesCapa(capa, query)) || null
  );
  CapaRecord.prototype.save = async function () {
    const idx = mockCapas.findIndex((capa) => capa.capaId === this.capaId);
    if (idx >= 0) mockCapas[idx] = this;
    else mockCapas.push(this);
    return this;
  };
  t.mock.method(CapaRecord, 'countDocuments', async (query) =>
    mockCapas.filter((capa) => matchesCapa(capa, query)).length
  );

  const masterHeaders = {
    Authorization: 'Bearer token_master',
    'x-device-id': 'DEV-MASTER-01',
  };

  const ownerHeaders = {
    Authorization: 'Bearer token_owner',
    'x-device-id': 'DEV-OWNER-01',
  };

  const staffHeaders = {
    Authorization: 'Bearer token_staff',
    'x-device-id': 'DEV-STAFF-01',
  };

  await t.test('1. GET /api/v1/quality/overview returns headline KPIs for Master', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/quality/overview',
      headers: masterHeaders,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.kpis.checksDueToday, null);
    assert.equal(
      res.data.data.kpis.checksDueTodayStatus,
      'NOT_AVAILABLE_NO_DURABLE_TEMPLATE_SCHEDULE_ENGINE'
    );
    assert.ok(Array.isArray(res.data.data.actionCentreItems));
    assert.equal(res.data.data.prpStatus.cleaningSanitation, 'NOT_ASSESSED');
    assert.equal(res.data.data.sourceStatus.qualityHolds, 'DURABLE');
    assert.equal(res.data.data.sourceStatus.ncrs, 'DURABLE');
    assert.equal(res.data.data.sourceStatus.capas, 'DURABLE');
  });

  await t.test('2. GET /api/v1/quality/overview is accessible to OWNER', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/quality/overview',
      headers: ownerHeaders,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
  });

  await t.test('3. STAFF is strictly forbidden (403) from Quality endpoints', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/quality/overview',
      headers: staffHeaders,
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.error.code, 'ROLE_NOT_ALLOWED');
  });

  await t.test('4. POST /api/v1/quality/checklists submits an inspection with evaluation', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/quality/checklists',
      headers: masterHeaders,
      body: {
        cafeId: 'ZC-0001',
        title: 'Opening Hygiene & Food Safety Readiness',
        frequency: 'DAILY',
        templateId: 'QC-TMPL-OPEN-01',
        templateVersion: 'v2.4',
        items: [
          { itemName: 'Uniforms clean & hair restraints worn', isPassed: true },
          { itemName: 'Handwash stations stocked', isPassed: true },
          { itemName: 'Chiller temperature measured at 3.2°C', isPassed: true },
        ],
        overallResult: 'PASSED',
        actionRequired: 'All opening checkpoints verified clear.',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.checklist.checklistId.startsWith('QC-'));
    assert.equal(res.data.data.checklist.overallResult, 'PASSED');
  });

  await t.test('5. GET /api/v1/quality/templates returns standard versioned templates', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/quality/templates',
      headers: masterHeaders,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.templates.length >= 4);
    assert.ok(res.data.data.templates.some((t) => t.templateId === 'QC-TMPL-OPEN-01'));
  });

  await t.test('6. POST /api/v1/quality/temperatures records reading and flags excursion', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/quality/temperatures',
      headers: masterHeaders,
      body: {
        cafeId: 'ZC-0001',
        assetId: 'AST-CHILL-01',
        assetName: 'Main Chiller #1',
        location: 'Espresso Bar',
        readingCelsius: 7.5,
        expectedMinCelsius: 1.0,
        expectedMaxCelsius: 4.0,
        notes: 'Door left open during morning delivery replenishment.',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.temperature.isExcursion, true);
    assert.equal(res.data.data.temperature.readingCelsius, 7.5);
  });

  await t.test('7. POST /api/v1/quality/holds places lot in quarantine and releases with disposition', async () => {
    const createRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/quality/holds',
      headers: masterHeaders,
      body: {
        cafeId: 'ZC-0001',
        lotNumber: 'LOT-20260820-CREAM',
        itemName: 'Whipping Cream (12L)',
        quantityHeld: 12,
        unit: 'L',
        reason: 'TEMPERATURE_DEVIATION',
        description: 'Excursion detected on display fridge.',
      },
    });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.data.success, true);
    const holdId = createRes.data.data.hold.holdId;
    assert.ok(holdId.startsWith('QHOLD-'));

    // Release hold
    const releaseRes = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/quality/holds/${holdId}/release`,
      headers: masterHeaders,
      body: {
        disposition: 'RELEASE',
        dispositionNotes: 'Acidity test passed; cleared by quality manager.',
      },
    });

    assert.equal(releaseRes.status, 200);
    assert.equal(releaseRes.data.data.hold.status, 'RELEASED');
    assert.equal(releaseRes.data.data.hold.disposition, 'RELEASE');
  });

  await t.test('8. POST /api/v1/quality/ncrs creates Non-Conformance Report', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/quality/ncrs',
      headers: masterHeaders,
      body: {
        cafeId: 'ZC-0001',
        title: 'Supplier Packaging Damaged on Coffee Bean Delivery',
        source: 'RECEIVING_INSPECTION',
        severity: 'MAJOR',
        description: 'Two 5kg bags punctured during carrier handling.',
        immediateAction: 'Rejected damaged bags at dock and noted on GRN.',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.ncr.ncrId.startsWith('NCR-'));
    assert.equal(res.data.data.ncr.severity, 'MAJOR');
  });

  await t.test('9. POST /api/v1/quality/capas creates CAPA and verifies effectiveness', async () => {
    const createRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/quality/capas',
      headers: masterHeaders,
      body: {
        cafeId: 'ZC-0001',
        title: 'Carrier Inbound Packaging Reinforcement',
        rootCauseAnalysis: 'Carrier stacking boxes above limit; lack of edge protectors.',
        actionPlan: 'Reject damaged delivery units and enforce reinforced packing on the current vendor lane.',
        preventiveActionPlan: 'Add carrier stacking limits and edge-protector requirements to the approved receiving SOP.',
        targetDate: '2026-10-15',
      },
    });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.data.success, true);
    const capaId = createRes.data.data.capa.capaId;

    // Verify effectiveness to close
    const verifyRes = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/quality/capas/${capaId}/verify`,
      headers: masterHeaders,
      body: {
        effectiveness: 'EFFECTIVE',
        notes: 'Three subsequent deliveries arrived in perfect condition.',
      },
    });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.data.data.capa.status, 'CLOSED');
    assert.equal(verifyRes.data.data.capa.effectivenessStatus, 'EFFECTIVE');
    assert.equal(verifyRes.data.data.capa.durableSource, 'CAPA_RECORD');
  });

  await t.test('10. GET /api/v1/quality/traceability uses the authoritative lot and never fabricates recall readiness', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/quality/traceability?lotNumber=LOT-20260820-CREAM',
      headers: masterHeaders,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.trace.sourceStatus, 'AUTHORITATIVE');
    assert.equal(res.data.data.trace.resolvedLotId, 'LOT-20260820-CREAM');
    assert.equal(res.data.data.trace.backwardTrace.supplierId, 'VEN-TEST-01');
    assert.equal(res.data.data.trace.traceGapCheck.status, 'BACKWARD_TRACE_GAPS_PRESENT');
    assert.equal(res.data.data.trace.recallReadiness.status, 'NOT_ASSESSED');
    assert.equal(res.data.data.trace.recallReadiness.drillElapsedSeconds, null);
  });

  await t.test('11. GET /api/v1/quality/compliance does not return sample licences when authoritative sources are unavailable', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/quality/compliance',
      headers: masterHeaders,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.deepEqual(res.data.data.compliance, []);
    assert.equal(res.data.data.sourceStatus, 'UNAVAILABLE');
  });

  await t.test('12. GET /api/v1/quality/integrity reports partial measured coverage without blanket certification', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/quality/integrity',
      headers: masterHeaders,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.allPassed, false);
    assert.ok(res.data.data.totalChecks >= 10);
    assert.ok(res.data.data.verifiedChecks >= 2);
    assert.ok(res.data.data.coveragePercent > 0);
    assert.ok(res.data.data.coveragePercent < 100);
    assert.ok(res.data.data.checks.some((check) => check.status === 'PASS'));
    assert.ok(res.data.data.checks.some((check) => check.status === 'NOT_VERIFIED'));
  });
});
