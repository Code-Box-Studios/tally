# Tally

**Know what’s due.**

Tally is a personal obligation tracker for loans, debts, money owed, monthly dues, recurring bills, installments, manual payments, and automatic deductions.

The application uses Flutter, Material 3, Riverpod, go_router, and Firebase. It targets Android, iOS, web, tablets, and responsive desktop browsers.

## Project status

The first Flutter foundation is implemented: responsive navigation, a sample dashboard, light/dark/system themes, exact money and civil-date values, and Firebase emulator wiring with deny-all security rules. Authentication, real obligation entry, immutable payment persistence, recurrence and notifications follow in the [roadmap](docs/roadmap.md). Production configuration remains unavailable.

Run `flutter pub get`, then `flutter run -d chrome --target lib/main_preview.dart`. The default `lib/main.dart` also runs preview mode. See [development instructions](docs/development.md) for tool versions, emulator commands, native targets and checks. The [foundation verification record](docs/quality/foundation-verification.md) distinguishes verified results from pending platform checks.

Start with the [design overview and requirements coverage](docs/superpowers/specs/2026-10-03-tally-design.md).

| Document | Purpose |
| --- | --- |
| [Product requirements](docs/product/requirements.md) | MVP, functional and non-functional requirements, stories, acceptance criteria |
| [User experience](docs/product/experience.md) | Journeys, screens, responsive navigation, onboarding, accessibility |
| [Flutter architecture](docs/architecture/flutter.md) | Feature structure, domain entities, DTOs, repositories, Riverpod, routing |
| [Firebase architecture](docs/architecture/firebase.md) | Collections, schemas, relationships, queries, indexes, rules, authentication, storage |
| [Financial engine](docs/architecture/financial-engine.md) | Money, payments, installments, recurrence, deductions, summaries, notifications |
| [Testing and operations](docs/quality/testing-and-operations.md) | Offline synchronization, errors, validation, tests, emulators, environments, release gates |
| [Development roadmap](docs/roadmap.md) | Incremental deliverables, dependencies, verification and completion criteria |

The roadmap describes delivery order. Detailed implementation plans are written for one milestone at a time; the foundation plan is the first runnable Flutter increment.
