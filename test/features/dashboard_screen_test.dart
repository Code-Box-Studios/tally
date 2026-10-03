import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/app/tally_app.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/core/theme/theme_controller.dart';
import 'package:tally/features/dashboard/domain/dashboard_repository.dart';
import 'package:tally/features/dashboard/domain/dashboard_summary.dart';
import 'package:tally/features/dashboard/presentation/dashboard_providers.dart';

class ControlledRepository implements DashboardRepository {
  final controller = StreamController<DashboardSummary>.broadcast();
  @override
  Stream<DashboardSummary> watchSummary(DashboardQuery query) =>
      controller.stream;
}

void main() {
  for (final width in [320.0, 800.0, 1440.0]) {
    for (final mode in [ThemeMode.light, ThemeMode.dark]) {
      testWidgets('Dashboard width $width / 200% / $mode', (tester) async {
        tester.view.physicalSize = Size(width, 1200);
        tester.view.devicePixelRatio = 1;
        tester.platformDispatcher.textScaleFactorTestValue = 2;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        final c = ProviderContainer();
        addTearDown(c.dispose);
        c.read(themeModeProvider.notifier).setMode(mode);
        await tester.pumpWidget(
          UncontrolledProviderScope(container: c, child: const TallyApp()),
        );
        await tester.pumpAndSettle();
        expect(find.text('Sample data'), findsOneWidget);
        expect(find.text('₱25,000'), findsOneWidget);
        // Offscreen children are built by the single dashboard scroll view.
        expect(find.text('Amount needed'), findsOneWidget);
        expect(find.text('Assumed'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }
  testWidgets('Loading and error stay distinct from zero; Retry resubscribes', (
    tester,
  ) async {
    final repo = ControlledRepository();
    addTearDown(() {
      unawaited(repo.controller.close());
    });
    await tester.pumpWidget(
      ProviderScope(
        overrides: [dashboardRepositoryProvider.overrideWithValue(repo)],
        child: const TallyApp(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Getting your overview…'), findsOneWidget);
    repo.controller.addError(StateError('private SDK details'));
    await tester.pumpAndSettle();
    expect(find.text('Your overview couldn’t load'), findsOneWidget);
    expect(find.textContaining('private SDK details'), findsNothing);
    expect(find.text('₱0'), findsNothing);
    await tester.tap(find.text('Try again'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Getting your overview…'), findsOneWidget);
  });
  testWidgets('Emulator home never displays sample names or activities', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          environmentProvider.overrideWithValue(
            const EnvironmentConfig.emulator(
              projectId: 'demo-tally',
              endpoints: EmulatorEndpoints(host: '127.0.0.1'),
            ),
          ),
        ],
        child: const TallyApp(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Sample data'), findsNothing);
    expect(find.textContaining('John'), findsNothing);
    expect(find.textContaining('Netflix'), findsNothing);
    expect(find.text('Your overview starts here'), findsOneWidget);
  });
}
