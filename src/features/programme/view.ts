import { getDb, type Db } from "../../db/index.ts";
import { fmt, gt } from "../../guitext.ts";
import type { Jamaat, Member, ProgrammeActivity } from "../../model/types.ts";
import { newId } from "../../model/id.ts";
import { findOverlaps, formatRange, formatTime, moveBy, moveTo, nextOrder, parseTime, STANDARD_PROGRAMME, type PresetKey } from "../../domain/timetable.ts";
import { button } from "../../ui/button.ts";
import { alertDialog, confirmDialog } from "../../ui/dialog.ts";
import { el } from "../../ui/dom.ts";
import { editor } from "../../ui/editor.ts";
import { errorText } from "../../ui/errors.ts";
import { checkGroup, field } from "../../ui/form.ts";
import { emptyState } from "../../ui/states.ts";
import { listMembers, loadJamaat } from "../members/service.ts";
import type { ViewContext } from "../members/view.ts";
import { addStandardProgramme, applyOrder, deleteActivity, loadProgramme, saveActivity } from "./service.ts";
import { byLabel, focusAfterRender } from "../../ui/focus.ts";
import { notify } from "../../ui/toast.ts";

const LIST = "#/programme";

export async function renderProgramme(ctx: ViewContext): Promise<HTMLElement> {
  const t = gt().programme;
  const db = await getDb();
  const { jamaat } = await loadJamaat(db);
  if (!jamaat) {
    const box = emptyState(t.noJamaatTitle, t.noJamaatHint, "programme");
    box.append(button({ label: t.goMembers, onClick: () => ctx.go("#/members") }));
    return box;
  }
  const [members, programme] = await Promise.all([listMembers(db, jamaat.id), loadProgramme(db, jamaat.id)]);
  const [section, id] = ctx.rest;
  if (section === "new") return activityForm(ctx, db, jamaat, members.items, programme.items, null);
  if (section === "edit") {
    const current = programme.items.find((a) => a.id === id);
    return current
      ? activityForm(ctx, db, jamaat, members.items, programme.items, current)
      : emptyState(gt().states.notFound, gt().states.notFoundHint, "warning");
  }
  return timetable(ctx, db, jamaat, members.items, programme.items);
}

function timetable(ctx: ViewContext, db: Db, jamaat: Jamaat, members: Member[], items: ProgrammeActivity[]): HTMLElement {
  const t = gt().programme;
  const c = gt().common;
  const title = (id: string) => items.find((a) => a.id === id)?.title ?? "";
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  const overlaps = findOverlaps(items);
  const clashes = (id: string) => overlaps.flatMap((o) => (o.a === id ? [o.b] : o.b === id ? [o.a] : []));

  /** Saves a new order; focus returns to the same control afterwards and the move is announced. */
  const persist = async (ordered: ProgrammeActivity[], moved?: ProgrammeActivity, control?: "moveUp" | "moveDown") => {
    try {
      await applyOrder(db, items, ordered);
      if (moved) {
        notify(fmt(t.moved, { title: moved.title, n: ordered.findIndex((x) => x.id === moved.id) + 1 }));
        if (control) {
          // The other arrow is the fallback when this one is disabled at the end of the list.
          const other = control === "moveUp" ? "moveDown" : "moveUp";
          focusAfterRender(byLabel(`${t[control]}: ${moved.title}`), byLabel(`${t[other]}: ${moved.title}`));
        }
      }
    } catch (e) { await alertDialog(t.title, errorText(e)); }
    ctx.refresh();
  };

  const remove = async (a: ProgrammeActivity) => {
    const ok = await confirmDialog({
      title: t.deleteTitle, message: fmt(t.deleteText, { title: a.title }), confirmLabel: c.delete, destructive: true,
    });
    if (!ok) return;
    try { await deleteActivity(db, a.id); notify(c.deleted); } catch (e) { await alertDialog(t.title, errorText(e)); }
    ctx.refresh();
  };

  let dragId: string | null = null;
  const clearMarks = (list: HTMLElement) => list.querySelectorAll(".drop-before,.drop-after,.dragging").forEach((n) => n.classList.remove("drop-before", "drop-after", "dragging"));

  const row = (a: ProgrammeActivity, index: number): HTMLElement => {
    const other = clashes(a.id);
    const li = el("li", { class: "row", attrs: { draggable: "true", "data-id": a.id } },
      el("div", { class: "row-main" },
        el("div", {}, el("strong", { class: "time", text: formatRange(a) }), el("span", { text: `  ${a.title}` })),
        a.location ? el("div", { class: "muted small", text: a.location }) : null,
        a.responsibleIds.length > 0 ? el("div", { class: "muted small", text: a.responsibleIds.map(name).join(", ") }) : null,
        other.length > 0
          ? el("div", { class: "badges" }, el("span", { class: "badge badge-warn", text: fmt(t.overlapsWith, { names: other.map(title).join(", ") }) }))
          : null,
      ),
      el("div", { class: "row-actions" },
        (() => { const b = button({ label: `${t.moveUp}: ${a.title}`, icon: "up", iconOnly: true, onClick: () => void persist(moveBy(items, a.id, -1), a, "moveUp") }); b.disabled = index === 0; return b; })(),
        (() => { const b = button({ label: `${t.moveDown}: ${a.title}`, icon: "down", iconOnly: true, onClick: () => void persist(moveBy(items, a.id, 1), a, "moveDown") }); b.disabled = index === items.length - 1; return b; })(),
        button({ label: `${c.edit}: ${a.title}`, icon: "edit", iconOnly: true, onClick: () => ctx.go(`${LIST}/edit/${a.id}`) }),
        button({ label: `${c.delete}: ${a.title}`, icon: "delete", iconOnly: true, onClick: () => void remove(a) }),
      ),
    );
    li.addEventListener("dragstart", (ev) => {
      dragId = a.id;
      ev.dataTransfer?.setData("text/plain", a.id);
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", () => { dragId = null; clearMarks(li.parentElement as HTMLElement); });
    li.addEventListener("dragover", (ev) => {
      if (dragId === null) return;
      ev.preventDefault();
      const r = li.getBoundingClientRect();
      const after = ev.clientY > r.top + r.height / 2;
      li.classList.toggle("drop-after", after);
      li.classList.toggle("drop-before", !after);
    });
    li.addEventListener("dragleave", () => li.classList.remove("drop-before", "drop-after"));
    li.addEventListener("drop", (ev) => {
      if (dragId === null) return;
      ev.preventDefault();
      const r = li.getBoundingClientRect();
      const after = ev.clientY > r.top + r.height / 2;
      const from = items.findIndex((x) => x.id === dragId);
      let to = index + (after ? 1 : 0);
      if (from < to) to -= 1; // the dragged item leaves its old slot first
      const id = dragId;
      dragId = null;
      void persist(moveTo(items, id, to), items.find((x) => x.id === id));
    });
    return li;
  };

  const body = items.length === 0
    ? (() => {
        const box = emptyState(t.emptyTitle, t.emptyHint, "programme");
        box.append(button({
          label: t.addStandard, icon: "plus",
          onClick: async () => {
            const ok = await confirmDialog({
              title: t.standardTitle, message: fmt(t.standardText, { n: STANDARD_PROGRAMME.length }), confirmLabel: t.addStandard,
            });
            if (!ok) return;
            try { await addStandardProgramme(db, jamaat.id, t.presets as Record<PresetKey, string>, items); notify(gt().common.saved); }
            catch (e) { await alertDialog(t.title, errorText(e)); }
            ctx.refresh();
          },
        }));
        return box;
      })()
    : el("div", { class: "stack" },
        el("p", { class: "muted small", text: t.dragHint }),
        el("ul", { class: "list", attrs: { "data-timetable": "" } }, ...items.map(row)),
      );

  return el("div", { class: "stack" },
    el("div", { class: "toolbar" },
      el("h2", { text: t.title }),
      button({ label: t.add, icon: "plus", variant: "primary", onClick: () => ctx.go(`${LIST}/new`) }),
    ),
    overlaps.length > 0 ? el("p", { class: "error-text", text: fmt(t.overlapSummary, { n: overlaps.length }), attrs: { role: "status" } }) : null,
    body,
  );
}

function activityForm(
  ctx: ViewContext, db: Db, jamaat: Jamaat, members: Member[], items: ProgrammeActivity[], current: ProgrammeActivity | null,
): HTMLElement {
  const t = gt().programme;
  const fields = {
    title: field({ label: t.activityTitle, required: true, value: current?.title ?? "" }),
    startMin: field({ label: t.startTime, type: "time", required: true, value: current ? formatTime(current.startMin) : "" }),
    endMin: field({ label: t.endTime, type: "time", hint: t.endHint, value: current?.endMin == null ? "" : formatTime(current.endMin) }),
    location: field({ label: t.location, value: current?.location ?? "" }),
    responsibleIds: checkGroup({
      label: t.responsible, options: members.map((m) => ({ value: m.id, label: m.name })), selected: current?.responsibleIds,
    }),
    notes: field({ label: t.notes, multiline: true, value: current?.notes ?? "" }),
  };
  const id = current?.id ?? newId();
  const createdAt = current?.createdAt ?? Date.now();
  return editor({
    title: current ? t.edit : t.add,
    fields, back: LIST, go: ctx.go,
    build: () => ({
      id, jamaatId: jamaat.id,
      title: fields.title.input.value,
      startMin: parseTime(fields.startMin.input.value),
      endMin: parseTime(fields.endMin.input.value),
      location: fields.location.input.value,
      responsibleIds: fields.responsibleIds.values(),
      order: current?.order ?? nextOrder(items), // time edits never move an activity in the manual order
      notes: fields.notes.input.value,
      createdAt, updatedAt: Math.max(createdAt, Date.now()),
    }),
    save: (input) => saveActivity(db, input, current === null, current?.updatedAt),
  });
}
