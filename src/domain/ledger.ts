import type { Expense, Member } from "../model/types.ts";
import { allocateExpense, isAllocatable } from "./allocation.ts";

// Ledger: balances and consistency rules derived from the expense records (nothing is stored here).
//
// Double entry. Every record moves value between accounts - the members and the Jamaat fund - as entries
// that sum to zero. A positive balance means "the group owes this account", negative means "this account owes".
//   shared cost   payer account +amount; each share's bearer account -share
//   transfer      (contribution, advance, refund, reimbursement, settlement) paying account +amount, receiving account -amount
//                 paying account  = payerId  (null = fund);  receiving account = counterpartyId (null = fund)
// So the balances of all accounts always add up to exactly zero.
//
// Lifecycle rules (checked by findProblems; a change that introduces a new problem is refused)
//   refund         links an advance; it must flow back from the account that received the advance to the member who gave it;
//                  all refunds of one advance together may not exceed the advance.
//   reimbursement  links a member-paid shared cost; it must go to that payer; all reimbursements of one cost together may
//                  not exceed what the other members owe the payer (amount minus the payer's own share).
//   settlement     member -> member; may not exceed what the payer owes nor what the receiver is owed
//                  (balances taken from all non-settlement records; settlements applied in date order).
//   Records are never rewritten silently: every change is audited (see features/expenses/service.ts).

export const FUND = "@fund";

export interface Entry {
  account: string;
  delta: number;
}

export const PROBLEM_CODES = ["allocation", "linkInvalid", "overRefund", "overReimburse", "overSettle"] as const;
export type ProblemCode = (typeof PROBLEM_CODES)[number];
export interface Problem {
  expenseId: string;
  code: ProblemCode;
}

const acct = (id: string | null) => id ?? FUND;
const TRANSFER_FAMILY = ["contribution", "advance", "refund", "reimbursement", "settlement"] as const;
const isTransferRecord = (e: Expense) => (TRANSFER_FAMILY as readonly string[]).includes(e.category);

/** Date, then creation time, then id: a total order. */
export function chronological(a: Expense, b: Expense): number {
  return a.date - b.date || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Entries for one record, or null when it is an allocatable cost that cannot currently be split. */
export function entriesFor(e: Expense, members: readonly Member[]): Entry[] | null {
  if (isTransferRecord(e)) {
    return [{ account: acct(e.payerId), delta: e.amountPaise }, { account: acct(e.counterpartyId), delta: -e.amountPaise }];
  }
  const split = allocateExpense(e, members);
  if (!split.ok) return null;
  return [
    { account: acct(e.payerId), delta: e.amountPaise },
    ...split.rows.map((r) => ({ account: acct(r.bearerId), delta: -r.amountPaise })),
  ];
}

function emptyBalances(members: readonly Member[]): Map<string, number> {
  return new Map<string, number>([[FUND, 0], ...members.map((m) => [m.id, 0] as [string, number])]);
}

function post(bal: Map<string, number>, entries: readonly Entry[]): void {
  for (const en of entries) bal.set(en.account, (bal.get(en.account) ?? 0) + en.delta);
}

/** Balances of every account (members and FUND). Records that cannot be split are skipped (see findProblems). */
export function computeBalances(expenses: readonly Expense[], members: readonly Member[]): Map<string, number> {
  const bal = emptyBalances(members);
  for (const e of expenses) post(bal, entriesFor(e, members) ?? []);
  return bal;
}

/** Amount of an advance not yet refunded. */
export function advanceRemaining(advance: Expense, all: readonly Expense[]): number {
  const refunded = all.filter((x) => x.category === "refund" && x.linkedExpenseId === advance.id)
    .reduce((s, x) => s + x.amountPaise, 0);
  return advance.amountPaise - refunded;
}

/** What others owe the payer of a member-paid shared cost (null if the cost is not reimbursable). */
export function reimbursable(cost: Expense, members: readonly Member[]): number | null {
  if (isTransferRecord(cost) || cost.payerId === null || !isAllocatable(cost.category)) return null;
  const split = allocateExpense(cost, members);
  if (!split.ok) return null;
  const own = split.rows.filter((r) => r.bearerId === cost.payerId).reduce((s, r) => s + r.amountPaise, 0);
  return cost.amountPaise - own;
}

export function reimbursementRemaining(cost: Expense, all: readonly Expense[], members: readonly Member[]): number | null {
  const cap = reimbursable(cost, members);
  if (cap === null) return null;
  const paid = all.filter((x) => x.category === "reimbursement" && x.linkedExpenseId === cost.id)
    .reduce((s, x) => s + x.amountPaise, 0);
  return cap - paid;
}

/** All rule violations in the current set of records. */
export function findProblems(expenses: readonly Expense[], members: readonly Member[]): Problem[] {
  const problems: Problem[] = [];
  const byId = new Map(expenses.map((e) => [e.id, e]));
  const sorted = [...expenses].sort(chronological);
  const add = (e: Expense, code: ProblemCode) => problems.push({ expenseId: e.id, code });

  for (const e of sorted) if (!isTransferRecord(e) && entriesFor(e, members) === null) add(e, "allocation");

  const refunded = new Map<string, number>();
  const reimbursed = new Map<string, number>();
  for (const e of sorted) {
    if (e.category === "refund") {
      const adv = e.linkedExpenseId ? byId.get(e.linkedExpenseId) : undefined;
      if (!adv || adv.category !== "advance" || acct(e.payerId) !== acct(adv.counterpartyId) || e.counterpartyId !== adv.payerId) {
        add(e, "linkInvalid");
        continue;
      }
      const total = (refunded.get(adv.id) ?? 0) + e.amountPaise;
      refunded.set(adv.id, total);
      if (total > adv.amountPaise) add(e, "overRefund");
    } else if (e.category === "reimbursement") {
      const cost = e.linkedExpenseId ? byId.get(e.linkedExpenseId) : undefined;
      const cap = cost ? reimbursable(cost, members) : null;
      if (!cost || cap === null || e.counterpartyId !== cost.payerId) {
        add(e, "linkInvalid");
        continue;
      }
      const total = (reimbursed.get(cost.id) ?? 0) + e.amountPaise;
      reimbursed.set(cost.id, total);
      if (total > cap) add(e, "overReimburse");
    }
  }

  const bal = computeBalances(expenses.filter((e) => e.category !== "settlement"), members);
  for (const e of sorted) {
    if (e.category !== "settlement") continue;
    if (e.payerId === null || e.counterpartyId === null) { add(e, "linkInvalid"); continue; }
    const debt = Math.max(0, -(bal.get(e.payerId) ?? 0));
    const credit = Math.max(0, bal.get(e.counterpartyId) ?? 0);
    if (e.amountPaise > debt || e.amountPaise > credit) add(e, "overSettle");
    post(bal, entriesFor(e, members) ?? []);
  }
  return problems;
}

/** Problems present after a change that were not present before it. */
export function newProblems(before: readonly Problem[], after: readonly Problem[]): Problem[] {
  const key = (p: Problem) => `${p.expenseId}:${p.code}`;
  const known = new Set(before.map(key));
  return after.filter((p) => !known.has(key(p)));
}
