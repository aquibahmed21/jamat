import { getDb, type Db } from "../../db/index.ts";
import { DbError } from "../../db/errors.ts";
import { fmt, gt } from "../../guitext.ts";
import type { AmeerAppointment, Jamaat, Member } from "../../model/types.ts";
import { attendanceStatus, isPresentAt } from "../../domain/eligibility.ts";
import { button } from "../../ui/button.ts";
import { formatDateTime, fromInputValue, toInputValue } from "../../ui/datetime.ts";
import { alertDialog, confirmDialog } from "../../ui/dialog.ts";
import { el } from "../../ui/dom.ts";
import { errorText } from "../../ui/errors.ts";
import { field } from "../../ui/form.ts";
import { editor } from "../../ui/editor.ts";
import { ameerForm, ameerSection } from "../ameer/view.ts";
import { emptyState } from "../../ui/states.ts";
import { newId } from "../../model/id.ts";
import { deleteJamaat, deleteMember, listMembers, loadJamaat, saveJamaat, saveMember } from "./service.ts";

export interface ViewContext {
  rest: string[];
  refresh(): void;
  go(hash: string): void;
}

const LIST = "#/members";

export async function renderMembers(ctx: ViewContext): Promise<HTMLElement> {
  const db = await getDb();
  const [section, id] = ctx.rest;
  const { jamaat, malformed } = await loadJamaat(db);
  if (section === "jamaat") return jamaatForm(ctx, db, jamaat);
  if (!jamaat) return noJamaat(ctx);
  const members = await listMembers(db, jamaat.id);
  const appointments = await db.appointments.listBy("jamaatId", jamaat.id);
  const damaged = malformed + members.malformed.length + appointments.malformed.length;
  if (section === "ameer") {
    const [action, apptId] = ctx.rest.slice(1);
    const current = action === "edit" ? appointments.items.find((a) => a.id === apptId) ?? null : null;
    if (action === "edit" && !current) return emptyState(gt().states.notFound, gt().states.notFoundHint, "warning");
    return ameerForm(ctx, db, jamaat, members.items, current);
  }
  if (section === "new") return memberForm(ctx, db, jamaat, null);
  if (section === "edit") {
    const m = members.items.find((x) => x.id === id);
    return m ? memberForm(ctx, db, jamaat, m) : emptyState(gt().states.notFound, gt().states.notFoundHint, "warning");
  }
  return overview(ctx, db, jamaat, members.items, appointments.items, damaged);
}

function noJamaat(ctx: ViewContext): HTMLElement {
  const t = gt().members;
  const box = emptyState(t.noJamaatTitle, t.noJamaatHint, "members");
  box.append(button({ label: t.createJamaat, icon: "plus", variant: "primary", onClick: () => ctx.go(`${LIST}/jamaat`) }));
  return box;
}

function periodText(j: Jamaat): string {
  const t = gt().members;
  return fmt(t.period, { start: formatDateTime(j.startAt), end: j.endAt === null ? t.openEnded : formatDateTime(j.endAt) });
}

async function showError(e: unknown): Promise<void> {
  await alertDialog(gt().members.cannotDelete, errorText(e));
}

function overview(ctx: ViewContext, db: Db, jamaat: Jamaat, members: Member[], appointments: AmeerAppointment[], damaged: number): HTMLElement {
  const t = gt().members;
  const c = gt().common;
  const now = Date.now();
  const sorted = [...members].sort((a, b) => a.joinAt - b.joinAt || a.name.localeCompare(b.name));

  const removeJamaat = async () => {
    const ok = await confirmDialog({
      title: t.deleteJamaatTitle,
      message: fmt(t.deleteJamaatText, { name: jamaat.name, n: members.length }),
      confirmLabel: c.delete,
      destructive: true,
    });
    if (!ok) return;
    try { await deleteJamaat(db, jamaat.id); } catch (e) { await showError(e); }
    ctx.refresh();
  };

  const card = el("section", { class: "card" },
    el("h2", { text: jamaat.name }),
    el("p", { class: "muted", text: periodText(jamaat) }),
    jamaat.notes ? el("p", { text: jamaat.notes }) : null,
    el("div", { class: "actions" },
      button({ label: c.edit, icon: "edit", onClick: () => ctx.go(`${LIST}/jamaat`) }),
      button({ label: c.delete, icon: "delete", variant: "danger", onClick: removeJamaat }),
    ),
  );

  const present = members.filter((m) => isPresentAt(m, now)).length;
  const head = el("div", { class: "toolbar" },
    el("p", { class: "muted", text: fmt(t.presentNow, { n: present, total: members.length }) }),
    button({ label: t.addMember, icon: "plus", variant: "primary", onClick: () => ctx.go(`${LIST}/new`) }),
  );

  const list = sorted.length === 0
    ? emptyState(t.noMembersTitle, t.noMembersHint, "members")
    : el("ul", { class: "list" }, ...sorted.map((m) => memberRow(ctx, db, jamaat, m, now)));

  return el("div", { class: "stack" },
    card, ameerSection(ctx, db, members, appointments), head, list,
    damaged > 0 ? el("p", { class: "error-text", text: fmt(t.damaged, { n: damaged }), attrs: { role: "status" } }) : null,
  );
}

function memberRow(ctx: ViewContext, db: Db, jamaat: Jamaat, m: Member, now: number): HTMLElement {
  const t = gt().members;
  const c = gt().common;
  const st = attendanceStatus(m, jamaat);
  const here = isPresentAt(m, now);
  const badge = (text: string, kind: string) => el("span", { class: `badge badge-${kind}`, text });

  const remove = async () => {
    const ok = await confirmDialog({
      title: t.deleteMemberTitle,
      message: fmt(t.deleteMemberText, { name: m.name }),
      confirmLabel: c.delete,
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteMember(db, m.id);
    } catch (e) {
      const inUse = e instanceof DbError && e.code === "inUse";
      await alertDialog(t.cannotDelete, inUse ? `${errorText(e)}. ${t.leaveInstead}` : errorText(e));
    }
    ctx.refresh();
  };

  const times = [`${t.joinAt}: ${formatDateTime(m.joinAt)}`, m.leaveAt === null ? "" : `${t.leaveAt}: ${formatDateTime(m.leaveAt)}`];
  return el("li", { class: "row" },
    el("div", { class: "row-main" },
      el("strong", { text: m.name }),
      el("div", { class: "badges" },
        badge(here ? t.present : t.left, here ? "ok" : "muted"),
        st.late ? badge(t.late, "warn") : null,
        st.early ? badge(t.early, "warn") : null,
      ),
      ...times.filter(Boolean).map((x) => el("div", { class: "muted small", text: x })),
      m.phone ? el("div", { class: "muted small", text: m.phone }) : null,
    ),
    el("div", { class: "row-actions" },
      button({ label: `${c.edit}: ${m.name}`, icon: "edit", iconOnly: true, onClick: () => ctx.go(`${LIST}/edit/${m.id}`) }),
      button({ label: `${c.delete}: ${m.name}`, icon: "delete", iconOnly: true, onClick: remove }),
    ),
  );
}

function jamaatForm(ctx: ViewContext, db: Db, current: Jamaat | null): HTMLElement {
  const t = gt().members;
  const fields = {
    name: field({ label: t.name, required: true, value: current?.name ?? "" }),
    startAt: field({ label: t.startAt, type: "datetime-local", required: true, value: toInputValue(current?.startAt ?? Date.now()) }),
    endAt: field({ label: t.endAt, type: "datetime-local", hint: t.endHint, value: current?.endAt == null ? "" : toInputValue(current.endAt) }),
    notes: field({ label: t.notes, multiline: true, value: current?.notes ?? "" }),
  };
  const id = current?.id ?? newId();
  const createdAt = current?.createdAt ?? Date.now();
  return editor({
    title: current ? t.editJamaat : t.createJamaat,
    fields, back: LIST, go: ctx.go,
    build: () => ({
      id,
      name: fields.name.input.value,
      startAt: fromInputValue(fields.startAt.input.value),
      endAt: fromInputValue(fields.endAt.input.value),
      notes: fields.notes.input.value,
      createdAt,
      updatedAt: Math.max(createdAt, Date.now()),
    }),
    save: (input) => saveJamaat(db, input, current === null),
  });
}

function memberForm(ctx: ViewContext, db: Db, jamaat: Jamaat, current: Member | null): HTMLElement {
  const t = gt().members;
  const fields = {
    name: field({ label: t.name, required: true, value: current?.name ?? "" }),
    phone: field({ label: t.phone, type: "tel", value: current?.phone ?? "" }),
    joinAt: field({ label: t.joinAt, type: "datetime-local", required: true, value: toInputValue(current?.joinAt ?? Date.now()) }),
    leaveAt: field({ label: t.leaveAt, type: "datetime-local", hint: t.leaveHint, value: current?.leaveAt == null ? "" : toInputValue(current.leaveAt) }),
    notes: field({ label: t.notes, multiline: true, value: current?.notes ?? "" }),
  };
  const id = current?.id ?? newId();
  const createdAt = current?.createdAt ?? Date.now();
  return editor({
    title: current ? t.editMember : t.addMember,
    fields, back: LIST, go: ctx.go,
    build: () => ({
      id,
      jamaatId: jamaat.id,
      name: fields.name.input.value,
      phone: fields.phone.input.value,
      joinAt: fromInputValue(fields.joinAt.input.value),
      leaveAt: fromInputValue(fields.leaveAt.input.value),
      notes: fields.notes.input.value,
      createdAt,
      updatedAt: Math.max(createdAt, Date.now()),
    }),
    save: (input) => saveMember(db, input, current === null),
  });
}
