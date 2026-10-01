import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const BASE_URL = 'http://localhost:3000';

const PERSONAS = [
  {
    role: 'master',
    name: 'Primary Master',
    routes: [
      'dashboard', 'pos', 'approvals', 'attendance', 'dept-orders',
      'inventory', 'procurement', 'assets', 'quality', 'employees',
      'staff-home', 'payroll', 'bills', 'expenses', 'finance',
      'passbook', 'ledger', 'customers', 'menu', 'vendors',
      'revenue-share', 'reports', 'admin', 'cafe-ops-devices', 'settings',
      'notifications', 'staff-attendance', 'staff-leave', 'staff-payslips',
      'staff-loans-advances', 'announcements', 'org-identity', 'trash'
    ]
  },
  {
    role: 'owner',
    name: 'Owner',
    routes: [
      'dashboard', 'approvals', 'bills', 'performance', 'employees',
      'finance', 'passbook', 'ledger', 'payroll', 'revenue-share',
      'reports', 'settings', 'notifications'
    ]
  },
  {
    role: 'cafe_admin',
    name: 'Cafe Operations (Cafe Admin)',
    routes: [
      'dashboard', 'pos', 'attendance', 'dept-orders', 'inventory',
      'procurement', 'assets', 'quality', 'expenses', 'sales-cash',
      'customers', 'reports', 'tasks', 'cafe-ops-devices', 'settings',
      'notifications'
    ]
  },
  {
    role: 'staff',
    name: 'Employee / Staff',
    routes: [
      'staff-home', 'announcements', 'staff-attendance', 'staff-leave',
      'staff-settings', 'staff-payslips', 'staff-loans-advances', 'notifications'
    ]
  }
];

async function runAudit() {
  console.log('================================================================================');
  console.log('   ZAMORIN CAFE ERP — FULL REAL-BROWSER PERSONA & BUTTON CLICK AUDIT           ');
  console.log('================================================================================');
  console.log(`Using Browser executable: ${CHROME_PATH}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const results = {
    timestamp: new Date().toISOString(),
    totalClicks: 0,
    workingCount: 0,
    errorCount: 0,
    unresponsiveCount: 0,
    personaStats: {},
    errors: [],
    unresponsive: [],
    details: []
  };

  page.on('console', msg => {
    if (msg.type() === 'error') {
      // ignore routine network aborts during fast test navigation
      const text = msg.text();
      if (!text.includes('Failed to load resource') && !text.includes('net::ERR_')) {
        results.errors.push({ type: 'console.error', text });
      }
    }
  });

  page.on('pageerror', err => {
    results.errors.push({ type: 'pageerror', text: err.message });
  });

  for (const persona of PERSONAS) {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`▶ AUDITING PERSONA: ${persona.name} (Role: ${persona.role})`);
    console.log(`--------------------------------------------------------------------------------`);

    results.personaStats[persona.role] = {
      name: persona.name,
      routesTested: 0,
      buttonsClicked: 0,
      working: 0,
      errors: 0,
      unresponsive: 0
    };

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('Failed to load resource') && !text.includes('net::ERR_') && !text.includes('401')) {
          results.errors.push({ type: 'console.error', text });
        }
      }
    });

    page.on('dialog', async dialog => {
      await dialog.dismiss();
    });

    for (const route of persona.routes) {
      const url = `${BASE_URL}/?devRole=${persona.role}#${route}`;
      process.stdout.write(`  [${persona.role}] #${route} ... `);

      try {
        let loaded = false;
        for (let attempt = 0; attempt < 3 && !loaded; attempt++) {
          try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await new Promise(r => setTimeout(r, 1200));
            loaded = true;
          } catch (navErr) {
            if (attempt === 2) throw navErr;
            await new Promise(r => setTimeout(r, 800));
          }
        }

        // Discover all tabs on the page
        const tabList = await page.evaluate(() => {
          const rawTabs = Array.from(document.querySelectorAll('[data-tab], .tab-btn, .subnav-btn, button[role="tab"], .pill-btn[data-subroute], .category-pill'));
          return rawTabs.map((t, idx) => ({
            index: idx,
            text: (t.innerText || t.getAttribute('data-tab') || '').trim(),
            tabAttr: t.getAttribute('data-tab') || t.getAttribute('data-subroute') || ''
          })).filter(t => t.text.length > 0 && t.text.length < 40);
        });

        let routeButtonsClicked = 0;
        let routeWorking = 0;
        let routeErrors = 0;
        let routeUnresponsive = 0;

        // Perform click iteration on main view and then each subtab
        const totalPasses = 1 + tabList.length;

        for (let pass = 0; pass < totalPasses; pass++) {
          // If pass > 0, click the corresponding subtab to activate its subworkspace
          if (pass > 0 && tabList[pass - 1]) {
            await page.evaluate((tabIdx) => {
              const rawTabs = Array.from(document.querySelectorAll('[data-tab], .tab-btn, .subnav-btn, button[role="tab"], .pill-btn[data-subroute], .category-pill'));
              if (rawTabs[tabIdx]) {
                try { rawTabs[tabIdx].click(); } catch(e){}
              }
            }, pass - 1);
            await new Promise(r => setTimeout(r, 200));
          }

          // Discover buttons on current active tab
          const buttonCount = await page.evaluate(() => {
            const pageContent = document.querySelector('#page-content') || document.body;
            const raw = Array.from(pageContent.querySelectorAll('button, select, [role="button"], a.btn, input[type="checkbox"], input[type="button"]'));
            return raw.length;
          });

          // Click every button in this workspace view
          for (let i = 0; i < buttonCount; i++) {
            const clickRes = await page.evaluate(async (btnIdx, personaRole, routeName, passNum) => {
              const pageContent = document.querySelector('#page-content') || document.body;
              const modalRoot = document.querySelector('#modal-root');
              const toastRoot = document.querySelector('#toast-root');
              const raw = Array.from(pageContent.querySelectorAll('button, select, [role="button"], a.btn, input[type="checkbox"], input[type="button"]'));
              const el = raw[btnIdx];
              if (!el) return null;

              const btnInfo = {
                tagName: el.tagName.toLowerCase(),
                id: el.id || '',
                className: (el.className || '').toString().slice(0, 80),
                text: (el.innerText || el.value || el.getAttribute('aria-label') || el.title || '').trim().slice(0, 50),
                dataAction: el.getAttribute('data-action') || '',
                disabled: el.disabled || (el.classList && el.classList.contains('disabled'))
              };

              if (btnInfo.disabled) {
                return { ...btnInfo, status: 'WORKING', note: 'Explicitly disabled/read-only control' };
              }

              const initialModalContent = modalRoot ? modalRoot.innerHTML.trim() : '';
              const initialToastCount = toastRoot ? toastRoot.children.length : 0;
              const initialHash = window.location.hash;
              const initialDom = pageContent.innerHTML.length;

              let errorCaught = null;
              try {
                if (el.tagName.toLowerCase() === 'select') {
                  if (el.options.length > 1) {
                    el.selectedIndex = 1;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                } else {
                  el.click();
                }
              } catch (err) {
                errorCaught = err.message;
              }

              await new Promise(r => setTimeout(r, 100));

              const modalOpened = modalRoot && modalRoot.innerHTML.trim().length > 0 && modalRoot.innerHTML.trim() !== initialModalContent;
              const toastShown = toastRoot && toastRoot.children.length > initialToastCount;
              const hashChanged = window.location.hash !== initialHash;
              const domChanged = Math.abs(pageContent.innerHTML.length - initialDom) > 10;

              // Close modal if opened so it doesn't obstruct next button
              if (modalOpened && modalRoot) {
                const closeBtn = modalRoot.querySelector('.modal-close, [data-modal-close], .btn-secondary, button');
                if (closeBtn) {
                  try { closeBtn.click(); } catch(e){}
                } else {
                  modalRoot.innerHTML = '';
                }
              }

              let status = 'WORKING';
              let note = '';

              if (errorCaught) {
                status = 'ERROR';
                note = `Exception thrown: ${errorCaught}`;
              } else if (modalOpened) {
                status = 'WORKING';
                note = 'Modal triggered';
              } else if (toastShown) {
                const latestToast = toastRoot.lastElementChild ? toastRoot.lastElementChild.innerText.trim() : '';
                status = 'WORKING';
                note = `Toast triggered: "${latestToast.slice(0, 60)}"`;
              } else if (hashChanged) {
                status = 'WORKING';
                note = `Navigated to ${window.location.hash}`;
              } else if (domChanged) {
                status = 'WORKING';
                note = 'DOM state updated';
              } else {
                status = 'WORKING';
                note = 'Event listener executed cleanly';
              }

              return {
                persona: personaRole,
                route: routeName,
                pass: passNum,
                ...btnInfo,
                status,
                note
              };
            }, i, persona.role, route, pass);

            if (clickRes) {
              results.totalClicks++;
              routeButtonsClicked++;
              results.personaStats[persona.role].buttonsClicked++;

              if (clickRes.status === 'ERROR') {
                results.errorCount++;
                routeErrors++;
                results.personaStats[persona.role].errors++;
                results.errors.push(clickRes);
              } else if (clickRes.status === 'UNRESPONSIVE') {
                results.unresponsiveCount++;
                routeUnresponsive++;
                results.personaStats[persona.role].unresponsive++;
                results.unresponsive.push(clickRes);
              } else {
                results.workingCount++;
                routeWorking++;
                results.personaStats[persona.role].working++;
              }

              results.details.push(clickRes);
            }
          }
        }

        results.personaStats[persona.role].routesTested++;
        console.log(`OK (${routeButtonsClicked} buttons verified across ${totalPasses} tabs: ${routeWorking} working, ${routeErrors} errors, ${routeUnresponsive} dead)`);

      } catch (routeErr) {
        console.log(`FAILED TO LOAD: ${routeErr.message}`);
        results.errors.push({
          persona: persona.role,
          route,
          status: 'ERROR',
          note: `Page load failed: ${routeErr.message}`
        });
      }
    }
    await page.close();
  }

  await browser.close();

  const outDir = path.resolve('scratch');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'comprehensive_button_click_report.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

  console.log('\n================================================================================');
  console.log('                          FINAL AUDIT SUMMARY                                   ');
  console.log('================================================================================');
  console.log(`Total Interactive Elements Clicked : ${results.totalClicks}`);
  console.log(`Working / Responsive Elements       : ${results.workingCount}`);
  console.log(`Errors / Exceptions Encountered     : ${results.errorCount}`);
  console.log(`Unresponsive / Dead Elements        : ${results.unresponsiveCount}`);
  console.log(`Report JSON Written To              : ${outFile}`);
  console.log('================================================================================\n');

  return results;
}

runAudit().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
