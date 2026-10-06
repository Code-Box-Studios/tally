import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../domain/notification_platform.dart';
import '../domain/reminder_entry.dart';
import 'installation_store.dart';

final class LocalAlert {
  const LocalAlert({
    required this.id,
    required this.scheduledAt,
    required this.payload,
  });
  final int id;
  final DateTime scheduledAt;
  final Map<String, String> payload;
  String get title => 'Tally reminder';
  String get body => 'Open Tally to see what’s due.';
}

abstract interface class LocalAlertGateway {
  Future<void> schedule(LocalAlert alert);
  Future<void> cancel(int id);
}

final class LocalNotificationAdapter implements LocalReminderScheduler {
  LocalNotificationAdapter(
    this.gateway,
    this.store, {
    DateTime Function()? clock,
  }) : clock = clock ?? DateTime.now;
  final LocalAlertGateway gateway;
  final InstallationStore store;
  final DateTime Function() clock;
  Future<void> _queue = Future.value();
  final _generations = <OwnerUid, int>{};
  Future<void> _enqueue(Future<void> Function() operation) {
    final result = _queue.then((_) => operation());
    _queue = result.catchError((Object _) {});
    return result;
  }

  @override
  Future<void> reconcile(
    OwnerUid owner,
    Iterable<ReminderEntry> entries, {
    int limit = 50,
  }) {
    if (limit < 1 || limit > 50) {
      throw ArgumentError('Choose at most fifty local alerts.');
    }
    final rows = entries.toList();
    if (rows.any((entry) => entry.owner != owner)) {
      return Future.error(ArgumentError('Choose owned reminders.'));
    }
    final generation = _generations[owner] ?? 0;
    return _enqueue(() async {
      if ((_generations[owner] ?? 0) != generation) return;
      final upcoming =
          rows
              .where(
                (entry) =>
                    entry.visibleAt == null &&
                    entry.status == ReminderStatus.pending &&
                    entry.scheduledAt.isAfter(clock().toUtc()),
              )
              .toList()
            ..sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));
      final alerts = <LocalAlert>[], used = <int>{};
      for (final entry in upcoming.take(limit)) {
        final hash = sha256
                .convert(utf8.encode('${owner.value}:${entry.id}'))
                .toString(),
            id = int.parse(hash.substring(0, 7), radix: 16);
        if (!used.add(id)) {
          throw StateError('Local alert identifier collision.');
        }
        alerts.add(
          LocalAlert(
            id: id,
            scheduledAt: entry.scheduledAt,
            payload: ReminderIntent.fromData({
              'reminderId': entry.id,
              'obligationId': entry.obligationId.value,
              'instanceId': entry.instanceId.value,
            }).toData(),
          ),
        );
      }
      for (final id in await store.alertIds(owner)) {
        await gateway.cancel(id);
      }
      await store.saveAlertIds(owner, []);
      final scheduled = <int>[];
      for (final alert in alerts) {
        if ((_generations[owner] ?? 0) != generation) break;
        await gateway.schedule(alert);
        scheduled.add(alert.id);
        await store.saveAlertIds(owner, scheduled);
      }
    });
  }

  @override
  Future<void> cancelOwner(OwnerUid owner) {
    _generations[owner] = (_generations[owner] ?? 0) + 1;
    return _enqueue(() async {
      for (final id in await store.alertIds(owner)) {
        await gateway.cancel(id);
      }
      await store.saveAlertIds(owner, []);
    });
  }
}
