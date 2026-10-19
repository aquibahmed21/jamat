import { getDb } from "../../db/index.ts";
import { fmt, gt } from "../../guitext.ts";
import { effectiveAmeer } from "../../domain/ameer.ts";
import { formatPaise } from "../../domain/money.ts";
import { memberStats, programmeNow, summarizeFinance } from "../../domain/summary.ts";
import { formatRange } from "../../domain/timetable.ts";
import { button } from "../../ui/button.ts";
import { formatDateTime } from "../../ui/datetime.ts";
import { el } from "../../ui/dom.ts";
import { icon, type IconName } from "../../ui/icons.ts";
import { emptyState } from "../../ui/states.ts";
import { listMembers, loadJamaat } from "../members/service.ts";
import { loadMulaqaat, loadPlaces } from "../places/service.ts";
import { loadProgramme } from "../programme/service.ts";
import type { ViewContext } from "../members/view.ts";

function card(title: string, iconName: IconName, href: string, ...body: (Node | null)[]): HTMLElement {
  return el("section", { class: "card summary" },
    el("h2", {}, icon(iconName), el("a", { text: title, attrs: { href } })),
    ...body,
  );
}

/** One label/value pair; `value` is always already formatted text. */
function stat(label: string, value: string): HTMLElement {
  return el("div", { class: "stat" }, el("dt", { class: "muted small", text: label }), el("dd", { class: "stat-value", text: value }));
}

export async function renderHome(ctx: ViewContext): Promise<HTMLElement> {
  const t = gt().home;
  const db = await getDb();
  const { jamaat } = await loadJamaat(db);
  if (!jamaat) {
    const box = emptyState(t.noJamaatTitle, t.noJamaatHint, "home");
    box.append(button({ label: gt().members.createJamaat, icon: "plus", variant: "primary", onClick: () => ctx.go("#/members/jamaat") }));
    return box;
  }

  const [members, appointments, expenses, programme, places, meetings] = await Promise.all([
    listMembers(db, jamaat.id),
    db.appointments.listBy("jamaatId", jamaat.id),
    db.expenses.listBy("jamaatId", jamaat.id),
    loadProgramme(db, jamaat.id),
    loadPlaces(db),
    loadMulaqaat(db, jamaat.id),
  ]);

  const nowDate = new Date();
  const now = nowDate.getTime();
  const money = (p: number) => formatPaise(p, gt().currencySymbol);

  const ms = memberStats(members.items, now);
  const ameer = effectiveAmeer(appointments.items, now);
  const ameerName = members.items.find((m) => m.id === ameer?.memberId)?.name;
  const fin = summarizeFinance(expenses.items, members.items);
  const prog = programmeNow(programme.items, nowDate.getHours() * 60 + nowDate.getMinutes());
  const label = (a: { title: string; startMin: number; endMin: number | null }) => `${formatRange(a)} ${a.title}`;
  const latest = meetings.items[0];
  const placeName = (id: string) => places.items.find((p) => p.id === id)?.name ?? "";

  return el("div", { class: "stack" },
    el("div", { class: "card" },
      el("h2", { text: jamaat.name }),
      el("p", { class: "muted", text: fmt(gt().members.period, {
        start: formatDateTime(jamaat.startAt), end: jamaat.endAt === null ? gt().members.openEnded : formatDateTime(jamaat.endAt),
      }) }),
    ),
    el("div", { class: "grid" },
      card(t.members, "members", "#/members",
        el("dl", { class: "stats" },
          stat(t.presentNow, `${ms.present} ${fmt(t.ofTotal, { total: ms.total })}`),
          stat(t.left, String(ms.left)),
          ms.notYetJoined > 0 ? stat(t.notYet, String(ms.notYetJoined)) : null,
          stat(t.ameer, ameerName ?? t.noAmeer),
        ),
      ),
      card(t.expenses, "expenses", "#/expenses",
        el("dl", { class: "stats" },
          stat(t.totalCost, money(fin.costPaise)),
          stat(t.contributions, money(fin.contributionsPaise)),
          stat(t.advancesHeld, money(fin.advancesHeldPaise)),
          stat(t.outstanding, money(fin.outstandingPaise)),
          stat(t.owedToMembers, money(fin.owedToMembersPaise)),
        ),
        el("p", { class: "muted small", text: fmt(t.records, { n: fin.recordCount }) }),
        fin.problemRecords > 0 ? el("p", { class: "error-text", text: fmt(t.attention, { n: fin.problemRecords }), attrs: { role: "status" } }) : null,
      ),
      card(t.programme, "programme", "#/programme",
        programme.items.length === 0
          ? el("p", { class: "muted", text: t.noProgramme })
          : el("dl", { class: "stats" },
              stat(t.now, prog.current.length > 0 ? prog.current.map(label).join("; ") : t.nothingNow),
              stat(t.next, prog.next ? label(prog.next) : t.nothingNext),
            ),
      ),
      card(t.places, "places", "#/places",
        el("dl", { class: "stats" },
          stat(t.placesCount, String(places.items.length)),
          stat(t.mulaqaatCount, String(meetings.items.length)),
          stat(t.lastMulaqaat, latest ? `${placeName(latest.placeId)} · ${formatDateTime(latest.at)}` : t.none),
        ),
      ),
    ),
  );
}
