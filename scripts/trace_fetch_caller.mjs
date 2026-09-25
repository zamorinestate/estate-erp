import puppeteer from 'puppeteer-core';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  
  await page.evaluateOnNewDocument(() => {
    const origFetch = window.fetch;
    window.fetch = function(...args) {
      console.log('[WINDOW.FETCH CALL]:', args[0], new Error().stack);
      return origFetch.apply(this, args);
    };
    window.addEventListener('unhandledrejection', event => {
      console.log('[UNHANDLED REJECTION EVENT]:', event.reason?.message, event.reason?.stack);
    });
  });

  page.on('console', msg => console.log(msg.text()));
  page.on('pageerror', err => console.log('[PAGE ERROR]:', err.message));

  console.log('Navigating to http://localhost:3000/login...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));

  await browser.close();
}

run().catch(console.error);
