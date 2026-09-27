'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcrypt');

const { Cafe } = require('../src/models/Cafe');
const { CafeAccess } = require('../src/models/CafeAccess');
const { User } = require('../src/models/User');
const { AuditEvent } = require('../src/models/AuditEvent');
const { OperatorSession } = require('../src/models/OperatorSession');
const { DeviceRegistration } = require('../src/models/DeviceRegistration');
const { SequenceCounter } = require('../src/models/SequenceCounter');

const cafeAccessCryptoService = require('../src/services/cafeAccessCryptoService');
const cafeService = require('../src/services/cafeService');
const {
  generateStrongSixDigitPin,
  isWeakPin,
  validateSixDigitPinPolicy,
} = require('../src/utils/pinPolicy');

test('Café Creation — Final Access Pack & Handover Comprehensive Test Suite', async (t) => {
  let mongoServer;
  let primaryMasterUser;
  let ownerUser;
  let adminUser;
  let staffUser;

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Ensure crypto secret keys
    cafeAccessCryptoService.verifySecretKeys();

    const masterPasswordHash = await bcrypt.hash('MasterSecret!Pass123', 10);
    const standardPasswordHash = await bcrypt.hash('StandardPass!123', 10);

    primaryMasterUser = await User.create({
      userId: 'MU-0001',
      organisationId: 'ZAMORIN',
      name: 'Pradeesh K',
      email: 'pradeeshk331@gmail.com',
      role: 'MASTER',
      isPrimaryMaster: true,
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'SYSTEM',
      primaryMasterDesignationReason: 'Sole Primary Master authority bootstrap',
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash: masterPasswordHash,
    });

    ownerUser = await User.create({
      userId: 'OW-0001',
      organisationId: 'ZAMORIN',
      name: 'Executive Owner',
      email: 'owner@zamorin.cafe',
      role: 'OWNER',
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash: standardPasswordHash,
    });

    adminUser = await User.create({
      userId: 'AD-0001',
      organisationId: 'ZAMORIN',
      name: 'Café Admin',
      email: 'admin@zamorin.cafe',
      role: 'CAFE_ADMIN',
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash: standardPasswordHash,
    });

    staffUser = await User.create({
      userId: 'ST-0001',
      organisationId: 'ZAMORIN',
      name: 'Cashier Staff',
      email: 'staff@zamorin.cafe',
      role: 'STAFF',
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash: standardPasswordHash,
    });
  });

  t.after(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  // =========================================================================
  // 1. PIN Policy Engine Tests
  // =========================================================================
  await t.test('1. PIN Policy: Server generates cryptographically strong 6-digit PIN', () => {
    for (let i = 0; i < 25; i++) {
      const pin = generateStrongSixDigitPin();
      assert.equal(typeof pin, 'string');
      assert.match(pin, /^\d{6}$/, 'PIN must be exactly 6 numeric digits');
      assert.equal(isWeakPin(pin), false, `Generated PIN ${pin} must not be weak`);
      assert.doesNotThrow(() => validateSixDigitPinPolicy(pin), `Generated PIN ${pin} must pass policy validation`);
    }

    // Weak PINs must be rejected
    assert.equal(isWeakPin('111111'), true);
    assert.equal(isWeakPin('123456'), true);
    assert.equal(isWeakPin('654321'), true);
    assert.equal(isWeakPin('121212'), true);
    assert.equal(isWeakPin('000000'), true);
  });

  // =========================================================================
  // 2. Role Authorization Tests
  // =========================================================================
  await t.test('2. Role Authorization: Primary Master can create Café; Non-Master is rejected (403)', async () => {
    // Non-Master (Owner) must fail
    await assert.rejects(
      async () => {
        await cafeService.createCafeWithAccess({
          cafeData: {
            name: 'Unauthorized Café Creation Test',
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

    // Non-Master (Staff) must fail
    await assert.rejects(
      async () => {
        await cafeService.createCafeWithAccess({
          cafeData: {
            name: 'Staff Café Creation Test',
            city: 'Kozhikode',
          },
          auth: staffUser,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_CREATION_DENIED');
        return true;
      }
    );

    // Non-Master (Admin) must fail
    await assert.rejects(
      async () => {
        await cafeService.createCafeWithAccess({
          cafeData: {
            name: 'Admin Café Creation Test',
            city: 'Kozhikode',
          },
          auth: adminUser,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_CREATION_DENIED');
        return true;
      }
    );
  });

  // =========================================================================
  // 3. Validation Before Creation
  // =========================================================================
  await t.test('3. Pre-creation Validation: Missing mandatory fields throws validation error', async () => {
    await assert.rejects(
      async () => {
        await cafeService.createCafeWithAccess({
          cafeData: {
            // Missing name
            city: 'Kozhikode',
          },
          auth: primaryMasterUser,
        });
      },
      (err) => {
        assert.ok(err.statusCode >= 400);
        return true;
      }
    );
  });

  // =========================================================================
  // 4. Successful Café Creation, Server ID, PIN Generation & Access Pack
  // =========================================================================
  let createdCafeResult;
  let deliveredPlaintextPin;

  await t.test('4. Successful Creation: Sequential Café ID, Strong PIN, QR, Dedicated Link & Access Pack', async () => {
    createdCafeResult = await cafeService.createCafeWithAccess({
      cafeData: {
        name: 'Zamorin Café — Alangad',
        displayName: 'Alangad Roastery Flagship',
        cafeType: 'STANDARD_CAFE',
        city: 'Alangad',
        state: 'Kerala',
        stateCode: '32',
        pincode: '683511',
        primaryContactPhone: '9876543210',
        primaryContactEmail: 'alangad@zamorin.cafe',
      },
      auth: primaryMasterUser,
    });

    assert.ok(createdCafeResult);
    assert.ok(createdCafeResult.cafe);
    assert.ok(createdCafeResult.access);

    // Server-generated Café ID
    assert.equal(createdCafeResult.cafe.cafeId, 'ZC-0001');

    // Server-generated 6-digit PIN
    deliveredPlaintextPin = createdCafeResult.operationsPin;
    assert.ok(deliveredPlaintextPin, 'Plaintext PIN must be delivered in creation result');
    assert.match(deliveredPlaintextPin, /^\d{6}$/);
    assert.equal(isWeakPin(deliveredPlaintextPin), false);

    // Access Pack contents
    assert.equal(createdCafeResult.access.provisioningStatus, 'READY');
    assert.equal(createdCafeResult.access.accessStatus, 'ACTIVE');
    assert.equal(createdCafeResult.access.initialCafePin, deliveredPlaintextPin, 'initialCafePin provided once');
    assert.ok(createdCafeResult.access.qrUrl, 'QR URL must be provisioned');
    assert.ok(createdCafeResult.access.dedicatedLoginUrl, 'Dedicated Login URL must be provisioned');
    assert.ok(
      createdCafeResult.access.dedicatedLoginUrl.includes('/cafe-access/link/'),
      'Dedicated Login URL must be canonical opaque link /cafe-access/link/<token>'
    );
  });

  // =========================================================================
  // 5. PIN Storage & Security Verification
  // =========================================================================
  await t.test('5. PIN Storage & Security: Only bcrypt-12 hash stored; Raw PIN NEVER in DB or Audit Logs', async () => {
    // 5.1 Check Cafe document in MongoDB
    const cafeDoc = await Cafe.findOne({ cafeId: 'ZC-0001' }).select('+operationsPinHash').lean();
    assert.ok(cafeDoc, 'Cafe document must exist in DB');
    assert.ok(cafeDoc.operationsPinHash, 'operationsPinHash must be stored');
    assert.equal(cafeDoc.operationsPinHash.startsWith('$2'), true, 'Must be valid bcrypt hash');

    // Verify bcrypt hash matches the delivered PIN
    const isBcryptMatch = await bcrypt.compare(deliveredPlaintextPin, cafeDoc.operationsPinHash);
    assert.equal(isBcryptMatch, true, 'Stored bcrypt hash must verify against delivered PIN');

    // Verify raw PIN is NOT stored anywhere in the Cafe document
    assert.equal(cafeDoc.operationsPin, undefined, 'Plaintext operationsPin must NOT be in DB');
    assert.equal(cafeDoc.permanentCafePin, undefined, 'Plaintext permanentCafePin must NOT be in DB');
    assert.equal(cafeDoc.permanentCafePinEncrypted, undefined, 'Reversible permanentCafePinEncrypted must NOT be in DB');

    // 5.2 Check CafeAccess document
    const accessDoc = await CafeAccess.findOne({ cafeId: 'ZC-0001' }).lean();
    assert.ok(accessDoc, 'CafeAccess document must exist');
    assert.equal(accessDoc.operationsPin, undefined);
    assert.equal(accessDoc.permanentCafePin, undefined);

    // 5.3 Verify plaintext PIN is absent from all Audit Logs
    const auditLogs = await AuditEvent.find({ cafeId: 'ZC-0001' }).lean();
    assert.ok(auditLogs.length > 0, 'Audit logs must have been recorded for creation');

    for (const log of auditLogs) {
      const logStr = JSON.stringify(log);
      assert.equal(
        logStr.includes(deliveredPlaintextPin),
        false,
        `Audit log ${log.action} must NEVER contain plaintext PIN ${deliveredPlaintextPin}`
      );
    }

    // Verify CAFE_PIN_CREATED audit event exists
    const pinCreatedAudit = auditLogs.find((l) => l.action === 'CAFE_PIN_CREATED');
    assert.ok(pinCreatedAudit, 'CAFE_PIN_CREATED audit event must be present');
    assert.equal(pinCreatedAudit.metadata?.pinConfigured, true);
    assert.equal(pinCreatedAudit.metadata?.algorithm, 'bcrypt-12');
  });

  // =========================================================================
  // 6. One-Time PIN Delivery & GET API Masking
  // =========================================================================
  await t.test('6. One-Time Delivery: Subsequent GET APIs return only masked PIN or boolean indicator', async () => {
    // Normal Cafe Detail GET
    const cafeDetail = await Cafe.findOne({ cafeId: 'ZC-0001' }).lean();
    assert.equal(cafeDetail.operationsPin, undefined, 'GET Cafe must NOT return operationsPin');
    assert.equal(cafeDetail.operationsPinHash, undefined, 'GET Cafe must NOT return operationsPinHash');

    // Access Governance Summary GET
    const accessSummary = await cafeService.getCafeAccessSummary('ZAMORIN', 'ZC-0001');
    assert.equal(accessSummary.operationsPinSet, true, 'Summary must indicate PIN is set');
    assert.equal(accessSummary.operationsPinMasked, '••••••', 'Summary must mask PIN as ••••••');
    assert.equal(accessSummary.operationsPin, undefined, 'Summary must NOT return plaintext PIN');
  });

  // =========================================================================
  // 7. QR & Opaque Dedicated Link: Resolution, Gateway Redirection & Regeneration
  // =========================================================================
  let originalLinkToken;

  await t.test('7. QR & Dedicated Link: Canonical opaque tokens, resolution, and invalidation upon regeneration', async () => {
    const accessSummary = await cafeService.getCafeAccessSummary('ZAMORIN', 'ZC-0001');
    assert.ok(accessSummary.dedicatedLoginUrl);
    assert.ok(accessSummary.qrUrl);

    // Verify URLs do not leak PIN
    assert.equal(accessSummary.dedicatedLoginUrl.includes(deliveredPlaintextPin), false);
    assert.equal(accessSummary.qrUrl.includes(deliveredPlaintextPin), false);

    // Verify canonical opaque link structure
    assert.match(accessSummary.dedicatedLoginUrl, /\/cafe-access\/link\/[a-zA-Z0-9_-]+/);
    assert.match(accessSummary.qrUrl, /\/cafe-access\/qr\/[a-zA-Z0-9_-]+/);

    // Extract link token
    originalLinkToken = createdCafeResult.access.linkToken;
    assert.ok(originalLinkToken);

    // 7.1 Resolve Link Token
    const linkContext = await cafeService.resolvePublicLinkToken(originalLinkToken);
    assert.equal(linkContext.cafeId, 'ZC-0001');
    assert.equal(linkContext.loginEnabled, true);
    assert.equal(linkContext.sessionToken, undefined, 'Must NOT authenticate user');

    // 7.2 Resolve QR Token
    const qrContext = await cafeService.resolvePublicQrToken(createdCafeResult.access.qrToken);
    assert.equal(qrContext.cafeId, 'ZC-0001');
    assert.equal(qrContext.loginEnabled, true);
    assert.equal(qrContext.sessionToken, undefined, 'Must NOT authenticate user');

    // 7.3 Regenerate Login Link
    const rotateLinkRes = await cafeService.rotateLinkCredential({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0001',
      auth: primaryMasterUser,
      currentPassword: 'MasterSecret!Pass123',
    });

    assert.ok(rotateLinkRes.linkToken);
    assert.notEqual(rotateLinkRes.linkToken, originalLinkToken);
    assert.ok(rotateLinkRes.linkUrl.includes(rotateLinkRes.linkToken));

    // Old link token must now FAIL with 401 CAFE_ACCESS_LINK_UNAVAILABLE
    await assert.rejects(
      async () => {
        await cafeService.resolvePublicLinkToken(originalLinkToken);
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'CAFE_ACCESS_LINK_UNAVAILABLE');
        return true;
      }
    );

    // New link token must SUCCEED
    const newLinkContext = await cafeService.resolvePublicLinkToken(rotateLinkRes.linkToken);
    assert.equal(newLinkContext.cafeId, 'ZC-0001');
    assert.equal(newLinkContext.loginEnabled, true);
  });

  // =========================================================================
  // 7b. Legacy Reveal PIN Permanently Retired (410 GONE)
  // =========================================================================
  await t.test('7b. PIN Reveal Retirement: revealPermanentPin throws 410 CAFE_PIN_REVEAL_RETIRED', async () => {
    await assert.rejects(
      async () => {
        await cafeService.revealPermanentPin({
          organisationId: 'ZAMORIN',
          cafeId: 'ZC-0001',
          auth: primaryMasterUser,
          currentPassword: 'MasterSecret!Pass123',
        });
      },
      (err) => {
        assert.equal(err.statusCode, 410);
        assert.equal(err.code, 'CAFE_PIN_REVEAL_RETIRED');
        return true;
      }
    );
  });

  // =========================================================================
  // 8. Absolute PIN Policy: Manual Reset PIN Flow
  // =========================================================================
  let newDeliveredPin;

  await t.test('8. Absolute PIN Policy: Primary Master can reset PIN with step-up; Old PIN fails, New PIN works', async () => {
    // Create an active operator session for this cafe to test revocation upon PIN reset
    await OperatorSession.create({
      operatorSessionId: 'OPS-ZC-0001-TEST',
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0001',
      deviceId: 'DEV-POS-01',
      operatorUserId: 'ST-0001',
      operatorNameSnapshot: 'Cashier Staff',
      status: 'ACTIVE',
      sessionStartedAt: new Date(),
      lastActivityAt: new Date(),
    });

    let activeSessionsBefore = await OperatorSession.countDocuments({ cafeId: 'ZC-0001', status: 'ACTIVE' });
    assert.equal(activeSessionsBefore, 1, 'Should have 1 active operator session before reset');

    // 8.1 Non-Master cannot reset PIN
    await assert.rejects(
      async () => {
        await cafeService.resetCafeOperationsPin({
          organisationId: 'ZAMORIN',
          cafeId: 'ZC-0001',
          auth: ownerUser,
          currentPassword: 'StandardPass!123',
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        return true;
      }
    );

    // 8.2 Primary Master with invalid step-up password is rejected
    await assert.rejects(
      async () => {
        await cafeService.resetCafeOperationsPin({
          organisationId: 'ZAMORIN',
          cafeId: 'ZC-0001',
          auth: primaryMasterUser,
          currentPassword: 'WrongPassword!',
        });
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        return true;
      }
    );

    // 8.3 Primary Master with valid password resets PIN
    const resetResult = await cafeService.resetCafeOperationsPin({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0001',
      auth: primaryMasterUser,
      currentPassword: 'MasterSecret!Pass123',
    });

    assert.ok(resetResult);
    newDeliveredPin = resetResult.operationsPin || resetResult.newPin;
    assert.ok(newDeliveredPin, 'New PIN must be returned once in reset response');
    assert.match(newDeliveredPin, /^\d{6}$/);
    assert.notEqual(newDeliveredPin, deliveredPlaintextPin, 'New PIN must differ from old PIN');
    assert.equal(isWeakPin(newDeliveredPin), false);

    // Verify stored hash in DB now verifies against new PIN and FAILS against old PIN
    const updatedCafeDoc = await Cafe.findOne({ cafeId: 'ZC-0001' }).select('+operationsPinHash').lean();
    const oldPinMatches = await bcrypt.compare(deliveredPlaintextPin, updatedCafeDoc.operationsPinHash);
    const newPinMatches = await bcrypt.compare(newDeliveredPin, updatedCafeDoc.operationsPinHash);

    assert.equal(oldPinMatches, false, 'Old PIN must NO LONGER match');
    assert.equal(newPinMatches, true, 'New PIN must match the updated operationsPinHash');

    // Verify active operator sessions were terminated upon PIN reset
    const activeSessionsAfter = await OperatorSession.countDocuments({ cafeId: 'ZC-0001', status: 'ACTIVE' });
    assert.equal(activeSessionsAfter, 0, 'Active operator sessions must be terminated upon PIN reset');

    // Verify audit event CAFE_PIN_RESET recorded without exposing PIN
    const resetAudits = await AuditEvent.find({
      cafeId: 'ZC-0001',
      action: { $in: ['CAFÉ_PIN_RESET', 'CAFE_PIN_RESET'] },
    }).lean();
    assert.ok(resetAudits.length > 0, 'CAFÉ_PIN_RESET audit event must be present');
    for (const a of resetAudits) {
      assert.equal(JSON.stringify(a).includes(newDeliveredPin), false, 'Audit log must NEVER contain the new PIN');
    }
  });

  // =========================================================================
  // 9. Emergency Disable & Enable Access
  // =========================================================================
  await t.test('9. Emergency Access Governance: Disable and Enable Café Operations Access', async () => {
    // 9.1 Disable access
    const disableResult = await cafeService.disableCafeAccess({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0001',
      auth: primaryMasterUser,
      reason: 'Suspected physical till tampering at Alangad store.',
    });

    assert.ok(disableResult);
    assert.equal(disableResult.accessStatus, 'LOCKED');

    const accessAfterLock = await CafeAccess.findOne({ cafeId: 'ZC-0001' }).lean();
    assert.equal(accessAfterLock.accessStatus, 'LOCKED');

    // Audit event ACCESS_DISABLED
    const disabledAudits = await AuditEvent.find({
      cafeId: 'ZC-0001',
      action: { $in: ['ACCESS_DISABLED', 'CAFE_ACCESS_DISABLED', 'CAFE_EMERGENCY_LOCKED'] },
    }).lean();
    assert.ok(disabledAudits.length > 0);

    // 9.2 Re-enable access
    const enableResult = await cafeService.enableCafeAccess({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0001',
      auth: primaryMasterUser,
      reason: 'Physical store audit completed. Terminal secured.',
    });

    assert.ok(enableResult);
    assert.equal(enableResult.accessStatus, 'ACTIVE');

    const accessAfterUnlock = await CafeAccess.findOne({ cafeId: 'ZC-0001' }).lean();
    assert.equal(accessAfterUnlock.accessStatus, 'ACTIVE');

    // Audit event ACCESS_ENABLED
    const enabledAudits = await AuditEvent.find({
      cafeId: 'ZC-0001',
      action: { $in: ['ACCESS_ENABLED', 'CAFE_ACCESS_ENABLED', 'CAFE_EMERGENCY_UNLOCKED'] },
    }).lean();
    assert.ok(enabledAudits.length > 0);
  });

  // =========================================================================
  // 10. Creation Atomicity & Idempotency / No Duplication
  // =========================================================================
  await t.test('10. Atomicity & Sequential Numbering: Second Café gets sequential ZC-0002', async () => {
    const secondCafeResult = await cafeService.createCafeWithAccess({
      cafeData: {
        name: 'Zamorin Café — Palayam',
        displayName: 'Palayam Express',
        cafeType: 'KIOSK',
        city: 'Kozhikode',
      },
      auth: primaryMasterUser,
    });

    assert.equal(secondCafeResult.cafe.cafeId, 'ZC-0002');
    assert.ok(secondCafeResult.operationsPin);
    assert.match(secondCafeResult.operationsPin, /^\d{6}$/);
    assert.equal(secondCafeResult.access.provisioningStatus, 'READY');
  });
});
