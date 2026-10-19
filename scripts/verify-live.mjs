// Checks the DEPLOYED site (default: the GitHub Pages URL of this repository) in headless Chrome/Chromium and compares
// its build with the local dist/. Needs network access. Usage: npm run build && npm run verify:live [-- <url>]
import { readFileSync, existsSync } from "node:fs";
import { sleep, startBrowser } from "./lib/browser.mjs";

const url = (process.argv[2] ?? process.env.LIVE_URL ?? "https://aquibahmed21.github.io/jamat/").replace(/\/?$/, "/");
const problems = [];
const note = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) problems.push(msg); };

// 1. plain HTTP: every shipped file is reachable under the project path
const swText = await (await fetch(url + "sw.js")).text().catch(() => "");
const live = /^const BUILD = (\{.*\});$/m.exec(swText);
note(!!live, `sw.js reachable at ${url}sw.js`);
const build = live ? JSON.parse(live[1]) : { files: [], version: "?" };
let bad = 0;
for (const f of build.files) {
  const r = await fetch(new URL(f, url), { method: "GET" }).catch(() => null);
  if (!r || !r.ok) { bad++; console.log(`  missing: ${f} (${r?.status ?? "network error"})`); }
}
note(bad === 0 && build.files.length > 0, `all ${build.files.length} precached files return 200 (live build ${build.version})`);
if (existsSync("dist/sw.js")) {
  const local = /^const BUILD = (\{.*\});$/m.exec(readFileSync("dist/sw.js", "utf8"));
  const lv = local ? JSON.parse(local[1]).version : "?";
  console.log(`  local dist build ${lv} - ${lv === build.version ? "same as live" : "DIFFERENT from live (not deployed yet, or local changes since)"}`);
}

// 2. real browser: renders, registers the worker under the project path, no errors
const browser = await startBrowser({ baseUrl: url, cdpPort: Number(process.env.VERIFY_CDP_PORT) || 9335 });
if (!browser) { console.log("browser checks SKIPPED (no Chrome/Chromium)"); process.exit(problems.length ? 1 : 0); }
process.on("exit", () => browser.close());
await browser.fresh("#/");
await sleep(500);
const page = await browser.run(`await w(800); const r = await navigator.serviceWorker.ready; for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) await w(150);
  const mf = await (await fetch(document.querySelector('link[rel=manifest]').href)).json();
  return { title: document.title, nav: document.querySelectorAll('#nav a').length, scope: r.scope, ctl: !!navigator.serviceWorker.controller, h1: document.querySelector('h1').textContent, start: mf.start_url, mscope: mf.scope, view: document.getElementById('view').innerText.length }`);
note(page.nav === 6 && page.view > 0, `app renders (title "${page.title}", ${page.nav} nav links)`);
note(page.scope === url, `service worker scope is ${page.scope}`);
note(page.ctl, "service worker controls the page");
note(page.start === "./" && page.mscope === "./", "manifest uses relative start_url and scope");
for (const r of ["#/members", "#/expenses", "#/programme", "#/places", "#/backup"]) {
  await browser.go(r);
  const x = await browser.run("return { error: !!document.querySelector('.state-error'), len: txt().length }");
  note(!x.error && x.len > 0, `route ${r} renders`);
}
note(browser.pageErrors.length === 0, `no console/page errors${browser.pageErrors.length ? ": " + browser.pageErrors.join(" | ") : ""}`);
console.log(`\nverify:live ${problems.length ? "FAILED" : "OK"} for ${url}`);
process.exitCode = problems.length ? 1 : 0;
await browser.close();
