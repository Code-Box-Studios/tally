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

final class _InboxCursor implements PageCursor {
  const _InboxCursor(this.owner, this.query, this.raw);
  final OwnerUid owner;
  final NotificationInboxQuery query;
  final PageCursor raw;
}

final class FirestoreNotificationRepository extends FinancialRepositoryBase
    implements NotificationRepository {
  FirestoreNotificationRepository(super.documents, super.commands);
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
