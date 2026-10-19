// Synthetic fixtures only (no real people or data).
export const T0 = Date.UTC(2030, 0, 1, 0, 0, 0);
export const HOUR = 3_600_000;

const stamps = { createdAt: T0, updatedAt: T0 };

export const jamaat = () => ({ id: "j1", name: "Test Jamaat", startAt: T0, endAt: null, notes: "", ...stamps });
export const member = () => ({ id: "m1", jamaatId: "j1", name: "Member One", phone: "+91 90000 00000", joinAt: T0, leaveAt: null, notes: "", ...stamps });
export const appointment = () => ({ id: "a1", jamaatId: "j1", memberId: "m1", kind: "permanent", startAt: T0, endAt: null, ...stamps });
export const expense = () => ({
  id: "e1", jamaatId: "j1", category: "general", date: T0, description: "Water", amountPaise: 12345,
  paymentSource: "member", payerId: "m1", counterpartyId: null, linkedExpenseId: null, participantIds: ["m1"],
  foodBasis: null, treatKind: null, vehicle: null, transportCost: null, mealTimes: [], periodFrom: null, periodTo: null, ...stamps,
});
export const allocation = () => ({ id: "al1", expenseId: "e1", beneficiaryId: "m1", owedById: "m1", bearerId: null, amountPaise: 100, basis: "12345 / 1", ...stamps });
export const activity = () => ({ id: "p1", jamaatId: "j1", title: "Taleem", startMin: 600, endMin: 660, location: "", responsibleIds: [], order: 0, notes: "", ...stamps });
export const place = () => ({ id: "pl1", name: "Test Masjid", type: "masjid", customType: "", latitude: 12.5, longitude: 77.5, zimmedar: "", phone: "", address: "", notes: "", ...stamps });
export const mulaqaat = () => ({ id: "mq1", jamaatId: "j1", placeId: "pl1", at: T0, personIds: ["m1"], notes: "", ...stamps });
