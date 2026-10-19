import type { Jamaat } from "../model/types.ts";
import type { ValidationIssue } from "../model/validate.ts";

/**
 * Rule shared by members, Ameer appointments and mulaqaat: a period must start inside the Jamaat period and, when the
 * Jamaat has an end, not run past it. `endAt` null means open-ended / a single instant.
 * Boundaries: starting exactly at the Jamaat start is fine; starting exactly at the Jamaat end is not (it is exclusive).
 */
export function periodIssues(
  startField: string, startAt: number, endField: string, endAt: number | null, jamaat: Pick<Jamaat, "startAt" | "endAt">,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (startAt < jamaat.startAt) issues.push({ field: startField, code: "beforeJamaatStart" });
  if (jamaat.endAt !== null) {
    if (startAt >= jamaat.endAt) issues.push({ field: startField, code: "afterJamaatEnd" });
    if (endAt !== null && endAt > jamaat.endAt) issues.push({ field: endField, code: "afterJamaatEnd" });
  }
  return issues;
}
