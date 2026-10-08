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

## Device cleanup in progress

Owner resource cleanup now retains asynchronous closes after provider disposal
and attempts all owned closes before reporting a failure. Accepted or malformed
owner/environment handoffs prevent profile snapshot and trusted-device writeback;
uncertain handoffs preserve the current draft/preferences. Bob and staging
preferences remain usable. The immutable handoff rejects future schemas, foreign
ownership, extra credential fields and invalid request IDs.

The three resource and eight preference failures were reproduced before their
implementation. Thirteen focused cases now pass, along with all 722 VM tests and
clean Flutter analysis. The live Dart app hot reloaded without runtime errors.
Persistent handoffs now survive adapter recreation, preserve the original request,
reject acceptance regression/foreign or future records, and discover validated
current-environment markers independently of Auth. Native cleanup waits for
registered resource closes, validates both databases' schema/scope and owned
paths, removes only the captured owner's outbox/receipts/profile/trust preferences,
and retains cleanupRequired on close/schema/ownership failure. Five handoff and
five native cases failed before implementation and now pass. The fresh complete
VM suite is 732/732 with clean analysis and no live runtime error. Web erasure,
resource provider migration, startup recovery and actual Chrome deletion
contracts remain in Task 3. Physical native-device erasure is not claimed.

## Remaining M7a gates

Flutter reauthentication and local cleanup, Settings UI, actual browser journey
and final whole-plan review remain pending. Cloud completion requires a successfully
finished job. Physical
devices, deployed providers/App Check, backup/retention behavior and production
release remain staging or release checks.
