# Tally Firebase architecture and data contracts

Firebase is the primary backend. Choose Firestore Standard edition with Core queries for the initial implementation. This specification defines contracts before deployment; it is not a deployed ruleset or database.

## Services and ownership

Use Firebase Authentication, Cloud Firestore, Storage, Functions, Messaging, App Check, Crashlytics on supported native targets, optional consent-aware Analytics, and Remote Config for nonfinancial feature flags. Flutter accesses these through official FlutterFire packages and data-layer adapters. Remote Config never changes existing payment math or recorded terms; server validation remains authoritative.

Private documents live below `users/{uid}`. An authenticated owner can read allowlisted collections; canonical mutations go through Functions. Top-level privileged jobs support efficient cross-user scheduling without exposing collection-group financial reads to clients. The Admin SDK bypasses Security Rules, making explicit server ownership validation necessary. [Firebase rule-query and server-library behavior](https://firebase.google.com/docs/firestore/security/rules-query).

## Collection layout

```text
users/{uid}
  contacts/{contactId}
  obligations/{obligationId}
  obligationInstances/{instanceId}
  payments/{paymentId}
  paymentReversals/{originalPaymentId}       # trusted uniqueness marker
  paymentEvidence/{evidenceId}
  deductionAttempts/{attemptId}
  paymentSources/{sourceId}
  categories/{categoryId}
  attachments/{attachmentId}
  attachmentSets/{targetKey}                # trusted reservation/count lock
  reminders/{reminderId}
  activities/{activityId}
  notificationPreferences/default
  devices/{installationId}                 # trusted token store
  commandReceipts/{commandId}
  ledgerState/current
  summaries/{summaryKey}
systemJobs/{jobId}                          # privileged scheduling and repair
accountDeletionJobs/{uid}                   # privileged resumable deletion
```

Use flat user subcollections for relationships rather than nesting payments underneath obligations; this makes per-user payment/activity queries simple. Deleting a parent document is never assumed to cascade to subcollections.

## Common document contracts

All owner-scoped records include `userId: string` matching the path, `schemaVersion: int` initially 1, `createdAt: Timestamp`, and `updatedAt: Timestamp`. Canonical IDs come from paths; records explicitly required to expose an ID also store that ID and validate equality. All audit timestamps use Admin SDK server timestamps. Updates to editable documents increment `revision: int`; immutable ledger/activity/evidence records retain their initial timestamps. Optional fields are explicitly null rather than inconsistently omitted in current-schema writes.

Amounts use suffix `Minor` and are Firestore integers within the financial-engine bounds. Civil dates are validated fixed-width strings. Instants are Firestore Timestamps. Stable enum strings are versioned protocol values. Unknown future enums become a read-only Unsupported value with an update prompt, never an invented default.

### User profile

`users/{uid}` stores `userId`, `displayName`, optional `photoUrl` from auth, `defaultCurrency`, `timezone`, `locale`, `themeMode` (light/dark/system), `onboardingComplete`, `accountStatus` (active/deleting), `revision`, and common fields. Authentication provider identity/email belongs to Firebase Auth; only duplicate it for a justified display need. Profile creation derives the UID and basic identity from verified auth, not a supplied owner.

### Contacts

`contacts/{id}` stores `kind: person|organization`, `displayName`, `searchName`, optional `organizationType`, optional email/phone/address, `notes`, `archived`, and revision. Normalize searchName with a documented Unicode/case-folding adapter; preserve the original display string. Positions/history are derived queries or summary records, not user-editable amounts on the contact.

### Obligations

The parent also stores `timezone`, the preserved schedule IANA zone used for finite debt due-status presentation. It is initialized from the same verified zone as its instances and does not change with profile preferences. Document-read metadata is transported separately from the entity as `DataRecord<T>`; cache/server transitions with unchanged content still reach the presentation layer.

| Field | Type and meaning |
| --- | --- |
| `obligationId`, `userId` | Strings matching path/owner |
| `type` | owedByMe / owedToMe / recurringDue / installment / subscription |
| `direction` | owedByMe / owedToMe; recurring dues/subscriptions are owedByMe in MVP |
| `section` | Derived query group: iOwe / owedToMe / monthlyDues |
| `title`, `description`, `notes` | Bounded text; notes not indexed |
| `contactId`, `contactSnapshot` | Optional same-owner contact ID and minimal name/kind snapshot |
| `categoryId`, `categorySnapshot` | Same-owner category and creation display snapshot |
| `currency` | Supported uppercase code; immutable after financial history |
| `originalAmountMinor` | Required positive integer for finite debts; null for recurring templates |
| `defaultAmountMinor`, `amountKind` | Fixed recurring fee or optional estimate; fixed / variable |
| `originationDate`, `dueDate` | Borrowed/lent civil date and optional parent final due date; period dates live in instances |
| `lifecycle`, `financialStatus` | Lifecycle and derived status described in the financial engine |
| `paymentMode`, `paymentSourceId` | manual / automatic / automaticConfirmation; source required for auto |
| `sourceSnapshot` | Minimal source name/type/lastFour for current template display |
| `recurrence` | Null for one-time; bounded recurrence object below for recurring |
| `interestInfo` | Optional rate basis points, basis text, agreement notes; informational only |
| `reminderPolicy` | enabled, unique offsetDays, localTime, preference revision |
| `totalPaidMinor`, `remainingMinor` | Derived finite-debt caches; null on recurring template |
| `nextDueDate` | Derived earliest actionable known-date instance; null when none |
| `archived`, `revision` | Archive marker and concurrency revision |

The recurrence object includes `frequency`, `interval`, `unit`, `anchorDate`, `preferredDay`, `monthEnd`, `timezone`, `localDeductionTime`, `startDate`, optional inclusive `endDate`, `generationCursor`, `generatedThrough`, `ruleVersion`, and effective pause intervals. Limit to 120 pause intervals initially; older intervals can be archived in an audited schedule-history extension before reaching the limit. A command always checks lifecycle separately from the recurrence object.

### Obligation instances

`obligationInstances/{id}` stores `instanceId`, `obligationId`, `occurrenceKey`, immutable `occurrenceDate`, `periodLabel`, `yearMonth`, `dueDate`, optional `deductionDate`, `timezone`, `direction`, `section`, `contactId`, `categoryId`, `currency`, `amountMinor` (nullable variable bill), `amountState: known|needed`, `financialStatus`, `deductionStatus` (nullable), `paymentMode`, `paymentSourceId`, `snapshot` of template display/terms, `templateRevision`, `totalPaidMinor`, nullable `remainingMinor`, `closed` (paid/skipped/cancelled), `lastDeductionAttemptId`, `revision`, and common fields.

Unknown amount keeps remaining null, paid zero, and closed false. `yearMonth` follows the current due date for monthly queries; changing due date updates it with an audit event. Original occurrence identity and snapshots stay intact. `closed` excludes unknown amounts from being mistaken for paid, and allows queries to return them for reminders/calendar.

### Payments and correction records

| Field | Type and meaning |
| --- | --- |
| `paymentId`, `obligationId`, `userId` | Required matching identifiers |
| `obligationInstanceId` | Chosen instance for single-instance payment; null for multi-installment allocation |
| `allocations` | 1–24 `{instanceId, amountMinor}` entries, all from this obligation; sum equals payment amount |
| `entryType` | payment / reversal |
| `amountMinor`, `currency` | Positive amount; reversal sign is determined by entryType |
| `paymentDate`, `paymentTimezone`, `paidAt` | Civil financial date, profile timezone at recording, optional actual UTC instant |
| `paymentSourceId`, `sourceSnapshot` | Optional source and immutable label/type/lastFour |
| `paymentMethod` | cash / bankTransfer / card / eWallet / payroll / other; distinct from payment behavior |
| `provenance` | manual / assumedAutomatic / confirmedAutomatic |
| `direction`, `contactId`, `categoryId` | Immutable parent snapshot references for historical querying |
| `notes` | Bounded optional historical notes |
| `receiptAttachmentId` | Optional reserved owner attachment; availability is separate attachment state |
| `commandId`, `eventKey` | Idempotency and processing identity |
| `reversesPaymentId`, `correctionGroupId`, `correctionReason` | Required on reversal/correction chain as applicable |
| `createdAt`, `updatedAt`, `recordedAt` | Server audit instants; immutable |

`paymentReversals/{originalPaymentId}` stores owner, original/reversal IDs, correction group, timestamp and version; it is server-only. `paymentEvidence/{id}` stores owner, payment ID, kind (userConfirmed), actor, notes, and audit timestamp, so confirmation does not rewrite ledger evidence. `deductionAttempts/{id}` stores owner/instance, event key, event type, expected amount, source snapshot, payment link, reason and timestamps; attempts are append-only.

### Sources and categories

`paymentSources/{id}`: `name`, `type: cash|bankAccount|debitCard|creditCard|eWallet|payroll|other`, optional `nickname`, optional `lastFour` of exactly four decimal digits, `notes`, `active`, `revision`, common fields. There are no credential fields in the accepted schema.

`categories/{id}`: `name`, `searchName`, optional semantic icon key, `isDefault`, `active`, `revision`, common fields. Defaults have deterministic seed IDs; custom categories have opaque IDs. No arbitrary icon executable/style data is accepted.

### Attachments

`attachments/{id}` stores `attachmentId`, owner, `targetType: obligation|instance|payment`, `targetId`, `obligationId`, `storagePath`, original display filename, `contentType`, `sizeBytes`, optional checksum, `state: awaitingUpload|processing|ready|rejected|deleted`, storage generation, revision, and common fields. Reservations exist before upload; the finalized metadata derives file size/type/generation from Storage, not solely client claims. A tombstone preserves an audit reference after an owner removes a file.

`attachmentSets/{targetKey}` is a server-only reservation lock keyed by a hash of target type/ID, with owner, target type/ID, active reservation count, and revision. Reserve/remove/cleanup transactions read and update this lock to enforce the ten-file limit under concurrent uploads; the count can be rebuilt from attachment metadata. It contains no financial aggregate.

The payment editor can select a file before recording, but receipt reservation/upload happens after the payment is accepted and has a canonical ID. Live receipt links are queried from attachments by target; initial payment `receiptAttachmentId` can be null and is not rewritten to attach a later file. The detail view joins those links, preserving the immutable ledger.

### Reminders, devices, and preferences

`reminders/{id}`: `kind`, obligation/instance IDs, `civilTargetDate`, `scheduledAt`, zone, policy revision, `status: pending|sent|cancelled|failed`, `readAt`, generic display message key, delivery outcome summary, common fields. In-app visibility and delivery status are separate: a failed send still leaves a useful inbox record.

`notificationPreferences/default`: enabled categories, offset days, local time, quiet-hours start/end, channels, `allowSensitivePushText` default false, timezone policy, preference revision, common fields.

`devices/{installationId}`: owner, platform, opaque installation ID, FCM token, tokenUpdatedAt, lastSeenAt, permission/opt-in, active, appVersion and common fields. This collection is client-inaccessible; callable session lists return only sanitized device labels/times.

### Activities, receipts, and projections

`activities/{id}`: actor type (user/system), action type, obligation/instance/payment/contact references as needed, currency/amount when applicable, human message key plus bounded arguments, revision links for edits, reason, common fields. The server derives actor/action/amount. Ordering uses `createdAt DESC, documentId DESC`, with cursor pagination.

`commandReceipts/{id}`: owner, canonical payload hash, command type, accepted result IDs/revisions, recordedAt, common fields. Financially accepted command receipts persist as long as their ledger history; never expire an idempotency key and accidentally accept its replay. Rejected commands return typed errors and do not become accepted receipts.

`ledgerState/current`: owner, revision, lastMutationAt, formulaVersion. One revision increment per canonical command, including a correction transaction. `summaries/{key}` includes kind (dashboard/month/contact), currency, optional contactId/yearMonth/timezone, amounts/counts including unknownAmountCount, sourceRevision, computedAt, formulaVersion. Publish guards and rebuilding are specified in the engine.

`systemJobs/{id}` and `accountDeletionJobs/{uid}` contain no client-readable financial data. Job contracts are defined in the engine; deletion jobs additionally keep step, cursor, lock/fencing token, and status through cleanup.

## Relationships and projections

References are short IDs resolved inside one known owner's path. Never accept a client-provided Firestore path. All referenced contacts/categories/sources/instances/payments are validated to exist below that owner, with matching currency/parent where relevant. A source/contact can be archived without deleting historical references. Hard deletion of a referenced contact/source is excluded from ordinary MVP operations.

Minimal immutable snapshots preserve payment source labels, contact names, and period terms if editable entities change. Query fields such as section/direction/category/contact are denormalized with an explicit owner: parent edits update eligible live instances through bounded audited commands; historical payment fields keep the old meaning. Caches have source revisions and a repair path. No aggregate financial amount is replicated into every contact or activity entry as an untracked balance.

## Query and index catalog

All ordinary queries below run against `users/{uid}/collection`, so composite indexes do not include userId. UserId remains in records for server validation and single-document ownership checks. Collection-list rules rely on authenticated path ownership, avoiding an additional owner predicate on every query. ASC/DESC specify actual index order; document ID is the final cursor tie-breaker. Client list queries always include a limit, with a rule ceiling of 200 documents and a normal page size of 50.

| Query | Where / ordering | Proposed composite fields |
| --- | --- | --- |
| Obligations tab | archived=false, section=chosen; createdAt DESC | archived ASC, section ASC, createdAt DESC |
| Status within tab | previous + financialStatus=chosen; createdAt DESC | archived ASC, section ASC, financialStatus ASC, createdAt DESC |
| Contact obligations | archived=false, contactId=chosen; createdAt DESC | archived ASC, contactId ASC, createdAt DESC |
| Category obligations | archived=false, categoryId=chosen; createdAt DESC | archived ASC, categoryId ASC, createdAt DESC |
| Currency obligations | archived=false, currency=chosen; createdAt DESC | archived ASC, currency ASC, createdAt DESC |
| Mode/source obligations | archived=false, paymentMode OR paymentSourceId=chosen; createdAt DESC | Separate indexes: archived ASC, paymentMode ASC, createdAt DESC; archived ASC, paymentSourceId ASC, createdAt DESC |
| Upcoming/actionable instances | closed=false; dueDate range; dueDate ASC | closed ASC, dueDate ASC |
| Overdue instances | closed=false, dueDate < conservative maximum localToday; dueDate ASC; residual per-instance timezone check | Same closed/dueDate index; server cached overdue status is not required |
| Calendar, one section | section=chosen; dueDate range; dueDate ASC | section ASC, dueDate ASC |
| Calendar by contact/category/mode | selected field equality; dueDate range; dueDate ASC | Separate contactId / categoryId / paymentMode ASC, dueDate ASC indexes |
| Calendar by paid/pending/etc. | financialStatus equality; dueDate range; dueDate ASC | financialStatus ASC, dueDate ASC |
| Automatic agenda | closed=false, paymentMode IN automatic modes; deductionDate range ASC | closed ASC, paymentMode ASC, deductionDate ASC |
| Instance history for parent | obligationId=chosen; occurrenceDate DESC | obligationId ASC, occurrenceDate DESC |
| Payment history | obligationId=chosen; paymentDate DESC | obligationId ASC, paymentDate DESC |
| Attachment links for a record | targetType=chosen, targetId=chosen; createdAt DESC | targetType ASC, targetId ASC, createdAt DESC |
| Contact payment history | contactId=chosen; paymentDate DESC | contactId ASC, paymentDate DESC |
| Payments this month per currency/direction | currency=chosen, direction=chosen; paymentDate range DESC | currency ASC, direction ASC, paymentDate DESC |
| Recurring management | type IN recurring types, lifecycle=chosen; createdAt DESC | type ASC, lifecycle ASC, createdAt DESC |
| Reminder inbox | status IN desired; scheduledAt DESC | status ASC, scheduledAt DESC |
| Jobs due | status=queued; nextRunAt <= now ASC | systemJobs: status ASC, nextRunAt ASC |
| Expired job leases | status=running; leaseExpiresAt <= now ASC | systemJobs: status ASC, leaseExpiresAt ASC |

Unfiltered calendar dueDate, paymentDate, activity createdAt, and contact searchName ordering use single-field indexes. Declare composite definitions in `firestore.indexes.json` during the appropriate milestone; deploy indexes before shipping their queries. Verify query results and rule denial in emulators, and readiness/latency in staging; emulator query success alone does not prove an index is deployed.

After a timezone change, existing instances can have different zone snapshots. Due Today/Soon/Overdue queries fetch a conservative civil-date envelope across supported zones and classify every candidate using that instance's timezone and the injected current instant. They do not assume that the current profile timezone changed old schedules. Calendar/month membership still uses the stored due-date label without converting it through UTC. Automatic instants come from each instance's scheduled timezone.

The filter planner selects a documented primary query (date range or most selective entity/type filter), then evaluates secondary filters on every candidate page until the requested page is filled or the query is exhausted. It returns opaque continuation state and scanned-candidate count. It never filters only the first page and implies there are no more results. Amount comparisons require a selected currency. Unbounded scans are not used for dashboards.

For compound filters used often, add one measured composite shape rather than every possible Cartesian combination. Range-on-date plus amount is initially handled by residual predicates to avoid surprise index growth; adding multi-range queries is a measured optimization.

Global substring search across title/contact/category/notes initially uses a streamed, paginated owner scan through SearchRepository, with progress/cancel and clear cached-only labeling offline. Search runs only on explicit input with debounce, does not create a permanent duplicate financial database, and does not cap results silently. Benchmark 1,000 obligations and cap in-flight fetches. A later dedicated search index is behind the interface if personal volumes exceed the target. Do not promise standard Firestore substring queries. Current native text search requires Enterprise edition; this design intentionally does not depend on it. [Firestore text-search requirements](https://firebase.google.com/docs/firestore/enterprise/text-search).

Disable unnecessary single-field indexing for notes/descriptions, attachment filenames/checksums, payload hashes, snapshot maps, allocations, recurrence maps, and FCM tokens; preserve indexes for explicit query fields. Avoid ever growing document arrays of payment history or device tokens.

## Firestore rule policy

The first implemented rule file must use rules version 2, explicit allowlists, and a recursive default deny. No permissive development rules are committed/deployed.

| Path / operation | Policy |
| --- | --- |
| users/{uid} get | Auth UID matches uid; owner field matches; profile exists and is active |
| users listing | Denied to clients |
| Owner contacts/obligations/instances/payments/evidence/attempts/categories/sources/attachments/reminders/activities/preferences/receipts/ledgerState/summaries get | Auth UID matches path; document owner matches; account active |
| Lists of those allowlisted owner collections | Auth UID matches path; account active; explicit query limit <= 200. Path ownership authorizes the query; no resource owner predicate is added to list rules. |
| Any financial/aggregate/activity/receipt create/update/delete | Denied to client; trusted commands only |
| Profile/preferences/metadata edits and reminder read state | Commands validate allowlisted fields and revision; direct Firestore writes denied |
| devices/paymentReversals/attachmentSets | All client access denied; callable returns minimal needed metadata |
| systemJobs/accountDeletionJobs | All client access denied |
| Unlisted path or unauthenticated operation | Denied |

Rules use path ownership and active-profile checks for every read, with the redundant stored owner check on single-document gets. Only trusted server writes can populate these paths, and they enforce the stored owner field. Malicious queries cannot obtain another user's data by dropping a userId filter because the path itself is owner-private. Rules are authorization, not result filters. Test owner-scoped lists without a userId predicate, foreign paths, missing/oversized limits, and gets separately. Collection-group financial reads stay forbidden; privileged scheduler uses top-level jobs.

Server validation is deliberately stronger than rules on writes because there are no direct financial client writes to validate. Every callable/service still checks immutable fields, IDs, bounds, links, lifecycle, and current revisions. App Check protects supported services in addition to auth/rules, with debug providers restricted to development. Use Play Integrity on Android, App Attest with supported fallback on Apple, and a registered reCAPTCHA Enterprise provider on web after validating SDK support. [Flutter App Check providers](https://firebase.google.com/docs/app-check/flutter/default-providers).

## Storage rule policy

Canonical path: `users/{uid}/attachments/{attachmentId}/content`. Never use an arbitrary original filename as a path or a public bucket.

| Operation | Required conditions |
| --- | --- |
| Create content object | Auth UID equals path UID; profile active; owner Firestore attachment reservation exists with awaitingUpload state and exact path; metadata owner/attachment IDs match reservation; 0 < size <= 10 MiB; MIME allowlist |
| Read content object | Auth UID equals path UID; owner profile active; reservation metadata owner/path match; attachment state ready |
| Replace/update object | Denied to client; a replacement reserves a new attachment ID |
| Delete object | Denied to client; owner-authorized removal command and trusted cleanup remove it, preserving a metadata tombstone |
| List outside a known owner attachment path / any other path | Denied |

Allow JPEG, PNG, WebP, and PDF; reject SVG, HTML, scripts, and executables. Reject client-supplied download-token metadata and unexpected custom metadata keys. Cross-service `firestore.get/exists` checks are performed in Storage Rules against reservations and active profiles with tested access-call counts. Storage Rules support size/contentType validation, but MIME declarations alone do not prove the file format. Finalization verifies bytes/generation, and rejected files are quarantined/deleted with a visible reason. [Storage rule conditions](https://firebase.google.com/docs/storage/security/rules-conditions).

Use authenticated Storage SDK downloads and short-lived local previews. Do not persist Firebase public bearer download URLs or call `getDownloadURL` for financial evidence. Strip download-token metadata in trusted finalization before marking ready, so attachments do not acquire a public bearer-link access path. A file is unreadable while processing. Test this token removal with deployed staging Storage as well as owner rule tests.

Upload reservation, blob upload, and metadata finalization are separate retry-safe stages. Retrying a failed upload to an already uploaded immutable object reconciles its reservation/generation rather than overwriting content. Abandoned reservations/orphaned blobs expire after 24 hours; canonical financial records remain intact. Attachment removal from history displays **Attachment removed**.

## Authentication and account lifecycle

Session states are initializing, signedOut, bootstrappingProfile, needsOnboarding, ready, and failure. Await auth hydration before redirects, then call bootstrapUser idempotently. Password reset response is neutral about whether an account exists. Google sign-in uses platform-appropriate popup/redirect on web and native provider flow through Firebase; link providers only after authenticating the existing account, never merge records merely because email strings match.

Email verification is supported without adding an unexplained blocker to local personal tracking. Sensitive account changes/deletion require recent authentication. The release plan evaluates Sign in with Apple for iOS store compliance while the base architecture accepts additional providers.

Sign-out unregisters the current FCM installation, cancels local reminders, stops sync/listeners, disposes the user ProviderScope, and clears the user-specific outbox/cache according to a visible pending-data decision. It never silently throws away unsynced payments. Pending local commands are offered sync or explicit discard before sign-out; offline users can retain an isolated locked queue for the same UID if durable storage is enabled.

Account deletion first records a recent-authenticated request, locks accountStatus, and revokes sessions. A privileged resumable worker deletes subcollections, storage objects, devices, scheduled jobs, and auth identity. A top-level deletion job survives removal of the profile. A missing/deleting profile prevents normal mutation; late workers check the lock before writing, preventing resurrection. Backups follow the documented retention policy rather than falsely promising immediate removal from every backup.
