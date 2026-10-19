import type { AmeerAppointment, AppointmentKind, Jamaat, Member } from "../model/types.ts";
import type { ValidationIssue } from "../model/validate.ts";
import { periodIssues } from "./periods.ts";

// Ameer rules
// 1. An appointment is in effect over the half-open interval [startAt, endAt); endAt === null is open-ended.
//    At the endAt instant the appointment is no longer in effect; at startAt it is.
// 2. The effective Ameer at time t is derived, never stored: a temporary appointment in effect at t wins over
//    the permanent one. The permanent appointment is never modified by a temporary one.
// 3. Permanent appointments may not overlap each other; temporary appointments may not overlap each other.
//    A temporary appointment may overlap a permanent one (that is its purpose).
// 4. No appointment in effect at t means there is no Ameer at t (effectiveAmeer returns null).
// 5. The appointee must be a member of the Jamaat and the appointment must start inside the Jamaat period.
// 6. Appointments are history: they are listed, ordered and kept; changing the Ameer means adding a new appointment.
type Span = Pick<AmeerAppointment, "startAt" | "endAt">;

export interface EffectiveAmeer {
  memberId: string;
  appointmentId: string;
  kind: AppointmentKind;
}

export function isInEffect(a: Span, t: number): boolean {
  return t >= a.startAt && (a.endAt === null || t < a.endAt);
}

export function periodsOverlap(a: Span, b: Span): boolean {
  return a.startAt < (b.endAt ?? Infinity) && b.startAt < (a.endAt ?? Infinity);
}

/** Temporary first, then the most recently started, then id: a total order, so the result is deterministic. */
function precedence(a: AmeerAppointment, b: AmeerAppointment): number {
  const kind = (x: AmeerAppointment) => (x.kind === "temporary" ? 0 : 1);
  return kind(a) - kind(b) || b.startAt - a.startAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function effectiveAmeer(appointments: readonly AmeerAppointment[], t: number): EffectiveAmeer | null {
  const best = appointments.filter((a) => isInEffect(a, t)).sort(precedence)[0];
  return best ? { memberId: best.memberId, appointmentId: best.id, kind: best.kind } : null;
}

/** History order: oldest first; permanent before temporary when they start together. */
export function sortHistory(appointments: readonly AmeerAppointment[]): AmeerAppointment[] {
  return [...appointments].sort(
    (a, b) => a.startAt - b.startAt || (a.kind === b.kind ? 0 : a.kind === "permanent" ? -1 : 1) || (a.id < b.id ? -1 : 1),
  );
}

export interface AmeerSegment {
  from: number;
  to: number;
  ameer: EffectiveAmeer | null;
}

/** Who is the effective Ameer across [from, to)? Consecutive pieces with the same appointment are merged. */
export function ameerSegments(appointments: readonly AmeerAppointment[], from: number, to: number): AmeerSegment[] {
  if (to <= from) return [];
  const points = new Set<number>([from, to]);
  for (const a of appointments) {
    if (a.startAt > from && a.startAt < to) points.add(a.startAt);
    if (a.endAt !== null && a.endAt > from && a.endAt < to) points.add(a.endAt);
  }
  const sorted = [...points].sort((x, y) => x - y);
  const out: AmeerSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const ameer = effectiveAmeer(appointments, sorted[i]!);
    const last = out[out.length - 1];
    if (last && last.ameer?.appointmentId === ameer?.appointmentId) last.to = sorted[i + 1]!;
    else out.push({ from: sorted[i]!, to: sorted[i + 1]!, ameer });
  }
  return out;
}

/** Context rules for a new or edited appointment. `others` must exclude the appointment being edited. */
export function appointmentConflicts(
  a: AmeerAppointment,
  others: readonly AmeerAppointment[],
  jamaat: Jamaat,
  members: readonly Member[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!members.some((m) => m.id === a.memberId)) issues.push({ field: "memberId", code: "notAMember" });
  issues.push(...periodIssues("startAt", a.startAt, "endAt", a.endAt, jamaat));
  if (others.some((o) => o.kind === a.kind && periodsOverlap(o, a))) issues.push({ field: "startAt", code: "overlap" });
  return issues;
}
