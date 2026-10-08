import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/accounts/data/deletion_handoff_store.dart';
import 'package:tally/features/accounts/data/owner_local_guard.dart';
import 'package:tally/features/accounts/data/serialized_owner_cleanup.dart';
import 'package:tally/features/accounts/domain/deletion_handoff_store.dart';
import 'package:tally/features/accounts/domain/deletion_local_recovery.dart';
import 'package:tally/features/accounts/domain/owner_local_cleanup.dart';
import 'package:tally/features/accounts/presentation/deletion_recovery_providers.dart';
import 'package:tally/features/accounts/presentation/deletion_recovery_startup.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/sync/presentation/sync_providers.dart';

const environment = 'emulator-demo-tally';

final class RecoveryCleanup implements OwnerLocalCleanup {
  RecoveryCleanup(this.handoffs);
  final DeletionHandoffStore handoffs;
  final calls = <(OwnerUid, String)>[];
  bool fail = false;
  Completer<void>? held;
  @override
  Future<void> quiesceAndPurge(OwnerUid owner, String environment) async {
    calls.add((owner, environment));
    await held?.future;
    if (fail) throw StateError('Synthetic sensitive path must not escape');
    final marker = await handoffs.read(owner, environment);
    if (marker != null) await handoffs.remove(marker);
  }
}

DeletionHandoff record(
  String owner, {
  String env = environment,
  DeletionHandoffPhase phase = DeletionHandoffPhase.accepted,
}) => DeletionHandoff(
  owner: OwnerUid(owner),
  environment: env,
  requestId: CommandId('delete-original'),
  phase: phase,
);

void main() {
  late SharedPreferencesDeletionHandoffs handoffs;
  late RecoveryCleanup cleanup;
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
    handoffs = SharedPreferencesDeletionHandoffs();
    cleanup = RecoveryCleanup(handoffs);
  });
  tearDown(() => SharedPreferencesAsyncPlatform.instance = null);
  DeletionLocalRecovery service() => DeletionLocalRecovery(
    handoffs: handoffs,
    cleanup: cleanup,
    environment: environment,
  );

  test('restart recovery purges accepted Alice without Auth and preserves uncertain Bob and staging', () async {
    await handoffs.write(record('alice'));
    await handoffs.write(record('bob', phase: DeletionHandoffPhase.uncertain));
    await handoffs.write(record('alice', env: 'staging-private'));
    final report = await service().recover();
    expect(cleanup.calls, [(OwnerUid('alice'), environment)]);
    expect(await handoffs.read(OwnerUid('alice'), environment), isNull);
    expect(report.pending.single.owner, OwnerUid('bob'));
    expect(
      await handoffs.read(OwnerUid('alice'), 'staging-private'),
      isNotNull,
    );
  });
  test('uncertain requests are never purged or retried as accepted', () async {
    await handoffs.write(
      record('uncertain', phase: DeletionHandoffPhase.uncertain),
    );
    final report = await service().recover(retryOwner: OwnerUid('uncertain'));
    expect(cleanup.calls, isEmpty);
    expect(report.pending, hasLength(1));
    expect(report.pending.single.phase, DeletionHandoffPhase.uncertain);
  });
  test('cleanup failure retains acceptance and explicit retry finishes the original owner', () async {
    await handoffs.write(record('failed'));
    cleanup.fail = true;
    final recovery = service();
    final failed = await recovery.recover();
    expect(failed.cleanupFailures, {OwnerUid('failed')});
    expect(failed.pending.single.requestId, CommandId('delete-original'));
    cleanup.fail = false;
    expect(
      (await recovery.recover(retryOwner: OwnerUid('failed'))).pending,
      isEmpty,
    );
    expect(cleanup.calls, [
      (OwnerUid('failed'), environment),
      (OwnerUid('failed'), environment),
    ]);
  });
  test(
    'malformed discovery fails closed without erasure or raw diagnostics',
    () async {
      final marker = record('malformed');
      await SharedPreferencesAsync().setString(
        deletionHandoffKey(marker.owner, environment),
        jsonEncode({...marker.toMap(), 'schemaVersion': 2}),
      );
      final report = await service().recover();
      expect(report.needsRecovery, isTrue);
      expect(cleanup.calls, isEmpty);
      expect(
        await SharedPreferencesAsync().getString(
          deletionHandoffKey(marker.owner, environment),
        ),
        isNotNull,
      );
    },
  );
  test('root recovery survives Bob feature disposal and does not read an Auth service', () async {
    await handoffs.write(record('root-alice'));
    cleanup.held = Completer<void>();
    final root = ProviderContainer(
      overrides: [
        ownerLocalCleanupProvider.overrideWithValue(cleanup),
        syncEnvironmentProvider.overrideWithValue(environment),
      ],
    );
    addTearDown(root.dispose);
    final child = ProviderContainer(
      parent: root,
      overrides: [ownerUidProvider.overrideWithValue(OwnerUid('bob'))],
    );
    final pending = root.read(deletionRecoveryProvider.future);
    child.dispose();
    for (var i = 0; i < 20 && cleanup.calls.isEmpty; i++) {
      await Future<void>.delayed(Duration.zero);
    }
    final started = cleanup.calls.isNotEmpty;
    cleanup.held!.complete();
    await pending;
    expect(started, isTrue);
    expect((await root.read(deletionRecoveryProvider.future)).pending, isEmpty);
  });
  test('concurrent retry uses one owned purge while another owner stays independent', () async {
    cleanup.held = Completer<void>();
    final serialized = SerializedOwnerLocalCleanup(cleanup);
    final first = serialized.quiesceAndPurge(
      OwnerUid('serial-alice'),
      environment,
    );
    final replay = serialized.quiesceAndPurge(
      OwnerUid('serial-alice'),
      environment,
    );
    final bob = serialized.quiesceAndPurge(OwnerUid('serial-bob'), environment);
    await Future<void>.delayed(Duration.zero);
    final before = cleanup.calls.toList();
    cleanup.held!.complete();
    await Future.wait([first, replay, bob]);
    expect(before, [
      (OwnerUid('serial-alice'), environment),
      (OwnerUid('serial-bob'), environment),
    ]);
  });

  testWidgets(
    'app startup begins accepted cleanup while signed-in features are absent',
    (tester) async {
      await handoffs.write(record('startup-alice'));
      cleanup.held = Completer<void>();
      final root = ProviderContainer(
        overrides: [
          ownerLocalCleanupProvider.overrideWithValue(cleanup),
          environmentProvider.overrideWithValue(
            const EnvironmentConfig.emulator(
              projectId: 'demo-tally',
              endpoints: EmulatorEndpoints(host: '127.0.0.1'),
            ),
          ),
          syncEnvironmentProvider.overrideWithValue(environment),
        ],
      );
      addTearDown(root.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: root,
          child: const DeletionRecoveryStartup(child: SizedBox()),
        ),
      );
      for (var i = 0; i < 20 && cleanup.calls.isEmpty; i++) {
        await tester.pump();
      }
      final started = cleanup.calls.isNotEmpty;
      await tester.pumpWidget(const SizedBox());
      cleanup.held!.complete();
      await root.read(deletionRecoveryProvider.future);
      expect(started, isTrue);
      expect(
        await handoffs.read(OwnerUid('startup-alice'), environment),
        isNull,
      );
      expect(tester.takeException(), isNull);
    },
  );
}
