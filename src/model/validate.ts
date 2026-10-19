import {
  APPOINTMENT_KINDS, AUDIT_ACTIONS, EXPENSE_CATEGORIES, FOOD_BASES, MAX_AMOUNT_PAISE, PAYMENT_SOURCES, PLACE_TYPES,
  TRANSFER_CATEGORIES, TRANSPORT_COSTS, TREAT_KINDS, VEHICLE_TYPES,
  type Allocation, type AmeerAppointment, type AuditEntry, type Expense, type Jamaat, type Member, type Mulaqaat,
  type Place, type ProgrammeActivity, type Stamps,
} from "./types.ts";

export const VALIDATION_CODES = [
  "notObject", "required", "invalidType", "tooLong", "outOfRange",
  "invalidId", "invalidEnum", "invalidOrder", "invalidCombo", "duplicate", "invalidPhone",
  "beforeJamaatStart", "afterJamaatEnd", "duplicateName", "conflictsWithMembers",
  "notAMember", "overlap", "duplicateExpense", "samePartyTransfer", "notEligible",
  "linkInvalid", "overRefund", "overReimburse", "overSettle", "ledgerConflict", "duplicatePlace",
  "conflictsWithRecords",
] as const;
export type ValidationCode = (typeof VALIDATION_CODES)[number];

export interface ValidationIssue {
  field: string;
  code: ValidationCode;
}
export type Result<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PHONE_RE = /^[+()\-\s\d]{5,20}$/;
const MAX_TS = 8.64e15; // JS Date limit
const MAX_MIN = 24 * 60 - 1;

/** Collects issues while reading fields; invalid fields fall back to a neutral value. */
class Reader {
  issues: ValidationIssue[] = [];
  private src: Record<string, unknown> = {};

  constructor(input: unknown) {
    if (typeof input === "object" && input !== null && !Array.isArray(input)) {
      this.src = input as Record<string, unknown>;
    } else {
      this.fail("", "notObject");
    }
  }

  fail(field: string, code: ValidationCode): void {
    this.issues.push({ field, code });
  }

  private raw(key: string): unknown {
    const v = this.src[key];
    return v === undefined ? null : v;
  }

  id(key: string): string {
    const v = this.raw(key);
    if (v === null) { this.fail(key, "required"); return ""; }
    if (typeof v !== "string" || !ID_RE.test(v)) { this.fail(key, "invalidId"); return ""; }
    return v;
  }

  optId(key: string): string | null {
    return this.raw(key) === null ? null : this.id(key);
  }

  text(key: string, max: number, required = false): string {
    const v = this.raw(key);
    if (v === null) { if (required) this.fail(key, "required"); return ""; }
    if (typeof v !== "string") { this.fail(key, "invalidType"); return ""; }
    const t = v.trim();
    if (t.length > max) this.fail(key, "tooLong");
    else if (required && t === "") this.fail(key, "required");
    return t;
  }

  phone(key: string): string {
    const t = this.text(key, 20);
    if (t !== "" && !PHONE_RE.test(t)) this.fail(key, "invalidPhone");
    return t;
  }

  int(key: string, min: number, max: number): number {
    const v = this.raw(key);
    if (v === null) { this.fail(key, "required"); return 0; }
    if (typeof v !== "number" || !Number.isSafeInteger(v)) { this.fail(key, "invalidType"); return 0; }
    if (v < min || v > max) { this.fail(key, "outOfRange"); return 0; }
    return v;
  }

  optInt(key: string, min: number, max: number): number | null {
    return this.raw(key) === null ? null : this.int(key, min, max);
  }

  ts(key: string): number { return this.int(key, 0, MAX_TS); }
  optTs(key: string): number | null { return this.optInt(key, 0, MAX_TS); }

  optNum(key: string, min: number, max: number): number | null {
    const v = this.raw(key);
    if (v === null) return null;
    if (typeof v !== "number" || !Number.isFinite(v)) { this.fail(key, "invalidType"); return null; }
    if (v < min || v > max) { this.fail(key, "outOfRange"); return null; }
    return v;
  }

  oneOf<T extends string>(key: string, list: readonly T[]): T {
    const v = this.raw(key);
    if (v === null) { this.fail(key, "required"); return list[0]!; }
    if (typeof v !== "string" || !(list as readonly string[]).includes(v)) {
      this.fail(key, "invalidEnum");
      return list[0]!;
    }
    return v as T;
  }

  optOneOf<T extends string>(key: string, list: readonly T[]): T | null {
    return this.raw(key) === null ? null : this.oneOf(key, list);
  }

  optRecord(key: string): Record<string, unknown> | null {
    const v = this.raw(key);
    if (v === null) return null;
    if (typeof v !== "object" || Array.isArray(v)) { this.fail(key, "invalidType"); return null; }
    return v as Record<string, unknown>;
  }

  idList(key: string, max = 500): string[] {
    const v = this.raw(key);
    if (v === null) return [];
    if (!Array.isArray(v)) { this.fail(key, "invalidType"); return []; }
    if (v.length > max) { this.fail(key, "tooLong"); return []; }
    const out: string[] = [];
    for (const item of v) {
      if (typeof item !== "string" || !ID_RE.test(item)) { this.fail(key, "invalidId"); return []; }
      if (out.includes(item)) { this.fail(key, "duplicate"); return []; }
      out.push(item);
    }
    return out;
  }

  /** Unique timestamps, returned ascending. */
  tsList(key: string, max: number): number[] {
    const v = this.raw(key);
    if (v === null) return [];
    if (!Array.isArray(v)) { this.fail(key, "invalidType"); return []; }
    if (v.length > max) { this.fail(key, "tooLong"); return []; }
    const out: number[] = [];
    for (const item of v) {
      if (typeof item !== "number" || !Number.isSafeInteger(item)) { this.fail(key, "invalidType"); return []; }
      if (item < 0 || item > MAX_TS) { this.fail(key, "outOfRange"); return []; }
      if (out.includes(item)) { this.fail(key, "duplicate"); return []; }
      out.push(item);
    }
    return out.sort((a, b) => a - b);
  }

  stamps(): Stamps {
    const createdAt = this.ts("createdAt");
    const updatedAt = this.ts("updatedAt");
    if (updatedAt < createdAt) this.fail("updatedAt", "invalidOrder");
    return { createdAt, updatedAt };
  }

  /** Cross-field rules run only when every field is individually valid (no cascading noise). */
  cross(check: () => void): void {
    if (this.issues.length === 0) check();
  }

  done<T>(value: T): Result<T> {
    if (this.issues[0]?.code === "notObject") return { ok: false, issues: [this.issues[0]] };
    return this.issues.length === 0 ? { ok: true, value } : { ok: false, issues: this.issues };
  }
}

export function validateJamaat(input: unknown): Result<Jamaat> {
  const r = new Reader(input);
  const v: Jamaat = {
    id: r.id("id"),
    name: r.text("name", 100, true),
    startAt: r.ts("startAt"),
    endAt: r.optTs("endAt"),
    notes: r.text("notes", 1000),
    ...r.stamps(),
  };
  r.cross(() => {
    if (v.endAt !== null && v.endAt <= v.startAt) r.fail("endAt", "invalidOrder");
  });
  return r.done(v);
}

export function validateMember(input: unknown): Result<Member> {
  const r = new Reader(input);
  const v: Member = {
    id: r.id("id"),
    jamaatId: r.id("jamaatId"),
    name: r.text("name", 100, true),
    phone: r.phone("phone"),
    joinAt: r.ts("joinAt"),
    leaveAt: r.optTs("leaveAt"),
    notes: r.text("notes", 1000),
    ...r.stamps(),
  };
  r.cross(() => {
    if (v.leaveAt !== null && v.leaveAt <= v.joinAt) r.fail("leaveAt", "invalidOrder");
  });
  return r.done(v);
}

export function validateAppointment(input: unknown): Result<AmeerAppointment> {
  const r = new Reader(input);
  const v: AmeerAppointment = {
    id: r.id("id"),
    jamaatId: r.id("jamaatId"),
    memberId: r.id("memberId"),
    kind: r.oneOf("kind", APPOINTMENT_KINDS),
    startAt: r.ts("startAt"),
    endAt: r.optTs("endAt"),
    ...r.stamps(),
  };
  r.cross(() => {
    if (v.endAt !== null && v.endAt <= v.startAt) r.fail("endAt", "invalidOrder");
    if (v.kind === "temporary" && v.endAt === null) r.fail("endAt", "required");
  });
  return r.done(v);
}

export function validateExpense(input: unknown): Result<Expense> {
  const r = new Reader(input);
  const v: Expense = {
    id: r.id("id"),
    jamaatId: r.id("jamaatId"),
    category: r.oneOf("category", EXPENSE_CATEGORIES),
    date: r.ts("date"),
    description: r.text("description", 500, true),
    amountPaise: r.int("amountPaise", 1, MAX_AMOUNT_PAISE),
    paymentSource: r.oneOf("paymentSource", PAYMENT_SOURCES),
    payerId: r.optId("payerId"),
    counterpartyId: r.optId("counterpartyId"),
    linkedExpenseId: r.optId("linkedExpenseId"),
    participantIds: r.idList("participantIds"),
    foodBasis: r.optOneOf("foodBasis", FOOD_BASES),
    treatKind: r.optOneOf("treatKind", TREAT_KINDS),
    vehicle: r.optOneOf("vehicle", VEHICLE_TYPES),
    transportCost: r.optOneOf("transportCost", TRANSPORT_COSTS),
    mealTimes: r.tsList("mealTimes", 100),
    periodFrom: r.optTs("periodFrom"),
    periodTo: r.optTs("periodTo"),
    ...r.stamps(),
  };
  r.cross(() => {
    const transfer = TRANSFER_CATEGORIES.includes(v.category);
    if (v.category !== "transport" && (v.vehicle !== null || v.transportCost !== null)) {
      r.fail(v.vehicle !== null ? "vehicle" : "transportCost", "invalidCombo");
    }
    if (!transfer && v.counterpartyId !== null) r.fail("counterpartyId", "invalidCombo");
    if (transfer && v.participantIds.length > 0) r.fail("participantIds", "invalidCombo");
    if ((v.category === "contribution" || v.category === "advance" || v.category === "settlement") && v.paymentSource !== "member") {
      r.fail("paymentSource", "invalidCombo");
    }
    if (v.category === "settlement" && v.counterpartyId === null) r.fail("counterpartyId", "required");
    if (transfer && v.counterpartyId === v.payerId) r.fail("counterpartyId", "samePartyTransfer");
    const needsLink = v.category === "refund" || v.category === "reimbursement";
    if (needsLink && v.linkedExpenseId === null) r.fail("linkedExpenseId", "required");
    if (!needsLink && v.linkedExpenseId !== null) r.fail("linkedExpenseId", "invalidCombo");
    if (v.paymentSource === "member" && v.payerId === null) r.fail("payerId", "required");
    if (v.paymentSource === "jamaat" && v.payerId !== null) r.fail("payerId", "invalidCombo");
    if (v.category === "food" && v.foodBasis === null) r.fail("foodBasis", "required");
    if (v.category !== "food" && v.foodBasis !== null) r.fail("foodBasis", "invalidCombo");
    if (v.category === "treat" && v.treatKind === null) r.fail("treatKind", "required");
    if (v.category !== "treat" && v.treatKind !== null) r.fail("treatKind", "invalidCombo");
    const meal = v.category === "food" && v.foodBasis === "meal";
    const duration = v.category === "food" && v.foodBasis === "duration";
    if (meal && v.mealTimes.length === 0) r.fail("mealTimes", "required");
    if (!meal && v.mealTimes.length > 0) r.fail("mealTimes", "invalidCombo");
    if (duration) {
      if (v.periodFrom === null) r.fail("periodFrom", "required");
      if (v.periodTo === null) r.fail("periodTo", "required");
      if (v.periodFrom !== null && v.periodTo !== null && v.periodTo <= v.periodFrom) r.fail("periodTo", "invalidOrder");
    } else if (v.periodFrom !== null || v.periodTo !== null) {
      r.fail(v.periodFrom !== null ? "periodFrom" : "periodTo", "invalidCombo");
    }
  });
  return r.done(v);
}

export function validateAllocation(input: unknown): Result<Allocation> {
  const r = new Reader(input);
  const v: Allocation = {
    id: r.id("id"),
    expenseId: r.id("expenseId"),
    beneficiaryId: r.id("beneficiaryId"),
    owedById: r.id("owedById"),
    bearerId: r.optId("bearerId"),
    amountPaise: r.int("amountPaise", 0, Number.MAX_SAFE_INTEGER),
    basis: r.text("basis", 300),
    ...r.stamps(),
  };
  return r.done(v);
}

export function validateActivity(input: unknown): Result<ProgrammeActivity> {
  const r = new Reader(input);
  const v: ProgrammeActivity = {
    id: r.id("id"),
    jamaatId: r.id("jamaatId"),
    title: r.text("title", 100, true),
    startMin: r.int("startMin", 0, MAX_MIN),
    endMin: r.optInt("endMin", 0, MAX_MIN),
    location: r.text("location", 100),
    responsibleIds: r.idList("responsibleIds"),
    order: r.int("order", 0, Number.MAX_SAFE_INTEGER),
    notes: r.text("notes", 1000),
    ...r.stamps(),
  };
  r.cross(() => {
    if (v.endMin !== null && v.endMin <= v.startMin) r.fail("endMin", "invalidOrder");
  });
  return r.done(v);
}

export function validatePlace(input: unknown): Result<Place> {
  const r = new Reader(input);
  const v: Place = {
    id: r.id("id"),
    name: r.text("name", 100, true),
    type: r.oneOf("type", PLACE_TYPES),
    customType: r.text("customType", 50),
    latitude: r.optNum("latitude", -90, 90),
    longitude: r.optNum("longitude", -180, 180),
    zimmedar: r.text("zimmedar", 100),
    phone: r.phone("phone"),
    address: r.text("address", 300),
    notes: r.text("notes", 1000),
    ...r.stamps(),
  };
  r.cross(() => {
    if ((v.latitude === null) !== (v.longitude === null)) {
      r.fail(v.latitude === null ? "latitude" : "longitude", "required");
    }
    if (v.type === "other" && v.customType === "") r.fail("customType", "required");
    if (v.type !== "other" && v.customType !== "") r.fail("customType", "invalidCombo");
  });
  return r.done(v);
}

export function validateMulaqaat(input: unknown): Result<Mulaqaat> {
  const r = new Reader(input);
  const v: Mulaqaat = {
    id: r.id("id"),
    jamaatId: r.id("jamaatId"),
    placeId: r.id("placeId"),
    at: r.ts("at"),
    personIds: r.idList("personIds"),
    notes: r.text("notes", 1000),
    ...r.stamps(),
  };
  return r.done(v);
}

export function validateAudit(input: unknown): Result<AuditEntry> {
  const r = new Reader(input);
  const v: AuditEntry = {
    id: r.id("id"),
    at: r.ts("at"),
    entityType: r.oneOf("entityType", ["expense"] as const),
    entityId: r.id("entityId"),
    action: r.oneOf("action", AUDIT_ACTIONS),
    before: r.optRecord("before"),
    after: r.optRecord("after"),
  };
  r.cross(() => {
    if (v.action === "create" && (v.before !== null || v.after === null)) r.fail("after", "invalidCombo");
    if (v.action === "update" && (v.before === null || v.after === null)) r.fail("after", "invalidCombo");
    if (v.action === "delete" && (v.before === null || v.after !== null)) r.fail("before", "invalidCombo");
  });
  // Snapshots are shown in the history view, so they must be well-formed expense records.
  r.cross(() => {
    for (const key of ["before", "after"] as const) {
      const snap = v[key];
      if (snap !== null && !validateExpense(snap).ok) r.fail(key, "invalidType");
    }
  });
  return r.done(v);
}
