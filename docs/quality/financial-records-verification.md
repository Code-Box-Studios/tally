# Financial records verification

M2 connects private borrowing/lending records, contacts and organizations, payment sources, categories, full/partial payments and append-only corrections to authenticated Firebase callable commands. All verification below used `demo-tally` emulators or isolated Dart fixtures, never live financial data.

## Financial integrity and privacy

- Functions validate exact owner-bound envelopes, integers in currency minor units, civil dates, revisions and owner-owned references. Transactions create obligations/instances, payments, activities, command receipts and projection jobs together.
- Payment history is immutable. Corrections append an equal reversal and optional replacement; the unique reversal marker prevents two devices from reversing one original twice. Invalid replacements leave all records unchanged.
- Emulator cases cover duplicate/lost-response replay, changed payload reuse, competing payments/overpayment, inactive owners, foreign references, stale revisions, currency mismatches and correction rollback/races. Client canonical writes remain denied.
- Flutter repositories map strict DTOs and use bounded, cursor-based owner queries. Scoped providers and captured command owners prevent a late response from changing a new account. Riverpod automatic read retries are disabled inside the private workspace: terminal failures display immediately, with explicit retry; Firestore still manages network reconnects.
- Loaded continuation pages are snapshots. Fresh first-page documents take precedence, a new first-page snapshot clears old continuation pages, and obsolete pending loads are discarded. Refresh loaded records re-reads the query. Complete contact positions are labeled only after all pages have been read and remain separated by currency; independent debts are never settled automatically.

## Interface verification

Widget tests verify borrowing ₱10,000 → payment ₱3,000 → remaining ₱7,000 and lending ₱5,000 → repayment ₱2,000 → remaining ₱3,000; invalid amounts/dates; overpayment warnings; full payment; failed corrections; required reasons; duplicate submit; catalog management; deep links; malformed IDs; and account switching during a pending payment. Form checks include 320×640 and 640×320, 200% text and a 220px keyboard inset.

The Flutter shell uses the original Lavish lowercase wordmark, bundled DM Sans/Manrope fonts, calm palette, 230px desktop sidebar, 82px header and mobile bottom navigation. Desktop obligations use columns for name, category, remaining, due date and status; mobile records and forms adapt to available space. Dashboard content and its original multi-column panels remain M3 work.

Actual browser checks against official FlutterFire adapters and running emulators:

1. Create an email account, finish onboarding, add an inline person and a ₱10,000 borrowing record.
2. Record ₱3,000, then the full ₱7,000 remaining; verify the paid state and two independent original payments.
3. Correct the mistaken full payment with an explicit reason; verify paid ₱3,000/remaining ₱7,000 and preserved history.
4. After the rules test suite deliberately reset emulator fixtures, recreate a borrowing record and partial payment, fully reload the browser, and verify the same ₱10,000/₱3,000/₱7,000 values.
5. Inspect actual desktop and 390×844 screenshots. Sign out, create a second account, open the first account's obligation URL and verify an immediate unavailable-access message with no loan values. Its People list is empty. Fresh reload checks report no browser console or Dart runtime errors.

Browser automation's Control+A modifier events produced a Flutter engine assertion during simulated typing; ordinary field entry worked, and a fresh reload without those injected events had no errors. The emulator warning strip is development-only.

## Automated checks

At the completed UI increment: `flutter analyze` reports no issues; 163 Flutter tests, 28 Functions tests and 14 Firebase emulator/rules tests pass. Exact final task checks are recorded in the execution ledger and commit history. Added financial tests were run failing before their implementations, including immediate denied-read handling and paginated freshness.

## Remaining launch work

This is the one-time financial slice, not completion of the MVP. Installments, dashboard projections/activity, recurrence and automatic deductions, calendars/reminders/FCM, private attachments, a durable offline outbox, account deletion and production release checks remain required milestones. Financial commands currently require connectivity and do not claim durable offline saves. The public hosted site still serves the earlier preview; the production database region and Blaze billing inputs remain pending. Real Google/App Check/FCM and native-device checks require configured release environments.
