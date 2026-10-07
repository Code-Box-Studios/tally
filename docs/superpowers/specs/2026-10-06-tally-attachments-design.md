# Private attachments

M6a implements the existing Tally attachment contract. M6b separately implements
the durable command outbox. The user has authorized completing the application
inline on `main`; these refinements make the next implementation reviewable
without another milestone permission prompt.

## Intended outcome and boundary

Users can attach an agreement or statement to an obligation or billing period,
and a receipt to an accepted payment. They can inspect, download and remove
their own files. An upload failure never changes an accepted payment, amount,
remaining balance or financial ledger revision. Corrected and removed evidence
remains traceable. This preserves the six core product questions and the original
visual design. Banking, OCR and document analysis are outside this scope.

## Selected approach

Keep user-owned Firestore metadata and authenticated callable byte ingestion and
downloads through Admin Cloud Storage, with trusted reservation,
finalization and cleanup. The observed emulator token channel cannot be cleared
through a standard metadata patch. Trusted Cloud Storage ingestion creates
token-free objects and all direct client Storage access is denied; see
docs/architecture/private-file-ingestion.md. Public evidence URLs are never used.
Scheduled cleanup and retry-safe Storage events run without an open client.

The canonical object path is `users/{uid}/attachments/{attachmentId}/content`.
The app never calls `getDownloadURL`, saves a Firebase bearer URL or supplies
download tokens. Metadata finalization independently verifies token absence and the same object
generation before ready. It attempts standard removal for unexpected tokens
and fails closed if they remain. Real staging must separately verify token-free
creation, generation preconditions and rule behavior; emulator success does not
establish those deployed backend semantics.

## Limits and validation

Each target allows ten active reservations/files, enforced transactionally by a
private `attachmentSets` lock. Only `awaitingUpload`, `processing` and `ready`
count toward the limit. Zero-byte and files above 10 MiB (10,485,760 bytes) are
rejected. Supported declared and detected formats are JPEG, PNG, WebP and PDF.
SVG, HTML, executable and unsupported formats are rejected. Detection checks
bytes, not an extension alone; this is format validation, not a malware-scanning
claim. Original filename is display metadata, 1–150 characters without controls,
path separators or traversal names. SHA-256 is optional on reservation and,
when supplied, must match the uploaded bytes. No raw file content is logged.

Targets are strongly typed `obligation`, `instance` and `payment`. Each must
exist under the authenticated owner with matching stored ownership and canonical
parent links. Payments already exist before reservation; the ledger record is
never rewritten to add later receipts. Inactive/deleting/missing profiles cannot
reserve, upload or read files. Paid historical targets remain attachable.

## Metadata and consistency

`users/{uid}/attachments/{id}` stores attachmentId, userId, schemaVersion1,
targetType, targetId, obligationId, storagePath, filename, declaredContentType,
declaredSizeBytes, optional declaredSha256, state, revision and server audit
timestamps. Server-verified ready metadata also stores contentType, sizeBytes,
sha256, storageGeneration and finalizedAt. Rejection records a bounded public
reason code. Removal preserves a deleted tombstone and removedAt. Object
generation is an opaque decimal string, never a lossy JavaScript number.

Reservation has a 24-hour expiry and a deterministic attachment ID derived from
the owner and command ID. The existing metadata-command envelope and permanent
receipt make lost-response retries return the same reservation. Another payload
with the same command ID fails. Reservation and its count lock are atomic and
do not advance financial projections. Removal uses a loaded attachment revision,
atomically tombstones/decrements the lock and stages trusted object cleanup.
Activity records describe attachment addition/removal without monetary fields.

The strict reservation payload contains only `targetType`, `targetId`, `filename`,
`contentType`, `sizeBytes` and nullable `sha256`. The server stores the last three
as declared metadata, derives the parent and path from owned records and returns
only attachmentId, revision, storagePath and a UTC ISO expiresAt. Removal accepts
only attachmentId and expectedRevision. Callable ownership always comes from
auth; callers cannot supply a storage path, parent ownership or a ready state.

Finalization checks active ownership, reservation/path, current object generation,
actual size/type/checksum and download-token removal. A processing lease and
generation fence prevent duplicate or late events from overwriting a newer state.
Rejected/removed reservations cannot become ready. All network/file operations
stay outside Firestore transactions; publication rechecks the owner and lease.
The trigger stages bounded retry-safe work instead of relying on the UI to finish.

Cleanup processes at most100 subjects per invocation, with deterministic
continuations. Abandoned reservations expire after24 hours. Rejected/deleted
blobs are removed with a matching generation precondition. Orphan events cannot
create owner metadata. Cleanup and account deletion must never resurrect records
or delete another owner's/current replacement object. Stored counts are
repairable from active metadata; inconsistent counts fail visibly instead of
silently admitting a new reservation.

## Rules and queries

Firestore retains the existing owner-private, server-write-only metadata policy;
attachmentSets and attachment jobs stay inaccessible to clients. Protected ingestion
requires active auth/path ownership, an awaitingUpload reservation with exactly
the requested path, server-written owner/attachment metadata, allowed MIME and
bounded declared/actual size. Client Storage create is denied. Ingestion writes only controlled owner,
attachment and upload-checksum metadata. The Storage emulator hides its reserved
download-token key from rules and retains its managed token array on a null
metadata patch. Trusted ingestion creates token-free objects; finalization
checks token absence and fails closed if standard removal cannot clear an
unexpected token. Staging must verify deployed token absence and preconditions.
All direct client Storage reads and writes are denied. Protected callable reads
require matching ready metadata, active ownership and verified bytes after each network stage. Missing reservations,
processing files and foreign paths deny access.

Actual queries are targetType + targetId ordered by createdAt descending and
document ID descending, page50; historical tombstones remain visible. Cleanup
indexes follow its concrete state/expiry query. Indexes are committed with the
queries, and staging verifies readiness before release.

## Client and UX

Domain models, repository contracts, DTO validation, upload/download gateways and
Riverpod actions are separate. Widgets never call Firebase. File selection is an
explicit action using a cross-platform picker. Check size/type before holding at
most one bounded upload buffer. Show selecting, reserving, uploading, processing,
ready, rejected and removed states, with progress and a retry action. An uncertain
reservation retries its frozen payload and same command ID. An existing uploaded
object is reconciled rather than overwritten.

Obligation, period and payment history surfaces show relevant attachments and
“Attachment removed” tombstones. Image previews use authenticated bytes; PDF
evidence can be downloaded/shared through a capability adapter. Web uses a
short-lived local blob URL, revoked after the explicit download. Native export
uses temporary owner-scoped files and an explicit system share/save action.
No Firebase public bearer URL or financial file bytes enter analytics, crash logs,
installation preferences or the notification adapter.

Owner disposal cancels upload subscriptions/tasks, rejects late callbacks and
disposes preview bytes. A successful payment is displayed immediately even if its
subsequent receipt upload fails. Before M6b, reservation/upload requires network;
there is no false claim that an in-memory web selection survives restart. M6b
handles command dependencies and supported durable native file selections.

## Verification and release gates

Tests cover ten-way concurrent reservation and the eleventh rejection, permanent
receipt replay, revision conflict, owned/foreign/missing target references,
inactive account, size/MIME/path/metadata denials, owner ready-only reads,
overwrite/delete denial, real upload/finalization/token removal, spoofed format,
checksum mismatch, duplicate and obsolete generation events, remove while
finalizing, expiry/cleanup retry, late owner callbacks and payment immutability.
Widget/browser flows cover file selection, progress, failure/retry, private
preview/download and removal with the original responsive light/dark theme.
Whole Dart, Functions and Emulator gates remain required per task.

Staging verifies deployed Storage/Firestore rules and indexes, cross-service
Firestore access permissions, App Check, backend token removal, real protected ingestion
and protected callable downloads. Android/iOS file picker, preview/export, signing and
background cancellation require physical-device or supported native-runner
evidence. This milestone does not provision paid production resources or deploy
the emulator web build.

Primary references: [authenticated byte downloads](https://firebase.google.com/docs/storage/flutter/download-files),
[SDK uploads and metadata](https://firebase.google.com/docs/storage/flutter/upload-files),
[Storage event semantics](https://firebase.google.com/docs/functions/gcp-storage-events)
and [Storage rule conditions](https://firebase.google.com/docs/storage/security/rules-conditions).

Task5 privacy refinement: All private byte reads use the protected downloadAttachment callable and Admin Cloud Storage. Direct client Storage reads and writes are denied. Authorized Firebase media GETs in the installed emulator mint managed tokens even without getDownloadURL, so the earlier web HTTP/native SDK read proposal is superseded. The strict command envelope carries only attachmentId; the read-only result carries attachmentId, storageGeneration and bounded canonical contentBase64. No receipts, financial values or attachment metadata are written by downloads. Active ownership, target links, ready revision/generation, actual type/size/checksum and token absence are fenced around every network stage.
