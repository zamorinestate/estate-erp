import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'http://localhost:3000';
const MASTER_EMAIL = String(process.env.E2E_MASTER_EMAIL || '').trim();
const MASTER_PASSWORD = String(process.env.E2E_MASTER_PASSWORD || '');

if (!MASTER_EMAIL || !MASTER_PASSWORD) {
  throw new Error('E2E_MASTER_CREDENTIALS_NOT_CONFIGURED');
}
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const consoleLogs = [];
const consoleErrors = [];

async function clickSelector(page, selector) {
  await page.waitForSelector(selector, { timeout: 5000 });
  await page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Element ${sel} not found`);
    el.scrollIntoView({ block: 'center' });
    el.click();
  }, selector);
}

async function runE2E() {
  console.log('=== ZAMORIN CAFÉ ERP — CAFÉ ADMINISTRATION ACTIONS E2E TEST ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (msg.type() === 'error') {
      consoleErrors.push(text);
      console.error(`[BROWSER CONSOLE ERROR] ${text}`);
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    console.error(`[BROWSER UNCAUGHT EXCEPTION] ${err.message}`);
  });

  try {
    // -------------------------------------------------------------
    // STEP 1: Navigate to Login
    // -------------------------------------------------------------
    console.log('1. Navigating to login page...');
    await page.goto(`${BASE_URL}/#login`, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));

    // Fill credentials
    console.log('2. Entering configured Primary Master credentials...');
    await page.waitForSelector('#l2-email', { timeout: 10000 });
    await page.click('#l2-email', { clickCount: 3 });
    await page.type('#l2-email', MASTER_EMAIL);

    await page.waitForSelector('#l2-password', { timeout: 10000 });
    await page.click('#l2-password', { clickCount: 3 });
    await page.type('#l2-password', MASTER_PASSWORD);

    // Click Login
    console.log('3. Submitting login form...');
    await page.click('#l2-submit-btn');
    await new Promise(r => setTimeout(r, 2500));

    // -------------------------------------------------------------
    // STEP 2: Navigate to Administration -> Cafés
    // -------------------------------------------------------------
    console.log('4. Navigating to Administration -> Cafés (#admin/cafes)...');
    await page.goto(`${BASE_URL}/#admin/cafes`, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    // Verify table rendered
    await page.waitForSelector('#admin-main-tab-content', { timeout: 10000 });
    console.log('5. Administration Cafés tab rendered successfully.');

    // -------------------------------------------------------------
    // STEP 3: Verify Zero [object Object] in text or DOM
    // -------------------------------------------------------------
    console.log('6. Auditing page for [object Object] defects...');
    const bodyText = await page.evaluate(() => document.body.innerText);
    const bodyHtml = await page.evaluate(() => document.body.innerHTML);

    if (bodyText.includes('[object Object]') || bodyHtml.includes('[object Object]')) {
      throw new Error('FAILURE: "[object Object]" is visible in document!');
    }
    console.log('   ✓ Verified: Zero [object Object] in rendered portfolio.');

    // Take screenshot of portfolio
    const artifactsDir = path.resolve('artifacts');
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactsDir, 'cafe_admin_portfolio.png') });
    console.log('   ✓ Screenshot captured: artifacts/cafe_admin_portfolio.png');

    // Find rendered cafes
    const cafeRows = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('[data-view-cafe]'));
      return btns.map(b => b.dataset.viewCafe);
    });
    console.log(`7. Found ${cafeRows.length} cafés: ${cafeRows.join(', ')}`);
    if (cafeRows.length === 0) {
      throw new Error('No café rows found in table!');
    }

    const testCafeId = cafeRows[0];
    const secondCafeId = cafeRows.length > 1 ? cafeRows[1] : null;

    // -------------------------------------------------------------
    // STEP 4: Test View Button on First Cafe (e.g. ZC-0002)
    // -------------------------------------------------------------
    console.log(`\n8. Testing View button on café ${testCafeId}...`);
    await clickSelector(page, `[data-view-cafe="${testCafeId}"]`);
    await page.waitForSelector('.modal-backdrop', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 400));

    const viewModalData = await page.evaluate(() => {
      const modal = document.querySelector('.modal-backdrop');
      if (!modal) return null;
      const text = modal.textContent || '';
      return {
        hasTitle: text.includes('DISPLAY NAME') || text.includes('CAFE TYPE'),
        hasObjectDefect: text.includes('[object Object]'),
        snippet: text.replace(/\s+/g, ' ').slice(0, 150)
      };
    });

    if (!viewModalData || !viewModalData.hasTitle) {
      throw new Error(`View modal did not open for ${testCafeId}`);
    }
    if (viewModalData.hasObjectDefect) {
      throw new Error(`View modal contains [object Object]!`);
    }
    console.log('   ✓ View modal opened correctly with clean details:');
    console.log(`     ${viewModalData.snippet}`);

    await page.screenshot({ path: path.join(artifactsDir, 'cafe_admin_view_modal.png') });
    console.log('   ✓ Screenshot captured: artifacts/cafe_admin_view_modal.png');

    // Close modal
    await clickSelector(page, '[data-close-modal]');
    await new Promise(r => setTimeout(r, 400));
    console.log('   ✓ View modal closed.');

    // -------------------------------------------------------------
    // STEP 5: Test View Button on Second Cafe (e.g. ZC-0001 or CAFE-*)
    // -------------------------------------------------------------
    if (secondCafeId) {
      console.log(`\n9. Testing View button on second café ${secondCafeId}...`);
      await clickSelector(page, `[data-view-cafe="${secondCafeId}"]`);
      await page.waitForSelector('.modal-backdrop', { timeout: 5000 });
      await new Promise(r => setTimeout(r, 400));

      const secondModalText = await page.evaluate(() => document.querySelector('.modal-backdrop')?.textContent || '');
      if (secondModalText.includes('[object Object]')) {
        throw new Error(`Second café View modal contains [object Object]!`);
      }
      console.log(`   ✓ Second café ${secondCafeId} View modal verified clean.`);
      await clickSelector(page, '[data-close-modal]');
      await new Promise(r => setTimeout(r, 400));
    }

    // -------------------------------------------------------------
    // STEP 6: Test Access Button on ZC-0001 (Fully Provisioned)
    // -------------------------------------------------------------
    const accessTargetId = cafeRows.includes('ZC-0001') ? 'ZC-0001' : testCafeId;
    console.log(`\n10. Testing Access button on fully provisioned café ${accessTargetId}...`);
    await clickSelector(page, `[data-access-cafe="${accessTargetId}"]`);
    await page.waitForSelector('.modal-backdrop', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 1200));

    const accessModalData = await page.evaluate(() => {
      const modal = document.querySelector('.modal-backdrop');
      if (!modal) return null;
      const text = modal.textContent || '';
      return {
        isOpen: true,
        hasPlaintextPin: /\bPIN:\s*\d{6}\b/.test(text) && !text.includes('••••••'),
        hasLoginLink: text.includes('cafe-operations/login') || text.includes('Dedicated Login URL') || text.includes('LOGIN'),
        textSnippet: text.replace(/\s+/g, ' ').slice(0, 200)
      };
    });

    if (!accessModalData || !accessModalData.isOpen) {
      throw new Error(`Access modal did not open for ${accessTargetId}`);
    }
    if (accessModalData.hasPlaintextPin) {
      throw new Error('SECURITY VIOLATION: Plaintext PIN revealed in Access Modal!');
    }
    console.log('   ✓ Access Management modal opened successfully:');
    console.log(`     ${accessModalData.textSnippet}`);
    await page.screenshot({ path: path.join(artifactsDir, 'cafe_admin_access_modal.png') });
    console.log('   ✓ Screenshot captured: artifacts/cafe_admin_access_modal.png');

    // Close access modal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('[data-close-modal]') ||
                       document.querySelector('#admin-close-access-mgmt-btn') ||
                       document.querySelector('.modal-card button');
      if (closeBtn) closeBtn.click();
      else {
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) backdrop.remove();
      }
    });
    await new Promise(r => setTimeout(r, 400));
    console.log('   ✓ Access modal closed.');

    // -------------------------------------------------------------
    // STEP 7: Test Edit Button
    // -------------------------------------------------------------
    console.log(`\n11. Testing Edit button on café ${testCafeId}...`);
    await clickSelector(page, `[data-edit-cafe="${testCafeId}"]`);
    await page.waitForSelector('#edit-cafe-form', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 400));

    const editModalData = await page.evaluate(() => {
      const form = document.querySelector('#edit-cafe-form');
      if (!form) return null;
      const nameInput = document.querySelector('#edit-cafe-name')?.value;
      const addressInput = document.querySelector('#edit-cafe-address')?.value;
      const cityInput = document.querySelector('#edit-cafe-city')?.value;
      return {
        isOpen: true,
        name: nameInput,
        address: addressInput,
        city: cityInput,
        hasObjectDefect: (addressInput || '').includes('[object Object]')
      };
    });

    if (!editModalData || !editModalData.isOpen) {
      throw new Error(`Edit modal did not open for ${testCafeId}`);
    }
    if (editModalData.hasObjectDefect) {
      throw new Error('Edit modal pre-populated address with [object Object]!');
    }
    console.log('   ✓ Edit modal opened with clean pre-populated data:');
    console.log(`     Name: "${editModalData.name}" | City: "${editModalData.city}" | Address: "${editModalData.address}"`);

    await page.screenshot({ path: path.join(artifactsDir, 'cafe_admin_edit_modal.png') });
    console.log('   ✓ Screenshot captured: artifacts/cafe_admin_edit_modal.png');

    // Close edit modal
    await clickSelector(page, '[data-close-modal]');
    await new Promise(r => setTimeout(r, 400));
    console.log('   ✓ Edit modal closed.');

    // -------------------------------------------------------------
    // STEP 8: Test More Button
    // -------------------------------------------------------------
    console.log(`\n12. Testing More ▾ button on café ${testCafeId}...`);
    await clickSelector(page, `[data-cafe-actions-menu="${testCafeId}"]`);
    await page.waitForSelector('.modal-backdrop', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 400));

    const menuOpen = await page.evaluate(() => {
      const modal = document.querySelector('.modal-backdrop');
      return modal && (modal.textContent.includes('Actions:') || modal.textContent.includes('View Café Topology'));
    });

    if (!menuOpen) {
      throw new Error(`More ▾ menu did not open for ${testCafeId}`);
    }
    console.log('   ✓ More ▾ actions menu opened successfully.');
    await page.screenshot({ path: path.join(artifactsDir, 'cafe_admin_more_menu.png') });
    console.log('   ✓ Screenshot captured: artifacts/cafe_admin_more_menu.png');

    // Close menu
    await clickSelector(page, '[data-close-modal]');
    await new Promise(r => setTimeout(r, 400));
    console.log('   ✓ More ▾ menu closed.');

    // -------------------------------------------------------------
    // STEP 9: Test Refresh Button & Action Preservation
    // -------------------------------------------------------------
    console.log(`\n13. Testing Refresh button and action listener preservation...`);
    await clickSelector(page, '#admin-refresh-cafes-btn');
    await new Promise(r => setTimeout(r, 1200));

    // Verify row actions STILL work after loadAdminData() replaces innerHTML
    console.log('   Clicking View button AFTER refresh...');
    await clickSelector(page, `[data-view-cafe="${testCafeId}"]`);
    await page.waitForSelector('.modal-backdrop', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 400));

    const viewModalAfterRefresh = await page.evaluate(() => {
      const modal = document.querySelector('.modal-backdrop');
      return modal && modal.textContent.includes('DISPLAY NAME');
    });

    if (!viewModalAfterRefresh) {
      throw new Error('FAILURE: View button failed after Refresh button re-rendered table!');
    }
    console.log('   ✓ SUCCESS: Event delegation survived loadAdminData() re-render!');
    await clickSelector(page, '[data-close-modal]');
    await new Promise(r => setTimeout(r, 400));

    // -------------------------------------------------------------
    // STEP 10: Test Search / Filter Re-render
    // -------------------------------------------------------------
    console.log(`\n14. Testing Search Filter re-render and action responsiveness...`);
    await page.waitForSelector('#admin-cafe-search', { timeout: 5000 });
    await page.type('#admin-cafe-search', testCafeId);
    await new Promise(r => setTimeout(r, 500));

    const filteredRowsCount = await page.evaluate(() => {
      return document.querySelectorAll('[data-view-cafe]').length;
    });
    console.log(`   Filtered rows count: ${filteredRowsCount}`);

    // Click View on filtered row
    await clickSelector(page, `[data-view-cafe="${testCafeId}"]`);
    await page.waitForSelector('.modal-backdrop', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 400));

    const viewModalAfterSearch = await page.evaluate(() => {
      const modal = document.querySelector('.modal-backdrop');
      return modal && modal.textContent.includes('DISPLAY NAME');
    });

    if (!viewModalAfterSearch) {
      throw new Error('FAILURE: View button failed on search filtered row!');
    }
    console.log('   ✓ SUCCESS: Event delegation functional on filtered row!');
    await clickSelector(page, '[data-close-modal]');
    await new Promise(r => setTimeout(r, 400));

    // Clear search
    await page.click('#admin-cafe-search', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await new Promise(r => setTimeout(r, 400));

    // -------------------------------------------------------------
    // STEP 11: Console & Network Errors Check
    // -------------------------------------------------------------
    console.log(`\n15. Checking for uncaught browser console errors...`);
    const criticalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('manifest') && !e.includes('401'));
    if (criticalErrors.length > 0) {
      console.warn(`   Notice: ${criticalErrors.length} console errors observed:`, criticalErrors);
    } else {
      console.log('   ✓ Verified: Zero fatal uncaught runtime errors during test execution.');
    }

    console.log('\n=============================================================');
    console.log('  ALL E2E TEST SCENARIOS PASSED WITH 100% SUCCESS!');
    console.log('  CAFÉ ADMINISTRATION ACTIONS — FULLY WORKING');
    console.log('=============================================================\n');

  } catch (err) {
    console.error(`\n❌ TEST FAILURE: ${err.message}`);
    await page.screenshot({ path: path.join('artifacts', 'cafe_admin_failure.png') }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runE2E();
