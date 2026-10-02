#!/usr/bin/env node
// =============================================================================
// ZAMORIN CAFE ERP — AUTOMATED RESPONSIVE SUITE ACROSS ALL ROLES & VIEWPORTS
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
const HTTP_PORT = 3522;
const CDP_PORT = 9284;

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
  console.log("ZAMORIN CAFE ERP — FULL SCREEN × ROLE × VIEWPORT RESPONSIVE AUDIT");
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

  const VIEWPORTS = [
    { name: 'Mobile 320px', width: 320, height: 568, isMobile: true },
    { name: 'Mobile 360px', width: 360, height: 640, isMobile: true },
    { name: 'Mobile 375px', width: 375, height: 667, isMobile: true },
    { name: 'Mobile 390px', width: 390, height: 844, isMobile: true },
    { name: 'Mobile 412px', width: 412, height: 915, isMobile: true },
    { name: 'Mobile 425px', width: 425, height: 800, isMobile: true },
    { name: 'Mobile 480px', width: 480, height: 854, isMobile: true },
    { name: 'Mobile Landscape 568px', width: 568, height: 320, isMobile: true },
    { name: 'Tablet 600px', width: 600, height: 960, isTablet: true },
    { name: 'Tablet 768px (Portrait)', width: 768, height: 1024, isTablet: true },
    { name: 'Tablet 800px', width: 800, height: 1280, isTablet: true },
    { name: 'Tablet 820px', width: 820, height: 1180, isTablet: true },
    { name: 'Tablet 834px', width: 834, height: 1194, isTablet: true },
    { name: 'Tablet 1024px (Landscape)', width: 1024, height: 768, isTablet: true },
    { name: 'Desktop 1280px', width: 1280, height: 800, isDesktop: true },
    { name: 'Desktop 1366px', width: 1366, height: 768, isDesktop: true },
    { name: 'Desktop 1440px', width: 1440, height: 900, isDesktop: true },
    { name: 'Desktop 1920px', width: 1920, height: 1080, isDesktop: true },
  ];

  const ROLES_TO_TEST = [
    { role: 'master', isPrimary: true, name: 'PRIMARY MASTER' },
    { role: 'master', isPrimary: false, name: 'NORMAL MASTER' },
    { role: 'owner', isPrimary: false, name: 'OWNER' },
    { role: 'cafe_admin', isPrimary: false, name: 'CAFE OPERATIONS' },
    { role: 'staff', isPrimary: false, name: 'STAFF' },
  ];

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const failureLog = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n--- TESTING VIEWPORT: ${vp.name} (${vp.width}x${vp.height}) ---`);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: Boolean(vp.isMobile || vp.isTablet),
    });

    for (const persona of ROLES_TO_TEST) {
      // Set persona in window
      await cdp.eval(`
        (() => {
          window.localStorage.setItem('zamorin-theme', 'paper');
          window.localStorage.setItem('zamorin-font-size', 'standard');
          const user = {
            id: '${persona.role.toUpperCase()}_01',
            name: '${persona.name}',
            role: '${persona.role}',
            isPrimaryMaster: ${persona.isPrimary},
            organisationId: 'ZAMORIN',
            primaryCafeId: 'ZC-0001',
            assignedCafeIds: ['ZC-0001']
          };
          window.ZAMORIN_STATE = {
            role: '${persona.role}',
            user,
            auth: { isAuthenticated: true, user }
          };
        })();
      `);

      // Determine available routes for this role
      const routes = await cdp.eval(`
        (function() {
          const isPrimary = ${persona.isPrimary};
          const role = '${persona.role}';
          const navObj = window.zamorinNavModule ? window.zamorinNavModule.NAVIGATION : null;
          // Return representative list of routes
          if (role === 'master') {
            return isPrimary
              ? ['dashboard', 'pos', 'approvals', 'attendance', 'inventory', 'procurement', 'employees', 'payroll', 'bills', 'expenses', 'finance', 'passbook', 'ledger', 'menu', 'vendors', 'revenue-share', 'reports', 'admin', 'cafe-ops-devices', 'settings', 'notifications']
              : ['dashboard', 'pos', 'approvals', 'attendance', 'inventory', 'procurement', 'employees', 'bills', 'expenses', 'finance', 'menu', 'vendors', 'reports', 'admin', 'cafe-ops-devices', 'settings', 'notifications'];
          } else if (role === 'owner') {
            return ['dashboard', 'approvals', 'bills', 'performance', 'employees', 'finance', 'passbook', 'ledger', 'payroll', 'menu', 'reports', 'settings', 'notifications'];
          } else if (role === 'cafe_admin') {
            return ['dashboard', 'pos', 'attendance', 'cash-book', 'dept-orders', 'inventory', 'procurement', 'assets', 'quality', 'customers', 'menu', 'vendors', 'reports', 'cafe-ops-devices', 'settings', 'notifications'];
          } else {
            return ['staff-home', 'staff-attendance', 'staff-leave', 'staff-payslips', 'staff-loans', 'staff-settings', 'notifications'];
          }
        })()
      `);

      for (const route of routes) {
        totalTests++;
        const checkResult = await cdp.eval(`
          (async function() {
            if (window.zamorinNavigate) {
              window.zamorinNavigate('${route}');
            } else {
              window.location.hash = '#${route}';
            }
            await new Promise(r => setTimeout(r, 60));

            const docScrollW = document.documentElement.scrollWidth;
            const docClientW = document.documentElement.clientWidth;
            const bodyScrollW = document.body.scrollWidth;
            const bodyClientW = document.body.clientWidth;

            const pageContent = document.getElementById('page-content');
            const pageScrollW = pageContent ? pageContent.scrollWidth : 0;
            const pageClientW = pageContent ? pageContent.clientWidth : 0;

            // In Windows Chrome, a vertical scrollbar (16px) expands docScrollW without true horizontal overflow
            const hasDocOverflow = docScrollW > Math.max(docClientW, window.innerWidth) + 18;
            const hasBodyOverflow = bodyScrollW > bodyClientW + 2;

            // Check if navigation toggle exists for mobile/tablet
            const isNarrow = window.innerWidth <= 1024;
            const toggleBtn = document.getElementById('sidebar-toggle-btn');
            const toggleVisible = toggleBtn ? (window.getComputedStyle(toggleBtn).display !== 'none') : false;

            return {
              hasDocOverflow,
              hasBodyOverflow,
              docScrollW,
              docClientW,
              bodyScrollW,
              bodyClientW,
              toggleVisible,
              isNarrow
            };
          })()
        `);

        const passed = !checkResult.hasDocOverflow && !checkResult.hasBodyOverflow;
        if (passed) {
          passedTests++;
        } else {
          failedTests++;
          failureLog.push({
            viewport: vp.name,
            role: persona.name,
            route,
            details: checkResult
          });
        }
      }
    }
    console.log(`  [STATUS] ${vp.name}: Passed so far: ${passedTests} / ${totalTests}`);
  }

  // Section 3: Test Interactive Drawer on Mobile
  console.log("\n--- TESTING MOBILE DRAWER INTERACTIONS (375px) ---");
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 667,
    deviceScaleFactor: 1,
    mobile: true,
  });

  const drawerTest = await cdp.eval(`
    (async function() {
      const toggleBtn = document.getElementById('sidebar-toggle-btn');
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');

      if (!toggleBtn || !sidebar) return { success: false, reason: 'Elements missing' };

      // Click to open
      toggleBtn.click();
      await new Promise(r => setTimeout(r, 100));
      const isOpenAfterClick = sidebar.classList.contains('open');

      // Click overlay to close
      if (overlay) {
        overlay.click();
        await new Promise(r => setTimeout(r, 100));
      }
      const isClosedAfterOverlay = !sidebar.classList.contains('open');

      return {
        success: isOpenAfterClick && isClosedAfterOverlay,
        isOpenAfterClick,
        isClosedAfterOverlay
      };
    })()
  `);

  console.log(`  Mobile Drawer Open/Close Test: ${drawerTest.success ? 'PASS' : 'FAIL'} (Opened: ${drawerTest.isOpenAfterClick}, Closed: ${drawerTest.isClosedAfterOverlay})`);

  console.log("\n=============================================================================");
  console.log(`RESPONSIVE AUDIT SUMMARY: TOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log(`Console Errors: ${cdp.consoleErrors.length} | Runtime Exceptions: ${cdp.runtimeExceptions.length}`);
  console.log("=============================================================================\n");

  if (failureLog.length > 0) {
    console.log("Failures Detected:");
    console.log(JSON.stringify(failureLog.slice(0, 10), null, 2));
  }

  chromeProc.kill();
  server.close();

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
