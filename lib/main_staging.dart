import 'app/bootstrap.dart';
import 'core/config/environment.dart';

Future<void> main() =>
    bootstrap(const EnvironmentConfig.unconfigured(AppEnvironment.staging));
