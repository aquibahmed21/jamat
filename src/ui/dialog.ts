import { el, uid } from "./dom.ts";
import { button } from "./button.ts";
import { gt } from "../guitext.ts";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** Destructive actions use the danger style and focus Cancel first. */
  destructive?: boolean;
}

/** Native modal <dialog>. Resolves true only on explicit confirmation; Esc/backdrop/Cancel resolve false. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const t = gt().common;
    const titleId = uid("dlg-title");
    let result = false;
    const cancel = button({ label: t.cancel, onClick: () => dlg.close() });
    const ok = button({
      label: opts.confirmLabel ?? t.confirm,
      variant: opts.destructive ? "danger" : "primary",
      onClick: () => { result = true; dlg.close(); },
    });
    cancel.autofocus = !!opts.destructive;
    ok.autofocus = !opts.destructive;

    const dlg = el("dialog", { class: "dialog", attrs: { "aria-labelledby": titleId } },
      el("h2", { text: opts.title, attrs: { id: titleId } }),
      opts.message ? el("p", { text: opts.message }) : null,
      el("div", { class: "actions" }, cancel, ok),
    );
    dlg.addEventListener("click", (ev) => { if (ev.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => { dlg.remove(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** Message-only dialog with a single OK button. */
export function alertDialog(title: string, message?: string): Promise<void> {
  return new Promise((resolve) => {
    const titleId = uid("dlg-title");
    const dlg = el("dialog", { class: "dialog", attrs: { "aria-labelledby": titleId } },
      el("h2", { text: title, attrs: { id: titleId } }),
      message ? el("p", { text: message }) : null,
      el("div", { class: "actions" }, button({ label: gt().common.ok, variant: "primary", onClick: () => dlg.close() })),
    );
    dlg.addEventListener("close", () => { dlg.remove(); resolve(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}
