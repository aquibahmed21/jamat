import { el } from "./dom.ts";

const SHOW_MS = 4000;

/** Short confirmation ("Saved"). The region is a polite live region, so screen readers announce it too. */
export function notify(message: string): void {
  const region = document.getElementById("toast");
  if (!region) return;
  const toast = el("div", { class: "toast", text: message });
  region.replaceChildren(toast);
  setTimeout(() => { if (toast.parentElement === region) toast.remove(); }, SHOW_MS);
}
