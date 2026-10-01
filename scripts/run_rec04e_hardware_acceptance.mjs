import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';
import crypto from 'crypto';
import { signAcceptanceReport } from './rec04e_hardware_acceptance_signature.mjs';

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [rawKey, ...rest] = arg.slice(2).split('=');
    out[rawKey] = rest.length ? rest.join('=') : 'true';
  }
  return out;
}
function yes(value) {
  return String(value || '').trim().toLowerCase() === 'yes';
}
function resolveCandidateSha(explicitSha) {
  const provided = String(explicitSha || '').trim().toLowerCase();
  if (provided) {
    if (/^[a-f0-9]{40}$/.test(provided)) return provided;
    const err = new Error('REC04E_CANDIDATE_SHA_INVALID');
    err.code = 'REC04E_CANDIDATE_SHA_INVALID';
    throw err;
  }
  const gitResult = spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const gitSha = String(gitResult.stdout || '').trim().toLowerCase();
  if (gitResult.status === 0 && /^[a-f0-9]{40}$/.test(gitSha)) return gitSha;
  const err = new Error('REC04E_CANDIDATE_SHA_REQUIRED');
  err.code = 'REC04E_CANDIDATE_SHA_REQUIRED';
  throw err;
}
async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  let body = null;
  try { body = await response.json(); } catch (_) {}
  if (!response.ok) {
    const err = new Error(body?.error || `HTTP_${response.status}`);
    err.code = body?.error || `HTTP_${response.status}`;
    err.status = response.status;
    throw err;
  }
  return body;
}

const args = parseArgs(process.argv.slice(2));
const candidateSha = resolveCandidateSha(args['candidate-sha']);
const dispatchJsonPath = String(args['dispatch-json'] || '').trim();
if (!dispatchJsonPath) throw new Error('REC04E_SERVER_DISPATCH_JSON_REQUIRED');

const dispatchEnvelope = JSON.parse(await readFile(path.resolve(dispatchJsonPath), 'utf8'));
const dispatch = dispatchEnvelope?.data || dispatchEnvelope;
if (
  dispatch?.printDispatchAuthorized !== true ||
  dispatch?.printTrackingPersisted !== true ||
  !dispatch?.printJobId ||
  !dispatch?.printBuffer ||
  !dispatch?.payloadSha256 ||
  !Number.isSafeInteger(Number(dispatch?.payloadBytes)) ||
  !dispatch?.printDispatchAuthorization
) {
  throw new Error('REC04E_SERVER_DISPATCH_INVALID');
}

const bridgeBase = String(args.bridge || 'http://127.0.0.1:9199').replace(/\/+$/, '');
const printerSerial = String(args['printer-serial'] || '').trim();
const printerModel = String(args['printer-model'] || '').trim();
const paperConfirmed = yes(args['confirm-paper']);
const cutConfirmed = yes(args['confirm-cut']);
const drawerRequested = dispatch.drawerKickRequested === true;
const drawerConfirmed = !drawerRequested || yes(args['confirm-drawer']);
const acceptanceId = `REC04E-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const health = await requestJson(`${bridgeBase}/health`);
if (
  health?.hardwareReady !== true ||
  health?.printerEndpointPinned !== true ||
  health?.dispatchAuthorizationReady !== true ||
  health?.transportMode !== 'LOCAL_RAW_ESC_POS'
) {
  throw new Error('REC04E_BRIDGE_NOT_READY_OR_PINNED');
}

const bridgeResult = await requestJson(`${bridgeBase}/print`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    printJobId: dispatch.printJobId,
    printBufferBase64: dispatch.printBuffer,
    expectedPayloadSha256: dispatch.payloadSha256,
    expectedPayloadBytes: Number(dispatch.payloadBytes),
    printerTarget: dispatch.printerTarget || 'DEFAULT_THERMAL',
    drawerKickRequested: drawerRequested,
    printDispatchAuthorization: dispatch.printDispatchAuthorization,
  }),
});

const contentTransportVerified =
  bridgeResult?.success === true &&
  bridgeResult?.serverDispatchAuthorized === true &&
  bridgeResult?.transportAccepted === true &&
  bridgeResult?.contentBindingVerified === true &&
  bridgeResult?.printerEndpointPinned === true &&
  bridgeResult?.payloadSha256 === dispatch.payloadSha256 &&
  Number(bridgeResult?.payloadBytes) === Number(dispatch.payloadBytes);

const certified =
  contentTransportVerified &&
  paperConfirmed &&
  cutConfirmed &&
  drawerConfirmed &&
  Boolean(printerSerial) &&
  Boolean(printerModel);

const report = {
  schemaVersion: 'REC04E_HARDWARE_ACCEPTANCE_V1',
  candidateSha,
  acceptanceId,
  createdAt: new Date().toISOString(),
  printJobId: dispatch.printJobId,
  printer: {
    configuredPrinterId: health.configuredPrinterId || bridgeResult?.printerIdentity || null,
    endpointFingerprint: health.printerEndpointFingerprint || null,
    endpointPinned: health.printerEndpointPinned === true,
    model: printerModel || null,
    serial: printerSerial || null,
  },
  payload: {
    sha256: dispatch.payloadSha256,
    bytes: Number(dispatch.payloadBytes),
    drawerKickRequested: drawerRequested,
    serverDispatchAuthorized: bridgeResult?.serverDispatchAuthorized === true,
  },
  transport: { contentTransportVerified, response: bridgeResult },
  physicalObservation: {
    paperOutputConfirmed: paperConfirmed,
    cutterConfirmed: cutConfirmed,
    drawerOpenedConfirmed: drawerRequested ? drawerConfirmed : null,
    confirmationSource: 'HUMAN_OPERATOR',
  },
  runtimeEvidenceBoundary: {
    printerIdentityCryptographicallyVerified: false,
    physicalPrintCryptographicallyVerified: false,
    note: 'Human acceptance confirms observed hardware behavior but does not upgrade runtime REC-04E cryptographic evidence.',
  },
  certified,
};

const signedReport = signAcceptanceReport(report);
const outDir = path.resolve(args.output || '.local-evidence-storage/rec04e-hardware');
await mkdir(outDir, { recursive: true });
const reportPath = path.join(outDir, `${acceptanceId}.json`);
await writeFile(reportPath, JSON.stringify(signedReport, null, 2), { encoding: 'utf8', mode: 0o600 });
console.log(JSON.stringify({
  reportPath,
  certified,
  acceptanceId,
  candidateSha,
  integritySignatureKeyId: signedReport.integritySignature.keyId,
}, null, 2));
if (!certified) {
  console.error('REC-04E hardware acceptance is NOT certified. Use a real server-issued --dispatch-json and confirm observed hardware behavior.');
  process.exitCode = 2;
}
