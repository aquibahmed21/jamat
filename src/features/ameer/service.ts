import type { Db } from "../../db/index.ts";
import { DbError } from "../../db/errors.ts";
import type { AmeerAppointment } from "../../model/types.ts";
import { validateAppointment, type Result } from "../../model/validate.ts";
import { appointmentConflicts } from "../../domain/ameer.ts";

export async function saveAppointment(db: Db, input: unknown, isNew: boolean): Promise<Result<AmeerAppointment>> {
  const v = validateAppointment(input);
  if (!v.ok) return v;
  const jamaat = await db.jamaats.get(v.value.jamaatId);
  if (!jamaat) throw new DbError("notFound", { store: "jamaats", id: v.value.jamaatId });
  const [members, all] = await Promise.all([
    db.members.listBy("jamaatId", jamaat.id),
    db.appointments.listBy("jamaatId", jamaat.id),
  ]);
  const others = all.items.filter((a) => a.id !== v.value.id);
  const issues = appointmentConflicts(v.value, others, jamaat, members.items);
  if (issues.length > 0) return { ok: false, issues };
  if (isNew) await db.appointments.add(v.value);
  else await db.appointments.update(v.value);
  return v;
}

/** Explicit removal (the UI confirms first). */
export async function deleteAppointment(db: Db, id: string): Promise<void> {
  await db.appointments.remove(id);
}
