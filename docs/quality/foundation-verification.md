# Tally foundation verification

Verified locally on 2026-10-03 on Linux. This is the first runnable foundation increment; the full MVP and full M0 platform acceptance remain open. The subsequent public web preview is recorded in [Firebase Hosting deployment verification](web-deployment.md).

## Delivered

Flutter Android/iOS/web targets, feature-first layers, Riverpod state, six go_router destinations, phone/rail/sidebar layouts, Material 3 light/dark/system themes, an explicitly synthetic dashboard, and an Add action chooser. Money uses exact minor units, validated civil dates never serialize as audit timestamps, and entity IDs stay distinct. Real financial writes, authentication UI, recurrence, reminder delivery and attachments belong to later increments.

Preview performs no backend initialization. Development connects four Firebase services to validated demo-only endpoints before exposing SDK clients. Staging/production fail safely without configuration. Firestore and Storage deny all requests in this increment. The local-only health callable verifies Auth ownership and refuses payload owners or real runtime/project execution.

## Automated evidence

| Check | Result |
| --- | --- |
| Dart formatting and Flutter analysis | Clean |
| Flutter unit/provider/widget tests | 100 passed |
| Pure Dart Chrome domain tests | 59 passed across money, formatting, civil dates and typed IDs |
| Functions TypeScript compile and unit tests | 8 passed |
| Actual Auth/Firestore/Functions/Storage emulator suite | 4 passed; no skips |
| Preview web build | Passed, `build/web-preview` |
| Emulator web build | Passed, `build/web-emulator` |
| Android debug APK | Passed, `build/app/outputs/flutter-apk/app-debug.apk` |
| Functions dependency audit | 0 vulnerabilities |

The final `tool/check.sh` run passed all its stages with Node 22.23.3, npm 10.9.9, Flutter 3.47.6, Dart 3.13.5 and JDK 21.0.12.1. The Firebase CLI is locked to 15.32.1, Functions to 7.4.0/Admin 14.5.0 and TypeScript to 7.0.2. SDK/platform targets and dependency locks are in source. Android compile used API 36, minimum API 23 and NDK 28.2.13676358; generated plugins retain legacy Kotlin warnings. Tooling downloads were verified against official SHA-256 metadata.

The Flutter suite includes partial/full/multiple-payment arithmetic, malformed and excessive precision input, safe integer overflow, currency separation, Gregorian leap/boundary dates, invalid IDs/configurations, no SDK calls for invalid modes, safe startup/retry errors, theme/router state, direct routes/pop/filter recovery, and narrow layouts at 200% text scale. Canonical overpayment, recurrence, failed deductions and offline command tests are scheduled with their owning implementation milestones, not falsely represented by fixture tests.

## Browser checks and screenshots

Actual debug Flutter web app inspected at desktop 1440 px, tablet 800 px and mobile 390 px. Tested navigation, Add chooser, More, themes, currency separation and safe emulator Home. Hot restart reconnected the running app. Screenshots are standalone review artifacts, outside product source:

- [Desktop light](../assets/flutter-desktop-light.png)
- [Desktop dark](../assets/flutter-desktop-dark.png)
- [Mobile light](../assets/flutter-mobile-light.png)
- [Mobile dark](../assets/flutter-mobile-dark.png)

## Pending platform/release gates

Android device execution remains pending: the official headless Android Emulator exited with SIGSEGV (139) before ADB exposed a device, with API 36 SwiftShader, API 36 GPU-off and API 35 software-renderer attempts. KVM was available. A debug APK build passed, but that is not a successful device smoke test. Retry on a physical Android phone or a working emulator with `flutter run -d <device> --target lib/main_preview.dart`; then test `main_dev.dart` with `TALLY_EMULATOR_HOST=10.0.2.2` on an emulator.

iOS build/run remains pending because this workspace has no macOS runner. The committed `ios-build` CI job invokes `flutter test` and `flutter build ios --debug --no-codesign --target lib/main_preview.dart` on macOS. No remote CI run, signing, release app identity or deployment is claimed.

The development-only Firebase CLI audit retains the unpatched braces/chokidar advisory (three reported nodes for one advisory path). Use trusted local glob/path inputs. Functions runtime audit is clean after tested transitive overrides. Re-evaluate before release; do not force a Firebase SDK downgrade or untested watcher replacement.

## Independent review

A [fresh whole-branch review](foundation-review.md) used GPT-6 Astra, read-only on the checkout. It found no Critical issues and one Important issue: error recovery was below the viewport on a 320×568 phone at 200% text. Two new tests reproduced startup/dashboard overflows, then passed after the shared error panel became scrollable; both tests actually scroll to and activate Retry. The full Flutter suite then passed 100 tests. No second review was dispatched.

The reviewer’s Minor finding is deferred: compact More sheet has 12 px bottom spacing overflow at 568×320 and 200% text. Neither destination was shown to be inaccessible at that size. The review’s scope exclusions were explicitly ruled on below, rather than silently discarded.

Browser network inspection also found Flutter’s default Roboto fetch from Google Fonts. Official Apache-licensed Roboto regular/medium/bold are now bundled and registered locally to satisfy the approved typography requirement. The fresh page fetched its three Roboto font files from local app assets and made no Google Fonts request. Final preview/emulator web builds and the Android debug APK were rebuilt successfully after the fix. Flutter’s CanvasKit renderer resource still uses the framework CDN in this development configuration; full offline web packaging remains a later gate.

## Implementation rulings

- Ruling: "go" approves the reviewed Native plan, including branch/worktree setup — create an isolated local worktree without repeating authorization — cost if wrong: reversible extra local branch/directory.
- Ruling: Existing untracked .gitignore contains graft's ignore rule — preserve it and add only necessary local workspace/design exclusions — cost if wrong: generated preview artifacts may need explicit force-add later.
- Task 1: Ruling: The resolved Flutter/go_router UI stack references Cupertino icons but the empty template omits their font — include official cupertino_icons after reproducing the build warning and reading its dependency documentation — cost if wrong: extra tree-shaken font assets.
- Task 2: Ruling: Flutter 3.47.6 labels --platform chrome deprecated; its framework browser harness stalled before tests/engine initialization despite loaded local scripts — use package:test and dart test --platform chrome for pure domain JS verification, retain Flutter widget/app browser checks — cost if wrong: core runner would miss Flutter-engine-specific behavior, covered separately in Task 9.
- Ruling: Keep local CLI inputs trusted while its unpatched braces advisory remains — latest CLI depends on chokidar 3/braces 3 and forcing a breaking watcher replacement is unverified — cost if wrong: local development tooling remains vulnerable to hostile nested glob patterns; release must recheck.
- Ruling: Pin compatible transitive fixes for grpc/basic-ftp/OpenTelemetry and uuid — resolved official dependencies retain published advisories; same public APIs pass emulator checks — cost if wrong: compatibility regressions in unused CLI features, covered only when exercised.
- Final: Ruling: Bundle Roboto after actual browser inspection found Flutter default fetching Google Fonts — fulfill Task 5 local typography requirement with licensed official assets and verify fresh-page network behavior — cost if wrong: approximately 1.5 MB additional font payload before compression.
- Final: Ruling: Authentication/onboarding/profiles remain M1 — explicit approved scope — cost if wrong: no sign-in or personalized records yet.
- Final: Ruling: Permitted owner reads/writes remain M1 — deny-all is this increment’s tested baseline — cost if wrong: authenticated financial usage remains unavailable.
- Final: Ruling: Add returns intent; forms/persistence follow — approved chooser-only scope — cost if wrong: nothing can be saved yet.
- Final: Ruling: Canonical payments/overpayments/reversals/reconciliation follow M2 — current Money tests verify arithmetic only — cost if wrong: no traceable financial history yet.
- Final: Ruling: Installments/recurrence/deduction execution/timezone scheduling follow M3/M4 — first increment has projections only — cost if wrong: no actual scheduled financial events yet.
- Final: Ruling: Live calendar/activity/contact/dashboard repositories follow — approved sample/empty states — cost if wrong: records are illustrative, not personal.
- Final: Ruling: Synthetic totals need no canonical ledger reconciliation now — pinned sample fixture contract — cost if wrong: users must heed Sample data label.
- Final: Ruling: Month navigation/date labels stay October 2026 for preview — explicit fixed-period preview — cost if wrong: sample becomes stale after October.
- Final: Ruling: Theme/currency preferences last only for session — documented foundation behavior — cost if wrong: choices reset on relaunch.
- Final: Ruling: Offline outbox/notifications/attachments/account deletion follow — assigned later roadmap milestones — cost if wrong: no delivery/offline persistence/file handling yet.
- Final: Ruling: Real provisioning/credentials/App Check attestation/deploy/release follow — prod/staging deliberately fail closed — cost if wrong: no production service yet.
- Final: Ruling: Android device acceptance and iOS validation remain pending — emulator SIGSEGV and no macOS runner; build evidence is separate — cost if wrong: unverified native runtime/platform failures can remain.
- Final: Ruling: Signing/final identity/scaffold icons remain release work — local scaffold is not a store release — cost if wrong: branding/provisioning must be completed before publishing.
- Final: Ruling: Broader CI browser automation follows — VM tests and actual browser/domain evidence cover this increment — cost if wrong: future browser regressions need explicit browser runs.
- Final: Ruling: LAN host setup remains manual; IPv6 unsupported — loopback baseline and explicit host override are documented — cost if wrong: physical devices need setup; IPv6-only hosts fail validation.
- Final: Ruling: Unused overridden CLI commands remain unverified — only emulator/build commands are required and tested here — cost if wrong: those commands could have compatibility regressions.
