import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/calendar/presentation/calendar_screen.dart';
import 'package:tally/features/obligations/presentation/obligations_screen.dart';
import 'package:tally/features/obligations/data/instance_dto.dart';
import 'package:tally/features/search/domain/financial_filter.dart';
import 'package:tally/features/search/presentation/financial_filter_panel.dart';

import '../../support/recurring_fixtures.dart';
import '../../support/search_gateway.dart';
import '../../support/search_ui.dart';
import '../calendar/calendar_screen_test.dart' show bill;
import '../financial/financial_dto_test.dart' show audit;
import '../financial/financial_forms_test.dart' show UiDocuments;

void main() {
  // Omitting archived references in a history picker must break these tests.
  for (final kind in ['person', 'category', 'payment source']) {
    testWidgets(
      'history filter includes an inactive $kind with its stable ID',
      (tester) async {
        final docs = UiDocuments(uid: recurringOwner.value);
        addTearDown(docs.changes.close);
        docs.data['contacts']!['past-person'] = {
          ...audit,
          'userId': docs.owner.value,
          'kind': 'person',
          'displayName': 'Past person',
          'organizationType': null,
          'email': null,
          'phone': null,
          'address': null,
          'notes': '',
          'archived': true,
          'revision': 1,
        };
        docs.data['categories']!['past-category'] = {
          ...audit,
          'userId': docs.owner.value,
          'name': 'Past category',
          'iconKey': null,
          'isDefault': false,
          'active': false,
          'revision': 1,
        };
        docs.data['paymentSources']!['past-source'] = {
          ...audit,
          'userId': docs.owner.value,
          'name': 'Past card',
          'type': 'creditCard',
          'nickname': null,
          'lastFour': '1234',
          'notes': '',
          'active': false,
          'revision': 1,
        };
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
        );
        await tester.ensureVisible(find.text('Choose $kind'));
        await tester.tap(find.text('Choose $kind'));
        await tester.pumpAndSettle();
        final label = switch (kind) {
          'person' => 'Past person · Archived',
          'category' => 'Past category · Inactive',
          _ => 'Past card · Inactive',
        };
        expect(find.text(label), findsOneWidget);
        await tester.tap(find.text(label));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.byKey(const Key('filter-apply')));
        await tester.tap(find.byKey(const Key('filter-apply')));
        await tester.pumpAndSettle();
        expect(
          switch (kind) {
            'person' => result!.contactId!.value,
            'category' => result!.categoryId!.value,
            _ => result!.sourceId!.value,
          },
          switch (kind) {
            'person' => 'past-person',
            'category' => 'past-category',
            _ => 'past-source',
          },
        );
        final retained = bill(
          'retained',
          'Past bill',
          '2026-10-15',
          patch: {
            'contactId': 'past-person',
            'categoryId': 'past-category',
            'paymentSourceId': 'past-source',
          },
        );
        expect(
          result!.matchesInstance(
            InstanceDto.fromMap(retained.id, retained.data, docs.owner),
            DateTime.utc(2026, 10, 5),
          ),
          isTrue,
        );
      },
    );
  }

  testWidgets('unknown bills without estimates identify PHP and USD', (
    tester,
  ) async {
    final docs = CandidateDocuments(recurringOwner, [
      for (final currency in ['PHP', 'USD'])
        bill(
          'unknown-$currency',
          'Variable $currency',
          '2026-10-15',
          patch: {
            'currency': currency,
            'amountMinor': null,
            'amountState': 'unknown',
            'remainingMinor': null,
            'estimatedAmountMinor': null,
          },
        ),
    ]);
    await searchHost(tester, docs, const CalendarScreen());
    expect(find.text('Currency · PHP'), findsOneWidget);
    expect(find.text('Currency · USD'), findsOneWidget);
    expect(find.textContaining('Estimate'), findsNothing);
  });

  // Reapplying a pending search after an explicit reset must break both flows.
  for (final calendar in [false, true]) {
    testWidgets('clear filters cancels uncommitted search calendar=$calendar', (
      tester,
    ) async {
      await searchHost(
        tester,
        CandidateDocuments(recurringOwner, []),
        calendar
            ? const CalendarScreen()
            : const ObligationsScreen(initialCurrency: CurrencyCode.usd),
      );
      if (calendar) {
        await tester.tap(find.text('Filters'));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.byKey(const Key('filter-currency')));
        await tester.tap(find.byKey(const Key('filter-currency')));
        await tester.pumpAndSettle();
        await tester.tap(find.text('USD').last);
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.byKey(const Key('filter-apply')));
        await tester.tap(find.byKey(const Key('filter-apply')));
        await tester.pumpAndSettle();
      }
      await tester.enterText(find.byKey(const Key('financial-search')), 'rent');
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(find.text('Clear filters'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      final field = tester.widget<TextField>(
        find.byKey(const Key('financial-search')),
      );
      expect(field.controller!.text, isEmpty);
      expect(find.text('Clear filters'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    });
  }
}
