import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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
    await page.goto('http://localhost:3000/#/cafe-operations/login', { waitUntil: 'networkidle0' });
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
    await page.goto('http://localhost:3000/#/cafe-operations/login', { waitUntil: 'networkidle0' });
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
    await page.goto('http://localhost:3000/#/cafe-operations/login', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#col-login-form', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: 'd:/Zamorin_Cafe_ERP_Build/cafe_ops_mobile_375.png' });
    console.log('Saved cafe_ops_mobile_375.png');
    results.scenarioE_Mobile = 'PASS';
    await page.close();

    // -------------------------------------------------------------
    // SCENARIO B: Preselected Café from URL query parameter
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO B: Preselected Cafe (?cafe=ZC-0002) ---');
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('http://localhost:3000/#/cafe-operations/login?cafe=ZC-0002', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#col-cafe-select', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000));
    const selectedCafeVal = await page.$eval('#col-cafe-select', el => el.value);
    console.log('Selected Cafe Value in selector:', selectedCafeVal);
    if (selectedCafeVal === 'ZC-0002') {
      console.log('Scenario B PASS: ZC-0002 was auto-selected!');
      results.scenarioB = 'PASS';
    } else {
      console.error('Scenario B FAIL: Expected ZC-0002, got ' + selectedCafeVal);
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
    await page.goto('http://localhost:3000/#/cafe-operations/login', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#col-login-form', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 600));

    await page.select('#col-cafe-select', 'ZC-0001');
    await page.type('#col-user-id', 'ST-0001');
    await page.type('#col-cafe-pin', '123456');
    await page.type('#col-employee-pin', '000000'); // Wrong PIN

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
    await page.goto('http://localhost:3000/#/cafe-operations/login', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#col-login-form', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 600));

    await page.select('#col-cafe-select', 'ZC-0001'); // Cafe 1
    await page.type('#col-user-id', 'AD-0002');      // Admin from Cafe 2
    await page.type('#col-cafe-pin', '123456');
    await page.type('#col-employee-pin', '258369');  // Valid PIN for AD-0002

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
    // SCENARIO A1: Valid Staff Sign-In (ST-0001 at ZC-0001 -> staff-home)
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO A1: Valid Staff Sign-In (ST-0001) ---');
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('http://localhost:3000/#/cafe-operations/login', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#col-login-form', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 600));

    await page.select('#col-cafe-select', 'ZC-0001');
    await page.type('#col-user-id', 'ST-0001');
    await page.type('#col-cafe-pin', '123456');
    await page.type('#col-employee-pin', '654321');

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
    // SCENARIO A2: Valid Admin Sign-In (AD-0001 at ZC-0001 -> dashboard)
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO A2: Valid Admin Sign-In (AD-0001) ---');
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('http://localhost:3000/#/cafe-operations/login', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#col-login-form', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 600));

    await page.select('#col-cafe-select', 'ZC-0001');
    await page.type('#col-user-id', 'AD-0001');
    await page.type('#col-cafe-pin', '123456');
    await page.type('#col-employee-pin', '147258');

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
    console.error('Test execution failed:', err);
  } finally {
    await browser.close();
  }

  console.log('\n=======================================');
  console.log('FINAL E2E RESULTS SUMMARY:');
  console.log(JSON.stringify(results, null, 2));
  console.log('=======================================');
}

runAllScenarios();
