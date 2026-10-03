# Tally private accounts implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the launch application real email/Google sign-in, idempotent private account creation, editable onboarding defaults, and session-isolated access ready for financial features.

**Architecture:** Firebase Auth establishes identity. Trusted callable commands create/update owner profiles and deterministic category/preferences seeds transactionally. Riverpod owns a session controller and repositories; one stable go_router refresh bridge gates private routes. The existing preview remains available until the usable financial application passes release checks.

**Tech Stack:** Existing locked Flutter/Dart, Riverpod, go_router, FlutterFire, Cloud Functions v2 TypeScript, Firebase Emulator Suite; add the official firebase_app_check package.

**Spec:** `docs/superpowers/specs/2026-10-03-tally-design.md`, `docs/architecture/firebase.md`, `docs/architecture/flutter.md`, `docs/product/experience.md`. This implements M1 of `docs/roadmap.md`; M2–M8 remain required for the requested launch and follow as further increments.

## Global Constraints

- Work directly on `main`; do not create another branch or worktree (explicit user instruction and AGENTS.md).
- Canonical mutations use authenticated server commands; no Firebase calls in widgets and no direct client financial/profile writes.
- Private records use `users/{uid}` paths and server-derived `userId`; no unauthenticated or cross-user access.
- Money is integer minor units; currencies never combine. Civil dates retain date-only semantics.
- PHP and Asia/Manila are editable defaults; theme supports light/dark/system.
- Production requires App Check; emulator bypass is allowed only for an actual Functions emulator using a `demo-` project.
- Development/tests use `demo-tally`, never production data.
- Firebase project is `tally-codebox-preview`; backend deployment requires the user's Blaze billing setup. Do not enable billing automatically.
- No production database is created before the user confirms its immutable region. Proposed region is `asia-southeast1`.
- Web launch is already authorized. Preserve the sample deployment until real records are usable and verified; authentication alone is not launch completion.
- Visual authority is the original Lavish design in `.lavish/tally-design.html`, `.lavish/tally-design.css`, and `.lavish/tally-design.js`, reaffirmed by the user. Carry its typography, palette, branding, spacing and layouts into Flutter throughout the remaining milestones.

## Review Focus

1. An old owner's asynchronous bootstrap completes after logout/account switching: neither routes nor profile expose that owner. Task 2 pins this with a delayed-Alice/ready-Bob test.
2. An account marked deleting tries to bootstrap: no resurrection or category replacement. Task 1 exercises an emulator fixture.
3. Repeated or concurrent bootstrap cannot reset edited defaults or duplicate seeds. Task 1 races two requests and calls again after onboarding.
4. Login redirects must preserve a permitted private deep link without creating an open redirect or retaining another user's navigation. Task 3 tests a private URL and external return URL.
5. A stale profile update must not silently overwrite another device's settings; unknown fields and invalid timezone/currency fail. Task 1 tests revisions and validation.

## File responsibilities

- `functions/src/accounts/profile.ts`: bounded profile payload validation, active-account transaction, deterministic defaults and onboarding updates.
- `functions/src/shared/callable.ts`: authenticated/App Check/emulator boundary and safe errors reused by later command modules.
- `functions/src/index.ts`: Firebase exports only; use `asia-southeast1` for account/financial functions.
- `firestore.rules`: owner read allowlist and explicit query limits; all client writes denied.
- `firebase/emulator-tests/accounts.test.mjs`, `firebase/rules-tests/ownership.test.mjs`: actual auth/callable/rules behavior.
- `lib/features/auth/domain/{auth_repository,user_profile,session_state}.dart`: SDK-free account/session contracts.
- `lib/features/auth/data/{firebase_auth_repository,firebase_profile_repository}.dart`: SDK adapters and validated DTO mapping.
- `lib/features/auth/presentation/{session_controller,auth_providers,auth_screen,startup_screen,onboarding_screen}.dart`: session lifecycle and account flows.
- `lib/core/firebase/{firebase_providers,production_initializer}.dart`: initialized clients and App Check, no eager SDK access before bootstrap.
- `lib/core/config/environment.dart`: validated real project/options configuration while preserving fail-closed demo protection.
- `lib/app/{bootstrap,app_router}.dart`: publish initialized adapters and route refresh/redirect, no Firebase calls.
- `lib/features/settings/presentation/settings_screen.dart`: authenticated account/preferences/logout actions through controller.
- `test/features/auth/`: domain/controller/widget/account switch tests.
- `test/app/auth_navigation_test.dart`, `test/core/config/environment_test.dart`: routing and configuration boundaries.

### Task 1: Trusted profile commands and owner read rules

**Interfaces:** Consumes Firebase Admin Auth identity and Firestore transactions. Produces `bootstrapUser({}) -> {profile}` and `updateProfile({commandId:string,expectedRevision:int,defaultCurrency:string,timezone:string,themeMode:string,onboardingComplete:bool}) -> {profile}`. Profile has userId, displayName, photoUrl, currency, IANA timezone, locale, themeMode, onboardingComplete, accountStatus, revision, schemaVersion, createdAt/updatedAt server timestamps. New profiles revision 1; updates increment. Bootstrap preserves an existing active profile and initializes only absent profiles. Default categories/preferences seed once, with deterministic IDs. Preference commands persist an owner-local payload hash/result receipt atomically; exact retries return the original result and changed-payload command ID reuse rejects.

- [ ] Write profile-validation unit tests and emulator tests: unauthenticated rejection; Alice/Bob isolation; two concurrent bootstraps; defaults PHP/Asia/Manila/system; revised defaults survive repeated bootstrap; deleting account cannot bootstrap; unknown fields and invalid timezone/currency/revision reject; stale revision rejects atomically; retry receipt returns original result and changed-payload ID reuse rejects.
- [ ] Run `npm --prefix functions run check` then `npm run test:emulators` with Node 22/JDK 21. Expected: new callable/owner-read tests FAIL because functions/rules are absent; existing deny-all expectations will be revised only for seeded active owners.
- [ ] Implement `bootstrapProfile(uid:string,identity:{displayName:string|null,photoUrl:string|null},db:Firestore):Promise<ProfileDocument>` and `updateProfile(uid:string,input:unknown,db:Firestore):Promise<ProfileDocument>` in profile.ts. Validate exact schema before transactions, use Admin SDK server timestamps, preserve active/deleting fences. Export wrapped callables enforcing App Check outside verified demo emulators.
- [ ] Replace deny-all Firestore baseline with active-owner profile gets and allowlisted collection gets/lists (limit <=200), deny all writes and private/system collections. Test unauthenticated, cross-user, unbounded query, forged owner, inactive profile, and direct writes.
- [ ] Run complete Functions and emulator suites. Expected: all pass, no financial writes enabled.
- [ ] Commit `feat: add trusted account bootstrap and owner read rules`.

### Task 2: Auth repositories and session lifecycle

**Interfaces:** Produces `AuthIdentity(uid:String,displayName:String?)`; `AuthRepository.watchIdentity() -> Stream<AuthIdentity?>`, signInWithEmail, createAccount, signInWithGoogle, resetPassword, signOut; `ProfileRepository.bootstrap() -> Future<UserProfile>`, `watchProfile(uid) -> Stream<UserProfile>`, `update(UserProfilePreferences,expectedRevision) -> Future<UserProfile>`. Session states initializing, signedOut, bootstrappingProfile, needsOnboarding, ready, failure. `SessionController` listens to identity, cancels previous profile stream, uses generation fences on async results, and exposes `retry()`/`signOut()`. Preview bypass remains explicit and does not touch Firebase.

- [ ] Write meaningful session tests using controllable repositories: auth hydration before redirect, profile onboarding/ready, bootstrap failure/retry, account switching, stale bootstrap result suppression, profile listener disposal, sign-out failure stays authenticated; DTO tests reject mismatched owner/unknown enum/timezone.
- [ ] Run `flutter test test/features/auth`. Expected: FAIL because new account/session contracts are absent.
- [ ] Implement immutable SDK-free models and controller. Firebase adapters translate SDK errors into safe typed failures, use email/password and Google provider popup on web/native Firebase provider flow; neutral password-reset confirmation. Profile watches use owner get/stream only after bootstrap and apply revisioned commands. Expose dependencies through initialized clients and Riverpod; disposal clears the owner session.
- [ ] Run `flutter test` and `flutter analyze`. Expected: all pass, no auth dependencies in domain/UI widgets.
- [ ] Commit `feat: add isolated authentication and profile sessions`.

### Task 3: Protected routes and usable sign-in/onboarding

**Interfaces:** Consumes SessionController/UserProfile from Task 2. Extends `createAppRouter` with optional session gate/refresh Listenable while retaining existing preview tests. Produces `/startup`, `/sign-in`, `/onboarding` routes, stable refresh bridge, safe internal return URL, and six private shell destinations. Screens invoke controllers/repositories through providers.

- [ ] Write widget/router tests: signed-out private URL redirects; successful sign-in restores allowed deep link; external return URL ignored; onboarding currency/timezone selection/save; neutral reset text; provider errors display safe messages; busy submit cannot duplicate calls; keyboard/short phone/200% text layout; sign-out routes out of the shell and removes account details.
- [ ] Run `flutter test test/features/auth test/app/auth_navigation_test.dart`. Expected: FAIL because protected account screens/redirects are absent.
- [ ] Build small responsive auth/startup/onboarding screens with Tally branding, email/password sign-in/create switch, Google button, reset flow, loading/error/retry, editable seven supported currencies and validated IANA timezone defaults. Implement stable go_router gate and persist appearance through profile commands. Settings shows account, saved defaults, sign-out. Fix the existing More sheet short-screen overflow if encountered in these checks.
- [ ] Run complete Flutter suite/analyzer and actual emulator browser flow: create account -> onboarding -> home -> logout -> second account. Expected: no cross-user state or console/layout errors, routes stable on preference edits.
- [ ] Commit `feat: add private sign-in onboarding and account settings`.

### Task 4: Real environment configuration and M1 verification

**Interfaces:** Consumes initialized Firebase clients/repositories. Produces `EnvironmentConfig.firebase(mode,options,region,appCheckSiteKey)` validated against explicit environment/project binding, `ProductionInitializer` initializing Firebase then official App Check before exposing clients, and real `main_prod.dart`/`main_staging.dart` entrypoints with external JSON build defines. Preview/emulator retain separate behavior.

- [ ] Write tests: configured production accepted; missing/mismatched project/options/key rejected; real initializer runs before clients exposed; emulator never accepts real project; initializer failure cannot fall back to preview or another environment.
- [ ] Run targeted environment/bootstrap tests. Expected: FAIL for real configuration acceptance and SDK initializer routing.
- [ ] Add firebase_app_check at a compatible locked version. Real initialization uses reCAPTCHA Enterprise on web, Play Integrity on Android, App Attest with supported fallback on Apple; no release debug bypass. Register web app and save only non-secret public SDK configuration in environment JSON once provisioned. Configure real Auth email/Google providers and authorized hosted domains through supported Firebase tools. Hold Firestore region provisioning pending the user's answer; hold Functions deployment pending Blaze.
- [ ] Run `flutter analyze`, `flutter test`, Functions/emulator tests, release preview/emulator/production builds with explicit configs. Expected: green automated checks and production build fails safely without required configuration.
- [ ] Record M1 verification and remaining launch milestones in `docs/quality/private-accounts-verification.md`. Do one fresh review of the complete M1 change using executing-plans review workflow, fix important findings with regression tests, commit all completed changes.
- [ ] Continue to M2 financial records plan and implementation; do not call authentication-only deployment the requested launch.
