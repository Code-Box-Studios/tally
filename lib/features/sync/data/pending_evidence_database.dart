import 'package:drift/drift.dart';

import '../domain/pending_evidence.dart';

part 'pending_evidence_database.g.dart';

class EvidenceRows extends Table {
  TextColumn get commandId => text()();
  TextColumn get userId => text()();
  TextColumn get metadataJson => text()();
  @override
  Set<Column<Object>> get primaryKey => {commandId};
}

class EvidenceScopes extends Table {
  IntColumn get id => integer()();
  TextColumn get userId => text()();
  TextColumn get environmentKey => text()();
  @override
  Set<Column<Object>> get primaryKey => {id};
}

@DriftDatabase(tables: [EvidenceRows, EvidenceScopes])
class PendingEvidenceDatabase extends _$PendingEvidenceDatabase {
  PendingEvidenceDatabase(super.executor);
  bool rejectedSchema = false;
  @override
  int get schemaVersion => 1;
  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) => m.createAll(),
    onUpgrade: (_, _, _) async {
      rejectedSchema = true;
      throw const PendingEvidenceFailure(
        PendingEvidenceFailureCode.unsupportedSchema,
      );
    },
    beforeOpen: (_) => customStatement('PRAGMA busy_timeout = 5000'),
  );
}
