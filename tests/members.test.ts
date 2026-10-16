import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/db/index.ts";
import { MemoryBackend } from "../src/db/memory.ts";
import { DbError } from "../src/db/errors.ts";
import { jamaatConflicts, memberConflicts } from "../src/domain/members.ts";
import { deleteJamaat, deleteMember, loadJamaat, saveJamaat, saveMember } from "../src/features/members/service.ts";
import { fromInputValue, toInputValue } from "../src/ui/datetime.ts";
import * as f from "./helpers.ts";

const J = { ...f.jamaat(), endAt: f.T0 + 10 * f.HOUR };
const M = f.member() as ReturnType<typeof f.member> & { leaveAt: number | null };
const setup = () => createDb(new MemoryBackend());
const codeOf = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e instanceof DbError ? e.code : "other"; } return "none"; };
const issues = (r: { ok: boolean; issues?: { field: string; code: string }[] }) => (r.ok ? [] : r.issues!.map((i) => `${i.field}:${i.code}`));

test("memberConflicts: must lie within the Jamaat period (boundaries)", () => {
  const at = (join: number, leave: number | null) => ({ ...M, joinAt: f.T0 + join * f.HOUR, leaveAt: leave === null ? null : f.T0 + leave * f.HOUR });
  const c = (m: ReturnType<typeof at>) => memberConflicts(m as never, J as never, []).map((i) => `${i.field}:${i.code}`);
  assert.deepEqual(c(at(0, 10)), []); // exactly the full period
  assert.deepEqual(c(at(-1, null)), ["joinAt:beforeJamaatStart"]);
  assert.deepEqual(c(at(10, null)), ["joinAt:afterJamaatEnd"]); // joining at the end instant
  assert.deepEqual(c(at(9, null)), []);
  assert.deepEqual(c(at(1, 11)), ["leaveAt:afterJamaatEnd"]);
});

test("memberConflicts: duplicate names are case-insensitive and ignore self", () => {
  const other = { ...M, id: "m2", name: "  member ONE " };
  assert.deepEqual(memberConflicts(M as never, J as never, [other as never]).map((i) => i.code), ["duplicateName"]);
  assert.deepEqual(memberConflicts(M as never, J as never, [M as never]), []);
});

test("jamaatConflicts: shrinking the period cannot orphan members", () => {
  const m = { ...M, joinAt: f.T0 + 2 * f.HOUR, leaveAt: f.T0 + 8 * f.HOUR } as never;
  assert.deepEqual(jamaatConflicts({ ...J, startAt: f.T0 + 3 * f.HOUR } as never, [m]).map((i) => i.field), ["startAt"]);
  assert.deepEqual(jamaatConflicts({ ...J, endAt: f.T0 + 7 * f.HOUR } as never, [m]).map((i) => i.field), ["endAt"]);
  assert.deepEqual(jamaatConflicts({ ...J, endAt: f.T0 + 8 * f.HOUR } as never, [m]), []);
  assert.deepEqual(jamaatConflicts({ ...J, endAt: null } as never, [m]), []);
});

test("jamaat: create once, no second profile, edit, load", async () => {
  const db = setup();
  assert.deepEqual(await loadJamaat(db), { jamaat: null, malformed: 0 });
  assert.ok((await saveJamaat(db, f.jamaat(), true)).ok);
  assert.equal(await codeOf(saveJamaat(db, { ...f.jamaat(), id: "j2" }, true)), "exists");
  assert.ok((await saveJamaat(db, { ...f.jamaat(), name: "Renamed" }, false)).ok);
  assert.equal((await loadJamaat(db)).jamaat!.name, "Renamed");
});

test("jamaat: invalid input returns issues and stores nothing", async () => {
  const db = setup();
  const r = await saveJamaat(db, { ...f.jamaat(), name: "", endAt: f.T0 }, true);
  assert.deepEqual(issues(r), ["name:required"]);
  assert.equal((await loadJamaat(db)).jamaat, null);
});

test("saveMember: requires jamaat, rejects conflicts, persists valid, edits", async () => {
  const db = setup();
  assert.equal(await codeOf(saveMember(db, f.member(), true)), "notFound");
  await saveJamaat(db, J, true);
  assert.deepEqual(issues(await saveMember(db, { ...f.member(), joinAt: f.T0 - 1 }, true)), ["joinAt:beforeJamaatStart"]);
  assert.ok((await saveMember(db, f.member(), true)).ok);
  assert.deepEqual(issues(await saveMember(db, { ...f.member(), id: "m2", name: "MEMBER one" }, true)), ["name:duplicateName"]);
  assert.deepEqual(issues(await saveMember(db, { ...f.member(), leaveAt: f.T0 }, false)), ["leaveAt:invalidOrder"]);
  assert.ok((await saveMember(db, { ...f.member(), leaveAt: f.T0 + f.HOUR }, false)).ok);
  assert.equal((await db.members.get("m1"))!.leaveAt, f.T0 + f.HOUR);
  assert.equal(await codeOf(saveMember(db, f.member(), true)), "exists");
});

test("jamaat period edit that would orphan a member is refused", async () => {
  const db = setup();
  await saveJamaat(db, J, true);
  await saveMember(db, { ...f.member(), joinAt: f.T0 + f.HOUR }, true);
  assert.deepEqual(issues(await saveJamaat(db, { ...J, startAt: f.T0 + 2 * f.HOUR }, false)), ["startAt:conflictsWithMembers"]);
  assert.equal((await loadJamaat(db)).jamaat!.startAt, f.T0);
});

test("deleteMember: allowed when unused, blocked when referenced anywhere", async () => {
  const db = setup();
  await saveJamaat(db, J, true);
  await saveMember(db, f.member(), true);
  await saveMember(db, { ...f.member(), id: "m2", name: "Member Two" }, true);
  await db.appointments.add(f.appointment()); // references m1
  assert.equal(await codeOf(deleteMember(db, "m1")), "inUse");
  assert.ok(await db.members.get("m1"));
  await deleteMember(db, "m2");
  assert.equal(await db.members.get("m2"), null);

  await db.appointments.remove("a1");
  await db.expenses.add({ ...f.expense(), participantIds: ["m1"] });
  assert.equal(await codeOf(deleteMember(db, "m1")), "inUse");
  await db.expenses.remove("e1");
  await db.activities.add({ ...f.activity(), responsibleIds: ["m1"] });
  assert.equal(await codeOf(deleteMember(db, "m1")), "inUse");
  await db.activities.remove("p1");
  await db.mulaqaat.add(f.mulaqaat());
  assert.equal(await codeOf(deleteMember(db, "m1")), "inUse");
  await db.mulaqaat.remove("mq1");
  await db.allocations.add(f.allocation());
  assert.equal(await codeOf(deleteMember(db, "m1")), "inUse");
  await db.allocations.remove("al1");
  await deleteMember(db, "m1");
  assert.equal(await db.members.get("m1"), null);
});

test("deleteJamaat: removes members when nothing else belongs to it; blocked otherwise", async () => {
  const db = setup();
  await saveJamaat(db, J, true);
  await saveMember(db, f.member(), true);
  await db.expenses.add(f.expense());
  assert.equal(await codeOf(deleteJamaat(db, "j1")), "inUse");
  assert.ok((await loadJamaat(db)).jamaat);
  assert.ok(await db.members.get("m1"));
  await db.expenses.remove("e1");
  await deleteJamaat(db, "j1");
  assert.equal((await loadJamaat(db)).jamaat, null);
  assert.equal(await db.members.get("m1"), null);
});

test("datetime-local conversion round-trips at minute precision", () => {
  const ms = new Date(2030, 5, 15, 7, 5).getTime();
  assert.equal(toInputValue(ms), "2030-06-15T07:05");
  assert.equal(fromInputValue("2030-06-15T07:05"), ms);
  assert.equal(fromInputValue(""), null);
  assert.equal(fromInputValue("garbage"), null);
  assert.equal(fromInputValue("2030-13-45T25:61"), null);
});
