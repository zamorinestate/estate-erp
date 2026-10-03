import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, "../frontend");
const PORT = Number(process.env.APPLE_AUDIT_PORT || 3524);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const parsed = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
        let pathname = decodeURIComponent(parsed.pathname);

        if (pathname.startsWith("/api/")) {
          res.writeHead(503, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify({ success: false, message: "API mocked for UI audit" }));
          return;
        }

        if (pathname === "/") pathname = "/index.html";

        let filePath = path.join(FRONTEND_DIR, pathname);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, "index.html");
        }

        if (!fs.existsSync(filePath)) {
          const ext = path.extname(pathname);
          if (ext) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Not Found");
            return;
          }
          filePath = path.join(FRONTEND_DIR, "index.html");
        }

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        });
        fs.createReadStream(filePath).pipe(res);
      } catch (error) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(error.message);
      }
    });

    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

const VIEWPORTS = [
  // Mobile
  { label: "Mobile-320", width: 320, height: 568, isMobile: true },
  { label: "Mobile-375", width: 375, height: 667, isMobile: true },
  { label: "Mobile-390", width: 390, height: 844, isMobile: true },
  { label: "Mobile-430", width: 430, height: 932, isMobile: true },
  // Tablet
  { label: "Tablet-768", width: 768, height: 1024, isMobile: false },
  { label: "Tablet-820", width: 820, height: 1180, isMobile: false },
  { label: "Tablet-1024", width: 1024, height: 768, isMobile: false },
  // Desktop
  { label: "Desktop-1280", width: 1280, height: 800, isMobile: false },
  { label: "Desktop-1440", width: 1440, height: 900, isMobile: false },
  { label: "Desktop-1920", width: 1920, height: 1080, isMobile: false },
];

const SCREENS = [
  { id: 1, name: "Authentication / Login", role: null, url: "/#login2", isAuth: true },
  { id: 2, name: "Global Shell", role: "master", url: "/?role=master#dashboard" },
  { id: 3, name: "Primary Master Dashboard", role: "master", url: "/?role=master#dashboard" },
  { id: 4, name: "Owner Dashboard", role: "owner", url: "/?role=owner#dashboard" },
  { id: 5, name: "Cafe Operations Portal", role: "cafe_admin", url: "/cafe-operations/cafe-operations.html", isStandalone: true },
  { id: 6, name: "POS & Billing", role: "cafe_admin", url: "/?role=cafe_admin#pos" },
  { id: 7, name: "Inventory", role: "master", url: "/?role=master#inventory" },
  { id: 8, name: "Procurement", role: "master", url: "/?role=master#procurement" },
  { id: 9, name: "Finance & Accounts", role: "master", url: "/?role=master#finance" },
  { id: 10, name: "Reports & Analytics", role: "master", url: "/?role=master#reports" },
  { id: 11, name: "Employee / Staff Home", role: "staff", url: "/?role=staff#staff-home" },
  { id: 12, name: "Attendance & Shifts", role: "master", url: "/?role=master#attendance" },
  { id: 13, name: "Shared Modules: Tasks & Approvals", role: "master", url: "/?role=master#tasks" },
  { id: 14, name: "Modals (System Alert/Dialog)", role: "master", url: "/?role=master#dashboard", testModal: true },
  { id: 15, name: "Tables (Vendors)", role: "master", url: "/?role=master#vendors" },
  { id: 16, name: "Forms (Administration)", role: "master", url: "/?role=master#admin/users" },
  { id: 17, name: "Settings", role: "master", url: "/?role=master#settings" },
  { id: 18, name: "Notifications", role: "master", url: "/?role=master#notifications" },
  { id: 19, name: "Search & Navigation", role: "master", url: "/?role=master#dashboard", testSearch: true },
  { id: 20, name: "Mobile Navigation Drawer", role: "master", url: "/?role=master#dashboard", testMobileNav: true },
  { id: 21, name: "Tablet Layouts", role: "owner", url: "/?role=owner#dashboard" },
  { id: 22, name: "Desktop Layouts", role: "master", url: "/?role=master#dashboard" },
];

async function runAudit() {
  const chromePath = findChrome();
  if (!chromePath) throw new Error("Chrome not found");

  const server = await startStaticServer();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(12000);

  const auditResults = [];

  try {
    for (const screen of SCREENS) {
      console.log(`\n=== Auditing Screen ${screen.id}: ${screen.name} ===`);
      const screenIssues = [];

      for (const vp of VIEWPORTS) {
        await page.setViewport({
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: vp.isMobile ? 2 : 1,
          isMobile: vp.isMobile,
          hasTouch: vp.isMobile || vp.width <= 1024,
        });

        const targetUrl = `http://127.0.0.1:${PORT}${screen.url}`;
        try {
          await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
          await new Promise((r) => setTimeout(r, 250));

          // Run evaluation
          const metrics = await page.evaluate((isMobile) => {
            const docEl = document.documentElement;
            const overflowX = Math.max(0, docEl.scrollWidth - window.innerWidth);
            const pageEl = document.querySelector("#page-content, .page, .auth-screen, #cafeOpsRoot");
            const contentOverflowX = pageEl ? Math.max(0, pageEl.scrollWidth - pageEl.clientWidth) : 0;

            // Small buttons on mobile
            let smallInteractiveCount = 0;
            if (isMobile) {
              const interactives = Array.from(document.querySelectorAll("button, a.btn, input, select, .nav-link"));
              for (const el of interactives) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0 && (rect.height < 32 || rect.width < 32)) {
                  // Ignore hidden or micro tags
                  if (!el.closest(".hidden, [hidden], .search-kbd, .tag, .pill")) {
                    smallInteractiveCount++;
                  }
                }
              }
            }

            // Tables causing global blowouts
            const tables = Array.from(document.querySelectorAll("table, .glass-table"));
            const uncontainedTables = tables.filter((tbl) => {
              const parent = tbl.parentElement;
              const hasScroll = parent && (getComputedStyle(parent).overflowX === "auto" || getComputedStyle(parent).overflowX === "scroll");
              return !hasScroll && tbl.scrollWidth > window.innerWidth;
            }).length;

            return {
              overflowX,
              contentOverflowX,
              smallInteractiveCount,
              uncontainedTables,
              hasContent: Boolean(pageEl),
            };
          }, vp.isMobile);

          if (metrics.overflowX > 2) {
            screenIssues.push(`[${vp.label}] Window horizontal overflow: ${metrics.overflowX}px`);
          }
          if (metrics.uncontainedTables > 0) {
            screenIssues.push(`[${vp.label}] Found ${metrics.uncontainedTables} table(s) without responsive scroll container`);
          }
        } catch (err) {
          screenIssues.push(`[${vp.label}] Failed to load or evaluate: ${err.message}`);
        }
      }

      auditResults.push({
        screenId: screen.id,
        name: screen.name,
        passed: screenIssues.length === 0,
        issues: screenIssues,
      });

      if (screenIssues.length === 0) {
        console.log(`[PASS] Screen ${screen.id}: Clean across all 10 viewports`);
      } else {
        console.log(`[WARN] Screen ${screen.id}: Found ${screenIssues.length} issues:`);
        screenIssues.forEach((issue) => console.log(`  - ${issue}`));
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log("\n========================================================");
  console.log("COMPLETE 22-SCREEN AUDIT SUMMARY");
  console.log("========================================================");
  const totalScreens = auditResults.length;
  const passedScreens = auditResults.filter((r) => r.passed).length;
  console.log(`Screens passing all 10 viewports: ${passedScreens} / ${totalScreens}`);
  if (passedScreens < totalScreens) {
    console.log("Screens with defects to resolve:");
    auditResults.filter((r) => !r.passed).forEach((r) => {
      console.log(`\n• Screen ${r.screenId}: ${r.name}`);
      r.issues.forEach((iss) => console.log(`    ${iss}`));
    });
  }
}

runAudit().catch(console.error);
