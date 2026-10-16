// Typed data model. Money is integer paise; instants are epoch milliseconds;
// programme times are minutes from midnight. All ids are opaque strings (see id.ts).

export const EXPENSE_CATEGORIES = [
  "food", "general", "transport", "misc", "treat",
  "contribution", "advance", "reimbursement", "settlement", "refund",
] as const;
export const PAYMENT_SOURCES = ["member", "jamaat"] as const;
export const FOOD_BASES = ["meal", "duration"] as const;
export const TREAT_KINDS = ["personal", "jamaat"] as const;
export const APPOINTMENT_KINDS = ["permanent", "temporary"] as const;
export const PLACE_TYPES = ["masjid", "musalla", "aashu_khana", "other"] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type PaymentSource = (typeof PAYMENT_SOURCES)[number];
export type FoodBasis = (typeof FOOD_BASES)[number];
export type TreatKind = (typeof TREAT_KINDS)[number];
export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number];
export type PlaceType = (typeof PLACE_TYPES)[number];

export interface Stamps {
  createdAt: number;
  updatedAt: number;
}

export interface Jamaat extends Stamps {
  id: string;
  name: string;
  startAt: number;
  endAt: number | null;
  notes: string;
}

export interface Member extends Stamps {
  id: string;
  jamaatId: string;
  name: string;
  phone: string;
  joinAt: number;
  /** null = still present. */
  leaveAt: number | null;
  notes: string;
}

export interface AmeerAppointment extends Stamps {
  id: string;
  jamaatId: string;
  memberId: string;
  kind: AppointmentKind;
  startAt: number;
  /** null only for open-ended permanent appointments. */
  endAt: number | null;
}

export interface Expense extends Stamps {
  id: string;
  jamaatId: string;
  category: ExpenseCategory;
  /** When the expense happened. */
  date: number;
  description: string;
  amountPaise: number;
  paymentSource: PaymentSource;
  /** Member who paid; null when paid from Jamaat funds. */
  payerId: string | null;
  /** Other party for settlements/reimbursements/refunds (rules enforced in Task 7/9). */
  counterpartyId: string | null;
  participantIds: string[];
  /** Required for food, null otherwise. */
  foodBasis: FoodBasis | null;
  /** Required for treats, null otherwise. */
  treatKind: TreatKind | null;
  /** Refund -> the advance returned; reimbursement -> the expense being paid back. Null otherwise. */
  linkedExpenseId: string | null;
  /** Food, meal-based: the meals the expense covers (epoch ms, ascending). Empty otherwise. */
  mealTimes: number[];
  /** Food, duration-based: the period [from, to) the expense covers. Null otherwise. */
  periodFrom: number | null;
  periodTo: number | null;
}

/** One row of an expense split. Payer, beneficiary, debtor and cost-bearer are separate. */
export interface Allocation extends Stamps {
  id: string;
  expenseId: string;
  beneficiaryId: string;
  owedById: string;
  /** Member who finally bears the cost; null = Jamaat funds. */
  bearerId: string | null;
  amountPaise: number;
  /** Human-checkable calculation note. */
  basis: string;
}

export interface ProgrammeActivity extends Stamps {
  id: string;
  jamaatId: string;
  title: string;
  startMin: number;
  endMin: number | null;
  location: string;
  responsibleIds: string[];
  /** Manual display order, independent of time. */
  order: number;
  notes: string;
}

export interface Place extends Stamps {
  id: string;
  name: string;
  type: PlaceType;
  /** Required when type is "other", empty otherwise. */
  customType: string;
  latitude: number | null;
  longitude: number | null;
  zimmedar: string;
  phone: string;
  address: string;
  notes: string;
}

export interface Mulaqaat extends Stamps {
  id: string;
  jamaatId: string;
  placeId: string;
  at: number;
  personIds: string[];
  notes: string;
}

export const AUDIT_ACTIONS = ["create", "update", "delete"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Immutable history of a financial record: full snapshots before and after each change. */
export interface AuditEntry {
  id: string;
  at: number;
  entityType: "expense";
  entityId: string;
  action: AuditAction;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}
