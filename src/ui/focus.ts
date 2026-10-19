// Keeps keyboard/screen-reader focus where the user was after a view re-renders (the old element is replaced).
let pending: string[] = [];

/** Ask for focus on the first enabled match of these CSS selectors once the next render finishes. */
export function focusAfterRender(...selectors: string[]): void {
  pending = selectors;
}

/** Applies (and clears) the pending request. Returns true if something received focus. */
export function applyPendingFocus(root: ParentNode): boolean {
  const wanted = pending;
  pending = [];
  for (const sel of wanted) {
    const el = root.querySelector<HTMLElement>(sel);
    if (el && !(el as HTMLButtonElement).disabled) { el.focus(); return true; }
  }
  return false;
}

/** Selector for an element by its exact aria-label. */
export const byLabel = (label: string): string => `[aria-label="${label.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"]`;
