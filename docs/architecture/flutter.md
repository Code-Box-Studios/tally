# Tally Flutter architecture

The application uses a feature-first structure with domain logic independent of Flutter/Firebase, data adapters responsible for persistence, and presentation controllers responsible for interaction state. These are interface and file-design specifications, not generated application code.

## Boundaries and dependency direction

Presentation → domain use cases/repository interfaces → injected data implementations. Data implementations depend on Firebase SDKs, DTOs, and core adapters. Domain imports only Dart and approved value-model libraries. Shared widgets depend on presentation-friendly values, not Firestore documents. One feature never reaches into another feature's data folder.

Use small focused use cases for financial operations such as RecordPayment, CorrectPayment, PreviewAllocation, and CalculatePosition. Avoid a redundant use-case wrapper for every simple list read. Pure algorithms accept an injected clock/calendar abstraction; tests never depend on the wall clock.

Flutter's official architecture guidance separates views, state/logic, repositories, and services; Tally adopts those separation goals with the requested feature-first organization. [Flutter architecture guidance](https://docs.flutter.dev/app-architecture).

## Proposed file structure

```text
lib/
  main_dev.dart
  main_staging.dart
  main_prod.dart
  app/
    bootstrap.dart
    tally_app.dart
    app_router.dart
    session_scope.dart
    responsive_shell.dart
  core/
    config/{environment.dart,firebase_configuration.dart,capabilities.dart}
    errors/{app_failure.dart,failure_mapper.dart}
    money/{money.dart,currency_code.dart,currency_metadata.dart}
    dates/{local_date.dart,year_month.dart,clock.dart,calendar_service.dart}
    identifiers/{entity_ids.dart,command_id.dart}
    firebase/{firebase_clients.dart,emulator_connector.dart}
    sync/{command.dart,command_submission.dart,outbox_store.dart,sync_engine.dart}
    telemetry/{error_reporter.dart,analytics_service.dart}
    theme/{tally_theme.dart,theme_controller.dart}
  shared/
    widgets/{money_text.dart,status_badge.dart,empty_state.dart,error_panel.dart}
    widgets/{contact_picker.dart,category_picker.dart,source_picker.dart}
    layout/{breakpoints.dart,constrained_form.dart,responsive_content.dart}
  features/
    auth/
      domain/{session.dart,auth_repository.dart,session_repository.dart}
      data/{firebase_auth_repository.dart,firebase_session_repository.dart}
      presentation/{session_controller.dart,auth_controller.dart,auth_screens.dart}
    onboarding/
      domain/{onboarding_preferences.dart}
      presentation/{onboarding_controller.dart,onboarding_screen.dart}
    dashboard/
      domain/{dashboard_summary.dart,dashboard_repository.dart}
      data/{firestore_dashboard_repository.dart,dashboard_dto.dart}
      presentation/{dashboard_providers.dart,dashboard_screen.dart,widgets/}
    obligations/
      domain/{obligation.dart,obligation_instance.dart,obligation_enums.dart}
      domain/{obligations_repository.dart,obligation_commands.dart}
      data/{firestore_obligations_repository.dart,obligation_dto.dart,instance_dto.dart}
      presentation/{obligations_controller.dart,obligation_editor_controller.dart}
      presentation/{obligations_screen.dart,obligation_detail_screen.dart,widgets/}
    people/
      domain/{contact.dart,contact_position.dart,contacts_repository.dart}
      data/{firestore_contacts_repository.dart,contact_dto.dart}
      presentation/{people_controller.dart,people_screen.dart,contact_detail_screen.dart}
    payments/
      domain/{payment.dart,payment_allocation.dart,payments_repository.dart}
      domain/{payment_commands.dart,payment_calculator.dart,allocation_policy.dart}
      data/{firestore_payments_repository.dart,payment_dto.dart}
      presentation/{payment_editor_controller.dart,payment_history_controller.dart}
      presentation/{payment_editor_screen.dart,payment_detail_screen.dart,widgets/}
    recurring/
      domain/{recurrence_rule.dart,recurrence_calculator.dart,deduction_state.dart}
      presentation/{recurrence_editor_controller.dart,recurrence_fields.dart,period_list.dart}
    calendar/
      domain/{calendar_event.dart,calendar_repository.dart}
      data/{firestore_calendar_repository.dart}
      presentation/{calendar_controller.dart,calendar_screen.dart,widgets/}
    activity/
      domain/{activity_event.dart,activity_repository.dart}
      data/{firestore_activity_repository.dart,activity_dto.dart}
      presentation/{activity_controller.dart,activity_screen.dart}
    notifications/
      domain/{reminder.dart,notifications_repository.dart,notification_gateway.dart}
      data/{firestore_notifications_repository.dart,fcm_gateway.dart,local_gateway.dart}
      presentation/{notifications_controller.dart,notifications_screen.dart}
    attachments/
      domain/{attachment.dart,attachments_repository.dart}
      data/{firebase_attachments_repository.dart,attachment_dto.dart}
      presentation/{attachment_controller.dart,attachment_picker.dart}
    search/
      domain/{search_query.dart,search_result.dart,search_repository.dart,query_plan.dart}
      data/{firestore_search_repository.dart}
      presentation/{search_controller.dart,filter_sheet.dart}
    settings/
      domain/{user_profile.dart,payment_source.dart,category.dart,settings_repository.dart}
      data/{firestore_settings_repository.dart,profile_dto.dart,source_dto.dart,category_dto.dart}
      presentation/{settings_controller.dart,settings_screen.dart,source_editor.dart}
test/{core/,features/,support/}
integration_test/{auth_test.dart,payment_flow_test.dart,offline_sync_test.dart}
functions/
  src/
    index.ts
    core/{authorization.ts,validation.ts,money.ts,dates.ts,ids.ts,errors.ts}
    commands/{execute_command.ts,command_schemas.ts,receipt_store.ts}
    payments/{payment_service.ts,allocation.ts,corrections.ts}
    obligations/{obligation_service.ts,instance_service.ts}
    recurrence/{recurrence.ts,generation_service.ts,auto_service.ts}
    jobs/{dispatcher.ts,job_store.ts,job_handlers.ts}
    notifications/{reminder_service.ts,fcm_sender.ts}
    projections/{summary_service.ts,aggregate_repair.ts}
    attachments/{reservation_service.ts,finalize.ts,cleanup.ts}
    accounts/{bootstrap.ts,deletion.ts}
  test/{unit/,emulator/}
firebase/{rules-tests/,fixtures/}
firestore.rules
storage.rules
firestore.indexes.json
firebase.json
```

Brace expressions above abbreviate separate files. Generate directories only when their milestone needs them; do not fill the tree with empty abstractions. Recurring domain functions are reused by obligation editor previews; writes remain in ObligationsRepository and PaymentsRepository rather than a second conflicting recurrence repository.

## Domain contracts

Use Freezed for immutable aggregate models/command unions and typed failure/submission states where generated equality/copy support is valuable. Small validated values may be handwritten. Use json_serializable in DTOs/command payloads, not to force Firestore into domain models. Generated outputs are checked in or generated reproducibly in CI according to one repository policy selected at bootstrap.

| Type | Required properties / behavior |
| --- | --- |
| `Money` | int minorUnits, CurrencyCode currency; checked same-currency operations; parse decimal text and format without floats |
| `CurrencyCode` | Reviewed supported ISO values and exponent lookup; unsupported code read-only |
| `LocalDate`, `YearMonth` | Gregorian validity, comparison, civil arithmetic; no implicit timezone/DateTime conversion |
| Entity ID values | OwnerUid, ObligationId, InstanceId, PaymentId, ContactId, SourceId, CategoryId, AttachmentId, CommandId; nonempty safe opaque values |
| `Session` | Sealed startup/signedOut/profileLoading/onboarding/ready/failure variants with trusted owner identity |
| `UserProfile` | Currency, IANA timezone, locale, theme, onboarding state, account state, revision |
| `Contact` | Contact kind, original/search display names, optional organization/contact details, notes, archive/revision |
| `Obligation` | Strong type/direction/section, finite original Money or recurring config, contact/category, lifecycle, dates, mode/source, notes, interest metadata, derived finite balance/revision |
| `ObligationInstance` | Stable occurrence ID/key, due LocalDate, zone, nullable Money, amount state, financial/deduction states, source/mode/terms snapshot, applied/remaining/revision |
| `RecurrenceRule` | Frequency/unit/interval, original anchor, preferred day/month-end, start/end, zone/time, paused ranges, version |
| `Payment` | Immutable entry/reversal IDs, parent and allocation links, Money, civil payment date/zone, optional paid instant, source/method/provenance, correction chain, receipt link, audit instants |
| `PaymentAllocation` | InstanceId and positive Money; same currency/parent validated by the service |
| `PaymentSource`, `Category` | Safe organizational labels, active/revision; source lastFour optional |
| `Attachment` | Owner-private reservation/path/state, target ID/type, size/MIME, generation, timestamps |
| `Reminder`, `ActivityEvent` | Strong event/message kinds, referenced IDs, civil/instant context, delivery/read or audit state |
| `DashboardSummary`, `ContactPosition` | Currency-keyed values, unknown counts, assumed/confirmed subtotals, source revision and as-of timestamp |
| `QueryPage<T>`, `QueryCursor` | Immutable items, opaque next cursor, exhaustion and candidate-count metadata |
| `CommandSubmission` | queued(CommandId), accepted(CommandReceipt), rejected(AppFailure); no fictitious payment before acceptance |

Enums persist stable strings independently of Dart enum index/name. Financial status, lifecycle, deduction status, and sync status are different types. Do not stretch one enum to represent all state. Enum display maps produce human copy. IDs are not interchangeable just because Firestore stores them as strings.

## DTO mapping

DTOs contain database-compatible integers, strings, Timestamp fields, and bounded lists/maps. Each DTO exposes `fromFirestore(DocumentSnapshot)`, `toDomain()` and, only for trusted command payload builders, `toCommandJson()`. Client DTOs never expose `toFirestore()` financial writes as an application path.

Money mapping pairs a minor-unit integer with currency metadata. `LocalDateConverter` validates fixed-width values, `TimestampConverter` handles committed instants, `StableEnumConverter` keeps unknown strings readable without mutating them, and snapshot mappers preserve supported historical fields. Current models require schemaVersion; legacy/unknown schema produces `unsupportedSchema` with recovery rather than defaulting an amount to zero. Fixtures cover null variable amounts and malformed records.

`ObligationDto`, `InstanceDto`, `PaymentDto`, `ContactDto`, `ProfileDto`, `SourceDto`, `CategoryDto`, `AttachmentDto`, `ActivityDto`, and `DashboardDto` mirror their contracts in the Firebase document. Receipt DTO parses accepted revisions and IDs. Server timestamps awaiting commit are not treated as an actual epoch date; canonical read-only clients normally see committed server data. All mapping errors are redacted and linked to record IDs for support.

## Repository contracts

Read interfaces return domain values/streams; transport errors are mapped into typed `AppFailure` exceptions that presentation converts to AsyncValue errors. Mutation interfaces return a typed CommandSubmission, which may be queued offline. The concrete signatures below specify APIs to implement; they are not executable source files.

| Repository | Core API |
| --- | --- |
| `AuthRepository` | `Stream<AuthIdentity?> watchIdentity()`; `Future<void> signInWithEmail(String email, String password)`; `registerWithEmail(...)`; `signInWithGoogle()`; `sendPasswordReset(String email)`; `reauthenticate(AuthCredentialInput input)`; `signOut()` |
| `SessionRepository` | `Future<UserProfile> bootstrapProfile()`; `Stream<UserProfile?> watchProfile()`; `Future<void> requestAccountDeletion()` |
| `ObligationsRepository` | `Stream<QueryPage<Obligation>> watchPage(ObligationQuery query)`; `Stream<Obligation?> watchById(ObligationId id)`; `Stream<List<ObligationInstance>> watchInstances(ObligationId id, InstanceQuery query)`; `Future<CommandSubmission> create(CreateObligationCommand command)`; `update(UpdateObligationCommand command)`; `changeLifecycle(ChangeLifecycleCommand command)`; `setInstanceAmount(SetInstanceAmountCommand command)` |
| `PaymentsRepository` | `Stream<QueryPage<Payment>> watchPage(PaymentQuery query)`; `Stream<Payment?> watchById(PaymentId id)`; `Future<CommandSubmission> record(RecordPaymentCommand command)`; `correct(CorrectPaymentCommand command)`; `reportDeduction(ReportDeductionCommand command)` |
| `ContactsRepository` | `Stream<QueryPage<Contact>> watchPage(ContactQuery query)`; `Stream<ContactPosition> watchPosition(ContactId id)`; `save(SaveContactCommand command)` and `archive(ArchiveContactCommand command)` returning `Future<CommandSubmission>` |
| `DashboardRepository` | `Stream<DashboardSummary> watchSummary(DashboardQuery query)`; `Stream<List<ObligationInstance>> watchDue(DueQuery query)` |
| `CalendarRepository` | `Stream<QueryPage<CalendarEvent>> watchAgenda(CalendarQuery query)` |
| `ActivityRepository` | `Stream<QueryPage<ActivityEvent>> watchPage(ActivityQuery query)` |
| `NotificationsRepository` | `Stream<QueryPage<Reminder>> watchInbox(ReminderQuery query)`; `markRead(MarkReminderReadCommand command)` returning `Future<CommandSubmission>` |
| `AttachmentsRepository` | `Future<Attachment> reserve(AttachmentReservation input)`; `Stream<UploadProgress> upload(AttachmentId id, AttachmentInput file)`; `Future<AttachmentBytes> download(AttachmentId id)`; `Future<void> remove(AttachmentId id)` |
| `SettingsRepository` | Streams for sources/categories/preferences; `saveProfile(SaveProfileCommand)`, `saveSource(SaveSourceCommand)`, `saveCategory(SaveCategoryCommand)`, `saveNotifications(SaveNotificationsCommand)`, all `Future<CommandSubmission>` |
| `SearchRepository` | `Stream<SearchProgress> search(SearchQuery query)` with cancellable paginated scanning, results and completeness state |

Common command fields are commandId, schemaVersion, payload, and expectedRevision when editing. Actor UID is not an accepted authoritative field; the callable derives it. Reference IDs are owner-local. Explicit command classes discriminate the permitted operation. Domain preview functions include `PaymentCalculator.balance(Money original, Iterable<Payment> ledger)`, `AllocationPolicy.preview(...)`, and `RecurrenceCalculator.between(RecurrenceRule rule, LocalDate from, LocalDate through)`.

## Concrete repository design

`FirebaseAuthRepository` wraps FirebaseAuth and platform sign-in adapters. `FirebaseSessionRepository` invokes bootstrap and watches the owner profile. `FirestoreObligationsRepository` uses typed converters for owner-scoped reads and delegates mutation payloads to SyncEngine. `FirestorePaymentsRepository` reads append-only ledger records and delegates financial commands; it never writes aggregate fields locally.

Contacts/settings/notifications/activity/dashboard/calendar implementations use the same query catalog and failure mapping. `FirestoreSearchRepository` composes bounded pages and evaluates normalized predicates over all candidates. `FirebaseAttachmentsRepository` reserves/removes through callables, uploads/downloads with authenticated Storage SDK, and watches metadata finalization. Attachments require network for reservation/upload; offline users retain a selected local file reference only on durable native storage, with explicit web limitations.

SyncEngine persists the command before returning queued/starting upload, dispatches through one ExecuteCommandGateway, and reconciles ambiguous outcomes by receipt lookup/retry. OutboxStore uses Drift-backed SQLite on native and a tested web SQLite/WASM persistence adapter. Durable availability and quota errors are surfaced; Firestore's read cache remains separate. Drift documents browser storage options and deployment requirements; validate them in the first offline milestone. [Drift web support](https://drift.simonbinder.eu/platforms/web/).

## Riverpod provider graph

Application-level providers hold Environment, Clock, Firebase SDK clients, capability adapters, telemetry, and router/session orchestration. A UID-keyed session ProviderScope owns repositories, local store, subscriptions, and SyncEngine. No repository/listener from one UID survives into another user's scope.

```text
environment + capability + SDK client providers
  → authRepositoryProvider → authIdentityProvider
  → sessionRepositoryProvider → sessionControllerProvider
  → ready UID session scope
       → outboxStoreProvider → syncEngineProvider
       → feature repository providers
       → stream/query family providers
       → editor/action AsyncNotifier providers
       → small ConsumerWidget views
```

Use Provider for injected repositories/pure services, StreamProvider families for watched data, AsyncNotifier for asynchronous editor/actions, and Notifier for synchronous query/filter/form state. Family keys use immutable query objects with value equality. Read streams and editor submit state are separate so a refresh does not discard a draft. Auto-dispose short-lived detail/query subscriptions; retain SyncEngine while the user session exists.

`dashboardQueryProvider` combines selected currency/current civil month/zone. `obligationProvider(id)`, `instancesProvider(query)`, `paymentsProvider(query)`, and `calendarProvider(query)` delegate reads. Editors validate/preview in domain code, persist commands through repositories, and expose queued/accepted/rejected states. Disable automatic mutation retries in presentation; SyncEngine controls retries with persistent IDs. Overrides supply fake repositories/clock/gateways for Riverpod and widget tests.

Riverpod's offline persistence API is currently experimental. Tally uses explicit stable outbox storage instead of depending on experimental provider persistence for financial commands. [Riverpod offline persistence](https://riverpod.dev/docs/concepts2/offline).

## go_router configuration

Use a GoRouter created from session state, with startup/public/auth/onboarding routes plus `StatefulShellRoute.indexedStack` branches for the six primary destinations. Keep the route table in app_router.dart; feature factories provide screens. Navigation supports URL parameters, nested detail routes, redirects, and shell navigators. [Official go_router package](https://pub.dev/packages/go_router).

Redirect sequence: unknown auth → startup; signedOut → welcome/sign-in; signedIn without profile → bootstrap/loading; incomplete required defaults → onboarding; ready → originally requested permitted route or home. Recovery/auth routes remain accessible as appropriate. A single stable refresh bridge updates the router; do not recreate it on every auth stream tick and lose history.

Validate route IDs/filter parameters before opening repositories, preserve one safe intended route through auth, and prevent redirect loops. A nonexistent/other-owner record returns a friendly unavailable state without revealing whether it exists for another user. Logout clears protected navigation stacks and session scope. Unsaved editors use an explicit leave/discard guard; accepted queued commands are already persisted and not treated as unsaved forms.

Mobile maps Activity/Settings branches to the More visual destination; More is a menu that navigates to their real paths. Tablet/desktop select their six direct destinations. New/payment editors can use the root navigator as full-screen pages on mobile and constrained dialogs on wide layouts, with the same routable URL. Browser back/forward, reload at deep link, and FCM open actions are test cases.

## Platform adapters and dependency policy

Use official `firebase_core`, `firebase_auth`, `cloud_firestore`, `firebase_storage`, `cloud_functions`, `firebase_messaging`, `firebase_app_check`, `firebase_crashlytics`, `firebase_analytics`, and `firebase_remote_config`. Add `flutter_riverpod`, `go_router`, Freezed/json_serializable and build_runner where needed, formatting/timezone support, Drift storage, a vetted native local-notification package, and platform Google sign-in support. Resolve compatible stable SDK/packages together and commit lockfiles; do not invent version numbers before toolchain verification.

The current Firebase setup guide lists iOS 15 and Android API 23 as baseline platform requirements. Validate chosen plugin versions and their stricter minimums when scaffolding. [FlutterFire setup and platform prerequisites](https://firebase.google.com/docs/flutter/setup).

ErrorReporter implements Crashlytics on Android/iOS and a redacted structured web error channel on web. The Crashlytics package currently advertises Android/iOS/macOS, not web; it cannot be assumed to cover desktop browsers. Analytics checks consent and capability. FCM/local notifications/file picking/persistence each expose supported/permission-denied states. [Official Crashlytics package platforms](https://pub.dev/packages/firebase_crashlytics).

Tests/builds target Android, iOS, and Flutter web. Native Windows/macOS/Linux distributions are outside the requested desktop-browser target. iOS validation runs on a macOS runner; this Linux workspace cannot establish an iOS build result.
