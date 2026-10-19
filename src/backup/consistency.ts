import { periodsOverlap } from "../domain/ameer.ts";
import { findProblems } from "../domain/ledger.ts";
import type { Records } from "./records.ts";

/**
 * Business-rule problems present in a set of records, as stable keys. Used to warn about a backup file and to
 * refuse a merge that would introduce NEW problems (existing ones are not the merge's fault).
 */
export function consistencyKeys(r: Records): Set<string> {
  const keys = new Set<string>();
  for (const j of r.jamaats) {
    const members = r.members.filter((m) => m.jamaatId === j.id);
    for (const p of findProblems(r.expenses.filter((e) => e.jamaatId === j.id), members)) keys.add(`ledger:${p.expenseId}:${p.code}`);

    const seen = new Set<string>();
    for (const m of members) {
      const k = m.name.trim().toLowerCase();
      if (seen.has(k)) keys.add(`member:${j.id}:${k}`);
      seen.add(k);
    }
    const appts = r.appointments.filter((a) => a.jamaatId === j.id);
    for (let i = 0; i < appts.length; i++) {
      for (let k = i + 1; k < appts.length; k++) {
        const a = appts[i]!;
        const b = appts[k]!;
        if (a.kind === b.kind && periodsOverlap(a, b)) keys.add(`ameer:${[a.id, b.id].sort().join("|")}`);
      }
    }
  }
  const places = new Set<string>();
  for (const p of r.places) {
    const k = p.name.trim().toLowerCase();
    if (places.has(k)) keys.add(`place:${k}`);
    places.add(k);
  }
  return keys;
}
