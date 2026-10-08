import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/identifiers/entity_ids.dart';
import 'outbox_location.dart';

abstract interface class TrustedDeviceStore {
  Future<bool> read(OwnerUid owner, String environment);
  Future<void> write(OwnerUid owner, String environment, bool trusted);
}

final class SharedPreferencesTrustedDeviceStore implements TrustedDeviceStore {
  SharedPreferencesTrustedDeviceStore()
    : _preferences = SharedPreferencesAsync();
  final SharedPreferencesAsync _preferences;
  String _key(OwnerUid owner, String environment) =>
      'trusted-${outboxDatabaseName(owner, environment)}';
  @override
  Future<bool> read(OwnerUid owner, String environment) async {
    try {
      return await _preferences.getBool(_key(owner, environment)) ?? false;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<void> write(OwnerUid owner, String environment, bool trusted) =>
      _preferences.setBool(_key(owner, environment), trusted);
}
