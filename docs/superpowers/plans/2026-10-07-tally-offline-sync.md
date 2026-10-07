# Tally durable offline sync implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Continue inline on `main`; preserve every milestone ledger through M8. One fresh whole-plan review follows all tasks.

**Goal:** Persist financial actions before sending, recover them after restart, and show pending changes honestly without changing canonical balances.

**Architecture:** A UID/environment-scoped Drift outbox feeds a fenced sync engine that replays the existing protected owner commands. A durable gateway preserves accepted repository DTOs and signals queued submissions to the shared action layer. Pending UI and receipt files remain separate from canonical financial records.

**Tech Stack:** Flutter/Dart, Riverpod, official FlutterFire, Drift/SQLite native and web WASM; existing Node22 Firebase emulators.

**Spec:** `docs/superpowers/specs/2026-10-07-tally-offline-sync-design.md`

## Global constraints

- `main` only; no new branches/worktrees. Preserve user `.ignore` and prior SDD ledgers.
- No Firebase imports in domain models/engine; no Firebase calls in widgets.
- Version1 immutable JSON, maximum65,536 UTF-8 bytes, exact integers,16 dependencies/depth,1,000 unresolved rows per UID.
- Server payment records and receipts remain authoritative. No client ledger/aggregate writes or relaxed rules.
- Native private background SQLite; trusted web storage accepts only opfsShared/opfsLocks/sharedIndexedDb. Unsafe/in-memory fallback never claims durable saving.
-20 calls/batch,30-second start budget,20-second network wait,60-second fenced leases;1-second initial jittered retry,5-minute ceiling.
- Pending/canonical amounts never combine. Currency buckets and civil financial dates remain distinct from UTC audit/lease instants.
- Explicit accepted/queued/rejected UI; unknown storage/schema and quota errors preserve drafts.
- One pending receipt per command,10 receipts/100 MiB per owner,10 MiB per file; web holds at most one selected file in memory with reselection copy.
- No paid provisioning/deployment or production data in tests. Keep Blaze/region decisions pending; real devices/staging are M7 gates.

## Review focus

1. Same ID replay after a server commit and client crash must create one canonical payment; Task3 and Task6 assert it.
2. Unsafe browser storage, quota or future schema must never display Waiting to sync without durable commit; Task2 and Task4 assert it.
3. Parent rejection, cancellation or another UID must block dependent payment dispatch without changing payloads; Task1, Task3 and Task4 assert it.
4. Suspended tabs/clock jumps/stolen leases must reject late acknowledgements and preserve identical retry identity; Task2 and Task3 assert it.
5. Automatic deduction racing an offline manual payment and a failed receipt must preserve canonical balances/history; Task3, Task5 and Task6 assert it.

## Files and boundaries

`features/sync/domain` owns frozen command/type/identity, outbox state/contracts,
submissions, capability and the pure engine. `data` owns Drift schema/store,
conditional native/web opening, raw transport adapter and durable gateway.
`presentation` owns UID providers, Sync screen, pending cards/details and optional
receipt coordination. Existing feature repositories retain accepted DTO contracts;
shared and notification action layers explicitly translate queued signals.
No single file owns storage, dispatch, financial validation and UI together.

### Task 1: Immutable commands, identity and outbox contracts

**Files:** Create `lib/features/sync/domain/{command_name,frozen_command,command_identity,outbox_entry,outbox_store,command_submission,sync_capability}.dart`; tests `test/features/sync/{frozen_command,command_identity,outbox_entry}_test.dart`; shared fixtures `test/fixtures/sync/command-identities.json`; Functions parity test `functions/test/offline_identity.test.ts`.

**Interfaces:** `CommandName` stores the exact20 callable strings named in the spec. `FrozenCommand(owner,id,name,payload,resourceKey,dependencies,createdAt)` deep-copies/freezes JSON, exposes schemaVersion/payloadJson/payloadHash. `predictedCommandId(OwnerUid,CommandId,String role)` implements the existing server ID contract for obligation/instance/contact/source/category roles. `OutboxState`, `OutboxEntry`, `DispatchLease`, `LeasedCommand` are immutable and owner-bound. `OutboxStore` exposes owner, `enqueue`, `get`, bounded `watch/getPage`, `claimDispatch`, `claimNext`, fenced `complete/defer/reject`, `releaseDispatch`, `cancelUnsent`, `retry`, `close`. `CommandSubmission<T>` has accepted(value) and queued(commandId); `QueuedCommand implements Exception` is the gateway signal. `SyncCapability` distinguishes durable availability and safe failure causes.

- [ ] Write tests: caller mutation cannot change nested frozen payload or hash; reordered JSON has identical identity; invalid/float/unsafe integers/oversized UTF-8/foreign or duplicate dependencies/non-UTC dates fail; unknown callable/version/state fails; golden TS/Dart IDs match literals; queued outcome has no invented canonical ID/revision/value.
- [ ] Run `flutter test test/features/sync --reporter expanded` and the new TS test through build; Expected RED absent contracts, not malformed test fixtures.
- [ ] Implement the named pure contracts. Store signature details are documented in its API; token/generation/deadline are checked values, not mutable bags. Dependencies reference command IDs in the same owner scope. UI title/amount comes from validated drafts, not arbitrary raw exception strings.
- [ ] Run focused tests plus analysis; Expected all pass. Named whole task gate `flutter analyze && flutter test --reporter expanded && npm --prefix functions run check`. Commit `feat: define durable financial command contracts` after the gate, then correct the completion commit range.

### Task 2: Durable SQLite and safe platform capability

**Files:** Create `lib/features/sync/data/{outbox_database,drift_outbox_store,outbox_open,outbox_open_native,outbox_open_web}.dart`, generated database companion, `web/drift_worker.dart`, pinned worker/WASM assets and manifest, `tool/{build_outbox_assets.mjs,outbox_storage_probe.dart,test_browser_outbox_storage.mjs}`. Modify `pubspec.yaml/lock`, web build scripts and Hosting MIME configuration only as required. Tests `test/features/sync/drift_outbox_store_test.dart` and `test/web/sync_capability_test.dart`.

**Consumes:** Task1 frozen commands, state, owner-bound store and lease types. **Produces:** `openOutbox({required OwnerUid owner,required String environmentKey,required bool trustedDevice})` returns an opened `OutboxStore` plus `SyncCapability`; `DriftOutboxStore` implements every Task1 store method with SQL transactions. Inject an executor/private path into native tests, without production test-only APIs.

- [ ] Write real SQLite close/reopen/re-enqueue tests, same-ID conflict,1,000-row limit, dependency rejection/cancellation, per-resource ordering, leased row reclaim, late/stolen acknowledgement, clock jump, different owners/environments and unsupported schema. Write capability tests for every supported/unsafe mode and failed probe/open/quota.
- [ ] Run focused tests; Expected RED missing adapter, then inspect actual installed package APIs. Resolve/pin compatible maintained Drift/SQLite/generator dependencies and record worker/WASM provenance before using assets.
- [ ] Implement owner-scoped background native DB and safe web opening. Use monotonic insertion sequence, transactional owner/row lease fences and strict bounded row decoding. Do not erase unknown schema or silently use memory. Failed local writes never return a queued result.
- [ ] Build an isolated localhost storage probe and run it in actual Chrome through the guarded browser tool: create row, close/reload, reopen it, and run two tabs contending for the same dispatch lease. Expected one lease holder and durable unchanged payload. Refuse non-local origins or live Firebase access.
- [ ] Named whole task gate includes full Flutter/Functions tests, actual Chrome capability contracts, asset provenance check and actual storage probe. Commit `feat: persist owner commands in safe local storage` after GREEN.

### Task 3: Retry-safe engine and protected transport

**Files:** Create `lib/features/sync/domain/{sync_engine,command_transport,retry_policy,command_dependencies}.dart`; `data/{firebase_command_transport,durable_owner_commands,command_result_validation}.dart`; tests `test/features/sync/{sync_engine,retry_policy,durable_owner_commands}_test.dart`; server receipt contract `firebase/emulator-tests/offline-sync.test.mjs`.

**Consumes:** Task1/2 store, lease, frozen payload and prediction contracts. **Produces:** `SyncEngine.submit(FrozenCommand): Future<CommandSubmission<Map<String,Object?>>>`, `flush(): Future<void>`, `retry(CommandId): Future<void>`, `dispose(): Future<void>`; injected `CommandTransport.execute(FrozenCommand)` and result validator, UTC/monotonic clocks and jitter. `DurableOwnerCommands` implements the existing `OwnerCommandGateway`: accepted returns verified Map, queued throws QueuedCommand, known failures remain FinancialFailure. Noncatalogue endpoints use raw transport.

- [ ] Write tests: persist before any call; actual failed persistence produces no call/saved claim; lost server acknowledgement retries same ID/payload; duplicate wakes serialize; accepted and rejected rows persist; identity mismatch cannot overwrite; blocked resources do not prevent independent commands; dispose/UID switch rejects late result;20/30/20/60 limits and retry1 second/5 minutes hold.
- [ ] Write dependency tests for pending finite obligation/catalog create IDs, missing/foreign/cyclic/deep links, immutable dependent payload, rejected/cancelled parent and existing accepted parent. Recurring/installment payments require canonical periods. Add real emulator receipt cases for duplicate manual payment and automatic payment racing an old queued manual amount.
- [ ] Run focused RED, then implement engine using Task2 atomic leases. Reuse current callables and permanent receipts; no new server financial handler. Classify errors exactly as specified and validate accepted response shape/identity before local acceptance. Cancellation after an uncertain attempt requires reconciliation.
- [ ] Run focused GREEN, actual Dart hot reload/runtime check, then named whole Flutter/Chrome/Functions/emulator gate. Commit `feat: reconcile durable financial actions safely` after GREEN.

### Task 4: Honest pending UI and owner-scoped providers

**Files:** Create `lib/features/sync/presentation/{sync_providers,sync_screen,pending_actions,pending_obligation_detail,pending_payment_rows,submission_feedback}.dart`. Modify shared `financial_actions.dart`/`financial_providers.dart`, owner shell/router, obligation/payment/installment/recurring/catalog editor consumers, notification actions and Settings. Map all callers before edits; record the actual exhaustive paths in the task ledger. Add provider/action/widget tests and `tool/test_browser_offline_sync.mjs`.

**Consumes:** Task3 submit/queue signals; Task1 submissions; Task2 capability/store streams. **Produces:** `syncEngineProvider`, `outboxStoreProvider`, `rawOwnerCommandGatewayProvider`, UID-scoped pending streams, action methods returning `Future<CommandSubmission<T>?>`, and a Settings Sync route. Repository accepted DTO methods remain unchanged.

- [ ] Write tests: accepted navigates to canonical detail; queued closes with Waiting to sync and displays separate pending history; quota/unsafe storage retains draft with no false saved state; owner switch clears rows/workers; cached/uncached truth, duplicate Save, rejection review and accepted-before-stream states preserve identity. Queue a payment against a new pending finite draft; assert no canonical balance mutation.
- [ ] Observe RED, then integrate raw/durable providers without cycles. Keep pending amounts out of dashboard/calendar/reminders, use friendly labels, provide trusted web device choice and safe unavailable-storage recovery. Updating a rejected draft produces a new ID while retaining the original.
- [ ] Verify all widths/themes/200% text and keyboard actions; exact currency separation; attachment/notification network endpoints are never queued. Actual localhost browser disables network, saves a payment, reloads, restores connectivity and sees one canonical payment plus correct remaining amount.
- [ ] Named whole gate includes full existing suites and actual browser offline/reload/account-switch scenarios. Commit `feat: show pending payments and sync recovery` after GREEN.

### Task 5: Pending receipts independent of financial saving

**Files:** Create `lib/features/sync/domain/{pending_evidence,pending_evidence_store}.dart`, `data/{pending_evidence_open,pending_evidence_native,pending_evidence_web}.dart`, and `presentation/{pending_evidence_coordinator,pending_receipt_picker}.dart`. Modify payment/pending detail selection controls and private attachment integration at their explicit capability boundaries. Add `test/features/sync/{pending_evidence_store,pending_evidence_coordinator,pending_evidence_widgets}_test.dart` and guarded browser evidence cases.

**Consumes:** Task3 accepted result identity, Task2 local transaction/store and existing M6a AttachmentPicker/AttachmentsRepository. **Produces:** `PendingEvidenceStore` with owner-bound persist/read/remove/close, `PendingEvidenceCoordinator` that reserves/uploads only after accepted payment, stable persisted reservation/upload IDs and metadata, and truthful native-durable/web-reselection capabilities.

- [ ] Write RED: native receipt survives close/reopen with checksum; unsafe/copy/quota failure leaves payment queued/accepted intact;10-file/100 MiB caps; edited/missing bytes fail visibly; owner switch cannot upload; lost reserve/upload response retries identical evidence IDs; server rejection preserves local file; explicit cancellation removes only its file; web reload requires reselection without pretending publication.
- [ ] Implement atomic private file writes/rename and separate evidence metadata; preserve canonical payment history and existing attachment ownership/token/generation fences. No financial command is rewritten or repeated because a file failed.
- [ ] Verify native IO contract honestly as IO evidence; actual browser receipt failure after accepted/offline payment keeps one payment and original balance. Physical device restart/export remains M7.
- [ ] Named whole existing suites plus receipt scenarios must pass. Commit `feat: preserve pending receipts without changing payments` after GREEN.

### Task 6: End-to-end evidence and whole-plan handoff

**Files:** Update `docs/quality/offline-sync-verification.md`, actual screenshots/manifest and roadmap; strengthen guarded browser/emulator cases only for uncovered risks.

**Consumes:** All preceding public contracts and their ledgers. **Produces:** reproducible local evidence and an explicit M7/M8 handoff.

- [ ] Exercise actual offline payment/reload/reconnect, new pending parent/dependent payment, parent rejection, two tabs, owner switch, unsafe/quota storage, automatic/manual conflict and failed receipt. Assert immutable payment count, correct partial/full remaining, currency isolation and absence of private tokens/data in console diagnostics.
- [ ] Inspect desktop/mobile light/dark captures, keyboard/200% text and live Dart errors after hot reload. Keep screenshots genuine and no production data.
- [ ] Run one final complete gate: analyzer, all Flutter tests, actual Chrome contracts, Functions tests, fresh full emulator suites, guarded browser storage and application flows, emulator web build, asset integrity/tool syntax/git diff checks. Expected zero failing/skipped required cases; report device/staging limits explicitly.
- [ ] Commit verification after GREEN. Dispatch the one authorized fresh whole-plan reviewer with BASE, spec, plan, Review Focus and every ledger ruling. Re-grade all findings; one Important/Critical RED→GREEN fix pass plus GREEN suite, Minor rulings; no second review. Preserve this workspace and all prior milestones for M8.
