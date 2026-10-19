import type { Backend, BatchOp, StoreDef } from "./backend.ts";
import { DbError } from "./errors.ts";
import type { ValidationIssue } from "../model/validate.ts";

export interface Malformed {
  id: string | null;
  issues: ValidationIssue[];
}
export interface Listing<T> {
  items: T[];
  /** Stored records that failed validation. They are reported, never deleted or hidden silently. */
  malformed: Malformed[];
}

/** Typed, validated access to one store. Writes are validated; reads are re-validated. */
export class Repo<T extends { id: string }> {
  private backend: Backend;
  private def: StoreDef<T>;

  constructor(backend: Backend, def: StoreDef<T>) {
    this.backend = backend;
    this.def = def;
  }

  private checked(input: unknown): T {
    const r = this.def.validate(input);
    if (!r.ok) throw new DbError("invalid", { store: this.def.name, issues: r.issues });
    return r.value;
  }

  private read(raw: unknown): { ok: true; value: T } | { ok: false; bad: Malformed } {
    const r = this.def.validate(raw);
    if (r.ok) return r;
    const id = (raw as { id?: unknown } | null)?.id;
    return { ok: false, bad: { id: typeof id === "string" ? id : null, issues: r.issues } };
  }

  private toListing(rows: unknown[]): Listing<T> {
    const out: Listing<T> = { items: [], malformed: [] };
    for (const raw of rows) {
      const r = this.read(raw);
      if (r.ok) out.items.push(r.value);
      else out.malformed.push(r.bad);
    }
    return out;
  }

  async get(id: string): Promise<T | null> {
    const raw = await this.backend.get(this.def.name, id);
    if (raw === undefined) return null;
    const r = this.read(raw);
    if (!r.ok) throw new DbError("malformed", { store: this.def.name, id, issues: r.bad.issues });
    return r.value;
  }

  async list(): Promise<Listing<T>> {
    return this.toListing(await this.backend.getAll(this.def.name));
  }

  async listBy(index: string, key: string | number): Promise<Listing<T>> {
    if (!this.def.indexes.includes(index)) throw new DbError("unknown", { store: this.def.name });
    return this.toListing(await this.backend.getByIndex(this.def.name, index, key));
  }

  /** Creates a record; fails if the id exists. */
  async add(input: unknown): Promise<T> {
    const v = this.checked(input);
    await this.backend.add(this.def.name, v);
    return v;
  }

  /**
   * Replaces an existing record; fails if it does not exist. When `expectedUpdatedAt` is given the stored record must
   * still carry that timestamp, otherwise another tab/device changed it meanwhile (DbError "conflict"): no silent overwrite.
   */
  async update(input: unknown, expectedUpdatedAt?: number): Promise<T> {
    const v = this.checked(input);
    if (expectedUpdatedAt !== undefined) await this.assertUnchanged(v.id, expectedUpdatedAt);
    await this.backend.replace(this.def.name, v);
    return v;
  }

  /** Throws "notFound" / "conflict" unless the stored record exists and still has `expectedUpdatedAt`. */
  async assertUnchanged(id: string, expectedUpdatedAt: number): Promise<void> {
    const raw = (await this.backend.get(this.def.name, id)) as { updatedAt?: unknown } | undefined;
    if (raw === undefined) throw new DbError("notFound", { store: this.def.name, id });
    if (raw.updatedAt !== expectedUpdatedAt) throw new DbError("conflict", { store: this.def.name, id });
  }

  /** Validated operations for Db.batch (atomic multi-record writes). */
  addOp(input: unknown): BatchOp {
    return { op: "add", store: this.def.name, value: this.checked(input) };
  }

  updateOp(input: unknown): BatchOp {
    return { op: "replace", store: this.def.name, value: this.checked(input) };
  }

  clearOp(): BatchOp {
    return { op: "clear", store: this.def.name };
  }

  removeOp(id: string): BatchOp {
    return { op: "remove", store: this.def.name, id };
  }

  remove(id: string): Promise<boolean> {
    return this.backend.remove(this.def.name, id);
  }
}
