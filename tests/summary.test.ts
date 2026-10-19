import { test } from "node:test";
import assert from "node:assert/strict";
import { memberStats, programmeNow, summarizeFinance } from "../src/domain/summary.ts";
import { FUND, computeBalances } from "../src/domain/ledger.ts";
import type { Expense, Member, ProgrammeActivity } from "../src/model/types.ts";
import * as f from "./helpers.ts";

const H = f.HOUR;
const mem = (id: string, join: number, leave: number | null = null): Member =>
  ({ ...f.member(), id, name: id, joinAt: f.T0 + join * H, leaveAt: leave === null ? null : f.T0 + leave * H }) as Member;
let n = 0;
const rec = (o: Partial<Expense>): Expense =>
  ({ ...f.expense(), id: `x${++n}`, description: `r${n}`, createdAt: f.T0 + n, participantIds: ["a", "b", "c"], payerId: "a", ...o }) as Expense;
const members = [mem("a", 0), mem("b", 0), mem("c", 0)];

test("memberStats: present / left / not yet joined, boundaries exact", () => {
  const ms = [mem("a", 0), mem("b", 0, 5), mem("c", 10)];
  assert.deepEqual(memberStats(ms, f.T0 + 5 * H - 1), { total: 3, present: 2, left: 0, notYetJoined: 1 });
  assert.deepEqual(memberStats(ms, f.T0 + 5 * H), { total: 3, present: 1, left: 1, notYetJoined: 1 }); // leave instant = absent
  assert.deepEqual(memberStats(ms, f.T0 + 10 * H), { total: 3, present: 2, left: 1, notYetJoined: 0 }); // join instant = present
  assert.deepEqual(memberStats([], f.T0), { total: 0, present: 0, left: 0, notYetJoined: 0 });
});

test("finance: empty ledger is all zeros", () => {
  assert.deepEqual(summarizeFinance([], members), {
    recordCount: 0, costPaise: 0, byCategory: {}, contributionsPaise: 0, advancesHeldPaise: 0,
    outstandingPaise: 0, owedToMembersPaise: 0, problemRecords: 0,
  });
});

test("finance: totals come from the records and the ledger", () => {
  const list = [
    rec({ category: "general", amountPaise: 30000 }), // a paid; b and c owe 10000 each
    rec({ category: "food", foodBasis: "meal", mealTimes: [f.T0], amountPaise: 9000, payerId: "b" }), // b paid; a and c owe 3000
    rec({ category: "contribution", amountPaise: 5000, participantIds: [], payerId: "c" }),
    rec({ category: "advance", amountPaise: 8000, participantIds: [], payerId: "a" }),
    rec({ category: "refund", amountPaise: 3000, participantIds: [], paymentSource: "jamaat", payerId: null, counterpartyId: "a", linkedExpenseId: "x4" }),
  ];
  const s = summarizeFinance(list, members);
  assert.equal(s.recordCount, 5);
  assert.equal(s.costPaise, 39000);
  assert.deepEqual(s.byCategory, { general: 30000, food: 9000 });
  assert.equal(s.contributionsPaise, 5000);
  assert.equal(s.advancesHeldPaise, 5000);
  // cross-check against the ledger itself (no separate arithmetic in the summary)
  const bal = computeBalances(list, members);
  const neg = members.reduce((t, m) => t + Math.max(0, -(bal.get(m.id) ?? 0)), 0);
  const pos = members.reduce((t, m) => t + Math.max(0, bal.get(m.id) ?? 0), 0);
  assert.equal(s.outstandingPaise, neg);
  assert.equal(s.owedToMembersPaise, pos);
  assert.equal(pos - neg, -(bal.get(FUND) ?? 0)); // members net = minus the fund: the books balance
});

test("finance: problem records are counted once, not hidden", () => {
  const settled = rec({ category: "settlement", amountPaise: 1, participantIds: [], payerId: "a", counterpartyId: "b" }); // a owes nothing
  const s = summarizeFinance([settled], members);
  assert.equal(s.problemRecords, 1);
  assert.equal(summarizeFinance([rec({ category: "general", amountPaise: 3000 })], members).problemRecords, 0);
});

const act = (id: string, order: number, start: number, end: number | null): ProgrammeActivity =>
  ({ ...f.activity(), id, title: id, order, startMin: start, endMin: end }) as ProgrammeActivity;
const prog = [act("tea", 0, 360, 390), act("taleem", 1, 420, 480), act("point", 2, 450, null), act("lunch", 3, 780, 840)];
const ids = (l: ProgrammeActivity[]) => l.map((a) => a.id);

test("programmeNow: current uses [start, end) and ignores instants", () => {
  assert.deepEqual(ids(programmeNow(prog, 359).current), []);
  assert.deepEqual(ids(programmeNow(prog, 360).current), ["tea"]); // start inclusive
  assert.deepEqual(ids(programmeNow(prog, 389).current), ["tea"]);
  assert.deepEqual(ids(programmeNow(prog, 390).current), []); // end exclusive
  assert.deepEqual(ids(programmeNow(prog, 450).current), ["taleem"]);
});

test("programmeNow: next is the earliest later start, any kind", () => {
  assert.equal(programmeNow(prog, 0).next!.id, "tea");
  assert.equal(programmeNow(prog, 360).next!.id, "taleem"); // strictly after now
  assert.equal(programmeNow(prog, 430).next!.id, "point");
  assert.equal(programmeNow(prog, 780).next, null);
  assert.equal(programmeNow(prog, 1439).next, null);
  assert.deepEqual(programmeNow([], 100), { current: [], next: null });
});

test("programmeNow: ties go to the manual order; manual order beats list order", () => {
  const tie = [act("b", 1, 500, 520), act("a", 0, 500, 530)];
  assert.equal(programmeNow(tie, 0).next!.id, "a");
  assert.deepEqual(ids(programmeNow([act("x", 1, 500, 600), act("y", 0, 550, 650)], 560).current), ["y", "x"]);
});
