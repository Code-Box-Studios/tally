# Implemented financial read queries

M2 uses bounded queries below `users/{authenticatedUid}`. DTOs verify the stored owner, schema and financial values. Commands capture that owner separately from the current Firebase session; the server checks the assertion against authentication. Private providers declare Riverpod dependencies and are disposed with the UID scope.

| Query | Equality filters | Order | Index |
| --- | --- | --- | --- |
| Obligations | archived=false; optional section/contactId | createdAt descending | archived plus selected equality fields, createdAt descending |
| Instances for an obligation | obligationId | dueDate ascending | obligationId, dueDate |
| Payment history | obligationId | paymentDate descending, createdAt descending | obligationId, paymentDate descending, createdAt descending |
| Contacts | none | searchName ascending | single field |
| Sources and categories | none | name ascending | single field |

The exact six composite shapes are in `firestore.indexes.json`. Firestore appends document-name ordering in the same direction as the final ordered field. The client adds that tie-breaker explicitly and uses document snapshots as opaque cursors. A cursor is bound to its owner and query shape; it cannot be reused for another owner or filter. Index deployment and readiness must be verified before releasing the queries; emulator success alone does not prove readiness.

Pages normally contain 50 records; requests outside 1–200 are rejected. Each page returns items, continuation cursor, hasMore and isFromCache. A full page conservatively reports a continuation until the next fetch proves exhaustion. History beyond the first page remains accessible. Ledger folding requires the complete history; a partially loaded history never becomes a new balance calculation.

Streamed Firestore cache snapshots carry their cache marker. Additional pages require a server response in M2. Saving is online only: a lost response is an unconfirmed save, not a success or a guaranteed failure. The mounted editor retains the same command identifier for an identical retry, allowing the server's permanent receipt to return the accepted result once. Restart-safe queued commands and owner-isolated persistence arrive in M6.
