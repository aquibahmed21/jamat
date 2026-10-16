// Versioned schema. Migrations are append-only and frozen once released:
// to change the schema, add a new function and bump DB_VERSION. A migration must
// only create or extend stores/indexes (or copy data) - never drop user data.
import { DbError } from "./errors.ts";

export const DB_NAME = "jamat";

type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

const v1: Migration = (db) => {
  const stores: Record<string, readonly string[]> = {
    jamaats: [],
    members: ["jamaatId"],
    appointments: ["jamaatId", "memberId"],
    expenses: ["jamaatId", "date"],
    allocations: ["expenseId"],
    activities: ["jamaatId"],
    places: [],
    mulaqaat: ["jamaatId", "placeId"],
  };
  for (const [name, indexes] of Object.entries(stores)) {
    const s = db.createObjectStore(name, { keyPath: "id" });
    for (const ix of indexes) s.createIndex(ix, ix);
  }
};

/** v2: append-only audit trail for financial records. */
const v2: Migration = (db) => {
  db.createObjectStore("audit", { keyPath: "id" }).createIndex("entityId", "entityId");
};

const MIGRATIONS: readonly Migration[] = [v1, v2];
export const DB_VERSION = MIGRATIONS.length;

export function runMigrations(db: IDBDatabase, tx: IDBTransaction, from: number, to: number): void {
  for (let v = from + 1; v <= to; v++) {
    const m = MIGRATIONS[v - 1];
    if (!m) throw new DbError("upgradeFailed");
    m(db, tx);
  }
}
