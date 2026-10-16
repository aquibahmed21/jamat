import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/db/index.ts";
import { MemoryBackend } from "../src/db/memory.ts";
import { DbError } from "../src/db/errors.ts";
import { ameerSegments, appointmentConflicts, effectiveAmeer, isInEffect, periodsOverlap, sortHistory } from "../src/domain/ameer.ts";
import { deleteAppointment, saveAppointment } from "../src/features/ameer/service.ts";
import { saveJamaat, saveMember } from "../src/features/members/service.ts";
import * as f from "./helpers.ts";
import type { AmeerAppointment } from "../src/model/types.ts";

const H = f.HOUR;
const at = (h: number) => f.T0 + h * H;
const appt = (id: string, memberId: string, kind: "permanent" | "temporary", s: number, e: number | null): AmeerAppointment =>
  ({ ...f.appointment(), id, memberId, kind, startAt: at(s), endAt: e === null ? null : at(e) }) as AmeerAppointment;
const eff = (list: AmeerAppointment[], h: number) => effectiveAmeer(list, at(h))?.memberId ?? null;

test("boundaries: start inclusive, end exclusive", () => {
  const a = appt("a", "m1", "temporary", 2, 5);
  assert.equal(isInEffect(a, at(2) - 1), false);
  assert.equal(isInEffect(a, at(2)), true);
  assert.equal(isInEffect(a, at(5) - 1), true);
  assert.equal(isInEffect(a, at(5)), false);
});

test("permanent only; before start there is no Ameer", () => {
  const list = [appt("p", "m1", "permanent", 1, null)];
  assert.equal(eff(list, 0), null);
  assert.equal(eff(list, 1), "m1");
  assert.equal(eff(list, 999), "m1");
});

test("temporary overrides permanent only during its period; permanent is untouched", () => {
  const perm = appt("p", "m1", "permanent", 0, null);
  const list = [perm, appt("t", "m2", "temporary", 3, 6)];
  assert.equal(eff(list, 2), "m1");
  assert.equal(eff(list, 3), "m2"); // transition at the start instant
  assert.equal(eff(list, 6) , "m1"); // and back at the end instant
  assert.deepEqual(list[0], perm);
  assert.equal(effectiveAmeer(list, at(4))!.kind, "temporary");
});

test("permanent handover: closed one ends exactly when the next begins", () => {
  const list = [appt("p1", "m1", "permanent", 0, 5), appt("p2", "m2", "permanent", 5, null)];
  assert.equal(eff(list, 4), "m1");
  assert.equal(eff(list, 5), "m2");
});

test("gap between permanent appointments yields no Ameer", () => {
  const list = [appt("p1", "m1", "permanent", 0, 3), appt("p2", "m2", "permanent", 5, null)];
  assert.equal(eff(list, 4), null);
});

test("deterministic tie-break is independent of input order", () => {
  const a = appt("a", "m1", "temporary", 0, 10);
  const b = appt("b", "m2", "temporary", 2, 10); // overlapping (invalid per rules, but derivation must not depend on order)
  assert.equal(eff([a, b], 5), "m2");
  assert.equal(eff([b, a], 5), "m2");
  const c = appt("c", "m3", "temporary", 2, 10);
  assert.equal(eff([b, c], 5), eff([c, b], 5));
});

test("history ordering and no mutation of input", () => {
  const list = [appt("t", "m2", "temporary", 3, 6), appt("p", "m1", "permanent", 0, null), appt("t0", "m3", "temporary", 0, 1)];
  const copy = structuredClone(list);
  assert.deepEqual(sortHistory(list).map((a) => a.id), ["p", "t0", "t"]);
  assert.deepEqual(list, copy);
});

test("segments show transitions across a window", () => {
  const list = [appt("p", "m1", "permanent", 0, null), appt("t", "m2", "temporary", 3, 6)];
  const segs = ameerSegments(list, at(0), at(10)).map((s) => [(s.from - f.T0) / H, (s.to - f.T0) / H, s.ameer?.memberId ?? null]);
  assert.deepEqual(segs, [[0, 3, "m1"], [3, 6, "m2"], [6, 10, "m1"]]);
  assert.deepEqual(ameerSegments(list, at(5), at(5)), []);
  const gap = ameerSegments([appt("p", "m1", "permanent", 2, 4)], at(0), at(6)).map((s) => s.ameer?.memberId ?? null);
  assert.deepEqual(gap, [null, "m1", null]);
});

test("periodsOverlap treats ends as exclusive and null as open", () => {
  assert.equal(periodsOverlap(appt("a", "m", "permanent", 0, 5), appt("b", "m", "permanent", 5, 9)), false);
  assert.equal(periodsOverlap(appt("a", "m", "permanent", 0, 6), appt("b", "m", "permanent", 5, 9)), true);
  assert.equal(periodsOverlap(appt("a", "m", "permanent", 0, null), appt("b", "m", "permanent", 99, 100)), true);
});

const J = { ...f.jamaat(), endAt: at(100) } as never;
const members = [f.member(), { ...f.member(), id: "m2", name: "Member Two" }] as never[];
const codes = (a: AmeerAppointment, others: AmeerAppointment[]) =>
  appointmentConflicts(a, others, J, members).map((i) => `${i.field}:${i.code}`);

test("conflicts: member must belong; period inside Jamaat", () => {
  assert.deepEqual(codes(appt("a", "zz", "permanent", 0, null), []), ["memberId:notAMember"]);
  assert.deepEqual(codes(appt("a", "m1", "permanent", -1, null), []), ["startAt:beforeJamaatStart"]);
  assert.deepEqual(codes(appt("a", "m1", "permanent", 100, null), []), ["startAt:afterJamaatEnd"]);
  assert.deepEqual(codes(appt("a", "m1", "temporary", 1, 101), []), ["endAt:afterJamaatEnd"]);
  assert.deepEqual(codes(appt("a", "m1", "permanent", 0, null), []), []);
});

test("conflicts: same-kind overlap rejected; cross-kind overlap and touching allowed", () => {
  const p = appt("p", "m1", "permanent", 0, 10);
  assert.deepEqual(codes(appt("p2", "m2", "permanent", 5, null), [p]), ["startAt:overlap"]);
  assert.deepEqual(codes(appt("p2", "m2", "permanent", 10, null), [p]), []);
  assert.deepEqual(codes(appt("t", "m2", "temporary", 2, 4), [p]), []);
  const t = appt("t", "m2", "temporary", 2, 4);
  assert.deepEqual(codes(appt("t2", "m1", "temporary", 3, 5), [t]), ["startAt:overlap"]);
});

async function seeded() {
  const db = createDb(new MemoryBackend());
  await saveJamaat(db, { ...f.jamaat(), endAt: at(100) }, true);
  await saveMember(db, f.member(), true);
  await saveMember(db, { ...f.member(), id: "m2", name: "Member Two" }, true);
  return db;
}

test("service: save, history kept, overlap and validation refused, edit, delete", async () => {
  const db = await seeded();
  assert.ok((await saveAppointment(db, appt("p1", "m1", "permanent", 0, null), true)).ok);
  const overlap = await saveAppointment(db, appt("p2", "m2", "permanent", 5, null), true);
  assert.ok(!overlap.ok && overlap.issues[0]!.code === "overlap");
  // handover: end the first, then appoint the second; both stay in history
  assert.ok((await saveAppointment(db, appt("p1", "m1", "permanent", 0, 5), false)).ok);
  assert.ok((await saveAppointment(db, appt("p2", "m2", "permanent", 5, null), true)).ok);
  assert.ok((await saveAppointment(db, appt("t1", "m1", "temporary", 7, 9), true)).ok);
  const all = (await db.appointments.list()).items;
  assert.equal(all.length, 3);
  assert.equal(effectiveAmeer(all, at(8))!.memberId, "m1");
  assert.equal(effectiveAmeer(all, at(10))!.memberId, "m2");
  const bad = await saveAppointment(db, { ...appt("t2", "m1", "temporary", 7, 9), endAt: null }, true);
  assert.ok(!bad.ok && bad.issues[0]!.code === "required");
  await deleteAppointment(db, "t1");
  assert.equal((await db.appointments.list()).items.length, 2);
});

test("service: editing an appointment does not conflict with itself; unknown Jamaat errors", async () => {
  const db = await seeded();
  await saveAppointment(db, appt("p1", "m1", "permanent", 0, null), true);
  assert.ok((await saveAppointment(db, { ...appt("p1", "m1", "permanent", 1, null) }, false)).ok);
  await assert.rejects(saveAppointment(db, { ...appt("x", "m1", "permanent", 0, null), jamaatId: "nope" }, true), (e) => e instanceof DbError && e.code === "notFound");
});

test("a member with an appointment cannot be deleted", async () => {
  const db = await seeded();
  await saveAppointment(db, appt("p1", "m1", "permanent", 0, null), true);
  const { deleteMember } = await import("../src/features/members/service.ts");
  await assert.rejects(deleteMember(db, "m1"), (e) => e instanceof DbError && e.code === "inUse");
});
