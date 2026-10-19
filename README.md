# Jamaat Manager (`jamat`)

A mobile-first web app for managing a Jamaat's members, Ameer appointments, expenses, daily programme and places.
Plain HTML, CSS and TypeScript with native browser APIs only: **no runtime libraries, no CDN, no backend**.
Data lives in your browser (IndexedDB) and the app works offline once loaded. Live: <https://aquibahmed21.github.io/jamat/>

## What it does

- **Members**: Jamaat profile, members with join/leave date and time, late arrival and early departure flags.
- **Ameer**: permanent and temporary appointments, full history, effective Ameer derived for any moment (the permanent appointment is never overwritten).
- **Expenses**: food (by meals or by time present), general, transport (vehicle, fare or fuel), miscellaneous, personal or Jamaat treats, contributions, advances, reimbursements, settlements, refunds. Money is integer paise. Every split shows a line-by-line calculation you can check by hand.
- **Ledger**: balances for each member and the Jamaat fund (always sum to zero), rules that block double settlement, over-refund and over-reimbursement, and an append-only change history.
- **Programme**: editable timetable (22 standard activities available), drag-and-drop and Move Up/Down, manual order independent of time, overlap warnings.
- **Places**: masjid, musalla, aashu khana or custom, with coordinates, zimmedar, phone, address, an external map link, and recorded mulaqaat.
- **Backup**: JSON export, validated import, replace or merge restore.
- **PWA**: installable, offline after first load, update prompt that never reloads on its own.
- English and concise Roman English (all text lives in `src/guitext.ts`).

## Commands

Node 24+ and a `tsc` on your PATH (TypeScript 5.9; install with `npm install --global typescript@5.9.2`). There are no npm dependencies.

| Command | What it does |
|---|---|
| `npm run check` | type-check, text check, unit tests, build, dist check (what CI runs) |
| `npm start` | build and serve at <http://localhost:8080/jamat/> (same sub-path as GitHub Pages) |
| `npm test` | unit tests (`node --test`, TypeScript run directly) |
| `npm run check:text` | fails on hard-coded UI text and unsafe DOM/JS sinks outside `src/guitext.ts` |
| `npm run check:dist` | verifies the built site: relative paths, CSP, manifest, service-worker precache list |
| `npm run audit:ui` | headless-Chrome audit: layouts at 8 sizes, tap targets, contrast, labels, keyboard, dialogs (`AUDIT_QUICK=1` for fewer sizes) |
| `npm run smoke:ui` | headless-Chrome end-to-end run of the real UI, including offline reload |
| `npm run verify:live` | checks the deployed GitHub Pages site and compares its build with local `dist/` (needs network) |

`audit:ui`, `smoke:ui` and `verify:live` need Chrome or Chromium (set `CHROME=/path/to/binary` if it is not on PATH).

## Layout

```
index.html, styles/, icons/      static shell (no inline script or style: strict CSP)
src/guitext.ts                   ALL user-facing text (en + roman); types make a missing translation a compile error
src/model/                       types and validation (pure)
src/domain/                      business rules (pure): money, eligibility, allocation, ledger, ameer, timetable, summary...
src/db/                          IndexedDB layer: versioned migrations, validated repos, atomic batches
src/features/<module>/           service (rules + storage) and view (DOM) per module
src/backup/                      export, parse/validate, merge/replace restore
src/ui/                          shared native UI patterns (buttons, forms, dialogs, toasts, focus, tables)
src/sw.ts, src/pwa.ts            service worker and its registration
scripts/                         build, dev server, checks, browser audit/smoke/live verification
tests/                           unit tests with synthetic data only
```

## Deploying to GitHub Pages

The repository ships `.github/workflows/pages.yml`. **GitHub Pages must be set to deploy from GitHub Actions** (branch deploys would publish the TypeScript sources, not the built app).

1. Push the repository to GitHub as `jamat` (the URL becomes `https://<user>.github.io/jamat/`).
2. In the repository: **Settings -> Pages -> Build and deployment -> Source: GitHub Actions**. Do not click "Configure" on the suggested Jekyll/Static HTML workflows.
3. Push to `main` (or run **Actions -> Deploy to GitHub Pages -> Run workflow**). The workflow type-checks, runs the text check and unit tests, builds, runs the dist check, and publishes `dist/`.
4. When the run is green, open the site and hard-reload once (Ctrl+Shift+R). Run `npm run verify:live` to confirm the deployed build.
5. Visit the site once while online; after that it also opens offline.

All asset URLs are relative and the service worker is registered at `./sw.js`, so the app works under the `/jamat/` sub-path. If you rename the repository nothing needs changing.

## Backup and restore

Your data is stored **only in this browser on this device**. It is not synced to other devices or accounts, and clearing site data, uninstalling the browser or a storage-pressure eviction can erase it. Back up regularly.

- **Backup -> Download backup** saves one `.json` file containing everything. It is plain text with names and phone numbers: keep it somewhere safe.
- **Backup -> Restore from a file** checks the whole file first (structure, values, duplicate ids, references, version). If anything is wrong nothing is changed.
  - *Replace everything on this device*: deletes current data and installs the file. A copy of the current data is downloaded first.
  - *Merge*: only adds records that are missing; records with the same id are never overwritten. Offered only for the same Jamaat and only when it would not create accounting or schedule conflicts.
- To move to another device: download a backup on the old one, then restore it on the new one.
- Restores are all-or-nothing: if a write fails, the existing data is untouched.

## Known limitations

- Single device, single Jamaat profile; no sync or multi-user editing (a stale edit from another tab is refused, not merged).
- Attendance is one join/leave interval per member (no temporary absences).
- Programme activities cannot span midnight; the standard activity times are placeholders to edit.
- Expense dates are not restricted to the Jamaat period; allocation uses the expense date and member presence at that moment.
- The `allocations` store is reserved: splits are derived on demand and are not persisted.
- Roman English wording has not been reviewed by a native speaker.
- The security headers a server would set (e.g. `frame-ancestors`) cannot be set on GitHub Pages; the CSP is delivered via `<meta>`.

## Manual checks that automation cannot cover

- Install the PWA on an Android phone and on an iPhone/iPad (Add to Home Screen) and open it in airplane mode.
- Touch drag-and-drop in the programme on a real touch screen.
- Screen reader pass (TalkBack, VoiceOver, NVDA): forms, dialogs, the toast announcements, Move Up/Down.
- Roman English wording review.
- Printing/exporting a backup file and restoring it on a second real device.
