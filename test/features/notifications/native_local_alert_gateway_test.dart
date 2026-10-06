import 'dart:convert';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/features/notifications/data/native_local_alert_gateway.dart';

class PluginStub extends Fake implements FlutterLocalNotificationsPlugin {
  DidReceiveNotificationResponseCallback? response;
  @override
  Future<bool?> initialize({
    required InitializationSettings settings,
    DidReceiveNotificationResponseCallback? onDidReceiveNotificationResponse,
    DidReceiveBackgroundNotificationResponseCallback?
    onDidReceiveBackgroundNotificationResponse,
  }) async {
    response = onDidReceiveNotificationResponse;
    return true;
  }
}

void main() {
  test('native response callbacks are ignored after owner disposal', () async {
    final plugin = PluginStub();
    final gateway = NativeLocalAlertGateway(plugin: plugin);
    final seen = <String>[];
    final subscription = gateway.openedEvents.listen((intent) {
      seen.add(intent.reminderId);
    });
    final response = NotificationResponse(
      notificationResponseType: NotificationResponseType.selectedNotification,
      payload: jsonEncode({
        'reminderId': 'reminder-1',
        'obligationId': 'loan-1',
        'instanceId': 'period-1',
      }),
    );
    await gateway.initialize();
    plugin.response!(response);
    await Future<void>.delayed(Duration.zero);
    expect(seen, ['reminder-1']);
    await gateway.dispose();
    expect(() => plugin.response!(response), returnsNormally);
    expect(seen, ['reminder-1']);
    await subscription.cancel();
  });
}
