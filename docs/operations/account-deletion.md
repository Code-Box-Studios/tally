# Protected account deletion operations

This runbook describes M7a's server cleanup contract. Production provisioning,
deployment, real account deletion and privileged recovery require the authorized
environment and release gates. Development tests use synthetic `demo-tally` data.

## Acceptance and access fence

`requestAccountDeletion` authenticates the owner and requires App Check through
the shared callable boundary. First acceptance requires exact `DELETE` confirmation
and token `auth_time` within 300 seconds, with at most 30 seconds of future skew.
Token issue time does not establish recent authentication. Acceptance atomically
creates the UID job and locks the profile. Existing jobs replay without another
destructive request. [Firebase session management](https://firebase.google.com/docs/auth/admin/manage-sessions).

`accountDeletionJobs/{uid}` is the permanent acceptance fence. The public callable
status contains only `{userId,status,step}`. Direct client access to jobs stays
denied. The deleting profile immediately denies private reads and normal mutations,
including previously issued tokens; cleanup then revokes refresh tokens and
disables the Auth identity. No payment, financial activity or financial command
receipt represents account deletion.

## Worker boundaries

Each invocation leases one job for 120 seconds with an incrementing generation
and random token. It starts at most ten pages within 60 monotonic seconds. Pages
contain at most 200 documents or 100 object generations; network operations have
a 20-second deadline. Progress, continuation, failure release and completion
require the current token/generation and an unexpired lease. A replaced worker
cannot advance the new worker's progress. Queries choose the first bounded page
again after interruption, so a lost response cannot skip remaining records.

Phases run in this order:

1. Revoke sessions and disable Auth; missing identities are idempotent.
2. Remove Storage generations below `users/{uid}/attachments/`.
3. Remove owned notification token bindings, rereading current ownership.
4. Remove registered owner subcollections in bounded pages.
5. Remove owned system jobs, rereading current ownership.
6. Delete the Auth identity.
7. Recheck owned structures, Storage and top-level jobs, then transactionally
   remove the profile and minimize the permanent fence.

The registry contains `contacts`, `obligations`, `obligationInstances`, `payments`,
`paymentEvidence`, `deductionAttempts`, `categories`, `paymentSources`, `attachments`,
`reminders`, `activities`, `notificationPreferences`, `notificationDevices`,
`commandReceipts`, `ledgerState` and `summaries`. Documents must retain the expected
owner/schema. Unknown root collections, nested collections and orphaned descendants
under missing parents enter `needsRecovery`. Do not delete the parent or declare
completion while unsupported records remain. Firestore document deletion does
not remove subcollections. [Firestore deletion behavior](https://firebase.google.com/docs/firestore/manage-data/delete-data#collections).

Storage listing disables automatic pagination and includes ordinary versioned
generations. The worker persists the selected name and generation before deletion,
verifies the selected revision and sends both `generation` and `ifGenerationMatch`.
A lost response retries that selection. A replacement object needs a new selection;
it cannot be erased by a stale revision retry. The extra revision read also protects
the pinned emulator, whose generation delete behavior is less complete than the
production API. [Node Storage pagination/version API](https://googleapis.dev/nodejs/storage/latest/Bucket.html#getFiles),
[generation-conditioned deletion](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/delete).

The prompt trigger starts due accepted jobs without Flutter. A five-minute UTC
sweep recovers pending jobs and expired leases, examining at most five jobs per
bounded sweep. Demo-only manual job mode suppresses both automatic entrypoints
for deterministic tests. Production never honors that demo bypass.

## Transient delay and recovery

Transient infrastructure failures preserve the step, original request ID and
selected Storage generation, clear only the owned live lease, and retry after
30 seconds with exponential backoff capped at one hour. A response timeout does
not prove an RPC failed; immutable generation selection and transactional lease
checks make retry safe. Expired/stolen workers leave the current lease untouched.

`needsRecovery` blocks automatic deletion. Safe codes include `unsupported-structure`,
`profile-fence` and `invalid-job`. Foreign or future-schema fences are not rewritten
to fit the current worker. Diagnose using bounded counts, schema/ownership checks
and safe outcome codes; never copy financial values, tokens, file bytes, email,
names or raw stack traces into logs or tickets.

Before privileged recovery:

1. Verify the target project, captured UID, acceptance job and deleting profile.
2. Confirm no live lease can still publish progress.
3. Identify unsupported owned structure or the failed external policy. Extend
   the registry/cleanup implementation and its tests together for a schema upgrade.
4. Repair only validated owned control fields. Preserve acceptance and the
   selected generation; do not remove the UID fence or reactivate the profile.
5. Requeue the repaired job with a cleared lease and an appropriate next-run time.
6. Verify cleanup and the minimized permanent fence. Preserve failures as evidence.

Operators must resolve Storage hold/retention or permission failures in the correct
environment. Cleanup stays outstanding rather than bypassing configured policy.
Managed backups, soft-deleted generations and retained exports follow their own
retention rules; account deletion does not promise instant erasure of those copies.
Verify actual bucket policy and retention behavior during staging.

## Completion and late events

The completed fence contains exactly `userId`, `schemaVersion`, `status: complete`
and `completedAt`. Retain it without TTL. Bootstrap refuses to recreate a profile
for that UID. A new Firebase UID represents a new independent account.

A upload started before acceptance may finish after completion. Existing finalization
routes an absent/deleting owner to private per-generation cleanup. Temporary
`systemJobs` may therefore appear after completion. They cannot recreate a profile,
financial document or ready attachment. Preserve that cleanup path and generation
fence when modifying attachment code.

Server completion and current-device cleanup are separate outcomes. Other devices'
unsent local data and manual exports require clearing on those devices. Flutter
must establish acceptance before discarding drafts and must report a blocked local
database or failed file removal with a retry action. Do not sign out or clear a
replacement owner.

## Current-device cleanup and retry

The device handoff contains only schema version, owner UID, environment, original
request ID and uncertain/accepted/cleanupRequired phase. Never clear pending local
actions for an uncertain result. Establish acceptance through the original server
request before writing accepted and starting device cleanup.

Root startup discovers only validated current-environment handoffs. It can finish
accepted cleanup without Auth and retains uncertain handoffs for server confirmation.
Its recovery service does not sign out a replacement owner. Concurrent cleanup for
the same owner/environment shares one purge; other owners remain independent.

Cleanup drains preference writers and awaits owned database, attachment and
notification resources, including construction or closes after scope disposal.
Writer/resource waits have a 20-second deadline. A timeout does not permit erasure
or abandon the retained close. The accepted marker remains available for retry.
Internal release of a matching dispatch lease can finish after the write fence;
new financial/evidence mutations and new store opens cannot cross that fence.

Native cleanup validates exact known paths, schema-1 SQLite ownership and receipt
entries before unlinking. Future schemas, foreign scopes, links or unknown entries
require recovery and retain their bytes. Physical device behavior still needs QA.

Web persistent connections hold shared Web Locks for the exact owner/environment;
purge requires the exclusive lock without stealing another tab's connection. Close
other Tally windows before retrying a blocked purge. Use public Drift probe, export
and delete APIs for the two exact derived names. Validate exported SQLite in RAM,
then verify physical absence. Drift 2.35.1 can swallow OPFS removal errors; verifying
its pinned `drift_db/<exact database name>` path is therefore part of the adapter.
Upgrade Drift/its worker only with both IndexedDB and OPFS browser contracts passing.

Successful device cleanup removes the request handoff and financial stores,
receipts, snapshot and trust preference. A boolean under a hashed owner/environment
key remains to prevent completed-owner reopening after tab or app restart. It holds
no plain UID, request ID, credential or financial value. Clearing application data
removes that local metadata; the permanent server UID fence remains authoritative.
Manual exports and another device's unsent data remain that device's responsibility.

## Release evidence still required

The emulator suite proves application ownership, retry and schema behavior. Staging
must validate deployed App Check, recent email/Google authentication, real Storage
preconditions and retention, scheduler permissions, leased worker recovery under
latency, backup policy, native current-device cleanup and operational access.
Production rollout remains separate from emulator implementation.

## Client request handoff

The root controller is keyed by immutable UID/environment and uses a raw protected
repository, never the offline financial queue. It persists one uncertain request
ID before submission. A retry reads authenticated status or replays that same ID.
An expired or disabled session can prevent acceptance verification after response
loss; preserve the uncertain handoff and drafts rather than granting anonymous
status or assuming erasure was authorized.

After a strictly owned response, persist acceptance before current-device cleanup.
If persistence or cleanup fails, report recovery and retain the original request;
retry local cleanup without creating another server job. Local success is distinct
from the returned pending/leased/needsRecovery cloud status. Never describe pending
cloud work as completed account deletion.

Email and Google reauthentication check the captured UID around each await and
force token refresh afterward. Refresh alone does not establish recent `auth_time`.
Passwords and provider credentials stay outside persisted state and logs. Native
Google uses the same single initialization future as ordinary sign-in.

All application FirebaseAuth mutations share an invocation-order queue. The final
sign-out rechecks the captured UID inside that queue and cannot erase a later app
sign-in. Firebase offers no UID compare-and-swap sign-out primitive; external SDK
or cross-tab identity changes are not claimed to be serialized by this process.
Another owner never receives the original owner's progress state or cleanup.

## Progress and recovery presentation

Settings exposes `/settings/account/delete`, with acknowledgement and exact
`DELETE` confirmation before provider verification. Preview labels the action
unavailable. The root MaterialApp host withholds its private router child during
initial marker discovery and on unsafe discovery. Empty verified discovery does
not require an identity lookup. An accepted original owner is blocked from private
screens while cleanup continues; another signed-in owner keeps their own workspace.

Completed startup handoffs remain only in root memory until owner-safe sign-out
and user acknowledgement. If sign-out fails after device erasure, the controller
restores minimal acceptance for restart and offers `Retry sign-out`. A live retry
skips already-finished device erasure. Device cleanup failure separately offers
`Retry device cleanup`; neither state claims cloud completion.

An uncertain handoff offers original-request retry and linked-provider
verification independent of a private profile. Returning from verification goes
back to request status; it does not cancel a server job that may already exist.
Current-device clearing does not clear other devices, exported files or provider
backups. Retention and deployed-provider behavior remain release checks.
