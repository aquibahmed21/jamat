// Repeatable UI audit in headless Chrome/Chromium (no dependencies): layouts, tap targets, text size, contrast,
// accessible names, headings, focus visibility, keyboard order and dialog focus handling.
// Usage: npm run build && npm run audit:ui        (needs a Chrome/Chromium binary; set CHROME=/path to override)
import { sleep, startBrowser } from "./lib/browser.mjs";

const browser = await startBrowser({ appPort: Number(process.env.AUDIT_PORT) || 8091, cdpPort: Number(process.env.AUDIT_CDP_PORT) || 9333 }).catch((e) => {
  console.error(e.message);
  process.exit(2);
});
if (!browser) { console.log("audit:ui SKIPPED (no Chrome/Chromium found; set CHROME=...)"); process.exit(0); }
const { base: BASE, send, run, pageErrors } = browser;
const cleanup = () => browser.close();
process.on("exit", cleanup);
const go = (hash) => browser.fresh(hash);
const fresh = go;

// ---------- seed realistic synthetic data through the app's own services ----------
await browser.fresh(); await sleep(300);
await run(`
  const m = (p) => import(location.origin + '/jamat/src/' + p);
  const { getDb } = await m('db/index.js');
  const mem = await m('features/members/service.js'), exp = await m('features/expenses/service.js');
  const ame = await m('features/ameer/service.js'), prog = await m('features/programme/service.js'), pl = await m('features/places/service.js');
  const { newId } = await m('model/id.js'); const { gt } = await m('guitext.js');
  const db = await getDb(); const now = Date.now(), H = 3600e3, st = { createdAt: now - 80*H, updatedAt: now - 80*H };
  if ((await db.jamaats.list()).items.length === 0) {
    await mem.saveJamaat(db, { id: 'jam1', name: 'Audit Jamaat', startAt: now - 72*H, endAt: now + 72*H, notes: 'Synthetic data for the UI audit', ...st }, true);
    for (const [i, n] of ['Alpha Tester', 'Beta Tester', 'Gamma Tester With A Rather Long Display Name'].entries())
      await mem.saveMember(db, { id: 'mem' + i, jamaatId: 'jam1', name: n, phone: '+91 90000 0000' + i, joinAt: now - 60*H, leaveAt: null, notes: '', ...st }, true);
    await ame.saveAppointment(db, { id: 'ap1', jamaatId: 'jam1', memberId: 'mem0', kind: 'permanent', startAt: now - 50*H, endAt: null, ...st }, true);
    await ame.saveAppointment(db, { id: 'ap2', jamaatId: 'jam1', memberId: 'mem1', kind: 'temporary', startAt: now - H, endAt: now + H, ...st }, true);
    const e = { jamaatId: 'jam1', date: now - 5*H, paymentSource: 'member', payerId: 'mem0', counterpartyId: null, linkedExpenseId: null, participantIds: ['mem0','mem1','mem2'], foodBasis: null, treatKind: null, mealTimes: [], periodFrom: null, periodTo: null, ...st };
    await exp.saveExpense(db, { ...e, id: 'ex1', category: 'general', description: 'Water cans for everyone', amountPaise: 30050 }, true);
    await exp.saveExpense(db, { ...e, id: 'ex2', category: 'food', description: 'Dinner', amountPaise: 45000, foodBasis: 'meal', mealTimes: [now - 10*H, now - 4*H] }, true);
    await exp.saveExpense(db, { ...e, id: 'ex3', category: 'advance', description: 'Advance', amountPaise: 10000, participantIds: [] }, true);
    await prog.addStandardProgramme(db, 'jam1', gt().programme.presets, []);
    await pl.savePlace(db, { id: 'pl1', name: 'Audit Masjid', type: 'masjid', customType: '', latitude: 12.97, longitude: 77.59, zimmedar: 'Zimmedar One', phone: '+91 80 1234 5678', address: '12 Synthetic Street', notes: '', ...st }, true);
    await pl.saveMulaqaat(db, { id: 'mq1', jamaatId: 'jam1', placeId: 'pl1', at: now - 2*H, personIds: ['mem0','mem2'], notes: 'Synthetic meeting', ...st }, true);
  }
  return true`);

// ---------- in-page audit ----------
const AUDIT = `
const out = [];
const add = (level, rule, el, msg) => out.push({ level, rule, where: describe(el), msg });
function describe(el) { if (!el) return ''; const t = (el.getAttribute && (el.getAttribute('aria-label') || el.textContent || '')).trim().replace(/\\s+/g,' ').slice(0, 30); return el.tagName.toLowerCase() + (el.id && !/^(f|g|tl|dlg|file)-\\d+/.test(el.id) ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') + (t ? ' "' + t + '"' : ''); }
const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden]'); };
const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const cx = canvas.getContext('2d', { willReadFrequently: true });
function rgba(c) { cx.clearRect(0,0,1,1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0,0,1,1); const d = cx.getImageData(0,0,1,1).data; return [d[0], d[1], d[2], d[3] / 255]; }
function over(top, bottom) { const a = top[3]; return [0,1,2].map(i => top[i] * a + bottom[i] * (1 - a)).concat([1]); }
function bgOf(el) { const chain = []; for (let e = el; e; e = e.parentElement) chain.push(rgba(getComputedStyle(e).backgroundColor)); let base = [255,255,255,1]; const root = rgba(getComputedStyle(document.documentElement).backgroundColor); if (root[3] > 0) base = root; for (let i = chain.length - 1; i >= 0; i--) base = over(chain[i], base); return base; }
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126*f(c[0]) + 0.7152*f(c[1]) + 0.0722*f(c[2]); };
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05); };

// 1. overflow
if (document.documentElement.scrollWidth > innerWidth + 1) add('error', 'overflow', document.documentElement, 'page scrolls horizontally: ' + document.documentElement.scrollWidth + ' > ' + innerWidth);

// 2. touch targets
const targets = [...document.querySelectorAll('button, a[href], select, textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), label.check, summary')];
for (const el of targets) {
  if (!visible(el) || el.disabled) continue;
  const r = el.getBoundingClientRect(); const inline = el.tagName === 'A' && !el.classList.contains('btn') && !el.closest('nav') && getComputedStyle(el).display === 'inline';
  if (inline) { if (r.height < 24) add('error', 'target-size-min', el, Math.round(r.width) + 'x' + Math.round(r.height) + ' (<24px)'); else if (r.height < 44) add('warn', 'target-size', el, 'inline link ' + Math.round(r.height) + 'px tall'); continue; }
  if (r.width < 44 - 0.5 || r.height < 44 - 0.5) add('error', 'target-size', el, Math.round(r.width) + 'x' + Math.round(r.height) + ' (<44px)');
}

// 3. text size and contrast
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const seen = new Set();
for (let n = walker.nextNode(); n; n = walker.nextNode()) {
  const el = n.parentElement; if (!el || seen.has(el) || !n.textContent.trim() || !visible(el) || el.closest('script,style,option')) continue; seen.add(el);
  const s = getComputedStyle(el); const px = parseFloat(s.fontSize);
  if (px < 11) add('error', 'font-size', el, px.toFixed(1) + 'px'); else if (px < 12) add('warn', 'font-size', el, px.toFixed(1) + 'px');
  if (el.closest('[disabled]') || el.disabled) continue;
  const fg = rgba(s.color), bg = bgOf(el), c = ratio(over(fg, bg), bg);
  const large = px >= 24 || (px >= 18.66 && parseInt(s.fontWeight) >= 700);
  if (c < (large ? 3 : 4.5)) add('error', 'contrast', el, c.toFixed(2) + ':1 needs ' + (large ? 3 : 4.5));
}
for (const ic of document.querySelectorAll('svg.icon')) { if (!visible(ic)) continue; const fg = rgba(getComputedStyle(ic).color), bg = bgOf(ic), c = ratio(over(fg, bg), bg); if (c < 3) add('error', 'icon-contrast', ic.parentElement, c.toFixed(2) + ':1 needs 3'); }

// 4. accessible names
const nameOf = (el) => { const al = el.getAttribute('aria-label'); if (al) return al.trim(); const lb = el.getAttribute('aria-labelledby'); if (lb) return lb.split(' ').map(i => document.getElementById(i)?.textContent || '').join(' ').trim();
  if (el.labels && el.labels.length) return [...el.labels].map(l => l.textContent).join(' ').trim(); return (el.textContent || el.title || '').trim(); };
for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, dialog')) { if (el.tagName !== 'DIALOG' && !visible(el)) continue; if (!nameOf(el)) add('error', 'accessible-name', el, 'no accessible name'); }
for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea')) { if (!visible(el)) continue; const lab = el.labels && el.labels.length; if (!lab && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.closest('fieldset')) add('error', 'form-label', el, 'control has no label'); }
for (const el of document.querySelectorAll('svg')) if (visible(el) && el.getAttribute('aria-hidden') !== 'true' && !el.getAttribute('aria-label')) add('error', 'svg-hidden', el, 'decorative svg is not aria-hidden');

// 5. structure
const ids = {}; for (const el of document.querySelectorAll('[id]')) ids[el.id] = (ids[el.id] || 0) + 1; for (const [id, n] of Object.entries(ids)) if (n > 1) add('error', 'duplicate-id', document.getElementById(id), id + ' x' + n);
const h1 = [...document.querySelectorAll('h1')].filter(visible); if (h1.length !== 1) add('error', 'h1', document.body, h1.length + ' h1 elements');
let last = 0; for (const h of [...document.querySelectorAll('h1,h2,h3,h4')].filter(visible)) { const lv = Number(h.tagName[1]); if (last && lv > last + 1) add('warn', 'heading-order', h, 'h' + last + ' -> h' + lv); last = lv; }
if (document.querySelectorAll('main').length !== 1) add('error', 'landmark-main', document.body, 'need exactly one main');
for (const n of document.querySelectorAll('nav')) if (!n.getAttribute('aria-label')) add('error', 'landmark-nav', n, 'nav has no label');
if (!document.documentElement.lang) add('error', 'lang', document.documentElement, 'no lang');
for (const el of document.querySelectorAll('[tabindex]')) if (Number(el.getAttribute('tabindex')) > 0) add('error', 'tabindex', el, 'positive tabindex');
for (const t of document.querySelectorAll('table')) { if (!visible(t)) continue; if (!t.querySelector('caption')) add('warn', 'table-caption', t, 'no caption'); if ([...t.querySelectorAll('th')].some(th => !th.getAttribute('scope'))) add('warn', 'table-scope', t, 'th without scope'); }
for (const el of document.querySelectorAll('input[required],input[aria-required]')) {}
for (const el of document.querySelectorAll('label')) { if (!visible(el) || !/\\(Required\\)|\\(Zaroori\\)/.test(el.textContent)) continue; const c = document.getElementById(el.htmlFor); if (c && c.getAttribute('aria-required') !== 'true') add('warn', 'aria-required', c, 'required field lacks aria-required'); }
return out;`;

const issues = [];
const record = (ctx, list) => { for (const i of list) issues.push({ ctx, ...i }); };
const QUICK = process.env.AUDIT_QUICK === "1"; // fewer viewports, for iteration
const ALL_VIEWPORTS = [
  ["phone-320", 320, 568, true], ["phone-360", 360, 640, true], ["phone-390", 390, 844, true], ["phone-landscape", 667, 375, true],
  ["tablet-768", 768, 1024, false], ["ipad-landscape", 1024, 768, false], ["laptop-1366", 1366, 768, false], ["desktop-1920", 1920, 1080, false],
];
const VIEWPORTS = QUICK ? ALL_VIEWPORTS.filter(([n]) => ["phone-320", "phone-360", "tablet-768", "laptop-1366"].includes(n)) : ALL_VIEWPORTS;
const ROUTES = [
  "#/", "#/members", "#/members/new", "#/members/jamaat", "#/members/ameer/new", "#/expenses", "#/expenses/new", "#/expenses/view/ex1",
  "#/expenses/balances", "#/expenses/history", "#/programme", "#/programme/new", "#/places", "#/places/new", "#/places/mulaqaat",
  "#/places/mulaqaat/new", "#/backup", "#/nonexistent",
];
const setViewport = (w, h, mobile) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
const setScheme = (s) => send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: s }] });

const ONLY = process.env.AUDIT_ONLY; // "keyboard" | "interaction" to run just those parts
for (const scheme of ONLY ? [] : ["light", "dark"]) {
  await setScheme(scheme);
  for (const [name, w, h, mobile] of VIEWPORTS) {
    if (scheme === "dark" && !["phone-360", "laptop-1366"].includes(name)) continue;
    await setViewport(w, h, mobile);
    for (const route of ROUTES) {
      await go(route);
      record(`${scheme} ${name} ${route}`, await run(AUDIT));
    }
  }
}
await setScheme("light"); await setViewport(1280, 800, false);

// ---------- keyboard: order, focus visibility ----------
const press = async (key, code = key) => { await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: key === "Tab" ? 9 : key === "Escape" ? 27 : 13 }); await send("Input.dispatchKeyEvent", { type: "keyUp", key, code }); await sleep(60); };
const FOCUS_INFO = `const a = document.activeElement; const s = getComputedStyle(a); const r = a.getBoundingClientRect();
  return { tag: a.tagName.toLowerCase(), name: (a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28) || (a.type || a.className || a.id), type: a.type || '', outline: s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor, shadow: s.boxShadow, onScreen: r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 }`;
for (const route of ["#/", "#/members", "#/expenses/new", "#/programme"]) {
  await fresh(route);
  const order = [];
  for (let i = 0; i < 14; i++) {
    await press("Tab");
    const f = await run(FOCUS_INFO);
    order.push(f);
    if (f.tag === "body") continue; // focus wrapped past the last control and left the page: nothing to check
    const hasRing = (/^(solid|auto|dashed|double)/.test(f.outline) && !f.outline.startsWith("none") && !/ 0px /.test(f.outline)) || (f.shadow && f.shadow !== "none");
    if (!hasRing) issues.push({ ctx: `keyboard ${route}`, level: "error", rule: "focus-visible", where: `${f.tag}${f.type ? "[" + f.type + "]" : ""} "${f.name}"`, msg: `no visible focus indicator (${f.outline}; step ${order.length})` });
  }
  if (!/skip|jump|content|chhod|seedha/i.test(order[0].name) && !/^button$/.test(order[0].tag)) {
    issues.push({ ctx: `keyboard ${route}`, level: "error", rule: "skip-link", where: `${order[0].tag} "${order[0].name}"`, msg: "first Tab stop is not a skip-to-content control" });
  }
}

// ---------- dialogs: focus moves in, Esc closes, focus returns ----------
await go("#/expenses");
const deleteLabel = await run(`const b = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').startsWith('Delete: ')); b.focus(); b.click(); await new Promise(r=>setTimeout(r,300)); const d = document.querySelector('dialog[open]');
  return { open: !!d, inside: !!d && d.contains(document.activeElement), labelled: !!d && !!d.getAttribute('aria-labelledby'), described: !!d && !!d.getAttribute('aria-describedby'), focus: document.activeElement.textContent, trigger: b.getAttribute('aria-label') }`);
if (!deleteLabel.open) issues.push({ ctx: "dialog", level: "error", rule: "dialog-open", where: "delete", msg: "confirm dialog did not open" });
else {
  if (!deleteLabel.inside) issues.push({ ctx: "dialog", level: "error", rule: "dialog-focus", where: "delete", msg: "focus is not inside the dialog" });
  if (!deleteLabel.labelled) issues.push({ ctx: "dialog", level: "error", rule: "dialog-name", where: "delete", msg: "dialog has no accessible name" });
  if (!deleteLabel.described) issues.push({ ctx: "dialog", level: "warn", rule: "dialog-description", where: "delete", msg: "dialog message is not linked with aria-describedby" });
  if (deleteLabel.focus !== "Cancel") issues.push({ ctx: "dialog", level: "error", rule: "dialog-safe-default", where: "delete", msg: `destructive dialog focuses "${deleteLabel.focus}" instead of Cancel` });
  await press("Escape");
  const after = await run(`return { open: !!document.querySelector('dialog[open]'), back: document.activeElement.getAttribute('aria-label') }`);
  if (after.open) issues.push({ ctx: "dialog", level: "error", rule: "dialog-escape", where: "delete", msg: "Escape does not close the dialog" });
  else if (after.back !== deleteLabel.trigger) issues.push({ ctx: "dialog", level: "error", rule: "dialog-return-focus", where: "delete", msg: `focus returned to ${after.back}, expected ${deleteLabel.trigger}` });
}

// ---------- interaction: keyboard reorder keeps focus; errors move focus; success is announced ----------
await go("#/programme");
const mv = await run(`const b = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').startsWith('Move down: ')); const label = b.getAttribute('aria-label'); b.focus(); b.click(); await new Promise(r=>setTimeout(r,900)); return { label, now: document.activeElement.getAttribute('aria-label') || document.activeElement.tagName }`);
if (mv.now !== mv.label) issues.push({ ctx: "programme", level: "error", rule: "focus-after-action", where: mv.label, msg: `focus lost after Move down (now on ${mv.now})` });
await go("#/members/new");
await run(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save').click(); await new Promise(r=>setTimeout(r,500))`);
const err = await run(`const a = document.activeElement; return { tag: a.tagName.toLowerCase(), invalid: a.getAttribute('aria-invalid'), id: a.id }`);
if (err.invalid !== "true") issues.push({ ctx: "members/new", level: "error", rule: "focus-first-error", where: err.tag, msg: "after a failed submit focus is not on the first invalid field" });
await go("#/members/new");
await run(`const f = (l) => document.getElementById([...document.querySelectorAll('label')].find(x => x.textContent.startsWith(l)).htmlFor); f('Name').value = 'Delta Tester'; f('Name').dispatchEvent(new Event('input', {bubbles:true})); [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save').click(); await new Promise(r=>setTimeout(r,900))`);
const status = await run(`return [...document.querySelectorAll('[role=status],[aria-live]')].filter(e => e.textContent.trim()).map(e => e.textContent.trim())`);
if (!status.some((t) => /saved|mehfooz/i.test(t))) issues.push({ ctx: "members/new", level: "error", rule: "success-feedback", where: "save", msg: "no visible/announced confirmation after saving" });
// unsaved-changes protection
await go("#/members/new");
const dirty = await run(`const f = (l) => document.getElementById([...document.querySelectorAll('label')].find(x => x.textContent.startsWith(l)).htmlFor); f('Name').value = 'Typing'; f('Name').dispatchEvent(new Event('input', {bubbles:true})); [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Cancel').click(); await new Promise(r=>setTimeout(r,400)); return { dialog: !!document.querySelector('dialog[open]'), hash: location.hash }`);
if (!dirty.dialog) issues.push({ ctx: "members/new", level: "error", rule: "discard-changes", where: "cancel", msg: "Cancel silently discards typed input" });

if (pageErrors.length) issues.push({ ctx: "page", level: "error", rule: "js-error", where: "console", msg: pageErrors.join(" | ") });

// ---------- report ----------
const grouped = new Map();
for (const i of issues) {
  const key = `${i.level} ${i.rule} | ${i.where} | ${i.msg}`;
  if (!grouped.has(key)) grouped.set(key, new Set());
  grouped.get(key).add(i.ctx);
}
const errors = [...grouped].filter(([k]) => k.startsWith("error"));
const warns = [...grouped].filter(([k]) => k.startsWith("warn"));
for (const [k, ctxs] of [...errors, ...warns]) console.log(`${k}\n    in ${[...ctxs].slice(0, 4).join("; ")}${ctxs.size > 4 ? ` (+${ctxs.size - 4} more)` : ""}`);
console.log(`\naudit:ui ${errors.length === 0 ? "OK" : "FAILED"} - ${errors.length} distinct errors, ${warns.length} distinct warnings across ${ROUTES.length} routes x ${VIEWPORTS.length} viewports (+dark) and keyboard/dialog checks`);
process.exitCode = errors.length ? 1 : 0;
cleanup();
