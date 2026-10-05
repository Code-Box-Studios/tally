# Implemented financial read queries

M2 uses bounded queries below `users/{authenticatedUid}`. DTOs verify the stored owner, schema and financial values. Commands capture that owner separately from the current Firebase session; the server checks the assertion against authentication. Private providers declare Riverpod dependencies and are disposed with the UID scope.

| Query | Equality filters | Order | Index |
| --- | --- | --- | --- |
| Obligations | archived=false; optional section/contactId | createdAt descending | archived plus selected equality fields, createdAt descending |
| Instances for an obligation | obligationId | dueDate ascending | obligationId, dueDate |
| Payment history | obligationId | paymentDate descending, createdAt descending | obligationId, paymentDate descending, createdAt descending |
| Contacts | none | searchName ascending | single field |
| Sources and categories | none | name ascending | single field |

The exact six composite shapes are in `firestore.indexes.json`. Firestore appends document-name ordering in the same direction as the final ordered field. The client adds that tie-breaker explicitly and uses document snapshots as opaque cursors. A cursor is bound to its owner and query shape; it cannot be reused for another owner or filter. Index deployment and readiness must be verified before releasing the queries; emulator success alone does not prove readiness.

Pages normally contain 50 records; requests outside 1–200 are rejected. Each page returns items, continuation cursor, hasMore and isFromCache. A full page conservatively reports a continuation until the next fetch proves exhaustion. History beyond the first page remains accessible. Ledger folding requires the complete history; a partially loaded history never becomes a new balance calculation.

Streamed Firestore cache snapshots carry their cache marker. Additional pages require a server response in M2. Saving is online only: a lost response is an unconfirmed save, not a success or a guaranteed failure. The mounted editor retains the same command identifier for an identical retry, allowing the server's permanent receipt to return the accepted result once. Restart-safe queued commands and owner-isolated persistence arrive in M6.

## M3 projection and due queries

The trusted projector scans `obligations`, `obligationInstances`, `payments` and `contacts` below one active owner, using document ID order and 250-document Admin SDK pages. These server reads do not use the client Rules list limit. It folds complete immutable payment allocations and exact full reversals, checks owner/schema/financial conservation and safe aggregate bounds, and stops on a 180-second deadline. Finite principal is counted once. Cancelled/skipped periods leave actionable totals; paid periods still contribute to their scheduled month. Effective payment dates determine paid-month totals, independently from due-period remaining.

`users/{uid}/summaries/dashboard-{currency}` exists for each of the seven currencies. Each contains native-currency `youOweMinor`, `owedToYouMinor`, signed `netPositionMinor`, separate `recurringOutstandingMinor`, unknown counts, outgoing/incoming month totals and outgoing/incoming attention totals. `summaries/contact-{sha256(contactId)}` contains the contact ID and seven independent finite-debt position/count buckets. Neither summary changes or settles a debt.

Every projection record carries `sourceRevision`, `profileRevision`, `formulaVersion=1`, civil `yearMonth`, profile `timezone`, `financialDay`, server `computedAt` and `validUntil`. The last field is the earliest next civil-day boundary among the profile and saved instance zones. Clients must compare all context metadata, their current clock and cache metadata before presenting a current total. Older/incomplete chunks remain labelled Updating; unknown amounts are displayed separately. All seven currencies and all contacts receive current zero buckets when applicable.

Publication uses transactions of at most 200 summary writes. Each chunk rechecks the active profile, ledger revision, profile revision, timezone, financial day, validity and deadline; no stale scan claims current totals. The summary's initial `createdAt` is preserved, with server `updatedAt`/`computedAt` on refresh. A financial mutation during a multi-chunk publish may leave earlier chunks at an old revision; their metadata makes the mismatch explicit.

The deterministic top-level `systemJobs/projection-{sha256(uid)}` coalesces owner revisions. Profile/ledger Firestore triggers enqueue work. A scheduled dispatcher runs every five minutes, querying a bounded number of pending and expired leases with `kind=ownerProjection`, `status` and ascending `nextRunAt` or `leaseExpiresAt`; those exact composite indexes are included. Transactional leases last six minutes, carry generation/token identity, recover on expiration and reject stale completion. Success schedules the nearest saved-zone day boundary; failure backs off. The dispatcher never scans all users. Top-level jobs remain inaccessible under client Rules.

`refreshDashboard` uses the ordinary captured-owner command envelope with an empty payload, validates the active owner and only enqueues idempotent work; it does not change the financial revision. `repairFiniteDebt` takes an obligation ID, expected parent revision and reason, folds complete immutable entries, and guards both parent and scan revisions before repairing caches and writing an audit event. It retains all original payment and reversal documents.

Client due queries use `closed=false`, an optional `section` and a conservative civil-date envelope, ordered by `dueDate` and document ID ascending. Actual due-state classification happens against each instance's saved timezone and an injected clock. Continuation pages remain accessible and residual filtering cannot be mistaken for query exhaustion. The closed/date and closed/section/date composite shapes are included for M3 readers.

The trigger and worker retry design follows Firebase's documented [at-least-once Firestore events](https://firebase.google.com/docs/functions/firestore-events) and [scheduled function semantics](https://firebase.google.com/docs/functions/schedule-functions). Financial and publication writes follow [Firestore transaction semantics](https://firebase.google.com/docs/firestore/manage-data/transactions).

## Private reminder inbox

Canonical preferences are watched at `users/{uid}/notificationPreferences/default`
after bootstrap migrates the legacy seed. Inbox pages query the owner-scoped
`reminders` collection with `visible == true`, `scheduledAt <= until`, ordered
by `scheduledAt DESC, documentId DESC`, limit50. The explicit UTC cutoff and
page limit bind each cursor; a refresh creates a new query context. The matching
composite index is visible ASC / scheduledAt DESC. Unknown reminder amounts
still retain a supported native currency; cancelled or future records in a
published page fail mapping rather than appearing as due records.

The shared SDK query signature now serializes DateTime range values as canonical
UTC ISO instants and includes the page limit. Existing civil-date/string queries
retain their query semantics. Deployed index readiness remains a staging gate.
