import { STORE_NAMES, type StoreName } from "../db/index.ts";
import { DB_VERSION } from "../db/migrations.ts";
import {
  validateActivity, validateAllocation, validateAppointment, validateAudit, validateExpense, validateJamaat,
  validateMember, validateMulaqaat, validatePlace, type Result, type ValidationCode,
} from "../model/validate.ts";
import { BACKUP_APP, BACKUP_FORMAT, MAX_BACKUP_CHARS, MAX_RECORDS } from "./format.ts";
import { consistencyKeys } from "./consistency.ts";
import { countRecords, emptyRecords, type Counts, type Records } from "./records.ts";

export const BACKUP_ERROR_CODES = [
  "tooLarge", "notJson", "notBackup", "unsupportedFormat", "newerSchema", "unknownStore", "badStore",
  "tooManyRecords", "invalidRecord", "duplicateId", "danglingReference", "multipleJamaats",
] as const;
export type BackupErrorCode = (typeof BACKUP_ERROR_CODES)[number];

export const BACKUP_WARNING_CODES = ["olderSchema", "inconsistent", "empty"] as const;
export type BackupWarningCode = (typeof BACKUP_WARNING_CODES)[number];

export interface BackupIssue {
  code: BackupErrorCode;
  store?: string;
  index?: number;
  id?: string;
  /** Field name for record problems / dangling references. */
  field?: string;
  /** Validation code for invalidRecord. */
  detail?: ValidationCode;
}

export interface BackupWarning {
  code: BackupWarningCode;
  count?: number;
}

export interface ParsedBackup {
  exportedAt: number;
  schemaVersion: number;
  records: Records;
  counts: Counts;
  warnings: BackupWarning[];
}

export type ParseResult = { ok: true; backup: ParsedBackup } | { ok: false; issues: BackupIssue[]; truncated: boolean };

const MAX_ISSUES = 25;

const VALIDATORS: { [K in StoreName]: (input: unknown) => Result<Records[K][number]> } = {
  jamaats: validateJamaat, members: validateMember, places: validatePlace, appointments: validateAppointment,
  expenses: validateExpense, allocations: validateAllocation, activities: validateActivity,
  mulaqaat: validateMulaqaat, audit: validateAudit,
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Parses and fully validates backup text WITHOUT touching any stored data. Any problem rejects the whole file:
 * there is no partial import. Older schema versions are accepted (missing sections are empty, missing newer
 * fields take their defaults through the validators); newer ones are refused.
 */
export function parseBackup(text: string): ParseResult {
  const issues: BackupIssue[] = [];
  const fail = (): ParseResult => ({ ok: false, issues: issues.slice(0, MAX_ISSUES), truncated: issues.length > MAX_ISSUES });
  const add = (i: BackupIssue) => { issues.push(i); };

  if (text.length > MAX_BACKUP_CHARS) { add({ code: "tooLarge" }); return fail(); }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    add({ code: "notJson" });
    return fail();
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP || !isObject(raw.data)) { add({ code: "notBackup" }); return fail(); }

  const format = raw.format;
  if (typeof format !== "number" || !Number.isInteger(format) || format < 1 || format > BACKUP_FORMAT) {
    add({ code: "unsupportedFormat" });
    return fail();
  }
  const schema = raw.schemaVersion;
  if (typeof schema !== "number" || !Number.isInteger(schema) || schema < 1) { add({ code: "notBackup" }); return fail(); }
  if (schema > DB_VERSION) { add({ code: "newerSchema" }); return fail(); }
  const exportedAt = raw.exportedAt;
  if (typeof exportedAt !== "number" || !Number.isSafeInteger(exportedAt) || exportedAt < 0) { add({ code: "notBackup" }); return fail(); }

  const data = raw.data;
  for (const key of Object.keys(data)) {
    if (!(STORE_NAMES as readonly string[]).includes(key)) add({ code: "unknownStore", store: key });
  }
  let total = 0;
  for (const name of STORE_NAMES) {
    const section = data[name];
    if (section === undefined) continue; // older files simply lack newer sections
    if (!Array.isArray(section)) add({ code: "badStore", store: name });
    else total += section.length;
  }
  if (total > MAX_RECORDS) add({ code: "tooManyRecords" });
  if (issues.length > 0) return fail();

  // Per-record validation and unique ids.
  const records = emptyRecords();
  for (const name of STORE_NAMES) {
    const section = (data[name] ?? []) as unknown[];
    const seen = new Set<string>();
    section.forEach((item, index) => {
      const r = VALIDATORS[name](item);
      if (!r.ok) {
        for (const i of r.issues) add({ code: "invalidRecord", store: name, index, field: i.field, detail: i.code });
        return;
      }
      if (seen.has(r.value.id)) add({ code: "duplicateId", store: name, index, id: r.value.id });
      seen.add(r.value.id);
      (records[name] as unknown[]).push(r.value);
    });
  }
  if (issues.length > 0) return fail();
  if (records.jamaats.length > 1) { add({ code: "multipleJamaats" }); return fail(); }

  // References must resolve inside the file (history entries may point at deleted records).
  const ids = (list: readonly { id: string }[]) => new Set(list.map((x) => x.id));
  const sets = {
    jamaats: ids(records.jamaats), members: ids(records.members), places: ids(records.places), expenses: ids(records.expenses),
  };
  const need = (store: string, id: string, field: string, set: Set<string>, ref: string | null) => {
    if (ref !== null && !set.has(ref)) add({ code: "danglingReference", store, id, field });
  };
  for (const m of records.members) need("members", m.id, "jamaatId", sets.jamaats, m.jamaatId);
  for (const a of records.appointments) {
    need("appointments", a.id, "jamaatId", sets.jamaats, a.jamaatId);
    need("appointments", a.id, "memberId", sets.members, a.memberId);
  }
  for (const e of records.expenses) {
    need("expenses", e.id, "jamaatId", sets.jamaats, e.jamaatId);
    need("expenses", e.id, "payerId", sets.members, e.payerId);
    need("expenses", e.id, "counterpartyId", sets.members, e.counterpartyId);
    need("expenses", e.id, "linkedExpenseId", sets.expenses, e.linkedExpenseId);
    for (const p of e.participantIds) need("expenses", e.id, "participantIds", sets.members, p);
  }
  for (const a of records.allocations) {
    need("allocations", a.id, "expenseId", sets.expenses, a.expenseId);
    need("allocations", a.id, "beneficiaryId", sets.members, a.beneficiaryId);
    need("allocations", a.id, "owedById", sets.members, a.owedById);
    need("allocations", a.id, "bearerId", sets.members, a.bearerId);
  }
  for (const a of records.activities) {
    need("activities", a.id, "jamaatId", sets.jamaats, a.jamaatId);
    for (const p of a.responsibleIds) need("activities", a.id, "responsibleIds", sets.members, p);
  }
  for (const m of records.mulaqaat) {
    need("mulaqaat", m.id, "jamaatId", sets.jamaats, m.jamaatId);
    need("mulaqaat", m.id, "placeId", sets.places, m.placeId);
    for (const p of m.personIds) need("mulaqaat", m.id, "personIds", sets.members, p);
  }
  if (issues.length > 0) return fail();

  const counts = countRecords(records);
  const warnings: BackupWarning[] = [];
  if (schema < DB_VERSION) warnings.push({ code: "olderSchema" });
  if (STORE_NAMES.every((s) => counts[s] === 0)) warnings.push({ code: "empty" });
  const problems = consistencyKeys(records).size;
  if (problems > 0) warnings.push({ code: "inconsistent", count: problems });
  return { ok: true, backup: { exportedAt, schemaVersion: schema, records, counts, warnings } };
}
