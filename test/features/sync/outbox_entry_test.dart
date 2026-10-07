import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/sync/domain/command_submission.dart';
import 'package:tally/features/sync/domain/outbox_entry.dart';
import 'package:tally/features/sync/domain/sync_capability.dart';
import 'package:tally/shared/domain/financial_failure.dart';

import 'frozen_command_test.dart' show owner, now, command;

void main() {
  test('accepted results cannot be invented for queued or rejected financial actions', () {
    final queued = OutboxEntry(
      command: command(),
      sequence: 1,
      revision: 1,
      state: OutboxState.queued,
      attempts: 0,
      nextAttemptAt: now,
      updatedAt: now,
    );
    expect(queued.result, isNull);
    expect(
      () => OutboxEntry(
        command: command(),
        sequence: 1,
        revision: 1,
        state: OutboxState.accepted,
        attempts: 1,
        nextAttemptAt: now,
        updatedAt: now,
      ),
      throwsArgumentError,
    );
    final result = <String, Object?>{
      'paymentId': 'payment-1',
      'allocationRevisions': [
        {'instanceId': 'period-1', 'instanceRevision': 2},
      ],
    };
    final accepted = OutboxEntry(
      command: command(),
      sequence: 1,
      revision: 2,
      state: OutboxState.accepted,
      attempts: 1,
      nextAttemptAt: now,
      updatedAt: now,
      result: result,
    );
    (result['allocationRevisions'] as List).clear();
    expect((accepted.result!['allocationRevisions'] as List).length, 1);
    expect(
      () => OutboxEntry(
        command: command(),
        sequence: 1,
        revision: 1,
        state: OutboxState.queued,
        attempts: 0,
        nextAttemptAt: now,
        updatedAt: now,
        result: {'paymentId': 'fake'},
      ),
      throwsArgumentError,
    );
  });
  test('sending work carries a checked owner/action lease; stale or foreign fences cannot claim it', () {
    final dispatch = DispatchLease(
      owner: owner,
      token: 'lease-1',
      generation: 1,
      expiresAt: now.add(const Duration(seconds: 60)),
    );
    final lease = CommandLease(
      dispatch: dispatch,
      id: CommandId('pay-1'),
      generation: 1,
    );
    final entry = OutboxEntry(
      command: command(),
      sequence: 1,
      revision: 2,
      state: OutboxState.sending,
      attempts: 1,
      nextAttemptAt: now,
      updatedAt: now,
      lease: lease,
    );
    expect(LeasedCommand(entry, dispatch).entry, entry);
    expect(dispatch.isValidAt(now), isTrue);
    expect(dispatch.isValidAt(dispatch.expiresAt), isFalse);
    final foreign = DispatchLease(
      owner: OwnerUid('bob'),
      token: 'lease-1',
      generation: 1,
      expiresAt: dispatch.expiresAt,
    );
    expect(() => LeasedCommand(entry, foreign), throwsArgumentError);
    expect(
      () => LeasedCommand(
        entry,
        DispatchLease(
          owner: owner,
          token: 'lease-2',
          generation: 2,
          expiresAt: dispatch.expiresAt,
        ),
      ),
      throwsArgumentError,
    );
    expect(
      () => OutboxEntry(
        command: command(),
        sequence: 1,
        revision: 1,
        state: OutboxState.sending,
        attempts: 0,
        nextAttemptAt: now,
        updatedAt: now,
      ),
      throwsArgumentError,
    );
    expect(
      () => DispatchLease(
        owner: owner,
        token: 'lease-1',
        generation: 0,
        expiresAt: now,
      ),
      throwsArgumentError,
    );
  });
  test(
    'terminal failures require a reason and local counters/instants stay valid',
    () {
      const failure = FinancialFailure(
        FinancialFailureCode.overpayment,
        'Review the amount.',
      );
      expect(
        OutboxEntry(
          command: command(),
          sequence: 1,
          revision: 2,
          state: OutboxState.rejected,
          attempts: 1,
          nextAttemptAt: now,
          updatedAt: now,
          failure: failure,
        ).failure,
        failure,
      );
      for (final state in [OutboxState.rejected, OutboxState.blocked]) {
        expect(
          () => OutboxEntry(
            command: command(),
            sequence: 1,
            revision: 1,
            state: state,
            attempts: 0,
            nextAttemptAt: now,
            updatedAt: now,
          ),
          throwsArgumentError,
        );
      }
      expect(() => OutboxState.parse('paid'), throwsArgumentError);
      expect(
        () => OutboxEntry(
          command: command(),
          sequence: 0,
          revision: 1,
          state: OutboxState.queued,
          attempts: 0,
          nextAttemptAt: now,
          updatedAt: now,
        ),
        throwsArgumentError,
      );
      expect(
        () => OutboxEntry(
          command: command(),
          sequence: 1,
          revision: 1,
          state: OutboxState.queued,
          attempts: -1,
          nextAttemptAt: now,
          updatedAt: now,
        ),
        throwsArgumentError,
      );
      expect(
        () => OutboxEntry(
          command: command(),
          sequence: 1,
          revision: 1,
          state: OutboxState.queued,
          attempts: 0,
          nextAttemptAt: DateTime(2026),
          updatedAt: now,
        ),
        throwsArgumentError,
      );
    },
  );
  test('queued submissions expose action identity without an accepted payment value', () {
    final CommandSubmission<String> accepted = AcceptedSubmission('payment-1');
    final CommandSubmission<String> queued = QueuedSubmission(
      owner,
      CommandId('pay-1'),
    );
    expect(switch (accepted) {
      AcceptedSubmission(:final value) => value,
      QueuedSubmission() => null,
    }, 'payment-1');
    expect(switch (queued) {
      AcceptedSubmission(:final value) => value,
      QueuedSubmission() => null,
    }, isNull);
    expect(
      QueuedCommand(owner, CommandId('pay-1')).toString(),
      'Waiting to sync.',
    );
    for (final status in SyncAvailability.values) {
      expect(
        SyncCapability(status).canQueue,
        status == SyncAvailability.durable,
      );
    }
  });
}
