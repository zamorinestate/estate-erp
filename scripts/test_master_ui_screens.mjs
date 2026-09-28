import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = process.env.E2E_ARTIFACTS_DIR || path.join(process.cwd(), 'artifacts', 'e2e');
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required; browser/integration credentials must be supplied through the environment.`);
  return value;
}

const PRIMARY_MASTER_EMAIL = requiredEnv('E2E_PRIMARY_MASTER_EMAIL');
const PRIMARY_MASTER_PASSWORD = requiredEnv('E2E_PRIMARY_MASTER_PASSWORD');

async function run() {
  console.log('Launching Chrome to test Master UI screens...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,1000']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  page.on('console', msg => {
    console.log('[Browser Console]:', msg.text());
  });

  try {
    // Clear all cookies and storage to ensure fresh session
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');

    console.log('Navigating to http://localhost:3000/#login2...');
    await page.goto('http://localhost:3000/#login2', { waitUntil: 'networkidle0', timeout: 15000 });

    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    console.log('Entering Primary Master credentials...');
    await page.waitForSelector('#l2-email', { timeout: 8000 });
    const orgInput = await page.$('#l2-org-id');
    if (orgInput) {
      await page.$eval('#l2-org-id', el => el.value = '');
      await page.type('#l2-org-id', 'ZAMORIN');
    }
    await page.$eval('#l2-email', el => el.value = '');
    await page.type('#l2-email', PRIMARY_MASTER_EMAIL);
    await page.$eval('#l2-password', el => el.value = '');
    await page.type('#l2-password', PRIMARY_MASTER_PASSWORD);

    console.log('Clicking login...');
    await page.click('#l2-submit-btn');
    await new Promise(r => setTimeout(r, 3500));

    const currentHash = await page.evaluate(() => window.location.hash);
    const currentUser = await page.evaluate(() => localStorage.getItem('zamorin_user'));
    console.log(`Current hash after login: ${currentHash}`);
    console.log(`Current user in storage: ${currentUser}`);

    // If still on login or not redirected, check why
    const errorEl = await page.$('#l2-login-error');
    if (errorEl) {
      const errText = await page.evaluate(el => el.textContent, errorEl);
      if (errText) console.log(`Login error banner: "${errText}"`);
    }

    // Navigate to Approvals
    console.log('\nNavigating to #approvals...');
    await page.evaluate(() => { window.location.hash = '#approvals'; });
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'master_approvals_screen.png') });
    console.log('📸 Captured master_approvals_screen.png');

    // Navigate to Notifications
    console.log('\nNavigating to #notifications...');
    await page.evaluate(() => { window.location.hash = '#notifications'; });
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'master_notifications_screen.png') });
    console.log('📸 Captured master_notifications_screen.png');

    console.log('✓ Master screens test completed successfully!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('Error running master screens test:', err);
  process.exit(1);
});
