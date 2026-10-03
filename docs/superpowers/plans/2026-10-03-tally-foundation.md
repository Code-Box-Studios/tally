# Tally Flutter Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first runnable Flutter increment: Tally's responsive Material 3 shell and sample dashboard, exact money/date primitives, a fail-closed Firebase emulator connection, and automated foundation checks.

**Architecture:** Keep financial values independent of Flutter and Firebase. Riverpod injects configuration and repositories; go_router owns navigation; feature views consume immutable domain values. Preview data and emulator connections are explicit modes, and canonical financial writes remain server-authoritative in later milestones.

**Tech Stack:** Flutter 3.47.6 / Dart 3.13.5, Material 3, [flutter_riverpod 3.4.3](https://pub.dev/packages/flutter_riverpod), [go_router 18.0.2](https://pub.dev/packages/go_router), official [FlutterFire Core/Auth/Firestore/Functions/Storage packages](https://firebase.google.com/docs/flutter/setup), TypeScript, Firebase Emulator Suite, Flutter tests and Firebase Rules tests. Resolve compatible FlutterFire and tooling versions during Task 1/8 and commit lockfiles.

**Spec:** [Accepted product and technical blueprint](../specs/2026-10-03-tally-design.md), specifically [Flutter architecture](../../architecture/flutter.md), [financial rules](../../architecture/financial-engine.md), [testing and operations](../../quality/testing-and-operations.md), and [M0 roadmap](../../roadmap.md). Visual reference: `.lavish/tally-design.html`, `.lavish/tally-design.css`, and `.lavish/tally-design.js` in the existing workspace.

## Global Constraints

- “Domain code has no Firebase or widget dependencies.”
- “One feature never reaches into another feature's data folder.”
- “Generate directories only when their milestone needs them; do not fill the tree with empty abstractions.”
- “Money uses integer minor units with an explicit ISO currency code. No currency conversion is in the MVP.”
- “Parse decimal strings directly; never multiply a binary floating-point input by 100 to derive money.”
- “PHP/USD/EUR/SGD/AUD/GBP use two decimal places; JPY uses zero.”
- “one positive financial amount at most `1_000_000_000_000` minor units”; aggregate absolute limit `9_007_199_254_740_991`.
- “Signed aggregate differences such as net position can be negative; remaining debt cannot.”
- “Use canonical validated Gregorian `YYYY-MM-DD` civil dates”; accepted range `1900-01-01` through `2199-12-31`.
- “Never serialize a civil date as UTC midnight and then redisplay it in another zone.”
- “Enums persist stable strings independently of Dart enum index/name.”
- “IDs are not interchangeable just because Firestore stores them as strings.”
- “Use a demo project ID `demo-tally` for development/CI so missing emulator wiring cannot fall through to a real project.”
- “Connect before first service use.” Auth 9099, Firestore 8080, Functions 5001, Storage 9199, Emulator UI 4000.
- “Validate requested environment/project pairing at startup; no missing-config fallback to production.”
- “Native Windows/macOS/Linux distributions are outside the requested desktop-browser target.”
- “iOS validation runs on a macOS runner; this Linux workspace cannot establish an iOS build result.”
- Human interface copy stays **Tally**, **Know what’s due.**, **You Owe**, **Owed to You**, **Monthly Dues**, **Remaining**, **Paid**, **Overdue**, and **Auto Deduct**. Never render internal enum names.

## Review Focus

1. Pasted malformed money, scientific notation, and excessive decimal precision must be rejected without rounding; Task 2 pins these cases.
2. Two different currencies and values near JavaScript's safe-integer limit must fail explicitly when combined/overflowed; Task 2 pins these cases.
3. Invalid Gregorian dates and calendar boundaries must not normalize into another day; Task 3 pins these cases.
4. Missing emulator endpoints, a real project ID, or unconfigured staging/production must cause zero SDK initialization attempts; Tasks 4 and 8 pin these cases.
5. A narrow screen at 200% text scale, direct navigation to Activity/Settings, and malformed route filters must keep navigation reachable and avoid clipped financial information; Tasks 6 and 7 pin these cases.

---

## Delivery boundary and current evidence

The user reviewed the visual preview and asked to build Tally. This plan covers the first foundation increment of the existing roadmap, not the full MVP. The resulting application will run independently of the HTML prototype.

**Included:** Android/iOS/web project targets; responsive navigation; light/dark/system theme; a polished sample dashboard; intentional empty states for the other destinations; an Add action chooser; read-only preview data; money/date/ID primitives; validated startup modes; emulator wiring; deny-all baseline Rules; a local-only authenticated emulator probe; foundation tests and CI.

**Next increments:** M1 authentication, profiles and owner-scoped Rules; M2 borrowing/lending and immutable payments; M3 installments and live projections; M4 recurrence/automatic deductions; subsequent calendar/reminder/attachment/offline/release work as documented. The foundation does not label a demo action as saved, implement fake payment persistence, or claim production readiness.

Observed on 2026-10-03: Flutter 3.47.6 and Dart 3.13.5 are installed; Node 24.21.0 and Java 25.0.4.1 are available. Firebase CLI and Android SDK are absent. A Playwright Chromium executable is available at `/home/jess/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`. iOS requires a macOS runner. These observations replace the older toolchain note in the original blueprint.

Use a task branch/worktree at execution time if isolation is useful. Preserve the user's existing `.gitignore`, `.ignore`, graft cache, documentation, and `.lavish` assets. If using a worktree, copy the three named untracked design reference files into its `.lavish/` directory without moving/deleting the originals or copying session state. Do not provision real Firebase projects or deploy as part of this increment. `dev.tally` is a local scaffold identifier; final published app identifiers remain a provisioning decision.

## File and responsibility map

| Files | Responsibility |
| --- | --- |
| `pubspec.yaml`, `pubspec.lock`, `analysis_options.yaml`, `android/`, `ios/`, `web/`, `.metadata` | Flutter targets, dependencies and platform configuration |
| `lib/main.dart`, `lib/main_preview.dart`, `lib/main_dev.dart`, `lib/main_staging.dart`, `lib/main_prod.dart` | Explicit entry points; default runs preview |
| `lib/app/bootstrap.dart`, `lib/app/tally_app.dart`, `lib/app/app_router.dart`, `lib/app/responsive_shell.dart` | Initialization, root app, routing and responsive navigation |
| `lib/core/errors/app_failure.dart` | Typed safe errors |
| `lib/core/money/{currency_code.dart,money.dart,money_formatter.dart}` | Exact currency values and integer formatting |
| `lib/core/dates/{local_date.dart,year_month.dart}` | Gregorian civil dates and months |
| `lib/core/identifiers/entity_ids.dart` | Distinct validated IDs |
| `lib/core/config/{environment.dart,environment_providers.dart}` | Mode validation and injection |
| `lib/core/firebase/{firebase_initializer.dart,emulator_connector.dart,firebase_clients.dart}` | Trusted initialization boundary and SDK adapters |
| `lib/core/theme/{tally_theme.dart,theme_controller.dart}` | Material 3 tokens and theme state |
| `lib/shared/layout/breakpoints.dart` | Compact/medium/expanded thresholds |
| `lib/shared/widgets/{money_text.dart,status_badge.dart,empty_state.dart,error_panel.dart}` | Reusable presentation components |
| `lib/features/dashboard/domain/{dashboard_summary.dart,dashboard_repository.dart}` | Immutable currency-specific dashboard contract and typed preview states |
| `lib/features/dashboard/data/{preview_dashboard_repository.dart,empty_dashboard_repository.dart}` | Synthetic read-only fixtures and empty unauthenticated foundation state |
| `lib/features/dashboard/presentation/{dashboard_providers.dart,dashboard_screen.dart,widgets/summary_card.dart,widgets/due_list.dart}` | Dashboard state, layout and components |
| `lib/features/obligations/presentation/{obligations_screen.dart,add_action_sheet.dart}` | Section navigation, empty state and friendly action chooser |
| `lib/features/{people,calendar,activity}/presentation/*_screen.dart` | Purposeful initial empty screens |
| `lib/features/settings/presentation/settings_screen.dart` | Theme/currency controls and explicit preview notice |
| `test/core/`, `test/app/`, `test/features/`, `test/shared/`, `test/support/` | Unit/provider/widget fixtures and checks |
| `firebase.json`, `firestore.rules`, `storage.rules`, `firestore.indexes.json` | Emulator configuration and deny-all baseline |
| `functions/{package.json,package-lock.json,tsconfig.json,src/index.ts,src/emulator_health.ts,test/emulator_health.test.ts}` | Authenticated emulator-only callable probe and unit tests |
| `firebase/rules-tests/baseline.test.mjs`, `firebase/emulator-tests/bootstrap.test.mjs`, `package.json`, `package-lock.json` | Rules and SDK endpoint integration harness |
| `tool/check.sh`, `.github/workflows/ci.yml`, `docs/development.md` | Reproducible local/CI checks and platform evidence |

Brace notation abbreviates separate files; create only files named by a task. No code generation is necessary for these small value types. Add Freezed/json_serializable when the first aggregate/DTO milestone needs them.

### Task 1: A runnable Flutter workspace that preserves the existing repository

**Files:** Create Flutter target/configuration files from the map; `lib/main.dart`; `lib/app/tally_app.dart`; `test/app/launch_test.dart`. Modify `.gitignore` by merging generated ignore entries; keep its `/graft/` rule and leave `.ignore` untouched.

**Interfaces:** Produces `TallyApp extends StatelessWidget` with `const TallyApp({super.key})`. It initially renders the Tally brand/tagline; Task 6 replaces its interior without changing its constructor.

- [x] **Step 1: Generate an empty Android/iOS/web project in a temporary directory.** Run `flutter create --empty --platforms=android,ios,web --project-name=tally --org=dev.tally <temporary-directory>`. Copy only generated application/platform files into the repository; preserve existing README/docs/design assets. Set Android minimum SDK to at least 23 and iOS deployment target to at least 15, respecting stricter resolved plugin requirements.
- [x] **Step 2: Add the failing launch test.** In `test/app/launch_test.dart`, pump `const TallyApp()` and assert one `Tally` brand and one `Know what’s due.` tagline. Remove the generated counter test. Task 4 updates its harness to wrap TallyApp in ProviderScope once injection is introduced.
- [x] **Step 3: Run the launch test.** `flutter test test/app/launch_test.dart` must fail because the Tally app/brand is absent.
- [x] **Step 4: Implement the root app and resolve the initial dependencies.** Add `flutter_riverpod: ^3.4.3`, `go_router: ^18.0.2`, and the five official FlutterFire packages listed above. `main()` initializes Flutter and launches the branded root. Commit the resolved lockfile; do not add unused notification/analytics packages yet.
- [x] **Step 5: Verify the baseline.** `flutter test test/app/launch_test.dart`, `flutter analyze`, and `flutter build web` pass. Record the resolved SDK/package versions in `docs/development.md`.
- [x] **Step 6: Commit only this task's files.** Message: `build: initialize Tally Flutter targets and dependencies`.

### Task 2: Exact money, currency separation and safe arithmetic

**Files:** Create the three money files and `lib/core/errors/app_failure.dart`; tests `test/core/money_test.dart`, `test/core/money_formatter_test.dart`.

**Interfaces:**

- `enum CurrencyCode` supports PHP, USD, EUR, SGD, AUD, JPY, GBP with explicit `String code`, `int exponent`, and `String symbol`; `static CurrencyCode parse(String code)` rejects unsupported/case-mismatched persisted codes.
- `enum AppFailureCode { invalidAmount, unsupportedCurrency, currencyMismatch, overflow, invalidDate, invalidId, invalidEnvironment, unavailable }`.
- `final class AppFailure implements Exception` exposes `AppFailureCode code`, `String messageKey`, `bool retryable`, and immutable `Map<String, String> fieldErrors`.
- `Money.fromMinorUnits(int minorUnits, CurrencyCode currency)` validates the signed safe-integer range. `Money.parse(String text, CurrencyCode currency, {bool allowZero = false})` validates positive entry amounts up to the financial limit. `Money add(Money other)`, `Money subtract(Money other)`, value equality and immutable `minorUnits`/`currency` fields.
- `MoneyFormatter.format(Money money, {bool includeCode = false}) -> String` groups integer digits, omits an all-zero decimal portion, and retains the full nonzero fractional exponent. Examples: `₱10,000`, `₱2,500.50`, `-₱500`, `¥1,234`, `$500 USD` when including the code.

- [x] **Step 1: Write financial tests with explicit assertions.**

```dart
test('partial and multiple payment arithmetic is exact', () {
  final php = CurrencyCode.php;
  expect(Money.parse('10000', php).subtract(Money.parse('3000', php)).minorUnits, 700000);
  final paid = Money.parse('5000', php)
      .add(Money.parse('2500', php)).add(Money.parse('4000', php));
  expect(paid.minorUnits, 1150000);
  expect(Money.parse('20000', php).subtract(paid).minorUnits, 850000);
});
test('malformed entries are never rounded', () {
  for (final text in ['1.001', '1e3', 'NaN', 'Infinity', '1,000', '-1', '', '.', '  ']) {
    expect(() => Money.parse(text, CurrencyCode.php), throwsA(isA<AppFailure>()));
  }
  expect(() => Money.parse('1.25', CurrencyCode.jpy), throwsA(isA<AppFailure>()));
  expect(Money.parse(' 2500.50 ', CurrencyCode.php).minorUnits, 250050);
  expect(() => Money.parse('10000000000.01', CurrencyCode.php), throwsA(isA<AppFailure>()));
});
test('currency and safe-integer failures are explicit', () {
  expect(() => Money.parse('10000', CurrencyCode.php)
      .add(Money.parse('500', CurrencyCode.usd)), throwsA(isA<AppFailure>()));
  expect(() => Money.fromMinorUnits(9007199254740991, CurrencyCode.php)
      .add(Money.fromMinorUnits(1, CurrencyCode.php)), throwsA(isA<AppFailure>()));
});
```

Also assert zero-entry rejection/explicit `allowZero`, exact `0.01`, upper-limit acceptance, signed aggregate subtraction, currency equality and every formatter example in the interface.
- [x] **Step 2: Run `flutter test test/core/money_test.dart test/core/money_formatter_test.dart`.** Expected failure: missing types/implementation.
- [x] **Step 3: Implement the declared types.** Trim exterior input whitespace; accept ungrouped ASCII digits with an optional decimal fraction no longer than the currency exponent. Use `BigInt` for parsing and arithmetic range checks before converting to `int`, including on web. Money subtraction can be signed; obligation remaining-balance validation belongs to the later payment service.
- [x] **Step 4: Run the two test files on the Dart VM and web.** All cases pass with the expected failure codes; no floating-point conversion appears in parsing/formatting. Also run `dart test --platform chrome test/core/money_test.dart test/core/money_formatter_test.dart` with the available Chromium selected through CHROME_EXECUTABLE; near-safe-integer assertions must pass in the JavaScript runtime, not only native Dart.
- [x] **Step 5: Commit.** Message: `feat: add exact currency values and checked money arithmetic`.

### Task 3: Civil dates, months and distinct safe identifiers

**Files:** Create `local_date.dart`, `year_month.dart`, `entity_ids.dart`; tests `test/core/local_date_test.dart`, `test/core/entity_ids_test.dart`.

**Interfaces:**

- `LocalDate.parse(String value)`, `LocalDate.fromParts(int year, int month, int day)`, `int compareTo(LocalDate other)`, `LocalDate addDays(int days)`, `YearMonth get yearMonth`, and canonical `toString()`/value equality.
- `YearMonth.parse(String value)`, `YearMonth.fromParts(int year, int month)`, `LocalDate get firstDay`, `LocalDate get lastDay`, canonical `toString()`/comparison/equality. Same year bounds as LocalDate.
- Distinct immutable `OwnerUid`, `ObligationId`, `InstanceId`, `PaymentId`, `ContactId`, `SourceId`, `CategoryId`, `AttachmentId`, `CommandId`, each with a validating constructor taking `String value` and exposing that value. IDs accept 1–128 ASCII letters/digits/underscore/hyphen; other forms fail with `invalidId`.

- [x] **Step 1: Write the failing date/ID tests.** Assert `2026-10-05` round-trips unchanged; `2024-02-29` is valid; `2026-02-29`, `2026-02-30`, `2026-2-05`, years 1899/2200, month 13 and trailing timezone text fail. Assert `2026-12-31 + 1 day = 2027-01-01`, February 2024/2026 month ends, and leaving the supported range fails. Assert empty, slash, `..`, whitespace, controls, and 129-character IDs fail; `payment_01-A` succeeds. Equal IDs of the same type compare equal, while PaymentId and ObligationId are distinct types/values.
- [x] **Step 2: Run `flutter test test/core/local_date_test.dart test/core/entity_ids_test.dart`.** Expected failure: missing values.
- [x] **Step 3: Implement the interfaces.** Internal UTC DateTime arithmetic is allowed only after checking Gregorian parts and revalidating output; expose no DateTime serialization/conversion API for civil dates. Each ID type includes its own type in equality.
- [x] **Step 4: Run the tests.** All boundary/canonical-form assertions pass.
- [x] **Step 5: Commit.** Message: `feat: introduce validated civil dates and entity identifiers`.

### Task 4: Explicit startup modes with zero unsafe fallbacks

**Files:** Create environment/provider files, `bootstrap.dart`, `firebase_initializer.dart`, five entry points, `error_panel.dart`; tests `test/core/environment_test.dart`, `test/app/bootstrap_test.dart`; support `test/support/recording_initializer.dart`. Modify `lib/main.dart`.

**Interfaces:**

- `enum AppEnvironment { preview, emulator, development, staging, production }`.
- Immutable `EmulatorEndpoints({required String host, int authPort = 9099, int firestorePort = 8080, int functionsPort = 5001, int storagePort = 9199})`; validates a host without URL/path/credentials and ports 1–65535.
- `EnvironmentConfig.preview()`, `EnvironmentConfig.emulator({required String projectId, EmulatorEndpoints? endpoints})`, and `EnvironmentConfig.unconfigured(AppEnvironment mode)` for development/staging/production; `void validate()`. Preview has no Firebase project; emulator requires a `demo-` project and nonnull complete endpoints. Real environments fail with `invalidEnvironment` until explicitly configured in their later milestone.
- `abstract interface class FirebaseInitializer { Future<void> initialize(EnvironmentConfig configuration); }`.
- `Future<void> prepareBackend({required EnvironmentConfig configuration, required FirebaseInitializer initializer})` validates first, invokes the initializer only for emulator, and performs no Firebase action in preview.
- `environmentProvider` injects EnvironmentConfig; default is preview. `Future<void> bootstrap(EnvironmentConfig configuration, {FirebaseInitializer? initializer})` prepares the backend then launches ProviderScope/TallyApp. An emulator initializer is supplied by main_dev in Task 8; if absent, emulator startup fails safely. Preview requires no initializer. Bootstrap catches safe startup failures into a dedicated startup error view rather than silently switching modes.

- [x] **Step 1: Write failing mode and initialization tests.** A recording fake counts initialization calls. Preview has zero calls; valid `demo-tally` emulator has one. A real project in emulator, missing/invalid endpoints, and unconfigured staging/production each fail with zero calls. Assert explicit host selection keeps `10.0.2.2` and a supplied LAN host instead of replacing either with loopback.
- [x] **Step 2: Run `flutter test test/core/environment_test.dart test/app/bootstrap_test.dart`.** Expected failure: missing configuration/bootstrap.
- [x] **Step 3: Implement the interfaces and entry points.** Default `main.dart` delegates to `main_preview.dart`; `main_dev.dart` selects demo-tally and `TALLY_EMULATOR_HOST` (127.0.0.1 unless explicitly set). Staging/prod start in a safe unconfigured error state and make no network calls. Do not create placeholder production API keys. Widget text explains recovery without exposing raw errors or keys. Update the launch-test harness to use ProviderScope.
- [x] **Step 4: Run the two test files plus the launch test.** The valid/invalid mode call counts match exactly.
- [x] **Step 5: Commit.** Message: `feat: add explicit preview and emulator bootstrap modes`.

### Task 5: Material 3 design tokens and reusable accessible widgets

**Files:** Create theme/controller, breakpoints, money/status/empty widgets; tests `test/shared/financial_widgets_test.dart`, `test/core/theme_controller_test.dart`.

**Interfaces:**

- `ThemeData TallyTheme.light()` / `TallyTheme.dark()`; `ThemeController extends Notifier<ThemeMode>` starts in system mode and exposes `void setMode(ThemeMode mode)`; `themeModeProvider` is its NotifierProvider.
- `enum LayoutClass { compact, medium, expanded }`; `LayoutClass layoutClassFor(double width)` uses `<600`, `600..1023`, `>=1024`.
- `MoneyText({required Money money, bool includeCode = false, TextStyle? style})` uses MoneyFormatter and announces the ISO currency in semantics.
- `StatusBadge({required String label, required IconData icon, required StatusTone tone})`, with `StatusTone { neutral, positive, caution, danger, automatic }`; state always has text/icon.
- `EmptyState({required IconData icon, required String title, required String description, String? actionLabel, VoidCallback? onAction})`.

- [x] **Step 1: Write failing component/provider tests.** Assert MoneyText displays/announces PHP and USD distinctly, Overdue badge has visible text and an icon, the empty CTA invokes once, theme updates light/dark/system, and width thresholds 599/600/1023/1024 match. Pump the components at width 320 and text scale 2.0; assert no Flutter layout exceptions and all monetary text remains present.
- [x] **Step 2: Run `flutter test test/shared/financial_widgets_test.dart test/core/theme_controller_test.dart`.** Expected failure: missing widgets/provider.
- [x] **Step 3: Implement the interfaces using Material 3.** Translate preview tokens: light background `#F6F7F4`, surface `#FFFFFF`, ink `#26332D`, primary `#3C6653`; dark background `#151D19`, surface `#1D2721`, ink `#E6ECE5`, primary `#9DC4A8`. Use accessible contrast for secondary text rather than copying low-contrast preview small text. Base font sizes 14/16, body line-height 1.5, cards radius 16, controls at least 48 logical pixels. Keep typography bundled/system-local rather than requiring runtime font downloads. Allow money wrapping/reflow instead of shrinking until unreadable.
- [x] **Step 4: Run both test files and `flutter analyze`.** All assertions pass in both themes.
- [x] **Step 5: Commit.** Message: `feat: establish Tally Material 3 theme and financial widgets`.

### Task 6: Responsive navigation, URL routing and initial destinations

**Files:** Create router/shell, the five non-dashboard screens and Add chooser; modify TallyApp; tests `test/app/navigation_test.dart`, `test/app/responsive_shell_test.dart`.

**Interfaces:**

- `GoRouter createAppRouter({String initialLocation = '/home'})`; `appRouterProvider` creates/disposes one router, independent of theme/currency changes.
- `ResponsiveShell({required StatefulNavigationShell navigationShell})` hosts six `StatefulShellRoute.indexedStack` branches: `/home`, `/obligations`, `/people`, `/calendar`, `/activity`, `/settings`. `/` redirects to `/home`; unknown routes render a friendly unavailable page with Home action.
- Stateless/Consumer widgets `ObligationsScreen`, `PeopleScreen`, `CalendarScreen`, `ActivityScreen`, `SettingsScreen` have standard named key constructors. Obligations accepts a validated query `section` with stable values `owe`, `owed`, `dues`; invalid/missing values select `owe`.
- `Future<AddIntent?> showAddActionSheet(BuildContext context)` and `enum AddIntent { borrow, lend, monthlyDue, recurringPayment }` present the four friendly actions. The foundation chooser returns the chosen intent only; it offers no Save/payment-success claim.

- [x] **Step 1: Write failing routing/layout tests.** At 390 pixels, assert the five mobile destinations Home/Obligations/People/Calendar/More and open Activity/Settings through More. At 800 pixels assert six rail destinations; at 1440 assert six expanded sidebar destinations. Assert direct `/activity` and `/settings` links, browser-equivalent back/pop, branch state retention, unknown-route recovery, and invalid obligation section fallback. Open Add and find `I borrowed money`, `I lent money`, `Add monthly due`, `Add recurring payment`.
- [x] **Step 2: Run `flutter test test/app/navigation_test.dart test/app/responsive_shell_test.dart`.** Expected failure: missing route/shell behavior.
- [x] **Step 3: Implement routing and screen layouts.** Compact uses NavigationBar and FloatingActionButton.extended for Add; medium uses NavigationRail; expanded uses a 230-pixel sidebar and a constrained content area. Activity/Settings are real routes even when selected through More. Use intentional empty-state copy, including `Nothing owed yet` and `Add money you've borrowed or an obligation you want Tally to remember.` Settings exposes real theme state and the preview currency selector from Task 7. Until that provider exists, omit the selector rather than invent a second currency state. Keep the immutable app router stable across provider rebuilds.
- [x] **Step 4: Run the routing tests, including all destinations at 320/600/1024 and text scale 2.0.** Assert no layout exceptions, every destination reachable, and the Add action reachable without covering list content.
- [x] **Step 5: Commit.** Message: `feat: implement responsive Tally navigation and initial screens`.

### Task 7: The approved dashboard as real Flutter with isolated preview data

**Files:** Create dashboard domain/data/provider/screen/widget files; modify router's Home branch and Settings currency control; tests `test/features/dashboard_repository_test.dart`, `test/features/dashboard_providers_test.dart`, `test/features/dashboard_screen_test.dart`.

**Interfaces:**

- Immutable `DashboardQuery({required CurrencyCode currency, required YearMonth month})` with value equality.
- Immutable `DashboardSummary` has `currency`, `month`, `LocalDate asOfDate`, Money fields `youOwe`, `owedToYou`, `dueThisMonth`, `paidThisMonth`, `remainingThisMonth`, `overdue`, and immutable `List<DuePreviewItem> upcoming`. `Money get netPosition` subtracts You Owe from Owed to You. Constructor verifies all Money values match `currency` and remaining/obligation totals are nonnegative.
- `DuePreviewItem` holds `String title`, `LocalDate dueDate`, nullable `Money remaining`, `PreviewSection section`, `PreviewDueState state`, `bool automatic`, and `bool assumed`. `PreviewSection { owedByMe, owedToMe, recurringDue }` and `PreviewDueState { upcoming, dueToday, overdue, paid, expected, failed }` are typed projection enums, not canonical lifecycle/deduction states. Friendly labels are mapped in presentation. Null amount displays `Amount needed`, never zero.
- `abstract interface class DashboardRepository { Stream<DashboardSummary> watchSummary(DashboardQuery query); }`; `PreviewDashboardRepository` implements synthetic immutable responses without Firebase imports. `EmptyDashboardRepository` implements a currency-matched zero summary/empty upcoming list for the unauthenticated emulator foundation; it is not a live financial repository.
- `selectedCurrencyProvider` is `NotifierProvider<SelectedCurrencyController, CurrencyCode>`; initial PHP, `void setCurrency(CurrencyCode value)`.
- `dashboardRepositoryProvider` supplies PreviewDashboardRepository only in preview and EmptyDashboardRepository in emulator until authenticated M1 wiring exists; it never reuses sample financial records. `dashboardSummaryProvider` is a StreamProvider watching selected currency and the chosen month; in M0 this month is explicitly October 2026 in the preview/foundation context.
- `DashboardScreen`, `SummaryCard({required String label, required Money value, ...})`, and `DueList({required List<DuePreviewItem> items})` remain small widgets using existing MoneyText/StatusBadge.

- [x] **Step 1: Write failing repository/provider/widget tests.** PHP fixture: You Owe 2,500,000 minor units, Owed to You 1,250,000, Due This Month 1,999,800, Paid This Month 190,000, Remaining This Month 1,809,800, Overdue 160,000. Assert net -1,250,000. USD fixture has only the separate $500 receivable and zero PHP-derived dues. Switch PHP→USD→PHP with ProviderContainer and verify each result's currency and exact values; override the repository with error/loading fixtures and assert readable recovery. Emulator-provider override returns zero values with no sample names/activity, and no `Sample data` financial snapshot. An unknown variable bill shows `Amount needed`; an assumed deduction remains visibly `Assumed`. Pump widths 320/800/1440 and text scale 2.0 with no layout exceptions.
- [x] **Step 2: Run `flutter test test/features/dashboard_repository_test.dart test/features/dashboard_providers_test.dart test/features/dashboard_screen_test.dart`.** Expected failure: missing dashboard contract/provider/views.
- [x] **Step 3: Implement the declared types, fixture repository and Flutter dashboard.** Recreate the preview's summary cards, net position, due-today/soon/overdue lists, automatic deductions and recent-activity arrangement using responsive columns. Label preview mode `Sample data`; emulator mode has intentional zero/empty states, never unauthenticated private data. Month-paid totals describe payment-date membership; remaining-month totals describe amounts still outstanding for that month's due periods. Do not infer one by subtracting unrelated month-paid data in future live implementations.
- [x] **Step 4: Run the dashboard tests and full Flutter tests.** Assert original fixtures are unchanged by currency/theme toggles and repository errors do not collapse money into zero. Display tested desktop/mobile light/dark screenshots for review.
- [x] **Step 5: Commit.** Message: `feat: build Tally dashboard with isolated sample repositories`.

### Task 8: Firebase emulator connection and deny-all security baseline

**Files:** Create Firebase connector/client files, root Firebase configuration/rules/indexes, Functions/tooling packages and tests from the map; test `test/core/emulator_connector_test.dart`; modify main_dev/bootstrap SDK adapter wiring.

**Interfaces:**

- `abstract interface class FirebaseSdkGateway` has `Future<void> initializeDemo(String projectId)`, `Future<void> connectAuth(String host, int port)`, `void connectFirestore(String host, int port)`, `void connectFunctions(String host, int port)`, `Future<void> connectStorage(String host, int port)`. A production adapter owns the actual SDK clients; recording fake tests ordering.
- `EmulatorConnector(FirebaseSdkGateway gateway)` implements `FirebaseInitializer`. It validates the entire config before any SDK call, initializes the demo app and connects all four endpoints. `FlutterFireSdkGateway` is the actual SDK adapter; its `FirebaseClients get clients` remains unavailable until successful connection completion. FirebaseClients holds typed app/auth/firestore/functions/storage SDK clients. M1 injects those clients into authenticated repositories; M0 UI does not query them. No query/auth observer is constructed before completion.
- TypeScript `validateEmulatorHealthRequest(input: unknown, uid: string | undefined, emulator: boolean, projectId: string | undefined): {mode: 'emulator'; userId: string}` throws safe invalid-argument/unauthenticated/failed-precondition errors as appropriate. The callable `emulatorHealth` accepts only `{}`, takes UID from verified auth, and returns this probe result. It rejects non-demo/non-emulator execution; it never reads financial data or accepts a payload owner. App Check enforcement is disabled only when running inside the actual emulator; real-runtime settings enforce it.

- [ ] **Step 1: Write failing connector, Functions and baseline Rules tests.** Recording gateway order is initialize→auth→firestore→functions→storage; real/malformed config records no calls. Functions unit cases: valid authenticated demo, absent auth, non-emulator runtime, real project and an injected userId all rejected appropriately. Rules tests seed fixtures through the test admin context and assert unauthenticated/Alice/Bob clients cannot read/write any Firestore or Storage record under the deny-all baseline.
- [ ] **Step 2: Run the targeted tests before implementation.** Flutter connector test and Functions unit test fail for missing implementations. Baseline Rules runner must fail if rules/config files are absent; never treat missing configuration as a skipped success.
- [ ] **Step 3: Implement adapters and emulator harness.** Use `Firebase.initializeApp(demoProjectId: 'demo-tally')` through the official FlutterFire gateway and connect Auth/Firestore/Functions/Storage to validated endpoints. Functions use Node 22 runtime and strict TypeScript, a pinned compatible tooling/runtime installation, and no production credentials. firebase.json binds loopback, uses the declared five ports, and points to deny-all Rules and an empty actual-query index list. M1 replaces the baseline with tested owner rules; no financial query exists in M0 requiring a composite index.
- [ ] **Step 4: Run integration verification with real emulators.** Install local locked Firebase CLI/Rules SDK tooling. `npm run check:functions` passes. `npm run test:emulators` must invoke `firebase emulators:exec --project demo-tally --only auth,firestore,functions,storage` and run both Rules and bootstrap SDK tests. Bootstrap test creates a synthetic email/password identity in Auth, calls emulatorHealth with its token, verifies returned UID, and verifies Firestore/Storage private reads are permission-denied. Clear test data between cases. Record exact Node/Java/Firebase versions and any required runtime setup, not only the versions that happened to be preinstalled.
- [ ] **Step 5: Commit.** Message: `build: wire safe Firebase emulator development and baseline rules`.

### Task 9: Repeatable checks, real web preview and native verification path

**Files:** Create `tool/check.sh`, `.github/workflows/ci.yml`; update `docs/development.md` and README with exact status/run commands; add `test/app/startup_error_test.dart` if the error-view case is not already in bootstrap tests.

**Interfaces:** `tool/check.sh` exits nonzero on format/analyzer/Flutter/Functions/emulator failures. `npm run test:emulators` from Task 8 is the only emulator runner; CI and local scripts reuse it.

- [ ] **Step 1: Pin any missing startup-error widget assertion.** Unconfigured production startup shows a safe configuration error and a retry/recovery action, no sample financial totals, no raw SDK exception and zero SDK calls. Run this test and confirm it fails before adjusting the error view if needed.
- [ ] **Step 2: Implement local/CI checks.** Run `dart format --output=none --set-exit-if-changed lib test`, `flutter analyze`, `flutter test`, `npm run check:functions`, `npm run test:emulators`, `flutter build web --target lib/main_preview.dart --output=build/web-preview`, and `flutter build web --target lib/main_dev.dart --output=build/web-emulator`. CI pins Flutter 3.47.6, Node 22 and compatible Java, installs from lockfiles, and caches only regenerable dependencies.
- [ ] **Step 3: Verify the actual Flutter application in a browser.** Launch `flutter run -d web-server --web-hostname=127.0.0.1 --web-port=7357 --target lib/main_preview.dart`; use the available Chromium/browser tool to inspect desktop/tablet/mobile, navigation, More, Add, theme, currencies and errors. Exercise one hot reload/restart after the final source changes and confirm the running app reconnects. Repeat main_dev with emulators running and inspect that private data remains unavailable without authentication. Save review screenshots and a completion record outside product source.
- [ ] **Step 4: Verify native targets with honest evidence.** Set up an Android SDK in a user-owned path using official tools, then run an Android debug build and emulator/device smoke check; if the environment cannot supply a device, explicitly leave the M0 Android-run criterion open. Run iOS build/widget checks through the available macOS CI runner or leave that platform criterion pending with the exact command and required runner. A web build does not prove either native target. Do not mark the full M0 milestone complete with these checks outstanding.
- [ ] **Step 5: Review source and results, then commit the completion record.** Verify `git diff --check`, summarize actual test counts, version locks, screenshots and remaining platform checks. Native execution uses a fresh final reviewer as required by its execution skill. Message: `ci: verify Tally foundation and document development workflow`.

## Self-review and acceptance handoff

Coverage checked: Tasks 1/9 own SDK/targets/tooling; Tasks 2/3 own money/date/ID invariants; Tasks 4/8 own demo-only initialization and emulator harness; Tasks 5/6/7 own responsive shell/themes/Riverpod/router/sample UI; Tasks 8/9 own baseline Rules, tests and CI. Other MVP requirements remain explicitly assigned to M1–M8 rather than silently dropped or represented by empty interfaces.

All five Review Focus conditions have named assertions in their owning tasks. Shared interfaces use consistent constructors/provider names; preview fixtures never become canonical records. The safe startup contract is tested before the SDK adapter is written, and the baseline Rules deny all reads/writes until the authenticated milestone deliberately changes them.

Execution recommendation: **Native** execution in this session. These tasks share foundation interfaces and are sequential enough that one implementer is efficient; use the required independent final review before reporting the milestone complete. Subagent-driven execution is an available alternative if the user prefers an independent review after every task.

Plan status: approved by the user’s “go”; Native execution in progress. Task checkboxes track verified steps; actual evidence and rulings are in the execution ledger until the final completion record is written.
