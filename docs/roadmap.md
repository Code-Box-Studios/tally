# Tally incremental development roadmap

This roadmap decomposes the proposed product into independently testable milestones. It covers the requested MVP without generating the application in one pass. Detailed file-by-file implementation plans are written and reviewed for one milestone at a time; this roadmap is not an approved execution plan.

## Delivery order

| Milestone | Deliverable | Depends on | Completion evidence |
| --- | --- | --- | --- |
| M0 | Toolchain, responsive Flutter shell, environments, money/date core, Firebase emulator harness, CI skeleton | Design review and first implementation plan | Flutter analyzer/unit/widget tests; web and Android development run; macOS iOS verification path documented; demo-project fail-closed wiring |
| M1 | Authentication, owner profile/bootstrap, onboarding, session-isolated repositories, baseline ownership rules | M0 | Email/Google integration, repeated bootstrap, logout/account switch tests, unauthenticated/cross-user rule denials |
| M2 | One-time borrowing/lending, contacts, categories, payment sources, immutable partial/full ledger and corrections | M1 | Debt → payment → remaining → correction flow; FIN-01–09; atomic rollback and concurrent payment emulator tests |
| M3 | Due instances, finite installments, dashboard projections, history, activity | M2 | Exact allocations and principal conservation; FIN-10–12, SUM-01–02; readable as-of summaries and paginated history |
| M4 | Recurrence, variable bills, pause/end, automatic/confirmation/failure processing | M3 | REC-01–10, AUTO-01–05, DATE-01–02; app-closed jobs work and overlapping workers deduplicate |
| M5 | Calendar, filters/search, reminder inbox, native local notifications and FCM devices | M4 | QUERY-01; all calendar filters; due/paid reminder cancellation; staging APNs/browser/Android delivery and denied-permission fallbacks |
| M6 | Private attachments, durable offline commands, restart/reconnect conflict handling | M2–M5 | FILE-01, SYNC-01–04, Storage Rules denials, token removal, quota/restart/multi-device cases |
| M7 | Complete responsive UI, dark/system theme, accessibility, operational hardening, protected account deletion | M1–M6 | UI-01, SEC-01–03; real staging rules/indexes/App Check; Android/iOS/web release candidate checks; backup/restore drill |
| M8 | Controlled production release and monitored rollout | M7 | Release gates met, actual environment configuration reviewed, jobs/telemetry healthy, staged rollouts and rollback ready |

Early milestones initialize OutboxStore interfaces and online-only CommandSubmission semantics; M6 adds fully verified durable/offline behavior. M2 cannot pretend a network error is a stored offline payment before M6 supplies that guarantee. Private attachments start only when reservation/finalization/rules can be tested together.

## Current delivery status

The local Flutter/Firebase implementation covers authentication, obligations,
immutable payments/corrections, people, sources, recurring/automatic periods,
calendar, search, reminders, activity and private attachments. Durable offline
commands and independent pending receipts are implemented; their final whole
gate and fresh review are in progress. The
[offline verification record](quality/offline-sync-verification.md) distinguishes
actual browser/emulator/file IO evidence from controlled contracts and device
or staging checks.

M7 still requires protected account deletion, complete device/accessibility and
operational checks, deployed App Check/rules/indexes, notification delivery and
backup/restore evidence. M8 has not released this implementation. The existing
Hosting site remains the earlier preview; paid project provisioning, database
region selection and real release artifacts are not inferred from local tests.

## Milestone boundaries

### M0 establishes the foundation

Install/verify the compatible Flutter/Dart, Android, Node/Firebase CLI, and emulator Java toolchains. Lock a tested SDK/dependency set and create Android/iOS/web Flutter targets without modifying the user's existing graft directory. Establish environment selection, app theme, responsive navigation, typed failures/IDs/money/civil dates, and capability adapters.

The first detailed plan should concentrate on Money/LocalDate correctness, emulator-safe initialization, and a responsive shell. No actual Firebase project provisioning is required to prove M0. The design proposes PHP and Asia/Manila as editable defaults. Include fixtures for exact parsing, currency exponents, checked arithmetic, and date preservation from the first commit.

### M1 makes the application owner-private

Implement auth/session redirects and idempotent bootstrap; seed profile/categories/preferences; introduce owner-scoped repository providers, basic callable authorization, and deny-by-default rules. Wire onboarding and sign-out lifecycle. Verify account switching cannot reuse another owner's queries, local drafts, or notifications. Configure real Google integration in dev/staging after emulator flows work.

### M2 delivers the first useful financial slice

Add contacts/sources/categories through typed commands, create one-time debt/receivable with its due instance, record manual partial/full payments, preserve history, and correct a payment with reversal/replacement. End-to-end acceptance is the borrowed ₱10,000 → paid ₱3,000 → remaining ₱7,000 case, and the lent ₱5,000 → repaid ₱2,000 → remaining ₱3,000 case.

Include idempotency receipts, parent/instance balance transactions, activity creation, overpayment rejection, and ownership/link validation. Do not postpone financial concurrency/atomicity tests until UI polish.

### M3 makes upcoming obligations visible

Add finite schedule creation and allocation rules, due queries, dashboard currency buckets and revisioned summaries, detail payment/period lists, contact positions, and activity. Prove principal is not counted twice and monthly payment-date totals cannot erase unrelated current-month dues. Paginated streams and stale-summary state are part of the deliverable.

### M4 makes recurrence independent of the client

Implement recurrence calculator fixtures before server generation. Add deterministic occurrence identities, generation cursors, lifecycle revision fences, fixed/variable periods, and daily/five-minute job dispatch. Add assumed/confirmation modes with a clear UI explanation, attempt history, failure reversal, and manual resolution. Test competing workers plus competing manual payments.

### M5 adds calendars and reminders

Implement date agenda/month rendering, query planner/residual filters, search progress, in-app inbox, notification preferences and device registration. Test server reminder creation/cancellation independently from transport. Configure native/web FCM and local notifications through adapters and verify actual capabilities in staging.

### M6 makes temporary disconnection safe

Add durable local schema/migrations, dependency-aware dispatch, restart recovery, receipt reconciliation, quota handling, user-isolated cache lifecycle, and canonical-vs-pending displays. Add Storage reservation/upload/finalization/download with private access and no public bearer URLs. Verify offline payment acceptance/rejection when server auto processes the same period.

### M7 verifies production behavior

Finish every responsive screen, keyboard/screen-reader/text-scale behavior, themes and empty states. Add protected account deletion, operational alerts/reconciliation, migrations/restore procedures, privacy controls, error reporting and feature flags. Test real environments and deployed rules/indexes; record iOS login-services/store requirements and complete required auth before public store submission.

### M8 releases only verified behavior

Provision the selected production project/apps/region and configure rules, indexes, Functions, Storage, auth domains, App Check, FCM/APNs, monitoring, backups, and signing with reviewed deployment identities. Publish through staged app-store/web release procedures once actual release artifacts and checks are available. Track payment/recurrence integrity and job lag throughout rollout. This documentation turn does not deploy or publish anything.

## Development workflow

Each milestone has a short written spec refinement if needed, a reviewed implementation plan, focused changes, meaningful tests for financial/security behavior, and a verified completion record. Begin with a vertical slice rather than every repository stub. Keep production Firebase data out of development. Avoid adding later budgeting/bank/AI features while any core obligation flow is incomplete.

Financial/security tasks follow a failing-test → minimal implementation → passing-test cycle. UI/layout work uses targeted widget/browser/device checks where they establish actual behavior. Shared fixtures keep Dart and TypeScript calculation rules aligned. Review source changes and run the checks relevant to the changed behavior before recording milestone completion.

## Future extension boundaries

| Future feature | Boundary prepared now |
| --- | --- |
| Bank/e-wallet synchronization | Separate external-event ingestion and provenance; reconciliation creates commands, never overwrites manual history |
| Automatic transaction matching | Match candidates reference immutable ledger and instance identities; explicit deduplication/external IDs |
| Shared loans/households | New membership/authorization model with explicit private-data migration; no implicit cross-user contact access |
| FX conversion/reporting | Rate-provider and valuation-date policy; retain native-currency ledger and separate conversion views |
| Budgets/income/expenses/savings | Separate domain modules consuming documented ledger projections |
| CSV/PDF exports and widgets | Query/repository boundaries plus privacy-aware presentation adapters |
| AI questions | Read-only authorized summary/query interface; clearly identify date/currency/as-of state |
| Biometric/encrypted offline storage | Local-store capability adapter; no claim of encryption before implementation |

These are compatibility directions, not MVP work items or hidden dependency commitments. No timeline is promised before verifying toolchains, platform access, and per-milestone scope.
