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
`pending`, `disabled` or `expired`. External work continues on the same leased
job after inbox publication, in pages of ten active push devices. Each send has
a private deterministic receipt keyed by reminder, installation, token generation
and binding generation. Accepted receipts are skipped on retry; ambiguous network
results retry the logical receipt with capped backoff. A five-second timeout bounds
each network attempt outside Firestore transactions. Service acceptance is not a
physical device receipt, and an ambiguous attempt can duplicate a generic banner.
Emulator checks use injected transports, never real FCM/APNs.

Every send rechecks active account, period, preferences, current lease and global
token binding before authorization and after the result. A stale result cannot
retire a newer token or account binding. Invalid registration codes deactivate
only the matching generation; payload/configuration errors retry. Android/Web TTL
and APNs expiration retain the original external expiry. Expired external work
completes while preserving inbox/read history. SDK transport rejects demo projects
and emulator runtimes before invoking Messaging.

Devices use user-owned private `notificationDevices` subcollections and a private
`notificationTokenBindings/{sha256(token)}` global ownership record. Only trusted
callables register, list or unregister devices; sanitized responses exclude tokens,
hashes and generation internals. Registration changes never advance the financial
ledger. Stale cleanup scans at most 100 active devices inactive for 90 days and
rechecks the heartbeat and binding before retirement.

The dispatcher processes at most 25 jobs within 450 seconds, retaining the
180-second projection and 60-second other-job reserves. Failed work keeps a
redacted processing-delay code and capped retry backoff. Diagnostics contain
job ID and kind, never tokens or private reminder text.

Actual query indexes are committed in `firestore.indexes.json`: existing
`systemJobs(kind,status,nextRunAt)` and `(kind,status,leaseExpiresAt)` cover the
extended queue; unsent cancellation uses
`reminders(instanceId,visible,status,__name__)`; the private inbox uses
`reminders(visible,scheduledAt DESC)`. Device delivery uses `notificationDevices(active,channel,__name__)`; stale
cleanup uses collection-group `notificationDevices(active,lastSeenAt)`.
Index deployment and readiness remain a
staging gate because emulator execution does not establish production readiness.

For operational repair, re-enqueue a validated active owner's reconciliation
when its source key changes, or reset that one owned job to pending with a new
generation and null cursor. Preserve terminal deduction events and published
reminders. Do not delete receipts, fabricate amounts, or bypass the account
deletion fence. Run repair against emulator/staging data first.

## Client session and delivery capabilities

An owner-scoped Riverpod session starts without requesting notification
permission. The user requests permission explicitly in reminder settings.
Preview and emulator runtimes do not initialize real Messaging. A web runtime
without a validated public VAPID key keeps the inbox available without calling
Messaging. iOS without a ready APNs token can use permitted local alerts.
Unsupported desktop platforms keep the private inbox.

Each installation stores a stable nonsecret ID and, for local scheduling, at
most 50 numeric notification IDs per owner. This adapter stores no credentials,
token or financial payload. One device chooses push, local or none; it does not
schedule both external channels. Cached future snapshots cancel local alerts
until a current server snapshot arrives. Both local and remote alerts contain
only generic text and validated reminder/obligation/instance IDs.

On sign-out or owner disposal the session closes its generation fence first.
SDK stream cancellation runs concurrently with a bounded timeout. Owner-local
alerts are cancelled and the loaded device is unregistered while old auth is
still available; unregister has a three-second timeout. Platform clearing is
also bounded, and paused presentation listeners cannot hold authentication
sign-out. Late completions and native callbacks cannot reopen a disposed owner.
Independent cleanup stages can each time out; this is not a claim of a global
three-second sign-out deadline.

The private inbox resolves an incoming target against the current owner's
visible reminder and requires all three IDs to match before navigation. The
web worker opens `/#/settings/reminders/inbox` with those IDs, never financial
text or an arbitrary origin. Worker Firebase configuration is generated from
validated public app options. Native permission, background delivery, signing,
web VAPID and cold-start routing are verified on staging in the release gates,
not inferred from emulator success.

Future local queries use `reminders(visible,status,scheduledAt ASC)` with an
explicit UTC cutoff and a maximum of 50. Inbox cursors retain their cutoff and
limit. Refresh creates a new query context rather than silently changing a
cursor's time boundary.
