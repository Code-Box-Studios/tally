import '../config/environment.dart';

abstract interface class FirebaseInitializer {
  Future<void> initialize(EnvironmentConfig configuration);
}
