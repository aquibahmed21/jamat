const pad = (n: number) => String(n).padStart(2, "0");

/** Epoch ms -> value for <input type="datetime-local"> (local time, minute precision). */
export function toInputValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value -> epoch ms, or null when empty/invalid. */
export function fromInputValue(v: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(ms);
}
