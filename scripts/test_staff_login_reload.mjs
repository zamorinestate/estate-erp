import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = process.env.E2E_ARTIFACTS_DIR || path.join(process.cwd(), 'artifacts', 'e2e');
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required; runtime test credentials must be supplied through the environment.`);
  return value;
}

const STAFF_EMAIL = requiredEnv('E2E_STAFF_EMAIL');
const STAFF_PASSWORD = requiredEnv('E2E_STAFF_PASSWORD');

async function run() {
  console.log('Testing staff login and page rendering...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,1000']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  page.on('console', msg => console.log(`[Browser ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.log(`[PageError]:`, err.message, err.stack));

  try {
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });

    console.log('Logging in with environment-supplied Staff credentials...');
    await page.waitForSelector('#l2-email', { timeout: 8000 });
    const orgInput = await page.$('#l2-org-id');
    if (orgInput) {
      await page.$eval('#l2-org-id', el => el.value = '');
      await page.type('#l2-org-id', 'ZAMORIN');
    }
    await page.$eval('#l2-email', el => el.value = '');
    await page.type('#l2-email', STAFF_EMAIL);
    await page.$eval('#l2-password', el => el.value = '');
    await page.type('#l2-password', STAFF_PASSWORD);

    await page.click('#l2-submit-btn');
    await new Promise(r => setTimeout(r, 3500));

    const hash = await page.evaluate(() => window.location.hash);
    console.log(`Current hash after staff login: ${hash}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'staff_post_login.png') });

    // Now test a page reload/refresh while logged in!
    console.log('Reloading page while logged in (page.reload())...');
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2500));

    const reloadHash = await page.evaluate(() => window.location.hash);
    const bodyBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    const appHtml = await page.evaluate(() => document.getElementById('app')?.innerHTML?.slice(0, 300));
    console.log(`Current hash after reload: ${reloadHash}`);
    console.log(`Body background: ${bodyBg}`);
    console.log(`App HTML: ${appHtml}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'staff_post_reload.png') });

  } finally {
    await browser.close();
  }
}

run().catch(console.error);
