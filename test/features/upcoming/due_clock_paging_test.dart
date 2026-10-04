import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/dates/financial_clock.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/dashboard/presentation/widgets/home_due.dart';
import 'package:tally/features/obligations/domain/due_query.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import '../../support/upcoming_fixtures.dart';
import '../auth/session_controller_test.dart' show profile;

final _testClock = NotifierProvider<_TestClock, DateTime>(_TestClock.new);

class _TestClock extends Notifier<DateTime> {
  @override
  DateTime build() => DateTime.utc(2026, 10, 4, 7, 1);
  void set(DateTime now) => state = now;
}

void main() {
  test('query identity is stable within civil days and changes for a saved-zone rollover', () {
    DueQuery at(DateTime now) => DueQuery(group: DueGroup.upcoming, now: now);
    final first = at(DateTime.utc(2026, 10, 4, 7, 1));
    final minute = at(DateTime.utc(2026, 10, 4, 7, 2));
    expect(minute, first);
    expect(minute.hashCode, first.hashCode);
    // Kiritimati advances to October 5 while UTC and Manila remain October 4.
    expect(
      at(DateTime.utc(2026, 10, 4, 9, 59)),
      isNot(at(DateTime.utc(2026, 10, 4, 10))),
    );
  });

  testWidgets(
    'loaded continuation survives a minute tick and reclassifies at a saved-zone midnight',
    (tester) async {
      final owner = OwnerUid('alice');
      Map<String, Object?> instance(String id, String title) => {
        ...instanceData(id, timezone: 'Pacific/Kiritimati'),
        'direction': 'owedToMe',
        'section': 'owedToMe',
        'snapshot': {'title': title},
      };
      final docs = UpcomingDocuments(owner)
        ..pages.addAll([
          RawPage(
            documents: [
              RawDocument('first', instance('first', 'First repayment')),
            ],
            nextCursor: const FixtureCursor(1),
            hasMore: true,
            isFromCache: false,
          ),
          RawPage(
            documents: [
              RawDocument('second', instance('second', 'Second repayment')),
            ],
            nextCursor: null,
            hasMore: false,
            isFromCache: false,
          ),
        ]);
      final container = ProviderContainer(
        overrides: [
          ownerUidProvider.overrideWithValue(owner),
          userProfileProvider.overrideWithValue(profile('alice')),
          financialClockProvider.overrideWith((ref) => ref.watch(_testClock)),
          ownerDocumentsFactoryProvider.overrideWithValue((_) => docs),
          ownerCommandsFactoryProvider.overrideWithValue(UpcomingCommands.new),
        ],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: Scaffold(body: SingleChildScrollView(child: HomeExpected())),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Load more'));
      await tester.pumpAndSettle();
      expect(find.text('Second repayment'), findsOneWidget);
      final reads = docs.queries.length;
      container.read(_testClock.notifier).set(DateTime.utc(2026, 10, 4, 7, 2));
      await tester.pumpAndSettle();
      expect(find.text('First repayment'), findsOneWidget);
      expect(find.text('Second repayment'), findsOneWidget);
      expect(docs.queries.length, reads);
      container.read(_testClock.notifier).set(DateTime.utc(2026, 10, 4, 10));
      await tester.pumpAndSettle();
      expect(find.text('First repayment'), findsNothing);
      expect(find.text('Second repayment'), findsNothing);
      expect(find.text('Nothing due in the next 30 days.'), findsOneWidget);
      expect(docs.queries.length, greaterThan(reads));
      expect(tester.takeException(), isNull);
    },
  );
}
