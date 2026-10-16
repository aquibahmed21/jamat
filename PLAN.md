# Jamat — Project Plan (Task 1)

## Repository state
- Contains only `README.md` (title), `CLAUDE.md` (spec; has uncommitted edits by the owner), `.claude/settings.local.json`.
- No `package.json`, source, build config, or tests. Remote: `github.com/aquibahmed21/jamat`, branch `main`.
- Toolchain on this machine: Node v24.21.0, npm 11.19.0, global `tsc` (system TypeScript), Python 3. No project-local dependencies.

## Toolchain decision (zero dependencies)
- **Compile**: global `tsc` (or `npx`-free: a `package.json` script calling `tsc`). `typescript` as a *devDependency* is build-time only, not a runtime library; adding it pinned makes CI reproducible. Decision for Task 2: pin `typescript` as the only devDependency.
- **Tests**: built-in `node:test` + `node:assert`. Node 24 runs `.ts` via type stripping, so pure logic modules (allocation, eligibility, Ameer, timetable, validation) are testable with no tooling. Constraint: tests must use erasable TS syntax only (no enums / parameter properties), and relative imports must use `.ts`-compatible paths (set `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` in tsconfig).
- IndexedDB persistence tests: Node has no IndexedDB. Keep the DB layer thin behind an interface; test logic against an in-memory implementation; real IndexedDB/offline checks are **manual browser** checks.
- **Serve**: `python3 -m http.server` on the output dir (no dependency), or a small `node` static script.
- **Lint**: none available without dependencies; rely on `tsc --strict --noUnusedLocals`.

## Architecture
Plain ES modules, no framework, no bundler. `tsc` emits into `dist/`; static files are copied by a tiny node script.

```
jamat/
  index.html            shell (no UI text; strings injected from guitext)
  manifest.webmanifest  (Task 14)
  sw.js / sw.ts         (Task 14)
  src/
    guitext.ts          ALL UI strings, en + roman
    main.ts             bootstrap, hash router
    ui/                 shell, dialogs, forms, icons, states (native DOM helpers)
    model/              types + validation (pure)
    db/                 IndexedDB layer + migrations
    domain/             pure logic: money, eligibility, ameer, allocation, ledger, timetable, places
    features/           members, ameer, expenses, ledger, programme, places, summary, backup
  styles/               tokens.css, base.css, components.css
  tests/                *.test.ts (node:test), synthetic data only
  scripts/build.mjs     tsc + copy static files to dist/
  dist/                 build output (published)
```
Principles: domain logic is pure and UI-free; UI calls domain; summaries reuse domain (no duplicated finance logic). Money = integer paise (`number` safe-integer, or `bigint` if ranges demand). Timestamps stored as epoch ms + display via `Intl`.

## GitHub Pages requirements
- Project site URL: `https://aquibahmed21.github.io/jamat/` → app lives under `/jamat/`, never domain root.
- Use **relative URLs** everywhere (`./styles/...`, `./src/main.js`) and a hash router (`#/members`) so no server rewrites or 404 fallback are needed (Pages can't rewrite).
- Service worker: register with relative path `./sw.js`; scope defaults to `/jamat/`. Manifest `start_url` and `scope` = `./`. Cache name versioned; network-first for HTML/JS, avoid stale-trap.
- Deploy via GitHub Actions (`actions/upload-pages-artifact` of `dist/`) or `docs/` folder; decide in Task 2/17. Note: Actions use third-party *CI* actions, not runtime code.
- IndexedDB is per-origin (`aquibahmed21.github.io`), shared with other project sites on that origin → use a unique DB name (`jamat`).

## Assumptions
1. Single-user, single device; no sync. Backup is JSON export (Task 13).
2. One Jamaat profile active at a time (multiple later is a non-goal unless requested).
3. Currency INR; amounts entered in rupees, stored as paise.
4. Times are local wall-clock; stored as epoch ms with timezone-agnostic display.
5. `typescript` devDependency acceptable (build-only); otherwise rely on the global `tsc`.

## Risks
- IndexedDB/offline cannot be automated here → manual browser verification list.
- Service-worker staleness on Pages (cache lifetime 10 min) → versioned caches, update prompt.
- Shared origin for IndexedDB/service-worker scope with other `aquibahmed21.github.io` projects.
- Browser-local data loss (cache clearing, iOS eviction) → prominent backup UX; request `navigator.storage.persist()`.
- Rounding/accounting correctness → pure engine with exhaustive tests; breakdown shown to user.
- Node type-stripping test limits (no enums, `.ts` import extensions).
- Roman-English text maintenance → typed keys so missing translations fail compilation.

## Task plan
| # | Deliverable | Verification |
|---|---|---|
| 2 | package.json, tsconfig, build script, shell, nav, CSS tokens, relative paths | `tsc`, build, serve, open locally |
| 3 | guitext.ts (en/roman), language switch, UI primitives | tsc; grep for hard-coded text |
| 4 | Models, validation, IndexedDB + migrations | node:test (validation, in-memory store); manual IDB |
| 5 | Jamaat + members, eligibility | node:test boundaries |
| 6 | Ameer appointments, effective-Ameer rules | node:test |
| 7 | Expense CRUD, paise money | node:test (money), manual UI |
| 8 | Allocation engine + breakdowns | thorough node:test |
| 9 | Ledger lifecycle | node:test |
| 10 | Timetable, reorder, overlaps | node:test |
| 11 | Places, mulaqaat, map links | node:test |
| 12 | Summaries/navigation | tests on derived values, manual |
| 13 | Backup/restore | round-trip tests |
| 14 | PWA/offline | manual offline checks |
| 15 | A11y/responsive audit | manual + checks |
| 16 | Accounting/security audit | tests for defects |
| 17 | Final verification + Pages steps | all checks |
