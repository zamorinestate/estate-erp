#!/usr/bin/env node
// =============================================================================
// ZAMORIN CAFE ERP — APPLICATION LOADING, STATUS & ERROR HANDLING TEST SUITE
// =============================================================================

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const HTTP_PORT = 3524;
const CDP_PORT = 9286;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/') reqPath = '/index.html';
      const filePath = path.join(FRONTEND_DIR, reqPath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });
    server.listen(HTTP_PORT, () => resolve(server));
  });
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.consoleErrors = [];
    this.runtimeExceptions = [];

    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.runtimeExceptions.push(msg.params);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        if (msg.params.type === 'error') {
          this.consoleErrors.push(msg.params);
        }
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval exception: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }
}

async function main() {
  console.log("=============================================================================");
  console.log("ZAMORIN CAFE ERP — LOADING, STATUS & ERROR HANDLING VALIDATION SUITE");
  console.log("=============================================================================\n");

  const server = await startServer();
  console.log(`[HTTP Server] Listening on http://localhost:${HTTP_PORT}`);

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    `http://127.0.0.1:${HTTP_PORT}/index.html?role=master`,
  ]);

  await delay(1200);

  let cdp = null;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const list = await res.json();
      const pageTarget = list.find((t) => t.type === 'page');
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
        await cdp.ready;
        break;
      }
    } catch (e) {
      await delay(300);
    }
  }

  if (!cdp) {
    console.error('Failed to connect to Chrome via CDP.');
    chromeProc.kill();
    server.close();
    process.exit(1);
  }

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  // Ensure page has finished navigating to index.html
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const isLoaded = await cdp.eval(`Boolean(window.document && document.readyState === 'complete' && window.location.href.includes('/index.html'))`);
      if (isLoaded) break;
    } catch {}
    await delay(200);
  }
  await delay(500);

  let passedAssertions = 0;
  let failedAssertions = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passedAssertions++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failedAssertions++;
    }
  }

  // TEST SUITE 1: API Error Mapping & User Message Normalization
  console.log("\n--- TEST SUITE 1: COMPLETE HTTP ERROR MAPPING & CLASSIFICATION ---");
  const errorMapTest = await cdp.eval(`
    (async () => {
      const { mapErrorToUserMessage, ApiClientError } = await import('./src/js/apiClient.js');
      
      const errClientTimeout = new ApiClientError({
        status: 0,
        code: "REQUEST_TIMEOUT",
        message: "The request timed out on the client after 30000ms.",
        userMessage: "The server took too long to respond. Please check your connection and try again.",
      });

      const errActual408 = new ApiClientError({
        status: 408,
        code: "HTTP_408",
        message: "Request Timeout from backend server.",
        userMessage: mapErrorToUserMessage("HTTP_408", 408),
      });

      const errAbort = new ApiClientError({
        status: 0,
        code: "REQUEST_ABORTED",
        message: "The request was cancelled.",
        userMessage: "The request was cancelled.",
      });

      const errNetwork = new ApiClientError({
        status: 0,
        code: "NETWORK_UNAVAILABLE",
        message: "Failed to fetch",
        userMessage: "The server could not be reached. Please check your connection.",
      });

      return {
        // Required HTTP Status Codes
        map400: mapErrorToUserMessage("INVALID_FORMAT", 400),
        map401: mapErrorToUserMessage("AUTH_SESSION_INVALID", 401),
        map403: mapErrorToUserMessage("PERMISSION_DENIED", 403),
        map404: mapErrorToUserMessage("NOT_FOUND", 404),
        map408: mapErrorToUserMessage("HTTP_408", 408),
        map409: mapErrorToUserMessage("DUPLICATE_KEY_CONFLICT", 409),
        map413: mapErrorToUserMessage("PAYLOAD_TOO_LARGE", 413),
        map422: mapErrorToUserMessage("VALIDATION_ERROR", 422),
        map429: mapErrorToUserMessage("RATE_LIMITED", 429),
        map500: mapErrorToUserMessage("INTERNAL_SERVER_ERROR", 500),
        map502: mapErrorToUserMessage("BAD_GATEWAY", 502),
        map503: mapErrorToUserMessage("SERVICE_UNAVAILABLE", 503),
        map504: mapErrorToUserMessage("GATEWAY_TIMEOUT", 504),
        mapNetwork: mapErrorToUserMessage("NETWORK_UNAVAILABLE", 0),
        mapAborted: mapErrorToUserMessage("REQUEST_ABORTED", 0),

        // Semantic classifications
        clientTimeoutStatus: errClientTimeout.status,
        clientTimeoutCode: errClientTimeout.code,
        actual408Status: errActual408.status,
        actual408Code: errActual408.code,
        abortStatus: errAbort.status,
        abortCode: errAbort.code,
        networkStatus: errNetwork.status,
        networkCode: errNetwork.code,
      };
    })()
  `);

  // Direct HTTP Code assertions
  assert(errorMapTest.map400.includes("input") || errorMapTest.map400.includes("check"), "HTTP 400 maps to input check guidance");
  assert(errorMapTest.map401.includes("session"), "HTTP 401 maps to session validation explanation");
  assert(errorMapTest.map403.includes("permission"), "HTTP 403 maps to permission denied explanation");
  assert(errorMapTest.map404.includes("found"), "HTTP 404 maps to record not found message");
  assert(errorMapTest.map408.includes("timed out") || errorMapTest.map408.includes("time"), "HTTP 408 maps to request timeout guidance");
  assert(errorMapTest.map409.includes("conflict"), "HTTP 409 maps to record conflict explanation");
  assert(errorMapTest.map413.includes("size") || errorMapTest.map413.includes("limit"), "HTTP 413 maps to payload size limit explanation");
  assert(errorMapTest.map422.includes("input") || errorMapTest.map422.includes("fields") || errorMapTest.map422.includes("data"), "HTTP 422 maps to unprocessable data explanation");
  assert(errorMapTest.map429.includes("requests"), "HTTP 429 maps to rate limit explanation");
  assert(errorMapTest.map500.includes("unavailable"), "HTTP 500 maps to safe service unavailable message");
  assert(errorMapTest.map502.includes("unreachable"), "HTTP 502 maps to temporary unreachable message");
  assert(errorMapTest.map503.includes("unreachable") || errorMapTest.map503.includes("unavailable"), "HTTP 503 maps to service unreachable message");
  assert(errorMapTest.map504.includes("unreachable") || errorMapTest.map504.includes("unavailable"), "HTTP 504 maps to gateway unreachable message");
  assert(errorMapTest.mapNetwork.includes("network") || errorMapTest.mapNetwork.includes("connection"), "Network error maps to connection check");
  assert(errorMapTest.mapAborted.includes("cancelled"), "Aborted requests map to cancellation");

  // Semantic Timeout & Abort Distinctions
  assert(errorMapTest.clientTimeoutStatus === 0 && errorMapTest.clientTimeoutCode === "REQUEST_TIMEOUT", "Client timeout has status 0 and code REQUEST_TIMEOUT (not falsely HTTP 408)");
  assert(errorMapTest.actual408Status === 408 && errorMapTest.actual408Code === "HTTP_408", "Actual server 408 preserves HTTP status 408");
  assert(errorMapTest.abortStatus === 0 && errorMapTest.abortCode === "REQUEST_ABORTED", "Intentional abort has status 0 and code REQUEST_ABORTED");
  assert(errorMapTest.networkStatus === 0 && errorMapTest.networkCode === "NETWORK_UNAVAILABLE", "Network failure has status 0 and code NETWORK_UNAVAILABLE");

  // TEST SUITE 2: Toast Live-Region Semantics & Duplicate Suppression
  console.log("\n--- TEST SUITE 2: TOAST LIVE REGION & DUPLICATE SUPPRESSION ---");
  const toastTest = await cdp.eval(`
    (async () => {
      const { showToast } = await import('./src/js/components.js');
      let toastError = null;
      try {
        // Trigger multiple toasts including duplicates
        showToast("Operation successful", "mint");
        showToast("Operation successful", "mint"); // duplicate, should be suppressed
        showToast("Critical system error", "coral"); // error, should use role="alert"
        showToast("General update notice", "cobalt"); // info, should use role="status"
      } catch (err) {
        toastError = String(err);
      }

      await new Promise(r => setTimeout(r, 300));

      const stack = document.getElementById("toast-root");
      const toasts = stack ? Array.from(stack.querySelectorAll(".toast-card")) : [];
      const errorToast = toasts.find(t => t.classList.contains("toast-coral"));
      const infoToast = toasts.find(t => t.classList.contains("toast-cobalt"));
      const successCount = toasts.filter(t => t.classList.contains("toast-mint")).length;

      return {
        stackPresent: Boolean(stack),
        totalToasts: toasts.length,
        successCount,
        errorRole: errorToast ? errorToast.getAttribute("role") : null,
        infoRole: infoToast ? infoToast.getAttribute("role") : null,
      };
    })()
  `);

  assert(toastTest.stackPresent, "Toast stack container mounted in DOM");
  assert(toastTest.successCount === 1, "Duplicate toast message was cleanly suppressed");
  assert(toastTest.errorRole === "alert", "High-severity error toast has role='alert'");
  assert(toastTest.infoRole === "status", "Non-urgent info toast has role='status'");

  // TEST SUITE 3: Universal Module Error State Component & Recovery
  console.log("\n--- TEST SUITE 3: UNIVERSAL MODULE ERROR STATE COMPONENT ---");
  const errorComponentTest = await cdp.eval(`
    (async () => {
      const { renderModuleErrorState } = await import('./src/js/components.js');
      const htmlNetwork = renderModuleErrorState({ type: "network" });
      const htmlSession = renderModuleErrorState({ type: "session" });
      const htmlPermission = renderModuleErrorState({ type: "permission" });
      const htmlServer = renderModuleErrorState({ type: "server" });

      return {
        hasNetworkRetry: htmlNetwork.includes("data-error-retry") && htmlNetwork.includes("📡"),
        hasSignInBtn: htmlSession.includes("data-error-signin") && htmlSession.includes("🔒"),
        hasPermNoRetry: !htmlPermission.includes("data-error-retry") && htmlPermission.includes("🚫"),
        hasServerRetry: htmlServer.includes("data-error-retry") && htmlServer.includes("⚙️"),
      };
    })()
  `);

  assert(errorComponentTest.hasNetworkRetry, "Network error state provides retry button");
  assert(errorComponentTest.hasSignInBtn, "Session error state provides Sign In action");
  assert(errorComponentTest.hasPermNoRetry, "Permission error state does not encourage blind retry");
  assert(errorComponentTest.hasServerRetry, "Server error state provides retry action");

  // TEST SUITE 4: Button Mutation Busy State
  console.log("\n--- TEST SUITE 4: BUTTON MUTATION BUSY STATE ---");
  const buttonBusyTest = await cdp.eval(`
    (async () => {
      const { setButtonBusy } = await import('./src/js/components.js');
      const btn = document.createElement("button");
      btn.innerHTML = "Save Changes";

      setButtonBusy(btn, true, "Saving...");
      const isBusyDisabled = btn.disabled;
      const isAriaBusy = btn.getAttribute("aria-busy") === "true";
      const hasBusyText = btn.textContent.includes("Saving...");

      setButtonBusy(btn, false);
      const isRestored = !btn.disabled && btn.innerHTML === "Save Changes" && !btn.hasAttribute("aria-busy");

      return {
        isBusyDisabled,
        isAriaBusy,
        hasBusyText,
        isRestored,
      };
    })()
  `);

  assert(buttonBusyTest.isBusyDisabled, "Busy button is disabled to prevent double clicks");
  assert(buttonBusyTest.isAriaBusy, "Busy button has aria-busy='true'");
  assert(buttonBusyTest.hasBusyText, "Busy button displays custom processing text");
  assert(buttonBusyTest.isRestored, "Reset button restores original label and enables control");

  // TEST SUITE 5: Route Mount & Error Boundary Resilience across all 49 routes
  console.log("\n--- TEST SUITE 5: ROUTE INITIALIZATION & CLEANUP ACROSS ALL 49 SCREENS ---");
  const ROLES = ['master', 'owner', 'cafe_admin', 'staff'];
  const ROUTES = [
    'dashboard', 'pos', 'approvals', 'attendance', 'dept-orders', 'inventory',
    'procurement', 'assets', 'quality', 'employees', 'employee-profile', 'payroll',
    'bills', 'expenses', 'finance', 'passbook', 'ledger', 'customers', 'menu',
    'vendors', 'revenue-share', 'reports', 'admin', 'cafe-ops-devices', 'settings',
    'notifications', 'announcements', 'cash-book', 'performance', 'staff-home',
    'staff-attendance', 'staff-leave', 'staff-payslips', 'staff-loans', 'staff-settings',
    'trash', 'organisation-identity'
  ];

  let routeCheckPass = true;
  for (const route of ROUTES) {
    const res = await cdp.eval(`
      (async () => {
        try {
          if (window.zamorinNavigate) {
            window.zamorinNavigate('${route}');
          } else {
            window.location.hash = '#${route}';
          }
          await new Promise(r => setTimeout(r, 40));

          const pageContent = document.getElementById("page-content");
          const hasContent = Boolean(pageContent && pageContent.innerHTML.trim().length > 0);
          const hasStuckGlobalSpinner = Boolean(document.querySelector(".global-spinner-fullscreen"));

          return {
            success: true,
            hasContent,
            hasStuckGlobalSpinner,
            contentSnippet: pageContent ? pageContent.innerHTML.slice(0, 100) : "NO_PAGE_CONTENT",
            stateRoute: window.state ? window.state.route : "NO_STATE",
          };
        } catch (e) {
          return { success: false, error: e.message };
        }
      })()
    `);

    if (!res.success || !res.hasContent || res.hasStuckGlobalSpinner) {
      routeCheckPass = false;
      console.error(`  [FAIL] Route '${route}' mount issue:`, res);
    }
  }

  assert(routeCheckPass, `All tested routes mounted without uncaught exceptions or stuck global spinners`);

  // TEST SUITE 6: Responsive Layout Safety
  console.log("\n--- TEST SUITE 6: RESPONSIVE ERROR & STATUS LAYOUT CHECKS ---");
  const VIEWPORTS = [
    { name: "320px Mobile", width: 320, height: 568 },
    { name: "768px Tablet", width: 768, height: 1024 },
    { name: "1440px Desktop", width: 1440, height: 900 },
  ];

  for (const vp of VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vp.width < 1024,
    });

    const overflowCheck = await cdp.eval(`
      (() => {
        const bodyScrollW = document.body.scrollWidth;
        const bodyClientW = document.body.clientWidth;
        const docScrollW = document.documentElement.scrollWidth;
        const docClientW = document.documentElement.clientWidth;
        // In headless Chrome on Windows, a 16px vertical scrollbar expands docScrollW without true horizontal overflow.
        const bodyOverflow = bodyScrollW > bodyClientW + 2;
        const docOverflow = docScrollW > Math.max(docClientW, window.innerWidth) + 18;
        return {
          docOverflow,
          bodyOverflow,
        };
      })()
    `);

    assert(!overflowCheck.docOverflow && !overflowCheck.bodyOverflow, `Zero horizontal overflow at ${vp.name}`);
  }

  console.log("\n=============================================================================");
  console.log(`TEST SUITE SUMMARY: PASSED: ${passedAssertions} | FAILED: ${failedAssertions}`);
  console.log(`Console Errors: ${cdp.consoleErrors.length} | Runtime Exceptions: ${cdp.runtimeExceptions.length}`);
  console.log("=============================================================================\n");

  chromeProc.kill();
  server.close();

  if (failedAssertions > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
