import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../accounts/data/owner_local_guard.dart';
import '../../sync/data/outbox_location.dart';
import '../domain/user_profile.dart';
import 'profile_dto.dart';

abstract interface class ProfileSnapshotStore {
  Future<UserProfile?> read(OwnerUid owner, String environment);
  Future<void> write(UserProfile profile, String environment);
}

/// Stores profile preferences only; no credentials, balances or payment data.
final class SharedPreferencesProfileSnapshots implements ProfileSnapshotStore {
  SharedPreferencesProfileSnapshots({OwnerLocalGuard? guard})
    : _guard = guard ?? OwnerLocalGuard.shared;
  final _preferences = SharedPreferencesAsync();
  final OwnerLocalGuard _guard;
  String _key(OwnerUid owner, String environment) =>
      'profile-${outboxDatabaseName(owner, environment)}';
  @override
  Future<UserProfile?> read(OwnerUid owner, String environment) async {
    try {
      await _guard.ensureAccessible(owner, environment);
      final json = await _preferences.getString(_key(owner, environment));
      if (json == null || json.length > 8192) return null;
      return ProfileDto.fromMap(
        Map<String, Object?>.from(jsonDecode(json) as Map),
        owner: owner,
        isFromCache: true,
      );
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(UserProfile profile, String environment) async {
    final value = {
      'userId': profile.uid.value,
      'accountStatus': 'active',
      'schemaVersion': 1,
      'revision': profile.revision,
      'displayName': profile.displayName,
      'photoUrl': profile.photoUrl,
      'defaultCurrency': profile.defaultCurrency.code,
      'timezone': profile.timezone,
      'locale': profile.locale,
      'themeMode': profile.theme.name,
      'onboardingComplete': profile.onboardingComplete,
    };
    // Validate the exact snapshot schema before writing it.
    ProfileDto.fromMap(value, owner: profile.uid);
    await _guard.write(
      profile.uid,
      environment,
      () => _preferences.setString(
        _key(profile.uid, environment),
        jsonEncode(value),
      ),
    );
  }
}
