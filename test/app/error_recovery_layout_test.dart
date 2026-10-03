import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/app/bootstrap.dart';
import 'package:tally/app/tally_app.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/firebase/firebase_initializer.dart';
import 'package:tally/features/dashboard/data/preview_dashboard_repository.dart';
import 'package:tally/features/dashboard/domain/dashboard_repository.dart';
import 'package:tally/features/dashboard/domain/dashboard_summary.dart';
import 'package:tally/features/dashboard/presentation/dashboard_providers.dart';

class RecoverableInitializer implements FirebaseInitializer {
  int attempts = 0;
  @override
  Future<void> initialize(EnvironmentConfig configuration) async {
    if (++attempts == 1) throw StateError('temporary SDK failure');
  }
}

class RecoverableRepository implements DashboardRepository {
  int attempts = 0;
  @override
  Stream<DashboardSummary> watchSummary(DashboardQuery query) {
    if (++attempts == 1) {
      return Stream.error(StateError('temporary stream failure'));
    }
    return PreviewDashboardRepository().watchSummary(query);
  }
}

void smallPhone(WidgetTester tester) {
  tester.view.physicalSize = const Size(320, 568);
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = 2;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
}

Future<void> activateRecovery(WidgetTester tester) async {
  expect(tester.takeException(), isNull);
  final retry = find.widgetWithText(FilledButton, 'Try again');
  await tester.ensureVisible(retry);
  await tester.pumpAndSettle();
  expect(retry.hitTestable(), findsOneWidget);
  await tester.tap(retry);
  await tester.pumpAndSettle();
  expect(tester.takeException(), isNull);
}

void main() {
  testWidgets('Startup recovery reachable at 320×568 and 200% text', (
    tester,
  ) async {
    smallPhone(tester);
    final initializer = RecoverableInitializer();
    await bootstrap(
      const EnvironmentConfig.emulator(
        projectId: 'demo-tally',
        endpoints: EmulatorEndpoints(host: '127.0.0.1'),
      ),
      initializer: initializer,
    );
    await tester.pumpAndSettle();
    expect(find.text('Tally couldn’t start'), findsOneWidget);
    await activateRecovery(tester);
    expect(initializer.attempts, 2);
    expect(find.text('Your overview starts here'), findsOneWidget);
  });
  testWidgets('Dashboard recovery reachable at 320×568 and 200% text', (
    tester,
  ) async {
    smallPhone(tester);
    final repository = RecoverableRepository();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [dashboardRepositoryProvider.overrideWithValue(repository)],
        child: const TallyApp(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Your overview couldn’t load'), findsOneWidget);
    await activateRecovery(tester);
    expect(repository.attempts, 2);
    expect(find.text('₱25,000'), findsOneWidget);
  });
}
