# Tally reminders and notifications — M5b

Tally should tell its signed-in owner what needs attention without changing a
balance, exposing private amounts on a shared device, or depending on an open
client. This increment completes reminders, a private inbox, device registration
and delivery adapters within the authorized MVP. Keep the original Tally theme,
main branch, Firebase stack, civil dates, independent payment history and native
currency separation. M6–M8 still own attachments, durable offline financial
commands, broader platform/release checks and live provisioning.

## Decisions

Use persisted reminder jobs and the existing trusted, fenced dispatcher. A
client-only scheduler would miss events when the app is closed; an external
notification service would add a second authorization boundary. Firestore inbox
records are the durable product result. Push and native local alerts are
optional delivery channels, never evidence that an obligation was paid.

Use `users/{uid}/notificationPreferences/default`. Bootstrap migrates the legacy
`current` seed for existing owners without changing its enabled/push choices or
revision. New owners receive the full canonical document. Keep the legacy
document for compatibility, but all new reads and writes use `default`.
Nonfinancial commands retain ownership, strict validation, revision checks and
permanent idempotency receipts without increasing the financial ledger revision
or enqueuing balance projections. Do not weaken existing financial commands.

Always send generic external text: “Tally reminder” / “Open Tally to see what’s
due.” Transport data has a reminder ID and target IDs only. A stale registration
after offline sign-out must not expose names, money, notes or contact details.
Sensitive text stays in the owner-authorized inbox; `allowSensitivePushText` is
false and cannot be enabled in this MVP. Authentication and ownership are
checked again when opening a notification.

## Preferences and policy

Canonical fields: `enabled`, `enabledKinds`, `offsetDays`, `localTime`,
`quietStart`, `quietEnd`, `pushEnabled`, `localEnabled`,
`allowSensitivePushText:false`, `timezonePolicy:'savedDueProfileQuiet'`, revision,
schemaVersion, owner and server audit timestamps. Kinds are upcoming, dueToday,
overdue, automaticUpcoming, automaticConfirmation and owedToMe. Defaults enable
all kinds, offsets `[3,0]`, time `09:00`, quiet hours `21:00`–`08:00`, inbox on,
external channels off. All times are strict `HH:mm`. At most eight distinct
integer offsets 0–365. Equal quiet start/end means quiet hours disabled;
otherwise support both overnight and daytime ranges, end exclusive.

Recurring instances keep their existing immutable reminder-policy snapshot.
An enabled instance uses its saved offsets/time; global enabled/kinds/channels
are an upper bound. Finite loans/installments use the same defaults, with an
owner-command policy editor on the obligation for custom reminders and disabling.
Legacy finite records without policy adopt canonical preference offsets/time.
Changes to a template affect future generated periods; changing a finite policy
reconciles its retained outstanding periods. Paid/skipped/cancelled periods and
cancelled obligations suppress unsent reminders. Paused/ended recurring templates
keep reminders on existing outstanding periods.

## Civil schedule

Subtract offsets from the saved civil due date, then resolve local time in the
saved instance timezone using the checked-in timezone/DST resolver. Upcoming
events use only positive offsets; offset zero is dueToday. Owed-to-me uses its
own kind with due/early phase in the inbox message. Automatic upcoming replaces
ordinary upcoming for automatic modes. Automatic confirmation starts when an
expected deduction requires confirmation and remains outstanding; it does not
record payment. Overdue events use due+1, +3, +7, then +14,+21,… civil days,
with at most one overdue alert per seven days after the first week.
Confirmation uses the actual saved expectation instant and its original civil
date; daily preparation does not create a new confirmation date. The overdue
cadence handles ongoing outstanding confirmations. Owed-to-me alerts also obey
the corresponding upcoming/due/overdue category toggle, plus the owed-to-me toggle.

Quiet hours use the current profile timezone. If a resolved instant falls in
quiet hours, postpone to the first quiet-end instant in that zone, using the
same DST policy: earlier overlap occurrence and first valid instant after a gap.
If the event is already inside the second occurrence of a repeated quiet hour,
choose the next actual quiet-end occurrence; do not move backward to the first
occurrence or deliver while still in quiet hours.
Use civil arithmetic rather than adding UTC 24-hour durations. Never move the
stored financial due date. Support the existing 1900–2199 due-date range and
597 checked-in IANA zones; reject unsupported inputs rather than defaulting.
Clip the planning window at supported calendar bounds and skip offsets beyond
them. Quiet-hour postponement beyond 2199 fails explicitly instead of inventing
a supported financial date.

Generate a bounded window from today minus seven civil days through today plus
90 days. Do not flood a returning user with every missed event: an old pending
event can become visible in the inbox, but its external alert expires after
24 hours. For long-overdue periods generate the next due+7n event, rather than
scanning every day since the loan. Extend the window daily through each period's
persisted job; no whole-user scan on every dispatcher invocation.

## Jobs and inbox

Logical reminder ID is a hash of owner, instance ID, kind, civil target date,
preference revision and effective policy revision. Store semantic fields next
to that ID. A preparation job is deterministic per owner/period, references
parent/instance revisions and preferences, and processes at most 32 planned
events per transaction. It paginates/reconciles retained outstanding periods
in batches of 100 after preference/profile/finite-policy changes. Unsent stale
events become cancelled; sent historical records retain their snapshots.

Inbox schema includes reminderId, obligationId, instanceId, kind, phase,
civilTargetDate, scheduledAt, savedTimezone, quietTimezone, preferenceRevision,
policyRevision, parentRevision, instanceRevision, status
`pending|sent|cancelled|failed`, visibleAt, readAt, revision, private title/native
amount/currency snapshot, generic messageKey and delivery summary plus common
owner/audit fields. Unknown amount stays null; estimate is not a payable amount.
Visibility is scheduledAt <= now with noncancelled status. A push failure does
not remove an inbox event. Mark-read commands cannot change delivery state.

Every delivery checks active owner, current preferences, target ownership,
canonical period state and revisions immediately before sending. Preference,
due-date, amount, payment, reversal, skip/cancel and profile-zone changes rearm
reminder preparation; completed automatic deduction jobs never restart. Finite
instance creation also creates preparation jobs. Deterministic IDs and a lease
generation fence make duplicate trigger/scheduler runs safe. Lease is six
minutes, dispatcher at most 25 jobs / 450 seconds, with the existing per-kind
time reserve. Transaction reads precede writes. A stale/expired worker cannot
publish or mark newer work complete. Retry with capped backoff and redacted
logs; failed jobs are retained for recovery.

Push occurs outside Firestore transactions. Persist one delivery receipt per
reminder/device/token-generation before send and recheck current binding before
dispatch. Retries reuse logical IDs. Ambiguous FCM timeouts may duplicate a
banner, so exactly-once physical delivery is not promised. Inbox creation and
financial history remain idempotent. After invalid-registration responses,
deactivate only the still-matching token generation, never a newer rotation.

## Devices and channels

Device documents are client-inaccessible. Protected commands register/rotate or
unregister installation ID, platform android/ios/web, token, permission, channel
`push|local|none`, appVersion and revision. Validate bounded IDs/token length and
fields; never log tokens. A private global token-hash binding ensures one active
owner per token and deactivates the previous owner's matching record on account
switch. Return sanitized labels/times/channel only. Stale devices after 90 days
are deactivated in bounded cleanup pages. Multi-device registrations are supported.

Permission is requested only from an explicit Enable notifications action.
Denied, unsupported, missing VAPID/APNs and emulator environments give clear
channel status and keep the private inbox functional. Official FlutterFire FCM
adapters handle token refresh and foreground/opened/initial messages. Web uses
a dedicated service worker and validated public runtime Firebase/VAPID config;
never embed production secrets or make a demo emulator call the real FCM service.
Native local notifications schedule cached canonical reminders through a
platform adapter with stable IDs, generic text and IDs-only payloads. Limit
native pending schedules to 50, ordered by scheduledAt; refresh on app resume,
new snapshots and time/profile changes. Reconcile/cancel after payments, policy
changes and sign-out. Choose one external channel per device/event to limit
duplicates. Local offline alerts can be stale until reconnection, which the
settings copy explains without pretending offline payment is synced.

On sign-out, invalidate owner-scoped listeners and pending callbacks first,
cancel native schedules and attempt trusted unregister while the old auth is
still available, with a bounded timeout so failed network cannot trap sign-out.
Drop every late old-owner completion. Generic text remains the privacy backstop
when unregister cannot complete. Message opens validate IDs and route through
existing auth/owner gates. M7 owns whole-app cold-start route-intent hardening.

## Flutter experience

Add a private Reminders screen accessible from the existing bell and Settings.
Show Today/Earlier groups, unread status, clear due/automatic/overdue labels,
saved civil date and currency, and link to the exact owned period. Use 50-row
owner-bound pagination ordered by scheduledAt DESC/documentId DESC; queries
include visibility date and exclude cancelled reminders through server-managed
inbox visibility fields. Empty copy explains no reminders; cache/failure labels
remain truthful. No unbounded device token stream or Firebase calls in widgets.

Settings provides enabled/kinds, custom offsets/time, quiet hours and explicit
push/local permission actions. Drafts keep loaded revision, show conflicts,
retain uncertain command IDs for retry and prevent previous-owner completion.
Maintain responsive mobile/tablet/desktop, Material 3, keyboard reachability,
200% text, system/light/dark and the original Lavish design.

## Verification and release evidence

Pure TS/Dart tests cover custom offsets, DST gap/overlap, quiet-hours ranges,
owed-to-me, overdue cadence, saved/profile zone difference, unknown currency
amounts, variable bills, confirmation/failure and cancelled/paid suppression.
Emulator tests cover migration, protected idempotent nonfinancial commands,
unchanged ledger revision, finite/recurring preparation, duplicate jobs,
preference/due-date/payment races, stale leases, paused/ended retained dues,
inbox read ownership, token reassignment/rotation and invalid cleanup. Push tests
inject a transport: they prove payload privacy and retry/binding behavior, not
physical delivery. Dart repository/provider/widget tests cover all settings,
strict DTOs, cursor/owner boundaries and sign-out callbacks. Actual synthetic
browser evidence exercises private inbox/settings/sign-out with emulators.

Live FCM needs configured project resources, HTTPS/VAPID and APNs/native signing.
Record those as staging/native release gates until verified on provisioned
devices. Use the Emulator Suite, never production data for development tests.

References checked 2026-10-05: [Flutter FCM setup](https://firebase.google.com/docs/cloud-messaging/flutter/get-started),
[Admin delivery](https://firebase.google.com/docs/cloud-messaging/send/admin-sdk),
[native local notifications](https://pub.dev/packages/flutter_local_notifications).
