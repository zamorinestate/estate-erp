import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:/Users/chris/.gemini/antigravity-ide/brain/37f87a1c-e54e-4418-93b2-8f9b926d30cd";

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

    console.log('Logging in with valid Staff credentials...');
    await page.waitForSelector('#l2-email', { timeout: 8000 });
    const orgInput = await page.$('#l2-org-id');
    if (orgInput) {
      await page.$eval('#l2-org-id', el => el.value = '');
      await page.type('#l2-org-id', 'ZAMORIN');
    }
    await page.$eval('#l2-email', el => el.value = '');
    await page.type('#l2-email', 'zamorinestatepvtltd.erp@gmail.com');
    await page.$eval('#l2-password', el => el.value = '');
    await page.type('#l2-password', 'Password@123');

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
