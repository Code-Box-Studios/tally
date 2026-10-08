import 'dart:io';

import 'package:path/path.dart' as paths;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqlite3/sqlite3.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../../core/session/private_session_cleanup.dart';
import '../domain/deletion_handoff_store.dart';
import '../domain/owner_local_cleanup.dart';
import '../../sync/data/outbox_location.dart';
import 'owner_local_guard.dart';

final class NativeOwnerLocalCleanup implements OwnerLocalCleanup {
  NativeOwnerLocalCleanup({
    required this.root,
    required this.handoffs,
    required this.resources,
    required this.guard,
  });
  final Directory root;
  final DeletionHandoffStore handoffs;
  final PrivateSessionCleanup resources;
  final OwnerLocalGuard guard;
  @override
  Future<void> quiesceAndPurge(OwnerUid owner, String environment) async {
    try {
      final record = await handoffs.read(owner, environment);
      if (record == null || !record.accepted) {
        throw const OwnerLocalCleanupFailure(
          'Confirm the original deletion request before clearing saved data.',
        );
      }
      final retry = DeletionHandoff(
        owner: owner,
        environment: environment,
        requestId: record.requestId,
        phase: DeletionHandoffPhase.cleanupRequired,
      );
      await handoffs.write(retry);
      await guard
          .quiesce(owner, environment)
          .timeout(const Duration(seconds: 20));
      await resources.quiesceForDeletion(owner);
      final support = Directory(await root.resolveSymbolicLinks());
      final name = outboxDatabaseName(owner, environment);
      final outboxDirectory = Directory(
        paths.join(support.path, 'tally', 'outbox'),
      );
      final database = File(paths.join(outboxDirectory.path, '$name.sqlite'));
      final receipts = Directory(
        paths.join(
          support.path,
          name.replaceFirst('tally_outbox_', 'tally_receipts_'),
        ),
      );
      await _directory(paths.join(support.path, 'tally'));
      await _directory(outboxDirectory.path);
      await _directory(receipts.path);
      final databaseFiles = [
        for (final suffix in ['', '-wal', '-shm', '-journal'])
          File('${database.path}$suffix'),
      ];
      for (final file in databaseFiles) {
        await _file(file.path);
      }
      await _validateDatabase(
        database,
        'outbox_scopes',
        'command_rows',
        owner,
        environment,
      );
      await _validateReceipts(receipts, owner, environment);
      // Validate every scope and future schema before deleting any file. A
      // blocked/open/foreign store retains both bytes and the accepted marker.
      final values = SharedPreferencesAsync();
      await values.remove('profile-$name');
      await values.remove('trusted-$name');
      for (final file in databaseFiles) {
        if (await file.exists()) await file.delete();
      }
      if (await receipts.exists()) await receipts.delete(recursive: true);
      await handoffs.remove(retry);
    } on OwnerLocalCleanupFailure {
      rethrow;
    } catch (_) {
      throw const OwnerLocalCleanupFailure(
        'Deletion is requested. This device could not clear its saved data. Close other Tally windows and retry.',
      );
    }
  }

  Future<void> _directory(String path) async {
    final type = await FileSystemEntity.type(path, followLinks: false);
    if (type != FileSystemEntityType.notFound &&
        type != FileSystemEntityType.directory) {
      throw const OwnerLocalCleanupFailure(
        'This device’s saved data needs recovery before it can be cleared.',
      );
    }
  }

  Future<void> _file(String path) async {
    final type = await FileSystemEntity.type(path, followLinks: false);
    if (type != FileSystemEntityType.notFound &&
        type != FileSystemEntityType.file) {
      throw const OwnerLocalCleanupFailure(
        'This device’s saved data needs recovery before it can be cleared.',
      );
    }
  }

  Future<void> _validateDatabase(
    File file,
    String scopes,
    String rows,
    OwnerUid owner,
    String environment,
  ) async {
    await _file(file.path);
    if (!await file.exists()) return;
    final database = sqlite3.open(file.path, mode: OpenMode.readOnly);
    try {
      if (database.select('PRAGMA user_version').single['user_version'] != 1) {
        throw const OwnerLocalCleanupFailure(
          'This device’s saved data needs recovery before it can be cleared.',
        );
      }
      final scope = database.select(
        'SELECT id,user_id,environment_key FROM $scopes LIMIT 2',
      );
      if (scope.length != 1 ||
          scope.single['id'] != 1 ||
          scope.single['user_id'] != owner.value ||
          scope.single['environment_key'] != environment ||
          database.select(
            'SELECT user_id FROM $rows WHERE user_id <> ? LIMIT 1',
            [owner.value],
          ).isNotEmpty) {
        throw const OwnerLocalCleanupFailure(
          'This device’s saved data belongs to a different account or environment.',
        );
      }
    } finally {
      database.close();
    }
  }

  Future<void> _validateReceipts(
    Directory directory,
    OwnerUid owner,
    String environment,
  ) async {
    if (!await directory.exists()) return;
    await for (final entry in directory.list(followLinks: false)) {
      final name = paths.basename(entry.path);
      if (name == 'files') {
        await _directory(entry.path);
      } else if ([
        'metadata.sqlite',
        'metadata.sqlite-wal',
        'metadata.sqlite-shm',
        'metadata.sqlite-journal',
      ].contains(name)) {
        await _file(entry.path);
      } else {
        throw const OwnerLocalCleanupFailure(
          'This device’s saved receipts need recovery before they can be cleared.',
        );
      }
    }
    await _validateDatabase(
      File(paths.join(directory.path, 'metadata.sqlite')),
      'evidence_scopes',
      'evidence_rows',
      owner,
      environment,
    );
    final files = Directory(paths.join(directory.path, 'files'));
    if (!await files.exists()) return;
    final supported = RegExp(
      r'^[a-f0-9]{64}(?:\.receipt|\.[A-Za-z0-9_-]{1,128}\.tmp)$',
    );
    await for (final entry in files.list(followLinks: false)) {
      final name = paths.basename(entry.path),
          match = supported.firstMatch(name);
      if (match == null || match.end != name.length) {
        throw const OwnerLocalCleanupFailure(
          'This device’s saved receipts need recovery before they can be cleared.',
        );
      }
      await _file(entry.path);
    }
  }
}
