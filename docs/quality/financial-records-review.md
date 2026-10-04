# Financial records review decisions

Read-only independent review of 4d067f0..6f76ad3 by a fresh GPT-6 Astra reviewer. No Critical findings; five Important client findings were fixed in one test-driven pass. No second review was dispatched. Final automated verification: 170 Flutter tests, 28 Functions tests, 14 rules/emulator tests and clean Flutter analysis.

## Decisions and retained scope

- Task 1: Ruling: The draft edit payload omitted principal/currency/direction/origination/interest fields although the financial spec allows correction before payment history — extend edit payload to the create terms plus obligationId/expectedRevision, lock principal/currency/direction/origination/contact after any payment history, preserve original occurrence identity — if wrong, an edited unpaid loan could misstate liability; ledger/instance conservation and history-lock regression tests cover the change.

- Final: minor (deferred): Payment editor lacks a live integer-money “After this payment” remaining-balance preview; retain for later UI completion.

- Final: Ruling: Parent timezone snapshot added to support current due labels without one instance query per list row — copy the same verified instance zone at creation and retain it through profile/term changes; no live canonical financial data has been deployed — if wrong or later migrated from a profile instead of the original instance, due-day classification can drift.

- Final: Ruling: Finite installments and multi-period allocation remain M3 — complete them before declaring the MVP launched — if omitted, users cannot track finite repayment schedules.

- Final: Ruling: Dashboard projection freshness/repair and original dashboard panels remain M3 — preserve canonical revision guards and finish the accepted visual reference next — if omitted, overview totals/design remain incomplete.

- Final: Ruling: Full activity presentation, standalone payment routes and effective-history grouping continue with M3/M7 UI work — existing immutable M2 history remains usable and traceable — if omitted, history is harder to interpret or navigate.

- Final: Ruling: Recurrence, variable periods, lifecycle and automatic confirmation/failure processing remain M4 — all are required before launch — if omitted, bills/deductions cannot be tracked correctly.

- Final: Ruling: Calendar/search/filter planning, reminder inbox and remote/local notifications remain M5 — all are required before launch — if omitted, upcoming payments/reminders stay incomplete.

- Final: Ruling: Private attachment reservation/upload/finalization remains M6 — do not open Storage access ahead of that verified boundary — if omitted, evidence cannot be attached; opening rules early risks exposure.

- Final: Ruling: Durable owner-bound offline queues and restart/cross-session recovery remain M6 — this fix retains in-flight retry identity within the current UID session only — if omitted, disconnected or restarted saves are not durable.

- Final: Ruling: Protected deletion, broad accessibility/native validation and operational hardening remain M7 — current responsive flows are tested, remaining release gates still apply — if omitted, account lifecycle/platform/operational behavior may fail.

- Final: Ruling: Live deployment, region/billing, deployed indexes and real App Check/OAuth/native validation remain M8 and associated platform gates — public hosting is still the earlier preview, not a completed financial launch — if skipped, the app can be unusable or unprotected live.

- Final: Ruling: Banking execution, FX conversion, budgeting/shared settlement and calculated interest accrual stay excluded — user asked for obligation tracking and informational interest in the MVP — if that boundary is wrong, users may expect money movement/conversion that Tally does not perform.

- Final: fixed cached picker truncation — cached_empty_choices_reconcile_with_live_server_page RED→GREEN; suite 170 Flutter /28 Functions /14 emulator-rules all green, analyzer clean.

- Final: fixed modal dismissal/nested-picker/uncertain-ID loss — submitting_payment_cannot_be_dismissed and uncertain_command_retains_identity_after_listeners_leave RED→GREEN; suite 170/28/14 green.

- Final: fixed opposite creation intent retention — existing_new_route_lend_borrow_lend regression RED→GREEN; suite 170/28/14 green.

- Final: fixed frozen overdue labels — saved_zone_status_and_rollover, clock_rollover_resume and server_parent_zone_snapshot RED→GREEN; suite 170/28/14 green.

- Final: fixed lost document cache provenance — cached_detail_metadata_only_transition RED→GREEN; suite 170/28/14 green.
