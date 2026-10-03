import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/app/app_router.dart';
import 'package:tally/app/tally_app.dart';
import 'package:tally/core/theme/theme_controller.dart';
import 'package:tally/features/obligations/presentation/add_action_sheet.dart';

void main() {
  testWidgets('URL sections survive branch/theme changes and pop', (
    tester,
  ) async {
    final router = createAppRouter(
      initialLocation: '/obligations?section=owed',
    );
    final container = ProviderContainer(
      overrides: [appRouterProvider.overrideWithValue(router)],
    );
    addTearDown(container.dispose);
    addTearDown(router.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(container: container, child: const TallyApp()),
    );
    await tester.pumpAndSettle();
    expect(find.text('No money owed to you yet'), findsOneWidget);
    await tester.tap(find.text('People').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Obligations').last);
    await tester.pumpAndSettle();
    expect(find.text('No money owed to you yet'), findsOneWidget);
    container.read(themeModeProvider.notifier).setMode(ThemeMode.dark);
    await tester.pumpAndSettle();
    expect(container.read(appRouterProvider), same(router));
    expect(find.text('No money owed to you yet'), findsOneWidget);
    final pushed = router.push<void>('/settings');
    await tester.pumpAndSettle();
    expect(find.text('Appearance'), findsOneWidget);
    router.pop();
    await pushed;
    await tester.pumpAndSettle();
    expect(find.text('No money owed to you yet'), findsOneWidget);
    router.go('/obligations?section=nonsense');
    await tester.pumpAndSettle();
    expect(find.text('Nothing owed yet'), findsOneWidget);
    router.go('/missing');
    await tester.pumpAndSettle();
    expect(find.text('This page isn’t available'), findsOneWidget);
    await tester.tap(find.text('Go Home'));
    await tester.pumpAndSettle();
    expect(router.routeInformationProvider.value.uri.path, '/home');
  });
  testWidgets('Chooser returns each intent without claiming to save', (
    tester,
  ) async {
    AddIntent? selected;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                selected = await showAddActionSheet(context);
              },
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    final labels = [
      'I borrowed money',
      'I lent money',
      'Add monthly due',
      'Add recurring payment',
    ];
    for (var i = 0; i < labels.length; i++) {
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      for (final label in labels) {
        expect(find.text(label), findsOneWidget);
      }
      expect(find.text('Save'), findsNothing);
      await tester.tap(find.text(labels[i]));
      await tester.pumpAndSettle();
      expect(selected, AddIntent.values[i]);
    }
  });
}
