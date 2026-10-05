# Tally calendar and search implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make canonical due instances visible in a responsive calendar and searchable filtered obligations without mixing currencies, truncating results, or leaking owners.

**Architecture:** A shared typed filter and query planner select one indexed primary predicate; bounded owner-bound pagination evaluates all residual criteria. Scoped providers bind the original Lavish UI to canonical repositories. A dedicated selected-period payment query removes unrelated-month paging.

**Tech Stack:** Existing Flutter/Dart, Riverpod, go_router, official FlutterFire, pinned IANA2026c, TypeScript Firebase Functions/Admin and demo-tally Emulator Suite; no new runtime dependency.

**Spec:** docs/superpowers/specs/2026-10-05-tally-calendar-search-design.md; docs/architecture/{firebase,financial-engine}.md; docs/product/experience.md; docs/quality/testing-and-operations.md; .lavish/tally-design.{html,css,js}. This executes authorized M5a; M5b reminders/notifications and M6–M8 remain required.

## Global Constraints

- Main only, no worktrees; preserve .ignore. User already requested continuous execution of the full app and deployment; no repeated milestone approval.
- Supported civil dates1900–2199, seven currencies, individual integer minor units1..1_000_000_000_000. Amount filter endpoints0..1_000_000_000_000 require a chosen currency; lower<=upper.
- Dates match stored civil labels; overdue uses saved instance zone and injected UTC now. Unknown estimates are never recorded amounts. Recurring templates have no lifetime balance/due date.
- All private queries owner-scoped, normal50 candidates, at most5 fetches/250 candidates per request, at most50 matching results; surplus retained in opaque cursor. Cursor binds owner/full criteria/primary query/civil classification. Cached empty is never server-complete.
- Primary equality priority contact/category/source/currency/section/exact mode. Other criteria residual; automaticOnly means both automatic modes and cannot combine with exact mode. Obligations archived=false/createdAtDESC; periods dueDateASC.
- Search text trimmed, internal whitespace collapsed, lowercase, maximum240 characters; matches title/description/notes/saved labels.300ms debounce; no external index or false full-text capability claim.
- Status pending means outstanding; partial and overdue may both match the same period. Paid/skipped/cancelled remain historical. Template status/date filters use Billing periods; bill view filters fee/lifecycle.
- No direct Firebase calls in widgets; same original shell/fonts/palette/light/dark; accessible labels/48px actions/200% text. No native notification or live deployment readiness claim from demo evidence.
- Full task gate: flutter analyze; flutter test; npm --prefix functions run check; npm run test:emulators (fresh normal prompt and manual financial/security suites). Required actual Dart hot reload/runtime inspection.

## Review Focus

1. Very sparse secondary criteria beyond250 and1,000 candidates: progress and continuation must remain truthful, bounded, cancellable and eventually find later matches (Task2).
2. Matching results overflow50 and a live first-page update arrives: surplus cannot be lost, duplicated, or carried into a different search (Task2/3).
3. Profile timezone differs from retained instance zone during midnight/month boundaries: month membership and overdue remain distinct; pagination resets only at a classification-day change (Task1/3).
4. An owner/query switch completes after a delayed continuation: previous results/cursors are discarded and the new owner remains private (Task2/3).
5. Monthly template plus paid/unknown/paused/ended retained periods: payment/date filters cannot treat the generation cursor or estimate as a payable balance (Task1/3).

---

### Task 1: Typed financial filters and civil-calendar query semantics

**Files:** Create lib/features/search/domain/{financial_filter,period_query,calendar_query,query_page,search_repository}.dart; tests test/features/search/financial_filter_test.dart and test/features/calendar/calendar_query_test.dart. Extend lib/features/obligations/domain/obligation_instance.dart and data/instance_dto.dart with description/contact/category snapshot labels needed by period search; preserve legacy DTO compatibility.

**Interfaces:** `RecordStatus` all/pending/partiallyPaid/paid/overdue/skipped/cancelled. `FinancialFilter({ObligationSection? section,RecordStatus status=all,CurrencyCode? currency,ContactId? contactId,CategoryId? categoryId,SourceId? sourceId,PaymentMode? paymentMode,bool automaticOnly=false,int? minimumMinor,int? maximumMinor,LocalDate? firstDate,LocalDate? lastDate,ObligationLifecycle? lifecycle,String text=''})`; immutable normalized fields, value equality. `matchesInstance(ObligationInstance,DateTime now)` and `matchesObligation(Obligation,DateTime now)` compare native original bill/principal (template fee when no date/payment-state filters), saved snapshots and saved-zone status. `PeriodQuery({required DateTime now,FinancialFilter? filter,bool empty=false})` exposes matches(instance) and stable saved-zone civil classification key/equality. `CalendarQuery({required YearMonth month,required DateTime now,FinancialFilter? filter})` exposes firstDate/lastDate month-filter intersection (nullable intersection), isEmpty, nullable previousMonth/nextMonth at1900/2199 bounds, matches(instance), and intersected `PeriodQuery periods`; no month is imposed on general period search. `QueryPage<T>({required DataPage<T> records,required int scannedCandidates,required bool budgetReached})`. `SearchRepository` owner getter; watchObligations(FinancialFilter,DateTime now), getObligations(filter,now,{PageCursor? after}); watchPeriods(PeriodQuery), getPeriods(query,{PageCursor? after}), all return QueryPage<Obligation/ObligationInstance>.

- [ ] Write tests with literal fixture expectations: partial20000 of54900 is pending/partial, overdue only before saved-zone today; paid/skip/cancel excluded from overdue; unknown variable estimate350000 fails amount predicates. PHP54900 never matches USD54900; JPY549 filter uses integer549. All source/person/category/mode/text predicates work; conflicting modes, missing currency, negative/too-large/reversed bounds/dates and241-char input reject. Monthly template cannot match a payment-status/date criterion.
- [ ] Test Oct2026 range2026-10-01..31, Feb2028..29, month intersection, disjoint empty, min/max calendar navigation; stored October1 remains October with LA/Manila profile differences; same saved-zone civil vector at two instants compares equal, crossing LA midnight compares unequal. Existing actual DTO fixture exposes contact/category/description without inventing names.
- [ ] Run `flutter test test/features/search/financial_filter_test.dart test/features/calendar/calendar_query_test.dart`. Expected: missing domain imports FAIL; record RED.
- [ ] Implement SDK-independent predicates and calendar boundaries, reuse pinned catalog and Money. Add optional instance description/contact/category fields decoded from snapshot through CatalogDto, defaulting compatibly for old fixtures. Run callers before changing models/DTOs.
- [ ] Run the full task gate. Expected: all existing/added suites pass; hot reload succeeds/runtime errors none.
- [ ] Commit `feat: add typed obligation filters and civil calendar queries`; named task-done runs the full gate.

### Task 2: Bounded filtered queries and selected-period history

**Files:** Create lib/features/search/data/{query_planner,filtered_pager,firestore_search_repository}.dart and presentation/search_providers.dart. Extend lib/features/payments/domain/payments_repository.dart, data/firestore_payments_repository.dart, shared/presentation/financial_providers.dart, recurring/presentation/recurring_history.dart. Modify firestore.indexes.json. Tests test/features/search/{filtered_pager,search_repository,search_scope}_test.dart; test/features/payments/period_history_test.dart; firebase/emulator-tests/search_queries.test.mjs. Update docs/architecture/firebase.md with actual query plan.

**Interfaces:** `QueryPlanner.obligations(FinancialFilter,{PageCursor? after})` and `.periods(PeriodQuery,{PageCursor? after})` return DocumentQuery. `FilteredPager<T>` consumes OwnerDocumentGateway, map, predicate, query builder and canonical criteria key; watchFirst/get return QueryPage<T>, bounded fetches, opaque surplus-aware cursor; no new Firebase UI boundary. `FirestoreSearchRepository` implements Task1 SearchRepository. `searchRepositoryProvider` explicitly depends on owner gateways; `obligationSearchProvider` family key filter+civil context and `calendarPageProvider` family PeriodQuery are autoDispose streams. PaymentsRepository adds watchPeriodPayments(parentId,instanceId,{limit=50}) and getPeriodPayments(parentId,instanceId,{limit=50,after}); existing history methods/results unchanged. A selected period uses this pair and exact owner/query-bound cursor rather than filtering parent pages.

- [ ] Write behavioral query/mapping tests: empty first50, match on second50;250 no matches returns scanned250/more=true/budgetReached;1,000 records with a match at900 eventually yields it; result60 returns50 then10 from retained surplus without fetching those documents again. Assert one fetch in flight, exhausted vs cached-only state, all equality-priority shapes, all secondary predicates, rejected foreign/filter/civil-day cursor before read, canceled owner completion discarded. Dedicated period history returns only its original/reversal/replacement despite unrelated newer months.
- [ ] Run focused Flutter tests. Expected: missing implementation/methods FAIL. Add actual emulator query fixture and Rules denial for unauthenticated/cross-owner reads; run new emulator test before changing indexes/query code.
- [ ] Implement bounded pager with buffer and query-bound state; keep first-page changes from appending stale continuation. Declare only spec composite indexes. Explicitly show cached incompleteness; no infinite while-empty scan. Add scoped providers and dedicated payment history, preserving current whole-parent APIs and correction commands.
- [ ] Run full task gate plus1,000-record performance fixture; record scan/fetch counts and elapsed time, not an unsupported production latency promise. Expected: all pass, old parent/finite histories unchanged, complete result reachable beyond first250.
- [ ] Commit `feat: add bounded searchable queries and period payment history`; named task-done full gate.

### Task 3: Responsive calendar and discoverable search/filter UI

**Files:** Replace lib/features/calendar/presentation/calendar_screen.dart; create {calendar_month,calendar_agenda,calendar_controls}.dart. Create lib/features/search/presentation/{financial_filter_panel,search_field,query_results}.dart. Modify obligations/presentation/obligations_screen.dart, app/app_router.dart, dashboard/presentation/widgets/home_metrics.dart; use original shared PageBody/PagedRecords/theme. Tests test/features/calendar/calendar_screen_test.dart, test/features/search/search_screen_test.dart, test/features/dashboard/home_currency_route_test.dart; actual demo browser evidence docs/quality/calendar-search-verification.md and docs/assets/calendar-*.png.

**Interfaces:** CalendarScreen consumes calendarPageProvider(CalendarQuery.periods) and selected profile day/month, renders complete/cache/progress labels from QueryPage; calendar grid counts are explicitly loaded-event counts while incomplete. `FinancialFilterPanel` emits a complete FinancialFilter on Apply and reset, money fields disabled without currency, catalog selectors use current stable IDs. `SearchField` normalizes after300ms debounce/submit and cancels pending timer on disposal. `QueryResults<T>` holds paged records only for its owner/full query key and ignores old continuation completion; clear criteria resets cursor/buffer/progress. ObligationsScreen gains optional initialCurrency and Bills/Billing periods for Monthly Dues; router validates `currency` param through supported CurrencyCode. Home owe/owed tiles append actual selected currency; no cross-currency total.

- [ ] Widget tests pin month/selected day/Today navigation, every filter action, unknown/overdue/paid rows, Bills versus Billing periods semantics, search300ms/reset/cancel, later/sparse results Load more, old owner/query completion discard, cached empty disclosure, selected-period history and currency-preserving Home navigation. Verify320/375/800/1440 at200% text, keyboard reachability, dark/light, date bounds.
- [ ] Run focused Flutter widget tests. Expected: placeholder calendar and absent filters/routes FAIL; record exact missing behavior.
- [ ] Implement small responsive widgets in the original theme, desktop month+agenda/mobile compact agenda. No fake events, sums across currencies, direct Firebase SDK, or technical enum labels. Progress/empty copy distinguishes no recorded bills from an incomplete search. Private deep links stay behind the existing auth/ownership gate.
- [ ] Run full task gate and actual demo-emulator UI flow: mixed PHP/USD, manual partial, confirmed/failed auto, variable unknown, paid history, next month, filters/search, second-account isolation and real signout regression. Capture genuine dark/light mobile/desktop images. Hot reload/runtime errors clean; record deployed-index/push capability limitations honestly.
- [ ] Commit `feat: build responsive calendar and obligation search`; named task-done full gate.

One fresh whole-plan review follows all tasks, using the five Review Focus cases
and ledger rulings. Re-grade by user effect; one Important/Critical TDD fix pass,
no re-review. Retain scratch ledgers until the final M8 exhaustive handoff, then
continue the separate M5b reminder/notification plan without a milestone pause.
