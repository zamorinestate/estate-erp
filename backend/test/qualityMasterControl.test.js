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

  const mockCapas = [];
  const matchesCapa = (capa, query = {}) => {
    if (query.organisationId && capa.organisationId !== query.organisationId) return false;
    if (query.cafeId && typeof query.cafeId === 'string' && capa.cafeId !== query.cafeId) return false;
    if (query.capaId && capa.capaId !== query.capaId) return false;
    if (query.status && typeof query.status === 'string' && capa.status !== query.status) return false;
    if (query.status?.$ne && capa.status === query.status.$ne) return false;
    return true;
  };

  t.mock.method(CapaRecord, 'create', async (payload) => {
    const record = {
      _id: `CAPA-MONGO-${mockCapas.length + 1}`,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockCapas.push(record);
    return {
      ...record,
      toObject: () => ({ ...record }),
    };
  });
  t.mock.method(CapaRecord, 'find', (query) => ({
    sort() { return this; },
    limit() { return this; },
    lean: async () => mockCapas.filter((capa) => matchesCapa(capa, query)),
  }));
  t.mock.method(CapaRecord, 'findOne', (query) => ({
    lean: async () => mockCapas.find((capa) => matchesCapa(capa, query)) || null,
  }));
  t.mock.method(CapaRecord, 'findOneAndUpdate', async (filter, update) => {
    const capa = mockCapas.find((entry) => matchesCapa(entry, filter));
    if (!capa) return null;
    Object.assign(capa, update?.$set || {});
    if (update?.$push?.auditHistory) {
      capa.auditHistory = [...(capa.auditHistory || []), update.$push.auditHistory];
    }
    capa.updatedAt = new Date();
    return { ...capa };
  });
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
      'NOT_AVAILABLE_NO_DURABLE_CHECKLIST_SCHEDULE'
    );
    assert.ok(Array.isArray(res.data.data.actionCentreItems));
    assert.equal(res.data.data.prpStatus.cleaningSanitation, 'NOT_ASSESSED');
    assert.equal(res.data.data.sourceStatus.qualityHolds, 'DURABLE_INVENTORY_LOT');
    assert.equal(res.data.data.sourceStatus.capas, 'DURABLE_CAPA_RECORD');
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

  await t.test('10. GET /api/v1/quality/traceability never fabricates trace or recall readiness when source is unavailable', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/quality/traceability?lotNumber=LOT-20260815-MILK',
      headers: masterHeaders,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.trace.sourceStatus, 'UNAVAILABLE');
    assert.equal(res.data.data.trace.backwardTrace, null);
    assert.equal(res.data.data.trace.forwardTrace, null);
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

  await t.test('12. GET /api/v1/quality/integrity never claims 100% PASS without verification coverage', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/quality/integrity',
      headers: masterHeaders,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.integrityScore, null);
    assert.equal(res.data.data.coveragePercent, 0);
    assert.equal(res.data.data.allPassed, false);
    assert.ok(res.data.data.totalChecks >= 10);
    assert.ok(res.data.data.checks.every((check) => check.status === 'NOT_VERIFIED'));
  });
});
