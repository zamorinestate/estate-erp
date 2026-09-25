import puppeteer from 'puppeteer-core';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log(`[Console ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.log(`[PageError]:`, err.message, err.stack));
  page.on('requestfailed', req => console.log(`[RequestFailed]:`, req.url(), req.failure()?.errorText));

  await page.evaluateOnNewDocument(() => {
    window.addEventListener('unhandledrejection', event => {
      console.log('UNHANDLED REJECTION:', event.reason?.message, event.reason?.stack);
    });
  });

  try {
    console.log('Navigating to http://localhost:3000/login...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0', timeout: 15000 });
    const bodyBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    const appHtml = await page.evaluate(() => document.getElementById('app')?.innerHTML?.slice(0, 200));
    console.log('Body background:', bodyBg);
    console.log('#app content preview:', appHtml);
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
