import 'dart:async';

import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/notifications/domain/notification_preferences.dart';
import 'package:tally/features/notifications/domain/notification_repository.dart';
import 'package:tally/features/notifications/domain/notification_device.dart';
import 'package:tally/features/notifications/domain/reminder_entry.dart';
import 'package:tally/features/notifications/data/notification_dto.dart';
import 'package:tally/features/obligations/domain/obligation.dart';
import 'package:tally/features/recurring/domain/recurring_schedule.dart';
import 'package:tally/shared/domain/data_page.dart';

import '../features/notifications/notification_repository_test.dart'
    show reminderData;
import '../features/notifications/notification_device_test.dart' show view;

import 'package:tally/features/notifications/data/notification_device_dto.dart';

final class AlertCursor implements PageCursor {
  const AlertCursor();
}

class FakeNotifications implements NotificationRepository {
  FakeNotifications({OwnerUid? owner}) : owner = owner ?? OwnerUid('alice') {
    preferences = NotificationPreferences.defaults(this.owner);
  }
  @override
  final OwnerUid owner;
  late NotificationPreferences preferences;
  final entries = <ReminderEntry>[];
  bool cached = false, more = false;
  Object? error;
  final commands = <(String, CommandId, Object)>[];
  final updates = StreamController<NotificationPreferences>.broadcast();
  final scheduled = StreamController<DataPage<ReminderEntry>>.broadcast();
  NotificationDevice? device;
  Completer<NotificationDevice>? registration;
  Completer<NotificationDevice>? unregistration;
  DataPage<ReminderEntry> page() => DataPage(
    items: entries,
    nextCursor: more ? const AlertCursor() : null,
    hasMore: more,
    isFromCache: cached,
  );
  @override
  Stream<NotificationPreferences> watchPreferences() async* {
    yield preferences;
    yield* updates.stream;
  }

  @override
  Stream<DataPage<ReminderEntry>> watchInbox(NotificationInboxQuery query) =>
      Stream.value(page());
  @override
  Future<DataPage<ReminderEntry>> getInbox(
    NotificationInboxQuery query, {
    PageCursor? after,
  }) async {
    more = false;
    return page();
  }

  @override
  Future<int> updatePreferences(
    CommandId id,
    NotificationPreferences value,
  ) async {
    commands.add(('preferences', id, value));
    if (error != null) throw error!;
    preferences = NotificationPreferences.fromPolicyMap(
      owner,
      value.toPolicyMap(),
      revision: value.revision + 1,
    );
    updates.add(preferences);
    return preferences.revision;
  }

  @override
  Future<int> markRead(CommandId id, String entry, int revision) async {
    commands.add(('read', id, entry));
    if (error != null) throw error!;
    return revision + 1;
  }

  @override
  Future<int> setObligationPolicy(
    CommandId id,
    Obligation parent,
    ReminderPolicy policy,
  ) async {
    commands.add(('policy', id, policy));
    if (error != null) throw error!;
    return parent.revision + 1;
  }

  @override
  Future<NotificationDevice> registerDevice(
    CommandId id,
    NotificationDeviceRegistration value,
  ) async {
    commands.add(('register', id, value));
    if (registration != null) return registration!.future;
    return device = NotificationDeviceDto.fromMap({
      ...view(
        value.installationId,
        owner: owner.value,
        revision: value.expectedRevision + 1,
      ),
      'platform': value.platform.name,
      'permission': value.permission.name,
      'channel': value.channel.name,
      'active': value.channel != NotificationChannel.none,
    }, owner);
  }

  @override
  Future<NotificationDevice> unregisterDevice(
    CommandId id,
    NotificationDevice value,
  ) async {
    commands.add(('unregister', id, value));
    if (unregistration != null) return unregistration!.future;
    return device = NotificationDeviceDto.fromMap({
      ...view(
        value.installationId,
        owner: owner.value,
        revision: value.revision + 1,
      ),
      'active': false,
      'channel': 'none',
    }, owner);
  }

  @override
  Future<DataPage<NotificationDevice>> listDevices(
    CommandId id,
    NotificationDeviceQuery query, {
    PageCursor? after,
  }) async => DataPage(
    items: device == null ? [] : [device!],
    nextCursor: null,
    hasMore: false,
    isFromCache: false,
  );
  @override
  Stream<DataPage<ReminderEntry>> watchUpcoming(
    NotificationUpcomingQuery query,
  ) => scheduled.stream;
  @override
  Future<DataRecord<ReminderEntry>?> getReminder(String id) async {
    final found = entries.where((entry) => entry.id == id);
    return found.isEmpty ? null : DataRecord(found.first, isFromCache: cached);
  }

  ReminderEntry entry(String id, {Map<String, Object?> patch = const {}}) =>
      NotificationDto.entry(id, {
        ...reminderData(id),
        'userId': owner.value,
        ...patch,
      }, owner);
  Future<void> dispose() async {
    await updates.close();
    await scheduled.close();
  }
}
