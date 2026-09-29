'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const attestationService = require('../src/services/deviceAttestationService');
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
  assert.match(frontend, /while \(Date\.now\(\) - monitorStartedAt < maxMonitorMs\)/);
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
  assert.match(deviceService, /reasonCode: 'DEVICE_ATTESTATION_KEY_VERIFIED'/);
  assert.doesNotMatch(deviceService, /reasonCode: 'DEVICE_ATTESTATION_KEY_BOUND'/);

  assert.match(router, /getNativeDeviceAttestationIdentity\([\s\S]{0,500}?publicSigningKey: signingIdentity\.capable \? signingIdentity\.publicKeyJwk : null/);
  assert.match(router, /DEVICE_ATTESTATION_REENROLLMENT_REQUIRED/);
});
