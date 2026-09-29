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
const posTillPath = path.join(root, 'frontend', 'src', 'js', 'pages', 'posTill.js');

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
  assert.match(bridge,/val evidenceLevel = "SPOOLER_COMPLETION"/);
  assert.match(bridge,/val contentBindingVerified = false/);
  assert.match(bridge,/val printerIdentityVerified = false/);
  assert.match(pm,/printerIdentity = printJob\.info\?\.printerId\?\.toString\(\)/);
  assert.match(front,/ANDROID_PRINT_EVIDENCE_OVERCLAIM/);
  assert.match(till,/"OPEN_SYSTEM_PRINT"/);
  assert.doesNotMatch(till,/"OPEN_SYSTEM_PRINT"[\s\S]{0,500}?printBuffer/);
});

test('REC-04E keeps legacy V1 verification for in-flight REC-04D jobs', () => {
  const payload=attestationService.buildPrintAckPayload({organisationId:'ORG-ZAMORIN',cafeId:'ZC-0001',deviceId:'DV-ZC0001-POS-01',printJobId:'PJ-LEGACY-001',challenge:'legacy-challenge',status:'FAILED',drawerKickStatus:'UNCHANGED',failureCode:'DEVICE_PRINT_FAILED',failureReason:'legacy failure'});
  assert.ok(payload.startsWith('ZAMORIN_DEVICE_ACK_V1\n'));
  assert.doesNotMatch(payload,/expectedPayloadSha256/);
});
