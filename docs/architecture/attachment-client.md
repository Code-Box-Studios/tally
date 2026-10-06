# Attachment client lifecycle

The owner-scoped repository reads strict Firestore metadata through the existing
private document gateway. Its target query is bounded to50 records and sorts by
createdAt/document ID descending. Cursors retain their owner and exact target;
foreign or mismatched target records fail visibly. Cached pages remain labelled
as cached. Only attachments is added to the client allowlist; upload leases,
count locks and system jobs remain inaccessible.

Reservations and removals use protected command IDs and loaded revisions.
Uploads use the protected ingestion command from the [file contract](attachment-contract.md).
An immutable selection determines its checksum/body. Retrying an ambiguous upload
reuses its command and bytes; the server reconciles an existing matching object.
The client shows uploading and processing without claiming resumable byte progress.
An uncertain reservation keeps its frozen selection/action alive when its panel
closes, and releases that temporary Riverpod keepAlive after success or owner
scope disposal. This in-memory behavior does not survive a browser refresh.

Downloads use official FlutterFire getData capped at10,485,760 bytes and compare
the returned size and SHA-256 to ready metadata before returning owned bytes.
No public Firebase download URL is requested. The adapter verifies the current
Firebase Auth owner both before and after its request; the repository additionally
fences outstanding commands/downloads on disposal. Per-operation cancellation
registrations are removed after completion to avoid retaining finished buffers.
Accepted server work may complete after client disposal, still under its original
owner; local results never enter another owner's scope.

File selection uses file_selector1.1.0 with extensions, MIME types and iOS UTIs.
Filename/size/type are checked before byte reads, reads remain bounded, and a
changed file is rejected. Empty platform MIME falls back to the supported filename
extension; the server still checks actual bytes and never trusts that extension.
Native XFile.fromData does not preserve its supplied display name, so IO picker
tests use genuine temporary files rather than that misleading fixture.

Web export is explicit and uses a real local Blob URL. A bounded interoperable
copy is made from immutable Dart bytes and wiped after the Blob snapshots it.
The download anchor is removed and its URL revoked after download or owner
cleanup. Native export uses an owner-tagged temporary directory, a generated safe
local filename and share_plus13.3.1 with the original display filename. The share
origin lies inside the Flutter view, including tablet popovers. Linux uses an
explicit save picker. App-owned temporary exports are removed afterward; files
the user explicitly saves or sends remain their exports.

Repository, picker and exporter register with PrivateSessionCleanup. Sign-out
fences outstanding work and cleanup waits are bounded. Widgets consume providers
and action methods; Firebase and platform file APIs remain in data adapters.
A file failure never changes an accepted payment or its source history.

Evidence: repository/actions contract cases pass on Dart and Chrome; browser
export cases fetch the real local Blob bytes and prove revocation. Native tests
use genuine temporary files but an injected system-share boundary, so they do
not establish physical Android/iOS picker or tablet share behavior. Actual
Firebase ingestion/authenticated byte transport is separately covered by the
Emulator Suite. The following UI task supplies real end-to-end browser flows;
staging and physical-device gates remain required before launch.

Primary package references: [file_selector](https://pub.dev/packages/file_selector),
[share_plus](https://pub.dev/packages/share_plus),
[FlutterFire private byte downloads](https://firebase.google.com/docs/storage/flutter/download-files).
