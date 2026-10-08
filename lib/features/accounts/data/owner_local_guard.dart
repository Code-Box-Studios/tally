import 'dart:async';
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../sync/data/outbox_location.dart';
import '../domain/deletion_handoff_store.dart';

String deletionHandoffKey(OwnerUid owner, String environment) =>
    'deletion-${outboxDatabaseName(owner, environment)}';

/// Serializes the accepted deletion boundary with owner preference writeback.
/// Every write rechecks durable handoff state, including writes from another tab.
final class OwnerLocalGuard {
  static final shared = OwnerLocalGuard();
  final _blocked = <String>{};
  final _writing = <String, Set<Future<void>>>{};

  Future<DeletionHandoff?> handoff(OwnerUid owner, String environment) async {
    final raw = await SharedPreferencesAsync().getString(
      deletionHandoffKey(owner, environment),
    );
    if (raw == null) return null;
    try {
      if (raw.length > 2048) throw const FormatException();
      return DeletionHandoff.fromMap(
        Map<String, Object?>.from(jsonDecode(raw) as Map),
        owner: owner,
        environment: environment,
      );
    } catch (_) {
      throw const OwnerLocalCleanupFailure(
        'The saved deletion needs recovery.',
      );
    }
  }

  Future<void> ensureAccessible(OwnerUid owner, String environment) async {
    final key = deletionHandoffKey(owner, environment);
    if (_blocked.contains(key) ||
        (await handoff(owner, environment))?.accepted == true ||
        _blocked.contains(key)) {
      throw const OwnerLocalCleanupFailure(
        'This account has requested deletion. Local data is closed.',
      );
    }
  }

  Future<void> write(
    OwnerUid owner,
    String environment,
    Future<void> Function() operation,
  ) async {
    await ensureAccessible(owner, environment);
    final key = deletionHandoffKey(owner, environment);
    // The second synchronous check closes the gap after the awaited marker read.
    if (_blocked.contains(key)) {
      throw const OwnerLocalCleanupFailure(
        'This account has requested deletion. Local data is closed.',
      );
    }
    final future = Future<void>.sync(operation);
    (_writing[key] ??= {}).add(future);
    try {
      await future;
    } finally {
      _writing[key]?.remove(future);
      if (_writing[key]?.isEmpty == true) _writing.remove(key);
    }
  }

  Future<void> quiesce(OwnerUid owner, String environment) async {
    final key = deletionHandoffKey(owner, environment);
    _blocked.add(key);
    final pending = _writing[key]?.toList() ?? const <Future<void>>[];
    await Future.wait(
      pending.map(
        (future) =>
            future.then<void>((_) {}, onError: (Object _, StackTrace _) {}),
      ),
    );
  }
}
