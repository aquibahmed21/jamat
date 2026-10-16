// Serves dist/ under /jamat/ to mimic the GitHub Pages project path.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const BASE = "/jamat/";
const PORT = Number(process.env.PORT) || 8080;
const ROOT = join(process.cwd(), "dist");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!path.startsWith(BASE)) {
    res.writeHead(404).end("Not found (app is served under " + BASE + ")");
    return;
  }
  let rel = normalize(path.slice(BASE.length) || "/").replace(/^[\/]+/, "");
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  if (rel.startsWith("..")) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(join(ROOT, rel));
    res.writeHead(200, { "Content-Type": TYPES[extname(rel)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}${BASE}`));
