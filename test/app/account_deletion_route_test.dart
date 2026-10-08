import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/app/app_router.dart';
import 'package:tally/app/tally_app.dart';

void main() {
  testWidgets(
    'preview deep link labels account deletion unavailable without Firebase access',
    (tester) async {
      final router = createAppRouter(
        initialLocation: '/settings/account/delete',
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [appRouterProvider.overrideWithValue(router)],
          child: const TallyApp(),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Account deletion is unavailable in preview'),
        findsOneWidget,
      );
      expect(find.text('Request account deletion'), findsNothing);
      expect(
        router.routeInformationProvider.value.uri.path,
        '/settings/account/delete',
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'Settings account action reaches its nested route and preserves navigation',
    (tester) async {
      final router = createAppRouter(initialLocation: '/settings');
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [appRouterProvider.overrideWithValue(router)],
          child: const TallyApp(),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Delete account'));
      await tester.tap(find.text('Delete account'));
      await tester.pumpAndSettle();
      expect(
        router.routeInformationProvider.value.uri.path,
        '/settings/account/delete',
      );
      expect(
        find.text('Account deletion is unavailable in preview'),
        findsOneWidget,
      );
      expect(find.byType(NavigationRail), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
