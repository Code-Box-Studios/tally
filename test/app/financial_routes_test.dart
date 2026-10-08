import '../support/preferences_fixture.dart';

import 'package:tally/features/sync/presentation/sync_providers.dart';

import '../support/online_commands.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/app/app_router.dart';
import 'package:tally/app/tally_app.dart';
import 'package:tally/app/session_route_gate.dart';
import 'package:tally/features/auth/domain/session_state.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/shared/presentation/financial_providers.dart';
import 'package:tally/shared/widgets/tally_brand.dart';

import '../features/auth/session_controller_test.dart' show profile;
import '../features/financial/financial_forms_test.dart'
    show UiDocuments, UiCommands;
import '../features/financial/financial_dto_test.dart' show obligationData;

void main() {
  setUp(useInMemoryPreferences);
  tearDown(resetPreferencesPlatform);
  test('private obligation deep link survives startup and sign in', () {
    final gate = SessionRouteGate();
    addTearDown(gate.dispose);
    expect(gate.redirect(Uri.parse('/obligations/loan-1/edit')), '/startup');
    gate.update(const SessionState(SessionStage.signedOut));
    expect(gate.redirect(Uri.parse('/startup')), '/sign-in');
    gate.update(SessionState(SessionStage.ready, profile: profile('alice')));
    expect(gate.redirect(Uri.parse('/sign-in')), '/obligations/loan-1/edit');
  });
  testWidgets(
    'Lavish brand and header surround actual detail and new obligation URLs',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final docs = UiDocuments();
      final commands = UiCommands(docs);
      addTearDown(docs.changes.close);
      docs.data['obligations']!['loan-1'] = {
        ...obligationData(),
        'title': 'Actual private loan',
      };
      final router = createAppRouter(initialLocation: '/obligations/loan-1');
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appRouterProvider.overrideWithValue(router),
            environmentProvider.overrideWithValue(
              const EnvironmentConfig.emulator(projectId: 'demo-tally'),
            ),
            ownerUidProvider.overrideWithValue(docs.owner),
            userProfileProvider.overrideWithValue(profile('alice')),
            ownerDocumentsFactoryProvider.overrideWithValue((_) => docs),
            syncRuntimeFactoryProvider.overrideWithValue(onlineOnlyTestRuntime),
            ownerCommandsFactoryProvider.overrideWithValue((_) => commands),
          ],
          child: const TallyApp(),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Actual private loan'), findsWidgets);
      expect(find.byType(TallyBrand), findsWidgets);
      expect(find.byKey(const Key('workspace-topbar')), findsOneWidget);
      expect(find.text('YOUR SPACE'), findsOneWidget);
      await tester.tap(find.byKey(const Key('add-action')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('I lent money'));
      await tester.pumpAndSettle();
      expect(
        router.routeInformationProvider.value.uri.path,
        '/obligations/new',
      );
      expect(find.byKey(const Key('obligation-save')), findsOneWidget);
      expect(find.text('I lent money'), findsWidgets);
      await tester.tap(find.byKey(const Key('add-action')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('I borrowed money'));
      await tester.pumpAndSettle();
      expect(find.text('I borrowed money'), findsWidgets);
      expect(find.text('I lent money'), findsNothing);
      await tester.tap(find.byKey(const Key('add-action')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('I lent money'));
      await tester.pumpAndSettle();
      expect(find.text('I lent money'), findsWidgets);
      expect(find.text('I borrowed money'), findsNothing);
      await tester.tap(find.byKey(const Key('add-action')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add monthly due'));
      await tester.pumpAndSettle();
      expect(
        router.routeInformationProvider.value.uri.path,
        '/obligations/recurring/new',
      );
      expect(find.byKey(const Key('recurring-save')), findsOneWidget);
      await tester.tap(find.byKey(const Key('add-action')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add recurring payment'));
      await tester.pumpAndSettle();
      expect(find.text('Automatic with confirmation'), findsOneWidget);
      router.go('/obligations/bad%20id');
      await tester.pumpAndSettle();
      expect(find.text('This link isn’t available'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
