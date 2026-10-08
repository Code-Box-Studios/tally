import 'package:drift/drift.dart';

import '../domain/sync_capability.dart';
import 'local_outbox_failure.dart';

part 'outbox_database.g.dart';

@DataClassName('StoredCommand')
class CommandRows extends Table {
  IntColumn get sequence => integer().autoIncrement()();
  TextColumn get userId => text()();
  TextColumn get commandId => text().unique()();
  TextColumn get commandJson => text()();
  TextColumn get resourceKey => text()();
  TextColumn get state => text()();
  IntColumn get revision => integer()();
  IntColumn get attempts => integer()();
  IntColumn get nextAttemptAt => integer()();
  IntColumn get updatedAt => integer()();
  IntColumn get rowGeneration => integer().withDefault(const Constant(0))();
  TextColumn get dispatchToken => text().nullable()();
  IntColumn get dispatchGeneration => integer().nullable()();
  IntColumn get dispatchExpiresAt => integer().nullable()();
  TextColumn get failureCode => text().nullable()();
  IntColumn get failureRemaining => integer().nullable()();
  TextColumn get resultJson => text().nullable()();
}

@DataClassName('StoredScope')
class OutboxScopes extends Table {
  IntColumn get id => integer()();
  TextColumn get userId => text()();
  TextColumn get environmentKey => text()();
  IntColumn get dispatchGeneration =>
      integer().withDefault(const Constant(0))();
  TextColumn get dispatchToken => text().nullable()();
  IntColumn get dispatchExpiresAt => integer().nullable()();
  IntColumn get clockSeenAt => integer().nullable()();
  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// Schema upgrades are explicit; a future database is never reset or downgraded.
@DriftDatabase(tables: [CommandRows, OutboxScopes])
class OutboxDatabase extends _$OutboxDatabase {
  OutboxDatabase(super.executor);
  bool _rejectedSchema = false;
  bool get rejectedSchema => _rejectedSchema;
  @override
  int get schemaVersion => 1;
  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) async {
      await m.createAll();
      await customStatement(
        'CREATE INDEX command_owner_state_sequence ON command_rows(user_id, state, sequence)',
      );
      await customStatement(
        'CREATE INDEX command_owner_resource_sequence ON command_rows(user_id, resource_key, sequence)',
      );
    },
    onUpgrade: (_, _, _) async {
      _rejectedSchema = true;
      throw const LocalOutboxFailure(SyncAvailability.unsupportedSchema);
    },
    beforeOpen: (_) async {
      await customStatement('PRAGMA busy_timeout = 5000');
    },
  );
}
