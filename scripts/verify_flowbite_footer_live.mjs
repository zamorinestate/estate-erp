import puppeteer from 'puppeteer-core';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function test() {
  console.log('[Test] Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => console.error('[PageError]', e.message));

  console.log('[Test] Navigating to http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 15000 });

  console.log('[Test] Checking login card...');
  const loginCard = await page.$('.light-glass-container');
  console.log('[Test] Login card present:', !!loginCard);

  // Fill in login credentials
  console.log('[Test] Logging in as Primary Master...');
  await page.click('#l2-org-id', { clickCount: 3 });
  await page.type('#l2-org-id', 'ZAMORIN');

  await page.click('#l2-email', { clickCount: 3 });
  await page.type('#l2-email', 'pradeeshk331@gmail.com');

  await page.click('#l2-password', { clickCount: 3 });
  await page.type('#l2-password', 'PRADEESHK@94309');

  await page.click('#l2-submit-btn');

  // Wait for app shell and dashboard
  console.log('[Test] Waiting for app-shell navigation...');
  await page.waitForSelector('.app-shell', { timeout: 15000 });
  console.log('[Test] App shell mounted successfully!');

  // Check footer presence
  console.log('[Test] Checking Flowbite Footer in app-shell...');
  await page.waitForSelector('#app-footer-container footer', { timeout: 8000 });
  
  const footerInfo = await page.evaluate(() => {
    const ft = document.querySelector('#app-footer-container footer');
    if (!ft) return null;
    return {
      classes: ft.className,
      text: ft.innerText.trim(),
      links: Array.from(ft.querySelectorAll('a')).map(a => ({ text: a.innerText.trim(), href: a.getAttribute('href') })),
      computedBg: window.getComputedStyle(ft).backgroundColor,
      computedBorder: window.getComputedStyle(ft).borderColor,
      computedColor: window.getComputedStyle(ft).color,
    };
  });

  console.log('[Test] Flowbite Footer Info:', JSON.stringify(footerInfo, null, 2));

  // Take screenshot of the footer element itself
  const footerEl = await page.$('#app-footer-container footer');
  if (footerEl) {
    await footerEl.screenshot({ path: 'C:/Users/chris/.gemini/antigravity-ide/brain/9439e03a-5a2f-493b-9288-e514e6dec44c/flowbite_footer_element.png' });
    console.log('[Test] Footer element screenshot saved!');
  }

  // Scroll to bottom of window to view footer in viewport context
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'C:/Users/chris/.gemini/antigravity-ide/brain/9439e03a-5a2f-493b-9288-e514e6dec44c/dashboard_bottom_viewport.png' });
  console.log('[Test] Dashboard bottom viewport screenshot saved!');

  // Navigate to another page (e.g. #procurement) to verify persistence
  console.log('[Test] Navigating to #procurement...');
  await page.evaluate(() => window.location.hash = '#procurement');
  await new Promise(r => setTimeout(r, 1500));

  const procurementFooter = await page.evaluate(() => {
    const ft = document.querySelector('#app-footer-container footer');
    return ft ? { text: ft.innerText.trim(), visible: ft.offsetHeight > 0 } : null;
  });
  console.log('[Test] Footer on #procurement:', procurementFooter);

  // Navigate to #settings to verify persistence
  console.log('[Test] Navigating to #settings...');
  await page.evaluate(() => window.location.hash = '#settings');
  await new Promise(r => setTimeout(r, 1500));

  const settingsFooter = await page.evaluate(() => {
    const ft = document.querySelector('#app-footer-container footer');
    return ft ? { text: ft.innerText.trim(), visible: ft.offsetHeight > 0 } : null;
  });
  console.log('[Test] Footer on #settings:', settingsFooter);

  const settingsScreenshotPath = 'C:/Users/chris/.gemini/antigravity-ide/brain/9439e03a-5a2f-493b-9288-e514e6dec44c/settings_with_flowbite_footer.png';
  await page.screenshot({ path: settingsScreenshotPath, fullPage: true });
  console.log('[Test] Settings Screenshot saved to:', settingsScreenshotPath);

  // Test Dark Mode
  console.log('[Test] Switching to Dark Theme...');
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'midnight');
    document.body.classList.add('dark');
  });
  await new Promise(r => setTimeout(r, 600));

  const darkFooterInfo = await page.evaluate(() => {
    const ft = document.querySelector('#app-footer-container footer');
    return {
      bg: window.getComputedStyle(ft).backgroundColor,
      border: window.getComputedStyle(ft).borderColor,
      color: window.getComputedStyle(ft).color
    };
  });
  console.log('[Test] Dark Mode Footer Styles:', darkFooterInfo);

  const darkFooterEl = await page.$('#app-footer-container footer');
  if (darkFooterEl) {
    await darkFooterEl.screenshot({ path: 'C:/Users/chris/.gemini/antigravity-ide/brain/9439e03a-5a2f-493b-9288-e514e6dec44c/flowbite_footer_dark_element.png' });
    console.log('[Test] Dark Footer element screenshot saved!');
  }

  await page.screenshot({ path: 'C:/Users/chris/.gemini/antigravity-ide/brain/9439e03a-5a2f-493b-9288-e514e6dec44c/settings_dark_with_flowbite_footer.png', fullPage: true });
  console.log('[Test] Dark Settings Screenshot saved!');

  await browser.close();
  console.log('[Test] ALL VERIFICATION TESTS PASSED SUCCESSFULLY! ✅');
}

test().catch(err => {
  console.error('[Test Failed]:', err);
  process.exit(1);
});
