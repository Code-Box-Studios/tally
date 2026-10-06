import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/identifiers/command_id_factory.dart';
import '../../../core/identifiers/entity_ids.dart';

abstract interface class NotificationKeyValues {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

final class SharedNotificationValues implements NotificationKeyValues {
  SharedNotificationValues() : _preferences = SharedPreferencesAsync();
  final SharedPreferencesAsync _preferences;
  @override
  Future<String?> read(String key) => _preferences.getString(key);
  @override
  Future<void> write(String key, String value) =>
      _preferences.setString(key, value);
}

final class InstallationStore {
  InstallationStore(this.values);
  final NotificationKeyValues values;
  Future<String>? _identity;
  Future<String> getOrCreate() => _identity ??= _load();
  Future<String> _load() async {
    const key = 'tally.notification.installation.v1';
    final saved = await values.read(key);
    if (saved != null) {
      try {
        CommandId(saved);
        return saved;
      } catch (_) {
        /* Replace invalid nonsecret local metadata. */
      }
    }
    final id = 'installation_${newCommandId().value}';
    await values.write(key, id);
    return id;
  }

  Future<List<int>> alertIds(OwnerUid owner) async {
    final saved = await values.read(
      'tally.notification.manifest.v1.${owner.value}',
    );
    if (saved == null) return [];
    final raw = jsonDecode(saved);
    if (raw is! List ||
        raw.length > 50 ||
        raw.any((id) => id is! int || id < 0 || id > 2147483647)) {
      throw StateError('Unsupported local alert manifest.');
    }
    return List<int>.from(raw);
  }

  Future<void> saveAlertIds(OwnerUid owner, Iterable<int> ids) async {
    final valuesList = ids.toList();
    if (valuesList.length > 50) throw ArgumentError('Too many local alerts.');
    await values.write(
      'tally.notification.manifest.v1.${owner.value}',
      jsonEncode(valuesList),
    );
  }
}
