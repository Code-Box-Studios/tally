import 'dart:async';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as paths;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/session/private_session_cleanup.dart';
import 'package:tally/features/accounts/data/deletion_handoff_store.dart';
import 'package:tally/features/accounts/data/owner_local_cleanup_native.dart';
import 'package:tally/features/accounts/data/owner_local_guard.dart';
import 'package:tally/features/accounts/domain/deletion_handoff_store.dart';
import 'package:tally/features/sync/data/drift_outbox_store.dart';
import 'package:tally/features/sync/data/outbox_database.dart';
import 'package:tally/features/sync/data/outbox_location.dart';
import 'package:tally/features/sync/data/pending_evidence_native.dart';

const environment = 'emulator-demo-tally';
Future<(DriftOutboxStore, File, NativePendingEvidenceStore, File)> createStores(
  Directory root,
  OwnerUid owner, {
  String env = environment,
}) async {
  final folder = Directory(paths.join(root.path, 'tally', 'outbox'));
  await folder.create(recursive: true);
  final file = File(
    paths.join(folder.path, '${outboxDatabaseName(owner, env)}.sqlite'),
  );
  final outbox = await DriftOutboxStore.open(
    OutboxDatabase(NativeDatabase.createInBackground(file)),
    owner: owner,
    environmentKey: env,
  );
  final evidence = await NativePendingEvidenceStore.open(
    root: root,
    owner: owner,
    environmentKey: env,
  );
  final bytes = File(
    paths.join(evidence.receiptDirectory.path, '${'a' * 64}.receipt'),
  );
  await bytes.writeAsString('synthetic-private-receipt');
  return (outbox, file, evidence, bytes);
}

DeletionHandoff accepted(
  OwnerUid owner, {
  DeletionHandoffPhase phase = DeletionHandoffPhase.accepted,
}) => DeletionHandoff(
  owner: owner,
  environment: environment,
  requestId: CommandId('delete-original'),
  phase: phase,
);

void main() {
  late Directory root;
  setUp(() async {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
    root = await Directory.systemTemp.createTemp('tally-owner-deletion-');
  });
  tearDown(() async {
    await root.delete(recursive: true);
    SharedPreferencesAsyncPlatform.instance = null;
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = false;
  });

  test('accepted native cleanup waits for handles then erases only Alice files and preferences', () async {
    final alice = OwnerUid('native-cleanup-alice'),
        bob = OwnerUid('native-cleanup-bob');
    final a = await createStores(root, alice),
        b = await createStores(root, bob),
        staging = await createStores(root, alice, env: 'staging-private');
    addTearDown(() async {
      await a.$1.close();
      await a.$3.close();
      await b.$1.close();
      await b.$3.close();
      await staging.$1.close();
      await staging.$3.close();
    });
    final registry = PrivateSessionCleanup(), gate = Completer<void>();
    registry.registerResource(alice, () async {
      await gate.future;
      await a.$1.close();
      await a.$3.close();
    });
    registry.registerResource(bob, () async {
      await b.$1.close();
      await b.$3.close();
    });
    final values = SharedPreferencesAsync();
    final name = outboxDatabaseName(alice, environment),
        bobName = outboxDatabaseName(bob, environment);
    await values.setString('profile-$name', 'private-alice');
    await values.setBool('trusted-$name', true);
    await values.setString('profile-$bobName', 'private-bob');
    final handoffs = SharedPreferencesDeletionHandoffs();
    await handoffs.write(accepted(alice));
    final cleanup = NativeOwnerLocalCleanup(
      root: root,
      handoffs: handoffs,
      resources: registry,
      guard: OwnerLocalGuard(),
    );
    var done = false;
    final pending = cleanup
        .quiesceAndPurge(alice, environment)
        .then((_) => done = true);
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(done, isFalse);
    expect(await a.$2.exists(), isTrue);
    expect(await a.$4.exists(), isTrue);
    gate.complete();
    await pending;
    expect(await a.$2.exists(), isFalse);
    expect(await a.$4.exists(), isFalse);
    expect(await values.getString('profile-$name'), isNull);
    expect(await values.getBool('trusted-$name'), isNull);
    expect(await handoffs.read(alice, environment), isNull);
    expect(await b.$2.exists(), isTrue);
    expect(await b.$4.readAsString(), 'synthetic-private-receipt');
    expect(await staging.$2.exists(), isTrue);
    expect(await staging.$4.exists(), isTrue);
    expect(await values.getString('profile-$bobName'), 'private-bob');
  });

  test(
    'uncertain request never discards native pending bytes or its retry marker',
    () async {
      final owner = OwnerUid('native-uncertain'),
          stores = await createStores(root, OwnerUid('native-uncertain'));
      addTearDown(() async {
        await stores.$1.close();
        await stores.$3.close();
      });
      final handoffs = SharedPreferencesDeletionHandoffs();
      await handoffs.write(
        accepted(owner, phase: DeletionHandoffPhase.uncertain),
      );
      final cleanup = NativeOwnerLocalCleanup(
        root: root,
        handoffs: handoffs,
        resources: PrivateSessionCleanup(),
        guard: OwnerLocalGuard(),
      );
      await expectLater(
        cleanup.quiesceAndPurge(owner, environment),
        throwsA(isA<OwnerLocalCleanupFailure>()),
      );
      expect(await stores.$2.exists(), isTrue);
      expect(await stores.$4.exists(), isTrue);
      expect(
        (await handoffs.read(owner, environment))!.phase,
        DeletionHandoffPhase.uncertain,
      );
    },
  );

  for (final kind in ['future schema', 'foreign scope']) {
    test(
      '$kind prevents erasure and retains an accepted cleanup retry marker',
      () async {
        final owner = OwnerUid('native-${kind.replaceAll(' ', '-')}'),
            stores = await createStores(
              root,
              OwnerUid('native-${kind.replaceAll(' ', '-')}'),
            );
        await stores.$1.close();
        await stores.$3.close();
        final database = sqlite3.open(stores.$2.path);
        if (kind == 'future schema') {
          database.execute('PRAGMA user_version = 2');
        } else {
          database.execute("UPDATE outbox_scopes SET user_id = 'bob'");
        }
        database.close();
        final handoffs = SharedPreferencesDeletionHandoffs();
        await handoffs.write(accepted(owner));
        final cleanup = NativeOwnerLocalCleanup(
          root: root,
          handoffs: handoffs,
          resources: PrivateSessionCleanup(),
          guard: OwnerLocalGuard(),
        );
        await expectLater(
          cleanup.quiesceAndPurge(owner, environment),
          throwsA(isA<OwnerLocalCleanupFailure>()),
        );
        expect(await stores.$2.exists(), isTrue);
        expect(await stores.$4.exists(), isTrue);
        expect(
          (await handoffs.read(owner, environment))!.phase,
          DeletionHandoffPhase.cleanupRequired,
        );
      },
    );
  }

  test('failed resource close leaves native data and cleanup marker available for a later restart', () async {
    final owner = OwnerUid('native-close-failure'),
        stores = await createStores(root, OwnerUid('native-close-failure'));
    addTearDown(() async {
      await stores.$1.close();
      await stores.$3.close();
    });
    final registry = PrivateSessionCleanup();
    registry.registerResource(owner, () async {
      throw const FileSystemException('Close failed');
    });
    final handoffs = SharedPreferencesDeletionHandoffs();
    await handoffs.write(accepted(owner));
    final cleanup = NativeOwnerLocalCleanup(
      root: root,
      handoffs: handoffs,
      resources: registry,
      guard: OwnerLocalGuard(),
    );
    await expectLater(
      cleanup.quiesceAndPurge(owner, environment),
      throwsA(isA<OwnerLocalCleanupFailure>()),
    );
    expect(await stores.$2.exists(), isTrue);
    expect(await stores.$4.exists(), isTrue);
    expect(
      (await handoffs.read(owner, environment))!.phase,
      DeletionHandoffPhase.cleanupRequired,
    );
  });
}
