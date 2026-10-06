# Reminder verification

M5b adds a private reminder inbox, preference controls, finite-obligation reminder
overrides and notification adapters. The inbox works independently of permission
to show external alerts. Reminder commands never create a payment or change a
financial balance.

## Local evidence

The October 6, 2026 verification uses only `demo-tally` and localhost emulators.
Automated Dart tests cover owner disposal, uncertain command retries, preference
conflicts, strict DTOs, paginated inbox/upcoming queries, exact-period links,
currency separation, unknown bill amounts and explicit permission requests.
Widget checks exercise widths 320, 375, 800 and 1440 with light/dark themes and
200% text. SDK doubles cover denied/unsupported permission, missing VAPID, token
refresh, generic local payloads, the 50-alert limit and bounded unregister.
A never-completing SDK subscription reproduced a real browser logout stall;
cleanup now fences the owner before bounded cancellation and still reaches auth.

The actual browser verified saved preferences, PHP and USD displayed separately,
an unknown electricity bill shown as “Amount needed”, read receipts and links
to the exact billing period. Actual sign-out completed without unhandled
rejections. Desktop and mobile screenshots show the original palette, including
system dark mode. They contain synthetic records and the deliberate emulator
warning, not production user data.

| Capture | Viewport |
| --- | --- |
| [Desktop, light](../assets/reminders-desktop-light.png) | 1440 × 1100 |
| [Desktop, dark](../assets/reminders-desktop-dark.png) | 1440 × 1100 |
| [Mobile, light](../assets/reminders-mobile-light.png) | 375 × 812 |
| [Mobile, dark](../assets/reminders-mobile-dark.png) | 375 × 812 |

The browser also signed in a second synthetic owner, verified the actual empty
inbox, rejected an original owner's real reminder target and signed out with
zero unhandled rejections. The fresh whole gate passed static analysis, 487
Flutter tests, 125 Functions unit tests, seven worker/configuration tests, one
prompt-worker emulator scenario and 111 deterministic emulator scenarios.
Dart MCP hot reload succeeded and reported no runtime errors. The named
completion gate repeats the required suite before the final M5b review.
The plan ledger retains RED/GREEN evidence and distinguishes actual defects
from automation and fixture mistakes.

## Release gates

Emulator transport is injected and cannot send real FCM. A test of permission
or delivery with doubles does not establish delivery on a physical device.
Before release, staging must verify deployed indexes and rules, real browser
VAPID, Android FCM, iOS APNs entitlements/signing and local alerts on supported
devices. Local alerts are generic and scheduled inexactly; background restrictions
can delay them. FCM acceptance is not proof that a physical device displayed an
alert. Ambiguous retries can produce a duplicate generic banner while inbox and
payment history remain idempotent.

Web background clicks use the application's hash router and validate only the
three target IDs. The broader cold-start private-intent/auth redirect retention
check remains an M7 release gate. No real notification credentials are embedded
in the worker; its configuration contains checked public Firebase app options.

The emulator web build is intentionally non-deployable. The public Hosting
preview has not been updated by this verification.
