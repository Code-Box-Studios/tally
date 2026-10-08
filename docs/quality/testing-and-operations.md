# Tally reliability testing and operations

This specification defines how implementation will prove financial correctness and protect personal data. Documentation review is complete only as a design exercise; executable tests and platform builds belong to the delivery milestones.

## Offline commands and synchronization

The implemented M6b storage, retry, privacy and evidence boundaries are recorded
in [the offline verification report](offline-sync-verification.md). The original
design below describes intended contracts rather than a claim that every
platform/release gate is complete. In the current implementation, Firestore
persistent financial caching is disabled; the owned command store and small
profile-preference snapshot support trusted offline recovery. Browser receipt
bytes require reselection after reload. Native file IO tests do not establish
physical-device behavior.

Firestore provides cached reads and offline synchronization for supported clients, with last-write-wins for multiple changes to a document. It does not supply the application-level payment idempotency/conflict policy. Web persistence is not enabled by default and should be enabled only on a trusted device for sensitive data. [Firestore offline behavior](https://firebase.google.com/docs/firestore/manage-data/enable-offline).

Use Firestore cache for read models and a separate durable OutboxStore for mutations. Schema: owner UID, command ID, discriminated command type/version, canonical payload, dependencies, expected revision, created local instant, state (queued/sending/accepted/rejected/blocked), attempts, nextAttemptAt, receipt/result, and redacted failure. Persist before displaying Waiting to sync. A local append/transition transaction prevents losing entries after an app crash.

| Situation | Behavior |
| --- | --- |
| Create obligation offline | Preallocate safe opaque contact/obligation IDs; queue dependent create commands; display local pending card, separate from canonical totals. |
| Record payment offline | Validate against cached remaining with an explicit preview caveat; persist command; show pending history separately. Final validation runs against server balances. |
| Queue payment on a new pending obligation | Add a dependency on the create command; send in dependency order; block payment if the parent creation fails. |
| Connectivity restored | Acquire local dispatch lease; send ready commands in order per obligation; concurrency across independent obligations is bounded. Connectivity hint is not proof of server reachability. |
| Crash after server commit, before local acknowledgement | Query receipt/retry the identical ID; accepted result reconciles the queue without another payment. |
| Two browser tabs / duplicate background wake | Coordinate via local store lease and messaging where supported; server identity protects correctness if coordination fails. |
| Two devices edit the same obligation | Expected revision conflict; retain draft, reload canonical record, show changed fields, submit revised command with a new ID. |
| Same ID with different payload | Server rejects idempotencyConflict; never overwrite a prior action's receipt. |
| Scheduled server payment while client offline | Server payment is canonical; pending client payment is revalidated on reconnect and may be rejected as overpayment/already satisfied. |
| Sign-in from new device | Read canonical server state; unsent local commands do not magically exist on other devices. |
| No previously cached data | Explain what's unavailable; allow draft creation but do not invent empty financial totals. |
| No durable web storage / quota exhausted | Do not claim an entry is saved for restart. Offer in-session draft with clear persistence state; block financial submission until durable enqueue or online accepted receipt. |
| Session expires | Pause sending; retain owner-isolated queue; request login and resume only for the same UID. |
| Account deletion/cancelled obligation | Reject/lock pending commands visibly. Never reopen a cancelled obligation without an explicit command. |

The client shows an accepted receipt as soon as returned, then observes the canonical stream; a projection may still be Updating totals. Pending amounts do not get added into recorded totals or shared across devices. Local scheduled reminders use cached canonical instances, not unaccepted pending assumptions.

Fresh authentication, attachments reservation/upload, provider linking, and account deletion require network. Local files for offline receipts are persisted in a user-private native directory where possible; web-selected files may not survive reload. Save the payment command independently and ask to reselect its receipt after acceptance if needed.

Retry transient failures with exponential backoff and jitter, initial one second, ceiling five minutes, using the same command ID. Stop for validation/auth/conflict failures; do not discard pending records. Device background execution is a convenience, never the critical recurrence engine. Offline security/privacy relies on OS/browser storage controls; enhanced encryption/biometric lock is a later feature, not a promise in this MVP.

## Error contract

Server errors have a stable code, safe message key, retryability, command ID, and optional field errors/current remaining/current revision. Unexpected internals never return raw stack traces or financial payloads. Client mappings keep drafts and select the useful recovery action.

| Error | Recovery |
| --- | --- |
| unauthenticated / sessionExpired | Pause queue; sign in; resume same owner |
| permissionDenied / appCheckFailed | Stop operation, refresh valid tokens/capabilities; no silent bypass |
| notFound / unavailableRecord | Offer return to list; do not reveal another owner's record |
| invalidAmount / unsupportedCurrency / invalidDate / invalidRecurrence | Highlight field and retain draft |
| overpayment | Show current remaining; revise amount/new command |
| conflict / alreadySatisfied | Reload record and show changed state; no blind financial retry |
| idempotencyConflict | Retain original result; create a new action only after reviewing changed input |
| unavailable / deadlineExceeded / ambiguousCommit | Pending status; receipt reconciliation and same-ID retry |
| storageQuota / attachmentRejected | Preserve accepted payment; retry/reselect file or use without receipt |
| unsupportedSchema | Read-only update prompt; never default missing money to zero |
| processingDelayed | Show last accepted record/as-of time; surface pending job health without pretending a deduction happened |

Log redacted IDs, failure class, versions, latency and retries. Redact email, contact names, notes, amounts, FCM tokens, file bytes/URLs, and authentication secrets. User-facing telemetry consent governs Analytics; essential operational logs use minimal data. Event names describe interactions (obligation_created, payment_recorded) without financial dimensions.

## Validation matrix

| Value / action | Client preview and authoritative server constraint |
| --- | --- |
| Identity | Auth-derived UID; owner path and stored owner match; referenced IDs owner-local; account active |
| IDs | Safe opaque IDs, nonempty, at most 128 characters; no slash/path traversal; hash inputs canonicalized consistently |
| Title/name | Trimmed 1–120 characters; contact names need not be unique |
| Description/notes | Description <= 1,000 characters, notes <= 5,000; no arbitrary unknown schema fields |
| Email/phone | Optional bounded contact text; email format validation for provided email; do not require one national phone format |
| Currency/money | Supported code, exact exponent, positive integer for payments/known amounts, financial-engine safe bounds, same currency across links |
| Date/time | Valid civil date, dates 1900-01-01 through 2199-12-31, valid IANA timezone, HH:mm time; optional due date not earlier than origination/start |
| Payment date | No later than owner's local today, no earlier than obligation origination/instance start; optional actual instant consistent with supplied civil context |
| Installments | 2–120 periods, exact principal sum, ordered due dates, positive period amounts, at most 24 allocations per payment |
| Recurrence | Supported frequency/unit, interval 1–365, valid anchor/preferred day, end >= start, explicit month-end behavior; one occurrence/day maximum |
| Variable bill | null means unknown, never zero; known amount positive and not lower than effective payments |
| Financial edits | Reject direct remaining edits; immutable currency/direction/original after payments; due changes audited and revision checked |
| Overpayment | Reject amount greater than server remaining; no negative balance/excess quietly stored |
| Auto behavior | Active source required; known period amount before assumption; closed periods not processed |
| Corrections | Required reason 1–500 characters; exact once-per-original full reversal; replacement valid after reversal |
| Reminders | Unique offsets 0–365, max 12 offsets, valid local time/quiet hours; disabled preferences win |
| Sources | Accepted name/type/nickname/lastFour/notes/active only; four digits if supplied; reject credential keys |
| Attachments | <= 10 attachments per target, each 0 < size <= 10 MiB, declared MIME allowlist plus trusted content check; private reserved path |
| Search/filter | Search <= 200 characters; explicit currency for amount filter; date/amount min <= max; cursor bound to normalized query/owner |
| Lifecycle/archive | Expected revision; preserve payments; pending records cannot become paid just by changing a status |

## Automated test layers

| Layer | Tooling and proof |
| --- | --- |
| Dart domain units | dart/flutter test for exact money parsing/folding, statuses, allocation, recurrence, timezone boundaries and currency isolation; fake Clock/calendar |
| Riverpod tests | ProviderContainer with overrides; loading/error/data, user-switch disposal, stale query cancellation, queued/accepted/rejected submissions, draft preservation |
| Repository tests | In-memory gateway/outbox fixtures plus emulator integration for DTO mapping, owner paths, query paging/residual filtering, receipt reconciliation and error mapping |
| Widget tests | Actions/labels/validation, payments/history, empty states, unknown bills, all breakpoints/themes, keyboard and 200% text scaling |
| Flutter integration | Auth/onboarding → debt → partial/full payment → correction; recurrence/calendar; offline/restart/reconnect; account switch; deep links/back navigation |
| Security Rules tests | @firebase/rules-unit-testing for unauthenticated/cross-user reads and writes, malicious path/reference attempts, protected aggregates/receipts/devices/jobs, owner list queries |
| Storage Rules tests | Owner reservation/create/read, size/MIME/metadata/path checks, ready-only reads, cross-owner denial, overwrite/delete denial |
| Functions units | Pure TypeScript domain tests and command validation with injected clock/IDs; shared fixture parity with Dart |
| Functions emulator integration | Transaction contention, rollback, replay, correction uniqueness, recurrence duplicate workers, revision fences, projector repair and deletion recovery |
| Staging platform tests | Real OAuth, App Check, FCM/APNs/browser service worker, deployed indexes, Storage finalization/token removal, Crashlytics symbol reports and web error channel |

## Critical acceptance fixtures

Monetary examples are in major PHP units for readability; fixtures encode them as integer centavos. Assert ledger count/links/activity and not merely a formatted balance.

| Test ID | Scenario | Required outcome |
| --- | --- | --- |
| FIN-01 | Original 10,000; payment 3,000 | Paid 3,000, remaining 7,000, one payment, partial state |
| FIN-02 | Original 10,000; payment 10,000 | Remaining zero, paid/closed state, no further auto processing |
| FIN-03 | Remaining 2,000; attempt 2,500 | Rejected; no payment/aggregate/activity mutation |
| FIN-04 | Original 20,000; payments 5,000 + 2,500 + 4,000 | Paid 11,500, remaining 8,500, three immutable payments |
| FIN-05 | Reverse mistaken 2,000 and replace with 1,500 | Original/reversal/replacement retained; effective paid 1,500; reason linked |
| FIN-06 | Two simultaneous corrections of one original | One correction wins; no double reversal or negative effective paid |
| FIN-07 | Same payment command retried after lost response | Same payment/result ID, one activity, one logical debit/receipt |
| FIN-08 | Two devices each submit full outstanding balance | One full payment; the other gets current-balance rejection |
| FIN-09 | PHP 10,000 plus USD 500; JPY fractional input | Separate totals; JPY 1.25 rejected; no combined figure |
| FIN-10 | Principal 100 minor units, three installments | 33 + 33 + 34; totals sum to 100; principal not double counted |
| FIN-11 | Multi-installment payment and reversal | Allocation sums exact; reversal restores precisely those installments |
| FIN-12 | Past-due partially paid obligation | Primary Overdue with paid and remaining still visible; today is not overdue |
| REC-01 | Same November Internet generation job twice/concurrently | One occurrence ID and one period document |
| REC-02 | Fixed fee rises 1,699 → 1,899 after old periods exist | Existing periods stay 1,699; newly generated ones are 1,899 |
| REC-03 | Electricity Sep 3,250 / Oct 3,810 / Nov 3,460 | Each amount independent; editing unpaid October never changes September |
| REC-04 | Unknown variable amount at automatic time | No payment; amount-needed/expected state and reminder |
| REC-05 | Pause Nov 1, resume Dec 1 before November generation | No November creation; next eligible December date; October history remains |
| REC-06 | Pause after a future period was generated | Existing period remains; preview permits explicit audited skip/cancel |
| REC-07 | Monthly Jan 31, 2026 anchor | Feb 28 then Mar 31; leap-year fixture also tested |
| REC-08 | Yearly Feb 29 anchor; quarterly; 14-day cycle | Leap clamping recovers; calendar-month and 14-day semantics exact |
| REC-09 | Two workers with one expired lease | Fenced job updates; one occurrence/automatic payment per logical key |
| REC-10 | Rule edited/ended while generation transaction runs | Current revision/lifecycle checked; no new out-of-range period |
| AUTO-01 | Automatic known 549 due today | One assumed ledger payment; remaining zero; Assumed label |
| AUTO-02 | Confirmation mode reaches date | Expected only; no paid amount until confirmation |
| AUTO-03 | Deduction failed before confirmation | No payment; remaining 549; failed and overdue labels when appropriate |
| AUTO-04 | Assumed 549 later reported failed; old auto job runs again | Linked full reversal; remaining restored to 549; activity preserved; job replay does not re-assume payment |
| AUTO-05 | Manual 200 before automatic 549 period | Auto records only remainder 349; total applied 549 |
| SYNC-01 | Offline payment, restart, reconnect | Same durable command; exactly one canonical payment after acceptance |
| SYNC-02 | Server auto settles while offline manual payment waits | Pending manual action rejected/reconciled, never a negative balance |
| SYNC-03 | New obligation and dependent payment queued offline | Correct dependency ordering; failed parent blocks dependent action |
| SYNC-04 | UID changes / outbox quota failure | No cross-user dispatch/cache exposure; no false Saved state |
| DATE-01 | Asia/Manila due Oct 5 observed across UTC boundary | Due label remains Oct 5; no previous-day display drift |
| DATE-02 | DST gap/overlap schedule | Mar 8, 2026 New York 02:30 → 03:00 first valid; Nov 1 01:30 selects earlier occurrence |
| DATE-03 | Profile timezone changed while old periods retain prior zones | Dates unchanged; today/overdue classification uses each instance zone; conservative queries include all candidates |
| SUM-01 | October due 1,000; October payment 500 toward September | Paid this month 500; Remaining October still 1,000 |
| SUM-02 | Ledger changes during summary scan/repair | Stale publish rejected; source revision never outruns canonical revision |
| SEC-01 | Alice attempts Bob's documents, queries, attachments, IDs | Denied by rules and callable validation; Alice's bounded own-path list works without userId predicate |
| SEC-02 | Client tries aggregate/payment/activity/receipt writes | Denied even when authenticated owner |
| SEC-03 | Account deletion worker restarts / late job runs | Resumable cleanup, no data resurrection, no new owner writes |
| FILE-01 | Wrong MIME/oversize/foreign reservation/overwrite | Rejected; financial record unaffected |
| QUERY-01 | First page has no secondary-filter matches; later page does | Matching later results returned with correct continuation state |
| UI-01 | All six destinations and Add at 320/600/1024 widths | Accessible navigation, no clipped financial labels at 200% text |

Use deterministic property tests for valid payment sums and currency combinations, plus randomized schedule fixtures with bounded seeds. Financial rules/authorization require all named acceptance tests; coverage percentage alone is not evidence of correctness.

## Emulator Suite strategy

Use a demo project ID `demo-tally` for development/CI so missing emulator wiring cannot fall through to a real project. Run Auth (9099), Firestore (8080), Functions (5001), Storage (9199), Emulator UI (4000). Connect before first service use. Browser/iOS simulator usually use loopback; Android emulator uses host 10.0.2.2; physical devices use a configured LAN host. LAN binding is explicit, not the default.

The Flutter emulator Environment requires every supported service endpoint and rejects a production project ID. Functions use emulated Firestore/Auth/Storage and a stub NotificationGateway; a real FCM send is disabled in demo mode. Version fixture loaders, reset between tests, and keep test cases isolated by owner IDs.

Use `firebase emulators:exec --project demo-tally --only auth,firestore,functions,storage` around the repository's eventual test command. CI generates fixtures then runs rules/functions/integration assertions against emulators. Tests never assume emulator disks are a backup or canonical shared development data. [Firebase Emulator Suite workflow](https://firebase.google.com/docs/emulator-suite/connect_and_prototype).

Cloud Scheduler time progression is invoked directly through test handlers/fake clocks; emulators do not prove deployed scheduler behavior. FCM/APNs, App Check attestation, real OAuth, deployed composite indexes and Storage trigger behavior require staging verification. Configure debug App Check only in emulator/dev builds and never bundle debug secrets in production. Java/runtime compatibility is pinned with the installed Firebase CLI rather than assumed from the currently available java binary.

## Environments and credentials

| Environment | Configuration and access |
| --- | --- |
| Local emulator | demo-tally, synthetic data, test OAuth/notification adapters, explicit endpoints, telemetry disabled |
| Development | Separate real Firebase project if needed for device integration; nonproduction identities, debug attestation restricted to registered test devices |
| Staging | Separate Firebase project, production-like rules/indexes/functions; real App Check/OAuth/FCM; synthetic financial data |
| Production | Separate Firebase project, enforce App Check, release signing, approved domains, budgets/alerts/backups, least-privilege deployment identity |

Use dev/staging/prod entry points and platform flavor/bundle identifiers. Generate per-environment Firebase options via FlutterFire CLI during configuration and inject the selected one at bootstrap. Firebase client project identifiers are public configuration, not authorization secrets; do not treat hiding an API key as security. Credentials/service-account keys/APNs keys belong in secure CI/Secret Manager, never Dart or committed `.env` files. CI uses short-lived federated credentials where available.

Validate requested environment/project pairing at startup; no missing-config fallback to production. Check environment-specific OAuth domains, App Check registration, Android certificate fingerprints, Apple entitlements, VAPID/APNs configuration, and emulator flags. Use a chosen region for Functions/Firestore/Storage where each service supports it; provisioning records the final location decisions before data creation.

Backend provision/deploy uses billable Firebase/Google Cloud resources. Configure budget alerts, max function instances, scheduler jobs, read/write/storage metrics, and attachment retention. Alerts are not a spending cap. Estimate costs from fixture workloads before beta; no exact monthly price is claimed in this blueprint.

## CI and release gates

On each change: formatting/static analysis, code generation cleanliness, relevant domain/provider/widget tests, TypeScript strict build/lint/unit tests, and emulator rules/transaction tests. On release candidates: Flutter integration flows, responsive web production build/browser verification, Android release build/device run, iOS release build/device run on macOS, and staging platform capabilities. Repeat wider checks when changed behavior/failures justify them.

Proposed commands once their files/scripts exist:

```text
dart format --output=none --set-exit-if-changed lib test integration_test
flutter analyze
flutter test
flutter test integration_test -d <configured-test-device>
npm --prefix functions run check
firebase emulators:exec --project demo-tally --only auth,firestore,functions,storage 'npm run test:emulators'
flutter build web --target lib/main_staging.dart
flutter build appbundle --flavor staging --target lib/main_staging.dart
flutter build ipa --flavor staging --target lib/main_staging.dart
```

These are planned checks, not commands claimed to pass in the current README-only repository. Implement a root test runner that exists before wiring CI. Capture test counts, platform/SDK versions, build artifacts, deployed rule/index versions, and financial fixture parity.

Production release is blocked by any unresolved critical financial/security acceptance failure, wrong environment wiring, data-loss outbox behavior, or unverified required platform capability. Remote Config can disable a future feature/notification rollout but cannot bypass validation, alter a payment, or become an auth mechanism.

## Recovery and operations

Back up canonical Firestore and attachment storage with a proposed 30-day rolling retention; production RPO target 24 hours and RTO four hours. Restore into an isolated project and verify ledger/allocation folds, owner rules, attachment access, and occurrence idempotency before restoring processing. Restored queues may resend; restore procedures reconcile event/receipt markers and accept that notification delivery may duplicate while financial writes remain deduplicated.

Alerts cover eligible job age >15 minutes, quarantine growth, transaction error/retry rates, rejected ownership attempts, projection mismatch/lag, invalid-device cleanup failures, attachment processing lag, and backup failure. Run a scheduled bounded reconciliation; provide an operator-only authenticated repair command with an audit trail.

Schema changes are additive first, revision/version-aware, and deployed backend-first before clients depend on them. Migrations have a dry run, checkpoints, and fixtures; no destructive ledger rewrite. Feature rollback preserves compatible reads and history. Account deletion advertises its completion state and documented backup expiry, and retries safely after interruption.
