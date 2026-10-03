# Tally product and technical design

Date: 2026-10-03. Status: proposed design awaiting review. This document and its linked specifications form one blueprint; none of the proposed application code or infrastructure has been implemented.

Tally helps an individual answer what they owe, what others owe them, what is due next, what has been paid, what will be deducted automatically, and what remains. The intended result is a secure, responsive Flutter application backed by Firebase, with trustworthy payment history and recurring processing that works without an open client.

## Product brief

The product name is **Tally**, with the tagline **Know what’s due.** The supplied brief establishes personal use, email/password and Google authentication, financial obligations rather than full accounting, multiple currencies, payment history as the source of truth, and incremental delivery. Direct banking integrations, budgeting, shared settlement, and AI features belong to later releases.

Proposed defaults are PHP, Asia/Manila, light/dark/system theme, and reminder offsets of three days before and on the due date. Onboarding lets the user change these defaults or skip optional steps. The initial interface is English; copy and formatting remain localization-ready. No location is inferred from currency.

## Alternatives and selected architecture

| Approach | Benefits | Trade-offs | Decision |
| --- | --- | --- | --- |
| User-scoped data and server-authoritative financial commands | Clear ownership boundary; consistent payment, instance, and activity writes; controlled corrections | Offline changes need a durable command queue; functions add latency | Selected |
| Top-level owner-tagged collections and server commands | Convenient cross-user administrative queries | Every collection query needs owner conditions; broader rules surface | Keep only privileged jobs top-level |
| User-scoped data with client-managed financial writes | Simple SDK-driven offline edits | Complex aggregate validation; concurrency and reversals spread between client/rules/triggers | Reject for canonical payment writes |

Use `users/{uid}/{collection}/{id}` for private financial data. Keep `systemJobs` and deletion jobs inaccessible to clients. User paths are the primary ownership boundary; immutable `userId` fields give exports, background jobs, and validation a consistent secondary check. Future shared obligations require an explicit membership model and migration rather than weakening these rules.

## Decisions that constrain implementation

1. Flutter feature folders contain data, domain, and presentation. Domain code has no Firebase or widget dependencies. Riverpod composes repositories and use cases; widgets never call Firebase directly.
2. Money uses integer minor units with an explicit ISO currency code. No currency conversion is in the MVP. All summaries and contact positions are per currency.
3. Independent immutable payment documents, including traceable reversals, are canonical. Server transactions update narrow obligation/instance caches and activity atomically. Larger dashboard/contact projections are versioned, repairable, and visibly eventually consistent.
4. Every obligation has concrete due instances. A one-time debt has one instance; an installment debt has a finite schedule; a recurring template generates independent periods. Recurring templates do not count as an infinite balance or duplicate their instances in totals.
5. Automatic deductions are bookkeeping assumptions or user confirmations. There is no external payment execution. Expected and failed deductions do not count as paid. Assumed payments reduce tracked remaining balances and are visibly distinguished from confirmed payments.
6. Civil due dates and recurrence anchors are date-only values. Timezone snapshots determine processing instants. Audit timestamps are server-recorded UTC instants.
7. A durable local outbox queues offline commands. Pending payments appear separately and do not silently change canonical financial totals. Retrying an action reuses its command ID.
8. Reminders have an in-app record independent of push delivery. FCM and local notifications are hints; their delivery never controls financial state.
9. Android/iOS and web have capability adapters. Crashlytics is used on supported native targets; web errors use a separate redacted reporting adapter. Responsive desktop browsers are web targets, not native desktop apps.
10. Security Rules deny direct client financial writes. Callable functions verify authentication, App Check, ownership, payload shape, and referenced-document ownership even though the Admin SDK is privileged.

## Specification package

Read [requirements](../../product/requirements.md) and [experience](../../product/experience.md) to assess behavior; read [Flutter](../../architecture/flutter.md), [Firebase](../../architecture/firebase.md), and [financial engine](../../architecture/financial-engine.md) to assess implementation boundaries. [Testing and operations](../../quality/testing-and-operations.md) defines correctness and release gates; the [roadmap](../../roadmap.md) decomposes implementation.

## Coverage of the requested pre-implementation deliverables

| # | Deliverable | Location |
| --- | --- | --- |
| 1 | Product Requirements Document | Requirements: product, scope, acceptance criteria |
| 2 | MVP scope | Requirements: release scope |
| 3 | Functional requirements | Requirements: functional requirements |
| 4 | Non-functional requirements | Requirements: quality requirements |
| 5 | User stories | Requirements: user stories |
| 6 | Main user journeys | Experience: main journeys |
| 7 | Screen map | Experience: screen map |
| 8 | Flutter architecture | Flutter: boundaries |
| 9 | Folder structure | Flutter: proposed file structure |
| 10 | Firebase architecture | Firebase: services and ownership |
| 11 | Firestore collection design | Firebase: collection layout |
| 12 | Firestore document schemas | Firebase: document contracts |
| 13 | Relationship strategy | Firebase: relationships and projections |
| 14 | Firestore index requirements | Firebase: query and index catalog |
| 15 | Firebase Security Rules strategy | Firebase: Firestore rule policy |
| 16 | Storage Security Rules | Firebase: storage rule policy |
| 17 | Cloud Functions architecture | Financial engine: function responsibilities |
| 18 | Authentication flow | Firebase: authentication and account lifecycle |
| 19 | Dart domain entities | Flutter: domain contracts |
| 20 | DTO/data models | Flutter: DTO mapping |
| 21 | Repository interfaces | Flutter: repository contracts |
| 22 | Repository implementations | Flutter: concrete repository design |
| 23 | Riverpod provider architecture | Flutter: provider graph |
| 24 | go_router configuration | Flutter: router configuration |
| 25 | Notification architecture | Financial engine: notifications |
| 26 | Recurring payment engine | Financial engine: recurrence |
| 27 | Automatic deduction logic | Financial engine: deduction state machine |
| 28 | Payment calculation rules | Financial engine: financial invariants |
| 29 | Offline strategy | Testing and operations: offline commands |
| 30 | Error handling | Testing and operations: error contract |
| 31 | Validation rules | Testing and operations: validation matrix |
| 32 | Edge cases | Financial engine and testing acceptance matrix |
| 33 | Testing strategy | Testing and operations: test layers |
| 34 | Firebase Emulator strategy | Testing and operations: emulators |
| 35 | Development roadmap | Roadmap: milestone delivery |

## Review decisions and prerequisites

The proposed MVP rejects overpayments after a clear warning, stores interest information without calculating interest accrual, supports custom recurrence as every N days/weeks/months/years, and uses a five-item mobile bar with Activity and Settings under More. All six requested primary destinations are directly visible on tablet/desktop navigation. These are explicit product choices for review, not claims that the original brief prescribed these details.

The initial repository has a README and no application. Flutter, Dart, and Firebase CLI are not available on PATH in this workspace; Node and Java are available. Android builds need Android tooling; iOS builds and signing need a macOS runner with Xcode. Toolchain setup belongs to the first implementation milestone.

Before provisioning, choose real dev/staging/prod Firebase project IDs, app identifiers, and a data region. The proposed region for a Manila-first audience is Singapore where supported, subject to service availability and the intended users' data-location requirements. Web OAuth domains, App Check providers, APNs credentials, and notification permissions are environment setup, not secrets to embed in source.

Apple's current login-services guideline affects an iOS application offering Google Sign-In. This design treats evaluation of an equivalent privacy-preserving login, usually Sign in with Apple, as an iOS store release dependency; Apple login can remain outside the early development milestones. This is a release-planning inference from [Apple guideline 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services).

Review this blueprint before writing the first detailed milestone implementation plan. Production readiness requires the implemented release gates, not approval of documentation alone.
