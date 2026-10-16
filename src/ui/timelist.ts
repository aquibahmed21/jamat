import { gt } from "../guitext.ts";
import { button } from "./button.ts";
import { formatDateTime, fromInputValue } from "./datetime.ts";
import { el, uid } from "./dom.ts";
import type { Errorable } from "./form.ts";

export interface TimeList extends Errorable {
  values(): number[];
}

/** Editable list of date-times: pick one, press Add, remove with the chip's button. Duplicates are ignored. */
export function timeList(opts: { label: string; hint?: string; initial?: readonly number[] }): TimeList {
  const id = uid("tl");
  let items = [...(opts.initial ?? [])].sort((a, b) => a - b);
  const chips = el("ul", { class: "chips" });
  const input = el("input", { class: "input", attrs: { id, type: "datetime-local" } });
  const error = el("div", { class: "error-text", attrs: { role: "alert" } });
  error.hidden = true;

  const draw = () => {
    chips.replaceChildren(
      ...items.map((ms) =>
        el("li", { class: "chip" },
          el("span", { text: formatDateTime(ms) }),
          button({
            label: `${gt().common.delete}: ${formatDateTime(ms)}`, icon: "close", iconOnly: true,
            onClick: () => { items = items.filter((x) => x !== ms); draw(); },
          }),
        ),
      ),
    );
  };
  draw();

  const add = button({
    label: gt().common.add, icon: "plus",
    onClick: () => {
      const ms = fromInputValue(input.value);
      if (ms === null || items.includes(ms)) return;
      items = [...items, ms].sort((a, b) => a - b);
      input.value = "";
      draw();
    },
  });
  const root = el("div", { class: "field" },
    el("label", { attrs: { for: id }, text: opts.label }),
    opts.hint ? el("div", { class: "hint", text: opts.hint }) : null,
    chips,
    el("div", { class: "inline" }, input, add),
    error,
  );
  return {
    root,
    values: () => [...items],
    setError(message) {
      error.hidden = message === null;
      error.textContent = message ?? "";
    },
  };
}
