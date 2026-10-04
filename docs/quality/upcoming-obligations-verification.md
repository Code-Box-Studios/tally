# Upcoming obligations verification

M3 adds finite installment agreements, immutable allocations/corrections, owner-scoped due/activity readers and revisioned dashboard/contact projections. This is implementation evidence for the development emulator, not a production deployment claim.

## Automated evidence

The final implementation passes clean Flutter analysis and **211 Flutter tests**, **45 Functions unit tests**, and **32 actual Firebase Emulator Suite tests**. Development used `demo-tally` Authentication, Firestore, Functions and Storage emulators; no production financial records were used.

Financial coverage includes 120-period atomic creation, exact remainder splitting, principal conservation, 24-period allocation bounds, chosen-period payments, concurrent overpayment rejection, exact reversal/restoration, invalid replacement rollback, cancelled/history locks and optional correction revision fences. Legacy correction normalization remains unchanged for permanent receipt replay. Lost-response widget tests change live balances after a simulated committed save, then verify the original payment/correction payload and request identity are retried unchanged.

Projection tests fold the complete immutable ledger, keep seven currencies separate, distinguish payment-date totals from due-period totals, preserve unknown variable amounts, and fence source/profile revisions, ownership, month/day/zone changes and deadlines. Server pagination, lease expiry/duplicate workers, repair without history rewriting, missing-summary authorization and terminal repository errors are covered. UI tests include owner scope, currency switching, activity continuations, contact freshness, original Home composition, full schedule previews, 375px side-by-side borrowing/lending metrics and 320px/landscape 200% text with keyboard insets.

## Actual browser workflow

A new emulator account created a PHP200 agreement with PHP100 due October4 and PHP100 due November4. A PHP150 payment explicitly allocated PHP100/PHP50, leaving PHP50. Home displayed October scheduled PHP100, recorded paid PHP150 and October remaining PHP0 independently.

A correction restored those exact allocations and recorded a PHP120 replacement allocated PHP100/PHP20. Remaining became PHP80; reload retained PHP80 and paid-this-month PHP120. Original payment, reversal, replacement and server activity remain traceable. The correction preview explained that replacement periods can differ and bound its captured obligation revision.

Signing out and creating a second account removed first-owner dashboard/activity records. Opening the first account's obligation ID from the second account failed authorization without disclosing its title or amounts. Signing back into the first account restored its PHP80 overview. Browser console and connected Dart runtime checks were clean after reload and hot reload.

Scheduled emulators do not automatically invoke cron. The existing trusted projection dispatcher was run against the local demo emulator to verify publication; client widgets never wrote summaries or calculated server financial totals. M4 will add prompt lease-protected processing with scheduled recovery, rather than accepting five-minute feedback after a payment as final launch behavior.

## Visual evidence

The original `.lavish/tally-design.html` composition was re-rendered and inspected. Authenticated Home restores its greeting, three colored metrics, borrowing/lending net line, 1.65:1 desktop columns, attention/expected/activity panels and month/automatic/add panels using owned data. Fonts are bundled; private views do not load preview fixture records.

- [Desktop light](../assets/upcoming-desktop-light.png): actual PHP150 payment before correction.
- [Desktop dark](../assets/upcoming-desktop-dark.png): actual corrected PHP80 balance.
- [375px capture before the final two-card refinement](../assets/upcoming-mobile-before-refinement.png): documents the earlier stacked compact view. The final two-card placement is checked by widget geometry and actual browser semantics; do not present this earlier capture as the final mobile design.

The headless Chrome surface capture intermittently timed out after viewport changes. Native window captures succeeded for the desktop evidence. This capture limitation does not replace native device release validation in M7.

## Remaining release work

M4 supplies recurrence and automatic/confirmation/failure processing; M5 supplies the financial calendar and notification/reminder delivery; M6 supplies private attachments and durable offline commands; M7 completes cross-platform, accessibility and operational release validation; M8 deploys verified backend and web artifacts. The currently hosted URL still serves the earlier preview. Billing activation and the immutable live Firestore region remain pending user inputs; no paid backend has been silently provisioned.
