import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../../../core/config/environment.dart';
import '../domain/notification_device.dart';
import '../domain/notification_platform.dart';

@pragma('vm:entry-point')
Future<void> tallyMessagingBackground(RemoteMessage message) async {
  // The OS displays the generic notification payload. No private data is read.
}

final class FirebaseMessagingAdapter implements NotificationPlatform {
  FirebaseMessagingAdapter(
    this.environment, {
    bool? web,
    TargetPlatform? targetPlatform,
    Stream<ReminderIntent>? localEvents,
    this.localInitial,
  }) : web = web ?? kIsWeb,
       targetPlatform = targetPlatform ?? defaultTargetPlatform,
       localEvents = localEvents ?? const Stream.empty();
  final EnvironmentConfig environment;
  final bool web;
  final TargetPlatform targetPlatform;
  final Stream<ReminderIntent> localEvents;
  final Future<ReminderIntent?> Function()? localInitial;
  NotificationDevicePlatform get devicePlatform => web
      ? NotificationDevicePlatform.web
      : targetPlatform == TargetPlatform.iOS
      ? NotificationDevicePlatform.ios
      : targetPlatform == TargetPlatform.android
      ? NotificationDevicePlatform.android
      : NotificationDevicePlatform.web;
  bool get _native =>
      !web &&
      {TargetPlatform.android, TargetPlatform.iOS}.contains(targetPlatform);
  bool get _live =>
      environment.mode != AppEnvironment.emulator &&
      environment.mode != AppEnvironment.preview &&
      environment.options != null &&
      environment.projectId?.startsWith('demo-') == false &&
      (web || _native);
  bool get _pushConfigured =>
      _live && (!web || environment.webPushKey?.isNotEmpty == true);
  FirebaseMessaging get _messaging => FirebaseMessaging.instance;
  Future<NotificationCapability> _capability() async {
    if (!_live || web && !_pushConfigured) {
      return NotificationCapability(
        platform: devicePlatform,
        permission: NotificationPermission.unsupported,
        pushAvailable: false,
        localAvailable: false,
        token: null,
        message:
            'Device alerts are unavailable here. Your reminders stay in Tally.',
      );
    }
    try {
      final settings = await _messaging.getNotificationSettings(),
          permission = switch (settings.authorizationStatus) {
            AuthorizationStatus.authorized => NotificationPermission.granted,
            AuthorizationStatus.provisional =>
              NotificationPermission.provisional,
            AuthorizationStatus.denied ||
            AuthorizationStatus.deniedPermanently =>
              NotificationPermission.denied,
            AuthorizationStatus.notDetermined =>
              NotificationPermission.notDetermined,
          };
      final allowed = {
        NotificationPermission.granted,
        NotificationPermission.provisional,
      }.contains(permission);
      String? token;
      if (allowed) {
        final apnsReady =
            web ||
            targetPlatform != TargetPlatform.iOS ||
            await _messaging.getAPNSToken() != null;
        if (apnsReady) {
          token = await _messaging.getToken(
            vapidKey: web ? environment.webPushKey : null,
          );
          if (!web && targetPlatform == TargetPlatform.iOS) {
            await _messaging.setForegroundNotificationPresentationOptions(
              alert: true,
              badge: false,
              sound: true,
            );
          }
        }
      }
      if (_native) {
        FirebaseMessaging.onBackgroundMessage(tallyMessagingBackground);
      }
      return NotificationCapability(
        platform: devicePlatform,
        permission: permission,
        pushAvailable: allowed && token != null,
        localAvailable: _native && allowed,
        token: token,
        message: allowed
            ? 'Device permission is allowed. Your reminders stay in Tally.'
            : 'Notifications are not allowed on this device. Your reminders stay in Tally.',
      );
    } catch (_) {
      return NotificationCapability(
        platform: devicePlatform,
        permission: NotificationPermission.unsupported,
        pushAvailable: false,
        localAvailable: false,
        token: null,
        message: 'Device alerts could not be prepared. Your reminders stay in Tally.',
      );
    }
  }

  @override
  Future<NotificationCapability> inspect() => _capability();
  @override
  Future<NotificationCapability> requestPermission() async {
    if (_pushConfigured || _native && _live) {
      await _messaging.requestPermission(
        alert: true,
        badge: false,
        sound: true,
      );
    }
    return _capability();
  }

  @override
  Stream<String> get tokenChanges =>
      _pushConfigured ? _messaging.onTokenRefresh : const Stream.empty();
  ReminderIntent? _intent(RemoteMessage? message) {
    if (message == null) return null;
    try {
      return ReminderIntent.fromData(message.data);
    } catch (_) {
      return null;
    }
  }

  @override
  Stream<ReminderIntent> get openedEvents => Stream.multi((listener) {
    final local = localEvents.listen(listener.add, onError: listener.addError);
    final remote = _pushConfigured
        ? FirebaseMessaging.onMessageOpenedApp.listen((message) {
            final intent = _intent(message);
            if (intent != null) listener.add(intent);
          }, onError: listener.addError)
        : null;
    listener.onCancel = () async {
      await local.cancel();
      await remote?.cancel();
    };
  });
  @override
  Future<ReminderIntent?> initialMessage() async {
    final local = await localInitial?.call();
    if (local != null) return local;
    return _pushConfigured
        ? _intent(await _messaging.getInitialMessage())
        : null;
  }

  @override
  Future<void> clear() async {}
}
