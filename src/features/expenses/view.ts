import { getDb, type Db } from "../../db/index.ts";
import { fmt, gt } from "../../guitext.ts";
import {
  EXPENSE_CATEGORIES, FOOD_BASES, PAYMENT_SOURCES, TREAT_KINDS,
  type AuditEntry, type Expense, type ExpenseCategory, type Jamaat, type Member,
} from "../../model/types.ts";
import { newId } from "../../model/id.ts";
import { isTransfer } from "../../domain/expenses.ts";
import { formatPaise, paiseToInput, parseRupees } from "../../domain/money.ts";
import { button } from "../../ui/button.ts";
import { formatDateTime, fromInputValue, toInputValue } from "../../ui/datetime.ts";
import { alertDialog, confirmDialog } from "../../ui/dialog.ts";
import { el } from "../../ui/dom.ts";
import { editor } from "../../ui/editor.ts";
import { errorText } from "../../ui/errors.ts";
import { checkGroup, field, selectField, setOptions } from "../../ui/form.ts";
import { timeList } from "../../ui/timelist.ts";
import { allocateExpense, isAllocatable, type AllocationResult } from "../../domain/allocation.ts";
import { emptyState } from "../../ui/states.ts";
import { listMembers, loadJamaat } from "../members/service.ts";
import type { ViewContext } from "../members/view.ts";
import { advanceRemaining, computeBalances, FUND, findProblems, reimbursable, reimbursementRemaining } from "../../domain/ledger.ts";
import { deleteExpense, loadAudit, saveExpense } from "./service.ts";

const LIST = "#/expenses";
const money = (paise: number) => formatPaise(paise, gt().currencySymbol);

export async function renderExpenses(ctx: ViewContext): Promise<HTMLElement> {
  const t = gt().expenses;
  const db = await getDb();
  const { jamaat } = await loadJamaat(db);
  if (!jamaat) {
    const box = emptyState(t.noJamaatTitle, t.noJamaatHint, "expenses");
    box.append(button({ label: t.goMembers, onClick: () => ctx.go("#/members") }));
    return box;
  }
  const [members, expenses] = await Promise.all([
    listMembers(db, jamaat.id),
    db.expenses.listBy("jamaatId", jamaat.id),
  ]);
  const [section, id] = ctx.rest;
  const current = expenses.items.find((e) => e.id === id) ?? null;
  const missing = () => emptyState(gt().states.notFound, gt().states.notFoundHint, "warning");
  if (section === "balances") return balances(ctx, members.items, expenses.items);
  if (section === "history") return history(ctx, db, expenses.items);
  if (section === "new") return expenseForm(ctx, db, jamaat, members.items, expenses.items, null);
  if (section === "edit") return current ? expenseForm(ctx, db, jamaat, members.items, expenses.items, current) : missing();
  if (section === "view") {
    return current ? detail(ctx, db, members.items, expenses.items, current, (await loadAudit(db, current.id)).items) : missing();
  }
  return list(ctx, db, members.items, expenses.items);
}

function payerName(e: Expense, members: readonly Member[]): string {
  const t = gt().expenses;
  if (e.payerId === null) return t.paidByFund;
  return fmt(t.paidBy, { name: members.find((m) => m.id === e.payerId)?.name ?? "" });
}

async function confirmRemove(db: Db, e: Expense): Promise<boolean> {
  const t = gt().expenses;
  const ok = await confirmDialog({
    title: t.deleteTitle,
    message: fmt(t.deleteText, { description: e.description }),
    confirmLabel: gt().common.delete,
    destructive: true,
  });
  if (!ok) return false;
  try {
    await deleteExpense(db, e.id);
    return true;
  } catch (err) {
    await alertDialog(t.cannotDelete, errorText(err));
    return false;
  }
}

function list(ctx: ViewContext, db: Db, members: Member[], expenses: Expense[]): HTMLElement {
  const t = gt().expenses;
  const c = gt().common;
  const sorted = [...expenses].sort((a, b) => b.date - a.date || (a.id < b.id ? -1 : 1));
  const row = (e: Expense) =>
    el("li", { class: "row" },
      el("div", { class: "row-main" },
        el("a", { class: "row-title", text: e.description, attrs: { href: `${LIST}/view/${e.id}` } }),
        el("div", { class: "badges" }, el("span", { class: "badge badge-muted", text: t.categories[e.category] })),
        el("div", { class: "muted small", text: `${formatDateTime(e.date)} · ${payerName(e, members)}` }),
      ),
      el("div", { class: "row-end" },
        el("strong", { class: "amount", text: money(e.amountPaise) }),
        el("div", { class: "row-actions" },
          button({ label: `${c.edit}: ${e.description}`, icon: "edit", iconOnly: true, onClick: () => ctx.go(`${LIST}/edit/${e.id}`) }),
          button({
            label: `${c.delete}: ${e.description}`, icon: "delete", iconOnly: true,
            onClick: async () => { if (await confirmRemove(db, e)) ctx.refresh(); },
          }),
        ),
      ),
    );
  return el("div", { class: "stack" },
    el("div", { class: "toolbar" },
      el("h2", { text: t.title }),
      el("div", { class: "actions" },
        button({ label: gt().ledger.balances, onClick: () => ctx.go(`${LIST}/balances`) }),
        button({ label: gt().ledger.history, onClick: () => ctx.go(`${LIST}/history`) }),
        button({ label: t.add, icon: "plus", variant: "primary", onClick: () => ctx.go(`${LIST}/new`) }),
      ),
    ),
    sorted.length === 0
      ? emptyState(t.emptyTitle, t.emptyHint, "expenses")
      : el("ul", { class: "list" }, ...sorted.map(row)),
  );
}

function detail(ctx: ViewContext, db: Db, members: Member[], all: Expense[], e: Expense, log: AuditEntry[]): HTMLElement {
  const t = gt().expenses;
  const c = gt().common;
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  const rows: [string, string][] = [
    [t.category, t.categories[e.category]],
    [t.amount, money(e.amountPaise)],
    [t.date, formatDateTime(e.date)],
    [t.source, t.sources[e.paymentSource]],
  ];
  if (e.payerId) rows.push([t.payer, name(e.payerId)]);
  if (isTransfer(e.category) && e.category !== "contribution" && e.category !== "advance") {
    rows.push([t.counterparty, e.counterpartyId ? name(e.counterpartyId) : t.fundOption]);
  }
  if (e.foodBasis) rows.push([t.foodBasis, t.foodBases[e.foodBasis]]);
  if (e.treatKind) rows.push([t.treatKind, t.treatKinds[e.treatKind]]);
  if (e.participantIds.length > 0) rows.push([t.participants, e.participantIds.map(name).join(", ")]);
  const lg = gt().ledger;
  const linked = e.linkedExpenseId ? all.find((x) => x.id === e.linkedExpenseId) : undefined;
  const status = progress(e, all, members);

  return el("div", { class: "stack" },
    el("h2", { text: e.description }),
    el("dl", { class: "details" }, ...rows.flatMap(([k, v]) => [el("dt", { text: k }), el("dd", { text: v })])),
    linked ? el("p", {}, el("span", { class: "muted", text: `${lg.linkedTo}: ` }), el("a", { text: linked.description, attrs: { href: `${LIST}/view/${linked.id}` } })) : null,
    status ? el("p", {}, el("strong", { text: status })) : null,
    isAllocatable(e.category) ? breakdown(e, members) : null,
    auditList(log),
    el("div", { class: "actions" },
      button({ label: t.back, onClick: () => ctx.go(LIST) }),
      button({ label: c.edit, icon: "edit", onClick: () => ctx.go(`${LIST}/edit/${e.id}`) }),
      button({
        label: c.delete, icon: "delete", variant: "danger",
        onClick: async () => { if (await confirmRemove(db, e)) ctx.go(LIST); },
      }),
    ),
  );
}

function expenseForm(ctx: ViewContext, db: Db, jamaat: Jamaat, members: Member[], all: Expense[], current: Expense | null): HTMLElement {
  const t = gt().expenses;
  const memberOptions = members.map((m) => ({ value: m.id, label: m.name }));
  const fields = {
    category: selectField({
      label: t.category, required: true, value: current?.category ?? "general",
      options: EXPENSE_CATEGORIES.map((k) => ({ value: k, label: t.categories[k] })),
    }),
    date: field({ label: t.date, type: "datetime-local", required: true, value: toInputValue(current?.date ?? Date.now()) }),
    description: field({ label: t.description, required: true, value: current?.description ?? "" }),
    amountPaise: field({
      label: t.amount, required: true, hint: t.amountHint, value: current ? paiseToInput(current.amountPaise) : "",
    }),
    foodBasis: selectField({
      label: t.foodBasis, required: true, value: current?.foodBasis ?? "meal",
      options: FOOD_BASES.map((k) => ({ value: k, label: t.foodBases[k] })),
    }),
    treatKind: selectField({
      label: t.treatKind, required: true, value: current?.treatKind ?? "personal",
      options: TREAT_KINDS.map((k) => ({ value: k, label: t.treatKinds[k] })),
    }),
    paymentSource: selectField({
      label: t.source, required: true, value: current?.paymentSource ?? "member",
      options: PAYMENT_SOURCES.map((k) => ({ value: k, label: t.sources[k] })),
    }),
    payerId: selectField({ label: t.payer, required: true, value: current?.payerId ?? members[0]?.id, options: memberOptions }),
    counterpartyId: selectField({
      label: t.counterparty, value: current?.counterpartyId ?? "",
      options: [{ value: "", label: t.fundOption }, ...memberOptions],
    }),
    linkedExpenseId: selectField({ label: t.category, value: current?.linkedExpenseId ?? "", options: [] }),
    mealTimes: timeList({ label: t.meals, hint: t.mealsHint, initial: current?.mealTimes }),
    periodFrom: field({ label: t.periodFrom, type: "datetime-local", required: true, value: current?.periodFrom == null ? "" : toInputValue(current.periodFrom) }),
    periodTo: field({ label: t.periodTo, type: "datetime-local", required: true, value: current?.periodTo == null ? "" : toInputValue(current.periodTo) }),
    participantIds: checkGroup({ label: t.participants, hint: t.participantsHint, options: memberOptions, selected: current?.participantIds }),
  };

  const lg = gt().ledger;
  let linkCategory: ExpenseCategory | null = null;
  /** Records a refund/reimbursement can point at, with what is still open on each. */
  const linkChoices = (cat: ExpenseCategory) => {
    const keep = current?.linkedExpenseId;
    const out: { rec: Expense; left: number }[] = [];
    for (const x of all) {
      if (x.id === current?.id) continue;
      const left = cat === "refund" && x.category === "advance" ? advanceRemaining(x, all)
        : cat === "reimbursement" ? reimbursementRemaining(x, all, members) : null;
      if (left !== null && (left > 0 || x.id === keep)) out.push({ rec: x, left });
    }
    return out;
  };
  const relabelLink = (cat: ExpenseCategory) => {
    const label = fields.linkedExpenseId.root.querySelector("label");
    if (label) label.textContent = `${cat === "refund" ? lg.linkRefund : lg.linkReimbursement} (${gt().common.required})`;
    setOptions(fields.linkedExpenseId.input, [
      { value: "", label: lg.linkNone },
      ...linkChoices(cat).map((c) => ({ value: c.rec.id, label: `${c.rec.description} · ${money(c.left)} ${lg.remaining}` })),
    ], fields.linkedExpenseId.input.value || current?.linkedExpenseId || "");
  };
  const onLink = () => {
    const cat = fields.category.input.value as ExpenseCategory;
    const target = all.find((x) => x.id === fields.linkedExpenseId.input.value);
    if (!target) return;
    fields.counterpartyId.input.value = target.payerId ?? "";
    if (cat === "refund") {
      fields.paymentSource.input.value = target.counterpartyId === null ? "jamaat" : "member";
      if (target.counterpartyId !== null) fields.payerId.input.value = target.counterpartyId;
    }
    const left = linkChoices(cat).find((c) => c.rec.id === target.id)?.left;
    if (left && fields.amountPaise.input.value.trim() === "") fields.amountPaise.input.value = paiseToInput(left);
    sync();
  };
  const sync = () => {
    const cat = fields.category.input.value as ExpenseCategory;
    const transfer = isTransfer(cat);
    const food = cat === "food";
    fields.foodBasis.root.hidden = !food;
    fields.mealTimes.root.hidden = !(food && fields.foodBasis.input.value === "meal");
    fields.periodFrom.root.hidden = !(food && fields.foodBasis.input.value === "duration");
    fields.periodTo.root.hidden = fields.periodFrom.root.hidden;
    fields.treatKind.root.hidden = cat !== "treat";
    fields.counterpartyId.root.hidden = !transfer;
    fields.participantIds.root.hidden = transfer;
    const linked = cat === "refund" || cat === "reimbursement";
    if (cat !== linkCategory) {
      linkCategory = cat;
      if (linked) relabelLink(cat);
    }
    fields.linkedExpenseId.root.hidden = !linked;
    fields.payerId.root.hidden = fields.paymentSource.input.value !== "member";
  };
  fields.category.input.addEventListener("change", sync);
  fields.paymentSource.input.addEventListener("change", sync);
  fields.foodBasis.input.addEventListener("change", sync);
  fields.linkedExpenseId.input.addEventListener("change", onLink);
  sync();

  const id = current?.id ?? newId();
  const createdAt = current?.createdAt ?? Date.now();
  const shown = (f: { root: HTMLElement }) => !f.root.hidden;
  return editor({
    title: current ? t.edit : t.add,
    fields, back: LIST, go: ctx.go,
    build: () => ({
      id, jamaatId: jamaat.id,
      category: fields.category.input.value,
      date: fromInputValue(fields.date.input.value),
      description: fields.description.input.value,
      amountPaise: parseRupees(fields.amountPaise.input.value),
      paymentSource: fields.paymentSource.input.value,
      payerId: shown(fields.payerId) ? fields.payerId.input.value || null : null,
      counterpartyId: shown(fields.counterpartyId) ? fields.counterpartyId.input.value || null : null,
      linkedExpenseId: shown(fields.linkedExpenseId) ? fields.linkedExpenseId.input.value || null : null,
      participantIds: shown(fields.participantIds) ? fields.participantIds.values() : [],
      foodBasis: shown(fields.foodBasis) ? fields.foodBasis.input.value : null,
      treatKind: shown(fields.treatKind) ? fields.treatKind.input.value : null,
      mealTimes: shown(fields.mealTimes) ? fields.mealTimes.values() : [],
      periodFrom: shown(fields.periodFrom) ? fromInputValue(fields.periodFrom.input.value) : null,
      periodTo: shown(fields.periodTo) ? fromInputValue(fields.periodTo.input.value) : null,
      createdAt, updatedAt: Math.max(createdAt, Date.now()),
    }),
    save: (input) => saveExpense(db, input, current === null),
  });
}

function allocationError(r: Extract<AllocationResult, { ok: false }>, members: readonly Member[]): string {
  const name = members.find((m) => m.id === r.memberId)?.name ?? "";
  return fmt(gt().allocation.errors[r.error], { name });
}

/** Derived (never stored) split with a line-by-line calculation that can be checked by hand. */
function breakdown(e: Expense, members: readonly Member[]): HTMLElement {
  const t = gt().allocation;
  const result = allocateExpense(e, members);
  const head = el("h3", { text: t.title });
  if (!result.ok) {
    return el("section", { class: "stack" }, head, el("p", { class: "error-text", text: allocationError(result, members), attrs: { role: "alert" } }));
  }
  const name = (id: string | null) => (id === null ? t.fund : members.find((m) => m.id === id)?.name ?? "");
  const cell = (tag: "th" | "td", text: string, cls = "") => el(tag, { text, class: cls });
  const table = el("table", { class: "table" },
    el("thead", {}, el("tr", {},
      cell("th", t.beneficiary), cell("th", t.owes), cell("th", t.bears), cell("th", t.amount, "num"), cell("th", t.calculation),
    )),
    el("tbody", {}, ...result.rows.map((r) => el("tr", {},
      cell("td", name(r.beneficiaryId)), cell("td", name(r.owedById)), cell("td", name(r.bearerId)),
      cell("td", money(r.amountPaise), "num"), cell("td", r.basis, "mono"),
    ))),
    el("tfoot", {}, el("tr", {}, cell("th", t.total), cell("td", ""), cell("td", ""), cell("td", money(result.totalPaise), "num"), cell("td", ""))),
  );
  return el("section", { class: "stack" },
    head,
    el("p", { class: "muted small", text: `${t.method[result.method]} · ${t.paidBy}: ${name(result.payerId)}` }),
    el("div", { class: "scroll" }, table),
    el("p", { class: "muted small", text: t.rule }),
  );
}

/** Lifecycle progress line for advances (refunds) and reimbursable costs. */
function progress(e: Expense, all: Expense[], members: Member[]): string | null {
  const lg = gt().ledger;
  const label = (done: number, total: number, tpl: string) => {
    const state = done === 0 ? lg.statusOpen : done >= total ? lg.statusClosed : lg.statusPartial;
    return `${fmt(tpl, { done: money(done), total: money(total) })} · ${state}`;
  };
  if (e.category === "advance") return label(e.amountPaise - advanceRemaining(e, all), e.amountPaise, lg.refunded);
  const cap = reimbursable(e, members);
  if (cap === null || cap === 0) return null;
  return label(cap - (reimbursementRemaining(e, all, members) ?? cap), cap, lg.reimbursed);
}

function actionLabel(a: AuditEntry["action"]): string {
  const lg = gt().ledger;
  return a === "create" ? lg.created : a === "update" ? lg.updated : lg.deleted;
}

function auditList(log: readonly AuditEntry[]): HTMLElement {
  const lg = gt().ledger;
  return el("section", { class: "stack" },
    el("h3", { text: lg.historyTitle }),
    log.length === 0
      ? el("p", { class: "muted", text: lg.noHistory })
      : el("ul", { class: "list compact" }, ...log.map((a) =>
          el("li", { class: "row" }, el("span", { text: actionLabel(a.action), class: "badge badge-muted" }), el("span", { class: "muted small", text: formatDateTime(a.at) })))),
  );
}

function balances(ctx: ViewContext, members: Member[], expenses: Expense[]): HTMLElement {
  const lg = gt().ledger;
  const bal = computeBalances(expenses, members);
  const problems = findProblems(expenses, members);
  const cell = (tag: "th" | "td", text: string, cls = "") => el(tag, { text, class: cls });
  const state = (n: number) => (n > 0 ? lg.owed : n < 0 ? lg.owes : lg.settled);
  const row = (name: string, n: number) =>
    el("tr", {}, cell("td", name), cell("td", money(n), "num"), cell("td", state(n)));
  const total = [...bal.values()].reduce((a, b) => a + b, 0);
  const rows = [...members.map((m) => row(m.name, bal.get(m.id) ?? 0)), row(lg.fund, bal.get(FUND) ?? 0)];
  return el("div", { class: "stack" },
    el("div", { class: "toolbar" },
      el("h2", { text: lg.balances }),
      button({ label: gt().expenses.back, onClick: () => ctx.go(LIST) }),
    ),
    members.length === 0
      ? emptyState(lg.noMembers, undefined, "members")
      : el("div", { class: "scroll" }, el("table", { class: "table" },
          el("thead", {}, el("tr", {}, cell("th", lg.member), cell("th", lg.balance, "num"), cell("th", ""))),
          el("tbody", {}, ...rows),
          el("tfoot", {}, el("tr", {}, cell("th", lg.total), cell("td", money(total), "num"), cell("td", ""))),
        )),
    total === 0 ? el("p", { class: "muted small", text: lg.reconciled }) : null,
    problems.length > 0
      ? el("p", { class: "error-text", text: fmt(lg.problems, { n: new Set(problems.map((p) => p.expenseId)).size }), attrs: { role: "status" } })
      : null,
  );
}

async function history(ctx: ViewContext, db: Db, expenses: Expense[]): Promise<HTMLElement> {
  const lg = gt().ledger;
  const log = await loadAudit(db);
  const exists = new Set(expenses.map((e) => e.id));
  const row = (a: AuditEntry) => {
    const snap = (a.after ?? a.before) as unknown as Expense;
    const title = el(exists.has(a.entityId) ? "a" : "span", {
      class: "row-title", text: snap.description,
      attrs: exists.has(a.entityId) ? { href: `${LIST}/view/${a.entityId}` } : {},
    });
    return el("li", { class: "row" },
      el("div", { class: "row-main" },
        title,
        el("div", { class: "badges" },
          el("span", { class: `badge ${a.action === "delete" ? "badge-warn" : "badge-ok"}`, text: actionLabel(a.action) }),
          el("span", { class: "badge badge-muted", text: gt().expenses.categories[snap.category] }),
        ),
        el("div", { class: "muted small", text: formatDateTime(a.at) }),
      ),
      el("strong", { class: "amount", text: money(snap.amountPaise) }),
    );
  };
  return el("div", { class: "stack" },
    el("div", { class: "toolbar" },
      el("h2", { text: lg.historyTitle }),
      button({ label: gt().expenses.back, onClick: () => ctx.go(LIST) }),
    ),
    log.items.length === 0 ? emptyState(lg.noHistory, undefined, "info") : el("ul", { class: "list" }, ...log.items.map(row)),
  );
}
