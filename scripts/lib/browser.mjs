// Shared helper for the browser scripts (audit-ui, smoke-ui): serves dist/ under /jamat/, drives headless Chrome over the
// DevTools protocol using only Node built-ins. Needs a Chrome/Chromium binary (set CHROME=/path to override).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome() {
  return process.env.CHROME ||
    ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].find((b) => spawnSync("which", [b]).status === 0);
}

/** In-page helpers, prepended to every `run()` snippet: click/fill/check by visible text, dialog helpers, local datetime. */
export const PAGE_HELPERS = `
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const btn = (t) => [...document.querySelectorAll('button,a')].find((b) => (b.getAttribute('aria-label') || b.textContent).trim().startsWith(t));
const click = async (t) => { const b = btn(t); if (!b) throw new Error('no button ' + t); b.click(); await w(250); };
const lab = (l) => [...document.querySelectorAll('label,legend')].find((x) => x.textContent.startsWith(l));
const ctl = (l) => document.getElementById(lab(l).htmlFor);
const fill = (label, v) => { const i = ctl(label); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); };
const pick = (label, text) => fill(label, [...ctl(label).options].find((o) => o.textContent.startsWith(text)).value);
const val = (label) => ctl(label).value;
const check = (label, names) => { lab(label).parentElement.querySelectorAll('input[type=checkbox]').forEach((i) => { i.checked = names.includes(i.nextSibling.textContent); i.dispatchEvent(new Event('change', { bubbles: true })); }); };
const dialogButton = async (text) => { const b = [...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === text); if (!b) throw new Error('no dialog button ' + text); b.click(); await w(400); };
const dialogText = () => document.querySelector('dialog[open]')?.innerText ?? null;
const cancelForm = async () => { await click('Cancel'); await w(250); if (document.querySelector('dialog[open]')) await dialogButton('Discard'); await w(250); };
const txt = () => document.getElementById('view').innerText;
const local = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
`;

/** `baseUrl` points at an already-running site (e.g. the live GitHub Pages URL); otherwise dist/ is served locally. */
export async function startBrowser({ appPort = 8091, cdpPort = 9333, serve = true, baseUrl = null } = {}) {
  if (!baseUrl && !existsSync("dist/index.html")) throw new Error("dist/ missing: run `npm run build` first");
  const chromePath = findChrome();
  if (!chromePath) return null;
  const base = baseUrl ?? `http://localhost:${appPort}/jamat/`;
  serve = serve && !baseUrl;
  const profile = mkdtempSync(join(tmpdir(), "jamat-ui-"));
  let server = null;
  const startServer = async () => {
    server = spawn("node", ["scripts/serve.mjs"], { env: { ...process.env, PORT: String(appPort) }, stdio: "ignore" });
    await sleep(700);
  };
  const stopServer = async () => { server?.kill("SIGKILL"); server = null; await sleep(400); };
  if (serve) await startServer();
  const chrome = spawn(chromePath, [
    "--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });

  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) {
    try {
      const page = (await (await fetch(`http://localhost:${cdpPort}/json`)).json()).find((t) => t.type === "page");
      if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
    } catch { await sleep(200); }
  }
  if (!ws) throw new Error("could not reach Chrome");
  await new Promise((r) => (ws.onopen = r));
  let nextId = 0;
  const pending = new Map();
  const pageErrors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === "Runtime.exceptionThrown") pageErrors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
    if (d.method === "Log.entryAdded" && d.params.entry.level === "error") pageErrors.push(`${d.params.entry.source}: ${d.params.entry.text} ${d.params.entry.url ?? ""}`);
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") pageErrors.push("console.error " + d.params.args.map((a) => a.value).join(" "));
  };
  const send = (method, params = {}) => new Promise((r) => { const id = ++nextId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const run = async (code) => {
    const r = await send("Runtime.evaluate", { expression: `(async()=>{${PAGE_HELPERS}${code}})()`, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "evaluate failed");
    return r.result.result.value;
  };
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable"); await send("Log.enable");
  let loads = 0;
  return {
    base, send, run, sleep, pageErrors, startServer, stopServer,
    /** Hash route change in the current document (like a click on a link). */
    async go(hash) { await run(`location.hash=${JSON.stringify(hash)};await w(600)`); },
    /** Full page load (the query string defeats the same-document shortcut for hash-only changes). */
    async fresh(hash = "") { await send("Page.navigate", { url: `${base}?load=${++loads}${hash}` }); await sleep(300); await run("await w(600)"); },
    async close() {
      chrome.kill(); server?.kill();
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}
