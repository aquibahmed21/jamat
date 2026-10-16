import type { Db } from "../../db/index.ts";
import { fmt, gt } from "../../guitext.ts";
import type { AmeerAppointment, Jamaat, Member } from "../../model/types.ts";
import { newId } from "../../model/id.ts";
import { effectiveAmeer, isInEffect, sortHistory } from "../../domain/ameer.ts";
import { button } from "../../ui/button.ts";
import { formatDateTime, fromInputValue, toInputValue } from "../../ui/datetime.ts";
import { alertDialog, confirmDialog } from "../../ui/dialog.ts";
import { el } from "../../ui/dom.ts";
import { errorText } from "../../ui/errors.ts";
import { field, selectField } from "../../ui/form.ts";
import { emptyState } from "../../ui/states.ts";
import { editor } from "../../ui/editor.ts";
import { APPOINTMENT_KINDS, type AppointmentKind } from "../../model/types.ts";
import type { ViewContext } from "../members/view.ts";
import { deleteAppointment, saveAppointment } from "./service.ts";

const BACK = "#/members";

function kindLabel(k: AppointmentKind): string {
  return gt().ameer[k];
}

export function ameerSection(
  ctx: ViewContext, db: Db, members: Member[], appointments: AmeerAppointment[],
): HTMLElement {
  const t = gt().ameer;
  const c = gt().common;
  const now = Date.now();
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  const eff = effectiveAmeer(appointments, now);
  const history = sortHistory(appointments).reverse();

  const currentText = eff
    ? `${name(eff.memberId)} · ${kindLabel(eff.kind)}`
    : t.none;
  const head = el("div", { class: "toolbar" },
    el("div", {}, el("strong", { text: t.current }), el("p", { class: "muted", text: currentText })),
    button({
      label: t.add, icon: "plus", variant: "primary",
      onClick: () => (members.length === 0 ? void alertDialog(t.title, t.needMembers) : ctx.go(`${BACK}/ameer/new`)),
    }),
  );

  const remove = async (a: AmeerAppointment) => {
    const ok = await confirmDialog({
      title: t.deleteTitle,
      message: fmt(t.deleteText, { name: name(a.memberId), kind: kindLabel(a.kind) }),
      confirmLabel: c.delete,
      destructive: true,
    });
    if (!ok) return;
    try { await deleteAppointment(db, a.id); } catch (e) { await alertDialog(t.title, errorText(e)); }
    ctx.refresh();
  };

  const row = (a: AmeerAppointment) => {
    const state = eff?.appointmentId === a.id ? "inEffect" : isInEffect(a, now) ? "past" : a.startAt > now ? "upcoming" : "past";
    const period = a.endAt === null ? fmt(t.since, { start: formatDateTime(a.startAt) }) : `${formatDateTime(a.startAt)} – ${formatDateTime(a.endAt)}`;
    return el("li", { class: "row" },
      el("div", { class: "row-main" },
        el("strong", { text: name(a.memberId) }),
        el("div", { class: "badges" },
          el("span", { class: `badge ${a.kind === "temporary" ? "badge-warn" : "badge-ok"}`, text: kindLabel(a.kind) }),
          el("span", { class: `badge ${state === "inEffect" ? "badge-ok" : "badge-muted"}`, text: t[state] }),
        ),
        el("div", { class: "muted small", text: period }),
      ),
      el("div", { class: "row-actions" },
        button({ label: `${c.edit}: ${name(a.memberId)}`, icon: "edit", iconOnly: true, onClick: () => ctx.go(`${BACK}/ameer/edit/${a.id}`) }),
        button({ label: `${c.delete}: ${name(a.memberId)}`, icon: "delete", iconOnly: true, onClick: () => void remove(a) }),
      ),
    );
  };

  return el("section", { class: "stack" },
    el("h2", { text: t.title }),
    head,
    history.length === 0
      ? emptyState(t.empty, t.emptyHint, "members")
      : el("ul", { class: "list" }, ...history.map(row)),
  );
}

export function ameerForm(
  ctx: ViewContext, db: Db, jamaat: Jamaat, members: Member[], current: AmeerAppointment | null,
): HTMLElement {
  const t = gt().ameer;
  const kind = selectField({
    label: t.kind, required: true, value: current?.kind ?? "permanent",
    options: APPOINTMENT_KINDS.map((k) => ({ value: k, label: kindLabel(k) })),
  });
  const fields = {
    memberId: selectField({
      label: t.member, required: true, value: current?.memberId ?? members[0]?.id,
      options: members.map((m) => ({ value: m.id, label: m.name })),
    }),
    kind,
    startAt: field({ label: t.startAt, type: "datetime-local", required: true, value: toInputValue(current?.startAt ?? Date.now()) }),
    endAt: field({
      label: t.endAt, type: "datetime-local",
      value: current?.endAt == null ? "" : toInputValue(current.endAt),
    }),
  };
  const hint = el("div", { class: "hint" });
  const syncHint = () => { hint.textContent = kind.input.value === "temporary" ? t.endHintTemporary : t.endHintPermanent; };
  kind.input.addEventListener("change", syncHint);
  syncHint();
  fields.endAt.root.append(hint);

  const id = current?.id ?? newId();
  const createdAt = current?.createdAt ?? Date.now();
  return editor({
    title: current ? t.edit : t.add,
    fields,
    back: BACK,
    go: ctx.go,
    build: () => ({
      id, jamaatId: jamaat.id,
      memberId: fields.memberId.input.value,
      kind: kind.input.value,
      startAt: fromInputValue(fields.startAt.input.value),
      endAt: fromInputValue(fields.endAt.input.value),
      createdAt, updatedAt: Math.max(createdAt, Date.now()),
    }),
    save: (input) => saveAppointment(db, input, current === null),
  });
}
