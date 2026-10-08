import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:drift/wasm.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqlite3/wasm.dart';
import 'package:web/web.dart' as web;

import '../../../core/identifiers/entity_ids.dart';
import '../../../core/session/private_session_cleanup.dart';
import '../domain/deletion_handoff_store.dart';
import '../domain/owner_local_cleanup.dart';
import '../../sync/data/outbox_location.dart';
import '../../sync/data/web_owner_storage_lock.dart';
import 'owner_local_guard.dart';

final class WebOwnerLocalCleanup implements OwnerLocalCleanup {
  WebOwnerLocalCleanup({
    required this.handoffs,
    required this.resources,
    required this.guard,
  });
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
      await guard.quiesce(owner, environment).timeout(_deadline);
      await resources.quiesceForDeletion(owner);
      final lock = await WebOwnerStorageLock.acquire(
        owner,
        environment,
        exclusive: true,
      );
      try {
        final name = outboxDatabaseName(owner, environment);
        final names = [
          (name, 'outbox_scopes', 'command_rows'),
          (
            name.replaceFirst('tally_outbox_', 'tally_receipt_metadata_'),
            'evidence_scopes',
            'evidence_rows',
          ),
        ];
        final selected = <(WasmProbeResult, ExistingDatabase)>[];
        WasmSqlite3? sqlite;
        // Validate every copy in both supported storage APIs before erasing any
        // database. Exported SQLite is read only through an isolated memory VFS;
        // cleanup never opens or migrates a persistent financial database.
        for (final (databaseName, scopes, rows) in names) {
          final probe = await WasmDatabase.probe(
            sqlite3Uri: Uri.base.resolve('sqlite3.wasm'),
            driftWorkerUri: Uri.base.resolve('drift_worker.js'),
            databaseName: databaseName,
          ).timeout(_deadline);
          for (final api in WebStorageApi.values) {
            final existing = (api, databaseName);
            final present = await _exists(existing).timeout(_deadline);
            if (!present) continue;
            if (!probe.existingDatabases.contains(existing)) {
              throw const OwnerLocalCleanupFailure(_retryMessage);
            }
            final bytes = await probe
                .exportDatabase(existing)
                .timeout(_deadline);
            if (bytes == null || bytes.isEmpty) {
              throw const OwnerLocalCleanupFailure(_recoveryMessage);
            }
            try {
              sqlite ??= await WasmSqlite3.loadFromUrl(
                Uri.base.resolve('sqlite3.wasm'),
              ).timeout(_deadline);
              final memory = InMemoryFileSystem();
              final file = memory
                  .xOpen(
                    Sqlite3Filename('/database'),
                    SqlFlag.SQLITE_OPEN_CREATE | SqlFlag.SQLITE_OPEN_READWRITE,
                  )
                  .file;
              try {
                file.xWrite(bytes, 0);
              } finally {
                file.xClose();
              }
              sqlite.registerVirtualFileSystem(memory);
              try {
                final database = sqlite.open(
                  '/database',
                  vfs: memory.name,
                  mode: OpenMode.readOnly,
                );
                try {
                  if (database
                          .select('PRAGMA user_version')
                          .single['user_version'] !=
                      1) {
                    throw const OwnerLocalCleanupFailure(_recoveryMessage);
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
                    throw const OwnerLocalCleanupFailure(_recoveryMessage);
                  }
                } finally {
                  database.close();
                }
              } finally {
                sqlite.unregisterVirtualFileSystem(memory);
                for (final data in memory.fileData.values) {
                  if (data != null) data.fillRange(0, data.length, 0);
                }
                memory.fileData.clear();
              }
            } finally {
              bytes.fillRange(0, bytes.length, 0);
            }
            selected.add((probe, existing));
          }
        }
        for (final (probe, existing) in selected) {
          await probe.deleteDatabase(existing).timeout(_deadline);
          // Drift's pinned OPFS worker can swallow failed directory removal.
          // Verify exact physical absence instead of treating its reply as proof.
          if (await _exists(existing).timeout(_deadline)) {
            throw const OwnerLocalCleanupFailure(_retryMessage);
          }
        }
        for (final (databaseName, _, _) in names) {
          for (final api in WebStorageApi.values) {
            if (await _exists((api, databaseName)).timeout(_deadline)) {
              throw const OwnerLocalCleanupFailure(_retryMessage);
            }
          }
        }
        final values = SharedPreferencesAsync();
        await values.remove('profile-$name');
        await values.remove('trusted-$name');
        await handoffs.remove(retry);
      } finally {
        await lock.close();
      }
    } on OwnerLocalCleanupFailure {
      rethrow;
    } catch (_) {
      throw const OwnerLocalCleanupFailure(_retryMessage);
    }
  }

  static const _deadline = Duration(seconds: 20);
  static const _retryMessage =
      'Deletion is requested. This browser could not clear its saved data. Close other Tally windows and retry.';
  static const _recoveryMessage =
      'This browser’s saved data needs recovery before it can be cleared.';

  Future<bool> _exists(ExistingDatabase database) async {
    switch (database.$1) {
      case WebStorageApi.indexedDb:
        final databases = await web.window.indexedDB.databases().toDart;
        return databases.toDart.any((item) => item.name == database.$2);
      case WebStorageApi.opfs:
        if (!web.window.navigator.storage
            .hasProperty('getDirectory'.toJS)
            .toDart) {
          return false;
        }
        // Drift 2.35.1 owns drift_db/<exact hashed database name>. This read-only
        // check does not create directories or clear other origin storage.
        final root = await web.window.navigator.storage.getDirectory().toDart;
        try {
          final drift = await root.getDirectoryHandle('drift_db').toDart;
          await drift.getDirectoryHandle(database.$2).toDart;
          return true;
        } catch (error) {
          if (_notFound(error)) return false;
          rethrow;
        }
    }
  }

  bool _notFound(Object error) {
    try {
      return (error as JSObject).getProperty<JSString>('name'.toJS).toDart ==
          'NotFoundError';
    } catch (_) {
      return false;
    }
  }
}
