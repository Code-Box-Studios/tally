import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../domain/deletion_handoff_store.dart';
import 'owner_local_guard.dart';

final class SharedPreferencesDeletionHandoffs implements DeletionHandoffStore {
  final _values = SharedPreferencesAsync();
  final _reader = OwnerLocalGuard();
  @override
  Future<DeletionHandoff?> read(OwnerUid owner, String environment) =>
      _reader.handoff(owner, environment);
  @override
  Future<void> write(DeletionHandoff value) async {
    final current = await read(value.owner, value.environment);
    if (current != null &&
        (current.requestId != value.requestId ||
            current.accepted && !value.accepted)) {
      throw const OwnerLocalCleanupFailure(
        'The saved deletion changed. Retry its original request.',
      );
    }
    await _values.setString(
      deletionHandoffKey(value.owner, value.environment),
      jsonEncode(value.toMap()),
    );
  }

  @override
  Future<void> remove(DeletionHandoff expected) async {
    final current = await read(expected.owner, expected.environment);
    if (current == null) return;
    if (current.requestId != expected.requestId ||
        current.phase != expected.phase) {
      throw const OwnerLocalCleanupFailure(
        'The saved deletion changed. Retry device cleanup.',
      );
    }
    await _values.remove(
      deletionHandoffKey(expected.owner, expected.environment),
    );
  }

  @override
  Future<List<DeletionHandoff>> readEnvironment(String environment) async {
    deletionHandoffKey(OwnerUid('scope-validation'), environment);
    final keys =
        (await _values.getKeys())
            .where(
              (key) =>
                  RegExp(r'^deletion-tally_outbox_[a-f0-9]{64}$').hasMatch(key),
            )
            .toList()
          ..sort();
    if (keys.length > 1000) {
      throw const OwnerLocalCleanupFailure(
        'Saved device cleanup needs recovery.',
      );
    }
    final records = <DeletionHandoff>[];
    for (final key in keys) {
      final raw = await _values.getString(key);
      if (raw == null) continue;
      try {
        if (raw.length > 2048) throw const FormatException();
        final value = Map<String, Object?>.from(jsonDecode(raw) as Map);
        final owner = OwnerUid(value['userId'] as String);
        final scope = value['environment'] as String;
        if (deletionHandoffKey(owner, scope) != key) {
          throw const FormatException();
        }
        final record = DeletionHandoff.fromMap(
          value,
          owner: owner,
          environment: scope,
        );
        if (scope == environment) records.add(record);
      } catch (_) {
        throw const OwnerLocalCleanupFailure(
          'The saved deletion needs recovery.',
        );
      }
    }
    return List.unmodifiable(records);
  }
}
