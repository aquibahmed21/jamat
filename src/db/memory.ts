import type { Backend, BatchOp } from "./backend.ts";
import { DbError } from "./errors.ts";

/** In-memory Backend with the same semantics as the IndexedDB one (used for tests). */
export class MemoryBackend implements Backend {
  private data = new Map<string, Map<string, unknown>>();

  private table(store: string): Map<string, unknown> {
    let t = this.data.get(store);
    if (!t) this.data.set(store, (t = new Map()));
    return t;
  }

  async get(store: string, id: string): Promise<unknown | undefined> {
    const v = this.table(store).get(id);
    return v === undefined ? undefined : structuredClone(v);
  }

  async getAll(store: string): Promise<unknown[]> {
    return [...this.table(store).values()].map((v) => structuredClone(v));
  }

  async getByIndex(store: string, index: string, key: string | number): Promise<unknown[]> {
    return (await this.getAll(store)).filter((v) => (v as Record<string, unknown>)[index] === key);
  }

  async add(store: string, value: { id: string }): Promise<void> {
    const t = this.table(store);
    if (t.has(value.id)) throw new DbError("exists", { store, id: value.id });
    t.set(value.id, structuredClone(value));
  }

  async replace(store: string, value: { id: string }): Promise<void> {
    const t = this.table(store);
    if (!t.has(value.id)) throw new DbError("notFound", { store, id: value.id });
    t.set(value.id, structuredClone(value));
  }

  async remove(store: string, id: string): Promise<boolean> {
    return this.table(store).delete(id);
  }

  async batch(ops: readonly BatchOp[]): Promise<void> {
    const snapshot = new Map([...this.data].map(([k, v]) => [k, new Map(v)]));
    try {
      for (const o of ops) {
        if (o.op === "add") await this.add(o.store, o.value);
        else if (o.op === "replace") await this.replace(o.store, o.value);
        else await this.remove(o.store, o.id);
      }
    } catch (e) {
      this.data = snapshot;
      throw e;
    }
  }

  close(): void {}
}
