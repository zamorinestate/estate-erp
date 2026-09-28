'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const { Cafe } = require('../src/models/Cafe');
const { CafeAccess } = require('../src/models/CafeAccess');
const { UniversalQrRecord } = require('../src/models/UniversalQrRecord');
const cafeService = require('../src/services/cafeService');

test('Café QR rotation aborts atomically if CafeAccess update fails', async (t) => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());

  t.after(async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });

  const organisationId = 'ORG-QR-ATOMIC';
  const auth = {
    userId: 'MU-QR-001',
    organisationId,
    role: 'MASTER',
    isPrimaryMaster: true,
  };

  const created = await cafeService.createCafeWithAccess({
    auth,
    cafeData: {
      name: 'QR Atomic Café',
      displayName: 'QR Atomic Café',
      cafeType: 'STANDARD_CAFE',
      city: 'Kochi',
    },
  });

  const cafeId = created.cafe.cafeId;
  const beforeCafe = await Cafe.findOne({ organisationId, cafeId }).lean();
  const beforeAccess = await CafeAccess.findOne({ organisationId, cafeId })
    .select('+qrCredentialHash +qrTokenEncrypted')
    .lean();
  const oldQrId = beforeCafe.qrLoginContext.qrRecordId;

  assert.ok(oldQrId);
  assert.equal(
    await UniversalQrRecord.countDocuments({
      organisationId,
      cafeId,
      status: 'ACTIVE',
    }),
    1
  );

  const originalSave = CafeAccess.prototype.save;
  const mockedSave = t.mock.method(
    CafeAccess.prototype,
    'save',
    async function faultInjectedSave(...args) {
      if (this.cafeId === cafeId && Number(this.qrVersion) > Number(beforeAccess.qrVersion)) {
        throw new Error('FAULT_INJECTION_QR_ACCESS_SAVE');
      }
      return originalSave.apply(this, args);
    }
  );

  await assert.rejects(
    () => cafeService.regenerateCafeLoginQr({
      organisationId,
      cafeId,
      auth,
      correlationId: 'FAULT-QR-ATOMIC-001',
    }),
    /FAULT_INJECTION_QR_ACCESS_SAVE/
  );

  mockedSave.mock.restore();

  const afterCafe = await Cafe.findOne({ organisationId, cafeId }).lean();
  const afterAccess = await CafeAccess.findOne({ organisationId, cafeId })
    .select('+qrCredentialHash +qrTokenEncrypted')
    .lean();
  const oldQr = await UniversalQrRecord.findOne({ qrId: oldQrId }).lean();

  assert.equal(afterCafe.qrLoginContext.qrRecordId, oldQrId);
  assert.equal(afterCafe.qrLoginContext.loginUrl, beforeCafe.qrLoginContext.loginUrl);
  assert.equal(afterAccess.qrVersion, beforeAccess.qrVersion);
  assert.equal(afterAccess.qrCredentialHash, beforeAccess.qrCredentialHash);
  assert.equal(afterAccess.qrTokenEncrypted, beforeAccess.qrTokenEncrypted);
  assert.equal(oldQr.status, 'ACTIVE', 'old printable QR must remain active after rollback');
  assert.equal(
    await UniversalQrRecord.countDocuments({
      organisationId,
      cafeId,
      status: 'ACTIVE',
    }),
    1,
    'aborted rotation must not leave a second active Universal QR'
  );
});

test('successful QR rotation keeps public reference distinct from secret credential', async (t) => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());

  t.after(async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });

  const organisationId = 'ORG-QR-SEPARATION';
  const auth = {
    userId: 'MU-QR-002',
    organisationId,
    role: 'MASTER',
    isPrimaryMaster: true,
  };

  const created = await cafeService.createCafeWithAccess({
    auth,
    cafeData: {
      name: 'QR Separation Café',
      displayName: 'QR Separation Café',
      cafeType: 'STANDARD_CAFE',
      city: 'Kochi',
    },
  });

  const result = await cafeService.regenerateCafeLoginQr({
    organisationId,
    cafeId: created.cafe.cafeId,
    auth,
  });

  assert.ok(result.qrToken);
  assert.ok(result.securePublicCafeReference);
  assert.notEqual(result.qrToken, result.securePublicCafeReference);
  assert.ok(result.qrUrl.endsWith('/cafe-access/qr/' + result.qrToken));

  const cafe = await Cafe.findOne({
    organisationId,
    cafeId: created.cafe.cafeId,
  }).lean();

  assert.equal(
    cafe.qrLoginContext.securePublicCafeReference,
    result.securePublicCafeReference
  );
  assert.equal(
    cafe.qrLoginContext.securePublicCafeReference === result.qrToken,
    false,
    'secret QR credential must not be persisted as the public café reference'
  );
});
