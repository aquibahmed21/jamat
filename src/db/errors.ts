import type { ValidationIssue } from "../model/validate.ts";

export const DB_ERROR_CODES = [
  "unavailable", "blocked", "newerVersion", "upgradeFailed", "transaction",
  "quota", "malformed", "exists", "notFound", "inUse", "invalid", "unknown",
] as const;
export type DbErrorCode = (typeof DB_ERROR_CODES)[number];

/** Storage failure. UI text comes from gt().errors.db[code]; the code is the only message here. */
export class DbError extends Error {
  code: DbErrorCode;
  store?: string;
  id?: string;
  issues?: ValidationIssue[];

  constructor(code: DbErrorCode, extra: { store?: string; id?: string; issues?: ValidationIssue[] } = {}) {
    super(code);
    this.name = "DbError";
    this.code = code;
    if (extra.store !== undefined) this.store = extra.store;
    if (extra.id !== undefined) this.id = extra.id;
    if (extra.issues !== undefined) this.issues = extra.issues;
  }
}

/** Maps any thrown value (DOMException etc.) to a DbError. */
export function toDbError(e: unknown): DbError {
  if (e instanceof DbError) return e;
  const name = (e as { name?: string } | null)?.name;
  switch (name) {
    case "QuotaExceededError": return new DbError("quota");
    case "ConstraintError": return new DbError("exists");
    case "VersionError": return new DbError("newerVersion");
    case "SecurityError":
    case "InvalidStateError": return new DbError("unavailable");
    case "AbortError":
    case "TransactionInactiveError": return new DbError("transaction");
    default: return new DbError("unknown");
  }
}
