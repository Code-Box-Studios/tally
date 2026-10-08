import '../../../core/identifiers/entity_ids.dart';
import 'frozen_command.dart';

abstract interface class CommandTransport {
  OwnerUid get owner;
  bool get isOwnerActive;
  Future<Map<String, Object?>> execute(FrozenCommand command);
}

/// An unverified response may follow a committed server action. Replay the same
/// identity after review; never label it as a definitive rejected transaction.
final class UnverifiedCommandResponse implements Exception {
  const UnverifiedCommandResponse();
  @override
  String toString() =>
      'Could not verify this save. Retry the same saved action.';
}

typedef CommandResultValidator = Map<String, Object?> Function(
  FrozenCommand command,
  Map<String, Object?> result,
);
