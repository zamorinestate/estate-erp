'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const { Cafe } = require('../src/models/Cafe');
const { CafeAccess } = require('../src/models/CafeAccess');
const { CafeInventoryConfig } = require('../src/models/CafeInventoryConfig');
const { GlobalInventoryItem } = require('../src/models/GlobalInventoryItem');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { User } = require('../src/models/User');
const cafeService = require('../src/services/cafeService');

test('staged Café provisioning rolls back every subsystem on a late failure', async (t) => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());

  t.after(async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });

  const organisationId = 'ORG-ATOMIC';
  const cafeId = 'ZC-0099';
  const primaryAuth = {
    userId: 'MU-0001',
    organisationId,
    role: 'MASTER',
    isPrimaryMaster: true,
  };

  await Cafe.create({
    cafeId,
    organisationId,
    name: 'Atomicity Test Café',
    displayName: 'Atomicity Test Café',
    cafeType: 'STANDARD_CAFE',
    status: 'DRAFT',
    lifecycleStage: 'CREATED',
    lifecycleHistory: [],
    createdBy: primaryAuth.userId,
  });

  await GlobalInventoryItem.create({
    organisationId,
    itemId: 'ITEM-ATOMIC-001',
    sku: 'ATOMIC-001',
    name: 'Atomicity Test Item',
    category: 'OTHER',
    baseUnit: 'unit',
    status: 'ACTIVE',
    createdByUserId: primaryAuth.userId,
  });

  await User.create({
    userId: 'AD-0099',
    organisationId,
    name: 'Atomicity Test Admin',
    email: 'atomicity-admin@example.test',
    role: 'CAFE_ADMIN',
    isPrimaryMaster: false,
    accountStatus: 'ACTIVE',
    passwordHash: 'test-only-hash',
    createdBy: primaryAuth.userId,
  });

  t.mock.method(User, 'updateOne', async () => {
    throw new Error('FAULT_INJECTION_ADMIN_ASSIGNMENT');
  });

  await assert.rejects(
    () => cafeService.provisionCafeSubsystems({
      organisationId,
      cafeId,
      auth: primaryAuth,
      options: { adminUserId: 'AD-0099' },
      correlationId: 'FAULT-CAFE-ATOMIC-001',
    }),
    (err) => {
      assert.equal(err.code, 'PROVISIONING_FAILED');
      assert.match(err.message, /FAULT_INJECTION_ADMIN_ASSIGNMENT/);
      return true;
    }
  );

  const cafe = await Cafe.findOne({ organisationId, cafeId }).lean();
  assert.equal(cafe.lifecycleStage, 'PROVISIONING_FAILED');

  assert.equal(
    await SequenceCounter.countDocuments({
      organisationId,
      sequenceKey: { $regex: cafeId },
    }),
    0,
    'invoice/receipt sequence artifacts must roll back'
  );

  assert.equal(
    await CafeInventoryConfig.countDocuments({ organisationId, cafeId }),
    0,
    'inventory configuration must roll back'
  );

  assert.equal(
    await CafeAccess.countDocuments({ organisationId, cafeId }),
    0,
    'Café access credentials must roll back'
  );

  const admin = await User.findOne({ organisationId, userId: 'AD-0099' }).lean();
  assert.equal(
    Array.isArray(admin.assignedCafeIds) && admin.assignedCafeIds.includes(cafeId),
    false,
    'admin assignment must not survive the aborted provisioning transaction'
  );
});
