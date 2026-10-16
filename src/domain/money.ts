// Money is integer paise everywhere. Parsing never goes through floating point.

const RUPEES_RE = /^\d{1,13}(\.\d{1,2})?$/;

/** "1,234.5" -> 123450 paise. Returns null for anything that is not a positive amount with at most 2 decimals. */
export function parseRupees(input: string): number | null {
  const s = input.trim().replace(/,/g, "");
  if (!RUPEES_RE.test(s)) return null;
  const [rupees = "0", frac = ""] = s.split(".");
  const paise = Number(rupees) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

/** 123450 -> "₹1,234.50" (Indian digit grouping). */
export function formatPaise(paise: number, symbol: string): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = new Intl.NumberFormat("en-IN").format(Math.floor(abs / 100));
  return `${sign}${symbol}${rupees}.${String(abs % 100).padStart(2, "0")}`;
}

/** Paise as a plain editable string: 123450 -> "1234.50". */
export function paiseToInput(paise: number): string {
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}
