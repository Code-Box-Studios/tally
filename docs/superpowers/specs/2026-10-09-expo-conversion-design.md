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
