// Minimal static server for the production export in out/, mounted at the
// GitHub Pages basePath (/my-diet) so e2e can exercise basePath/trailingSlash
// exactly as deployed. No dependencies.
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT ?? 3100);
const BASE = "/my-diet";
const ROOT = path.resolve("out");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
};

function send(res, status, file) {
  res.writeHead(status, {
    "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(res);
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (url === BASE || url === "/") {
      res.writeHead(302, { Location: `${BASE}/` });
      return res.end();
    }
    if (!url.startsWith(`${BASE}/`)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not under basePath");
    }
    let file = path.join(ROOT, url.slice(BASE.length + 1));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end();
    }
    if (existsSync(file) && statSync(file).isDirectory()) {
      file = path.join(file, "index.html");
    }
    if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
    if (!existsSync(file)) {
      const notFound = path.join(ROOT, "404.html");
      if (existsSync(notFound)) return send(res, 404, notFound);
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    send(res, 200, file);
  })
  .listen(PORT, () => {
    console.log(`Serving out/ at http://localhost:${PORT}${BASE}/`);
  });
