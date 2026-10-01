import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 3560;
const CDP_PORT = 9310;
const DOCS_SCREENSHOTS_DIR = path.resolve('docs/screenshots');

if (!fs.existsSync(DOCS_SCREENSHOTS_DIR)) {
  fs.mkdirSync(DOCS_SCREENSHOTS_DIR, { recursive: true });
}

function startStaticServer() {
  const root = path.resolve('frontend');
  const server = http.createServer((req, res) => {
    let cleanUrl = req.url.split('?')[0].split('#')[0];
    if (cleanUrl === '/' || cleanUrl === '') cleanUrl = '/index.html';
    const filePath = path.join(root, cleanUrl);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.mjs': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };

    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(PORT, () => resolve(server));
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

    this.ws.onmessage = (evt) => {
      const parsed = JSON.parse(evt.data.toString());
      if (parsed.method === 'Runtime.consoleAPICalled') {
        if (parsed.params.type === 'error') {
          this.consoleErrors.push(parsed.params);
        }
      } else if (parsed.method === 'Runtime.exceptionThrown') {
        this.runtimeExceptions.push(parsed.params);
      }

      if (parsed.id && this.callbacks.has(parsed.id)) {
        const { resolve: resCb, reject: rejCb } = this.callbacks.get(parsed.id);
        this.callbacks.delete(parsed.id);
        if (parsed.error) rejCb(parsed.error);
        else resCb(parsed.result);
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
      awaitPromise: true
    });
    return res.result?.value;
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(DOCS_SCREENSHOTS_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`  [SCREENSHOT] Saved ${filename}`);
  }
}

async function main() {
  console.log('=============================================================================');
  console.log('DASHBOARDS VISUAL & HYDRATION RUNTIME AUDIT');
  console.log('=============================================================================\n');

  const server = await startStaticServer();
  console.log(`Test static server running at http://localhost:${PORT}`);

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tmpProfile = path.resolve(`.tmp_chrome_dash_${Date.now()}`);

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    'about:blank'
  ]);

  let passedChecks = 0;
  let failedChecks = 0;

  function assert(name, condition, details = '') {
    if (condition) {
      console.log(`  [PASS] ${name}`);
      passedChecks++;
    } else {
      console.error(`  [FAIL] ${name} ${details ? `(${details})` : ''}`);
      failedChecks++;
    }
  }

  try {
    await delay(1800);
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
      } catch {
        await delay(200);
      }
    }

    if (!cdp) throw new Error("Could not connect to Chrome CDP endpoint");

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    // 1. PRIMARY MASTER DASHBOARD
    console.log('\n--- 1. PRIMARY MASTER DASHBOARD (?role=master#dashboard) ---');
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/?role=master#dashboard` });
    await delay(1200);

    const primaryState = await cdp.eval(`
      (() => {
        const kpiGrid = document.querySelector('#cc-kpi-grid');
        const kpiCards = kpiGrid ? kpiGrid.querySelectorAll('.kpi-card, .card') : [];
        const hasSvgChart = !!document.querySelector('#cc-trend-chart-mount svg');
        const attentionItems = document.querySelectorAll('#cc-attention-queue-mount > div > div').length;
        const cafeCards = document.querySelectorAll('#cc-cafes-grid-mount .card').length;
        const topItems = document.querySelectorAll('#cc-top-menu-mount > div > div').length;
        const pulseSection = !!document.querySelector('#cc-ops-snapshot-mount');
        const hasErrorToast = !!document.querySelector('.toast-danger, .toast-error');
        const firstKpiVal = kpiCards[0]?.querySelector('.kpi-value, [class*="value"], strong')?.textContent?.trim();

        return {
          kpiCount: kpiCards.length,
          firstKpiVal,
          hasSvgChart,
          attentionItems,
          cafeCards,
          topItems,
          pulseSection,
          hasErrorToast
        };
      })()
    `);

    assert('Primary Master Renders 8 KPI Cards', primaryState.kpiCount >= 8, `Found ${primaryState.kpiCount}`);
    assert('Primary Master First KPI Has Valid Value (Not Skeleton)', primaryState.firstKpiVal && !primaryState.firstKpiVal.includes('skeleton'), `Value: ${primaryState.firstKpiVal}`);
    assert('Primary Master Renders SVG Dual-Series Trend Chart', primaryState.hasSvgChart);
    assert('Primary Master Renders Attention Queue Items', primaryState.attentionItems >= 2, `Items: ${primaryState.attentionItems}`);
    assert('Primary Master Renders Multi-Location Breakdown Cards', primaryState.cafeCards >= 3, `Cafes: ${primaryState.cafeCards}`);
    assert('Primary Master Renders Commercial Mix (Top 5 Menu Items)', primaryState.topItems >= 4, `Items: ${primaryState.topItems}`);
    assert('Primary Master Zero Session Error Toasts', !primaryState.hasErrorToast);
    await cdp.captureScreenshot('dashboard_primary_master.png');

    // 2. OWNER DASHBOARD
    console.log('\n--- 2. OWNER DASHBOARD (?role=owner#dashboard) ---');
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/?role=owner#dashboard` });
    await delay(1200);

    const ownerState = await cdp.eval(`
      (() => {
        const errorCard = document.querySelector('.occ-error-card');
        const kpiCards = document.querySelectorAll('.occ-kpi-card').length;
        const whatChanged = document.querySelectorAll('.occ-digest-item, .occ-digest-card, [class*="digest"]').length;
        const cafeCards = document.querySelectorAll('.occ-cafe-card, [class*="cafe-card"]').length;
        const firstKpi = document.querySelector('.occ-kpi-value')?.textContent?.trim();

        return {
          hasErrorCard: !!errorCard,
          kpiCards,
          firstKpi,
          whatChanged,
          cafeCards
        };
      })()
    `);

    assert('Owner Dashboard Zero Error Card / Zero Crash', !ownerState.hasErrorCard);
    assert('Owner Dashboard Renders Executive KPI Cards', ownerState.kpiCards >= 6, `Found ${ownerState.kpiCards}`);
    assert('Owner Dashboard First KPI Has Valid Currency Amount', ownerState.firstKpi && ownerState.firstKpi.startsWith('₹'), `Value: ${ownerState.firstKpi}`);
    await cdp.captureScreenshot('dashboard_owner.png');

    // 4. CAFE OPERATIONS DASHBOARD
    console.log('\n--- 4. CAFE OPERATIONS DASHBOARD (?role=cafe_admin#dashboard) ---');
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/?role=cafe_admin#dashboard` });
    await delay(1200);

    const cafeAdminState = await cdp.eval(`
      (() => {
        const bodyText = document.body.textContent;
        const hasErrorBox = bodyText.includes('Cafe Operations Dashboard could not be loaded');
        const kpiCards = document.querySelectorAll('#admin-kpi-grid .kpi-card, #admin-kpi-grid .card').length;
        const hasSalesChart = !!document.querySelector('#admin-dash-sales-chart-container svg, #admin-dash-sales-chart-container [class*="chart"]');
        const actionBadge = document.querySelector('#admin-dash-action-count-badge')?.textContent?.trim();
        const isDeviceActive = bodyText.includes('ACTIVE & TRUSTED');

        return {
          hasErrorBox,
          kpiCards,
          hasSalesChart,
          actionBadge,
          isDeviceActive
        };
      })()
    `);

    assert('Cafe Operations Zero Error Screen / Zero Crash', !cafeAdminState.hasErrorBox);
    assert('Cafe Operations Renders Today KPI Cards', cafeAdminState.kpiCards >= 3, `Found ${cafeAdminState.kpiCards}`);
    assert('Cafe Operations Renders Sales by Hour Chart', cafeAdminState.hasSalesChart);
    assert('Cafe Operations Action Required Badge Populated (Not Loading)', cafeAdminState.actionBadge && !cafeAdminState.actionBadge.includes('Loading'), `Badge: ${cafeAdminState.actionBadge}`);
    assert('Cafe Operations Terminal Security Status Displays ACTIVE & TRUSTED', cafeAdminState.isDeviceActive);
    await cdp.captureScreenshot('dashboard_cafe_operations.png');

    // 5. STAFF DASHBOARD
    console.log('\n--- 5. STAFF DASHBOARD (?role=staff#staff-home) ---');
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/?role=staff#staff-home` });
    await delay(1200);

    const staffState = await cdp.eval(`
      (() => {
        const greeting = document.querySelector('.avatar + div')?.textContent?.trim();
        const hasShiftCard = !!document.querySelector('#btn-staff-checkin, #btn-staff-checkout, [class*="shift"]');
        const scheduleDays = document.querySelectorAll('.schedule-day-pill').length;
        const announcements = document.querySelectorAll('#roster-section .card').length;

        return {
          greeting,
          hasShiftCard,
          scheduleDays,
          announcements
        };
      })()
    `);

    assert('Staff Dashboard Renders Greeting and Profile Header', staffState.greeting && staffState.greeting.includes('Hi'), `Greeting: ${staffState.greeting}`);
    assert('Staff Dashboard Renders Today Shift Card', staffState.hasShiftCard);
    assert('Staff Dashboard Renders 7-Day Schedule Roster Pills', staffState.scheduleDays >= 7, `Days: ${staffState.scheduleDays}`);
    assert('Staff Dashboard Renders Announcements Section', staffState.announcements >= 2);
    await cdp.captureScreenshot('dashboard_staff.png');

    console.log('\n=============================================================================');
    console.log(`DASHBOARDS AUDIT COMPLETE: ${passedChecks + failedChecks} CHECKS | PASSED: ${passedChecks} | FAILED: ${failedChecks}`);
    console.log(`Console Errors: ${cdp.consoleErrors.length} | Runtime Exceptions: ${cdp.runtimeExceptions.length}`);
    if (cdp.runtimeExceptions.length > 0) {
      console.log('Runtime exceptions details:', JSON.stringify(cdp.runtimeExceptions, null, 2));
    }
    if (cdp.consoleErrors.length > 0) {
      console.log('Console error details:', JSON.stringify(cdp.consoleErrors, null, 2));
    }
    console.log('=============================================================================\n');

  } finally {
    chromeProc.kill();
    server.close();
    try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch {}
  }

  if (failedChecks > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Audit runner error:', err);
  process.exit(1);
});
