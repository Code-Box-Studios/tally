import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/financial_failure.dart';
import 'frozen_command.dart';

enum OutboxState {
  queued,
  sending,
  accepted,
  rejected,
  blocked,
  cancelled;

  static OutboxState parse(String value) {
    for (final state in values) {
      if (state.name == value) return state;
    }
    throw ArgumentError('Unsupported saved action state.');
  }
}

void _counter(int value, {bool zero = false}) {
  if (value < (zero ? 0 : 1) || value >= maxExactCommandInteger) {
    throw ArgumentError('Invalid saved action counter.');
  }
}

final class DispatchLease {
  DispatchLease({
    required this.owner,
    required this.token,
    required this.generation,
    required this.expiresAt,
  }) {
    _counter(generation);
    final match = RegExp(r'^[A-Za-z0-9_-]{1,128}$').firstMatch(token);
    if (match == null || match.end != token.length || !expiresAt.isUtc) {
      throw ArgumentError('Invalid sync lease.');
    }
  }
  final OwnerUid owner;
  final String token;
  final int generation;
  final DateTime expiresAt;
  bool isValidAt(DateTime now) => now.isUtc && now.isBefore(expiresAt);
  bool sameFence(DispatchLease other) =>
      owner == other.owner &&
      token == other.token &&
      generation == other.generation &&
      expiresAt == other.expiresAt;
}

final class CommandLease {
  CommandLease({
    required this.dispatch,
    required this.id,
    required this.generation,
  }) {
    _counter(generation);
  }
  final DispatchLease dispatch;
  final CommandId id;
  final int generation;
}

final class OutboxEntry {
  OutboxEntry({
    required this.command,
    required this.sequence,
    required this.revision,
    required this.state,
    required this.attempts,
    required this.nextAttemptAt,
    required this.updatedAt,
    this.lease,
    this.failure,
    Map<String, Object?>? result,
  }) : result = result == null ? null : freezeCommandJson(result) {
    _counter(sequence);
    _counter(revision);
    _counter(attempts, zero: true);
    if (!nextAttemptAt.isUtc ||
        !updatedAt.isUtc ||
        (state == OutboxState.accepted) != (this.result != null) ||
        (state == OutboxState.sending) != (lease != null) ||
        state == OutboxState.sending && attempts == 0 ||
        state == OutboxState.accepted && (attempts == 0 || failure != null) ||
        state == OutboxState.cancelled && attempts != 0 ||
        [OutboxState.rejected, OutboxState.blocked].contains(state) &&
            failure == null ||
        lease != null &&
            (lease!.dispatch.owner != command.owner ||
                lease!.id != command.id)) {
      throw ArgumentError('Inconsistent saved action state.');
    }
  }
  final FrozenCommand command;
  final int sequence, revision, attempts;
  final OutboxState state;
  final DateTime nextAttemptAt, updatedAt;
  final CommandLease? lease;
  final Map<String, Object?>? result;
  final FinancialFailure? failure;
}

final class LeasedCommand {
  LeasedCommand(this.entry, this.dispatch) {
    if (entry.state != OutboxState.sending ||
        entry.command.owner != dispatch.owner ||
        entry.lease == null ||
        !entry.lease!.dispatch.sameFence(dispatch)) {
      throw ArgumentError('This saved action has another sync lease.');
    }
  }
  final OutboxEntry entry;
  final DispatchLease dispatch;
}
