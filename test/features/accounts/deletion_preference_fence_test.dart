import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/auth/data/profile_snapshot_store.dart';
import 'package:tally/features/sync/data/outbox_location.dart';
import 'package:tally/features/sync/data/trusted_device_store.dart';

import '../auth/session_controller_test.dart' show profile;

const environment = 'emulator-demo-tally';
Map<String, Object?> marker(OwnerUid owner, {String phase = 'accepted'}) => {
  'schemaVersion': 1,
  'userId': owner.value,
  'environment': environment,
  'requestId': 'delete-original',
  'phase': phase,
};
String markerKey(OwnerUid owner) =>
    'deletion-${outboxDatabaseName(owner, environment)}';

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });
  tearDown(() => SharedPreferencesAsyncPlatform.instance = null);

  test(
    'accepted deletion prevents a late profile snapshot from reappearing',
    () async {
      final owner = OwnerUid('preference-alice');
      final snapshots = SharedPreferencesProfileSnapshots();
      final values = SharedPreferencesAsync();
      await snapshots.write(profile(owner.value), environment);
      final key = 'profile-${outboxDatabaseName(owner, environment)}';
      await values.remove(key);
      await values.setString(markerKey(owner), jsonEncode(marker(owner)));
      await expectLater(
        snapshots.write(profile(owner.value), environment),
        throwsA(anything),
      );
      expect(await values.getString(key), isNull);
      expect(await snapshots.read(owner, environment), isNull);
    },
  );

  test('accepted deletion blocks renewed trust while preserving Bob and staging preferences', () async {
    final alice = OwnerUid('trusted-alice'), bob = OwnerUid('trusted-bob');
    final trusted = SharedPreferencesTrustedDeviceStore();
    final values = SharedPreferencesAsync();
    await trusted.write(bob, environment, true);
    await trusted.write(alice, 'staging-private', true);
    await values.setString(markerKey(alice), jsonEncode(marker(alice)));
    await expectLater(
      trusted.write(alice, environment, true),
      throwsA(anything),
    );
    expect(await trusted.read(alice, environment), isFalse);
    expect(await trusted.read(bob, environment), isTrue);
    expect(await trusted.read(alice, 'staging-private'), isTrue);
  });

  for (final (name, patch) in <(String, Map<String, Object?>)>[
    ('future-schema', {'schemaVersion': 2}),
    ('foreign-owner', {'userId': 'bob'}),
    ('foreign-environment', {'environment': 'production-other'}),
    ('unknown-phase', {'phase': 'eraseEverything'}),
    ('credential-injection', {'password': 'must-not-persist'}),
    ('invalid-request', {'requestId': '../elsewhere'}),
  ]) {
    test(
      'a $name deletion marker blocks preference writeback without being treated as absent',
      () async {
        final owner = OwnerUid('marker-$name');
        final values = SharedPreferencesAsync();
        await values.setString(
          markerKey(owner),
          jsonEncode({...marker(owner), ...patch}),
        );
        final snapshots = SharedPreferencesProfileSnapshots();
        await expectLater(
          snapshots.write(profile(owner.value), environment),
          throwsA(anything),
        );
        expect(
          await values.getString(
            'profile-${outboxDatabaseName(owner, environment)}',
          ),
          isNull,
        );
        expect(await values.getString(markerKey(owner)), isNotNull);
      },
    );
  }

  test('uncertain deletion preserves usable local preferences until acceptance is established', () async {
    final owner = OwnerUid('uncertain-local');
    final values = SharedPreferencesAsync();
    await values.setString(
      markerKey(owner),
      jsonEncode(marker(owner, phase: 'uncertain')),
    );
    final snapshots = SharedPreferencesProfileSnapshots();
    final trusted = SharedPreferencesTrustedDeviceStore();
    await snapshots.write(profile(owner.value), environment);
    await trusted.write(owner, environment, true);
    expect((await snapshots.read(owner, environment))!.uid, owner);
    expect(await trusted.read(owner, environment), isTrue);
  });
}
