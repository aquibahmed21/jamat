import type { ProgrammeActivity } from "../model/types.ts";

// Timetable rules
// - Manual order is the `order` field (0..n-1 after any reorder); it is independent of start times and is never
//   changed by time edits. Ties (should not happen) break by creation time, then id.
// - Times are minutes from midnight, same-day: an activity with an end time occupies [startMin, endMin).
//   Activities without an end time are instants and never overlap anything.
// - Overlaps are reported, never fixed: nothing is rearranged automatically.

export function sortActivities(list: readonly ProgrammeActivity[]): ProgrammeActivity[] {
  return [...list].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function nextOrder(list: readonly ProgrammeActivity[]): number {
  return list.reduce((m, a) => Math.max(m, a.order + 1), 0);
}

/** New display order after moving an item to `toIndex` (clamped). Returns the same order if the id is unknown. */
export function moveTo(list: readonly ProgrammeActivity[], id: string, toIndex: number): ProgrammeActivity[] {
  const ordered = sortActivities(list);
  const from = ordered.findIndex((a) => a.id === id);
  if (from < 0) return ordered;
  const [item] = ordered.splice(from, 1);
  ordered.splice(Math.max(0, Math.min(ordered.length, toIndex)), 0, item!);
  return ordered;
}

/** Move Up / Move Down: delta -1 or +1 (a no-op at the ends). */
export function moveBy(list: readonly ProgrammeActivity[], id: string, delta: number): ProgrammeActivity[] {
  const from = sortActivities(list).findIndex((a) => a.id === id);
  return from < 0 ? sortActivities(list) : moveTo(list, id, from + delta);
}

/** Records whose stored `order` must change so that `ordered` becomes the persisted order (0..n-1). */
export function reorderChanges(before: readonly ProgrammeActivity[], ordered: readonly ProgrammeActivity[], now: number): ProgrammeActivity[] {
  const old = new Map(before.map((a) => [a.id, a.order]));
  return ordered
    .map((a, i) => ({ ...a, order: i, updatedAt: Math.max(a.createdAt, now) }))
    .filter((a) => old.get(a.id) !== a.order);
}

export interface Overlap {
  a: string;
  b: string;
}

/** Pairs of timed activities whose [start, end) intervals intersect (touching is fine). In display order. */
export function findOverlaps(list: readonly ProgrammeActivity[]): Overlap[] {
  const timed = sortActivities(list).filter((a) => a.endMin !== null);
  const out: Overlap[] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const x = timed[i]!;
      const y = timed[j]!;
      if (x.startMin < y.endMin! && y.startMin < x.endMin!) out.push({ a: x.id, b: y.id });
    }
  }
  return out;
}

/** "07:30" -> 450; null when not a valid 24h time. */
export function parseTime(v: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function formatRange(a: Pick<ProgrammeActivity, "startMin" | "endMin">): string {
  return a.endMin === null ? formatTime(a.startMin) : `${formatTime(a.startMin)} – ${formatTime(a.endMin)}`;
}

/** The activities named in the project scope, in a sensible day order. Times are placeholders to edit. */
export const STANDARD_PROGRAMME = [
  { key: "tahajjud", start: 210, end: 270 },
  { key: "fajr", start: 300, end: 330 },
  { key: "sunnatAdaab", start: 330, end: null },
  { key: "morningTea", start: 360, end: 390 },
  { key: "taleemResponsible", start: 420, end: null },
  { key: "taleem", start: 420, end: 480 },
  { key: "mulaqaat", start: 480, end: 510 },
  { key: "khidmat", start: 510, end: null },
  { key: "breakfast", start: 510, end: 555 },
  { key: "rest", start: 570, end: 660 },
  { key: "zoharBaat", start: 735, end: 750 },
  { key: "lunch", start: 780, end: 840 },
  { key: "postLunch", start: 840, end: 930 },
  { key: "gashtAdaab", start: 990, end: null },
  { key: "asrBaat", start: 1000, end: 1020 },
  { key: "gasht", start: 1020, end: 1110 },
  { key: "welcomeGasht", start: 1110, end: null },
  { key: "maghribBaat", start: 1125, end: 1155 },
  { key: "darmiyaniBaat", start: 1170, end: 1200 },
  { key: "umumiBaat", start: 1200, end: 1230 },
  { key: "zikr", start: 1230, end: 1260 },
  { key: "misc", start: 1290, end: null },
] as const;

export type PresetKey = (typeof STANDARD_PROGRAMME)[number]["key"];
