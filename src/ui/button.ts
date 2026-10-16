import { el } from "./dom.ts";
import { icon, type IconName } from "./icons.ts";

export interface ButtonOptions {
  label: string;
  onClick?: (ev: MouseEvent) => void;
  icon?: IconName;
  /** Hide the visible label (it stays as the accessible name). */
  iconOnly?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
}

/** Native <button>; icon-only buttons keep an aria-label and a title. */
export function button(opts: ButtonOptions): HTMLButtonElement {
  const b = el("button", {
    class: `btn btn-${opts.variant ?? "secondary"}${opts.iconOnly ? " btn-icon" : ""}`,
    attrs: { type: opts.type ?? "button" },
  });
  if (opts.icon) b.append(icon(opts.icon));
  if (opts.iconOnly) {
    b.setAttribute("aria-label", opts.label);
    b.title = opts.label;
  } else {
    b.append(el("span", { text: opts.label }));
  }
  if (opts.onClick) b.addEventListener("click", opts.onClick);
  return b;
}
