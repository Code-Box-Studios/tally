import 'package:drift/wasm.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../domain/pending_evidence_store.dart';
import '../domain/pending_evidence.dart';
import 'outbox_location.dart';
import 'web_owner_storage_lock.dart';
import 'outbox_open_result.dart';
import 'pending_evidence_database.dart';
import 'pending_evidence_memory.dart';
import 'pending_evidence_sqlite.dart';

Future<PendingEvidenceStore> openPlatformEvidence({
  required OwnerUid owner,
  required String environmentKey,
  required bool trustedDevice,
  Future<void> Function()? beforeMutation,
}) async {
  if (!trustedDevice) {
    throw const PendingEvidenceFailure(PendingEvidenceFailureCode.unavailable);
  }
  final lock = await WebOwnerStorageLock.acquire(owner, environmentKey);
  WasmDatabaseResult? opened;
  try {
    opened = await WasmDatabase.open(
      databaseName: outboxDatabaseName(
        owner,
        environmentKey,
      ).replaceFirst('tally_outbox_', 'tally_receipt_metadata_'),
      sqlite3Uri: Uri.base.resolve('sqlite3.wasm'),
      driftWorkerUri: Uri.base.resolve('drift_worker.js'),
    );
    if (!webOutboxCapability(
      opened.chosenImplementation.name,
      trustedDevice: true,
    ).canQueue) {
      await opened.resolvedExecutor.executor.close();
      await lock.close();
      throw const PendingEvidenceFailure(
        PendingEvidenceFailureCode.unavailable,
      );
    }
    final store = SqlitePendingEvidenceStore(
      PendingEvidenceDatabase(opened.resolvedExecutor),
      MemoryPendingReceiptFiles(),
      owner,
      environmentKey,
      beforeMutation: beforeMutation,
      afterClose: lock.close,
    );
    await store.initialize();
    return store;
  } catch (_) {
    await opened?.resolvedExecutor.executor.close();
    await lock.close();
    rethrow;
  }
}
