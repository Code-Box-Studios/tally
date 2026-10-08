import 'sync_capability.dart';

/// A safe local-storage failure. Raw SQL and browser exceptions are not exposed.
final class LocalOutboxFailure implements Exception {
  const LocalOutboxFailure(this.availability);
  final SyncAvailability availability;
  String get message => switch (availability) {
    SyncAvailability.quota => 'Local storage is full. Keep your draft and free space before retrying the original action.',
    SyncAvailability.unsupportedSchema => 'Saved changes need a newer version or storage recovery. They have been preserved.',
    _ => 'Offline saving is unavailable. Keep your draft and reconnect.',
  };
  @override
  String toString() => message;
}
