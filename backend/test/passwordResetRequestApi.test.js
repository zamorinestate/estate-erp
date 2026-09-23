'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { createApp } = require('../src/server');
const { User } = require('../src/models/User');
const resetService = require('../src/services/passwordResetService');
const deliveryService = require('../src/services/passwordResetDeliveryService');

function request(server, body) {
  return new Promise(function executor(resolve, reject) {
    const req = http.request({ method: 'POST', hostname: '127.0.0.1', port: server.address().port, path: '/api/v1/auth/password/forgot', headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }, function onResponse(res) {
      let raw = '';
      res.on('data', function onData(chunk) { raw += chunk; });
      res.on('end', function onEnd() { resolve({ status: res.statusCode, body: JSON.parse(raw) }); });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function startServer(t) {
  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = await new Promise(function listen(resolve) { const instance = app.listen(0, function onListen() { resolve(instance); }); });
  t.after(function closeServer() { return new Promise(function close(resolve) { server.close(resolve); }); });
  return server;
}

test('forgot password checks delivery availability before user lookup', async function (t) {
  let userLookupCount = 0;
  t.mock.method(deliveryService, 'isPasswordResetDeliveryAvailable', function available() { return false; });
  t.mock.method(User, 'findOne', function findOne() { userLookupCount += 1; return null; });
  const server = await startServer(t);
  const response = await request(server, { organisationId: 'ORG-TEST', email: 'user@example.test' });
  assert.equal(response.status, 503);
  assert.ok(
    response.body.error.code === 'PASSWORD_RECOVERY_UNAVAILABLE' ||
      response.body.error.code === 'PASSWORD_RESET_DELIVERY_UNAVAILABLE'
  );
  assert.equal(userLookupCount, 0);
});

test('forgot password returns generic success for unknown account', async function (t) {
  t.mock.method(deliveryService, 'isPasswordResetDeliveryAvailable', function available() { return true; });
  t.mock.method(User, 'findOne', function findOne() { return null; });
  const server = await startServer(t);
  const response = await request(server, { organisationId: 'org-test', email: 'UNKNOWN@EXAMPLE.TEST' });
  assert.equal(response.status, 202);
  assert.equal(response.body.success, true);
  assert.ok(
    response.body.message.includes('If an eligible account exists') ||
      response.body.message.includes('If the account is eligible')
  );
  assert.equal(response.body.data, undefined);
});

test('forgot password delivers code for eligible account without exposing reset secrets', async function (t) {
  const user = { userId: 'MU-0001', organisationId: 'ORG-TEST', email: 'user@example.test', accountStatus: 'ACTIVE' };
  const challenge = { challengeId: 'PRC-20260809-0001' };
  let deliveredPayload = null;
  t.mock.method(deliveryService, 'isPasswordResetDeliveryAvailable', function available() { return true; });
  t.mock.method(User, 'findOne', function findOne(filter) { assert.deepEqual(filter, { organisationId: 'ORG-TEST', email: 'user@example.test' }); return user; });
  t.mock.method(resetService, 'isResetEligibleUser', function eligible() { return true; });
  t.mock.method(resetService, 'createPasswordResetChallenge', async function create() { return { challenge: challenge, code: '123456' }; });
  t.mock.method(deliveryService, 'deliverPasswordResetCode', async function deliver(payload) { deliveredPayload = payload; return { delivered: true, channel: 'TEST' }; });
  const server = await startServer(t);
  const response = await request(server, { organisationId: 'org-test', email: 'USER@EXAMPLE.TEST' });
  assert.equal(response.status, 202);
  assert.equal(response.body.success, true);
  assert.ok(
    response.body.message.includes('If an eligible account exists') ||
      response.body.message.includes('If the account is eligible')
  );
  assert.equal(JSON.stringify(response.body).includes('123456'), false);
  assert.equal(response.body.data?.challengeId, challenge.challengeId);
  assert.deepEqual(deliveredPayload, { recipientEmail: user.email, code: '123456', challengeId: challenge.challengeId });
});
