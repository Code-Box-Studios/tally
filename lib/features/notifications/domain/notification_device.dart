import '../../../core/identifiers/entity_ids.dart';

enum NotificationDevicePlatform { android, ios, web }

enum NotificationPermission {
  granted,
  provisional,
  denied,
  notDetermined,
  unsupported,
}

enum NotificationChannel { push, local, none }

final class NotificationDevice {
  const NotificationDevice({
    required this.owner,
    required this.installationId,
    required this.platform,
    required this.permission,
    required this.channel,
    required this.appVersion,
    required this.active,
    required this.revision,
    required this.lastSeenAt,
  });
  final OwnerUid owner;
  final String installationId;
  final NotificationDevicePlatform platform;
  final NotificationPermission permission;
  final NotificationChannel channel;
  final String appVersion;
  final bool active;
  final int revision;
  final DateTime lastSeenAt;
}

final class NotificationDeviceQuery {
  NotificationDeviceQuery({this.limit = 50}) {
    if (limit < 1 || limit > 50) {
      throw ArgumentError('Choose a bounded device page.');
    }
  }
  final int limit;
}

final class NotificationDeviceRegistration {
  NotificationDeviceRegistration({
    required this.installationId,
    required this.platform,
    required this.permission,
    required this.channel,
    required this.token,
    required this.appVersion,
    required this.expectedRevision,
  }) {
    CommandId(installationId);
    if (expectedRevision < 0 ||
        expectedRevision >= 9007199254740991 ||
        !RegExp(r'^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$').hasMatch(appVersion) ||
        (token != null &&
            (token!.length < 20 ||
                token!.length > 4096 ||
                !RegExp(r'^[A-Za-z0-9:_.-]+$').hasMatch(token!))) ||
        (channel != NotificationChannel.none &&
            !{
              NotificationPermission.granted,
              NotificationPermission.provisional,
            }.contains(permission)) ||
        (channel == NotificationChannel.push && token == null) ||
        (channel == NotificationChannel.local &&
            platform == NotificationDevicePlatform.web) ||
        (permission == NotificationPermission.provisional &&
            platform != NotificationDevicePlatform.ios)) {
      throw ArgumentError('Choose a valid device notification channel.');
    }
  }
  final String installationId;
  final NotificationDevicePlatform platform;
  final NotificationPermission permission;
  final NotificationChannel channel;
  final String? token;
  final String appVersion;
  final int expectedRevision;
  Map<String, Object?> toPayload() => {
    'installationId': installationId,
    'platform': platform.name,
    'permission': permission.name,
    'channel': channel.name,
    'token': token,
    'appVersion': appVersion,
    'expectedRevision': expectedRevision,
  };
}
