import 'dart:io';

import 'package:drift/native.dart';
import 'package:path/path.dart' as paths;

import '../../../core/identifiers/command_id_factory.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../attachments/domain/attachment.dart';
import '../domain/pending_evidence.dart';
import 'outbox_location.dart';
import 'pending_evidence_database.dart';
import 'pending_evidence_sqlite.dart';

final class _PrivateReceiptFiles implements PendingEvidenceFiles {
  _PrivateReceiptFiles(this.directory);
  final Directory directory;
  @override
  bool get bytesSurviveRestart => true;
  @override
  Future<void> prepare(List<PendingEvidence> retained) async {
    final keys = retained.map((value) => '${value.fileKey}.receipt').toSet();
    final ownedName = RegExp(
      r'^[a-f0-9]{64}(?:\.receipt|\.[A-Za-z0-9_-]{1,128}\.tmp)$',
    );
    await for (final entry in directory.list(followLinks: false)) {
      final name = paths.basename(entry.path);
      if (entry is File && ownedName.hasMatch(name) && !keys.contains(name)) {
        await entry.delete();
      }
    }
  }

  File _file(PendingEvidence metadata) =>
      File(paths.join(directory.path, '${metadata.fileKey}.receipt'));
  @override
  Future<void> put(PendingEvidence metadata, AttachmentFileInput file) async {
    final temporary = File(
      paths.join(
        directory.path,
        '${metadata.fileKey}.${newCommandId().value}.tmp',
      ),
    );
    try {
      await temporary.writeAsBytes(file.bytes, flush: true);
      await temporary.rename(_file(metadata).path);
    } catch (_) {
      try {
        if (await temporary.exists()) await temporary.delete();
      } catch (_) {
        /* Keep a failed copy separate from metadata. */
      }
      throw const PendingEvidenceFailure(
        PendingEvidenceFailureCode.unavailable,
      );
    }
  }

  @override
  Future<AttachmentFileInput> read(PendingEvidence metadata) async {
    try {
      final file = _file(metadata);
      if (await file.length() != metadata.sizeBytes) {
        throw const PendingEvidenceFailure(
          PendingEvidenceFailureCode.changedFile,
        );
      }
      return AttachmentFileInput(
        filename: metadata.filename,
        contentType: metadata.contentType,
        bytes: await file.readAsBytes(),
      );
    } catch (_) {
      throw const PendingEvidenceFailure(
        PendingEvidenceFailureCode.changedFile,
      );
    }
  }

  @override
  Future<void> remove(PendingEvidence metadata) async {
    final file = _file(metadata);
    if (await file.exists()) await file.delete();
  }

  @override
  Future<void> close() async {}
}

/// Desktop IO tests exercise this adapter without claiming physical-device QA.
final class NativePendingEvidenceStore extends SqlitePendingEvidenceStore {
  NativePendingEvidenceStore._(
    super.database,
    _PrivateReceiptFiles super.files,
    super.owner,
    super.environmentKey, {
    super.beforeMutation,
  }) : receiptDirectory = files.directory;
  final Directory receiptDirectory;
  static Future<NativePendingEvidenceStore> open({
    required Directory root,
    required OwnerUid owner,
    required String environmentKey,
    Future<void> Function()? beforeMutation,
  }) async {
    final directory = Directory(
      paths.join(
        root.path,
        outboxDatabaseName(
          owner,
          environmentKey,
        ).replaceFirst('tally_outbox_', 'tally_receipts_'),
      ),
    );
    await directory.create(recursive: true);
    final files = Directory(paths.join(directory.path, 'files'));
    await files.create(recursive: true);
    final database = PendingEvidenceDatabase(
      NativeDatabase.createInBackground(
        File(paths.join(directory.path, 'metadata.sqlite')),
      ),
    );
    final store = NativePendingEvidenceStore._(
      database,
      _PrivateReceiptFiles(files),
      owner,
      environmentKey,
      beforeMutation: beforeMutation,
    );
    try {
      await store.initialize();
      return store;
    } catch (_) {
      await store.close();
      rethrow;
    }
  }
}
