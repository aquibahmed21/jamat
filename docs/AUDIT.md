# Accounting, integrity and security audit (Task 16)

Scope: the whole implemented application. What was checked, what was fixed, and what remains. Nothing here is a claim that
the app is "secure" or "production-ready" beyond the verification listed.

## Fixed in this audit (each has a test in `tests/integrity.test.ts` unless noted)

| Finding | Risk | Fix |
|---|---|---|
| An expense saved with no participants meant "everyone present *now*", re-evaluated on every read | Adding or editing a member later silently changed settled splits (historical records rewritten) | "Everyone present" is resolved and stored when the expense is saved |
| Editing a member's join/leave time was only checked against the Jamaat period | Could make an existing expense unsplittable or change who it counts | Member edits are refused if they introduce a ledger problem |
| Editing the Jamaat period only checked members | Appointments and mulaqaat could end up outside the period | Period edits also check appointments and mulaqaat |
| Two tabs/devices editing the same record: last write silently won | Lost updates | Optimistic concurrency (`updatedAt`) on every record type; stale saves are refused with a clear message, no audit entry written |
| Deleting a Jamaat removed members one by one | A failure midway left a partial deletion | One atomic transaction |
| No upper bound on amounts or list sizes | Sums could exceed 2^53; unbounded arrays | Amount cap (Rs 1 billion) so any realistic number of records sums exactly; lists capped at 500 |
| No Content-Security-Policy | Any injected markup could load/execute remote code | Strict CSP + `no-referrer` meta; `check:dist` fails if it weakens or inline code appears |
| Security-sensitive DOM sinks were only partly linted | Future regressions | `check:text` also rejects `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, inline handlers, `javascript:` |
| Transport lacked vehicle and fuel/fare (spec gap) | Incomplete feature | `vehicle` and `transportCost` fields (optional, transport only) |
| Period rules and the transfer-category list were duplicated in several modules | Rules drifting apart | Single `periodIssues` and single `TRANSFER_CATEGORIES` |
| Unused text keys and a dead "coming soon" route | Dead code | Removed |

## Verified (and how)

- **Ledger invariants** under a seeded fuzz of 300 random operations (create, edit, delete, settle, refund, reimburse): accepted history never
  breaks a ledger rule, balances always sum to exactly zero, every accepted change writes exactly one history entry, every refused change
  leaves data and history untouched.
- **Rounding**: largest-remainder split is deterministic and order independent (500-case property test, BigInt-exact for huge amounts).
- **Time boundaries**: start inclusive / end exclusive everywhere (members, Ameer, programme, Jamaat period).
- **Imported JSON**: size cap, record cap, strict per-record validation, duplicate ids, dangling references, unknown sections,
  prototype-pollution keys, oversized lists, newer versions; any problem rejects the whole file; restore is atomic.
- **DOM updates**: all text uses `textContent`; no HTML parsing sinks (enforced by `check:text`).
- **URL construction**: map links use only validated numbers or an encoded address; `tel:` links keep digits and `+` only;
  external links use `noopener noreferrer`; ids are restricted to `[A-Za-z0-9_-]`.
- **Local storage exposure**: `localStorage` holds only the language choice (validated on read); everything else is IndexedDB.
- **Performance**: 3000 expenses x 40 members summarise in well under 2 s; saving with 1500 existing records is well under 1.5 s.

## Residual risks and open items

- Data is only on the device; losing browser data loses the app's data unless a backup exists.
- The backup file is plain text (names, phone numbers). Encryption is not implemented.
- Records created before "everyone present" was stored still resolve dynamically (legacy; no migration was written).
- The optimistic-concurrency check and the write are separate steps for non-expense records (a race between two tabs within the same
  few milliseconds is theoretically possible); expense writes are atomic with their history entry.
- Clickjacking protection (`frame-ancestors`) needs an HTTP header, which GitHub Pages cannot send.
- GitHub Actions in the workflow are pinned by major version tag, not by commit SHA.
- The reserved `allocations` store is never written (kept for schema/backup compatibility).
- Not tested: real devices (iOS install, touch drag), screen readers, storage eviction behaviour.
