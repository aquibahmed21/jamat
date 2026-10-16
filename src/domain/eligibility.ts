import type { Jamaat, Member } from "../model/types.ts";

// Presence rule: a member is present over the half-open interval [joinAt, leaveAt).
// Joining at instant t counts as present at t; leaving at instant t counts as absent at t.
// leaveAt === null means still present (open-ended).
type Span = Pick<Member, "joinAt" | "leaveAt">;

export function isPresentAt(m: Span, t: number): boolean {
  return t >= m.joinAt && (m.leaveAt === null || t < m.leaveAt);
}

/** Milliseconds a member was present within [from, to). Zero for empty or reversed windows. */
export function presenceOverlapMs(m: Span, from: number, to: number): number {
  if (to <= from) return 0;
  const end = m.leaveAt === null ? to : Math.min(to, m.leaveAt);
  return Math.max(0, end - Math.max(from, m.joinAt));
}

export interface AttendanceStatus {
  late: boolean;
  early: boolean;
  lateByMs: number;
  earlyByMs: number;
}

/**
 * Late arrival: joined after the Jamaat started.
 * Early departure: left before the Jamaat's known end (not defined while the Jamaat is open-ended).
 */
export function attendanceStatus(m: Span, jamaat: Pick<Jamaat, "startAt" | "endAt">): AttendanceStatus {
  const lateByMs = Math.max(0, m.joinAt - jamaat.startAt);
  const earlyByMs =
    m.leaveAt !== null && jamaat.endAt !== null ? Math.max(0, jamaat.endAt - m.leaveAt) : 0;
  return { late: lateByMs > 0, early: earlyByMs > 0, lateByMs, earlyByMs };
}
