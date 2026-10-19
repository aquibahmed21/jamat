import { getDb, type Db } from "../../db/index.ts";
import { fmt, gt } from "../../guitext.ts";
import { PLACE_TYPES, type Jamaat, type Member, type Mulaqaat, type Place } from "../../model/types.ts";
import { newId } from "../../model/id.ts";
import { mapUrl, parseCoordinate, telHref } from "../../domain/places.ts";
import { button } from "../../ui/button.ts";
import { formatDateTime, fromInputValue, toInputValue } from "../../ui/datetime.ts";
import { alertDialog, confirmDialog } from "../../ui/dialog.ts";
import { el } from "../../ui/dom.ts";
import { editor } from "../../ui/editor.ts";
import { errorText } from "../../ui/errors.ts";
import { checkGroup, field, selectField } from "../../ui/form.ts";
import { icon } from "../../ui/icons.ts";
import { emptyState } from "../../ui/states.ts";
import { listMembers, loadJamaat } from "../members/service.ts";
import type { ViewContext } from "../members/view.ts";
import { deleteMulaqaat, deletePlace, loadMulaqaat, loadPlaces, savePlace, saveMulaqaat } from "./service.ts";
import { notify } from "../../ui/toast.ts";

const LIST = "#/places";
const MEET = "#/places/mulaqaat";

export async function renderPlaces(ctx: ViewContext): Promise<HTMLElement> {
  const db = await getDb();
  const places = await loadPlaces(db);
  const [section, a, b] = ctx.rest;
  const missing = () => emptyState(gt().states.notFound, gt().states.notFoundHint, "warning");

  if (section !== "mulaqaat") {
    if (section === "new") return placeForm(ctx, db, null);
    if (section === "edit") {
      const current = places.items.find((p) => p.id === a);
      return current ? placeForm(ctx, db, current) : missing();
    }
    return placeList(ctx, db, places.items);
  }

  const t = gt().places;
  const { jamaat } = await loadJamaat(db);
  if (!jamaat) {
    const box = emptyState(t.noJamaatTitle, t.noJamaatHint, "places");
    box.append(button({ label: t.goMembers, onClick: () => ctx.go("#/members") }));
    return box;
  }
  const [members, meetings] = await Promise.all([listMembers(db, jamaat.id), loadMulaqaat(db, jamaat.id)]);
  if (a === "new") return meetingForm(ctx, db, jamaat, members.items, places.items, null);
  if (a === "edit") {
    const current = meetings.items.find((m) => m.id === b);
    return current ? meetingForm(ctx, db, jamaat, members.items, places.items, current) : missing();
  }
  return meetingList(ctx, db, members.items, places.items, meetings.items);
}

function tabs(ctx: ViewContext, active: "places" | "mulaqaat"): HTMLElement {
  const t = gt().places;
  const tab = (label: string, hash: string, on: boolean) => {
    const b = button({ label, variant: on ? "primary" : "secondary", onClick: () => ctx.go(hash) });
    if (on) b.setAttribute("aria-current", "page");
    return b;
  };
  return el("div", { class: "actions tabs" }, tab(t.tabPlaces, LIST, active === "places"), tab(t.tabMulaqaat, MEET, active === "mulaqaat"));
}

function placeList(ctx: ViewContext, db: Db, places: Place[]): HTMLElement {
  const t = gt().places;
  const c = gt().common;

  const remove = async (p: Place) => {
    const ok = await confirmDialog({
      title: t.deleteTitle, message: fmt(t.deleteText, { name: p.name }), confirmLabel: c.delete, destructive: true,
    });
    if (!ok) return;
    try { await deletePlace(db, p.id); notify(c.deleted); } catch (e) { await alertDialog(t.cannotDelete, errorText(e)); }
    ctx.refresh();
  };

  const row = (p: Place) => {
    const map = mapUrl(p);
    const tel = telHref(p.phone);
    const typeLabel = p.type === "other" ? p.customType : t.types[p.type];
    return el("li", { class: "row" },
      el("div", { class: "row-main" },
        el("strong", { text: p.name }),
        el("div", { class: "badges" }, el("span", { class: "badge badge-muted", text: typeLabel })),
        p.zimmedar ? el("div", { class: "muted small", text: `${t.zimmedar}: ${p.zimmedar}` }) : null,
        tel ? el("div", { class: "small" }, el("a", { text: p.phone, attrs: { href: tel } })) : null,
        p.address ? el("div", { class: "muted small", text: p.address }) : null,
        p.notes ? el("div", { class: "muted small", text: p.notes }) : null,
        map
          ? el("div", {}, el("a", { class: "btn btn-secondary", attrs: { href: map, target: "_blank", rel: "noopener noreferrer" } },
              icon("places"), el("span", { text: t.openMap })))
          : null,
      ),
      el("div", { class: "row-actions" },
        button({ label: `${c.edit}: ${p.name}`, icon: "edit", iconOnly: true, onClick: () => ctx.go(`${LIST}/edit/${p.id}`) }),
        button({ label: `${c.delete}: ${p.name}`, icon: "delete", iconOnly: true, onClick: () => void remove(p) }),
      ),
    );
  };

  return el("div", { class: "stack" },
    el("div", { class: "toolbar" }, el("h2", { text: t.title }),
      button({ label: t.add, icon: "plus", variant: "primary", onClick: () => ctx.go(`${LIST}/new`) })),
    tabs(ctx, "places"),
    places.length === 0 ? emptyState(t.emptyTitle, t.emptyHint, "places") : el("ul", { class: "list" }, ...places.map(row)),
  );
}

function placeForm(ctx: ViewContext, db: Db, current: Place | null): HTMLElement {
  const t = gt().places;
  const fields = {
    name: field({ label: t.name, required: true, value: current?.name ?? "" }),
    type: selectField({
      label: t.type, required: true, value: current?.type ?? "masjid",
      options: PLACE_TYPES.map((k) => ({ value: k, label: t.types[k] })),
    }),
    customType: field({ label: t.customType, required: true, value: current?.customType ?? "" }),
    latitude: field({ label: t.latitude, hint: t.coordHint, value: current?.latitude == null ? "" : String(current.latitude) }),
    longitude: field({ label: t.longitude, value: current?.longitude == null ? "" : String(current.longitude) }),
    zimmedar: field({ label: t.zimmedar, value: current?.zimmedar ?? "" }),
    phone: field({ label: t.phone, type: "tel", value: current?.phone ?? "" }),
    address: field({ label: t.address, multiline: true, value: current?.address ?? "" }),
    notes: field({ label: t.notes, multiline: true, value: current?.notes ?? "" }),
  };
  const sync = () => { fields.customType.root.hidden = fields.type.input.value !== "other"; };
  fields.type.input.addEventListener("change", sync);
  sync();

  /** Blank -> null; text -> number when it is a strict decimal, otherwise the raw text (the validator rejects it). */
  const coord = (text: string): number | string | null => {
    const s = text.trim();
    return s === "" ? null : (parseCoordinate(s) ?? s);
  };
  const id = current?.id ?? newId();
  const createdAt = current?.createdAt ?? Date.now();
  return editor({
    title: current ? t.edit : t.add,
    fields, back: LIST, go: ctx.go,
    build: () => ({
      id,
      name: fields.name.input.value,
      type: fields.type.input.value,
      customType: fields.customType.root.hidden ? "" : fields.customType.input.value,
      latitude: coord(fields.latitude.input.value),
      longitude: coord(fields.longitude.input.value),
      zimmedar: fields.zimmedar.input.value,
      phone: fields.phone.input.value,
      address: fields.address.input.value,
      notes: fields.notes.input.value,
      createdAt, updatedAt: Math.max(createdAt, Date.now()),
    }),
    save: (input) => savePlace(db, input, current === null, current?.updatedAt),
  });
}

function meetingList(ctx: ViewContext, db: Db, members: Member[], places: Place[], meetings: Mulaqaat[]): HTMLElement {
  const t = gt().places;
  const c = gt().common;
  const placeName = (id: string) => places.find((p) => p.id === id)?.name ?? "";
  const personName = (id: string) => members.find((m) => m.id === id)?.name ?? "";

  const remove = async (m: Mulaqaat) => {
    const ok = await confirmDialog({
      title: t.mDeleteTitle, message: fmt(t.mDeleteText, { place: placeName(m.placeId) }), confirmLabel: c.delete, destructive: true,
    });
    if (!ok) return;
    try { await deleteMulaqaat(db, m.id); notify(c.deleted); } catch (e) { await alertDialog(t.cannotDelete, errorText(e)); }
    ctx.refresh();
  };

  const row = (m: Mulaqaat) =>
    el("li", { class: "row" },
      el("div", { class: "row-main" },
        el("strong", { text: placeName(m.placeId) }),
        el("div", { class: "muted small", text: formatDateTime(m.at) }),
        m.personIds.length > 0 ? el("div", { class: "small", text: m.personIds.map(personName).join(", ") }) : null,
        m.notes ? el("div", { class: "muted small", text: m.notes }) : null,
      ),
      el("div", { class: "row-actions" },
        button({ label: `${c.edit}: ${placeName(m.placeId)}`, icon: "edit", iconOnly: true, onClick: () => ctx.go(`${MEET}/edit/${m.id}`) }),
        button({ label: `${c.delete}: ${placeName(m.placeId)}`, icon: "delete", iconOnly: true, onClick: () => void remove(m) }),
      ),
    );

  const add = button({
    label: t.mAdd, icon: "plus", variant: "primary",
    onClick: () => (places.length === 0 ? void alertDialog(t.tabMulaqaat, t.mNeedPlace) : ctx.go(`${MEET}/new`)),
  });
  return el("div", { class: "stack" },
    el("div", { class: "toolbar" }, el("h2", { text: t.tabMulaqaat }), add),
    tabs(ctx, "mulaqaat"),
    meetings.length === 0 ? emptyState(t.mEmptyTitle, t.mEmptyHint, "members") : el("ul", { class: "list" }, ...meetings.map(row)),
  );
}

function meetingForm(
  ctx: ViewContext, db: Db, jamaat: Jamaat, members: Member[], places: Place[], current: Mulaqaat | null,
): HTMLElement {
  const t = gt().places;
  const fields = {
    placeId: selectField({
      label: t.mPlace, required: true, value: current?.placeId ?? places[0]?.id,
      options: places.map((p) => ({ value: p.id, label: p.name })),
    }),
    at: field({ label: t.mAt, type: "datetime-local", required: true, value: toInputValue(current?.at ?? Date.now()) }),
    personIds: checkGroup({ label: t.mPeople, options: members.map((m) => ({ value: m.id, label: m.name })), selected: current?.personIds }),
    notes: field({ label: t.mNotes, multiline: true, value: current?.notes ?? "" }),
  };
  const id = current?.id ?? newId();
  const createdAt = current?.createdAt ?? Date.now();
  return editor({
    title: current ? t.mEdit : t.mAdd,
    fields, back: MEET, go: ctx.go,
    build: () => ({
      id, jamaatId: jamaat.id,
      placeId: fields.placeId.input.value,
      at: fromInputValue(fields.at.input.value),
      personIds: fields.personIds.values(),
      notes: fields.notes.input.value,
      createdAt, updatedAt: Math.max(createdAt, Date.now()),
    }),
    save: (input) => saveMulaqaat(db, input, current === null, current?.updatedAt),
  });
}
