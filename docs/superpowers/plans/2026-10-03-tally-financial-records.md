# Tally financial records implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make borrowing/lending, people, categories, payment sources and immutable manual partial/full payments usable, with traceable corrections and the original Lavish appearance.

**Architecture:** Owner-scoped Firestore reads come through feature repositories. Authenticated/App Check callable commands validate exact schemas, references and revisions and persist ledger, balances, activity, projection jobs and idempotency receipts in transactions. Flutter commands capture the owner and retain IDs across uncertain retries; forms never invoke Firebase directly.

**Tech Stack:** Existing Flutter/Riverpod/go_router/FlutterFire, TypeScript Firebase Admin/Functions v2, demo-tally emulators and Node 22/JDK 21.

**Spec:** docs/superpowers/specs/2026-10-03-tally-design.md, docs/architecture/firebase.md, docs/architecture/financial-engine.md, docs/architecture/flutter.md, docs/product/experience.md, original .lavish/tally-design.{html,css,js}. This implements M2; dashboard/installments/recurring/reminders/attachments/offline remain subsequent increments, all required for launch.

## Global Constraints

- Work on main only, preserve unrelated .ignore. Implementation and eventual web deployment already authorized; continue between milestones.
- Financial writes are server canonical; owner path and userId derive only from Auth. expectedOwnerUid is a session assertion, never ownership authority.
- Integer minor money: seven supported currencies, positive amount <=1_000_000_000_000, aggregate <=9_007_199_254_740_991. Never combine currencies.
- Civil dates YYYY-MM-DD, 1900–2199; timezone is the verified profile IANA zone. Payment date <=local today and >=origination.
- Payments/activity immutable; corrections append a full reversal and optional replacement atomically. Unique original-payment reversal marker prevents double reversal.
- One-time debts own one concrete instance; null due date remains unknown, not today. Aggregate fields are derived by trusted payment deltas with ledger revision/projection jobs and later repair.
- Transactions read active profile before receipt replay, validate reference ownership/lifecycle, then perform all reads before writes. Each command increments ledgerState once.
- Accepted receipts are permanent and bind normalized payload/type with SHA256. Deterministic command-derived IDs; concurrent replay commits once. Changed-payload ID reuse rejects.
- Hard deletion of referenced contacts/sources/categories excluded; archive/deactivate only. No full card/password/CVV/PIN fields accepted.
- Online commands in M2 explicitly require connectivity; never pretend a failed request is saved offline before M6 supplies a durable outbox.
- App Check in real environments; verified demo emulator bypass only. Tests never access production. Live DB region/billing gates remain pending user inputs.
- Flutter layouts match original Lavish branding/fonts/palette/230px sidebar/82px header/panels/mobile navigation, translated to Material 3. Status includes words/icons.

## Review Focus

1. Two devices submit payments exceeding the balance in combination: one fails atomically; no negative balance or orphan activity. Task 2 emulator concurrency test.
2. Lost-response retry after later account/payment changes: receipt returns original IDs; wrong owner/deleting profile cannot replay. Tasks 1/2 emulator cases and Task 3 owner assertions.
3. Malformed dates, unsafe integers, unknown currency/enums or another owner's referenced ID: fail before writes, safe UI errors. Tasks 1/2 validation tests and Task 3 DTO tests.
4. Correction replacement invalid or concurrent double reversal: original ledger/balances remain intact on rejection. Task 2 emulator rollback/race tests.
5. Account switches while an editor/read is pending: no foreign data appears and command cannot mutate new owner. Task 3 provider/widget regression.

### Task 1: Owner-bound reference catalog and one-time obligations

**Files:** Create functions/src/shared/{validation,commands}.ts, functions/src/catalog/catalog.ts, functions/src/obligations/obligation_service.ts; modify functions/src/index.ts; test functions/test/financial_validation.test.ts and firebase/emulator-tests/financial_records.test.mjs.

**Interfaces:** `executeOwnerCommand<P,R>(uid,input,type,validate,handler,db)` implements exact {commandId,expectedOwnerUid,payload} envelope, active account/receipt/ledger transaction and deterministic `commandDocumentId(commandId,role)`. Handler reads references and stages writes before common receipt/ledger/projection writes. Catalog `saveCatalog(uid,input,db)` payload {kind:'contact'|'source'|'category',id:string|null,expectedRevision:int|null,values:exact object}; create/update revisions; archive flags preserved. `createObligation(uid,input,db)` payload {title,description,notes,direction,currency,amountMinor,originationDate,dueDate:string|null,contactId:string|null,categoryId,paymentSourceId:string|null,interestInfo:object|null}; manual one-time parent+instance. `editObligation(uid,input,db)` payload is those same create terms plus {obligationId,expectedRevision}; amount/currency/direction/origination/person immutable once any history exists (including reversed history); audited revision update of unpaid due date (paid instance date immutable). Existing archived/inactive links may be retained, new links must be active. `cancelObligation` explicit revision/lifecycle command; preserve amounts/history, close its instance.

- [ ] Write tests for bounded scalar/date/currency/text/reference/catalog validation and immutable stable IDs. Write emulator cases Alice/Bob isolation, parent/instance/activity/receipt atomic creation, retry same command, changed-payload rejection, inactive account, missing/foreign references, null due date, stale edit and cancellation preserving history.
- [ ] Run Functions checks and actual emulator tests. Expected: new exports/modules absent, tests FAIL.
- [ ] Implement reusable strict validators and command framework; catalog create/update commands; one-time parent/sole instance and audited edit/cancel. Snapshot only display names/kinds/source lastFour; no client calculated balances accepted. New profile ledger revision initially 0, every command increments once. Common transaction staging enforces reads-before-writes.
- [ ] Run complete Functions and emulator suites. Expected: all pass; no direct client write rules opened.
- [ ] Commit `feat: add private contacts sources and borrowing lending records`.

### Task 2: Immutable payments and atomic corrections

**Files:** Create functions/src/payments/{calculation,payment_service,corrections}.ts, functions/test/payment_calculation.test.ts, firebase/emulator-tests/payments.test.mjs; modify functions/src/index.ts.

**Interfaces:** `recordPayment(uid,input,db)` exact envelope payload {obligationId,obligationInstanceId,amountMinor,currency,paymentDate,paymentSourceId,paymentMethod,notes}; current caches validated against bounds, sole-instance allocation preserved, provenance manual. Result {paymentId,obligationId,obligationInstanceId,obligationRevision,instanceRevision}. `correctPayment(uid,input,db)` payload {paymentId,reason,replacement:null|{amountMinor,paymentDate,paymentSourceId,paymentMethod,notes}}; original owner payment read, original unique reversal marker, original allocation copied, optional replacement validated against temporarily restored remaining. `calculateBalance(original,effectivePaid,delta)` checked finite arithmetic used for all cache writes.

- [ ] Write unit cases PHP 1_000_000 − 300_000 = 700_000; multiple payments 2_000_000 − (500_000+250_000+400_000)=850_000; full, overpayment, overflow and reversal. Emulator cases lent 500_000 repaid 200_000 remaining300_000, retry dedupe, separate currencies, invalid dates/source, overpayment no writes, two concurrent excessive payments, reversal/replacement, invalid replacement atomic rollback, concurrent correction, original timestamps/content unchanged.
- [ ] Run Functions/emulator suites. Expected: new payment commands FAIL.
- [ ] Implement immutable payment/allocation/history writes, derived parent/instance balances/status/revisions, activity/receipt/projection updates in one transaction. Use local civil today from Intl time zone; no future-dated payments. Reverse-only correction restores balance; replacement has own corrected financial date. Cancelled obligations reject payment/correction. Distinguish overpayment, conflict, unsupported/inactive and invalid data with safe HttpsError codes/details.
- [ ] Run all Functions/emulator tests. Expected: all pass, races commit valid totals only.
- [ ] Commit `feat: add immutable partial payments and traceable corrections`.

### Task 3: Typed financial repositories and editor state

**Files:** Create features/{people,payments,obligations}/domain entities/repositories, data Firestore adapters/DTOs, presentation providers/controllers; shared catalog domain/data/providers; test features financial DTO/calculation/provider/controller tests.

**Interfaces:** SDK-free immutable `Contact`, `PaymentSource`, `Category`, `Obligation`, `ObligationInstance`, `PaymentEntry`. Feature repositories owner-scoped paginated watches (limit <=200, normal50); `watchObligations`, detail `watchObligation(id)`, `watchInstances(parentId)`, `watchPayments(parentId)` and catalog watches. Cursor pages preserve complete history beyond first50. Commands carry captured OwnerUid/CommandId and exact server payloads; command actions retain IDs while retrying identical requests and expose AsyncValue. `PaymentCalculator.balance(Money original, Iterable<PaymentEntry> entries)` folds immutable payments/reversals and rejects invalid/cross-currency entries. Providers declare Riverpod owner dependencies and dispose per UID scope.

- [ ] Write strict DTO owner/schema/enum/money/date/ID and ledger-fold tests, repository pagination mocks and owner-scope switch/controller uncertain-retry tests.
- [ ] Run targeted Flutter tests. Expected: contracts absent, FAIL.
- [ ] Implement immutable models/DTO adapters/repositories, typed snapshots and revisioned catalog/obligation/payment command controllers; SDK errors map to readable overpayment/current balance/stale/conflict/connectivity messages. Firebase calls stay in data adapters. Cache reads label pending/unavailable; no offline success claim.
- [ ] Run analyzer and complete Flutter tests. Expected: green.
- [ ] Commit `feat: add typed financial repositories and owner scoped editors`.

### Task 4: Usable original-design financial screens

**Files:** Update shared shell/navigation/add chooser and obligations/people/settings screens; create obligation editor/detail/payment/correction dialogs, catalog editors/widgets. Update router private allowlist for obligation detail/new URLs. Add meaningful widget/browser tests.

**Interfaces:** +Add I borrowed/I lent opens real editor; details show Original/Paid/Remaining and immutable history/correction disclosure; record payment supports full/partial/custom. People lists people/organizations with currency-separated independent positions/history; settings manages sources/custom categories. Editor links existing contacts or creates an inline new contact through catalog repository before obligation command. Date/currency/minor parsing through core types; no amount computed with doubles.

- [ ] Write widget tests for borrowed10_000→payment3_000→remaining7_000, lent5_000→repayment2_000→remaining3_000, invalid decimals/dates, full/custom overpayment warning, correction reason/atomic failure display, duplicate submit busy guard, deep-link restoration, owner switch clearing and 320px/200% keyboard/landscape layouts. Original-design shell tests confirm lowercase tally. mark, sidebar/header responsive transitions.
- [ ] Run tests. Expected: forms/flows absent, FAIL.
- [ ] Implement reusable constrained/scrollable editors, state labels/history, real people/catalog management and original Lavish shell. Monthly-dues chooser remains next milestone until actual template support; communicate availability explicitly. Human copy avoids accounting terms.
- [ ] Run full Flutter/Functions/emulator suites; actual browser create→save→partial→full→correction→reload→second-account isolation; inspect original reference and app at desktop/mobile with no console/layout errors.
- [ ] Record docs/quality/financial-records-verification.md, commit, do one fresh whole-M2 review/fix important regressions RED→GREEN, then continue M3.
