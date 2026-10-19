import type { Jamaat, Member, Mulaqaat, Place } from "../model/types.ts";
import type { ValidationIssue } from "../model/validate.ts";

const COORD_RE = /^-?\d{1,3}(\.\d+)?$/;

/** Strict decimal degrees ("12.5", "-77.25"). Returns null for blanks and anything else (no exponents, no spaces). */
export function parseCoordinate(input: string): number | null {
  const s = input.trim();
  if (!COORD_RE.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const MAPS = "https://www.google.com/maps/search/?api=1&query=";

/**
 * Link that opens the place in an external map app/site (no library, no API key: this is the public URL scheme).
 * Coordinates win over the address. Returns null when there is nothing usable.
 * Only validated numbers or an encoded address ever reach the URL.
 */
export function mapUrl(p: Pick<Place, "latitude" | "longitude" | "address">): string | null {
  const { latitude: lat, longitude: lng } = p;
  if (typeof lat === "number" && typeof lng === "number" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return `${MAPS}${encodeURIComponent(`${lat.toFixed(6)},${lng.toFixed(6)}`)}`;
  }
  const address = p.address.trim();
  return address === "" ? null : `${MAPS}${encodeURIComponent(address)}`;
}

/** `tel:` link for a validated phone number; null when empty. */
export function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits === "" ? null : `tel:${digits}`;
}

const key = (s: string) => s.trim().toLowerCase();

/** Places are unique by name (ignoring case). `others` may include the place being edited. */
export function placeConflicts(p: Place, others: readonly Place[]): ValidationIssue[] {
  return others.some((o) => o.id !== p.id && key(o.name) === key(p.name)) ? [{ field: "name", code: "duplicatePlace" }] : [];
}

/** A meeting must be at a known place, inside the Jamaat period, with Jamaat members as the people. */
export function mulaqaatConflicts(
  m: Mulaqaat, jamaat: Jamaat, members: readonly Member[], places: readonly Place[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!places.some((p) => p.id === m.placeId)) issues.push({ field: "placeId", code: "invalidId" });
  if (m.at < jamaat.startAt) issues.push({ field: "at", code: "beforeJamaatStart" });
  if (jamaat.endAt !== null && m.at >= jamaat.endAt) issues.push({ field: "at", code: "afterJamaatEnd" });
  if (m.personIds.some((id) => !members.some((x) => x.id === id))) issues.push({ field: "personIds", code: "notAMember" });
  return issues;
}
