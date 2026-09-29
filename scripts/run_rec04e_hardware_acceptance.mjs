import crypto from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

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

function buildAcceptanceEscPos({ acceptanceId, includeDrawer }) {
  const chunks = [
    Buffer.from([0x1b, 0x40]),
    Buffer.from('ZAMORIN CAFE ERP\n', 'utf8'),
    Buffer.from('REC-04E PHYSICAL HARDWARE ACCEPTANCE\n', 'utf8'),
    Buffer.from(`Acceptance ID: ${acceptanceId}\n`, 'utf8'),
    Buffer.from('Verify exact text, full paper output and cutter.\n', 'utf8'),
  ];
  if (includeDrawer) {
    chunks.push(Buffer.from('Drawer pulse follows this line.\n', 'utf8'));
    chunks.push(Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]));
  }
  chunks.push(Buffer.from('\n\n\n', 'utf8'));
  chunks.push(Buffer.from([0x1d, 0x56, 0x01]));
  return Buffer.concat(chunks);
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
const bridgeBase = String(args.bridge || 'http://127.0.0.1:9199').replace(/\/+$/, '');
const printerSerial = String(args['printer-serial'] || '').trim();
const printerModel = String(args['printer-model'] || '').trim();
const includeDrawer = String(args['test-drawer'] || '').toLowerCase() === 'true';
const paperConfirmed = yes(args['confirm-paper']);
const cutConfirmed = yes(args['confirm-cut']);
const drawerConfirmed = !includeDrawer || yes(args['confirm-drawer']);
const acceptanceId = `REC04E-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const health = await requestJson(`${bridgeBase}/health`);
if (
  health?.hardwareReady !== true ||
  health?.printerEndpointPinned !== true ||
  health?.transportMode !== 'LOCAL_RAW_ESC_POS'
) {
  throw new Error('REC04E_BRIDGE_NOT_READY_OR_PINNED');
}

const bytes = buildAcceptanceEscPos({ acceptanceId, includeDrawer });
const payloadSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const printJobId = `PJ-${acceptanceId}`;

const bridgeResult = await requestJson(`${bridgeBase}/print`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    printJobId,
    printBufferBase64: bytes.toString('base64'),
    expectedPayloadSha256: payloadSha256,
    expectedPayloadBytes: bytes.length,
    printerTarget: 'DEFAULT_THERMAL',
    drawerKickRequested: includeDrawer,
  }),
});

const contentTransportVerified =
  bridgeResult?.success === true &&
  bridgeResult?.transportAccepted === true &&
  bridgeResult?.contentBindingVerified === true &&
  bridgeResult?.printerEndpointPinned === true &&
  bridgeResult?.payloadSha256 === payloadSha256 &&
  Number(bridgeResult?.payloadBytes) === bytes.length;

const certified =
  contentTransportVerified &&
  paperConfirmed &&
  cutConfirmed &&
  drawerConfirmed &&
  Boolean(printerSerial) &&
  Boolean(printerModel);

const report = {
  schemaVersion: 'REC04E_HARDWARE_ACCEPTANCE_V1',
  acceptanceId,
  createdAt: new Date().toISOString(),
  printJobId,
  printer: {
    configuredPrinterId: health.configuredPrinterId || bridgeResult?.printerIdentity || null,
    endpointFingerprint: health.printerEndpointFingerprint || null,
    endpointPinned: health.printerEndpointPinned === true,
    model: printerModel || null,
    serial: printerSerial || null,
  },
  payload: {
    sha256: payloadSha256,
    bytes: bytes.length,
    drawerKickRequested: includeDrawer,
  },
  transport: {
    contentTransportVerified,
    response: bridgeResult,
  },
  physicalObservation: {
    paperOutputConfirmed: paperConfirmed,
    cutterConfirmed: cutConfirmed,
    drawerOpenedConfirmed: includeDrawer ? drawerConfirmed : null,
    confirmationSource: 'HUMAN_OPERATOR',
  },
  runtimeEvidenceBoundary: {
    printerIdentityCryptographicallyVerified: false,
    physicalPrintCryptographicallyVerified: false,
    note: 'Human acceptance confirms observed hardware behavior but does not upgrade runtime REC-04E cryptographic evidence.',
  },
  certified,
};

const outDir = path.resolve(
  args.output || '.local-evidence-storage/rec04e-hardware'
);
await mkdir(outDir, { recursive: true });
const reportPath = path.join(outDir, `${acceptanceId}.json`);
await writeFile(reportPath, JSON.stringify(report, null, 2), { encoding: 'utf8', mode: 0o600 });

console.log(JSON.stringify({ reportPath, certified, acceptanceId }, null, 2));
if (!certified) {
  console.error(
    'REC-04E hardware acceptance is NOT certified. Re-run on the real printer with --printer-model, --printer-serial, --confirm-paper=yes, --confirm-cut=yes and, when testing the drawer, --confirm-drawer=yes.'
  );
  process.exitCode = 2;
}
