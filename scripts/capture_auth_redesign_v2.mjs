import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = path.resolve('C:/Users/chris/.gemini/antigravity-ide/brain/8c2920d5-b21a-4786-8c0a-ce2bcaeb3bce');

async function run() {
  console.log("Launching Chrome for complete screenshot verification...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--user-data-dir=C:/Users/chris/.gemini/antigravity-ide/brain/8c2920d5-b21a-4786-8c0a-ce2bcaeb3bce/chrome_temp_profile']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });

  try {
    // 1. Capture Main Login Screen
    await page.goto("http://localhost:3000/#login", { waitUntil: "networkidle0" });
    await page.waitForSelector("#l2-submit-btn", { timeout: 8000 });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "login_redesigned_theme.png") });

    // 2. Click "Forgot Password?" to open Confirmation Modal
    await page.click("#l2-forgot-pwd-btn");
    await page.waitForSelector("#l2-reset-confirm-modal:not(.hidden)", { timeout: 3000 });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "modal_aligned_buttons.png") });

    const modalBox = await page.$(".l2-confirm-modal-box");
    if (modalBox) {
      await modalBox.screenshot({ path: path.join(ARTIFACTS_DIR, "modal_aligned_buttons_closeup.png") });
    }

    // 3. Click Proceed in Modal to go to Forgot Password email screen
    await page.click("#l2-reset-modal-proceed");
    await page.waitForSelector("#l2-reset-req-submit", { timeout: 4000 });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "forgot_password_theme.png") });

    // 4. Submit email to enter PIN verification screen
    await page.type("#l2-reset-email", "pradeeshk331@gmail.com");
    await page.click("#l2-reset-req-submit");
    await page.waitForSelector(".l2-pin-box", { timeout: 6000 });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "enter_pin_bronze_timer.png") });

    // 5. Test Register page
    await page.goto("http://localhost:3000/#login", { waitUntil: "networkidle0" });
    await page.waitForSelector("#l2-to-register-btn", { timeout: 4000 });
    await page.click("#l2-to-register-btn");
    await page.waitForSelector("#l2-reg-submit", { timeout: 4000 });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "register_page_theme.png") });

    // 6. Test wallpaper rotation on multiple refreshes
    await page.goto("http://localhost:3000/#login", { waitUntil: "networkidle0" });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "wallpaper_rotation_1.png") });

    await page.reload({ waitUntil: "networkidle0" });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "wallpaper_rotation_2.png") });

    await page.reload({ waitUntil: "networkidle0" });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "wallpaper_rotation_3.png") });

    console.log("All screenshots captured successfully!");
  } catch (err) {
    console.error("Error during capture:", err);
  } finally {
    await browser.close();
  }
}

run();
