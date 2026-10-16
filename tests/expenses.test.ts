import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/db/index.ts";
import { MemoryBackend } from "../src/db/memory.ts";
import { DbError } from "../src/db/errors.ts";
import { formatPaise, paiseToInput, parseRupees } from "../src/domain/money.ts";
import { expenseConflicts, isTransfer } from "../src/domain/expenses.ts";
import { deleteExpense, saveExpense } from "../src/features/expenses/service.ts";
import { saveJamaat, saveMember } from "../src/features/members/service.ts";
import { validateExpense } from "../src/model/validate.ts";
import * as f from "./helpers.ts";

test("parseRupees: exact integer paise, no float arithmetic", () => {
  assert.equal(parseRupees("125.50"), 12550);
  assert.equal(parseRupees("125.5"), 12550);
  assert.equal(parseRupees("125"), 12500);
  assert.equal(parseRupees("0.07"), 7);
  assert.equal(parseRupees("1,234.56"), 123456);
  assert.equal(parseRupees(" 19.99 "), 1999);
  assert.equal(parseRupees("0.29"), 29); // 0.29*100 === 28.999999999999996 in floats
  assert.equal(parseRupees("1.15"), 115);
});

test("parseRupees rejects zero, negatives, extra decimals, junk, overflow", () => {
  for (const bad of ["", "0", "0.00", "-5", "1.234", "1e3", "abc", "1.", ".5", "12 3", "99999999999999.00", "NaN"]) {
    assert.equal(parseRupees(bad), null, bad);
  }
});

test("formatPaise uses Indian grouping and two decimals", () => {
  assert.equal(formatPaise(12550, "₹"), "₹125.50");
  assert.equal(formatPaise(7, "₹"), "₹0.07");
  assert.equal(formatPaise(123456789, "₹"), "₹12,34,567.89");
  assert.equal(formatPaise(-250, "₹"), "-₹2.50");
  assert.equal(paiseToInput(12550), "125.50");
  assert.equal(parseRupees(paiseToInput(123456)), 123456);
});

test("transfer categories", () => {
  for (const c of ["contribution", "advance", "reimbursement", "settlement", "refund"] as const) assert.ok(isTransfer(c));
  for (const c of ["food", "general", "transport", "misc", "treat"] as const) assert.ok(!isTransfer(c));
});

const codes = (r: ReturnType<typeof validateExpense>) => (r.ok ? [] : r.issues.map((i) => `${i.field}:${i.code}`));
const transfer = (category: string, extra = {}) => ({ ...f.expense(), category, participantIds: [], ...extra });

test("validator: transfer rules", () => {
  assert.deepEqual(codes(validateExpense(transfer("contribution"))), []);
  assert.deepEqual(codes(validateExpense(transfer("settlement"))), ["counterpartyId:required"]);
  assert.deepEqual(codes(validateExpense(transfer("settlement", { counterpartyId: "m2" }))), []);
  assert.deepEqual(codes(validateExpense(transfer("advance", { paymentSource: "jamaat", payerId: null }))), ["paymentSource:invalidCombo", "counterpartyId:samePartyTransfer"]);
  assert.deepEqual(codes(validateExpense(transfer("refund", { paymentSource: "jamaat", payerId: null, counterpartyId: "m1" }))), ["linkedExpenseId:required"]);
  assert.deepEqual(codes(validateExpense(transfer("refund", { paymentSource: "jamaat", payerId: null, counterpartyId: "m1", linkedExpenseId: "e0" }))), []);
  assert.deepEqual(codes(validateExpense(transfer("reimbursement", { counterpartyId: "m1", linkedExpenseId: "e0" }))), ["counterpartyId:samePartyTransfer"]);
  assert.deepEqual(codes(validateExpense(transfer("refund", { paymentSource: "jamaat", payerId: null, linkedExpenseId: "e0" }))), ["counterpartyId:samePartyTransfer"]); // fund -> fund
  assert.deepEqual(codes(validateExpense({ ...f.expense(), linkedExpenseId: "e0" })), ["linkedExpenseId:invalidCombo"]);
  assert.deepEqual(codes(validateExpense(transfer("contribution", { participantIds: ["m1"] }))), ["participantIds:invalidCombo"]);
  assert.deepEqual(codes(validateExpense({ ...f.expense(), counterpartyId: "m2" })), ["counterpartyId:invalidCombo"]);
});

const members = [f.member(), { ...f.member(), id: "m2", name: "Member Two" }] as never[];
const E = f.expense() as never;

test("conflicts: referenced people must be members; transfer parties differ", () => {
  const c = (e: object) => expenseConflicts({ ...f.expense(), ...e } as never, [], members).map((i) => `${i.field}:${i.code}`);
  assert.deepEqual(c({}), []);
  assert.deepEqual(c({ payerId: "zz" }), ["payerId:notAMember"]);
  assert.deepEqual(c({ participantIds: ["m1", "zz"] }), ["participantIds:notAMember"]);
  assert.deepEqual(c({ category: "settlement", counterpartyId: "m1" }), ["counterpartyId:samePartyTransfer"]);
  assert.deepEqual(c({ category: "settlement", counterpartyId: "zz" }), ["counterpartyId:notAMember"]);
});

test("conflicts: exact duplicates detected, not self, not different amounts", () => {
  const dupe = { ...f.expense(), id: "e2", description: " WATER " } as never;
  assert.deepEqual(expenseConflicts(dupe, [E], members).map((i) => i.code), ["duplicateExpense"]);
  assert.deepEqual(expenseConflicts(E, [E], members), []);
  assert.deepEqual(expenseConflicts({ ...dupe, amountPaise: 1 } as never, [E], members), []);
});

async function seeded() {
  const db = createDb(new MemoryBackend());
  await saveJamaat(db, f.jamaat(), true);
  await saveMember(db, f.member(), true);
  await saveMember(db, { ...f.member(), id: "m2", name: "Member Two" }, true);
  return db;
}

test("service: create, edit, duplicate refused, validation refused, delete", async () => {
  const db = await seeded();
  assert.ok((await saveExpense(db, f.expense(), true)).ok);
  const dup = await saveExpense(db, { ...f.expense(), id: "e2" }, true);
  assert.ok(!dup.ok && dup.issues[0]!.code === "duplicateExpense");
  assert.equal((await db.expenses.list()).items.length, 1);
  assert.ok((await saveExpense(db, { ...f.expense(), amountPaise: 5000 }, false)).ok);
  assert.equal((await db.expenses.get("e1"))!.amountPaise, 5000);
  const bad = await saveExpense(db, { ...f.expense(), id: "e3", amountPaise: 12.5 }, true);
  assert.ok(!bad.ok);
  await deleteExpense(db, "e1");
  assert.equal(await db.expenses.get("e1"), null);
});

test("service: needs an existing Jamaat; deleting is blocked while allocations exist", async () => {
  const empty = createDb(new MemoryBackend());
  await assert.rejects(saveExpense(empty, f.expense(), true), (e) => e instanceof DbError && e.code === "notFound");
  const db = await seeded();
  await saveExpense(db, f.expense(), true);
  await db.allocations.add(f.allocation());
  await assert.rejects(deleteExpense(db, "e1"), (e) => e instanceof DbError && e.code === "inUse");
  assert.ok(await db.expenses.get("e1"));
});

test("service: refuses expenses that cannot be allocated", async () => {
  const db = await seeded();
  const r = (e: object, id: string) => saveExpense(db, { ...f.expense(), id, ...e }, true);
  const issue = async (p: ReturnType<typeof r>) => { const x = await p; return x.ok ? "ok" : `${x.issues[0]!.field}:${x.issues[0]!.code}`; };
  assert.equal(await issue(r({ date: f.T0 - f.HOUR, description: "early" }, "x1")), "participantIds:notEligible"); // nobody present yet
  assert.equal(await issue(r({ category: "transport", participantIds: [], description: "cab" }, "x2")), "participantIds:notEligible");
  assert.equal(await issue(r({ category: "treat", treatKind: "personal", paymentSource: "jamaat", payerId: null, description: "t" }, "x3")), "paymentSource:invalidCombo");
  assert.equal(await issue(r({ description: "ok" }, "x4")), "ok");
  assert.equal((await db.expenses.list()).items.length, 1);
});
