# Tally M6b — durable financial commands

M6a supplies private evidence without changing the financial ledger. M6b makes
obligation and payment actions survive app restart, using a separate local outbox.
Firestore's read cache remains separate. A queued payment is never recorded money.
This design continues the authorized roadmap inline on `main`.

## User-visible behavior

- Save an obligation or payment without connectivity on a supported, trusted
  device. Show **Waiting to sync** only after the local transaction commits.
- Keep pending obligations and payments in a labelled section, separate from
  canonical lists, history, dashboard totals, calendar and local reminders.
- Reconnect or reopen the app to retry the same action ID and frozen payload.
  A lost response cannot produce another payment.
- Queue a payment against a new pending finite obligation with an explicit
  dependency. Failed parent creation blocks the payment and preserves its draft.
- Show **Needs review** for rejected/stale actions. Never silently change amounts,
  references, dates, revisions or currency to make an old action succeed.
- Sign-out closes all local readers/workers. A queue resumes only for its original
  signed-in UID. Unsent changes do not appear on a different device.
- Settings gains **Sync**, without adding a seventh main navigation destination.
  Users can see pending/rejected actions, retry connectivity, inspect failures,
  and dismiss only actions proven never dispatched or definitively rejected.

An accepted command's result may arrive before the canonical stream/projection.
Show **Saved · updating records** during that interval. Do not synthesize an
accepted payment document, instance balance or projection.

## Storage and capability policy

Use Drift with SQLite on native, in a background isolate and the private app
support directory. Use Drift's SQLite/WASM worker on web. Keep database names
scoped to a hash of project/environment and UID; every row also contains UID.
Development, staging and production queues cannot collide.

Web persistence requires the user's trusted-device choice. Probe the actual
storage implementation. Accept only `opfsShared`, `opfsLocks` or
`sharedIndexedDb`. Refuse offline financial submission with `unsafeIndexedDb`,
`inMemory`, failed probe/open, quota errors or unsupported schema. Never fall back
to an in-memory database while advertising restart durability. Supported web
storage still depends on browser retention and device controls; explicit browser
data clearing can erase unsent actions.

Keep the current Hosting headers compatible with Google popup sign-in. Do not
add COOP/COEP merely to force OPFS. Browsers without safe multi-tab storage remain
usable online and explain why offline submission is unavailable. Without durable
storage, online saves claim success only after the protected server result;
uncertain responses remain an explicitly in-session action until reconciled.

Pin compatible Drift/SQLite package and worker/WASM versions in the lockfile and
asset manifest. Verify release downloads and their SHA-256 values, serve WASM
with `application/wasm`, and build the owned worker from the pinned package when
required. Native and web SQLite tests must exercise the real adapter.

Offline browser reopening also needs the public application shell. Build a
versioned owned worker that caches only exact public static assets and pinned
public Firebase SDK modules. It must never cache financial, authentication,
attachment, callable or notification responses. Preserve the existing FCM
worker scope and OAuth-compatible headers. A new shell waits for old clients
to close before activation; QA must verify the controller matches the compiled
manifest version rather than accidentally checking an older cached application.

Keep a small owner/environment-scoped profile preference snapshot on native and
on explicitly trusted web devices. Only a protected bootstrap connectivity
failure may use it, with visible cached provenance. Never fall back after an
explicit authentication, ownership or profile/schema rejection. Missing
canonical financial data remains unavailable or updating; it must not become
fabricated zero totals. Browser retention and an initial online load are still
required, and clearing device data removes unsent changes and snapshots.
The maintained documentation supports [native background databases](https://drift.simonbinder.eu/platforms/vm/),
[web storage detection and worker deployment](https://drift.simonbinder.eu/platforms/web/)
and the [storage implementation enum](https://pub.dev/documentation/drift/latest/wasm/WasmStorageImplementation.html).

## Frozen command and local schema

`FrozenCommand` contains schemaVersion=1, owner UID, command ID, strongly typed
command name, deeply immutable JSON payload, payload identity hash, resource key,
dependency command IDs, and local creation UTC instant. JSON allows null, bool,
string, exact safe integers, lists and string-keyed maps; reject fractional,
non-finite, unsafe, non-JSON and oversized values. Normalize mathematically exact
integer-valued numbers before encoding, because native and JavaScript numeric
runtime types differ. Financial amounts remain integer minor units with existing
domain bounds. [Dart number representation](https://dart.dev/resources/language/number-representation).
Limit payloads to65,536 UTF-8 bytes, dependencies
to16, depth to16, and unresolved rows to1,000 per owner. Local hashes identify
local payloads; they are not substituted for the server's validated receipt hash.

Persist a monotonic insertion sequence, state
`queued|sending|accepted|rejected|blocked|cancelled|dismissed`, attempts, nextAttemptAt,
lease token/generation/deadline, accepted result, safe failure code/message and
timestamps. The owner/command pair is unique. Re-enqueueing the same identity is
idempotent; changing its payload or dependencies is a visible conflict.
Transitions and dependency checks are transactional. Explicitly moving a
rejected action to history records `dismissed`, preserves its immutable intent,
attempts and failure, and excludes it from unresolved quota and trust gating.
Dismissed parents still block dependents. Older readers reject the unsupported
state visibly without deleting history; SQLite and command JSON schemas remain
unchanged. Unknown schema/type or
corrupted rows fail visibly without destructive migration or automatic dispatch.

Accepted local results remain available for reconciliation. Local housekeeping
may prune accepted rows older than30 days only when no unresolved dependency
needs them; permanent server receipts and financial history are never deleted.
Persisted diagnostics contain no auth tokens, FCM tokens, file bytes, bank
credentials or raw exception stacks. This milestone does not promise encryption
beyond the browser/OS storage boundary.

## Commands and identity

Durable commands: create/edit/cancel finite obligations and installments;
recordPayment, recordInstallmentPayment, correctPayment; create/edit recurring
templates, changeRecurringLifecycle, setRecurringAmount, editRecurringInstance,
skipRecurringInstance, confirmDeduction, reportDeductionFailure; saveCatalog;
setObligationReminder and updateNotificationPreferences.

Bootstrap, auth/provider linking, updateProfile, dashboard refresh/repair, device
registration/retirement, markReminderRead, account deletion and all attachment
operations remain network operations. The raw owner gateway remains available to
these paths. Never accidentally enqueue a read-only protected file download.

The server already derives creation IDs using
`role + '-' + SHA256(JSON.stringify([uid + ':' + commandId, role]))`.
Add a pure client predictor with independent shared golden fixtures. A predictor
helps label dependencies; it never becomes an authoritative ID in a creation
payload. Predict obligation/finite-instance and contact/source/category IDs.
Pending installment and recurring creations can sync normally, but recording
against their future periods requires canonical instances after acceptance.

A durable queued handoff ends the UI submission attempt. A new intentional
action receives a new ID even when its payload matches; retries from the outbox
retain the original ID. Storage failure after durable enqueue is uncertain and
keeps the editor's original frozen draft and identity for reconciliation.

Resource keys serialize actions on the same obligation/catalog record. Extract
references to pending catalog/finite-obligation creations into explicit
dependencies before freezing a command. Use bounded indexed creation lookups
that include cancelled and dismissed tombstones, even outside the newest history
page. An open dialog cannot lose its dependency when another tab cancels a parent. Reject cycles, foreign-owner links,
missing local dependencies and unsupported dependency depth. A pending finite
obligation's payment references its predicted obligation/instance IDs, without
rewriting the frozen payment when the parent succeeds.

## Dispatch and reconciliation

`SyncEngine` persists before attempting network work. It calls only the existing
protected FlutterFire owner command transport; Cloud Functions still validate
ownership, revisions, current balances, references and immutable receipt replay.
Retry the identical envelope after a crash/lost response. No new server financial
write path or relaxed Security Rules is introduced.

Use an atomic owner dispatch lease and fenced row leases across browser tabs or
native workers. A batch starts at most20 calls, stops starting work after30
monotonic seconds, and bounds each network wait to20 seconds. A60-second lease
is checked before and after each network stage and transition. Expired/stolen
leases reject late acknowledgements. Detect implausible deadlines after a local
clock jump; safe receipt replay protects competing retries. Owner disposal stops
new calls promptly and rejects late UI publication without waiting for SDK work.

Transient offline/unavailable failures return the row to queued with jittered
backoff starting at1 second and capped at5 minutes. Authentication/permission
failure pauses until the same owner's valid session resumes. Invalid, overpayment
and revision/identity conflicts become rejected; recovery/precondition failures
need review rather than automatic retries. Independent resource queues can
continue when one resource is blocked. Dependencies dispatch only after the
parent is accepted. Parent rejection/cancellation blocks dependent actions.

Before any attempt, an unsent action can be cancelled locally with a retained
tombstone; it is never sent later. Once an attempt may have reached the server,
do not promise cancellation: reconcile its receipt first. Reviewing a definitively
rejected action creates a new ID and retains the prior action for traceability.

## Presentation and existing repository contracts

Keep repository `Future<T>` results as accepted canonical result DTOs; never
invent a DTO/revision to represent a queued action. A durable gateway communicates
its typed `QueuedCommand` outcome to the shared action layer. That layer returns
`CommandSubmission<T>` with `accepted(value)` or `queued(commandId)`, and preserves
known rejection errors. Editors consume these outcomes explicitly and close with
accurate copy. Callbacks navigate to canonical detail only after acceptance;
queued creation opens its local pending detail.

UID-scoped Riverpod providers own capability, local store, engine and queue
streams. Raw transport is injected into the engine; the durable gateway consumes
the engine, avoiding provider cycles. No Firebase calls enter UI widgets. Pending
cards display their own currency; no cross-currency sum or pending/canonical net
balance is created. Current human labels, responsive theme, light/dark mode,
keyboard controls and200% text support remain intact.

## Pending receipt files

An optional receipt must not prevent saving a financial command. Native selection
can be copied atomically to an owner/environment-private directory with its
SHA-256, MIME type and size recorded in a separate local evidence row. Allow one
pending receipt per command, at most10 pending receipts and100 MiB per owner;
the existing10 MiB per-file limit still applies. A quota/copy error leaves the
payment command intact and asks for reselection. Do not put file bytes in command
JSON or logs. Web keeps at most one selected receipt in memory and explicitly
requires reselection after reload.

After a payment is accepted, a separate evidence coordinator uses its canonical
payment ID and the existing private attachment services. Persist stable reservation
and upload command IDs before transport so native restart can reconcile those
steps. A saved receipt attempt keeps its IDs through retry, reselection and restart.
Explicitly removing its local copy and selecting the file again starts a new
evidence attempt, so an expired or removed reservation cannot trap the same file.
Evidence metadata version2 persists that attempt identity; version1 retains its
original file and retry IDs. Only fresh server publication metadata may remove
the pending private copy; cache-only terminal states wait for confirmation.
An attachment failure never replays a new financial payment or changes its
amount. Verify the copied bytes before upload, stop on owner disposal, retain
actionable evidence failures, and remove private local files only after successful
publication or explicit cancellation. M7 protected account deletion removes the
same owner's local database and receipt directory. Explicit save/share exports
remain user controlled.

## Evidence and release gates

Automate immutable JSON/identity, dependency/cycle validation, partial/full
payments, quota and unknown-schema denial, actual SQLite close/reopen,
transactional leases, lost acknowledgement, clock changes, owner isolation,
auto-deduction versus queued manual overpayment, dependent rejection, and unsafe
web storage. Real emulator receipts must prove one canonical payment after retry.
Actual Chrome must prove reload durability and multi-tab lease behavior on the
selected safe storage implementation. Desktop/mobile theme screenshots preserve
the original design. Android/iOS physical restart/storage/suspension checks remain
M7 release gates; desktop IO or browser tests do not establish device evidence.

M6b does not deploy the emulator web artifact, provision paid Firebase resources,
or replace the pending Blaze/database-region decisions. M7/M8 still control
staging, native signing and the production release.

## Final-review lifecycle clarification

Fresh attachment publication can remove local evidence only when a transaction
still finds the same file/attempt, payment and reservation. Watchers retain that
attempt fence; retiring an old observer cannot cancel a replacement observer.
Publication of an earlier upload must never erase a newly selected receipt.
