import type { Expense, ExpenseCategory, Member, ProgrammeActivity } from "../model/types.ts";
import { isPresentAt } from "./eligibility.ts";
import { isAllocatable } from "./allocation.ts";
import { computeBalances, findProblems } from "./ledger.ts";
import { sortActivities } from "./timetable.ts";

// Read-only summaries. Everything is derived from the records through the ledger / allocation rules;
// the UI only formats these numbers.

export interface MemberStats {
  total: number;
  present: number;
  left: number;
  notYetJoined: number;
}

export function memberStats(members: readonly Member[], now: number): MemberStats {
  const present = members.filter((m) => isPresentAt(m, now)).length;
  const notYetJoined = members.filter((m) => m.joinAt > now).length;
  return { total: members.length, present, left: members.length - present - notYetJoined, notYetJoined };
}

export interface FinanceSummary {
  recordCount: number;
  /** Total of shared costs (food, general, transport, misc, treats). */
  costPaise: number;
  /** Cost totals per category, only categories that have records. */
  byCategory: Partial<Record<ExpenseCategory, number>>;
  contributionsPaise: number;
  /** Advances received minus what was refunded. */
  advancesHeldPaise: number;
  /** Sum of what members owe (negative balances). */
  outstandingPaise: number;
  /** Sum of what members are owed (positive balances). */
  owedToMembersPaise: number;
  /** Records that break a ledger rule or cannot be split. */
  problemRecords: number;
}

export function summarizeFinance(expenses: readonly Expense[], members: readonly Member[]): FinanceSummary {
  const sum = (pick: (e: Expense) => boolean) => expenses.filter(pick).reduce((s, e) => s + e.amountPaise, 0);
  const byCategory: FinanceSummary["byCategory"] = {};
  for (const e of expenses) {
    if (isAllocatable(e.category)) byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amountPaise;
  }
  const balances = computeBalances(expenses, members);
  let outstanding = 0;
  let owed = 0;
  for (const m of members) {
    const b = balances.get(m.id) ?? 0;
    if (b < 0) outstanding -= b;
    else owed += b;
  }
  return {
    recordCount: expenses.length,
    costPaise: sum((e) => isAllocatable(e.category)),
    byCategory,
    contributionsPaise: sum((e) => e.category === "contribution"),
    advancesHeldPaise: sum((e) => e.category === "advance") - sum((e) => e.category === "refund"),
    outstandingPaise: outstanding,
    owedToMembersPaise: owed,
    problemRecords: new Set(findProblems(expenses, members).map((p) => p.expenseId)).size,
  };
}

export interface ProgrammeNow {
  /** Timed activities running at `nowMin` ([start, end)). */
  current: ProgrammeActivity[];
  /** The next activity starting after `nowMin` (earliest start; ties in manual order), or null for the rest of the day. */
  next: ProgrammeActivity | null;
}

export function programmeNow(activities: readonly ProgrammeActivity[], nowMin: number): ProgrammeNow {
  const ordered = sortActivities(activities);
  const current = ordered.filter((a) => a.endMin !== null && a.startMin <= nowMin && nowMin < a.endMin);
  let next: ProgrammeActivity | null = null;
  for (const a of ordered) if (a.startMin > nowMin && (next === null || a.startMin < next.startMin)) next = a;
  return { current, next };
}
