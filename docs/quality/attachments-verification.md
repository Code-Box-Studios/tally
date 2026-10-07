# Private file verification

Tally links files to the exact obligation, billing period or immutable payment.
Opening a file section starts its bounded metadata subscription. Closed sections
keep large payment histories from opening a subscription for every receipt.
Cached records remain labelled; uploading, checking, ready, rejected and removed
states use words and icons. A failed receipt never changes an accepted payment.

## Automated evidence

Dart contracts cover strict ownership/targets, immutable retries, verified
size/checksum, bounded cancellation and owner disposal. Widget scenarios cover
accepted payment followed by failed receipt, original-target retry, stopping a
retry without deleting history, pagination/cache truth, removal tombstones,
late previews and decoded-image cache eviction. They exercise 320/375/800/1440
widths, both themes, 200% text and keyboard expansion. File activity explicitly
carries no monetary value and maps the actual server's omitted monetary keys.

Actual Chrome tests verify local Blob bytes/revocation, the file-selector's
source Blob cleanup on completion and late owner callbacks, and the protected private
reader's callable identity/size limits/owner-disposal fences. Contract network doubles are
identified as doubles; the end-to-end flow uses genuine emulator transport.
The complete fresh gate and final review results are recorded in the plan ledger.
Focused protected transport checks passed 5 Dart contracts and 24 actual Emulator
cases, including a 10 MiB response and owner/removal fences after each network
boundary. The final browser flow confirmed an actual downloadAttachment request,
no bearer URL, matching exported SHA-256, revoked local URL, token absence after
preview/export, a preserved removal tombstone and all three file activity labels.
The second account could neither reserve against nor read the original target.
That fresh runtime reported no Dart errors or unhandled browser rejections.

## Real browser and emulators

[The guarded browser tool](../../tool/test_browser_attachments.mjs) uses only a
localhost debug app and `demo-tally`. It creates a disposable account and an
obligation, records 300 PHP against 1000 PHP through the payment form, selects a
[synthetic local PNG fixture](../../test/fixtures/attachments/qa-receipt.png) through Chrome's native file chooser, processes the server
worker and verifies a private preview. Explicit export bytes must match the
server SHA-256 and the local export URL must revoke. Removal preserves a
tombstone and activity history. A second owner's original-target command/read
must be denied with no private file shown. Emulator outputs must not be deployed.

The first actual browser run found that installed FlutterFire web `getData`
requests metadata and a download URL internally. This regenerated a managed
bearer token despite token-free ingestion. A second actual browser run showed that even an authenticated Firebase media
HTTP request mints a managed token. All platforms now use the protected
downloadAttachment callable and bounded Admin Cloud Storage reads. Direct
client Storage access is denied; no metadata or public URL helper is used. Verification checks token absence
both before and after private preview/export; the initial compromised demo
object was removed and its exact-generation cleanup confirmed.

The native chooser is intercepted with local Chrome CDP because the CLI lacks
that capability; navigation and captures use the Chrome CLI. Earlier manual
DataTransfer automation completed the chooser twice and is no longer used.
Native device behavior is not established by desktop browser or IO/share doubles.

| Capture | Actual viewport |
| --- | --- |
| [Desktop light](screenshots/attachments/desktop-light.png) |1440 ×1100|
| [Desktop dark](screenshots/attachments/desktop-dark.png) |1440 ×1100|
| [Mobile light, private preview](screenshots/attachments/mobile-light.png) |375 ×812|
| [Mobile dark, private preview](screenshots/attachments/mobile-dark.png) |375 ×812|

The captures use the original Tally theme and synthetic data. Dimensions and
SHA-256 values are in the adjacent manifest; screenshots are actual renders.

## Staging and device gates

Verify deployed indexes, App Check enforcement, maximum callable response sizes,
generation/metageneration preconditions, maximum request sizes and token absence
on the real bucket. Firebase documents [callable authentication and App Check handling](https://firebase.google.com/docs/functions/callable)
and [Functions request/response limits](https://firebase.google.com/docs/functions/quotas).
Android/iOS picker, protected native byte downloads, tablet share popovers and
background/suspended cleanup need physical-device verification. No banking
integration, public evidence URLs or production financial data is used here.
