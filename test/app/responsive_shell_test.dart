import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/app/app_router.dart';
import 'package:tally/app/tally_app.dart';

void main() {
  for (final width in [320.0, 390.0, 600.0, 800.0, 1024.0, 1440.0]) {
    testWidgets('Every route and Add reachable at width $width / 200%', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final router = createAppRouter();
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [appRouterProvider.overrideWithValue(router)],
          child: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: const TallyApp(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      // MaterialApp derives its own MediaQuery; inject platform text scaling.
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await tester.pumpAndSettle();
      if (width < 600) {
        expect(find.byType(NavigationBar), findsOneWidget);
        await tester.tap(find.text('More'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Activity'));
        await tester.pumpAndSettle();
        expect(find.text('Your story starts here'), findsOneWidget);
        await tester.tap(find.text('More'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Settings'));
        await tester.pumpAndSettle();
        expect(find.text('Appearance'), findsOneWidget);
      } else if (width < 1024) {
        expect(find.byType(NavigationRail), findsOneWidget);
      } else {
        expect(find.byKey(const Key('desktop-sidebar')), findsOneWidget);
      }
      for (final route in [
        'home',
        'obligations',
        'people',
        'calendar',
        'activity',
        'settings',
      ]) {
        router.go('/$route');
        await tester.pumpAndSettle();
        expect(router.routeInformationProvider.value.uri.path, '/$route');
        expect(tester.takeException(), isNull);
      }
      await tester.tap(find.byKey(const Key('add-action')));
      await tester.pumpAndSettle();
      expect(find.text('I borrowed money'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
