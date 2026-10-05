# Recurrence and scheduled civil time

The shared contract lives in `firebase/fixtures/recurrence.json`. Flutter and Functions run the same fixtures; neither uses the machine's local timezone or floating financial dates.

## Anchored occurrences

Rules store frequency, unit, interval, original anchor, preferred day, month-end flag, saved timezone/local time, inclusive start/end and positive rule version. Standard mappings are weekly1week, biweekly2weeks, monthly1month, quarterly3months and yearly1year. Custom intervals are1–365 days/weeks/months/years. Month/year rules require a preferred day1–31; day/week rules store null and cannot use month-end mode.

Index-based calendar arithmetic always returns to the original preferred day: January31 →February28/29 →March31. Yearly February29 returns in leap years. `nextOccurrence` directly seeks a lower bound in days or calendar months, then checks at most three candidate periods, including start/end. It does not scan daily history to find a distant future occurrence. `occurrencesThrough` returns at most30 dates and an explicit continuation marker; the trusted generator will persist its cursor separately from these immutable rule terms.

An original occurrence's key is `r:YYYY-MM-DD`; existing `occurrenceInstanceId` hashes the parent and key. Editing a displayed due date cannot change this key. Pauses, lifecycle, financial amounts and generation cursor are separate state handled by trusted commands, rather than mutating this pure calendar engine.

## One bundled timezone release

Both runtimes use **IANA2026c**, checksum `e4a178a4477f3d0ea77cc31828ff72aa38feff8d61aa13e7e99e142e9d902be4`, from the [official IANA release archive](https://data.iana.org/time-zones/releases/tzdata2026c.tar.gz). This includes597 zones/aliases and explicit transitions through2200, covering supported civil dates1900–2199 even when their UTC instant falls in the neighboring year.

The original timezone0.11.1 bundle freezes the last offset when it reaches an unprocessed POSIX future-rule tail. A2099 New York summer fixture caught this: it returned14:00Z rather than13:00Z for09:00 local. Managed Node's ICU data can also change independently of Flutter. Tally therefore generates both tables from the same checksum-verified source, instead of using those separate runtime databases for schedule calculations or server `localToday`.

`tool/rebuild_timezones.mjs` downloads/verifies the archive, runs IANA's `ziguard.awk` in rearguard mode, and invokes `zic -b fat -r /@<2201-01-01 UTC>`. This upper bound expands future rules into explicit transitions. The pinned timezone0.11.1 parser/serializer emits `lib/core/dates/tally_timezones.g.dart` and `functions/src/generated/timezones.json`. The table is public calendar data, not financial records or credentials. Profile validation accepts the same supported-zone catalog as Flutter and rejects numerical offset strings.

Rebuild requires Node22, curl, awk, tar, zic and Dart with the locked project dependencies. Run `node tool/rebuild_timezones.mjs` or pass a local archive path as the first argument for an offline rebuild; both paths enforce the checksum. Commit both generated artifacts together after fixture tests. Updating data is explicit: update the pinned URL/checksum, regenerate and run cross-language tests before deploying. Future legal timezone changes require such an update; the bundle reflects the chosen release's rules.

## Gap and overlap policy

Resolve all actual offsets from the saved zone, check exact local-time candidates and choose the earliest exact instant in an overlap. If no exact candidate exists, bracket the forward transition and find its first valid instant using millisecond binary search. This handles hour, half-hour and whole-day gaps without preserving invalid minutes.

| Saved schedule | UTC instant |
| --- | --- |
| Manila2026-10-05 09:00 | 2026-10-05 01:00Z |
| NewYork2026-03-08 02:30 gap | 2026-03-08 07:00Z (first03:00) |
| NewYork2026-11-01 01:30 overlap | 2026-11-01 05:30Z (earlier) |
| LordHowe2026-10-04 02:15 gap | 2026-10-03 15:30Z (first02:30) |
| Apia2011-12-30 09:00 skipped day | 2011-12-30 10:00Z (firstDecember31 midnight) |

Additional fixtures cover non-hour Kathmandu/Chatham offsets, leap/month-end behavior, date bounds and bounded continuation. Server tests check a2099 local-time roundtrip for every bundled zone. Actual due dates remain civil strings; audit timestamps and scheduled instants remain separate.

## Trusted period generation and edits

Creation atomically writes the owner-scoped template, first period when within a90-day horizon, permanent command receipt, ledger invalidation and deterministic owner/template generation job. Every later batch checks the active owner, current parent revision and current six-minute lease inside the transaction. It considers at most30 periods, verifies existing deterministic identities, and atomically commits instances, period jobs and cursor. A conflict or failed create rolls back all staged documents and cursor changes. Continuations remain immediately eligible; quiet schedules refresh at the next saved-zone midnight. Closed pause ranges are skipped directly; an open pause does not consume the eventual resume range. End dates are inclusive, including an explicit lifecycle cutoff before the first occurrence.

Fees, contacts, sources, reminders and rule edits affect newly generated snapshots. Rules cut over after the last generated occurrence; an existing occurrence cannot acquire new terms through generation. Moving an unpaid period's due date keeps its occurrence key, original date and snapshot, and records the actual source override separately. Amount edits cannot undercut effective paid amounts. Skipping requires zero effective paid, preserves amounts/history and cancels the period's pending jobs.

Variable periods use `amountState=unknown`, null amount/remaining, zero paid and an optional estimate in the snapshot. Entering an amount after its automatic deduction time requires confirmation. Template lifetime amounts and `nextDueDate` remain null; outstanding dates come from individual periods and complete projections. `nextGenerationDate` describes schedule processing and must not be presented as the next outstanding bill.

The scheduled generation dispatcher uses `kind=recurringGeneration`, `status=pending` plus `nextRunAt`, and separately expired `status=leased` plus `leaseExpiresAt`. Both indexes reuse the corresponding kind/status/date system-job composites. Parent period pages use obligationId/occurrenceDate ascending; lifecycle retention counts add userId to that server-owned query. Index declarations are in `firestore.indexes.json`; emulator success does not establish production index readiness.

## Payments and automatic deductions

Recurring payments allocate to exactly one chosen period. Known amount minus valid payments is the remaining balance; overpayments are rejected before any writes. Corrections append a full reversal, a reversal marker, and an optional replacement into that same period. Parent lifetime caches remain null. Every owner command atomically records its permanent receipt, financial changes, activity, ledger revision and one coalesced owner projection job.

An automatic scheduled event is identified by the period and saved rule version. Its permanent receipt is independent of any transient worker lease. A known, timely registered automatic bill assumes only its unpaid remainder. Confirmation mode, unknown amounts, and retrospective registration create an expected attempt without inventing a payment. Early processing defers; closed, skipped, failed or resolved periods never receive another assumption from the same scheduled event.

Assumptions retain their original source, civil payment date, saved timezone, amount and provenance. Confirming identical terms appends immutable payment evidence rather than modifying or duplicating the payment. Changed terms require correction. A confirmed expected bill creates its own confirmed payment. Reporting a failed assumed or confirmed charge appends a full reversal and reasoned attempt, reopening its balance. Expected failure creates no payment. An explicit ordinary manual retry can settle the outstanding amount with a `resolved` deduction label and an immutable `manualResolved` attempt.

`deductionAttempts` and `paymentEvidence` are owner-readable, server-write-only history. Internal `deductionEvents`, receipts and global jobs remain private. Full projections fold payment evidence under the same source-revision guard to separate assumed and confirmed monthly totals without changing the source payment.

## Prompt dispatch and recovery

Firestore job writes and the five-minute scheduled recovery worker use the same transactional leases. One dispatch scans at most25 candidates within450seconds; it reserves180seconds before starting a complete projection and60seconds before other jobs. Generation and deduction transactions check current owner, revision, lease token, generation and expiry on every retry and again immediately before staged writes commit. Errors release matching leases with bounded backoff and redacted diagnostics. Completion writes do not recursively run completed or unexpired leased jobs.

New commands coalesce projection work into one deterministic global owner job. After projection, a bounded transaction can retire up to100 compatible legacy pending revision markers already represented by that job. It never removes command receipts, payments, evidence, foreign markers or markers for a future revision.

`npm run test:emulators` builds Functions, runs a fresh normal automatic emulator for the actual Firestore event pipeline, then starts fresh manual-scheduling demo emulators for deterministic financial races and security tests. The manual flag is honored only by a `demo-*` Functions emulator. Production always processes prompt events. Test cleanup marks synthetic owners deleting before removing their history, matching protected account deletion.
