import 'app/bootstrap.dart';
import 'core/config/environment.dart';
import 'core/firebase/production_initializer.dart';

Future<void> main() {
  final gateway = FlutterFireProductionGateway();
  return bootstrap(
    EnvironmentConfig.fromDefines(AppEnvironment.staging),
    initializer: ProductionInitializer(gateway),
    clients: () => gateway.clients,
  );
}
