import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/data_page.dart';
import '../../obligations/domain/obligation.dart';
import '../../recurring/domain/recurring_schedule.dart';
import 'notification_preferences.dart';
import 'reminder_entry.dart';
import 'notification_device.dart';

final class NotificationUpcomingQuery {
  NotificationUpcomingQuery({required DateTime from}) : from = from.toUtc();
  final DateTime from;
}

final class NotificationInboxQuery {
  NotificationInboxQuery({required DateTime until, this.limit = 50})
    : until = until.toUtc() {
    if (limit < 1 || limit > 50) {
      throw ArgumentError('Choose a bounded inbox page.');
    }
  }
  final DateTime until;
  final int limit;
  @override
  bool operator ==(Object other) =>
      other is NotificationInboxQuery &&
      other.until == until &&
      other.limit == limit;
  @override
  int get hashCode => Object.hash(until, limit);
}

abstract interface class NotificationRepository {
  OwnerUid get owner;
  Stream<DataPage<ReminderEntry>> watchUpcoming(
    NotificationUpcomingQuery query,
  );
  Future<DataRecord<ReminderEntry>?> getReminder(String id);
  Future<NotificationDevice> registerDevice(
    CommandId commandId,
    NotificationDeviceRegistration registration,
  );
  Future<NotificationDevice> unregisterDevice(
    CommandId commandId,
    NotificationDevice device,
  );
  Future<DataPage<NotificationDevice>> listDevices(
    CommandId commandId,
    NotificationDeviceQuery query, {
    PageCursor? after,
  });
  Stream<NotificationPreferences> watchPreferences();
  Stream<DataPage<ReminderEntry>> watchInbox(NotificationInboxQuery query);
  Future<DataPage<ReminderEntry>> getInbox(
    NotificationInboxQuery query, {
    PageCursor? after,
  });
  Future<int> updatePreferences(
    CommandId commandId,
    NotificationPreferences preferences,
  );
  Future<int> markRead(
    CommandId commandId,
    String reminderId,
    int expectedRevision,
  );
  Future<int> setObligationPolicy(
    CommandId commandId,
    Obligation obligation,
    ReminderPolicy policy,
  );
}
