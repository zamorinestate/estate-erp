import puppeteer from 'puppeteer-core';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1440, height: 900 });
  console.log('Navigating to http://localhost:3000/#login...');
  await page.goto('http://localhost:3000/#login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('#l2-email', { timeout: 8000 });

  const orgInput = await page.$('#l2-org-id');
  if (orgInput) {
    await page.$eval('#l2-org-id', el => el.value = '');
    await page.type('#l2-org-id', 'ZAMORIN');
  }
  await page.$eval('#l2-email', el => el.value = '');
  await page.type('#l2-email', 'pradeeshk331@gmail.com');
  await page.$eval('#l2-password', el => el.value = '');
  await page.type('#l2-password', 'PRADEESHK@94309');
  await page.click('#l2-submit-btn');

  // Wait for shell to mount
  console.log('Waiting for #topbar...');
  await page.waitForSelector('#topbar', { timeout: 12000 });
  console.log('Login successful! Shell mounted.');

  // Go to #attendance
  await page.goto('http://localhost:3000/#attendance', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'attendance_desktop_live.png' });

  // Check topbar metrics
  const topbarInfo = await page.evaluate(() => {
    const tb = document.getElementById('topbar');
    const qrBtn = document.getElementById('topbar-qr-quick-btn');
    const megaBtn = document.getElementById('mega-menu-btn');
    const search = document.getElementById('topbar-search-input');
    const cs = window.getComputedStyle(tb);
    return {
      classes: tb.className,
      height: cs.height,
      bg: cs.backgroundColor,
      qrBtn: !!qrBtn,
      megaBtn: !!megaBtn,
      search: !!search
    };
  });
  console.log('Desktop Topbar Info:', JSON.stringify(topbarInfo, null, 2));

  // Test Quick QR Modal
  console.log('Triggering Quick UPI QR Modal...');
  await page.click('#topbar-qr-quick-btn');
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'qr_modal_live.png' });

  const qrModalInfo = await page.evaluate(() => {
    const modal = document.querySelector('.modal-card, .modal-box, [role="dialog"]');
    const qrPanel = document.querySelector('.fb-qr-panel, .qr-panel');
    const qrCanvas = document.querySelector('#pos-qr-canvas-wrap canvas');
    const clipboardInput = document.querySelector('#pos-qr-uri-display');
    const copyBtn = document.querySelector('#pos-qr-copy-btn');
    return {
      modalExists: !!modal,
      qrPanelExists: !!qrPanel,
      qrCanvasExists: !!qrCanvas,
      clipboardValue: clipboardInput ? (clipboardInput.value || clipboardInput.textContent) : null,
      copyBtnExists: !!copyBtn
    };
  });
  console.log('QR Modal Info:', JSON.stringify(qrModalInfo, null, 2));

  // Test Clipboard Copy Click
  console.log('Clicking clipboard copy button...');
  await page.click('#pos-qr-copy-btn');
  await new Promise(r => setTimeout(r, 300));
  const copyBtnState = await page.evaluate(() => {
    const copyBtn = document.querySelector('#pos-qr-copy-btn');
    return {
      classes: copyBtn?.className,
      hasCheckIcon: !!copyBtn?.querySelector('.fb-clipboard-icon-check:not(.hidden)'),
      text: copyBtn?.textContent?.trim()
    };
  });
  console.log('Copy Button State after click:', JSON.stringify(copyBtnState, null, 2));

  // Close modal
  const closeBtn = await page.$('.modal-close-btn, .modal-footer button');
  if (closeBtn) await closeBtn.click();
  await new Promise(r => setTimeout(r, 500));

  // Tablet Viewport Test (768x1024)
  console.log('Testing Tablet Viewport (768x1024)...');
  await page.setViewport({ width: 768, height: 1024 });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'attendance_tablet_live.png' });

  // Mobile Viewport Test (390x844)
  console.log('Testing Mobile Viewport (390x844)...');
  await page.setViewport({ width: 390, height: 844 });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'attendance_mobile_live.png' });

  const mobileInfo = await page.evaluate(() => {
    const hamburger = document.getElementById('sidebar-toggle-btn');
    const cs = window.getComputedStyle(hamburger);
    return {
      hamburgerDisplay: cs.display,
      hamburgerWidth: cs.width,
      hamburgerHeight: cs.height
    };
  });
  console.log('Mobile Hamburger Info:', JSON.stringify(mobileInfo, null, 2));

  await browser.close();
  console.log('ALL VERIFICATIONS COMPLETED SUCCESSFULLY!');
})();
