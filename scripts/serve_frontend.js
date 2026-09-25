import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, "../frontend");
const port = 3000;

const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  // Reverse proxy /api/* requests to local backend with seamless cloud fallback
  if (parsedUrl.pathname.startsWith("/api/")) {
    const primaryHost = process.env.BACKEND_URL || "http://127.0.0.1:4000";
    const cloudHost = "https://zamorin-cafe-erp.vercel.app";

    try {
      const headers = { ...req.headers };
      delete headers.host;
      delete headers["accept-encoding"];
      delete headers.connection;

      let bodyData = undefined;
      if (req.method !== "GET" && req.method !== "HEAD") {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        bodyData = Buffer.concat(chunks);
        headers["content-length"] = String(bodyData.length);
      }

      let proxyRes;
      try {
        proxyRes = await fetch(`${primaryHost}${parsedUrl.pathname}${parsedUrl.search}`, {
          method: req.method,
          headers,
          body: bodyData,
          redirect: "manual",
          signal: AbortSignal.timeout(10000)
        });
      } catch (localErr) {
        console.error('[proxy-local-err]', localErr.message);
        // Fallback to cloud backend if local backend on port 4000 is not running
        if (primaryHost.includes("localhost") || primaryHost.includes("127.0.0.1")) {
          proxyRes = await fetch(`${cloudHost}${parsedUrl.pathname}${parsedUrl.search}`, {
            method: req.method,
            headers,
            body: bodyData,
            redirect: "manual",
            signal: AbortSignal.timeout(15000)
          });
        } else {
          throw localErr;
        }
      }

      const resHeaders = {};
      proxyRes.headers.forEach((val, key) => {
        const lower = key.toLowerCase();
        if (lower !== "content-encoding" && lower !== "content-length" && lower !== "transfer-encoding") {
          resHeaders[key] = val;
        }
      });
      resHeaders["Access-Control-Allow-Origin"] = "*";
      resHeaders["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS";
      resHeaders["Access-Control-Allow-Headers"] = "*";

      const buffer = Buffer.from(await proxyRes.arrayBuffer());
      resHeaders["Content-Length"] = buffer.length;
      res.writeHead(proxyRes.status, resHeaders);
      res.end(buffer);
      return;
    } catch (proxyErr) {
      res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "Backend proxy unreachable", message: proxyErr.message }));
      return;
    }
  }

  let filePath = path.join(frontendDir, decodeURIComponent(parsedUrl.pathname));

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  // Check frontendDir/dist for production assets
  if (!fs.existsSync(filePath)) {
    const distPath = path.join(frontendDir, "dist", decodeURIComponent(parsedUrl.pathname));
    if (fs.existsSync(distPath) && !fs.statSync(distPath).isDirectory()) {
      filePath = distPath;
    }
  }

  // Return 404 for missing non-HTML assets instead of returning index.html (which causes MIME type errors)
  if (!fs.existsSync(filePath)) {
    const reqExt = path.extname(parsedUrl.pathname).toLowerCase();
    if (reqExt && reqExt !== ".html") {
      res.writeHead(404, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
      res.end("Not Found");
      return;
    }
    filePath = path.join(frontendDir, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";
  const isHtml = ext === ".html";

  // Ultra-fast cached delivery for HTML & critical resources (0ms TTFB)
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": isHtml ? "text/html; charset=utf-8" : contentType,
      "Access-Control-Allow-Origin": "*",
      "Sec-CH-Prefers-Color-Scheme": "dark",
      "Cache-Control": isHtml
        ? "no-cache, must-revalidate"
        : "public, max-age=86400, stale-while-revalidate=604800",
      ...(isHtml ? { "Pragma": "no-cache", "Expires": "0" } : {})
    });
    res.end(content);
    return;
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Server Error");
    return;
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use.`);
  } else {
    console.error("Server error:", err);
  }
});

server.listen(port, () => {
  console.log(`Frontend server running at http://localhost:${port}`);
});

process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  server.close();
  process.exit(0);
});
