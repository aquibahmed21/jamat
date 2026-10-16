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
    alerts, dialogs, or error messages. Support English and concise
    Roman English.
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
-   Centralized interface text: `src/guitext.ts`, with English and
    concise Roman English.
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

# Definition of done

The application is complete only when all tasks have been explicitly
requested and completed, the available checks have been run, and
remaining limitations are reported honestly. A task is not complete
merely because its UI exists: relevant data must persist, calculations
must be correct, errors must be handled, and tests must be run where
possible.

**Reminder:** I control the sequence. Complete only the task I
explicitly request, then stop and wait.
