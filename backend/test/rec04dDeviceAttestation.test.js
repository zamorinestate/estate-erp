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
const windowsBridgePath = path.join(root, 'Platform', 'Windows', 'ZamorinCafeERP', 'ZamorinNativeBridge.cs');
const iosBridgePath = path.join(root, 'Platform', 'Apple', 'ios', 'ZamorinCafeERP', 'ZamorinNativeBridge.swift');
const macBridgePath = path.join(root, 'Platform', 'Apple', 'macos', 'ZamorinCafeERP', 'ZamorinNativeBridge.swift');
const frontendAttestationPath = path.join(root, 'frontend', 'src', 'js', 'utils', 'deviceAttestation.js');
const routerPath = path.join(root, 'frontend', 'src', 'js', 'router.js');

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

test('REC-04D — legacy key migration rolls canonical registry back when fleet update fails', async (t) => {
  cafeRepositories.resetRepositories();
  const repos = cafeRepositories.initRepositories('memory');
  const device = await repos.devices.create({
    deviceCode: 'DV-LEGACY-REC04D',
    displayName: 'Legacy Counter',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    lifecycleStatus: 'ACTIVE',
    deviceTokenHash: 'legacy-token-hash',
    signingKeyThumbprint: null,
  });

  const { publicJwk } = makeKeyPair();
  let canonicalSaveCount = 0;
  const canonical = {
    publicSigningKey: null,
    signingKeyThumbprint: null,
    signingKeyAlgorithm: null,
    signingKeyProvider: null,
    signingKeyCreatedAt: null,
    metadata: { existing: true },
    async save() {
      canonicalSaveCount += 1;
      return this;
    },
  };

  t.mock.method(DeviceRegistration, 'findOne', async () => canonical);
  t.mock.method(repos.devices, 'update', async () => {
    const err = new Error('SIMULATED_FLEET_WRITE_FAILURE');
    err.code = 'SIMULATED_FLEET_WRITE_FAILURE';
    throw err;
  });

  await assert.rejects(
    () => cafeDeviceService.bindAttestationKey(device, {
      publicSigningKey: publicJwk,
      signingKeyAlgorithm: 'ES256',
      signingKeyProvider: 'ANDROID_KEYSTORE',
    }),
    (err) => {
      assert.equal(err.code, 'SIMULATED_FLEET_WRITE_FAILURE');
      return true;
    }
  );

  assert.equal(canonicalSaveCount, 2, 'canonical registry must be saved once then rolled back');
  assert.equal(canonical.publicSigningKey, null);
  assert.equal(canonical.signingKeyThumbprint, null);
  assert.equal(canonical.signingKeyAlgorithm, null);
  assert.equal(canonical.signingKeyProvider, null);
  assert.deepEqual(canonical.metadata, { existing: true });

  cafeRepositories.resetRepositories();
});

test('REC-04D — native bridges keep private signing keys inside platform stores', () => {
  const android = fs.readFileSync(androidBridgePath, 'utf8');
  const windows = fs.readFileSync(windowsBridgePath, 'utf8');
  const ios = fs.readFileSync(iosBridgePath, 'utf8');
  const mac = fs.readFileSync(macBridgePath, 'utf8');
  const frontend = fs.readFileSync(frontendAttestationPath, 'utf8');
  const router = fs.readFileSync(routerPath, 'utf8');

  assert.match(android, /AndroidKeyStore/);
  assert.match(android, /KeyGenParameterSpec/);
  assert.match(android, /SHA256withECDSA/);
  assert.match(android, /SIGN_DEVICE_ATTESTATION/);

  assert.match(windows, /CngKey/);
  assert.match(windows, /ECDsaP256/);
  assert.match(windows, /Rfc3279DerSequence/);
  assert.match(windows, /SIGN_DEVICE_ATTESTATION/);

  for (const apple of [ios, mac]) {
    assert.match(apple, /kSecAttrTokenIDSecureEnclave/);
    assert.match(apple, /SecKeyCreateRandomKey/);
    assert.match(apple, /SecKeyCreateSignature/);
    assert.match(apple, /ecdsaSignatureMessageX962SHA256/);
    assert.match(apple, /SIGN_DEVICE_ATTESTATION/);
  }

  assert.match(frontend, /GET_DEVICE_ATTESTATION_KEY/);
  assert.match(frontend, /SIGN_DEVICE_ATTESTATION/);
  assert.match(frontend, /DEVICE_ATTESTATION_SIGNATURE_MISSING/);
  assert.match(frontend, /ensureNativeDeviceAttestationBinding/);
  assert.match(frontend, /\/cafe-ops\/devices\/attestation\/key/);
  assert.match(router, /publicSigningKey: signingIdentity\.capable \? signingIdentity\.publicKeyJwk : null/);
  assert.match(router, /await ensureNativeDeviceAttestationBinding\(\)/);
  assert.match(router, /DEVICE_ATTESTATION_KEY_ROTATION_REQUIRES_REENROLLMENT/);
});
