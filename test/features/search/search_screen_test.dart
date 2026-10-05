import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/obligations/presentation/obligations_screen.dart';
import 'package:tally/features/search/domain/financial_filter.dart';
import 'package:tally/features/search/domain/query_cancellation.dart';
import 'package:tally/features/search/domain/query_page.dart';
import 'package:tally/features/search/presentation/financial_filter_panel.dart';
import 'package:tally/features/search/presentation/query_results.dart';
import 'package:tally/features/search/presentation/search_field.dart';
import 'package:tally/shared/domain/data_page.dart';

import '../../support/recurring_fixtures.dart';
import '../../support/search_gateway.dart';
import '../../support/search_ui.dart';
import '../../support/upcoming_fixtures.dart';
import '../calendar/calendar_screen_test.dart' show bill;

QueryPage<String> results(
  List<String> items, {
  bool more = false,
  int scanned = 50,
  bool cached = false,
  bool budget = false,
}) => QueryPage(
  records: DataPage(
    items: items,
    nextCursor: more ? const FixtureCursor(1) : null,
    hasMore: more,
    isFromCache: cached,
  ),
  scannedCandidates: scanned,
  budgetReached: budget,
);

void main() {
  testWidgets('multi-codepoint input cannot exceed the domain search limit', (
    tester,
  ) async {
    final values = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SearchField(
            value: '',
            onChanged: (value) {
              FinancialFilter(text: value);
              values.add(value);
            },
          ),
        ),
      ),
    );
    await tester.enterText(
      find.byKey(const Key('financial-search')),
      List.filled(200, '👩🏽‍💻').join(),
    );
    await tester.pump(const Duration(milliseconds: 300));
    expect(tester.takeException(), isNull);
    expect(values.every((v) => v.runes.length <= 240), isTrue);
  });
  testWidgets('search debounces 300ms, normalizes, submits and clears', (
    tester,
  ) async {
    final values = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SearchField(value: '', onChanged: values.add),
        ),
      ),
    );
    await tester.enterText(
      find.byKey(const Key('financial-search')),
      '  John   SMITH ',
    );
    await tester.pump(const Duration(milliseconds: 299));
    expect(values, isEmpty);
    await tester.pump(const Duration(milliseconds: 1));
    expect(values, ['john smith']);
    await tester.enterText(
      find.byKey(const Key('financial-search')),
      'Electricity',
    );
    await tester.testTextInput.receiveAction(TextInputAction.search);
    expect(values.last, 'electricity');
    await tester.pump(const Duration(milliseconds: 300));
    expect(values, ['john smith', 'electricity']);
    await tester.tap(find.byTooltip('Clear search'));
    expect(values.last, '');
    await tester.enterText(
      find.byKey(const Key('financial-search')),
      'disposed',
    );
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(milliseconds: 500));
    expect(values.last, '');
  });

  testWidgets('sparse results disclose progress and load later matches', (
    tester,
  ) async {
    var calls = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: QueryResults<String>(
            queryKey: 'alice-search',
            first: AsyncData(
              results([], more: true, scanned: 250, budget: true),
            ),
            loadMore: (_, _) async {
              calls++;
              return results(['Later match'], scanned: 40);
            },
            identity: (value) => value,
            builder: (_, values, _) =>
                Column(children: values.map(Text.new).toList()),
            empty: const Text('Nothing recorded'),
            onRetry: () {},
          ),
        ),
      ),
    );
    expect(find.text('Nothing recorded'), findsNothing);
    expect(
      find.text('No matches in the records checked so far.'),
      findsOneWidget,
    );
    expect(find.textContaining('250 records checked'), findsOneWidget);
    await tester.tap(find.text('Load more'));
    await tester.pumpAndSettle();
    expect(find.text('Later match'), findsOneWidget);
    expect(find.textContaining('290 records checked'), findsOneWidget);
    expect(find.text('Load more'), findsNothing);
    expect(calls, 1);
  });

  testWidgets('cached empty never says the search is complete', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: QueryResults<String>(
            queryKey: 'alice-cache',
            first: AsyncData(results([], cached: true)),
            loadMore: (_, _) async => results([]),
            identity: (v) => v,
            builder: (_, _, _) => const SizedBox(),
            empty: const Text('Nothing recorded'),
            onRetry: () {},
          ),
        ),
      ),
    );
    expect(find.text('Nothing recorded'), findsNothing);
    expect(find.textContaining('Cached view'), findsOneWidget);
    expect(
      find.text('No matches in the records checked so far.'),
      findsOneWidget,
    );
  });

  for (final change in ['owner', 'criteria', 'snapshot']) {
    testWidgets(
      '$change change cancels old continuation, clears surplus and discards completion',
      (tester) async {
        final pending = Completer<QueryPage<String>>();
        QueryCancellation? cancellation;
        final first = results(['Original'], more: true);
        var key = 'alice-original';
        QueryPage<String> current = first;
        Widget view() => MaterialApp(
          home: Scaffold(
            body: QueryResults<String>(
              queryKey: key,
              first: AsyncData(current),
              loadMore: (_, token) {
                cancellation = token;
                return pending.future;
              },
              identity: (v) => v,
              builder: (_, values, _) =>
                  Column(children: values.map(Text.new).toList()),
              empty: const Text('Nothing'),
              onRetry: () {},
            ),
          ),
        );
        await tester.pumpWidget(view());
        await tester.tap(find.text('Load more'));
        await tester.pump();
        if (change != 'snapshot') {
          key = change == 'owner' ? 'bob-original' : 'alice-new';
        }
        current = results(['Current']);
        await tester.pumpWidget(view());
        expect(cancellation!.isCancelled, isTrue);
        pending.complete(results(['Stale surplus']));
        await tester.pumpAndSettle();
        expect(find.text('Current'), findsOneWidget);
        expect(find.text('Original'), findsNothing);
        expect(find.text('Stale surplus'), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'amount bounds require a currency and date/amount errors prevent Apply',
    (tester) async {
      FinancialFilter? applied;
      await searchHost(
        tester,
        CandidateDocuments(recurringOwner, []),
        SingleChildScrollView(
          child: FinancialFilterPanel(
            initial: FinancialFilter(),
            onApply: (v) => applied = v,
          ),
        ),
      );
      expect(
        tester
            .widget<TextFormField>(find.byKey(const Key('filter-minimum')))
            .enabled,
        isFalse,
      );
      await tester.tap(find.byKey(const Key('filter-currency')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('JPY').last);
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('filter-minimum')), '1.5');
      await tester.ensureVisible(find.byKey(const Key('filter-apply')));
      await tester.tap(find.byKey(const Key('filter-apply')));
      await tester.pumpAndSettle();
      expect(applied, isNull);
      expect(find.text('Enter a valid amount for JPY.'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('filter-minimum')), '200');
      await tester.enterText(find.byKey(const Key('filter-maximum')), '100');
      await tester.tap(find.byKey(const Key('filter-apply')));
      await tester.pumpAndSettle();
      expect(applied, isNull);
      expect(find.text('Minimum must not exceed maximum.'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('filter-maximum')), '300');
      await tester.enterText(
        find.byKey(const Key('filter-first-date')),
        '2026-02-30',
      );
      await tester.tap(find.byKey(const Key('filter-apply')));
      await tester.pumpAndSettle();
      expect(applied, isNull);
      await tester.enterText(
        find.byKey(const Key('filter-first-date')),
        '2026-10-01',
      );
      await tester.tap(find.byKey(const Key('filter-apply')));
      await tester.pumpAndSettle();
      expect(applied!.currency, CurrencyCode.jpy);
      expect(applied!.minimumMinor, 200);
      expect(applied!.maximumMinor, 300);
      expect(applied!.firstDate.toString(), '2026-10-01');
      await tester.tap(find.byKey(const Key('filter-reset')));
      await tester.pumpAndSettle();
      expect(applied, FinancialFilter());
    },
  );

  testWidgets(
    'Monthly Dues shows actual historical billing periods rather than template balances',
    (tester) async {
      final parent = recurringData('parent');
      final docs = CandidateDocuments(recurringOwner, [
        bill(
          'period-1',
          'Netflix',
          '2026-10-18',
          patch: {
            'totalPaidMinor': 54900,
            'remainingMinor': 0,
            'closed': true,
            'financialStatus': 'paid',
          },
        ),
      ]);
      // This view exercises the period provider only; bill settings are separately tested.
      await searchHost(tester, docs, const ObligationsScreen(section: 'dues'));
      expect(find.text('Bills'), findsOneWidget);
      expect(find.text('Billing periods'), findsOneWidget);
      await tester.tap(find.text('Billing periods'));
      await tester.pumpAndSettle();
      expect(find.text('Netflix'), findsOneWidget);
      expect(find.text('Paid'), findsOneWidget);
      expect(find.textContaining('Estimate per period'), findsNothing);
      expect(parent['remainingMinor'], isNull);
    },
  );
}
