import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = path.resolve('C:/Users/chris/.gemini/antigravity-ide/brain/8c2920d5-b21a-4786-8c0a-ce2bcaeb3bce');

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--user-data-dir=C:/Users/chris/.gemini/antigravity-ide/brain/8c2920d5-b21a-4786-8c0a-ce2bcaeb3bce/chrome_temp_profile']
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
