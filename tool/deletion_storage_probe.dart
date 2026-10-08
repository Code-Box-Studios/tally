import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:drift/wasm.dart';
import 'package:drift/drift.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/session/private_session_cleanup.dart';
import 'package:tally/features/accounts/data/deletion_handoff_store.dart';
import 'package:tally/features/accounts/data/owner_local_cleanup_web.dart';
import 'package:tally/features/accounts/data/owner_local_guard.dart';
import 'package:tally/features/accounts/domain/deletion_handoff_store.dart';
import 'package:tally/features/sync/data/outbox_open.dart';
import 'package:tally/features/sync/data/pending_evidence_open.dart';
import 'package:tally/features/sync/domain/command_name.dart';
import 'package:tally/features/sync/domain/frozen_command.dart';
import 'package:tally/features/sync/domain/outbox_store.dart';
import 'package:tally/features/sync/domain/pending_evidence_store.dart';

Future<void> main() async {
  if (!['localhost', '127.0.0.1'].contains(Uri.base.host) ||
      Uri.base.scheme != 'http') {
    throw StateError('This isolated deletion probe requires localhost.');
  }
  WidgetsFlutterBinding.ensureInitialized();
  final registry = PrivateSessionCleanup(),
      guard = OwnerLocalGuard(),
      handoffs = SharedPreferencesDeletionHandoffs(),
      preferences = SharedPreferencesAsync();
  final stores = <String, (OutboxStore, PendingEvidenceStore)>{};
  final gates = <String, Completer<void>>{};
  final cleanup = WebOwnerLocalCleanup(
    handoffs: handoffs,
    resources: registry,
    guard: guard,
  );
  List<String> names(OwnerUid owner, String env) {
    final name = outboxDatabaseName(owner, env);
    return [
      name,
      name.replaceFirst('tally_outbox_', 'tally_receipt_metadata_'),
    ];
  }

  Future<WasmProbeResult> probe(String name) => WasmDatabase.probe(
    sqlite3Uri: Uri.base.resolve('sqlite3.wasm'),
    driftWorkerUri: Uri.base.resolve('drift_worker.js'),
    databaseName: name,
  );
  Future<JSString> operation(JSString method, JSString encoded) async {
    final args = Map<String, Object?>.from(jsonDecode(encoded.toDart) as Map);
    final owner = OwnerUid(args['owner']! as String),
        env = args['environment']! as String,
        key = outboxDatabaseName(owner, env);
    Object? result;
    switch (method.toDart) {
      case 'open':
        final outbox = await openOutbox(
          owner: owner,
          environmentKey: env,
          trustedDevice: true,
        );
        if (!outbox.capability.canQueue) {
          throw StateError('No safe web storage.');
        }
        final evidence = await openPendingEvidence(
          owner: owner,
          environmentKey: env,
          trustedDevice: true,
        );
        stores[key] = (outbox.store!, evidence);
        if (args['hold'] == true) gates[key] = Completer<void>();
        registry.registerResource(owner, () async {
          await gates[key]?.future;
          await stores[key]?.$1.close();
          await stores[key]?.$2.close();
        });
        await outbox.store!.enqueue(
          FrozenCommand(
            owner: owner,
            id: CommandId('probe-${owner.value}'),
            name: CommandName.recordPayment,
            payload: {'amountMinor': 4500, 'currency': 'PHP'},
            resourceKey: 'obligation:synthetic',
            createdAt: DateTime.utc(2026, 10, 9),
          ),
        );
        await preferences.setString('profile-$key', 'synthetic-profile');
        await preferences.setBool('trusted-$key', true);
        result = {'mode': outbox.storageMode};
      case 'release':
        final gate = gates[key];
        if (gate != null && !gate.isCompleted) gate.complete();
        result = true;
      case 'close':
        await stores[key]?.$1.close();
        await stores[key]?.$2.close();
        result = true;
      case 'mark':
        await handoffs.write(
          DeletionHandoff(
            owner: owner,
            environment: env,
            requestId: CommandId('delete-original'),
            phase: DeletionHandoffPhase.values.byName(args['phase']! as String),
          ),
        );
        result = true;
      case 'corrupt':
        final name = names(owner, env).last;
        final found = await probe(name);
        final existing = found.existingDatabases.singleWhere(
          (db) => db.$2 == name,
        );
        final connection = await found.open(
          found.availableStorages.firstWhere(
            (item) => item.storageApi == existing.$1,
          ),
          name,
          enableMigrations: false,
        );
        try {
          await connection.executor.ensureOpen(_AlreadyOpen());
          await connection.executor.runCustom(
            args['kind'] == 'future'
                ? 'PRAGMA user_version = 2'
                : "UPDATE evidence_scopes SET user_id = 'foreign-bob'",
          );
        } finally {
          await connection.executor.close();
        }
        result = true;
      case 'purge':
        try {
          await cleanup.quiesceAndPurge(owner, env);
          result = {'ok': true};
        } on OwnerLocalCleanupFailure catch (error) {
          result = {'ok': false, 'message': error.message};
        }
      case 'lateWrite':
        try {
          await stores[key]!.$1.enqueue(
            FrozenCommand(
              owner: owner,
              id: CommandId('late-write'),
              name: CommandName.recordPayment,
              payload: {'amountMinor': 2500, 'currency': 'PHP'},
              resourceKey: 'obligation:synthetic',
              createdAt: DateTime.utc(2026, 10, 9),
            ),
          );
          result = {'allowed': true};
        } catch (_) {
          result = {'allowed': false};
        }
      case 'canReopen':
        final reopened = await openOutbox(
          owner: owner,
          environmentKey: env,
          trustedDevice: true,
        );
        result = {'allowed': reopened.capability.canQueue};
        await reopened.store?.close();
      case 'inspect':
        final existing = <String>[];
        for (final name in names(owner, env)) {
          final found = await probe(name);
          for (final entry in found.existingDatabases.where(
            (db) => db.$2 == name,
          )) {
            existing.add('${entry.$1.name}:${entry.$2}');
          }
        }
        result = {
          'databases': existing.length,
          'profile': await preferences.getString('profile-$key') != null,
          'trusted': await preferences.getBool('trusted-$key') == true,
          'phase': (await handoffs.read(owner, env))?.phase.name,
        };
      default:
        throw ArgumentError('Unknown deletion probe operation.');
    }
    return jsonEncode(result).toJS;
  }

  globalContext.setProperty(
    'tallyDeletionProbe'.toJS,
    ((JSString method, JSString json) => operation(method, json).toJS).toJS,
  );
  runApp(
    const Directionality(
      textDirection: TextDirection.ltr,
      child: Text(
        'Tally isolated deletion storage probe. Synthetic data only.',
      ),
    ),
  );
}

// The probe opens an existing database with migrations disabled. No app schema
// delegate runs while the fixture changes an unsupported header or owner scope.
final class _AlreadyOpen extends QueryExecutorUser {
  @override
  int get schemaVersion => 1;
  @override
  Future<void> beforeOpen(
    QueryExecutor executor,
    OpeningDetails details,
  ) async {}
}
