import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, "../frontend");
const PORT = Number(process.env.APPLE_UI_SMOKE_PORT || 3512);

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
          res.end(JSON.stringify({ success: false, message: "API disabled for UI smoke test" }));
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

function report(name, ok, detail = "") {
  const prefix = ok ? "[PASS]" : "[FAIL]";
  console.log(`${prefix} ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function inspectMainLogin(page, profile) {
  await page.setViewport(profile.viewport);
  await page.goto(`http://127.0.0.1:${PORT}/#login2`, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  await page.waitForSelector("#l2-submit-btn", { timeout: 10000 });
  await new Promise((resolve) => setTimeout(resolve, 250));

  return page.evaluate(() => {
    const card = document.querySelector("#app.auth-screen .auth-shell-container, #app.auth-screen .light-glass-container");
    const submit = document.querySelector("#l2-submit-btn");
    const styleLink = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .find((link) => String(link.getAttribute("href") || "").includes("/src/styles/apple-design-system.css"));

    const rootStyle = getComputedStyle(document.documentElement);
    const rect = card?.getBoundingClientRect();
    const buttonRect = submit?.getBoundingClientRect();

    return {
      hasCard: Boolean(card),
      appleStylesheetPresent: Boolean(styleLink),
      appleStylesheetLoaded: Boolean(styleLink?.sheet),
      appleBlue: rootStyle.getPropertyValue("--apple-blue").trim(),
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      cardWithinViewport: Boolean(rect) && rect.left >= -1 && rect.right <= window.innerWidth + 1,
      cardWidth: rect?.width || 0,
      submitHeight: buttonRect?.height || 0,
      authBackground: (() => {
        const bg = document.querySelector(".l2-bg-layer");
        return bg ? getComputedStyle(bg).backgroundImage : "";
      })(),
    };
  });
}

async function inspectCafeOpsLogin(page, profile) {
  await page.setViewport(profile.viewport);
  await page.goto(`http://127.0.0.1:${PORT}/cafe-operations/cafe-operations.html`, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });

  await page.waitForFunction(() => {
    return Boolean(document.querySelector(".auth-card, .login-card, #cafeOpsRoot"));
  }, { timeout: 10000 });
  await new Promise((resolve) => setTimeout(resolve, 250));

  return page.evaluate(() => {
    const card = document.querySelector(".auth-card, .login-card");
    const styleLink = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .find((link) => String(link.getAttribute("href") || "").includes("css/apple-design-system.css"));
    const rect = card?.getBoundingClientRect();

    return {
      hasRoot: Boolean(document.querySelector("#cafeOpsRoot")),
      hasCard: Boolean(card),
      appleStylesheetPresent: Boolean(styleLink),
      appleStylesheetLoaded: Boolean(styleLink?.sheet),
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      cardWithinViewport: !rect || (rect.left >= -1 && rect.right <= window.innerWidth + 1),
    };
  });
}

async function inspectInternalRoute(page, target, viewport) {
  await page.setViewport(viewport);
  await page.goto(`http://127.0.0.1:${PORT}/?role=${encodeURIComponent(target.role)}${target.route}`, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });

  await page.waitForSelector(".sidebar, #sidebar", { timeout: 10000 });
  await page.waitForSelector("#page-content", { timeout: 10000 });
  if (target.selector) {
    await page.waitForSelector(target.selector, { timeout: 10000 });
  }
  await new Promise((resolve) => setTimeout(resolve, 300));

  return page.evaluate((selector) => {
    const styleLink = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .find((link) => String(link.getAttribute("href") || "").includes("/src/styles/apple-design-system.css"));
    const shell = document.querySelector(".app-shell");
    const topbar = document.querySelector(".topbar");
    const sidebar = document.querySelector(".sidebar, #sidebar");
    const pageContent = document.querySelector("#page-content");
    const marker = selector ? document.querySelector(selector) : pageContent;
    const rootStyle = getComputedStyle(document.documentElement);

    return {
      appleStylesheetLoaded: Boolean(styleLink?.sheet),
      appleBlue: rootStyle.getPropertyValue("--apple-blue").trim(),
      hasShell: Boolean(shell && topbar && sidebar && pageContent),
      hasMarker: Boolean(marker),
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      contentOverflowX: pageContent ? pageContent.scrollWidth - pageContent.clientWidth : 0,
    };
  }, target.selector || "");
}

async function verifyAppearanceControls(page) {
  await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await page.goto(`http://127.0.0.1:${PORT}/?role=master#dashboard`, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });

  await page.waitForSelector("#theme-btn", { timeout: 10000 });
  await page.waitForSelector("#profile-avatar-btn", { timeout: 10000 });
  await page.waitForSelector("#notif-bell-btn", { timeout: 10000 });

  // Start from canonical Apple Light, then exercise the actual theme UI.
  await page.evaluate(() => {
    localStorage.setItem("zamorin-theme", "paper");
    localStorage.setItem("color-theme", "light");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#theme-btn", { timeout: 10000 });

  await page.click("#theme-btn");
  await page.waitForSelector("#themePopover.open", { timeout: 5000 });

  const lightOpen = await page.evaluate(() => {
    const pop = document.querySelector("#themePopover");
    const selected = pop?.querySelector('[data-theme-choice="paper"]');
    const rect = pop?.getBoundingClientRect();
    const style = pop ? getComputedStyle(pop) : null;
    return {
      selected: selected?.classList.contains("selected") || false,
      checked: selected?.getAttribute("aria-checked") === "true",
      radius: style?.borderRadius || "",
      background: style?.backgroundColor || "",
      withinViewport: Boolean(rect) && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
    };
  });

  await page.click('#themePopover [data-theme-choice="midnight"]');
  await page.waitForFunction(() => document.documentElement.dataset.theme === "midnight");

  const darkState = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    darkClass: document.documentElement.classList.contains("dark"),
    storedTheme: localStorage.getItem("zamorin-theme"),
    legacyTheme: localStorage.getItem("color-theme"),
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    popoverClosed: !document.querySelector("#themePopover")?.classList.contains("open"),
  }));

  await page.click("#theme-btn");
  await page.waitForSelector("#themePopover.open", { timeout: 5000 });
  const darkSelected = await page.evaluate(() => {
    const selected = document.querySelector('#themePopover [data-theme-choice="midnight"]');
    return {
      selected: selected?.classList.contains("selected") || false,
      checked: selected?.getAttribute("aria-checked") === "true",
    };
  });

  await page.click('#themePopover [data-theme-choice="paper"]');
  await page.waitForFunction(() => document.documentElement.dataset.theme === "paper");

  const lightState = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    darkClass: document.documentElement.classList.contains("dark"),
    storedTheme: localStorage.getItem("zamorin-theme"),
    legacyTheme: localStorage.getItem("color-theme"),
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
  }));

  // Verify the other topbar contextual surfaces use the same Apple material.
  await page.click("#profile-avatar-btn");
  await page.waitForSelector("#profilePopover.open", { timeout: 5000 });
  const profileSurface = await page.evaluate(() => {
    const pop = document.querySelector("#profilePopover");
    const style = pop ? getComputedStyle(pop) : null;
    const rect = pop?.getBoundingClientRect();
    return {
      open: pop?.classList.contains("open") || false,
      radius: style?.borderRadius || "",
      withinViewport: Boolean(rect) && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
    };
  });

  await page.click("#notif-bell-btn");
  await page.waitForSelector("#notifPopover.open", { timeout: 5000 });
  const notifSurface = await page.evaluate(() => {
    const pop = document.querySelector("#notifPopover");
    const style = pop ? getComputedStyle(pop) : null;
    const rect = pop?.getBoundingClientRect();
    const cafeSelect = document.querySelector("#global-cafe-selector");
    const selectStyle = cafeSelect ? getComputedStyle(cafeSelect) : null;
    return {
      open: pop?.classList.contains("open") || false,
      radius: style?.borderRadius || "",
      withinViewport: Boolean(rect) && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      nativeSelectRadius: selectStyle?.borderRadius || "",
      nativeSelectBackground: selectStyle?.backgroundColor || "",
    };
  });

  return { lightOpen, darkState, darkSelected, lightState, profileSurface, notifSurface };
}

async function verifyDarkAppearance(page) {
  await page.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}/#login2`, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  await page.waitForSelector("#l2-submit-btn", { timeout: 10000 });

  return page.evaluate(() => {
    document.documentElement.classList.add("dark");
    const card = document.querySelector("#app.auth-screen .auth-shell-container, #app.auth-screen .light-glass-container");
    const root = getComputedStyle(document.documentElement);
    const cardStyle = card ? getComputedStyle(card) : null;
    return {
      paper: root.getPropertyValue("--paper").trim(),
      cardBackground: cardStyle?.backgroundColor || "",
      cardColor: cardStyle?.color || "",
    };
  });
}

async function main() {
  console.log("=============================================================================");
  console.log("ZAMORIN APPLE UI SMOKE GATE");
  console.log("=============================================================================");

  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error("Chrome/Chromium executable not found. Set CHROME_PATH.");
  }

  const server = await startStaticServer();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  let failures = 0;
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);

  const profiles = [
    {
      name: "Desktop 1440",
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
    },
    {
      name: "Tablet 1024",
      viewport: { width: 1024, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: true },
    },
    {
      name: "Phone 390",
      viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
  ];

  try {
    for (const profile of profiles) {
      console.log(`\n--- Main Login: ${profile.name} ---`);
      const result = await inspectMainLogin(page, profile);

      failures += report(`${profile.name}: login card rendered`, result.hasCard) ? 0 : 1;
      failures += report(`${profile.name}: Apple stylesheet present`, result.appleStylesheetPresent) ? 0 : 1;
      failures += report(`${profile.name}: Apple stylesheet loaded`, result.appleStylesheetLoaded) ? 0 : 1;
      failures += report(`${profile.name}: Apple token active`, result.appleBlue.toLowerCase() === "#007aff", result.appleBlue) ? 0 : 1;
      failures += report(`${profile.name}: no horizontal overflow`, result.overflowX <= 2, `${result.overflowX}px`) ? 0 : 1;
      failures += report(`${profile.name}: login card within viewport`, result.cardWithinViewport, `${Math.round(result.cardWidth)}px card`) ? 0 : 1;
      failures += report(`${profile.name}: login action usable`, result.submitHeight >= 36, `${Math.round(result.submitHeight)}px`) ? 0 : 1;
      failures += report(`${profile.name}: visual canvas active`, result.authBackground && result.authBackground !== "none", result.authBackground) ? 0 : 1;

      console.log(`\n--- Café Operations Login: ${profile.name} ---`);
      const cafeOps = await inspectCafeOpsLogin(page, profile);
      failures += report(`${profile.name}: Café Operations root rendered`, cafeOps.hasRoot) ? 0 : 1;
      failures += report(`${profile.name}: Café Operations Apple stylesheet present`, cafeOps.appleStylesheetPresent) ? 0 : 1;
      failures += report(`${profile.name}: Café Operations Apple stylesheet loaded`, cafeOps.appleStylesheetLoaded) ? 0 : 1;
      failures += report(`${profile.name}: Café Operations no horizontal overflow`, cafeOps.overflowX <= 2, `${cafeOps.overflowX}px`) ? 0 : 1;
      failures += report(`${profile.name}: Café Operations card within viewport`, cafeOps.cardWithinViewport) ? 0 : 1;
    }

    const routeTargets = [
      { name: "Primary Master Command Centre", role: "master", route: "#dashboard", selector: ".command-centre-wrap" },
      { name: "Administration Cafés", role: "master", route: "#admin/cafes", selector: ".admin-page-wrap" },
      { name: "Inventory", role: "master", route: "#inventory", selector: ".inventory-page" },
      { name: "Reports & Analytics", role: "master", route: "#reports", selector: "#reports-analytics-container" },
      { name: "Owner Command Centre", role: "owner", route: "#dashboard", selector: "#owner-command-centre" },
      { name: "Employee Home", role: "staff", route: "#staff-home", selector: "#staff-dashboard-container" },
      { name: "Café Operations Devices", role: "cafe_admin", route: "#cafe-ops-devices", selector: ".page-container" },
    ];
    const shellProfiles = [
      { name: "Desktop 1440", viewport: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false } },
      { name: "Phone 390", viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    ];

    for (const shellProfile of shellProfiles) {
      console.log(`\n--- Authenticated Shell: ${shellProfile.name} ---`);
      for (const target of routeTargets) {
        const mounted = await inspectInternalRoute(page, target, shellProfile.viewport);
        failures += report(`${shellProfile.name}: ${target.name} shell mounted`, mounted.hasShell && mounted.hasMarker) ? 0 : 1;
        failures += report(`${shellProfile.name}: ${target.name} Apple stylesheet active`, mounted.appleStylesheetLoaded && mounted.appleBlue.toLowerCase() === "#007aff", mounted.appleBlue) ? 0 : 1;
        failures += report(`${shellProfile.name}: ${target.name} page has no global horizontal overflow`, mounted.overflowX <= 2, `${mounted.overflowX}px`) ? 0 : 1;
      }
    }

    console.log("\n--- Appearance & Contextual Controls ---");
    const appearance = await verifyAppearanceControls(page);
    failures += report("Apple Light option is selected and accessible", appearance.lightOpen.selected && appearance.lightOpen.checked) ? 0 : 1;
    failures += report("Theme popover uses Apple rounded material", appearance.lightOpen.radius !== "0px" && appearance.lightOpen.withinViewport, appearance.lightOpen.radius) ? 0 : 1;
    failures += report("Apple Dark selection updates data-theme", appearance.darkState.theme === "midnight", appearance.darkState.theme) ? 0 : 1;
    failures += report("Apple Dark selection synchronizes html.dark", appearance.darkState.darkClass) ? 0 : 1;
    failures += report("Apple Dark persists canonical storage", appearance.darkState.storedTheme === "midnight", appearance.darkState.storedTheme) ? 0 : 1;
    failures += report("Apple Dark synchronizes legacy storage", appearance.darkState.legacyTheme === "dark", appearance.darkState.legacyTheme) ? 0 : 1;
    failures += report("Apple Dark switches browser color scheme", appearance.darkState.colorScheme.includes("dark"), appearance.darkState.colorScheme) ? 0 : 1;
    failures += report("Theme popover closes after selection", appearance.darkState.popoverClosed) ? 0 : 1;
    failures += report("Selected dark choice keeps selected/check state", appearance.darkSelected.selected && appearance.darkSelected.checked) ? 0 : 1;
    failures += report("Apple Light restores canonical state", appearance.lightState.theme === "paper" && !appearance.lightState.darkClass) ? 0 : 1;
    failures += report("Apple Light persists both storage keys", appearance.lightState.storedTheme === "paper" && appearance.lightState.legacyTheme === "light") ? 0 : 1;
    failures += report("Apple Light restores light browser color scheme", appearance.lightState.colorScheme.includes("light"), appearance.lightState.colorScheme) ? 0 : 1;
    failures += report("Profile popover opens inside viewport", appearance.profileSurface.open && appearance.profileSurface.withinViewport) ? 0 : 1;
    failures += report("Notification popover opens inside viewport", appearance.notifSurface.open && appearance.notifSurface.withinViewport) ? 0 : 1;
    failures += report("Native café dropdown uses rounded Apple control", appearance.notifSurface.nativeSelectRadius !== "0px", appearance.notifSurface.nativeSelectRadius) ? 0 : 1;

    console.log("\n--- Dark Appearance ---");
    const dark = await verifyDarkAppearance(page);
    failures += report("Dark appearance token switches to black canvas", dark.paper === "#000000", dark.paper) ? 0 : 1;
    failures += report("Dark login card remains visibly surfaced", Boolean(dark.cardBackground) && dark.cardBackground !== "rgba(0, 0, 0, 0)") ? 0 : 1;
    failures += report("Dark login card text remains defined", Boolean(dark.cardColor)) ? 0 : 1;
  } finally {
    await browser.close();
    server.close();
  }

  console.log("\n=============================================================================");
  console.log(`APPLE UI SMOKE SUMMARY: ${failures === 0 ? "PASS" : "FAIL"} | failures=${failures}`);
  console.log("=============================================================================");

  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Apple UI smoke gate failed:", error);
  process.exit(1);
});
