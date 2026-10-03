import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/app/bootstrap.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/errors/app_failure.dart';

import '../support/recording_initializer.dart';

void main() {
  test(
    'web emulator startup rejects origins the SDK cannot safely restore',
    () async {
      final initializer = RecordingInitializer();
      final configuration = EnvironmentConfig.emulator(
        projectId: 'demo-tally',
        endpoints: EmulatorEndpoints(host: '127.0.0.1'),
      );
      await expectLater(
        prepareBackend(
          configuration: configuration,
          initializer: initializer,
          browserOrigin: Uri.parse('http://127.0.0.1:7358'),
        ),
        throwsA(isA<AppFailure>()),
      );
      expect(initializer.calls, isEmpty);
      await prepareBackend(
        configuration: configuration,
        initializer: initializer,
        browserOrigin: Uri.parse('http://localhost:7358'),
      );
      expect(initializer.calls, [configuration]);
    },
  );
  test('preview never initializes a Firebase SDK', () async {
    final initializer = RecordingInitializer();
    await prepareBackend(
      configuration: EnvironmentConfig.preview(),
      initializer: initializer,
    );
    expect(initializer.calls, isEmpty);
  });
  test('valid emulator config reaches the initializer exactly once', () async {
    final initializer = RecordingInitializer();
    final config = EnvironmentConfig.emulator(
      projectId: 'demo-tally',
      endpoints: EmulatorEndpoints(host: '10.0.2.2'),
    );
    await prepareBackend(configuration: config, initializer: initializer);
    expect(initializer.calls, [config]);
  });
  test('invalid configurations cause zero initialization attempts', () async {
    for (final config in [
      EnvironmentConfig.emulator(
        projectId: 'real-project',
        endpoints: EmulatorEndpoints(host: 'localhost'),
      ),
      EnvironmentConfig.emulator(projectId: 'demo-tally'),
      EnvironmentConfig.emulator(
        projectId: 'demo-tally',
        endpoints: EmulatorEndpoints(host: 'localhost', authPort: 0),
      ),
      EnvironmentConfig.unconfigured(AppEnvironment.staging),
      EnvironmentConfig.unconfigured(AppEnvironment.production),
    ]) {
      final initializer = RecordingInitializer();
      await expectLater(
        prepareBackend(configuration: config, initializer: initializer),
        throwsA(isA<AppFailure>()),
      );
      expect(initializer.calls, isEmpty);
    }
  });
  testWidgets(
    'production failure exposes recovery without private or raw data',
    (tester) async {
      final initializer = RecordingInitializer();
      await bootstrap(
        EnvironmentConfig.unconfigured(AppEnvironment.production),
        initializer: initializer,
      );
      await tester.pumpAndSettle();
      expect(find.text('Tally couldn’t start'), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
      expect(find.text('Sample data'), findsNothing);
      expect(find.text('₱25,000'), findsNothing);
      expect(initializer.calls, isEmpty);
      await tester.tap(find.widgetWithText(FilledButton, 'Try again'));
      await tester.pumpAndSettle();
      expect(initializer.calls, isEmpty);
    },
  );
  testWidgets('unexpected SDK errors are redacted from startup UI', (
    tester,
  ) async {
    await bootstrap(
      EnvironmentConfig.emulator(
        projectId: 'demo-tally',
        endpoints: EmulatorEndpoints(host: 'localhost'),
      ),
      initializer: RecordingInitializer(
        error: StateError('secret-token raw-stack'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Tally couldn’t start'), findsOneWidget);
    expect(find.textContaining('secret-token'), findsNothing);
  });
}
