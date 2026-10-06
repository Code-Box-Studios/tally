import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/core/theme/tally_theme.dart';
import 'package:tally/features/notifications/presentation/reminders_screen.dart';
import 'package:tally/features/notifications/presentation/notification_settings.dart';
import 'package:tally/features/notifications/presentation/notification_providers.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/shared/domain/financial_failure.dart';

import '../../support/notification_fixtures.dart';
import '../auth/session_controller_test.dart' show profile;
import '../financial/financial_dto_test.dart' show obligationData;

import 'package:tally/features/obligations/data/obligation_dto.dart';

Future<GoRouter> host(
  WidgetTester tester,
  FakeNotifications repo,
  Widget child, {
  double scale = 1,
  bool dark = false,
}) async {
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (_, _) => Scaffold(body: child),
      ),
      GoRoute(
        path: '/obligations/:id',
        builder: (_, state) => Scaffold(
          body: Text('Period ${state.uri.queryParameters['period']}'),
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        environmentProvider.overrideWithValue(
          const EnvironmentConfig.emulator(projectId: 'demo-tally'),
        ),
        ownerUidProvider.overrideWithValue(repo.owner),
        userProfileProvider.overrideWithValue(profile(repo.owner.value)),
        notificationRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp.router(
        routerConfig: router,
        theme: dark ? TallyTheme.dark() : TallyTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

void main() {
  testWidgets(
    'inbox has unread status, native currencies, read action and exact owned period link',
    (tester) async {
      final repo = FakeNotifications();
      addTearDown(repo.dispose);
      repo.entries.addAll([
        repo.entry('one'),
        repo.entry('unknown', patch: {'amountMinor': null, 'currency': 'USD'}),
      ]);
      await host(
        tester,
        repo,
        RemindersScreen(until: DateTime.utc(2026, 10, 5, 4)),
      );
      expect(find.text('Unread'), findsNWidgets(2));
      expect(find.text('Amount needed · USD'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('reminder-read-one')));
      await tester.tap(find.byKey(const Key('reminder-read-one')));
      await tester.pumpAndSettle();
      expect(repo.commands.single.$1, 'read');
      await tester.ensureVisible(find.byKey(const Key('reminder-open-one')));
      await tester.tap(find.byKey(const Key('reminder-open-one')));
      await tester.pumpAndSettle();
      expect(find.text('Period period-1'), findsOneWidget);
    },
  );
  testWidgets('inbox paging and cached state stay explicit', (tester) async {
    final repo = FakeNotifications()
      ..cached = true
      ..more = true;
    addTearDown(repo.dispose);
    repo.entries.add(repo.entry('one'));
    await host(
      tester,
      repo,
      RemindersScreen(until: DateTime.utc(2026, 10, 5, 4)),
    );
    expect(find.textContaining('Cached reminders'), findsOneWidget);
    await tester.ensureVisible(find.text('Load more'));
    await tester.tap(find.text('Load more'));
    await tester.pumpAndSettle();
    expect(find.text('Load more'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'preference controls validate custom offsets and times before writes',
    (tester) async {
      final repo = FakeNotifications();
      addTearDown(repo.dispose);
      await host(
        tester,
        repo,
        NotificationSettingsForm(preferences: repo.preferences),
      );
      await tester.enterText(find.byKey(const Key('reminder-offsets')), '3, 3');
      await tester.ensureVisible(find.text('Save reminders'));
      await tester.ensureVisible(find.text('Save reminders'));
      await tester.tap(find.text('Save reminders'));
      await tester.pumpAndSettle();
      expect(repo.commands, isEmpty);
      await tester.enterText(
        find.byKey(const Key('reminder-offsets')),
        '7, 1, 0',
      );
      await tester.enterText(find.byKey(const Key('reminder-time')), '25:00');
      await tester.ensureVisible(find.text('Save reminders'));
      await tester.tap(find.text('Save reminders'));
      await tester.pumpAndSettle();
      expect(repo.commands, isEmpty);
      await tester.enterText(find.byKey(const Key('reminder-time')), '10:30');
      await tester.enterText(find.byKey(const Key('quiet-start')), '22:00');
      await tester.enterText(find.byKey(const Key('quiet-end')), '07:00');
      await tester.ensureVisible(find.text('Save reminders'));
      await tester.tap(find.text('Save reminders'));
      await tester.pumpAndSettle();
      expect(repo.commands.single.$1, 'preferences');
      expect(repo.preferences.offsetDays, [7, 1, 0]);
      expect(repo.preferences.localTime, '10:30');
      expect(repo.preferences.quietStart, '22:00');
    },
  );
  testWidgets(
    'uncertain save freezes its values and retries the same permanent action',
    (tester) async {
      final repo = FakeNotifications()
        ..error = const FinancialFailure(
          FinancialFailureCode.offline,
          'Unconfirmed',
        );
      addTearDown(repo.dispose);
      await host(
        tester,
        repo,
        NotificationSettingsForm(preferences: repo.preferences),
      );
      await tester.ensureVisible(find.text('Save reminders'));
      await tester.ensureVisible(find.text('Save reminders'));
      await tester.tap(find.text('Save reminders'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<TextFormField>(find.byKey(const Key('reminder-offsets')))
            .enabled,
        isFalse,
      );
      repo.error = null;
      await tester.ensureVisible(find.text('Retry save'));
      await tester.tap(find.text('Retry save'));
      await tester.pumpAndSettle();
      expect(repo.commands[0].$2, repo.commands[1].$2);
      expect(repo.commands[0].$3, same(repo.commands[1].$3));
    },
  );
  testWidgets(
    'conflicting preferences require a refresh instead of overwriting',
    (tester) async {
      final repo = FakeNotifications()
        ..error = const FinancialFailure(
          FinancialFailureCode.conflict,
          'Changed',
        );
      addTearDown(repo.dispose);
      await host(
        tester,
        repo,
        NotificationSettingsForm(preferences: repo.preferences),
      );
      await tester.ensureVisible(find.text('Save reminders'));
      await tester.ensureVisible(find.text('Save reminders'));
      await tester.tap(find.text('Save reminders'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Refresh'), findsWidgets);
      expect(
        tester
            .widget<FilledButton>(find.byKey(const Key('reminder-save')))
            .onPressed,
        isNull,
      );
    },
  );
  testWidgets(
    'inbox groups by the profile date and validates a notification target',
    (tester) async {
      final repo = FakeNotifications();
      addTearDown(repo.dispose);
      repo.entries.addAll([
        repo.entry('today'),
        repo.entry(
          'earlier',
          patch: {
            'visibleAt': DateTime.utc(2026, 10, 4),
            'scheduledAt': DateTime.utc(2026, 10, 4),
          },
        ),
      ]);
      await host(
        tester,
        repo,
        RemindersScreen(until: DateTime.utc(2026, 10, 5, 4)),
      );
      expect(find.text('Today'), findsOneWidget);
      expect(find.text('Earlier'), findsOneWidget);
    },
  );
  testWidgets(
    'finite reminder settings change only the loaded obligation policy',
    (tester) async {
      final repo = FakeNotifications();
      addTearDown(repo.dispose);
      final parent = ObligationDto.fromMap(
        'loan-1',
        obligationData(),
        repo.owner,
      );
      await host(
        tester,
        repo,
        NotificationSettingsForm(
          preferences: repo.preferences,
          obligation: parent,
        ),
      );
      expect(find.text('Quiet hours'), findsNothing);
      expect(find.text('Push alerts'), findsNothing);
      await tester.enterText(find.byKey(const Key('reminder-offsets')), '7, 0');
      await tester.ensureVisible(find.text('Save reminders'));
      await tester.tap(find.text('Save reminders'));
      await tester.pumpAndSettle();
      expect(repo.commands.single.$1, 'policy');
    },
  );
  for (final width in [320.0, 375.0, 800.0, 1440.0]) {
    for (final dark in [false, true]) {
      testWidgets(
        'reminders and settings fit $width dark=$dark at200 percent',
        (tester) async {
          tester.view.physicalSize = Size(width, 1000);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.reset);
          final repo = FakeNotifications();
          addTearDown(repo.dispose);
          repo.entries.add(
            repo.entry(
              'long',
              patch: {
                'title': 'A long financial obligation reminder',
                'amountMinor': null,
              },
            ),
          );
          await host(
            tester,
            repo,
            RemindersScreen(until: DateTime.utc(2026, 10, 5, 4)),
            scale: 2,
            dark: dark,
          );
          expect(tester.takeException(), isNull);
          await host(
            tester,
            repo,
            NotificationSettingsForm(preferences: repo.preferences),
            scale: 2,
            dark: dark,
          );
          await tester.ensureVisible(find.text('Save reminders'));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
