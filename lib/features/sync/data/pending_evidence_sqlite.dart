import 'dart:convert';

import 'package:drift/drift.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../attachments/domain/attachment.dart';
import '../domain/pending_evidence.dart';
import '../domain/pending_evidence_store.dart';
import 'outbox_location.dart';
import 'pending_evidence_database.dart';

abstract interface class PendingEvidenceFiles {
  bool get bytesSurviveRestart;
  Future<void> prepare(List<PendingEvidence> retained);
  Future<void> put(PendingEvidence metadata, AttachmentFileInput file);
  Future<AttachmentFileInput> read(PendingEvidence metadata);
  Future<void> remove(PendingEvidence metadata);
  Future<void> close();
}

/// A separate transaction boundary cannot mutate any canonical financial value.
class SqlitePendingEvidenceStore implements PendingEvidenceStore {
  SqlitePendingEvidenceStore(
    this.database,
    this.files,
    this.owner,
    this.environmentKey, {
    this.beforeMutation,
    this.afterClose,
  });
  final PendingEvidenceDatabase database;
  final PendingEvidenceFiles files;
  @override
  final OwnerUid owner;
  final String environmentKey;
  final Future<void> Function()? beforeMutation;
  final Future<void> Function()? afterClose;
  bool _closed = false;
  Future<void>? _closing;
  @override
  bool get bytesSurviveRestart => files.bytesSurviveRestart;
  void _check() {
    if (_closed) {
      throw const PendingEvidenceFailure(
        PendingEvidenceFailureCode.unavailable,
      );
    }
  }

  Future<void> initialize() async {
    outboxDatabaseName(owner, environmentKey);
    try {
      await database.transaction(() async {
        await database.customStatement(
          'UPDATE evidence_scopes SET id = id WHERE id = 1',
        );
        final scopes = await database.select(database.evidenceScopes).get();
        if (scopes.isEmpty) {
          await database
              .into(database.evidenceScopes)
              .insert(
                EvidenceScopesCompanion.insert(
                  id: const Value(1),
                  userId: owner.value,
                  environmentKey: environmentKey,
                ),
              );
        } else if (scopes.length != 1 ||
            scopes.single.id != 1 ||
            scopes.single.userId != owner.value ||
            scopes.single.environmentKey != environmentKey) {
          throw const PendingEvidenceFailure(
            PendingEvidenceFailureCode.ownership,
          );
        }
        await files.prepare(await list());
      });
    } catch (error) {
      await close();
      if (database.rejectedSchema) {
        throw const PendingEvidenceFailure(
          PendingEvidenceFailureCode.unsupportedSchema,
        );
      }
      rethrow;
    }
  }

  PendingEvidence _decode(EvidenceRow row) {
    if (row.userId != owner.value ||
        utf8.encode(row.metadataJson).length > 8192) {
      throw const PendingEvidenceFailure(
        PendingEvidenceFailureCode.unsupportedSchema,
      );
    }
    final raw = jsonDecode(row.metadataJson);
    final value = PendingEvidence.fromJson(
      Map<String, Object?>.from(raw as Map),
      owner,
    );
    if (value.commandId.value != row.commandId) {
      throw const PendingEvidenceFailure(
        PendingEvidenceFailureCode.unsupportedSchema,
      );
    }
    return value;
  }

  @override
  Future<List<PendingEvidence>> list() async {
    _check();
    final rows = await (database.select(
      database.evidenceRows,
    )..limit(11)).get();
    _check();
    if (rows.length > 10) {
      throw const PendingEvidenceFailure(
        PendingEvidenceFailureCode.unsupportedSchema,
      );
    }
    return rows.map(_decode).toList(growable: false);
  }

  @override
  Stream<List<PendingEvidence>> watch() =>
      (database.select(database.evidenceRows)..limit(11)).watch().map((rows) {
        _check();
        if (rows.length > 10) {
          throw const PendingEvidenceFailure(
            PendingEvidenceFailureCode.unsupportedSchema,
          );
        }
        return rows.map(_decode).toList(growable: false);
      });
  @override
  Future<PendingEvidence?> get(CommandId id) async {
    _check();
    final row = await (database.select(
      database.evidenceRows,
    )..where((row) => row.commandId.equals(id.value))).getSingleOrNull();
    _check();
    return row == null ? null : _decode(row);
  }

  Future<T> _write<T>(Future<T> Function() work) async {
    _check();
    try {
      await beforeMutation?.call();
      _check();
      return await database.transaction(() async {
        await database.customStatement(
          'UPDATE evidence_scopes SET id = id WHERE id = 1',
        );
        _check();
        final value = await work();
        _check();
        return value;
      });
    } on PendingEvidenceFailure {
      rethrow;
    } catch (_) {
      throw const PendingEvidenceFailure(
        PendingEvidenceFailureCode.unavailable,
      );
    }
  }

  @override
  Future<PendingEvidence> persist(CommandId id, AttachmentFileInput file) =>
      _write(() async {
        final existing = await get(id);
        if (existing != null) {
          if (!existing.matchesFile(file)) {
            throw const PendingEvidenceFailure(
              PendingEvidenceFailureCode.conflict,
            );
          }
          await files.prepare(await list());
          await files.put(existing, file);
          await (database.update(
            database.evidenceRows,
          )..where((row) => row.commandId.equals(id.value))).write(
            EvidenceRowsCompanion(
              metadataJson: Value(jsonEncode(existing.toJson())),
            ),
          );
          return existing;
        }
        final current = await list();
        if (current.length >= 10 ||
            current.fold<int>(0, (sum, item) => sum + item.sizeBytes) +
                    file.sizeBytes >
                104857600) {
          throw const PendingEvidenceFailure(PendingEvidenceFailureCode.quota);
        }
        final evidence = PendingEvidence.forFile(owner, id, file);
        await files.prepare(current);
        await files.put(evidence, file);
        await database
            .into(database.evidenceRows)
            .insert(
              EvidenceRowsCompanion.insert(
                commandId: id.value,
                userId: owner.value,
                metadataJson: jsonEncode(evidence.toJson()),
              ),
            );
        return evidence;
      });
  @override
  Future<AttachmentFileInput> readFile(CommandId id) async {
    final evidence = await get(id);
    if (evidence == null) {
      throw const PendingEvidenceFailure(
        PendingEvidenceFailureCode.changedFile,
      );
    }
    final file = await files.read(evidence);
    _check();
    if (!evidence.matchesFile(file)) {
      throw const PendingEvidenceFailure(
        PendingEvidenceFailureCode.changedFile,
      );
    }
    return file;
  }

  @override
  Future<void> update(PendingEvidence value) => _write(() async {
    if (value.owner != owner) {
      throw const PendingEvidenceFailure(PendingEvidenceFailureCode.ownership);
    }
    final existing = await get(value.commandId);
    if (existing == null ||
        existing.fileKey != value.fileKey ||
        existing.paymentId != null && existing.paymentId != value.paymentId ||
        existing.reservation != null &&
            existing.reservation!.id != value.reservation?.id) {
      throw const PendingEvidenceFailure(PendingEvidenceFailureCode.conflict);
    }
    await (database.update(
      database.evidenceRows,
    )..where((row) => row.commandId.equals(value.commandId.value))).write(
      EvidenceRowsCompanion(metadataJson: Value(jsonEncode(value.toJson()))),
    );
  });
  @override
  Future<bool> remove(CommandId id, {PendingEvidence? expected}) =>
      _write(() async {
        if (expected != null &&
            (expected.owner != owner || expected.commandId != id)) {
          throw const PendingEvidenceFailure(
            PendingEvidenceFailureCode.ownership,
          );
        }
        final existing = await get(id);
        if (existing == null ||
            expected != null &&
                (existing.fileKey != expected.fileKey ||
                    existing.paymentId != expected.paymentId ||
                    existing.reservation?.id != expected.reservation?.id)) {
          return false;
        }
        await files.remove(existing);
        await (database.delete(
          database.evidenceRows,
        )..where((row) => row.commandId.equals(id.value))).go();
        return true;
      });
  @override
  Future<void> close() => _closing ??= (() async {
    _closed = true;
    try {
      await files.close();
    } finally {
      await database.close();
      await afterClose?.call();
    }
  })();
}
