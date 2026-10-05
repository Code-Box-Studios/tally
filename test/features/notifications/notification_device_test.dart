import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/notifications/data/notification_device_dto.dart';
import 'package:tally/features/notifications/data/firestore_notification_repository.dart';
import 'package:tally/features/notifications/domain/notification_device.dart';
import 'package:tally/shared/data/owner_command_gateway.dart';

import 'notification_repository_test.dart' show NotificationDocuments;

Map<String, Object?> view(
  String id, {
  String owner = 'alice',
  int revision = 1,
}) => {
  'userId': owner,
  'schemaVersion': 1,
  'installationId': id,
  'platform': 'web',
  'permission': 'granted',
  'channel': 'push',
  'appVersion': '0.1.0',
  'active': true,
  'revision': revision,
  'lastSeenAt': '2026-10-05T01:00:00.000Z',
};

final class DeviceCommands implements OwnerCommandGateway {
  DeviceCommands(this.owner);
  @override
  final OwnerUid owner;
  final calls = <(String, CommandId, Map<String, Object?>)>[];
  final responses = <Map<String, Object?>>[];
  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId id,
    Map<String, Object?> payload,
  ) async {
    calls.add((name, id, payload));
    return responses.removeAt(0);
  }
}

void main() {
  final owner = OwnerUid('alice');
  NotificationDeviceRegistration registration() =>
      NotificationDeviceRegistration(
        installationId: 'browser',
        platform: NotificationDevicePlatform.web,
        permission: NotificationPermission.granted,
        channel: NotificationChannel.push,
        token: 'synthetic-notification-token-browser',
        appVersion: '0.1.0',
        expectedRevision: 0,
      );
  test('sanitized device maps only owned fields and UTC ISO server audit', () {
    final device = NotificationDeviceDto.fromMap(view('browser'), owner);
    expect(device.owner, owner);
    expect(device.installationId, 'browser');
    expect(device.revision, 1);
    expect(device.lastSeenAt, DateTime.utc(2026, 10, 5, 1));
    expect(device.channel, NotificationChannel.push);
  });
  for (final patch in <Map<String, Object?>>[
    {'userId': 'bob'},
    {'schemaVersion': 2},
    {'installationId': '../bob'},
    {'revision': 0},
    {'platform': 'linux'},
    {'permission': 'maybe'},
    {'channel': 'bank'},
    {'lastSeenAt': '2026-02-30T01:00:00.000Z'},
    {'lastSeenAt': '2026-10-05T09:00:00+08:00'},
    {'token': 'private-token'},
  ]) {
    test('invalid or private device fields $patch are rejected', () {
      expect(
        () => NotificationDeviceDto.fromMap({
          ...view('browser'),
          ...patch,
        }, owner),
        throwsA(anything),
      );
    });
  }
  test('device commands keep action IDs/revisions and never query private Firestore collections', () async {
    final commands = DeviceCommands(owner)
      ..responses.addAll([
        {'device': view('browser')},
        {
          'device': {
            ...view('browser', revision: 2),
            'active': false,
            'channel': 'none',
          },
        },
      ]);
    final docs = NotificationDocuments(owner),
        repo = FirestoreNotificationRepository(docs, commands);
    final id = CommandId('register');
    final device = await repo.registerDevice(id, registration());
    expect(commands.calls.single.$1, 'registerNotificationDevice');
    expect(commands.calls.single.$2, id);
    expect(commands.calls.single.$3, registration().toPayload());
    final retired = await repo.unregisterDevice(CommandId('retire'), device);
    expect(retired.active, isFalse);
    expect(commands.calls.last.$3, {
      'installationId': 'browser',
      'expectedRevision': 1,
    });
    expect(docs.queries, isEmpty);
    await expectLater(
      repo.unregisterDevice(
        CommandId('foreign'),
        NotificationDeviceDto.fromMap(
          view('other', owner: 'bob'),
          OwnerUid('bob'),
        ),
      ),
      throwsArgumentError,
    );
  });
  test(
    'device pages bind the cursor to the owner and requested limit',
    () async {
      final commands = DeviceCommands(owner)
        ..responses.addAll([
          {
            'devices': [view('a')],
            'nextCursor': 'a',
          },
          {
            'devices': [view('b')],
            'nextCursor': null,
          },
        ]);
      final repo = FirestoreNotificationRepository(
            NotificationDocuments(owner),
            commands,
          ),
          query = NotificationDeviceQuery(limit: 1);
      final first = await repo.listDevices(CommandId('list'), query);
      expect(first.hasMore, isTrue);
      expect(first.isFromCache, isFalse);
      final second = await repo.listDevices(
        CommandId('next'),
        query,
        after: first.nextCursor,
      );
      expect(second.items.single.installationId, 'b');
      expect(commands.calls.last.$3, {'limit': 1, 'after': 'a'});
      await expectLater(
        repo.listDevices(
          CommandId('wrong-limit'),
          NotificationDeviceQuery(limit: 2),
          after: first.nextCursor,
        ),
        throwsArgumentError,
      );
      final other = FirestoreNotificationRepository(
        NotificationDocuments(OwnerUid('bob')),
        DeviceCommands(OwnerUid('bob')),
      );
      await expectLater(
        other.listDevices(CommandId('foreign'), query, after: first.nextCursor),
        throwsArgumentError,
      );
    },
  );
  test(
    'device response ID must match the installation just registered',
    () async {
      final commands = DeviceCommands(owner)
        ..responses.add({'device': view('different')});
      final repo = FirestoreNotificationRepository(
        NotificationDocuments(owner),
        commands,
      );
      await expectLater(
        repo.registerDevice(CommandId('register'), registration()),
        throwsA(anything),
      );
    },
  );
  test(
    'device pages reject too many, duplicate, unsorted or foreign records',
    () async {
      for (final devices in [
        [view('a'), view('b')],
        [view('a'), view('a')],
        [view('b'), view('a')],
        [view('a', owner: 'bob')],
      ]) {
        final commands = DeviceCommands(owner)
          ..responses.add({'devices': devices, 'nextCursor': null});
        final repo = FirestoreNotificationRepository(
          NotificationDocuments(owner),
          commands,
        );
        await expectLater(
          repo.listDevices(
            CommandId('list'),
            NotificationDeviceQuery(
              limit:
                  devices.length == 2 &&
                      devices[0]['installationId'] == 'a' &&
                      devices[1]['installationId'] == 'b'
                  ? 1
                  : 2,
            ),
          ),
          throwsA(anything),
        );
      }
    },
  );
  test('registration validates capability, revision, ID and token before calling Firebase', () {
    expect(() => NotificationDeviceQuery(limit: 51), throwsArgumentError);
    expect(
      () => NotificationDeviceRegistration(
        installationId: 'browser',
        platform: NotificationDevicePlatform.web,
        permission: NotificationPermission.denied,
        channel: NotificationChannel.push,
        token: 'synthetic-notification-token-browser',
        appVersion: '0.1.0',
        expectedRevision: 0,
      ),
      throwsArgumentError,
    );
    expect(
      () => NotificationDeviceRegistration(
        installationId: 'browser',
        platform: NotificationDevicePlatform.web,
        permission: NotificationPermission.granted,
        channel: NotificationChannel.local,
        token: null,
        appVersion: '0.1.0',
        expectedRevision: 0,
      ),
      throwsArgumentError,
    );
  });
}
