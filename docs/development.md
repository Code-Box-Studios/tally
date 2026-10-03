# Tally development

The first Flutter foundation is implemented. Default launches are explicit sample previews; production configuration and financial writes are not implemented yet.

## Verified toolchain

| Component | Resolved version |
| --- | --- |
| Flutter stable | 3.47.6 |
| Dart | 3.13.5 |
| flutter_riverpod | 3.4.3 |
| go_router | 18.0.2 |
| firebase_core | 4.15.0 |
| firebase_auth | 6.7.0 |
| cloud_firestore | 6.10.0 |
| cloud_functions | 6.5.0 |
| firebase_storage | 13.6.0 |
| cupertino_icons | 2.0.0 |
| Node / npm | 22.23.3 / 10.9.9 |
| Firebase CLI | 15.32.1, local locked dev dependency |
| firebase-functions / firebase-admin | 7.4.0 / 14.5.0 |
| TypeScript | 7.0.2 |
| Java compiler | Temurin JDK 21.0.12.1 |

Application dependencies are locked in pubspec.lock. Android minimum is at least API 23, and iOS deployment target is 15.0. The temporary native application identifier is dev.tally.tally, pending release/provisioning decisions.

## Run the preview

```sh
flutter pub get --enforce-lockfile
flutter run -d chrome --target lib/main_preview.dart
```

For a browser-independent debug server:

```sh
flutter run -d web-server --web-hostname=127.0.0.1 --web-port=7357 --target lib/main_preview.dart
```

Open `http://127.0.0.1:7357`. Home uses clearly labeled October 2026 sample data. Other destinations have purposeful empty states; Add returns an action choice and does not save a financial record. Theme/currency preferences last for the session. Roboto is bundled with its license; the app does not request Google Fonts at runtime. Preview imports no active Firebase initialization path.

## Local Firebase development

Select Node 22 and a JDK with Java 21+ in your environment. Java's runtime alone is insufficient for native Android compilation; `javac` must be available. The local workspace tools live under `~/.local/share/tally-tools`; these paths are optional, not embedded in source:

```sh
export PATH="$HOME/.local/share/tally-tools/node22/bin:$PATH"
export JAVA_HOME="$HOME/.local/share/tally-tools/jdk21"
npm ci
npm --prefix functions ci
npm --prefix functions run build
npx --no-install firebase emulators:start --project demo-tally --only auth,firestore,functions,storage
```

In a separate terminal:

```sh
flutter run -d chrome --target lib/main_dev.dart
```

Ports: Auth 9099, Firestore 8080, Functions 5001, Storage 9199, UI 4000, all bound to loopback. `demo-tally` cannot access real Firebase resources. The emulator foundation has no sign-in UI or financial repository yet; its Home is empty rather than displaying preview records. The authenticated `emulatorHealth` callable accepts `{}` only, derives UID from verified Auth, rejects real runtimes/projects, and enables App Check enforcement outside the actual emulator.

Firestore and Storage **deny every read and write** in M0. M1/M6 replace that baseline with tested owner/attachment rules. No composite index is needed by the M0 UI; the planned queries/indexes are in the Firebase blueprint. Emulator Firestore persistence is disabled to avoid retained local fixtures. Production offline persistence/outbox behavior is a later milestone.

Android emulators reach the host through `10.0.2.2`:

```sh
flutter run -d emulator-5554 --target lib/main_dev.dart --dart-define=TALLY_EMULATOR_HOST=10.0.2.2
```

A physical phone needs its host's reachable LAN IP and emulator bindings/firewall configured for that LAN. `TALLY_EMULATOR_HOST` changes only the client; the checked-in Firebase config remains loopback. Preview runs without Firebase configuration on any target. Staging/production entry points show a safe configuration error until provisioning and App Check are deliberately implemented; they never fall back to another backend.

## Repeatable checks

Stop the development emulators first; the test runner starts isolated emulators on the same ports.

```sh
tool/check.sh
```

This fails on formatting, static analysis, Flutter tests, Functions compile/unit tests, emulator Rules/SDK integration tests, or either web build. Web outputs are separated into `build/web-preview` and `build/web-emulator`.

The supported Dart Chrome runner verifies exact financial primitives under JavaScript:

```sh
CHROME_EXECUTABLE=/path/to/chrome dart test --platform chrome test/core/money_test.dart test/core/money_formatter_test.dart test/core/local_date_test.dart test/core/entity_ids_test.dart
```

Flutter 3.47.6 deprecates its framework-oriented `flutter test --platform chrome` mode; Flutter UI is covered by VM widget tests plus actual browser smoke checks.

```sh
flutter build apk --debug --target lib/main_preview.dart
flutter build ios --debug --no-codesign --target lib/main_preview.dart
```

iOS commands require macOS, Xcode and CocoaPods. The committed CI workflow pins Flutter/Node/action commits, reuses the same check script, builds Android on Linux and builds iOS on macOS. CI has not run in this local workspace. Neither native device execution nor iOS build success is inferred from a web build.

## Dependency and release status

App/tooling lockfiles are committed. Tested transitive overrides remove resolved grpc-js, basic-ftp, OpenTelemetry and uuid advisories. The Functions package audit is clean. Firebase CLI still carries an unpatched `braces <=3.0.3` advisory through chokidar; use only trusted local paths/patterns and re-evaluate the CLI before release. Do not apply `npm audit fix --force` downgrades to the current Firebase SDK/tooling stack. This is development tooling, not an exposed deployed endpoint.

See [the verification record](quality/foundation-verification.md) for exact evidence, screenshots, independent-review results, decisions and pending platform/release checks. No Firebase projects have been provisioned or deployed.
