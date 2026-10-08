# Tally account deletion verification

M7a is in progress. This document distinguishes protected request acceptance
from completed cloud cleanup and current-device cleanup. No production account
has been deleted, and no deployment is part of this verification.

## Protected request

The protected request requires an authenticated and attested owner through the
existing callable boundary. First acceptance requires an active schema-1 profile,
an exact owned request envelope and token `auth_time` within 300 seconds of the
server clock, allowing at most 30 seconds of future skew. Refreshing token `iat`
does not establish recent authentication.

One Firestore transaction creates `accountDeletionJobs/{uid}`, changes the profile
to `deleting` and advances its revision. The job is the acceptance receipt;
deletion creates no financial payment, activity or command receipt. An accepted
job replays without revising the profile or starting another destructive operation.
Malformed, foreign or unsupported jobs fail closed. Status returns only the
authenticated owner's `userId`, `status` and `step`.

A completed job uses the permanent four-field UID/schema/status/completedAt fence.
Bootstrap refuses to recreate a profile for that UID after profile removal. The
request does not itself claim that cloud files, financial records or Auth have
already been removed.

Contract tests were written first: 41 new behavioral failures reproduced the
missing contract, while the existing 133 Functions tests remained green. After
implementation, all 174 Functions tests passed. Six actual emulator request
cases first failed before the request/status implementation. They cover duplicate
concurrent requests, immediate private-data and command denial, wrong owner and
confirmation, stale authentication, lost-response replay, permanent bootstrap
fencing, minimized status and malformed-job rejection. The complete fresh gate passed all 150 emulator tests: one automatic prompt
case, nine isolated legacy cases and 140 remaining cases, including the six new
deletion tests. Failures, cancellations and required skips were zero.

## Resumable cloud cleanup

The worker is implemented with a 120-second token/generation lease, ten-page and
60-second monotonic start budgets, 200-document/100-generation pages and bounded
network calls. It preserves the deleting profile until final checks, deletes Auth
idempotently, and retains only the minimized permanent UID fence on completion.
Unknown root/nested structures and orphaned descendants under missing parents
require recovery. Transferred notification bindings and system jobs are reread
transactionally and preserved for their new owner.

Four new policy cases and fifteen actual worker cases failed before implementation.
The first worker iteration passed thirteen cases and exposed two failures. The
Storage emulator could remove a replacement object on a stale-generation delete;
selected-revision metadata verification now accompanies production generation
preconditions. The late-upload fixture lacked the custom ownership metadata that
protected ingestion actually stores; the fixture was corrected without weakening
attachment authorization. All fifteen worker cases passed in the subsequent full
run, including lost-response generation retry and late private-generation cleanup.

The actual automatic Firestore prompt first failed before its trigger was wired,
then completed synthetic cleanup without Flutter or a scheduler tick. It passed
alongside the existing financial prompt case. The complete fresh gate passed 178 Functions and 166 emulator tests: two
automatic prompt cases, nine isolated legacy cases and 155 remaining cases.
Failures, cancellations and required skips were zero. See the
[recovery contract](../operations/account-deletion.md) for bounds and limitations.

## Current-device cleanup

Strict five-field owner/environment handoffs survive restart and retain the original
request ID. Uncertain requests preserve drafts and preferences until the original
server request establishes acceptance. Accepted cleanup first closes tracked writers
and resources, including construction and closes that outlive signed-in feature
scopes. A stuck close reaches a 20-second deadline without permitting erasure; the
same retained handles remain awaitable on retry. Current-owner errors remain visible,
while cancelled receipt streams observe their disposed provider futures safely.

Native cleanup validates both SQLite schema-1 scope rows and every known private
path before deleting the exact owner's outbox, receipt files, profile snapshot and
trust preference. Foreign/future stores and failed closes retain `cleanupRequired`.
Linux tests use actual file-backed SQLite and receipt bytes; physical Android/iOS
cleanup is not claimed.

Web connections hold shared browser locks for their owner/environment. Cleanup
requires the corresponding exclusive lock after owned closes, probes only the two
exact database names, and validates exported SQLite in an isolated memory VFS before
any deletion. Official Drift deletion is followed by physical absence checks. The
OPFS directory verification matches the pinned Drift 2.35.1 worker layout; the
adapter imports only public package APIs. No origin-wide storage clear runs.

After successful cleanup, the financial stores, snapshot, trust preference and
request handoff are gone. A boolean under a hashed owner/environment key remains to
prevent old tabs and later restarts from recreating that UID's local state. It stores
no plain UID, request ID, credential, profile or financial value. Bob and other
environments remain independent. Root startup attempts accepted cleanup without an
Auth service, preserves uncertain handoffs, and exposes explicit retry through a
root-lived controller. Settings confirmation and progress presentation follow in
Tasks 4–5.

Tests first reproduced premature handle completion, disposed resource loss,
swallowed close failures, completed-owner reopening, missing recovery and missing
startup activation. Actual OPFS testing exposed deletion succeeding while another
tab still held a connection; explicit shared/exclusive browser locks now prevent
that operation. Six resource-provider cases, seven recovery/startup cases and the
stuck-close deadline case pass. The full Flutter gate is 747/747 with clean analysis,
format and diff checks. Actual Chrome runs pass ten contracts on `sharedIndexedDb`
and ten on `opfsLocks`, including held handles, exact owner removal, Bob/staging
preservation, uncertain requests, foreign/future databases, a blocked second tab,
late writes and reopening after completion. The existing outbox browser probe also
passed reload durability, shared dispatch fencing and unchanged payload checks with
the new connection lock protocol. Live Flutter hot reload succeeded with no runtime
errors. No production data or real account was used.

## Remaining M7a gates

Flutter reauthentication and request control, Settings UI, actual browser journey
and final whole-plan review remain pending. Cloud completion requires a successfully
finished job. Physical
devices, deployed providers/App Check, backup/retention behavior and production
release remain staging or release checks.
