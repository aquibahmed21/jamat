import type { Db } from "../../db/index.ts";
import type { BatchOp } from "../../db/backend.ts";
import { DbError } from "../../db/errors.ts";
import type { AuditAction, Expense, Member } from "../../model/types.ts";
import { newId } from "../../model/id.ts";
import { validateExpense, type Result, type ValidationIssue } from "../../model/validate.ts";
import { expenseConflicts } from "../../domain/expenses.ts";
import { allocateExpense, isAllocatable, type AllocError } from "../../domain/allocation.ts";
import { findProblems, newProblems, type ProblemCode } from "../../domain/ledger.ts";

const ALLOCATION_ISSUE: Record<AllocError, ValidationIssue | null> = {
  notAllocatable: null,
  noEligible: { field: "participantIds", code: "notEligible" },
  ineligibleMember: { field: "participantIds", code: "notEligible" },
  unknownMember: { field: "participantIds", code: "notAMember" },
  duplicateMember: { field: "participantIds", code: "duplicate" },
  missingMeals: { field: "mealTimes", code: "required" },
  missingPeriod: { field: "periodTo", code: "invalidOrder" },
  personalTreatPayer: { field: "paymentSource", code: "invalidCombo" },
  inconsistentTotal: { field: "amountPaise", code: "outOfRange" },
};

const LEDGER_ISSUE: Record<ProblemCode, ValidationIssue> = {
  allocation: { field: "participantIds", code: "notEligible" },
  linkInvalid: { field: "linkedExpenseId", code: "linkInvalid" },
  overRefund: { field: "amountPaise", code: "overRefund" },
  overReimburse: { field: "amountPaise", code: "overReimburse" },
  overSettle: { field: "amountPaise", code: "overSettle" },
};

/** Append-only history entry with full before/after snapshots. */
function auditOp(db: Db, action: AuditAction, before: Expense | null, after: Expense | null): BatchOp {
  const snap = (e: Expense | null) => (e === null ? null : (structuredClone(e) as unknown as Record<string, unknown>));
  return db.audit.addOp({
    id: newId(), at: Date.now(), entityType: "expense",
    entityId: (after ?? before)!.id, action, before: snap(before), after: snap(after),
  });
}

async function context(db: Db, jamaatId: string): Promise<{ members: Member[]; all: Expense[] }> {
  const jamaat = await db.jamaats.get(jamaatId);
  if (!jamaat) throw new DbError("notFound", { store: "jamaats", id: jamaatId });
  const [members, all] = await Promise.all([
    db.members.listBy("jamaatId", jamaat.id),
    db.expenses.listBy("jamaatId", jamaat.id),
  ]);
  return { members: members.items, all: all.items };
}

/**
 * Saves a record. Returns issues to show on the form, or the saved record. The record and its audit entry
 * are written in one atomic batch. A change that would make any ledger rule fail is refused.
 */
export async function saveExpense(db: Db, input: unknown, isNew: boolean): Promise<Result<Expense>> {
  const v = validateExpense(input);
  if (!v.ok) return v;
  const e = v.value;
  const { members, all } = await context(db, e.jamaatId);
  const issues = expenseConflicts(e, all, members);

  if (issues.length === 0 && isAllocatable(e.category)) {
    // An expense that cannot be split (nobody eligible, absent participant...) is refused up front.
    const split = allocateExpense(e, members);
    const issue = split.ok ? null : ALLOCATION_ISSUE[split.error];
    if (issue) issues.push(issue);
  }

  const previous = all.find((x) => x.id === e.id) ?? null;
  if (issues.length === 0) {
    const after = [...all.filter((x) => x.id !== e.id), e];
    for (const p of newProblems(findProblems(all, members), findProblems(after, members))) {
      issues.push(p.expenseId === e.id ? LEDGER_ISSUE[p.code] : { field: "", code: "ledgerConflict" });
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  const write = isNew ? db.expenses.addOp(e) : db.expenses.updateOp(e);
  await db.batch([write, auditOp(db, isNew ? "create" : "update", isNew ? null : previous, e)]);
  return v;
}

/**
 * Deletes a record (the UI confirms first). Refused with DbError "inUse" while allocation records refer to it
 * or when removing it would make other records inconsistent (e.g. an advance that has refunds).
 */
export async function deleteExpense(db: Db, id: string): Promise<void> {
  const target = await db.expenses.get(id);
  if (!target) throw new DbError("notFound", { store: "expenses", id });
  const allocs = await db.allocations.listBy("expenseId", id);
  if (allocs.items.length + allocs.malformed.length > 0) throw new DbError("inUse", { store: "expenses", id });
  const { members, all } = await context(db, target.jamaatId);
  const after = all.filter((x) => x.id !== id);
  if (newProblems(findProblems(all, members), findProblems(after, members)).length > 0) {
    throw new DbError("inUse", { store: "expenses", id });
  }
  await db.batch([db.expenses.removeOp(id), auditOp(db, "delete", target, null)]);
}

/** Audit history, newest first. */
export async function loadAudit(db: Db, entityId?: string) {
  const l = entityId ? await db.audit.listBy("entityId", entityId) : await db.audit.list();
  return { items: [...l.items].sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1)), malformed: l.malformed };
}
