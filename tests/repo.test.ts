import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/db/index.ts";
import { MemoryBackend } from "../src/db/memory.ts";
import { DbError, toDbError, DB_ERROR_CODES } from "../src/db/errors.ts";
import { VALIDATION_CODES } from "../src/model/validate.ts";
import { allDicts } from "../src/guitext.ts";
import { newId } from "../src/model/id.ts";
import * as f from "./helpers.ts";

function setup() {
  const backend = new MemoryBackend();
  return { backend, db: createDb(backend) };
}

async function code(p: Promise<unknown>): Promise<string> {
  try { await p; } catch (e) { return e instanceof DbError ? e.code : "other"; }
  return "none";
}

test("add then get returns an equal, independent copy", async () => {
  const { db } = setup();
  await db.members.add(f.member());
  const got = await db.members.get("m1");
  assert.deepEqual(got, f.member());
  got!.name = "Changed";
  assert.equal((await db.members.get("m1"))!.name, "Member One");
});

test("get of a missing id is null", async () => {
  assert.equal(await setup().db.members.get("nope"), null);
});

test("add never overwrites an existing record", async () => {
  const { db } = setup();
  await db.members.add(f.member());
  assert.equal(await code(db.members.add({ ...f.member(), name: "Other" })), "exists");
  assert.equal((await db.members.get("m1"))!.name, "Member One");
});

test("update requires an existing record and replaces it", async () => {
  const { db } = setup();
  assert.equal(await code(db.members.update(f.member())), "notFound");
  await db.members.add(f.member());
  await db.members.update({ ...f.member(), name: "Renamed", updatedAt: f.T0 + 5 });
  assert.equal((await db.members.get("m1"))!.name, "Renamed");
});

test("invalid writes are rejected with issues and store nothing", async () => {
  const { db } = setup();
  try {
    await db.members.add({ ...f.member(), name: "" });
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof DbError && e.code === "invalid");
    assert.deepEqual(e.issues, [{ field: "name", code: "required" }]);
  }
  assert.deepEqual((await db.members.list()).items, []);
});

test("invalid update does not touch the stored record", async () => {
  const { db } = setup();
  await db.members.add(f.member());
  assert.equal(await code(db.members.update({ ...f.member(), leaveAt: f.T0 })), "invalid");
  assert.equal((await db.members.get("m1"))!.leaveAt, null);
});

test("remove reports whether something was removed", async () => {
  const { db } = setup();
  await db.members.add(f.member());
  assert.equal(await db.members.remove("m1"), true);
  assert.equal(await db.members.remove("m1"), false);
});

test("listBy filters by index and rejects unknown indexes", async () => {
  const { db } = setup();
  await db.members.add(f.member());
  await db.members.add({ ...f.member(), id: "m2", jamaatId: "j2" });
  assert.deepEqual((await db.members.listBy("jamaatId", "j1")).items.map((m) => m.id), ["m1"]);
  assert.equal(await code(db.members.listBy("name", "x")), "unknown");
});

test("malformed stored records are reported, not hidden or deleted; get throws", async () => {
  const { db, backend } = setup();
  await db.members.add(f.member());
  await backend.add("members", { id: "bad", name: 42 } as never);
  const list = await db.members.list();
  assert.equal(list.items.length, 1);
  assert.equal(list.malformed.length, 1);
  assert.equal(list.malformed[0]!.id, "bad");
  assert.equal(await code(db.members.get("bad")), "malformed");
  assert.notEqual(await backend.get("members", "bad"), undefined); // still stored
});

test("every store round-trips its fixture", async () => {
  const { db } = setup();
  await db.jamaats.add(f.jamaat());
  await db.appointments.add(f.appointment());
  await db.expenses.add(f.expense());
  await db.allocations.add(f.allocation());
  await db.activities.add(f.activity());
  await db.places.add(f.place());
  await db.mulaqaat.add(f.mulaqaat());
  assert.equal((await db.expenses.get("e1"))!.amountPaise, 12345);
  assert.equal((await db.places.get("pl1"))!.latitude, 12.5);
  assert.equal((await db.allocations.listBy("expenseId", "e1")).items.length, 1);
  assert.equal((await db.expenses.listBy("date", f.T0)).items.length, 1);
});

test("toDbError maps browser error names", () => {
  assert.equal(toDbError({ name: "QuotaExceededError" }).code, "quota");
  assert.equal(toDbError({ name: "ConstraintError" }).code, "exists");
  assert.equal(toDbError({ name: "VersionError" }).code, "newerVersion");
  assert.equal(toDbError({ name: "SecurityError" }).code, "unavailable");
  assert.equal(toDbError({ name: "AbortError" }).code, "transaction");
  assert.equal(toDbError(new Error("x")).code, "unknown");
  assert.equal(toDbError(null).code, "unknown");
});

test("every error and validation code has text in every language", () => {
  for (const d of Object.values(allDicts)) {
    for (const c of DB_ERROR_CODES) assert.ok(d.errors.db[c], c);
    for (const c of VALIDATION_CODES) assert.ok(d.errors.validation[c], c);
  }
});

test("newId is unique and passes id validation", () => {
  const ids = new Set(Array.from({ length: 100 }, newId));
  assert.equal(ids.size, 100);
  for (const id of ids) assert.ok(/^[A-Za-z0-9_-]{1,64}$/.test(id));
});
