# Borrower access, CSV import, payoff planning, and receipt scanning

The user selected features 4, 5, 6, and 8 for implementation on 2026-10-14.

## Product behavior

1. **Private borrower view.** An owner shares one receivable loan with a specific email. The recipient signs in with that verified email and accepts the invitation. The view shows that loan's balance, schedule, and payment history. Private owner notes, unrelated records, and payment sources are excluded. The owner can revoke access. Borrowers submit an amount, payment date, reference, message, and optional private receipt. Submission does not change the balance. Owner approval records one payment and marks the submission approved in the same transaction; rejection leaves balances unchanged.
2. **CSV import.** Settings offers upload or paste, column mapping, and a preview. Invalid or unsupported financial information is reported. Possible duplicates start unchecked. Only selected valid rows are imported. Canonical command IDs make interrupted/reordered retries safe. Existing financial commands remain the source of validation and persistence.
3. **Payoff simulator.** A loan detail action compares the saved remaining schedule with extra payments. Currency arithmetic uses integer minor units, the final payment is capped, and dates handle month ends. Current loans have interest fixed at origination: early payoff changes timing, not the recorded interest. Missing schedules or unsupported loan types receive an explanation rather than fabricated projections. The simulator never writes to the ledger.
4. **Receipt scanning.** A file picker recognizes a receipt or transfer screenshot on the device, then presents editable amount, date, and reference candidates. The user explicitly applies the draft and separately saves the payment. Ambiguous dates, amounts, and currency mismatches require review. Browser OCR supports the iPhone web app. Native OCR uses a native module and requires a new native build. No paid OCR provider or third-party receipt upload is introduced.

## Architecture and constraints

- Active application: Expo in `apps/tally`; Supabase API and declarative PostgreSQL schema in `supabase`.
- Work on `main`, preserve unrelated Flutter migration edits, and stage only this feature's files.
- Borrower metadata uses owner-qualified tables and the existing optimistic owner lock/command receipt mechanism. Approval and payment mutations commit together. Borrower access uses dedicated API operations; it does not broaden owner RLS policies.
- Invitations are accepted only by a verified matching identity. A copied link alone grants no access. The app provides a shareable invitation link; it does not send email automatically.
- Private proof attachments reuse existing upload leases, checksum validation, cleanup jobs, and owner deletion cleanup. Borrower operations additionally check the active share and submission ownership.
- Borrower views are online only and are not persisted in the offline owner record cache.
- Imports never infer historical balances or discard unsupported interest/payment history silently.
- OCR results and images remain transient until the user deliberately records or attaches them. Large OCR assets are loaded on demand rather than precached with the app shell.
- Physical iPhone and native-device behavior must not be claimed as verified from a web or JavaScript build.

## Review focus

Cross-account reads, invitation acceptance, revocation races, duplicate approval, payment allocation, import idempotency, unsupported columns, exact cents, incomplete payoff schedules, OCR ambiguity, and stale asynchronous results after account changes.
