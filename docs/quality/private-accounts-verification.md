# Tally private accounts verification — 2026-10-03

M1 adds real account/profile flows to the foundation. This is an intermediate milestone: borrowing/lending, immutable payments, recurrence, reminders, private uploads and offline submission remain subsequent launch work. The public deployment is still the original sample preview until the usable financial release is verified.

## Implemented behavior

Email/password account creation/sign-in, Google sign-in through the official web popup/native credential adapters, password reset, startup recovery and sign-out. Trusted callable commands bootstrap a private profile, fourteen categories and notification/ledger defaults once. Preference updates validate ownership, revision, currency and IANA timezone and commit idempotent receipts atomically. An account-deletion fence prevents profile resurrection. Owner read rules deny unauthorized, cross-user, unbounded and direct-write requests.

One session controller fences delayed bootstrap/profile work; the stable router gates private URLs until sign-in/onboarding. UID-scoped workspace providers reset on account switching. Onboarding/settings persist currency, timezone and light/dark/system preferences. Auth screens use the original Lavish typography, palette and Tally mark; the complete financial screen/shell translation is part of subsequent milestones.

## Evidence

- Flutter analyzer: no issues.
- Flutter tests: 136 passed; new real-environment and initialization-order cases observed RED then GREEN.
- Functions TypeScript build/unit checks: 20 passed.
- Actual Firebase Emulator Suite rules/callable tests: 9 passed against demo-tally. These exercise repeated/concurrent bootstrap, ownership, revision conflicts, receipt replay, deletion fencing and direct-write denials.
- Public web configuration/build guard tests: 3 passed; absent configuration exits before Flutter build.
- Browser emulator flow: Alice created account, selected USD/America/New_York, saved onboarding, reloaded settings and signed out; Bob created a separate account with PHP/Asia/Manila defaults. Emulator Admin reads verified separate profiles and fourteen categories each. No browser console errors.
- Auth/onboarding tested at 320px width and 200% text with a keyboard; mobile More sheet tested at 568×320 and 200% text.

Release build results are recorded after their commands finish below. Live Google popup, App Check attestation and deployed callable integration are release gates; local/emulator evidence does not replace them. Native Google OAuth/signing and iOS services require actual platform release configuration/device checks.

## Live Firebase setup

Project: tally-codebox-preview. Registered Tally Web app: 1:82554419373:web:446dcceb8c439c34f4ee24. Official Firebase Auth provisioning enabled email/password and Google; a subsequent API read confirmed both enabled and authorized domains tally-codebox-preview.firebaseapp.com and tally-codebox-preview.web.app. The provisioning API adds its default redirect URI; explicitly repeating it was rejected, so firebase.json relies on those defaults.

Created a production reCAPTCHA Enterprise SCORE key limited to the two hosted domains and configured the web App Check provider, minimum score 0.5, token TTL one hour. The installed CLI exposes App Check administration under FIREBASE_CLI_EXPERIMENTS=appcheckadmin; it calls the supported App Check v1 API. No debug provider/token is included in release code. Firestore/Storage enforcement will be configured and verified with their deployed services before launch.

Billing remains disabled at the last live project check. Firestore database creation is held pending the user's answer about the immutable region; Functions deployment is held pending the user's Blaze setup. No production financial fixtures have been written. Backend development/tests use demo-tally.

## Environment build setup

Copy config/web.example.json to an ignored config/production.web.local.json and fill public SDK/app/key fields. No credentials, service-account keys or private secrets belong in this file: it is compiled into the public client. The current machine has its provisioned configuration in that ignored local file.

Run with Node 22:

```sh
TALLY_WEB_CONFIG=config/production.web.local.json node tool/build_web_production.mjs
```

The helper requires every field, rejects unexpected/secret-bearing fields, validates production/project/web app/sender/domain/bucket binding and verifies bundled DM Sans/Manrope/CanvasKit assets. Staging uses TALLY_BUILD_ENVIRONMENT=staging and a separate staging configuration/project. Production/staging entrypoints initialize Firebase, activate official App Check and only then publish clients. Missing configuration or startup failures expose safe recovery, never sample data or another environment. Persistent financial SDK caches remain disabled until the owner-bound offline lifecycle is implemented.

Development web emulator URL must use localhost. The installed firebase_auth_web restores its saved emulator binding only on that hostname; bootstrapping rejects unsupported web emulator origins before SDK initialization to prevent an accidental live Auth request with demo configuration. Native emulator endpoints remain configurable.

## Rulings recorded during implementation

1. Native Google uses google_sign_in credential exchange as required by FlutterFire docs. If this adapter is wrong, native Google login fails; platform OAuth configuration remains a device release check.
2. Preference commands carry expectedOwnerUid as a session assertion; Auth remains the ownership authority. Without the fence a delayed command could change another account's preferences.
3. Emulator client publication/callable region moved into route wiring so actual sign-in could run. Delaying it would leave sign-in unusable.
4. Auth gating replaces public emulator navigation and missing clients fail at bootstrap; obsolete foundation test expectations were updated. Retaining the old behavior would expose private navigation/provider errors.
5. Emulator web is localhost-only due to the verified installed SDK restoration behavior. This limits web emulator access; native and production hosted origins are unaffected.

6. Web emulator startup also requires debug mode: the installed Auth restoration guard checks kDebugMode as well as localhost. Release/profile web emulator builds fail before SDK initialization; debug web, native emulator and real hosted production builds remain supported. Allowing release web emulator startup would risk an accidental live Auth call on reload. Regression observed RED→GREEN.

## Next launch milestones

M2: debts/receivables, contacts, sources/categories, payment ledger and traceable corrections. M3: installments, currency-separated dashboard, histories/contact positions/activity. M4: instance-based recurring/variable dues and server automatic/confirmation/failure jobs. M5: calendar/search/reminder inbox and push/local adapters. M6: private attachments and durable owner-bound offline outbox. M7/M8: responsive visual parity, account cleanup, operational/native/live backend gates and authorized web launch.


Production and preview release web builds passed with bundled assets. The emulator web target is compiled for release verification but intentionally rejects browser startup in release/profile mode for the SDK reason above; use debug `flutter run` for actual web emulator development.
