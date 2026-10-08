# Tally M7a — account deletion implementation plan

> Execute inline with `superpowers:executing-plans`, TDD and one final whole-plan
> review. Work on `main`; preserve milestone evidence through M8. The user already
> selected execution of the full roadmap. Do not create a branch/worktree or ask
> for another routine execution-method confirmation.

**Spec:** [Protected account deletion](../specs/2026-10-08-tally-account-deletion-design.md).

**Goal:** Users can request protected deletion after recent authentication. The
server cleans cloud data in retry-safe pages; Flutter clears only the accepted
owner's current-device data and reports failures honestly.

## Constraints and file responsibilities

No production provisioning, paid project changes, region selection, deployment,
real-user deletion or secrets. Use official FlutterFire, existing owner callable,
profile lock and permanent UID fence. Keep financial history unchanged until the
explicit deletion request is accepted. Deletion is excluded from financial
outbox enum and transport. Preserve `.ignore`. M6b verification finished in `490cdc0`: the complete post-review gate passed
710 VM/44 Chrome/15 tools/133 Functions/144 emulator cases plus actual browsers.
Writing this plan changes no runtime.

Backend units:

- `functions/src/accounts/deletion_contract.ts`: exact envelopes, token recency,
  typed job/view parsing, schema/fence validation and bounds.
- `functions/src/accounts/deletion_service.ts`: atomic request/profile lock,
  sanitized status and idempotent replay.
- `functions/src/accounts/deletion_jobs.ts`: lease/progress/retry and bounded
  prompt/scheduled dispatcher.
- `functions/src/accounts/deletion_worker.ts`: phase orchestration with typed
  Auth/Storage dependencies and owned Firestore pages.
- `functions/src/accounts/deletion_storage.ts`: official Storage generation
  listing/deletion adapter; no financial API calls.
- `functions/test/account_deletion.test.ts`: pure contract/lease policy cases.
- `firebase/emulator-tests/account-deletion.test.mjs`: actual request, worker,
  Auth/Firestore/Storage, ownership and concurrent failure paths.

Flutter units (feature paths are under `lib/`):

- `features/accounts/domain/{account_deletion,recent_authentication,owner_local_cleanup,deletion_handoff_store}.dart`:
  immutable models and ports.
- `features/accounts/data/{firebase_account_deletion_repository,firebase_recent_authentication,deletion_handoff_store,owner_local_cleanup,owner_local_cleanup_native,owner_local_cleanup_web,owner_local_cleanup_stub}.dart`:
  network and platform adapters, validated owner/environment handoff.
- `features/accounts/presentation/{account_deletion_controller,account_deletion_providers,account_deletion_screen,deletion_session_host}.dart`:
  root-lived handoff, provider composition and focused UI.
- Existing auth snapshot, trust store, sync/evidence/notification/attachment
  lifecycle boundaries gain explicit quiescence/owned cleanup hooks as needed;
  query full callers before changing them.
- `lib/app/app_router.dart`, `lib/app/tally_app.dart` and Settings add the nested
  route/host. Keep six main navigation destinations and original design.
- `test/features/accounts/`, `test/web/account_deletion_storage_test.dart` and
  `tool/test_browser_account_deletion.mjs` hold actual behavioral verification.
- `docs/quality/account-deletion-verification.md` and
  `docs/operations/account-deletion.md` record evidence and recovery limits.

## Task 1: Recent-authenticated request and permanent acceptance fence

**Interfaces**

Produces `validateDeletionRequest(uid, input): {commandId: string}`,
`requireRecentAuthentication(authTime: unknown, now: Date): void`,
`requestAccountDeletion(uid, input, authTime, db, now?): Promise<DeletionView>` and
`getAccountDeletionStatus(uid, input, db): Promise<DeletionView | null>`.
`DeletionView = {userId: string, status: 'pending'|'leased'|'needsRecovery'|'complete', step: DeletionStep}`.
Consumes existing `ownerCallable`, exact envelope and profile revision contract.
Job/schema/steps/fields and 300-second recency/30-second future skew are pinned by
the spec; completed tombstones use the explicit minimized four-field format.

1. Write contract tests: fresh 300 seconds accepted; 301 seconds/missing/string/
   non-finite/future 31 seconds rejected; wrong owner/confirmation/extra keys
   rejected; malformed or mismatched jobs never replay. Token `iat` is not used.
   **Run:** `npm --prefix functions run check`. **Expected:** new assertions RED.
2. Implement the contract/service and export both callables from `index.ts`.
   First request transaction reads job/profile before any writes, locks an active
   schema-1 profile and creates one pending job. Duplicate accepted jobs return
   their view, preserve original request ID and do not re-lock/revise the profile.
   Status performs no mutation and returns only the owned view.
3. Add actual emulator cases: duplicate concurrent requests create one job;
   normal commands/reads denied after lock; bootstrap cannot recreate a missing
   profile with the job; wrong UID and stale auth leave active records unchanged.
   **Run:** `npm --prefix functions run check && npm run test:emulators`.
   **Expected:** all pure tests and every discovered emulator file GREEN.
4. Commit request/fence and evidence; no Flutter delete button until worker exists.

## Task 2: Resumable privileged cleanup and late-event safety

**Interfaces**

Consumes Task 1 job/view/validation. Produces
`dispatchAccountDeletionJobs(db, dependencies, injectedNow?, limit?): Promise<{examined:number, processed:number}>`,
`runAccountDeletionJob(uid, db, dependencies, clock?): Promise<boolean>`,
`AccountDeletionAuth.revokeAndDisable(uid)/deleteIdentity(uid)` and
`AccountDeletionStorage.listOwned(uid, limit)/deleteGeneration(uid, name, generation)`.
Clock supplies UTC and monotonic elapsed time. Lease is 120 seconds; each run
starts at most ten pages/60 monotonic seconds, 200 documents or 100 generations
per page, network timeout 20 seconds. All status writes use token/generation fences.

1. Write RED cases for partial Storage/Firestore failure, stolen lease, missing
   Auth, more than 500 owned records, transferred token binding and nested/unknown
   collections. Expected: unrelated owner preserved; original selected generation
   retried; incomplete cleanup cannot mark complete or remove the profile fence.
2. Implement claim/progress/retry, the explicit collection registry and worker
   phases in the spec's order. Re-read job/ownership during top-level deletions.
   Storage selection is persisted before its generation-conditioned deletion.
   Delete first bounded pages until empty. Unknown structures enter needsRecovery.
   Successful completion removes Auth/profile and minimizes the permanent fence.
3. Wire prompt and scheduled sweep, respecting demo-only manual mode. Add status+
   nextRunAt and status+leaseExpiresAt indexes. Extend actual late-upload tests:
   absent/deleting owner generates only private generation cleanup, never finance
   or ready attachments. Temporary late cleanup may outlive job completion.
4. **Run:** `npm --prefix functions run check && npm run test:emulators`.
   **Expected:** complete suite GREEN, retry/crash/race assertions executed.
   Commit worker, indexes, tests and recovery contract.

## Task 3: Current-device cleanup with restart-safe acceptance marker

**Interfaces**

Produces `OwnerLocalCleanup.quiesceAndPurge(OwnerUid owner, String environment): Future<void>`
and `DeletionHandoffStore.read/write/remove` for strict owner/environment records.
Handoff fields: schemaVersion=1, userId, environment, requestId,
`phase: uncertain|accepted|cleanupRequired`. No password, credentials or tokens.
Consumes existing hashed database names, platform open/close implementations,
profile snapshot/trust preferences and captured owner worker handles.

1. Write RED tests: accepted Alice cleanup preserves Bob/staging stores; uncertain
   requests cannot purge; native bytes/SQLite/preferences gone only after handles
   close; a late profile snapshot cannot reappear; file/open failure leaves an
   accepted retry marker; malformed/future markers or foreign DB scope do not erase.
2. Implement owned quiescence and preference-write barriers. Persist accepted
   marker before local deletion. Block owner reopen/writeback while marker exists.
   Native validates exact known private paths. Web uses `WasmDatabase.probe` and
   `WasmProbeResult.deleteDatabase` only for two exact owner database names; test
   blocked second tab and clear only after owner connections stop. No global clear.
3. Add root startup marker recovery and explicit retry, independent of signed-in
   feature disposal. Close Blob selections and notification/attachment readers;
   do not sign out a replacement UID. Keep failures separate from server acceptance.
4. **Run:** `flutter analyze && flutter test --reporter expanded` plus actual
   Chrome storage contracts. **Expected:** all suites GREEN and exact namespaces
   preserved. Commit cleanup/marker adapters and tests.

## Task 4: Network repository and provider reauthentication handoff

**Interfaces**

Produces `AccountDeletionRepository.request(CommandId)/status(): Future<DeletionView?>`,
`RecentAuthentication.providers: Set<ReauthenticationProvider>` and
`reauthenticate(owner, {password?, provider?}): Future<void>`.
Controller `submit(confirmation, authentication)/retryOriginal()/retryCleanup()`
keeps one original owner/environment/request identity until a definitive result.
Consumes Task 3 cleanup/marker and Task 1 response. Root provider host survives
owner feature disposal; Firebase DTO parsing verifies exact owner/response shape/enum.

1. Write RED Riverpod/domain cases: wrong password/provider UID; offline request;
   lost response; original same-ID retry; profile scope disappears before response;
   owner switches during reauth/request/cleanup; cleanup failure after acceptance.
   Assert no destructive call before correct confirmation/recent reauth, no purge
   on uncertain result, no replacement-user UI/sign-out, and one server request ID.
2. Implement raw network-only repository and separate official FlutterFire reauth
   adapter. Use email credential and web Google popup/native Google credential,
   original UID checks and forced refresh; no client `User.delete()` fallback.
3. Implement handoff state/controller using strict DTOs, accepted marker and
   captured services. First request errors can retry; accepted UI says deletion
   requested while server finishes. Clear secret text immediately after reauth and
   on disposal. Background callbacks must not publish into another owner scope.
4. **Run:** `flutter analyze && flutter test --reporter expanded`.
   **Expected:** complete suite GREEN. Commit adapters/controller and tests.

## Task 5: Settings confirmation and responsive account flow

**Interfaces**

Consumes Task 4 typed controller. Adds `/settings/account/delete` and root handoff
host through existing `go_router`; retains main navigation and visual tokens.

1. Write RED widget cases at 400/800/1440 widths, light/dark, 200% text: keyboard
   controls, no overflow, cancel preserves data, incorrect DELETE/unchecked box
   blocks submission, email/Google options reflect linked providers, duplicate
   submit disabled, offline uncertainty and accepted cleanup failure copy honest.
2. Add small account confirmation/progress widgets and Settings action. Follow
   spec's irreversible copy; never show job internals/lease IDs or bank terminology.
   Signed-out completion handles disposed owner scope without a private-data flash.
   Preview labels feature unavailable; emulator execution uses only synthetic users.
3. **Run:** `flutter analyze && flutter test --reporter expanded`; actual live
   Dart hot reload/runtime inspection and representative browser renders.
   **Expected:** complete suite GREEN and no runtime/layout errors. Commit UI/tests.

## Task 6: Actual deletion journey and operational handoff

**Interfaces**

Consumes Tasks 1–5. Produces the guarded emulator/browser journey and truthful
verification/recovery documentation. No production or real-user data.

1. Actual browser: create two synthetic owners, seed payments/receipts/local
   actions, confirm/reauthenticate/request Alice deletion, verify immediate rule
   and callable denials, run resumable worker, assert Alice cloud/Auth/Storage
   removed and only minimized UID fence remains. Assert Bob cloud/local data
   intact and Alice current-device local stores/preferences removed after acceptance.
2. Exercise response loss, app reload, two-tab blocked purge and late generation
   upload, without weakening required tests or showing credentials in diagnostics.
   Compare actual light/dark/responsive captures with the original Tally design.
3. Document needsRecovery/transient retry, collection-registry upgrades,
   generation/retention failures, safe counts/logging, minimal tombstone and
   physical/staging/backup limits. Record current tool/check.sh release-emulator
   mismatch for M7b separately; emulator artifacts remain nondeployable.
4. **Run:** format/analysis, all VM/Chrome/tool/Functions/emulator suites, owned
   storage/application browsers, debug web build/assets/syntax/diff checks.
   **Expected:** every required case GREEN, no skipped required tests, no private
   diagnostic marker or unhandled Flutter error. Commit evidence and implementation.
5. Dispatch one fresh whole-plan reviewer, re-grade by user effect, make one TDD
   fix pass for Important/Critical and record all rulings/minors. Preserve workspace
   through M8; no re-review or branch/worktree workflow.

## Review Focus

1. Server accepts deletion, client loses response/profile scope: original ID retry
   establishes acceptance before any local draft is discarded. Tasks 1, 4 and 6.
2. Worker loses lease after deleting a page or selecting an object: stale progress
   cannot complete the job or delete a replacement generation. Task 2.
3. A token binding transfers to Bob after the Alice query: transaction protects
   Bob's current binding, files and financial data. Task 2.
4. Web second tab or native preference write remains active: cleanup blocks/retries
   honestly; late snapshot writes cannot recreate accepted owner's data. Tasks 3, 6.
5. Delayed upload/financial/notification callbacks after profile deletion: UID fence
   prevents bootstrap/financial resurrection and generation cleanup still works.
   Tasks 1, 2 and 6.
