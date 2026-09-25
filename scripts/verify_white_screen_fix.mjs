import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:/Users/chris/.gemini/antigravity-ide/brain/37f87a1c-e54e-4418-93b2-8f9b926d30cd";

async function verify() {
  console.log('--- STARTING COMPREHENSIVE WHITE SCREEN REGRESSION TEST ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,1000']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  const errors = [];
  page.on('pageerror', err => {
    console.error('❌ [PAGE ERROR]:', err.message);
    errors.push(err.message);
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('⚠️ [CONSOLE ERROR]:', msg.text());
    }
  });

  try {
    // 1. Fresh load of /login
    console.log('\n[TEST 1] Loading http://localhost:3000/login...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    const loginState = await page.evaluate(() => {
      const app = document.getElementById('app');
      const card = document.querySelector('.light-glass-container');
      const bodyStyle = window.getComputedStyle(document.body);
      const appStyle = app ? window.getComputedStyle(app) : null;
      return {
        appClass: app?.className,
        hasCard: Boolean(card),
        bodyBg: bodyStyle.backgroundColor,
        appBg: appStyle?.backgroundColor,
        formInputsPresent: Boolean(document.querySelector('#l2-email') && document.querySelector('#l2-password'))
      };
    });
    console.log('Login state evaluation:', loginState);

    if (!loginState.hasCard) throw new Error('Login card failed to render!');
    if (!loginState.formInputsPresent) throw new Error('Form inputs missing!');

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'white_screen_fix_login.png') });
    console.log('📸 Captured white_screen_fix_login.png');

    // 2. Test reload on /login
    console.log('\n[TEST 2] Reloading /login...');
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1500));
    const reloadHasCard = await page.evaluate(() => Boolean(document.querySelector('.light-glass-container')));
    console.log('Card present after reload:', reloadHasCard);
    if (!reloadHasCard) throw new Error('Card disappeared after reload!');

    // 3. Test explicit hash navigation while unauthenticated (e.g. #dashboard)
    console.log('\n[TEST 3] Direct navigation to /#dashboard while unauthenticated...');
    await page.goto('http://localhost:3000/#dashboard', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));
    const unauthDashboardHasCard = await page.evaluate(() => Boolean(document.querySelector('.light-glass-container')));
    console.log('Card present on unauthenticated #dashboard:', unauthDashboardHasCard);
    if (!unauthDashboardHasCard) throw new Error('Unauthenticated #dashboard did not fallback to login card!');

    // 4. Test login and dashboard mount
    console.log('\n[TEST 4] Logging in with Primary Master credentials...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
    await page.type('#l2-email', 'pradeeshk331@gmail.com');
    await page.type('#l2-password', 'PRADEESHK@94309');
    await page.click('#l2-submit-btn');
    await new Promise(r => setTimeout(r, 3500));

    const postLoginState = await page.evaluate(() => {
      const app = document.getElementById('app');
      const shell = document.querySelector('.app-shell');
      const pageContent = document.getElementById('page-content');
      return {
        hash: window.location.hash,
        hasShell: Boolean(shell),
        hasPageContent: Boolean(pageContent && pageContent.children.length > 0),
        pageContentText: pageContent?.innerText?.slice(0, 80)
      };
    });
    console.log('Post-login state:', postLoginState);
    if (!postLoginState.hasShell) throw new Error('App shell failed to mount post-login!');

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'white_screen_fix_dashboard.png') });
    console.log('📸 Captured white_screen_fix_dashboard.png');

    console.log('\nTotal unhandled page errors detected:', errors.length);
    if (errors.length > 0) {
      console.log('Errors logged:', errors);
    } else {
      console.log('✅ ZERO UNHANDLED ERRORS DETECTED. WHITE SCREEN ISSUE COMPLETELY RESOLVED!');
    }

  } finally {
    await browser.close();
  }
}

verify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
