import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/notifications/data/installation_store.dart';
import 'package:tally/features/notifications/data/local_notification_adapter.dart';

import '../../support/notification_fixtures.dart';

class MemoryValues implements NotificationKeyValues {
  final values = <String, String>{};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }
}

class LocalGateway implements LocalAlertGateway {
  final sent = <LocalAlert>[], cancelled = <int>[];
  @override
  Future<void> schedule(LocalAlert alert) async {
    sent.add(alert);
  }

  @override
  Future<void> cancel(int id) async {
    cancelled.add(id);
  }
}

void main() {
  test(
    'installation identity is stable across restarts and concurrent callers',
    () async {
      final values = MemoryValues(), store = InstallationStore(values);
      final ids = await Future.wait([store.getOrCreate(), store.getOrCreate()]);
      expect(ids.toSet().length, 1);
      expect(await InstallationStore(values).getOrCreate(), ids.first);
      expect(values.values.values.single, ids.first);
    },
  );
  test('native plans bound50 future generic alerts with stable IDs and owner-only cancellation', () async {
    final repo = FakeNotifications(),
        values = MemoryValues(),
        gateway = LocalGateway(),
        now = DateTime.utc(2026, 10, 5);
    final local = LocalNotificationAdapter(
      gateway,
      InstallationStore(values),
      clock: () => now,
    );
    final entries = List.generate(
      60,
      (i) => repo.entry(
        'future-$i',
        patch: {
          'scheduledAt': now.add(Duration(hours: i + 1)),
          'status': 'pending',
          'visible': false,
          'visibleAt': null,
        },
      ),
    );
    await local.reconcile(repo.owner, entries);
    expect(gateway.sent.length, 50);
    expect(gateway.sent.map((a) => a.id).toSet().length, 50);
    expect(gateway.sent.first.title, 'Tally reminder');
    expect(gateway.sent.first.body, 'Open Tally to see what’s due.');
    expect(gateway.sent.first.payload.keys.toSet(), {
      'reminderId',
      'obligationId',
      'instanceId',
    });
    expect(values.values.values.join(' ').contains('Personal loan'), isFalse);
    final ids = gateway.sent.map((a) => a.id).toList();
    await local.reconcile(repo.owner, entries);
    expect(gateway.sent.skip(50).map((a) => a.id), ids);
    await local.cancelOwner(OwnerUid('bob'));
    expect(gateway.cancelled.length, 50);
    await LocalNotificationAdapter(
      gateway,
      InstallationStore(values),
      clock: () => now,
    ).cancelOwner(repo.owner);
    expect(gateway.cancelled.length, 100);
    await repo.dispose();
  });
  test('past, visible, cancelled and foreign-owner reminders cannot create local alerts', () async {
    final repo = FakeNotifications(),
        values = MemoryValues(),
        gateway = LocalGateway(),
        now = DateTime.utc(2026, 10, 5);
    final local = LocalNotificationAdapter(
      gateway,
      InstallationStore(values),
      clock: () => now,
    );
    await local.reconcile(repo.owner, [
      repo.entry('visible'),
      repo.entry(
        'past',
        patch: {
          'status': 'pending',
          'visible': false,
          'visibleAt': null,
          'scheduledAt': now,
        },
      ),
    ]);
    expect(gateway.sent, isEmpty);
    final other = FakeNotifications(owner: OwnerUid('bob'));
    await expectLater(
      local.reconcile(repo.owner, [other.entry('other')]),
      throwsArgumentError,
    );
    await repo.dispose();
    await other.dispose();
  });
}
