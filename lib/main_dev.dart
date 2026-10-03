import 'app/bootstrap.dart';
import 'core/config/environment.dart';

Future<void> main() => bootstrap(
  const EnvironmentConfig.emulator(
    projectId: 'demo-tally',
    endpoints: EmulatorEndpoints(
      host: String.fromEnvironment(
        'TALLY_EMULATOR_HOST',
        defaultValue: '127.0.0.1',
      ),
    ),
  ),
);
