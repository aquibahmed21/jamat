import type { Backend, BatchOp } from "./backend.ts";
import { DbError, toDbError } from "./errors.ts";
import { DB_NAME, DB_VERSION, runMigrations } from "./migrations.ts";

type Work<T> = (store: IDBObjectStore, tx: IDBTransaction, fail: (e: DbError) => void) => IDBRequest<T> | void;

class IdbBackend implements Backend {
  private db: IDBDatabase;
  constructor(db: IDBDatabase) { this.db = db; }

  /** Runs one transaction; resolves after it commits, rejects with a DbError if it aborts. */
  private run<T>(storeName: string | string[], mode: IDBTransactionMode, work: Work<T>): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = this.db.transaction(storeName, mode);
      } catch (e) {
        reject(toDbError(e));
        return;
      }
      let result: T | undefined;
      let failure: DbError | undefined;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? toDbError(tx.error));
      try {
        const first = Array.isArray(storeName) ? storeName[0]! : storeName;
        const req = work(tx.objectStore(first), tx, (e) => { failure = e; });
        if (req) req.onsuccess = () => { result = req.result; };
      } catch (e) {
        failure = toDbError(e);
        try { tx.abort(); } catch { /* already finished */ }
      }
    });
  }

  async get(store: string, id: string): Promise<unknown | undefined> {
    return this.run(store, "readonly", (s) => s.get(id));
  }

  async getAll(store: string): Promise<unknown[]> {
    return (await this.run(store, "readonly", (s) => s.getAll())) ?? [];
  }

  async getByIndex(store: string, index: string, key: string | number): Promise<unknown[]> {
    return (await this.run(store, "readonly", (s) => s.index(index).getAll(key))) ?? [];
  }

  async add(store: string, value: { id: string }): Promise<void> {
    await this.run(store, "readwrite", (s, _tx, fail) => {
      const req = s.add(value);
      req.onerror = () => fail(toDbError(req.error));
    });
  }

  async replace(store: string, value: { id: string }): Promise<void> {
    await this.run(store, "readwrite", (s, tx, fail) => {
      const probe = s.getKey(value.id);
      probe.onsuccess = () => {
        if (probe.result === undefined) {
          fail(new DbError("notFound", { store, id: value.id }));
          tx.abort();
        } else {
          s.put(value);
        }
      };
    });
  }

  async remove(store: string, id: string): Promise<boolean> {
    let existed = false;
    await this.run(store, "readwrite", (s) => {
      const probe = s.getKey(id);
      probe.onsuccess = () => {
        existed = probe.result !== undefined;
        if (existed) s.delete(id);
      };
    });
    return existed;
  }

  async batch(ops: readonly BatchOp[]): Promise<void> {
    if (ops.length === 0) return;
    const stores = [...new Set(ops.map((o) => o.store))];
    await this.run(stores, "readwrite", (_s, tx, fail) => {
      const abort = (e: DbError) => { fail(e); tx.abort(); };
      // Sequential on purpose: later operations may depend on earlier ones (same record, same store).
      const step = (i: number): void => {
        const o = ops[i];
        if (!o) return;
        const store = tx.objectStore(o.store);
        if (o.op === "add") {
          const req = store.add(o.value);
          req.onsuccess = () => step(i + 1);
          req.onerror = () => abort(toDbError(req.error));
        } else if (o.op === "replace") {
          const probe = store.getKey(o.value.id);
          probe.onsuccess = () => {
            if (probe.result === undefined) { abort(new DbError("notFound", { store: o.store, id: o.value.id })); return; }
            const put = store.put(o.value);
            put.onsuccess = () => step(i + 1);
          };
        } else {
          const del = store.delete(o.id);
          del.onsuccess = () => step(i + 1);
        }
      };
      step(0);
    });
  }

  close(): void { this.db.close(); }
}

/** Some browsers throw (not just return undefined) when storage is blocked. */
function defaultFactory(): IDBFactory | null {
  try { return globalThis.indexedDB ?? null; } catch { return null; }
}

/**
 * Opens (and if needed upgrades) the database. Never deletes or resets existing data:
 * a newer on-disk version, blocked upgrades and failed migrations are reported as DbError.
 */
export function openIdb(factory: IDBFactory | null = defaultFactory()): Promise<Backend> {
  return new Promise((resolve, reject) => {
    if (!factory) { reject(new DbError("unavailable")); return; }
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(toDbError(e));
      return;
    }
    let settled = false;
    let upgradeFailed = false;
    const fail = (e: DbError) => { if (!settled) { settled = true; reject(e); } };

    req.onupgradeneeded = (ev) => {
      const tx = req.transaction!;
      try {
        runMigrations(req.result, tx, ev.oldVersion, ev.newVersion ?? DB_VERSION);
      } catch {
        upgradeFailed = true;
        tx.abort();
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (settled) { db.close(); return; } // we already reported "blocked"
      db.onversionchange = () => db.close(); // let a newer tab upgrade
      settled = true;
      resolve(new IdbBackend(db));
    };
    req.onerror = () => fail(upgradeFailed ? new DbError("upgradeFailed") : toDbError(req.error));
    req.onblocked = () => fail(new DbError("blocked"));
  });
}
