# Tally — Know what’s due.

Tally now uses **Expo / React Native / TypeScript** with **Supabase**. The primary app is [`apps/tally`](apps/tally). Start local testing with `npm run install:app`, `python3 tool/start_supabase_local.py`, `supabase functions serve`, and `npm run start:local`. See [Expo operations](docs/operations/expo.md) for web deployment, EAS builds, native notifications, offline behavior, and validation.

The Flutter/Firebase sections below describe the preserved migration reference.

# Tally

Tally — Know what’s due. The default app now uses Flutter + Supabase, including authenticated financial commands, private files, recurring workers, reminders, and owner-isolated offline storage.

For the working local app and hosted deployment, use [Supabase operations](docs/operations/supabase.md). Run `python3 tool/start_supabase_local.py`, serve the Edge Functions, then `python3 tool/run_supabase_local.py` and open http://localhost:7382. The Firebase instructions below describe retained legacy entry points and existing test data.

**Know what’s due.**

Tally is a personal obligation tracker for loans, debts, money owed, monthly dues, recurring bills, installments, manual payments, and automatic deductions.

The application uses Flutter, Material 3, Riverpod, go_router, and Supabase. It targets Android, iOS, web, tablets, and responsive desktop browsers.

## Project status

The Supabase runtime supports email/password authentication, onboarding, obligations, installments, recurring periods, partial payments and corrections, automatic deduction tracking, currency-separated dashboard/contact summaries, calendar/activity, private attachments, reminders, and protected account deletion. Financial writes use trusted Edge services and atomic PostgreSQL transactions. Native and trusted-browser storage support owner-isolated offline commands and cached reads.

The local app runs at http://localhost:7382 using the instructions above. `lib/main.dart` and `lib/main_prod.dart` use the production Supabase runtime; `lib/main_dev.dart` uses the isolated local runtime. `lib/main_preview.dart` remains an explicit sample-data design preview. Hosted release, Google OAuth, email delivery, FCM/APNs, and native distribution require the corresponding external project configuration and credentials; see the operations guide for exact setup and tested limits.

Start with the [design overview and requirements coverage](docs/superpowers/specs/2026-10-03-tally-design.md).

| Document | Purpose |
| --- | --- |
| [Product requirements](docs/product/requirements.md) | MVP, functional and non-functional requirements, stories, acceptance criteria |
| [User experience](docs/product/experience.md) | Journeys, screens, responsive navigation, onboarding, accessibility |
| [Flutter architecture](docs/architecture/flutter.md) | Feature structure, domain entities, DTOs, repositories, Riverpod, routing |
| [Supabase implementation](docs/operations/supabase.md) | Current SQL, RLS, commands, storage, workers, environments, and deployment |
| [Firebase architecture](docs/architecture/firebase.md) | Collections, schemas, relationships, queries, indexes, rules, authentication, storage |
| [Financial engine](docs/architecture/financial-engine.md) | Money, payments, installments, recurrence, deductions, summaries, notifications |
| [Testing and operations](docs/quality/testing-and-operations.md) | Offline synchronization, errors, validation, tests, emulators, environments, release gates |
| [Development roadmap](docs/roadmap.md) | Incremental deliverables, dependencies, verification and completion criteria |

The original design documents and roadmap describe the earlier Firebase delivery order; the Supabase migration spec and operations guide describe the current backend. Detailed implementation plans are written for one milestone at a time; the foundation plan is the first runnable Flutter increment.
