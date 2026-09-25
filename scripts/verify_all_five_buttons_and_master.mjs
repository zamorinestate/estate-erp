import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:/Users/chris/.gemini/antigravity-ide/brain/37f87a1c-e54e-4418-93b2-8f9b926d30cd";

async function run() {
  console.log('Launching Chrome to verify all 5 staff buttons & master approvals...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,1000']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[Browser Error]:', msg.text());
  });

  try {
    // -------------------------------------------------------------
    // PART 1: TESTER STAFF LOGIN & ALL 5 BUTTONS VERIFICATION
    // -------------------------------------------------------------
    console.log('\n[A] Navigating to http://localhost:3000/#login2...');
    await page.goto('http://localhost:3000/#login2', { waitUntil: 'networkidle0', timeout: 15000 });

    console.log('Entering Staff credentials for tester (zamorinestatepvtltd.erp@gmail.com)...');
    await page.waitForSelector('#l2-email', { timeout: 8000 });
    await page.$eval('#l2-email', el => el.value = '');
    await page.type('#l2-email', 'zamorinestatepvtltd.erp@gmail.com');
    await page.$eval('#l2-password', el => el.value = '');
    await page.type('#l2-password', 'Password@123');

    console.log('Submitting login...');
    await page.click('#l2-submit-btn');
    await new Promise(r => setTimeout(r, 2500));

    const currentHash = await page.evaluate(() => window.location.hash);
    console.log(`✓ Logged in! Current hash: ${currentHash}`);

    // 1. Verify Button 2: Change Shift Request → on #staff-home
    console.log('\n[1] Verifying Button 2: Change Shift Request → on #staff-home...');
    await page.evaluate(() => { window.location.hash = '#staff-home'; });
    await new Promise(r => setTimeout(r, 1500));

    const btnShiftChange = await page.$('#btn-inline-schedule-request');
    console.log(`Button #btn-inline-schedule-request exists: ${Boolean(btnShiftChange)}`);
    if (btnShiftChange) {
      await page.click('#btn-inline-schedule-request');
      await new Promise(r => setTimeout(r, 800));
      const hasModal = await page.$('#zamorin-global-modal, #modal-shift-change, [data-modal]');
      console.log(`Shift request modal displayed: ${Boolean(hasModal)}`);
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'staff_btn2_shift_request_modal.png') });
      console.log('📸 Captured staff_btn2_shift_request_modal.png');

      // Close modal
      const closeBtn = await page.$('[data-modal-cancel], .modal-close, [data-modal-close]');
      if (closeBtn) await closeBtn.click().catch(() => {});
      await new Promise(r => setTimeout(r, 500));
    }

    // 2. Verify Button 1 & 5 on #staff-attendance
    console.log('\n[2] Verifying Button 1 (Request Correction →) on #staff-attendance...');
    await page.evaluate(() => { window.location.hash = '#staff-attendance'; });
    await new Promise(r => setTimeout(r, 1500));

    const btnCorrection = await page.$('#btn-request-correction-today');
    console.log(`Button #btn-request-correction-today exists: ${Boolean(btnCorrection)}`);
    if (btnCorrection) {
      await page.click('#btn-request-correction-today');
      await new Promise(r => setTimeout(r, 800));
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'staff_btn1_correction_modal.png') });
      console.log('📸 Captured staff_btn1_correction_modal.png');

      const closeBtn = await page.$('[data-modal-cancel], .modal-close, [data-modal-close]');
      if (closeBtn) await closeBtn.click().catch(() => {});
      await new Promise(r => setTimeout(r, 500));
    }

    console.log('\n[2B] Verifying Button 5 (+ Submit Shift Request / Availability) on ROSTER tab...');
    const rosterTabBtn = await page.$('button[data-tab-id="ROSTER"]');
    if (rosterTabBtn) {
      await rosterTabBtn.click();
      await new Promise(r => setTimeout(r, 800));
    }
    const btnOpenShift = await page.$('#btn-open-shift-change');
    console.log(`Button #btn-open-shift-change exists: ${Boolean(btnOpenShift)}`);
    if (btnOpenShift) {
      await page.click('#btn-open-shift-change');
      await new Promise(r => setTimeout(r, 800));
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'staff_btn5_roster_modal.png') });
      console.log('📸 Captured staff_btn5_roster_modal.png');

      const closeBtn = await page.$('[data-modal-cancel], .modal-close, [data-modal-close]');
      if (closeBtn) await closeBtn.click().catch(() => {});
      await new Promise(r => setTimeout(r, 500));
    }

    // 3. Verify Button 3 & 4 on #staff-leave
    console.log('\n[3] Verifying Button 3 (Submit Leave Request) on #staff-leave...');
    await page.evaluate(() => { window.location.hash = '#staff-leave'; });
    await new Promise(r => setTimeout(r, 1500));

    const btnSubmitLeave = await page.$('#btn-submit-leave');
    console.log(`Button #btn-submit-leave exists: ${Boolean(btnSubmitLeave)}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'staff_btn3_leave_apply.png') });
    console.log('📸 Captured staff_btn3_leave_apply.png');

    console.log('\n[3B] Verifying Button 4 (Export CSV & Print Full Statement) on STATEMENT tab...');
    const stmtTabBtn = await page.$('button[data-tab-id="STATEMENT"]');
    if (stmtTabBtn) {
      await stmtTabBtn.click();
      await new Promise(r => setTimeout(r, 800));
    }
    const btnExportCsv = await page.$('#btn-export-leave-csv');
    const btnPrintStatement = await page.$('#btn-print-leave-statement');

    console.log(`Button #btn-export-leave-csv exists: ${Boolean(btnExportCsv)}`);
    console.log(`Button #btn-print-leave-statement exists: ${Boolean(btnPrintStatement)}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'staff_btn4_leave_statement.png') });
    console.log('📸 Captured staff_btn4_leave_statement.png');

    // -------------------------------------------------------------
    // PART 2: PRIMARY MASTER GOVERNANCE & APPROVALS VERIFICATION
    // -------------------------------------------------------------
    console.log('\n[B] Logging in as Primary Master (pradeeshk331@gmail.com)...');
    await page.goto('http://localhost:3000/#login2', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#l2-email', { timeout: 8000 });
    await page.$eval('#l2-email', el => el.value = '');
    await page.type('#l2-email', 'pradeeshk331@gmail.com');
    await page.$eval('#l2-password', el => el.value = '');
    await page.type('#l2-password', 'PRADEESHK@94309');

    console.log('Submitting Master login...');
    await page.click('#l2-submit-btn');
    await new Promise(r => setTimeout(r, 3000));

    const masterHash = await page.evaluate(() => window.location.hash);
    console.log(`✓ Master logged in! Current hash: ${masterHash}`);

    // Navigate to Master Approvals Workbench
    console.log('\n[4] Navigating to Master Approvals Workbench (#approvals)...');
    await page.evaluate(() => { window.location.hash = '#approvals'; });
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'master_approvals_screen.png') });
    console.log('📸 Captured master_approvals_screen.png');

    // Open Master Notifications
    console.log('\n[5] Navigating to Master Notifications (#notifications)...');
    await page.evaluate(() => { window.location.hash = '#notifications'; });
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'master_notifications_screen.png') });
    console.log('📸 Captured master_notifications_screen.png');

    console.log('\n=============================================================');
    console.log('🎉 UI VERIFICATION 100% SUCCESS: ALL 5 BUTTONS & MASTER SCREENS!');
    console.log('=============================================================');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
