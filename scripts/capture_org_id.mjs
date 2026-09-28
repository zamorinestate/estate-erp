import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = process.env.E2E_ARTIFACTS_DIR || path.join(process.cwd(), 'artifacts', 'e2e');
const CHROME_PROFILE_DIR = process.env.E2E_CHROME_PROFILE_DIR || path.join(ARTIFACTS_DIR, 'chrome_temp_profile');
fs.mkdirSync(CHROME_PROFILE_DIR, { recursive: true });
const ARTIFACT_PATH = path.join(ARTIFACTS_DIR, 'login_with_organisation_id.png');

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', `--user-data-dir=${CHROME_PROFILE_DIR}`]
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
