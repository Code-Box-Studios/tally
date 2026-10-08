import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/owner_command_gateway.dart';
import '../../../shared/domain/financial_failure.dart';
import '../domain/command_dependencies.dart';
import '../domain/command_name.dart';
import '../domain/command_submission.dart';
import '../domain/sync_engine.dart';

/// Keeps repository return types intact while distinguishing durable local
/// intents from verified server acceptance at the action boundary.
final class DurableOwnerCommands implements OwnerCommandGateway {
  DurableOwnerCommands({
    required this.raw,
    required this.engine,
    required this.dependencies,
    DateTime Function()? utcNow,
  }) : _utcNow = utcNow ?? (() => DateTime.now().toUtc()) {
    if (raw.owner != engine.owner || dependencies.owner != engine.owner) {
      throw ArgumentError('Command owners must match.');
    }
  }
  final OwnerCommandGateway raw;
  final SyncEngine engine;
  final CommandDependencies dependencies;
  final DateTime Function() _utcNow;
  @override
  OwnerUid get owner => engine.owner;
  void _check() {
    if (!engine.transport.isOwnerActive) {
      throw const FinancialFailure(
        FinancialFailureCode.signIn,
        'Sign in to the same account to sync your changes.',
      );
    }
  }

  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId commandId,
    Map<String, Object?> payload,
  ) async {
    _check();
    final names = CommandName.values.where((item) => item.name == name);
    if (names.isEmpty) {
      final result = await raw.call(name, commandId, payload);
      _check();
      return result;
    }
    final command = await dependencies.freeze(
      names.single,
      commandId,
      payload,
      _utcNow(),
    );
    _check();
    return switch (await engine.submit(command)) {
      AcceptedSubmission<Map<String, Object?>>(:final value) => value,
      QueuedSubmission<Map<String, Object?>>(:final owner, :final commandId) =>
        throw QueuedCommand(owner, commandId),
    };
  }
}
