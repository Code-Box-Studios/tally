import '../../../core/identifiers/entity_ids.dart';
import 'notification_device.dart';
import 'reminder_entry.dart';

final class NotificationCapability {
  const NotificationCapability({
    required this.platform,
    required this.permission,
    required this.pushAvailable,
    required this.localAvailable,
    required this.token,
    required this.message,
  });
  final NotificationDevicePlatform platform;
  final NotificationPermission permission;
  final bool pushAvailable, localAvailable;
  final String? token;
  final String message;
}

final class ReminderIntent {
  ReminderIntent.fromData(Map<String, Object?> data) {
    const keys = {'reminderId', 'obligationId', 'instanceId'};
    if (data.length != 3 || data.keys.any((key) => !keys.contains(key))) {
      throw ArgumentError('Unsupported notification link.');
    }
    final reminder = data['reminderId'],
        parent = data['obligationId'],
        period = data['instanceId'];
    if (reminder is! String || parent is! String || period is! String) {
      throw ArgumentError('Unsupported notification link.');
    }
    reminderId = CommandId(reminder).value;
    obligationId = ObligationId(parent);
    instanceId = InstanceId(period);
  }
  late final String reminderId;
  late final ObligationId obligationId;
  late final InstanceId instanceId;
  Map<String, String> toData() => {
    'reminderId': reminderId,
    'obligationId': obligationId.value,
    'instanceId': instanceId.value,
  };
  Uri get uri => Uri(
    path: '/obligations/${obligationId.value}',
    queryParameters: {'period': instanceId.value},
  );
}

abstract interface class NotificationPlatform {
  Future<NotificationCapability> inspect();
  Future<NotificationCapability> requestPermission();
  Stream<String> get tokenChanges;
  Stream<ReminderIntent> get openedEvents;
  Future<ReminderIntent?> initialMessage();
  Future<void> clear();
}

abstract interface class LocalReminderScheduler {
  Future<void> reconcile(
    OwnerUid owner,
    Iterable<ReminderEntry> entries, {
    int limit = 50,
  });
  Future<void> cancelOwner(OwnerUid owner);
}
