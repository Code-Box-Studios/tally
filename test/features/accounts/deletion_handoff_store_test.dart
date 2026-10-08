import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/accounts/data/deletion_handoff_store.dart';
import 'package:tally/features/accounts/data/owner_local_guard.dart';
import 'package:tally/features/accounts/domain/deletion_handoff_store.dart';

void main() {
  const environment = 'emulator-demo-tally';
  final alice = OwnerUid('handoff-alice'), bob = OwnerUid('handoff-bob');
  DeletionHandoff record(
    OwnerUid owner,
    DeletionHandoffPhase phase, {
    String env = environment,
    String id = 'delete-original',
  }) => DeletionHandoff(
    owner: owner,
    environment: env,
    requestId: CommandId(id),
    phase: phase,
  );
  setUp(
    () => SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty(),
  );
  tearDown(() => SharedPreferencesAsyncPlatform.instance = null);

  test('an accepted handoff survives adapter recreation and keeps the original owner and request', () async {
    final first = SharedPreferencesDeletionHandoffs();
    await first.write(record(alice, DeletionHandoffPhase.uncertain));
    await first.write(record(alice, DeletionHandoffPhase.accepted));
    final recovered = await SharedPreferencesDeletionHandoffs().read(
      alice,
      environment,
    );
    expect(recovered, isNotNull);
    expect(recovered!.toMap(), {
      'schemaVersion': 1,
      'userId': 'handoff-alice',
      'environment': 'emulator-demo-tally',
      'requestId': 'delete-original',
      'phase': 'accepted',
    });
  });
  test('accepted handoff cannot regress to uncertain or change its original request', () async {
    final store = SharedPreferencesDeletionHandoffs();
    await store.write(record(alice, DeletionHandoffPhase.accepted));
    await expectLater(
      store.write(record(alice, DeletionHandoffPhase.uncertain)),
      throwsA(isA<OwnerLocalCleanupFailure>()),
    );
    await expectLater(
      store.write(
        record(
          alice,
          DeletionHandoffPhase.cleanupRequired,
          id: 'another-request',
        ),
      ),
      throwsA(isA<OwnerLocalCleanupFailure>()),
    );
    expect(
      (await store.read(alice, environment))!.requestId.value,
      'delete-original',
    );
  });
  test(
    'owned removal preserves another user and environment handoffs',
    () async {
      final store = SharedPreferencesDeletionHandoffs();
      final current = record(alice, DeletionHandoffPhase.cleanupRequired);
      await store.write(current);
      await store.write(record(bob, DeletionHandoffPhase.accepted));
      await store.write(
        record(alice, DeletionHandoffPhase.accepted, env: 'staging-private'),
      );
      await store.remove(current);
      expect(await store.read(alice, environment), isNull);
      expect((await store.read(bob, environment))!.accepted, isTrue);
      expect((await store.read(alice, 'staging-private'))!.accepted, isTrue);
    },
  );
  test('startup discovers only validated current-environment records independent of Auth', () async {
    final store = SharedPreferencesDeletionHandoffs();
    await store.write(record(alice, DeletionHandoffPhase.accepted));
    await store.write(record(bob, DeletionHandoffPhase.uncertain));
    await store.write(
      record(alice, DeletionHandoffPhase.accepted, env: 'staging-private'),
    );
    final records = await SharedPreferencesDeletionHandoffs().readEnvironment(
      environment,
    );
    expect(records.map((value) => value.owner.value).toSet(), {
      'handoff-alice',
      'handoff-bob',
    });
  });
  test('future or foreign records cannot be overwritten or removed during recovery', () async {
    final values = SharedPreferencesAsync(),
        store = SharedPreferencesDeletionHandoffs();
    final original = record(alice, DeletionHandoffPhase.accepted);
    for (final patch in [
      {'schemaVersion': 2},
      {'userId': bob.value},
      {'environment': 'staging-private'},
    ]) {
      final raw = jsonEncode({...original.toMap(), ...patch});
      await values.setString(deletionHandoffKey(alice, environment), raw);
      await expectLater(
        store.write(original),
        throwsA(isA<OwnerLocalCleanupFailure>()),
      );
      await expectLater(
        store.remove(original),
        throwsA(isA<OwnerLocalCleanupFailure>()),
      );
      expect(
        await values.getString(deletionHandoffKey(alice, environment)),
        raw,
      );
    }
  });
}
