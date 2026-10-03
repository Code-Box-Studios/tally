# Tally product requirements

Tally makes personal obligations easy to record, review, and settle in the tracker. It gives one person a clear view of debts, receivables, recurring dues, payment records, and upcoming deductions across their devices.

## Product boundaries

An obligation is a tracked promise or scheduled amount. A payment is a user's record of money paid or received, or an explicitly labeled automatic assumption. A contact is a person or organization; contacts are not other Tally accounts in the MVP. A payment source is an organizational label, not a bank balance or stored credential.

Success means the user can identify their next payment, record a partial repayment, and later reconstruct how the remaining balance was calculated. No feature should require accounting vocabulary to understand.

## Release scope

The production MVP includes Firebase Authentication, onboarding/profile, dashboard, one-time borrowing/lending, finite installments, recurring monthly dues and other frequencies, variable bills, manual/full/partial payments, three payment behaviors, people/organizations, sources, categories, attachments, history/corrections, calendar, reminders, activity, search/filters, offline queues, Firebase synchronization, responsive layouts, themes, secure rules, App Check, server recurrence, FCM, monitoring, and automated verification.

The MVP excludes direct bank/e-wallet integrations, transfers or actual debit initiation, automatic transaction matching, double-entry accounting, budgets, income/expense books, exchange-rate conversion, shared accounts/debts, settlement between separate obligations, exports/reports, biometric lock, widgets, and AI. Future architecture can add these without prebuilding them.

Interest metadata includes an optional rate, basis description, and agreement notes. MVP totals include the agreed original amount only; the form explicitly says that interest is not automatically accrued. Users wanting an agreed total inclusive of interest enter that total at creation. Compound interest, amortization, penalty fees, and dynamic interest calculations require a later defined financial model.

## Functional requirements

| ID | Capability | Acceptance criteria |
| --- | --- | --- |
| FR-01 | Authentication | Email/password registration/login/reset and Google login create or recover one owner profile. Private screens require authentication. Failed profile setup is retryable. |
| FR-02 | Onboarding | Welcome, currency, IANA timezone, reminders, and first obligation. Optional steps are skippable; defaults remain editable. Notification refusal does not block use. |
| FR-03 | Dashboard | Per-currency You Owe, Owed to You, net position, monthly dues, due/paid/remaining this month, today/soon/overdue, upcoming auto deductions, recent activity. Tapping a figure opens its underlying records. |
| FR-04 | Borrowing/lending | Contact, description, amount/currency, borrowed/lent date, due date, category, source/mode, optional schedule/interest/notes/attachments/reminders. Edit supported fields without editing calculated remaining balance. |
| FR-05 | Payment history | Each payment has its own ID, amount/currency, date, source, method, notes, timestamps, owner, obligation, and instance/allocation links. Previous payments survive new payments and corrections. |
| FR-06 | Partial/full payments | Preview outstanding balance; select full/partial/custom amount. ₱20,000 less ₱5,000, ₱2,500, and ₱4,000 yields paid ₱11,500 and remaining ₱8,500. |
| FR-07 | Overpayment handling | Entering ₱2,500 against ₱2,000 remaining produces a clear warning and is rejected by the server. Correcting/reversing a mistaken payment stays traceable. |
| FR-08 | Recurring dues | Weekly, every two weeks, monthly, quarterly, yearly, and every N days/weeks/months/years. Independent generated periods preserve their amount and recurrence snapshot. |
| FR-09 | Fixed/variable amounts | Fixed Netflix periods have a known amount. Variable electricity periods start with amount needed; setting October's amount does not change September. |
| FR-10 | Pause/end | Pause stops new occurrence generation; history remains. Resume starts at the next eligible date, without silently creating paused periods. Ending has an explicit effective date. |
| FR-11 | Automatic behavior | Manual requires a payment command. Automatic records one labeled assumed deduction when eligible. Confirmation mode stays expected until confirmed. Failure leaves/restores an outstanding amount. |
| FR-12 | Sources | Create/edit/archive Cash, bank, debit/credit card, GCash, Maya, payroll, other. Only optional four digits; no passwords, PINs, CVVs, complete card numbers, or bank credentials. |
| FR-13 | Contacts | People and organizations share one entity model. Contact detail shows obligations, history, notes, and per-currency net positions without settling debts. |
| FR-14 | Calendar | Date-only events include borrowing/lending due items, dues, installments, deductions, and paid periods. Filter by type/status/mode/contact/category/currency and date range. |
| FR-15 | Reminders | Offsets 0/1/3/7 or custom days; upcoming/today/overdue/automatic-confirmation reminders. In-app inbox survives denied or failed push delivery. |
| FR-16 | Activity | Chronological creation, edits, payments/receipts, partial/full completion, due changes, automatic assumption/failure, and generated reminders. Links to the relevant record. |
| FR-17 | Attachments | Upload owner-private receipts, agreements, screenshots, and bills. Show uploading/processing/ready/failure states. A failed attachment upload does not roll back an otherwise valid payment. |
| FR-18 | Categories | Supplied categories plus custom labels. Archiving prevents new selection while preserving history. |
| FR-19 | Search/filter | Search contact/organization/title/category/notes over an explicit user-owned result set; filters include type, state, date, amount, behavior, source, currency, category, contact. Paginated filtering remains correct across pages. |
| FR-20 | Currency | Start with PHP/USD/EUR/SGD/AUD/JPY/GBP. Every monetary item stores a code and minor units. The default is a creation preference, not a conversion. |
| FR-21 | Offline/sync | Cached records remain readable; create obligations and payments as durable pending commands. Reconnect/restart retries once logically; rejection is visible and editable. |
| FR-22 | Settings | Profile, default currency, timezone, theme, reminder/privacy preferences, sources, categories, device sessions, sync failures, sign-out, and protected account deletion. |

## Status vocabulary

Internal types are `owedByMe`, `owedToMe`, `recurringDue`, `installment`, and `subscription`; installment direction additionally stores who owes whom. Labels use I Owe, Owed to Me, and Monthly Dues. No raw enum value appears in copy.

Obligation lifecycle is active/paused/ended/cancelled. Financial status is pending/active/partiallyPaid/paid/overdue/skipped/cancelled; recurring instances also distinguish upcoming. Deduction status separately records scheduled/expected/deducted/confirmed/failed. Display one primary financial label and supporting auto label. For example: **Overdue · Auto deduction failed**, or **Paid · Assumed deduction**.

Overdue takes visual priority over partial when an outstanding amount has passed its due date; the payment detail still shows the partial amount. Recurring templates stay active even when all generated periods have been paid.

## Quality requirements

These are proposed measurable targets, to validate during implementation rather than promises already met.

| Area | Requirement |
| --- | --- |
| Integrity | Exact minor-unit arithmetic; no negative remaining balance; no mixed-currency addition; exactly one logical payment/occurrence per idempotency key. |
| Security | Default-deny ownership rules, authenticated reads, callable authorization, App Check enforcement, private file access, no secrets in repository/client. |
| Reliability | Payment/instance/local aggregate/activity transaction succeeds or none of it commits. Background retry preserves financial identity. Restore canonical state from ledger. |
| Responsiveness | Mobile at 320–599 logical pixels, tablet at 600–1023, desktop at 1024+. Usable at 200% text size and with keyboard/screen reader. |
| Performance | Cached dashboard ready within one second after session hydration on test hardware; warm online command p95 under two seconds in the selected region; smooth 60 Hz scrolling in a 1,000-record fixture. Measure cold starts separately. |
| Processing | Five-minute due dispatcher; healthy processing completes within 15 minutes of eligibility. Alert when oldest eligible job exceeds 15 minutes. Notifications have no guaranteed arrival time. |
| Maintainability | Feature-first modules, typed interfaces, small widgets, migrations/schema versions, pinned lockfiles, documented extension boundaries. |
| Privacy | No amounts/names/notes/receipts/tokens in analytics or crash logs. Generic push text by default. Clear cached private data at sign-out; trusted-device opt-in for persistent web storage. |
| Observability | Redacted command/job IDs, transaction conflict/retry counts, projection lag, invalid FCM tokens, failed jobs, client crash signals. |
| Recovery | Proposed production backup every day and recovery objective of 24 hours of data / four hours to restore service. Prove via staging restore drill before launch. |

## User stories

| Story | Observable success |
| --- | --- |
| As a borrower, I want to see what I still owe Ana. | A ₱10,000 obligation with ₱3,000 in payments shows ₱7,000 remaining and each payment. |
| As a lender, I want to record John's partial repayment. | ₱5,000 with a ₱2,000 receipt shows ₱3,000 remaining under Owed to Me. |
| As a bill payer, I want to see my next due dates. | Calendar and Due Soon link to the same unpaid instances. |
| As someone with a variable bill, I want to enter this month's actual amount. | One period changes; previous bills and payments do not. |
| As someone with card deductions, I want to distinguish expected from confirmed. | Confirmation mode shows Expected without creating a payment until I confirm. |
| As an offline user, I want my repayment entry to survive restart. | Pending command survives and is accepted once after reconnection, or shows the server rejection. |
| As someone who made a mistake, I want to correct my record. | Original, reversal, reason, and replacement are accessible; totals are recalculated. |
| As someone using two currencies, I want truthful totals. | PHP and USD totals remain separate; no composite money figure is invented. |
| As a user on a shared computer, I want my records to stay private. | Web persistence is opt-in, sign-out clears local data, and another account cannot read it. |

## Default taxonomy

Seed Personal Loan, Rent, Utilities, Subscription, Credit Card, Insurance, Vehicle, Education, Family, Business, Housing, Membership, Installment, Other. Seed IDs are stable, localized display names are replaceable, and bootstrap is idempotent.

Credit card in the MVP is a category/source label and a user-entered due amount. It does not imply statement import, revolving-interest calculation, or credit-limit accounting.
