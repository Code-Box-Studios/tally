# Tally foundation verification

Verified locally on 2026-10-03 on Linux. This is the first runnable foundation increment; the full MVP and full M0 platform acceptance remain open.

## Delivered

Flutter Android/iOS/web targets, feature-first layers, Riverpod state, six go_router destinations, phone/rail/sidebar layouts, Material 3 light/dark/system themes, an explicitly synthetic dashboard, and an Add action chooser. Money uses exact minor units, validated civil dates never serialize as audit timestamps, and entity IDs stay distinct. Real financial writes, authentication UI, recurrence, reminder delivery and attachments belong to later increments.

Preview performs no backend initialization. Development connects four Firebase services to validated demo-only endpoints before exposing SDK clients. Staging/production fail safely without configuration. Firestore and Storage deny all requests in this increment. The local-only health callable verifies Auth ownership and refuses payload owners or real runtime/project execution.

## Automated evidence

| Check | Result |
| --- | --- |
| Dart formatting and Flutter analysis | Clean |
| Flutter unit/provider/widget tests | 98 passed |
| Pure Dart Chrome domain tests | 59 passed across money, formatting, civil dates and typed IDs |
| Functions TypeScript compile and unit tests | 8 passed |
| Actual Auth/Firestore/Functions/Storage emulator suite | 4 passed; no skips |
| Preview web build | Passed, `build/web-preview` |
| Emulator web build | Passed, `build/web-emulator` |
| Android debug APK | Passed, `build/app/outputs/flutter-apk/app-debug.apk` |
| Functions dependency audit | 0 vulnerabilities |

The single `tool/check.sh` run passed all its stages with Node 22.23.3, npm 10.9.9, Flutter 3.47.6, Dart 3.13.5 and JDK 21.0.12.1. The Firebase CLI is locked to 15.32.1, Functions to 7.4.0/Admin 14.5.0 and TypeScript to 7.0.2. SDK/platform targets and dependency locks are in source. Android compile used API 36, minimum API 23 and NDK 28.2.13676358; generated plugins retain legacy Kotlin warnings. Tooling downloads were verified against official SHA-256 metadata.

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

Pending fresh whole-branch review; findings and verified fixes will be recorded here before handoff.

## Implementation rulings

- Ruling: "go" approves the reviewed Native plan, including branch/worktree setup — create an isolated local worktree without repeating authorization — cost if wrong: reversible extra local branch/directory.
- Ruling: Existing untracked .gitignore contains graft's ignore rule — preserve it and add only necessary local workspace/design exclusions — cost if wrong: generated preview artifacts may need explicit force-add later.
- Task 1: Ruling: The resolved Flutter/go_router UI stack references Cupertino icons but the empty template omits their font — include official cupertino_icons after reproducing the build warning and reading its dependency documentation — cost if wrong: extra tree-shaken font assets.
- Task 2: Ruling: Flutter 3.47.6 labels --platform chrome deprecated; its framework browser harness stalled before tests/engine initialization despite loaded local scripts — use package:test and dart test --platform chrome for pure domain JS verification, retain Flutter widget/app browser checks — cost if wrong: core runner would miss Flutter-engine-specific behavior, covered separately in Task 9.
- Ruling: Keep local CLI inputs trusted while its unpatched braces advisory remains — latest CLI depends on chokidar 3/braces 3 and forcing a breaking watcher replacement is unverified — cost if wrong: local development tooling remains vulnerable to hostile nested glob patterns; release must recheck.
- Ruling: Pin compatible transitive fixes for grpc/basic-ftp/OpenTelemetry and uuid — resolved official dependencies retain published advisories; same public APIs pass emulator checks — cost if wrong: compatibility regressions in unused CLI features, covered only when exercised.
