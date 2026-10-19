// Verifies the built site is self-consistent and base-path independent (GitHub Pages serves it under /jamat/).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, posix } from "node:path";

const problems = [];
const bad = (m) => problems.push(m);
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const read = (f) => readFileSync(join("dist", f), "utf8");
const has = (f) => existsSync(join("dist", f));
const isRelative = (u) => !/^([a-z][a-z0-9+.-]*:|\/)/i.test(u);

if (!has("index.html")) bad("dist/index.html missing");
const html = has("index.html") ? read("index.html") : "";
for (const [, url] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
  if (!isRelative(url)) bad(`index.html: non-relative URL ${url}`);
  else if (!has(url.replace(/^\.\//, "").split(/[?#]/)[0])) bad(`index.html: missing file ${url}`);
}

// Manifest
if (!has("manifest.webmanifest")) bad("manifest missing");
else {
  const m = JSON.parse(read("manifest.webmanifest"));
  if (m.start_url !== "./" || m.scope !== "./") bad("manifest start_url/scope must be ./");
  if (!m.name || !m.short_name) bad("manifest name missing");
  const sizes = new Set();
  for (const i of m.icons ?? []) {
    if (!isRelative(i.src) || !has(i.src)) bad(`manifest icon not found/relative: ${i.src}`);
    sizes.add(i.sizes);
  }
  if (!sizes.has("192x192") || !sizes.has("512x512")) bad("manifest needs 192 and 512 icons");
}

// Service worker + precache list
if (!has("sw.js")) bad("sw.js missing");
else {
  const sw = read("sw.js");
  const m = /^const BUILD = (\{.*\});$/m.exec(sw);
  if (!m) bad("sw.js has no BUILD header");
  else {
    const build = JSON.parse(m[1]);
    if (!/^[0-9a-f]{12}$/.test(build.version)) bad("sw.js version malformed");
    for (const f of build.files) {
      if (!isRelative(f)) bad(`precache entry not relative: ${f}`);
      else if (f !== "./" && !has(f)) bad(`precache entry missing: ${f}`);
    }
    for (const must of ["./", "index.html", "styles/main.css", "src/main.js", "manifest.webmanifest"]) {
      if (!build.files.includes(must)) bad(`precache lacks ${must}`);
    }
    if (build.files.includes("sw.js")) bad("sw.js must not precache itself");
    const shipped = walk("dist").map((f) => f.slice(5).replaceAll("\\", "/")).filter((f) => f !== "sw.js");
    for (const f of shipped) if (!build.files.includes(f)) bad(`file not precached: ${f}`);
  }
  if (/indexedDB/.test(sw)) bad("sw.js must never touch IndexedDB");
}
if (has("src/sw.js")) bad("dist/src/sw.js should have been moved");

// Every script: relative, resolvable imports; nothing hard-codes the repository base path.
for (const f of walk("dist").filter((p) => p.endsWith(".js"))) {
  const rel = f.slice(5);
  const code = readFileSync(f, "utf8");
  const specs = [
    ...code.matchAll(/^\s*(?:import|export)\s[^'"\n]*?\bfrom\s*["']([^"']+)["']/gm),
    ...code.matchAll(/^\s*import\s*["']([^"']+)["']/gm),
  ];
  for (const [, spec] of specs) {
    if (!spec.startsWith("./") && !spec.startsWith("../")) bad(`${rel}: non-relative import ${spec}`);
    else if (!has(posix.join(dirname(rel), spec))) bad(`${rel}: import not found ${spec}`);
  }
  if (/["'`]\/jamat\b/.test(code)) bad(`${rel}: hard-coded /jamat base path`);
}
for (const f of walk("dist").filter((p) => /\.(css|html|webmanifest)$/.test(p))) {
  if (/["'(]\/jamat\b/.test(readFileSync(f, "utf8"))) bad(`${f.slice(5)}: hard-coded /jamat base path`);
}

if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("check:dist OK");
