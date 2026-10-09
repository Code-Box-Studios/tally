# Tally Expo conversion

The user has explicitly requested conversion of the whole application to Expo. Earlier instructions to execute without questions and use main remain authoritative. This replaces the Flutter frontend decision; Supabase remains the backend. Existing financial data, backend invariants, design, and user changes must survive.

## Architecture

Use a managed Expo application in `apps/tally`, with Expo Router, React Native, strict TypeScript, TanStack Query, and Supabase's official JavaScript client. Keep the current backend contract: all canonical mutations go through authenticated Edge commands, never direct table writes. Authentication lives in a session provider; repositories, validation, and durable synchronization live outside screens. Native builds use Expo's generated projects rather than the existing Flutter native directories.

Use feature folders for auth, dashboard, obligations, payments, recurring, people, calendar, activity, attachments, reminders, settings, and sync. Shared components preserve the current forest green, warm neutral palette, DM Sans and Manrope fonts, rounded cards, desktop sidebar, mobile navigation, and prominent Add action. Light/dark/system themes and readable status labels remain.

## Functional parity

Implement email/password registration, login, logout, recovery, Google PKCE callbacks, onboarding, profile settings, dashboard with separate currencies, all obligation directions, finite and installment debts, recurring templates and periods, variable amounts, lifecycle pause/resume/end, full and partial payments, immutable corrections, failed/confirmed deductions, contacts and organizations, categories, payment sources, calendar filters, activity, attachments, reminder settings/inbox, device registrations, and protected account deletion.

Reuse the backend's 20 durable command names and exact payload contracts. Money uses bounded integer minor units; date-only values remain civil dates; cached and pending data are labeled. Payments remain append-only and overpayments are rejected. Recurrence stays server-side.

## Storage and ownership

Use owner/environment/schema-scoped durable storage: IndexedDB on web and SQLite on native. Auth secrets use secure native storage and Supabase's web session mechanism. Financial snapshots and the command outbox require explicit web trust. Pending commands retain one immutable command ID across retries; acknowledgement requires a verified result. Account switching clears in-memory data synchronously, cancels reads, and fences asynchronous work. Cache cannot replace an authorization failure. Sign-out and deletion manage the exact owner's notification registrations and cached data.

## Delivery and evidence

Root development commands launch Expo; Flutter sources remain preserved as migration reference, not the primary runtime. Provide deterministic web exports, EAS build configuration, environment examples, local start tools, CI, unit/repository/component tests, and actual local Supabase/browser journeys. Native push, OAuth credentials, signing, and a dedicated hosted Supabase project remain external setup dependencies; never fabricate a live deployment.

## Acceptance

The Expo app runs on web and exports successfully; iOS/Android use one managed source tree. All existing product sections have working forms and backend-backed reads/actions. Automated tests cover exact money, currency separation, date semantics, owner isolation, immutable retry payloads, offline restart/replay, and payment corrections. One final independent review checks ownership and feature parity.

## Execution decisions and verification

- Execute the approved full conversion inline on main without further approval questions, as explicitly requested. Cost if wrong: reversible frontend migration work.
- Expo lives in apps/tally so generated native projects cannot overwrite preserved Flutter native files or prior work. Root commands make Expo primary. Cost if wrong: one additional app directory.
- Reuse the current secure Supabase backend and its command contracts. The connected hosted project belongs to another app and remains untouched. Cost: hosted launch still needs dedicated project access.
- Native Expo push uses Expo's FCM/APNs relay, selected by strict Expo token format, while existing FCM devices keep their transport. The existing unique push-token constraint covers both. Cost if wrong: additional provider and EAS credentials; ticket receipts must be checked.
- Keep the primary Expo app in apps/tally and make CI/root npm commands validate it; preserved Flutter remains reference. Cost if wrong: legacy CI must be run separately when changing that reference.
- Local native alerts consume canonical server reminder plans, preserving timezone/quiet-hour rules instead of reproducing the schedule engine. Cost if wrong: fresh local alert plans require a successful sync.
- Use patched decode-uri-component 0.5.0 with a version-checked query-string import bridge, and UUID 11.1.1. Remaining braces/node-forge/sprintf-js build/test-tool advisories have no published fix. Cost if wrong: bridge needs review at Router upgrades; tooling remains unsuitable for untrusted inputs.
- React Native Directory's metadata service returned an unexpected response on repeated doctor runs. Verified all 20 project checks with that external lookup disabled for this run; full CI keeps the lookup. Cost if wrong: upstream package metadata must be rechecked when that service recovers.
- Signed native builds, physical-device notification delivery, and hosted OAuth/deployment remain externally blocked by dedicated project/signing/provider credentials; exported native bundles and local backend/browser tests are verified instead. Cost if wrong: platform provisioning and delivery issues remain undiscovered until device acceptance testing.
- The previous Supabase migration internals are outside the fresh frontend/notification review; retain that architecture with SQL/Deno/real HTTP regression evidence. Cost if wrong: an unreviewed backend defect could remain despite passing regression tests.
- Keep the pinned generated timezone artifact without exhaustive review; tests check civil dates/recurrence behavior. Cost if wrong: a rare timezone transition could require regenerating data.
- Offline creation of dependent records waits for parent acknowledgement; the UI lists saved actions and does not invent temporary financial references. Cost if wrong: creating a contact and its loan needs a reconnect between the two actions.

The final independent review identified one critical payment-retry issue and four important issues covering shared browser trust, completed command retention, notification registration cleanup, and catalog edit identity. Each was reproduced by a failing regression test and fixed. No minor findings were deferred. The final Expo suite passes 57 unit/repository/storage/web-semantic tests and 10 native component tests; TypeScript and lint pass. Web, iOS, and Android JavaScript exports pass. These exports do not constitute signed native binaries. Backend gates passed 87 Deno tests, 26 SQL tests, and the isolated real Auth/financial/recurring/device/private-file suites.

Full browser journeys pass at mobile 390x844 and desktop 1366x900, including real offline persistence, reload, one-time reconnect, payments/corrections, recurring payment, and protected deletion. Two real browser tabs verify that trust revocation updates the older tab and prevents it from repopulating cleared owner data. Browser radio choices expose checked state through cross-platform ARIA props.
