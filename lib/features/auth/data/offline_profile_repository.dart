import 'dart:async';

import '../../../core/errors/app_failure.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../domain/auth_repository.dart';
import '../domain/user_profile.dart';
import 'profile_snapshot_store.dart';

/// Uses an owned preference snapshot only when protected bootstrap cannot connect.
final class OfflineProfileRepository implements ProfileRepository {
  const OfflineProfileRepository({
    required this.canonical,
    required this.snapshots,
    required this.environment,
    required this.canUseSnapshot,
  });
  final ProfileRepository canonical;
  final ProfileSnapshotStore snapshots;
  final String environment;
  final Future<bool> Function(OwnerUid) canUseSnapshot;
  Future<void> _remember(UserProfile profile) async {
    try {
      if (await canUseSnapshot(profile.uid)) {
        await snapshots.write(profile, environment);
      }
    } catch (_) {
      /* A preference-cache failure does not undo a confirmed server save. */
    }
  }

  @override
  Future<UserProfile> bootstrap(OwnerUid owner) async {
    try {
      final profile = await canonical
          .bootstrap(owner)
          .timeout(const Duration(seconds: 8));
      if (profile.uid != owner) {
        throw AppFailure(
          AppFailureCode.unavailable,
          messageKey: 'profile.owner',
        );
      }
      await _remember(profile);
      return profile;
    } catch (error) {
      final network =
          error is TimeoutException ||
          error is AppFailure &&
              error.messageKey == 'auth.network' &&
              error.retryable;
      if (network && await canUseSnapshot(owner)) {
        final cached = await snapshots.read(owner, environment);
        if (cached != null &&
            cached.uid == owner &&
            cached.onboardingComplete) {
          return UserProfile(
            uid: cached.uid,
            displayName: cached.displayName,
            photoUrl: cached.photoUrl,
            defaultCurrency: cached.defaultCurrency,
            timezone: cached.timezone,
            locale: cached.locale,
            theme: cached.theme,
            onboardingComplete: cached.onboardingComplete,
            revision: cached.revision,
            isFromCache: true,
          );
        }
      }
      if (error is TimeoutException) {
        throw AppFailure(
          AppFailureCode.unavailable,
          messageKey: 'auth.network',
          retryable: true,
        );
      }
      rethrow;
    }
  }

  @override
  Stream<UserProfile> watchProfile(OwnerUid owner) =>
      canonical.watchProfile(owner).asyncMap((profile) async {
        if (profile.uid != owner) {
          throw AppFailure(
            AppFailureCode.unavailable,
            messageKey: 'profile.owner',
          );
        }
        await _remember(profile);
        return profile;
      });
  @override
  Future<UserProfile> update(
    ProfilePreferences preferences, {
    required OwnerUid owner,
    required int expectedRevision,
    required CommandId commandId,
  }) async {
    final profile = await canonical.update(
      preferences,
      owner: owner,
      expectedRevision: expectedRevision,
      commandId: commandId,
    );
    if (profile.uid != owner) {
      throw AppFailure(AppFailureCode.unavailable, messageKey: 'profile.owner');
    }
    await _remember(profile);
    return profile;
  }
}
