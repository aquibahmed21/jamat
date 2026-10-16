import { el } from "./dom.ts";
import { icon, type IconName } from "./icons.ts";
import { button } from "./button.ts";
import { gt } from "../guitext.ts";

export function emptyState(title: string, hint?: string, iconName: IconName = "info"): HTMLElement {
  return el("section", { class: "state state-empty" },
    icon(iconName),
    el("h2", { text: title }),
    hint ? el("p", { class: "muted", text: hint }) : null,
  );
}

/** Polite live region so assistants announce loading. */
export function loadingState(label: string = gt().common.loading): HTMLElement {
  return el("div", { class: "state state-loading", attrs: { role: "status" } },
    el("span", { class: "spinner", attrs: { "aria-hidden": "true" } }),
    el("span", { text: label }),
  );
}

export function errorState(title: string, hint?: string, onRetry?: () => void): HTMLElement {
  return el("section", { class: "state state-error", attrs: { role: "alert" } },
    icon("warning"),
    el("h2", { text: title }),
    hint ? el("p", { class: "muted", text: hint }) : null,
    onRetry ? button({ label: gt().common.retry, icon: "check", onClick: onRetry }) : null,
  );
}
