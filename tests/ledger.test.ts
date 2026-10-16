import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/db/index.ts";
import { MemoryBackend } from "../src/db/memory.ts";
import { DbError } from "../src/db/errors.ts";
import {
  FUND, advanceRemaining, computeBalances, findProblems, newProblems, reimbursable, reimbursementRemaining,
} from "../src/domain/ledger.ts";
import { deleteExpense, loadAudit, saveExpense } from "../src/features/expenses/service.ts";
import { saveJamaat, saveMember } from "../src/features/members/service.ts";
import { validateAudit } from "../src/model/validate.ts";
import type { Expense, Member } from "../src/model/types.ts";
import * as f from "./helpers.ts";

const members = ["a", "b", "c"].map((id) => ({ ...f.member(), id, name: `M ${id}` })) as Member[];
let n = 0;
const rec = (e: Partial<Expense> & { category: Expense["category"] }): Expense =>
  ({ ...f.expense(), id: `r${++n}`, description: `rec ${n}`, createdAt: f.T0 + n, updatedAt: f.T0 + n, participantIds: [], ...e }) as Expense;

const cost = (amount: number, payer: string | null = "a") =>
  rec({ category: "general", amountPaise: amount, payerId: payer, paymentSource: payer ? "member" : "jamaat", participantIds: ["a", "b", "c"] });
const sum = (m: Map<string, number>) => [...m.values()].reduce((x, y) => x + y, 0);

test("balances: member-paid cost - payer is owed, others owe; total is zero", () => {
  const b = computeBalances([cost(30000)], members);
  assert.equal(b.get("a"), 20000); // paid 30000, own share 10000
  assert.equal(b.get("b"), -10000);
  assert.equal(b.get("c"), -10000);
  assert.equal(b.get(FUND), 0);
  assert.equal(sum(b), 0);
});

test("balances: Jamaat-paid cost - members owe the fund", () => {
  const b = computeBalances([cost(30000, null)], members);
  assert.equal(b.get(FUND), 30000);
  assert.deepEqual(["a", "b", "c"].map((id) => b.get(id)), [-10000, -10000, -10000]);
});

test("balances: contribution/advance credit the member, refund/reimbursement reverse; always zero-sum", () => {
  const contrib = rec({ category: "contribution", amountPaise: 5000, payerId: "a" });
  const advance = rec({ category: "advance", amountPaise: 8000, payerId: "b" });
  const refund = rec({ category: "refund", amountPaise: 3000, paymentSource: "jamaat", payerId: null, counterpartyId: "b", linkedExpenseId: advance.id });
  const b = computeBalances([contrib, advance, refund], members);
  assert.equal(b.get("a"), 5000);
  assert.equal(b.get("b"), 8000 - 3000);
  assert.equal(b.get(FUND), -5000 - 8000 + 3000);
  assert.equal(sum(b), 0);
});

test("property: balances of random ledgers always sum to zero", () => {
  let seed = 7;
  const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % k; };
  const ids = ["a", "b", "c"];
  for (let i = 0; i < 200; i++) {
    const list: Expense[] = [];
    for (let j = 0; j < 1 + rnd(6); j++) {
      const k = rnd(3);
      const payer = ids[rnd(3)]!;
      if (k === 0) list.push(cost(1 + rnd(100000), rnd(2) ? payer : null));
      else if (k === 1) list.push(rec({ category: "contribution", amountPaise: 1 + rnd(50000), payerId: payer }));
      else list.push(rec({ category: "settlement", amountPaise: 1 + rnd(50000), payerId: payer, counterpartyId: ids[(ids.indexOf(payer) + 1) % 3]! }));
    }
    assert.equal(sum(computeBalances(list, members)), 0);
  }
});

test("refund: bounded by the advance; must return to the giver from the receiver", () => {
  const adv = rec({ category: "advance", amountPaise: 10000, payerId: "a" }); // a -> fund
  const refund = (amount: number, over: Partial<Expense> = {}) =>
    rec({ category: "refund", amountPaise: amount, paymentSource: "jamaat", payerId: null, counterpartyId: "a", linkedExpenseId: adv.id, ...over });
  assert.deepEqual(findProblems([adv, refund(6000), refund(4000)], members), []);
  assert.equal(advanceRemaining(adv, [adv, refund(6000)]), 4000);
  const over = [adv, refund(6000), refund(5000)];
  assert.deepEqual(findProblems(over, members).map((p) => p.code), ["overRefund"]);
  assert.deepEqual(findProblems([refund(1)], members).map((p) => p.code), ["linkInvalid"]); // advance missing
  assert.deepEqual(findProblems([adv, refund(100, { counterpartyId: "b" })], members).map((p) => p.code), ["linkInvalid"]); // wrong recipient
  assert.deepEqual(findProblems([adv, refund(100, { paymentSource: "member", payerId: "b" })], members).map((p) => p.code), ["linkInvalid"]); // wrong source
  const notAdvance = rec({ category: "contribution", amountPaise: 100, payerId: "a" });
  assert.deepEqual(findProblems([notAdvance, refund(1, { linkedExpenseId: notAdvance.id })], members).map((p) => p.code), ["linkInvalid"]);
});

test("reimbursement: bounded by what others owe the payer", () => {
  const c = cost(30000); // a paid; others owe 20000
  assert.equal(reimbursable(c, members), 20000);
  const reimb = (amount: number, over: Partial<Expense> = {}) =>
    rec({ category: "reimbursement", amountPaise: amount, paymentSource: "jamaat", payerId: null, counterpartyId: "a", linkedExpenseId: c.id, ...over });
  assert.deepEqual(findProblems([c, reimb(12000), reimb(8000)], members), []);
  assert.equal(reimbursementRemaining(c, [c, reimb(12000)], members), 8000);
  assert.deepEqual(findProblems([c, reimb(12000), reimb(8001)], members).map((p) => p.code), ["overReimburse"]);
  assert.deepEqual(findProblems([c, reimb(100, { counterpartyId: "b" })], members).map((p) => p.code), ["linkInvalid"]);
  const fundPaid = cost(1000, null);
  assert.equal(reimbursable(fundPaid, members), null);
  assert.deepEqual(findProblems([fundPaid, reimb(1, { linkedExpenseId: fundPaid.id })], members).map((p) => p.code), ["linkInvalid"]);
});

test("settlement: cannot exceed the payer's debt or the receiver's credit; double settlement blocked", () => {
  const c = cost(30000); // b and c each owe a 10000
  const settle = (amount: number, payer = "b", to = "a") => rec({ category: "settlement", amountPaise: amount, payerId: payer, counterpartyId: to });
  assert.deepEqual(findProblems([c, settle(10000)], members), []);
  assert.deepEqual(findProblems([c, settle(4000), settle(6000)], members), []); // partial payments
  assert.deepEqual(findProblems([c, settle(10000), settle(1)], members).map((p) => p.code), ["overSettle"]); // already settled
  assert.deepEqual(findProblems([c, settle(10001)], members).map((p) => p.code), ["overSettle"]);
  assert.deepEqual(findProblems([c, settle(1, "a", "b")], members).map((p) => p.code), ["overSettle"]); // a is owed, owes nothing
  const bal = computeBalances([c, settle(10000)], members);
  assert.equal(bal.get("b"), 0);
  assert.equal(bal.get("a"), 10000);
});

test("newProblems only reports problems introduced by a change", () => {
  const before = [{ expenseId: "x", code: "overSettle" as const }];
  const after = [...before, { expenseId: "y", code: "overRefund" as const }];
  assert.deepEqual(newProblems(before, after), [{ expenseId: "y", code: "overRefund" }]);
  assert.deepEqual(newProblems(after, before), []);
});

async function seeded() {
  const db = createDb(new MemoryBackend());
  await saveJamaat(db, f.jamaat(), true);
  for (const m of members) await saveMember(db, { ...f.member(), id: m.id, name: m.name }, true);
  return db;
}
const base = (over: object) => ({ ...f.expense(), payerId: "a", participantIds: [], ...over });

test("service: audit entry is written with every create, update and delete", async () => {
  const db = await seeded();
  assert.ok((await saveExpense(db, base({ id: "e1", participantIds: ["a", "b"] }), true)).ok);
  assert.ok((await saveExpense(db, base({ id: "e1", participantIds: ["a", "b"], amountPaise: 999, updatedAt: f.T0 + 1 }), false)).ok);
  await deleteExpense(db, "e1");
  const log = (await loadAudit(db, "e1")).items;
  assert.equal(log.length, 3);
  const byAction = (a: string) => log.find((x) => x.action === a)!;
  assert.equal(byAction("create").before, null);
  assert.equal((byAction("create").after as { amountPaise: number }).amountPaise, 12345);
  assert.equal((byAction("update").before as { amountPaise: number }).amountPaise, 12345);
  assert.equal((byAction("update").after as { amountPaise: number }).amountPaise, 999);
  assert.equal(byAction("delete").after, null);
  assert.equal((byAction("delete").before as { amountPaise: number }).amountPaise, 999);
  assert.equal(await db.expenses.get("e1"), null); // record gone, history stays
});

test("service: rejected changes write neither the record nor an audit entry", async () => {
  const db = await seeded();
  const bad = await saveExpense(db, base({ id: "e1", amountPaise: 0 }), true);
  assert.ok(!bad.ok);
  assert.equal((await db.audit.list()).items.length, 0);
  assert.equal((await db.expenses.list()).items.length, 0);
});

test("service: full advance -> refund lifecycle with overpayment and duplicate refund blocked", async () => {
  const db = await seeded();
  await saveExpense(db, base({ id: "adv", category: "advance", description: "advance", amountPaise: 10000, payerId: "a" }), true);
  const refund = (id: string, amount: number) => base({
    id, category: "refund", description: `refund ${id}`, amountPaise: amount, paymentSource: "jamaat", payerId: null,
    counterpartyId: "a", linkedExpenseId: "adv", date: f.T0 + 1,
  });
  assert.ok((await saveExpense(db, refund("r1", 6000), true)).ok);
  const dup = await saveExpense(db, refund("r2", 6000), true); // would refund 12000 of 10000
  assert.ok(!dup.ok && dup.issues[0]!.code === "overRefund");
  const exact = await saveExpense(db, { ...refund("r1x", 6000), description: "REFUND R1" }, true);
  assert.ok(!exact.ok); // duplicate / over
  assert.ok((await saveExpense(db, refund("r3", 4000), true)).ok);
  assert.equal((await db.expenses.list()).items.length, 3);
  const adv = (await db.expenses.get("adv"))!;
  assert.equal(advanceRemaining(adv, (await db.expenses.list()).items), 0);
});

test("service: cannot delete or shrink an advance that has refunds", async () => {
  const db = await seeded();
  await saveExpense(db, base({ id: "adv", category: "advance", description: "advance", amountPaise: 10000, payerId: "a" }), true);
  await saveExpense(db, base({
    id: "r1", category: "refund", description: "refund", amountPaise: 6000, paymentSource: "jamaat", payerId: null,
    counterpartyId: "a", linkedExpenseId: "adv",
  }), true);
  await assert.rejects(deleteExpense(db, "adv"), (e) => e instanceof DbError && e.code === "inUse");
  const shrink = await saveExpense(db, base({ id: "adv", category: "advance", description: "advance", amountPaise: 5000, payerId: "a", updatedAt: f.T0 + 1 }), false);
  assert.ok(!shrink.ok && shrink.issues[0]!.code === "ledgerConflict");
  assert.equal((await db.expenses.get("adv"))!.amountPaise, 10000);
  await deleteExpense(db, "r1"); // removing the refund first is allowed
  await deleteExpense(db, "adv");
});

test("service: settlement checks use current balances (no double settlement, no overpayment)", async () => {
  const db = await seeded();
  await saveExpense(db, base({ id: "c1", description: "tea", amountPaise: 30000, participantIds: ["a", "b", "c"] }), true);
  const settle = (id: string, amount: number) => base({
    id, category: "settlement", description: `pay ${id}`, amountPaise: amount, payerId: "b", counterpartyId: "a", date: f.T0 + 1,
  });
  const over = await saveExpense(db, settle("s0", 10001), true);
  assert.ok(!over.ok && over.issues[0]!.code === "overSettle");
  assert.ok((await saveExpense(db, settle("s1", 10000), true)).ok);
  const again = await saveExpense(db, { ...settle("s2", 10000), date: f.T0 + 2 }, true);
  assert.ok(!again.ok && again.issues[0]!.code === "overSettle");
  // the underlying cost cannot be cut below what was already settled
  const cut = await saveExpense(db, base({ id: "c1", description: "tea", amountPaise: 3000, participantIds: ["a", "b", "c"], updatedAt: f.T0 + 1 }), false);
  assert.ok(!cut.ok && cut.issues[0]!.code === "ledgerConflict");
  await assert.rejects(deleteExpense(db, "c1"), (e) => e instanceof DbError && e.code === "inUse");
});

test("batch is atomic: a failing operation leaves nothing behind", async () => {
  const db = await seeded();
  await db.expenses.add(f.expense());
  const ok = db.expenses.addOp({ ...f.expense(), id: "e9", description: "other" });
  const clash = db.expenses.addOp(f.expense()); // id e1 already exists
  await assert.rejects(db.batch([ok, clash]), (e) => e instanceof DbError && e.code === "exists");
  assert.equal(await db.expenses.get("e9"), null);
  const missing = db.expenses.updateOp({ ...f.expense(), id: "nope" });
  await assert.rejects(db.batch([db.expenses.removeOp("e1"), missing]), (e) => e instanceof DbError && e.code === "notFound");
  assert.ok(await db.expenses.get("e1"));
});

test("audit validation: snapshot shape per action", () => {
  const at = { id: "x1", at: f.T0, entityType: "expense", entityId: "e1" };
  assert.ok(validateAudit({ ...at, action: "create", before: null, after: { a: 1 } }).ok);
  assert.ok(validateAudit({ ...at, action: "update", before: { a: 1 }, after: { a: 2 } }).ok);
  assert.ok(validateAudit({ ...at, action: "delete", before: { a: 1 }, after: null }).ok);
  assert.ok(!validateAudit({ ...at, action: "create", before: { a: 1 }, after: { a: 1 } }).ok);
  assert.ok(!validateAudit({ ...at, action: "delete", before: null, after: null }).ok);
  assert.ok(!validateAudit({ ...at, action: "update", before: "x", after: {} }).ok);
});
