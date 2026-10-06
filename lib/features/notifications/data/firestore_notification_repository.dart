import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/document_reader.dart';
import '../../../shared/data/financial_failure_mapper.dart';
import '../../../shared/data/financial_repository_base.dart';
import '../../../shared/data/owner_document_gateway.dart';
import '../../../shared/domain/data_page.dart';
import '../../obligations/domain/obligation.dart';
import '../../recurring/domain/recurring_schedule.dart';
import '../domain/notification_preferences.dart';
import '../domain/notification_repository.dart';
import '../domain/reminder_entry.dart';
import 'notification_dto.dart';
import '../domain/notification_device.dart';
import 'notification_device_dto.dart';

final class _DeviceCursor implements PageCursor {
  const _DeviceCursor(this.owner, this.limit, this.after);
  final OwnerUid owner;
  final int limit;
  final String after;
}

final class _InboxCursor implements PageCursor {
  const _InboxCursor(this.owner, this.query, this.raw);
  final OwnerUid owner;
  final NotificationInboxQuery query;
  final PageCursor raw;
}

final class FirestoreNotificationRepository extends FinancialRepositoryBase
    implements NotificationRepository {
  FirestoreNotificationRepository(super.documents, super.commands);
  @override
  Stream<DataPage<ReminderEntry>> watchUpcoming(
    NotificationUpcomingQuery query,
  ) => watch(
    DocumentQuery(
      'reminders',
      limit: 50,
      equals: const {'visible': false, 'status': 'pending'},
      ranges: [
        DocumentRange('scheduledAt', RangeComparison.greaterThan, query.from),
      ],
      order: const [DocumentOrder('scheduledAt')],
    ),
    (raw) {
      final entry = NotificationDto.entry(raw.id, raw.data, owner);
      if (entry.visibleAt != null ||
          entry.status != ReminderStatus.pending ||
          !entry.scheduledAt.isAfter(query.from)) {
        throw DocumentReader.invalid();
      }
      return entry;
    },
  );
  @override
  Future<DataRecord<ReminderEntry>?> getReminder(String id) async {
    CommandId(id);
    try {
      final record = await documents.watchDocument('reminders', id).first;
      return record.document == null
          ? null
          : DataRecord(
              NotificationDto.entry(id, record.document!.data, owner),
              isFromCache: record.isFromCache,
            );
    } catch (error) {
      throw financialFailure(error);
    }
  }

  Future<NotificationDevice> _deviceCommand(
    String name,
    CommandId id,
    Map<String, Object?> payload,
    String installationId,
  ) async {
    try {
      final result = await commands.call(name, id, payload);
      final device = NotificationDeviceDto.fromMap(
        DocumentReader(result).object('device').data,
        owner,
      );
      if (device.installationId != installationId) {
        throw DocumentReader.invalid();
      }
      return device;
    } catch (error) {
      throw financialFailure(error);
    }
  }

  @override
  Future<NotificationDevice> registerDevice(
    CommandId commandId,
    NotificationDeviceRegistration registration,
  ) => _deviceCommand(
    'registerNotificationDevice',
    commandId,
    registration.toPayload(),
    registration.installationId,
  );
  @override
  Future<NotificationDevice> unregisterDevice(
    CommandId commandId,
    NotificationDevice device,
  ) async {
    if (device.owner != owner) {
      throw ArgumentError('This device belongs to another owner.');
    }
    return _deviceCommand('unregisterNotificationDevice', commandId, {
      'installationId': device.installationId,
      'expectedRevision': device.revision,
    }, device.installationId);
  }

  @override
  Future<DataPage<NotificationDevice>> listDevices(
    CommandId commandId,
    NotificationDeviceQuery query, {
    PageCursor? after,
  }) async {
    if (after != null &&
        (after is! _DeviceCursor ||
            after.owner != owner ||
            after.limit != query.limit)) {
      throw ArgumentError('Invalid device page cursor.');
    }
    final cursor = after as _DeviceCursor?;
    try {
      final r = DocumentReader(
        await commands.call('listNotificationDevices', commandId, {
          'limit': query.limit,
          'after': cursor?.after,
        }),
      );
      final devices = r
          .objects('devices', max: query.limit)
          .map((raw) => NotificationDeviceDto.fromMap(raw.data, owner))
          .toList();
      for (var i = 0; i < devices.length; i++) {
        final previous = i == 0 ? cursor?.after : devices[i - 1].installationId;
        if (previous != null &&
            devices[i].installationId.compareTo(previous) <= 0) {
          throw DocumentReader.invalid();
        }
      }
      final next = r.nullableText('nextCursor', max: 128);
      if (next != null) {
        CommandId(next);
        if (devices.length != query.limit ||
            devices.last.installationId != next) {
          throw DocumentReader.invalid();
        }
      }
      return DataPage(
        items: devices,
        nextCursor: next == null
            ? null
            : _DeviceCursor(owner, query.limit, next),
        hasMore: next != null,
        isFromCache: false,
      );
    } catch (error) {
      throw financialFailure(error);
    }
  }

  DocumentQuery _query(NotificationInboxQuery query, PageCursor? after) {
    PageCursor? cursor;
    if (after != null) {
      if (after is! _InboxCursor ||
          after.owner != owner ||
          after.query != query) {
        throw ArgumentError('Invalid private inbox cursor.');
      }
      cursor = after.raw;
    }
    return DocumentQuery(
      'reminders',
      limit: query.limit,
      after: cursor,
      equals: const {'visible': true},
      ranges: [
        DocumentRange(
          'scheduledAt',
          RangeComparison.lessThanOrEqual,
          query.until,
        ),
      ],
      order: const [DocumentOrder('scheduledAt', descending: true)],
    );
  }

  DataPage<ReminderEntry> _page(
    NotificationInboxQuery query,
    DataPage<ReminderEntry> page,
  ) => DataPage(
    items: page.items,
    hasMore: page.hasMore,
    isFromCache: page.isFromCache,
    nextCursor: page.nextCursor == null
        ? null
        : _InboxCursor(owner, query, page.nextCursor!),
  );
  ReminderEntry _map(NotificationInboxQuery query, RawDocument raw) {
    final entry = NotificationDto.entry(raw.id, raw.data, owner);
    if (entry.visibleAt == null ||
        entry.status == ReminderStatus.cancelled ||
        entry.scheduledAt.isAfter(query.until)) {
      throw DocumentReader.invalid();
    }
    return entry;
  }

  @override
  Stream<NotificationPreferences> watchPreferences() async* {
    try {
      await for (final record in documents.watchDocument(
        'notificationPreferences',
        'default',
      )) {
        if (record.document == null || record.document!.id != 'default') {
          throw DocumentReader.invalid();
        }
        yield NotificationDto.preferences(record.document!.data, owner);
      }
    } catch (error) {
      yield* Stream.error(financialFailure(error));
    }
  }

  @override
  Stream<DataPage<ReminderEntry>> watchInbox(NotificationInboxQuery query) =>
      watch(
        _query(query, null),
        (raw) => _map(query, raw),
      ).map((page) => _page(query, page));

  @override
  Future<DataPage<ReminderEntry>> getInbox(
    NotificationInboxQuery query, {
    PageCursor? after,
  }) async =>
      _page(query, await get(_query(query, after), (raw) => _map(query, raw)));
  Future<int> _command(
    String name,
    CommandId id,
    Map<String, Object?> payload,
    String revision,
  ) async {
    try {
      final result = await commands.call(name, id, payload);
      return DocumentReader(result).integer(revision, min: 1);
    } catch (error) {
      throw financialFailure(error);
    }
  }

  @override
  Future<int> updatePreferences(
    CommandId commandId,
    NotificationPreferences preferences,
  ) {
    if (preferences.owner != owner) {
      throw ArgumentError('Preferences belong to another owner.');
    }
    return _command('updateNotificationPreferences', commandId, {
      'expectedRevision': preferences.revision,
      'preferences': preferences.toPolicyMap(),
    }, 'preferenceRevision');
  }

  @override
  Future<int> markRead(
    CommandId commandId,
    String reminderId,
    int expectedRevision,
  ) {
    CommandId(reminderId);
    if (expectedRevision < 1) throw ArgumentError('Invalid reminder revision.');
    return _command('markReminderRead', commandId, {
      'reminderId': reminderId,
      'expectedRevision': expectedRevision,
    }, 'reminderRevision');
  }

  @override
  Future<int> setObligationPolicy(
    CommandId commandId,
    Obligation obligation,
    ReminderPolicy policy,
  ) {
    if (obligation.owner != owner ||
        obligation.section == ObligationSection.monthlyDues) {
      throw ArgumentError('Choose an owned loan or installment.');
    }
    return _command('setObligationReminder', commandId, {
      'obligationId': obligation.id.value,
      'expectedRevision': obligation.revision,
      'reminderPolicy': policy.toPayload(),
    }, 'obligationRevision');
  }
}
