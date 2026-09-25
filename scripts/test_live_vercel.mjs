import puppeteer from 'puppeteer-core';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function test() {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push('[console] ' + m.type() + ': ' + m.text()));
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
  page.on('requestfailed', r => logs.push('[failed] ' + r.url() + ' - ' + (r.failure()?.errorText || 'unknown')));

  const start = Date.now();
  console.log('Navigating to https://zamorin-cafe-erp.vercel.app ...');
  const res = await page.goto('https://zamorin-cafe-erp.vercel.app', { waitUntil: 'networkidle2', timeout: 30000 });
  const duration = Date.now() - start;
  console.log('Loaded status:', res.status(), 'in', duration, 'ms');
  console.log('Title:', await page.title());
  console.log('Logs:', logs);
  const card = await page.$('.light-glass-container');
  console.log('Login card rendered:', !!card);
  const bg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
  console.log('Body bg:', bg);
  await page.screenshot({ path: 'C:/Users/chris/.gemini/antigravity-ide/brain/cedd1918-3cd9-4d7d-8bda-d4aa3c824eb9/live_vercel_load.png' });
  await browser.close();
}

test().catch(console.error);
