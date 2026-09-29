'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { pathToFileURL } = require('node:url');
const attestationService = require('../src/services/deviceAttestationService');
const { PosOrderService } = require('../src/services/posOrderService');
const { PrintJob } = require('../src/models/PrintJob');
const { Bill } = require('../src/models/Bill');
const { DeviceRegistration } = require('../src/models/DeviceRegistration');
const { OperatorSession } = require('../src/models/OperatorSession');
const deviceService = require('../src/cafe-operations/services/deviceService');
const { getRepositories, resetRepositories } = require('../src/cafe-operations/repositories');
const {
  revocationLookupKeys,
  verifyExpectedHardwareAuthorizations,
  _testOnly: androidAttestationTestOnly,
} = require('../src/cafe-operations/services/androidHardwareAttestationService');
const { sha256Hex } = require('../src/cafe-operations/utils/ids');
const root = path.join(__dirname, '..', '..');
const posServicePath = path.join(__dirname, '..', 'src', 'services', 'posOrderService.js');
const modelPath = path.join(__dirname, '..', 'src', 'models', 'PrintJob.js');
const frontendPath = path.join(root, 'frontend', 'src', 'js', 'utils', 'deviceAttestation.js');
const androidBridgePath = path.join(root, 'Platform', 'Android', 'app', 'src', 'main', 'java', 'com', 'zamorin', 'cafe', 'erp', 'ZamorinNativeBridge.kt');
const androidPrintManagerPath = path.join(root, 'Platform', 'Android', 'app', 'src', 'main', 'java', 'com', 'zamorin', 'cafe', 'erp', 'ZamorinPrintManager.kt');
const androidAttestationStorePath = path.join(root, 'Platform', 'Android', 'app', 'src', 'main', 'java', 'com', 'zamorin', 'cafe', 'erp', 'ZamorinPrintAttestationStore.kt');
const posTillPath = path.join(root, 'frontend', 'src', 'js', 'pages', 'posTill.js');
const hardwareModelPath = path.join(__dirname, '..', 'src', 'models', 'HardwareTerminal.js');
const hardwareServicePath = path.join(__dirname, '..', 'src', 'services', 'hardwareBridgeService.js');
const hardwareClientPath = path.join(root, 'frontend', 'src', 'js', 'services', 'hardwareBridgeClient.js');
const localBridgePath = path.join(root, 'scripts', 'zamorin_local_printer_bridge.mjs');

test('REC-04E V2 binds payload and transport evidence', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const bytes = Buffer.from([0x1b,0x40,0x5a,0x41,0x4d,0x4f,0x52,0x49,0x4e,0x0a]);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  const args = { organisationId:'ORG-ZAMORIN', cafeId:'ZC-0001', deviceId:'DV-ZC0001-POS-01', printJobId:'PJ-PRT-REC04E-001', challenge:'rec04e-challenge-001', expectedPayloadSha256:digest, expectedPayloadBytes:bytes.length, printerTarget:'DEFAULT_THERMAL', transportMode:'ANDROID_SYSTEM_PRINT', platformJobId:'android-job-77', evidenceLevel:'SPOOLER_COMPLETION', contentBindingVerified:false, printerIdentity:'android-printer-id-1', printerIdentityVerified:false, status:'PRINTED', drawerKickStatus:'UNCHANGED', failureCode:'NONE', failureReason:'' };
  const payload = attestationService.buildPrintAckPayload(args);
  assert.ok(payload.startsWith('ZAMORIN_PRINT_ACK_V2\n'));
  assert.match(payload, new RegExp(`expectedPayloadSha256=${digest}`));
  assert.match(payload, /evidenceLevel=SPOOLER_COMPLETION/);
  assert.match(payload, /contentBindingVerified=FALSE/);
  const signature = crypto.sign('sha256', Buffer.from(payload), {key:privateKey,dsaEncoding:'der'}).toString('base64url');
  assert.equal(attestationService.verifyPrintAckSignature({publicSigningKey:publicKey.export({format:'jwk'}),signatureBase64Url:signature,payload}).verified,true);
  const changed = attestationService.buildPrintAckPayload({...args,expectedPayloadSha256:crypto.createHash('sha256').update('changed').digest('hex')});
  assert.throws(()=>attestationService.verifyPrintAckSignature({publicSigningKey:publicKey.export({format:'jwk'}),signatureBase64Url:signature,payload:changed}),e=>e.code==='DEVICE_ATTESTATION_SIGNATURE_INVALID');
});

test('REC-04E stores digest and replay-window state', () => {
  const source=fs.readFileSync(posServicePath,'utf8'), model=fs.readFileSync(modelPath,'utf8');
  assert.match(source,/payloadSha256:\s*crypto\.createHash\('sha256'\)\.update\(escPosBuffer\)\.digest\('hex'\)/);
  assert.match(source,/PRINT_ACK_CHALLENGE_EXPIRED/);
  assert.match(source,/ackChallengeConsumedAt\s*=\s*now/);
  for(const f of ['payloadSha256','payloadBytes','ackChallengeExpiresAt','ackChallengeConsumedAt','contentBindingVerified','printerIdentityVerified']) assert.ok(model.includes(f));
});

test('REC-04E Android spooler evidence cannot overclaim exact thermal delivery', () => {
  const bridge=fs.readFileSync(androidBridgePath,'utf8'), pm=fs.readFileSync(androidPrintManagerPath,'utf8'), front=fs.readFileSync(frontendPath,'utf8'), till=fs.readFileSync(posTillPath,'utf8');
  assert.match(bridge,/val transportMode = "ANDROID_SYSTEM_PRINT"/);
  assert.match(bridge,/acknowledgementStatus == "PRINTED"/);
  assert.match(bridge,/"SPOOLER_COMPLETION"/);
  assert.match(bridge,/"SPOOLER_TERMINAL_STATE"/);
  assert.match(bridge,/val contentBindingVerified = false/);
  assert.match(bridge,/val printerIdentityVerified = false/);
  assert.match(pm,/spoolerCompletionVerified = status == "COMPLETED"/);
  assert.match(pm,/printerIdentity = printJob\.info\?\.printerId\?\.toString\(\)/);
  assert.match(bridge,/put\("spoolerCompletionVerified", statusResult\.spoolerCompletionVerified\)/);
  assert.match(bridge,/put\("physicalCompletionVerified", false\)/);
  assert.match(front,/attestedResult\.spoolerCompletionVerified !== true/);
  assert.match(front,/ANDROID_PHYSICAL_COMPLETION_OVERCLAIM/);
  assert.match(front,/ANDROID_PRINT_EVIDENCE_OVERCLAIM/);
  assert.match(till,/"OPEN_SYSTEM_PRINT"/);
  assert.doesNotMatch(till,/"OPEN_SYSTEM_PRINT"[\s\S]{0,500}?printBuffer/);
});

test('REC-04E keeps legacy V1 verification for in-flight REC-04D jobs', () => {
  const payload=attestationService.buildPrintAckPayload({organisationId:'ORG-ZAMORIN',cafeId:'ZC-0001',deviceId:'DV-ZC0001-POS-01',printJobId:'PJ-LEGACY-001',challenge:'legacy-challenge',status:'FAILED',drawerKickStatus:'UNCHANGED',failureCode:'DEVICE_PRINT_FAILED',failureReason:'legacy failure'});
  assert.ok(payload.startsWith('ZAMORIN_DEVICE_ACK_V1\n'));
  assert.doesNotMatch(payload,/expectedPayloadSha256/);
});


test('REC-04E hardware state and local bridge fail closed without physical evidence', () => {
  const model = fs.readFileSync(hardwareModelPath, 'utf8');
  const service = fs.readFileSync(hardwareServicePath, 'utf8');
  const client = fs.readFileSync(hardwareClientPath, 'utf8');
  const localBridge = fs.readFileSync(localBridgePath, 'utf8');

  assert.match(model, /evidenceSource/);
  assert.match(model, /hardwareVerifiedAt/);
  assert.match(model, /default:\s*false/);
  assert.match(model, /default:\s*'UNKNOWN'/);

  assert.doesNotMatch(service, /status\.lastHeartbeat\s*=\s*new Date\(\)/);
  assert.doesNotMatch(service, /status\.online\s*=\s*true/);
  assert.match(service, /HARDWARE READINESS NOT VERIFIED/);

  assert.match(client, /data\?\.hardwareReady === true/);
  assert.doesNotMatch(client, /return \{ success: true, method: 'WEB_USB' \}/);
  assert.doesNotMatch(client, /return \{ success: true, method: 'LOCAL_PROXY' \}/);

  assert.match(localBridge, /hardwareReady:\s*false/);
  assert.match(localBridge, /HARDWARE_TRANSPORT_NOT_CONFIGURED/);
  assert.match(localBridge, /DRAWER_TRANSPORT_NOT_CONFIGURED/);
  assert.match(localBridge, /bytesDispatched:\s*0/);
  assert.match(localBridge, /emitted:\s*false/);
  assert.doesNotMatch(localBridge, /status:\s*'READY'/);
  assert.doesNotMatch(localBridge, /DRAWER_KICK_PULSE_EMITTED/);
});


test('REC-04E rejects invented transport evidence and freezes terminal replay evidence', () => {
  const source = fs.readFileSync(posServicePath, 'utf8');
  const frontend = fs.readFileSync(frontendPath, 'utf8');

  assert.match(source, /UNSUPPORTED_PRINT_TRANSPORT_MODE/);
  assert.match(source, /SPOOLER_TERMINAL_STATE/);
  assert.match(source, /PRINT_ACK_REPLAY_EVIDENCE_MISMATCH/);
  assert.match(source, /if \(statusChanged && attestationProof\)/);
  assert.match(source, /if \(statusChanged\) \{\s*await job\.save\(\);\s*\}/);
  assert.match(source, /if \(statusChanged && bill\)/);

  assert.match(frontend, /expectedEvidenceLevel/);
  assert.match(frontend, /SPOOLER_TERMINAL_STATE/);
});


test('REC-04E Android binding lifetime matches server challenge TTL and is cleared only after accepted acknowledgement', () => {
  const store = fs.readFileSync(androidAttestationStorePath, 'utf8');
  const bridge = fs.readFileSync(androidBridgePath, 'utf8');
  const frontend = fs.readFileSync(frontendPath, 'utf8');
  const source = fs.readFileSync(posServicePath, 'utf8');

  assert.match(store, /MAX_AGE_MS = 15L \* 60L \* 1000L/);
  assert.equal(attestationService.PRINT_ACK_CHALLENGE_TTL_MS, 15 * 60 * 1000);

  assert.match(bridge, /"CLEAR_PRINT_ATTESTATION_BINDING"/);
  assert.match(bridge, /ZamorinPrintAttestationStore\.clear\(context, platformJobId\)/);

  const serverAckIndex = frontend.indexOf('const serverAck = await submitPurposeBoundPrintAcknowledgement');
  const clearIndex = frontend.indexOf("'CLEAR_PRINT_ATTESTATION_BINDING'");
  assert.ok(serverAckIndex >= 0 && clearIndex > serverAckIndex, 'Local binding must clear only after server acknowledgement succeeds');

  assert.match(source, /if \(statusChanged && attestationProof\) \{\s*await DeviceRegistration\.updateOne\(/);
});


test('REC-04E content-bound jobs cannot terminally acknowledge without cryptographic attestation', () => {
  const source = fs.readFileSync(posServicePath, 'utf8');
  assert.match(
    source,
    /const isContentBoundJob =\s*normalizeId\(job\.attestationVersion\) === PRINT_ATTESTATION_VERSION \|\|\s*Boolean\(job\.payloadSha256\)/
  );
  assert.match(source, /PRINT_ATTESTATION_REQUIRED/);
  assert.match(
    source,
    /isContentBoundJob && job\.attestationRequired !== true/,
    'A new digest-bound print job must not fall back to unsigned terminal acknowledgement'
  );
});

test('REC-04E drawer intent stays requested until a transport can prove actuation', () => {
  const source = fs.readFileSync(posServicePath, 'utf8');
  const model = fs.readFileSync(modelPath, 'utf8');

  assert.match(model, /'REQUESTED'/);
  assert.match(
    source,
    /drawerKickStatus: drawerKickRequested \? 'REQUESTED' : 'NOT_REQUESTED'/,
    'Persisted dispatch state must not claim the drawer pulse was physically sent'
  );
  assert.match(source, /ANDROID_DRAWER_EVIDENCE_OVERCLAIM/);
  assert.match(source, /job\.drawerKickRequested \? 'UNKNOWN' : 'UNCHANGED'/);
});


test('REC-04E persists explicit V2 attestation lineage for migration safety', () => {
  const source = fs.readFileSync(posServicePath, 'utf8');
  const model = fs.readFileSync(modelPath, 'utf8');

  assert.match(model, /attestationVersion/);
  assert.match(model, /ZAMORIN_PRINT_ACK_V2/);
  assert.match(source, /attestationVersion: PRINT_ATTESTATION_VERSION/);
  assert.match(
    source,
    /normalizeId\(job\.attestationVersion\) === PRINT_ATTESTATION_VERSION \|\|\s*Boolean\(job\.payloadSha256\)/,
    'Migration logic must prefer explicit V2 lineage while still recognizing pre-marker V2 jobs by digest'
  );
});


test('REC-04E Android monitor window remains inside the server challenge TTL without premature two-minute abandonment', () => {
  const frontend = fs.readFileSync(frontendPath, 'utf8');

  assert.match(frontend, /PRINT_ACK_MONITOR_WINDOW_MS = 14 \* 60 \* 1000/);
  assert.match(frontend, /pollIntervalMs = 2000/);
  assert.match(frontend, /maxMonitorMs = PRINT_ACK_MONITOR_WINDOW_MS/);
  assert.match(frontend, /const monitorDeadline =/);
  assert.match(frontend, /Math\.min\(localMonitorDeadline, serverChallengeExpiresAt - 5000\)/);
  assert.match(frontend, /while \(Date\.now\(\) < monitorDeadline\)/);
  assert.doesNotMatch(frontend, /maxPolls = 120/);
  assert.ok(14 * 60 * 1000 < attestationService.PRINT_ACK_CHALLENGE_TTL_MS);
});


test('REC-04E GET_PRINT_JOB_STATUS exposes spooler evidence without physical overclaim', () => {
  const bridge = fs.readFileSync(androidBridgePath, 'utf8');
  assert.match(bridge, /"GET_PRINT_JOB_STATUS"/);
  assert.match(bridge, /put\("spoolerCompletionVerified", status\.spoolerCompletionVerified\)/);
  assert.match(bridge, /put\("physicalCompletionVerified", false\)/);
  assert.doesNotMatch(bridge, /status\.physicalCompletionVerified/);
});


test('REC-04E dispatch advertises purpose-bound acknowledgement only where an attestor actually exists', () => {
  const source = fs.readFileSync(posServicePath, 'utf8');

  assert.match(source, /const supported = platform === 'ANDROID'/);
  assert.match(source, /PLATFORM_PRINT_ATTESTOR_UNAVAILABLE/);
  assert.match(source, /DEVICE_SIGNING_KEY_UNAVAILABLE/);
  assert.match(source, /deviceAcknowledgementRequired: attestationBinding\.required/);
  assert.match(source, /deviceAcknowledgementSupported: attestationBinding\.supported/);
  assert.doesNotMatch(source, /deviceAcknowledgementRequired: Boolean\(dispatchedDeviceId\)/);
});


test('REC-04E device platform provenance cannot default or hardcode unknown devices into Android attestation', () => {
  const deviceModel = fs.readFileSync(path.join(__dirname, '..', 'src', 'models', 'DeviceRegistration.js'), 'utf8');
  const deviceService = fs.readFileSync(path.join(__dirname, '..', 'src', 'cafe-operations', 'services', 'deviceService.js'), 'utf8');
  const registerDevice = fs.readFileSync(path.join(root, 'frontend', 'cafe-operations', 'js', 'screens', 'registerDevice.js'), 'utf8');

  assert.match(deviceModel, /platform:[\s\S]{0,180}?default: 'UNKNOWN'/);
  assert.match(deviceService, /function resolveCanonicalDevicePlatform/);
  assert.match(deviceService, /provider === 'ANDROID_KEYSTORE'\) return 'ANDROID'/);
  assert.doesNotMatch(deviceService, /platform: 'WEB_POS'/);
  assert.match(registerDevice, /function resolveEnrollmentPlatform\(\)/);
  assert.match(registerDevice, /platform: resolveEnrollmentPlatform\(\)/);
  assert.doesNotMatch(registerDevice, /platform: 'web'/);
});


test('REC-04E uses one server-authoritative challenge lifetime across persistence, Android binding, and monitoring', () => {
  const source = fs.readFileSync(posServicePath, 'utf8');
  const store = fs.readFileSync(androidAttestationStorePath, 'utf8');
  const frontend = fs.readFileSync(frontendPath, 'utf8');

  assert.match(source, /const challengeIssuedAt = new Date\(\)/);
  assert.match(source, /const challengeExpiresAt = new Date\(challengeIssuedAt\.getTime\(\) \+ PRINT_ACK_CHALLENGE_TTL_MS\)/);
  assert.match(source, /ackChallengeIssuedAt: attestationBinding\.challengeIssuedAt/);
  assert.match(source, /ackChallengeExpiresAt: attestationBinding\.challengeExpiresAt/);
  assert.match(source, /challengeExpiresAtEpochMs: attestationBinding\.challengeExpiresAtEpochMs/);
  assert.doesNotMatch(source, /ackChallengeExpiresAt: attestationBinding\.challenge \? new Date\(Date\.now\(\) \+ PRINT_ACK_CHALLENGE_TTL_MS\) : null/);

  assert.match(store, /challengeExpiresAtEpochMs/);
  assert.match(store, /expiredByServerDeadline/);

  assert.match(frontend, /dispatch\?\.attestationContext\?\.challengeExpiresAtEpochMs/);
  assert.match(frontend, /Math\.min\(localMonitorDeadline, serverChallengeExpiresAt - 5000\)/);
  assert.match(frontend, /PRINT_ACK_CHALLENGE_WINDOW_EXPIRED/);
});


test('REC-04E Android purpose-bound attestation requires enrollment-time Android Keystore provenance', () => {
  const source = fs.readFileSync(posServicePath, 'utf8');
  const deviceService = fs.readFileSync(path.join(__dirname, '..', 'src', 'cafe-operations', 'services', 'deviceService.js'), 'utf8');
  const router = fs.readFileSync(path.join(root, 'frontend', 'src', 'js', 'router.js'), 'utf8');

  assert.match(source, /signingProvider === 'ANDROID_KEYSTORE'/);
  assert.match(source, /DEVICE_SIGNING_PROVIDER_UNTRUSTED/);

  assert.match(deviceService, /function assertSigningProviderMatchesPlatform/);
  assert.match(deviceService, /NATIVE_DEVICE_ATTESTATION_REQUIRED/);
  assert.match(deviceService, /DEVICE_ATTESTATION_REENROLLMENT_REQUIRED/);
  assert.match(deviceService, /DEVICE_ATTESTATION_PROVENANCE_MISMATCH/);
  assert.match(deviceService, /reasonCode: 'DEVICE_SIGNING_KEY_IDENTITY_VERIFIED'/);
  assert.doesNotMatch(deviceService, /reasonCode: 'DEVICE_ATTESTATION_KEY_VERIFIED'/);
  assert.doesNotMatch(deviceService, /reasonCode: 'DEVICE_ATTESTATION_KEY_BOUND'/);

  assert.match(router, /getNativeDeviceAttestationIdentity\([\s\S]{0,500}?publicSigningKey: signingIdentity\.capable \? signingIdentity\.publicKeyJwk : null/);
  assert.match(router, /DEVICE_ATTESTATION_REENROLLMENT_REQUIRED/);
});


test('REC-04E post-enrollment signing identity verification is read-only', () => {
  const deviceService = fs.readFileSync(path.join(__dirname, '..', 'src', 'cafe-operations', 'services', 'deviceService.js'), 'utf8');
  const bindStart = deviceService.indexOf('async function bindAttestationKey');
  const bindEnd = deviceService.indexOf('module.exports', bindStart);
  const bindSource = deviceService.slice(bindStart, bindEnd);

  assert.match(bindSource, /Verification is deliberately read-only/);
  assert.match(bindSource, /const updated = device/);
  assert.match(bindSource, /canonical\.metadata\?\.attestationCapable !== true/);
  assert.match(bindSource, /device\.attestationCapable !== true/);
  assert.doesNotMatch(bindSource, /canonical\.save\(\)/);
  assert.doesNotMatch(bindSource, /repos\.devices\.update\(device\.id/);
});


test('REC-04E snapshots signing-provider lineage and rejects provider drift or mismatch', () => {
  const source = fs.readFileSync(posServicePath, 'utf8');
  const model = fs.readFileSync(modelPath, 'utf8');

  assert.match(model, /attestationKeyProvider/);
  assert.match(source, /keyProvider: signingProvider/);
  assert.match(source, /attestationKeyProvider: attestationBinding\.keyProvider/);
  assert.match(source, /DEVICE_ATTESTATION_PROVIDER_UNTRUSTED/);
  assert.match(source, /DEVICE_ATTESTATION_PROVIDER_CHANGED/);
  assert.match(source, /DEVICE_ATTESTATION_PROVIDER_MISMATCH/);
  assert.match(source, /ANDROID_SIGNING_PROVIDER_OVERCLAIM/);
  assert.match(source, /signedProvider !== 'ANDROID_KEYSTORE'/);
  assert.match(source, /job\.attestationKeyProvider = attestationProvider/);
});


test('REC-04E physical dispatch requires a durably persisted PrintJob', () => {
  const source = fs.readFileSync(posServicePath, 'utf8');
  const till = fs.readFileSync(posTillPath, 'utf8');

  assert.match(source, /const printDispatchAuthorized = printTrackingPersisted === true/);
  assert.match(source, /printStatus: printDispatchAuthorized \? 'PRINT_DISPATCHED' : 'PRINT_PENDING'/);
  assert.match(source, /printJobId: printDispatchAuthorized \? printJobId : null/);
  assert.match(source, /printBuffer: printDispatchAuthorized \? printResult\.printBufferBase64 : null/);
  assert.match(source, /PRINT_TRACKING_UNAVAILABLE/);

  assert.match(till, /dispatch\?\.printDispatchAuthorized !== true/);
  assert.match(till, /dispatch\?\.printTrackingPersisted !== true/);
  assert.match(till, /PRINT_DISPATCH_NOT_AUTHORIZED/);
  assert.match(till, /res\?\.printDispatchAuthorized === true/);
});

test('REC-04E standalone PRINT persistence failure cannot authorize physical dispatch', async (t) => {
  const bill = {
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    billId: 'BILL-TRACKING-FAIL-001',
    invoiceNumber: 'INV-TRACK-001',
    paymentMethod: 'UPI',
    tenders: [],
    lineItems: [],
    reprints: [],
    toObject() { return { ...this }; },
  };
  const auth = {
    userId: 'EMP-ZC-1001',
    role: 'STAFF',
    organisationId: 'ORG-ZAMORIN',
    assignedCafeIds: ['ZC-0001'],
    primaryCafeId: 'ZC-0001',
  };

  t.mock.method(Bill, 'findOne', async () => bill);
  t.mock.method(PosOrderService, 'generatePrintArtifacts', async () => ({
    payloadSha256: 'a'.repeat(64),
    payloadBytes: 16,
    printBufferBase64: 'AA==',
    htmlPreview: '<div>test</div>',
    rawBuffer: Buffer.from([0]),
    drawerKickIncluded: false,
  }));
  t.mock.method(PrintJob.prototype, 'save', async () => {
    throw new Error('SIMULATED_PRINTJOB_WRITE_FAILURE');
  });

  await assert.rejects(
    () => PosOrderService.printCommittedBill(bill.billId, auth),
    (err) => {
      assert.equal(err.statusCode, 503);
      assert.equal(err.code, 'PRINT_TRACKING_UNAVAILABLE');
      return true;
    }
  );
});

test('REC-04E reprint tracking failure does not increment audited reprint count', async (t) => {
  let billSaveCount = 0;
  const bill = {
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    billId: 'BILL-REPRINT-TRACK-001',
    invoiceNumber: 'INV-RPT-001',
    paymentMethod: 'UPI',
    tenders: [],
    lineItems: [],
    reprints: [],
    async save() { billSaveCount += 1; return this; },
    toObject() { return { ...this, reprints: [...this.reprints] }; },
  };
  const auth = {
    userId: 'EMP-ZC-1001',
    role: 'STAFF',
    organisationId: 'ORG-ZAMORIN',
    assignedCafeIds: ['ZC-0001'],
    primaryCafeId: 'ZC-0001',
  };

  t.mock.method(Bill, 'findOne', async () => bill);
  t.mock.method(PosOrderService, 'generatePrintArtifacts', async () => ({
    payloadSha256: 'b'.repeat(64),
    payloadBytes: 16,
    printBufferBase64: 'AA==',
    htmlPreview: '<div>reprint</div>',
    rawBuffer: Buffer.from([0]),
    drawerKickIncluded: false,
  }));
  t.mock.method(PrintJob.prototype, 'save', async () => {
    throw new Error('SIMULATED_REPRINT_PRINTJOB_WRITE_FAILURE');
  });

  await assert.rejects(
    () => PosOrderService.reprintBill(bill.billId, auth, 'Tracking fault injection'),
    (err) => {
      assert.equal(err.statusCode, 503);
      assert.equal(err.code, 'PRINT_TRACKING_UNAVAILABLE');
      return true;
    }
  );

  assert.equal(bill.reprints.length, 0);
  assert.equal(billSaveCount, 0);
});


test('REC-04E keeps provider claims separate from server-verified hardware key attestation', () => {
  const deviceModel = fs.readFileSync(path.join(__dirname, '..', 'src', 'models', 'DeviceRegistration.js'), 'utf8');
  const cafeOpsModel = fs.readFileSync(path.join(__dirname, '..', 'src', 'cafe-operations', 'models', 'CafeOpsDevice.js'), 'utf8');
  const deviceService = fs.readFileSync(path.join(__dirname, '..', 'src', 'cafe-operations', 'services', 'deviceService.js'), 'utf8');
  const source = fs.readFileSync(posServicePath, 'utf8');
  const printJobModel = fs.readFileSync(modelPath, 'utf8');

  for (const model of [deviceModel, cafeOpsModel]) {
    assert.match(model, /signingKeyHardwareBackedVerified/);
    assert.match(model, /signingKeyHardwareSecurityLevel/);
    assert.match(model, /signingKeyHardwareAttestationVerifiedAt/);
  }

  assert.match(deviceService, /signingKeyHardwareBackedVerified: false/);
  assert.match(deviceService, /signingKeyHardwareSecurityLevel: 'UNKNOWN'/);
  assert.match(deviceService, /hardwareBackedSigningKeyVerified: false/);
  assert.match(deviceService, /hardwareBackedSigningKeyVerified: canonical\.signingKeyHardwareBackedVerified === true/);

  assert.match(printJobModel, /attestationKeyHardwareBackedVerified/);
  assert.match(printJobModel, /attestationKeyHardwareSecurityLevel/);
  assert.match(source, /keyHardwareBackedVerified: registration\.signingKeyHardwareBackedVerified === true/);
  assert.match(source, /attestationKeyHardwareBackedVerified: attestationBinding\.keyHardwareBackedVerified/);
  assert.match(source, /attestationKeyHardwareSecurityLevel: attestationBinding\.keyHardwareSecurityLevel/);
});


test('REC-04E enrollment and diagnostics do not mislabel signing capability as hardware attestation', () => {
  const deviceService = fs.readFileSync(path.join(__dirname, '..', 'src', 'cafe-operations', 'services', 'deviceService.js'), 'utf8');
  const enrollmentRoutes = fs.readFileSync(path.join(__dirname, '..', 'src', 'cafe-operations', 'routes', 'deviceEnrollmentRoutes.js'), 'utf8');

  assert.match(deviceService, /hardwareBackedSigningKeyVerified: false/);
  assert.match(deviceService, /hardwareAttestationSecurityLevel: 'UNKNOWN'/);
  assert.match(deviceService, /signingKeyHardwareBackedVerified: device\.signingKeyHardwareBackedVerified === true/);
  assert.match(enrollmentRoutes, /signingKeyHardwareBackedVerified: device\.signingKeyHardwareBackedVerified === true/);
  assert.match(enrollmentRoutes, /signingKeyHardwareSecurityLevel: device\.signingKeyHardwareSecurityLevel \|\| 'UNKNOWN'/);
});


test('REC-04E HARDWARE_BACKED trust cannot exist without verified hardware attestation evidence', async () => {
  const deviceModelSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'models', 'DeviceRegistration.js'), 'utf8');

  assert.match(deviceModelSource, /enforceHardwareTrustEvidence/);
  assert.match(deviceModelSource, /TRUSTED_ENVIRONMENT/);
  assert.match(deviceModelSource, /STRONGBOX/);
  assert.match(deviceModelSource, /signingKeyHardwareAttestationVerifiedAt/);
  assert.match(deviceModelSource, /HARDWARE_BACKED trust requires verified Android hardware key-attestation evidence/);
  assert.match(deviceModelSource, /HARDWARE_BACKED_TRUST_REQUIRES_ATTESTATION_CEREMONY/);
  assert.match(deviceModelSource, /pre\(\['updateOne', 'updateMany', 'findOneAndUpdate'\]/);
});


test('REC-04E acknowledgement API distinguishes signature verification from hardware-backed key verification', () => {
  const source = fs.readFileSync(posServicePath, 'utf8');

  assert.match(source, /signatureVerified: Boolean\(attestationProof\)/);
  assert.match(source, /hardwareBackedKeyVerified: job\.attestationKeyHardwareBackedVerified === true/);
  assert.match(source, /attestationVerified: Boolean\(attestationProof\)/);
});


test('REC-04E DeviceRegistration validation enforces hardware-backed trust evidence at runtime', async () => {
  const base = {
    deviceId: 'DV-REC04E-HW-VALIDATION',
    organisationId: 'ORG-ZAMORIN',
    deviceClass: 'PERSONAL',
    deviceName: 'REC-04E Hardware Validation',
    platform: 'ANDROID',
    status: 'ACTIVE',
    signingKeyHardwareBackedVerified: true,
    signingKeyHardwareAttestationVerifiedAt: new Date(),
  };

  const softwareOnly = new DeviceRegistration({
    ...base,
    trustLevel: 'HARDWARE_BACKED',
    signingKeyHardwareSecurityLevel: 'SOFTWARE',
  });

  await assert.rejects(
    () => softwareOnly.validate(),
    (err) => {
      assert.ok(err?.errors?.trustLevel || err?.errors?.signingKeyHardwareBackedVerified);
      return true;
    }
  );

  const missingVerification = new DeviceRegistration({
    ...base,
    trustLevel: 'HARDWARE_BACKED',
    signingKeyHardwareBackedVerified: false,
    signingKeyHardwareSecurityLevel: 'TRUSTED_ENVIRONMENT',
  });

  await assert.rejects(
    () => missingVerification.validate(),
    (err) => {
      assert.ok(err?.errors?.trustLevel);
      return true;
    }
  );

  const trustedEnvironment = new DeviceRegistration({
    ...base,
    trustLevel: 'HARDWARE_BACKED',
    signingKeyHardwareSecurityLevel: 'TRUSTED_ENVIRONMENT',
  });
  await trustedEnvironment.validate();

  const strongBox = new DeviceRegistration({
    ...base,
    deviceId: 'DV-REC04E-HW-STRONGBOX',
    trustLevel: 'HARDWARE_BACKED',
    signingKeyHardwareSecurityLevel: 'STRONGBOX',
  });
  await strongBox.validate();
});


test('REC-04E Cafe Operations native enrollment carries the signing identity in the one-time enrollment ceremony', () => {
  const api = fs.readFileSync(path.join(root, 'frontend', 'cafe-operations', 'js', 'api', 'cafeOpsApi.js'), 'utf8');

  assert.match(api, /function isNativeEnrollmentPlatform\(platform\)/);
  assert.match(api, /GET_DEVICE_ATTESTATION_KEY/);
  assert.match(api, /function validateNativeSigningIdentity\(identity, platform\)/);
  assert.match(api, /ANDROID_KEYSTORE/);
  assert.match(api, /WINDOWS_CNG/);
  assert.match(api, /APPLE_SECURE_ENCLAVE/);
  assert.match(api, /APPLE_KEYCHAIN/);
  assert.match(api, /publicSigningKey/);
  assert.match(api, /signingKeyAlgorithm/);
  assert.match(api, /signingKeyProvider/);
  assert.match(api, /enrollDevice: async \(input\)/);
  assert.match(api, /body: await prepareEnrollmentInput\(input\)/);
});


test('REC-04E acknowledgement response distinguishes spooler, content-bound delivery, and physical hardware confirmation', () => {
  const source = fs.readFileSync(posServicePath, 'utf8');

  assert.match(source, /const spoolerCompletionVerified =/);
  assert.match(source, /evidenceLevel \|\| 'NONE'\) === 'SPOOLER_COMPLETION'/);
  assert.match(source, /const contentBoundDeliveryVerified =/);
  assert.match(source, /\['CONTENT_BOUND_TRANSPORT', 'HARDWARE_CONFIRMED'\]/);
  assert.match(source, /const physicalPrintVerified =/);
  assert.match(source, /evidenceLevel \|\| 'NONE'\) === 'HARDWARE_CONFIRMED'/);
  assert.match(source, /spoolerCompletionVerified,/);
  assert.match(source, /contentBoundDeliveryVerified,/);
  assert.match(source, /physicalPrintVerified,/);
});


test('REC-04E exported frontend canonical-payload helper supports both legacy V1 and active V2 semantics', () => {
  const frontend = fs.readFileSync(frontendPath, 'utf8');

  assert.match(frontend, /\[ATTESTATION_VERSION, PRINT_ATTESTATION_VERSION\]\.includes\(version\)/);
  assert.match(frontend, /version === ATTESTATION_VERSION/);
  assert.match(frontend, /expectedPayloadSha256/);
  assert.match(frontend, /expectedPayloadBytes/);
  assert.match(frontend, /platformJobIdSha256/);
  assert.match(frontend, /printerIdentitySha256/);
  assert.match(frontend, /contentBindingVerified=/);
  assert.match(frontend, /printerIdentityVerified=/);
  assert.doesNotMatch(frontend, /Physical print device reported failure/);
  assert.doesNotMatch(frontend, /Physical print job was cancelled/);
});


test('REC-04E query updates cannot manufacture positive hardware-attestation evidence', () => {
  const deviceModelSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'models', 'DeviceRegistration.js'),
    'utf8'
  );

  assert.match(deviceModelSource, /createsPositiveHardwareEvidence/);
  assert.match(deviceModelSource, /signingKeyHardwareBackedVerified/);
  assert.match(deviceModelSource, /TRUSTED_ENVIRONMENT/);
  assert.match(deviceModelSource, /STRONGBOX/);
  assert.match(deviceModelSource, /signingKeyHardwareAttestationVerifiedAt/);
  assert.match(
    deviceModelSource,
    /HARDWARE_ATTESTATION_EVIDENCE_REQUIRES_VERIFIED_CEREMONY/
  );
});


test('REC-04E hardware attestation challenge is enrollment-scoped and hashed at rest', async () => {
  resetRepositories();
  const repos = getRepositories();
  const enrollmentCode = 'REC04EHW01';
  await repos.enrollmentTokens.create({
    tokenHash: sha256Hex(enrollmentCode),
    organisationId: 'ORG-REC04E',
    cafeId: 'ZC-0001',
    status: 'PENDING',
    createdByEmployeeId: 'EMP-REC04E',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  try {
    const issued = await deviceService.issueHardwareAttestationChallenge({
      enrollmentCodePlain: enrollmentCode,
      platform: 'android',
    });
    assert.equal(issued.algorithm, 'ANDROID_KEY_ATTESTATION_V1');
    assert.ok(issued.challengeId);
    assert.ok(issued.challenge);
    assert.ok(new Date(issued.expiresAt).getTime() > Date.now());

    const stored = await repos.enrollmentTokens.findByHash(
      sha256Hex(enrollmentCode)
    );
    assert.equal(stored.hardwareAttestationChallengeId, issued.challengeId);
    assert.equal(
      stored.hardwareAttestationChallengeHash,
      sha256Hex(issued.challenge)
    );
    assert.notEqual(stored.hardwareAttestationChallengeHash, issued.challenge);
    assert.equal(stored.hardwareAttestationChallengePlatform, 'ANDROID');
  } finally {
    resetRepositories();
  }
});

test('REC-04E server hardware verifier requires Google trust, revocation, challenge, hardware level, app identity and key equality', () => {
  const verifier = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'cafe-operations', 'services', 'androidHardwareAttestationService.js'),
    'utf8'
  );
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  );

  assert.equal(pkg.dependencies['@peculiar/asn1-android'], '^2.9.4');
  assert.equal(pkg.dependencies['@peculiar/asn1-schema'], '^2.9.4');
  assert.equal(pkg.dependencies['@peculiar/asn1-x509'], '^2.9.4');
  assert.match(verifier, /1\.3\.6\.1\.4\.1\.11129\.2\.1\.17/);
  assert.match(verifier, /android\.googleapis\.com\/attestation\/root/);
  assert.match(verifier, /android\.googleapis\.com\/attestation\/status/);
  assert.match(verifier, /verifyChain/);
  assert.match(verifier, /ANDROID_ATTESTATION_CHALLENGE_MISMATCH/);
  assert.match(verifier, /canonicalPublicJwk\(attestedJwk\)/);
  assert.match(verifier, /TRUSTED_ENVIRONMENT/);
  assert.match(verifier, /STRONGBOX/);
  assert.match(verifier, /AttestationApplicationId/);
  assert.match(verifier, /ZAMORIN_ANDROID_APP_CERT_SHA256/);
  assert.match(verifier, /ANDROID_ATTESTATION_APP_SIGNING_CERT_MISMATCH/);
  assert.match(verifier, /applyVerifiedAndroidHardwareEvidence/);
  assert.match(verifier, /trustLevel: 'HARDWARE_BACKED'/);
});

test('REC-04E suite is executed by canonical backend CI', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  );
  assert.match(
    pkg.scripts.test,
    /test\/rec04eContentBoundTransport\.test\.js/
  );
});


test('REC-04E Android enrollment generates the runtime signing key from the server challenge and returns its X.509 chain', () => {
  const nativeBridge = fs.readFileSync(androidBridgePath, 'utf8');
  const cafeOpsApi = fs.readFileSync(
    path.join(root, 'frontend', 'cafe-operations', 'js', 'api', 'cafeOpsApi.js'),
    'utf8'
  );
  const route = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'cafe-operations', 'routes', 'deviceEnrollmentRoutes.js'),
    'utf8'
  );

  assert.match(nativeBridge, /setAttestationChallenge\(challenge\)/);
  assert.match(nativeBridge, /zamorin_device_attestation_v2/);
  assert.match(nativeBridge, /getCertificateChain\(alias\)/);
  assert.match(nativeBridge, /ATTESTED_ATTESTATION_KEY_ALIAS/);
  assert.match(nativeBridge, /ensureAttestationKey\(\)/);

  assert.match(cafeOpsApi, /\/devices\/attestation\/challenge/);
  assert.match(
    cafeOpsApi,
    /hardwareAttestationChallenge: challenge\.challenge/
  );
  assert.match(
    cafeOpsApi,
    /certificateChain: nativeResult\.certificateChain/
  );
  assert.match(route, /router\.post\('\/attestation\/challenge'/);
  assert.match(route, /hardwareAttestation/);
});


test('REC-04E revocation lookup covers both hexadecimal and decimal certificate serial encodings', () => {
  const keys = new Set(revocationLookupKeys('5B'));
  assert.equal(keys.has('5b'), true);
  assert.equal(keys.has('91'), true);

  const large = new Set(revocationLookupKeys('5CB8A37B'));
  assert.equal(large.has('5cb8a37b'), true);
  assert.equal(
    large.has(BigInt('0x5CB8A37B').toString(10)),
    true
  );
});

test('REC-04E Android hardware attestation can fail soft to enrolled signing identity without granting hardware trust', () => {
  const cafeOpsApi = fs.readFileSync(
    path.join(root, 'frontend', 'cafe-operations', 'js', 'api', 'cafeOpsApi.js'),
    'utf8'
  );

  assert.match(cafeOpsApi, /hardwareAttestationChallengeBound !== true/);
  assert.match(cafeOpsApi, /fallbackEligible = new Set/);
  assert.match(cafeOpsApi, /DEVICE_ATTESTATION_KEY_FAILED/);
  assert.match(cafeOpsApi, /ANDROID_ATTESTATION_CERTIFICATE_CHAIN_INVALID/);
  assert.match(
    cafeOpsApi,
    /const fallbackIdentity = await sendNativeEnrollmentMessage/
  );
  assert.doesNotMatch(
    cafeOpsApi,
    /hardwareBackedSigningKeyVerified:\s*true/
  );
});


test('REC-04E hardware-attestation challenge issuance allows only one active challenge per pending enrollment code', async () => {
  resetRepositories();
  const repos = getRepositories();
  const enrollmentCode = 'REC04E-CHALLENGE-RACE';
  const tokenHash = sha256Hex(enrollmentCode);

  await repos.enrollmentTokens.create({
    tokenHash,
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    cafeDisplayName: 'Challenge Race Cafe',
    intendedDisplayName: 'Challenge Race POS',
    createdByEmployeeId: 'MU-PRIMARY-01',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 60_000),
  });

  const attempts = await Promise.allSettled([
    deviceService.issueHardwareAttestationChallenge({
      enrollmentCodePlain: enrollmentCode,
      platform: 'android',
    }),
    deviceService.issueHardwareAttestationChallenge({
      enrollmentCodePlain: enrollmentCode,
      platform: 'android',
    }),
  ]);

  assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter((r) => r.status === 'rejected').length, 1);

  const rejected = attempts.find((r) => r.status === 'rejected');
  assert.equal(
    rejected.reason.code,
    'ANDROID_HARDWARE_ATTESTATION_CHALLENGE_IN_PROGRESS'
  );

  const token = await repos.enrollmentTokens.findByHash(tokenHash);
  assert.equal(token.status, 'PENDING');
  assert.ok(token.hardwareAttestationChallengeId);
  assert.equal(token.hardwareAttestationChallengeConsumedAt, null);

  resetRepositories();
});


test('REC-04E hardware trust requires exact hardware-enforced key authorizations and verified boot', () => {
  const makeList = (values) => ({
    findProperty(name) {
      return values[name] ?? null;
    },
  });
  const base = {
    purpose: [2, 3],
    algorithm: 3,
    keySize: 256,
    ecCurve: 1,
    digest: [4],
    rootOfTrust: {
      deviceLocked: true,
      verifiedBootState: 0,
    },
  };

  assert.deepEqual(
    verifyExpectedHardwareAuthorizations({
      hardwareEnforced: makeList(base),
    }),
    { valid: true }
  );

  assert.equal(
    verifyExpectedHardwareAuthorizations({
      hardwareEnforced: makeList({ ...base, purpose: [0, 2, 3] }),
    }).reason,
    'ANDROID_ATTESTATION_KEY_AUTHORIZATION_MISMATCH'
  );

  assert.equal(
    verifyExpectedHardwareAuthorizations({
      hardwareEnforced: makeList({ ...base, digest: [2, 4] }),
    }).reason,
    'ANDROID_ATTESTATION_KEY_AUTHORIZATION_MISMATCH'
  );

  assert.equal(
    verifyExpectedHardwareAuthorizations({
      hardwareEnforced: makeList({
        ...base,
        rootOfTrust: { deviceLocked: false, verifiedBootState: 0 },
      }),
    }).reason,
    'ANDROID_ATTESTATION_VERIFIED_BOOT_REQUIRED'
  );

  assert.equal(
    verifyExpectedHardwareAuthorizations({
      hardwareEnforced: makeList({
        ...base,
        rootOfTrust: { deviceLocked: true, verifiedBootState: 2 },
      }),
    }).reason,
    'ANDROID_ATTESTATION_VERIFIED_BOOT_REQUIRED'
  );
});


function rec04eTrustDriftFixture(overrides = {}) {
  const job = {
    printJobId: 'PJ-PRT-REC04E-TRUST-001',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    billId: 'BILL-REC04E-TRUST-001',
    jobType: 'RECEIPT',
    status: 'DISPATCHED',
    dispatchedDeviceId: 'DV-ZC0001-POS-01',
    ackChallenge: 'rec04e-trust-drift-challenge',
    ackChallengeExpiresAt: new Date(Date.now() + 60_000),
    attestationRequired: true,
    attestationVersion: 'ZAMORIN_PRINT_ACK_V2',
    attestationKeyThumbprint: 'a'.repeat(64),
    attestationKeyProvider: 'ANDROID_KEYSTORE',
    payloadSha256: 'b'.repeat(64),
    payloadBytes: 16,
    printerTarget: 'DEFAULT_THERMAL',
    drawerKickRequested: false,
    drawerKickStatus: 'NOT_REQUESTED',
    async save() { return this; },
    ...overrides,
  };

  const auth = {
    userId: 'EMP-ZC-1001',
    role: 'STAFF',
    organisationId: 'ORG-ZAMORIN',
    operatorSessionId: 'OPS-REC04E-TRUST-001',
    assignedCafeIds: ['ZC-0001'],
    primaryCafeId: 'ZC-0001',
    deviceContext: {
      deviceId: job.dispatchedDeviceId,
      deviceClass: 'CAFE_OWNED',
      boundCafeId: job.cafeId,
      status: 'ACTIVE',
      trustLevel: 'ENROLLED',
    },
  };

  return { job, auth };
}

test('REC-04E acknowledgement fails closed when operator session ends after dispatch', async (t) => {
  const { job, auth } = rec04eTrustDriftFixture();

  t.mock.method(OperatorSession, 'findOne', () => ({
    lean: async () => null,
  }));
  t.mock.method(PrintJob, 'findOne', async () => job);

  await assert.rejects(
    () => PosOrderService.acknowledgePrintJob(job.printJobId, auth, {
      status: 'PRINTED',
      attestation: {},
    }),
    (err) => {
      assert.equal(err.code, 'OPERATOR_SESSION_DEVICE_MISMATCH');
      assert.equal(job.status, 'DISPATCHED');
      return true;
    }
  );
});

test('REC-04E acknowledgement fails closed when device is revoked or reassigned after dispatch', async (t) => {
  const { job, auth } = rec04eTrustDriftFixture();

  t.mock.method(OperatorSession, 'findOne', () => ({
    lean: async () => ({ status: 'ACTIVE' }),
  }));
  t.mock.method(PrintJob, 'findOne', async () => job);
  t.mock.method(DeviceRegistration, 'findOne', () => ({
    lean: async () => null,
  }));

  await assert.rejects(
    () => PosOrderService.acknowledgePrintJob(job.printJobId, auth, {
      status: 'PRINTED',
      attestation: {},
    }),
    (err) => {
      assert.equal(err.code, 'DEVICE_ATTESTATION_KEY_UNAVAILABLE');
      assert.equal(job.status, 'DISPATCHED');
      return true;
    }
  );
});

test('REC-04E acknowledgement rejects provider drift after dispatch', async (t) => {
  const { job, auth } = rec04eTrustDriftFixture();
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicJwk = pair.publicKey.export({ format: 'jwk' });
  const canonical = attestationService.canonicalPublicJwk(publicJwk);
  const thumbprint = attestationService.publicKeyThumbprint(canonical);
  job.attestationKeyThumbprint = thumbprint;

  t.mock.method(OperatorSession, 'findOne', () => ({
    lean: async () => ({ status: 'ACTIVE' }),
  }));
  t.mock.method(PrintJob, 'findOne', async () => job);
  t.mock.method(DeviceRegistration, 'findOne', () => ({
    lean: async () => ({
      deviceId: job.dispatchedDeviceId,
      organisationId: job.organisationId,
      assignedCafeId: job.cafeId,
      status: 'ACTIVE',
      publicSigningKey: canonical,
      signingKeyAlgorithm: 'ES256',
      signingKeyThumbprint: thumbprint,
      signingKeyProvider: 'WEB_CRYPTO',
    }),
  }));

  await assert.rejects(
    () => PosOrderService.acknowledgePrintJob(job.printJobId, auth, {
      status: 'PRINTED',
      attestation: {},
    }),
    (err) => {
      assert.equal(err.code, 'DEVICE_ATTESTATION_PROVIDER_UNTRUSTED');
      assert.equal(job.status, 'DISPATCHED');
      return true;
    }
  );
});

test('REC-04E acknowledgement rejects an expired first-use challenge without mutating terminal state', async (t) => {
  const { job, auth } = rec04eTrustDriftFixture({
    ackChallengeExpiresAt: new Date(Date.now() - 1_000),
  });

  t.mock.method(OperatorSession, 'findOne', () => ({
    lean: async () => ({ status: 'ACTIVE' }),
  }));
  t.mock.method(PrintJob, 'findOne', async () => job);

  await assert.rejects(
    () => PosOrderService.acknowledgePrintJob(job.printJobId, auth, {
      status: 'PRINTED',
      attestation: {},
    }),
    (err) => {
      assert.equal(err.code, 'PRINT_ACK_CHALLENGE_EXPIRED');
      assert.equal(job.status, 'DISPATCHED');
      return true;
    }
  );
});

test('REC-04E finalization is transactional in production and idempotent Bill repair remains available for fallback environments', () => {
  const source = fs.readFileSync(posServicePath, 'utf8');

  assert.match(source, /executeTransactionWithRetry\(async \(session\) =>/);
  assert.match(source, /PRINT_ACK_TRANSACTION_REQUIRED/);
  assert.match(source, /job\.save\(session \? \{ session \} : undefined\)/);
  assert.match(source, /DeviceRegistration\.updateOne\([\s\S]{0,1200}?session \? \{ session \} : undefined/);
  assert.match(source, /const billNeedsRepair =/);
  assert.match(source, /if \(!statusChanged && !billNeedsRepair\) return/);
  assert.match(source, /PRINT_ACK_BILL_SYNC_FAILED/);
});


test('REC-04E production deployment requires explicit Android app-signing certificate policy', () => {
  const preflight = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'scripts', 'verifyDeploymentConfig.js'),
    'utf8'
  );
  const envExample = fs.readFileSync(
    path.join(__dirname, '..', '.env.example'),
    'utf8'
  );
  const renderConfig = fs.readFileSync(
    path.join(root, 'render.yaml'),
    'utf8'
  );

  assert.match(preflight, /ZAMORIN_ANDROID_APP_PACKAGE/);
  assert.match(preflight, /ZAMORIN_ANDROID_APP_CERT_SHA256/);
  assert.match(preflight, /androidCertPolicyValid/);
  assert.match(preflight, /nodeEnv !== 'production' \|\| androidCertPolicyValid/);
  assert.match(preflight, /one or more 64-hex SHA-256 digests/);

  assert.match(envExample, /ZAMORIN_ANDROID_APP_PACKAGE=com\.zamorin\.cafe\.erp/);
  assert.match(envExample, /ZAMORIN_ANDROID_APP_CERT_SHA256=/);

  assert.match(renderConfig, /key: ZAMORIN_ANDROID_APP_PACKAGE/);
  assert.match(renderConfig, /value: com\.zamorin\.cafe\.erp/);
  assert.match(renderConfig, /key: ZAMORIN_ANDROID_APP_CERT_SHA256[\s\S]{0,80}?sync: false/);
});


test('REC-04E Android attestation root service fails closed when network fetch is unavailable', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    androidAttestationTestOnly.resetTrustCachesForTest();
  });

  androidAttestationTestOnly.resetTrustCachesForTest();
  globalThis.fetch = undefined;

  await assert.rejects(
    () => androidAttestationTestOnly.trustedRoots(),
    (err) => {
      assert.equal(err.code, 'ANDROID_ATTESTATION_ROOTS_UNAVAILABLE');
      assert.equal(err.statusCode, 503);
      return true;
    }
  );
});

test('REC-04E Android attestation trust services fail closed on HTTP and malformed responses', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    androidAttestationTestOnly.resetTrustCachesForTest();
  });

  androidAttestationTestOnly.resetTrustCachesForTest();
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    headers: { get: () => null },
  });

  await assert.rejects(
    () => androidAttestationTestOnly.trustedRoots(),
    (err) => err.code === 'ANDROID_ATTESTATION_ROOTS_UNAVAILABLE'
  );

  androidAttestationTestOnly.resetTrustCachesForTest();
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'max-age=60' },
    json: async () => ({ not: 'a root list' }),
  });

  await assert.rejects(
    () => androidAttestationTestOnly.trustedRoots(),
    (err) => err.code === 'ANDROID_ATTESTATION_ROOTS_UNAVAILABLE'
  );

  androidAttestationTestOnly.resetTrustCachesForTest();
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'max-age=60' },
    json: async () => ({ entries: null }),
  });

  await assert.rejects(
    () => androidAttestationTestOnly.revocations(),
    (err) => err.code === 'ANDROID_ATTESTATION_REVOCATION_STATUS_UNAVAILABLE'
  );
});

test('REC-04E expired trust cache is never used as a stale fallback after refresh failure', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    androidAttestationTestOnly.resetTrustCachesForTest();
  });

  androidAttestationTestOnly.resetTrustCachesForTest();
  androidAttestationTestOnly.revocationCache.value = { entries: { cached: { status: 'REVOKED' } } };
  androidAttestationTestOnly.revocationCache.expiresAt = Date.now() - 1;

  globalThis.fetch = async () => {
    throw new Error('SIMULATED_ATTESTATION_STATUS_OUTAGE');
  };

  await assert.rejects(
    () => androidAttestationTestOnly.revocations(),
    (err) => {
      assert.equal(err.code, 'ANDROID_ATTESTATION_REVOCATION_STATUS_UNAVAILABLE');
      return true;
    }
  );
});

test('REC-04E fresh revocation cache is usable without weakening expiry semantics', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    androidAttestationTestOnly.resetTrustCachesForTest();
  });

  androidAttestationTestOnly.resetTrustCachesForTest();
  androidAttestationTestOnly.revocationCache.value = {
    entries: {
      abcd: { status: 'REVOKED', reason: 'KEY_COMPROMISE' },
    },
  };
  androidAttestationTestOnly.revocationCache.expiresAt = Date.now() + 60_000;

  globalThis.fetch = async () => {
    throw new Error('NETWORK_MUST_NOT_BE_USED_FOR_FRESH_CACHE');
  };

  const entries = await androidAttestationTestOnly.revocations();
  assert.equal(entries.abcd.status, 'REVOKED');
  assert.deepEqual(revocationLookupKeys('00:AB:CD'), ['abcd', '43981']);
});


test('REC-04E local bridge writes the exact canonical ESC/POS bytes to configured TCP transport', async (t) => {
  const bridgeModule = await import(pathToFileURL(localBridgePath).href);
  const received = [];
  const tcpServer = net.createServer((socket) => {
    socket.on('data', (chunk) => received.push(Buffer.from(chunk)));
  });

  await new Promise((resolve, reject) => {
    tcpServer.once('error', reject);
    tcpServer.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => tcpServer.close());

  const address = tcpServer.address();
  const canonicalBytes = Buffer.from([0x1b, 0x40, 0x5a, 0x41, 0x4d, 0x4f, 0x52, 0x49, 0x4e, 0x0a]);
  const digest = crypto.createHash('sha256').update(canonicalBytes).digest('hex');
  const validated = bridgeModule.validatePrintRequest({
    printJobId: 'PJ-REC04E-TCP-001',
    printBufferBase64: canonicalBytes.toString('base64'),
    expectedPayloadSha256: digest,
    expectedPayloadBytes: canonicalBytes.length,
    printerTarget: 'DEFAULT_THERMAL',
  });
  assert.deepEqual(validated.buffer, canonicalBytes);

  const result = await bridgeModule.dispatchNetworkPrint(canonicalBytes, {
    host: '127.0.0.1',
    port: address.port,
    printerId: 'TEST-THERMAL-01',
    connectTimeoutMs: 2000,
  });
  assert.equal(result.transportAccepted, true);
  assert.equal(result.bytesDispatched, canonicalBytes.length);

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(Buffer.concat(received), canonicalBytes);
});

test('REC-04E local bridge rejects mutated payload bytes before any printer transport', async () => {
  const bridgeModule = await import(pathToFileURL(localBridgePath).href);
  const canonicalBytes = Buffer.from('canonical receipt bytes');
  const digest = crypto.createHash('sha256').update(canonicalBytes).digest('hex');
  const mutated = Buffer.from('mutated receipt bytes');

  assert.throws(
    () => bridgeModule.validatePrintRequest({
      printJobId: 'PJ-REC04E-TCP-002',
      printBufferBase64: mutated.toString('base64'),
      expectedPayloadSha256: digest,
      expectedPayloadBytes: mutated.length,
      printerTarget: 'DEFAULT_THERMAL',
    }),
    (err) => err.code === 'PRINT_PAYLOAD_HASH_MISMATCH'
  );
});

test('REC-04E raw TCP transport never overclaims printer identity or physical paper completion', () => {
  const bridge = fs.readFileSync(localBridgePath, 'utf8');
  const client = fs.readFileSync(hardwareClientPath, 'utf8');
  const till = fs.readFileSync(posTillPath, 'utf8');
  const source = fs.readFileSync(posServicePath, 'utf8');

  assert.match(bridge, /transportMode: 'LOCAL_RAW_ESC_POS'/);
  assert.match(bridge, /evidenceLevel: 'CONTENT_BOUND_TRANSPORT'/);
  assert.match(bridge, /contentBindingVerified: true/);
  assert.match(bridge, /printerIdentityVerified: false/);
  assert.match(bridge, /physicalCompletionVerified: false/);
  assert.match(bridge, /dispatchNetworkPrint/);
  assert.match(bridge, /PRINT_PAYLOAD_HASH_MISMATCH/);

  assert.match(client, /async printCanonicalEscPos\(dispatch = \{\}\)/);
  assert.match(client, /result\?\.payloadSha256 !== dispatch\.payloadSha256/);
  assert.match(till, /hardwareBridge\.printCanonicalEscPos\(dispatch\)/);
  assert.ok(
    till.indexOf('hardwareBridge.printCanonicalEscPos(dispatch)') < till.indexOf('window.print();'),
    'Exact-byte local bridge must be attempted before browser print dialog fallback'
  );

  assert.match(source, /payloadSha256: printDispatchAuthorized \? printResult\.payloadSha256 : null/);
  assert.match(source, /payloadBytes: printDispatchAuthorized \? printResult\.payloadBytes : null/);
});


test('REC-04E raw network printer endpoint is pinned without falsely verifying printer hardware identity', async () => {
  const bridgeModule = await import(pathToFileURL(localBridgePath).href);
  const base = {
    ZAMORIN_PRINTER_TRANSPORT: 'NETWORK_TCP',
    ZAMORIN_PRINTER_HOST: '192.0.2.44',
    ZAMORIN_PRINTER_PORT: '9100',
    ZAMORIN_PRINTER_ID: 'COUNTER-01-THERMAL',
  };
  const expected = bridgeModule.printerEndpointFingerprint({
    transport: 'NETWORK_TCP',
    host: '192.0.2.44',
    port: 9100,
    printerId: 'COUNTER-01-THERMAL',
  });

  const missingPin = bridgeModule.resolveNetworkPrinterConfig(base);
  assert.equal(missingPin.configured, false);
  assert.equal(missingPin.endpointPinned, false);
  assert.equal(missingPin.reason, 'PRINTER_ENDPOINT_PIN_REQUIRED');
  assert.equal(missingPin.endpointFingerprint, expected);

  const pinned = bridgeModule.resolveNetworkPrinterConfig({
    ...base,
    ZAMORIN_PRINTER_ENDPOINT_SHA256: expected,
  });
  assert.equal(pinned.configured, true);
  assert.equal(pinned.endpointPinned, true);

  const tampered = bridgeModule.resolveNetworkPrinterConfig({
    ...base,
    ZAMORIN_PRINTER_HOST: '192.0.2.45',
    ZAMORIN_PRINTER_ENDPOINT_SHA256: expected,
  });
  assert.equal(tampered.configured, false);
  assert.equal(tampered.endpointPinned, false);
  assert.equal(tampered.reason, 'PRINTER_ENDPOINT_PIN_MISMATCH');

  const bridge = fs.readFileSync(localBridgePath, 'utf8');
  assert.match(bridge, /printerEndpointPinned: printerConfig\.endpointPinned === true/);
  assert.match(bridge, /printerIdentityVerified: false/);
  assert.doesNotMatch(
    bridge,
    /printerIdentityVerified:\s*printerConfig\.endpointPinned/,
    'Endpoint pinning must never be promoted into physical-printer identity verification'
  );
});

test('REC-04E local bridge ships an explicit non-secret endpoint-pinning configuration template', () => {
  const template = fs.readFileSync(
    path.join(root, 'scripts', 'zamorin_local_printer_bridge.env.example'),
    'utf8'
  );
  assert.match(template, /ZAMORIN_PRINTER_TRANSPORT=NETWORK_TCP/);
  assert.match(template, /ZAMORIN_PRINTER_ENDPOINT_SHA256=/);
  assert.match(template, /NOT cryptographic proof/);
});
