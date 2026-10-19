# Claude Instructions --- Jamaat Expense Manager

## How to use this file

This repository will be named **`jamat`** and deployed to **GitHub
Pages**.

This file defines the complete project scope and a sequence of
implementation tasks. **Do not implement the entire application in one
run.** I will ask you to complete tasks individually, for example:
"Complete Task 1" and later "Complete Task 2".

### Mandatory task-by-task rules

1.  On every request, identify the exact task number I asked you to
    complete.
2.  Implement **only that task**. Do not start later tasks, even if you
    notice work that would belong to them.
3.  You may make the smallest supporting change in an existing file when
    strictly necessary for the requested task. Explain why it was
    necessary.
4.  Before changing anything, inspect the repository, current files, Git
    status, and relevant existing implementation. Preserve existing
    functionality and all user changes. Never reset, discard, or
    overwrite unrelated work.
5.  If a prerequisite from an earlier task is missing, explain the
    blocker and do not silently implement multiple tasks. Ask for
    permission only when you cannot proceed safely; otherwise make a
    small, clearly documented assumption.
6.  Work in small steps. After implementation, run the relevant build,
    tests, and checks available in the repository. Add or update focused
    tests when appropriate.
7.  Fix issues discovered within the scope of the requested task. Do not
    claim that a check passed unless you actually ran it. Clearly
    distinguish passed, failed, skipped, and unavailable checks.
8.  Keep the solution simple, modular, readable, DRY, and maintainable.
    Avoid unnecessary abstractions, dependencies, and overengineering.
9.  Centralize all user-facing UI text in `src/guitext.ts`. Do not
    hard-code interface text in HTML, TypeScript, CSS-generated content,
    alerts, dialogs, or error messages. Support English, concise Roman
    English and Urdu (see E5).
10. Use only HTML, CSS, TypeScript, and native browser APIs. Do not add
    third-party runtime libraries, frameworks, CDNs, or a backend.
11. Store persistent application data in IndexedDB. Support offline use
    through a PWA/service worker. Do not silently delete or overwrite
    user data.
12. Use synthetic data for tests. Never use real personal/member data as
    test fixtures.
13. At the end of each task, report:
    -   What changed
    -   Files created or modified
    -   Tests/checks actually run and their exact results
    -   Known issues or limitations
    -   Any necessary manual verification
    -   The exact next task number, without starting it
14. **Stop after the requested task.** Wait for my next instruction. Do
    not automatically proceed to the next task.

If I ask for a review or audit instead of implementation, review only
the requested scope and do not make fixes unless I explicitly ask.

------------------------------------------------------------------------

# Project goal

Build a complete, production-quality, mobile-first web application for
managing Jamaat expenses, members, leadership, daily programmes, and
places.

## Technology and deployment constraints

-   HTML, CSS, and TypeScript; native browser APIs only.
-   No third-party runtime libraries, frameworks, CDNs, or backend.
-   Repository: `jamat`.
-   Deployment target: GitHub Pages.
-   Local persistence: IndexedDB.
-   Offline support: PWA and service worker.
-   Backup/restore: JSON export, validation, and restore, with clear
    data-loss warnings.
-   Responsive support: phones, tablets, iPads, laptops, and desktops.
-   Centralized interface text: `src/guitext.ts`, with English, concise
    Roman English and Urdu (right-to-left; see E5).
-   Priorities: correctness, reliable accounting, data safety,
    usability, simplicity, and maintainability.

## Functional scope

### Jamaat and members

-   Create and manage Jamaat details and members.
-   Track member join/leave times and attendance.
-   Handle late arrivals and early departures accurately.
-   Support a permanent Ameer and temporary Ameers for defined periods.
-   Preserve appointment history.
-   Derive the effective Ameer for a given date/time without overwriting
    the permanent appointment.

### Expense management

Support: - Food - General expenses - Transport - Miscellaneous
expenses - Personal treats - Contributions - Advances - Reimbursements -
Settlements - Refunds

Allocation rules: - Food: choose meal-based or duration-based allocation
for each expense. - General expenses: split equally among eligible
members. - Transport: split equally among actual passengers. - Treats:
explicitly classify each treat as personal or a Jamaat expense. - Track
separately who paid, who benefited, who owes money, and who ultimately
bears the cost. - Support cars, bikes, taxis, fuel paid personally or by
Jamaat, and shared transport. - Account for join/leave times and
expense-specific eligibility. - Store money as integer paise. - Handle
rounding deterministically and transparently. - Show a verifiable
calculation breakdown for every allocation. - Prevent duplicate charges,
invalid allocations, and inconsistent settlements.

### Daily programme

-   Provide an editable, reorderable timetable with activities, times,
    locations, and responsible members.
-   Include morning tea, taleem, mulaqaat, rest, breakfast, lunch,
    post-lunch rest/taleem, Asr ki baat, Maghrib ki baat, darmiyani
    baat, umumi baat, zikr, gasht at Asr/Maghrib, gasht ke adaab
    zimmedar, taleem-of-the-day responsible person, welcoming members
    returning from gasht, Tahajjud, Fajr ki, Sunnat ke adaab, Zohar ki
    baat, khidmat persons, and miscellaneous activities.
-   Support drag-and-drop and Move Up/Move Down controls.
-   Preserve manual order independently of chronological time.
-   Warn about overlapping schedules.

### Places and mulaqaat

-   Record place name/type, coordinates, local zimmedar, phone, address,
    and notes.
-   Support masjid, musalla, aashu khana, and other locations.
-   Record mulaqaat at different places.
-   Allow opening a place in an external map service without requiring a
    third-party library.

### Quality requirements

-   Polished, professional interface with clear navigation, accessible
    controls, consistent icons, concise text, and loading, empty, and
    error states.
-   Confirmation for destructive actions.
-   Test expense calculations, time-based eligibility, rounding, Ameer
    appointments, timetable ordering, persistence, backup/restore,
    offline behavior, and responsive layouts.
-   Review security, data integrity, edge cases, performance, and
    complexity.
-   Never silently delete or overwrite user data.

------------------------------------------------------------------------

# Engineering requirements

These requirements apply to every task, including the follow-up tasks
at the end of the plan. Where they are stricter than the sections
above, follow the stricter rule.

## E1. Technology and deployment

-   Use TypeScript, HTML5 and plain CSS3.
-   Host the application on GitHub Pages.
-   Use native browser APIs, including IndexedDB, Service Worker, Web
    Components only if genuinely useful, and native drag-and-drop or
    pointer events.
-   Do not use third-party runtime libraries, UI frameworks, CSS
    frameworks, icon packages, database wrappers or external JavaScript
    dependencies.
-   Use the TypeScript compiler (`tsc`) as a development/build tool.
    Compile TypeScript into browser-compatible JavaScript before
    deployment.
-   No backend or cloud database in the initial release.
-   Store all Jamaat data locally using IndexedDB.
-   Support offline use after the application has been loaded and cached
    successfully.
-   Use relative paths or a configurable base path so the app works on
    GitHub Pages project URLs as well as custom domains.
-   Keep the production output static and suitable for GitHub Pages.

## E2. Performance and optimisation

-   Load only the code required for the current screen where practical.
-   Avoid unnecessary DOM updates and repeated full-page rendering.
-   Cache frequently accessed records in memory only when beneficial.
-   Use IndexedDB indexes for common queries, such as members by Jamaat,
    activities by date and expenses by category.
-   Avoid expensive calculations during typing or dragging.
-   Recalculate expense allocations only when relevant inputs change.
-   Use event delegation where it simplifies repeated event handling.
-   Avoid unnecessary timers, polling and background processing.
-   Keep CSS selectors simple and avoid layout-heavy animations.
-   Do not introduce optimisation complexity without evidence that it is
    needed.
-   Test performance on ordinary mobile devices, not just desktop
    browsers.

## E3. DRY --- Don't Repeat Yourself

-   Keep one reusable function for each shared operation.
-   Use common functions for rendering buttons, forms, dialogs,
    validation messages and status indicators.
-   Keep currency formatting and date/time formatting in shared
    utilities.
-   Use one expense calculation engine for all expense screens and
    reports.
-   Store programme activity types and their labels in a central
    configuration.
-   Keep English and Roman English translations in one central language
    file.
-   Use shared CSS variables for colours, spacing, typography and
    control sizes.
-   Reuse programme templates rather than duplicating the same daily
    timetable.
-   Avoid duplicate business logic between the dashboard, reports and
    member statements.
-   Do not create abstractions merely to avoid a few simple lines of
    code. Prefer clear, straightforward code.

## E4. Simple, readable TypeScript

-   Use descriptive names such as `jamaat`, `member`, `activity`,
    `expense` and `arrivalTime`.
-   Avoid cryptic names, unnecessary abbreviations, deeply nested
    conditions and oversized functions.
-   Keep functions focused on one task.
-   Prefer straightforward control flow over clever one-liners.
-   Define TypeScript interfaces or types for core entities and
    important function inputs/outputs.
-   Enable strict TypeScript checking.
-   Avoid `any`; use explicit types and `unknown` where appropriate.
-   Avoid unnecessary inheritance, dependency injection frameworks,
    factories and complex design patterns.
-   Keep modules organised by actual feature boundaries.
-   Add comments to explain important business rules, not to narrate
    obvious code.
-   Do not duplicate data that can be derived safely from the source
    records.

## E5. Language support: English, Roman English and Urdu

Support exactly three interface languages:

1.  English
2.  Roman English --- English words written in a familiar transliterated
    style used by the intended users.
3.  Urdu --- written in Urdu (Arabic) script and laid out right-to-left
    (RTL).

Reference translations (use these exact forms wherever the English term
appears, and keep other labels in the same style). The Urdu forms are
the proposed standard and must be reviewed by a native reader before
release:

  English              Roman English           Urdu
  -------------------- ----------------------- ----------------
  Daily Programme      Rozana Kaam             روزانہ کام
  Morning Taleem       Subah Ki Taleem         صبح کی تعلیم
  Breakfast            Nashta                  ناشتہ
  Lunch                Dopahar Ka Khana        دوپہر کا کھانا
  Rest                 Aaram                   آرام
  Mulaqaat             Mulaqaat                ملاقات
  Responsible Person   Zimmedar                ذمہ دار
  Temporary Ameer      Aarzi Ameer             عارضی امیر
  Expense              Kharcha                 خرچہ
  Add Member           Member Shamil Karein    ممبر شامل کریں
  Save                 Save Karein             محفوظ کریں
  Cancel               Cancel Karein           منسوخ کریں

General requirements (all languages):

-   Create a central translation file for all user-facing text.
-   Never hard-code interface text inside feature modules.
-   Keep translations concise and consistent.
-   Support changing the language without losing data or resetting the
    current screen.
-   Persist the selected language locally.
-   Use the same translation keys for buttons, labels, dialogs,
    validation errors and reports.
-   Do not translate user-entered names, addresses or personal notes
    automatically.
-   Use English as the fallback when a translation is missing.
-   The language selector offers all three languages, each shown in its
    own script (English, Roman English, اردو).

Urdu and right-to-left requirements:

-   Set `lang="ur"` and `dir="rtl"` on the document (and `lang`/`dir`
    attributes on any mixed-direction fragment) whenever Urdu is
    selected; English and Roman English use `lang` `en`/`ur-Latn` and
    `dir="ltr"`. Switching language changes direction without a reload
    and without losing the current screen or unsaved input.
-   Build layouts with CSS logical properties (`margin-inline`,
    `padding-inline`, `inset-inline`, `text-align: start`, logical
    borders and radii) and flex/grid flow instead of hard-coded
    left/right, so one stylesheet serves both directions. Mirror
    direction-dependent visuals (arrows, back/forward, progress, drag
    handles, bottom-bar order, side navigation, toasts, dialogs); keep
    non-directional icons (home, delete, check) unmirrored.
-   Fonts: use a system font stack with a good Urdu fallback (prefer a
    Nastaliq-capable system font where available, otherwise a readable
    Naskh); no web fonts, no CDNs. Use generous line height for Urdu
    text and verify nothing is clipped.
-   Bidirectional content: user-entered names, addresses, phone numbers,
    amounts, dates and times can mix scripts. Isolate them with `<bdi>`
    or `dir="auto"` so punctuation, numbers and Latin text do not
    reorder surrounding Urdu text; keep phone numbers and amounts
    readable left-to-right.
-   Numbers, dates and currency: format through the shared utilities
    using the Intl API with a locale per language (Urdu locale for
    month/day names and grouping). Use one documented digit style
    (default: Western digits 0-9, as on the keypad and in money
    fields); input fields accept Western digits and normalise Eastern
    Arabic/Urdu digits typed by the user. Money stays integer paise.
-   Sorting and search of names should use locale-aware comparison for
    the active language.
-   Roman English and Urdu are separate languages with separate text;
    do not machine-transliterate between them at runtime.
-   Tests and checks: every translation key exists in all three
    languages (compile-time) with the English runtime fallback; the UI
    audit (`npm run audit:ui`) also runs in Urdu/RTL (no horizontal
    overflow, no clipped text, tap targets, contrast, focus order
    following RTL reading order); unit tests cover bidi-safe formatting
    of mixed content, digit normalisation, and direction switching.

## E6. Reorderable daily timetable

Every day's programme must support reordering activities.

-   Allow users to move an activity up or down.
-   Support drag-and-drop on devices that provide a suitable pointer or
    touch interaction.
-   Provide accessible Move Up and Move Down controls as an alternative
    to dragging.
-   Store the activity's explicit order in IndexedDB.
-   Preserve the order after refresh, restart and offline use.
-   Allow activities to have start and end times independently of their
    display order.
-   Warn about chronological inconsistencies without automatically
    rearranging the user's chosen order.
-   Warn when a member has overlapping responsibilities.
-   Allow users to copy, edit and reuse daily programme templates.
-   Do not overwrite a customised day when applying a template without
    confirmation.

The display order and scheduled time are separate fields. This allows
users to arrange the programme in the order they want while still seeing
timing conflicts.

## E7. Temporary Ameer

Support both a permanent Ameer and a temporary Ameer.

-   Select the permanent Ameer from the Jamaat's members.
-   Allow an authorised user to appoint a temporary Ameer.
-   Record the temporary Ameer, start date/time, end date/time and
    optional reason.
-   Allow a temporary appointment to be ended early.
-   Show clearly who is currently responsible.
-   Display scheduled future appointments when relevant.
-   Preserve the history of all appointments and changes.
-   Prevent invalid overlapping temporary appointments unless explicitly
    supported by a documented rule.
-   Do not overwrite the permanent Ameer when appointing a temporary
    one.
-   Restore the permanent Ameer automatically when the temporary
    appointment ends.
-   Handle temporary appointments that cross midnight or the end of a
    scheduled day.
-   Allow a temporary Ameer to be changed without altering expense
    records or programme assignments.

The permanent Ameer and temporary appointment must be stored
separately. The current effective Ameer should be derived from the
permanent appointment and the active temporary appointment, rather than
duplicated across multiple records.

## E8. Local data integrity

-   Use IndexedDB for structured data and transactions.
-   Store monetary values as integer paise.
-   Validate records before saving.
-   Use stable IDs for Jamaats, members, activities, places, expenses
    and appointments.
-   Preserve financial history when correcting posted expenses.
-   Provide complete JSON backup and restore.
-   Validate imported backups before changing existing data.
-   Version the local database schema and provide migrations.
-   Never silently discard existing records during a schema update.
-   Clearly explain that device-local data does not automatically
    synchronise between devices.

## E9. Avoid overengineering

-   Build only the modules required by the agreed requirements.
-   Prefer a small number of clear modules over a complicated
    architecture.
-   Do not add a backend, user account system, cloud synchronisation or
    third-party services in the first release.
-   Do not introduce state-management libraries, routing libraries, form
    libraries or component libraries.
-   Use a simple application router only if multiple screens require it.
-   Avoid speculative features and premature performance optimisation.
-   Do not create multiple layers that merely pass data through
    unchanged.
-   Keep the calculation engine separate because financial correctness
    and testing genuinely require that separation.

## E10. Quality gates

Before considering a feature complete:

-   TypeScript compiles without errors.
-   No new TypeScript `any` types are introduced without explicit
    justification.
-   Existing data survives refresh and browser restart.
-   The feature works offline where its functionality does not require
    an external service.
-   English and Roman English both work.
-   The interface works on mobile, tablet and desktop.
-   The relevant calculation and validation tests pass.
-   No third-party runtime dependencies are added.
-   The code remains readable and uses existing shared functions instead
    of duplicating logic.
-   GitHub Pages deployment works under the actual published URL.
-   Existing features are not removed or broken by the change.

## E11. Recommended project structure

Keep the structure small and feature-oriented:

-   `index.html` --- application entry point
-   `css/` --- reset, shared styles, layout and responsive styles
-   `src/app.ts` --- application initialisation
-   `src/types.ts` --- core data types
-   `src/database.ts` --- IndexedDB operations
-   `src/i18n.ts` --- language selection and translation
-   `src/utils/` --- dates, currency and common utilities
-   `src/features/jamaat.ts` --- Jamaat and Ameer management
-   `src/features/members.ts` --- members and attendance
-   `src/features/programme.ts` --- daily timetable and assignments
-   `src/features/places.ts` --- destinations and local contacts
-   `src/features/mulaqaat.ts` --- visit planning and follow-up
-   `src/features/expenses.ts` --- expense entry and ledger
-   `src/features/calculations.ts` --- expense allocation engine
-   `src/features/backup.ts` --- backup and restore
-   `public/sw.js` --- offline application caching
-   `public/manifest.json` --- PWA metadata
-   `tests/` --- calculation, storage and workflow tests

Adjust the structure if the actual implementation proves that fewer
files would be clearer. Do not create empty modules or unnecessary
abstractions simply to match this list. (The current repository layout
--- `src/model`, `src/domain`, `src/db`, `src/features/<module>`,
`src/ui`, `src/backup`, generated `manifest.webmanifest`, `src/sw.ts` ---
is an accepted adjustment and is documented in `README.md`; do not
reorganise it merely to match this list.)

## Final engineering principle

Build the simplest application that correctly satisfies the
requirements. Prioritise correctness, readable TypeScript, local data
safety, fast interaction and ease of future maintenance over
architectural complexity.

------------------------------------------------------------------------

# Sequential implementation plan

Complete these tasks in order, **one task per explicit request**. The
plan is deliberately staged so the application can be tested as it
grows.

## Task 1 --- Repository inspection and implementation plan

-   Inspect the complete repository structure, current Git status,
    existing files, scripts, and any existing implementation.
-   Identify the current toolchain and available build/test commands
    without adding dependencies.
-   Check whether the repository is empty or already contains work.
-   Propose a concise architecture and file structure that satisfy the
    constraints above.
-   Identify GitHub Pages requirements, including base paths for a
    project site named `jamat`.
-   Record assumptions, risks, and a task-by-task implementation plan.
-   **Do not implement application features or make broad changes.**
    Only create a brief project plan document if needed and appropriate.
-   Report findings and stop.

## Task 2 --- Minimal app shell and project-site setup

-   Establish or adapt the simplest working HTML/CSS/TypeScript
    structure based on Task 1 findings.
-   Ensure paths and asset references work when hosted under the GitHub
    Pages project path for `jamat`, not just at a domain root.
-   Add the minimum build/serve configuration needed, using no
    third-party runtime libraries or frameworks. Do not add a dependency
    merely for convenience.
-   Create the responsive application shell, page layout, navigation,
    and a consistent design foundation.
-   Keep pages/features as simple placeholders only where later tasks
    will implement them.
-   Verify the app can be built and opened locally. Do not implement
    later task functionality.

## Task 3 --- Centralized UI text, language selection, and shared UI patterns

-   Create `src/guitext.ts` as the single source for all user-facing UI
    strings.
-   Support English and concise Roman English with a simple language
    selection mechanism.
-   Use concise labels wherever practical; avoid repeating context
    already obvious from the current page.
-   Establish reusable native UI patterns for buttons, forms,
    dialogs/confirmations, icons, empty states, loading states, and
    error states.
-   Ensure accessible labels, keyboard operation, focus visibility, and
    consistent icon sizing/interaction.
-   Verify no newly implemented UI text is hard-coded outside the
    central text file.

## Task 4 --- Data model, IndexedDB, and safe persistence foundation

-   Define simple, typed data models and validation for Jamaat, members,
    Ameer appointments, expenses, allocations, programme activities,
    places, and mulaqaat records.
-   Design a minimal IndexedDB layer using native browser APIs.
-   Add versioned database initialization and safe schema upgrades.
-   Handle unavailable storage, transaction failures, malformed records,
    and database errors clearly.
-   Do not create fake production records or silently reset a database.
-   Add focused tests for model validation and persistence where the
    repository supports testing.

## Task 5 --- Jamaat profile and member management

-   Implement creating, viewing, editing, and safely deleting a Jamaat
    profile and member records.
-   Record member details, join/leave date and time, and attendance.
-   Correctly represent late arrivals and early departures.
-   Validate dates, times, required fields, and duplicate or conflicting
    records.
-   Persist changes through the IndexedDB layer.
-   Add confirmation for destructive actions and tests for member
    eligibility boundaries.

## Task 6 --- Permanent and temporary Ameer appointments

-   Support a permanent Ameer and temporary Ameer appointments with
    defined start/end dates and times.
-   Preserve appointment history and never replace the permanent
    appointment with a temporary one.
-   Derive the effective Ameer for a requested date/time using explicit,
    documented rules.
-   Validate overlapping, missing, or invalid appointment periods and
    define deterministic boundary behavior.
-   Add tests for appointment history, temporary appointment
    transitions, and edge cases.
-   Do not begin other leadership features beyond this scope.

## Task 7 --- Expense records and money representation

-   Implement expense creation, editing, viewing, and safe deletion.
-   Support food, general, transport, miscellaneous, personal treats,
    contributions, advances, reimbursements, settlements, and refunds.
-   Store all monetary values as integer paise; avoid floating-point
    money arithmetic.
-   Record dates, descriptions, category, payer, payment source, and
    relevant participants.
-   Validate amounts and required fields; prevent accidental duplicate
    submissions where possible.
-   Build a clear expense list and detail view, including empty/error
    states.
-   Allocation logic is implemented in Task 8; do not invent incomplete
    allocations here.

## Task 8 --- Allocation engine and transparent expense calculations

-   Implement a pure, testable allocation engine independent of the UI.
-   Food expenses must support meal-based or duration-based allocation
    per expense.
-   General expenses must be split equally among eligible members.
-   Transport expenses must be split equally among actual passengers.
-   Personal treats must explicitly identify whether the cost is
    personal or a Jamaat expense.
-   Track payer, beneficiary, amount owed, and final cost-bearer as
    separate concepts.
-   Respect member join/leave times and expense-specific eligibility.
-   Use deterministic paise rounding and document how remainder paise
    are assigned.
-   Show calculation breakdowns that can be independently checked.
-   Prevent duplicate charges, ineligible allocations, negative/invalid
    shares, and inconsistent totals.
-   Add thorough tests for normal cases, boundary times, empty groups,
    rounding, and invalid inputs.

## Task 9 --- Contributions, advances, reimbursements, settlements, and refunds

-   Implement the lifecycle and relationships for contributions,
    advances, reimbursements, settlements, and refunds.
-   Define and enforce clear rules for balances and status transitions.
-   Prevent double settlement, duplicate refunds, overpayment, and
    contradictory ledger entries.
-   Keep an auditable record of changes and link records to their
    relevant expenses or members where applicable.
-   Ensure all calculations use integer paise and reconcile totals.
-   Add tests for partial payments, repeated actions, refunds, and
    inconsistent states.
-   Do not silently rewrite historical financial records.

## Task 10 --- Daily programme and timetable

-   Implement editable activities with start/end times, locations,
    responsible members, and other necessary details.
-   Include all programme activities listed in the project scope, while
    allowing users to add, edit, and remove activities.
-   Support drag-and-drop reordering and accessible Move Up/Move Down
    controls.
-   Preserve manual display order independently of time order.
-   Detect and warn about overlapping schedules without automatically
    rearranging user choices.
-   Persist the timetable and verify ordering, time validation, and
    overlap detection with tests.

## Task 11 --- Places, locations, and mulaqaat

-   Implement place management for masjid, musalla, aashu khana, and
    custom place types.
-   Store name/type, coordinates, local zimmedar, phone, address, and
    notes.
-   Support recording mulaqaat at different places, with relevant
    people, time, and notes.
-   Validate coordinates and optional contact details.
-   Provide a safe external-map link when usable coordinates or an
    address exist. Do not add a map library or expose a third-party API
    key.
-   Add tests for validation, persistence, and external-link
    construction.

## Task 12 --- Summary views and navigation integration

-   Connect completed modules through consistent navigation.
-   Add useful summaries such as expense totals, contributions,
    outstanding balances, member counts, and upcoming/current programme
    information where supported by the existing data.
-   Ensure summary values derive from the underlying records and
    allocation engine; do not duplicate financial business logic in UI
    components.
-   Provide useful empty states when no data exists.
-   Check navigation on narrow and wide screens.
-   Do not add speculative features outside the stated project scope.

## Task 13 --- JSON backup, validation, restore, and data safety

-   Implement JSON export of the complete supported application data.
-   Implement import preview and validation before any restore changes
    data.
-   Reject malformed, unsupported, inconsistent, or dangerous input with
    clear errors.
-   Explain that restoring may replace or merge local data, and make the
    chosen behavior explicit before the user confirms.
-   Never silently overwrite existing data. Prefer a safe, validated
    restore flow with a clear warning and confirmation.
-   Preserve schema/version information and handle supported version
    differences deliberately.
-   Test export/import round trips, malformed files, invalid values,
    duplicate identifiers, and restore failures.
-   Explain that browser-local data is not automatically shared across
    devices.

## Task 14 --- PWA and offline behavior

-   Add a web app manifest and service worker using native browser
    capabilities.
-   Configure caching conservatively for the GitHub Pages project path.
-   Ensure the app shell works offline after it has been loaded and
    cached, and IndexedDB data remains available offline.
-   Handle service-worker update behavior without unexpectedly
    discarding user work.
-   Avoid caching strategies that could trap users on stale application
    code or corrupt local data.
-   Verify service-worker registration paths for the `jamat` project
    site and test offline behavior as far as the available environment
    permits.
-   Clearly report any offline checks that require manual browser
    testing.

## Task 15 --- Accessibility, responsive design, and interaction audit

-   Review phone, tablet, iPad, laptop, and desktop layouts.
-   Check overflow, touch target sizes, forms, dialogs, focus order,
    keyboard access, contrast, and readable text.
-   Ensure destructive actions have confirmations and all loading,
    empty, success, and error states are understandable.
-   Standardize icon size, color, hover/active behavior, and clickable
    areas.
-   Keep UI wording concise and centralized in `src/guitext.ts`.
-   Fix issues found within this task and report any manual checks that
    could not be completed.

## Task 16 --- Accounting, data-integrity, and security audit

-   Audit the entire implemented application for accounting correctness,
    time boundaries, rounding, duplicate records, invalid transitions,
    and inconsistent balances.
-   Review input validation, imported JSON, DOM updates, URL
    construction, local storage exposure, and accidental data loss
    risks.
-   Check for duplicated business logic, unnecessary complexity,
    performance problems, dead code, and incomplete features.
-   Add or improve tests for discovered defects and fix them within
    scope.
-   Do not claim the app is secure or production-ready without stating
    what was actually verified.
-   Do not add external services or libraries.

## Task 17 --- Final verification and GitHub Pages deployment instructions

-   Run all available build, test, type-check, and lint commands. Report
    exact commands and results.
-   Verify that generated asset paths work under the GitHub Pages
    project URL for repository `jamat`.
-   Review the repository for unfinished placeholders, broken
    navigation, missing UI text localization, console errors, and
    accidental dependencies.
-   Summarize completed features, limitations, and manual tests still
    required.
-   Provide exact GitHub repository settings and deployment steps for
    GitHub Pages, including the appropriate branch/folder or Actions
    workflow based on the repository setup.
-   Explain how to use JSON backup/restore and the risks of
    browser/device-local storage.
-   Do not claim successful deployment unless it was actually performed
    and verified.
-   Stop after reporting the final results.

------------------------------------------------------------------------

# Follow-up tasks (conformance with the engineering requirements)

Tasks 1--17 are implemented (see `README.md` and `docs/AUDIT.md`). The
tasks below close the gaps found when the implementation was reviewed
against the Engineering requirements (E1--E11). The same rules apply:
one task per explicit request, stop after each task, report per rule 13.

## Recommended order

Implement the follow-up tasks in numeric order. The order is deliberate:

1.  **Task 18 (languages: Roman English alignment and Urdu text)** first:
    it changes text and the language-switch behaviour (and adds the
    third language and direction switching), and settles *how screens
    re-render* before more screens are built or restyled.
2.  **Task 19 (UI revamp)** next and **before** any new screens: it
    defines the design system (tokens, glass surfaces, components) that
    Tasks 20 and 21 will reuse, and makes it right-to-left ready (logical
    CSS properties, mirrored icons) so Urdu looks right from the start.
    Building their forms and views first would mean restyling them
    twice.
3.  **Task 20 (per-day programme and templates)** is the largest UI-facing
    data change (migration v3); build it on the new design system.
4.  **Task 21 (Ameer completion, mulaqaat planning, member statement,
    Ameer-at-date lookup)** adds smaller features on the settled design
    system.
5.  **Task 22 (attendance with temporary absences)** changes the
    eligibility and allocation engine and the member data shape (another
    migration); do it before the integrity task so Task 23 and the
    statement view are verified against the final presence model.
6.  **Task 23 (data-integrity follow-ups)** closes the remaining
    accounting and consistency gaps (near-duplicates, legacy
    participants, the reserved `allocations` store, transactional
    concurrency checks) once the data model has stopped changing.
7.  **Task 24 (performance)** after the screens, the heavier glass-effect
    styling and the data model are final: lazy loading, delegation and
    measurements only make sense then. It also checks that the Task 19
    visuals stay smooth on ordinary phones.
8.  **Task 25 (release readiness)** last: reproducible build, CI gates,
    the manual release checklist and the verified deployment.

Each task still needs its own explicit request.

## Known gaps register

Every gap identified in the reviews of the implementation, and where it
is closed. Update this table when a gap is closed or a new one is found.

  Gap                                                        Closed by
  ---------------------------------------------------------- ---------------
  Roman English wording differs from the E5 reference        Task 18
  No Urdu / right-to-left support                            Task 18, 19
  Language switch can lose the screen or typed input         Task 18
  No runtime English fallback for a missing translation      Task 18
  Locale, language tag and separators hard-coded in code     Task 18
  Glass UI revamp; RTL-ready layout                          Task 19
  Programme has no per-day timetable                         Task 20
  No programme templates (copy, edit, apply with confirm)    Task 20
  No per-member responsibility-overlap warning               Task 20
  No activities-by-date index                                Task 20
  No optional reason on Ameer appointments                   Task 21
  No "End now" for temporary appointments                    Task 21
  Mulaqaat is past-only (no planning/follow-up)              Task 21
  No per-member statement                                    Task 21
  Ameer shown for "now" only (no lookup at a chosen time)    Task 21
  Attendance is one join/leave interval (no absences)        Task 22
  Only exact duplicate expenses are caught                   Task 23
  Legacy expenses still resolve participants dynamically     Task 23
  Reserved `allocations` store is never written              Task 23
  Concurrency check is not inside the write transaction      Task 23
  Everything loaded up front; no event delegation            Task 24
  Missing indexes (expenses by category)                     Task 24
  No measurement on real mobile hardware                     Task 24, 25
  Build depends on a global `tsc`; no lockfile               Task 25
  Browser smoke/audit are advisory in CI                     Task 25
  Manual device checks and translation review not done       Task 25
  Latest build not yet deployed and verified live            Task 25

Accepted (out of scope unless explicitly requested): encrypted
backups, user accounts, cloud sync, any backend, and HTTP security
headers that GitHub Pages cannot set (for example `frame-ancestors`).

## Task 18 --- Languages: Roman English alignment, Urdu and language switching

-   Replace the Roman English wording so every term in the E5 reference
    table uses exactly the specified form (Rozana Kaam, Subah Ki
    Taleem, Nashta, Dopahar Ka Khana, Aaram, Zimmedar, Aarzi Ameer,
    Kharcha, Member Shamil Karein, Save Karein, Cancel Karein), and make
    the remaining Roman English labels consistent with that style.
-   Add Urdu (Arabic script) as the third language in `src/guitext.ts`:
    every key translated, using the E5 reference forms, concise and
    consistent; extend the language type, selector (each language shown
    in its own script), persisted preference and tests. Mark the Urdu
    text for native-reader review in the report.
-   Add direction handling: set `lang`/`dir` on the document when the
    language changes (`ur` + `rtl` for Urdu), without a reload.
-   Add Urdu-aware formatting in the shared utilities: Intl locale per
    language for dates/numbers, one documented digit style, digit
    normalisation for input, locale-aware name sorting, and bidi-safe
    rendering (`<bdi>`/`dir="auto"`) of names, phone numbers and amounts.
-   Make changing the language preserve the current screen and any
    unsaved form input: update text in place (or re-render while
    restoring field values, selection, scroll position and focus)
    instead of asking the user to discard changes.
-   Add the runtime English fallback for a missing translation while
    keeping the compile-time completeness check.
-   Full right-to-left *layout* polish is finished in Task 19 together
    with the redesign; in this task make the app usable and
    non-broken in Urdu (no overflow, no clipped text) with the existing
    styles.
-   Close the formatting-literal gap: no locale name, language tag or
    label separator (for example `": "`, `" · "`) may be hard-coded outside
    the shared utilities and `src/guitext.ts`; the initial `<html lang>`
    and direction are set from the saved language before first paint.
-   Add tests for the reference translations in all three languages, the
    fallback, direction switching, digit normalisation, bidi-safe
    formatting, and language switching with a half-filled form.

## Task 19 --- UI revamp with a glassmorphism design system

Goal: a polished, modern, mobile-first look with glassmorphism, without
sacrificing readability, accessibility, offline use or performance. This
is a visual and interaction change only: no business rules, data model
or stored data change, and no feature is removed.

-   **Design tokens first (E3):** extend the shared CSS variables for
    colour (light and dark), glass surfaces (fill opacity, blur radius,
    border, shadow), spacing, radius, typography scale, control height,
    elevation and motion. All components use the tokens; no one-off
    colours or sizes in component rules.
-   **Glass surfaces:** translucent fills with `backdrop-filter` blur, a
    thin light border and soft shadow for the top bar, navigation (bottom
    bar on phones, side rail on wider screens), cards, dialogs, toasts,
    the update banner and the skip link; a calm layered background made
    only from CSS gradients (no images, no fonts or icon packages, no
    external requests).
-   **Hierarchy and polish:** clear visual hierarchy on every screen
    (Home summary cards, lists, detail views, forms, tables, empty,
    loading and error states), consistent icon size and stroke, refined
    buttons (primary, secondary, danger, icon-only), inputs, selects,
    checkboxes, badges and chips, with restrained, short transitions.
-   **Accessibility is not negotiable:** text on glass must still meet
    WCAG AA contrast measured against the *worst* background behind it;
    use a more opaque fill for text-heavy surfaces if needed. Keep
    visible focus rings, 44 px touch targets, and the existing keyboard
    behaviour. Provide fallbacks: a solid, opaque surface when
    `backdrop-filter` is unsupported (`@supports`), under
    `prefers-reduced-transparency`, `forced-colors`, and a reduced-motion
    variant of every animation.
-   **Performance guardrails (E2):** limit the number of simultaneously
    blurred layers (blur container surfaces, not every list row), avoid
    layout-heavy animations, keep blur radii modest, and verify scrolling
    and interaction stay smooth with a throttled CPU profile; drop or
    reduce blur on low-end conditions if the measurement requires it.
-   **Responsive:** verify phones (including 320 px), tablets, iPad,
    laptop and desktop layouts, light and dark mode, and all three
    languages.
-   **Right-to-left ready (E5):** write every new rule with CSS logical
    properties, mirror directional icons and glass edge highlights/shadows
    for RTL, keep the gradient background direction-neutral, and make the
    bottom bar, side rail, dialogs, toasts and form layouts correct in
    Urdu; run `npm run audit:ui` in Urdu/RTL as well as LTR with zero
    errors, and add before/after screenshots in Urdu.
-   Keep all UI text in `src/guitext.ts`; do not add third-party
    libraries; keep the CSS selectors simple and the stylesheet organised
    (tokens, base, layout, components).
-   Tests/checks: update `npm run audit:ui` expectations if needed (it
    must still report zero errors, including contrast and tap targets),
    keep `npm run smoke:ui`, unit tests and `check:dist` green, and
    capture before/after screenshots at the main breakpoints for review.
-   Report any visual checks that need a real device (blur rendering,
    iOS Safari, low-end Android).

## Task 20 --- Per-day programme and templates

-   Give programme activities a date so each day has its own timetable;
    add an IndexedDB index by Jamaat and date and a schema migration
    (v3) that moves existing activities onto a default day without
    losing any record.
-   Add reusable programme templates: save a day as a template, copy a
    template onto a day, and edit templates.
-   Applying a template to a day that already has customised
    activities must ask for confirmation and must never overwrite
    silently (offer replace, append or cancel).
-   Warn when the same member has overlapping responsibilities, in
    addition to the existing activity-overlap warning, without
    rearranging anything.
-   Keep one central configuration for programme activity types and
    their labels.
-   Update backup/restore, summaries and the home view for per-day data;
    add tests for migration, ordering per day, template apply modes and
    responsibility overlaps.

## Task 21 --- Ameer appointment completion and mulaqaat planning

-   Add an optional reason to Ameer appointments (migration if the
    stored shape changes) and show it in the history.
-   Add an "End now" action that ends a temporary appointment early
    without deleting it, keeping the history; add tests for ending
    early, future appointments and crossing midnight.
-   Support visit planning and follow-up for mulaqaat: planned versus
    done status, a follow-up note/date, and a view of upcoming planned
    visits; existing recorded meetings stay valid.
-   Add a per-member statement view (what the member paid, owes, is owed
    and bears) derived from the existing ledger and allocation engine
    without duplicating financial logic.
-   Add an "Ameer at a chosen date and time" lookup (the derivation
    already exists and is tested; the UI currently only shows "now"),
    showing which appointment applies and whether it is permanent or
    temporary.

## Task 22 --- Attendance with temporary absences

-   Let a member have several presence periods (or absences within the
    Jamaat period), for example leaving for gasht or a short trip and
    returning, instead of a single join/leave interval; a member with no
    absences behaves exactly as today.
-   Update the eligibility rules and the allocation engine so meal-based
    and duration-based food splits, equal splits, transport and Ameer
    eligibility use the member's actual presence at the relevant moment
    or window, with the same half-open boundary rules and the same
    deterministic rounding; keep the engine pure and independent of the UI.
-   Add a schema migration that converts every existing member to the new
    shape without changing any existing allocation or balance (prove it
    with before/after tests on realistic synthetic data); update
    validation, backup/restore (old backups still import) and summaries.
-   Show late arrivals, early departures and absences clearly in the
    member views; prevent overlapping or out-of-period absences.
-   Add thorough tests: boundaries, back-to-back absences, an absence
    covering a whole meal, expenses spanning an absence, empty groups,
    migration, and backup round trips.

## Task 23 --- Data-integrity follow-ups

-   **Near-duplicate expenses:** warn (with an explicit "save anyway"
    confirmation) when a new expense closely matches an existing one
    (same payer, category and amount within a short time window or with
    a similar description), in addition to the existing exact-duplicate
    refusal.
-   **Legacy participants:** add a migration that resolves and stores the
    participant list of expenses saved before it was stored, so no
    historical split can change when members are added or edited; prove
    that every existing allocation and balance is unchanged.
-   **Reserved `allocations` store:** decide and implement one of (a)
    persist the calculated split as an immutable snapshot used by the
    ledger and statements, or (b) remove the unused store, model and
    validator through a safe migration and a backward-compatible backup
    format; document the decision.
-   **Concurrent edits:** perform the "record unchanged since opened"
    check inside the same IndexedDB transaction as the write for every
    record type (not only expenses), so two tabs can never overwrite each
    other.
-   Keep the audit log, backup/restore and offline behaviour intact; add
    tests for each item, including failure injection.

## Task 24 --- Performance conformance

-   Load feature modules on demand per screen (dynamic `import()` of the
    compiled modules) and include them in the service-worker precache so
    offline use is unaffected.
-   Avoid full-view re-rendering where a targeted update is enough, use
    event delegation for repeated rows, and add the missing IndexedDB
    indexes (for example expenses by category).
-   Measure on ordinary mobile hardware (or a throttled CPU/network
    profile where no device is available), record the measurements, and
    optimise only where the evidence shows a need.
-   Re-run all checks, the UI audit and the offline smoke test; report
    what could only be verified on real devices.

## Task 25 --- Release readiness

-   **Reproducible build:** pin the TypeScript compiler as a build-time
    `devDependency` with a lockfile (no runtime dependencies) and make
    `npm ci` plus the documented commands produce the same output
    locally and in CI.
-   **CI gates:** make the unit tests, type-check, text check, build and
    dist check block deployment (already the case); promote the browser
    smoke test and UI audit (LTR and RTL) to blocking once they are
    demonstrated stable in CI, or document why they stay advisory.
-   **Release checklist:** a short, maintained list of the manual checks
    that automation cannot do (install the PWA on Android and iOS and use
    it in airplane mode, touch drag-and-drop, screen reader pass in all
    three languages, native-reader review of the Roman English and Urdu
    text, restoring a backup on a second real device, real-device
    performance), with space to record who did them and when.
-   **Final verification and deployment:** run every check, push, confirm
    the GitHub Actions deployment is green, run `npm run verify:live`
    against the published URL, and report exact results; update
    `README.md`, `PLAN.md` and `docs/AUDIT.md`. Do not claim a deployment
    that was not verified.

------------------------------------------------------------------------

# Definition of done

The application is complete only when all tasks (including the
follow-up tasks 18--25) have been explicitly requested and completed,
the available checks have been run, every entry in the known gaps
register is closed or explicitly accepted, and remaining limitations
are reported honestly. A task is not complete
merely because its UI exists: relevant data must persist, calculations
must be correct, errors must be handled, and tests must be run where
possible.

**Reminder:** I control the sequence. Complete only the task I
explicitly request, then stop and wait.
