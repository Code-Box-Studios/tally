import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/notifications/data/firestore_notification_repository.dart';
import 'package:tally/features/notifications/domain/notification_repository.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';

import 'notification_repository_test.dart';

void main() {
  final owner = OwnerUid('alice'), now = DateTime.utc(2026, 10, 5);
  test('local plans query only bounded future pending owner reminders and preserve cache', () async {
    final docs = NotificationDocuments(owner)
      ..pages.add(
        RawPage(
          documents: [
            RawDocument('future', {
              ...reminderData('future'),
              'scheduledAt': now.add(const Duration(days: 1)),
              'status': 'pending',
              'visible': false,
              'visibleAt': null,
            }),
          ],
          nextCursor: null,
          hasMore: false,
          isFromCache: true,
        ),
      );
    final repo = FirestoreNotificationRepository(
      docs,
      NotificationCommands(owner),
    );
    final page = await repo
        .watchUpcoming(NotificationUpcomingQuery(from: now))
        .first;
    expect(page.items.single.id, 'future');
    expect(page.isFromCache, isTrue);
    expect(docs.queries.single.equals, {'visible': false, 'status': 'pending'});
    expect(docs.queries.single.limit, 50);
    expect(
      docs.queries.single.ranges.single.comparison,
      RangeComparison.greaterThan,
    );
  });
  test(
    'already visible, past or cancelled records cannot be scheduled locally',
    () async {
      for (final patch in [
        {'visible': true, 'visibleAt': now},
        {'scheduledAt': now},
        {'status': 'cancelled'},
      ]) {
        final docs = NotificationDocuments(owner)
          ..pages.add(
            RawPage(
              documents: [
                RawDocument('bad', {
                  ...reminderData('bad'),
                  'status': 'pending',
                  'visible': false,
                  'visibleAt': null,
                  'scheduledAt': now.add(const Duration(days: 1)),
                  ...patch,
                }),
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
          repo.watchUpcoming(NotificationUpcomingQuery(from: now)).first,
          throwsA(anything),
        );
      }
    },
  );
}
