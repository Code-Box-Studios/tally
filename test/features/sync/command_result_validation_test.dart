import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/sync/data/command_result_validation.dart';
import 'package:tally/features/sync/domain/command_identity.dart';
import 'package:tally/features/sync/domain/command_name.dart';
import 'package:tally/features/sync/domain/command_transport.dart';
import 'package:tally/features/sync/domain/frozen_command.dart';

final owner = OwnerUid('alice');
final id = CommandId('save');
final predicted = predictedCommandId(owner, id, 'obligation');
final instance = predictedCommandId(owner, id, 'instance');
FrozenCommand command(CommandName name, {Map<String, Object?>? payload}) =>
    FrozenCommand(
      owner: owner,
      id: id,
      name: name,
      payload:
          payload ??
          switch (name) {
            CommandName.saveCatalog => {'kind': 'contact', 'id': null},
            CommandName.correctPayment => {
              'paymentId': 'old-payment',
              'replacement': null,
            },
            _ => {
              'obligationId': 'loan',
              'instanceId': 'period',
              'obligationInstanceId': 'period',
            },
          },
      resourceKey: name == CommandName.saveCatalog
          ? 'contact:person'
          : 'obligation:loan',
      createdAt: DateTime.utc(2026, 10, 8),
    );
Map<String, Object?> result(CommandName name) => switch (name) {
  CommandName.createObligation => {
    'obligationId': predicted,
    'obligationInstanceId': instance,
    'obligationRevision': 1,
    'instanceRevision': 1,
  },
  CommandName.editObligation || CommandName.cancelObligation => {
    'obligationId': 'loan',
    'obligationInstanceId': 'period',
    'obligationRevision': 2,
    'instanceRevision': 2,
  },
  CommandName.createInstallment ||
  CommandName.editInstallment ||
  CommandName.cancelInstallment => {
    'obligationId': name == CommandName.createInstallment ? predicted : 'loan',
    'obligationInstanceIds': ['period', 'second'],
    'obligationRevision': 2,
    'instanceRevisions': [
      {'instanceId': 'period', 'instanceRevision': 2},
      {'instanceId': 'second', 'instanceRevision': 2},
    ],
  },
  CommandName.recordPayment || CommandName.recordInstallmentPayment => {
    'paymentId': 'payment',
    'obligationId': 'loan',
    'obligationInstanceId': 'period',
    'obligationRevision': 2,
    'instanceRevision': 2,
  },
  CommandName.correctPayment => {
    'originalPaymentId': 'old-payment',
    'reversalId': 'reversal',
    'replacementId': null,
    'obligationId': 'loan',
    'obligationInstanceId': 'period',
    'obligationRevision': 3,
    'instanceRevision': 3,
    'allocationRevisions': [
      {'instanceId': 'period', 'instanceRevision': 3},
    ],
  },
  CommandName.createRecurring ||
  CommandName.editRecurring ||
  CommandName.changeRecurringLifecycle => {
    'obligationId': name == CommandName.createRecurring ? predicted : 'loan',
    'obligationRevision': 2,
    'generationRevision': 1,
    'firstInstanceId': null,
  },
  CommandName.setRecurringAmount ||
  CommandName.editRecurringInstance ||
  CommandName.skipRecurringInstance => {
    'obligationId': 'loan',
    'instanceId': 'period',
    'instanceRevision': 2,
  },
  CommandName.confirmDeduction => {
    'obligationId': 'loan',
    'instanceId': 'period',
    'obligationRevision': 2,
    'instanceRevision': 2,
    'paymentId': 'auto-payment',
    'evidenceId': null,
  },
  CommandName.reportDeductionFailure => {
    'obligationId': 'loan',
    'instanceId': 'period',
    'obligationRevision': 2,
    'instanceRevision': 2,
    'reversalId': null,
    'attemptId': 'attempt',
  },
  CommandName.saveCatalog => {
    'id': predictedCommandId(owner, id, 'contact'),
    'revision': 1,
  },
  CommandName.setObligationReminder => {
    'obligationId': 'loan',
    'obligationRevision': 2,
    'reminderRevision': 1,
  },
  CommandName.updateNotificationPreferences => {'preferenceRevision': 2},
};
void main() {
  for (final name in CommandName.values) {
    test(
      '${name.name} validates its actual protected response and rejects corruption',
      () {
        final action = command(name), good = result(name);
        final accepted = validateCommandResult(action, good);
        expect(accepted, good);
        expect(() => accepted['tamper'] = true, throwsUnsupportedError);
        expect(
          () => validateCommandResult(action, {}),
          throwsA(isA<UnverifiedCommandResponse>()),
        );
        final revisionKey = good.keys.firstWhere(
          (key) => key.endsWith('Revision') || key == 'revision',
        );
        for (final value in [0, -1, 1.5, double.infinity, '2']) {
          expect(
            () => validateCommandResult(action, {...good, revisionKey: value}),
            throwsA(isA<UnverifiedCommandResponse>()),
          );
        }
        if (good.containsKey('obligationId')) {
          expect(
            () => validateCommandResult(action, {
              ...good,
              'obligationId': 'wrong-loan',
            }),
            throwsA(isA<UnverifiedCommandResponse>()),
          );
        }
      },
    );
  }
  test('creation identity and catalog edit identity cannot be exchanged', () {
    final create = command(CommandName.createObligation);
    expect(
      () => validateCommandResult(create, {
        ...result(create.name),
        'obligationInstanceId': 'wrong-period',
      }),
      throwsA(isA<UnverifiedCommandResponse>()),
    );
    final edit = command(
      CommandName.saveCatalog,
      payload: {'kind': 'contact', 'id': 'existing'},
    );
    expect(
      validateCommandResult(edit, {'id': 'existing', 'revision': 2})['id'],
      'existing',
    );
    expect(
      () => validateCommandResult(edit, result(edit.name)),
      throwsA(isA<UnverifiedCommandResponse>()),
    );
  });
  test(
    'installment allocations are unique, complete and match explicit periods',
    () {
      final action = command(
        CommandName.recordInstallmentPayment,
        payload: {
          'obligationId': 'loan',
          'explicitAllocations': [
            {'instanceId': 'one', 'amountMinor': 100},
            {'instanceId': 'two', 'amountMinor': 200},
          ],
        },
      );
      final good = {
        'paymentId': 'payment',
        'obligationId': 'loan',
        'obligationInstanceId': null,
        'obligationRevision': 2,
        'instanceRevision': null,
        'allocationRevisions': [
          {'instanceId': 'one', 'instanceRevision': 2},
          {'instanceId': 'two', 'instanceRevision': 2},
        ],
      };
      expect(validateCommandResult(action, good), good);
      for (final allocation in <List<Map<String, Object?>>>[
        <Map<String, Object?>>[],
        [
          {'instanceId': 'one', 'instanceRevision': 2},
        ],
        [
          {'instanceId': 'one', 'instanceRevision': 2},
          {'instanceId': 'one', 'instanceRevision': 2},
        ],
        [
          {'instanceId': 'one', 'instanceRevision': 2},
          {'instanceId': 'other', 'instanceRevision': 2},
        ],
      ]) {
        expect(
          () => validateCommandResult(action, {
            ...good,
            'allocationRevisions': allocation,
          }),
          throwsA(isA<UnverifiedCommandResponse>()),
        );
      }
      expect(
        () => validateCommandResult(action, {...good, 'instanceRevision': 2}),
        throwsA(isA<UnverifiedCommandResponse>()),
      );
    },
  );
  test('correction keeps original and replacement history identifiable', () {
    final action = command(CommandName.correctPayment);
    final good = result(action.name);
    expect(
      () => validateCommandResult(action, {
        ...good,
        'originalPaymentId': 'other',
      }),
      throwsA(isA<UnverifiedCommandResponse>()),
    );
    expect(
      () => validateCommandResult(action, {
        ...good,
        'replacementId': 'unexpected',
      }),
      throwsA(isA<UnverifiedCommandResponse>()),
    );
    expect(
      () =>
          validateCommandResult(action, {...good, 'reversalId': 'old-payment'}),
      throwsA(isA<UnverifiedCommandResponse>()),
    );
  });
  test(
    'browser integral doubles normalize without accepting fractional revisions',
    () {
      final action = command(CommandName.updateNotificationPreferences);
      expect(
        validateCommandResult(action, {
          'preferenceRevision': 2.0,
        })['preferenceRevision'],
        2,
      );
    },
  );
}
