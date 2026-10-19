// Fails if user-facing text is hard-coded outside src/guitext.ts.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const bad = [];
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);

const rules = [
  // security: DOM sinks that parse HTML/JS from strings must never appear (all text goes through textContent)
  [/\.(?:outerHTML|insertAdjacentHTML)\b|document\.write\(|\beval\(|new Function\(|\bsetTimeout\(\s*["'`]/, "dangerous DOM/JS sink"],
  [/setAttribute\(\s*["']on[a-z]+["']|["']javascript:/i, "inline handler or javascript: URL"],
  [/\b(?:text|textContent|innerText|title|placeholder|alt)\s*[:=]\s*["'`][^"'`]*[A-Za-z]/, "string literal assigned to a text property"],
  [/\.innerHTML\s*=/, "innerHTML assignment"],
  [/\b(?:alert|confirm|prompt)\s*\(/, "native dialog"],
  [/\bnew Error\(\s*["'`]/, "literal error message"],
  [/aria-label"?\s*[:=,]\s*["'`][^"'`]*[A-Za-z]/, "literal aria-label"],
];
for (const f of walk("src").filter((f) => f.endsWith(".ts") && !f.endsWith("guitext.ts"))) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (line.trim().startsWith("//")) return;
    const code = line.replace(/\$\{[^}]*\}/g, "").replace(/`[^A-Za-z`]*`/g, '""');
    for (const [re, why] of rules) if (re.test(code)) bad.push(`${f}:${i + 1}: ${why}: ${line.trim()}`);
  });
}
// HTML: no visible text nodes, no literal title/aria-label/alt/placeholder.
const html = readFileSync("index.html", "utf8").replace(/<script[\s\S]*?<\/script>|<!--[\s\S]*?-->/g, "");
if (/>\s*[^<\s][^<]*</.test(html)) bad.push("index.html: text node in markup");
if (/\s(?:aria-label|alt|placeholder)="[^"]+"/.test(html)) bad.push("index.html: literal attribute text");
if (bad.length) { console.error(bad.join("\n")); process.exit(1); }
console.log("check:text OK");
