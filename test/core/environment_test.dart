import 'package:test/test.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/errors/app_failure.dart';

void main() {
  final invalid = isA<AppFailure>().having(
    (e) => e.code,
    'code',
    AppFailureCode.invalidEnvironment,
  );
  test('preview has no Firebase project', () {
    final config = EnvironmentConfig.preview();
    config.validate();
    expect(config.projectId, isNull);
    expect(config.mode, AppEnvironment.preview);
  });
  test('complete demo endpoints keep Android and explicit LAN host', () {
    for (final host in ['127.0.0.1', 'localhost', '10.0.2.2', '192.168.1.50']) {
      final config = EnvironmentConfig.emulator(
        projectId: 'demo-tally',
        endpoints: EmulatorEndpoints(host: host),
      );
      config.validate();
      expect(config.endpoints!.host, host);
      expect(config.endpoints!.authPort, 9099);
      expect(config.endpoints!.firestorePort, 8080);
      expect(config.endpoints!.functionsPort, 5001);
      expect(config.endpoints!.storagePort, 9199);
    }
  });
  test('a real project or missing endpoints cannot masquerade as local', () {
    expect(
      () => EnvironmentConfig.emulator(
        projectId: 'tally-production',
        endpoints: EmulatorEndpoints(host: 'localhost'),
      ).validate(),
      throwsA(invalid),
    );
    expect(
      () => EnvironmentConfig.emulator(projectId: 'demo-tally').validate(),
      throwsA(invalid),
    );
    expect(
      () => EnvironmentConfig.emulator(projectId: 'demo-').validate(),
      throwsA(invalid),
    );
  });
  test('URLs, credentials, path injection and invalid ports are rejected', () {
    for (final host in [
      'https://localhost',
      'user@localhost',
      'localhost/path',
      'localhost?x=1',
      '',
      ' localhost',
      'localhost:8080',
      '999.0.0.1',
    ]) {
      expect(
        () => EnvironmentConfig.emulator(
          projectId: 'demo-tally',
          endpoints: EmulatorEndpoints(host: host),
        ).validate(),
        throwsA(invalid),
      );
    }
    for (final endpoints in [
      EmulatorEndpoints(host: 'localhost', authPort: 0),
      EmulatorEndpoints(host: 'localhost', firestorePort: -1),
      EmulatorEndpoints(host: 'localhost', functionsPort: 65536),
      EmulatorEndpoints(host: 'localhost', storagePort: 0),
    ]) {
      expect(
        () => EnvironmentConfig.emulator(
          projectId: 'demo-tally',
          endpoints: endpoints,
        ).validate(),
        throwsA(invalid),
      );
    }
  });
  test('real environments need explicit project configuration', () {
    for (final mode in [
      AppEnvironment.development,
      AppEnvironment.staging,
      AppEnvironment.production,
    ]) {
      expect(
        () => EnvironmentConfig.unconfigured(mode).validate(),
        throwsA(invalid),
      );
    }
  });
}
