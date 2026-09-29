/**
 * Zamorin Café ERP — Local ESC/POS Hardware Bridge Scaffold
 *
 * REC-04E truthfulness rule:
 * This process proves only that the localhost service is reachable. Until an
 * actual USB/serial/network transport plus device-bound acknowledgement is
 * configured, it must not claim printer readiness, receipt delivery, or cash
 * drawer actuation.
 */

import http from 'http';

const PORT = 9199;
const HOST = '127.0.0.1';
const MAX_PAYLOAD_BYTES = 65536;

const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
]);

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || 'http://127.0.0.1:3000');
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:3000');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
        reject(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (_) {
        reject(new Error('INVALID_JSON'));
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

  if (req.method === 'GET' && (pathname === '/health' || pathname === '/')) {
    writeJson(res, 200, {
      status: 'SERVICE_REACHABLE',
      service: 'Zamorin Local ESC/POS Printer Bridge',
      version: '2.0.0-rec04e',
      binding: `${HOST}:${PORT}`,
      uptimeSeconds: Math.floor(process.uptime()),
      hardwareReady: false,
      evidenceLevel: 'NONE',
      detectedPrinters: [],
      reason: 'HARDWARE_TRANSPORT_NOT_CONFIGURED',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/print') {
    try {
      const payload = await parseJsonBody(req);
      writeJson(res, 503, {
        success: false,
        error: 'HARDWARE_TRANSPORT_NOT_CONFIGURED',
        terminalId: String(payload.terminalId || 'LOCAL-COUNTER'),
        bytesDispatched: 0,
        dispatched: false,
        acknowledged: false,
        contentBindingVerified: false,
        printerIdentityVerified: false,
        evidenceLevel: 'NONE',
        fallback: 'WINDOW_PRINT_AVAILABLE',
      });
    } catch (err) {
      writeJson(res, err.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400, {
        success: false,
        error: err.message || 'PRINT_REQUEST_INVALID',
        dispatched: false,
        acknowledged: false,
      });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/drawer/kick') {
    try {
      const payload = await parseJsonBody(req);
      writeJson(res, 503, {
        success: false,
        error: 'DRAWER_TRANSPORT_NOT_CONFIGURED',
        action: 'DRAWER_KICK_NOT_DISPATCHED',
        terminalId: String(payload.terminalId || 'LOCAL-COUNTER'),
        pin: Number(payload.pin) === 5 ? 5 : 2,
        emitted: false,
        acknowledged: false,
        drawerState: 'UNKNOWN',
        evidenceLevel: 'NONE',
      });
    } catch (err) {
      writeJson(res, err.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400, {
        success: false,
        error: err.message || 'DRAWER_REQUEST_INVALID',
        emitted: false,
        acknowledged: false,
      });
    }
    return;
  }

  writeJson(res, 404, {
    error: 'ENDPOINT_NOT_FOUND',
    allowed: ['/health', '/print', '/drawer/kick'],
  });
});

if (process.argv[1] && process.argv[1].endsWith('zamorin_local_printer_bridge.mjs')) {
  server.listen(PORT, HOST, () => {
    console.log(`[Zamorin Hardware Bridge] Service listening on http://${HOST}:${PORT}`);
    console.log('[Zamorin Hardware Bridge] Hardware transport is NOT configured; print/drawer requests fail closed.');
  });
}

export { server, PORT, HOST };
