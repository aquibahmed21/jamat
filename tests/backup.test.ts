import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb, type Db } from "../src/db/index.ts";
import { MemoryBackend } from "../src/db/memory.ts";
import { DbError } from "../src/db/errors.ts";
import { allDicts } from "../src/guitext.ts";
import { BACKUP_APP, BACKUP_FORMAT, backupFilename, exportBackup } from "../src/backup/format.ts";
import { BACKUP_ERROR_CODES, BACKUP_WARNING_CODES, parseBackup, type BackupIssue } from "../src/backup/parse.ts";
import { countRecords, loadRecords, totalOf } from "../src/backup/records.ts";
import { planRestore, restore } from "../src/backup/restore.ts";
import { saveAppointment } from "../src/features/ameer/service.ts";
import { saveExpense } from "../src/features/expenses/service.ts";
import { saveJamaat, saveMember } from "../src/features/members/service.ts";
import { saveMulaqaat, savePlace } from "../src/features/places/service.ts";
import { saveActivity } from "../src/features/programme/service.ts";
import * as f from "./helpers.ts";

const NOW = f.T0 + 5 * f.HOUR;

/** A realistic, internally consistent synthetic dataset built only through the app's own services. */
async function populated(): Promise<Db> {
  const db = createDb(new MemoryBackend());
  await saveJamaat(db, { ...f.jamaat(), endAt: f.T0 + 100 * f.HOUR }, true);
  for (const id of ["a", "b", "c"]) await saveMember(db, { ...f.member(), id, name: `Member ${id}` }, true);
  await saveAppointment(db, { ...f.appointment(), id: "ap1", memberId: "a" }, true);
  await savePlace(db, f.place(), true);
  await saveMulaqaat(db, { ...f.mulaqaat(), personIds: ["a", "b"] }, true);
  await saveActivity(db, { ...f.activity(), responsibleIds: ["c"] }, true);
  const base = { ...f.expense(), payerId: "a", participantIds: ["a", "b", "c"] };
  await saveExpense(db, { ...base, id: "e1", amountPaise: 30000 }, true);
  await saveExpense(db, { ...base, id: "e2", description: "Adv", category: "advance", participantIds: [], amountPaise: 9000 }, true);
  await saveExpense(db, {
    ...base, id: "e3", description: "Refund", category: "refund", participantIds: [], paymentSource: "jamaat", payerId: null,
    counterpartyId: "a", linkedExpenseId: "e2", amountPaise: 4000, date: f.T0 + 1,
  }, true);
  return db;
}

const issueCodes = (r: ReturnType<typeof parseBackup>) => (r.ok ? [] : r.issues.map((i) => i.code));

test("round trip: export -> parse -> restore into an empty device gives identical data", async () => {
  const src = await populated();
  const exp = await exportBackup(src, NOW);
  assert.ok(exp.recordCount > 10 && exp.skipped === 0);
  const parsed = parseBackup(exp.text);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.backup.warnings, []);
  const dst = createDb(new MemoryBackend());
  assert.equal(await restore(dst, parsed.backup.records, "replace"), exp.recordCount);
  assert.deepEqual((await loadRecords(dst)).records, (await loadRecords(src)).records);
  // and exporting again is byte-identical apart from the timestamp
  assert.equal((await exportBackup(dst, NOW)).text, exp.text);
});

test("file layout: identifies the app, format and schema; filename is sortable", async () => {
  const exp = await exportBackup(await populated(), NOW);
  const raw = JSON.parse(exp.text);
  assert.equal(raw.app, BACKUP_APP);
  assert.equal(raw.format, BACKUP_FORMAT);
  assert.equal(raw.schemaVersion, 2);
  assert.equal(raw.exportedAt, NOW);
  assert.deepEqual(Object.keys(raw.data), ["jamaats", "members", "places", "appointments", "expenses", "allocations", "activities", "mulaqaat", "audit"]);
  assert.match(backupFilename(new Date(2030, 0, 2, 3, 4).getTime()), /^jamat-backup-20300102-0304\.json$/);
});

test("export skips damaged stored records and reports how many", async () => {
  const backend = new MemoryBackend();
  const db = createDb(backend);
  await saveJamaat(db, f.jamaat(), true);
  await backend.add("members", { id: "bad", name: 5 } as never);
  const exp = await exportBackup(db, NOW);
  assert.equal(exp.skipped, 1);
  assert.ok(parseBackup(exp.text).ok);
});

test("rejects non-JSON, wrong shape, wrong app, oversized input", () => {
  assert.deepEqual(issueCodes(parseBackup("")), ["notJson"]);
  assert.deepEqual(issueCodes(parseBackup("{not json")), ["notJson"]);
  for (const bad of ["null", "[]", "5", '"x"', "{}", '{"app":"other","format":1,"schemaVersion":2,"exportedAt":1,"data":{}}', '{"app":"jamat","data":[]}']) {
    assert.deepEqual(issueCodes(parseBackup(bad)), ["notBackup"], bad);
  }
  assert.deepEqual(issueCodes(parseBackup("x".repeat(25_000_001))), ["tooLarge"]);
});

const file = (over: object = {}, data: object = {}) =>
  JSON.stringify({ app: "jamat", format: 1, schemaVersion: 2, exportedAt: f.T0, data: { jamaats: [f.jamaat()], ...data }, ...over });

test("version handling: newer format/schema refused, older schema accepted with a warning", () => {
  assert.deepEqual(issueCodes(parseBackup(file({ format: 2 }))), ["unsupportedFormat"]);
  assert.deepEqual(issueCodes(parseBackup(file({ format: 0 }))), ["unsupportedFormat"]);
  assert.deepEqual(issueCodes(parseBackup(file({ format: "1" }))), ["unsupportedFormat"]);
  assert.deepEqual(issueCodes(parseBackup(file({ schemaVersion: 3 }))), ["newerSchema"]);
  assert.deepEqual(issueCodes(parseBackup(file({ schemaVersion: 0 }))), ["notBackup"]);
  assert.deepEqual(issueCodes(parseBackup(file({ exportedAt: -1 }))), ["notBackup"]);
  const old = parseBackup(file({ schemaVersion: 1 }));
  assert.ok(old.ok);
  assert.deepEqual(old.backup.warnings, [{ code: "olderSchema" }]);
});

test("a version-1 file (no audit section, no newer expense fields) restores with defaults", () => {
  const { linkedExpenseId: _l, mealTimes: _m, periodFrom: _f, periodTo: _t, ...v1Expense } = f.expense() as Record<string, unknown>;
  const text = file({ schemaVersion: 1 }, { members: [f.member()], expenses: [{ ...v1Expense, participantIds: ["m1"] }] });
  const r = parseBackup(text);
  assert.ok(r.ok);
  assert.equal(r.backup.records.expenses[0]!.linkedExpenseId, null);
  assert.deepEqual(r.backup.records.expenses[0]!.mealTimes, []);
  assert.equal(r.backup.counts.audit, 0);
});

test("unknown sections, non-list sections and prototype-pollution keys are rejected", () => {
  assert.deepEqual(issueCodes(parseBackup(file({}, { secrets: [] }))), ["unknownStore"]);
  assert.deepEqual(issueCodes(parseBackup(file({}, { members: {} }))), ["badStore"]);
  const polluted = '{"app":"jamat","format":1,"schemaVersion":2,"exportedAt":1,"data":{"__proto__":{"polluted":true},"jamaats":[]}}';
  assert.deepEqual(issueCodes(parseBackup(polluted)), ["unknownStore"]);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("invalid values are reported with store, position and field; nothing partial is accepted", () => {
  const r = parseBackup(file({}, {
    members: [f.member(), { ...f.member(), id: "m2", name: "", leaveAt: 1 }],
    expenses: [{ ...f.expense(), amountPaise: 12.5 }],
  }));
  assert.ok(!r.ok);
  const got = r.issues.map((i) => `${i.store}#${i.index}:${i.field}:${i.detail}`);
  assert.ok(got.includes("members#1:name:required"));
  assert.ok(got.includes("expenses#0:amountPaise:invalidType"));
});

test("duplicate identifiers inside the file are rejected", () => {
  const r = parseBackup(file({}, { members: [f.member(), f.member()] }));
  assert.ok(!r.ok);
  assert.deepEqual(r.issues.map((i) => [i.code, i.store, i.index, i.id]), [["duplicateId", "members", 1, "m1"]]);
  assert.deepEqual(issueCodes(parseBackup(file({}, { jamaats: [f.jamaat(), f.jamaat()] }))), ["duplicateId"]);
});

test("dangling references are rejected", () => {
  const r = parseBackup(file({}, { members: [{ ...f.member(), jamaatId: "ghost" }] }));
  assert.ok(!r.ok);
  assert.deepEqual(r.issues[0], { code: "danglingReference", store: "members", id: "m1", field: "jamaatId" });
  const e = parseBackup(file({}, { members: [f.member()], expenses: [{ ...f.expense(), participantIds: ["m1", "ghost"] }] }));
  assert.ok(!e.ok && e.issues[0]!.field === "participantIds");
  const m = parseBackup(file({}, { members: [f.member()], mulaqaat: [f.mulaqaat()] })); // place missing
  assert.ok(!m.ok && m.issues[0]!.field === "placeId");
});

test("history entries may reference deleted records; snapshots must be valid expenses", () => {
  const entry = { id: "au1", at: f.T0, entityType: "expense", entityId: "gone", action: "create", before: null, after: f.expense() };
  assert.ok(parseBackup(file({}, { audit: [entry] })).ok);
  assert.ok(!parseBackup(file({}, { audit: [{ ...entry, after: { evil: "<script>" } }] })).ok);
});

test("more than one Jamaat is refused (the app manages one)", () => {
  assert.deepEqual(issueCodes(parseBackup(file({}, { jamaats: [f.jamaat(), { ...f.jamaat(), id: "j2" }] }))), ["multipleJamaats"]);
});

test("accounting problems in a file are warned about, not hidden, and the file still restores", () => {
  const settlement = { ...f.expense(), id: "s1", category: "settlement", participantIds: [], payerId: "m1", counterpartyId: "m2", description: "x" };
  const r = parseBackup(file({}, { members: [f.member(), { ...f.member(), id: "m2", name: "Two" }], expenses: [settlement] }));
  assert.ok(r.ok);
  assert.deepEqual(r.backup.warnings, [{ code: "inconsistent", count: 1 }]);
});

test("an empty backup is valid but flagged", () => {
  const r = parseBackup(file({}, { jamaats: [] }));
  assert.ok(r.ok);
  assert.deepEqual(r.backup.warnings, [{ code: "empty" }]);
});

test("issue list is capped", () => {
  const many = Array.from({ length: 100 }, (_, i) => ({ ...f.member(), id: `m${i}`, name: "" }));
  const r = parseBackup(file({}, { members: many }));
  assert.ok(!r.ok && r.issues.length === 25 && r.truncated);
});

test("replace: wipes what was there and installs exactly the file", async () => {
  const dst = await populated();
  await dst.members.add({ ...f.member(), id: "extra", name: "Extra Local" });
  const small = createDb(new MemoryBackend());
  await saveJamaat(small, { ...f.jamaat(), id: "other", name: "Other" }, true);
  const parsed = parseBackup((await exportBackup(small, NOW)).text);
  assert.ok(parsed.ok);
  await restore(dst, parsed.backup.records, "replace");
  const left = (await loadRecords(dst)).records;
  assert.deepEqual(left.jamaats.map((j) => j.id), ["other"]);
  assert.equal(totalOf(countRecords(left)), 1);
});

test("restore failure is atomic: a failing write leaves the existing data untouched", async () => {
  class Flaky extends MemoryBackend {
    calls = 0;
    override async add(store: string, value: { id: string }): Promise<void> {
      if (++this.calls === 7) throw new DbError("quota");
      return super.add(store, value);
    }
  }
  const backend = new Flaky();
  const db = createDb(backend);
  await saveJamaat(db, f.jamaat(), true);
  await saveMember(db, f.member(), true);
  const before = (await loadRecords(db)).records;
  const parsed = parseBackup((await exportBackup(await populated(), NOW)).text);
  assert.ok(parsed.ok);
  backend.calls = 0;
  await assert.rejects(restore(db, parsed.backup.records, "replace"), (e) => e instanceof DbError && e.code === "quota");
  assert.deepEqual((await loadRecords(db)).records, before);
});

test("merge: adds only missing records, never overwrites, reports same / conflicts", async () => {
  const device = await populated();
  const fileDb = await populated();
  // the other copy gained a record and edited an existing one
  await saveMember(fileDb, { ...f.member(), id: "d", name: "New Member" }, true);
  await saveMember(fileDb, { ...f.member(), id: "a", name: "Member a edited", updatedAt: f.T0 + 9 }, false);
  const parsed = parseBackup((await exportBackup(fileDb, NOW)).text);
  assert.ok(parsed.ok);
  const plan = planRestore(parsed.backup.records, (await loadRecords(device)).records);
  assert.ok(plan.merge.available);
  assert.deepEqual(plan.merge.delta.members, { add: 1, same: 2, conflict: 1 });
  assert.equal(plan.merge.delta.expenses.conflict, 0);
  const written = await restore(device, parsed.backup.records, "merge");
  assert.equal(written, plan.merge.addTotal);
  assert.equal((await device.members.get("d"))!.name, "New Member");
  assert.equal((await device.members.get("a"))!.name, "Member a"); // local version kept
});

test("merge is unavailable for a different Jamaat or an empty device; replace always is", async () => {
  const device = await populated();
  const other = createDb(new MemoryBackend());
  await saveJamaat(other, { ...f.jamaat(), id: "j2", name: "Different" }, true);
  const parsed = parseBackup((await exportBackup(other, NOW)).text);
  assert.ok(parsed.ok);
  const plan = planRestore(parsed.backup.records, (await loadRecords(device)).records);
  assert.deepEqual(plan.merge, { available: false, reason: "differentJamaat" });
  await assert.rejects(restore(device, parsed.backup.records, "merge"), (e) => e instanceof DbError && e.code === "invalid");
  const empty = planRestore(parsed.backup.records, (await loadRecords(createDb(new MemoryBackend()))).records);
  assert.deepEqual(empty.merge, { available: false, reason: "nothingHere" });
});

test("merge that would create rule problems is refused (e.g. overlapping Ameer appointments)", async () => {
  const device = await populated();
  const other = await populated();
  await other.appointments.remove("ap1");
  await other.appointments.add({ ...f.appointment(), id: "ap2", memberId: "b" }); // overlaps ap1 on the device
  const parsed = parseBackup((await exportBackup(other, NOW)).text);
  assert.ok(parsed.ok);
  assert.deepEqual(planRestore(parsed.backup.records, (await loadRecords(device)).records).merge, { available: false, reason: "wouldBreakRules" });
});

test("merge of an identical backup changes nothing", async () => {
  const device = await populated();
  const parsed = parseBackup((await exportBackup(device, NOW)).text);
  assert.ok(parsed.ok);
  const before = (await loadRecords(device)).records;
  const plan = planRestore(parsed.backup.records, before);
  assert.ok(plan.merge.available && plan.merge.addTotal === 0);
  assert.equal(await restore(device, parsed.backup.records, "merge"), 0);
  assert.deepEqual((await loadRecords(device)).records, before);
});

test("every backup error and warning code has text in every language", () => {
  for (const d of Object.values(allDicts)) {
    for (const c of BACKUP_ERROR_CODES) assert.ok(d.backup.errors[c], c);
    for (const c of BACKUP_WARNING_CODES) assert.ok(d.backup.warnings[c], c);
  }
  const _t: BackupIssue | undefined = undefined; void _t;
});
