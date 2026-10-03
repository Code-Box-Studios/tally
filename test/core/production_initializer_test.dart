import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/firebase/production_initializer.dart';

import 'firebase_environment_test.dart' show configured;

class RecordingGateway implements ProductionSdkGateway {
  final steps = <String>[];
  String? failAt;
  Future<void> step(String name) async {
    steps.add(name);
    if (failAt == name) throw StateError('SDK failed');
  }

  @override
  Future<void> initializeFirebase(FirebaseRuntimeOptions options) =>
      step('firebase');
  @override
  Future<void> activateAppCheck(String siteKey) => step('attestation');
  @override
  void publishClients(String region) {
    steps.add('clients:$region');
  }
}

void main() {
  test('attestation starts before private SDK clients are published', () async {
    final gateway = RecordingGateway();
    await ProductionInitializer(gateway).initialize(configured());
    expect(gateway.steps, [
      'firebase',
      'attestation',
      'clients:asia-southeast1',
    ]);
  });
  for (final failedStep in ['firebase', 'attestation']) {
    test('$failedStep failure publishes no clients or fallback', () async {
      final gateway = RecordingGateway()..failAt = failedStep;
      await expectLater(
        ProductionInitializer(gateway).initialize(configured()),
        throwsStateError,
      );
      expect(gateway.steps.any((step) => step.startsWith('clients')), isFalse);
    });
  }
  test(
    'live initializer refuses emulator and preview before SDK calls',
    () async {
      for (final config in [
        const EnvironmentConfig.preview(),
        const EnvironmentConfig.emulator(
          projectId: 'demo-tally',
          endpoints: EmulatorEndpoints(host: 'localhost'),
        ),
      ]) {
        final gateway = RecordingGateway();
        await expectLater(
          ProductionInitializer(gateway).initialize(config),
          throwsA(anything),
        );
        expect(gateway.steps, isEmpty);
      }
    },
  );
}
