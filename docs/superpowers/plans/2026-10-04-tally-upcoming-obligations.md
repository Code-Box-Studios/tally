# Tally upcoming obligations implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make finite installment schedules, current currency-separated dashboard totals, upcoming obligations, contact positions and activity useful with the original Lavish dashboard design.

**Architecture:** Extend the existing trusted command/immutable payment boundary to bounded finite schedules. Server projections scan canonical inputs in pages, publish only against unchanged ledger/profile context, and expose freshness explicitly. Dart repositories supply typed bounded streams; presentation never calls Firebase.

**Tech Stack:** Existing Flutter/Riverpod/go_router/FlutterFire, TypeScript Firebase Admin/Functions v2, Node 22/JDK 21 and demo-tally emulators.

**Spec:** docs/superpowers/specs/2026-10-03-tally-design.md; docs/architecture/financial-engine.md, docs/architecture/firebase.md, docs/product/experience.md and .lavish/tally-design.{html,css,js}. This implements M3; recurrence/automatic processing, full calendar/search/reminders, attachments/offline, production hardening and release remain M4–M8.

## Global Constraints

- Work directly on main; preserve unrelated .ignore. Incremental implementation and eventual web deployment are authorized. No repeated plan approval gate.
- Retain M1/M2 owner/session/App Check fences, exact command envelope, immutable history, permanent idempotency receipts, revisions and staged all-reads-before-writes transactions.
- Seven currencies with integer minor units. Positive individual financial values <=1_000_000_000_000; aggregate absolute values <=9_007_199_254_740_991. No exchange conversion or mixed-currency sum.
- Civil dates YYYY-MM-DD, 1900–2199. Existing instance timezone snapshots survive profile timezone changes. Manual overdue starts the next local day.
- Finite installment schedules contain 2–120 instances; scheduled amounts sum exactly to principal. A payment allocates to at most 24 instances of one obligation/currency. Automatic earliest-due allocation is ordered by dueDate then ID; explicit selection is supported.
- Recurring templates have no lifetime balance. Projection code accepts future recurring instances with unknown amounts and shows their counts separately; it never treats unknown as a complete zero total.
- Dashboard remaining for this month comes from due-period remaining, independently from payment-date totals. Reversals affect the original effective month; replacements use their corrected date.
- No client scan of all records for dashboard totals. Canonical projection scans use 250-document server pages, a 180-second work deadline, checked arithmetic and revision guards; incomplete work never publishes a complete total.
- Financial forms remain online-only until M6. Private attachments and bank integrations are outside this increment.
- Original Lavish bundled fonts, palette, three pastel metric cards, net line, 1.65:1 desktop panel columns and stacked mobile layout remain binding. Human labels/icons accompany states.
- Live database region/Blaze inputs remain pending; all tests use demo emulators or pure fixtures.

## Review Focus

1. A payment/correction races a schedule edit or projection scan: only canonical revisions publish, and no partial schedule/balance is committed. Task 1/2 contention tests.
2. A December audit reverses an October payment: October effective paid changes while December activity records the correction; this month's outstanding dues stay independent. Task 2 fixtures.
3. Profile timezone changes after instances exist: due labels remain civil dates and each due classification respects its stored zone; old-context summaries cannot overwrite a new context. Tasks 2/3 fixtures.
4. Large schedules and personal volumes: no Firestore write/read bound breach, no silently truncated allocation, page, attention list or contact total. Task 1 maximum bounds and Task 2 multi-page tests.
5. An account is locked/deleted or switched during a worker/read/form: publishing/mutations stop and UI cannot reuse another owner's records or cached totals. Tasks 2/4 lifecycle tests.

---

### Task 1: Finite installment creation, allocation and corrections

**Files:** Create functions/src/obligations/{installment_calculation,installment_service}.ts, functions/src/payments/{allocation,finite_debt}.ts and functions/src/shared/occurrence_id.ts; modify functions/src/shared/commands.ts, functions/src/obligations/obligation_service.ts, functions/src/payments/{payment_service,corrections}.ts and functions/src/index.ts. Tests functions/test/installments.test.ts and firebase/emulator-tests/installments.test.mjs.

**Interfaces:** `InstallmentTerm {amountMinor:number,dueDate:string}`; `validateSchedule(terms,principal,origination):InstallmentTerm[]` enforces count, positive money, nondecreasing due dates and exact sum. `equalInstallments(principal,count):number[]` uses integer division with remainder in the final term. `occurrenceInstanceId(obligationId,key):string` hashes parent+stable occurrence key. `createInstallment` and `editInstallment` use existing ObligationInput fields plus `installments`; edit additionally requires obligationId/expectedRevision. Parent type installment, direction/section unchanged, singleInstanceId=null, bounded installmentInstanceIds and latest maturity/earliest outstanding nextDueDate. Stable i:0001 keys; edit retains instance count/identity, principal/currency/direction/origination/contact lock after any history, paid financial periods cannot change. `cancelInstallment` closes all instances and preserves principal/history.

`readFiniteDebt(context,parentId)` reads the parent and all of its bounded current instance IDs, validates owner/parent/currency, scheduled/paid/remaining conservation and lifecycle. `allocatePayment(amount,instances,explicitAllocations?):Allocation[]` returns <=24 unique allocations; invalid sums, unknown/closed periods and requests spanning >24 reject clearly. Existing recordPayment retains one-time payload/result compatibility and supports explicitly chosen installment periods. New recordInstallmentPayment accepts parentId/currency/PaymentTerms plus nullable explicitAllocations; returns paymentId,parent revision and allocation revisions. Multi-period payment obligationInstanceId=null; immutable allocations carry the exact amounts. Corrections reverse exact original allocations, then validate/allocate an optional replacement atomically. Nullable correction result instance ID and allocation revision list preserve existing one-time values. Parent status/nextDueDate derives from all current outstanding instances.

- [ ] Write `equal_split_retains_minor_remainder` (10000/3 →3333,3333,3334), exact-sum/date/2–120 checks and earliest-due/explicit/max24 allocation fixtures. Emulator tests cover atomic 120-instance creation, principal counted once, payment across periods, full chosen-period payment, double-submit/concurrent overpayment, correction restoring exact allocations with invalid replacement rollback, stale schedule edit, history locks, paid-date locks, cancellation and foreign-owner references.
- [ ] Run `npm --prefix functions run check` and the isolated installment emulator test. Expected: new modules/exports absent, FAIL.
- [ ] Implement pure calculations and bounded services; extract shared reference/snapshot/finite balance logic where needed without weakening one-time invariants. Extend command result shapes additively and preserve all M2 tests.
- [ ] Run complete Functions/rules/emulator suites. Expected: all pass with no orphan documents, negative remaining or partial writes.
- [ ] Commit `feat: add finite installment schedules and payment allocations`.

### Task 2: Revisioned dashboard/contact projections and repair

**Files:** Create functions/src/dashboard/{projection,projector,repair}.ts and functions/src/jobs/{projection_jobs,leases}.ts; modify functions/src/index.ts and firestore.indexes.json. Tests functions/test/{dashboard_projection,job_leases}.test.ts and firebase/emulator-tests/projections.test.mjs. Document actual query/projection shapes in docs/architecture/financial-read-queries.md.

**Interfaces:** `calculateProjection(input:{obligations,instances,payments,contacts},context:{uid,timezone,yearMonth,today,now}):Projection` folds complete validated ledger/allocation history with reversal links and checked sums. Each currency bucket exposes owe/owed/net, month outgoing/incoming scheduled/remaining, effective paid by payment date, assumed/confirmed paid, recurring due outstanding, dueToday/dueSoon/overdue and unknownAmountCount/counts. Contact bucket has independent finite borrowing/lending/positions. Cancelled/skipped instances are excluded from actionable totals; paid periods remain in scheduled-month totals. No double counting finite principal plus instances.

`projectOwner(uid,db,now):Promise<ProjectionResult>` reads active profile+ledger, scans owner collections in 250-document ID-ordered pages, computes complete projections, rechecks revision/profile timezone/month, and publishes guarded `summaries/dashboard-{currency}` and hashed contact summary IDs. Store sourceRevision/profileRevision/formulaVersion=1/yearMonth/timezone/financialDay/computedAt. Publish each bounded chunk (<=200 records) only after the same guard; readers compare metadata with current ledger/context and display updating for older chunks. All seven currencies and every contact receive zero/empty current buckets when needed, preventing stale amounts after the last obligation is cancelled. Any owner mismatch/invalid ledger/overflow/deadline fails without claiming current totals.

Top-level systemJobs use deterministic owner projection identity, status/nextRunAt, attempts and lease token/expiry. `enqueueProjection`, `claimProjectionJob` and `finishProjectionJob` use transactions; a stale token cannot complete new work. Ledger/profile triggers enqueue the current owner job; a scheduled bounded dispatcher every five minutes processes due/expired jobs and requeues a refresh at the next civil-day boundary (existing zones included). No scan of all users every invocation. Retries coalesce by revision and repeat safely. `refreshDashboard` callable authenticates/App Check/asserts active owner, enqueues only, and returns accepted; it does not accept calculated values or increase financial revision. `repairFiniteDebt` recomputes ledger allocations/caches, validates conservation, uses parent revision guards, appends a repair activity and enqueues a new projection; it never changes original payment entries.

- [ ] Write pure tests for PHP/USD separation, finite installment principal once, current-month scheduled/paid/remaining independence, December reversal of October payment, replacement date, cancellation, unknown variable amounts, overdue zone boundaries and checked overflow. Add emulator multi-page input (>250), concurrent mutation preventing stale publication, account lock, profile-zone change, repair conservation, duplicate/expired leases and reset-to-zero summary tests.
- [ ] Run Functions checks and focused emulator tests. Expected: new projection/job modules absent, FAIL.
- [ ] Implement the bounded pure fold, guarded projector/repair and persisted job dispatcher; add only actual systemJobs(status,nextRunAt)/(status,leaseExpiresAt) and client due-list composite queries to firestore.indexes.json.
- [ ] Run complete Functions/rules/emulator suites. Expected: valid projections publish; stale/invalid owners and stale leases do not publish or complete current work.
- [ ] Commit `feat: add guarded financial projections and repair jobs`.

### Task 3: Typed installment, summary, due and activity repositories

**Files:** Create lib/features/dashboard/{domain/{dashboard_summary,dashboard_repository}.dart,data/{summary_dto,firestore_dashboard_repository}.dart,presentation/dashboard_providers.dart}, lib/features/activity/{domain/{activity_entry,activity_repository}.dart,data/{activity_dto,firestore_activity_repository}.dart,presentation/activity_providers.dart}, lib/features/obligations/domain/{installment_schedule,installment_commands}.dart. Modify obligation/payment models/DTOs/repositories/actions and shared queries. Add focused Dart/Riverpod/repository tests.

**Interfaces:** Typed installment drafts/results, allocation lists and nullable multi-period IDs map Task 1 exact callable shapes; pre-existing one-time values remain intact. DashboardSummary exposes one native currency bucket and guarded freshness against owner, source/profile revisions, yearMonth/timezone/financialDay and formula version; stale summaries remain labeled updating. DashboardRepository watches bounded summaries, ledger/current and contact summary documents, and enqueues refresh through owner commands. Due repository queries closed=false and civil-date envelope conservatively covering all supported zones, sorted dueDate/ID; residual classification uses each instance's zone and injected now, scans continuation pages without silent limits. ActivityRepository streams/loads createdAt DESC/documentId DESC pages of 50, strongly maps known types and safe human arguments. Every provider declares owner/repository dependencies; no global SDK cache leaks across UID scopes.

- [ ] Write tests for installment payload/safe DTO mapping, nullable multi-period payment/correction results, currency separation, stale revision/profile/month/zone/day/formula markers, due-zone envelope/residual continuation and owned activity paging/errors. Financial action retries preserve IDs and late previous-owner completions are ignored.
- [ ] Run `flutter test` focused tests. Expected: new repository/model interfaces absent, FAIL.
- [ ] Implement SDK-free entities/calculations, strict adapters and scoped providers, including cursor/page bounds and explicit terminal errors.
- [ ] Run `flutter analyze && flutter test`. Expected: clean analysis and all tests pass, including M1/M2 regressions.
- [ ] Commit `feat: add typed dashboard activity and installment repositories`.

### Task 4: Original dashboard and usable installment/activity views

**Files:** Modify dashboard_screen.dart, activity_screen.dart, obligation editor/detail/payment/correction UI and contact_detail_screen.dart; create small dashboard panels/metric cards, installment schedule editor/preview and activity rows. Tests test/features/{dashboard,activity,obligations}/ plus browser verification. Record docs/quality/upcoming-obligations-verification.md.

**Interfaces:** Original Lavish dashboard three metric cards, borrowing/lending net line, attention/due panels, month progress, recent activity and upcoming automatic area. Real per-currency selection never adds currencies; no name/amount fixtures in signed-in data. Stale/missing summaries show updating/refresh, unknown bills show Plus N bills needing an amount. Due Today/Soon/Overdue link to the owned detail; full calendar link continues to M5. +Add borrowed/lent editor offers a finite schedule with manual dates/amounts or equal split, validates sum and previews all 2–120 periods; details list paid/remaining per period and immutable allocations. Full/custom payments explain the 24-period allocation bound before submitting; explicit period selection never silently pays another obligation. Contact positions consume guarded complete projections. Activity renders server-created immutable events with dates/currency and corrections.

- [ ] Write widget tests for original dashboard composition with real fixture summaries, PHP/USD switch, updating/unknown markers, month-total independence, current due labels, schedule creation/sum validation/selection, payment/correction allocation display, contact freshness, activity paging and UID switching. Check 320px/200% keyboard/landscape and desktop multi-column/three cards.
- [ ] Run targeted widget tests. Expected: new behavior absent, FAIL.
- [ ] Implement small responsive panels/editors and wire only repository/providers. Avoid dummy data and misleading completed-launch states.
- [ ] Run complete Flutter/Functions/emulator suites and actual browser create installment → pay across periods → dashboard/current month → correction → reload → second-owner isolation; inspect original Lavish reference and actual desktop/mobile screenshots with no app errors.
- [ ] Document actual evidence/remaining M4–M8 release work, commit `feat: restore original dashboard with live obligations and activity`, task-done all checks, then ONE fresh whole-M3 review; fix Important/Critical RED→GREEN and ledger deferred Minors before M4.
