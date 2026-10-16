import { test } from "node:test";
import assert from "node:assert/strict";
import * as v from "../src/model/validate.ts";
import * as f from "./helpers.ts";

type Fn = (i: unknown) => v.Result<unknown>;
const fixtures: [string, Fn, () => object][] = [
  ["jamaat", v.validateJamaat, f.jamaat], ["member", v.validateMember, f.member],
  ["appointment", v.validateAppointment, f.appointment], ["expense", v.validateExpense, f.expense],
  ["allocation", v.validateAllocation, f.allocation], ["activity", v.validateActivity, f.activity],
  ["place", v.validatePlace, f.place], ["mulaqaat", v.validateMulaqaat, f.mulaqaat],
];

function codes(fn: Fn, input: unknown): string[] {
  const r = fn(input);
  return r.ok ? [] : r.issues.map((i) => `${i.field}:${i.code}`);
}

for (const [name, fn, make] of fixtures) {
  test(`${name}: valid fixture passes and round-trips`, () => {
    const r = fn(make());
    assert.ok(r.ok);
    assert.deepEqual(r.value, make());
  });
  test(`${name}: rejects non-objects`, () => {
    for (const bad of [null, undefined, 5, "x", []]) assert.deepEqual(codes(fn, bad), [":notObject"]);
  });
  test(`${name}: rejects bad id and missing required id`, () => {
    assert.ok(codes(fn, { ...make(), id: "a b" }).includes("id:invalidId"));
    assert.ok(codes(fn, { ...make(), id: undefined }).includes("id:required"));
  });
  test(`${name}: strips unknown fields`, () => {
    const r = fn({ ...make(), evil: "<script>" });
    assert.ok(r.ok);
    assert.equal("evil" in (r.value as object), false);
  });
  test(`${name}: updatedAt before createdAt is invalid`, () => {
    assert.deepEqual(codes(fn, { ...make(), updatedAt: f.T0 - 1 }), ["updatedAt:invalidOrder"]);
  });
}

test("text is trimmed; required text rejects blank; length capped", () => {
  const ok = v.validateMember({ ...f.member(), name: "  Ali  " });
  assert.ok(ok.ok && ok.value.name === "Ali");
  assert.deepEqual(codes(v.validateMember, { ...f.member(), name: "   " }), ["name:required"]);
  assert.deepEqual(codes(v.validateMember, { ...f.member(), name: "x".repeat(101) }), ["name:tooLong"]);
  assert.deepEqual(codes(v.validateMember, { ...f.member(), name: 5 }), ["name:invalidType"]);
});

test("phone: optional but must look like a phone number", () => {
  assert.ok(v.validateMember({ ...f.member(), phone: "" }).ok);
  assert.deepEqual(codes(v.validateMember, { ...f.member(), phone: "abc" }), ["phone:invalidPhone"]);
});

test("member leave must be strictly after join", () => {
  assert.deepEqual(codes(v.validateMember, { ...f.member(), leaveAt: f.T0 }), ["leaveAt:invalidOrder"]);
  assert.ok(v.validateMember({ ...f.member(), leaveAt: f.T0 + 1 }).ok);
});

test("timestamps must be non-negative safe integers", () => {
  assert.deepEqual(codes(v.validateMember, { ...f.member(), joinAt: -1 }), ["joinAt:outOfRange"]);
  assert.deepEqual(codes(v.validateMember, { ...f.member(), joinAt: 1.5 }), ["joinAt:invalidType"]);
  assert.deepEqual(codes(v.validateMember, { ...f.member(), joinAt: "1" }), ["joinAt:invalidType"]);
  assert.deepEqual(codes(v.validateMember, { ...f.member(), joinAt: NaN }), ["joinAt:invalidType"]);
});

test("appointments: temporary needs an end; end after start", () => {
  assert.deepEqual(codes(v.validateAppointment, { ...f.appointment(), kind: "temporary" }), ["endAt:required"]);
  assert.ok(v.validateAppointment({ ...f.appointment(), kind: "temporary", endAt: f.T0 + f.HOUR }).ok);
  assert.deepEqual(codes(v.validateAppointment, { ...f.appointment(), endAt: f.T0 }), ["endAt:invalidOrder"]);
  assert.deepEqual(codes(v.validateAppointment, { ...f.appointment(), kind: "boss" }), ["kind:invalidEnum"]);
});

test("expense money: positive safe integer paise only", () => {
  for (const bad of [0, -5]) assert.deepEqual(codes(v.validateExpense, { ...f.expense(), amountPaise: bad }), ["amountPaise:outOfRange"]);
  for (const bad of [1.5, 0.1 + 0.2, "100", Infinity]) assert.deepEqual(codes(v.validateExpense, { ...f.expense(), amountPaise: bad }), ["amountPaise:invalidType"]);
  assert.deepEqual(codes(v.validateExpense, { ...f.expense(), amountPaise: 2 ** 53 }), ["amountPaise:invalidType"]);
});

test("expense payer rules", () => {
  assert.deepEqual(codes(v.validateExpense, { ...f.expense(), payerId: null }), ["payerId:required"]);
  assert.deepEqual(codes(v.validateExpense, { ...f.expense(), paymentSource: "jamaat" }), ["payerId:invalidCombo"]);
  assert.ok(v.validateExpense({ ...f.expense(), paymentSource: "jamaat", payerId: null }).ok);
});

test("expense food basis and treat kind rules", () => {
  assert.deepEqual(codes(v.validateExpense, { ...f.expense(), category: "food" }), ["foodBasis:required"]);
  assert.ok(v.validateExpense({ ...f.expense(), category: "food", foodBasis: "meal", mealTimes: [f.T0] }).ok);
  assert.deepEqual(codes(v.validateExpense, { ...f.expense(), foodBasis: "meal" }), ["foodBasis:invalidCombo"]);
  assert.deepEqual(codes(v.validateExpense, { ...f.expense(), category: "treat" }), ["treatKind:required"]);
  assert.ok(v.validateExpense({ ...f.expense(), category: "treat", treatKind: "personal" }).ok);
  assert.deepEqual(codes(v.validateExpense, { ...f.expense(), treatKind: "jamaat" }), ["treatKind:invalidCombo"]);
  assert.deepEqual(codes(v.validateExpense, { ...f.expense(), category: "bribe" }), ["category:invalidEnum"]);
});

test("participant lists: ids only, no duplicates", () => {
  assert.deepEqual(codes(v.validateExpense, { ...f.expense(), participantIds: ["m1", "m1"] }), ["participantIds:duplicate"]);
  assert.deepEqual(codes(v.validateExpense, { ...f.expense(), participantIds: ["<b>"] }), ["participantIds:invalidId"]);
  assert.deepEqual(codes(v.validateExpense, { ...f.expense(), participantIds: "m1" }), ["participantIds:invalidType"]);
});

test("allocation amount may be zero but not negative or fractional", () => {
  assert.ok(v.validateAllocation({ ...f.allocation(), amountPaise: 0 }).ok);
  assert.deepEqual(codes(v.validateAllocation, { ...f.allocation(), amountPaise: -1 }), ["amountPaise:outOfRange"]);
  assert.deepEqual(codes(v.validateAllocation, { ...f.allocation(), amountPaise: 0.5 }), ["amountPaise:invalidType"]);
});

test("activity times: minutes of day, end after start", () => {
  assert.deepEqual(codes(v.validateActivity, { ...f.activity(), startMin: 1440 }), ["startMin:outOfRange"]);
  assert.deepEqual(codes(v.validateActivity, { ...f.activity(), endMin: 600 }), ["endMin:invalidOrder"]);
  assert.ok(v.validateActivity({ ...f.activity(), endMin: null }).ok);
  assert.deepEqual(codes(v.validateActivity, { ...f.activity(), order: -1 }), ["order:outOfRange"]);
});

test("place: coordinates must be valid and paired; custom type rules", () => {
  assert.deepEqual(codes(v.validatePlace, { ...f.place(), latitude: 91 }), ["latitude:outOfRange"]);
  assert.deepEqual(codes(v.validatePlace, { ...f.place(), longitude: -181 }), ["longitude:outOfRange"]);
  assert.deepEqual(codes(v.validatePlace, { ...f.place(), longitude: null }), ["longitude:required"]);
  assert.ok(v.validatePlace({ ...f.place(), latitude: null, longitude: null }).ok);
  assert.deepEqual(codes(v.validatePlace, { ...f.place(), type: "other" }), ["customType:required"]);
  assert.ok(v.validatePlace({ ...f.place(), type: "other", customType: "Park" }).ok);
  assert.deepEqual(codes(v.validatePlace, { ...f.place(), customType: "Park" }), ["customType:invalidCombo"]);
});

test("expense meal times and period rules", () => {
  const food = { ...f.expense(), category: "food" };
  assert.deepEqual(codes(v.validateExpense, { ...food, foodBasis: "meal" }), ["mealTimes:required"]);
  const ok = v.validateExpense({ ...food, foodBasis: "meal", mealTimes: [f.T0 + 5, f.T0] });
  assert.ok(ok.ok && ok.value.mealTimes[0] === f.T0); // sorted ascending
  assert.deepEqual(codes(v.validateExpense, { ...food, foodBasis: "meal", mealTimes: [f.T0, f.T0] }), ["mealTimes:duplicate"]);
  assert.deepEqual(codes(v.validateExpense, { ...food, foodBasis: "meal", mealTimes: [-1] }), ["mealTimes:outOfRange"]);
  assert.deepEqual(codes(v.validateExpense, { ...food, foodBasis: "meal", mealTimes: [f.T0], periodFrom: f.T0 }), ["periodFrom:invalidCombo"]);
  assert.deepEqual(codes(v.validateExpense, { ...f.expense(), mealTimes: [f.T0] }), ["mealTimes:invalidCombo"]);
  assert.deepEqual(codes(v.validateExpense, { ...food, foodBasis: "duration" }), ["periodFrom:required", "periodTo:required"]);
  assert.deepEqual(codes(v.validateExpense, { ...food, foodBasis: "duration", periodFrom: f.T0, periodTo: f.T0 }), ["periodTo:invalidOrder"]);
  assert.ok(v.validateExpense({ ...food, foodBasis: "duration", periodFrom: f.T0, periodTo: f.T0 + 1 }).ok);
  assert.deepEqual(codes(v.validateExpense, { ...food, foodBasis: "duration", periodFrom: f.T0, periodTo: f.T0 + 1, mealTimes: [f.T0] }), ["mealTimes:invalidCombo"]);
});
