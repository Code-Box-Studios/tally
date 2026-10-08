import 'dart:io';

import 'package:drift/native.dart';
import 'package:path/path.dart' as paths;
import 'package:path_provider/path_provider.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../domain/sync_capability.dart';
import 'drift_outbox_store.dart';
import 'outbox_database.dart';
import 'outbox_location.dart';
import 'outbox_open_result.dart';

Future<OpenedOutbox> openPlatformOutbox({
  required OwnerUid owner,
  required String environmentKey,
  required bool trustedDevice,
  Future<void> Function()? beforeMutation,
}) async {
  final name = outboxDatabaseName(owner, environmentKey);
  final support = await getApplicationSupportDirectory();
  final directory = Directory(paths.join(support.path, 'tally', 'outbox'));
  await directory.create(recursive: true);
  final database = OutboxDatabase(
    NativeDatabase.createInBackground(
      File(paths.join(directory.path, '$name.sqlite')),
    ),
  );
  final store = await DriftOutboxStore.open(
    database,
    owner: owner,
    environmentKey: environmentKey,
    beforeMutation: beforeMutation,
  );
  return OpenedOutbox(
    const SyncCapability(SyncAvailability.durable),
    store: store,
    storageMode: 'nativeSqlite',
  );
}
