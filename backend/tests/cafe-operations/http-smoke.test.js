'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createApp } = require('../../src/cafe-operations/app');
const { initRepositories, getRepositories } = require('../../src/cafe-operations/repositories');
const deviceEnrollmentService = require('../../src/cafe-operations/services/deviceEnrollmentService');
const pinService = require('../../src/cafe-operations/services/operatorPinService');
const masterAuthAdapter = require('../../src/cafe-operations/services/masterAuthAdapter');
const rateLimitService = require('../../src/cafe-operations/services/rateLimitService');
const adminDeviceRoutes = require('../../src/cafe-operations/routes/adminDeviceRoutes');
const adminSessionRoutes = require('../../src/cafe-operations/routes/adminSessionRoutes');

let server, baseUrl;

test.before(async () => {
  const app = createApp();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/cafe-ops`;
});
test.after(async () => { await new Promise((resolve) => server.close(resolve)); });

test.beforeEach(() => {
  initRepositories('memory');
  rateLimitService._reset();
  masterAuthAdapter._resetDemoMasters();
});

// Small helper matching the real client's expectation: success responses
// carry .data, failure responses carry .error.{code,message}.
async function readBody(res) { return res.json(); }

async function seedCafeAOperator() {
  const repos = getRepositories();
  await repos.employees.seed({ id: 'empA', isActive: true, name: 'Rahul K', employeeCode: 'EMP-0042' });
  await repos.operatorAccess.create({ employeeId: 'empA', cafeId: 'cafeA', organisationId: 'org1', status: 'ACTIVE', assignedByEmployeeId: 'gov1' });
  const { plainPin: pinA } = await pinService.issueOrResetPin({ employeeId: 'empA', organisationId: 'org1', actingEmployeeId: 'gov1', pin: '307924' });
  const { codePlain } = await deviceEnrollmentService.createEnrollmentToken({ organisationId: 'org1', cafeId: 'cafeA', cafeDisplayName: 'Main Campus Cafe', intendedDisplayName: 'Main Counter Mobile', createdByEmployeeId: 'gov1' });
  const enrollRes = await fetch(`${baseUrl}/devices/enroll`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enrollmentCode: codePlain, displayName: 'Main Counter Mobile', platform: 'web' }) });
  const enrollBody = await readBody(enrollRes);
  return { deviceToken: enrollBody.data.deviceToken, deviceId: enrollBody.data.device.id, pinA };
}

function seedMaster({ identifier = 'primary@zamorin.test', employeeId = 'masterA', organisationId = 'org1', role = 'MASTER_PRIMARY', password = 'CorrectHorseBattery9!', mfaCode = null }) {
  masterAuthAdapter._seedDemoMaster({ identifier, employeeId, organisationId, role, password, mfaCode });
  const repos = getRepositories();
  repos.masters.seed({ id: employeeId, isActive: true, organisationId, role });
  return { identifier, employeeId, organisationId, role, password, mfaCode };
}

// =====================================================================
// OPERATOR PIN PATH
// =====================================================================

test('[Operator] full flow: enroll -> sign in -> session -> lock -> unlock -> end', async () => {
  const { deviceToken, pinA } = await seedCafeAOperator();

  const signin = await fetch(`${baseUrl}/operator/signin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ pin: pinA }) });
  assert.equal(signin.status, 200);
  const signinBody = await readBody(signin);
  assert.equal(signinBody.success, true);
  assert.equal(signinBody.data.operator.employeeCode, 'EMP-0042');
  assert.equal(signinBody.data.session.sessionType, 'OPERATOR_PIN');
  const token = signinBody.data.sessionToken;

  assert.equal((await fetch(`${baseUrl}/operator/session`, { headers: { 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': token } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/operator/lock`, { method: 'POST', headers: { 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': token } })).status, 200);

  const unlock = await fetch(`${baseUrl}/operator/unlock`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': token }, body: JSON.stringify({ pin: pinA }) });
  assert.equal(unlock.status, 200);

  assert.equal((await fetch(`${baseUrl}/operator/end`, { method: 'POST', headers: { 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': token } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/operator/session`, { headers: { 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': token } })).status, 401);
});

test('[Operator] wrong PIN -> generic failure, no enumeration', async () => {
  const { deviceToken } = await seedCafeAOperator();
  const res = await fetch(`${baseUrl}/operator/signin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ pin: '000001' }) });
  assert.equal(res.status, 401);
  const body = await readBody(res);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'UNABLE_TO_SIGN_IN');
});

test('[Operator] repeated wrong PINs throttle the device', async () => {
  const { deviceToken } = await seedCafeAOperator();
  let last;
  for (let i = 0; i < 6; i++) last = await fetch(`${baseUrl}/operator/signin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ pin: '000001' }) });
  assert.equal(last.status, 429);
  assert.equal((await readBody(last)).error.code, 'SIGNIN_TEMPORARILY_UNAVAILABLE');
});

test('[Operator] no device token is rejected before any PIN is checked', async () => {
  const res = await fetch(`${baseUrl}/operator/signin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: '307924' }) });
  assert.equal(res.status, 401);
  assert.equal((await readBody(res)).error.code, 'DEVICE_TOKEN_REQUIRED');
});

test('[Operator] forged identity fields in the request body are ignored — identity comes only from validated tokens', async () => {
  const { deviceToken, pinA } = await seedCafeAOperator();
  const res = await fetch(`${baseUrl}/operator/signin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ pin: pinA, employeeId: 'someone-else', cafeId: 'cafeB', deviceId: 'forged-device' }) });
  const body = await readBody(res);
  assert.equal(body.data.operator.employeeCode, 'EMP-0042');
  assert.equal(body.data.operator.cafeId, 'cafeA');
});

test('[Operator] Cafe A operator cannot sign in on a Cafe B device', async () => {
  const { plainPin } = await pinService.issueOrResetPin({ employeeId: 'empC', organisationId: 'org1', actingEmployeeId: 'gov1', pin: '918273' });
  const repos = getRepositories();
  await repos.employees.seed({ id: 'empC', isActive: true, name: 'Cafe B Operator', employeeCode: 'EMP-0200' });
  await repos.operatorAccess.create({ employeeId: 'empC', cafeId: 'cafeB', organisationId: 'org1', status: 'ACTIVE', assignedByEmployeeId: 'gov1' });

  const { codePlain } = await deviceEnrollmentService.createEnrollmentToken({ organisationId: 'org1', cafeId: 'cafeA', intendedDisplayName: 'Cafe A Device', createdByEmployeeId: 'gov1' });
  const enrollRes = await fetch(`${baseUrl}/devices/enroll`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enrollmentCode: codePlain, platform: 'web' }) });
  const { data } = await readBody(enrollRes);

  const res = await fetch(`${baseUrl}/operator/signin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': data.deviceToken }, body: JSON.stringify({ pin: plainPin }) });
  assert.equal(res.status, 401);
});

test('[Operator] employee with a correct PIN but NO Operator Access grant is denied — trusted device alone does not elevate', async () => {
  const { deviceToken } = await seedCafeAOperator();
  const repos = getRepositories();
  await repos.employees.seed({ id: 'staffX', isActive: true, name: 'Staff Member', employeeCode: 'EMP-0500' });
  const { plainPin } = await pinService.issueOrResetPin({ employeeId: 'staffX', organisationId: 'org1', actingEmployeeId: 'gov1', pin: '564738' });
  const res = await fetch(`${baseUrl}/operator/signin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ pin: plainPin }) });
  assert.equal(res.status, 401);
});

test('[Operator] used enrollment code cannot be reused', async () => {
  const { codePlain } = await deviceEnrollmentService.createEnrollmentToken({ organisationId: 'org1', cafeId: 'cafeA', intendedDisplayName: 'Dup Test', createdByEmployeeId: 'gov1' });
  const first = await fetch(`${baseUrl}/devices/enroll`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enrollmentCode: codePlain, platform: 'web' }) });
  assert.equal(first.status, 200);
  const second = await fetch(`${baseUrl}/devices/enroll`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enrollmentCode: codePlain, platform: 'web' }) });
  assert.equal(second.status, 400);
  assert.equal((await readBody(second)).error.code, 'ENROLLMENT_UNAVAILABLE');
});

test('[Operator] revoked device denies sign-in even with a correct PIN', async () => {
  const { deviceToken, deviceId, pinA } = await seedCafeAOperator();
  const deviceService = require('../../src/cafe-operations/services/deviceService');
  await deviceService.transitionLifecycle(deviceId, 'REVOKED', { actorEmployeeId: 'gov1', reason: 'test' });
  const res = await fetch(`${baseUrl}/operator/signin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ pin: pinA }) });
  assert.equal(res.status, 403);
});

test('[Operator] Switch Operator ends the old session and returns to the sign-in hub; a fresh sign-in creates a new session; device stays registered', async () => {
  const { deviceToken, pinA } = await seedCafeAOperator();
  const repos = getRepositories();
  await repos.employees.seed({ id: 'empB', isActive: true, name: 'Priya S', employeeCode: 'EMP-0091' });
  await repos.operatorAccess.create({ employeeId: 'empB', cafeId: 'cafeA', organisationId: 'org1', status: 'ACTIVE', assignedByEmployeeId: 'gov1' });
  const { plainPin: pinB } = await pinService.issueOrResetPin({ employeeId: 'empB', organisationId: 'org1', actingEmployeeId: 'gov1', pin: '451209' });

  const signinA = await fetch(`${baseUrl}/operator/signin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ pin: pinA }) });
  const { data: signinAData } = await readBody(signinA);
  const tokenA = signinAData.sessionToken;

  const switchRes = await fetch(`${baseUrl}/operator/end`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': tokenA }, body: JSON.stringify({ forSwitch: true }) });
  assert.equal(switchRes.status, 200);
  assert.equal((await readBody(switchRes)).data.nextScreen, 'OPERATOR_SIGN_IN');
  assert.equal((await fetch(`${baseUrl}/operator/session`, { headers: { 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': tokenA } })).status, 401);

  const signinB = await fetch(`${baseUrl}/operator/signin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ pin: pinB }) });
  assert.equal(signinB.status, 200);
  assert.equal((await readBody(signinB)).data.operator.employeeCode, 'EMP-0091');

  assert.equal((await fetch(`${baseUrl}/devices/status`, { headers: { 'x-cafeops-device-token': deviceToken } })).status, 200);
});

// =====================================================================
// MASTER ACCOUNT PATH
// =====================================================================

test('[Master] full flow, no MFA configured: credentials -> session -> lock -> unlock (password again) -> end', async () => {
  const { deviceToken } = await seedCafeAOperator();
  const m = seedMaster({});

  const signin = await fetch(`${baseUrl}/operator/master-signin/credentials`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ identifier: m.identifier, password: m.password }) });
  assert.equal(signin.status, 200);
  const body = await readBody(signin);
  assert.equal(body.data.session.sessionType, 'MASTER_ACCOUNT');
  assert.equal(body.data.session.actorRole, 'MASTER_PRIMARY');
  assert.equal(body.data.operator.role, 'MASTER_PRIMARY');
  const token = body.data.sessionToken;

  assert.equal((await fetch(`${baseUrl}/operator/lock`, { method: 'POST', headers: { 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': token } })).status, 200);

  const badUnlock = await fetch(`${baseUrl}/operator/unlock`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': token }, body: JSON.stringify({ password: 'wrong' }) });
  assert.equal(badUnlock.status, 401);

  const goodUnlock = await fetch(`${baseUrl}/operator/unlock`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': token }, body: JSON.stringify({ password: m.password }) });
  assert.equal(goodUnlock.status, 200);

  assert.equal((await fetch(`${baseUrl}/operator/end`, { method: 'POST', headers: { 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': token } })).status, 200);
});

test('[Master] MFA-configured account requires the second step before a session exists', async () => {
  const { deviceToken } = await seedCafeAOperator();
  const m = seedMaster({ mfaCode: '482913' });

  const step1 = await fetch(`${baseUrl}/operator/master-signin/credentials`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ identifier: m.identifier, password: m.password }) });
  const step1Body = (await readBody(step1)).data;
  assert.equal(step1Body.requiresMfa, true);
  assert.ok(step1Body.mfaChallengeId);
  assert.equal(step1Body.sessionToken, undefined);

  const badMfa = await fetch(`${baseUrl}/operator/master-signin/mfa`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ mfaChallengeId: step1Body.mfaChallengeId, code: '000000' }) });
  assert.equal(badMfa.status, 401);

  const goodMfa = await fetch(`${baseUrl}/operator/master-signin/mfa`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ mfaChallengeId: step1Body.mfaChallengeId, code: '482913' }) });
  assert.equal(goodMfa.status, 200);
  assert.ok((await readBody(goodMfa)).data.sessionToken);
});

test('[Master] wrong password -> generic Master failure, no enumeration of which account exists', async () => {
  const { deviceToken } = await seedCafeAOperator();
  const m = seedMaster({});
  const res = await fetch(`${baseUrl}/operator/master-signin/credentials`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ identifier: m.identifier, password: 'nope' }) });
  assert.equal(res.status, 401);
  assert.equal((await readBody(res)).error.code, 'MASTER_ACCESS_UNAVAILABLE');
});

test('[Master] unknown identifier fails exactly like a wrong password (no account-existence signal)', async () => {
  const { deviceToken } = await seedCafeAOperator();
  const res = await fetch(`${baseUrl}/operator/master-signin/credentials`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ identifier: 'nobody@zamorin.test', password: 'whatever' }) });
  assert.equal(res.status, 401);
  assert.equal((await readBody(res)).error.code, 'MASTER_ACCESS_UNAVAILABLE');
});

test('[Master] Master from a different organisation is denied on this device (wrong-organisation device)', async () => {
  const { deviceToken } = await seedCafeAOperator();
  const m = seedMaster({ organisationId: 'orgOther' });
  const res = await fetch(`${baseUrl}/operator/master-signin/credentials`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ identifier: m.identifier, password: m.password }) });
  assert.equal(res.status, 401);
});

test('[Master] inactive/suspended Master account is denied even with correct credentials', async () => {
  const { deviceToken } = await seedCafeAOperator();
  const m = seedMaster({});
  getRepositories().masters.setActive(m.employeeId, false);
  const res = await fetch(`${baseUrl}/operator/master-signin/credentials`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ identifier: m.identifier, password: m.password }) });
  assert.equal(res.status, 401);
});

test('[Master] revoked cafe device denies Master access exactly like it denies Operator access', async () => {
  const { deviceToken, deviceId } = await seedCafeAOperator();
  const m = seedMaster({});
  const deviceService = require('../../src/cafe-operations/services/deviceService');
  await deviceService.transitionLifecycle(deviceId, 'REVOKED', { actorEmployeeId: 'gov1', reason: 'test' });
  const res = await fetch(`${baseUrl}/operator/master-signin/credentials`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ identifier: m.identifier, password: m.password }) });
  assert.equal(res.status, 403);
});

test('[Master] an Operator PIN entered as a Master password does not work — the two credential spaces never cross', async () => {
  const { deviceToken, pinA } = await seedCafeAOperator();
  const res = await fetch(`${baseUrl}/operator/master-signin/credentials`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ identifier: 'empA', password: pinA }) });
  assert.equal(res.status, 401);
});

test('[Master] a bogus cafeId sent in the sign-in body has no effect — effectiveCafeId always comes from the device', async () => {
  const { deviceToken } = await seedCafeAOperator();
  const m = seedMaster({});
  const res = await fetch(`${baseUrl}/operator/master-signin/credentials`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ identifier: m.identifier, password: m.password, cafeId: 'cafeB-attempt' }) });
  const body = await readBody(res);
  assert.equal(body.data.operator.cafeId, 'cafeA');
});

test('[Master] Primary Master role is never rewritten to CAFE_ADMIN', async () => {
  const { deviceToken } = await seedCafeAOperator();
  const m = seedMaster({});
  const res = await fetch(`${baseUrl}/operator/master-signin/credentials`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ identifier: m.identifier, password: m.password }) });
  const body = await readBody(res);
  assert.equal(res.status, 200);
  assert.equal(body.data.session.actorRole, 'MASTER_PRIMARY');
  assert.notEqual(body.data.session.actorRole, 'CAFE_ADMIN');
});

test('[Master] non-primary Master is rejected from Cafe Operations', async () => {
  const { deviceToken } = await seedCafeAOperator();
  const m = seedMaster({
    identifier: 'nonprimary@zamorin.test',
    employeeId: 'master-nonprimary',
    role: 'MASTER',
  });
  const res = await fetch(`${baseUrl}/operator/master-signin/credentials`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ identifier: m.identifier, password: m.password }) });
  const body = await readBody(res);
  assert.equal(res.status, 401);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'MASTER_ACCESS_UNAVAILABLE');
});

// =====================================================================
// CROSS-PATH: switching between Operator and Master in both directions
// =====================================================================

test('[Cross-path] Operator -> Switch -> Master, and Master -> Switch -> Operator both produce a brand new session, never an upgraded one', async () => {
  const { deviceToken, pinA } = await seedCafeAOperator();
  const m = seedMaster({});

  const opSignin = await fetch(`${baseUrl}/operator/signin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ pin: pinA }) });
  const opToken = (await readBody(opSignin)).data.sessionToken;

  await fetch(`${baseUrl}/operator/end`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': opToken }, body: JSON.stringify({ forSwitch: true }) });

  const masterSignin = await fetch(`${baseUrl}/operator/master-signin/credentials`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ identifier: m.identifier, password: m.password }) });
  const masterBody = (await readBody(masterSignin)).data;
  assert.equal(masterBody.session.sessionType, 'MASTER_ACCOUNT');
  const masterToken = masterBody.sessionToken;

  assert.equal((await fetch(`${baseUrl}/operator/session`, { headers: { 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': opToken } })).status, 401);

  await fetch(`${baseUrl}/operator/end`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': masterToken }, body: JSON.stringify({ forSwitch: true }) });
  const opSignin2 = await fetch(`${baseUrl}/operator/signin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ pin: pinA }) });
  assert.equal(opSignin2.status, 200);
  assert.equal((await readBody(opSignin2)).data.session.sessionType, 'OPERATOR_PIN');
});

// =====================================================================
// GOVERNANCE: reassignment and remote termination force-end live sessions
// =====================================================================

function buildTestAdminApp(caller) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = caller; next(); });
  app.use('/admin/devices', adminDeviceRoutes);
  app.use('/admin/operator-sessions', adminSessionRoutes);
  return app;
}

test('[Governance] reassigning a device to a different cafe force-ends its live session', async () => {
  const { deviceToken, deviceId } = await seedCafeAOperator();
  const repos = getRepositories();
  await repos.employees.seed({ id: 'empA', isActive: true, name: 'Rahul K', employeeCode: 'EMP-0042' });
  const pin = await pinService.issueOrResetPin({ employeeId: 'empA', organisationId: 'org1', actingEmployeeId: 'gov1' });

  const signin = await fetch(`${baseUrl}/operator/signin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ pin: pin.plainPin }) });
  const sessionToken = (await readBody(signin)).data.sessionToken;
  assert.equal((await fetch(`${baseUrl}/operator/session`, { headers: { 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': sessionToken } })).status, 200);

  const adminApp = buildTestAdminApp({ employeeId: 'gov1', role: 'MASTER_PRIMARY', organisationId: 'org1' });
  const adminServer = http.createServer(adminApp);
  await new Promise((resolve) => adminServer.listen(0, resolve));
  const adminBase = `http://127.0.0.1:${adminServer.address().port}`;

  const reassignRes = await fetch(`${adminBase}/admin/devices/${deviceId}/reassign-cafe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ newCafeId: 'cafeZ', reason: 'test relocation' }) });
  assert.equal(reassignRes.status, 200);

  assert.equal((await fetch(`${baseUrl}/operator/session`, { headers: { 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': sessionToken } })).status, 401);
  await new Promise((resolve) => adminServer.close(resolve));
});

test('[Governance] remote session termination denies the very next request from that device', async () => {
  const { deviceToken } = await seedCafeAOperator();
  const repos = getRepositories();
  await repos.employees.seed({ id: 'empA', isActive: true, name: 'Rahul K', employeeCode: 'EMP-0042' });
  const pin = await pinService.issueOrResetPin({ employeeId: 'empA', organisationId: 'org1', actingEmployeeId: 'gov1' });
  const signin = await fetch(`${baseUrl}/operator/signin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ pin: pin.plainPin }) });
  const sessionToken = (await readBody(signin)).data.sessionToken;
  const sessionRecord = (await repos.sessions.listByCafe('cafeA'))[0];

  const adminApp = buildTestAdminApp({ employeeId: 'gov1', role: 'OWNER', organisationId: 'org1' });
  const adminServer = http.createServer(adminApp);
  await new Promise((resolve) => adminServer.listen(0, resolve));
  const adminBase = `http://127.0.0.1:${adminServer.address().port}`;

  const endRes = await fetch(`${adminBase}/admin/operator-sessions/${sessionRecord.id}/end`, { method: 'POST' });
  assert.equal(endRes.status, 200);
  assert.equal((await fetch(`${baseUrl}/operator/session`, { headers: { 'x-cafeops-device-token': deviceToken, 'x-cafeops-session-token': sessionToken } })).status, 401);
  await new Promise((resolve) => adminServer.close(resolve));
});

// =====================================================================
// Neither auth path creates the wrong kind of side effect
// =====================================================================

test('[Separation] nothing in the Cafe Operations auth/session source imports an attendance module or calls anything that creates/records attendance', () => {
  const fs = require('fs');
  const path = require('path');
  const dirs = ['../../src/cafe-operations/routes', '../../src/cafe-operations/services'].map((d) => path.join(__dirname, d));
  const forbiddenImport = /require\(\s*['"][^'"]*attendance[^'"]*['"]\s*\)/i;
  const forbiddenCall = /attendance(Service|Model|Repository|Repo)?\s*\.\s*(create|record|mark|checkIn|log)/i;
  for (const dir of dirs) {
    for (const file of fs.readdirSync(dir)) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      assert.doesNotMatch(source, forbiddenImport, `${file} should not import an attendance module`);
      assert.doesNotMatch(source, forbiddenCall, `${file} should not call anything that creates/records attendance`);
    }
  }
});

test('[Boundary] nothing in this module references Personal Ledger or the Expense approve/reject/pay/reverse actions', () => {
  const fs = require('fs');
  const path = require('path');
  const dirs = ['../../src/cafe-operations/routes', '../../src/cafe-operations/services', '../../src/cafe-operations/middleware', '../../src/cafe-operations/models'].map((d) => path.join(__dirname, d));
  const forbidden = /personal.?ledger|\bapprove\b|\breject\b|\breverse\b/i;
  for (const dir of dirs) {
    for (const file of fs.readdirSync(dir)) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      assert.doesNotMatch(source, forbidden, `${file} should not reference Personal Ledger or Expense approval authority`);
    }
  }
});

test('[Envelope] every response follows the real client contract: success carries .data, failure carries .error.code/.message', async () => {
  const { deviceToken } = await seedCafeAOperator();
  const okRes = await readBody(await fetch(`${baseUrl}/devices/status`, { headers: { 'x-cafeops-device-token': deviceToken } }));
  assert.equal(okRes.success, true);
  assert.ok(okRes.data);
  assert.equal(okRes.error, undefined);

  const failRes = await readBody(await fetch(`${baseUrl}/operator/signin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ pin: '000001' }) }));
  assert.equal(failRes.success, false);
  assert.ok(failRes.error.code);
  assert.ok(failRes.error.message);
  assert.equal(failRes.data, undefined);
});

test('[Display] cafeDisplayName set at enrollment flows through to device status and to sign-in responses — display-only, never used for authorization', async () => {
  const { deviceToken, pinA } = await seedCafeAOperator();
  const statusBody = await readBody(await fetch(`${baseUrl}/devices/status`, { headers: { 'x-cafeops-device-token': deviceToken } }));
  assert.equal(statusBody.data.diagnostics.cafeName, 'Main Campus Cafe');

  const signinBody = await readBody(await fetch(`${baseUrl}/operator/signin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cafeops-device-token': deviceToken }, body: JSON.stringify({ pin: pinA }) }));
  assert.equal(signinBody.data.operator.cafeName, 'Main Campus Cafe');
});
