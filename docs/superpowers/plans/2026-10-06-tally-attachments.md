# Private attachments implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task inline. Use TDD, one final fresh whole-plan reviewer, then one Important/Critical fix pass. The user requires main only and continuous execution.

**Goal:** Add private agreements, billing statements and payment receipts without changing financial history.

**Architecture:** Owner-scoped metadata and permanent command receipts protect reservation/removal. Authenticated Storage byte operations stay outside transactions; fenced server finalization and cleanup protect file lifecycle. Repository and capability adapters keep Firebase and platform file access out of widgets.

**Tech Stack:** Flutter/Dart, Riverpod, official FlutterFire Storage, TypeScript/Node22, Firebase Functions/Firestore/Storage and the Emulator Suite. Select compatible maintained file-picker/export packages only after inspecting their current APIs; commit lockfiles with the client task.

**Spec:** docs/superpowers/specs/2026-10-06-tally-attachments-design.md

## Global Constraints

- Work on main; do not create branches/worktrees or touch user-owned .ignore.
- Ten active reservations/files per target; zero-byte and files above10,485,760 bytes rejected; JPEG/PNG/WebP/PDF only; filename1–150 characters without controls/path separators/traversal; optional SHA-256 exactly64 lowercase hex characters.
- Paths are users/{uid}/attachments/{attachmentId}/content. No getDownloadURL, public evidence URLs or client download-token metadata.
- Owner path plus stored userId and active schemaVersion1 profile authorize every stage. Target type is obligation|instance|payment with checked owned parent links.
- Attachment states awaitingUpload|processing|ready|rejected|deleted. Processing/publication recheck generation/lease; generation is an opaque decimal string. Reservation expiry24 hours, bounded cleanup100 per invocation.
- No attachment operation changes payment/parent/instance amounts, ledger revision or projections. Payment receipt links query metadata rather than rewriting immutable payments.
- Network/file operations stay outside transactions. All related metadata/count/activity/job writes are atomic. Existing command envelope and permanent receipts remain authoritative.
- Inbox/financial UI retain the original theme and responsive behavior. Owner disposal cancels uploads and clears preview bytes; uncertain commands retain frozen payload/ID.
- Emulator-only development/testing; actual staging token absence/preconditions/App Check/indexes/native picker/export are release gates. Do not deploy build/web emulator output or provision paid resources.
- Preserve every plan ledger through the M8 exhaustive handoff. Existing authorization permits inline execution without another milestone handoff prompt.

## Review Focus

1. Reservation/removal/finalization overlap on the tenth file: the count cannot underflow, exceed10 or release a slot twice, and payments remain unchanged (Tasks2–3).
2. Object events arrive twice, late or after removal/account deletion: generation and owner fences prevent resurrection and deletion of a newer or foreign object (Task3).
3. SDK auto-added download tokens or falsely declared file formats bypass client checks: ready publication requires verified bytes and token absence; authenticated rules remain authoritative (Tasks2–4).
4. Lost reservation/upload responses and owner disposal race SDK callbacks: retries reuse the frozen command, uploaded objects are reconciled, and old-owner bytes/progress never surface (Tasks4–5).
5. Receipt upload fails after a valid payment, or a removed receipt is visited in history: canonical payment stays accepted and traceable; failure/tombstone copy describes the file state (Task5).

---

### Task 1: Typed attachment policy, models and strict mapping

**Files:** Create lib/features/attachments/domain/{attachment_policy,attachment,attachments_repository,attachment_capabilities}.dart; data/attachment_dto.dart; functions/src/attachments/policy.ts; functions/test/attachment_policy.test.ts; test/features/attachments/attachment_policy_test.dart and attachment_dto_test.dart. No SDK packages in domain.

**Interfaces:** AttachmentTarget.forObligation(ObligationId), forInstance(InstanceId), forPayment(PaymentId) expose stable targetType/targetId; AttachmentState and AttachmentContentType enums store stable strings. Attachment includes owner/id/target/parent/path/state/revision/server timestamps plus declared and verified metadata. AttachmentReservationInput(target,file metadata) is immutable; AttachmentReservation(id,revision,path,expiresAt) is the callable result. AttachmentFileInput(filename,contentType,Uint8List bytes) enforces limits and owns a checked copy. AttachmentsRepository exposes owner, watchTarget(target), getTarget(target,{PageCursor? after}), reserve(CommandId,input), upload(reservation,file), download(AttachmentId), remove(CommandId,id,{required expectedRevision}), dispose(). Upload returns Stream<AttachmentUploadProgress>; download returns owned AttachmentBytes. Capability interfaces select() and export(bytes) are separate from UI.

- [ ] Write tests first: empty/10,485,761-byte rejected, exact10,485,760 accepted, four MIME types accepted and SVG/HTML rejected, unsafe filename rejected, checksum format, typed target/path ownership, generation beyond MAX_SAFE_INTEGER retained as string, unknown state/type/schema and partial ready metadata rejected.
- [ ] Run flutter test test/features/attachments and npm --prefix functions run check; Expected RED missing new types/policy, not a weakened old fixture.
- [ ] Implement the exact limits and strict DTO, paired declared/verified metadata and no Firebase/widget imports in domain. TS validateAttachmentReservation(input:unknown) returns checked metadata/target payload; sniffAttachment(bytes:Uint8Array) returns allowed type or null and never trusts extension alone.
- [ ] Run focused tests plus flutter analyze; Expected all pass. Commit feat: define private attachment contracts. Named task-done gate flutter analyze && flutter test --reporter expanded && npm --prefix functions run check.

### Task 2: Protected reservations/removal and Storage authorization

**Files:** Create functions/src/attachments/{reservation_service,cleanup_jobs}.ts; firebase/emulator-tests/attachments.test.mjs and storage-rules.test.mjs. Modify functions/src/index.ts, storage.rules, firestore.indexes.json; extend emulator support only as needed for actual Storage SDK clients.

**Interfaces:** reserveAttachment(uid:string,input:unknown,db:Firestore,now?:Date) and removeAttachment(uid:string,input:unknown,db:Firestore,now?:Date) use executeMetadataCommand and its OwnerCommandContext read/create/update/countWhere/systemJob/activity. Reservation result is {attachmentId,revision,storagePath,expiresAt:UTC ISO string}. Removal result is {attachmentId,revision,state:'deleted'}. Stage deterministic attachmentCleanup jobs using the existing systemJobs schema/lease fields. Attachment count key hashes targetType+targetId; stored count/revision must match actual active metadata before admitting changes.

- [ ] Write emulator tests: ten concurrent reservations succeed, eleventh fails without partial writes; replay returns same ID and changed payload rejects; owned historical targets allowed, foreign/missing/broken links denied; inactive profile denied; removal loaded revision conflict, repeated receipt replay releases a slot once. Assert ledgerState, payment bytes, balances and projection jobs unchanged. Add actual Storage create/read tests for missing/foreign/processing reservations, 0/too-large/MIME/metadata/path mismatch, token custom metadata normalization, owner ready read, foreign read and overwrite/delete/list denial. Reserved token metadata is hidden before rule evaluation by the emulator; verify its managed channel removal in Task3 and real staging.
- [ ] Run npm run test:emulators against fresh demo-tally; Expected new endpoint/rule failures with old scenarios unchanged.
- [ ] Implement reservation/count/activity/receipt transactions and loaded-revision tombstone/cleanup staging. Replace deny-all Storage rule only at the canonical path; check active owner and exact Firestore reservation with bounded cross-service reads. This original client-create step is superseded by the ledgered Task3 trusted-ingestion ruling: deny all direct client creates and permit authenticated ready gets only. Commit the actual target/count query indexes.
- [ ] Run full gate flutter analyze && flutter test --reporter expanded && npm --prefix functions run check && npm run test:emulators; Expected all pass. Commit feat: reserve and authorize owner-private files; named task-done repeats gate.

### Task 3: Fenced finalization, token removal and bounded cleanup

**Files:** Create functions/src/attachments/{storage_gateway,finalization,attachment_jobs,cleanup,upload_service,attachment_record}.ts and functions/test/attachment_jobs.test.ts; add firebase/emulator-tests/attachment-finalization.test.mjs. Modify functions/src/{index,jobs/dispatch}.ts and firestore.indexes.json. Document architecture/attachment-contract.md.

**Interfaces:** AttachmentStorageGateway reads current generation/size/type/custom metadata, downloads bounded bytes, removes download-token metadata with generation/metageneration preconditions, and deletes exact generations. Inject gateway into finalizeAttachment(jobId,token,db,storage,now?) and cleanupAttachment(jobId,token,db,storage,now?). enqueueAttachmentFinalization(event,db) validates bucket/path/IDs/generation and stages one deterministic job; claimAttachmentJob checks canonical ID, active owner, lease generation and six-minute expiry. cleanupExpiredAttachments(db,storage,now?,limit=100) has a saved deterministic cursor. Integrate attachmentFinalization/attachmentCleanup into runReadyJob with the existing25-job/450-second budget and60-second nonprojection reserve.

- [ ] Write tests: real valid image/PDF upload becomes ready with matching verified checksum/type/size; backend download-token metadata removed before publication; no unauthenticated bearer retrieval after ready; format spoof/checksum mismatch rejected; duplicate jobs/events publish once; old generation/removal/inactive owner cannot publish; remove during byte read only deletes matched generation; cleanup retry/24-hour expiry/count release once; >100 subjects continue without truncation. Verify lease expiration/generation after every network stage and every transaction read.
- [ ] Run focused units/emulator suite; Expected RED absent worker behavior. Do not claim emulators establish real deployed token semantics.
- [ ] Implement bounded network work outside transactions, recheck current metadata/owner/job before ready/reject/deleted transition, persist generic failure codes and retry-safe leases. Trigger stages work; dispatcher executes with injected storage. Cleanup deletes matching objects, preserves tombstones and never fabricates a payment. Add indexes from actual cleanup queries.
- [ ] Run full gate including protected callable ingestion and actual authenticated Storage SDK downloads. Expected all pass. Commit feat: finalize and clean private attachment generations; named task-done repeats gate.

### Task 4: Owner-scoped repository and file capability adapters

**Files:** Create features/attachments/data/{firebase_attachments_repository,firebase_attachment_storage,file_picker_adapter,attachment_export,attachment_export_web,attachment_export_native}.dart and presentation/{attachment_actions,attachment_providers}.dart. Modify shared/data/owner_document_gateway.dart allowlist, pubspec.yaml/lock and platform files required by inspected package APIs. Tests repository/adapters/actions/owner cleanup under test/features/attachments.

**Interfaces:** FirebaseAttachmentsRepository extends FinancialRepositoryBase, consumes existing OwnerDocumentGateway and OwnerCommandGateway plus owner-bound AttachmentStorageGateway. DocumentQuery('attachments',limit:50,equals:{targetType,targetId},order:[createdAt descending]) preserves owner/query-bound cursor and cache/error truth. Storage adapter consumes firebaseClientsProvider.storage and ownerUidProvider; uses protected callable ingestion and getData(max10MiB), never download URL; tracks/cancels owned tasks. attachmentActionsProvider retains immutable uncertain reservation payload/CommandId and exposes explicit reconcile/retry. Root PrivateSessionCleanup receives owner-tagged bounded upload disposal; late completions are rejected.

- [ ] Write RED tests: strict query/cursor/cache truth, reserve retries same frozen payload/ID, uploaded immutable object reconciliation after ambiguous response, max-byte download, foreign metadata/path, owner switch during picker/reservation/upload/download/export, cancellation failure bounded, and no public URL API. SDK doubles must not be represented as real transport evidence.
- [ ] Inspect maintained picker/export APIs and install compatible locked dependencies. Implement validated single-file selection and explicit web/native export with temporary byte cleanup and no financial logs. Web selection is in-memory until M6b supported persistence; clearly label network/reselection behavior.
- [ ] Run focused tests, full Flutter analyzer/tests and actual web build; hot reload/runtime inspection after client changes. Expected all pass and no runtime errors. Commit feat: connect private attachment storage and file actions. Named task-done full gate includes Functions and Emulator Suite.

### Task 5: Obligation/period files and immutable payment receipts

**Files:** Create attachments/presentation/{attachment_panel,attachment_tile,attachment_preview}.dart. Modify obligations/presentation/{obligation_detail_screen,installment_periods_panel}.dart; recurring/presentation/{recurring_detail,recurring_history}.dart; activity domain/DTO/human labels as needed for added/removed evidence. Create widget/browser verification tool and docs/quality/attachments-verification.md with genuine screenshots.

**Interfaces:** AttachmentPanel(target) consumes attachment providers/actions only, paginates50 and distinguishes cached/processing/ready/rejected/deleted. Preview consumes authenticated AttachmentBytes and explicit export capability. Payment entry widgets mount AttachmentTarget.forPayment(entry.id) after canonical payment acceptance, including corrected-history evidence; parent/selected period panels use their exact target IDs. No payment document mutation for a later receipt.

- [ ] Write RED widget/provider tests for attach/progress/process/ready/retry/remove/tombstone, payment success followed by failed receipt, no negative/extra balance, cached offline copy and late previous-owner callbacks. Include320/375/800/1440 light/dark,200% text and keyboard-labelled actions.
- [ ] Implement original-theme reusable widgets and wire parent, chosen period and payment history. Show Attachment removed on tombstones and an actionable reason on rejection. Save/export is user initiated; disposal clears preview bytes.
- [ ] Actual demo browser: create obligation/payment, select genuine file, wait server-ready, preview/download via authenticated bytes, remove and inspect tombstone, switch owner and deny original target; inspect runtime/network for public bearer URL use. Physical native flow stays a documented M7 gate until actually exercised.
- [ ] Run entire gate, hot reload/runtime errors, true responsive screenshots and git diff --check. Commit feat: add private files and payment receipts; named task-done repeats gate.

After all five tasks, dispatch one fresh whole-plan review with Review Focus and
every ledger Ruling. Re-grade by user effect, perform one Important/Critical
RED→GREEN fix pass, ledger minors without a second review and continue M6b.
