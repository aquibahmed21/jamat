import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateExpense, splitByWeight, type AllocExpense, type AllocMember } from "../src/domain/allocation.ts";
import { HOUR, T0 } from "./helpers.ts";

const at = (h: number) => T0 + h * HOUR;
const mem = (id: string, join = 0, leave: number | null = null): AllocMember => ({ id, joinAt: at(join), leaveAt: leave === null ? null : at(leave) });
const base: AllocExpense = {
  category: "general", amountPaise: 10000, date: at(5), payerId: "a", paymentSource: "member",
  participantIds: [], foodBasis: null, treatKind: null, mealTimes: [], periodFrom: null, periodTo: null,
};
const run = (e: Partial<AllocExpense>, members: AllocMember[]) => allocateExpense({ ...base, ...e }, members);
const amounts = (r: ReturnType<typeof run>) => (r.ok ? Object.fromEntries(r.rows.map((x) => [x.beneficiaryId, x.amountPaise])) : r);
const err = (r: ReturnType<typeof run>) => (r.ok ? "ok" : r.error + (r.memberId ? `:${r.memberId}` : ""));

test("splitByWeight: remainder paise go to largest remainders, ties by lowest id", () => {
  const s = splitByWeight(100, [{ id: "c", weight: 1 }, { id: "a", weight: 1 }, { id: "b", weight: 1 }]);
  assert.deepEqual(s.map((x) => [x.id, x.amountPaise]), [["a", 34], ["b", 33], ["c", 33]]);
  const t = splitByWeight(101, [{ id: "a", weight: 1 }, { id: "b", weight: 1 }, { id: "c", weight: 1 }]);
  assert.deepEqual(t.map((x) => x.amountPaise), [34, 34, 33]);
});

test("splitByWeight: weighted largest remainder (not 'first gets it')", () => {
  // 10 paise, weights 1:1:2 -> exact 2.5, 2.5, 5 -> floors 2,2,5 (=9); remainders tie (0.5 each) -> id order gives a
  const s = splitByWeight(10, [{ id: "a", weight: 1 }, { id: "b", weight: 1 }, { id: "c", weight: 2 }]);
  assert.deepEqual(s.map((x) => x.amountPaise), [3, 2, 5]);
  // 100 paise, weights 1:2:4 (total 7): exact 14.28, 28.57, 57.14 -> floors 14,28,57 (=99); largest remainder is b
  const t = splitByWeight(100, [{ id: "a", weight: 1 }, { id: "b", weight: 2 }, { id: "c", weight: 4 }]);
  assert.deepEqual(t.map((x) => x.amountPaise), [14, 29, 57]);
});

test("every row is independently verifiable: amount*w = floor*W + remainder", () => {
  const s = splitByWeight(12345, [{ id: "a", weight: 3 }, { id: "b", weight: 5 }, { id: "c", weight: 7 }]);
  for (const x of s) {
    assert.equal(BigInt(x.calc.numerator), BigInt(12345) * BigInt(x.calc.weight));
    assert.equal(BigInt(x.calc.numerator), BigInt(x.calc.floorPaise) * BigInt(x.calc.weightTotal) + BigInt(x.calc.remainder));
    assert.equal(x.amountPaise, x.calc.floorPaise + x.calc.extraPaise);
  }
});

test("property: totals always reconcile, no negatives, order independent, extras < members", () => {
  let seed = 12345;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 500; i++) {
    const n = 1 + rnd(9);
    const ws = Array.from({ length: n }, (_, k) => ({ id: `m${k}`, weight: 1 + rnd(rnd(2) ? 50 : 4_000_000_000) }));
    const amount = 1 + rnd(2_000_000_000);
    const a = splitByWeight(amount, ws);
    const b = splitByWeight(amount, [...ws].reverse());
    assert.equal(a.reduce((s, x) => s + x.amountPaise, 0), amount);
    assert.ok(a.every((x) => Number.isSafeInteger(x.amountPaise) && x.amountPaise >= 0));
    assert.deepEqual(a, b);
    assert.ok(a.filter((x) => x.calc.extraPaise > 0).length < n);
  }
});

test("huge amounts keep exact integer arithmetic", () => {
  const big = Number.MAX_SAFE_INTEGER;
  const s = splitByWeight(big, [{ id: "a", weight: 1 }, { id: "b", weight: 1 }, { id: "c", weight: 1 }]);
  assert.equal(s.reduce((x, y) => x + y.amountPaise, 0), big);
});

test("general: equal split among everyone present at the expense date", () => {
  const r = run({}, [mem("a"), mem("b"), mem("c", 6), mem("d", 0, 5)]); // c joins later, d already left
  assert.deepEqual(amounts(r), { a: 5000, b: 5000 });
});

test("general: boundary times (join instant included, leave instant excluded)", () => {
  assert.deepEqual(amounts(run({}, [mem("a"), mem("b", 5)])), { a: 5000, b: 5000 });
  assert.deepEqual(amounts(run({}, [mem("a"), mem("b", 0, 5)])), { a: 10000 });
});

test("general: explicit participants must be eligible; unknown ids rejected", () => {
  assert.deepEqual(amounts(run({ participantIds: ["a", "b"] }, [mem("a"), mem("b"), mem("c")])), { a: 5000, b: 5000 });
  assert.equal(err(run({ participantIds: ["a", "c"] }, [mem("a"), mem("c", 6)])), "ineligibleMember:c");
  assert.equal(err(run({ participantIds: ["a", "zz"] }, [mem("a")])), "unknownMember:zz");
});

test("empty groups", () => {
  assert.equal(err(run({}, [])), "noEligible");
  assert.equal(err(run({}, [mem("a", 9)])), "noEligible");
});

test("rounding: 3 members, 10000 paise -> 3334/3333/3333, remainder to lowest id", () => {
  const r = run({}, [mem("c"), mem("a"), mem("b")]);
  assert.deepEqual(amounts(r), { a: 3334, b: 3333, c: 3333 });
  assert.ok(r.ok && r.totalPaise === 10000);
  assert.equal(r.ok && r.rows[0]!.basis, "10000*1 = 3333*3 + 1 (+1)");
});

test("transport: equal split among actual passengers only", () => {
  const ms = [mem("a"), mem("b"), mem("c")];
  assert.deepEqual(amounts(run({ category: "transport", participantIds: ["a", "c"], amountPaise: 9001 }, ms)), { a: 4501, c: 4500 });
  assert.equal(err(run({ category: "transport" }, ms)), "noEligible"); // passengers required
  assert.equal(err(run({ category: "transport", participantIds: ["b"], date: at(-1) }, ms)), "ineligibleMember:b");
});

test("misc and Jamaat-treat behave like general", () => {
  const ms = [mem("a"), mem("b")];
  assert.deepEqual(amounts(run({ category: "misc" }, ms)), { a: 5000, b: 5000 });
  const r = run({ category: "treat", treatKind: "jamaat" }, ms);
  assert.ok(r.ok && r.method === "equal");
});

test("personal treat: payer bears everything; nobody owes anyone else", () => {
  const ms = [mem("a"), mem("b"), mem("c")];
  const solo = run({ category: "treat", treatKind: "personal" }, ms);
  assert.ok(solo.ok);
  assert.deepEqual(solo.rows.map((x) => [x.beneficiaryId, x.owedById, x.bearerId, x.amountPaise]), [["a", "a", "a", 10000]]);
  const group = run({ category: "treat", treatKind: "personal", participantIds: ["b", "c"] }, ms);
  assert.ok(group.ok && group.method === "personal");
  assert.deepEqual(group.rows.map((x) => [x.beneficiaryId, x.owedById, x.bearerId, x.amountPaise]), [["b", "a", "a", 5000], ["c", "a", "a", 5000]]);
  assert.equal(err(run({ category: "treat", treatKind: "personal", paymentSource: "jamaat", payerId: null }, ms)), "personalTreatPayer");
});

test("payer, beneficiary, debtor, bearer stay separate (member pays for others)", () => {
  const r = run({ payerId: "a" }, [mem("a"), mem("b")]);
  assert.ok(r.ok && r.payerId === "a");
  assert.ok(r.rows.every((x) => x.owedById === x.beneficiaryId && x.bearerId === x.beneficiaryId));
  const jam = run({ payerId: null, paymentSource: "jamaat" }, [mem("a"), mem("b")]);
  assert.ok(jam.ok && jam.payerId === null);
});

test("food meal-based: weight = meals attended", () => {
  const meals = [at(1), at(5), at(9)];
  // a: all 3 meals, b: joins at 4 -> 2 meals, c: leaves at 6 -> 2 meals (1,5)
  const r = run({ category: "food", foodBasis: "meal", mealTimes: meals, amountPaise: 7000 }, [mem("a"), mem("b", 4), mem("c", 0, 6)]);
  assert.deepEqual(amounts(r), { a: 3000, b: 2000, c: 2000 }); // 3:2:2 of 7000
  assert.ok(r.ok && r.method === "meal" && r.rows[0]!.calc.weightTotal === 7);
});

test("food meal-based: boundaries and ineligible members", () => {
  const ms = [mem("a"), mem("b", 5), mem("z", 0, 1)];
  const meal = { category: "food" as const, foodBasis: "meal" as const, mealTimes: [at(1)], amountPaise: 100 };
  assert.deepEqual(amounts(run(meal, ms)), { a: 100 }); // z left exactly at meal time -> absent; b not yet joined
  assert.equal(err(run({ ...meal, participantIds: ["a", "b"] }, ms)), "ineligibleMember:b");
  assert.deepEqual(amounts(run({ ...meal, mealTimes: [at(5)] }, ms)), { a: 50, b: 50 }); // joined exactly at meal time
  assert.equal(err(run({ ...meal, mealTimes: [] }, ms)), "missingMeals");
  assert.equal(err(run({ ...meal, mealTimes: [at(-5)] }, [mem("a", 0)])), "noEligible");
});

test("food duration-based: weight = time present in the period", () => {
  const e = { category: "food" as const, foodBasis: "duration" as const, periodFrom: at(0), periodTo: at(10), amountPaise: 10000 };
  // a 10h, b 5h (joins at 5), c 5h (leaves at 5)
  const r = run(e, [mem("a"), mem("b", 5), mem("c", 0, 5)]);
  assert.deepEqual(amounts(r), { a: 5000, b: 2500, c: 2500 });
  assert.ok(r.ok && r.method === "duration");
  assert.equal(r.ok && r.rows[0]!.calc.weight, 10 * HOUR);
});

test("food duration-based: invalid period, no overlap, explicit ineligible", () => {
  const e = { category: "food" as const, foodBasis: "duration" as const, periodFrom: at(0), periodTo: at(10), amountPaise: 100 };
  assert.equal(err(run({ ...e, periodFrom: null }, [mem("a")])), "missingPeriod");
  assert.equal(err(run({ ...e, periodTo: at(0) }, [mem("a")])), "missingPeriod");
  assert.equal(err(run(e, [mem("a", 10)])), "noEligible");
  assert.equal(err(run({ ...e, participantIds: ["a", "b"] }, [mem("a"), mem("b", 10)])), "ineligibleMember:b");
  assert.deepEqual(amounts(run(e, [mem("a", 0, 10), mem("b", -5, 1)])), { a: 91, b: 9 }); // 10h:1h of 100 paise (90.9 / 9.09)
});

test("transfers are not allocatable", () => {
  for (const category of ["contribution", "advance", "reimbursement", "settlement", "refund"] as const) {
    assert.equal(err(run({ category }, [mem("a")])), "notAllocatable");
  }
});

test("invalid inputs: duplicate members, duplicate participants, bad amounts", () => {
  assert.equal(err(run({}, [mem("a"), mem("a")])), "duplicateMember:a");
  assert.equal(err(run({ participantIds: ["a", "a"] }, [mem("a")])), "duplicateMember");
  for (const amountPaise of [0, -1, 1.5, NaN]) assert.equal(err(run({ amountPaise }, [mem("a")])), "inconsistentTotal");
});

test("no duplicate charges: one row per beneficiary, rows sum to the amount", () => {
  const r = run({ amountPaise: 99999 }, [mem("a"), mem("b"), mem("c"), mem("d"), mem("e"), mem("f"), mem("g")]);
  assert.ok(r.ok);
  assert.equal(new Set(r.rows.map((x) => x.beneficiaryId)).size, r.rows.length);
  assert.equal(r.rows.reduce((s, x) => s + x.amountPaise, 0), 99999);
  assert.ok(r.rows.every((x) => x.amountPaise === 14285 || x.amountPaise === 14286));
});

test("every allocation error has text in every language", async () => {
  const { allDicts } = await import("../src/guitext.ts");
  const { ALLOC_ERRORS } = await import("../src/domain/allocation.ts");
  for (const d of Object.values(allDicts)) for (const c of ALLOC_ERRORS) assert.ok(d.allocation.errors[c], c);
});
