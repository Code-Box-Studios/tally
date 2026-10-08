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

## Remaining M7a gates

The resumable worker, Flutter reauthentication and local cleanup, Settings UI,
actual browser journey and final whole-plan review remain pending. A worker must
finish successfully before cloud deletion can be reported complete. Physical
devices, deployed providers/App Check, backup/retention behavior and production
release remain staging or release checks.
