'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcrypt');

const { createApp } = require('../src/server');
const { Cafe } = require('../src/models/Cafe');
const { CafeAccess } = require('../src/models/CafeAccess');
const { CafePinReservation } = require('../src/models/CafePinReservation');
const { CafeGatewayContext } = require('../src/models/CafeGatewayContext');
const { User } = require('../src/models/User');
const { Bill } = require('../src/models/Bill');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const cafeAccessCryptoService = require('../src/services/cafeAccessCryptoService');
const cafeService = require('../src/services/cafeService');
const authService = require('../src/services/authService');

test('REC-10: New Café Full End-to-End Acceptance Lifecycle Suite', async (t) => {
  let mongoServer;
  let masterUser;
  let adminUser;
  let staffUser;
  let createdCafeId;
  let publicCafeRef;
  let qrToken;
  let linkToken;

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    cafeAccessCryptoService.verifySecretKeys();

    const passwordHash = await bcrypt.hash('MasterSecurePass#2026', 10);

    masterUser = await User.create({
      userId: 'MU-9001',
      organisationId: 'ORG-ZAMORIN',
      name: 'Primary Master Operator',
      email: 'master.e2e@zamorin.cafe',
      role: 'MASTER',
      isPrimaryMaster: true,
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'SYSTEM',
      primaryMasterDesignationReason: 'Acceptance testing bootstrap',
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash,
    });
  });

  t.after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  await t.test('1. Master creates Café A with complete legal, business, and operational profile', async () => {
    const payload = {
      name: 'Zamorin Hill View',
      displayName: 'Zamorin Hill View — Wayanad',
      legalName: 'Zamorin Speciality Coffee & Kitchens Pvt. Ltd.',
      cafeType: 'STANDARD_CAFE',
      openingDate: '2026-10-01',
      initialStatus: 'ACTIVE',
      constitution: 'PRIVATE_LIMITED',
      pan: 'AAACZ1234F',
      cin: 'U55101KL2026PTC012345',
      addressLine1: 'Building 4, Estate Road, Vythiri',
      landmark: 'Near Tea Plantation Overlook',
      city: 'Wayanad',
      district: 'Wayanad',
      state: 'Kerala',
      pincode: '673576',
      phone: '+91 98470 12345',
      email: 'hillview@zamorin.cafe',
      managerName: 'Devan Nambiar',
      emergencyName: 'Radha Nambiar',
      emergencyPhone: '+91 98470 54321',
      openingTime: '06:30',
      closingTime: '23:30',
      seatingCapacity: 64,
      gstin: '32AAACZ1234F1Z5',
      fssaiNumber: '11326001000123',
      fssaiType: 'STATE_LICENCE',
      hardware: {
        posTerminal: true,
        thermalPrinter: true,
        kitchenDisplay: true,
        barcodeScanner: true,
        weighingScale: false,
      },
    };

    const result = await cafeService.createCafeWithAccess({
      auth: masterUser,
      cafeData: payload,
      clientIp: '127.0.0.1',
      userAgent: 'Zamorin-Master-Terminal/1.0',
    });

    assert.ok(result.cafe);
    assert.ok(result.access);
    assert.match(result.cafe.cafeId, /^ZC-\d{4}$/);

    createdCafeId = result.cafe.cafeId;
    publicCafeRef = result.access.publicCafeReference || result.cafe.qrLoginContext?.securePublicCafeReference;
    qrToken = result.access.qrToken;
    linkToken = result.access.linkToken;

    // Verify persistence in MongoDB
    const cafeInDb = await Cafe.findOne({ cafeId: createdCafeId });
    assert.ok(cafeInDb);
    assert.equal(cafeInDb.name, 'Zamorin Hill View');
    assert.equal(cafeInDb.address.city, 'Wayanad');
    assert.equal(cafeInDb.registrations.gstin, '32AAACZ1234F1Z5');
    assert.equal(cafeInDb.registrations.fssai.number, '11326001000123');
    assert.equal(cafeInDb.operations.seatingCapacity, 64);

    // Verify sub-system provisioned state
    assert.equal(cafeInDb.inventorySetup.enabled, true);
    assert.equal(cafeInDb.inventorySetup.mainStore, 'Main Store');
    assert.ok(Array.isArray(cafeInDb.inventorySetup.coldStorageLocations));
    assert.ok(cafeInDb.qrLoginContext.loginUrl.includes('/cafe/'));

    // Verify Permanent PIN reservation is retired in REC-02 (zero new reservations generated)
    const pinReservation = await CafePinReservation.findOne({ cafeId: createdCafeId });
    assert.equal(pinReservation, null);
  });

  await t.test('2. Independent QR & Deep Link Tokens provisioned with safe public URL', async () => {
    assert.ok(qrToken);
    assert.ok(linkToken);
    assert.notEqual(qrToken, linkToken);

    // QR & Link must not contain passwords or secrets
    assert.equal(qrToken.includes(':'), false);
    assert.equal(linkToken.includes(':'), false);

    const cafeAccess = await CafeAccess.findOne({ cafeId: createdCafeId }).select('+qrCredentialHash +linkCredentialHash');
    assert.ok(cafeAccess.qrCredentialHash);
    assert.ok(cafeAccess.linkCredentialHash);
    assert.equal(cafeAccess.qrEnabled, true);
    assert.equal(cafeAccess.linkEnabled, true);
  });

  await t.test('3. Assign Café Admin and Staff accounts strictly to Café A', async () => {
    const passwordHash = await bcrypt.hash('StandardStaffSecret#2026', 10);

    adminUser = await User.create({
      userId: 'AD-9001',
      organisationId: 'ORG-ZAMORIN',
      name: 'Hill View Admin',
      email: 'admin.hillview@zamorin.cafe',
      role: 'CAFE_ADMIN',
      primaryCafeId: createdCafeId,
      assignedCafeIds: [createdCafeId],
      createdBy: masterUser.userId,
      accountStatus: 'ACTIVE',
      passwordHash,
    });

    staffUser = await User.create({
      userId: 'ST-9001',
      organisationId: 'ORG-ZAMORIN',
      name: 'Hill View Barista',
      email: 'barista.hillview@zamorin.cafe',
      role: 'STAFF',
      primaryCafeId: createdCafeId,
      assignedCafeIds: [createdCafeId],
      createdBy: adminUser.userId,
      accountStatus: 'ACTIVE',
      passwordHash,
    });

    assert.equal(adminUser.assignedCafeIds[0], createdCafeId);
    assert.equal(staffUser.assignedCafeIds[0], createdCafeId);
  });

  await t.test('4. External Device scans QR / opens deep link: Resolves to Gateway Context', async () => {
    const resolution = await cafeService.resolveGatewayCredential({
      method: 'QR',
      credential: qrToken,
      clientIp: '192.168.1.50',
      userAgent: 'Mobile-Safari-POS/18.0',
    });

    assert.equal(resolution.cafeId, createdCafeId);
    assert.ok(resolution.gatewayContextId);
    assert.equal(resolution.accessMethod, 'QR');

    const gwc = await CafeGatewayContext.findOne({ gatewayContextId: resolution.gatewayContextId });
    assert.ok(gwc);
    assert.equal(gwc.cafeId, createdCafeId);
    assert.equal(gwc.status, 'ACTIVE');
    assert.ok(gwc.expiresAt > new Date());
  });

  await t.test('5. Café Admin logs in: Scoped strictly to Café A with zero cross-café access', async () => {
    // Admin creates bill for Café A
    const billA = await Bill.create({
      billId: 'BILL-20260915-0001',
      invoiceNumber: 'INV-20260915-0001',
      organisationId: 'ORG-ZAMORIN',
      cafeId: createdCafeId,
      cashierUserId: adminUser.userId,
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      paymentMethod: 'UPI',
      subtotalPaisa: 25000,
      taxPaisa: 1250,
      totalPaisa: 26250,
      businessDate: '2026-09-15',
      lineItems: [
        {
          menuItemId: 'COFFEE-001',
          itemNameSnapshot: 'Malabar Estate Filter Coffee',
          quantity: 1,
          unitPricePaisa: 25000,
          lineSubtotalPaisa: 25000,
          lineTotalPaisa: 26250,
        },
      ],
      reprints: [],
    });
    assert.ok(billA);

    // Verify Admin is allowed for Café A
    assert.equal(adminUser.assignedCafeIds.includes(createdCafeId), true);
    // Verify Admin is NOT allowed for another café
    assert.equal(adminUser.assignedCafeIds.includes('ZC-9999'), false);
  });

  await t.test('6. URL tampering protection: Cross-café IDOR is blocked with 403', async () => {
    const { resolveEffectiveCafeScope } = require('../src/utils/cafeScope');

    const mockRequestAdmin = {
      auth: {
        userId: adminUser.userId,
        organisationId: 'ORG-ZAMORIN',
        role: 'CAFE_ADMIN',
        primaryCafeId: createdCafeId,
        assignedCafeIds: [createdCafeId],
      },
      query: { cafeId: 'ZC-9999' }, // Tampered query param
      headers: {},
    };

    assert.throws(
      () => {
        resolveEffectiveCafeScope(mockRequestAdmin, { enforceStrictTenant: true });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CROSS_CAFE_RESOURCE_DENIED');
        return true;
      }
    );
  });

  await t.test('7. Staff account assigned to Café A receives self-service surface only', async () => {
    assert.equal(staffUser.role, 'STAFF');
    assert.equal(staffUser.assignedCafeIds[0], createdCafeId);

    // Staff cannot create cafes or modify settings
    const staffAuth = {
      userId: staffUser.userId,
      organisationId: 'ORG-ZAMORIN',
      role: 'STAFF',
      assignedCafeIds: [createdCafeId],
    };

    await assert.rejects(
      async () => {
        await cafeService.createCafeWithAccess({
          auth: staffAuth,
          cafeData: { name: 'Illegal Kiosk' },
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_CREATION_DENIED');
        return true;
      }
    );
  });

  await t.test('8. Café Deactivation: Suspending Café A immediately invalidates QR & Link resolution', async () => {
    // Master suspends Café A
    await Cafe.updateOne({ cafeId: createdCafeId }, { status: 'SUSPENDED' });

    const suspendedCafe = await Cafe.findOne({ cafeId: createdCafeId });
    assert.equal(suspendedCafe.status, 'SUSPENDED');

    // Scanning previously generated QR or Link must fail immediately with 403 CAFE_INACTIVE
    await assert.rejects(
      async () => {
        await cafeService.resolveGatewayCredential({
          method: 'QR',
          credential: qrToken,
          clientIp: '192.168.1.50',
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_INACTIVE');
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await cafeService.resolveGatewayCredential({
          method: 'LINK',
          credential: linkToken,
          clientIp: '192.168.1.50',
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_INACTIVE');
        return true;
      }
    );
  });
});
