import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:/Users/chris/.gemini/antigravity-ide/brain/37f87a1c-e54e-4418-93b2-8f9b926d30cd";

async function run() {
  console.log('Testing login page banner fix with clean session...');
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
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');

    console.log('1. Navigating to http://localhost:3000/login...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0', timeout: 15000 });

    // Wait 3 seconds to ensure all silent background probes complete
    await new Promise(r => setTimeout(r, 3000));

    // Check if notice banner or error banner is present
    const noticeEl = await page.$('.l2-notice-banner');
    const noticeText = noticeEl ? await page.evaluate(el => el.textContent.trim(), noticeEl) : null;

    const errorEl = await page.$('#l2-login-error');
    const errorDisplay = errorEl ? await page.evaluate(el => window.getComputedStyle(el).display, errorEl) : null;
    const errorText = errorEl ? await page.evaluate(el => el.textContent.trim(), errorEl) : null;

    console.log(`Notice banner visible: ${Boolean(noticeText)} (Text: "${noticeText || ''}")`);
    console.log(`Error banner visible: ${errorDisplay !== 'none' && Boolean(errorText)} (Text: "${errorText || ''}", display: ${errorDisplay})`);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'login_clean_state.png') });
    console.log('📸 Captured login_clean_state.png');

    // 2. Test Logging in with Master credentials (leaving Org ID blank to test the default fallback)
    console.log('\n2. Testing login with Primary Master credentials...');
    await page.waitForSelector('#l2-email', { timeout: 8000 });
    await page.$eval('#l2-email', el => el.value = '');
    await page.type('#l2-email', 'pradeeshk331@gmail.com');
    await page.$eval('#l2-password', el => el.value = '');
    await page.type('#l2-password', 'PRADEESHK@94309');

    console.log('Clicking login...');
    await page.click('#l2-submit-btn');
    await new Promise(r => setTimeout(r, 3500));

    const currentHash = await page.evaluate(() => window.location.hash);
    console.log(`Current hash after login: ${currentHash}`);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'master_dashboard_post_login.png') });
    console.log('📸 Captured master_dashboard_post_login.png');

    if (noticeText || (errorDisplay !== 'none' && errorText)) {
      console.error('❌ FAILED: Spurious banner still present on initial load!');
      process.exit(1);
    }

    if (currentHash !== '#dashboard') {
      console.error(`❌ FAILED: Login did not redirect to #dashboard! Current hash: ${currentHash}`);
      process.exit(1);
    }

    console.log('\n🎉 SUCCESS: Both issues are completely resolved!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('Error running test:', err);
  process.exit(1);
});
