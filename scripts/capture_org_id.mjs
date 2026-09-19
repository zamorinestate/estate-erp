import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_PATH = "C:/Users/chris/.gemini/antigravity-ide/brain/8c2920d5-b21a-4786-8c0a-ce2bcaeb3bce/login_with_organisation_id.png";

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--user-data-dir=C:/Users/chris/.gemini/antigravity-ide/brain/8c2920d5-b21a-4786-8c0a-ce2bcaeb3bce/chrome_temp_profile']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  await page.goto('http://localhost:3000/#login', { waitUntil: 'networkidle0' });
  await page.waitForSelector('#l2-org-id', { timeout: 8000 });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: ARTIFACT_PATH });
  await browser.close();
  console.log('Successfully captured login_with_organisation_id.png');
}

run();
