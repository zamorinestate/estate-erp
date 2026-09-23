'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcrypt');

const { Cafe } = require('../src/models/Cafe');
const { CafeAccess } = require('../src/models/CafeAccess');
const { CafePinReservation } = require('../src/models/CafePinReservation');
const { CafeGatewayContext } = require('../src/models/CafeGatewayContext');
const { User } = require('../src/models/User');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const cafeAccessCryptoService = require('../src/services/cafeAccessCryptoService');
const cafeService = require('../src/services/cafeService');

test('Authoritative Cafe Creation & Cafe Access Provisioning Suite', async (t) => {
  let mongoServer;
  let masterUser;
  let normalMasterUser;
  let ownerUser;
  let adminUser;
  let staffUser;

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Ensure crypto secret keys
    cafeAccessCryptoService.verifySecretKeys();

    const passwordHash = await bcrypt.hash('StandardSecurePassword!123', 10);

    masterUser = await User.create({
      userId: 'MU-0001',
      organisationId: 'ZAMORIN',
      name: 'Primary Master User',
      email: 'pm@zamorin.cafe',
      role: 'MASTER',
      isPrimaryMaster: true,
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'SYSTEM',
      primaryMasterDesignationReason: 'Initial bootstrap',
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash,
    });

    normalMasterUser = await User.create({
      userId: 'MU-0002',
      organisationId: 'ZAMORIN',
      name: 'Normal Master User',
      email: 'nm@zamorin.cafe',
      role: 'MASTER',
      isPrimaryMaster: false,
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash,
    });

    ownerUser = await User.create({
      userId: 'OW-0001',
      organisationId: 'ZAMORIN',
      name: 'Executive Owner User',
      email: 'owner@zamorin.cafe',
      role: 'OWNER',
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash,
    });

    adminUser = await User.create({
      userId: 'AD-0001',
      organisationId: 'ZAMORIN',
      name: 'Cafe Admin User',
      email: 'admin@zamorin.cafe',
      role: 'CAFE_ADMIN',
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash,
    });

    staffUser = await User.create({
      userId: 'ST-0001',
      organisationId: 'ZAMORIN',
      name: 'Cafe Staff User',
      email: 'staff@zamorin.cafe',
      role: 'STAFF',
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash,
    });
  });

  t.after(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  await t.test('1. Role Authorization: Primary Master and Normal Master can create cafes; Owner is denied (403)', async () => {
    // 1.1 Primary Master
    const res1 = await cafeService.createCafeWithAccess({
      cafeData: {
        name: 'Kallai Roastery',
        displayName: 'Kallai Flagship',
        cafeType: 'STANDARD_CAFE',
        city: 'Kozhikode',
      },
      auth: masterUser,
    });
    assert.equal(res1.cafe.cafeId, 'ZC-0001');
    assert.equal(res1.access.provisioningStatus, 'READY');
    assert.equal(res1.access.permanentCafePin, null); // Legacy PIN retired in REC-02
    assert.ok(res1.access.qrToken);
    assert.ok(res1.access.linkToken);

    // 1.2 Normal Master
    const res2 = await cafeService.createCafeWithAccess({
      cafeData: {
        name: 'Beach Road Cafe',
        displayName: 'Beach Road',
        cafeType: 'STANDARD_CAFE',
        city: 'Kozhikode',
      },
      auth: normalMasterUser,
    });
    assert.equal(res2.cafe.cafeId, 'ZC-0002');
    assert.equal(res2.access.provisioningStatus, 'READY');

    // 1.3 Owner denied creation under REC-02 Master-only authority
    await assert.rejects(
      async () => {
        await cafeService.createCafeWithAccess({
          cafeData: {
            name: 'Mananchira Square Cafe',
            displayName: 'Mananchira',
            cafeType: 'KIOSK',
            city: 'Kozhikode',
          },
          auth: ownerUser,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_CREATION_DENIED');
        return true;
      }
    );

    // Create ZC-0003 via Master for downstream test fixtures
    const res3 = await cafeService.createCafeWithAccess({
      cafeData: {
        name: 'Mananchira Square Cafe',
        displayName: 'Mananchira',
        cafeType: 'KIOSK',
        city: 'Kozhikode',
      },
      auth: masterUser,
    });
    assert.equal(res3.cafe.cafeId, 'ZC-0003');
    assert.equal(res3.access.provisioningStatus, 'READY');
  });

  await t.test('2. Role Authorization: CAFE_ADMIN and STAFF are denied creation (403)', async () => {
    await assert.rejects(
      async () => {
        await cafeService.createCafeWithAccess({
          cafeData: { name: 'Unauthorized Cafe 1', displayName: 'Unauthorized 1' },
          auth: adminUser,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_CREATION_DENIED');
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await cafeService.createCafeWithAccess({
          cafeData: { name: 'Unauthorized Cafe 2', displayName: 'Unauthorized 2' },
          auth: staffUser,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_CREATION_DENIED');
        return true;
      }
    );
  });

  await t.test('3. Historical PIN Integrity: Backward compatibility for historical records with PIN', async () => {
    // Seed historical PIN on ZC-0001 to verify backward compatibility
    const historicalPin = '582914';
    const encryptedPin = cafeAccessCryptoService.encryptPin(historicalPin);
    const pinLookupHash = cafeAccessCryptoService.computePinLookupHash(historicalPin);

    await CafeAccess.updateOne(
      { cafeId: 'ZC-0001' },
      {
        permanentCafePinEncrypted: encryptedPin,
        permanentCafePinLookupHash: pinLookupHash,
      }
    );

    await CafePinReservation.create({
      pinLookupHash,
      cafeId: 'ZC-0001',
      organisationId: 'ZAMORIN',
      assignedAt: new Date(),
      isArchived: false,
    });

    const cafeAccess = await CafeAccess.findOne({ cafeId: 'ZC-0001' }).select('+permanentCafePinEncrypted +permanentCafePinLookupHash');
    assert.ok(cafeAccess);
    assert.ok(cafeAccess.permanentCafePinEncrypted);
    assert.ok(cafeAccess.permanentCafePinLookupHash);

    // Verify lookup hash matches the reservation tombstone
    const reservation = await CafePinReservation.findOne({ pinLookupHash: cafeAccess.permanentCafePinLookupHash });
    assert.ok(reservation);
    assert.equal(reservation.cafeId, 'ZC-0001');
    assert.equal(reservation.isArchived, false);

    // Decrypt the PIN and check properties
    const decryptedPin = cafeAccessCryptoService.decryptPin(cafeAccess.permanentCafePinEncrypted);
    assert.match(decryptedPin, /^\d{6}$/);
    assert.equal(cafeAccessCryptoService.isWeakPin(decryptedPin), false);
    assert.equal(cafeAccessCryptoService.computePinLookupHash(decryptedPin), cafeAccess.permanentCafePinLookupHash);
  });

  await t.test('4. Independent Credential Rotation: QR and Link rotate separately without altering PIN', async () => {
    const beforeAccess = await CafeAccess.findOne({ cafeId: 'ZC-0001' }).select('+permanentCafePinEncrypted +permanentCafePinLookupHash +qrCredentialHash +linkCredentialHash');
    const initialPinHash = beforeAccess.permanentCafePinLookupHash;
    const initialQrHash = beforeAccess.qrCredentialHash;
    const initialLinkHash = beforeAccess.linkCredentialHash;

    // Rotate QR
    const qrResult = await cafeService.rotateQrCredential({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0001',
      auth: masterUser,
    });
    assert.ok(qrResult.qrToken);
    assert.equal(qrResult.qrVersion, 2);

    const afterQrAccess = await CafeAccess.findOne({ cafeId: 'ZC-0001' }).select('+permanentCafePinLookupHash +qrCredentialHash +linkCredentialHash');
    assert.notEqual(afterQrAccess.qrCredentialHash, initialQrHash);
    assert.equal(afterQrAccess.linkCredentialHash, initialLinkHash); // Unchanged
    assert.equal(afterQrAccess.permanentCafePinLookupHash, initialPinHash); // Unchanged

    // Rotate Link
    const linkResult = await cafeService.rotateLinkCredential({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0001',
      auth: ownerUser,
    });
    assert.ok(linkResult.linkToken);
    assert.equal(linkResult.linkVersion, 2);

    const afterLinkAccess = await CafeAccess.findOne({ cafeId: 'ZC-0001' }).select('+permanentCafePinLookupHash +qrCredentialHash +linkCredentialHash');
    assert.notEqual(afterLinkAccess.linkCredentialHash, initialLinkHash);
    assert.equal(afterLinkAccess.permanentCafePinLookupHash, initialPinHash); // Still intact
  });

  await t.test('5. Gateway Resolver: Resolves credential to short-lived CafeGatewayContext clamped to cafe', async () => {
    // Rotate QR to get the plaintext token
    const { qrToken } = await cafeService.rotateQrCredential({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0002',
      auth: masterUser,
    });

    // Resolve via gateway
    const resolution = await cafeService.resolveGatewayCredential({
      method: 'QR',
      credential: qrToken,
      clientIp: '127.0.0.1',
      userAgent: 'ZamorinPOS/1.0',
    });

    assert.equal(resolution.cafeId, 'ZC-0002');
    assert.ok(resolution.gatewayContextId);
    assert.equal(resolution.accessMethod, 'QR');

    // Verify gateway context exists in database
    const ctx = await CafeGatewayContext.findOne({ gatewayContextId: resolution.gatewayContextId });
    assert.ok(ctx);
    assert.equal(ctx.cafeId, 'ZC-0002');
    assert.equal(ctx.consumed, false);
    assert.ok(ctx.expiresAt > new Date());
  });

  await t.test('6. Emergency Lock: Blocks access resolution immediately', async () => {
    const { linkToken } = await cafeService.rotateLinkCredential({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0003',
      auth: ownerUser,
    });

    // Lock the cafe access
    const lockResult = await cafeService.setEmergencyLock({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0003',
      lock: true,
      reason: 'Physical security incident at kiosk',
      auth: ownerUser,
    });
    assert.equal(lockResult.emergencyLocked, true);

    // Attempt to resolve gateway credential - must be denied
    await assert.rejects(
      async () => {
        await cafeService.resolveGatewayCredential({
          method: 'LINK',
          credential: linkToken,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_ACCESS_UNAVAILABLE');
        return true;
      }
    );

    // Unlock
    await cafeService.setEmergencyLock({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0003',
      lock: false,
      reason: 'Incident resolved',
      auth: masterUser,
    });

    // Now resolution succeeds
    const resAfterUnlock = await cafeService.resolveGatewayCredential({
      method: 'LINK',
      credential: linkToken,
    });
    assert.equal(resAfterUnlock.cafeId, 'ZC-0003');
  });

  await t.test('7. PIN Reveal with Password Step-Up: Reauthenticates actor before revealing plaintext PIN', async () => {
    // 7.1 Successful reveal with valid password
    const revealResult = await cafeService.revealPermanentPin({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0001',
      auth: masterUser,
      currentPassword: 'StandardSecurePassword!123',
    });
    assert.equal(typeof revealResult.permanentCafePin, 'string');
    assert.match(revealResult.permanentCafePin, /^\d{6}$/);

    // 7.2 Rejected on wrong password
    await assert.rejects(
      async () => {
        await cafeService.revealPermanentPin({
          organisationId: 'ZAMORIN',
          cafeId: 'ZC-0001',
          auth: masterUser,
          currentPassword: 'WrongPassword456!',
        });
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'INVALID_CREDENTIALS');
        return true;
      }
    );
  });

  await t.test('8. Post-Creation Integrity: Provisioning status verified as READY', async () => {
    const summary = await cafeService.getCafeAccessSummary({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0001',
      auth: masterUser,
    });

    assert.equal(summary.provisioningStatus, 'READY');
    assert.equal(summary.permanentCafePinMasked, '••••••');
    assert.ok(summary.qrVersion >= 1);
    assert.ok(summary.linkVersion >= 1);
    assert.equal(summary.emergencyLocked, false);
  });
});
