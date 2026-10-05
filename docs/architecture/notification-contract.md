# Reminder job and inbox contract

Reminders never make a payment, change a financial balance, or advance the
financial ledger. Payments and reversals remain immutable financial evidence.
An inbox reminder snapshots one native currency and the canonical remaining
amount; a variable bill without an entered amount has a null amount.

Financial commands atomically enqueue owner reconciliation beside the balance
projection. Finite and recurring creation also stage one deterministic
`reminderPreparation` job per instance. Financial ledger, profile and canonical
preference triggers repair the queue idempotently. Mark-read commands do not
enqueue a balance projection or reminder reconciliation.

Owner reconciliation orders retained instances by document ID, reads at most
100 per transaction, and carries a private cursor. Its captured owner key
contains financial ledger, profile and preference revisions. A change restarts
the scan; a leased worker with an old key cannot finish another page.

Preparation and delivery use a context key containing owner, parent, instance,
profile and preference revisions plus effective policy revision. Each lease
has a random token, generation and six-minute expiry. All transaction reads
precede writes; the worker checks the lease again after its final read. A
changed subject or expired worker cannot publish or complete newer work.

Finite records with the old `preferenceRevision` seed and no `reminderRevision`
adopt current global offsets/time. A custom finite policy uses its own checked
revision. Recurring periods always retain their immutable policy snapshot.
Paused and ended templates retain reminders on outstanding historical periods.

Preparation cancels obsolete unsent records in pages of 100, then plans at most
32 events in the saved-zone civil window from today minus seven through today
plus 90 days. Each outstanding period has its own daily continuation, so the
scheduler does not repeatedly scan every user. Published inbox snapshots and
read state are preserved after payment or settings changes. Completed automatic
deduction jobs stay terminal when reminder preparation rearms.

`reminderDelivery` jobs publish due, noncancelled records to the private inbox.
Publication atomically creates one deterministic reminder activity entry, with
paired null money/currency for an unknown bill and its separate native currency.
External alerts expire 24 hours after their scheduled instant. Late events can
still appear in the inbox without a flood of external banners. External text is
generic and cannot include financial details. The durable delivery handoff is
`pending`, `disabled` or `expired`; private device bindings and transport
receipts are the following implementation task. Emulator checks prove inbox
and job behavior, not real FCM/APNs delivery.

The dispatcher processes at most 25 jobs within 450 seconds, retaining the
180-second projection and 60-second other-job reserves. Failed work keeps a
redacted processing-delay code and capped retry backoff. Diagnostics contain
job ID and kind, never tokens or private reminder text.

Actual query indexes are committed in `firestore.indexes.json`: existing
`systemJobs(kind,status,nextRunAt)` and `(kind,status,leaseExpiresAt)` cover the
extended queue; unsent cancellation uses
`reminders(instanceId,visible,status,__name__)`; the private inbox uses
`reminders(visible,scheduledAt DESC)`. Index deployment and readiness remain a
staging gate because emulator execution does not establish production readiness.

For operational repair, re-enqueue a validated active owner's reconciliation
when its source key changes, or reset that one owned job to pending with a new
generation and null cursor. Preserve terminal deduction events and published
reminders. Do not delete receipts, fabricate amounts, or bypass the account
deletion fence. Run repair against emulator/staging data first.
