import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/dates/year_month.dart';
import 'package:tally/features/calendar/presentation/calendar_screen.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';

import '../../support/recurring_fixtures.dart';
import '../../support/search_gateway.dart';
import '../../support/search_ui.dart';

RawDocument bill(
  String id,
  String title,
  String date, {
  Map<String, Object?> patch = const {},
}) {
  final raw = recurringData('scheduled');
  raw.addAll({
    'instanceId': id,
    'dueDate': date,
    'occurrenceDate': date,
    'snapshot': {
      ...raw['snapshot'] as Map<String, Object?>,
      'title': title,
      if (patch.containsKey('estimatedAmountMinor'))
        'estimatedAmountMinor': patch['estimatedAmountMinor'],
    },
    ...patch,
  });
  return RawDocument(id, raw);
}

void main() {
  testWidgets(
    'calendar shows real civil month, selected day and Today in profile zone',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final docs = CandidateDocuments(recurringOwner, [
        bill('october', 'October Internet', '2026-10-01'),
        bill('today', 'Today rent', '2026-10-04'),
        bill('november', 'November Internet', '2026-11-01'),
      ]);
      await searchHost(
        tester,
        docs,
        const CalendarScreen(),
        timezone: 'America/Los_Angeles',
        now: DateTime.utc(2026, 10, 5, 4),
      );
      expect(find.text('October 2026'), findsOneWidget);
      expect(find.text('October Internet'), findsOneWidget);
      expect(find.text('November Internet'), findsNothing);
      await tester.tap(find.byKey(const Key('calendar-day-2026-10-01')));
      await tester.pumpAndSettle();
      expect(find.text('October Internet'), findsOneWidget);
      expect(find.text('Today rent'), findsNothing);
      await tester.tap(find.byKey(const Key('calendar-next')));
      await tester.pumpAndSettle();
      expect(find.text('November 2026'), findsOneWidget);
      expect(find.text('November Internet'), findsOneWidget);
      await tester.tap(find.text('Today'));
      await tester.pumpAndSettle();
      expect(find.text('Today rent'), findsOneWidget);
      expect(find.text('October Internet'), findsNothing);
      expect(find.text('Due 2026-10-04'), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'unknown estimates, overdue and paid records remain distinct across currencies',
    (tester) async {
      final docs = CandidateDocuments(recurringOwner, [
        bill('overdue', 'Overdue Internet', '2026-10-01'),
        bill(
          'variable',
          'Electricity',
          '2026-10-15',
          patch: {
            'amountMinor': null,
            'amountState': 'unknown',
            'remainingMinor': null,
            'estimatedAmountMinor': 350000,
          },
        ),
        bill(
          'paid',
          'Paid subscription',
          '2026-10-18',
          patch: {
            'totalPaidMinor': 54900,
            'remainingMinor': 0,
            'closed': true,
            'financialStatus': 'paid',
          },
        ),
        bill(
          'usd',
          'USD subscription',
          '2026-10-20',
          patch: {
            'currency': 'USD',
            'amountMinor': 50000,
            'remainingMinor': 50000,
          },
        ),
      ]);
      await searchHost(tester, docs, const CalendarScreen());
      expect(find.text('Overdue'), findsOneWidget);
      expect(find.text('Amount needed'), findsOneWidget);
      expect(find.textContaining('Estimate'), findsWidgets);
      expect(find.text('Paid'), findsOneWidget);
      expect(find.text(r'$500 USD'), findsWidgets);
      expect(find.text('₱3,500 PHP'), findsWidgets);
      expect(find.textContaining('Total'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  for (final edge in ['1900-01', '2199-12']) {
    testWidgets('calendar navigation respects $edge boundary', (tester) async {
      await searchHost(
        tester,
        CandidateDocuments(recurringOwner, []),
        CalendarScreen(initialMonth: YearMonth.parse(edge)),
      );
      final button = tester.widget<IconButton>(
        find.byKey(
          Key(edge == '1900-01' ? 'calendar-previous' : 'calendar-next'),
        ),
      );
      expect(button.onPressed, isNull);
      expect(tester.takeException(), isNull);
    });
  }

  for (final width in [320.0, 375.0, 800.0, 1440.0]) {
    for (final dark in [false, true]) {
      testWidgets(
        'calendar $width dark=$dark stays usable at 200 percent text',
        (tester) async {
          tester.view.physicalSize = Size(width, 1000);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.reset);
          await searchHost(
            tester,
            CandidateDocuments(recurringOwner, [
              bill(
                'unknown',
                'A very long electricity billing statement',
                '2026-10-15',
                patch: {
                  'amountMinor': null,
                  'amountState': 'unknown',
                  'remainingMinor': null,
                  'estimatedAmountMinor': 350000,
                },
              ),
            ]),
            const CalendarScreen(),
            scale: 2,
            dark: dark,
          );
          await tester.ensureVisible(find.text('Amount needed'));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.ensureVisible(find.byKey(const Key('calendar-next')));
          await tester.tap(find.byKey(const Key('calendar-next')));
          await tester.pumpAndSettle();
          expect(find.text('November 2026'), findsOneWidget);
        },
      );
    }
  }
}
