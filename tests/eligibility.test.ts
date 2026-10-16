import { test } from "node:test";
import assert from "node:assert/strict";
import { attendanceStatus, isPresentAt, presenceOverlapMs } from "../src/domain/eligibility.ts";
import { HOUR, T0 } from "./helpers.ts";

const span = (joinH: number, leaveH: number | null) => ({
  joinAt: T0 + joinH * HOUR,
  leaveAt: leaveH === null ? null : T0 + leaveH * HOUR,
});

test("presence is half-open: join instant included, leave instant excluded", () => {
  const m = span(2, 5);
  assert.equal(isPresentAt(m, T0 + 2 * HOUR - 1), false);
  assert.equal(isPresentAt(m, T0 + 2 * HOUR), true);
  assert.equal(isPresentAt(m, T0 + 5 * HOUR - 1), true);
  assert.equal(isPresentAt(m, T0 + 5 * HOUR), false);
});

test("open-ended member stays present", () => {
  const m = span(1, null);
  assert.equal(isPresentAt(m, T0), false);
  assert.equal(isPresentAt(m, T0 + 1000 * HOUR), true);
});

test("overlap: fully inside, partial, outside, touching, empty window", () => {
  const m = span(2, 5);
  assert.equal(presenceOverlapMs(m, T0, T0 + 10 * HOUR), 3 * HOUR);
  assert.equal(presenceOverlapMs(m, T0 + 3 * HOUR, T0 + 4 * HOUR), HOUR);
  assert.equal(presenceOverlapMs(m, T0 + 4 * HOUR, T0 + 8 * HOUR), HOUR); // early departure
  assert.equal(presenceOverlapMs(m, T0, T0 + 3 * HOUR), HOUR); // late arrival
  assert.equal(presenceOverlapMs(m, T0 + 5 * HOUR, T0 + 6 * HOUR), 0); // touching at leave
  assert.equal(presenceOverlapMs(m, T0, T0 + 2 * HOUR), 0); // touching at join
  assert.equal(presenceOverlapMs(m, T0 + 3 * HOUR, T0 + 3 * HOUR), 0);
  assert.equal(presenceOverlapMs(m, T0 + 4 * HOUR, T0 + 3 * HOUR), 0);
});

test("open-ended member overlap runs to the window end", () => {
  assert.equal(presenceOverlapMs(span(1, null), T0, T0 + 4 * HOUR), 3 * HOUR);
});

test("late arrival and early departure against a Jamaat period", () => {
  const j = { startAt: T0, endAt: T0 + 10 * HOUR };
  assert.deepEqual(attendanceStatus(span(0, 10), j), { late: false, early: false, lateByMs: 0, earlyByMs: 0 });
  assert.deepEqual(attendanceStatus(span(2, 10), j), { late: true, early: false, lateByMs: 2 * HOUR, earlyByMs: 0 });
  assert.deepEqual(attendanceStatus(span(0, 7), j), { late: false, early: true, lateByMs: 0, earlyByMs: 3 * HOUR });
  const both = attendanceStatus(span(1, 9), j);
  assert.ok(both.late && both.early);
  assert.equal(attendanceStatus(span(0, null), j).early, false); // still present
});

test("early departure is undefined while the Jamaat is open-ended", () => {
  const st = attendanceStatus(span(0, 3), { startAt: T0, endAt: null });
  assert.equal(st.early, false);
});
