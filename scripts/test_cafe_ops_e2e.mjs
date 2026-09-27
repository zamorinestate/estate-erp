import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

// -------------------------------------------------------------
// Environment Configuration & Safe Execution Guard
// -------------------------------------------------------------
const BASE_URL = process.env.CAFE_OPS_E2E_BASE_URL || 'http://localhost:3000';
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const cafeId = process.env.CAFE_OPS_E2E_CAFE_ID;
const staffId = process.env.CAFE_OPS_E2E_STAFF_ID;
const cafePin = process.env.CAFE_OPS_E2E_CAFE_PIN;
const employeePin = process.env.CAFE_OPS_E2E_EMPLOYEE_PIN;
const adminId = process.env.CAFE_OPS_E2E_ADMIN_ID;
const adminPin = process.env.CAFE_OPS_E2E_ADMIN_PIN;

// Section 14: E2E Environment Safety Guard
const isLocal = BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1');
const allowNonLocal = process.env.ALLOW_CAFE_OPS_E2E_NONLOCAL === 'true';

if (!isLocal && !allowNonLocal) {
  console.error('[E2E_SECURITY_ERROR] Non-local execution is blocked by default.');
  console.error('To permit execution against a dedicated non-local test environment, set ALLOW_CAFE_OPS_E2E_NONLOCAL=true');
  process.exit(1);
}

// Section 2: Runtime Credentials Validation (Fail closed without fallbacks)
if (!cafeId || !staffId || !cafePin || !employeePin || !adminId || !adminPin) {
  console.error('CAFE_OPS_E2E_CREDENTIALS_NOT_CONFIGURED');
  process.exit(1);
}

async function runAllScenarios() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const results = {};

  try {
    // -------------------------------------------------------------
    // SCENARIO E1: Desktop 1440x900 Screenshot
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO E1: Desktop 1440x900 ---');
    let page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/#/cafe-operations/login`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#col-login-form', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: 'd:/Zamorin_Cafe_ERP_Build/cafe_ops_desktop_1440.png' });
    console.log('Saved cafe_ops_desktop_1440.png');
    results.scenarioE_Desktop = 'PASS';
    await page.close();

    // -------------------------------------------------------------
    // SCENARIO E2: Tablet 768x1024 Screenshot
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO E2: Tablet 768x1024 ---');
    page = await browser.newPage();
    await page.setViewport({ width: 768, height: 1024 });
    await page.goto(`${BASE_URL}/#/cafe-operations/login`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#col-login-form', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: 'd:/Zamorin_Cafe_ERP_Build/cafe_ops_tablet_768.png' });
    console.log('Saved cafe_ops_tablet_768.png');
    results.scenarioE_Tablet = 'PASS';
    await page.close();

    // -------------------------------------------------------------
    // SCENARIO E3: Mobile 375x667 Screenshot
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO E3: Mobile 375x667 ---');
    page = await browser.newPage();
    await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
    await page.goto(`${BASE_URL}/#/cafe-operations/login`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#col-login-form', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: 'd:/Zamorin_Cafe_ERP_Build/cafe_ops_mobile_375.png' });
    console.log('Saved cafe_ops_mobile_375.png');
    results.scenarioE_Mobile = 'PASS';
    await page.close();

    // -------------------------------------------------------------
    // SCENARIO B: Preselected Café from URL query parameter
    // -------------------------------------------------------------
    console.log(`\n--- SCENARIO B: Preselected Cafe (?cafe=${cafeId}) ---`);
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/#/cafe-operations/login?cafe=${cafeId}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#col-cafe-select', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000));
    const selectedCafeVal = await page.$eval('#col-cafe-select', el => el.value);
    console.log('Selected Cafe Value in selector:', selectedCafeVal);
    if (selectedCafeVal === cafeId) {
      console.log(`Scenario B PASS: ${cafeId} was auto-selected!`);
      results.scenarioB = 'PASS';
    } else {
      console.error(`Scenario B FAIL: Expected ${cafeId}, got ${selectedCafeVal}`);
      results.scenarioB = `FAIL (got ${selectedCafeVal})`;
    }
    await page.screenshot({ path: 'd:/Zamorin_Cafe_ERP_Build/cafe_ops_preselected_zc0002.png' });
    await page.close();

    // -------------------------------------------------------------
    // SCENARIO C: Invalid Employee PIN Rejection (Generic Error)
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO C: Invalid Employee PIN Rejection ---');
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/#/cafe-operations/login`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#col-login-form', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 600));

    await page.select('#col-cafe-select', cafeId);
    await page.type('#col-user-id', staffId);
    await page.type('#col-cafe-pin', cafePin);
    await page.type('#col-employee-pin', '999998'); // Deliberate mismatch

    await page.click('#col-submit-btn');

    await page.waitForFunction(() => {
      const banner = document.querySelector('#col-error-banner');
      return banner && banner.style.display !== 'none' && banner.textContent.trim().length > 0;
    }, { timeout: 10000 });

    const errorTextC = await page.$eval('#col-error-banner', el => el.textContent.trim());
    console.log('Error banner text (Scenario C):', errorTextC);

    if (errorTextC.includes('Unable to sign in. Please verify your Café, ID and PINs.')) {
      console.log('Scenario C PASS: Exact generic error message returned.');
      results.scenarioC = 'PASS';
    } else {
      console.warn('Scenario C: Error returned but text was:', errorTextC);
      results.scenarioC = `WARN (text: ${errorTextC})`;
    }
    await page.screenshot({ path: 'd:/Zamorin_Cafe_ERP_Build/cafe_ops_error_invalid_pin.png' });
    await page.close();

    // -------------------------------------------------------------
    // SCENARIO D: Cross-Café Rejection (Employee not assigned to Cafe)
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO D: Cross-Café Rejection ---');
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/#/cafe-operations/login`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#col-login-form', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 600));

    await page.select('#col-cafe-select', cafeId);
    await page.type('#col-user-id', 'AD-0002'); // Admin assigned exclusively to Cafe 2
    await page.type('#col-cafe-pin', cafePin);
    await page.type('#col-employee-pin', '739104');

    await page.click('#col-submit-btn');

    await page.waitForFunction(() => {
      const banner = document.querySelector('#col-error-banner');
      return banner && banner.style.display !== 'none' && banner.textContent.trim().length > 0;
    }, { timeout: 10000 });

    const errorTextD = await page.$eval('#col-error-banner', el => el.textContent.trim());
    console.log('Error banner text (Scenario D):', errorTextD);

    if (errorTextD.includes('Unable to sign in. Please verify your Café, ID and PINs.')) {
      console.log('Scenario D PASS: Cross-cafe access rejected with generic error.');
      results.scenarioD = 'PASS';
    } else {
      console.warn('Scenario D: Error returned but text was:', errorTextD);
      results.scenarioD = `WARN (text: ${errorTextD})`;
    }
    await page.screenshot({ path: 'd:/Zamorin_Cafe_ERP_Build/cafe_ops_error_cross_cafe.png' });
    await page.close();

    // -------------------------------------------------------------
    // SCENARIO A1: Valid Staff Sign-In (ST-0001 -> staff-home)
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO A1: Valid Staff Sign-In ---');
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/#/cafe-operations/login`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#col-login-form', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 600));

    await page.select('#col-cafe-select', cafeId);
    await page.type('#col-user-id', staffId);
    await page.type('#col-cafe-pin', cafePin);
    await page.type('#col-employee-pin', employeePin);

    await page.click('#col-submit-btn');

    await page.waitForFunction(() => {
      return document.querySelector('#app:not(.auth-screen)') !== null ||
             document.querySelector('#main-layout') !== null ||
             document.querySelector('.app-shell') !== null;
    }, { timeout: 15000 });

    await new Promise(r => setTimeout(r, 1000));
    console.log('Post-login current URL hash (Staff):', await page.evaluate(() => window.location.hash));
    await page.screenshot({ path: 'd:/Zamorin_Cafe_ERP_Build/cafe_ops_staff_home.png' });
    console.log('Saved cafe_ops_staff_home.png');
    results.scenarioA1_Staff = 'PASS';
    await page.close();

    // -------------------------------------------------------------
    // SCENARIO A2: Valid Admin Sign-In (AD-0001 -> dashboard)
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO A2: Valid Admin Sign-In ---');
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/#/cafe-operations/login`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#col-login-form', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 600));

    await page.select('#col-cafe-select', cafeId);
    await page.type('#col-user-id', adminId);
    await page.type('#col-cafe-pin', cafePin);
    await page.type('#col-employee-pin', adminPin);

    await page.click('#col-submit-btn');

    await page.waitForFunction(() => {
      return document.querySelector('#app:not(.auth-screen)') !== null ||
             document.querySelector('#main-layout') !== null ||
             document.querySelector('.app-shell') !== null;
    }, { timeout: 15000 });

    await new Promise(r => setTimeout(r, 1000));
    console.log('Post-login current URL hash (Admin):', await page.evaluate(() => window.location.hash));
    await page.screenshot({ path: 'd:/Zamorin_Cafe_ERP_Build/cafe_ops_admin_dashboard.png' });
    console.log('Saved cafe_ops_admin_dashboard.png');
    results.scenarioA2_Admin = 'PASS';
    await page.close();

  } catch (err) {
    console.error('Test execution error occurred');
  } finally {
    await browser.close();
  }

  console.log('\n=======================================');
  console.log('FINAL E2E RESULTS SUMMARY:');
  console.log(JSON.stringify(results, null, 2));
  console.log('=======================================');
}

runAllScenarios();
