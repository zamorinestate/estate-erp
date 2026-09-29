/**
 * Zamorin Café ERP — Local ESC/POS Hardware Bridge
 *
 * REC-04E evidence semantics:
 * - NETWORK_TCP can prove the exact canonical ESC/POS bytes were accepted by
 *   the configured local TCP transport.
 * - Raw port-9100 TCP does NOT prove cryptographic printer identity.
 * - Raw port-9100 TCP does NOT prove that paper physically printed.
 * Those stronger claims remain false until an authenticated printer protocol or
 * independent hardware sensor exists.
 */

import http from 'http';
import net from 'net';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { verificationKeyInfo, verifyPrintDispatchAuthorization } =
  require('../backend/src/services/printDispatchAuthorizationService.js');

const PORT = 9199;
const HOST = '127.0.0.1';
const MAX_ESC_POS_BYTES = 128 * 1024;
const MAX_PAYLOAD_BYTES = 256 * 1024;
const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const JOURNAL_VERSION = 1;
const DEFAULT_JOURNAL_PATH = path.join(
  os.homedir(),
  '.zamorin-cafe-erp',
  'printer-bridge-journal.json'
);
const printJobLocks = new Map();

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
  'https://zamorin-cafe-erp.vercel.app',
];
const ALLOWED_ORIGINS = new Set([
  ...DEFAULT_ALLOWED_ORIGINS,
  ...String(process.env.ZAMORIN_BRIDGE_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
]);

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function printerEndpointFingerprint({ transport, host, port, printerId } = {}) {
  const canonical = [
    'ZAMORIN_PRINTER_ENDPOINT_V1',
    `transport=${String(transport || '').trim().toUpperCase()}`,
    `host=${String(host || '').trim().toLowerCase()}`,
    `port=${Number(port) || 0}`,
    `printerId=${String(printerId || '').trim()}`,
  ].join('\n');
  return sha256Hex(Buffer.from(canonical, 'utf8'));
}

function resolveNetworkPrinterConfig(env = process.env) {
  const transport = String(env.ZAMORIN_PRINTER_TRANSPORT || '').trim().toUpperCase();
  const host = String(env.ZAMORIN_PRINTER_HOST || '').trim();
  const port = Number(env.ZAMORIN_PRINTER_PORT || 9100);
  const printerId = String(env.ZAMORIN_PRINTER_ID || '').trim();
  const endpointBaseConfigured =
    transport === 'NETWORK_TCP' &&
    Boolean(host) &&
    Number.isInteger(port) &&
    port > 0 &&
    port <= 65535 &&
    Boolean(printerId);
  const endpointFingerprint = endpointBaseConfigured
    ? printerEndpointFingerprint({ transport, host, port, printerId })
    : null;
  const expectedFingerprint = String(
    env.ZAMORIN_PRINTER_ENDPOINT_SHA256 || ''
  ).trim().toLowerCase();
  const endpointPinConfigured = /^[a-f0-9]{64}$/.test(expectedFingerprint);
  const endpointPinned =
    endpointBaseConfigured &&
    endpointPinConfigured &&
    expectedFingerprint === endpointFingerprint;
  const configured = endpointBaseConfigured && endpointPinned;

  let reason = null;
  if (!endpointBaseConfigured) reason = 'HARDWARE_TRANSPORT_NOT_CONFIGURED';
  else if (!endpointPinConfigured) reason = 'PRINTER_ENDPOINT_PIN_REQUIRED';
  else if (!endpointPinned) reason = 'PRINTER_ENDPOINT_PIN_MISMATCH';

  return {
    configured,
    endpointBaseConfigured,
    endpointPinned,
    endpointFingerprint,
    expectedFingerprint: endpointPinConfigured ? expectedFingerprint : null,
    reason,
    transport,
    host,
    port,
    printerId,
  };
}

function decodeCanonicalBase64(value) {
  const clean = String(value || '').trim();
  if (!clean || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) {
    const err = new Error('PRINT_BUFFER_INVALID');
    err.code = 'PRINT_BUFFER_INVALID';
    throw err;
  }
  const buffer = Buffer.from(clean, 'base64');
  if (
    !buffer.length ||
    buffer.length > MAX_ESC_POS_BYTES ||
    buffer.toString('base64').replace(/=+$/, '') !== clean.replace(/=+$/, '')
  ) {
    const err = new Error('PRINT_BUFFER_INVALID');
    err.code = 'PRINT_BUFFER_INVALID';
    throw err;
  }
  return buffer;
}

function validatePrintRequest(payload = {}) {
  const printJobId = String(payload.printJobId || '').trim();
  const expectedPayloadSha256 = String(payload.expectedPayloadSha256 || '').trim().toLowerCase();
  const expectedPayloadBytes = Number(payload.expectedPayloadBytes);
  const printerTarget = String(payload.printerTarget || 'DEFAULT_THERMAL').trim().toUpperCase();
  const buffer = decodeCanonicalBase64(payload.printBufferBase64);

  if (!printJobId || !/^[a-f0-9]{64}$/.test(expectedPayloadSha256)) {
    const err = new Error('PRINT_CONTENT_BINDING_REQUIRED');
    err.code = 'PRINT_CONTENT_BINDING_REQUIRED';
    throw err;
  }
  if (!Number.isSafeInteger(expectedPayloadBytes) || expectedPayloadBytes <= 0) {
    const err = new Error('PRINT_CONTENT_BINDING_REQUIRED');
    err.code = 'PRINT_CONTENT_BINDING_REQUIRED';
    throw err;
  }
  if (buffer.length !== expectedPayloadBytes) {
    const err = new Error('PRINT_PAYLOAD_LENGTH_MISMATCH');
    err.code = 'PRINT_PAYLOAD_LENGTH_MISMATCH';
    throw err;
  }
  const actualPayloadSha256 = sha256Hex(buffer);
  if (actualPayloadSha256 !== expectedPayloadSha256) {
    const err = new Error('PRINT_PAYLOAD_HASH_MISMATCH');
    err.code = 'PRINT_PAYLOAD_HASH_MISMATCH';
    throw err;
  }
  if (printerTarget !== 'DEFAULT_THERMAL') {
    const err = new Error('UNSUPPORTED_PRINTER_TARGET');
    err.code = 'UNSUPPORTED_PRINTER_TARGET';
    throw err;
  }

  return {
    printJobId,
    expectedPayloadSha256,
    expectedPayloadBytes,
    printerTarget,
    drawerKickRequested: payload.drawerKickRequested === true,
    buffer,
  };
}

function resolveJournalPath(env = process.env) {
  const configured = String(env.ZAMORIN_BRIDGE_STATE_FILE || '').trim();
  return configured ? path.resolve(configured) : DEFAULT_JOURNAL_PATH;
}

async function readJournal(journalPath = resolveJournalPath()) {
  try {
    const raw = await readFile(journalPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      parsed.version !== JOURNAL_VERSION ||
      !parsed.jobs ||
      typeof parsed.jobs !== 'object' ||
      Array.isArray(parsed.jobs)
    ) {
      const err = new Error('PRINT_JOURNAL_INVALID');
      err.code = 'PRINT_JOURNAL_INVALID';
      throw err;
    }
    return parsed;
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return { version: JOURNAL_VERSION, jobs: {} };
    }
    if (err?.code === 'PRINT_JOURNAL_INVALID') throw err;
    const wrapped = new Error('PRINT_JOURNAL_READ_FAILED');
    wrapped.code = 'PRINT_JOURNAL_READ_FAILED';
    wrapped.cause = err;
    throw wrapped;
  }
}

async function writeJournalAtomic(journal, journalPath = resolveJournalPath()) {
  const directory = path.dirname(journalPath);
  await mkdir(directory, { recursive: true });
  const tempPath = `${journalPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, JSON.stringify(journal, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(tempPath, journalPath);
  } catch (err) {
    try { await unlink(tempPath); } catch (_) {}
    const wrapped = new Error('PRINT_JOURNAL_WRITE_FAILED');
    wrapped.code = 'PRINT_JOURNAL_WRITE_FAILED';
    wrapped.cause = err;
    throw wrapped;
  }
}

function transportJournalIdentity(validated, printerConfig) {
  return {
    printJobId: validated.printJobId,
    payloadSha256: validated.expectedPayloadSha256,
    payloadBytes: validated.expectedPayloadBytes,
    drawerKickRequested: validated.drawerKickRequested === true,
    endpointFingerprint: printerConfig.endpointFingerprint,
  };
}

function assertJournalIdentityMatches(record, identity) {
  if (
    !record ||
    record.payloadSha256 !== identity.payloadSha256 ||
    Number(record.payloadBytes) !== Number(identity.payloadBytes) ||
    record.drawerKickRequested === true !== (identity.drawerKickRequested === true) ||
    record.endpointFingerprint !== identity.endpointFingerprint
  ) {
    const err = new Error('PRINT_JOB_PAYLOAD_CONFLICT');
    err.code = 'PRINT_JOB_PAYLOAD_CONFLICT';
    throw err;
  }
}

async function withPrintJobLock(printJobId, operation) {
  const key = String(printJobId || '').trim();
  const prior = printJobLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const chain = prior.then(() => current);
  printJobLocks.set(key, chain);

  await prior;
  try {
    return await operation();
  } finally {
    release();
    if (printJobLocks.get(key) === chain) {
      printJobLocks.delete(key);
    }
  }
}

function activePrintJobLockCount() {
  return printJobLocks.size;
}

async function dispatchNetworkPrint(
  buffer,
  {
    host,
    port,
    printerId,
    connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
    onWriteStarted = null,
  } = {}
) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    const err = new Error('PRINT_BUFFER_INVALID');
    err.code = 'PRINT_BUFFER_INVALID';
    throw err;
  }
  if (!host || !Number.isInteger(Number(port)) || Number(port) <= 0 || Number(port) > 65535 || !printerId) {
    const err = new Error('HARDWARE_TRANSPORT_NOT_CONFIGURED');
    err.code = 'HARDWARE_TRANSPORT_NOT_CONFIGURED';
    throw err;
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    let writeAccepted = false;
    const socket = net.createConnection({ host, port: Number(port) });

    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
      if (err) reject(err);
      else resolve(result);
    };

    const timer = setTimeout(() => {
      const err = new Error('PRINTER_TRANSPORT_TIMEOUT');
      err.code = 'PRINTER_TRANSPORT_TIMEOUT';
      finish(err);
    }, Math.max(250, Number(connectTimeoutMs) || DEFAULT_CONNECT_TIMEOUT_MS));

    socket.once('connect', async () => {
      try {
        if (typeof onWriteStarted === 'function') {
          await onWriteStarted();
        }
        socket.write(buffer, () => {
          writeAccepted = true;
          socket.end();
        });
      } catch (cause) {
        const err = new Error(cause?.code || 'PRINT_JOURNAL_WRITE_FAILED');
        err.code = cause?.code || 'PRINT_JOURNAL_WRITE_FAILED';
        err.cause = cause;
        finish(err);
      }
    });
    socket.once('error', (cause) => {
      const err = new Error('PRINTER_TRANSPORT_WRITE_FAILED');
      err.code = 'PRINTER_TRANSPORT_WRITE_FAILED';
      err.cause = cause;
      finish(err);
    });
    socket.once('close', (hadError) => {
      if (!settled && !hadError && writeAccepted) {
        finish(null, {
          bytesDispatched: buffer.length,
          transportAccepted: true,
        });
      }
    });
  });
}

async function processJournaledPrint(
  payload,
  printerConfig,
  {
    journalPath = resolveJournalPath(),
    dispatchFn = dispatchNetworkPrint,
  } = {}
) {
  const validated = validatePrintRequest(payload);

  return await withPrintJobLock(validated.printJobId, async () => {
    const identity = transportJournalIdentity(validated, printerConfig);
    let journal = await readJournal(journalPath);
    const prior = journal.jobs[validated.printJobId] || null;

    if (prior) {
      assertJournalIdentityMatches(prior, identity);

      if (prior.state === 'TRANSPORT_ACCEPTED') {
        return {
          success: true,
          idempotentReplay: true,
          printJobId: validated.printJobId,
          dispatched: true,
          acknowledged: false,
          transportAccepted: true,
          bytesDispatched: Number(prior.bytesDispatched || validated.expectedPayloadBytes),
          payloadSha256: validated.expectedPayloadSha256,
          payloadBytes: validated.expectedPayloadBytes,
          printerTarget: validated.printerTarget,
          transportMode: 'LOCAL_RAW_ESC_POS',
          evidenceLevel: 'CONTENT_BOUND_TRANSPORT',
          contentBindingVerified: true,
          printerIdentity: printerConfig.printerId,
          printerEndpointFingerprint: printerConfig.endpointFingerprint,
          printerEndpointPinned: printerConfig.endpointPinned === true,
          printerIdentityVerified: false,
          physicalCompletionVerified: false,
          drawerKickRequested: validated.drawerKickRequested,
          drawerCommandTransportAccepted:
            validated.drawerKickRequested && prior.transportAccepted === true,
          drawerHardwareVerified: false,
          drawerState: 'UNKNOWN',
        };
      }

      if (prior.state === 'WRITE_STARTED' || prior.state === 'OUTCOME_UNKNOWN') {
        const err = new Error('PRINT_TRANSPORT_OUTCOME_UNKNOWN');
        err.code = 'PRINT_TRANSPORT_OUTCOME_UNKNOWN';
        err.journalState = prior.state;
        throw err;
      }

      if (prior.state !== 'FAILED_BEFORE_WRITE') {
        const err = new Error('PRINT_JOURNAL_STATE_INVALID');
        err.code = 'PRINT_JOURNAL_STATE_INVALID';
        throw err;
      }
    }

    const now = new Date().toISOString();
    const baseRecord = {
      ...identity,
      state: 'FAILED_BEFORE_WRITE',
      transportAccepted: false,
      bytesDispatched: 0,
      createdAt: prior?.createdAt || now,
      updatedAt: now,
    };
    journal.jobs[validated.printJobId] = baseRecord;
    await writeJournalAtomic(journal, journalPath);

    let writeStarted = false;
    try {
      const transport = await dispatchFn(validated.buffer, {
        ...printerConfig,
        onWriteStarted: async () => {
          writeStarted = true;
          journal = await readJournal(journalPath);
          const live = journal.jobs[validated.printJobId];
          assertJournalIdentityMatches(live, identity);
          journal.jobs[validated.printJobId] = {
            ...live,
            state: 'WRITE_STARTED',
            writeStartedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await writeJournalAtomic(journal, journalPath);
        },
      });

      journal = await readJournal(journalPath);
      const live = journal.jobs[validated.printJobId];
      assertJournalIdentityMatches(live, identity);
      journal.jobs[validated.printJobId] = {
        ...live,
        state: 'TRANSPORT_ACCEPTED',
        transportAccepted: true,
        bytesDispatched: transport.bytesDispatched,
        acceptedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await writeJournalAtomic(journal, journalPath);

      return {
        success: true,
        idempotentReplay: false,
        printJobId: validated.printJobId,
        dispatched: true,
        acknowledged: false,
        transportAccepted: true,
        bytesDispatched: transport.bytesDispatched,
        payloadSha256: validated.expectedPayloadSha256,
        payloadBytes: validated.expectedPayloadBytes,
        printerTarget: validated.printerTarget,
        transportMode: 'LOCAL_RAW_ESC_POS',
        evidenceLevel: 'CONTENT_BOUND_TRANSPORT',
        contentBindingVerified: true,
        printerIdentity: printerConfig.printerId,
        printerEndpointFingerprint: printerConfig.endpointFingerprint,
        printerEndpointPinned: printerConfig.endpointPinned === true,
        printerIdentityVerified: false,
        physicalCompletionVerified: false,
        drawerKickRequested: validated.drawerKickRequested,
        drawerCommandTransportAccepted:
          validated.drawerKickRequested && transport.transportAccepted === true,
        drawerHardwareVerified: false,
        drawerState: 'UNKNOWN',
      };
    } catch (err) {
      journal = await readJournal(journalPath);
      const live = journal.jobs[validated.printJobId];
      if (live) {
        assertJournalIdentityMatches(live, identity);
        journal.jobs[validated.printJobId] = {
          ...live,
          state: writeStarted ? 'OUTCOME_UNKNOWN' : 'FAILED_BEFORE_WRITE',
          lastError: String(err?.code || err?.message || 'PRINT_TRANSPORT_FAILED'),
          updatedAt: new Date().toISOString(),
        };
        await writeJournalAtomic(journal, journalPath);
      }

      if (writeStarted) {
        const unknown = new Error('PRINT_TRANSPORT_OUTCOME_UNKNOWN');
        unknown.code = 'PRINT_TRANSPORT_OUTCOME_UNKNOWN';
        unknown.cause = err;
        throw unknown;
      }
      throw err;
    }
  });
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const allowedOrigin = !origin || ALLOWED_ORIGINS.has(origin)
    ? (origin || 'http://127.0.0.1:3000')
    : 'http://127.0.0.1:3000';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytesRead = 0;

    req.on('data', (chunk) => {
      bytesRead += chunk.length;
      if (bytesRead > MAX_PAYLOAD_BYTES) {
        req.destroy();
        reject(Object.assign(new Error('PAYLOAD_TOO_LARGE'), { code: 'PAYLOAD_TOO_LARGE' }));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (_) {
        reject(Object.assign(new Error('INVALID_JSON'), { code: 'INVALID_JSON' }));
      }
    });
    req.on('error', reject);
  });
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  const pathname = parsedUrl.pathname;
  const printerConfig = resolveNetworkPrinterConfig();
  const dispatchVerifier = verificationKeyInfo();

  if (req.method === 'GET' && (pathname === '/health' || pathname === '/')) {
    writeJson(res, 200, {
      status: printerConfig.configured && dispatchVerifier.ready ? 'TRANSPORT_CONFIGURED' : 'SERVICE_REACHABLE',
      service: 'Zamorin Local ESC/POS Printer Bridge',
      version: '3.0.0-rec04e',
      binding: `${HOST}:${PORT}`,
      uptimeSeconds: Math.floor(process.uptime()),
      hardwareReady: printerConfig.configured && dispatchVerifier.ready,
      transportMode: printerConfig.configured && dispatchVerifier.ready ? 'LOCAL_RAW_ESC_POS' : 'UNBOUND',
      evidenceLevel: 'NONE',
      configuredPrinterId: printerConfig.endpointBaseConfigured ? printerConfig.printerId : null,
      printerEndpointFingerprint: printerConfig.endpointFingerprint,
      printerEndpointPinned: printerConfig.endpointPinned === true,
      printerIdentityVerified: false,
      physicalCompletionVerified: false,
      dispatchAuthorizationReady: dispatchVerifier.ready,
      dispatchAuthorizationKeyId: dispatchVerifier.keyId,
      reason: printerConfig.reason || dispatchVerifier.reason,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/print') {
    if (!printerConfig.configured || !dispatchVerifier.ready) {
      writeJson(res, 503, {
        success: false,
        error: printerConfig.reason || dispatchVerifier.reason || 'HARDWARE_TRANSPORT_NOT_CONFIGURED',
        bytesDispatched: 0,
        dispatched: false,
        transportAccepted: false,
        contentBindingVerified: false,
        printerIdentityVerified: false,
        physicalCompletionVerified: false,
        evidenceLevel: 'NONE',
      });
      return;
    }

    try {
      const payload = await parseJsonBody(req);
      const validated = validatePrintRequest(payload);
      const authorization = payload.printDispatchAuthorization;
      const dispatchAuthorization = verifyPrintDispatchAuthorization(
        authorization,
        {
          organisationId: authorization?.organisationId,
          cafeId: authorization?.cafeId,
          deviceId: authorization?.deviceId,
          printJobId: validated.printJobId,
          payloadSha256: validated.expectedPayloadSha256,
          payloadBytes: validated.expectedPayloadBytes,
          printerTarget: validated.printerTarget,
          drawerKickRequested: validated.drawerKickRequested,
        }
      );
      const result = await processJournaledPrint(payload, printerConfig);
      writeJson(res, 200, {
        ...result,
        serverDispatchAuthorized: true,
        dispatchAuthorizationKeyId: dispatchAuthorization.keyId,
      });
    } catch (err) {
      const statusCode =
        err.code === 'PAYLOAD_TOO_LARGE' ? 413 :
          err.code === 'PRINT_JOB_PAYLOAD_CONFLICT' ? 409 :
            err.code === 'PRINT_TRANSPORT_OUTCOME_UNKNOWN' ? 409 :
              ['PRINT_BUFFER_INVALID', 'PRINT_CONTENT_BINDING_REQUIRED', 'PRINT_PAYLOAD_LENGTH_MISMATCH', 'PRINT_PAYLOAD_HASH_MISMATCH', 'UNSUPPORTED_PRINTER_TARGET', 'PRINT_DISPATCH_AUTHORIZATION_REQUIRED', 'PRINT_DISPATCH_AUTHORIZATION_INVALID', 'PRINT_DISPATCH_AUTHORIZATION_BINDING_MISMATCH', 'PRINT_DISPATCH_AUTHORIZATION_KEY_MISMATCH', 'PRINT_DISPATCH_AUTHORIZATION_SIGNATURE_INVALID', 'PRINT_DISPATCH_AUTHORIZATION_EXPIRED'].includes(err.code)
                ? 400
                : 503;
      writeJson(res, statusCode, {
        success: false,
        error: err.code || err.message || 'PRINT_REQUEST_FAILED',
        dispatched: false,
        acknowledged: false,
        transportAccepted: false,
        contentBindingVerified: false,
        printerIdentityVerified: false,
        physicalCompletionVerified: false,
        evidenceLevel: 'NONE',
      });
    }
    return;
  }

  // Standalone drawer actuation stays disabled. The original cash sale may
  // include a drawer pulse inside the already-hashed canonical receipt buffer;
  // retries/reprints must never invent a separate pulse.
  if (req.method === 'POST' && pathname === '/drawer/kick') {
    writeJson(res, 503, {
      success: false,
      error: 'DRAWER_TRANSPORT_NOT_CONFIGURED',
      action: 'DRAWER_KICK_NOT_DISPATCHED',
      emitted: false,
      acknowledged: false,
      drawerState: 'UNKNOWN',
      evidenceLevel: 'NONE',
    });
    return;
  }

  writeJson(res, 404, {
    error: 'ENDPOINT_NOT_FOUND',
    allowed: ['/health', '/print', '/drawer/kick'],
  });
});

if (process.argv[1] && process.argv[1].endsWith('zamorin_local_printer_bridge.mjs')) {
  server.listen(PORT, HOST, () => {
    const config = resolveNetworkPrinterConfig();
    console.log(`[Zamorin Hardware Bridge] Service listening on http://${HOST}:${PORT}`);
    console.log(
      config.configured
        ? `[Zamorin Hardware Bridge] NETWORK_TCP configured for printer ${config.printerId}.`
        : '[Zamorin Hardware Bridge] Hardware transport is NOT configured; print/drawer requests fail closed.'
    );
  });
}

export {
  server,
  PORT,
  HOST,
  printerEndpointFingerprint,
  resolveNetworkPrinterConfig,
  resolveJournalPath,
  readJournal,
  writeJournalAtomic,
  validatePrintRequest,
  dispatchNetworkPrint,
  processJournaledPrint,
  activePrintJobLockCount,
  verificationKeyInfo,
  verifyPrintDispatchAuthorization,
};
