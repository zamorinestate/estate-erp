import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, "../frontend");
const ARTIFACT_DIR = path.resolve("C:/Users/chris/.gemini/antigravity-ide/brain/06893b38-7ac6-4d19-b756-9a0333cac0eb");
const PORT = 3530;

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
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);
  return candidates.find((c) => fs.existsSync(c)) || null;
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const parsed = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
        let pathname = decodeURIComponent(parsed.pathname);

        if (pathname.startsWith("/api/")) {
          res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ success: false }));
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
            res.writeHead(404);
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
        res.writeHead(500);
        res.end(error.message);
      }
    });
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

async function capture() {
  const chromePath = findChrome();
  const server = await startStaticServer();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  const shots = [
    { name: "login_desktop_1440.png", url: "/#login2", width: 1440, height: 900, dark: false },
    { name: "login_dark_desktop_1440.png", url: "/#login2", width: 1440, height: 900, dark: true },
    { name: "login_mobile_390.png", url: "/#login2", width: 390, height: 844, dark: false },
    { name: "dashboard_master_1440.png", url: "/?role=master#dashboard", width: 1440, height: 900, dark: false },
    { name: "dashboard_owner_1440.png", url: "/?role=owner#dashboard", width: 1440, height: 900, dark: false },
    { name: "pos_till_tablet_1024.png", url: "/?role=cafe_admin#pos", width: 1024, height: 768, dark: false },
    { name: "inventory_desktop_1440.png", url: "/?role=master#inventory", width: 1440, height: 900, dark: false },
    { name: "procurement_desktop_1440.png", url: "/?role=master#procurement", width: 1440, height: 900, dark: false },
    { name: "staff_home_mobile_390.png", url: "/?role=staff#staff-home", width: 390, height: 844, dark: false },
    { name: "cafe_ops_standalone_1440.png", url: "/cafe-operations/cafe-operations.html", width: 1440, height: 900, dark: false },
  ];

  for (const shot of shots) {
    await page.setViewport({ width: shot.width, height: shot.height });
    await page.goto(`http://127.0.0.1:${PORT}${shot.url}`, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 400));

    if (shot.dark) {
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await new Promise((r) => setTimeout(r, 100));
    }

    const dest = path.join(ARTIFACT_DIR, shot.name);
    await page.screenshot({ path: dest, fullPage: false });
    console.log(`Saved screenshot: ${shot.name}`);
  }

  await browser.close();
  server.close();
}

capture().catch(console.error);
