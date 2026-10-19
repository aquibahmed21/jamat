import { el } from "./dom.ts";

/** Makes a data table accessible: a visually hidden caption and header scopes (column heads, row heads in the footer). */
export function finishTable(table: HTMLTableElement, caption: string): HTMLTableElement {
  table.prepend(el("caption", { class: "sr-only", text: caption }));
  table.querySelectorAll("thead th").forEach((th) => th.setAttribute("scope", "col"));
  table.querySelectorAll("tbody th, tfoot th").forEach((th) => th.setAttribute("scope", "row"));
  return table;
}
