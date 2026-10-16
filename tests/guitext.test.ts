import { test } from "node:test";
import assert from "node:assert/strict";
import { allDicts, getLanguage, setLanguage, gt, onLanguageChange } from "../src/guitext.ts";

function keys(o: object, prefix = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    typeof v === "string" ? [prefix + k] : keys(v as object, `${prefix}${k}.`));
}
function values(o: object): string[] {
  return Object.values(o).flatMap((v) => (typeof v === "string" ? [v] : values(v as object)));
}

test("roman has exactly the same keys as english", () => {
  assert.deepEqual(keys(allDicts.roman).sort(), keys(allDicts.en).sort());
});

test("no empty strings in any language", () => {
  for (const d of Object.values(allDicts)) for (const v of values(d)) assert.ok(v.trim().length > 0);
});

test("setLanguage switches dictionary and notifies once per change", () => {
  let calls = 0;
  onLanguageChange(() => calls++);
  assert.equal(getLanguage(), "en");
  setLanguage("roman");
  assert.equal(gt().nav.home, allDicts.roman.nav.home);
  setLanguage("roman");
  assert.equal(calls, 1);
  setLanguage("en");
  assert.equal(gt().nav.home, "Home");
  assert.equal(calls, 2);
});
