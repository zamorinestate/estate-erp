import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = process.env.E2E_ARTIFACTS_DIR || path.join(process.cwd(), 'artifacts', 'e2e');
const CHROME_PROFILE_DIR = process.env.E2E_CHROME_PROFILE_DIR || path.join(ARTIFACTS_DIR, 'chrome_temp_profile');
fs.mkdirSync(CHROME_PROFILE_DIR, { recursive: true });

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', `--user-data-dir=${CHROME_PROFILE_DIR}`]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });

  try {
    // 1. Direct register page capture
    await page.goto("http://localhost:3000/#login", { waitUntil: "networkidle0" });
    await page.waitForSelector("#l2-to-register-btn", { timeout: 8000 });
    await page.click("#l2-to-register-btn");
    await page.waitForSelector("#l2-reg-submit", { timeout: 4000 });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "register_page_theme.png") });
    console.log("Captured register_page_theme.png");

    // 2. Wallpaper rotations across 3 refreshes
    for (let i = 1; i <= 3; i++) {
      await page.goto("http://localhost:3000/#login", { waitUntil: "networkidle0" });
      await new Promise(r => setTimeout(r, 400));
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, `wallpaper_rotation_${i}.png`) });
      console.log(`Captured wallpaper_rotation_${i}.png`);
    }
  } catch (err) {
    console.error("Capture error:", err);
  } finally {
    await browser.close();
  }
}

run();
