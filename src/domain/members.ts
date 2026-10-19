import type { AmeerAppointment, Jamaat, Member, Mulaqaat } from "../model/types.ts";
import type { ValidationIssue } from "../model/validate.ts";
import { periodIssues } from "./periods.ts";

const nameKey = (name: string) => name.trim().toLowerCase();

/** Rules that need context: the member must fit inside the Jamaat period and have a unique name. */
export function memberConflicts(m: Member, jamaat: Jamaat, siblings: readonly Member[]): ValidationIssue[] {
  const issues = periodIssues("joinAt", m.joinAt, "leaveAt", m.leaveAt, jamaat);
  if (siblings.some((s) => s.id !== m.id && nameKey(s.name) === nameKey(m.name))) {
    issues.push({ field: "name", code: "duplicateName" });
  }
  return issues;
}

/** A Jamaat period change must not leave existing members, appointments or meetings outside it. */
export function jamaatConflicts(
  j: Jamaat, members: readonly Member[], appointments: readonly AmeerAppointment[] = [], meetings: readonly Mulaqaat[] = [],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (field: string, code: ValidationIssue["code"]) => {
    if (!issues.some((i) => i.field === field && i.code === code)) issues.push({ field, code });
  };
  // Which Jamaat boundary is violated: starting too early blames the Jamaat start, running late blames its end.
  const outside = (start: number, end: number | null): ("startAt" | "endAt")[] =>
    periodIssues("s", start, "e", end, j).map((i) => (i.code === "beforeJamaatStart" ? "startAt" : "endAt"));
  for (const m of members) for (const f of outside(m.joinAt, m.leaveAt === null ? null : m.leaveAt)) add(f, "conflictsWithMembers");
  for (const a of appointments) for (const f of outside(a.startAt, a.endAt)) add(f, "conflictsWithRecords");
  for (const x of meetings) for (const f of outside(x.at, null)) add(f, "conflictsWithRecords");
  return issues;
}
