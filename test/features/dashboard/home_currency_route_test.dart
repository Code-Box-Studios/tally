import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:tally/app/app_router.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/dashboard/data/summary_dto.dart';
import 'package:tally/features/dashboard/presentation/widgets/home_metrics.dart';
import 'package:tally/features/obligations/presentation/obligations_screen.dart';
import 'package:tally/core/money/currency_code.dart';

import '../../support/upcoming_fixtures.dart';

void main() {
  for (final section in ['owe', 'owed']) {
    testWidgets(
      'Home $section details carries displayed USD into obligations',
      (tester) async {
        final summary = SummaryDto.dashboard(
          'dashboard-USD',
          summaryData(currency: 'USD'),
          OwnerUid('alice'),
        );
        final router = GoRouter(
          routes: [
            GoRoute(
              path: '/',
              builder: (_, _) => Scaffold(body: HomeMetrics(summary: summary)),
            ),
            GoRoute(
              path: '/obligations',
              builder: (_, _) => const Scaffold(body: Text('Destination')),
            ),
          ],
        );
        addTearDown(router.dispose);
        await tester.pumpWidget(MaterialApp.router(routerConfig: router));
        await tester.pumpAndSettle();
        await tester.tap(
          find.descendant(
            of: find.byKey(
              Key(section == 'owe' ? 'home-you-owe' : 'home-owed-to-you'),
            ),
            matching: find.text('View details →'),
          ),
        );
        await tester.pumpAndSettle();
        expect(router.routeInformationProvider.value.uri.queryParameters, {
          'section': section,
          'currency': 'USD',
        });
      },
    );
  }
  testWidgets(
    'router accepts supported currency and rejects an invalid currency',
    (tester) async {
      final router = createAppRouter(
        initialLocation: '/obligations?section=owed&currency=USD',
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(child: MaterialApp.router(routerConfig: router)),
      );
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<ObligationsScreen>(find.byType(ObligationsScreen))
            .initialCurrency,
        CurrencyCode.usd,
      );
      router.go('/obligations?currency=BOGUS');
      await tester.pumpAndSettle();
      expect(find.text('This currency isn’t supported'), findsOneWidget);
      expect(find.byType(ObligationsScreen), findsNothing);
    },
  );
}
