import type { Expense, ExpenseCategory, Member } from "../model/types.ts";
import { isPresentAt, presenceOverlapMs } from "./eligibility.ts";
import { isTransfer } from "./expenses.ts";

// Allocation engine: pure, no UI or storage. Given an expense and the Jamaat's members it returns who
// benefits, who owes, who finally bears each share, and a calculation that can be checked by hand.
//
// Concepts (kept separate on purpose)
//   payer        - who paid cash: result.payerId (null = Jamaat funds)
//   beneficiary  - who the share is for
//   owedBy       - who owes that amount back to the payer / fund (equals the payer when nothing is owed)
//   bearer       - who ultimately bears the cost
//
// Methods
//   equal    general, misc, transport, Jamaat-treat: equal split among eligible members.
//            Eligible = present at expense.date ([joinAt, leaveAt)). Explicit participants must be eligible;
//            with no participants, everyone present is included (transport requires explicit passengers).
//   meal     food: weight = number of covered meals (expense.mealTimes) the member was present for.
//   duration food: weight = milliseconds present within [periodFrom, periodTo).
//   personal personal treat: the payer bears the whole cost; it is split equally across the beneficiaries
//            (participants, or the payer alone) with owedBy = bearer = payer, so nobody owes anyone.
//
// Rounding: share_i = floor(amount * w_i / W). The remaining paise (always fewer than the number of
// members) go one each to the members with the largest fractional remainders (amount * w_i mod W);
// ties go to the lowest member id. The result does not depend on input order.
// Every row carries amount*w = floor*W + remainder, so each line can be re-checked independently.

export const ALLOC_ERRORS = [
  "notAllocatable", "noEligible", "ineligibleMember", "unknownMember", "duplicateMember",
  "missingMeals", "missingPeriod", "personalTreatPayer", "inconsistentTotal",
] as const;
export type AllocError = (typeof ALLOC_ERRORS)[number];
export type AllocMethod = "equal" | "meal" | "duration" | "personal";

export type AllocMember = Pick<Member, "id" | "joinAt" | "leaveAt">;
export type AllocExpense = Pick<
  Expense,
  "category" | "amountPaise" | "date" | "payerId" | "paymentSource" | "participantIds" | "foodBasis" | "treatKind" | "mealTimes" | "periodFrom" | "periodTo"
>;

export interface Calculation {
  weight: number;
  weightTotal: number;
  /** amount * weight, as text (can exceed 2^53). */
  numerator: string;
  floorPaise: number;
  remainder: number;
  extraPaise: number;
}

export interface AllocationRow {
  beneficiaryId: string;
  owedById: string;
  /** null = Jamaat funds */
  bearerId: string | null;
  amountPaise: number;
  /** Compact checkable formula: amount*weight = floor*total + remainder (+extra). */
  basis: string;
  calc: Calculation;
}

export type AllocationResult =
  | { ok: true; method: AllocMethod; payerId: string | null; rows: AllocationRow[]; totalPaise: number }
  | { ok: false; error: AllocError; memberId?: string };

const fail = (error: AllocError, memberId?: string): AllocationResult =>
  memberId === undefined ? { ok: false, error } : { ok: false, error, memberId };

interface Weighted {
  id: string;
  weight: number;
}

/** Splits `amount` over positive integer weights using the largest-remainder rule described above. */
export function splitByWeight(amount: number, weights: readonly Weighted[]): { id: string; amountPaise: number; calc: Calculation }[] {
  const sorted = [...weights].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const total = sorted.reduce((s, w) => s + BigInt(w.weight), 0n);
  const A = BigInt(amount);
  const parts = sorted.map((w) => {
    const num = A * BigInt(w.weight);
    return { id: w.id, weight: w.weight, num, floor: num / total, rem: num % total, extra: 0n };
  });
  let left = A - parts.reduce((s, p) => s + p.floor, 0n);
  const order = [...parts].sort((a, b) => (a.rem === b.rem ? (a.id < b.id ? -1 : 1) : a.rem > b.rem ? -1 : 1));
  for (const p of order) {
    if (left <= 0n) break;
    p.extra = 1n;
    left -= 1n;
  }
  return parts.map((p) => ({
    id: p.id,
    amountPaise: Number(p.floor + p.extra),
    calc: {
      weight: p.weight,
      weightTotal: Number(total),
      numerator: p.num.toString(),
      floorPaise: Number(p.floor),
      remainder: Number(p.rem),
      extraPaise: Number(p.extra),
    },
  }));
}

function basisText(amount: number, c: Calculation): string {
  return `${amount}*${c.weight} = ${c.floorPaise}*${c.weightTotal} + ${c.remainder} (+${c.extraPaise})`;
}

export function isAllocatable(category: ExpenseCategory): boolean {
  return !isTransfer(category);
}

function buildRows(
  e: AllocExpense, method: AllocMethod, weights: Weighted[],
  who: (beneficiaryId: string) => { owedById: string; bearerId: string | null },
): AllocationResult {
  const rows: AllocationRow[] = splitByWeight(e.amountPaise, weights).map((s) => ({
    beneficiaryId: s.id,
    ...who(s.id),
    amountPaise: s.amountPaise,
    basis: basisText(e.amountPaise, s.calc),
    calc: s.calc,
  }));
  const total = rows.reduce((sum, r) => sum + r.amountPaise, 0);
  const valid = rows.every((r) => Number.isSafeInteger(r.amountPaise) && r.amountPaise >= 0);
  if (total !== e.amountPaise || !valid) return fail("inconsistentTotal");
  return { ok: true, method, payerId: e.payerId, rows, totalPaise: total };
}

export function allocateExpense(e: AllocExpense, members: readonly AllocMember[]): AllocationResult {
  if (!isAllocatable(e.category)) return fail("notAllocatable");
  if (!Number.isSafeInteger(e.amountPaise) || e.amountPaise <= 0) return fail("inconsistentTotal");

  const byId = new Map<string, AllocMember>();
  for (const m of members) {
    if (byId.has(m.id)) return fail("duplicateMember", m.id);
    byId.set(m.id, m);
  }
  const explicit = e.participantIds.length > 0;
  if (new Set(e.participantIds).size !== e.participantIds.length) return fail("duplicateMember");
  for (const id of e.participantIds) if (!byId.has(id)) return fail("unknownMember", id);

  const self = (id: string) => ({ owedById: id, bearerId: id });

  /** Weights for the candidate pool; explicit participants with no weight are rejected, implicit ones skipped. */
  const weigh = (weightOf: (m: AllocMember) => number): Weighted[] | AllocationResult => {
    const pool = explicit ? e.participantIds.map((id) => byId.get(id)!) : [...byId.values()];
    const out: Weighted[] = [];
    for (const m of pool) {
      const weight = weightOf(m);
      if (weight > 0) out.push({ id: m.id, weight });
      else if (explicit) return fail("ineligibleMember", m.id);
    }
    return out.length === 0 ? fail("noEligible") : out;
  };
  const present = (m: AllocMember) => (isPresentAt(m, e.date) ? 1 : 0);
  const isResult = (x: Weighted[] | AllocationResult): x is AllocationResult => !Array.isArray(x);

  if (e.category === "food") {
    if (e.foodBasis === "duration") {
      if (e.periodFrom === null || e.periodTo === null || e.periodTo <= e.periodFrom) return fail("missingPeriod");
      const [from, to] = [e.periodFrom, e.periodTo];
      const w = weigh((m) => presenceOverlapMs(m, from, to));
      return isResult(w) ? w : buildRows(e, "duration", w, self);
    }
    if (e.mealTimes.length === 0) return fail("missingMeals");
    const w = weigh((m) => e.mealTimes.filter((t) => isPresentAt(m, t)).length);
    return isResult(w) ? w : buildRows(e, "meal", w, self);
  }

  if (e.category === "treat" && e.treatKind === "personal") {
    if (e.paymentSource !== "member" || e.payerId === null) return fail("personalTreatPayer");
    const payer = e.payerId;
    // Beneficiaries: the listed participants (who must be present), otherwise the payer alone.
    const w = explicit ? weigh(present) : [{ id: payer, weight: 1 }];
    return isResult(w) ? w : buildRows(e, "personal", w, () => ({ owedById: payer, bearerId: payer }));
  }

  if (e.category === "transport" && !explicit) return fail("noEligible");
  const w = weigh(present);
  return isResult(w) ? w : buildRows(e, "equal", w, self);
}
