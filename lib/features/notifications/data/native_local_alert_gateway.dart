import 'dart:async';
import 'dart:convert';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;

import '../domain/notification_platform.dart';
import 'local_notification_adapter.dart';

final class NoLocalAlertGateway implements LocalAlertGateway {
  @override
  Future<void> schedule(LocalAlert alert) async {}
  @override
  Future<void> cancel(int id) async {}
}

final class NativeLocalAlertGateway implements LocalAlertGateway {
  NativeLocalAlertGateway({FlutterLocalNotificationsPlugin? plugin})
    : _plugin = plugin ?? FlutterLocalNotificationsPlugin();
  final FlutterLocalNotificationsPlugin _plugin;
  final _opened = StreamController<ReminderIntent>.broadcast();
  Future<void>? _initialization;
  bool _disposed = false;
  Stream<ReminderIntent> get openedEvents => _opened.stream;
  ReminderIntent? _intent(String? payload) {
    if (payload == null) return null;
    try {
      final data = jsonDecode(payload);
      if (data is! Map) return null;
      return ReminderIntent.fromData(Map<String, Object?>.from(data));
    } catch (_) {
      return null;
    }
  }

  Future<void> initialize() => _initialization ??= _initialize();
  Future<void> _initialize() async {
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('ic_notification'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
      onDidReceiveNotificationResponse: (response) {
        final intent = _intent(response.payload);
        if (!_disposed && intent != null) _opened.add(intent);
      },
    );
  }

  Future<ReminderIntent?> initialMessage() async {
    await initialize();
    final details = await _plugin.getNotificationAppLaunchDetails();
    return details?.didNotificationLaunchApp == true
        ? _intent(details?.notificationResponse?.payload)
        : null;
  }

  @override
  Future<void> schedule(LocalAlert alert) async {
    await initialize();
    await _plugin.zonedSchedule(
      id: alert.id,
      title: alert.title,
      body: alert.body,
      scheduledDate: tz.TZDateTime.from(alert.scheduledAt, tz.UTC),
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'tally_reminders',
          'Tally reminders',
          channelDescription: 'Generic reminders for your private Tally inbox.',
          importance: Importance.defaultImportance,
          priority: Priority.defaultPriority,
        ),
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: false,
          presentSound: true,
        ),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      payload: jsonEncode(alert.payload),
    );
  }

  @override
  Future<void> cancel(int id) async {
    await initialize();
    await _plugin.cancel(id: id);
  }

  Future<void> dispose() {
    _disposed = true;
    return _opened.close();
  }
}
