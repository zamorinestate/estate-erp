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
const { UniversalQrRecord } = require('../src/models/UniversalQrRecord');
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


test('createCafeWithAccess rolls back QR, Café, access, inventory and fiscal sequences on late failure', async (t) => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());

  t.after(async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });

  const organisationId = 'ORG-CREATE-ROLLBACK';
  const primaryAuth = {
    userId: 'MU-CREATE-001',
    organisationId,
    role: 'MASTER',
    isPrimaryMaster: true,
  };

  await GlobalInventoryItem.create({
    organisationId,
    itemId: 'ITEM-CREATE-001',
    sku: 'CREATE-001',
    name: 'Create Rollback Item',
    category: 'OTHER',
    baseUnit: 'unit',
    status: 'ACTIVE',
    createdByUserId: primaryAuth.userId,
  });

  t.mock.method(CafeInventoryConfig, 'insertMany', async () => {
    throw new Error('FAULT_INJECTION_CREATE_INVENTORY');
  });

  await assert.rejects(
    () => cafeService.createCafeWithAccess({
      auth: primaryAuth,
      cafeData: {
        name: 'Rollback Creation Café',
        displayName: 'Rollback Creation Café',
        cafeType: 'STANDARD_CAFE',
        city: 'Kochi',
      },
      correlationId: 'FAULT-CREATE-ROLLBACK-001',
    }),
    (err) => {
      assert.equal(err.code, 'CAFE_PROVISIONING_FAILED');
      assert.match(err.message, /FAULT_INJECTION_CREATE_INVENTORY/);
      return true;
    }
  );

  assert.equal(
    await Cafe.countDocuments({ organisationId }),
    0,
    'Café document must not survive an aborted creation transaction'
  );
  assert.equal(
    await CafeAccess.countDocuments({ organisationId }),
    0,
    'Café access must not survive an aborted creation transaction'
  );
  assert.equal(
    await UniversalQrRecord.countDocuments({ organisationId }),
    0,
    'Universal QR must not survive an aborted creation transaction'
  );
  assert.equal(
    await CafeInventoryConfig.countDocuments({ organisationId }),
    0,
    'Inventory configuration must not survive an aborted creation transaction'
  );
  assert.equal(
    await SequenceCounter.countDocuments({
      organisationId,
      sequenceKey: { $regex: /^(INVOICE_|RECEIPT_|GST_INV:)/ },
    }),
    0,
    'Fiscal invoice/receipt sequence artifacts must not survive an aborted creation transaction'
  );
});

test('createCafeWithAccess retries the whole transaction on TransientTransactionError exactly once', async (t) => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());

  t.after(async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });

  const organisationId = 'ORG-CREATE-RETRY';
  const primaryAuth = {
    userId: 'MU-RETRY-001',
    organisationId,
    role: 'MASTER',
    isPrimaryMaster: true,
  };

  const originalCreate = CafeAccess.create.bind(CafeAccess);
  let createAttempts = 0;
  t.mock.method(CafeAccess, 'create', async (...args) => {
    createAttempts += 1;
    if (createAttempts === 1) {
      const transient = new Error('FAULT_INJECTION_TRANSIENT_TRANSACTION');
      transient.errorLabels = ['TransientTransactionError'];
      throw transient;
    }
    return originalCreate(...args);
  });

  const result = await cafeService.createCafeWithAccess({
    auth: primaryAuth,
    cafeData: {
      name: 'Transient Retry Café',
      displayName: 'Transient Retry Café',
      cafeType: 'STANDARD_CAFE',
      city: 'Kochi',
    },
    correlationId: 'FAULT-CREATE-TRANSIENT-001',
  });

  assert.ok(result?.cafe?.cafeId);
  assert.equal(createAttempts, 2, 'transaction body must restart exactly once');

  const cafeId = result.cafe.cafeId;
  assert.equal(
    await Cafe.countDocuments({ organisationId, cafeId }),
    1,
    'only one Café may survive the retry'
  );
  assert.equal(
    await CafeAccess.countDocuments({ organisationId, cafeId }),
    1,
    'only one Café access record may survive the retry'
  );
  assert.equal(
    await UniversalQrRecord.countDocuments({ organisationId, cafeId }),
    1,
    'only one Universal QR record may survive the retry'
  );

  const durableCafe = await Cafe.findOne({ organisationId, cafeId }).lean();
  const activatedTransitions = (durableCafe.lifecycleHistory || [])
    .filter((entry) => entry.toStage === 'ACTIVATED');
  assert.equal(
    activatedTransitions.length,
    1,
    'aborted retry attempts must not duplicate lifecycle history'
  );
});
