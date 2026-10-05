# Recurring obligations verification

M4 adds recurring templates, independent billing periods, variable bill amounts,
manual period payments, scheduled deductions, confirmation, failure, and immutable
history. It extends the existing private Flutter/Firebase application on `main`.
Public Hosting still serves the earlier preview; these checks use `demo-tally`.

## Financial and presentation contracts

- A recurring template has a fee or optional estimate and a schedule, never a
  fictitious lifetime balance. Each generated period owns its bill and balance.
- Anchors recover after short months; civil due dates stay separate from UTC
  audit timestamps. Scheduling uses the checked-in IANA 2026c catalog.
- Variable estimates are informational. An unknown bill is not included as a
  known payable amount; entering its actual amount affects only that period.
- Automatic entry defaults to confirmation. Explicit assumptions show the
  scheduled-payment explanation and consume a deterministic event only once.
- Partial manual payments reduce the scheduled deduction to the unpaid remainder.
  Confirming an assumption adds evidence to its original amount/date/source.
- A failure appends a reversal of the linked automatic payment and preserves
  unrelated manual payments. Manual retry uses the ordinary payment command.
- Corrections preserve the original payment and append a reversal plus an optional
  replacement in the same billing period. No financial history is overwritten.
- Pausing or ending stops generation and retains existing periods and history.
- Revisioned forms freeze uncertain command payloads and retry the same command
  identity; a definitive conflict requires reopening. Owner scopes discard stale
  completions and repository continuation cursors are query-bound.
- Dart widgets use providers/repositories/actions, never direct Firebase calls.

## Automated evidence

The Task 5 Flutter suite passes 279 tests; the TypeScript Functions suite passes
77. Flutter analysis reports no issues. The recurring subset passes 59 tests;
five owner-scope/provider cases also pass in Chrome.
Regression evidence includes period partial/full payments and corrections,
original-attempt confirmation after partial payment, failure/retry, unknown
overdue amounts, captured stale revisions, uncertain retries after live updates,
PHP/USD separation, profile-timezone date limits, and invalid pre-period dates.
Forms fit 320/375/800/1440 widths at 200% text with keyboard insets; billing period
actions remain reachable at 320 pixels and 200% text.

The emulator runner executes two fresh environments: normal prompt processing
for the real Firestore-trigger pipeline and manual scheduling for deterministic
financial, lease, race, and ownership/rules checks. See
`npm run test:emulators` and `tool/test_emulators.mjs`. Manual mode is restricted
to the local demo emulator; production processing remains automatic.

## Actual browser workflow

Chrome exercised the localhost Flutter debug application with synthetic accounts
and Authentication/Firestore/Functions emulators. No real financial data or
bank connection was used. Login credentials stayed ephemeral in the browser.
Trusted job dispatch was invoked explicitly in this controlled manual environment;
the separate prompt suite verifies normal event-driven execution.

1. Created Internet at PHP 1,699; paid PHP 200 in October. The period showed
   PHP 1,499 remaining, and November/December remained independent at PHP 1,699.
2. Confirmed Netflix at PHP 549, then reported failure. The linked payment was
   reversed and PHP 549 remained outstanding.
3. Created an explicitly automatic PHP 549 bill before its real scheduled time.
   Paid PHP 200 manually, waited for that time, then dispatched the trusted job.
   It assumed only PHP 349. Confirmation added evidence; failure reversed that
   PHP 349 while preserving PHP 200; manual retry settled the PHP 349 remainder.
4. Created variable Electricity with a PHP 3,500 estimate and entered October's
   actual PHP 3,810 bill. Future periods retained unknown amounts and the estimate.
5. Paused Internet; the server reported three retained periods. Corrected the
   PHP 200 payment to PHP 150 through appended reversal/replacement records.
6. Home showed PHP 6,607 scheduled, PHP 699 paid, PHP 5,908 remaining, and zero
   borrowing/lending balances. Reload restored the authenticated account and
   those values. Appearance preferences persisted across reload.
7. Signed out and created a second account. Its Home showed no previous records
   or balances. Opening the first account's bill URL displayed a private read
   failure. No first-account details were exposed.

Actual DTD hot reload succeeded and runtime-error inspection returned no errors.
The initial browser adapter's synthetic keyboard modifiers raised Flutter engine
assertions; focus-aware semantic input events resolved the automation issue
without changing application financial or authentication code.

The active private-read failure was handled, but sign-out reproduced nine
unhandled cancellation rejections. The permanent actual-UI regression
`tool/test_browser_owner_switch.mjs` observed that failure, then passed with zero
after financial repository streams emitted their terminal error instead of
throwing it through an `async*` cancellation future. SDK gateways and ownership
guards are unchanged. Native and Chrome provider tests also verify typed read
errors and owner disposal. The emulator web release build compiled and correctly
refused to boot outside debug mode; no environment safeguard was relaxed for QA.

Run the actual browser regression with the demo emulators and localhost Flutter
debug app running, and `CHROME_DEVTOOLS_AXI_BROWSER_URL` pointing to its Chrome
debugging endpoint. It creates only a synthetic account; credentials remain in
ephemeral browser memory and are never printed or written to a fixture.

## Design evidence

- [Recurring desktop detail](../assets/recurring-desktop-light.png) shows the
  intermediate PHP 200 payment before its correction.
- [Home desktop light](../assets/recurring-home-desktop-light.png) shows the final
  balances and original Lavish sidebar, typography, colors, and cards.
- [Home desktop dark](../assets/recurring-home-desktop-dark.png) shows saved dark
  appearance; its honest updating label reflects a pending profile projection.
- [Home mobile dark](../assets/recurring-home-mobile-dark.png) shows the 375-pixel
  adaptive card layout and mobile navigation. The debug emulator banner overlays
  part of the bottom navigation; it is development-only.
- [Home mobile light](../assets/recurring-home-mobile-light.png) shows the matching
  light mobile layout after a saved appearance change.

## Remaining launch work

M5 owns calendar/search/filter queries, reminder preference migration, notification
jobs and delivery. M6 owns private attachments and a durable offline command
outbox. M7 owns native release checks, full accessibility/platform validation,
operations, and the existing cold-detail deep-link diagnosis. M8 owns real
backend provisioning and production web deployment after billing and database
region inputs. No production-readiness or live-launch claim follows from these
emulator checks alone.
