import type { Db } from "../../db/index.ts";
import { DbError } from "../../db/errors.ts";
import type { Jamaat, Member } from "../../model/types.ts";
import { validateJamaat, validateMember, type Result } from "../../model/validate.ts";
import { jamaatConflicts, memberConflicts } from "../../domain/members.ts";

/** The app manages a single Jamaat profile. */
export async function loadJamaat(db: Db): Promise<{ jamaat: Jamaat | null; malformed: number }> {
  const { items, malformed } = await db.jamaats.list();
  const jamaat = [...items].sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
  return { jamaat, malformed: malformed.length };
}

/** Returns validation issues (to show on fields) or the saved record; storage problems throw DbError. */
export async function saveJamaat(db: Db, input: unknown, isNew: boolean): Promise<Result<Jamaat>> {
  const v = validateJamaat(input);
  if (!v.ok) return v;
  if (isNew) {
    const cur = await db.jamaats.list();
    if (cur.items.length > 0 || cur.malformed.length > 0) throw new DbError("exists", { store: "jamaats" });
  }
  const members = await db.members.listBy("jamaatId", v.value.id);
  const issues = jamaatConflicts(v.value, members.items);
  if (issues.length > 0) return { ok: false, issues };
  if (isNew) await db.jamaats.add(v.value);
  else await db.jamaats.update(v.value);
  return v;
}

export async function saveMember(db: Db, input: unknown, isNew: boolean): Promise<Result<Member>> {
  const v = validateMember(input);
  if (!v.ok) return v;
  const jamaat = await db.jamaats.get(v.value.jamaatId);
  if (!jamaat) throw new DbError("notFound", { store: "jamaats", id: v.value.jamaatId });
  const siblings = await db.members.listBy("jamaatId", jamaat.id);
  const issues = memberConflicts(v.value, jamaat, siblings.items);
  if (issues.length > 0) return { ok: false, issues };
  if (isNew) await db.members.add(v.value);
  else await db.members.update(v.value);
  return v;
}

/** Number of other records that point at this member. */
export async function memberUsage(db: Db, memberId: string): Promise<number> {
  const has = (ids: readonly string[]) => ids.includes(memberId);
  const [appts, expenses, allocs, acts, meets] = await Promise.all([
    db.appointments.listBy("memberId", memberId),
    db.expenses.list(),
    db.allocations.list(),
    db.activities.list(),
    db.mulaqaat.list(),
  ]);
  return (
    appts.items.length +
    expenses.items.filter((e) => e.payerId === memberId || e.counterpartyId === memberId || has(e.participantIds)).length +
    allocs.items.filter((a) => a.beneficiaryId === memberId || a.owedById === memberId || a.bearerId === memberId).length +
    acts.items.filter((a) => has(a.responsibleIds)).length +
    meets.items.filter((m) => has(m.personIds)).length
  );
}

/** Refuses (DbError "inUse") when other records reference the member; set a leave time instead. */
export async function deleteMember(db: Db, id: string): Promise<void> {
  if ((await memberUsage(db, id)) > 0) throw new DbError("inUse", { store: "members", id });
  await db.members.remove(id);
}

/** Deletes the Jamaat and its members, unless other records still belong to the Jamaat. */
export async function deleteJamaat(db: Db, id: string): Promise<void> {
  const [appts, expenses, acts, meets] = await Promise.all([
    db.appointments.listBy("jamaatId", id),
    db.expenses.listBy("jamaatId", id),
    db.activities.listBy("jamaatId", id),
    db.mulaqaat.listBy("jamaatId", id),
  ]);
  const linked = [appts, expenses, acts, meets].some((l) => l.items.length + l.malformed.length > 0);
  if (linked) throw new DbError("inUse", { store: "jamaats", id });
  const members = await db.members.listBy("jamaatId", id);
  for (const m of members.items) await deleteMember(db, m.id);
  await db.jamaats.remove(id);
}

/** Members of a Jamaat in a stable, name-based order (store order is by random id). */
export async function listMembers(db: Db, jamaatId: string) {
  const l = await db.members.listBy("jamaatId", jamaatId);
  return { items: [...l.items].sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1)), malformed: l.malformed };
}
