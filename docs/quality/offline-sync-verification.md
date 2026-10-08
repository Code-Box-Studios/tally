# Durable offline financial actions

Tally saves supported changes on a trusted device before attempting network
delivery. A queued action appears as **Waiting to sync**, separately from
confirmed balances. Firebase payment documents and permanent command receipts
remain authoritative. A network failure alone never means a payment was saved.

## Behavior and boundaries

Commands retain their original owner, environment, callable, ID and frozen
payload through retries and restarts. Parent dependencies and resource ordering
block unsafe dispatch. Rejected actions remain reviewable; correction creates a
new command instead of rewriting the rejected one. An uncertain attempted
action must reconcile before cancellation can discard it.

Native storage uses private background SQLite. Web storage requires explicit
device trust and a successfully opened `opfsShared`, `opfsLocks` or
`sharedIndexedDb` implementation. Unsafe fallbacks, quota failures and unknown
schemas preserve the draft and do not claim durable saving. Signing out hides
the previous owner's pending records and stops their worker. Signing back into
that same owner can resume the unchanged records.

Pending payments do not alter dashboard totals, reminders, calendar balances or
currency buckets. Cold offline Home displays unavailable/updating summaries
rather than an invented zero. The public service worker caches only the bounded
application shell and its required SDK modules. It does not cache private
financial responses, authentication responses, receipts, callable responses or
FCM transport. Firestore persistent financial caching remains disabled.

Receipts have a separate owner-scoped store and upload saga. Native private
copies survive a store restart; browser metadata survives but selected file
bytes require the original file again after a full document reload. The limits
are one receipt per action, ten files and 100 MiB per owner, and 10 MiB per file.
Retries keep their saved evidence identity. Explicit removal followed by a new
selection starts a new evidence attempt. Legacy metadata keeps its original
identities. A rejected or failed receipt does not repeat, reverse or edit the
financial command. Cached attachment metadata cannot delete a private copy;
matching fresh server publication is required.

## Evidence layers

| Risk | Executed evidence | Limit |
| --- | --- | --- |
| Frozen identity, exact integers and bounded payloads | Dart/Chrome command contracts and shared TypeScript ID fixtures | Not a migration of unknown future formats |
| Restart, quota, dependency rejection, cancellation, stolen leases and clock jumps | Real SQLite store tests and injected-clock engine contracts | Controlled clocks/transport, not physical suspended devices |
| Safe web storage and two-tab ownership | Compiled SQLite WASM probe, real Chrome reload and competing tab leases | One local Chrome environment |
| Lost server acknowledgement | [Emulator replay case](../../firebase/emulator-tests/offline-sync.test.mjs) and engine restart contracts | Emulator transport, not deployed retry latency |
| Offline payment and full reload | [Compiled application harness](../../tool/test_browser_offline_sync.mjs), genuine blocked uncached request, `location.reload()`, navigation type and disappearing RAM marker | Synthetic localhost account |
| Pending parent and dependent payment | Same browser harness: canonical collections empty offline, exactly one parent/payment after reconnect | Finite obligation; recurring/installment payments require canonical periods |
| Automatic/manual race | Emulator automatic deduction wins, old queued amount rejects without a duplicate payment | Controlled server job invocation |
| Full/partial payments and currency separation | [Payment emulator cases](../../firebase/emulator-tests/payments.test.mjs), projection and UI contracts | No foreign-exchange conversion |
| Receipt restart/failure/ownership | Real native private-file IO, coordinator contracts, browser metadata reload and owner switch | Desktop IO is not Android/iOS restart proof |
| Themes, responsive controls and keyboard | Actual 400/800/1440 renders and focused Enter navigation; widget cases also exercise 200% text | Screen readers and physical devices remain release gates |
| Console privacy and runtime | Per-phase reported Chrome diagnostics, expanded arguments, exact synthetic passwords and private markers; live Dart hot reload/error collection | Checks the bridge-reported representation, not hidden values absent from it |

The browser flow starts with a 1000 PHP obligation. A 300 PHP payment is saved
offline while canonical payment count stays zero. Full offline reload retains
the pending action. Reconnection creates exactly one 300 PHP payment and leaves
700 PHP remaining. A failed receipt creates no canonical attachment and does
not change that payment or balance. A second account cannot see or dispatch the
first account's next pending payment or receipt.

A second offline flow creates a 1250 PHP obligation and a dependent 250 PHP
payment. Neither canonical collection changes while offline. Reconnection
creates one parent and one payment, links the payment to the predicted parent,
and leaves exactly 1000 PHP remaining. The pending 1250 PHP never appears in
confirmed dashboard totals.

Browser receipt automation supplies a real synthetic `File` through the official
file-selector input/change boundary because the automation bridge cancels the
system chooser. Picker ownership, hashing, Blob cleanup, SQLite and SDK transport
remain real. This proves that boundary, not the physical OS chooser.

Earlier Task 4 fragment navigation was insufficient evidence of a cold restart.
The strengthened final harness explicitly reloads the entire document and
checks both navigation type and loss of an ephemeral RAM marker. The separate
SQLite storage probe already used a genuine reload.

## Reproduction and final gate

Use the locked Flutter/Dart dependencies, Node 22 and Java 21. Browser tools
refuse anything outside their owned localhost endpoints and `demo-tally`.
Start the compiled debug application on `localhost:7364` and its owned Chrome
debug endpoint on `127.0.0.1:36931`. The complete milestone gate runs formatting,
analysis, all VM tests, Chrome contracts, Node tool tests, Functions checks,
fresh emulator suites, storage probe, debug web build, public-shell preparation,
actual application flows, asset verification, syntax and diff checks.

```sh
flutter analyze
flutter test --reporter expanded
node --test tool/tests/*.test.mjs
npm --prefix functions run check
npm run test:emulators
```

The exact Chrome contract file list and guarded build/browser commands are
preserved in this milestone's plan workspace. Environment-specific paths are
local verification configuration; they are not production Firebase settings.
The final Task 6 verification passed: 700 VM tests, 44 actual Chrome contracts,
15 Node tool cases, 133 Functions tests and all 144 fresh emulator cases, with
zero failing or skipped required tests. Actual storage and application browser
flows, current debug build, assets, syntax and diff checks also passed. The fresh
whole-plan review follows this verified commit.

The successful fresh Task 6 suite prefix is SHA-256 sealed with its complete
counts and source files. After local browser-harness fixes, continuation reran
all changed tool cases, real browser flows and the build. It rejects changed
financial/client/backend source or incomplete counts. No test result is borrowed
from Task 5. Failed harness runs remain visible in the milestone ledger; none
was reported as a completed gate.

The emulator runner discovers every required test file. It runs the automatic
trigger suite, the legacy notification migration file, and all remaining
deterministic cases in separate fresh emulator processes. Two earlier loaded
runs exposed a legacy preference transaction lock timeout. The exact isolated
case and its complete file passed unchanged. Isolation prevents destructive
fixtures and delayed triggers from contaminating unrelated suites; it is not
a claimed fix for server contention. Real legacy migration under staging load
remains an M7 gate. No assertion or financial case was removed.

## Actual captures

All captures contain synthetic local data and the visible emulator banner.
Original PNG bytes, dimensions, scenario and SHA-256 are recorded in
[the manifest](screenshots/offline-sync/manifest.json).

| Screen | Light | Dark |
| --- | --- | --- |
| Pending action, mobile 400 × 1000 | [Light](screenshots/offline-sync/pending-mobile-light.png) | [Dark](screenshots/offline-sync/pending-mobile-dark.png) |
| Pending action, tablet 800 × 1000 | [Light](screenshots/offline-sync/pending-tablet-light.png) | [Dark](screenshots/offline-sync/pending-tablet-dark.png) |
| Pending action, desktop 1440 × 1000 | [Light](screenshots/offline-sync/pending-desktop-light.png) | [Dark](screenshots/offline-sync/pending-desktop-dark.png) |
| Receipt requiring reselection, mobile 400 × 1000 | [Light](screenshots/offline-sync/receipt-mobile-light.png) | [Dark](screenshots/offline-sync/receipt-mobile-dark.png) |
| Receipt requiring reselection, desktop 1440 × 1000 | [Light](screenshots/offline-sync/receipt-desktop-light.png) | [Dark](screenshots/offline-sync/receipt-desktop-dark.png) |

## M7/M8 handoff

Physical Android/iOS restart, background suspension, picker/export and tablet
behavior remain unverified. Staging must verify Google sign-in, APNs/FCM delivery,
App Check, deployed indexes/rules, real contention and protected attachment
limits. M7 must implement protected account deletion with server fencing and
local outbox/evidence cleanup, then complete accessibility, operational alerts,
backup/restore and release-candidate checks.

The live Firebase Hosting site still serves the earlier preview. This milestone
does not provision a database, enable paid billing, select an irreversible
region, deploy backend services or publish emulator artifacts. Production
release remains M8 after those decisions and actual release gates are met.
