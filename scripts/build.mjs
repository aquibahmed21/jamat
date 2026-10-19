// Compiles TypeScript and assembles dist/: static files, web manifest, service worker with its precache list.
// Uses the `tsc` on PATH. Everything in dist/ uses relative URLs so it works under any base path (e.g. /jamat/).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
execFileSync("tsc", ["-p", "tsconfig.json"], { stdio: "inherit" });
cpSync("index.html", "dist/index.html");
cpSync("styles", "dist/styles", { recursive: true });
cpSync("icons", "dist/icons", { recursive: true, filter: (src) => !src.endsWith(".svg") || src.endsWith("icon.svg") });

// Manifest: the app name comes from the single text source (src/guitext.ts), not from a second copy.
const { gt } = await import(pathToFileURL(join("dist", "src", "guitext.js")).href);
const appName = gt().appName;
const manifest = {
  name: appName,
  short_name: appName,
  start_url: "./",
  scope: "./",
  display: "standalone",
  background_color: "#f6f8f7",
  theme_color: "#0f6b4f",
  icons: [
    { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};
writeFileSync("dist/manifest.webmanifest", JSON.stringify(manifest, null, 2));

// Service worker: the compiled template + a build-specific header (version = hash of every shipped file).
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const swTemplate = readFileSync("dist/src/sw.js", "utf8");
rmSync("dist/src/sw.js");
const files = walk("dist").map((f) => relative("dist", f).split(sep).join("/")).sort();
const hash = createHash("sha256");
for (const f of files) hash.update(f).update(readFileSync(join("dist", f)));
const version = hash.digest("hex").slice(0, 12);
// "./" is the app shell (index.html is also listed by name).
const header = `const BUILD = ${JSON.stringify({ version, files: ["./", ...files] })};\n`;
writeFileSync("dist/sw.js", header + swTemplate);
console.log(`Built dist/ (version ${version}, ${files.length} files)`);
