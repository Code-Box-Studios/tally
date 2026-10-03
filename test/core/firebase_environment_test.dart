import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/errors/app_failure.dart';
import 'package:tally/app/bootstrap.dart';

import '../support/recording_initializer.dart';

FirebaseRuntimeOptions options({String project = 'tally-test-production'}) =>
    FirebaseRuntimeOptions(
      apiKey: 'AIzaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      appId: '1:123456789:web:abcdef',
      messagingSenderId: '123456789',
      projectId: project,
      authDomain: '$project.firebaseapp.com',
      storageBucket: '$project.firebasestorage.app',
    );
EnvironmentConfig configured({
  AppEnvironment mode = AppEnvironment.production,
  String declared = 'production',
  String project = 'tally-test-production',
  FirebaseRuntimeOptions? sdk,
  String key = 'site-key-for-configuration-tests',
}) => EnvironmentConfig.firebase(
  mode: mode,
  projectId: project,
  options: sdk ?? options(project: project),
  region: 'asia-southeast1',
  appCheckSiteKey: key,
  declaredEnvironment: declared,
);
void main() {
  test(
    'explicitly bound real configuration initializes without emulator routing',
    () async {
      final configuration = configured();
      expect(configuration.validate, returnsNormally);
      final initializer = RecordingInitializer();
      await prepareBackend(
        configuration: configuration,
        initializer: initializer,
      );
      expect(initializer.calls, [configuration]);
    },
  );
  for (final configuration in [
    configured(sdk: options(project: 'another-project')),
    configured(declared: 'staging'),
    configured(key: ''),
    configured(project: 'demo-tally'),
    configured(mode: AppEnvironment.preview),
  ]) {
    test(
      'unbound or unsafe real configuration never reaches the SDK: ${configuration.projectId}',
      () async {
        final initializer = RecordingInitializer();
        await expectLater(
          prepareBackend(
            configuration: configuration,
            initializer: initializer,
          ),
          throwsA(isA<AppFailure>()),
        );
        expect(initializer.calls, isEmpty);
      },
    );
  }
  test('staging entrypoint cannot silently load production defines', () {
    expect(
      () => configured(mode: AppEnvironment.staging).validate(),
      throwsA(isA<AppFailure>()),
    );
    expect(
      configured(mode: AppEnvironment.staging, declared: 'staging').validate,
      returnsNormally,
    );
  });
}
