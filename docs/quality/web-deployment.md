# Firebase Hosting web preview

Published and verified on 2026-10-03.

- Live app: https://tally-codebox-preview.web.app
- Firebase project: `tally-codebox-preview` (Tally Preview).
- Project alias: `preview`; no default production project is configured.
- Hosting deployment source: commit `3fdd50e` on `main`.
- Deployment command: `firebase deploy --only hosting --project preview --non-interactive`.
- Firebase CLI: 15.32.1; Node: 22.23.3; Flutter: 3.47.6.

The account's existing `test-eab59` project was left unchanged. This separate project hosts the current sample-data foundation. Sign-in inside Tally, personal financial records and payment persistence are still future increments. CLI authentication authorizes deployment; it does not add application authentication.

## Build and publication

`tool/build_web_preview.mjs` builds `lib/main_preview.dart` in release mode with `--no-web-resources-cdn`. The Hosting predeploy hook runs that same build and checks the required HTML, JavaScript, font manifest, three Roboto fonts, font license and CanvasKit WASM files before uploading.

The initial release output was missing its asset files despite Flutter reporting a successful build. Recreating only the generated web output restored the bundle. The repeatable helper now clears that directory before building and validates the output afterward. Native build artifacts are preserved.

Firebase uploaded 43 public files from `build/web-preview` and reported that the version was finalized and released successfully. Source files, local credentials and emulator data are outside the published directory. Routing and revalidation headers follow the [Firebase Hosting configuration](https://firebase.google.com/docs/hosting/full-config).

## Verification

The Hosting emulator at `127.0.0.1:5000` and the public HTTPS deployment both passed checks for:

- Root HTML and SPA fallback at `/settings`.
- Flutter bootstrap JavaScript.
- Roboto regular font, matching the exact local build bytes.
- CanvasKit WASM, matching the exact local build bytes and served as `application/wasm`.
- `Cache-Control` revalidation and `X-Content-Type-Options: nosniff` headers.

An actual Chromium browser rendered Home with the Sample data label and expected PHP balances, then navigated to Settings. No console errors were found. All seven observed fetch requests succeeded; the three Roboto fonts and Chromium CanvasKit renderer loaded from the deployed origin.

The live URL was also opened in the user's Zen browser. Existing foundation unit/provider/widget, Chrome domain and backend test results remain in the [foundation verification](foundation-verification.md); these hosting changes did not modify application or financial domain code.

## Earlier hosting setup

Before Firebase authentication was available, an unused Vercel project named `tally` was created under Code Box Studios. Its Git integration was disconnected, so pushes to `main` do not trigger Vercel deployments. It was retained rather than deleting a remote resource without a request. Firebase Hosting is the deployment provider for this release.
