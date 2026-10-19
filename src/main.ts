import { gt, getLanguage, setLanguage, loadLanguage, onLanguageChange, LANGS, type Lang, type RouteKey } from "./guitext.ts";
import { el } from "./ui/dom.ts";
import { icon } from "./ui/icons.ts";
import { emptyState, errorState, loadingState } from "./ui/states.ts";
import { errorText } from "./ui/errors.ts";
import { renderMembers, type ViewContext } from "./features/members/view.ts";
import { renderExpenses } from "./features/expenses/view.ts";
import { renderProgramme } from "./features/programme/view.ts";
import { renderPlaces } from "./features/places/view.ts";
import { renderHome } from "./features/home/view.ts";
import { renderBackup } from "./features/backup/view.ts";
import { startPwa } from "./pwa.ts";
import { button } from "./ui/button.ts";
import { confirmDialog } from "./ui/dialog.ts";
import { isDirty, setDirty } from "./ui/dirty.ts";
import { applyPendingFocus } from "./ui/focus.ts";

const routes: RouteKey[] = ["home", "members", "expenses", "programme", "places", "backup"];
const title = document.getElementById("app-title") as HTMLElement;
const lang = document.getElementById("lang") as HTMLElement;
const nav = document.getElementById("nav") as HTMLElement;
const view = document.getElementById("view") as HTMLElement;
const banner = document.getElementById("banner") as HTMLElement;
const net = document.getElementById("net") as HTMLElement;

let applyUpdate: (() => void) | null = null;
let online = true;

/** "Skip to content": the first Tab stop on every page, so keyboard users can bypass the navigation. */
const skip = document.createElement("button");
skip.className = "skip";
skip.type = "button";
skip.addEventListener("click", () => view.focus());
(document.querySelector(".app") as HTMLElement).prepend(skip);

/** Update prompt and offline badge: both are redrawn on language change. */
function renderStatus(): void {
  skip.textContent = gt().common.skip;
  const t = gt().pwa;
  net.hidden = online;
  net.textContent = online ? "" : t.offline;
  banner.hidden = applyUpdate === null;
  if (applyUpdate === null) return;
  const apply = applyUpdate;
  banner.replaceChildren(el("span", { text: t.updateReady }), button({ label: t.reload, icon: "check", variant: "primary", onClick: apply }));
}

function parseHash(): { route: RouteKey | null; rest: string[] } {
  const [key = "", ...rest] = location.hash.replace(/^#\/?/, "").split("/");
  const name = key || "home";
  return { route: (routes as string[]).includes(name) ? (name as RouteKey) : null, rest };
}

function go(hash: string): void {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function renderLanguage(): void {
  const t = gt();
  const select = el("select", { class: "select", attrs: { id: "lang-select", "aria-label": t.language.label } });
  for (const l of LANGS) {
    const o = el("option", { text: t.language[l], attrs: { value: l } });
    o.selected = l === getLanguage();
    select.append(o);
  }
  select.addEventListener("change", async () => {
    const next = select.value as Lang;
    if (isDirty()) {
      const c = gt().common;
      const ok = await confirmDialog({ title: c.discardTitle, message: c.languageDiscard, confirmLabel: c.discard, destructive: true });
      if (!ok) { select.value = getLanguage(); return; }
    }
    setLanguage(next);
  });
  lang.replaceChildren(icon("language"), select);
}

function renderNav(active: RouteKey | null): void {
  const t = gt();
  nav.setAttribute("aria-label", t.appName);
  nav.replaceChildren(
    ...routes.map((key) => {
      const a = el("a", { attrs: { href: `#/${key}` } }, icon(key), el("span", { text: t.nav[key] }));
      if (key === active) a.setAttribute("aria-current", "page");
      return a;
    }),
  );
}

const renderers: Partial<Record<RouteKey, (ctx: ViewContext) => Promise<HTMLElement>>> = {
  home: renderHome,
  members: renderMembers,
  expenses: renderExpenses,
  programme: renderProgramme,
  places: renderPlaces,
  backup: renderBackup,
};

let renderToken = 0;

async function renderView(route: RouteKey | null, rest: string[]): Promise<void> {
  const t = gt();
  const name = route ? t.nav[route] : t.states.notFound;
  document.title = `${name} · ${t.appName}`;
  const renderer = route ? renderers[route] : undefined;
  if (!renderer) {
    view.replaceChildren(emptyState(name, t.states.notFoundHint, "warning"));
    return;
  }
  const token = ++renderToken;
  view.replaceChildren(loadingState());
  let content: HTMLElement;
  try {
    content = await renderer({ rest, refresh: render, go });
  } catch (e) {
    content = errorState(t.states.errorTitle, errorText(e), render);
  }
  if (token !== renderToken) return;
  // A re-render replaces the element that had focus; put focus back (or on the page) instead of losing it.
  const hadFocus = view.contains(document.activeElement) && document.activeElement !== view;
  view.replaceChildren(content);
  if (!applyPendingFocus(view) && hadFocus) view.focus();
}

let currentHash = location.hash;

function render(): void {
  renderToken++;
  setDirty(false);
  currentHash = location.hash;
  const { route, rest } = parseHash();
  document.documentElement.lang = getLanguage() === "en" ? "en" : "ur-Latn";
  title.textContent = gt().appName;
  renderLanguage();
  renderStatus();
  renderNav(route);
  void renderView(route, rest);
}

loadLanguage();
onLanguageChange(render);
let reverting = false;
window.addEventListener("hashchange", async () => {
  if (reverting) { reverting = false; return; }
  if (isDirty()) {
    // The address already changed (link, tab or Back): ask before throwing away what was typed, else go back.
    const c = gt().common;
    const ok = await confirmDialog({ title: c.discardTitle, message: c.discardText, confirmLabel: c.discard, destructive: true });
    if (!ok) { reverting = true; location.hash = currentHash; return; }
  }
  render();
  view.focus();
});
window.addEventListener("beforeunload", (e) => { if (isDirty()) e.preventDefault(); });
render();
startPwa({
  onUpdateReady: (apply) => { applyUpdate = apply; renderStatus(); },
  onOnlineChange: (v) => { online = v; renderStatus(); },
});
