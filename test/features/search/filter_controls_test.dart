import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/features/obligations/domain/obligation.dart';
import 'package:tally/features/search/domain/financial_filter.dart';
import 'package:tally/features/search/presentation/financial_filter_panel.dart';

import '../../support/recurring_fixtures.dart';
import '../../support/search_ui.dart';
import '../financial/financial_dto_test.dart' show audit;
import '../financial/financial_forms_test.dart' show UiDocuments;

Future<void> choose(WidgetTester tester, String key, String label) async {
  await tester.ensureVisible(find.byKey(Key(key)));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(Key(key)));
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text(label).last);
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

Future<void> apply(WidgetTester tester) async {
  await tester.ensureVisible(find.byKey(const Key('filter-apply')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('filter-apply')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'all human-friendly section, status and payment behavior controls emit precise filters',
    (tester) async {
      FinancialFilter? result;
      final docs = UiDocuments(uid: recurringOwner.value);
      addTearDown(docs.changes.close);
      await searchHost(
        tester,
        docs,
        SingleChildScrollView(
          child: FinancialFilterPanel(
            initial: FinancialFilter(),
            onApply: (value) => result = value,
          ),
        ),
      );
      for (final pair in [
        (ObligationSection.iOwe, 'I Owe'),
        (ObligationSection.owedToMe, 'Owed to Me'),
        (ObligationSection.monthlyDues, 'Monthly Dues'),
      ]) {
        await choose(tester, 'filter-section', pair.$2);
        await apply(tester);
        expect(result!.section, pair.$1);
      }
      for (final pair in [
        (RecordStatus.all, 'All statuses'),
        (RecordStatus.pending, 'Pending'),
        (RecordStatus.partiallyPaid, 'Partially paid'),
        (RecordStatus.paid, 'Paid'),
        (RecordStatus.overdue, 'Overdue'),
        (RecordStatus.skipped, 'Skipped'),
        (RecordStatus.cancelled, 'Cancelled'),
      ]) {
        await choose(tester, 'filter-status', pair.$2);
        await apply(tester);
        expect(result!.status, pair.$1);
      }
      for (final pair in [
        (PaymentMode.manual, 'Manual'),
        (PaymentMode.automatic, 'Automatic'),
        (PaymentMode.automaticConfirmation, 'Automatic with confirmation'),
      ]) {
        await choose(tester, 'filter-mode', pair.$2);
        await apply(tester);
        expect(result!.paymentMode, pair.$1);
        expect(result!.automaticOnly, isFalse);
      }
      await choose(tester, 'filter-mode', 'Any automatic deduction');
      await apply(tester);
      expect(result!.automaticOnly, isTrue);
      expect(result!.paymentMode, isNull);
    },
  );

  testWidgets('catalog filters keep selected IDs and clear independently', (
    tester,
  ) async {
    FinancialFilter? result;
    final docs = UiDocuments(uid: recurringOwner.value);
    addTearDown(docs.changes.close);
    docs.data['contacts']!['person-7'] = {
      ...audit,
      'userId': docs.owner.value,
      'kind': 'person',
      'displayName': 'John Smith',
      'organizationType': null,
      'email': null,
      'phone': null,
      'address': null,
      'notes': '',
      'archived': false,
      'revision': 1,
    };
    docs.data['paymentSources']!['source-7'] = {
      ...audit,
      'userId': docs.owner.value,
      'name': 'Credit Card',
      'type': 'creditCard',
      'nickname': null,
      'lastFour': '1234',
      'notes': '',
      'active': true,
      'revision': 1,
    };
    await searchHost(
      tester,
      docs,
      SingleChildScrollView(
        child: FinancialFilterPanel(
          initial: FinancialFilter(),
          onApply: (value) => result = value,
        ),
      ),
    );
    for (final pair in [
      ('Choose person', 'John Smith'),
      ('Choose category', 'Personal Loan'),
      ('Choose payment source', 'Credit Card'),
    ]) {
      await tester.ensureVisible(find.text(pair.$1));
      await tester.tap(find.text(pair.$1));
      await tester.pumpAndSettle();
      await tester.tap(find.text(pair.$2).last);
      await tester.pumpAndSettle();
    }
    await apply(tester);
    expect(result!.contactId!.value, 'person-7');
    expect(result!.categoryId!.value, 'default-personal-loan');
    expect(result!.sourceId!.value, 'source-7');
    for (final label in [
      'Clear person',
      'Clear category',
      'Clear payment source',
    ]) {
      await tester.ensureVisible(find.text(label));
      await tester.tap(find.text(label));
      await tester.pumpAndSettle();
    }
    await apply(tester);
    expect(result!.contactId, isNull);
    expect(result!.categoryId, isNull);
    expect(result!.sourceId, isNull);
  });

  testWidgets(
    'Bills offer lifecycle filters and direct people to periods for paid/due filters',
    (tester) async {
      FinancialFilter? result;
      final docs = UiDocuments(uid: recurringOwner.value);
      addTearDown(docs.changes.close);
      await searchHost(
        tester,
        docs,
        SingleChildScrollView(
          child: FinancialFilterPanel(
            initial: FinancialFilter(section: ObligationSection.monthlyDues),
            allowLifecycle: true,
            allowPeriodState: false,
            showSection: false,
            onApply: (value) => result = value,
          ),
        ),
      );
      expect(find.byKey(const Key('filter-status')), findsNothing);
      expect(find.byKey(const Key('filter-first-date')), findsNothing);
      expect(
        find.text(
          'Use Billing periods to filter by payment status or due date.',
        ),
        findsOneWidget,
      );
      for (final pair in [
        (ObligationLifecycle.active, 'Active'),
        (ObligationLifecycle.paused, 'Paused'),
        (ObligationLifecycle.ended, 'Ended'),
        (ObligationLifecycle.cancelled, 'Cancelled'),
      ]) {
        await choose(tester, 'filter-lifecycle', pair.$2);
        await apply(tester);
        expect(result!.lifecycle, pair.$1);
        expect(result!.status, RecordStatus.all);
      }
    },
  );
  for (final width in [320.0, 375.0, 800.0, 1440.0]) {
    testWidgets(
      'filter controls remain reachable at $width and 200 percent text with keyboard',
      (tester) async {
        tester.view.physicalSize = Size(width, 800);
        tester.view.devicePixelRatio = 1;
        tester.view.viewInsets = const FakeViewPadding(bottom: 220);
        addTearDown(tester.view.reset);
        final docs = UiDocuments(uid: recurringOwner.value);
        addTearDown(docs.changes.close);
        FinancialFilter? result;
        await searchHost(
          tester,
          docs,
          SingleChildScrollView(
            child: FinancialFilterPanel(
              initial: FinancialFilter(),
              onApply: (value) => result = value,
            ),
          ),
          scale: 2,
        );
        await choose(tester, 'filter-mode', 'Automatic with confirmation');
        await tester.sendKeyEvent(LogicalKeyboardKey.tab);
        await apply(tester);
        expect(result!.paymentMode, PaymentMode.automaticConfirmation);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
