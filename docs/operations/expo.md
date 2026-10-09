# Tally Expo application

Expo SDK 57 and TypeScript are the primary frontend in `apps/tally`. The existing Supabase command API, Postgres RLS, private Storage, Cron, and workers remain authoritative. Flutter and Firebase source are preserved as migration reference; root npm commands run Expo.

## Local development

Use Node 22.23.3 or a compatible newer Node release. Run `npm run install:app`, then `python3 tool/start_supabase_local.py`. In a separate terminal run `supabase functions serve`; `supabase/config.toml` disables gateway JWT verification because the API validates Auth and live server sessions itself. Use `npm run start:local` and open http://localhost:7384.

Local backend ports are 56321 (API), 56322 (database), and 56324 (Mailpit). This setup preserves existing local Tally data and does not access hosted financial data. Never reset this database to test the frontend. Integration tests create and remove their own identities.

For a static web test, run `python3 tool/build_expo_local.py` and serve `apps/tally/dist` with SPA fallback. Local exports contain an explicit local environment and are unsuitable for public deployment.

## Hosted web

Create a dedicated Supabase project for Tally. Apply committed migrations and deploy `tally-api` and `tally-worker` using the backend operations guide. Configure Cron/Vault, Auth email delivery, allowed redirects, and any enabled push provider. The currently connected project belongs to another application and must not be modified.

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the build environment; only public publishable keys belong in a client. Run `npm run build:web`. Deploy `apps/tally/dist` to a static host with SPA fallback. `_redirects` and `_headers` support hosts that honor those files; configure equivalent routing and headers on other hosts. Auth redirect allowlists must contain the web origin plus `/auth-callback` and `/reset-password`.

The production exporter clears Metro's cache and verifies that the JavaScript referenced by the exported HTML contains the configured backend origin and publishable key. This prevents a previous local export from silently reusing local backend configuration. `TALLY_EXPO_WEB_OUTPUT_DIRECTORY` can select a separate verification directory so a running local static test retains its own export.

The service worker caches only enumerated static application assets on its own origin. Supabase/Auth/Storage traffic never enters that cache. Private offline data remains separately scoped to the authenticated owner and backend environment in IndexedDB. A service worker update applies on a subsequent navigation after old tabs close.

### Vercel

The repository-root `vercel.json` installs the Expo application's locked dependencies, runs the guarded production exporter, publishes only `apps/tally/dist`, and configures SPA fallback and response headers. Keep the Vercel project root at the repository root. The connected Tally project is in the `code-box-studios` team; do not deploy into another project's scope. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for production only after verifying the dedicated Tally backend. Builds fail when those values are missing or point to a local backend.

The dedicated backend is now `iapbkynlipmmfgdvlbjo`, named `tally`, in the Code Box Studios Free organization and Singapore region. Both committed migrations and both Edge Functions are deployed. The API verifies Auth identity and live sessions; the worker requires its separate secret. `supabase/config.toml` explicitly supplies the pinned shared import map to both function deployments. The private attachment bucket, Cron schedule, and Vault worker configuration are installed. Database and worker credentials are kept in the desktop keyring and server Vault, never in this repository.

The Vercel project is `prj_02qrBbmOnZOtnl8DcQYwlWbtUpk7` in team `team_jV2p1SmzUWh1nQbHcxMCdFvT`. Its production public backend variables are configured, Node 22 is selected, and standard Vercel protection keeps preview and unique deployment URLs protected while permitting the production domain. Production publication remains pending Auth URL configuration and the `TALLY_JOB_SECRET` Edge Function secret. The current Supabase MCP OAuth grant can deploy schema and functions but cannot change Auth configuration or Edge Function secrets. A project-scoped token needs Auth, Project Settings, and Edge Function Secrets with read-write access for these setup steps; enter it through the local credential terminal and keep it out of chat and logs.

Deploy from `main` after the backend, Auth redirects, and production environment are ready. Confirm the deployment reaches `READY`, then verify the public production alias without a Vercel login: `/`, `/auth-callback`, and `/reset-password` must return the Expo application. The unauthenticated root displays the sign-in screen; there is no separate `/sign-in` route. Check that static JavaScript files and `/service-worker.js` return their expected content types and that private source files are not published. Test signup, email confirmation, onboarding, a partial payment, reload, and sign-out using an account created specifically for release verification.

Hosted release checks already verify password sessions, profile bootstrap, immutable partial payments, command replay, exact remaining balances, overpayment rejection, owner isolation, impersonation rejection, and revoked-session rejection using temporary synthetic identities. All those identities are removed afterward. These checks do not verify public signup email delivery: Supabase's default mailer restricts recipients and is unsuitable for a public launch. Configure dedicated SMTP and Google OAuth credentials before enabling general signup and Google sign-in. Free projects also require an operator-managed backup/export plan; no paid plan or add-on has been enabled.

## Native iPhone and Android

Link the app to its own EAS project, set its `projectId`, and configure public backend environment values for each EAS environment. Run `npx eas-cli@latest build --profile development --platform ios` or `--platform android` from `apps/tally`. Managed native projects are generated by Expo; do not edit the preserved root Flutter native projects. Development builds include `expo-dev-client`.

Use an iOS internal build on registered devices, or a production build through TestFlight/App Store. iOS signing and distribution require the owner's Apple developer credentials. Android preview builds can use an APK with `android.buildType: apk` in the preview profile; production uses an app bundle. No signed native artifact has been produced without those credentials.

Native OAuth/email callbacks use `io.codebox.tally://auth-callback` and `io.codebox.tally://reset-password`; add both to Supabase's redirect allowlist. Native session tokens use SecureStore, and financial caches and the outbox use SQLite. A physical phone needs a reachable backend URL; localhost on the phone refers to that phone. Local HTTP is permitted only in explicit development/local environments. Use HTTPS for distributed builds.

## Reminders and push

The server generates the canonical reminder schedule, including preferred civil dates, timezone, quiet hours, and enabled kinds. Native local alerts mirror those records, use generic lock-screen text, and cap scheduled alerts at 32. In-app reminders work on every platform. Web currently provides the in-app inbox; native delivery requires permission and a development/distribution build.

Configure APNs/FCM credentials in EAS, `EXPO_PUBLIC_EAS_PROJECT_ID`, and server `TALLY_EXPO_PUSH_ENABLED=true` before enabling native remote push. If Expo enhanced push security is enabled, store `TALLY_EXPO_ACCESS_TOKEN` only in server secrets. Tokens remain private and owner-bound; existing FCM registrations keep their transport. Expo acceptance tickets are polled for receipts after 15 minutes; acceptance is not proof of delivery. Invalid-token responses deactivate the exact generation, while temporary errors retain retry state.

## Financial and offline behavior

Amounts are bounded integer minor units, and currencies remain separate. Due dates are validated date-only strings; audit timestamps remain UTC instants. Server commands atomically create immutable payments and corrections, update derived balances, and record activity.

Offline payment/obligation commands preserve their original identifier and immutable payload in the trusted device outbox. Browser storage requires an explicit trust choice; native storage is private by default. Pending actions do not alter confirmed balances. Reloads restore pending actions, shared browser queues lease an action atomically, and reconnect retries use the same identifier. Rejections require review; only definitive server rejections can be discarded. Ambiguous successes must be resolved by retrying the original action in Saved actions. The original form blocks repeat submission, and unresolved uncertain responses block new financial commands. Finished device receipts retain the latest 200 entries; pending/review actions are never pruned and remain recoverable. Removing browser trust fences IndexedDB reads/writes inside transactions and signals other tabs; an unresolved action in any tab prevents destructive cache cleanup. New offline contacts cannot be selected for dependent obligations until their creation is acknowledged; saved actions make that dependency visible. Upload retry metadata is durable only on a trusted device; untrusted uploads keep retry identifiers in the current session and must finish before closing it.

Attachments remain online operations. Upload intents preserve reserve/upload identifiers without storing receipt bytes; reselecting the same file retries the same operation after connection loss. A completed upload can be verified by refreshing its metadata. Private downloads verify size and checksum before opening the system save/share flow. Sign-out and deletion block unresolved financial actions, and deletion persists its request identity until server acceptance and local cleanup are verified.

## Verification and dependency maintenance

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:components`, and `npx expo-doctor` from the app directory. Backend gates include SQL privilege/RLS tests, Deno domain tests, and real local Edge/Auth/Storage integration suites under `tool/test_supabase_*.py`. Web, iOS, and Android JavaScript exports verify each platform adapter; they do not replace physical-device QA or signing.

Pinned dependencies and lockfiles make builds reproducible. The query-string 7 import bridge permits the patched ESM decoder 0.5.0 under Expo Router 57; `postinstall` applies a bounded version-checked patch and tests validate normal and malformed decoding. Remaining upstream advisories affecting braces, node-forge, and sprintf-js have no published fix at the time of conversion. They are reached through development/build tooling rather than the exported financial UI. Do not expose Metro publicly or use untrusted glob/certificate input in that tooling; review the advisories before each release. Avoid forcing npm's suggested downgrade to an obsolete Expo SDK.
