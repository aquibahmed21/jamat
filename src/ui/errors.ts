import { toDbError } from "../db/errors.ts";
import { gt } from "../guitext.ts";

/** User-facing text for any thrown storage error. */
export function errorText(e: unknown): string {
  return gt().errors.db[toDbError(e).code];
}
