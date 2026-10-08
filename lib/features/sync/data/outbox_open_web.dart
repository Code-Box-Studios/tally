import 'package:drift/wasm.dart';

import '../../../core/identifiers/entity_ids.dart';
import 'drift_outbox_store.dart';
import 'outbox_database.dart';
import 'outbox_location.dart';
import 'outbox_open_result.dart';

Future<OpenedOutbox> openPlatformOutbox({
  required OwnerUid owner,
  required String environmentKey,
  required bool trustedDevice,
}) async {
  if (!trustedDevice) {
    return OpenedOutbox(webOutboxCapability('', trustedDevice: false));
  }
  final opened = await WasmDatabase.open(
    databaseName: outboxDatabaseName(owner, environmentKey),
    sqlite3Uri: Uri.base.resolve('sqlite3.wasm'),
    driftWorkerUri: Uri.base.resolve('drift_worker.js'),
  );
  final mode = opened.chosenImplementation.name;
  final capability = webOutboxCapability(mode, trustedDevice: true);
  if (!capability.canQueue) {
    await opened.resolvedExecutor.executor.close();
    return OpenedOutbox(capability, storageMode: mode);
  }
  final store = await DriftOutboxStore.open(
    OutboxDatabase(opened.resolvedExecutor),
    owner: owner,
    environmentKey: environmentKey,
  );
  return OpenedOutbox(capability, store: store, storageMode: mode);
}
