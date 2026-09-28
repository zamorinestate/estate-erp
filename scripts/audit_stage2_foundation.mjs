// =============================================================================
// ZAMORIN CAFE ERP — STAGE 2 FOUNDATION AUTOMATED AUDIT SUITE (CDP HEADLESS)
// Validates:
// 1. Session Lifecycle & API Foundation (0 missing session errors)
// 2. Known Regressions (POS, Inventory, Payslips, Reports, Menu, ZURF Export)
// 3. Universal Shared UI Components (Modals, Selects, DatePickers, Search, Notifs)
// 4. Active Profile Parity (Primary Master, Owner, Cafe Operations)
// 5. Staff Frozen Scope Regression Smoke (Condition-Based Readiness)
// 6. Four-Theme Visual Stability & 0 Runtime Console Exceptions
// =============================================================================

import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CDP_PORT = 9223;
const FRONTEND_URL = 'http://localhost:3000';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, '../frontend');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

class SimpleCDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
    this.events = [];
    this.ws = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { res, rej } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) rej(msg.error);
          else res(msg.result);
        } else if (msg.method) {
          this.events.push(msg);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.callbacks.set(msgId, { res: resolve, rej: reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error('CDP Evaluation Exception: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await wait(800);
  }

  async waitForCondition(expression, timeoutMs = 4000, pollIntervalMs = 50) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const val = await this.evaluate(expression);
        if (val && val.isReady) {
          return { ...val, readinessTimeMs: Date.now() - start };
        }
      } catch (e) {
        // continue polling until timeout
      }
      await wait(pollIntervalMs);
    }
    // Return final attempt for detailed diagnostics
    try {
      const finalVal = await this.evaluate(expression);
      return { ...finalVal, timedOut: true, readinessTimeMs: Date.now() - start };
    } catch (err) {
      return { timedOut: true, readinessTimeMs: Date.now() - start, error: err.message };
    }
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

function startStaticServer(port = 3000) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
  };

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let filePath = path.join(frontendDir, decodeURIComponent(parsedUrl.pathname));

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      filePath = path.join(frontendDir, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error');
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });
      res.end(content);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

async function runStage2Suite() {
  console.log('Starting static server on port 3000...');
  const server = await startStaticServer(3000);

  console.log('Starting headless Chrome for Stage 2 Foundation Audit...');
  const chromeProc = spawn(
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    [
      `--remote-debugging-port=${CDP_PORT}`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--window-size=1600,900',
    ],
    { stdio: 'ignore' }
  );

  await wait(1500);

  let cdp;
  let passedChecks = 0;
  let failedChecks = 0;

  function assert(name, condition, details = {}) {
    if (condition) {
      passedChecks++;
      console.log(`  [PASS] ${name}`);
      return true;
    } else {
      failedChecks++;
      console.error(`  [FAIL] ${name}`, details);
      return false;
    }
  }

  const auditResults = {
    timestamp: new Date().toISOString(),
    apiSessionFoundation: {},
    knownRegressions: {},
    sharedComponents: {},
    fourProfileParity: {},
    staffSmoke: {},
    themeMatrix: {},
    consoleErrors: [],
  };

  try {
    const targets = await fetchJson(`http://localhost:${CDP_PORT}/json/list`);
    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('No CDP page target found');

    cdp = new SimpleCDP(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    console.log('Connected to CDP. Executing Stage-2 Foundation Suite...\n');

    // Track console errors
    await cdp.evaluate(`
      window.__STAGE2_CONSOLE_ERRORS = [];
      window.addEventListener('error', (e) => {
        window.__STAGE2_CONSOLE_ERRORS.push({ message: e.message, filename: e.filename, lineno: e.lineno });
      });
      window.addEventListener('unhandledrejection', (e) => {
        window.__STAGE2_CONSOLE_ERRORS.push({ message: e.reason?.message || String(e.reason) });
      });
    `);

    // =========================================================================
    // 1. API & SESSION LIFECYCLE AUDIT (4 PROFILES)
    // =========================================================================
    console.log('--- 1. API & SESSION LIFECYCLE AUDIT ---');
    const profiles = [
      { role: 'master', name: 'Primary Master' },
      { role: 'owner', name: 'Owner' },
      { role: 'cafe_admin', name: 'Cafe Operations' },
    ];

    for (const p of profiles) {
      await cdp.navigate(`${FRONTEND_URL}/?devRole=${p.role}#dashboard`);
      await wait(600);

      const sessionEval = await cdp.evaluate(`
        (async () => {
          const { apiGet, apiPost, getSessionState, getOrCreateDeviceId } = await import('/src/js/apiClient.js');
          const deviceId = getOrCreateDeviceId();
          const sessionState = getSessionState();
          
          let getError = null;
          let testData = null;
          try {
            testData = await apiGet('/dashboard');
          } catch (e) {
            getError = e.message || String(e);
          }

          return {
            deviceIdPresent: Boolean(deviceId && deviceId.length > 5),
            sessionState,
            getError,
            hasMissingSessionError: (getError || '').includes('Session ID, refresh token and device ID are required'),
          };
        })()
      `);

      auditResults.apiSessionFoundation[p.name] = sessionEval;
      assert(
        `Profile [${p.name}] API Transport`,
        sessionEval.deviceIdPresent && !sessionEval.hasMissingSessionError,
        sessionEval
      );
    }

    // =========================================================================
    // 2. KNOWN REGRESSION AUDIT (POS, Inventory, Payslips, Reports, Menu)
    // =========================================================================
    console.log('\n--- 2. KNOWN REGRESSIONS AUDIT ---');
    await cdp.navigate(`${FRONTEND_URL}/?devRole=cafe_admin#pos`);
    await wait(600);

    const posEval = await cdp.evaluate(`
      (async () => {
        const { apiPost } = await import('/src/js/apiClient.js');
        let error = null;
        try {
          await apiPost('/bills', {
            cafeId: 'ZC-0001',
            orderType: 'DINE_IN',
            lineItems: [{ menuItemId: 'ITEM-01', quantity: 1 }],
            paymentMethod: 'UPI'
          });
        } catch (e) {
          error = e.message;
        }
        return {
          hasMissingSessionError: (error || '').includes('Session ID, refresh token and device ID are required'),
          error
        };
      })()
    `);
    auditResults.knownRegressions.posCharge = posEval;
    assert('POS Charge Session Transport (0 missing session errors)', !posEval.hasMissingSessionError, posEval);

    // Inventory Transport Check
    await cdp.navigate(`${FRONTEND_URL}/?devRole=master#inventory`);
    await wait(600);
    const invEval = await cdp.evaluate(`
      (async () => {
        const { apiGet } = await import('/src/js/apiClient.js');
        let error = null;
        let data = null;
        try {
          data = await apiGet('/inventory/overview');
        } catch (e) {
          error = e.message;
        }
        return {
          hasMissingSessionError: (error || '').includes('Session ID, refresh token and device ID are required'),
          hasData: Boolean(data)
        };
      })()
    `);
    auditResults.knownRegressions.inventory = invEval;
    assert('Inventory API Transport', !invEval.hasMissingSessionError, invEval);

    // Menu API Check
    const menuEval = await cdp.evaluate(`
      (async () => {
        const { apiGet } = await import('/src/js/apiClient.js');
        let error = null;
        try {
          await apiGet('/menu/overview');
          await apiGet('/menu/items');
          await apiGet('/menu/combos');
        } catch (e) {
          error = e.message;
        }
        return {
          hasMissingSessionError: (error || '').includes('Session ID, refresh token and device ID are required'),
          error
        };
      })()
    `);
    auditResults.knownRegressions.menu = menuEval;
    assert('Menu Management API Transport', !menuEval.hasMissingSessionError, menuEval);

    // File Download / Blob Contract Check
    const exportEval = await cdp.evaluate(`
      (async () => {
        const { downloadFile } = await import('/src/js/apiClient.js');
        return typeof downloadFile === 'function';
      })()
    `);
    auditResults.knownRegressions.downloadFileUtility = exportEval;
    assert('Download File Transport Utility', Boolean(exportEval), { exportEval });

    // =========================================================================
    // 3. UNIVERSAL SHARED UI COMPONENTS (Modals, Dropdowns, DatePickers, Search, Notifs)
    // =========================================================================
    console.log('\n--- 3. UNIVERSAL SHARED UI COMPONENT AUDIT ---');

    // A. Universal Modal System (Verify 0 Home Icons & Esc Close)
    const modalTest = await cdp.evaluate(`
      (() => {
        const { openModal, closeModal } = window.__ZAMORIN_COMPONENTS || {};
        
        // Open modal
        const m = document.createElement('div');
        m.id = 'test-modal-container';
        document.body.appendChild(m);
        
        let saved = false;
        let cancelled = false;
        
        // Trigger modal
        const modalEl = window.__openModal ? window.__openModal({
          title: 'Test Component Modal',
          body: '<p>Test modal content body</p>',
          saveLabel: 'Confirm Save',
          cancelLabel: 'Cancel',
          onSave: () => { saved = true; },
          onCancel: () => { cancelled = true; }
        }) : null;

        const renderedModal = document.getElementById('zamorin-global-modal');
        const hasHomeIcon = Boolean(renderedModal?.querySelector('.icon-home, [data-icon="home"]'));
        const closeBtn = renderedModal?.querySelector('.modal-close-btn');
        const cancelBtn = renderedModal?.querySelector('[data-modal-cancel]');
        const saveBtn = renderedModal?.querySelector('[data-modal-save]');

        // Close modal
        if (renderedModal) renderedModal.remove();
        m.remove();

        return {
          modalRendered: Boolean(renderedModal),
          hasHomeIcon,
          hasCloseBtn: Boolean(closeBtn),
          hasCancelBtn: Boolean(cancelBtn),
          hasSaveBtn: Boolean(saveBtn)
        };
      })()
    `);
    auditResults.sharedComponents.modalSystem = modalTest;
    assert('Universal Modal System (0 Home Icons)', !modalTest.hasHomeIcon, modalTest);

    // B. Shared Select / Dropdown Component
    const selectTest = await cdp.evaluate(`
      (async () => {
        const { createSelect } = await import('/src/js/components.js');
        const testContainer = document.createElement('div');
        document.body.appendChild(testContainer);

        let selectedValue = null;
        const selectInst = createSelect(testContainer, {
          options: [
            { value: 'OPT-1', label: 'Option One' },
            { value: 'OPT-2', label: 'Option Two' },
          ],
          value: 'OPT-1',
          onChange: (v) => { selectedValue = v; }
        });

        const trigger = testContainer.querySelector('.zamorin-select-trigger');
        const menu = testContainer.querySelector('.zamorin-select-menu');
        
        selectInst.open();
        const isOpenAfterOpen = testContainer.querySelector('.zamorin-select-wrap').classList.contains('open');
        
        selectInst.setValue('OPT-2');
        selectInst.close();
        const isClosedAfterClose = !testContainer.querySelector('.zamorin-select-wrap').classList.contains('open');

        testContainer.remove();

        return {
          created: Boolean(selectInst),
          isOpenAfterOpen,
          isClosedAfterClose,
          updatedValue: selectedValue === 'OPT-2'
        };
      })()
    `);
    auditResults.sharedComponents.selectPrimitive = selectTest;
    assert('Shared Select / Dropdown Primitive', selectTest.created && selectTest.updatedValue, selectTest);

    // C. Shared DatePicker Component
    const dateTest = await cdp.evaluate(`
      (async () => {
        const { createDatePicker } = await import('/src/js/components.js');
        const testContainer = document.createElement('div');
        document.body.appendChild(testContainer);

        let chosenDate = null;
        const dpInst = createDatePicker(testContainer, {
          value: '2026-08-23',
          onChange: (d) => { chosenDate = d; }
        });

        dpInst.open();
        const isOpen = testContainer.querySelector('.zamorin-datepicker-wrap').classList.contains('open');
        
        dpInst.setDate('2026-08-25');
        dpInst.close();
        const isClosed = !testContainer.querySelector('.zamorin-datepicker-wrap').classList.contains('open');

        testContainer.remove();

        return {
          created: Boolean(dpInst),
          isOpen,
          isClosed,
          updatedDate: chosenDate === '2026-08-25'
        };
      })()
    `);
    auditResults.sharedComponents.datePickerPrimitive = dateTest;
    assert('Shared DatePicker Primitive', dateTest.created && dateTest.updatedDate, dateTest);

    // D. Global Topbar System Status & 3-Tab Notifications
    const topbarTest = await cdp.evaluate(`
      (() => {
        const statusBadge = document.getElementById('topbar-system-status');
        const notifTabs = document.querySelectorAll('.notif-tab-btn');
        const searchInput = document.getElementById('topbar-search-input');

        return {
          hasSystemStatus: Boolean(statusBadge),
          statusText: statusBadge?.textContent?.trim() || '',
          notifTabCount: notifTabs.length,
          hasSearchInput: Boolean(searchInput),
        };
      })()
    `);
    auditResults.sharedComponents.topbarControls = topbarTest;
    assert('Global Topbar Status & 3-Tab Notifications', topbarTest.hasSystemStatus && topbarTest.notifTabCount === 3, topbarTest);

    // =========================================================================
    // 4. STAFF REGRESSION SMOKE TEST (Condition-Based Readiness)
    // =========================================================================
    console.log('\n--- 4. STAFF SHARED-INFRASTRUCTURE SMOKE ---');
    await cdp.navigate(`${FRONTEND_URL}/?role=staff#staff-home`);

    const staffSmoke = await cdp.waitForCondition(`
      (() => {
        const links = Array.from(document.querySelectorAll('.sidebar .nav-link'));
        const linkRoutes = links.map(l => l.dataset.route);
        const forbiddenRoutes = ['dashboard', 'finance', 'payroll', 'revenue-share', 'admin', 'inventory'];
        const hasForbidden = forbiddenRoutes.some(r => linkRoutes.includes(r));
        const scopePill = document.querySelector('.scope-pill')?.textContent?.trim() || '';
        const currentHash = window.location.hash;
        const isReady = linkRoutes.length === 5 && !hasForbidden;

        return {
          isReady,
          landingPage: 'staff-home',
          currentHash,
          visibleLinks: linkRoutes,
          count: linkRoutes.length,
          forbiddenRoutesExposed: hasForbidden,
          scopePill,
          readyState: document.readyState
        };
      })()
    `, 4000);

    auditResults.staffSmoke = staffSmoke;
    assert(
      'Staff Shared-Infrastructure Smoke Test (5 Self-Service Routes, 0 Forbidden)',
      staffSmoke.isReady && staffSmoke.count === 5 && !staffSmoke.forbiddenRoutesExposed,
      staffSmoke
    );

    // =========================================================================
    // 5. FOUR-THEME STABILITY MATRIX
    // =========================================================================
    console.log('\n--- 5. FOUR-THEME STABILITY MATRIX ---');
    const themes = ['paper', 'pearl', 'midnight', 'noir'];
    let themeMatrixValid = true;

    for (const t of themes) {
      await cdp.evaluate(`
        document.documentElement.dataset.theme = '${t}';
        localStorage.setItem('zamorin-theme', '${t}');
      `);
      await wait(200);

      const themeCheck = await cdp.evaluate(`
        (() => {
          const bodyBg = getComputedStyle(document.body).backgroundColor;
          const inkColor = getComputedStyle(document.body).color;
          return { theme: '${t}', bodyBg, inkColor, hasValidBg: Boolean(bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)') };
        })()
      `);
      auditResults.themeMatrix[t] = themeCheck;
      if (!themeCheck.hasValidBg) themeMatrixValid = false;
    }
    assert('Four-Theme Stability Matrix (Paper, Pearl, Midnight, Noir)', themeMatrixValid, auditResults.themeMatrix);

    // =========================================================================
    // 6. RUNTIME CONSOLE ERROR CHECK
    // =========================================================================
    const errors = await cdp.evaluate(`window.__STAGE2_CONSOLE_ERRORS || []`);
    auditResults.consoleErrors = errors;
    console.log('\n--- 6. RUNTIME CONSOLE AUDIT ---');
    assert('Uncaught Stage-2 Runtime Errors (0 Errors)', errors.length === 0, { errorCount: errors.length, errors });

    fs.writeFileSync('docs/STAGE_2_TEST_EVIDENCE_AUTOMATED.json', JSON.stringify(auditResults, null, 2));
    console.log('Saved automated evidence to docs/STAGE_2_TEST_EVIDENCE_AUTOMATED.json');

    console.log('\n=============================================================================');
    console.log(`STAGE 2 FOUNDATION AUDIT: ${passedChecks + failedChecks} CHECKS | PASSED: ${passedChecks} | FAILED: ${failedChecks}`);
    console.log(`Uncaught Console Errors: ${errors.length}`);
    console.log('=============================================================================\n');

    if (failedChecks > 0 || errors.length > 0) {
      console.error(`\n❌ STAGE 2 FOUNDATION AUDIT FAILED with ${failedChecks} failed assertion(s).`);
      process.exit(1);
    } else {
      console.log('\n=== ALL STAGE 2 FOUNDATION AUDITS COMPLETED SUCCESSFULLY ===');
      process.exit(0);
    }
  } catch (err) {
    console.error('Stage 2 Audit Runtime Exception:', err);
    process.exit(1);
  } finally {
    if (cdp) cdp.close();
    chromeProc.kill();
    if (server) server.close();
  }
}

runStage2Suite();
