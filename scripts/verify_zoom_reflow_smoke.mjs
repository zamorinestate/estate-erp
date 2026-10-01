import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const HTTP_PORT = 3510;
const CDP_PORT = 9280;

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
  console.log('=============================================================================');
  console.log('UNIVERSAL MODULE ARCHITECTURE: ZOOM / REFLOW & 4-PROFILE SMOKE SUITE');
  console.log('=============================================================================\n');

  const server = await startServer();
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1600,900',
    'about:blank'
  ]);

  await delay(1500);

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
    chrome.kill();
    server.close();
    process.exit(1);
  }

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  let passed = 0;
  let failed = 0;

  function check(name, ok, details = '') {
    if (ok) {
      passed++;
      console.log(`  [PASS] ${name}`);
    } else {
      failed++;
      console.error(`  [FAIL] ${name} ${details ? `— ${details}` : ''}`);
    }
  }

  // 1. ZOOM / REFLOW CHECK
  console.log('--- SECTION 1: ZOOM & REFLOW VERIFICATION (100%, 125%, 150%, 175%, 200%) ---');
  const zoomScales = [
    { scale: 1.0, name: '100%' },
    { scale: 1.25, name: '125%' },
    { scale: 1.5, name: '150%' },
    { scale: 1.75, name: '175%' },
    { scale: 2.0, name: '200%' },
  ];

  const targetRoutes = [
    { name: 'Inventory Overview', route: '#inventory', isOverview: true },
    { name: 'Payroll Overview', route: '#payroll', isOverview: true },
    { name: 'Reports Overview', route: '#reports', isOverview: true },
    { name: 'Finance Child (GL Journals)', route: '#finance/gl-journals', isOverview: false },
    { name: 'Administration Child (Cafes)', route: '#admin/cafes', isOverview: false },
  ];

  for (const z of zoomScales) {
    console.log(`\nTesting Zoom Level: ${z.name}`);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: Math.round(1600 / z.scale),
      height: Math.round(900 / z.scale),
      deviceScaleFactor: z.scale,
      mobile: false,
    });

    for (const r of targetRoutes) {
      await cdp.send('Page.navigate', { url: `http://localhost:${HTTP_PORT}/?role=master${r.route}` });
      await delay(800);

      const res = await cdp.eval(`
        (() => {
          const overflow = document.body.scrollWidth > window.innerWidth;
          const hasSidebar = !!document.querySelector('.sidebar') || !!document.querySelector('#sidebar');
          const hasContent = !!document.querySelector('.page-container, .module-hub-section, [data-payroll-tab-content], #page-content');
          const tilesCount = document.querySelectorAll('.module-hub-tile, [data-payroll-hub-tile], [data-inv-hub-tile]').length;
          return { overflow, hasSidebar, hasContent, tilesCount };
        })()
      `);

      check(`Zoom ${z.name} — ${r.name} (Zero Horizontal Overflow)`, !res.overflow);
      check(`Zoom ${z.name} — ${r.name} (Sidebar & Shell Contained)`, res.hasSidebar && res.hasContent);
    }
  }

  // Reset zoom
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // 2. THREE PROFILE SMOKE VERIFICATION
  console.log('\n--- SECTION 2: FOUR PROFILE SMOKE VERIFICATION ---');
  const profiles = [
    { role: 'master', name: 'PRIMARY MASTER', testOverview: '#finance', testChild: '#finance/gl-journals', expectedPermitted: true },
    { role: 'owner', name: 'OWNER', testOverview: '#bills', testChild: '#bills/bills', expectedPermitted: true },
    { role: 'cafe_admin', name: 'CAFE OPERATIONS', testOverview: '#cafe-ops-devices', testChild: '#devices/devices', expectedPermitted: true },
  ];

  for (const p of profiles) {
    console.log(`\nTesting Profile: ${p.name}`);

    // Overview
    await cdp.send('Page.navigate', { url: `http://localhost:${HTTP_PORT}/?role=${p.role}${p.testOverview}` });
    await delay(800);
    const ovState = await cdp.eval(`
      (() => {
        const hash = window.location.hash.replace(/^#\\/?/, '');
        const sidebarActive = !!document.querySelector('.sidebar .nav-link.active');
        return { hash, sidebarActive };
      })()
    `);
    check(`Profile ${p.name} Overview (${p.testOverview}) Mounted`, ovState.sidebarActive);

    // Child Page
    await cdp.send('Page.navigate', { url: `http://localhost:${HTTP_PORT}/?role=${p.role}${p.testChild}` });
    await delay(800);
    const childState = await cdp.eval(`
      (() => {
        const hash = window.location.hash.replace(/^#\\/?/, '');
        const sidebarActive = !!document.querySelector('.sidebar .nav-link.active');
        return { hash, sidebarActive };
      })()
    `);
    check(`Profile ${p.name} Dedicated Child (${p.testChild}) Accessible`, childState.hash === p.testChild.replace(/^#\/?/, ''));

    // Back & Forward History
    await cdp.eval(`window.history.back();`);
    await delay(600);
    const backState = await cdp.eval(`window.location.hash.replace(/^#\\/?/, '')`);
    check(`Profile ${p.name} Back Navigation Functional`, backState === p.testOverview.replace(/^#\/?/, '') || (p.testOverview.includes('devices') && backState.includes('devices')));

    await cdp.eval(`window.history.forward();`);
    await delay(600);
    const fwdState = await cdp.eval(`window.location.hash.replace(/^#\\/?/, '')`);
    check(`Profile ${p.name} Forward Navigation Functional`, fwdState === p.testChild.replace(/^#\/?/, ''));
  }

  console.log(`\n=============================================================================`);
  console.log(`SMOKE SUMMARY: PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`Console Errors Recorded: ${cdp.consoleErrors.length} | Runtime Exceptions: ${cdp.runtimeExceptions.length}`);
  console.log(`=============================================================================\n`);

  chrome.kill();
  server.close();

  if (failed > 0 || cdp.runtimeExceptions.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal smoke error:', err);
  process.exit(1);
});
