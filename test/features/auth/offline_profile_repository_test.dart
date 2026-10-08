import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/errors/app_failure.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/auth/data/offline_profile_repository.dart';
import 'package:tally/features/auth/data/profile_snapshot_store.dart';
import 'package:tally/features/auth/domain/user_profile.dart';

import 'session_controller_test.dart' show ProfileFixture, profile;

class MemoryProfiles implements ProfileSnapshotStore {
  final values = <String, UserProfile>{};
  String key(OwnerUid owner, String environment) =>
      '$environment:${owner.value}';
  @override
  Future<UserProfile?> read(OwnerUid owner, String environment) async =>
      values[key(owner, environment)];
  @override
  Future<void> write(UserProfile value, String environment) async {
    values[key(value.uid, environment)] = value;
  }
}

void main() {
  final owner = OwnerUid('alice');
  late ProfileFixture canonical;
  late MemoryProfiles snapshots;
  setUp(() {
    canonical = ProfileFixture();
    snapshots = MemoryProfiles();
  });
  OfflineProfileRepository repository({
    bool trusted = true,
    String environment = 'emulator-demo-tally',
  }) => OfflineProfileRepository(
    canonical: canonical,
    snapshots: snapshots,
    environment: environment,
    canUseSnapshot: (_) async => trusted,
  );
  Future<UserProfile> fail(OfflineProfileRepository repo, Object error) async {
    final result = repo.bootstrap(owner);
    canonical.responses[owner.value]!.completeError(error);
    return result;
  }

  test('owned trusted profile reopens on a connectivity failure and is labelled cached', () async {
    await snapshots.write(profile('alice'), 'emulator-demo-tally');
    final result = await fail(
      repository(),
      AppFailure(
        AppFailureCode.unavailable,
        messageKey: 'auth.network',
        retryable: true,
      ),
    );
    expect(result.uid, owner);
    expect(result.isFromCache, true);
    expect(result.defaultCurrency, profile('alice').defaultCurrency);
  });
  test(
    'untrusted device and another environment never use a profile snapshot',
    () async {
      await snapshots.write(profile('alice'), 'emulator-demo-tally');
      await expectLater(
        fail(
          repository(trusted: false),
          AppFailure(
            AppFailureCode.unavailable,
            messageKey: 'auth.network',
            retryable: true,
          ),
        ),
        throwsA(isA<AppFailure>()),
      );
      canonical = ProfileFixture();
      await expectLater(
        fail(
          repository(environment: 'production-real'),
          AppFailure(
            AppFailureCode.unavailable,
            messageKey: 'auth.network',
            retryable: true,
          ),
        ),
        throwsA(isA<AppFailure>()),
      );
    },
  );
  test(
    'authorization and schema failures never fall back to stale profile',
    () async {
      await snapshots.write(profile('alice'), 'emulator-demo-tally');
      await expectLater(
        fail(
          repository(),
          AppFailure(
            AppFailureCode.unavailable,
            messageKey: 'profile.unsupported',
          ),
        ),
        throwsA(isA<AppFailure>()),
      );
    },
  );
  test('foreign cached identity cannot open the owner workspace', () async {
    snapshots.values['emulator-demo-tally:alice'] = profile('bob');
    await expectLater(
      fail(
        repository(),
        AppFailure(
          AppFailureCode.unavailable,
          messageKey: 'auth.network',
          retryable: true,
        ),
      ),
      throwsA(isA<AppFailure>()),
    );
  });
  test('confirmed bootstrap retains a profile snapshot only when storage is allowed', () async {
    final result = repository().bootstrap(owner);
    canonical.responses[owner.value]!.complete(profile('alice'));
    await result;
    expect(
      (await snapshots.read(owner, 'emulator-demo-tally'))!.isFromCache,
      false,
    );
    canonical = ProfileFixture();
    snapshots.values.clear();
    final untrusted = repository(trusted: false).bootstrap(owner);
    canonical.responses[owner.value]!.complete(profile('alice'));
    await untrusted;
    expect(snapshots.values, isEmpty);
  });
}
