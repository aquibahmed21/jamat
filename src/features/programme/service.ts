import type { Db } from "../../db/index.ts";
import { DbError } from "../../db/errors.ts";
import type { ProgrammeActivity } from "../../model/types.ts";
import { newId } from "../../model/id.ts";
import { validateActivity, type Result } from "../../model/validate.ts";
import { nextOrder, reorderChanges, sortActivities, STANDARD_PROGRAMME, type PresetKey } from "../../domain/timetable.ts";

export async function loadProgramme(db: Db, jamaatId: string) {
  const l = await db.activities.listBy("jamaatId", jamaatId);
  return { items: sortActivities(l.items), malformed: l.malformed };
}

export async function saveActivity(db: Db, input: unknown, isNew: boolean, expectedUpdatedAt?: number): Promise<Result<ProgrammeActivity>> {
  const v = validateActivity(input);
  if (!v.ok) return v;
  const jamaat = await db.jamaats.get(v.value.jamaatId);
  if (!jamaat) throw new DbError("notFound", { store: "jamaats", id: v.value.jamaatId });
  const members = await db.members.listBy("jamaatId", jamaat.id);
  if (v.value.responsibleIds.some((id) => !members.items.some((m) => m.id === id))) {
    return { ok: false, issues: [{ field: "responsibleIds", code: "notAMember" }] };
  }
  if (isNew) await db.activities.add(v.value);
  else await db.activities.update(v.value, expectedUpdatedAt);
  return v;
}

export async function deleteActivity(db: Db, id: string): Promise<void> {
  await db.activities.remove(id);
}

/** Persists a new display order atomically (only records whose order changed are written). */
export async function applyOrder(db: Db, before: readonly ProgrammeActivity[], ordered: readonly ProgrammeActivity[]): Promise<void> {
  const changes = reorderChanges(before, ordered, Date.now());
  if (changes.length > 0) await db.batch(changes.map((c) => db.activities.updateOp(c)));
}

/** Appends the standard activities (user-initiated); existing activities are untouched. Atomic. */
export async function addStandardProgramme(
  db: Db, jamaatId: string, titles: Record<PresetKey, string>, existing: readonly ProgrammeActivity[],
): Promise<number> {
  const jamaat = await db.jamaats.get(jamaatId);
  if (!jamaat) throw new DbError("notFound", { store: "jamaats", id: jamaatId });
  const now = Date.now();
  const first = nextOrder(existing);
  const ops = STANDARD_PROGRAMME.map((p, i) =>
    db.activities.addOp({
      id: newId(), jamaatId, title: titles[p.key], startMin: p.start, endMin: p.end, location: "",
      responsibleIds: [], order: first + i, notes: "", createdAt: now, updatedAt: now,
    }),
  );
  await db.batch(ops);
  return ops.length;
}
