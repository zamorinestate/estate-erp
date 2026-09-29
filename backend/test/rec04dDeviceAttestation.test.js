'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const attestationService = require('../src/services/deviceAttestationService');
const { PosOrderService } = require('../src/services/posOrderService');
const { PrintJob } = require('../src/models/PrintJob');
const { Bill } = require('../src/models/Bill');
const { OperatorSession } = require('../src/models/OperatorSession');
const { DeviceRegistration } = require('../src/models/DeviceRegistration');
const auditService = require('../src/services/auditService');
const cafeDeviceService = require('../src/cafe-operations/services/deviceService');
const cafeRepositories = require('../src/cafe-operations/repositories');

const root = path.join(__dirname, '..', '..');
const androidBridgePath = path.join(root, 'Platform', 'Android', 'app', 'src', 'main', 'java', 'com', 'zamorin', 'cafe', 'erp', 'ZamorinNativeBridge.kt');
const androidPrintManagerPath = path.join(root, 'Platform', 'Android', 'app', 'src', 'main', 'java', 'com', 'zamorin', 'cafe', 'erp', 'ZamorinPrintManager.kt');
const androidPrintAttestationStorePath = path.join(root, 'Platform', 'Android', 'app', 'src', 'main', 'java', 'com', 'zamorin', 'cafe', 'erp', 'ZamorinPrintAttestationStore.kt');
const windowsBridgePath = path.join(root, 'Platform', 'Windows', 'ZamorinCafeERP', 'ZamorinNativeBridge.cs');
const iosBridgePath = path.join(root, 'Platform', 'Apple', 'ios', 'ZamorinCafeERP', 'ZamorinNativeBridge.swift');
const macBridgePath = path.join(root, 'Platform', 'Apple', 'macos', 'ZamorinCafeERP', 'ZamorinNativeBridge.swift');
const frontendAttestationPath = path.join(root, 'frontend', 'src', 'js', 'utils', 'deviceAttestation.js');
const routerPath = path.join(root, 'frontend', 'src', 'js', 'router.js');
const posTillPath = path.join(root, 'frontend', 'src', 'js', 'pages', 'posTill.js');
const hardwareBridgeServicePath = path.join(root, 'backend', 'src', 'services', 'hardwareBridgeService.js');
const deviceEnrollmentRoutesPath = path.join(root, 'backend', 'src', 'cafe-operations', 'routes', 'deviceEnrollmentRoutes.js');

function makeKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  return {
    publicJwk: publicKey.export({ format: 'jwk' }),
    privateKey,
  };
}

function signPayload(privateKey, payload) {
  return crypto.sign(
    'sha256',
    Buffer.from(payload, 'utf8'),
    { key: privateKey, dsaEncoding: 'der' }
  ).toString('base64url');
}

function activeAuth() {
  return {
    userId: 'EMP-ZC-1001',
    role: 'STAFF',
    organisationId: 'ORG-ZAMORIN',
    operatorSessionId: 'OPS-DV-ZC0001-POS-01',
    assignedCafeIds: ['ZC-0001'],
    primaryCafeId: 'ZC-0001',
    deviceContext: {
      deviceId: 'DV-ZC0001-POS-01',
      deviceClass: 'CAFE_OWNED',
      boundCafeId: 'ZC-0001',
      status: 'ACTIVE',
      trustLevel: 'ENROLLED',
    },
  };
}

test('REC-04D — ES256 verifier accepts exact payload and rejects tampering/private JWK', () => {
  const { publicJwk, privateKey } = makeKeyPair();
  const canonical = attestationService.canonicalPublicJwk(publicJwk);
  const parsed = JSON.parse(canonical);

  assert.deepEqual(Object.keys(parsed), ['crv', 'kty', 'x', 'y']);
  assert.equal(parsed.crv, 'P-256');
  assert.equal(parsed.kty, 'EC');

  const payload = attestationService.buildPrintAckPayload({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    deviceId: 'DV-ZC0001-POS-01',
    printJobId: 'PJ-PRT-REC04D-001',
    challenge: 'challenge-rec04d-001',
    status: 'PRINTED',
    drawerKickStatus: 'UNCHANGED',
    failureCode: 'NONE',
    failureReason: '',
  });

  const signature = signPayload(privateKey, payload);
  const proof = attestationService.verifyPrintAckSignature({
    publicSigningKey: canonical,
    signatureBase64Url: signature,
    payload,
  });

  assert.equal(proof.verified, true);
  assert.equal(proof.keyThumbprint, attestationService.publicKeyThumbprint(publicJwk));
  assert.match(proof.signatureHash, /^[a-f0-9]{64}$/);

  assert.throws(
    () => attestationService.verifyPrintAckSignature({
      publicSigningKey: canonical,
      signatureBase64Url: signature,
      payload: payload.replace('status=PRINTED', 'status=FAILED'),
    }),
    (err) => err.code === 'DEVICE_ATTESTATION_SIGNATURE_INVALID'
  );

  const privateJwk = privateKey.export({ format: 'jwk' });
  assert.ok(privateJwk.d);
  assert.throws(
    () => attestationService.canonicalPublicJwk(privateJwk),
    (err) => err.code === 'INVALID_DEVICE_SIGNING_KEY'
  );
});

test('REC-04D — attested print acknowledgement is nonce/key/job/device bound', async (t) => {
  const { publicJwk, privateKey } = makeKeyPair();
  const publicSigningKey = attestationService.canonicalPublicJwk(publicJwk);
  const keyThumbprint = attestationService.publicKeyThumbprint(publicSigningKey);

  const job = {
    printJobId: 'PJ-PRT-REC04D-002',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    billId: 'BILL-REC04D-002',
    jobType: 'RECEIPT',
    status: 'DISPATCHED',
    requestedAt: new Date('2026-09-29T05:00:00Z'),
    dispatchedDeviceId: 'DV-ZC0001-POS-01',
    ackChallenge: 'nonce-rec04d-002',
    ackChallengeIssuedAt: new Date('2026-09-29T05:00:00Z'),
    attestationRequired: true,
    attestationKeyThumbprint: keyThumbprint,
    attestationVerifiedAt: null,
    ackSignatureHash: null,
    drawerKickRequested: false,
    drawerKickStatus: 'NOT_REQUESTED',
    failureCode: null,
    failureReason: null,
    acknowledgedByDeviceId: null,
    acknowledgedAt: null,
    completedAt: null,
    async save() { return this; },
  };

  const bill = {
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    billId: 'BILL-REC04D-002',
    printStatus: 'PRINT_DISPATCHED',
    printJobs: [{
      printJobId: job.printJobId,
      jobType: 'RECEIPT',
      status: 'DISPATCHED',
      dispatchedDeviceId: job.dispatchedDeviceId,
      attestationRequired: true,
      attestationKeyThumbprint: keyThumbprint,
      drawerKickRequested: false,
      drawerKickStatus: 'NOT_REQUESTED',
    }],
    async save() { return this; },
  };

  const registration = {
    deviceId: 'DV-ZC0001-POS-01',
    organisationId: 'ORG-ZAMORIN',
    assignedCafeId: 'ZC-0001',
    status: 'ACTIVE',
    publicSigningKey,
    signingKeyAlgorithm: 'ES256',
    signingKeyThumbprint: keyThumbprint,
  };

  t.mock.method(OperatorSession, 'findOne', () => ({
    lean: async () => ({
      operatorSessionId: 'OPS-DV-ZC0001-POS-01',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      deviceId: 'DV-ZC0001-POS-01',
      operatorUserId: 'EMP-ZC-1001',
      status: 'ACTIVE',
    }),
  }));
  t.mock.method(PrintJob, 'findOne', async () => job);
  t.mock.method(Bill, 'findOne', async () => bill);
  t.mock.method(DeviceRegistration, 'findOne', () => ({ lean: async () => registration }));
  t.mock.method(DeviceRegistration, 'updateOne', async () => ({ acknowledged: true, modifiedCount: 1 }));
  t.mock.method(auditService, 'recordAuditEvent', async () => ({}));

  const auth = activeAuth();

  await assert.rejects(
    () => PosOrderService.acknowledgePrintJob(job.printJobId, auth, {
      status: 'PRINTED',
      attestation: null,
    }),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'DEVICE_ATTESTATION_SIGNATURE_REQUIRED');
      return true;
    }
  );
  assert.equal(job.status, 'DISPATCHED');

  const tamperedPayload = attestationService.buildPrintAckPayload({
    organisationId: job.organisationId,
    cafeId: job.cafeId,
    deviceId: job.dispatchedDeviceId,
    printJobId: job.printJobId,
    challenge: job.ackChallenge,
    status: 'FAILED',
    drawerKickStatus: 'UNCHANGED',
    failureCode: 'DEVICE_PRINT_FAILED',
    failureReason: 'Physical print device reported failure.',
  });

  await assert.rejects(
    () => PosOrderService.acknowledgePrintJob(job.printJobId, auth, {
      status: 'PRINTED',
      attestation: { signature: signPayload(privateKey, tamperedPayload) },
    }),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'DEVICE_ATTESTATION_SIGNATURE_INVALID');
      return true;
    }
  );
  assert.equal(job.status, 'DISPATCHED');

  const validPayload = attestationService.buildPrintAckPayload({
    organisationId: job.organisationId,
    cafeId: job.cafeId,
    deviceId: job.dispatchedDeviceId,
    printJobId: job.printJobId,
    challenge: job.ackChallenge,
    status: 'PRINTED',
    drawerKickStatus: 'UNCHANGED',
    failureCode: 'NONE',
    failureReason: '',
  });

  const result = await PosOrderService.acknowledgePrintJob(job.printJobId, auth, {
    status: 'PRINTED',
    attestation: {
      signature: signPayload(privateKey, validPayload),
      keyThumbprint,
    },
  });

  assert.equal(result.status, 'PRINTED');
  assert.equal(result.attestationRequired, true);
  assert.equal(result.attestationVerified, true);
  assert.match(job.ackSignatureHash, /^[a-f0-9]{64}$/);
  assert.ok(job.attestationVerifiedAt instanceof Date);
  assert.equal(bill.printJobs[0].attestationKeyThumbprint, keyThumbprint);
  assert.match(bill.printJobs[0].ackSignatureHash, /^[a-f0-9]{64}$/);
});

test('REC-04D — key replacement after dispatch cannot acknowledge old challenge', async (t) => {
  const original = makeKeyPair();
  const replacement = makeKeyPair();
  const originalPublic = attestationService.canonicalPublicJwk(original.publicJwk);
  const originalThumb = attestationService.publicKeyThumbprint(originalPublic);
  const replacementPublic = attestationService.canonicalPublicJwk(replacement.publicJwk);
  const replacementThumb = attestationService.publicKeyThumbprint(replacementPublic);

  const job = {
    printJobId: 'PJ-PRT-REC04D-003',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    billId: 'BILL-REC04D-003',
    jobType: 'RECEIPT',
    status: 'DISPATCHED',
    dispatchedDeviceId: 'DV-ZC0001-POS-01',
    ackChallenge: 'nonce-rec04d-003',
    attestationRequired: true,
    attestationKeyThumbprint: originalThumb,
    drawerKickRequested: false,
    drawerKickStatus: 'NOT_REQUESTED',
    async save() { return this; },
  };

  t.mock.method(OperatorSession, 'findOne', () => ({ lean: async () => ({ status: 'ACTIVE' }) }));
  t.mock.method(PrintJob, 'findOne', async () => job);
  t.mock.method(DeviceRegistration, 'findOne', () => ({
    lean: async () => ({
      deviceId: job.dispatchedDeviceId,
      organisationId: job.organisationId,
      assignedCafeId: job.cafeId,
      status: 'ACTIVE',
      publicSigningKey: replacementPublic,
      signingKeyAlgorithm: 'ES256',
      signingKeyThumbprint: replacementThumb,
    }),
  }));

  await assert.rejects(
    () => PosOrderService.acknowledgePrintJob(job.printJobId, activeAuth(), {
      status: 'PRINTED',
      attestation: { signature: 'MEUCIQDUMMY' },
    }),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'DEVICE_ATTESTATION_KEY_CHANGED');
      return true;
    }
  );
});

test('REC-04D — post-enrollment first signing-key bind is refused and requires controlled re-enrollment', async (t) => {
  cafeRepositories.resetRepositories();
  const repos = cafeRepositories.initRepositories('memory');
  const device = await repos.devices.create({
    deviceCode: 'DV-LEGACY-REC04D',
    displayName: 'Legacy Counter',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    platform: 'android',
    lifecycleStatus: 'ACTIVE',
    deviceTokenHash: 'legacy-token-hash',
    signingKeyThumbprint: null,
  });

  const { publicJwk } = makeKeyPair();
  const canonical = {
    publicSigningKey: null,
    signingKeyThumbprint: null,
    signingKeyAlgorithm: null,
    signingKeyProvider: null,
    signingKeyCreatedAt: null,
    platform: 'ANDROID',
    metadata: { existing: true },
    async save() {
      throw new Error('canonical save must not run for an unbound post-enrollment bootstrap');
    },
  };

  t.mock.method(DeviceRegistration, 'findOne', async () => canonical);

  await assert.rejects(
    () => cafeDeviceService.bindAttestationKey(device, {
      publicSigningKey: publicJwk,
      signingKeyAlgorithm: 'ES256',
      signingKeyProvider: 'ANDROID_KEYSTORE',
    }),
    (err) => {
      assert.equal(err.code, 'DEVICE_ATTESTATION_REENROLLMENT_REQUIRED');
      return true;
    }
  );

  assert.equal(canonical.publicSigningKey, null);
  assert.equal(canonical.signingKeyThumbprint, null);
  assert.equal(canonical.signingKeyProvider, null);

  cafeRepositories.resetRepositories();
});
test('REC-04D — native bridges keep private signing keys inside platform stores', () => {
  const android = fs.readFileSync(androidBridgePath, 'utf8');
  const windows = fs.readFileSync(windowsBridgePath, 'utf8');
  const ios = fs.readFileSync(iosBridgePath, 'utf8');
  const mac = fs.readFileSync(macBridgePath, 'utf8');
  const frontend = fs.readFileSync(frontendAttestationPath, 'utf8');
  const router = fs.readFileSync(routerPath, 'utf8');
  const deviceEnrollmentRoutes = fs.readFileSync(deviceEnrollmentRoutesPath, 'utf8');

  assert.match(android, /AndroidKeyStore/);
  assert.match(android, /KeyGenParameterSpec/);
  assert.match(android, /SHA256withECDSA/);
  assert.match(android, /ATTEST_PRINT_JOB_RESULT/);
  assert.match(android, /DEVICE_ATTESTATION_DIRECT_SIGNING_DISABLED/);

  assert.match(windows, /CngKey/);
  assert.match(windows, /ECDsaP256/);
  assert.match(windows, /DEVICE_ATTESTATION_DIRECT_SIGNING_DISABLED/);

  for (const apple of [ios, mac]) {
    assert.match(apple, /kSecAttrTokenIDSecureEnclave/);
    assert.match(apple, /SecKeyCreateRandomKey/);
    assert.match(apple, /DEVICE_ATTESTATION_DIRECT_SIGNING_DISABLED/);
  }

  assert.match(frontend, /GET_DEVICE_ATTESTATION_KEY/);
  assert.doesNotMatch(frontend, /SIGN_DEVICE_ATTESTATION/);
  assert.match(frontend, /DEVICE_ATTESTATION_SIGNATURE_MISSING/);
  assert.match(frontend, /ensureNativeDeviceAttestationBinding/);
  assert.match(frontend, /\/cafe-ops\/devices\/attestation\/key/);
  assert.match(router, /publicSigningKey: signingIdentity\.capable \? signingIdentity\.publicKeyJwk : null/);
  assert.match(router, /onSignIn:\s*async\s*\(\)\s*=>\s*\{[\s\S]{0,900}?await ensureNativeDeviceAttestationBinding\(\)[\s\S]{0,900}?navigate\("dashboard"\)/);
  assert.match(router, /DEVICE_ATTESTATION_KEY_ROTATION_REQUIRES_REENROLLMENT/);
  assert.match(router, /DEVICE_ATTESTATION_REENROLLMENT_REQUIRED/);
  assert.match(
    deviceEnrollmentRoutes,
    /router\.post\('\/attestation\/key',\s*deviceContext,\s*authenticate,/,
    'Post-enrollment identity verification still requires both device and authenticated operator context'
  );
  assert.match(deviceEnrollmentRoutes, /DEVICE_ATTESTATION_REENROLLMENT_REQUIRED/);
});

test('REC-04D — Android spooler terminal state is the only native path that can produce signed PRINTED', () => {
  const printManager = fs.readFileSync(androidPrintManagerPath, 'utf8');
  const androidBridge = fs.readFileSync(androidBridgePath, 'utf8');
  const bindingStore = fs.readFileSync(androidPrintAttestationStorePath, 'utf8');
  const frontend = fs.readFileSync(frontendAttestationPath, 'utf8');

  assert.match(printManager, /printJob\.isCompleted\s*->\s*"COMPLETED"/);
  assert.match(printManager, /printJob\.isFailed\s*->\s*"FAILED"/);
  assert.match(printManager, /printJob\.isCancelled\s*->\s*"CANCELLED"/);
  assert.match(printManager, /spoolerCompletionVerified\s*=\s*status\s*==\s*"COMPLETED"/);

  assert.match(bindingStore, /fun bind\(/);
  assert.match(bindingStore, /fun get\(/);
  assert.match(bindingStore, /MAX_AGE_MS/);

  assert.match(androidBridge, /"ATTEST_PRINT_JOB_RESULT"/);
  assert.match(androidBridge, /ZamorinPrintAttestationStore\.get\(context, platformJobId\)/);
  assert.match(androidBridge, /ZamorinPrintManager\.getPrintJobStatus\(context, platformJobId\)/);
  assert.match(androidBridge, /"COMPLETED"\s*->\s*\{/);
  assert.match(androidBridge, /acknowledgementStatus = "PRINTED"/);
  assert.match(androidBridge, /Signature\.getInstance\("SHA256withECDSA"\)/);
  assert.match(androidBridge, /DEVICE_ATTESTATION_DIRECT_SIGNING_DISABLED/);

  assert.match(frontend, /monitorAndroidPrintAndAcknowledge/);
  assert.match(frontend, /'ATTEST_PRINT_JOB_RESULT'/);
  assert.match(frontend, /status === 'PRINTED'/);
  assert.match(frontend, /attestedResult\.spoolerCompletionVerified !== true/);
  assert.match(frontend, /ANDROID_PHYSICAL_COMPLETION_OVERCLAIM/);
  assert.doesNotMatch(frontend, /SIGN_DEVICE_ATTESTATION/);
});

test('REC-04D — SAVE_AND_PRINT consumes one canonical PrintJob and browser fallback cannot self-acknowledge', () => {
  const posTill = fs.readFileSync(posTillPath, 'utf8');
  const hardware = fs.readFileSync(hardwareBridgeServicePath, 'utf8');

  assert.match(posTill, /function openReceiptModal\(bill, isReprint = false, initialDispatch = null\)/);
  assert.match(posTill, /let pendingInitialDispatch = initialDispatch\?\.printJobId \? initialDispatch : null/);
  assert.match(posTill, /let dispatch = pendingInitialDispatch;\s*pendingInitialDispatch = null;/);
  assert.match(posTill, /if \(pendingInitialDispatch\)[\s\S]{0,300}?printThermal\(\)/);
  assert.match(posTill, /monitorAndroidPrintAndAcknowledge\(dispatch, nativeResponse\)/);
  assert.match(posTill, /attestationContext:[\s\S]{0,300}?dispatch\?\.attestationContext/);
  assert.match(posTill, /drawerKickRequested:\s*Boolean\(dispatch\.drawerKickRequested\)/);
  assert.match(posTill, /window\.print\(\);[\s\S]{0,180}?physicalCompletionVerified:\s*false/);

  assert.doesNotMatch(
    hardware,
    /paymentMethod\s*===\s*['"]CASH['"]\s*\|\|\s*orderData\.triggerDrawerKick/,
    'Historical CASH tender must never infer a new drawer kick during PRINT or REPRINT'
  );
  assert.match(
    hardware,
    /terminal\.drawerConfig\?\.enabled\s*&&\s*orderData\.triggerDrawerKick\s*===\s*true/
  );
});

test('REC-04D — concurrent reuse of one enrollment code creates exactly one trusted device', async (t) => {
  cafeRepositories.resetRepositories();
  const repos = cafeRepositories.initRepositories('memory');
  const enrollmentCode = 'REC04D-RACE-ENROLLMENT';
  const tokenHash = crypto.createHash('sha256').update(enrollmentCode).digest('hex');

  await repos.enrollmentTokens.create({
    tokenHash,
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    cafeDisplayName: 'Race Test Cafe',
    intendedDisplayName: 'Race POS',
    createdByEmployeeId: 'MU-PRIMARY-01',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 60_000),
  });

  t.mock.method(DeviceRegistration, 'findOneAndUpdate', async (_query, update) => ({
    ...update,
    save: async function save() { return this; },
  }));

  const attempts = await Promise.allSettled([
    cafeDeviceService.enrollDevice({
      enrollmentCodePlain: enrollmentCode,
      displayName: 'Race POS A',
      platform: 'android',
    }),
    cafeDeviceService.enrollDevice({
      enrollmentCodePlain: enrollmentCode,
      displayName: 'Race POS B',
      platform: 'android',
    }),
  ]);

  assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter((r) => r.status === 'rejected').length, 1);
  const rejected = attempts.find((r) => r.status === 'rejected');
  assert.equal(rejected.reason.code, 'ENROLLMENT_UNAVAILABLE');

  const devices = await repos.devices.listAll();
  assert.equal(devices.length, 1, 'losing concurrent enrollment must delete its provisional device');

  const token = await repos.enrollmentTokens.findByHash(tokenHash);
  assert.equal(token.status, 'USED');
  assert.equal(String(token.usedByDeviceId), String(devices[0].id));

  cafeRepositories.resetRepositories();
});

test('REC-04D — canonical registry failure compensates provisional enrollment and restores one-time token', async (t) => {
  cafeRepositories.resetRepositories();
  const repos = cafeRepositories.initRepositories('memory');
  const enrollmentCode = 'REC04D-COMPENSATION';
  const tokenHash = crypto.createHash('sha256').update(enrollmentCode).digest('hex');

  await repos.enrollmentTokens.create({
    tokenHash,
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    cafeDisplayName: 'Compensation Cafe',
    intendedDisplayName: 'Compensation POS',
    createdByEmployeeId: 'MU-PRIMARY-01',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 60_000),
  });

  t.mock.method(DeviceRegistration, 'findOneAndUpdate', async () => {
    throw new Error('SIMULATED_CANONICAL_REGISTRY_FAILURE');
  });

  await assert.rejects(
    () => cafeDeviceService.enrollDevice({
      enrollmentCodePlain: enrollmentCode,
      displayName: 'Compensation POS',
      platform: 'android',
    }),
    (err) => {
      assert.equal(err.code, 'CANONICAL_DEVICE_REGISTRATION_FAILED');
      return true;
    }
  );

  assert.equal((await repos.devices.listAll()).length, 0);
  const restored = await repos.enrollmentTokens.findByHash(tokenHash);
  assert.equal(restored.status, 'PENDING');
  assert.equal(restored.usedByDeviceId, null);
  assert.equal(restored.usedAt, null);

  cafeRepositories.resetRepositories();
});

test('REC-04D — canonical trust registry resolves business IDs rather than copying CafeOps ObjectId references', () => {
  const deviceServiceSource = fs.readFileSync(
    path.join(root, 'backend', 'src', 'cafe-operations', 'services', 'deviceService.js'),
    'utf8'
  );
  const mongoRepoSource = fs.readFileSync(
    path.join(root, 'backend', 'src', 'cafe-operations', 'repositories', 'mongo.js'),
    'utf8'
  );

  assert.match(deviceServiceSource, /async function resolveCanonicalDeviceScope\(device\)/);
  assert.match(deviceServiceSource, /CafeModel\.findById\(device\.cafeId\)\.lean\(\)/);
  assert.match(deviceServiceSource, /organisationId:\s*canonicalScope\.organisationId/);
  assert.match(deviceServiceSource, /assignedCafeId:\s*canonicalScope\.cafeId/);
  assert.match(deviceServiceSource, /runValidators:\s*true/);

  const registrationModelSource = fs.readFileSync(
    path.join(root, 'backend', 'src', 'models', 'DeviceRegistration.js'),
    'utf8'
  );
  assert.match(
    registrationModelSource,
    /\^ZC-\(\?:CAF-\)\?\\d\{4,\}\$/,
    'DeviceRegistration must accept every canonical Cafe.cafeId format'
  );

  assert.match(mongoRepoSource, /consumeIfPending\(id, patch\)/);
  assert.match(mongoRepoSource, /status:\s*'PENDING', expiresAt:\s*\{ \$gt: new Date\(\) \}/);
  assert.match(mongoRepoSource, /restoreIfUsedByDevice\(id, deviceId, patch = \{\}\)/);
});

