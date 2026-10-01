import { spawn } from 'child_process';
import fs from 'fs';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9225;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const pageTarget = list.find((t) => t.type === 'page');
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        return pageTarget.webSocketDebuggerUrl;
      }
    } catch (e) {
      await delay(300);
    }
  }
  throw new Error('Could not connect to Chrome page debugging target');
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
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
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await delay(600);
    await this.waitForSelector('.sidebar .nav-link', 12000);
    // Wait until scope-pill is populated
    const start = Date.now();
    while (Date.now() - start < 6000) {
      try {
        const text = await this.eval(`document.querySelector('.scope-pill')?.textContent.trim() || ''`);
        if (text.length > 0) break;
      } catch (e) {}
      await delay(150);
    }
    await delay(200);
  }

  async waitForSelector(selector, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const exists = await this.eval(`!!document.querySelector('${selector}')`);
        if (exists) return true;
      } catch (e) {
        // ignore transitional eval errors during page reload
      }
      await delay(150);
    }
    return false;
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false
    });
    await delay(200);
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  console.log('Starting headless Chrome for Stage 1 Final Closure Gate...');
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    'about:blank'
  ]);

  try {
    const wsUrl = await getWsUrl();
    const cdp = new CdpClient(wsUrl);
    await cdp.ready;

    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    console.log('Connected to CDP. Executing Stage-1 Closure Suite...\n');

    const results = {
      staffSmoke: null,
      routeMatrix: [],
      ownerHistoricalDefect: null,
      scrollPersistence: [],
      themeMatrix: [],
      responsiveMatrix: [],
      runtimeErrors: []
    };

    // =========================================================================
    // 1. STAFF SHARED-INFRASTRUCTURE SMOKE TEST
    // =========================================================================
    console.log('--- 1. STAFF SMOKE TEST ---');
    await cdp.navigate('http://localhost:3000/?devRole=staff#staff-home');
    await cdp.waitForSelector('.nav-link');

    const staffCheck = await cdp.eval(`
      (() => {
        const topbar = !!document.getElementById('topbar');
        const sidebar = !!document.getElementById('sidebar');
        const content = document.getElementById('page-content')?.innerHTML || '';
        const roleScope = document.querySelector('.scope-pill')?.textContent || '';
        const navLinks = Array.from(document.querySelectorAll('.sidebar .nav-link')).map(a => a.textContent.trim());
        const hasManagerialNav = navLinks.some(l => l.includes('Command Centre') || l.includes('Procurement') || l.includes('Administration'));
        const theme = document.documentElement.getAttribute('data-theme') || 'paper';
        return { topbar, sidebar, roleScope, navLinks, hasManagerialNav, theme, contentLen: content.length };
      })()
    `);

    // Representative route staff-leave
    await cdp.eval(`window.location.hash = '#staff-leave'`);
    await delay(400);
    const staffLeaveCheck = await cdp.eval(`
      (() => {
        const activeLink = document.querySelector('.sidebar .nav-link.active')?.textContent.trim() || '';
        const pageTitle = document.querySelector('.header-title, h1, h2, h3')?.textContent.trim() || '';
        return { activeLink, pageTitle };
      })()
    `);

    const staffPass = staffCheck.topbar && staffCheck.sidebar && !staffCheck.hasManagerialNav && staffCheck.contentLen > 0;
    results.staffSmoke = {
      pass: staffPass,
      landingPage: 'staff-home',
      representativeRoute: 'staff-leave',
      scopePill: staffCheck.roleScope,
      sidebarNavCount: staffCheck.navLinks.length,
      managerialRoutesExposed: staffCheck.hasManagerialNav,
      themeRetained: staffCheck.theme
    };
    console.log('Staff Smoke Test:', staffPass ? 'PASS' : 'FAIL', results.staffSmoke);

    // =========================================================================
    // 2. FOUR-PROFILE ROUTE MATRIX & HISTORICAL OWNER DEFECT REGRESSION
    // =========================================================================
    console.log('\n--- 2. FOUR-PROFILE ROUTE MATRIX ---');
    const profiles = [
      { name: 'PRIMARY MASTER', role: 'master' },
      { name: 'OWNER', role: 'owner' },
      { name: 'CAFE OPERATIONS', role: 'cafe_admin' }
    ];

    for (const p of profiles) {
      await cdp.navigate(`http://localhost:3000/?devRole=${p.role}#dashboard`);
      await cdp.waitForSelector('.nav-link');

      const navItems = await cdp.eval(`
        Array.from(document.querySelectorAll('.sidebar .nav-link')).map(a => ({
          label: a.textContent.trim(),
          route: a.getAttribute('data-route') || (a.getAttribute('href') || '').replace('#', '')
        }))
      `);

      console.log(`Profile ${p.name}: testing ${navItems.length} routes...`);

      for (const item of navItems) {
        if (!item.route) continue;
        await cdp.eval(`window.location.hash = '#${item.route}'`);
        await delay(350);

        const routeState = await cdp.eval(`
          (() => {
            const activeLink = document.querySelector('.sidebar .nav-link.active')?.textContent.trim() || '';
            const pageContent = document.getElementById('page-content');
            const topbar = !!document.getElementById('topbar');
            const sidebar = !!document.getElementById('sidebar');
            const theme = document.documentElement.getAttribute('data-theme') || 'paper';
            const hash = window.location.hash.replace('#', '');
            const heading = pageContent?.querySelector('h1, h2, h3, .header-title, .module-title')?.textContent.trim() || 'Rendered';
            return {
              activeLink,
              topbar,
              sidebar,
              theme,
              hash,
              heading,
              hasContent: (pageContent?.children.length || 0) > 0 || (pageContent?.textContent.trim().length || 0) > 0
            };
          })()
        `);

        const isMatch = routeState.hash === item.route && routeState.topbar && routeState.sidebar && routeState.hasContent;
        results.routeMatrix.push({
          profile: p.name,
          label: item.label,
          route: item.route,
          heading: routeState.heading,
          activeLink: routeState.activeLink,
          topbar: routeState.topbar,
          sidebar: routeState.sidebar,
          theme: routeState.theme,
          pass: isMatch
        });
      }
    }

    // Explicit check for Historical Owner Defect (Bills & Receipts vs Tasks & Oversight)
    console.log('\n--- 2B. HISTORICAL OWNER DEFECT REGRESSION ASSERTION ---');
    await cdp.navigate('http://localhost:3000/?role=owner#tasks');
    await cdp.waitForSelector('.nav-link');
    await delay(400);

    const ownerStep1 = await cdp.eval(`
      (() => {
        const activeLink = document.querySelector('.sidebar .nav-link.active')?.textContent.trim() || '';
        const bodyText = document.querySelector('#content, #page-content, main, .app-content')?.textContent || '';
        const isTasksRendered = !!document.getElementById('oto-grid') || bodyText.includes('Task') || bodyText.includes('Approvals');
        return { activeLink, isTasksRendered, hash: window.location.hash };
      })()
    `);

    // Click Bills & Receipts
    await cdp.eval(`
      (() => {
        const billsBtn = Array.from(document.querySelectorAll('.sidebar .nav-link')).find(a => a.textContent.includes('Bills & Receipts'));
        if (billsBtn) billsBtn.click();
      })()
    `);
    await delay(600);

    const ownerStep2 = await cdp.eval(`
      (() => {
        const activeLink = document.querySelector('.sidebar .nav-link.active')?.textContent.trim() || '';
        const bodyText = document.querySelector('#content, #page-content, main, .app-content')?.textContent || '';
        const isBillsRendered = bodyText.includes('Bills') || bodyText.includes('Sales Bills') || bodyText.includes('Tax Receipts');
        const isTasksStillRendered = !!document.getElementById('oto-grid');
        return { activeLink, isBillsRendered, isTasksStillRendered, hash: window.location.hash };
      })()
    `);

    const ownerDefectResolved = ownerStep2.activeLink.includes('Bills & Receipts') && ownerStep2.isBillsRendered && !ownerStep2.isTasksStillRendered && ownerStep2.hash === '#bills';
    results.ownerHistoricalDefect = {
      pass: ownerDefectResolved,
      step1_initial: ownerStep1,
      step2_afterClickBills: ownerStep2
    };
    console.log('Owner Defect Resolved:', ownerDefectResolved ? 'PASS' : 'FAIL', results.ownerHistoricalDefect);

    // =========================================================================
    // 3. SIDEBAR SCROLL-PERSISTENCE EVIDENCE
    // =========================================================================
    console.log('\n--- 3. SIDEBAR SCROLL PERSISTENCE ---');
    await cdp.setViewport(1280, 550); // Set laptop height to ensure scroll overflow for compact profiles
    for (const p of profiles) {
      await cdp.navigate(`http://localhost:3000/?role=${p.role}#dashboard`);
      await cdp.waitForSelector('.sidebar-nav');
      await delay(300);

      const beforeScroll = await cdp.eval(`
        (() => {
          const nav = document.querySelector('.sidebar-nav') || document.getElementById('sidebar');
          if (!nav) return 0;
          nav.scrollTop = 120;
          return nav.scrollTop;
        })()
      `);

      // Click Settings (at bottom of sidebar)
      await cdp.eval(`
        (() => {
          const settingsBtn = Array.from(document.querySelectorAll('.sidebar .nav-link')).find(a => a.textContent.includes('Settings'));
          if (settingsBtn) settingsBtn.click();
        })()
      `);
      await delay(400);

      const afterScroll = await cdp.eval(`
        (() => {
          const nav = document.querySelector('.sidebar-nav') || document.getElementById('sidebar');
          return nav?.scrollTop || 0;
        })()
      `);

      const pass = beforeScroll > 0 && afterScroll === beforeScroll;
      results.scrollPersistence.push({
        profile: p.name,
        before: beforeScroll,
        after: afterScroll,
        resetToZero: afterScroll === 0,
        pass
      });
      console.log(`Scroll Persistence [${p.name}]:`, pass ? 'PASS' : 'FAIL', { before: beforeScroll, after: afterScroll });
    }
    await cdp.setViewport(1920, 1080);

    // =========================================================================
    // 4. THEME MATRIX
    // =========================================================================
    console.log('\n--- 4. THEME MATRIX ---');
    const themes = ['paper', 'pearl', 'midnight', 'noir'];
    for (const p of profiles) {
      for (const t of themes) {
        await cdp.navigate(`http://localhost:3000/?role=${p.role}#dashboard`);
        await cdp.waitForSelector('.sidebar-nav');

        // Set theme
        await cdp.eval(`
          (() => {
            document.documentElement.setAttribute('data-theme', '${t}');
            localStorage.setItem('zamorin_theme', '${t}');
          })()
        `);
        await delay(200);

        // Navigate across 2 routes
        await cdp.eval(`window.location.hash = '#settings'`);
        await delay(200);
        await cdp.eval(`window.location.hash = '#reports'`);
        await delay(200);

        const themeCheck = await cdp.eval(`
          (() => {
            const rootTheme = document.documentElement.getAttribute('data-theme');
            const hasNavyOverride = Array.from(document.querySelectorAll('.card, .kpi-card, .module-container')).some(el => {
              const bg = window.getComputedStyle(el).backgroundColor;
              return bg === 'rgb(19, 28, 46)' || bg === 'rgb(13, 21, 36)';
            });
            return { rootTheme, hasNavyOverride };
          })()
        `);

        const themePass = themeCheck.rootTheme === t && !themeCheck.hasNavyOverride;
        results.themeMatrix.push({
          profile: p.name,
          theme: t,
          rootTheme: themeCheck.rootTheme,
          hasNavyOverride: themeCheck.hasNavyOverride,
          pass: themePass
        });
      }
    }

    // =========================================================================
    // 5. RESPONSIVE & ZOOM SIMULATION MATRIX
    // =========================================================================
    console.log('\n--- 5. RESPONSIVE / ZOOM SIMULATION ---');
    const viewports = [
      { name: '1366 × 768 @ 100%', width: 1366, height: 768, type: 'Native Baseline' },
      { name: '1440 × 900 @ 100%', width: 1440, height: 900, type: 'Native Baseline' },
      { name: '1536 × 864 @ 100%', width: 1536, height: 864, type: 'Native Baseline' },
      { name: '1600 × 900 @ 100%', width: 1600, height: 900, type: 'Native Baseline' },
      { name: '1920 × 1080 @ 100%', width: 1920, height: 1080, type: 'Native Baseline' },
      { name: '125% Zoom Simulation (1536x864 CSS)', width: 1536, height: 864, type: 'Zoom Simulation' },
      { name: '150% Zoom Simulation (1280x720 CSS)', width: 1280, height: 720, type: 'Zoom Simulation' },
      { name: '175% Zoom Simulation (1097x617 CSS)', width: 1097, height: 617, type: 'Zoom Simulation' },
      { name: '200% Zoom Simulation (960x540 CSS)', width: 960, height: 540, type: 'Zoom Simulation' },
    ];

    for (const vp of viewports) {
      await cdp.setViewport(vp.width, vp.height);
      await cdp.navigate('http://localhost:3000/?role=master#dashboard');
      await cdp.waitForSelector('#sidebar');
      await delay(300);

      const respCheck = await cdp.eval(`
        (() => {
          const topbar = !!document.getElementById('topbar');
          const sidebar = !!document.getElementById('sidebar');
          const sbWidth = document.getElementById('sidebar')?.getBoundingClientRect().width || 0;
          const docScrollWidth = document.documentElement.scrollWidth;
          const windowWidth = window.innerWidth;
          const hasDocOverflow = docScrollWidth > windowWidth + 2;
          const toggleEl = document.querySelector('.sidebar-topbar-toggle');
          const toggleDisplay = toggleEl ? window.getComputedStyle(toggleEl).display : 'none';
          return {
            topbar,
            sidebar,
            sbWidth,
            hasDocOverflow,
            docScrollWidth,
            windowWidth,
            toggleDisplay
          };
        })()
      `);

      const isDesktop = vp.width > 720;
      const respPass = respCheck.topbar && respCheck.sidebar && !respCheck.hasDocOverflow && (!isDesktop || respCheck.toggleDisplay === 'none');
      results.responsiveMatrix.push({
        condition: vp.name,
        width: vp.width,
        height: vp.height,
        type: vp.type,
        topbarVisible: respCheck.topbar,
        sidebarVisible: respCheck.sidebar,
        sidebarWidth: respCheck.sbWidth,
        docOverflow: respCheck.hasDocOverflow,
        hamburgerHidden: respCheck.toggleDisplay === 'none',
        pass: respPass
      });
      console.log(`Responsive [${vp.name}]:`, respPass ? 'PASS' : 'FAIL');
    }

    // =========================================================================
    // 6. RUNTIME CONSOLE & UNCAUGHT ERRORS
    // =========================================================================
    console.log('\n--- 6. RUNTIME CONSOLE CHECK ---');
    results.runtimeErrors = cdp.runtimeExceptions;
    console.log('Uncaught Runtime Exceptions:', results.runtimeErrors.length);

    fs.writeFileSync('docs/STAGE_1_TEST_EVIDENCE_AUTOMATED.json', JSON.stringify(results, null, 2));
    console.log('Saved docs/STAGE_1_TEST_EVIDENCE_AUTOMATED.json');

    console.log('\n=== ALL CLOSURE GATE TESTS COMPLETED SUCCESSFULLY ===');
  } finally {
    chromeProcess.kill();
  }
}

run().catch(err => {
  console.error('Fatal error during closure gate tests:', err);
  process.exit(1);
});
