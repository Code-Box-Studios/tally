import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/errors/app_failure.dart';
import 'package:tally/core/firebase/emulator_connector.dart';

class RecordingGateway implements FirebaseSdkGateway {
  final calls = <String>[];
  bool failStorage = false;
  @override
  Future<void> initializeDemo(String id) async {
    calls.add('init:$id');
  }

  @override
  Future<void> connectAuth(String host, int port) async {
    calls.add('auth:$host:$port');
  }

  @override
  void connectFirestore(String host, int port) {
    calls.add('firestore:$host:$port');
  }

  @override
  void connectFunctions(String host, int port) {
    calls.add('functions:$host:$port');
  }

  @override
  Future<void> connectStorage(String host, int port) async {
    calls.add('storage:$host:$port');
    if (failStorage) throw StateError('connection failed');
  }
}

void main() {
  test('Validated host connects all services before completion', () async {
    final gateway = RecordingGateway();
    await EmulatorConnector(gateway).initialize(
      const EnvironmentConfig.emulator(
        projectId: 'demo-tally',
        endpoints: EmulatorEndpoints(host: '10.0.2.2'),
      ),
    );
    expect(gateway.calls, [
      'init:demo-tally',
      'auth:10.0.2.2:9099',
      'firestore:10.0.2.2:8080',
      'functions:10.0.2.2:5001',
      'storage:10.0.2.2:9199',
    ]);
  });
  test('Invalid pairings and modes cause zero SDK calls', () async {
    for (final config in [
      const EnvironmentConfig.preview(),
      const EnvironmentConfig.unconfigured(AppEnvironment.production),
      const EnvironmentConfig.emulator(
        projectId: 'real-project',
        endpoints: EmulatorEndpoints(host: 'localhost'),
      ),
      const EnvironmentConfig.emulator(
        projectId: 'demo-tally',
        endpoints: EmulatorEndpoints(host: 'https://localhost'),
      ),
      const EnvironmentConfig.emulator(projectId: 'demo-tally'),
    ]) {
      final gateway = RecordingGateway();
      await expectLater(
        EmulatorConnector(gateway).initialize(config),
        throwsA(isA<AppFailure>()),
      );
      expect(gateway.calls, isEmpty);
    }
  });
  test('Connection failure propagates rather than switching backend', () async {
    final gateway = RecordingGateway()..failStorage = true;
    await expectLater(
      EmulatorConnector(gateway).initialize(
        const EnvironmentConfig.emulator(
          projectId: 'demo-tally',
          endpoints: EmulatorEndpoints(host: '127.0.0.1'),
        ),
      ),
      throwsStateError,
    );
    expect(gateway.calls.length, 5);
  });
  test('Actual adapter exposes no clients before complete connection', () {
    final gateway = FlutterFireSdkGateway();
    expect(() => gateway.clients, throwsStateError);
  });
}
