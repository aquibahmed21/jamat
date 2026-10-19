import { TRANSFER_CATEGORIES, type Expense, type ExpenseCategory, type Member } from "../model/types.ts";
import type { ValidationIssue } from "../model/validate.ts";

export const isTransfer = (c: ExpenseCategory): boolean => TRANSFER_CATEGORIES.includes(c);

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Context rules: referenced people must be Jamaat members; transfers need two different parties; no accidental duplicates. */
export function expenseConflicts(e: Expense, others: readonly Expense[], members: readonly Member[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const known = (id: string) => members.some((m) => m.id === id);
  if (e.payerId !== null && !known(e.payerId)) issues.push({ field: "payerId", code: "notAMember" });
  if (e.counterpartyId !== null) {
    if (!known(e.counterpartyId)) issues.push({ field: "counterpartyId", code: "notAMember" });
    else if (e.counterpartyId === e.payerId) issues.push({ field: "counterpartyId", code: "samePartyTransfer" });
  }
  if (e.participantIds.some((id) => !known(id))) issues.push({ field: "participantIds", code: "notAMember" });
  const dup = others.some(
    (o) => o.id !== e.id && o.category === e.category && o.date === e.date && o.amountPaise === e.amountPaise &&
      o.payerId === e.payerId && same(o.description, e.description),
  );
  if (dup) issues.push({ field: "description", code: "duplicateExpense" });
  return issues;
}
