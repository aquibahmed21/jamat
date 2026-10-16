import type { Backend, BatchOp, StoreDef } from "./backend.ts";
import { Repo } from "./repo.ts";
import { openIdb } from "./idb.ts";
import type {
  Allocation, AmeerAppointment, AuditEntry, Expense, Jamaat, Member, Mulaqaat, Place, ProgrammeActivity,
} from "../model/types.ts";
import {
  validateActivity, validateAllocation, validateAppointment, validateAudit, validateExpense, validateJamaat,
  validateMember, validateMulaqaat, validatePlace,
} from "../model/validate.ts";

function def<T extends { id: string }>(name: string, indexes: readonly string[], validate: StoreDef<T>["validate"]): StoreDef<T> {
  return { name, indexes, validate };
}

export interface Db {
  jamaats: Repo<Jamaat>;
  members: Repo<Member>;
  appointments: Repo<AmeerAppointment>;
  expenses: Repo<Expense>;
  allocations: Repo<Allocation>;
  activities: Repo<ProgrammeActivity>;
  places: Repo<Place>;
  mulaqaat: Repo<Mulaqaat>;
  audit: Repo<AuditEntry>;
  /** Atomic multi-store write: all operations apply or none do. */
  batch(ops: readonly BatchOp[]): Promise<void>;
  close(): void;
}

export function createDb(backend: Backend): Db {
  return {
    jamaats: new Repo(backend, def("jamaats", [], validateJamaat)),
    members: new Repo(backend, def("members", ["jamaatId"], validateMember)),
    appointments: new Repo(backend, def("appointments", ["jamaatId", "memberId"], validateAppointment)),
    expenses: new Repo(backend, def("expenses", ["jamaatId", "date"], validateExpense)),
    allocations: new Repo(backend, def("allocations", ["expenseId"], validateAllocation)),
    activities: new Repo(backend, def("activities", ["jamaatId"], validateActivity)),
    places: new Repo(backend, def("places", [], validatePlace)),
    mulaqaat: new Repo(backend, def("mulaqaat", ["jamaatId", "placeId"], validateMulaqaat)),
    audit: new Repo(backend, def("audit", ["entityId"], validateAudit)),
    batch: (ops) => backend.batch(ops),
    close: () => backend.close(),
  };
}

/** Opens the real IndexedDB database. Rejects with DbError (e.g. "unavailable") - never resets data. */
export async function openDb(): Promise<Db> {
  return createDb(await openIdb());
}

let shared: Promise<Db> | null = null;

/** App-wide connection, opened once. A failed open is not cached, so callers can retry. */
export function getDb(): Promise<Db> {
  if (!shared) {
    shared = openDb().catch((e) => {
      shared = null;
      throw e;
    });
  }
  return shared;
}
