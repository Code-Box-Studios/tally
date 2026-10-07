# Private attachments contract

An agreement, statement or receipt is evidence attached to an already owned
obligation, period or payment. Files never modify financial amounts, payment
history, the ledger revision or financial projection jobs. Payment receipts are
queried by payment ID; adding one does not rewrite an immutable payment.

## Ownership and storage

Metadata lives at `users/{uid}/attachments/{attachmentId}` and content at
`users/{uid}/attachments/{attachmentId}/content`. Active schema-version1 profiles,
stored owner IDs, typed target IDs and canonical owned parent links authorize
reservation, ingestion, publication and reads. Firestore clients can read their
metadata but cannot write attachments, count locks, upload leases or jobs.
Storage clients can get generation-matched ready content only. Creates, updates,
deletes and lists are denied.

Protected second-generation callable ingestion checks auth, App Check, the frozen
command envelope and bounded canonical base64 before creating an object through
the Admin Cloud Storage API. It uses `ifGenerationMatch:0`, private/no-store cache
metadata and controlled owner, attachment and upload-checksum tags. No client
Storage upload or public download URL is used. The [ingestion decision](private-file-ingestion.md)
records the actual emulator token-channel limitation and transport tradeoffs.

JPEG, PNG, WebP and PDF are accepted, between1 and10,485,760 bytes inclusive.
Filename validation rejects controls, bidi overrides, path separators and
traversal; display names remain unchanged. Verification detects format from
bytes and compares declared size/type and optional SHA-256. It does not claim
malware scanning or full document validation. Object generation and metageneration
are canonical decimal strings, including values above JavaScript's integer range.

## Reservation, retries and lifecycle

Reservation and permanent command receipt atomically create awaitingUpload
metadata plus an active slot. A private target count lock is checked against the
actual active metadata count. At most10 awaitingUpload, processing or ready files
exist per target. Reservations expire after24 hours. Inconsistent locks fail
visibly rather than silently accepting another file.

Ingestion has one owner-private `attachmentUploads/{attachmentId}` lease, so two
command IDs cannot concurrently create the same object. Retries use the original
command ID, immutable content and payload digest. An ambiguous create response
reconciles the existing matching object without another write. A permanent
receipt stores only attachment ID and generation, never content. Lease expiry
permits recovery; a different digest cannot replace reserved bytes.

Storage events stage deterministic finalization jobs keyed by owner, attachment
and generation. Duplicate events cannot publish duplicate history. The worker
claims a six-minute lease, changes the file to processing, then reads metadata
and bounded bytes outside transactions. Every network boundary and final
transaction checks owner, state, lease token/generation and the processing object
generation. Ready publication records verified size/type/checksum/generation,
finalizedAt and one activity record atomically. Unexpected download tokens must
be removed and independently verified absent; failure leaves the file unpublished.

Rejection atomically records its bounded reason, releases the slot once and
stages cleanup. Removal uses a loaded revision, preserves a deleted tombstone,
releases only an active slot and stages cleanup. Late events for removed files,
missing owners or owners being deleted queue exact-generation cleanup without
resurrecting metadata. Historical payment/period records remain unchanged.

## Cleanup and runtime boundaries

Cleanup persists its selected generation before deleting. A lost deletion response
cannot make a retry select and delete a replacement. Metadata owner tags,
canonical job IDs and generation preconditions guard object deletion. Missing
objects complete safely; newer or foreign objects remain untouched. Account
cleanup may delete an original owner's outstanding blob while preserving history.

Expiry queries a collection group by state in awaitingUpload/processing and
expiresAt at or before now, ordered by expiresAt and full document path. One
invocation examines at most100 subjects and stores its last date/path in
`systemMaintenance/attachmentExpiry`. Subsequent invocations continue, and an
empty final page resets the cursor for new expirations. Each subject has its own
transaction and releases a slot at most once. The actual collection-group
state/expiresAt/document-name index is committed in firestore.indexes.json.
Target history and active-count indexes remain owner-scoped.

The dispatcher retains its25-job/450-second invocation budget and60-second start
reserve for file jobs. File workers use one55-second monotonic budget checked
before publication and after network work; individual Storage operations have
10-second deadlines. Delayed work releases its lease with generic bounded retry
backoff. The upload callable uses512 MiB, concurrency2 and120 seconds; the prompt
worker uses1 GiB and concurrency2 to bound simultaneous10 MiB byte buffers.

## Evidence and remaining release checks

Real local Emulator Suite cases use protected ingestion and read-only callable
byte downloads for genuine image/PDF content, including exactly10 MiB.
They cover forged inputs, private reads, token-free creation, fail-closed handling
of an unexpected managed token, overlapping commands, lost upload/delete responses,
late generation/owner/lease fences, immutable financial records and120 expired
reservations across bounded continuations. Injected delays exercise race boundaries;
they are not physical-device or deployed-production evidence.

Staging must verify actual GCS atomic generation/metageneration preconditions,
App Check, token absence, deployed rules and server permissions, ready indexes
and worst-size callable transport. The emulator's fresh metadata mismatch tests
do not prove a production precondition against a replacement during a network
request. Native picker/export and account-wide deletion receive their own later
gates. Development tests must never depend on private production data.

Task5 privacy refinement: All private byte reads use the protected downloadAttachment callable and Admin Cloud Storage. Direct client Storage reads and writes are denied. Authorized Firebase media GETs in the installed emulator mint managed tokens even without getDownloadURL, so the earlier web HTTP/native SDK read proposal is superseded. The strict command envelope carries only attachmentId; the read-only result carries attachmentId, storageGeneration and bounded canonical contentBase64. No receipts, financial values or attachment metadata are written by downloads. Active ownership, target links, ready revision/generation, actual type/size/checksum and token absence are fenced around every network stage.
