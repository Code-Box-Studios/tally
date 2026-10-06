import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/document_reader.dart';
import '../domain/notification_device.dart';

abstract final class NotificationDeviceDto {
  static NotificationDevice fromMap(Map<String, Object?> data, OwnerUid owner) {
    const keys = {
      'userId',
      'schemaVersion',
      'installationId',
      'platform',
      'permission',
      'channel',
      'appVersion',
      'active',
      'revision',
      'lastSeenAt',
    };
    if (data.length != keys.length ||
        data.keys.any((key) => !keys.contains(key)) ||
        data['userId'] != owner.value ||
        data['schemaVersion'] != 1) {
      throw DocumentReader.invalid();
    }
    final r = DocumentReader(data),
        id = r.text('installationId', max: 128, required: true);
    CommandId(id);
    final platform = r.enumeration(
          'platform',
          NotificationDevicePlatform.values,
        ),
        permission = r.enumeration('permission', NotificationPermission.values),
        channel = r.enumeration('channel', NotificationChannel.values);
    final version = r.text('appVersion', max: 64, required: true),
        raw = r.text('lastSeenAt', max: 24, required: true);
    if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$').hasMatch(version) ||
        !RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$')
            .hasMatch(raw)) {
      throw DocumentReader.invalid();
    }
    final date = DateTime.tryParse(raw);
    if (date == null || date.toUtc().toIso8601String() != raw) {
      throw DocumentReader.invalid();
    }
    return NotificationDevice(
      owner: owner,
      installationId: id,
      platform: platform,
      permission: permission,
      channel: channel,
      appVersion: version,
      active: r.boolean('active'),
      revision: r.integer('revision', min: 1, max: 9007199254740990),
      lastSeenAt: date.toUtc(),
    );
  }
}
