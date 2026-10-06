import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/identifiers/command_id_factory.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/financial_failure_mapper.dart';
import '../../obligations/domain/obligation.dart';
import '../../recurring/domain/recurring_schedule.dart';
import '../domain/notification_preferences.dart';
import '../domain/reminder_entry.dart';
import 'notification_providers.dart';

final notificationActionsProvider =
    AsyncNotifierProvider.autoDispose<NotificationActions, void>(
      NotificationActions.new,
      dependencies: [notificationRepositoryProvider],
    );

class NotificationActions extends AsyncNotifier<void> {
  final _attempts = <String, CommandId>{};
  @override
  void build() {
    ref.watch(notificationRepositoryProvider);
  }

  Future<int?> _run(
    String name,
    Object payload,
    Future<int> Function(CommandId) operation,
  ) async {
    if (state.isLoading) return null;
    final key = jsonEncode([
          ref.read(notificationRepositoryProvider).owner.value,
          name,
          payload,
        ]),
        id = _attempts.putIfAbsent(key, newCommandId);
    state = const AsyncLoading();
    try {
      final result = await operation(id);
      if (!ref.mounted) return null;
      _attempts.remove(key);
      state = const AsyncData(null);
      return result;
    } catch (error, stack) {
      if (ref.mounted) state = AsyncError(financialFailure(error), stack);
      return null;
    }
  }

  Future<int?> savePreferences(NotificationPreferences preferences) => _run(
    'preferences',
    {'revision': preferences.revision, ...preferences.toPolicyMap()},
    (id) => ref
        .read(notificationRepositoryProvider)
        .updatePreferences(id, preferences),
  );
  Future<int?> markRead(ReminderEntry entry) => _run(
    'read',
    {'id': entry.id, 'revision': entry.revision},
    (id) => ref
        .read(notificationRepositoryProvider)
        .markRead(id, entry.id, entry.revision),
  );
  Future<int?> setPolicy(Obligation parent, ReminderPolicy policy) => _run(
    'policy',
    {'id': parent.id.value, 'revision': parent.revision, ...policy.toPayload()},
    (id) => ref
        .read(notificationRepositoryProvider)
        .setObligationPolicy(id, parent, policy),
  );
}
