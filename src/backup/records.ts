import type {
  Allocation, AmeerAppointment, AuditEntry, Expense, Jamaat, Member, Mulaqaat, Place, ProgrammeActivity,
} from "../model/types.ts";
import { STORE_NAMES, type Db, type StoreName } from "../db/index.ts";

/** Every record of the application, by store. */
export interface Records {
  jamaats: Jamaat[];
  members: Member[];
  places: Place[];
  appointments: AmeerAppointment[];
  expenses: Expense[];
  allocations: Allocation[];
  activities: ProgrammeActivity[];
  mulaqaat: Mulaqaat[];
  audit: AuditEntry[];
}

export type Counts = Record<StoreName, number>;

export function emptyRecords(): Records {
  return { jamaats: [], members: [], places: [], appointments: [], expenses: [], allocations: [], activities: [], mulaqaat: [], audit: [] };
}

export function countRecords(r: Records): Counts {
  return Object.fromEntries(STORE_NAMES.map((s) => [s, r[s].length])) as Counts;
}

export const totalOf = (c: Counts): number => STORE_NAMES.reduce((t, s) => t + c[s], 0);

/** Reads everything from the database. Damaged (invalid) stored records are counted, not returned. */
export async function loadRecords(db: Db): Promise<{ records: Records; malformed: number }> {
  const records = emptyRecords();
  let malformed = 0;
  for (const name of STORE_NAMES) {
    const l = await db[name].list();
    (records as unknown as Record<string, unknown[]>)[name] = l.items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    malformed += l.malformed.length;
  }
  return { records, malformed };
}
