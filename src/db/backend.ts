import type { Result } from "../model/validate.ts";

/** Raw record storage. Records are keyed by their `id` field. */
export interface Backend {
  get(store: string, id: string): Promise<unknown | undefined>;
  getAll(store: string): Promise<unknown[]>;
  getByIndex(store: string, index: string, key: string | number): Promise<unknown[]>;
  /** Fails with DbError("exists") if the id is already stored; never overwrites. */
  add(store: string, value: { id: string }): Promise<void>;
  /** Replaces an existing record; fails with DbError("notFound") if absent. */
  replace(store: string, value: { id: string }): Promise<void>;
  /** Applies all operations in one transaction: either every one succeeds or none is applied. */
  batch(ops: readonly BatchOp[]): Promise<void>;
  /** Returns whether a record was removed. */
  remove(store: string, id: string): Promise<boolean>;
  close(): void;
}

export type BatchOp =
  | { op: "add"; store: string; value: { id: string } }
  | { op: "replace"; store: string; value: { id: string } }
  | { op: "remove"; store: string; id: string };

export interface StoreDef<T extends { id: string }> {
  name: string;
  /** Indexed field names (must exist in the schema in migrations.ts). */
  indexes: readonly string[];
  validate(input: unknown): Result<T>;
}
