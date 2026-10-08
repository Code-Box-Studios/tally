import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../accounts/data/owner_local_guard.dart';
import 'outbox_location.dart';

abstract interface class TrustedDeviceStore {
  Future<bool> read(OwnerUid owner, String environment);
  Future<void> write(OwnerUid owner, String environment, bool trusted);
}

final class SharedPreferencesTrustedDeviceStore implements TrustedDeviceStore {
  SharedPreferencesTrustedDeviceStore({OwnerLocalGuard? guard})
    : _preferences = SharedPreferencesAsync(),
      _guard = guard ?? OwnerLocalGuard.shared;
  final SharedPreferencesAsync _preferences;
  final OwnerLocalGuard _guard;
  String _key(OwnerUid owner, String environment) =>
      'trusted-${outboxDatabaseName(owner, environment)}';
  @override
  Future<bool> read(OwnerUid owner, String environment) async {
    try {
      await _guard.ensureAccessible(owner, environment);
      return await _preferences.getBool(_key(owner, environment)) ?? false;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<void> write(OwnerUid owner, String environment, bool trusted) =>
      _guard.write(
        owner,
        environment,
        () => _preferences.setBool(_key(owner, environment), trusted),
      );
}
