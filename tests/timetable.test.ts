import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/db/index.ts";
import { MemoryBackend } from "../src/db/memory.ts";
import { allDicts } from "../src/guitext.ts";
import {
  STANDARD_PROGRAMME, findOverlaps, formatRange, formatTime, moveBy, moveTo, nextOrder, parseTime, reorderChanges, sortActivities,
} from "../src/domain/timetable.ts";
import { addStandardProgramme, applyOrder, deleteActivity, loadProgramme, saveActivity } from "../src/features/programme/service.ts";
import { saveJamaat, saveMember } from "../src/features/members/service.ts";
import type { ProgrammeActivity } from "../src/model/types.ts";
import { validateActivity } from "../src/model/validate.ts";
import * as f from "./helpers.ts";

const act = (id: string, order: number, start: number, end: number | null): ProgrammeActivity =>
  ({ ...f.activity(), id, title: id, order, startMin: start, endMin: end }) as ProgrammeActivity;
const ids = (l: readonly ProgrammeActivity[]) => l.map((a) => a.id);

test("manual order is independent of time order", () => {
  const list = [act("late", 0, 900, 960), act("early", 1, 60, 120), act("mid", 2, 500, 560)];
  assert.deepEqual(ids(sortActivities(list)), ["late", "early", "mid"]); // not chronological
  assert.deepEqual(ids(sortActivities([...list].reverse())), ["late", "early", "mid"]);
});

test("ties in order break by creation time then id", () => {
  const a = { ...act("b", 0, 0, 1), createdAt: 5 } as ProgrammeActivity;
  const b = { ...act("a", 0, 0, 1), createdAt: 5 } as ProgrammeActivity;
  const c = { ...act("z", 0, 0, 1), createdAt: 1 } as ProgrammeActivity;
  assert.deepEqual(ids(sortActivities([a, b, c])), ["z", "a", "b"]);
});

test("moveBy: up, down, and no-ops at the ends", () => {
  const list = [act("a", 0, 0, 10), act("b", 1, 0, 10), act("c", 2, 0, 10)];
  assert.deepEqual(ids(moveBy(list, "b", -1)), ["b", "a", "c"]);
  assert.deepEqual(ids(moveBy(list, "b", 1)), ["a", "c", "b"]);
  assert.deepEqual(ids(moveBy(list, "a", -1)), ["a", "b", "c"]);
  assert.deepEqual(ids(moveBy(list, "c", 1)), ["a", "b", "c"]);
  assert.deepEqual(ids(moveBy(list, "zz", 1)), ["a", "b", "c"]);
});

test("moveTo clamps and does not mutate its input", () => {
  const list = [act("a", 0, 0, 10), act("b", 1, 0, 10), act("c", 2, 0, 10)];
  const copy = structuredClone(list);
  assert.deepEqual(ids(moveTo(list, "a", 2)), ["b", "c", "a"]);
  assert.deepEqual(ids(moveTo(list, "c", 0)), ["c", "a", "b"]);
  assert.deepEqual(ids(moveTo(list, "a", 99)), ["b", "c", "a"]);
  assert.deepEqual(ids(moveTo(list, "c", -5)), ["c", "a", "b"]);
  assert.deepEqual(list, copy);
});

test("reorderChanges writes only records whose order changed and renumbers 0..n-1", () => {
  const list = [act("a", 0, 0, 10), act("b", 1, 0, 10), act("c", 2, 0, 10), act("d", 3, 0, 10)];
  const changes = reorderChanges(list, moveBy(list, "b", -1), f.T0 + 99);
  assert.deepEqual(changes.map((c) => [c.id, c.order]), [["b", 0], ["a", 1]]);
  assert.ok(changes.every((c) => c.updatedAt === f.T0 + 99));
  assert.deepEqual(reorderChanges(list, sortActivities(list), 1), []);
  // gaps in stored order are normalised
  const gappy = [act("a", 5, 0, 10), act("b", 9, 0, 10)];
  assert.deepEqual(reorderChanges(gappy, sortActivities(gappy), 1).map((c) => [c.id, c.order]), [["a", 0], ["b", 1]]);
});

test("nextOrder appends after the highest order", () => {
  assert.equal(nextOrder([]), 0);
  assert.equal(nextOrder([act("a", 4, 0, 1), act("b", 1, 0, 1)]), 5);
});

test("overlap detection: intersecting, nested, touching, instants, disjoint", () => {
  const pairs = (l: ProgrammeActivity[]) => findOverlaps(l).map((o) => `${o.a}|${o.b}`);
  assert.deepEqual(pairs([act("a", 0, 60, 120), act("b", 1, 90, 150)]), ["a|b"]);
  assert.deepEqual(pairs([act("a", 0, 60, 180), act("b", 1, 90, 100)]), ["a|b"]); // nested
  assert.deepEqual(pairs([act("a", 0, 60, 120), act("b", 1, 120, 180)]), []); // touching is fine
  assert.deepEqual(pairs([act("a", 0, 60, 120), act("b", 1, 90, null)]), []); // instants never overlap
  assert.deepEqual(pairs([act("a", 0, 60, 70), act("b", 1, 80, 90)]), []);
  assert.deepEqual(pairs([act("a", 0, 60, 120), act("b", 1, 100, 130), act("c", 2, 110, 115)]), ["a|b", "a|c", "b|c"]);
});

test("overlaps are reported in manual order and detection never reorders anything", () => {
  const list = [act("late", 0, 900, 960), act("early", 1, 930, 990)];
  const copy = structuredClone(list);
  assert.deepEqual(findOverlaps(list), [{ a: "late", b: "early" }]);
  assert.deepEqual(list, copy);
});

test("time parsing and formatting", () => {
  assert.equal(parseTime("07:30"), 450);
  assert.equal(parseTime("00:00"), 0);
  assert.equal(parseTime("23:59"), 1439);
  for (const bad of ["", "24:00", "12:60", "7:30", "abc", "12:5"]) assert.equal(parseTime(bad), null, bad);
  assert.equal(formatTime(450), "07:30");
  assert.equal(formatTime(1439), "23:59");
  assert.equal(formatRange({ startMin: 450, endMin: 495 }), "07:30 – 08:15");
  assert.equal(formatRange({ startMin: 450, endMin: null }), "07:30");
});

test("activity validation: minute bounds and end after start", () => {
  const codes = (o: object) => { const r = validateActivity({ ...f.activity(), ...o }); return r.ok ? [] : r.issues.map((i) => `${i.field}:${i.code}`); };
  assert.deepEqual(codes({ startMin: 1440 }), ["startMin:outOfRange"]);
  assert.deepEqual(codes({ startMin: -1 }), ["startMin:outOfRange"]);
  assert.deepEqual(codes({ startMin: 600, endMin: 600 }), ["endMin:invalidOrder"]);
  assert.deepEqual(codes({ startMin: 600, endMin: 599 }), ["endMin:invalidOrder"]);
  assert.deepEqual(codes({ title: " " }), ["title:required"]);
  assert.deepEqual(codes({ startMin: 12.5 }), ["startMin:invalidType"]);
  assert.deepEqual(codes({ endMin: null }), []);
});

test("standard programme: the 22 scoped activities, localised in every language, no overlaps", () => {
  assert.equal(STANDARD_PROGRAMME.length, 22);
  const keys = STANDARD_PROGRAMME.map((p) => p.key).sort();
  for (const d of Object.values(allDicts)) assert.deepEqual(Object.keys(d.programme.presets).sort(), keys);
  assert.equal(new Set(keys).size, 22);
  const list = STANDARD_PROGRAMME.map((p, i) => act(p.key, i, p.start, p.end));
  assert.deepEqual(findOverlaps(list), []);
  assert.ok(STANDARD_PROGRAMME.every((p) => p.start >= 0 && p.start < 1440 && (p.end === null || (p.end > p.start && p.end < 1440))));
});

async function seeded() {
  const db = createDb(new MemoryBackend());
  await saveJamaat(db, f.jamaat(), true);
  await saveMember(db, f.member(), true);
  return db;
}

test("service: save, edit time keeps manual position, persists in order", async () => {
  const db = await seeded();
  assert.ok((await saveActivity(db, { ...f.activity(), id: "a", title: "A", order: 0, startMin: 900, endMin: 960 }, true)).ok);
  assert.ok((await saveActivity(db, { ...f.activity(), id: "b", title: "B", order: 1, startMin: 60, endMin: 120 }, true)).ok);
  assert.deepEqual(ids((await loadProgramme(db, "j1")).items), ["a", "b"]);
  // changing A's time to the very early morning does not move it
  assert.ok((await saveActivity(db, { ...f.activity(), id: "a", title: "A", order: 0, startMin: 10, endMin: 20, updatedAt: f.T0 + 1 }, false)).ok);
  assert.deepEqual(ids((await loadProgramme(db, "j1")).items), ["a", "b"]);
});

test("service: validation, unknown responsible member, missing Jamaat", async () => {
  const db = await seeded();
  const bad = await saveActivity(db, { ...f.activity(), startMin: 700, endMin: 600 }, true);
  assert.ok(!bad.ok && bad.issues[0]!.code === "invalidOrder");
  const who = await saveActivity(db, { ...f.activity(), responsibleIds: ["ghost"] }, true);
  assert.ok(!who.ok && who.issues[0]!.code === "notAMember");
  assert.ok((await saveActivity(db, { ...f.activity(), responsibleIds: ["m1"] }, true)).ok);
  await assert.rejects(saveActivity(db, { ...f.activity(), id: "x", jamaatId: "nope" }, true));
  assert.equal((await loadProgramme(db, "j1")).items.length, 1);
});

test("service: applyOrder persists reorder atomically and survives reload", async () => {
  const db = await seeded();
  for (const [i, id] of ["a", "b", "c"].entries()) await saveActivity(db, { ...f.activity(), id, title: id, order: i }, true);
  const before = (await loadProgramme(db, "j1")).items;
  await applyOrder(db, before, moveBy(before, "c", -2));
  assert.deepEqual(ids((await loadProgramme(db, "j1")).items), ["c", "a", "b"]);
  await applyOrder(db, (await loadProgramme(db, "j1")).items, moveBy((await loadProgramme(db, "j1")).items, "c", 0)); // no-op writes nothing
  assert.deepEqual(ids((await loadProgramme(db, "j1")).items), ["c", "a", "b"]);
});

test("service: delete leaves the others in order", async () => {
  const db = await seeded();
  for (const [i, id] of ["a", "b", "c"].entries()) await saveActivity(db, { ...f.activity(), id, title: id, order: i }, true);
  await deleteActivity(db, "b");
  assert.deepEqual(ids((await loadProgramme(db, "j1")).items), ["a", "c"]);
});

test("service: standard list appends all 22 after existing activities", async () => {
  const db = await seeded();
  await saveActivity(db, { ...f.activity(), id: "mine", title: "Mine", order: 0 }, true);
  const titles = allDicts.en.programme.presets as never;
  const existing = (await loadProgramme(db, "j1")).items;
  assert.equal(await addStandardProgramme(db, "j1", titles, existing), 22);
  const all = (await loadProgramme(db, "j1")).items;
  assert.equal(all.length, 23);
  assert.equal(all[0]!.id, "mine");
  assert.deepEqual(all.map((a) => a.order), Array.from({ length: 23 }, (_, i) => i));
  assert.equal(all[1]!.title, "Tahajjud");
  await assert.rejects(addStandardProgramme(db, "nope", titles, []));
});
