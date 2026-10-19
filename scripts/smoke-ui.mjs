// End-to-end smoke test of the real UI in headless Chrome/Chromium (no dependencies), using synthetic data only.
// Usage: npm run build && npm run smoke:ui      (needs Chrome/Chromium; set CHROME=/path to override)
import { sleep, startBrowser } from "./lib/browser.mjs";

const browser = await startBrowser({ appPort: Number(process.env.SMOKE_PORT) || 8092, cdpPort: Number(process.env.SMOKE_CDP_PORT) || 9334 }).catch((e) => {
  console.error(e.message);
  process.exit(2);
});
if (!browser) { console.log("smoke:ui SKIPPED (no Chrome/Chromium found; set CHROME=...)"); process.exit(0); }
const { run, send, base } = browser;
process.on("exit", () => browser.close());

let pass = 0;
const failures = [];
const chk = (name, ok, extra = "") => {
  if (ok) pass++; else failures.push(`${name}${extra ? "  -> " + String(extra).slice(0, 240) : ""}`);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
};
const save = "await click('Save'); await w(900)";
const press = async (key, code = key, vk = 9, text = undefined) => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
  await sleep(120);
};

// ---- Jamaat and members -------------------------------------------------------------------------------------------
await browser.fresh("#/");
let t = await run("await w(300); return txt()");
chk("home without a Jamaat invites creating one", t.includes("Welcome") && t.includes("saved on this device only"), t);
await browser.go("#/members/jamaat");
await run("await click('Save'); await w(400)");
t = await run("return { txt: txt(), focus: document.activeElement.getAttribute('aria-invalid') }");
chk("empty form: field error shown and focus moves to the first invalid field", t.txt.includes("Required") && t.focus === "true", JSON.stringify(t));
await run(`fill('Name', 'Smoke Jamaat'); fill('Start', local(Date.now() - 72 * 3600e3)); fill('End', local(Date.now() + 72 * 3600e3)); ${save}`);
t = await run("return { txt: txt(), toast: document.getElementById('toast').innerText }");
chk("Jamaat saved: confirmation toast and profile shown", t.toast.includes("Saved") && t.txt.includes("Smoke Jamaat"), JSON.stringify(t));
for (const n of ["Alpha", "Beta", "Gamma"]) {
  await run(`await click('Add member'); fill('Name', '${n}'); fill('Joined', local(Date.now() - 60 * 3600e3)); await click('Save'); await w(800)`);
}
await run("await click('Add member'); fill('Name', 'alpha'); await click('Save'); await w(500)");
t = await run("return txt()");
chk("duplicate member name refused", t.includes("A member with this name exists"), t);

// ---- unsaved-changes protection -----------------------------------------------------------------------------------
await run("await click('Cancel'); await w(300)");
t = await run("return { dialog: dialogText(), hash: location.hash }");
chk("Cancel on a dirty form asks before discarding", !!t.dialog && t.dialog.includes("Discard changes?") && t.hash === "#/members/new", JSON.stringify(t));
await run("await dialogButton('Cancel')");
t = await run("return { onForm: !!document.querySelector('form'), name: val('Name') }");
chk("choosing Cancel keeps the typed input", t.onForm && t.name === "alpha", JSON.stringify(t));
await run("location.hash = '#/places'; await w(600)");
t = await run("return { dialog: dialogText(), hash: location.hash, onForm: !!document.querySelector('form') }");
chk("navigating away from a dirty form asks first and the form stays", !!t.dialog && t.onForm, JSON.stringify(t));
await run("await dialogButton('Cancel'); await w(400)");
t = await run("return { hash: location.hash, name: val('Name') }");
chk("keeping the form restores the address and the input", t.hash === "#/members/new" && t.name === "alpha", JSON.stringify(t));
await run("const s = document.getElementById('lang-select'); s.value = 'roman'; s.dispatchEvent(new Event('change')); await w(400)");
t = await run("return { dialog: dialogText(), lang: document.getElementById('lang-select').value }");
chk("changing language with unsaved input asks first", !!t.dialog && t.dialog.includes("loses your unsaved changes"), JSON.stringify(t));
await run("await dialogButton('Cancel'); await w(300)");
t = await run("return { lang: document.getElementById('lang-select').value, name: val('Name') }");
chk("declining keeps the language and the input", t.lang === "en" && t.name === "alpha", JSON.stringify(t));
await run("await cancelForm()");
t = await run("return txt()");
chk("discarding returns to the members list", t.includes("Present now: 3 of 3"), t);

// ---- Ameer ---------------------------------------------------------------------------------------------------------
await run(`await click('Appoint Ameer'); await w(250); pick('Member', 'Alpha'); fill('Start', local(Date.now() - 24 * 3600e3)); ${save}`);
await run(`await click('Appoint Ameer'); await w(250); pick('Member', 'Beta'); fill('Type', 'temporary'); fill('Start', local(Date.now() - 3600e3)); fill('End', local(Date.now() + 3600e3)); ${save}`);
t = await run("return txt()");
chk("temporary Ameer overrides the permanent one; history kept", t.includes("Beta · Temporary") && t.includes("Alpha") && t.includes("Permanent"), t);

// ---- Expenses, allocation, ledger ----------------------------------------------------------------------------------
await browser.go("#/expenses/new");
await run(`fill('Description', 'Dinner'); fill('Amount', '100.00'); ${save}`);
await run("[...document.querySelectorAll('a.row-title')].find((a) => a.textContent === 'Dinner').click(); await w(500)");
t = await run("return txt()");
chk("allocation breakdown: 3334/3333/3333 with a checkable line", t.includes("₹33.34") && t.includes("10000*1 = 3333*3 + 1 (+1)"), t);
t = await run("return { inputmode: (await (async () => { await click('Back to list'); await click('Add expense'); await w(250); return ctl('Amount').getAttribute('inputmode'); })()), hidden: getComputedStyle(lab('Split by').parentElement).display }");
chk("amount field asks for a decimal keypad; hidden fields really are hidden", t.inputmode === "decimal" && t.hidden === "none", JSON.stringify(t));
await run("await cancelForm()");
// transport: vehicle and fuel are recorded and shown
await run(`await click('Add expense'); await w(250); fill('Category', 'transport'); await w(100); fill('Description', 'Bike fuel'); fill('Amount', '90'); fill('Vehicle', 'bike'); fill('Cost of', 'fuel'); check('Participants', ['Alpha', 'Beta']); ${save}`);
await run("[...document.querySelectorAll('a.row-title')].find((a) => a.textContent === 'Bike fuel').click(); await w(500)");
t = await run("return txt()");
chk("transport expense records vehicle and fuel and splits among passengers", t.includes("Vehicle") && t.includes("Bike") && t.includes("Fuel") && t.includes("₹45.00"), t);
// stale edit: another tab changes the record while this form is open
await run("await click('Edit'); await w(400); fill('Description', 'Bike fuel (edited here)')");
await run(`const m = (p) => import(location.origin + '/jamat/src/' + p); const { getDb } = await m('db/index.js'); const { saveExpense } = await m('features/expenses/service.js'); const db = await getDb(); const cur = (await db.expenses.list()).items.find((e) => e.description === 'Bike fuel'); const r = await saveExpense(db, { ...cur, notes: undefined, description: 'Bike fuel (edited elsewhere)', updatedAt: cur.updatedAt + 1 }, false, cur.updatedAt); if (!r.ok) throw new Error('setup failed'); `);
await run("await click('Save'); await w(900)");
t = await run("return txt()");
chk("saving a record that changed elsewhere is refused with a clear message", t.includes("changed elsewhere") && t.includes("Save"), t.slice(0, 300));
await run("await cancelForm()");
t = await run("return txt()");
chk("the other tab's change was kept, not overwritten", t.includes("edited elsewhere") && !t.includes("edited here"), t);
await run(`await click('Add expense'); await w(250); fill('Category', 'advance'); await w(100); fill('Description', 'Advance'); fill('Amount', '100'); ${save}`);
await run("await click('Add expense'); await w(250); fill('Category', 'refund'); await w(150); fill('Advance to refund', [...ctl('Advance to refund').options].find((o) => o.textContent.startsWith('Advance')).value); await w(100); fill('Description', 'Refund'); fill('Amount', '150'); await click('Save'); await w(800)");
t = await run("return txt()");
chk("refund larger than the advance is refused", t.includes("More than the advance still to be refunded"), t);
await run(`fill('Amount', '60'); ${save}`);
await run("await click('Balances'); await w(500)");
t = await run("return txt()");
chk("balances reconcile to zero", t.includes("All balances add up to zero."), t);
t = await run("return document.querySelector('table caption')?.textContent + '|' + document.querySelector('thead th')?.getAttribute('scope')");
chk("data tables have a caption and header scopes", t === "Balances|col", t);
await run("await click('Back to list'); await w(300); await click('Delete: Refund'); await w(300)");
t = await run("return { dialog: dialogText(), focus: document.activeElement.textContent }");
chk("delete asks for confirmation with Cancel focused", !!t.dialog && t.dialog.includes("Delete record?") && t.focus === "Cancel", JSON.stringify(t));
await run("await dialogButton('Delete'); await w(400)");
t = await run("return { toast: document.getElementById('toast').innerText, txt: txt() }");
chk("delete confirmed: toast announced and record gone", t.toast.includes("Deleted") && !t.txt.includes("Refund"), JSON.stringify(t));

// ---- Programme: reorder keeps keyboard focus -----------------------------------------------------------------------
await browser.go("#/programme");
await run("await click('Add standard list'); await w(250); await dialogButton('Add standard list'); await w(900)");
t = await run("return document.querySelectorAll('ul[data-timetable] > li').length");
chk("standard list adds the 22 scoped activities", t === 22, t);
await run("const b = btn('Move down: Tahajjud'); b.focus(); b.click(); await w(1000)");
t = await run("return { focus: document.activeElement.getAttribute('aria-label'), toast: document.getElementById('toast').innerText, first: document.querySelector('ul[data-timetable] li .row-main div').innerText.slice(0, 20) }");
chk("Move down keeps focus on the same control and announces the move", t.focus === "Move down: Tahajjud" && t.toast.includes("Moved") && t.first.includes("Fajr"), JSON.stringify(t));
await run(`await click('Add activity'); await w(250); fill('Activity', 'Overlap test'); fill('Start', '07:00'); fill('End', '07:30'); ${save}`);
t = await run("return txt()");
chk("overlapping activity is flagged, not rearranged", t.includes("Overlaps: ") && /overlapping pairs\. Nothing was changed\./.test(t), t.slice(0, 200));

// ---- Places and mulaqaat -------------------------------------------------------------------------------------------
await browser.go("#/places/new");
await run(`fill('Name', 'Smoke Masjid'); fill('Latitude', '12.9716'); fill('Longitude', '77.5946'); fill('Phone', '+91 80 1234 5678'); ${save}`);
t = await run("const a = [...document.querySelectorAll('a')].find((x) => x.textContent.includes('Open map')); const r = a.getBoundingClientRect(); return { href: a.href, rel: a.rel, h: r.height }");
chk("map link is keyless, safe and a proper tap target", t.href === "https://www.google.com/maps/search/?api=1&query=12.971600%2C77.594600" && t.rel.includes("noopener") && t.h >= 44, JSON.stringify(t));
await browser.go("#/places/mulaqaat/new");
await run(`pick('Place', 'Smoke Masjid'); check('People met', ['Alpha']); fill('Notes', 'Synthetic meeting'); ${save}`);
t = await run("return txt()");
chk("mulaqaat recorded", t.includes("Smoke Masjid") && t.includes("Alpha") && t.includes("Synthetic meeting"), t);

// ---- Home ----------------------------------------------------------------------------------------------------------
await browser.go("#/");
t = await run("await w(400); return txt()");
chk("home summarises members, Ameer, money, programme and places", t.includes("3 of 3") && t.includes("Beta") && t.includes("₹100.00") && t.includes("Next") && t.includes("Smoke Masjid"), t);

// ---- Backup and restore --------------------------------------------------------------------------------------------
await browser.go("#/backup");
await run("window.__blobs = []; const oc = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__blobs.push(b); return oc(b); }; HTMLAnchorElement.prototype.click = function () {}; await click('Download backup'); await w(600)");
const exported = await run("return await window.__blobs[0].text()");
const doc = JSON.parse(exported);
chk("export contains every kind of record", doc.app === "jamat" && doc.data.jamaats.length === 1 && doc.data.members.length === 3 && doc.data.expenses.length === 3 && doc.data.activities.length === 23 && doc.data.places.length === 1 && doc.data.mulaqaat.length === 1, JSON.stringify(Object.fromEntries(Object.entries(doc.data).map(([k, v]) => [k, v.length]))));
const feed = (text) => `const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(text)}], 'b.json')); const i = document.querySelector('input[type=file]'); i.files = dt.files; i.dispatchEvent(new Event('change')); await w(700)`;
await run(feed(JSON.stringify({ ...doc, data: { ...doc.data, members: [{ ...doc.data.members[0], jamaatId: "ghost" }] } })));
t = await run("return txt()");
chk("a backup with a dangling reference is rejected and nothing changes", t.includes("cannot be restored") && t.includes("missing reference") && !t.includes("Restore as"), t.slice(0, 300));
await run(feed(exported));
await run("await click('Restore'); await w(300)");
t = await run("return dialogText()");
chk("replace restore warns about data loss", !!t && t.includes("Replace all data?") && t.includes("A copy of the current data is downloaded first"), t);
await run("await dialogButton('Restore'); await w(1200); if (dialogText()) await dialogButton('OK'); await w(500)");
t = await run("return window.__blobs.length");
chk("a safety copy of the replaced data was downloaded first", t >= 2, t);
await browser.go("#/members");
t = await run("await w(500); return txt()");
chk("data intact after restore", t.includes("Alpha") && t.includes("Beta") && t.includes("Gamma"), t);

// ---- Keyboard: skip link -------------------------------------------------------------------------------------------
await browser.fresh("#/members");
await press("Tab");
t = await run("return { name: document.activeElement.textContent, fixedTop: getComputedStyle(document.activeElement).top }");
chk("first Tab stop is the skip link and it becomes visible", t.name === "Skip to content" && parseFloat(t.fixedTop) >= 0, JSON.stringify(t));
await press("Enter", "Enter", 13, "\r");
t = await run("return document.activeElement.id");
chk("activating the skip link moves focus to the main content", t === "view", t);

// ---- Offline ------------------------------------------------------------------------------------------------------
await browser.fresh("#/");
t = await run("const r = await navigator.serviceWorker.ready; for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) await w(150); return { scope: r.scope, controlled: !!navigator.serviceWorker.controller }");
chk("service worker is registered under /jamat/ and controls the page", t.scope === base && t.controlled, JSON.stringify(t));
await browser.stopServer();
await send("Page.reload");
await sleep(1800);
t = await run("await w(600); return { nav: document.querySelectorAll('#nav a').length, txt: txt() }");
chk("offline: the app shell loads and IndexedDB data is available", t.nav === 6 && t.txt.includes("Smoke Jamaat"), JSON.stringify(t));
await run("location.hash = '#/expenses'; await w(600)");
t = await run("return txt()");
chk("offline: navigation and stored records work", t.includes("Dinner"), t);
await browser.startServer();

chk("no JavaScript errors during the whole run", browser.pageErrors.length === 0, browser.pageErrors.join(" | "));
console.log(`\nsmoke:ui ${failures.length === 0 ? "OK" : "FAILED"} - ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exitCode = failures.length ? 1 : 0;
await browser.close();
