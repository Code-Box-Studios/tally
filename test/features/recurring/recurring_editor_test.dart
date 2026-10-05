import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/features/recurring/presentation/recurring_editor.dart';

import '../../support/recurring_fixtures.dart';
import '../../support/recurring_ui.dart';
import '../../support/upcoming_fixtures.dart';

void main() {
  testWidgets(
    'USD bills preserve native currency instead of adding PHP values',
    (tester) async {
      final docs = recurringUiDocuments(),
          commands = UpcomingCommands(recurringOwner)
            ..response = recurringUiResponse();
      addTearDown(docs.changes.close);
      await recurringHost(
        tester,
        docs,
        commands,
        RecurringEditor(onSaved: (_) {}),
      );
      await tester.enterText(
        find.byKey(const Key('recurring-title')),
        'USD subscription',
      );
      await tester.ensureVisible(find.byKey(const Key('recurring-currency')));
      await tester.tap(find.byKey(const Key('recurring-currency')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(r'USD · $').last);
      await tester.pumpAndSettle();
      expect(find.text('Amount (USD)'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('recurring-amount')), '5.49');
      await tester.ensureVisible(find.byKey(const Key('recurring-save')));
      await tester.tap(find.byKey(const Key('recurring-save')));
      await tester.pumpAndSettle();
      expect(commands.calls.single.payload['currency'], 'USD');
      expect(commands.calls.single.payload['defaultAmountMinor'], 549);
    },
  );
  testWidgets(
    'uncertain creation keeps its original amount and command ID for retry',
    (tester) async {
      final docs = recurringUiDocuments(),
          commands = UpcomingCommands(recurringOwner)
            ..response = recurringUiResponse()
            ..failNext = true;
      addTearDown(docs.changes.close);
      await recurringHost(
        tester,
        docs,
        commands,
        RecurringEditor(onSaved: (_) {}),
      );
      await tester.enterText(
        find.byKey(const Key('recurring-title')),
        'Internet',
      );
      await tester.enterText(find.byKey(const Key('recurring-amount')), '1699');
      await tester.ensureVisible(find.byKey(const Key('recurring-save')));
      await tester.tap(find.byKey(const Key('recurring-save')));
      await tester.pumpAndSettle();
      expect(find.text('Retry original action'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('recurring-save')));
      await tester.tap(find.byKey(const Key('recurring-save')));
      await tester.pumpAndSettle();
      expect(commands.calls[0].id, commands.calls[1].id);
      expect(commands.calls[0].payload, commands.calls[1].payload);
    },
  );
  testWidgets(
    'automatic entry defaults confirmation and saves anchored dates and PHP549',
    (tester) async {
      final docs = recurringUiDocuments(),
          commands = UpcomingCommands(recurringOwner)
            ..response = recurringUiResponse();
      addTearDown(docs.changes.close);
      await recurringHost(
        tester,
        docs,
        commands,
        RecurringEditor(automatic: true, onSaved: (_) {}),
      );
      expect(find.text('Automatic with confirmation'), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('recurring-title')),
        'Netflix',
      );
      await tester.enterText(find.byKey(const Key('recurring-amount')), '549');
      await tester.enterText(
        find.byKey(const Key('recurrence-start')),
        '2026-10-04',
      );
      await tester.pump();
      expect(find.textContaining('2026-11-04'), findsWidgets);
      await tester.ensureVisible(find.byKey(const Key('recurring-save')));
      await tester.tap(find.byKey(const Key('recurring-save')));
      await tester.pumpAndSettle();
      expect(commands.calls.single.name, 'createRecurring');
      expect(
        commands.calls.single.payload['paymentMode'],
        'automaticConfirmation',
      );
      expect(commands.calls.single.payload['defaultAmountMinor'], 54900);
      expect(
        (commands.calls.single.payload['recurrence'] as Map)['startDate'],
        '2026-10-04',
      );
    },
  );
  testWidgets(
    'explicit assumption explains scheduled paid records and variable estimates are optional',
    (tester) async {
      final docs = recurringUiDocuments(),
          commands = UpcomingCommands(recurringOwner);
      addTearDown(docs.changes.close);
      await recurringHost(
        tester,
        docs,
        commands,
        const RecurringEditor(automatic: true),
      );
      await tester.ensureVisible(find.byKey(const Key('recurring-mode')));
      await tester.tap(find.byKey(const Key('recurring-mode')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Automatic').last);
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Tally will record this as paid on its schedule. You can correct it if the deduction fails.',
        ),
        findsOneWidget,
      );
      await tester.ensureVisible(find.byKey(const Key('recurring-kind')));
      await tester.tap(find.byKey(const Key('recurring-kind')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Variable amount').last);
      await tester.pumpAndSettle();
      expect(find.text('Estimated amount (optional, PHP)'), findsOneWidget);
    },
  );
  for (final size in [
    const Size(320, 640),
    const Size(375, 812),
    const Size(800, 1000),
    const Size(1440, 1000),
  ]) {
    testWidgets('recurring fields remain reachable at $size and 200% text', (
      tester,
    ) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      tester.view.viewInsets = const FakeViewPadding(bottom: 240);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetViewInsets);
      final docs = recurringUiDocuments(),
          commands = UpcomingCommands(recurringOwner);
      addTearDown(docs.changes.close);
      await recurringHost(
        tester,
        docs,
        commands,
        const RecurringEditor(),
        scale: 2,
      );
      await tester.ensureVisible(find.byKey(const Key('recurring-save')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
}
