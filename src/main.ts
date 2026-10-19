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

const routes: RouteKey[] = ["home", "members", "expenses", "programme", "places", "backup"];
const title = document.getElementById("app-title") as HTMLElement;
const lang = document.getElementById("lang") as HTMLElement;
const nav = document.getElementById("nav") as HTMLElement;
const view = document.getElementById("view") as HTMLElement;
const banner = document.getElementById("banner") as HTMLElement;
const net = document.getElementById("net") as HTMLElement;

let applyUpdate: (() => void) | null = null;
let online = true;

/** Update prompt and offline badge: both are redrawn on language change. */
function renderStatus(): void {
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
  select.addEventListener("change", () => setLanguage(select.value as Lang));
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
    view.replaceChildren(
      route
        ? emptyState(name, t.states.comingSoon, route)
        : emptyState(name, t.states.notFoundHint, "warning"),
    );
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
  if (token === renderToken) view.replaceChildren(content);
}

function render(): void {
  renderToken++;
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
window.addEventListener("hashchange", () => { render(); view.focus(); });
render();
startPwa({
  onUpdateReady: (apply) => { applyUpdate = apply; renderStatus(); },
  onOnlineChange: (v) => { online = v; renderStatus(); },
});
