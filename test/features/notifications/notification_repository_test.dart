import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/notifications/data/notification_dto.dart';
import 'package:tally/features/notifications/data/firestore_notification_repository.dart';
import 'package:tally/features/notifications/domain/notification_preferences.dart';
import 'package:tally/features/notifications/domain/notification_repository.dart';
import 'package:tally/features/notifications/domain/reminder_entry.dart';
import 'package:tally/features/obligations/data/obligation_dto.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/data/owner_command_gateway.dart';

import '../../support/upcoming_fixtures.dart';
import '../financial/financial_dto_test.dart' show audit, obligationData;

Map<String, Object?> reminderData(String id) => {
  ...audit,
  'reminderId': id,
  'obligationId': 'loan-1',
  'instanceId': 'period-1',
  'kind': 'dueToday',
  'phase': 'due',
  'civilTargetDate': '2026-10-05',
  'scheduledAt': DateTime.utc(2026, 10, 5, 1),
  'savedTimezone': 'Asia/Manila',
  'quietTimezone': 'America/New_York',
  'preferenceRevision': 1,
  'policyRevision': 1,
  'parentRevision': 1,
  'instanceRevision': 1,
  'status': 'sent',
  'visible': true,
  'visibleAt': DateTime.utc(2026, 10, 5, 1),
  'readAt': null,
  'revision': 1,
  'title': 'Personal loan',
  'amountMinor': 50000,
  'currency': 'PHP',
  'messageKey': 'reminder.dueToday',
  'deliverySummary': <String, Object?>{},
};

class NotificationDocuments implements OwnerDocumentGateway {
  NotificationDocuments(this.owner);
  @override
  final OwnerUid owner;
  final queries = <DocumentQuery>[];
  final records = <(String, String)>[];
  final pages = <RawPage>[];
  @override
  Stream<RawPage> watchPage(DocumentQuery query) => Stream.value(_page(query));
  RawPage _page(DocumentQuery query) {
    queries.add(query);
    return pages.removeAt(0);
  }

  @override
  Future<RawPage> getPage(DocumentQuery query) async => _page(query);
  @override
  Stream<RawRecord> watchDocument(String collection, String id) {
    records.add((collection, id));
    return Stream.value(
      RawRecord(
        RawDocument(id, {
          ...audit,
          ...NotificationPreferences.defaults(owner).toPolicyMap(),
          'userId': owner.value,
          'revision': 3,
        }),
        isFromCache: false,
      ),
    );
  }
}

class NotificationCommands implements OwnerCommandGateway {
  NotificationCommands(this.owner);
  @override
  final OwnerUid owner;
  final calls = <(String, CommandId, Map<String, Object?>)>[];
  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId id,
    Map<String, Object?> payload,
  ) async {
    calls.add((name, id, payload));
    return name == 'markReminderRead'
        ? {'reminderId': payload['reminderId'], 'reminderRevision': 2}
        : {'preferenceRevision': 4};
  }
}

void main() {
  final owner = OwnerUid('alice');
  final until = DateTime.utc(2026, 10, 5, 4);
  test(
    'private timestamp query signatures serialize UTC and bind the page limit',
    () {
      DocumentQuery query(DateTime date, int limit) => DocumentQuery(
        'reminders',
        limit: limit,
        equals: const {'visible': true},
        ranges: [
          DocumentRange('scheduledAt', RangeComparison.lessThanOrEqual, date),
        ],
        order: const [DocumentOrder('scheduledAt', descending: true)],
      );
      final signature = privateQuerySignature(query(until, 50));
      expect(signature, contains('2026-10-05T04:00:00.000Z'));
      expect(
        privateQuerySignature(
          query(DateTime.parse('2026-10-05T12:00:00+08:00'), 50),
        ),
        signature,
      );
      expect(privateQuerySignature(query(until, 20)), isNot(signature));
    },
  );
  test(
    'canonical preferences use default and keep the loaded revision',
    () async {
      final docs = NotificationDocuments(owner);
      final repo = FirestoreNotificationRepository(
        docs,
        NotificationCommands(owner),
      );
      final result = await repo.watchPreferences().first;
      expect(docs.records, [('notificationPreferences', 'default')]);
      expect(result.owner, owner);
      expect(result.revision, 3);
    },
  );
  test('inbox query remains owner/cutoff-bound beyond the first page and discloses cache', () async {
    final docs = NotificationDocuments(owner)
      ..pages.addAll([
        RawPage(
          documents: [RawDocument('first', reminderData('first'))],
          nextCursor: const FixtureCursor(1),
          hasMore: true,
          isFromCache: true,
        ),
        RawPage(
          documents: [RawDocument('second', reminderData('second'))],
          nextCursor: null,
          hasMore: false,
          isFromCache: false,
        ),
      ]);
    final repo = FirestoreNotificationRepository(
      docs,
      NotificationCommands(owner),
    );
    final request = NotificationInboxQuery(until: until);
    final first = await repo.watchInbox(request).first;
    expect(first.items.single.id, 'first');
    expect(first.isFromCache, isTrue);
    final second = await repo.getInbox(request, after: first.nextCursor);
    expect(second.items.single.id, 'second');
    expect(second.hasMore, isFalse);
    final query = docs.queries.first;
    expect(query.collection, 'reminders');
    expect(query.equals, {'visible': true});
    expect(query.limit, 50);
    expect(query.order.single.field, 'scheduledAt');
    expect(query.order.single.descending, isTrue);
    expect(query.ranges.single.value, until);
    expect(query.ranges.single.comparison, RangeComparison.lessThanOrEqual);
    final other = FirestoreNotificationRepository(
      NotificationDocuments(OwnerUid('bob')),
      NotificationCommands(OwnerUid('bob')),
    );
    await expectLater(
      other.getInbox(request, after: first.nextCursor),
      throwsArgumentError,
    );
    await expectLater(
      repo.getInbox(
        NotificationInboxQuery(until: until.add(const Duration(minutes: 1))),
        after: first.nextCursor,
      ),
      throwsArgumentError,
    );
  });
  test(
    'preference/read commands retain exact loaded revisions and action IDs',
    () async {
      final commands = NotificationCommands(owner);
      final repo = FirestoreNotificationRepository(
        NotificationDocuments(owner),
        commands,
      );
      final preference = NotificationPreferences.fromPolicyMap(
        owner,
        NotificationPreferences.defaults(owner).toPolicyMap(),
        revision: 3,
      );
      final action = CommandId('save-preferences');
      expect(await repo.updatePreferences(action, preference), 4);
      expect(commands.calls.single.$1, 'updateNotificationPreferences');
      expect(commands.calls.single.$2, action);
      expect(commands.calls.single.$3['expectedRevision'], 3);
      expect(commands.calls.single.$3['preferences'], preference.toPolicyMap());
      await repo.markRead(CommandId('mark-read'), 'first', 1);
      expect(commands.calls.last.$3, {
        'reminderId': 'first',
        'expectedRevision': 1,
      });
    },
  );
  test(
    'finite custom reminders are read without changing legacy financial data',
    () {
      final raw = obligationData();
      expect(
        ObligationDto.fromMap('loan-1', raw, owner).reminderPolicy,
        isNull,
      );
      final parent = ObligationDto.fromMap('loan-1', {
        ...raw,
        'reminderPolicy': {
          'enabled': true,
          'offsetDays': [7, 0],
          'localTime': '10:00',
        },
        'reminderRevision': 1,
      }, owner);
      expect(parent.reminderPolicy!.offsetDays, [7, 0]);
      expect(
        parent.originalAmount,
        ObligationDto.fromMap('loan-1', raw, owner).originalAmount,
      );
    },
  );
  test('unknown native amounts retain currency and independently valid reminder state', () {
    final entry = NotificationDto.entry('variable', {
      ...reminderData('variable'),
      'amountMinor': null,
      'currency': 'USD',
      'kind': 'automaticConfirmation',
      'phase': 'confirmation',
      'status': 'failed',
    }, owner);
    expect(entry.amount, isNull);
    expect(entry.currency, CurrencyCode.usd);
    expect(entry.kind, ReminderKind.automaticConfirmation);
    expect(entry.status, ReminderStatus.failed);
    expect(entry.readAt, isNull);
  });
  for (final patch in <Map<String, Object?>>[
    {'userId': 'bob'},
    {'reminderId': 'other'},
    {'schemaVersion': 2},
    {'kind': 'futureKind'},
    {'phase': 'futurePhase'},
    {'status': 'futureState'},
    {'savedTimezone': 'Mars/Base'},
    {'quietTimezone': 'Mars/Base'},
    {'currency': 'XYZ'},
    {'amountMinor': -1},
    {'readAt': 'yesterday'},
    {'visibleAt': null},
    {'revision': 0},
  ]) {
    test(
      'invalid reminder $patch is read-only rather than an invented record',
      () {
        expect(
          () => NotificationDto.entry('record', {
            ...reminderData('record'),
            ...patch,
          }, owner),
          throwsA(anything),
        );
      },
    );
  }
  test(
    'cancelled or future records cannot leak into a published inbox page',
    () async {
      for (final patch in <Map<String, Object?>>[
        {'status': 'cancelled', 'visible': false, 'visibleAt': null},
        {'scheduledAt': until.add(const Duration(days: 1))},
      ]) {
        final docs = NotificationDocuments(owner)
          ..pages.add(
            RawPage(
              documents: [
                RawDocument('record', {...reminderData('record'), ...patch}),
              ],
              nextCursor: null,
              hasMore: false,
              isFromCache: false,
            ),
          );
        final repo = FirestoreNotificationRepository(
          docs,
          NotificationCommands(owner),
        );
        await expectLater(
          repo.watchInbox(NotificationInboxQuery(until: until)).first,
          throwsA(anything),
        );
      }
    },
  );
}
