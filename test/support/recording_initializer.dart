import 'package:tally/core/config/environment.dart';
import 'package:tally/core/firebase/firebase_initializer.dart';

final class RecordingInitializer implements FirebaseInitializer {
  RecordingInitializer({this.error});
  final Object? error;
  final calls = <EnvironmentConfig>[];

  @override
  Future<void> initialize(EnvironmentConfig configuration) async {
    calls.add(configuration);
    final failure = error;
    if (failure != null) throw failure;
  }
}
