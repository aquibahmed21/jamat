import { gt } from "../guitext.ts";
import type { Result } from "../model/validate.ts";
import { button } from "./button.ts";
import { el } from "./dom.ts";
import { errorText } from "./errors.ts";
import { applyIssues, form, formMessage, type Errorable } from "./form.ts";

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

/** Shared form page: one submit at a time, issues on fields, storage errors in the form, navigate back on success. */
export function editor<T>(o: EditorOptions<T>): HTMLElement {
  const c = gt().common;
  const message = formMessage();
  const submit = button({ label: c.save, icon: "check", variant: "primary", type: "submit" });
  const f = form(
    async () => {
      if (submit.disabled) return;
      submit.disabled = true;
      try {
        const r = await o.save(o.build());
        if (r.ok) { o.go(o.back); return; }
        applyIssues(o.fields, r.issues, message);
      } catch (e) {
        message.set(errorText(e));
      } finally {
        submit.disabled = false;
      }
    },
    ...Object.values(o.fields).map((x) => x.root),
    ...(o.extra ?? []),
    message.root,
    el("div", { class: "actions" }, button({ label: c.cancel, onClick: () => o.go(o.back) }), submit),
  );
  return el("section", { class: "stack" }, el("h2", { text: o.title }), f);
}
