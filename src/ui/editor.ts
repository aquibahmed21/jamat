import { gt } from "../guitext.ts";
import type { Result } from "../model/validate.ts";
import { button } from "./button.ts";
import { confirmDialog } from "./dialog.ts";
import { isDirty, setDirty } from "./dirty.ts";
import { el } from "./dom.ts";
import { errorText } from "./errors.ts";
import { applyIssues, form, formMessage, type Errorable } from "./form.ts";
import { notify } from "./toast.ts";

export interface EditorOptions<T> {
  title: string;
  fields: Record<string, Errorable>;
  /** Extra nodes shown after the fields (before the buttons). */
  extra?: (Node | null)[];
  back: string;
  go(hash: string): void;
  /** Reads the form into a raw record (validated by `save`). */
  build(): unknown;
  save(input: unknown): Promise<Result<T>>;
}

/**
 * Shared form page: one submit at a time (with a visible "Saving…" state), issues on fields with focus moved to the
 * first one, storage errors in the form, a confirmation toast on success, and protection against discarding typed input.
 */
export function editor<T>(o: EditorOptions<T>): HTMLElement {
  const c = gt().common;
  const message = formMessage();
  const submit = button({ label: c.save, icon: "check", variant: "primary", type: "submit" });
  const submitLabel = submit.querySelector("span") as HTMLElement;

  const cancel = button({
    label: c.cancel,
    onClick: async () => {
      if (isDirty()) {
        const ok = await confirmDialog({ title: c.discardTitle, message: c.discardText, confirmLabel: c.discard, destructive: true });
        if (!ok) return;
      }
      setDirty(false);
      o.go(o.back);
    },
  });

  const f = form(
    async () => {
      if (submit.disabled) return;
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
      submitLabel.textContent = c.saving;
      try {
        const r = await o.save(o.build());
        if (r.ok) {
          setDirty(false);
          notify(c.saved);
          o.go(o.back);
          return;
        }
        applyIssues(o.fields, r.issues, message)?.focus();
      } catch (e) {
        message.set(errorText(e));
      } finally {
        submit.disabled = false;
        submit.removeAttribute("aria-busy");
        submitLabel.textContent = c.save;
      }
    },
    ...Object.values(o.fields).map((x) => x.root),
    ...(o.extra ?? []),
    message.root,
    el("div", { class: "actions" }, cancel, submit),
  );
  const markDirty = () => setDirty(true);
  f.addEventListener("input", markDirty);
  f.addEventListener("change", markDirty);
  return el("section", { class: "stack" }, el("h2", { text: o.title }), f);
}
