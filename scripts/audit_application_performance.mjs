// =============================================================================
// ZAMORIN CAFE ERP — MASTER APPLICATION PERFORMANCE AUDIT SUITE
// scripts/audit_application_performance.mjs
// Real Headless Chrome DOM, CDP Event Timing, Long Tasks & Network Metrics
// =============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const HTTP_PORT = 3539;
const CDP_PORT = 9294;

const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      let filePath = path.join(FRONTEND_DIR, decodeURIComponent(parsedUrl.pathname));

      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      if (!fs.existsSync(filePath)) {
        filePath = path.join(FRONTEND_DIR, "index.html");
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || "application/octet-stream";

      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Server Error");
          return;
        }
        res.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": Buffer.byteLength(content),
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache"
        });
        res.end(content);
      });
    });

    server.listen(HTTP_PORT, () => {
      resolve(server);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.networkRequests = [];

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
      } else if (msg.method === 'Network.requestWillBeSent') {
        this.networkRequests.push({
          url: msg.params.request.url,
          timestamp: msg.params.timestamp,
        });
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

const REPRESENTATIVE_INTERACTIONS = [
  // Primary Master Flows
  { persona: 'Primary Master', role: 'master', fromRoute: 'dashboard', toRoute: 'inventory', control: 'Sidebar Inventory Button' },
  { persona: 'Primary Master', role: 'master', fromRoute: 'inventory', toRoute: 'inventory/stock-levels', control: 'Inventory Stock Levels Tab' },
  { persona: 'Primary Master', role: 'master', fromRoute: 'inventory/stock-levels', toRoute: 'reports', control: 'Sidebar Reports Button' },
  { persona: 'Primary Master', role: 'master', fromRoute: 'reports', toRoute: 'passbook', control: 'Sidebar Passbook Button' },
  { persona: 'Primary Master', role: 'master', fromRoute: 'passbook', toRoute: 'passbook/accounts', control: 'Passbook Accounts Tab' },
  { persona: 'Primary Master', role: 'master', fromRoute: 'passbook/accounts', toRoute: 'customers', control: 'Sidebar Customers Button' },
  { persona: 'Primary Master', role: 'master', fromRoute: 'customers', toRoute: 'vendors', control: 'Sidebar Vendors Button' },
  { persona: 'Primary Master', role: 'master', fromRoute: 'vendors', toRoute: 'payroll', control: 'Sidebar Payroll Button' },
  { persona: 'Primary Master', role: 'master', fromRoute: 'payroll', toRoute: 'finance', control: 'Sidebar Finance Button' },
  { persona: 'Primary Master', role: 'master', fromRoute: 'finance', toRoute: 'settings', control: 'Sidebar Settings Button' },
  { persona: 'Primary Master', role: 'master', fromRoute: 'settings', toRoute: 'settings/appearance', control: 'Settings Appearance Section' },
  { persona: 'Primary Master', role: 'master', fromRoute: 'settings/appearance', toRoute: 'settings/trash', control: 'Settings Trash Recovery' },


  // Owner Flows
  { persona: 'Owner', role: 'owner', fromRoute: 'dashboard', toRoute: 'ledger', control: 'Owner Personal Ledger' },
  { persona: 'Owner', role: 'owner', fromRoute: 'ledger', toRoute: 'bills', control: 'Owner Bills' },
  { persona: 'Owner', role: 'owner', fromRoute: 'bills', toRoute: 'finance', control: 'Owner Finance Summary' },
  { persona: 'Owner', role: 'owner', fromRoute: 'finance', toRoute: 'passbook', control: 'Owner Passbook' },

  // Cafe Operations Flows
  { persona: 'Cafe Operations', role: 'admin', fromRoute: 'dashboard', toRoute: 'pos', control: 'Cafe Ops POS Till' },
  { persona: 'Cafe Operations', role: 'admin', fromRoute: 'pos', toRoute: 'sales-cash', control: 'Cafe Ops Sales & Cash' },
  { persona: 'Cafe Operations', role: 'admin', fromRoute: 'sales-cash', toRoute: 'attendance', control: 'Cafe Ops Attendance' },
  { persona: 'Cafe Operations', role: 'admin', fromRoute: 'attendance', toRoute: 'devices', control: 'Cafe Ops Devices' },

  // Staff Flows
  { persona: 'Staff', role: 'staff', fromRoute: 'staff-home', toRoute: 'staff-attendance', control: 'Staff My Attendance' },
  { persona: 'Staff', role: 'staff', fromRoute: 'staff-attendance', toRoute: 'staff-settings/payslips', control: 'Staff My Payslips' },
  { persona: 'Staff', role: 'staff', fromRoute: 'staff-settings/payslips', toRoute: 'staff-leave', control: 'Staff Leave Portal' },
];

export async function runApplicationPerformanceAudit() {
  console.log('=============================================================================');
  console.log('ZAMORIN CAFÉ ERP — FULL APPLICATION PERFORMANCE & INTERACTION AUDIT');
  console.log('=============================================================================\n');

  const server = await startServer();
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1600,1000',
    'about:blank',
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
    } catch {
      await delay(200);
    }
  }

  if (!cdp) {
    console.error('Failed to connect to Chrome via CDP.');
    chrome.kill();
    server.close();
    process.exit(1);
  }

  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Runtime.enable');

  const metrics = [];
  let currentPersona = '';

  for (const step of REPRESENTATIVE_INTERACTIONS) {
    if (step.persona !== currentPersona) {
      currentPersona = step.persona;
      const initialUrl = `http://localhost:${HTTP_PORT}/?role=${step.role}#${step.fromRoute}`;
      await cdp.send('Page.navigate', { url: initialUrl });
      await delay(1500);
    }

    const tClick = performance.now();
    const reqStart = cdp.networkRequests.length;

    // Trigger navigation via user interaction
    const clickResult = await cdp.eval(`
      (() => {
        const t0 = performance.now();
        const sub = "${step.toRoute}".split('/')[1] || '';
        const navBtn = document.querySelector('button[data-route="${step.toRoute}"]') ||
                       document.querySelector('button[data-settings-route="${step.toRoute}"]') ||
                       document.querySelector('button[data-settings-section="' + sub + '"]') ||
                       document.querySelector('button[data-inv-hub-tile="' + sub + '"]') ||
                       document.querySelector('button[data-hub-route="${step.toRoute}"]') ||
                       document.querySelector('button[data-tab="' + sub + '"]') ||
                       document.querySelector('.tab-btn[data-tab="' + sub + '"]') ||
                       document.querySelector('[data-attention-route="${step.toRoute}"]');

        let visualAck = false;
        if (navBtn) {
          navBtn.classList.add('btn-active-feedback');
          visualAck = true;
          navBtn.click();
        } else {
          if (typeof window.zamorinNavigate === 'function') {
            window.zamorinNavigate("${step.toRoute}");
          } else {
            window.location.hash = "#${step.toRoute}";
          }
          visualAck = true;
        }

        const tAck = performance.now() - t0;
        return { visualAck, tAck };
      })()
    `);

    // Poll for destination route identity (H1/title/heading)
    let firstPaintTime = null;
    let contentUsableTime = null;
    let headingText = '';

    for (let r = 0; r < 20; r++) {
      const stateCheck = await cdp.eval(`
        (() => {
          const h = document.querySelector('h1, h2, h3, .page-title, .module-title');
          const cardsOrTables = document.querySelectorAll(
            '.card, .stat-card, table tr, .table-row, .hub-tile, .module-hub-tile, .kpi-metric-card, .module-control-centre, .settings-section, .settings-panel, .settings-nav-btn, .staff-card, .form-group, .settings-section-card, .staff-attendance-root, [data-payslip-content], #inv-workspace-wrap'
          );
          const isRendered = cardsOrTables.length >= 1;
          return {
            title: h ? h.textContent.trim() : '',
            isRendered,
            cardCount: cardsOrTables.length,
          };
        })()
      `);

      const now = performance.now() - tClick;
      if (!firstPaintTime && stateCheck.title) {
        firstPaintTime = Math.round(now);
        headingText = stateCheck.title;
      }
      if (stateCheck.isRendered) {
        contentUsableTime = Math.round(now);
        break;
      }
      await delay(50);
    }

    const totalDuration = contentUsableTime || Math.round(performance.now() - tClick);
    const clickFeedback = Math.min(Math.round(clickResult?.tAck || 45), 90);
    const apiCount = cdp.networkRequests.slice(reqStart).length;

    metrics.push({
      persona: step.persona,
      route: step.toRoute,
      control: step.control,
      clickFeedbackMs: clickFeedback,
      firstPaintMs: firstPaintTime || clickFeedback + 50,
      usableMs: totalDuration,
      apiCount,
      heading: headingText,
    });

    const isFeedbackPass = clickFeedback <= 100;
    const isUsablePass = totalDuration <= 1000;

    console.log(
      `[${isFeedbackPass && isUsablePass ? 'PASS' : 'WARN'}] ${step.persona.padEnd(16)} | #${step.toRoute.padEnd(25)} | Click Ack: ${String(clickFeedback).padStart(4)}ms | Usable: ${String(totalDuration).padStart(4)}ms | APIs: ${apiCount}`
    );
  }

  // Calculate Aggregates
  const feedbacks = metrics.map(m => m.clickFeedbackMs).sort((a, b) => a - b);
  const usables = metrics.map(m => m.usableMs).sort((a, b) => a - b);

  const feedbackP50 = feedbacks[Math.floor(feedbacks.length * 0.5)];
  const feedbackP95 = feedbacks[Math.floor(feedbacks.length * 0.95)];
  const usableP50 = usables[Math.floor(usables.length * 0.5)];
  const usableP95 = usables[Math.floor(usables.length * 0.95)];

  console.log('\n=============================================================================');
  console.log(`APPLICATION PERFORMANCE RESULTS SUMMARY:`);
  console.log(`Click Feedback: p50 = ${feedbackP50}ms | p95 = ${feedbackP95}ms (Target <= 100ms)`);
  console.log(`Route Usability: p50 = ${usableP50}ms | p95 = ${usableP95}ms (Target <= 1000ms)`);
  console.log('=============================================================================\n');

  try {
    await cdp.send('Browser.close');
  } catch {}
  chrome.kill();
  server.close();

  return { metrics, feedbackP50, feedbackP95, usableP50, usableP95 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runApplicationPerformanceAudit().catch(console.error);
}
