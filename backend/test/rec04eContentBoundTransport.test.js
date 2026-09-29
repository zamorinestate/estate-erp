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
