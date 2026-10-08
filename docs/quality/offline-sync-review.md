# M6b final review and fixes

One fresh reviewer examined `3b92328..e13f6f2` against the M6b spec, plan,
ledger, code and sealed evidence. Verdict: **With fixes**; five Important issues,
no Critical or Minor findings. Severity remained Important after grading the
actual user effects. All five were fixed inline with failing regressions, then
the entire current-source gate passed. No second reviewer was dispatched.

## Findings and verified changes

| User effect found | Correction | Regression evidence |
| --- | --- | --- |
| A new intentional identical payment reuses an earlier queued action's ID | Durable handoff releases UI attempt identity; outbox retries retain their ID. Reviewed action handoffs follow the same rule. | New identical payment/review tests failed before the fix and pass afterward |
| Quota after server commitment claims the change was not saved | Post-enqueue local failures report uncertain confirmation; original editor draft and identity stay frozen for same-ID replay. Pre-enqueue failure never claims queuing. | Real SQLite intent with injected completion/defer/release exhaustion; replay retains one canonical payment; widget keeps original payment read-only |
| Old receipt publication erases a newly selected receipt | Atomic removal checks current file/attempt/payment/reservation; observer retirement also checks attempt identity | Two real file-backed stores/coordinators; old Ready cannot remove replacement, while new Ready can |
| Rejections permanently consume unresolved capacity and block trust changes | Explicit Move to history records dismissed state and keeps the failed intent/tombstone outside unresolved quota | Full 1,000-row capacity recovery, blocked dependent without dispatch, immutable failure history and actual widget interaction |
| An open dialog loses its dependency when another tab cancels its parent | Bounded indexed owner/resource creation lookup includes cancelled/dismissed tombstones | Cancellation before child freezing; catalogue edit; parent beyond newest 1,000 history rows; no attempted child dispatch |

Tests also exposed a missing Riverpod invalidation dependency at the new history
boundary. Declaring `outboxCommandProvider` fixes successful dismiss/cancel state
publication; the controller and widget assertions now cover it.

## Fresh final evidence

- 710 VM tests; 44 actual Chrome contracts; 15 Node tool cases;
  133 Functions tests; 144 fresh emulator cases. Required failures/skips: zero.
- Seven actual compiled application phases: offline save, full document reload,
  same-ID reconnect, independent receipt failure/reselection, owner isolation,
  pending parent/dependent payment and responsive/keyboard checks.
- All 30 reported diagnostic messages expanded; zero private markers and zero
  unhandled Flutter errors. This measures the bridge-reported representation.
- Current debug web build/public assets, real SQLite WASM reload/two-tab lease,
  formatting, analysis, syntax and diff checks passed. Actual live Dart hot reload
  succeeded and runtime error collection returned no errors.
- All ten original screenshot seals validated. Repeated pending captures at
  400/800/1440 light/dark are byte-identical, preserving the original design.

Full failure and final logs remain in the preserved milestone workspace.
Post-review source changes invalidated pre-review reusable seals; the final gate
reran all suites from the current source. No pre-review suite was reused here.

## Deferred minors

None were reported or deferred by this review.

## Rulings I made

The list below preserves every ruling from this milestone's ledger in its
original order. Earlier continuation rulings describe their historical runs;
they do not replace the complete post-review gate. Decisions about devices,
staging, retention and deployment remain explicit limits, not completed checks.

1. Continue the already authorized application roadmap inline on main without another artifact approval — user explicitly requests full working app/execute and repeated continue; chosen main-only workflow overrides isolated workspace preference — cost if wrong: written decisions receive concrete review during delivery without another user handoff.

2. Preserve every prior milestone workspace through M8 instead of deleting at skill completion — required for the complete final handoff — cost if wrong: local ignored evidence consumes disk space.

3. Pending payments on new finite obligations use predicted finite instance IDs. Pending installment/recurring templates require canonical periods before payment — their schedules depend on trusted generation/snapshot state — cost if wrong: these new templates must sync before recording a payment, while existing cached periods still support queued actions.

4. Normalize finite, mathematically integral numeric values withinMAX_SAFE_INTEGER; reject fractional/non-finite/unsafe values — official Dart docs confirm web1 and1.0 share their underlying representation, so subtype-based rejection cannot establish cross-platform correctness — cost if wrong: native1.0 normalizes to integer1, while financial values still use existing integer-minor-unit domain validation and no fractional amount is accepted. Spec corrected before numeric implementation; original invalid-float fixture now uses1.25, plus explicit1.0 canonicalization.

5. Shared literal golden IDs have JSON and Dart fixture forms for TS/VM/Chrome, with no platform IO in the Chrome contract — the web compiler cannot read a local test File — cost if wrong: a deliberate server ID change must update both reviewed literal fixture forms.

6. Frozen dependency input carries typed owner and command identity; local persisted dependency IDs are reconstructed only under the validated row owner — opaque IDs alone cannot prove a foreign dependency at construction — cost if wrong: callers must provide the existing UID scope when creating dependency links.

7. Native multi-connection evidence uses production NativeDatabase.createInBackground — direct main-isolate executors cannot let another transaction commit while SQLite waits (one-off reproducer confirmed SQLITE_BUSY5) — cost if wrong: tests also need isolate startup, while the production topology remains unchanged. Intentional separate-database debug warning disabled only in tests; distinct executors and owner checks remain enforced.

8. SQL lease instants use UTC milliseconds; normalize the returned deadline before publishing its fence — row round-trip discarded microseconds and broke actual DateTime.now leases — cost if wrong: deadline precision is bounded to1 millisecond, not a financial civil due date.

9. Import only DriftRemoteException from the package's public remote API and locally acknowledge its experimental library annotation — stable public cause access avoids unsafe text matching; Drift and the worker are pinned2.35.1 — cost if wrong: a future dependency upgrade must rerun both native/worker contracts before release.

10. A definitive rejected action no longer holds its resource dispatch lock — the spec permits reviewed submissions under new IDs; holding rejected rows forever prevents that — cost if wrong: another independently validated action may follow the failed action; server revision/ownership/balance validation still decides acceptance. Queued/sending/blocked rows continue serialization, and rejected-parent dependencies remain blocked.

11. Add unresolvedOnly pagination/watch filtering with query-bound cursors — accepted history is unbounded and cannot hide an older unresolved creation from the bounded1,000-row dependency scan — cost if wrong: one optional store query mode must remain supported by future adapters.

12. A malformed acknowledgement defers an attempted command with recovery rather than treating it as definitive server rejection — the financial transaction may already have committed — cost if wrong: this row holds its resource until explicit same-ID reconciliation; independent resources continue.

13. Payment corrections use the owned, fully validated Firestore Source.cache payment to resolve the real obligation resource key — the existing protected correction payload deliberately lacks obligationId, and adding fields violates its exact validator — cost if wrong: an uncached payment must first be opened while connected; no guessed resource or changed server payload is queued.

14. The durable Firebase transport retains raw official callable response data until validation, alongside the existing raw gateway for excluded endpoints — the existing gateway maps malformed acknowledgements into invalid input and would incorrectly reject potentially committed financial saves — cost if wrong: the exact three-field protected envelope has two small adapters, covered by ownership/envelope tests.

15. Resume the final browser/asset/syntax/diff stages using explicitly validated successful suite evidence instead of repeating unchanged six-minute emulator suites — no application, test or server source changed after the full suite run; the sole failure is an omitted localhost harness variable — cost if wrong: any later source change invalidates this resume evidence and requires the relevant full suites again.

16. Extract raw owner providers into shared/presentation/owner_gateways.dart and re-export them from financial_providers — sync providers can consume raw data services without importing the durable gateway provider back into themselves — cost if wrong: imports retain a compatibility export; future provider additions must keep the dependency direction acyclic.

17. Canonical-only emulator-mode UI fixtures explicitly inject an online-only SyncRuntime using their original fake gateway — the new production runtime otherwise correctly needs initialized official Firebase clients;30 pre-existing UI failures showed the missing fixture dependency — cost if wrong: these fixtures continue testing canonical flows while dedicated sync tests and actual browser flows carry persistence/network evidence. Nine fixture files updated, original assertions retained; focused333/333 GREEN.

18. Sync history uses its own local paginated view, not the canonical PagedRecords cache banner — local command history is authoritative on-device history, not a stale financial balance. Unresolved rows remain separately watched with the 1,000-row contract. — cost if wrong: local provenance can be misunderstood until clarified.

19. Compiled browser QA uses an explicit --debug emulator build. The first setup correctly failed the existing release-emulator guard; that guard stays unchanged. --no-web-resources-cdn matches production builder asset behavior. This build remains localhost-only and nondeployable. — cost if wrong: this evidence cannot establish release-mode performance; real release verification remains required.

20. Add a versioned owned worker caching only public static assets and public pinned Firebase SDK scripts, plus an owner/environment-scoped profile preference snapshot enabled by explicit web trust (native private preferences). Cached profile fallback occurs only for connectivity failures of protected bootstrap, never ownership/auth/profile validation rejection. Canonical financial Firestore caches remain unchanged and no financial balance is fabricated. Cost if wrong: offline reopening may need connectivity; stale profile preferences can remain visible until the protected profile stream refreshes. New routes, notification worker scope and OAuth headers remain intact. Verify actual full browser Offline reload and reconnect before Task 4 completion.

21. Official callable SDK internal errors include failed HTTP fetches. Map only typed FirebaseFunctionsException/internal to retryable availability, keeping explicit unauthenticated, permission-denied, failed-precondition, invalid-argument and domain profile/schema rejection final. Profile fallback grants no cloud authorization and continues the protected profile stream; it exposes owned cached preferences only. Cost if wrong: a temporary server internal error can show stale profile preferences until the canonical stream refreshes.

22. Keep receipt metadata in a separate owner/environment-scoped SQLite database, preserving the existing outbox schema and immutable financial commands. Native bytes live in an atomic private directory; web persists only small metadata and keeps one selected file in memory, with explicit reselection after reload. Cost if wrong: two local stores need independent cleanup at protected account deletion.

23. Accepted submissions carry optional original command identity for compatibility, with production FinancialActions always supplying it. Pending receipt upload uses a separately persisted explicit upload command ID in the existing attachment repository. Cost if wrong: custom online-only test gateways without identity cannot stage receipts; financial success is still preserved.

24. Run the legacy notification fixture file in its own fresh manual emulator, then run every other discovered deterministic file in a fresh manual emulator, retaining the separate automatic trigger run. No assertions, ownership checks or financial tests are removed; new files are discovered automatically and unsafe filenames/empty required suites fail. This isolates deliberately missing canonical preferences and delayed trigger work. Cost if wrong: real legacy migration under staging load still requires M7 verification; this is test isolation, not a claimed server contention fix.

25. Explicitly remove then re-add starts a new evidence attempt; retries/reselection of an existing saved receipt keep their original attempt. Version2 evidence metadata supports old version1 without changing its file/reserve/upload keys — expired or removed server reservations cannot be renewed with the same permanent metadata receipt — cost if wrong: old readers reject new evidence metadata safely; users need the compatible app to manage new pending receipts. This does not change SQLite schema or financial command format.

26. Preserve the successful fourth full backend/emulator gate with SHA-256 seals for every tracked backend/rule/test/package file plus emulator planner/runner, while rerunning all current client/Chrome/tool/Functions/build/storage/application checks for the cache-only Dart fix. The final gate fails if source hashes, complete test counts, failures or skipped cases differ. No backend code/rules/queries changed. Cost if wrong: the M6b Task6 final whole gate still reruns all fresh emulator suites before the one final review.

27. Bind each negative risk to the layer that can reproduce it deterministically: real SQLite/Chrome capability contracts for unsafe storage, quota/future schemas, clocks/leases and parent rejection; actual emulator transactions for automatic/manual race and currency isolation; actual compiled application for blocked-network reload/reconnect, dependent creation, owner switch and receipt failure. Do not call injected faults physical browser/device evidence — destructive quota exhaustion and suspended-device behavior remain M7 checks — cost if wrong: platform-specific failure behavior can still differ despite validated adapter boundaries.

28. Continue the successful fresh second Task6 verification prefix after the browser setup fix, sealing its complete counts/log and every tracked non-document source except the changed isolated selection harness; new privacy helper/tests are sealed too. Final continuation rejects any hash/count/failure/skip mismatch, reruns all tool cases plus actual storage/application browsers, current build/assets/syntax/diff. Every VM/Chrome/Functions/emulator case already ran fresh in this task; none is omitted or claimed from Task5. No application/backend/test source changed after that prefix — cost if wrong: evidence continuation is invalidated and the entire gate must run again.

29. Seal only unchanged production/test sources for VM/Chrome/Functions/emulator reuse within this task; four explicitly named changed QA harness files rerun in the final continuation, including current14 tool cases and actual browsers. Console auditing now requires complete bounded five-row pages and expanded messages with no CLI truncation, with contents kept only in RAM — cost if wrong: a diagnostic collection problem stops verification rather than permits a private-data claim. All failed gates remain preserved.

30. physical Android/iOS restart, exhaustion and suspension remain M7 gates; injected desktop clocks/storage do not establish device behavior — cost if wrong: unsupported mobile durability claims or lost local drafts.

31. physical OS chooser behavior remains M7; current automation verifies official input/change boundary — cost if wrong: unusable attachment selection on a target device.

32. screen readers and physical tablet accessibility remain M7; responsive/200% contracts are the present evidence — cost if wrong: inaccessible controls on untested devices.

33. legacy preference migration under real contention remains a staging gate; isolated fixtures prove no load fix — cost if wrong: timeouts during concurrent migration.

34. protected account deletion and local-store cleanup remain next M7a scope — cost if wrong: no secure deletion flow until implemented and verified.

35. deployed App Check, indexes/rules, Google sign-in, APNs/FCM, signing, backup/restore and production deployment remain M7/M8 gates; no production-readiness claim — cost if wrong: unavailable or unprotected live services.

36. no extra encryption beyond browser/OS storage boundaries in M6b, as scoped — cost if wrong: device compromise exposes locally stored financial details.

37. old accepted rows remain permanent local history; automatic pruning is optional and deferred — cost if wrong: local storage growth over time.

38. unchanged M6a attachment internals retain their prior review; M6b reviews changed integration/lifecycle — cost if wrong: latent unchanged attachment defect remains beyond this review.

39. explicit dismissed state retains rejected intent/attempt/failure in local history, with unchanged SQLite/command JSON fields; unknown state readers fail visibly — cost if wrong: old app versions require upgrading to manage dismissed local rows.

40. bounded owner/resource-indexed creation lookup replaces unresolved-only inference, includes terminal parent history and excludes catalog edits — cost if wrong: this store interface and SQLite JSON expression require all future adapters to retain equivalent lookup semantics.

41. post-enqueue storage failures become uncertain availability, preserving the original editor draft and ID; pre-enqueue failures never claim durable queuing — cost if wrong: a durable but not attempted action may require explicit verification rather than immediate editable resubmission.

## Outstanding release work

M6b is locally verified. M7 must still implement protected account deletion and
complete native/device/accessibility/operations checks. M8 needs actual staging
and production environment gates. The live Hosting site remains the earlier
preview; no provisioning, region choice, paid billing, backend deployment or
emulator artifact publishing occurred in this milestone.
