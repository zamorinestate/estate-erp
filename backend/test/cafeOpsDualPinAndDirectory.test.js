'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcrypt');

const { Cafe } = require('../src/models/Cafe');
const { User } = require('../src/models/User');
const { DeviceRegistration } = require('../src/models/DeviceRegistration');
const { OperatorSession } = require('../src/models/OperatorSession');
const operatorSessionService = require('../src/services/operatorSessionService');

test('Cafe Operations Dual-PIN, Directory & Remember Access Suite', async (t) => {
  let mongoServer;

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const defaultCafePinHash = await bcrypt.hash('123456', 10);
    const opPin1Hash = await bcrypt.hash('147258', 10);
    const opPin2Hash = await bcrypt.hash('258369', 10);
    const dummyPasswordHash = await bcrypt.hash('StandardSecPassword!123', 10);

    // Seed Cafes
    await Cafe.create({
      cafeId: 'ZC-0001',
      organisationId: 'ZAMORIN',
      name: 'Koramangala Main Branch',
      displayName: 'Koramangala Main',
      cafeType: 'STANDARD_CAFE',
      status: 'ACTIVE',
      operationsPinHash: defaultCafePinHash,
      operationsPinSetAt: new Date(),
      createdBy: 'MU-0001',
    });

    await Cafe.create({
      cafeId: 'ZC-0002',
      organisationId: 'ZAMORIN',
      name: 'Indiranagar Central Branch',
      displayName: 'Indiranagar Central',
      cafeType: 'STANDARD_CAFE',
      status: 'ACTIVE',
      operationsPinHash: defaultCafePinHash,
      operationsPinSetAt: new Date(),
      createdBy: 'MU-0001',
    });

    // Seed Operators
    await User.create({
      userId: 'AD-0001',
      organisationId: 'ZAMORIN',
      name: 'Rahul K',
      email: 'rahul.ops@zamorin.cafe',
      role: 'CAFE_ADMIN',
      accountStatus: 'ACTIVE',
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      passwordHash: dummyPasswordHash,
      operatorPinHash: opPin1Hash,
      operatorPinSetAt: new Date(),
      createdBy: 'MU-0001',
    });

    await User.create({
      userId: 'AD-0002',
      organisationId: 'ZAMORIN',
      name: 'Priya Nair',
      email: 'priya.ops@zamorin.cafe',
      role: 'CAFE_ADMIN',
      accountStatus: 'ACTIVE',
      primaryCafeId: 'ZC-0002',
      assignedCafeIds: ['ZC-0002'],
      passwordHash: dummyPasswordHash,
      operatorPinHash: opPin2Hash,
      operatorPinSetAt: new Date(),
      createdBy: 'MU-0001',
    });

    await User.create({
      userId: 'MU-0001',
      organisationId: 'ZAMORIN',
      name: 'Primary Master User',
      email: 'master@zamorin.cafe',
      role: 'MASTER',
      accountStatus: 'ACTIVE',
      isPrimaryMaster: true,
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'SYSTEM',
      primaryMasterDesignationReason: 'Initial bootstrap',
      passwordHash: dummyPasswordHash,
      operatorPinHash: opPin1Hash,
      operatorPinSetAt: new Date(),
      createdBy: 'SYSTEM',
    });

    // Deliberately malformed legacy row inserted below Mongoose validation to
    // prove service-level fail-closed behavior against historical bad data.
    await User.collection.insertOne({
      userId: 'MU-MALFORMED-OPS',
      organisationId: 'ZAMORIN',
      name: 'Invalid MASTER Context',
      email: 'malformed.ops@zamorin.cafe',
      role: 'MASTER',
      accountStatus: 'ACTIVE',
      isPrimaryMaster: false,
      passwordHash: dummyPasswordHash,
      operatorPinHash: opPin1Hash,
      operatorPinSetAt: new Date(),
      createdBy: 'LEGACY_TEST_FIXTURE',
    });
  });

  t.after(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  await t.test('1. Directory Endpoint returns sanitized active cafes and operators', async () => {
    const dir = await operatorSessionService.getCafeOperationsDirectory({ organisationId: 'ZAMORIN' });
    assert.equal(dir.success, true);
    assert.equal(Array.isArray(dir.data.cafes), true);
    assert.equal(dir.data.cafes.length, 2);

    const cafeIds = dir.data.cafes.map((c) => c.cafeId);
    assert.ok(cafeIds.includes('ZC-0001'));
    assert.ok(cafeIds.includes('ZC-0002'));

    assert.equal(Array.isArray(dir.data.operators), true);
    assert.equal(dir.data.operators.length, 3);

    const operatorIds = dir.data.operators.map((u) => u.userId);
    assert.ok(operatorIds.includes('AD-0001'));
    assert.ok(operatorIds.includes('AD-0002'));
    assert.ok(operatorIds.includes('MU-0001'));
    assert.equal(operatorIds.includes('MU-MALFORMED-OPS'), false);

    // Verify sensitive fields are NOT leaked
    dir.data.cafes.forEach((c) => {
      assert.equal(c.operationsPinHash, undefined);
    });
    dir.data.operators.forEach((u) => {
      assert.equal(u.passwordHash, undefined);
      assert.equal(u.operatorPinHash, undefined);
    });
  });

  await t.test('2. Dual-PIN sign-in succeeds with valid Cafe PIN and Operator PIN', async () => {
    const result = await operatorSessionService.signInOperator({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0001',
      operatorUserId: 'AD-0001',
      cafePin: '123456',
      pin: '147258',
      rememberAccess: true,
    });

    assert.equal(result.success, true);
    assert.equal(result.operatorSession.operatorUserId, 'AD-0001');
    assert.equal(result.operatorSession.cafeId, 'ZC-0001');
    assert.equal(result.operatorSession.status, 'ACTIVE');
    assert.ok(result.trustedDeviceToken);
    assert.ok(result.trustedDeviceToken.startsWith('trdev_'));
  });

  await t.test('3. Invalid Cafe PIN fails with 401 INVALID_CAFE_PIN', async () => {
    await assert.rejects(
      async () => {
        await operatorSessionService.signInOperator({
          organisationId: 'ZAMORIN',
          cafeId: 'ZC-0001',
          operatorUserId: 'AD-0001',
          cafePin: '999999', // wrong cafe PIN
          pin: '147258',
        });
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'INVALID_CAFE_PIN');
        return true;
      }
    );
  });

  await t.test('4. Invalid Operator PIN fails with 401 INVALID_OPERATOR_CREDENTIALS', async () => {
    await assert.rejects(
      async () => {
        await operatorSessionService.signInOperator({
          organisationId: 'ZAMORIN',
          cafeId: 'ZC-0001',
          operatorUserId: 'AD-0001',
          cafePin: '123456',
          pin: '000000', // wrong operator PIN
        });
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'INVALID_OPERATOR_CREDENTIALS');
        return true;
      }
    );
  });

  await t.test('5. Cross-Cafe access denied for unassigned cafe', async () => {
    // AD-0001 is assigned to ZC-0001, attempting to operate ZC-0002
    await assert.rejects(
      async () => {
        await operatorSessionService.signInOperator({
          organisationId: 'ZAMORIN',
          cafeId: 'ZC-0002',
          operatorUserId: 'AD-0001',
          cafePin: '123456',
          pin: '147258',
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'WRONG_CAFE_ACCESS');
        return true;
      }
    );
  });

  await t.test('6. Primary Master can operate any cafe location', async () => {
    const result = await operatorSessionService.signInOperator({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0002',
      operatorUserId: 'MU-0001',
      cafePin: '123456',
      pin: '147258',
    });

    assert.equal(result.success, true);
    assert.equal(result.operatorSession.cafeId, 'ZC-0002');
    assert.equal(result.operatorSession.operatorUserId, 'MU-0001');
  });

  await t.test('7. Primary Master can set/reset Cafe PIN', async () => {
    const setResult = await operatorSessionService.setCafePin({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0001',
      actorUserId: 'MU-0001',
      actorRole: 'MASTER',
      actorIsPrimaryMaster: true,
      newPin: '654320',
    });

    assert.equal(setResult.success, true);

    // Sign in with newly configured PIN
    const result = await operatorSessionService.signInOperator({
      organisationId: 'ZAMORIN',
      cafeId: 'ZC-0001',
      operatorUserId: 'AD-0001',
      cafePin: '654320',
      pin: '147258',
    });

    assert.equal(result.success, true);
  });

  await t.test('8. Malformed non-primary MASTER cannot administer Café or Operator PINs', async () => {
    await assert.rejects(
      () =>
        operatorSessionService.setCafePin({
          organisationId: 'ZAMORIN',
          cafeId: 'ZC-0001',
          actorUserId: 'MU-MALFORMED-OPS',
          actorRole: 'MASTER',
          actorIsPrimaryMaster: false,
          newPin: '864209',
        }),
      (err) =>
        err.statusCode === 403 &&
        err.code === 'UNAUTHORIZED_CAFE_PIN_SETUP'
    );

    await assert.rejects(
      () =>
        operatorSessionService.setOperatorPin({
          organisationId: 'ZAMORIN',
          targetUserId: 'AD-0001',
          actorUserId: 'MU-MALFORMED-OPS',
          actorRole: 'MASTER',
          actorIsPrimaryMaster: false,
          newPin: '864209',
        }),
      (err) =>
        err.statusCode === 403 &&
        err.code === 'UNAUTHORIZED_PIN_SETUP'
    );
  });
});
