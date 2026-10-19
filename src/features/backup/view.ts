import { getDb, type Db } from "../../db/index.ts";
import { STORE_NAMES } from "../../db/index.ts";
import { fmt, gt } from "../../guitext.ts";
import { exportBackup } from "../../backup/format.ts";
import { parseBackup, type BackupIssue, type BackupWarning, type ParsedBackup } from "../../backup/parse.ts";
import { loadRecords } from "../../backup/records.ts";
import { planRestore, restore, type RestoreMode, type RestorePlan } from "../../backup/restore.ts";
import { button } from "../../ui/button.ts";
import { formatDateTime } from "../../ui/datetime.ts";
import { alertDialog, confirmDialog } from "../../ui/dialog.ts";
import { downloadText } from "../../ui/download.ts";
import { el, uid } from "../../ui/dom.ts";
import { errorText } from "../../ui/errors.ts";
import { selectField } from "../../ui/form.ts";
import type { ViewContext } from "../members/view.ts";

function sectionName(store: string): string {
  const names = gt().backup.sections as Record<string, string>;
  return names[store] ?? store;
}

function issueText(i: BackupIssue): string {
  const t = gt().backup.errors;
  const detail = i.detail ? gt().errors.validation[i.detail] : "";
  return fmt(t[i.code], {
    store: i.store ? sectionName(i.store) : "",
    index: (i.index ?? 0) + 1, id: i.id ?? "", field: i.field ?? "", detail,
  });
}

function warningText(w: BackupWarning): string {
  return fmt(gt().backup.warnings[w.code], { count: w.count ?? 0 });
}

export async function renderBackup(ctx: ViewContext): Promise<HTMLElement> {
  const t = gt().backup;
  const db = await getDb();
  const status = el("div", { class: "stack", attrs: { "aria-live": "polite" } });
  const preview = el("div", { class: "stack" });

  const exportCard = el("section", { class: "card stack" },
    el("h2", { text: t.exportTitle }),
    el("p", { class: "muted", text: t.exportText }),
    el("div", { class: "actions" }, button({
      label: t.exportButton, icon: "backup", variant: "primary",
      onClick: async () => {
        try {
          const out = await exportBackup(db);
          downloadText(out.filename, out.text);
          const lines = [fmt(t.exported, { file: out.filename, n: out.recordCount })];
          if (out.skipped > 0) lines.push(fmt(t.exportSkipped, { n: out.skipped }));
          status.replaceChildren(...lines.map((l) => el("p", { class: "ok-text", text: l })));
        } catch (e) {
          status.replaceChildren(el("p", { class: "error-text", text: errorText(e), attrs: { role: "alert" } }));
        }
      },
    })),
    status,
  );

  const inputId = uid("file");
  const input = el("input", { class: "input", attrs: { id: inputId, type: "file", accept: ".json,application/json" } });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    preview.replaceChildren();
    if (!file) return;
    preview.append(el("p", { class: "muted", text: t.checking, attrs: { role: "status" } }));
    // Size is checked before reading so a huge file is never loaded into memory.
    const text = file.size > 25_000_000 ? "x".repeat(25_000_001) : await file.text();
    preview.replaceChildren(await previewFor(ctx, db, text));
  });

  const importCard = el("section", { class: "card stack" },
    el("h2", { text: t.importTitle }),
    el("p", { class: "muted", text: t.importText }),
    el("div", { class: "field" }, el("label", { text: t.chooseFile, attrs: { for: inputId } }), input),
    preview,
  );

  return el("div", { class: "stack" },
    el("h2", { text: t.title }),
    el("section", { class: "card" }, el("h2", { text: t.localTitle }), el("p", { text: t.localText })),
    exportCard,
    importCard,
  );
}

async function previewFor(ctx: ViewContext, db: Db, text: string): Promise<HTMLElement> {
  const t = gt().backup;
  const parsed = parseBackup(text);
  if (!parsed.ok) {
    return el("div", { class: "stack" },
      el("p", { class: "error-text", text: t.fileBad, attrs: { role: "alert" } }),
      el("ul", { class: "issues" }, ...parsed.issues.map((i) => el("li", { text: issueText(i) }))),
      parsed.truncated ? el("p", { class: "muted small", text: t.moreIssues }) : null,
    );
  }
  const backup = parsed.backup;
  const { records: current } = await loadRecords(db);
  const plan = planRestore(backup.records, current);
  return validPreview(ctx, db, backup, plan);
}

function validPreview(ctx: ViewContext, db: Db, backup: ParsedBackup, plan: RestorePlan): HTMLElement {
  const t = gt().backup;
  const cell = (tag: "th" | "td", text: string, cls = "") => el(tag, { text, class: cls });
  const table = el("div", { class: "scroll" }, el("table", { class: "table" },
    el("thead", {}, el("tr", {}, cell("th", t.section), cell("th", t.inFile, "num"), cell("th", t.onDevice, "num"))),
    el("tbody", {}, ...STORE_NAMES.map((s) => el("tr", {}, cell("td", t.sections[s]), cell("td", String(plan.incoming[s]), "num"), cell("td", String(plan.current[s]), "num")))),
  ));

  const options = [{ value: "replace", label: t.replace }, ...(plan.merge.available ? [{ value: "merge", label: t.merge }] : [])];
  const mode = selectField({ label: t.mode, options, value: "replace" });
  const help = el("p", { class: "muted small" });
  const merge = plan.merge;
  const sync = () => {
    if (mode.input.value === "merge" && merge.available) {
      const sum = (k: "same" | "conflict") => STORE_NAMES.reduce((n, s) => n + merge.delta[s][k], 0);
      help.textContent = `${t.mergeHelp} ${fmt(t.mergeSummary, { add: merge.addTotal, same: sum("same"), conflict: sum("conflict") })}`;
    } else {
      help.textContent = t.replaceHelp;
    }
  };
  mode.input.addEventListener("change", sync);
  sync();

  const run = async () => {
    const m = mode.input.value as RestoreMode;
    const replacing = m === "replace";
    const ok = await confirmDialog(
      replacing && plan.currentTotal > 0
        ? { title: t.confirmReplaceTitle, message: fmt(t.confirmReplaceText, { current: plan.currentTotal, incoming: plan.incomingTotal }), confirmLabel: t.restoreHere, destructive: true }
        : replacing
          ? { title: t.confirmRestoreTitle, message: fmt(t.confirmRestoreText, { incoming: plan.incomingTotal }), confirmLabel: t.restoreHere }
          : { title: t.confirmMergeTitle, message: fmt(t.confirmMergeText, { add: plan.merge.available ? plan.merge.addTotal : 0 }), confirmLabel: t.restoreHere },
    );
    if (!ok) return;
    try {
      if (replacing && plan.currentTotal > 0) {
        // Safety copy of what is about to be replaced.
        const safety = await exportBackup(db);
        downloadText(safety.filename, safety.text);
      }
      const written = await restore(db, backup.records, m);
      await alertDialog(t.doneTitle, fmt(t.doneText, { n: written }));
      ctx.refresh();
    } catch (e) {
      await alertDialog(t.failedTitle, `${errorText(e)} ${t.failedText}`);
    }
  };

  return el("div", { class: "stack" },
    el("p", { class: "ok-text", text: t.fileOk, attrs: { role: "status" } }),
    el("p", { class: "muted small", text: fmt(t.fileInfo, { at: formatDateTime(backup.exportedAt), v: backup.schemaVersion }) }),
    ...backup.warnings.map((w) => el("p", { class: "warn-text", text: warningText(w), attrs: { role: "status" } })),
    table,
    mode.root,
    help,
    !plan.merge.available ? el("p", { class: "muted small", text: t.mergeNo[plan.merge.reason] }) : null,
    el("div", { class: "actions" }, button({ label: t.restoreHere, icon: "check", variant: "danger", onClick: () => void run() })),
  );
}
