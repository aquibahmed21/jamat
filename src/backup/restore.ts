import type { BatchOp } from "../db/backend.ts";
import { DbError } from "../db/errors.ts";
import { STORE_NAMES, type Db, type StoreName } from "../db/index.ts";
import { consistencyKeys } from "./consistency.ts";
import { countRecords, loadRecords, totalOf, type Counts, type Records } from "./records.ts";

export type RestoreMode = "replace" | "merge";

export interface StoreDelta {
  /** Records in the file that are not on this device yet. */
  add: number;
  /** Same id and identical content. */
  same: number;
  /** Same id but different content: the current version is kept. */
  conflict: number;
}

export type MergeUnavailable = "differentJamaat" | "wouldBreakRules" | "nothingHere";

export interface RestorePlan {
  current: Counts;
  incoming: Counts;
  currentTotal: number;
  incomingTotal: number;
  merge: { available: true; delta: Record<StoreName, StoreDelta>; addTotal: number } | { available: false; reason: MergeUnavailable };
}

type Row = { id: string };
const rows = (r: Records, s: StoreName) => r[s] as Row[];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function mergeDelta(incoming: Records, current: Records): Record<StoreName, StoreDelta> {
  const out = {} as Record<StoreName, StoreDelta>;
  for (const s of STORE_NAMES) {
    const have = new Map(rows(current, s).map((x) => [x.id, x]));
    const d: StoreDelta = { add: 0, same: 0, conflict: 0 };
    for (const x of rows(incoming, s)) {
      const mine = have.get(x.id);
      if (mine === undefined) d.add++;
      else if (same(mine, x)) d.same++;
      else d.conflict++;
    }
    out[s] = d;
  }
  return out;
}

function mergedRecords(incoming: Records, current: Records): Records {
  const out = {} as Records;
  for (const s of STORE_NAMES) {
    const have = new Set(rows(current, s).map((x) => x.id));
    (out as unknown as Record<string, Row[]>)[s] = [...rows(current, s), ...rows(incoming, s).filter((x) => !have.has(x.id))];
  }
  return out;
}

/**
 * What restoring would do. Replace is always possible. Merge only adds records that are missing (never overwrites)
 * and is offered only for the same Jamaat and only if it would not create new rule problems.
 */
export function planRestore(incoming: Records, current: Records): RestorePlan {
  const cur = countRecords(current);
  const inc = countRecords(incoming);
  const base = { current: cur, incoming: inc, currentTotal: totalOf(cur), incomingTotal: totalOf(inc) };
  if (base.currentTotal === 0) return { ...base, merge: { available: false, reason: "nothingHere" } };
  const known = new Set(current.jamaats.map((j) => j.id));
  if (incoming.jamaats.some((j) => !known.has(j.id))) return { ...base, merge: { available: false, reason: "differentJamaat" } };

  const merged = mergedRecords(incoming, current);
  const before = consistencyKeys(current);
  for (const k of consistencyKeys(merged)) {
    if (!before.has(k)) return { ...base, merge: { available: false, reason: "wouldBreakRules" } };
  }
  const delta = mergeDelta(incoming, current);
  return { ...base, merge: { available: true, delta, addTotal: STORE_NAMES.reduce((t, s) => t + delta[s].add, 0) } };
}

/**
 * Applies the restore in ONE atomic transaction: if anything fails, nothing at all has changed.
 * Returns the number of records written.
 */
export async function restore(db: Db, incoming: Records, mode: RestoreMode): Promise<number> {
  const { records: current } = await loadRecords(db);
  const ops: BatchOp[] = [];
  if (mode === "replace") {
    for (const s of STORE_NAMES) ops.push(db[s].clearOp());
    for (const s of STORE_NAMES) for (const x of rows(incoming, s)) ops.push(db[s].addOp(x));
  } else {
    if (!planRestore(incoming, current).merge.available) throw new DbError("invalid");
    for (const s of STORE_NAMES) {
      const have = new Set(rows(current, s).map((x) => x.id));
      for (const x of rows(incoming, s)) if (!have.has(x.id)) ops.push(db[s].addOp(x));
    }
  }
  await db.batch(ops);
  return ops.filter((o) => o.op === "add").length;
}
