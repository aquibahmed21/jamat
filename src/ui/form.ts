import { el, uid } from "./dom.ts";
import { gt } from "../guitext.ts";
import type { ValidationIssue } from "../model/validate.ts";

/** Anything that can show a validation message. */
export interface Errorable {
  root: HTMLElement;
  /** Moves keyboard focus to the control (used to land on the first invalid field). */
  focus(): void;
  /** Show (or clear, with null) a validation message tied to the control. */
  setError(message: string | null): void;
}

export type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface Field extends Errorable {
  input: Control;
}

export interface FieldOptions {
  label: string;
  type?: string;
  name?: string;
  required?: boolean;
  hint?: string;
  value?: string;
  multiline?: boolean;
  inputMode?: "decimal" | "numeric" | "tel" | "text";
}

export interface Option {
  value: string;
  label: string;
}

export interface SelectOptions {
  label: string;
  options: readonly Option[];
  value?: string;
  required?: boolean;
  hint?: string;
}

const requiredMark = (required?: boolean) =>
  required ? el("span", { class: "req", text: ` (${gt().common.required})` }) : null;

function messageBox(id: string): HTMLElement {
  const error = el("div", { class: "error-text", attrs: { id: `${id}-err`, role: "alert" } });
  error.hidden = true;
  return error;
}

function wrap(control: Control, id: string, opts: { label: string; required?: boolean; hint?: string }): Field {
  if (opts.required) control.setAttribute("aria-required", "true");
  const label = el("label", { attrs: { for: id } }, opts.label, requiredMark(opts.required));
  const hint = opts.hint ? el("div", { class: "hint", text: opts.hint, attrs: { id: `${id}-hint` } }) : null;
  const error = messageBox(id);
  const describe = (withError: boolean) => {
    const ids = [hint ? `${id}-hint` : "", withError ? `${id}-err` : ""].filter(Boolean).join(" ");
    if (ids) control.setAttribute("aria-describedby", ids);
    else control.removeAttribute("aria-describedby");
  };
  describe(false);
  const root = el("div", { class: "field" }, label, control, hint, error);
  return {
    root,
    input: control,
    focus: () => control.focus(),
    setError(message) {
      error.hidden = message === null;
      error.textContent = message ?? "";
      if (message !== null) control.setAttribute("aria-invalid", "true");
      else control.removeAttribute("aria-invalid");
      describe(message !== null);
    },
  };
}

/** Labelled input/textarea with optional hint and an accessible error message. */
export function field(opts: FieldOptions): Field {
  const id = uid("f");
  const named: Record<string, string> = opts.name ? { name: opts.name } : {};
  // The data is about other people, so never let the browser autofill the user's own details into it.
  const common = { id, autocomplete: "off", ...named };
  const control: Control = opts.multiline
    ? el("textarea", { class: "input", attrs: { rows: "3", ...common } })
    : el("input", { class: "input", attrs: { type: opts.type ?? "text", ...(opts.inputMode ? { inputmode: opts.inputMode } : {}), ...common } });
  if (opts.value !== undefined) control.value = opts.value;
  return wrap(control, id, opts);
}

/** Labelled native <select>. */
export function selectField(opts: SelectOptions): Field {
  const id = uid("f");
  const sel = el("select", { class: "select", attrs: { id } });
  for (const o of opts.options) sel.append(el("option", { text: o.label, attrs: { value: o.value } }));
  if (opts.value !== undefined) sel.value = opts.value;
  return wrap(sel, id, opts);
}

/** Replaces the options of a <select>, keeping `value` selected when it is still present. */
export function setOptions(sel: Control, options: readonly Option[], value: string): void {
  sel.replaceChildren(...options.map((o) => el("option", { text: o.label, attrs: { value: o.value } })));
  sel.value = options.some((o) => o.value === value) ? value : (options[0]?.value ?? "");
}

export interface CheckGroup extends Errorable {
  values(): string[];
}

/** Fieldset of checkboxes (multi-select). */
export function checkGroup(opts: { label: string; options: readonly Option[]; selected?: readonly string[]; hint?: string }): CheckGroup {
  const id = uid("g");
  const boxes = opts.options.map((o) => {
    const input = el("input", { attrs: { type: "checkbox", value: o.value } });
    input.checked = opts.selected?.includes(o.value) ?? false;
    return { input, node: el("label", { class: "check" }, input, el("span", { text: o.label })) };
  });
  const error = messageBox(id);
  const root = el("fieldset", { class: "field group" },
    el("legend", { text: opts.label }),
    opts.hint ? el("div", { class: "hint", text: opts.hint }) : null,
    el("div", { class: "checks" }, ...boxes.map((b) => b.node)),
    error,
  );
  return {
    root,
    focus: () => boxes[0]?.input.focus(),
    values: () => boxes.filter((b) => b.input.checked).map((b) => b.input.value),
    setError(message) {
      error.hidden = message === null;
      error.textContent = message ?? "";
    },
  };
}

/** <form> wrapper that never navigates. Native validation is off: our validators report errors from guitext. */
export function form(onSubmit: (data: FormData) => void, ...children: (Node | null)[]): HTMLFormElement {
  const f = el("form", { class: "form", attrs: { novalidate: "" } }, ...children);
  f.addEventListener("submit", (ev) => {
    ev.preventDefault();
    onSubmit(new FormData(f));
  });
  return f;
}

/** Form-level message area (storage errors, issues without a field). */
export function formMessage(): { root: HTMLElement; set(message: string | null): void } {
  const root = el("div", { class: "error-text", attrs: { role: "alert" } });
  root.hidden = true;
  return {
    root,
    set(message) {
      root.hidden = message === null;
      root.textContent = message ?? "";
    },
  };
}

/**
 * Shows validation issues on their fields (first issue per field); others go to the form message.
 * Returns the first field that now shows an error, so the caller can move focus to it.
 */
export function applyIssues(
  fields: Record<string, Errorable>,
  issues: readonly ValidationIssue[],
  message: { set(m: string | null): void },
): Errorable | null {
  const t = gt().errors.validation;
  const seen = new Set<string>();
  let first: Errorable | null = null;
  for (const f of Object.values(fields)) f.setError(null);
  message.set(null);
  for (const i of issues) {
    const target = fields[i.field];
    if (target && !seen.has(i.field)) {
      target.setError(t[i.code]);
      seen.add(i.field);
      first ??= target;
    } else if (!target) {
      message.set(t[i.code]);
    }
  }
  return first;
}
