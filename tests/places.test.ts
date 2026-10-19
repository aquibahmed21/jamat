import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/db/index.ts";
import { MemoryBackend } from "../src/db/memory.ts";
import { DbError } from "../src/db/errors.ts";
import { mapUrl, mulaqaatConflicts, parseCoordinate, placeConflicts, telHref } from "../src/domain/places.ts";
import { deleteMulaqaat, deletePlace, loadMulaqaat, loadPlaces, saveMulaqaat, savePlace } from "../src/features/places/service.ts";
import { saveJamaat, saveMember } from "../src/features/members/service.ts";
import { validatePlace } from "../src/model/validate.ts";
import type { Place } from "../src/model/types.ts";
import * as f from "./helpers.ts";

const place = (over: Partial<Place> = {}): Place => ({ ...f.place(), ...over }) as Place;

test("parseCoordinate: strict decimal degrees only", () => {
  assert.equal(parseCoordinate("12.9716"), 12.9716);
  assert.equal(parseCoordinate("-77.5"), -77.5);
  assert.equal(parseCoordinate(" 0 "), 0);
  for (const bad of ["", "abc", "1e3", "12,5", "1.", ".5", "--1", "12 5", "NaN", "Infinity", "0x10", "+5"]) assert.equal(parseCoordinate(bad), null, bad);
});

test("validation: coordinate ranges, boundaries, pairing, phone", () => {
  const codes = (o: object) => { const r = validatePlace({ ...f.place(), ...o }); return r.ok ? [] : r.issues.map((i) => `${i.field}:${i.code}`); };
  assert.deepEqual(codes({ latitude: 90, longitude: 180 }), []);
  assert.deepEqual(codes({ latitude: -90, longitude: -180 }), []);
  assert.deepEqual(codes({ latitude: 90.0001 }), ["latitude:outOfRange"]);
  assert.deepEqual(codes({ longitude: -180.5 }), ["longitude:outOfRange"]);
  assert.deepEqual(codes({ latitude: "12.5x" }), ["latitude:invalidType"]);
  assert.deepEqual(codes({ latitude: NaN }), ["latitude:invalidType"]);
  assert.deepEqual(codes({ latitude: null }), ["latitude:required"]);
  assert.deepEqual(codes({ latitude: null, longitude: null }), []);
  assert.deepEqual(codes({ phone: "" }), []);
  assert.deepEqual(codes({ phone: "+91 (80) 1234-5678" }), []);
  assert.deepEqual(codes({ phone: "call me" }), ["phone:invalidPhone"]);
  assert.deepEqual(codes({ phone: "12" }), ["phone:invalidPhone"]);
  assert.deepEqual(codes({ type: "other", customType: "" }), ["customType:required"]);
});

test("mapUrl: coordinates preferred, address fallback, nothing otherwise", () => {
  assert.equal(mapUrl({ latitude: 12.5, longitude: 77.25, address: "x" }), "https://www.google.com/maps/search/?api=1&query=12.500000%2C77.250000");
  assert.equal(mapUrl({ latitude: -33.8688, longitude: 151.2093, address: "" }), "https://www.google.com/maps/search/?api=1&query=-33.868800%2C151.209300");
  assert.equal(mapUrl({ latitude: null, longitude: null, address: "12 Main St, Pune" }), "https://www.google.com/maps/search/?api=1&query=12%20Main%20St%2C%20Pune");
  assert.equal(mapUrl({ latitude: null, longitude: null, address: "   " }), null);
  assert.equal(mapUrl({ latitude: 12.5, longitude: null, address: "" }), null); // half a coordinate is not usable
  assert.equal(mapUrl({ latitude: 12.5, longitude: null, address: "Town" }), "https://www.google.com/maps/search/?api=1&query=Town");
});

test("mapUrl: boundaries and out-of-range values fall back safely", () => {
  assert.ok(mapUrl({ latitude: 90, longitude: 180, address: "" })!.endsWith("90.000000%2C180.000000"));
  assert.equal(mapUrl({ latitude: 91, longitude: 0, address: "" }), null);
  assert.equal(mapUrl({ latitude: 0, longitude: 181, address: "" }), null);
  assert.equal(mapUrl({ latitude: 0, longitude: 0, address: "" })!.endsWith("0.000000%2C0.000000"), true); // equator/meridian are valid
});

test("mapUrl: addresses are encoded - no injection into the URL", () => {
  const evil = `x&query=evil#frag?a=b javascript:alert(1)"><script>`;
  const url = mapUrl({ latitude: null, longitude: null, address: evil })!;
  assert.ok(url.startsWith("https://www.google.com/maps/search/?api=1&query="));
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://www.google.com");
  assert.equal(parsed.searchParams.get("query"), evil); // whole text stays inside the single query parameter
  assert.equal(parsed.searchParams.getAll("query").length, 1);
  assert.equal(parsed.hash, "");
});

test("telHref keeps only digits and +", () => {
  assert.equal(telHref("+91 (80) 1234-5678"), "tel:+918012345678");
  assert.equal(telHref(""), null);
  assert.match(telHref("javascript:alert(1) 12345")!, /^tel:[+\d]+$/); // nothing but digits and + can follow tel:
});

test("placeConflicts: unique name ignoring case, not against itself", () => {
  const a = place({ id: "a", name: "Masjid Noor" });
  assert.deepEqual(placeConflicts(place({ id: "b", name: " masjid NOOR " }), [a]).map((i) => i.code), ["duplicatePlace"]);
  assert.deepEqual(placeConflicts(a, [a]), []);
});

async function seeded() {
  const db = createDb(new MemoryBackend());
  await saveJamaat(db, { ...f.jamaat(), endAt: f.T0 + 100 * f.HOUR }, true);
  await saveMember(db, f.member(), true);
  return db;
}

test("places: persisted, sorted by name, duplicates and invalid refused", async () => {
  const db = await seeded();
  assert.ok((await savePlace(db, f.place(), true)).ok);
  assert.ok((await savePlace(db, { ...f.place(), id: "pl0", name: "Alpha Musalla", type: "musalla" }, true)).ok);
  const dup = await savePlace(db, { ...f.place(), id: "pl9", name: "test masjid" }, true);
  assert.ok(!dup.ok && dup.issues[0]!.code === "duplicatePlace");
  const bad = await savePlace(db, { ...f.place(), id: "pl8", name: "X", latitude: 120 }, true);
  assert.ok(!bad.ok);
  assert.deepEqual((await loadPlaces(db)).items.map((p) => p.name), ["Alpha Musalla", "Test Masjid"]);
  assert.ok((await savePlace(db, { ...f.place(), name: "Renamed", updatedAt: f.T0 + 1 }, false)).ok);
  assert.equal((await db.places.get("pl1"))!.name, "Renamed");
  assert.equal((await db.places.get("pl1"))!.latitude, 12.5);
});

test("mulaqaat: recorded at a place with people and time; conflicts refused", async () => {
  const db = await seeded();
  await savePlace(db, f.place(), true);
  assert.ok((await saveMulaqaat(db, f.mulaqaat(), true)).ok);
  const m = (o: object) => saveMulaqaat(db, { ...f.mulaqaat(), id: "mq9", ...o }, true);
  const code = async (p: ReturnType<typeof m>) => { const r = await p; return r.ok ? "ok" : `${r.issues[0]!.field}:${r.issues[0]!.code}`; };
  assert.equal(await code(m({ placeId: "ghost" })), "placeId:invalidId");
  assert.equal(await code(m({ at: f.T0 - 1 })), "at:beforeJamaatStart");
  assert.equal(await code(m({ at: f.T0 + 100 * f.HOUR })), "at:afterJamaatEnd");
  assert.equal(await code(m({ personIds: ["ghost"] })), "personIds:notAMember");
  assert.equal(await code(m({ at: f.T0 + f.HOUR, personIds: [] })), "ok");
  const list = (await loadMulaqaat(db, "j1")).items;
  assert.deepEqual(list.map((x) => x.id), ["mq9", "mq1"]); // newest first
  await deleteMulaqaat(db, "mq9");
  assert.equal((await loadMulaqaat(db, "j1")).items.length, 1);
});

test("a place with recorded mulaqaat cannot be deleted; a member who was met cannot be deleted", async () => {
  const db = await seeded();
  await savePlace(db, f.place(), true);
  await saveMulaqaat(db, f.mulaqaat(), true);
  await assert.rejects(deletePlace(db, "pl1"), (e) => e instanceof DbError && e.code === "inUse");
  const { deleteMember } = await import("../src/features/members/service.ts");
  await assert.rejects(deleteMember(db, "m1"), (e) => e instanceof DbError && e.code === "inUse");
  await deleteMulaqaat(db, "mq1");
  await deletePlace(db, "pl1");
  assert.equal(await db.places.get("pl1"), null);
});

test("mulaqaatConflicts is pure and does not mutate input", () => {
  const m = f.mulaqaat() as never;
  const copy = structuredClone(m);
  mulaqaatConflicts(m, { ...f.jamaat(), endAt: null } as never, [f.member()] as never, [f.place()] as never);
  assert.deepEqual(m, copy);
});
