# Private file ingestion

Private files are reserved through an owner metadata command, uploaded through
an authenticated, App Check protected second-generation callable, and stored
using the Admin Cloud Storage API with a create-only generation precondition.
Private downloads use a read-only protected callable and bounded Admin Cloud
Storage reads. Every direct client Storage operation, including gets, is denied.
The actual Task5 browser check found that authorized Firebase media reads mint
managed tokens even without a public URL helper; this supersedes the original
SDK download proposal. Server ownership, ready revision/generation, target links,
type, size, checksum and token absence are rechecked after network boundaries.
No financial data, receipt or attachment metadata is written by downloads.

The initial direct Firebase Storage SDK design exposed an emulator incompatibility:
firebase-tools15.32.1 moves firebaseStorageDownloadTokens out of rule-visible
metadata, and its metadata patch retains the managed token array even when the
reserved key is null. We cannot use that behavior to establish private publication.
The trusted ingestion path creates objects without Firebase download tokens in
the first place. Finalization still checks that no tokens exist before ready.
An unexpected token-bearing object stays unpublished rather than passing a
weakened assertion. No emulator monkeypatch or skipped security test is used.

The strict upload envelope retains commandId, expectedOwnerUid and payload.
Payload contains attachmentId, expectedRevision and contentBase64 only. Canonical
base64 is bounded before decoding; decoded bytes remain limited to10 MiB. This
fits the documented32 MB second-generation HTTP request limit, including JSON
overhead. Ownership, reservation expiry and declared size/type are checked before
network work. A private six-minute upload lease and payload digest identify an
attempt; permanent receipts contain only IDs and generation, never file bytes.
Retries reuse the frozen command and body, reconcile an existing matching object,
and never overwrite one. Finalization validates the actual format/checksum.

The upload callable has512 MiB memory, concurrency2 and a120-second deadline;
the client reports uploading and server validation separately. It cannot claim
resumable byte progress. Signing out fences late client results; an accepted
server upload remains private to its original owner. Removing an attachment or
deleting an account during ingestion prevents publication and queues exact-object
cleanup. Payment records and financial projections remain independent.

This costs one trusted upload transport, base64 overhead and server compute.
It removes the direct SDK's token-bearing unpublished upload path. Staging must
still verify deployed rules, App Check, transport limits, generation preconditions,
token absence, indexes and authenticated downloads. Native picker/export remains
a separate physical-platform gate.

References: [Functions quotas](https://firebase.google.com/docs/functions/quotas),
[Cloud Storage upload from memory](https://cloud.google.com/storage/docs/samples/storage-file-upload-from-memory),
[authenticated FlutterFire downloads](https://firebase.google.com/docs/storage/flutter/download-files).
