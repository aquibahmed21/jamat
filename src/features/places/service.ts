import type { Db } from "../../db/index.ts";
import { DbError } from "../../db/errors.ts";
import type { Mulaqaat, Place } from "../../model/types.ts";
import { validateMulaqaat, validatePlace, type Result } from "../../model/validate.ts";
import { mulaqaatConflicts, placeConflicts } from "../../domain/places.ts";

export async function loadPlaces(db: Db) {
  const l = await db.places.list();
  return { items: [...l.items].sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1)), malformed: l.malformed };
}

export async function savePlace(db: Db, input: unknown, isNew: boolean): Promise<Result<Place>> {
  const v = validatePlace(input);
  if (!v.ok) return v;
  const issues = placeConflicts(v.value, (await db.places.list()).items);
  if (issues.length > 0) return { ok: false, issues };
  if (isNew) await db.places.add(v.value);
  else await db.places.update(v.value);
  return v;
}

/** Refuses (DbError "inUse") while meetings were recorded at the place. */
export async function deletePlace(db: Db, id: string): Promise<void> {
  const used = await db.mulaqaat.listBy("placeId", id);
  if (used.items.length + used.malformed.length > 0) throw new DbError("inUse", { store: "places", id });
  await db.places.remove(id);
}

export async function loadMulaqaat(db: Db, jamaatId: string) {
  const l = await db.mulaqaat.listBy("jamaatId", jamaatId);
  return { items: [...l.items].sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : 1)), malformed: l.malformed };
}

export async function saveMulaqaat(db: Db, input: unknown, isNew: boolean): Promise<Result<Mulaqaat>> {
  const v = validateMulaqaat(input);
  if (!v.ok) return v;
  const jamaat = await db.jamaats.get(v.value.jamaatId);
  if (!jamaat) throw new DbError("notFound", { store: "jamaats", id: v.value.jamaatId });
  const [members, places] = await Promise.all([db.members.listBy("jamaatId", jamaat.id), db.places.list()]);
  const issues = mulaqaatConflicts(v.value, jamaat, members.items, places.items);
  if (issues.length > 0) return { ok: false, issues };
  if (isNew) await db.mulaqaat.add(v.value);
  else await db.mulaqaat.update(v.value);
  return v;
}

export async function deleteMulaqaat(db: Db, id: string): Promise<void> {
  await db.mulaqaat.remove(id);
}
