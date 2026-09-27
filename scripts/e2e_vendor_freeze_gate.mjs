import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

// Load runtime secret configuration from local gitignored environment if present
function loadEnvFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {}
}

const backendEnvPath = process.env.VENDOR_E2E_ENV_PATH || path.resolve('Backend/.env');
loadEnvFile(backendEnvPath);

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3000";

const VENDOR_E2E_EMAIL = (process.env.VENDOR_E2E_EMAIL || 'vendor@malabarfresh.com').trim();
const VENDOR_E2E_PASSWORD = (process.env.VENDOR_E2E_PASSWORD || process.env.INITIAL_VENDOR_PASSWORD || '').trim();

// FAIL-CLOSED REQUIREMENT: Never silently substitute default, fallback, or hard-coded passwords
if (!VENDOR_E2E_PASSWORD) {
  console.error("Vendor E2E test credentials are not configured.");
  process.exit(1);
}

const PROTECTED_SENTINELS = [
  "RAW_ACCOUNT_NUMBER_TEST",
  "SECRET_IFSC_TEST",
  "SECRET_UPI_TEST",
  "INTERNAL_BANK_HISTORY_TEST",
  "INTERNAL_MANAGER_NOTE_TEST",
  "FRAUD_RISK_NOTE_TEST"
];

const VENDOR_ROUTES = [
  { id: 'vendor-dashboard', title: 'Vendor Overview' },
  { id: 'vendor-orders', title: 'Purchase Orders' },
  { id: 'vendor-deliveries', title: 'Deliveries & GRN' },
  { id: 'vendor-invoices', title: 'Invoices' },
  { id: 'vendor-payments', title: 'Payments & Balance' },
  { id: 'vendor-statement', title: 'Account Statement' },
  { id: 'vendor-receivables', title: 'Outstanding & Ageing' },
  { id: 'vendor-adjustments', title: 'Returns & Adjustments' },
  { id: 'vendor-products', title: 'Products & Pricing' },
  { id: 'vendor-documents', title: 'Documents Centre' },
  { id: 'vendor-reports', title: 'Commercial Reports' },
  { id: 'vendor-notifications', title: 'Notifications & Alerts' },
  { id: 'vendor-profile', title: 'Vendor Profile' },
];

async function run() {
  console.log("=== STARTING VENDOR FREEZE GATE E2E VERIFICATION ===");

  const consoleErrors = [];
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore benign favicon, SVG path warnings, and expected 401/403 auth check/denial logs
      if (!text.includes('favicon.ico') && !text.includes('attribute d') && !text.includes('Expected number') && !text.includes('status of 403') && !text.includes('status of 401')) {
        consoleErrors.push(text);
        console.error(`[Browser Console Error]:`, text);
      }
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    console.error(`[Browser Page Error]:`, err.message);
  });

  try {
    // -------------------------------------------------------------------------
    // STEP 1: AUTHENTICATED VENDOR LOGIN
    // -------------------------------------------------------------------------
    console.log("\n[STEP 1] Performing authenticated Vendor E2E login using securely supplied test credentials...");
    await page.goto(`${BASE_URL}/#login`, { waitUntil: "networkidle0", timeout: 15000 });

    // Ensure completely clean storage state
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      if (typeof window.zamorinMountAuthScreen === 'function') {
        window.zamorinMountAuthScreen('login');
      }
    });

    // Wait for login form to mount
    await page.waitForSelector("#l2-email", { timeout: 8000 });
    await page.waitForSelector("#l2-password", { timeout: 8000 });
    await page.waitForSelector("#l2-submit-btn", { timeout: 8000 });

    console.log(`Entering credentials for ${VENDOR_E2E_EMAIL}...`);
    await page.click("#l2-email", { clickCount: 3 });
    await page.type("#l2-email", VENDOR_E2E_EMAIL);
    await page.click("#l2-password", { clickCount: 3 });
    await page.type("#l2-password", VENDOR_E2E_PASSWORD);

    console.log("Submitting login form...");
    await page.click("#l2-submit-btn");

    // Wait for successful navigation to vendor-dashboard
    await page.waitForFunction(() => {
      return window.location.hash.includes("vendor-dashboard") || window.location.hash.includes("vendor");
    }, { timeout: 10000 });

    await new Promise(r => setTimeout(r, 1500));
    console.log(`✓ Authenticated! Current URL hash: ${await page.evaluate(() => window.location.hash)}`);

    // Verify session user
    const sessionUser = await page.evaluate(() => {
      const u = window.zamorinState?.user || JSON.parse(localStorage.getItem('zamorin_user') || '{}');
      return { role: u.role, vendorId: u.vendorId, email: u.email, name: u.name };
    });
    console.log("✓ Session User:", JSON.stringify({ role: sessionUser.role, vendorId: sessionUser.vendorId, email: sessionUser.email }));
    if (sessionUser.role !== 'VENDOR' && sessionUser.role !== 'vendor') {
      throw new Error(`Expected role VENDOR, got ${sessionUser.role}`);
    }

    // -------------------------------------------------------------------------
    // STEP 2: VENDOR PROFILE RENDERING & DATA VERIFICATION
    // -------------------------------------------------------------------------
    console.log("\n[STEP 2] Navigating to Vendor Profile (#vendor-profile)...");
    await page.evaluate(() => {
      if (typeof window.zamorinNavigate === 'function') {
        window.zamorinNavigate('vendor-profile');
      } else {
        window.location.hash = '#vendor-profile';
      }
    });

    await page.waitForSelector("#btn-download-profile-pdf", { timeout: 8000 });
    // Wait for dynamic profile data to load and replace skeleton
    await page.waitForSelector(".vendor-header", { timeout: 12000 });
    await new Promise(r => setTimeout(r, 600));

    console.log("Inspecting populated profile DOM contents...");
    const profileDetails = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasLegalName: /Malabar Fresh Dairy & Produce Ltd/i.test(text),
        hasTradeName: /Malabar Fresh/i.test(text),
        hasVendorId: text.includes("VEN-0001"),
        hasStatus: /active/i.test(text),
        hasGstin: text.includes("32AABCU9603R1ZM"),
        hasPan: text.includes("AABCU9603R"),
        hasFssai: text.includes("10019042000876"),
        hasContact: text.includes("K. Rajeev Nair"),
        hasSite: text.includes("Calicut Central Dairy Plant"),
        hasApprovedCafe: text.includes("Koramangala Main Branch") || text.includes("ZC-0001"),
        hasMaskedBank: text.includes("••••••••••1234"),
        hasBankName: text.includes("State Bank of India"),
        hasAccountStatus: /payment account (?:verified|on file)/i.test(text),
        hasComplianceScorecard: /regulatory compliance scorecard/i.test(text),
        hasPerformanceMetrics: /operational supply performance/i.test(text) || /otif/i.test(text),
        hasReadOnlyBadge: /read-only vendor access/i.test(text),
        // Absence of protected info:
        hasRawAccount: text.includes("98765432101234"),
        hasIfscLabel: />\s*IFSC\s*(?:Code)?\s*</i.test(document.body.innerHTML),
        hasIfscValue: text.includes("SBIN0012345"),
        hasUpiLabel: />\s*UPI\s*(?:ID)?\s*</i.test(document.body.innerHTML),
        hasCreditLimitLabel: /approved credit limit/i.test(text),
        hasInternalNotes: text.includes("INTERNAL:"),
      };
    });

    console.log("Profile Inspection Results:", JSON.stringify(profileDetails, null, 2));

    if (!profileDetails.hasLegalName) throw new Error("Missing Legal Name on Profile!");
    if (!profileDetails.hasVendorId) throw new Error("Missing Vendor ID on Profile!");
    if (!profileDetails.hasGstin) throw new Error("Missing GSTIN on Profile!");
    if (!profileDetails.hasPan) throw new Error("Missing PAN on Profile!");
    if (!profileDetails.hasFssai) throw new Error("Missing FSSAI on Profile!");
    if (!profileDetails.hasContact) throw new Error("Missing Contacts on Profile!");
    if (!profileDetails.hasSite) throw new Error("Missing Sites on Profile!");
    if (!profileDetails.hasApprovedCafe) throw new Error("Missing Approved Cafés on Profile!");
    if (!profileDetails.hasMaskedBank) throw new Error("Missing Masked Bank Account on Profile!");
    if (!profileDetails.hasAccountStatus) throw new Error("Missing Payment Account Status on Profile!");
    if (!profileDetails.hasComplianceScorecard) throw new Error("Missing Compliance Scorecard on Profile!");
    if (!profileDetails.hasPerformanceMetrics) throw new Error("Missing Performance Metrics on Profile!");
    if (!profileDetails.hasReadOnlyBadge) throw new Error("Missing Read-Only Badge on Profile!");

    // Security assertions
    if (profileDetails.hasRawAccount) throw new Error("SECURITY VIOLATION: Raw account number exposed in DOM!");
    if (profileDetails.hasIfscLabel) throw new Error("SECURITY VIOLATION: IFSC label rendered in DOM!");
    if (profileDetails.hasIfscValue) throw new Error("SECURITY VIOLATION: IFSC value rendered in DOM!");
    if (profileDetails.hasUpiLabel) throw new Error("SECURITY VIOLATION: UPI label rendered in DOM!");
    if (profileDetails.hasCreditLimitLabel) throw new Error("SECURITY VIOLATION: Credit limit rendered in DOM!");
    if (profileDetails.hasInternalNotes) throw new Error("SECURITY VIOLATION: Internal notes rendered in DOM!");

    console.log("✓ Profile screen successfully rendered all required fields with zero protected data leaks.");

    // -------------------------------------------------------------------------
    // STEP 3: PDF E2E DOWNLOAD & INTEGRITY VERIFICATION
    // -------------------------------------------------------------------------
    console.log("\n[STEP 3] Testing Profile PDF Download...");
    const pdfResult = await page.evaluate(async () => {
      const { getAccessToken } = await import('/src/js/apiClient.js');
      const token = getAccessToken();
      
      const res = await fetch("/api/v1/vendor/profile/pdf", {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      const contentType = res.headers.get("content-type");
      const contentDisposition = res.headers.get("content-disposition");
      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const text = new TextDecoder("latin1").decode(bytes);

      return {
        status: res.status,
        ok: res.ok,
        contentType,
        contentDisposition,
        byteLength: bytes.length,
        isPdf: text.startsWith("%PDF"),
        hasVendorId: text.includes("VEN-0001"),
        hasVendorName: text.includes("Malabar Fresh"),
        hasPaymentTerms: text.includes("Payment Terms:"),
        // Absence of protected data
        hasRawAccount: text.includes("98765432101234"),
        hasIfsc: text.includes("SBIN0012345") || text.includes("IFSC"),
        hasCreditLimit: text.includes("Credit Limit"),
        hasInternalNotes: text.includes("INTERNAL:"),
        hasInternalUserId: text.includes("MU-0001"),
      };
    });

    console.log("PDF Download & Inspection Results:", JSON.stringify(pdfResult, null, 2));

    if (pdfResult.status !== 200) throw new Error(`PDF download failed with status ${pdfResult.status}`);
    if (!pdfResult.contentType?.includes("application/pdf")) throw new Error(`Invalid PDF content-type: ${pdfResult.contentType}`);
    if (!pdfResult.isPdf) throw new Error("Downloaded file does not have valid %PDF magic bytes!");
    if (!pdfResult.hasVendorId) throw new Error("PDF missing Vendor ID!");
    if (!pdfResult.hasVendorName) throw new Error("PDF missing Vendor Name!");
    if (pdfResult.hasRawAccount) throw new Error("SECURITY VIOLATION: Raw account number in PDF!");
    if (pdfResult.hasIfsc) throw new Error("SECURITY VIOLATION: IFSC in PDF!");
    if (pdfResult.hasCreditLimit) throw new Error("SECURITY VIOLATION: Credit Limit in PDF!");
    if (pdfResult.hasInternalNotes) throw new Error("SECURITY VIOLATION: Internal notes in PDF!");
    if (pdfResult.hasInternalUserId) throw new Error("SECURITY VIOLATION: Internal user ID in PDF!");

    console.log("✓ Profile PDF verified: Valid vector PDF generated, correctly scoped, strictly redacted.");

    // -------------------------------------------------------------------------
    // STEP 4: CROSS-VENDOR PROFILE ACCESS TEST (IDOR / BOLA)
    // -------------------------------------------------------------------------
    console.log("\n[STEP 4] Executing Cross-Vendor IDOR & BOLA Tampering Tests...");
    const crossVendorResults = await page.evaluate(async () => {
      const { getAccessToken } = await import('/src/js/apiClient.js');
      const token = getAccessToken() || "";
      const headers = { Authorization: `Bearer ${token}` };

      // 1. Query parameter tampering on Profile
      const r1 = await fetch("/api/v1/vendor/profile?vendorId=VEN-0002", { headers });
      const j1 = await r1.json().catch(() => ({}));

      // 2. Custom header tampering on Profile
      const r2 = await fetch("/api/v1/vendor/profile", {
        headers: { ...headers, "x-vendor-id": "VEN-0002" }
      });
      const j2 = await r2.json().catch(() => ({}));

      // 3. Query parameter tampering on PDF
      const r3 = await fetch("/api/v1/vendor/profile/pdf?vendorId=VEN-0002", { headers });
      const j3 = await r3.json().catch(() => ({}));

      // 4. Custom header tampering on PDF
      const r4 = await fetch("/api/v1/vendor/profile/pdf", {
        headers: { ...headers, "x-vendor-id": "VEN-0002" }
      });
      const j4 = await r4.json().catch(() => ({}));

      return {
        queryProfileStatus: r1.status,
        queryProfileCode: j1?.error?.code,
        headerProfileStatus: r2.status,
        headerProfileCode: j2?.error?.code,
        queryPdfStatus: r3.status,
        queryPdfCode: j3?.error?.code,
        headerPdfStatus: r4.status,
        headerPdfCode: j4?.error?.code,
      };
    });

    console.log("Cross-Vendor Tampering Results:", JSON.stringify(crossVendorResults, null, 2));

    if (crossVendorResults.queryProfileStatus !== 403 || crossVendorResults.queryProfileCode !== "CROSS_VENDOR_ACCESS_DENIED") {
      throw new Error(`Expected 403 CROSS_VENDOR_ACCESS_DENIED for query tampering, got ${crossVendorResults.queryProfileStatus}`);
    }
    if (crossVendorResults.headerProfileStatus !== 403 || crossVendorResults.headerProfileCode !== "CROSS_VENDOR_ACCESS_DENIED") {
      throw new Error(`Expected 403 CROSS_VENDOR_ACCESS_DENIED for header tampering, got ${crossVendorResults.headerProfileStatus}`);
    }
    if (crossVendorResults.queryPdfStatus !== 403 || crossVendorResults.queryPdfCode !== "CROSS_VENDOR_ACCESS_DENIED") {
      throw new Error(`Expected 403 CROSS_VENDOR_ACCESS_DENIED for PDF query tampering, got ${crossVendorResults.queryPdfStatus}`);
    }
    if (crossVendorResults.headerPdfStatus !== 403 || crossVendorResults.headerPdfCode !== "CROSS_VENDOR_ACCESS_DENIED") {
      throw new Error(`Expected 403 CROSS_VENDOR_ACCESS_DENIED for PDF header tampering, got ${crossVendorResults.headerPdfStatus}`);
    }

    console.log("✓ Cross-Vendor IDOR prevention verified: All tampering attempts strictly denied with 403.");

    // -------------------------------------------------------------------------
    // STEP 5: FRONTEND DOM SECURITY TEST (PROTECTED SENTINELS)
    // -------------------------------------------------------------------------
    console.log("\n[STEP 5] Testing DOM Security Against Protected Sentinels...");
    const domLeakageCheck = await page.evaluate((sentinels) => {
      const fullHtml = document.documentElement.outerHTML;
      const fullText = document.body.innerText;
      
      const foundInHtml = [];
      const foundInText = [];
      const foundInAttrs = [];

      for (const sentinel of sentinels) {
        if (fullHtml.includes(sentinel)) foundInHtml.push(sentinel);
        if (fullText.includes(sentinel)) foundInText.push(sentinel);
      }

      // Check all element attributes, data-* attributes, aria-labels, and tooltips
      const allEls = document.querySelectorAll("*");
      for (const el of allEls) {
        for (const attr of el.getAttributeNames()) {
          const val = el.getAttribute(attr) || "";
          for (const sentinel of sentinels) {
            if (val.includes(sentinel)) {
              foundInAttrs.push({ tag: el.tagName, attr, sentinel });
            }
          }
        }
      }

      return {
        foundInHtml,
        foundInText,
        foundInAttrs,
      };
    }, PROTECTED_SENTINELS);

    console.log("DOM Sentinel Leakage Check:", JSON.stringify(domLeakageCheck, null, 2));

    if (domLeakageCheck.foundInHtml.length > 0 || domLeakageCheck.foundInText.length > 0 || domLeakageCheck.foundInAttrs.length > 0) {
      throw new Error(`SECURITY VIOLATION: Sentinels leaked in DOM! Details: ${JSON.stringify(domLeakageCheck)}`);
    }

    console.log("✓ DOM Security Verified: Zero protected properties present in HTML, text, attributes, or tooltips.");

    // -------------------------------------------------------------------------
    // STEP 6: FINAL BROWSER WALKTHROUGH (ALL 13 VENDOR SCREENS)
    // -------------------------------------------------------------------------
    console.log("\n[STEP 6] Executing Final Browser Walkthrough Across All 13 Vendor Screens...");
    
    for (const route of VENDOR_ROUTES) {
      process.stdout.write(`Testing #${route.id} (${route.title})... `);
      const errorsBefore = consoleErrors.length;

      await page.evaluate((rId) => {
        if (typeof window.zamorinNavigate === 'function') {
          window.zamorinNavigate(rId);
        } else {
          window.location.hash = '#' + rId;
        }
      }, route.id);

      await new Promise(r => setTimeout(r, 600));

      // Assert screen loaded
      const screenInfo = await page.evaluate((rId) => {
        const hash = window.location.hash;
        const main = document.querySelector("#main-content") || document.querySelector("#app");
        const text = main ? main.innerText : "";
        const isBlocked = text.includes("Access Restricted") || text.includes("Access Denied") || hash.includes("__blocked__");
        
        // Check for disallowed mutation controls
        const writeButtons = Array.from(document.querySelectorAll("button, a.btn, input[type=submit]")).filter(b => {
          const t = (b.innerText || b.value || "").trim().toLowerCase();
          return t === "create" || t === "new" || t === "add" || t === "edit" || t === "delete" || t === "save";
        }).map(b => b.innerText);

        return {
          currentHash: hash,
          hasContent: text.length > 50,
          isBlocked,
          writeButtons,
        };
      }, route.id);

      const newErrors = consoleErrors.slice(errorsBefore);

      if (screenInfo.isBlocked) {
        throw new Error(`Screen #${route.id} was blocked for vendor!`);
      }
      if (!screenInfo.hasContent) {
        throw new Error(`Screen #${route.id} rendered empty content!`);
      }
      if (screenInfo.writeButtons.length > 0) {
        throw new Error(`Screen #${route.id} contains prohibited write buttons: ${screenInfo.writeButtons.join(", ")}`);
      }
      if (newErrors.length > 0) {
        throw new Error(`Console errors detected on #${route.id}: ${newErrors.join("; ")}`);
      }

      console.log(`✓ OK (Loaded, read-only verified, 0 errors)`);
    }

    console.log("\n✓ All 13 Vendor Screens successfully walked with ZERO console errors and zero write controls!");

    // Check final console error count
    console.log(`\nFinal Console Errors Count: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      throw new Error(`Found ${consoleErrors.length} console errors during verification!`);
    }

    console.log("\n========================================================");
    console.log("✓ ALL FREEZE GATE CRITERIA SATISFIED");
    console.log("========================================================");

  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error("\n✖ E2E VERIFICATION FAILED:", err);
  process.exit(1);
});
