import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:/Users/chris/.gemini/antigravity-ide/brain/ff6054b5-2d4d-407e-a4d8-dc7e5ce32d2b";

async function run() {
  console.log("Launching Chrome with puppeteer-core...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[Browser Console Error]:`, msg.text());
  });

  try {
    // 1. Load Master view
    console.log("Navigating to http://localhost:3000/?role=master#vendors...");
    await page.goto("http://localhost:3000/?role=master#vendors", { waitUntil: "networkidle0", timeout: 15000 });
    await page.waitForSelector("#vnd-tab-content", { timeout: 8000 });
    await new Promise(r => setTimeout(r, 1500)); // wait for api fetch and updateContainer

    // Verify 8 Hub Tiles
    const tilesCount = await page.$$eval("[data-vnd-hub-tile]", els => els.length);
    console.log(`Found ${tilesCount} Hub Tiles in DOM.`);
    if (tilesCount !== 8) throw new Error(`Expected 8 Hub tiles, found ${tilesCount}`);

    // Verify Master Onboard button exists
    const hasOnboardBtn = await page.$eval("#add-vendor-btn", el => !!el).catch(() => false);
    console.log(`+ Onboard Supplier button present: ${hasOnboardBtn}`);
    if (!hasOnboardBtn) throw new Error("Onboard button missing for Master!");

    // 2. Click "+ Onboard Supplier"
    console.log("Clicking '+ Onboard Supplier' button...");
    await page.click("#add-vendor-btn");
    await page.waitForSelector("#zamorin-global-modal", { timeout: 5000 });
    await page.waitForSelector("#vnd-onboard-form", { timeout: 5000 });
    
    // Verify inputs inside modal
    const hasNameInput = await page.$eval("#new-vnd-name", el => el.tagName === "INPUT");
    const hasCatSelect = await page.$eval("#new-vnd-cat", el => el.tagName === "SELECT");
    const hasGstInput = await page.$eval("#new-vnd-gst", el => el.tagName === "INPUT");
    console.log(`Modal verification: nameInput=${hasNameInput}, catSelect=${hasCatSelect}, gstInput=${hasGstInput}`);
    if (!hasNameInput || !hasCatSelect) throw new Error("Form fields missing in Onboard Supplier modal!");

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "supplier_onboard_modal_fixed.png") });
    console.log("Saved screenshot: supplier_onboard_modal_fixed.png");

    // Close modal
    await page.click("[data-modal-cancel]");
    await new Promise(r => setTimeout(r, 400));

    // 3. Click "+ Place Order with Vendor"
    console.log("Clicking '+ Place Order with Vendor' button...");
    await page.click("#vnd-place-new-order-btn");
    await page.waitForSelector("#zamorin-global-modal", { timeout: 5000 });
    const orderModalText = await page.$eval("#zamorin-global-modal", el => el.innerText);
    console.log("Order modal opened. Contains 'Place Order' or 'Vendor':", orderModalText.includes("Vendor") || orderModalText.includes("Order"));

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "place_order_modal_verified.png") });
    console.log("Saved screenshot: place_order_modal_verified.png");

    // Close order modal
    const closeBtn = await page.$("#modal-order-cancel") || await page.$("[data-modal-cancel]");
    if (closeBtn) await closeBtn.click();
    else await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.getElementById("zamorin-global-modal"), { timeout: 3000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 400));

    // 4. Test Hub Tile Click
    console.log("Testing Hub tile navigation (ORDER_TRACKING)...");
    await page.click('[data-vnd-hub-tile="ORDER_TRACKING"]');
    await new Promise(r => setTimeout(r, 800));

    const currentHash = await page.evaluate(() => window.location.hash);
    console.log("Current hash after clicking tile:", currentHash);
    if (!currentHash.includes("order-tracking")) throw new Error(`Expected hash to include order-tracking, got ${currentHash}`);

    // Test Back button
    await page.waitForSelector("#vnd-back-to-hub-btn", { timeout: 5000 });
    console.log("Clicking '← Back to Suppliers Hub' button...");
    await page.click("#vnd-back-to-hub-btn");
    await new Promise(r => setTimeout(r, 800));

    const hashAfterBack = await page.evaluate(() => window.location.hash);
    console.log("Current hash after Back button:", hashAfterBack);
    if (hashAfterBack !== "#vendors") throw new Error(`Expected hash #vendors, got ${hashAfterBack}`);

    // 5. Test Cafe Admin role
    console.log("Navigating to http://localhost:3000/?role=cafe_admin#vendors...");
    await page.goto("http://localhost:3000/?role=cafe_admin#vendors", { waitUntil: "networkidle0", timeout: 15000 });
    await page.waitForSelector("#vnd-tab-content", { timeout: 8000 });
    await new Promise(r => setTimeout(r, 1200));

    // As Cafe Admin, click "+ Place Order with Vendor"
    console.log("Testing '+ Place Order with Vendor' as Cafe Admin...");
    await page.click("#vnd-place-new-order-btn");
    await page.waitForSelector("#zamorin-global-modal", { timeout: 5000 });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "cafe_admin_place_order_modal.png") });
    console.log("Saved screenshot: cafe_admin_place_order_modal.png");

    // Close modal
    await page.keyboard.press("Escape");
    await new Promise(r => setTimeout(r, 400));

    // Test quick order button on table
    const quickOrderBtn = await page.$(".vnd-quick-order-btn");
    if (quickOrderBtn) {
      console.log("Testing quick 'Order' button on supplier row...");
      await quickOrderBtn.click();
      await page.waitForSelector("#zamorin-global-modal", { timeout: 5000 });
      console.log("Quick order button opened modal successfully!");
      await page.keyboard.press("Escape");
    }

    console.log("\n==========================================");
    console.log("ALL VENDORS & MODAL VERIFICATIONS PASSED!");
    console.log("==========================================");
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
