import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDb, type Db } from "../src/db/index.ts";
import { MemoryBackend } from "../src/db/memory.ts";
import { DbError } from "../src/db/errors.ts";
import { allocateExpense } from "../src/domain/allocation.ts";
import { computeBalances, findProblems } from "../src/domain/ledger.ts";
import { jamaatConflicts } from "../src/domain/members.ts";
import { periodIssues } from "../src/domain/periods.ts";
import { saveAppointment } from "../src/features/ameer/service.ts";
import { deleteExpense, saveExpense } from "../src/features/expenses/service.ts";
import { deleteJamaat, saveJamaat, saveMember } from "../src/features/members/service.ts";
import { savePlace, saveMulaqaat } from "../src/features/places/service.ts";
import { MAX_AMOUNT_PAISE, TRANSFER_CATEGORIES } from "../src/model/types.ts";
import { validateExpense } from "../src/model/validate.ts";
import { parseBackup } from "../src/backup/parse.ts";
import * as f from "./helpers.ts";

const H = f.HOUR;
const ids = ["a", "b", "c"];

async function seeded(): Promise<Db> {
  const db = createDb(new MemoryBackend());
  await saveJamaat(db, { ...f.jamaat(), endAt: f.T0 + 100 * H }, true);
  for (const id of ids) await saveMember(db, { ...f.member(), id, name: `Member ${id}` }, true);
  return db;
}
const exp = (over: object) => ({ ...f.expense(), payerId: "a", participantIds: [], ...over });
const code = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e instanceof DbError ? e.code : "other"; } return "none"; };

// ---------- accounting: historical splits are frozen ----------
test("'everyone present' is resolved and stored at save time", async () => {
  const db = await seeded();
  const r = await saveExpense(db, exp({ id: "e1", amountPaise: 30000 }), true);
  assert.ok(r.ok);
  assert.deepEqual(r.value.participantIds, ["a", "b", "c"]);
  assert.deepEqual((await db.expenses.get("e1"))!.participantIds, ["a", "b", "c"]);
});

test("members added or edited later never change a saved split", async () => {
  const db = await seeded();
  await saveExpense(db, exp({ id: "e1", amountPaise: 30000, date: f.T0 + 5 * H }), true);
  const split = async () => {
    const e = (await db.expenses.get("e1"))!;
    const members = (await db.members.listBy("jamaatId", "j1")).items;
    const s = allocateExpense(e, members);
    assert.ok(s.ok);
    return s.rows.map((x) => [x.beneficiaryId, x.amountPaise]);
  };
  const before = await split();
  assert.deepEqual(before, [["a", 10000], ["b", 10000], ["c", 10000]]);
  // a new member who was already present when the expense happened
  await saveMember(db, { ...f.member(), id: "d", name: "Latecomer", joinAt: f.T0 + H }, true);
  assert.deepEqual(await split(), before);
  assert.deepEqual(computeBalances([(await db.expenses.get("e1"))!], (await db.members.listBy("jamaatId", "j1")).items).get("a"), 20000);
});

test("legacy records without stored participants still allocate (explicit list is optional on read)", () => {
  const e = { ...f.expense(), participantIds: [] } as never;
  const r = allocateExpense(e, [f.member() as never]);
  assert.ok(r.ok);
});

test("editing a member's presence so that a counted participant was absent is refused", async () => {
  const db = await seeded();
  await saveExpense(db, exp({ id: "e1", amountPaise: 30000, date: f.T0 + 5 * H }), true);
  const m = (await db.members.get("b"))!;
  const late = await saveMember(db, { ...m, joinAt: f.T0 + 8 * H, updatedAt: f.T0 + 1 }, false);
  assert.ok(!late.ok && late.issues[0]!.code === "ledgerConflict" && late.issues[0]!.field === "joinAt");
  const left = await saveMember(db, { ...m, leaveAt: f.T0 + 2 * H, updatedAt: f.T0 + 1 }, false);
  assert.ok(!left.ok && left.issues[0]!.field === "leaveAt");
  assert.equal((await db.members.get("b"))!.joinAt, f.T0); // unchanged
  const fine = await saveMember(db, { ...m, leaveAt: f.T0 + 50 * H, updatedAt: f.T0 + 1 }, false); // leaves after the expense
  assert.ok(fine.ok);
});

// ---------- integrity: periods ----------
test("periodIssues: boundaries are start-inclusive, end-exclusive", () => {
  const j = { startAt: 100, endAt: 200 };
  const c = (s: number, e: number | null) => periodIssues("s", s, "e", e, j).map((i) => `${i.field}:${i.code}`);
  assert.deepEqual(c(100, null), []);
  assert.deepEqual(c(99, null), ["s:beforeJamaatStart"]);
  assert.deepEqual(c(199, 200), []);
  assert.deepEqual(c(200, null), ["s:afterJamaatEnd"]);
  assert.deepEqual(c(150, 201), ["e:afterJamaatEnd"]);
  assert.deepEqual(periodIssues("s", 1e12, "e", null, { startAt: 0, endAt: null }), []);
});

test("changing the Jamaat period cannot orphan members, appointments or mulaqaat", async () => {
  const db = await seeded();
  await saveAppointment(db, { ...f.appointment(), id: "ap1", memberId: "a", startAt: f.T0 + 10 * H }, true);
  await savePlace(db, f.place(), true);
  await saveMulaqaat(db, { ...f.mulaqaat(), personIds: [], at: f.T0 + 20 * H }, true);
  const j = (await db.jamaats.get("j1"))!;
  const code2 = async (over: object) => { const r = await saveJamaat(db, { ...j, ...over, updatedAt: f.T0 + 1 }, false); return r.ok ? ["ok"] : r.issues.map((i) => `${i.field}:${i.code}`); };
  assert.deepEqual(await code2({ startAt: f.T0 + 15 * H }), ["startAt:conflictsWithMembers", "startAt:conflictsWithRecords"]);
  assert.deepEqual(await code2({ endAt: f.T0 + 15 * H }), ["endAt:conflictsWithRecords"]);
  assert.deepEqual(await code2({ endAt: f.T0 + 21 * H }), ["ok"]);
  assert.deepEqual(jamaatConflicts({ ...j, endAt: null } as never, []), []);
});

test("deleting a Jamaat is atomic: a failure midway removes nothing", async () => {
  class Flaky extends MemoryBackend {
    removes = 0;
    override async remove(store: string, id: string): Promise<boolean> {
      if (++this.removes === 2) throw new DbError("quota");
      return super.remove(store, id);
    }
  }
  const backend = new Flaky();
  const db = createDb(backend);
  await saveJamaat(db, f.jamaat(), true);
  for (const id of ids) await saveMember(db, { ...f.member(), id, name: `M ${id}` }, true);
  backend.removes = 0;
  await assert.rejects(deleteJamaat(db, "j1"), (e) => e instanceof DbError && e.code === "quota");
  assert.ok(await db.jamaats.get("j1"));
  assert.equal((await db.members.listBy("jamaatId", "j1")).items.length, 3);
  backend.removes = 100;
  await deleteJamaat(db, "j1");
  assert.equal(await db.jamaats.get("j1"), null);
  assert.equal((await db.members.list()).items.length, 0);
});

// ---------- integrity: concurrent edits ----------
test("a stale edit is refused instead of silently overwriting a newer change", async () => {
  const db = await seeded();
  await saveExpense(db, exp({ id: "e1", amountPaise: 30000 }), true);
  const opened = (await db.expenses.get("e1"))!.updatedAt;
  // another tab saves first
  assert.ok((await saveExpense(db, exp({ id: "e1", amountPaise: 31000, updatedAt: f.T0 + 10 }), false, opened)).ok);
  // this tab still holds the old version
  assert.equal(await code(saveExpense(db, exp({ id: "e1", amountPaise: 99000, updatedAt: f.T0 + 20 }), false, opened)), "conflict");
  assert.equal((await db.expenses.get("e1"))!.amountPaise, 31000);
  assert.equal((await db.audit.listBy("entityId", "e1")).items.length, 2); // no audit entry for the refused write
});

test("the same protection exists for members, places and the Jamaat", async () => {
  const db = await seeded();
  const m = (await db.members.get("a"))!;
  assert.ok((await saveMember(db, { ...m, notes: "first", updatedAt: f.T0 + 5 }, false, m.updatedAt)).ok);
  assert.equal(await code(saveMember(db, { ...m, notes: "stale", updatedAt: f.T0 + 6 }, false, m.updatedAt)), "conflict");
  await savePlace(db, f.place(), true);
  const p = (await db.places.get("pl1"))!;
  assert.ok((await savePlace(db, { ...p, notes: "x", updatedAt: f.T0 + 5 }, false, p.updatedAt)).ok);
  assert.equal(await code(savePlace(db, { ...p, notes: "y", updatedAt: f.T0 + 6 }, false, p.updatedAt)), "conflict");
  assert.equal(await code(db.members.update({ ...m, updatedAt: f.T0 + 9 }, 12345)), "conflict");
  assert.equal(await code(db.members.update({ ...m, id: "nope", updatedAt: f.T0 + 9 }, 1)), "notFound");
});

// ---------- accounting: fuzzed ledger invariants ----------
test("fuzz: whatever the user does, accepted history never breaks a ledger rule and refusals change nothing", async () => {
  let seed = 20260101;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const pick = <T,>(l: T[]): T => l[rnd(l.length)]!;
  const db = await seeded();
  const snapshot = async () => JSON.stringify((await db.expenses.list()).items.sort((x, y) => (x.id < y.id ? -1 : 1)));
  let accepted = 0, refused = 0;
  for (let i = 0; i < 300; i++) {
    const all = (await db.expenses.list()).items;
    const adv = all.filter((e) => e.category === "advance");
    const costs = all.filter((e) => e.category === "general");
    const base = { id: `x${i}`, description: `rec ${i}`, date: f.T0 + (1 + rnd(40)) * H, createdAt: f.T0 + i, updatedAt: f.T0 + i, amountPaise: 1 + rnd(50000) };
    let input: Record<string, unknown>;
    switch (rnd(7)) {
      case 0: case 1: input = exp({ ...base, category: "general", payerId: rnd(4) ? pick(ids) : null, paymentSource: "member", participantIds: rnd(2) ? [] : ids.filter(() => rnd(2) === 0) }); break;
      case 2: { const p = pick(ids); input = exp({ ...base, category: "settlement", payerId: p, counterpartyId: pick(ids.filter((x) => x !== p)) }); break; }
      case 3: input = exp({ ...base, category: "advance", payerId: pick(ids) }); break;
      case 4: { const a = adv.length ? pick(adv) : null; input = exp({ ...base, category: "refund", paymentSource: "jamaat", payerId: null, counterpartyId: a?.payerId ?? "a", linkedExpenseId: a?.id ?? "none" }); break; }
      case 5: { const c = costs.length ? pick(costs) : null; input = exp({ ...base, category: "reimbursement", paymentSource: "jamaat", payerId: null, counterpartyId: c?.payerId ?? "a", linkedExpenseId: c?.id ?? "none" }); break; }
      default: input = exp({ ...base, category: "contribution", payerId: pick(ids) });
    }
    if (input.category === "general" && input.payerId === null) input.paymentSource = "jamaat";
    const before = await snapshot();
    const auditBefore = (await db.audit.list()).items.length;
    // occasionally edit or delete an existing record instead
    let outcome: "ok" | "refused";
    if (all.length > 0 && rnd(5) === 0) {
      const target = pick(all);
      if (rnd(2) === 0) {
        outcome = (await code(deleteExpense(db, target.id))) === "none" ? "ok" : "refused";
      } else {
        const r = await saveExpense(db, { ...target, amountPaise: 1 + rnd(60000), updatedAt: target.updatedAt + 1 }, false, target.updatedAt);
        outcome = r.ok ? "ok" : "refused";
      }
    } else {
      const r = await saveExpense(db, input, true).catch(() => ({ ok: false as const }));
      outcome = r.ok ? "ok" : "refused";
    }
    const now = (await db.expenses.list()).items;
    const members = (await db.members.listBy("jamaatId", "j1")).items;
    assert.deepEqual(findProblems(now, members), [], `step ${i}: ledger rules broken`);
    const bal = computeBalances(now, members);
    assert.equal([...bal.values()].reduce((s, v) => s + v, 0), 0, `step ${i}: balances do not sum to zero`);
    assert.ok([...bal.values()].every(Number.isSafeInteger));
    if (outcome === "refused") {
      refused++;
      assert.equal(await snapshot(), before, `step ${i}: a refused change altered data`);
      assert.equal((await db.audit.list()).items.length, auditBefore, `step ${i}: refused change wrote history`);
    } else {
      accepted++;
      assert.equal((await db.audit.list()).items.length, auditBefore + 1, `step ${i}: accepted change lacks exactly one history entry`);
    }
  }
  assert.ok(accepted > 60 && refused > 20, `fuzz should exercise both paths (accepted ${accepted}, refused ${refused})`);
});

// ---------- input limits ----------
test("amount cap keeps every sum of records exactly representable", () => {
  assert.ok(validateExpense({ ...f.expense(), amountPaise: MAX_AMOUNT_PAISE }).ok);
  const over = validateExpense({ ...f.expense(), amountPaise: MAX_AMOUNT_PAISE + 1 });
  assert.ok(!over.ok && over.issues[0]!.code === "outOfRange");
  assert.ok(Number.isSafeInteger(MAX_AMOUNT_PAISE * 50_000)); // 50k maximal records still sum safely
});

test("participant lists are bounded", () => {
  const many = Array.from({ length: 501 }, (_, i) => `m${i}`);
  const r = validateExpense({ ...f.expense(), participantIds: many });
  assert.ok(!r.ok && r.issues[0]!.code === "tooLong");
  assert.ok(validateExpense({ ...f.expense(), participantIds: many.slice(0, 500) }).ok);
});

// ---------- transport details ----------
test("vehicle and fuel are transport-only, optional, and validated", () => {
  const t = { ...f.expense(), category: "transport", participantIds: ["m1"] };
  assert.ok(validateExpense(t).ok); // older records without the fields stay valid
  const ok = validateExpense({ ...t, vehicle: "taxi", transportCost: "fuel" });
  assert.ok(ok.ok && ok.value.vehicle === "taxi" && ok.value.transportCost === "fuel");
  const codes = (o: object) => { const r = validateExpense({ ...t, ...o }); return r.ok ? [] : r.issues.map((i) => `${i.field}:${i.code}`); };
  assert.deepEqual(codes({ vehicle: "rocket" }), ["vehicle:invalidEnum"]);
  assert.deepEqual(codes({ transportCost: "toll" }), ["transportCost:invalidEnum"]);
  assert.deepEqual(codes({ category: "general", vehicle: "car" }), ["vehicle:invalidCombo"]);
  assert.deepEqual(codes({ category: "food", foodBasis: "meal", mealTimes: [f.T0], transportCost: "fare" }), ["transportCost:invalidCombo"]);
});

test("personal and Jamaat-paid fuel both work (payer rules are unchanged)", async () => {
  const db = await seeded();
  const base = { id: "t1", category: "transport", description: "Fuel", amountPaise: 90000, vehicle: "bike", transportCost: "fuel", participantIds: ["a", "b", "c"], date: f.T0 + H };
  assert.ok((await saveExpense(db, exp({ ...base, payerId: "a" }), true)).ok); // paid personally
  assert.ok((await saveExpense(db, exp({ ...base, id: "t2", description: "Fuel 2", paymentSource: "jamaat", payerId: null }), true)).ok); // paid by Jamaat
  const all = (await db.expenses.list()).items;
  assert.equal(computeBalances(all, (await db.members.listBy("jamaatId", "j1")).items).get("@fund"), 90000);
});

// ---------- single source of truth ----------
test("transfer categories are defined once and agree with the ledger and validator", async () => {
  assert.deepEqual([...TRANSFER_CATEGORIES].sort(), ["advance", "contribution", "refund", "reimbursement", "settlement"]);
  const src = readFileSync(new URL("../src/domain/ledger.ts", import.meta.url), "utf8") + readFileSync(new URL("../src/model/validate.ts", import.meta.url), "utf8");
  assert.ok(!/TRANSFER_FAMILY|\[\s*"contribution",\s*"advance"/.test(src), "the transfer category list must not be duplicated");
});

// ---------- imported data stays bounded ----------
test("a backup with an oversized list is rejected", () => {
  const exp1 = { ...f.expense(), participantIds: Array.from({ length: 501 }, (_, i) => `m${i}`) };
  const text = JSON.stringify({ app: "jamat", format: 1, schemaVersion: 2, exportedAt: 1, data: { jamaats: [f.jamaat()], expenses: [exp1] } });
  const r = parseBackup(text);
  assert.ok(!r.ok && r.issues.some((i) => i.code === "invalidRecord" && i.field === "participantIds"));
});

// ---------- web security hardening ----------
test("index.html ships a strict Content-Security-Policy and a referrer policy", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)![1]!;
  for (const d of ["default-src 'none'", "script-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(d), d);
  assert.ok(!/unsafe-inline|unsafe-eval|https?:|\*/.test(csp));
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.ok(!/<script(?![^>]*src=)/.test(html) && !/\sstyle="/.test(html));
});

// ---------- performance: realistic upper bounds stay fast ----------
test("performance: thousands of records are summarised and validated quickly", async () => {
  const members = Array.from({ length: 40 }, (_, i) => ({ ...f.member(), id: `p${i}`, name: `P ${i}` })) as never[];
  const ms = members.map((m: { id: string }) => m.id);
  const list = Array.from({ length: 3000 }, (_, i) => ({
    ...f.expense(), id: `x${i}`, description: `r${i}`, createdAt: f.T0 + i, updatedAt: f.T0 + i, payerId: ms[i % 40], amountPaise: 1000 + (i % 977),
    participantIds: ms.slice(0, 5 + (i % 30)),
  })) as never[];
  const t0 = performance.now();
  const problems = findProblems(list, members);
  const balances = computeBalances(list, members);
  const elapsed = performance.now() - t0;
  assert.deepEqual(problems, []);
  assert.equal([...balances.values()].reduce((a, b) => a + b, 0), 0);
  assert.ok(elapsed < 2000, `3000 records took ${elapsed.toFixed(0)}ms`);

  const db = createDb(new MemoryBackend());
  await saveJamaat(db, { ...f.jamaat(), endAt: f.T0 + 100 * H }, true);
  for (const m of members as { id: string; name: string }[]) await saveMember(db, { ...f.member(), id: m.id, name: m.name }, true);
  for (const e of (list as { id: string }[]).slice(0, 1500)) await db.expenses.add(e);
  const t1 = performance.now();
  const r = await saveExpense(db, exp({ id: "new1", description: "one more", payerId: "p1", participantIds: ms.slice(0, 10), amountPaise: 12345 }), true);
  const saveMs = performance.now() - t1;
  assert.ok(r.ok);
  assert.ok(saveMs < 1500, `saving with 1500 existing records took ${saveMs.toFixed(0)}ms`);
});
