import '../../../core/identifiers/entity_ids.dart';

sealed class CommandSubmission<T> {
  const CommandSubmission();
}

final class AcceptedSubmission<T> extends CommandSubmission<T> {
  const AcceptedSubmission(this.value);
  final T value;
}

/// A queued action has no invented canonical record, revision or balance.
final class QueuedSubmission<T> extends CommandSubmission<T> {
  const QueuedSubmission(this.owner, this.commandId);
  final OwnerUid owner;
  final CommandId commandId;
}

/// Allows accepted-only repository DTO contracts to signal durable queuing.
final class QueuedCommand implements Exception {
  const QueuedCommand(this.owner, this.commandId);
  final OwnerUid owner;
  final CommandId commandId;
  @override
  String toString() => 'Waiting to sync.';
}
