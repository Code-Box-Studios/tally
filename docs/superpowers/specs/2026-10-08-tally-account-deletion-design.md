# Tally M7a — protected account deletion

## Intent and scope

Continue the authorized Flutter/Firebase roadmap on `main`. Users need a clear,
secure way to remove their Tally account, its cloud financial history, private
receipts and this device's saved actions. Deletion must not depend on keeping
Flutter open, erase another account, or let delayed jobs recreate deleted history.
The user already requested inline execution of the full application roadmap;
this specification records the next architectural decisions without another
routine approval handoff. Implementing this feature does not authorize deleting
the user's actual account. Tests use synthetic `demo-tally` users only.

M7a covers the protected request, resumable backend cleanup, email/Google
reauthentication, current-device cleanup, Settings UI and emulator/browser
verification. M7b retains broader accessibility/operations work. Physical native
devices, deployed providers/App Check, paid provisioning, region selection,
backup/restore and production release remain explicit M7/M8 gates.

## Approach

Use a recent-authenticated callable to atomically lock the profile and create an
owner deletion job. A privileged worker finishes cleanup independently of the
client. This extends the existing `accountDeletionJobs/{uid}` bootstrap fence.

Calling client `User.delete()` alone can leave Firestore/files/jobs behind. One
large synchronous deletion callable can time out after partial work and loses
its client response. A resumable job provides a stable acceptance boundary,
bounded pages, retry-safe cleanup and observable operational failure.

## User journey

Settings gains **Delete account**, inside its existing account section and
navigation hierarchy. The confirmation explains that obligations, payments,
people, recurring history and receipts will be removed, and unsent local actions
on this device will be discarded after acceptance. Users can cancel before
submitting. Require a confirmation checkbox and typed `DELETE`, then reauthenticate
with an existing linked email/password or Google provider. Never log/store the
password, provider credential, ID token or authentication URL.

The final button is **Delete my Tally account**. A successful protected response
means **Deletion requested**, not **Everything deleted**. Accepted deletion cannot
be cancelled. Close private readers/workers, clear this device's owned data and
sign out. The server continues if the app closes. Lost request responses show
**Could not confirm deletion. Retry the original request to verify it.** Local
financial data must not be discarded before server acceptance is established.

Explain that locally retained copies on other devices and manually exported files
require clearing on those devices. Managed backups and Storage retention follow
the configured retention policy; the app must not promise instant erasure from
every backup or from copies outside Tally. Cleanup failure on this device remains
visible with a retry action. Do not display another account's identity or status.

## Protected request contract

`requestAccountDeletion` uses the existing exact owner envelope:

```text
{commandId, expectedOwnerUid, payload: {confirmation: 'DELETE'}}
```

Authenticate and require App Check through `ownerCallable`. Derive UID from the
verified request; reject another `expectedOwnerUid`. For first acceptance, require
a valid active schema-1 profile and integer token `auth_time` in seconds, no more
than 300 seconds old and no more than 30 seconds in the future. Refreshing an ID
token's `iat` does not establish recent authentication. Missing/malformed/old
`auth_time` is a typed recent-login failure. Bounds use the trusted server clock.

In one transaction, create `accountDeletionJobs/{uid}` and set the profile's
`accountStatus` to `deleting`, advance its revision and record server timestamps.
Permanent existing accepted jobs return their sanitized status without creating
another job or requiring fresh authentication for a new destructive operation.
Unknown/mismatched job formats fail closed. Never enqueue account deletion in the
financial outbox or write a financial activity/command receipt that cleanup must
preserve. Its UID job is the idempotency record.

`getAccountDeletionStatus` uses the same exact envelope with `payload: {}`. Return
only `{userId, status, step}` for that authenticated UID. Client reads/writes to
top-level deletion jobs stay denied by Security Rules. The existing profile lock
continues to deny private reads and normal mutations, even while a previously
issued token has not expired. Check profile and job fences before privileged
cleanup; App Check does not replace ownership.

## Job model and worker

Schema 1 job fields: userId, requestCommandId, status, step, collectionIndex,
nextRunAt, attempts, leaseToken, leaseGeneration, leaseExpiresAt, lastErrorCode,
storageObjectName, storageGeneration,
createdAt, updatedAt and completedAt. Statuses: `pending`, `leased`, `needsRecovery`,
`complete`. Steps: `revokeSessions`, `storage`, `tokenBindings`, `ownerCollections`,
`systemJobs`, `deleteIdentity`, `deleteProfile`, `complete`. Store only safe error
codes; no financial values, names, email, file bytes, tokens or raw stack traces.

Claim one owner job with a 120-second generation/token lease. Each invocation
starts at most ten pages or 60 monotonic seconds of new work, whichever comes
first. A page handles at most 200 documents or 100 object generations. Network
calls are bounded to 20 seconds. Check the live lease before each new page and
before publishing progress. Expired/stolen workers cannot advance another
worker's state. Retry transient infrastructure errors with bounded backoff from
30 seconds to one hour; `needsRecovery` is reserved for invalid schema/fences or
unsupported collection structure, with an operational runbook.

Revoke refresh tokens and disable the Auth user before cleanup; an already
missing Auth identity is idempotent. The profile lock is the immediate data fence.
Delete private Storage objects only below the exact `users/{uid}/attachments/`
prefix, never a client path. Persist a selected object's name and generation
before deleting with `ifGenerationMatch`; a lost response retries that generation.
A replacement generation requires a new selection. Respect configured retention
or hold failures rather than claiming completion. List and clean active/historical
generations supported by the deployed bucket policy; record retained backup/soft
delete behavior in the staging runbook.

For `notificationTokenBindings`, query the bounded UID page and transactionally
re-read each binding plus the job lease before deletion. A binding transferred to
another owner since selection is preserved. Use the same ownership recheck for
top-level `systemJobs`; no blind deletion of a stale snapshot.

The current owner schema has flat subcollections. Delete bounded pages under the
known owner root, preserving the profile lock until the last step. Registry:
contacts, obligations, obligationInstances, payments, paymentEvidence,
deductionAttempts, categories, paymentSources, attachments, reminders,
activities, notificationPreferences, notificationDevices, commandReceipts,
ledgerState and summaries. Unknown root collections or nested collections enter
`needsRecovery` before their parent document is deleted; operators must update
the schema/cleanup registry rather than report an incomplete purge as success.
Future features must add their owned collections and deletion tests together.
Repeat the first bounded page until empty, avoiding a cursor that skips rows after
an interrupted deletion. Verify every registered collection is empty, then Auth
identity deletion, then transactional profile deletion and completion.

Minimize the completed job to a permanent UID/schema/status/completedAt fence.
The existing bootstrap transaction rejects that UID after the profile disappears.
A new registration with a new Firebase UID can start a new independent account.
Late Storage finalization already routes inactive/missing owners to generation
cleanup. Preserve and test that behavior: temporary cleanup jobs can exist after
account deletion while a previously started upload finishes, but cannot recreate
financial documents or usable attachments. Recheck job/Storage emptiness and
keep the generation cleanup path available for late events.

Dispatch from an idempotent Firestore prompt trigger and a scheduled recovery
sweep. Honor the existing demo-only manual-job switch in deterministic tests.
Composite indexes: deletion status + nextRunAt; deletion status + leaseExpiresAt.
No public client collection query is added. Operational logs contain job kind,
step, bounded counts and safe outcome codes only.

## Flutter boundaries

Add `features/accounts/{domain,data,presentation}`. Domain ports:
`AccountDeletionRepository`, `RecentAuthentication`, `OwnerLocalCleanup` and
`DeletionHandoffStore`. Domain models represent sanitized request/status and
local cleanup state. Use immutable values and stable enums; no Firebase calls in
widgets. Use the raw protected owner gateway for the network-only request/status.

A separate recent-authentication port avoids adding unused methods to every
`AuthRepository` implementation. Official FlutterFire reauthenticates email
credentials and Google popup on web; native Google supplies a fresh credential
through the existing Google sign-in initialization path. Capture the original
UID, check it before and after every await, and force token refresh after successful
reauthentication. A mismatched provider account never starts deletion.

A root-scoped deletion handoff survives disposal of the signed-in feature scope
when the deleting profile stream stops access. It owns one owner/environment
operation, a stable request ID and an explicit accepted boundary. It cannot
update a replacement user's UI or sign that replacement user out.

After acceptance, first retain an owner/environment cleanup marker, stop command,
evidence, notification and attachment workers/readers, await in-flight preference
writes, then purge only this owner's validated stores/preferences. Prevent
snapshot writeback and reopen while the local deletion marker exists. Native
cleanup removes the exact hashed outbox database and receipt directory after
handles close. Web cleanup uses the pinned Drift `WasmDatabase.probe` result's
`deleteDatabase` operation, filtered to the two exact owned database names; never
clear all IndexedDB/OPFS/browser storage. Revoke owned Blob URLs and release file
selection. Remove profile snapshot and trust preference. Other UID/environment
stores and public service-worker assets remain unchanged.

A blocked database, unsupported future local schema or failed file removal leaves
a retryable cleanup marker and honest UI. No claim of secure physical-media
wiping is made. Startup resumes only accepted cleanup markers; a merely uncertain
request must first establish server acceptance. Never store credentials in the
handoff record. Deleting cloud history cannot undo files a user exported earlier.

## Verification

Tests must reproduce failures before implementation and retain all existing
financial/offline cases. Cover fresh/stale/missing/future auth_time; ownership and
App Check; duplicate/lost acceptance; request racing financial writes/bootstrap;
partial page failure; more than 500 records; lease theft and expired callbacks;
missing Auth; unsupported child collections; exact Storage generations and late
uploads; token binding transfer; no profile resurrection; and cross-user denials.

Dart/Riverpod/widget tests cover password/provider failure, cancelled confirmation,
offline denial, frozen original request retry, profile-lock scope disposal,
owner switch during reauthentication, local cleanup failure/restart, native exact
paths, web two-tab blocked cleanup, preference writeback, keyboard/200% text and
the original Tally themes/layouts. An actual synthetic emulator/browser journey
must request deletion, verify read/write denial, run the worker, verify cloud
history/files/Auth cleanup and retained minimal fence, and preserve a second
owner's cloud and local data. Real Google/native device flows remain staging
checks until those environments are available.

## Primary references checked

- [Firebase sessions and revocation](https://firebase.google.com/docs/auth/admin/manage-sessions):
  authentication-time claims and revocation are separate from refreshed token issue time.
- [Firebase Admin user deletion](https://firebase.google.com/docs/auth/admin/manage-users#delete_a_user):
  delete the known owner identity with the Admin SDK.
- [Firestore deletion](https://firebase.google.com/docs/firestore/manage-data/delete-data#collections):
  document deletion does not automatically delete subcollections.
- [Cloud Storage generation preconditions](https://docs.cloud.google.com/storage/docs/request-preconditions):
  generation matching prevents a delayed delete from affecting a replacement object.
- Installed official FlutterFire `firebase_auth/src/user.dart` and pinned Drift
  `wasm.dart`/`wasm_setup.dart` APIs inspected through Dart MCP before selecting adapters.
