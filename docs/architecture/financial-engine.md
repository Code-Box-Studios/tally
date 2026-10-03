# Tally financial and recurring engine

All rules here are proposed Tally behavior. Pure domain functions calculate money, statuses, recurrence dates, and allocation previews. Trusted Firebase services persist their results. Dart and TypeScript implementations share language-neutral fixtures to detect drift.

## Financial invariants

Amounts are integer minor units plus currency. PHP/USD/EUR/SGD/AUD/GBP use two decimal places; JPY uses zero. Keep a reviewed currency metadata table sourced from the [ISO 4217 maintenance agency](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html). Parse decimal strings directly; never multiply a binary floating-point input by 100 to derive money.

MVP limits: one positive financial amount at most `1_000_000_000_000` minor units; per-record and per-currency aggregate absolute values must stay within `9_007_199_254_740_991`. Checked addition/subtraction fails explicitly on overflow. Signed aggregate differences such as net position can be negative; remaining debt cannot. The same bounds apply in Dart web, JSON, and JavaScript server validation.

For a one-time or finite-installment debt:

```text
effectivePaid = sum(payment amounts) - sum(valid full reversals)
remaining = originalAmount - effectivePaid
0 <= effectivePaid <= originalAmount
sum(instance scheduled amounts) = originalAmount
sum(instance applied amounts) = effectivePaid
```

A recurring template has no lifetime original/remaining financial amount. Each of its instances calculates `remaining = amount - effective allocations`. A missing variable amount is unknown, not zero. All allocations and reversals retain the parent currency. No payment pays two separate obligations or different currencies.

Statuses do not substitute for the ledger. An unpaid cancelled/skipped instance keeps its history but is excluded from outstanding actionable totals. Cancelling a partially paid finite debt explicitly excludes its residual from active totals and displays the preserved remaining amount under Cancelled; it does not change the original or create a payment.

Finite-debt cancellation sets every one of its at most 120 instances to cancelled/closed in the same bounded transaction, keeping all amounts and payments. Skipping is available only for unpaid recurring periods; finite installments must be rescheduled or the whole debt explicitly cancelled, so a skipped installment cannot disappear while its principal still counts as owed. Reopening a recurring period is an audited command, not a silent job action.

## Payment transaction

`recordPayment(authUid, commandId, payload)` is the only ordinary path to a canonical manual payment. Automatic processing calls the same underlying service with a trusted actor and deterministic event identity.

1. Verify auth/App Check for client calls. Resolve the owner from auth, not a payload `userId`. Validate shape, money/date, and command ID. Hash a canonical normalized payload.
2. In a transaction, read `commandReceipts/{commandId}` first. Matching completed payload returns its prior result. A different payload with the same ID returns `idempotencyConflict`.
3. Read the owner profile, obligation, selected instances, active source if selected, and related confirmation/reversal markers. Verify ownership, currency, lifecycle, revision, and outstanding balances. All transaction reads precede writes.
4. Calculate allocations from current server state. For one-time debts use their sole instance. For installments preview and allocate earliest outstanding instances first, ordered by due date then ID; explicit allocations are allowed. Maximum 24 instance allocations per payment. For recurring dues require one chosen instance; do not silently pay another month.
5. Reject zero/negative, unknown-amount, backdated-before-origination, future-dated, and overpayment inputs. Payment `paymentDate` is a civil date no later than the user's local today; `paidAt` is optional when an actual instant is known. Overpayment returns current remaining and does not commit any financial write.
6. Create the payment using a deterministic hash of owner/command/event identity. Update obligation and instance `totalPaidMinor`, `remainingMinor`, and revision; create activity; create a projection job; store the completed receipt. One transaction commits all of these.
7. Return IDs and canonical revisions. File uploads and notification delivery happen outside the financial transaction and cannot create or roll back a payment.

All retries use the same ID; two different command IDs represent separate intentional actions. Two devices trying to pay the full balance cannot both succeed because both transactions read and update the same parent revision/balance. If two automatic/manual actions race, the automatic worker checks the current outstanding amount and creates at most that remainder, or no payment if already satisfied. Confirmation rejects/reconciles an already satisfied instance rather than duplicating payment.

Firestore transactions are atomic, can rerun on contention, and fail offline. Keep external effects outside transaction callbacks. This motivates the command/outbox design. [Firebase transaction semantics](https://firebase.google.com/docs/firestore/manage-data/transactions).

## Correction and reversal

Canonical `payments` documents are immutable, including the recorded amount, currency, source snapshot, and audit timestamps. `updatedAt` equals `createdAt` on the immutable record. A payment correction appends a full reversal and optionally a replacement, with reason and links, in one transaction. Partial reversals are outside the MVP; users can replace a full entry with the corrected amount.

`paymentReversals/{originalPaymentId}` is a server-only unique marker referencing the reversal ID. The transaction reads it before creating a reversal, so concurrent corrections cannot reverse an entry twice. Reversals have a positive amount, `entryType = reversal`, and a negative effect in the fold. They copy the exact original allocation amounts and currency. A reversal itself cannot be reversed; re-record a payment with a new command when appropriate.

The payment feed presents an effective view while allowing **Show correction history** to reveal original/reversal/replacement. Derivation folds every immutable entry, not just UI-visible rows. Replacement validity is checked against the temporarily reversed balance before any write. Corrections on cancelled obligations require reopening in the same explicitly reviewed command or are rejected; no hidden lifecycle change occurs.

Changing receipt metadata adds an attachment-link activity; it does not rewrite the payment. Optional evidence/confirmation records may upgrade an assumed payment's evidence without altering its amount, date, or provenance. A failed assumption is reversed; a replacement confirmed payment then has its own ID.

## Installments and edits

An installment is a finite debt with direction `owedByMe` or `owedToMe`, an original amount, and 2–120 due instances. Sum the installment amounts exactly to the original. Equal division allocates the integer remainder to the final installment, e.g. 10,000 minor units / three → 3,333 + 3,333 + 3,334. All scheduled principal is counted once in total remaining; calendar/month totals use only the relevant installments.

Origination creates the parent and complete bounded schedule atomically. A payment can cover several installments with explicit immutable allocations. Obligation `remainingMinor` is never a sum of original principal plus installment balances. Early payments decrease the allocated future installments.

Currency, contact direction, and original amount are immutable once payment history exists. Before any payments, an audited revision-checked command can correct the original amount and rebuild the corresponding unpaid schedule atomically. Editing due dates creates an audit event and does not alter occurrence identity or prior payment date. Paid-period financial terms remain unchanged; move a later unpaid due date through an explicit editor.

## Date and timezone model

Use canonical validated Gregorian `YYYY-MM-DD` civil dates for `dueDate`, `occurrenceDate`, `startDate`, `endDate`, and `paymentDate`. `yearMonth` is `YYYY-MM`. Never serialize a civil date as UTC midnight and then redisplay it in another zone. Same-width civil strings sort chronologically.

An IANA zone snapshot, such as Asia/Manila, belongs to the schedule and instance. Store server audit instants separately as Firestore Timestamps. A scheduler computes `nextRunAt` from a civil date, configured local time, and zone. On DST gaps use the first valid local instant after the gap; on overlaps use the earlier instant. Both language implementations must match fixtures. Use a pinned timezone database/calendar adapter; changing the user's zone never silently shifts existing dates or audit instants.

Manual due dates become overdue at the start of the following civil day in the instance's zone. Scheduled automatic processing uses configured deduction time (default 09:00). Reminders use a configured local time (default 09:00). The interface can render dates with locale formatting, while storage remains canonical.

## Recurrence

The recurrence specification stores frequency, positive interval, anchor date, preferred day of month, optional month-end mode, local deduction time, timezone, inclusive end date, and policy version. Frequencies map to every 7/14 days, every 1/3/12 months, or custom every N days/weeks/months/years. MVP custom interval is 1–365; arbitrary cron expressions or multiple occurrences per day are excluded.

Generate from the original anchor, not from the last clamped date. A monthly day-31 recurrence produces Jan 31 → Feb 28/29 → Mar 31. Yearly Feb 29 clamps to Feb 28 in non-leap years and returns to Feb 29 in leap years. Quarterly is calendar-month arithmetic rather than 90 days; biweekly is exactly 14 civil days.

Each occurrence has immutable `occurrenceKey = r:YYYY-MM-DD` based on its original scheduled date. ID is `sha256(obligationId + '|' + occurrenceKey)` within the user's instance collection. Moving a due date leaves its occurrence key/ID unchanged. One-time keys are `one`; installment keys are `i:0001`, `i:0002`, etc. UI billing labels are presentation data, not identity keys.

The creation command registers a generation job and materializes the first eligible instance transactionally when within the horizon. A daily job maintains a rolling 90-day future horizon. Generate at most 30 documents per transaction and persist a generation cursor; rerun the same dates safely with create-if-absent checks. Missed processing catches up from that cursor, including missed eligible historic periods, rather than starting from today. Longer backlogs run in bounded continuation jobs.

Fixed instances snapshot amount, category/contact/source names, behavior, reminders, timezone, and template revision. Variable instances use `amountMinor = null` and `amountState = needed`, retain dates/reminders, and never create a financial auto payment until an amount is entered. A dedicated revision-checked command sets the actual bill amount; reject amounts lower than effective payments. Show the estimated template amount separately, never as recorded liability.

Template fee/source/reminder changes affect newly generated periods only. Already generated periods retain their snapshot, even if still future. Offer an explicit bulk preview for editing unpaid future periods with one period per auditable command; do not silently rewrite them. Schedule-rule changes begin after the last generated occurrence by default; an earlier cutover requires previewing and explicitly cancelling affected unpaid future instances, with history retained, before generating replacement dates. A retained occurrence ID cannot be silently reused with new financial terms.

Pause has an effective civil date. Existing periods, including future ones, remain and need explicit skip/cancel if unwanted; pause stops generation for dates within the paused range. Resume excludes the paused interval and continues at the next eligible recurrence date. End stops generation after its inclusive effective end date. Previously generated future periods after the end date remain visible and require explicit cancellation; the end preview lists them. Template lifecycle commands transactionally update their generation job revision to prevent stale workers creating periods.

Generation re-reads current lifecycle/rule revision inside each transaction. A stale job reschedules using current rules; it never trusts its old payload as the current template. Two workers create only one occurrence document. Each instance's auto event key is independent of worker invocation IDs.

## Deduction state machine

| Behavior / action | Deduction state | Ledger effect | Display |
| --- | --- | --- | --- |
| Manual before payment | none | None | Pending / Upcoming / Overdue |
| Automatic before time | scheduled | None | Auto deduct scheduled |
| Automatic reaches time with known outstanding amount | deducted | One assumed payment for outstanding remainder | Paid · Assumed deduction |
| Confirmation mode reaches time | expected | None; notification job/inbox item | Awaiting confirmation |
| User confirms expected deduction | confirmed | One confirmed payment for explicitly selected amount | Paid or Partially paid · Confirmed |
| User reports an expected failure | failed | No payment created | Auto deduction failed; outstanding |
| User reports an assumed deduction failed | failed | Full reversal of related assumed payment | Auto deduction failed; balance reopened |
| Variable period has no amount | expected, amount needed | No payment | Enter amount / Review deduction |
| User later records manual payment after failure | confirmed/manual resolved | Ordinary payment for outstanding amount | Paid or Partially paid |

Automatic mode needs an explicit onboarding/form explanation: **Tally will record this as paid on its schedule. You can correct it if the deduction fails.** It assumes the configured outstanding amount, never a bank event. Automatic-confirmation mode is the safer default in the form for users who do not want assumed records.

Deduction attempts are immutable records with expected/assumed/confirmed/failed event types and links to the instance/payment. Mutable instance deduction state is only their derived current state. Full payment prevents later auto creation. Partial manual payment leaves only the remainder eligible. A variable bill whose amount arrives after its deduction time asks for user confirmation; it is not retroactively assumed without user review.

No bank retry exists. **Retry manually** opens Record payment; changing source affects future instances unless the user explicitly changes this outstanding period. Paid/skipped/cancelled periods do not generate automatic payments or reminders. Replaying the original scheduled event after a reported failure does not re-assume a payment: its event receipt remains consumed, and failed state requires explicit user resolution.

## Derived summaries

Server transactions maintain only parent/instance financial caches and revision. A projection job recomputes per-currency dashboard/month/contact summaries from canonical obligations, instances, and ledger. Every canonical mutation increments `users/{uid}/ledgerState/current.revision`. A projector reads this revision before/after its paginated scan, computes outside a transaction, and publishes only in a transaction that verifies it has not changed; otherwise retry. Store `sourceRevision`, `computedAt`, and formula version. This is suitable for personal volumes; contention metrics determine future sharding.

`You Owe`/`Owed to You` count non-cancelled finite debt remaining by direction. Recurring outstanding is the sum of generated open periods due through today, separately from future scheduled dues. Contact net uses the same finite-debt rules and separate currency buckets; no netting command is executed.

Monthly scheduled/remaining totals include finite debt due instances and recurring instances with due date in that month, separated into outgoing and incoming. `paidThisMonth` folds outgoing payments and their linked corrections by original effective payment date. A reversal's audit date does not hide its effect on the original month's valid payment history. A replacement uses its own corrected financial date. Activity still shows the correction on its actual recorded date. Assumed and confirmed/evidenced totals have separate subtotals.

Financial totals with variable unknown amounts include `unknownAmountCount` and **Plus N bills needing an amount**. Never show a false complete total. Dashboard month/timezone keys and source revision prevent publishing an old zone/month view over a new one. Client-derived overdue/today labels use the latest clock immediately; cached server statuses are refreshed by due jobs.

Aggregate repair recomputes a parent from ledger/allocation entries, compares caches, and updates with a transaction revision guard. Record a repair audit event. It does not rewrite payment history. Never TTL-delete ledger records or idempotency markers while their related history exists.

## Cloud Functions responsibilities

Use TypeScript, strict mode, Firebase Functions 2nd generation and the Admin SDK. Proposed runtime is Node.js 22, currently listed as supported in [Firebase runtime documentation](https://firebase.google.com/docs/functions/manage-functions#node.js). Lock runtime and dependencies at implementation.

| Entry point | Responsibility and authorization |
| --- | --- |
| `bootstrapUser` callable | Authenticate; transactionally create profile/default categories/preferences only if absent. Idempotent recovery after sign-in. |
| `executeCommand` callable | Authenticate + enforce App Check; validate a discriminated command union; dispatch to owner-scoped services; return a durable receipt. |
| `dispatchDueJobs` scheduled, every five minutes UTC | Privileged service identity; page due jobs; lease with fencing token and expiry; process/retry bounded work. |
| `maintainRecurrence` scheduled, daily UTC | Enqueue/repair eligible generation jobs; never scan all users every five minutes. |
| `processJob` internal service | Generate periods, apply auto behavior, compute overdue transition, or reminder/projection; verify canonical owner path and revision. |
| `sendNotification` internal job | Check current preferences, instance state and devices; send outside transaction; track per-device outcomes. |
| `repairAggregates` scheduled, daily bounded pages | Check/rebuild parent and summary caches with revision guards; report discrepancies. |
| `onAttachmentFinalized` Storage trigger | Verify reservation/owner/path/generation, sniff supported file format, finalize metadata or reject; idempotent. |
| `requestAccountDeletion` callable + deletion worker | Recent authentication, lock account, revoke sessions, delete all private data/files/tokens/jobs in resumable pages, remove Auth user. |
| `cleanupOrphans` scheduled, daily | Owner-safe attachment reservations/orphaned upload cleanup, expired device cleanup, old completed nonfinancial jobs. |

Jobs persist type, owner, subject ID, `nextRunAt`, status, attempts, lease owner/expiry/fencing token, expected revision, and last redacted error. Deterministic logical job IDs coalesce the same work. A lease limits waste; transactionally verified financial event IDs provide correctness even after lease expiry. Store continuation cursors and retry exponential backoff with jitter; quarantine repeatedly failing jobs without discarding them.

Scheduled invocations can overlap, so delivery is treated as repeatable. A global UTC dispatcher converts per-user schedules; do not create a separate Cloud Scheduler job for each user. [Firebase scheduled-function behavior](https://firebase.google.com/docs/functions/schedule-functions).

## Notifications

Persist one reminder/inbox document per `instanceId + reminderKind + civilTargetDate + preferenceRevision`. A preference/rule change cancels obsolete unsent jobs. Check paid/cancelled state again immediately before send. Reminder offsets are civil-day subtraction, not 24-hour UTC subtraction.

Defaults: 09:00 local, three days before and on due date, plus overdue days 1/3/7 and then at most once per week; per-user quiet hours 21:00–08:00 postpone notifications to the first permitted time. Custom offsets are distinct integers 0–365; user disabling reminders wins. Automatic mode can notify before assumption; confirmation mode notifies when expected and follows outstanding reminders without counting it paid.

FCM tokens are owner-scoped device records with installation ID, platform, token, refresh time, opt-in, and active state. Register/rotate through a callable; unregister on sign-out, remove invalid-registration responses, and expire stale devices through a documented cleanup period (90 days initially). Never log tokens. Deep links carry record IDs, not amounts/names; the router rechecks authentication and ownership.

On native targets, local notifications schedule cached reminders through an adapter with stable event IDs; reconcile/cancel them after payment and sign-out. FCM remains the cross-device server channel. Prevent duplicate banners with the logical reminder ID and select one delivery channel per device/event where known. Ambiguous FCM timeouts can deliver twice; clients deduplicate when possible. Exactly-once push delivery is not promised.

Web needs permission, supported browser capability, a VAPID public key, HTTPS in deployed environments, and an FCM service worker. iOS needs APNs setup and capabilities. Denied/unsupported push always falls back to the in-app inbox. [FCM Flutter client setup](https://firebase.google.com/docs/cloud-messaging/flutter/client), [web background delivery](https://firebase.google.com/docs/cloud-messaging/web/receive-messages).
