'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { authorize } = require('../src/middleware/authorize');

const CAFE_A = 'ZC-8801';
const CAFE_B = 'ZC-8802';

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function execute({
  auth,
  params = {},
  body = {},
  query = {},
  cafeRequired = true,
  allowedRoles = ['OWNER', 'CAFE_ADMIN', 'STAFF', 'MASTER'],
}) {
  const request = {
    auth,
    params,
    body,
    query,
    headers: {},
    method: 'POST',
    originalUrl: '/p2/multi-cafe',
    correlationId: 'P2-MULTI-CAFE',
  };
  const response = makeResponse();
  let nextCalled = false;

  await authorize('P2_MULTI_CAFE_EXECUTION', {
    allowedRoles,
    cafeRequired,
  })(request, response, () => {
    nextCalled = true;
  });

  return { request, response, nextCalled };
}

const scopedStaff = Object.freeze({
  userId: 'ST-8801',
  organisationId: 'ZAMORIN_P2',
  role: 'STAFF',
  isPrimaryMaster: false,
  assignedCafeIds: [CAFE_A],
  primaryCafeId: CAFE_A,
});

for (const vector of [
  { name: 'params.cafeId', shape: { params: { cafeId: CAFE_B } } },
  { name: 'body.cafeId', shape: { body: { cafeId: CAFE_B } } },
  { name: 'body.sourceCafeId', shape: { body: { sourceCafeId: CAFE_B } } },
  { name: 'body.destCafeId', shape: { body: { destCafeId: CAFE_B } } },
  { name: 'query.cafeId', shape: { query: { cafeId: CAFE_B } } },
]) {
  test(`P2-03 attack: cross-cafe tampering through ${vector.name} is denied`, async () => {
    const result = await execute({
      auth: { ...scopedStaff },
      ...vector.shape,
    });

    assert.equal(result.nextCalled, false);
    assert.equal(result.response.statusCode, 403);
    assert.equal(result.response.body?.error?.code, 'CAFE_ACCESS_DENIED');
  });
}

test('P2-03 baseline: assigned café scope is accepted', async () => {
  const result = await execute({
    auth: { ...scopedStaff },
    params: { cafeId: CAFE_A },
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.request.authorization?.cafeId, CAFE_A);
});

test('P2-03 attack: missing café scope fails closed when café scope is required', async () => {
  const result = await execute({
    auth: { ...scopedStaff },
  });

  assert.equal(result.nextCalled, false);
  assert.equal(result.response.statusCode, 400);
  assert.equal(result.response.body?.error?.code, 'CAFE_SCOPE_REQUIRED');
});

test('P2-03 attack: Owner cannot use organisation role to escape assigned café scope', async () => {
  const result = await execute({
    auth: {
      userId: 'OW-8801',
      organisationId: 'ZAMORIN_P2',
      role: 'OWNER',
      isPrimaryMaster: false,
      assignedCafeIds: [CAFE_A],
      primaryCafeId: CAFE_A,
    },
    query: { cafeId: CAFE_B },
  });

  assert.equal(result.nextCalled, false);
  assert.equal(result.response.statusCode, 403);
  assert.equal(result.response.body?.error?.code, 'CAFE_ACCESS_DENIED');
});

test('P2-03 attack: Café Admin cannot cross into another assigned-independent café', async () => {
  const result = await execute({
    auth: {
      userId: 'AD-8801',
      organisationId: 'ZAMORIN_P2',
      role: 'CAFE_ADMIN',
      isPrimaryMaster: false,
      assignedCafeIds: [CAFE_A],
      primaryCafeId: CAFE_A,
    },
    body: { cafeId: CAFE_B },
  });

  assert.equal(result.nextCalled, false);
  assert.equal(result.response.statusCode, 403);
  assert.equal(result.response.body?.error?.code, 'CAFE_ACCESS_DENIED');
});

test('P2-03 attack: malformed non-primary MASTER has zero cross-café authority', async () => {
  const result = await execute({
    auth: {
      userId: 'MU-INVALID',
      organisationId: 'ZAMORIN_P2',
      role: 'MASTER',
      isPrimaryMaster: false,
      assignedCafeIds: [CAFE_A, CAFE_B],
    },
    params: { cafeId: CAFE_A },
  });

  assert.equal(result.nextCalled, false);
  assert.equal(result.response.statusCode, 403);
  assert.equal(result.response.body?.error?.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
});

test('P2-03 baseline: designated Primary Master can cross café boundaries', async () => {
  const result = await execute({
    auth: {
      userId: 'MU-8801',
      organisationId: 'ZAMORIN_P2',
      role: 'MASTER',
      isPrimaryMaster: true,
      assignedCafeIds: [],
    },
    params: { cafeId: CAFE_B },
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.response.statusCode, 200);
});
