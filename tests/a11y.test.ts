import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { byLabel } from "../src/ui/focus.ts";
import { isDirty, setDirty } from "../src/ui/dirty.ts";

// WCAG contrast of the design tokens, light and dark, straight from styles/main.css (no browser needed).
const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{3,6}|var\(--[a-z-]+\))\s*;/g)) out[m[1]!] = m[2]!;
  return out;
}
const lightBlock = /:root\s*\{([^}]*)\}/.exec(css)![1]!;
const darkBlock = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)![1]!;
const light = tokens(lightBlock);
const dark = { ...light, ...tokens(darkBlock) };

function resolve(t: Record<string, string>, name: string): [number, number, number] {
  let v = t[name]!;
  while (v.startsWith("var(")) v = t[v.slice(6, -1)]!;
  const h = v.slice(1);
  const f = h.length === 3 ? [...h].map((c) => c + c) : h.match(/../g)!;
  return f.map((x) => parseInt(x, 16)) as [number, number, number];
}
const lum = ([r, g, b]: number[]) => {
  const c = [r, g, b].map((v) => { const s = v! / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

// [foreground, background, minimum ratio]: 4.5 for text, 3 for focus rings / UI components
const PAIRS: [string, string, number][] = [
  ["text", "bg", 4.5], ["text", "surface", 4.5], ["muted", "bg", 4.5], ["muted", "surface", 4.5],
  ["primary", "bg", 4.5], ["primary", "surface", 4.5], ["link", "surface", 4.5], ["link", "bg", 4.5],
  ["primary-contrast", "primary", 4.5], ["danger", "surface", 4.5], ["danger", "bg", 4.5], ["danger-contrast", "danger", 4.5],
  ["primary", "surface", 3], ["border", "surface", 1.2],
];

for (const [name, t] of [["light", light], ["dark", dark]] as const) {
  test(`${name} theme: token pairs meet WCAG contrast`, () => {
    for (const [fg, bg, min] of PAIRS) {
      if (fg === "border") continue; // decorative separator, not required
      const r = ratio(resolve(t, fg), resolve(t, bg));
      assert.ok(r >= min, `${name}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
    }
  });
}

test("focus ring colour on the coloured top bar contrasts with it (both themes)", () => {
  for (const t of [light, dark]) assert.ok(ratio(resolve(t, "primary-contrast"), resolve(t, "primary")) >= 3);
});

test("touch target token is at least 44px at the default font size", () => {
  const m = /--tap:\s*([\d.]+)rem/.exec(css)!;
  assert.ok(parseFloat(m[1]!) * 16 >= 44);
});

test("the hidden attribute always wins over component display rules", () => {
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

test("byLabel builds a safe attribute selector", () => {
  assert.equal(byLabel("Move up: Taleem"), '[aria-label="Move up: Taleem"]');
  assert.equal(byLabel('say "hi"'), '[aria-label="say \\"hi\\""]');
  assert.equal(byLabel("back\\slash"), '[aria-label="back\\\\slash"]');
});

test("dirty flag", () => {
  assert.equal(isDirty(), false);
  setDirty(true);
  assert.equal(isDirty(), true);
  setDirty(false);
});
