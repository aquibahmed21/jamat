import type { Jamaat, Member } from "../model/types.ts";
import type { ValidationIssue } from "../model/validate.ts";

const nameKey = (name: string) => name.trim().toLowerCase();

/** Rules that need context: the member must fit inside the Jamaat period and have a unique name. */
export function memberConflicts(m: Member, jamaat: Jamaat, siblings: readonly Member[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (m.joinAt < jamaat.startAt) issues.push({ field: "joinAt", code: "beforeJamaatStart" });
  if (jamaat.endAt !== null) {
    if (m.joinAt >= jamaat.endAt) issues.push({ field: "joinAt", code: "afterJamaatEnd" });
    if (m.leaveAt !== null && m.leaveAt > jamaat.endAt) issues.push({ field: "leaveAt", code: "afterJamaatEnd" });
  }
  if (siblings.some((s) => s.id !== m.id && nameKey(s.name) === nameKey(m.name))) {
    issues.push({ field: "name", code: "duplicateName" });
  }
  return issues;
}

/** A Jamaat period change must not leave existing members outside it. */
export function jamaatConflicts(j: Jamaat, members: readonly Member[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (members.some((m) => m.joinAt < j.startAt)) issues.push({ field: "startAt", code: "conflictsWithMembers" });
  if (j.endAt !== null && members.some((m) => m.joinAt >= j.endAt! || (m.leaveAt !== null && m.leaveAt > j.endAt!))) {
    issues.push({ field: "endAt", code: "conflictsWithMembers" });
  }
  return issues;
}
