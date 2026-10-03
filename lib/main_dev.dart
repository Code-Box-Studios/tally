import 'app/bootstrap.dart';
import 'core/config/environment.dart';
import 'core/firebase/emulator_connector.dart';

Future<void> main() {
  final gateway = FlutterFireSdkGateway();
  return bootstrap(
    const EnvironmentConfig.emulator(
      projectId: 'demo-tally',
      endpoints: EmulatorEndpoints(
        host: String.fromEnvironment(
          'TALLY_EMULATOR_HOST',
          defaultValue: '127.0.0.1',
        ),
      ),
    ),
    initializer: EmulatorConnector(gateway),
    clients: () => gateway.clients,
  );
}
