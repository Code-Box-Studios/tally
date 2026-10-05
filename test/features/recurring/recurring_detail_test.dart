import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/obligations/data/obligation_dto.dart';
import 'package:tally/features/recurring/presentation/recurring_detail.dart';
import 'package:tally/features/obligations/presentation/obligation_detail_screen.dart';
import 'package:tally/features/obligations/presentation/obligation_row.dart';
import 'package:tally/features/dashboard/presentation/widgets/home_due.dart';

import '../../support/recurring_fixtures.dart';
import '../../support/recurring_ui.dart';
import '../../support/upcoming_fixtures.dart';

void main() {
  testWidgets('desktop dues table identifies the fee column as per period', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1440, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final docs = recurringUiDocuments(),
        commands = UpcomingCommands(recurringOwner);
    addTearDown(docs.changes.close);
    final raw = recurringData('parent');
    await recurringHost(
      tester,
      docs,
      commands,
      ObligationList([
        ObligationDto.fromMap(
          raw['obligationId'] as String,
          raw,
          recurringOwner,
        ),
      ]),
    );
    expect(find.text('Per period'), findsOneWidget);
    expect(find.text('Remaining'), findsNothing);
    expect(find.text('Schedule'), findsOneWidget);
  });
  testWidgets(
    'billing periods and resolution actions fit 320px with 200% text',
    (tester) async {
      tester.view.physicalSize = const Size(320, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final docs = recurringUiDocuments(period: 'failed'),
          commands = UpcomingCommands(recurringOwner);
      addTearDown(docs.changes.close);
      final raw = recurringData('parent');
      await recurringHost(
        tester,
        docs,
        commands,
        RecurringDetail(
          parent: ObligationDto.fromMap(
            raw['obligationId'] as String,
            raw,
            recurringOwner,
          ),
        ),
        scale: 2,
      );
      await tester.ensureVisible(find.text('Retry manually'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('Home automatic preview labels a genuine scheduled deduction', (
    tester,
  ) async {
    final docs = recurringUiDocuments(),
        commands = UpcomingCommands(recurringOwner);
    addTearDown(docs.changes.close);
    final period = docs.data['obligationInstances']!.values.single;
    period['dueDate'] = '2026-10-10';
    period['deductionDate'] = '2026-10-10';
    period['occurrenceDate'] = '2026-10-10';
    period['deductionAt'] = DateTime.utc(2026, 10, 10, 1);
    await recurringHost(
      tester,
      docs,
      commands,
      const SingleChildScrollView(child: HomeAutomatic()),
      now: DateTime.utc(2026, 10, 5),
    );
    expect(find.text('Scheduled deduction'), findsOneWidget);
    expect(find.text('Amount needed'), findsNothing);
  });
  testWidgets(
    'monthly due list shows the per-period fee and lifecycle without a lifetime balance',
    (tester) async {
      final docs = recurringUiDocuments(),
          commands = UpcomingCommands(recurringOwner);
      addTearDown(docs.changes.close);
      final raw = recurringData('parent'),
          parent = ObligationDto.fromMap(
            raw['obligationId'] as String,
            raw,
            recurringOwner,
          );
      await recurringHost(tester, docs, commands, ObligationRow(parent));
      expect(find.text('No due date set'), findsNothing);
      expect(find.text('Active'), findsOneWidget);
      expect(find.textContaining('PHP'), findsWidgets);
      expect(find.text('Remaining'), findsNothing);
    },
  );
  testWidgets('ending generation keeps existing periods and their payments', (
    tester,
  ) async {
    final docs = recurringUiDocuments(),
        commands = UpcomingCommands(recurringOwner)
          ..response = recurringUiResponse();
    addTearDown(docs.changes.close);
    final raw = recurringData('parent'),
        parent = ObligationDto.fromMap(
          raw['obligationId'] as String,
          raw,
          recurringOwner,
        );
    await recurringHost(
      tester,
      docs,
      commands,
      RecurringDetail(parent: parent),
    );
    await tester.tap(find.text('End'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Existing periods'), findsWidgets);
    await tester.ensureVisible(find.byKey(const Key('lifecycle-save')));
    await tester.tap(find.byKey(const Key('lifecycle-save')));
    await tester.pumpAndSettle();
    expect(commands.calls.single.payload['action'], 'end');
    expect(docs.data['obligationInstances']!.length, 1);
  });
  testWidgets(
    'variable period shows amount needed and opens one-period bill amount editor',
    (tester) async {
      final docs = recurringUiDocuments(period: 'variable'),
          commands = UpcomingCommands(recurringOwner)
            ..response = recurringUiResponse();
      addTearDown(docs.changes.close);
      final raw = docs.data['obligations']!.values.single,
          parent = ObligationDto.fromMap(
            raw['obligationId'] as String,
            raw,
            recurringOwner,
          );
      await recurringHost(
        tester,
        docs,
        commands,
        RecurringDetail(parent: parent),
      );
      expect(find.text('Amount needed'), findsOneWidget);
      expect(find.text('Overdue'), findsOneWidget);
      expect(find.textContaining('Estimate'), findsWidgets);
      await tester.ensureVisible(find.text('Enter amount'));
      await tester.tap(find.text('Enter amount'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('period-amount')), '3810');
      await tester.enterText(
        find.byKey(const Key('period-reason')),
        'October bill',
      );
      await tester.ensureVisible(find.byKey(const Key('period-save')));
      await tester.tap(find.byKey(const Key('period-save')));
      await tester.pumpAndSettle();
      expect(commands.calls.single.name, 'setRecurringAmount');
      expect(
        commands.calls.single.payload['instanceId'],
        recurringData('variable')['instanceId'],
      );
      expect(commands.calls.single.payload['amountMinor'], 381000);
    },
  );
  testWidgets(
    'pause preview explains retained periods and sends exact lifecycle revision',
    (tester) async {
      final docs = recurringUiDocuments(),
          commands = UpcomingCommands(recurringOwner)
            ..response = recurringUiResponse();
      addTearDown(docs.changes.close);
      final raw = recurringData('parent'),
          parent = ObligationDto.fromMap(
            raw['obligationId'] as String,
            raw,
            recurringOwner,
          );
      await recurringHost(
        tester,
        docs,
        commands,
        RecurringDetail(parent: parent),
      );
      await tester.tap(find.text('Pause'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Existing periods'), findsWidgets);
      await tester.ensureVisible(find.byKey(const Key('lifecycle-save')));
      await tester.tap(find.byKey(const Key('lifecycle-save')));
      await tester.pumpAndSettle();
      expect(commands.calls.single.name, 'changeRecurringLifecycle');
      expect(commands.calls.single.payload['expectedRevision'], 1);
    },
  );
  testWidgets(
    'recurring detail through obligation provider reads a genuine template without finite totals',
    (tester) async {
      final docs = recurringUiDocuments(),
          commands = UpcomingCommands(recurringOwner);
      addTearDown(docs.changes.close);
      final raw = recurringData('parent');
      final id = ObligationId(raw['obligationId'] as String);
      expect(id.value, isNotEmpty);
      await recurringHost(
        tester,
        docs,
        commands,
        ObligationDetailScreen(id: id),
      );
      expect(find.text('Billing periods'), findsOneWidget);
      expect(find.text('Original'), findsNothing);
      expect(find.textContaining('PHP'), findsWidgets);
    },
  );
}
