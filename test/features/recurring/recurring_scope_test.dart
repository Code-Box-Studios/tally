import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/dates/local_date.dart';
import 'package:tally/core/money/money.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/recurring/presentation/recurring_providers.dart';
import 'package:tally/features/recurring/domain/recurring_commands.dart';
import 'package:tally/shared/presentation/financial_actions.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import '../../support/recurring_fixtures.dart';
import '../../support/upcoming_fixtures.dart';

void main() {
  test('lifecycle amount confirmation and failure uncertain retries retain the original revision and command', () async {
    final commands = UpcomingCommands(recurringOwner)
      ..response = {
        'obligationId': 'bill-1',
        'instanceId': 'period-1',
        'obligationRevision': 2,
        'generationRevision': 2,
        'retainedFutureCount': 2,
        'instanceRevision': 3,
        'paymentId': 'payment-1',
        'evidenceId': null,
        'reversalId': null,
        'attemptId': 'attempt-1',
      };
    final scope = ProviderContainer(
      overrides: [
        ownerUidProvider.overrideWithValue(recurringOwner),
        ownerDocumentsFactoryProvider.overrideWithValue(UpcomingDocuments.new),
        ownerCommandsFactoryProvider.overrideWithValue((_) => commands),
      ],
    );
    addTearDown(scope.dispose);
    final actions = scope.read(financialActionsProvider.notifier),
        parent = ObligationId('bill-1'),
        period = InstanceId('period-1');
    final operations = <Future<Object?> Function()>[
      () => actions.changeRecurringLifecycle(
        LifecycleChange(
          obligationId: parent,
          expectedRevision: 1,
          action: RecurringLifecycleAction.pause,
          effectiveDate: LocalDate.parse('2026-10-06'),
        ),
      ),
      () => actions.setRecurringAmount(
        InstanceAmountEdit(
          obligationId: parent,
          instanceId: period,
          expectedRevision: 2,
          amount: Money.fromMinorUnits(54900, CurrencyCode.php),
          reason: 'Billing statement',
        ),
      ),
      () => actions.confirmDeduction(
        DeductionConfirmation(
          obligationId: parent,
          instanceId: period,
          expectedRevision: 2,
          terms: deductionTerms(),
        ),
      ),
      () => actions.reportDeductionFailure(
        DeductionFailure(
          obligationId: parent,
          instanceId: period,
          expectedRevision: 2,
          reason: 'Not deducted',
        ),
      ),
    ];
    for (final operation in operations) {
      commands.failNext = true;
      final index = commands.calls.length;
      expect(await operation(), isNull);
      expect(await operation(), isNotNull);
      expect(commands.calls[index].id, commands.calls[index + 1].id);
      expect(commands.calls[index].payload, commands.calls[index + 1].payload);
    }
  });
  test('recurring repositories bind to current account and root scope cannot access records', () {
    final root = ProviderContainer(
      overrides: [
        ownerDocumentsFactoryProvider.overrideWithValue(UpcomingDocuments.new),
        ownerCommandsFactoryProvider.overrideWithValue(UpcomingCommands.new),
      ],
    );
    addTearDown(root.dispose);
    for (final uid in ['alice', 'bob']) {
      final child = ProviderContainer(
        parent: root,
        overrides: [ownerUidProvider.overrideWithValue(OwnerUid(uid))],
      );
      addTearDown(child.dispose);
      expect(child.read(recurringRepositoryProvider).owner, OwnerUid(uid));
    }
    expect(() => root.read(recurringRepositoryProvider), throwsA(anything));
  });
  test('uncertain recurring creation retries same identity and disposed owner discards completion', () async {
    final commands = UpcomingCommands(recurringOwner)
      ..failNext = true
      ..response = {
        'obligationId': 'bill-1',
        'obligationRevision': 1,
        'firstInstanceId': null,
        'generationRevision': 1,
      };
    final scope = ProviderContainer(
      overrides: [
        ownerUidProvider.overrideWithValue(recurringOwner),
        ownerDocumentsFactoryProvider.overrideWithValue(UpcomingDocuments.new),
        ownerCommandsFactoryProvider.overrideWithValue((_) => commands),
      ],
    );
    final listener = scope.listen(financialActionsProvider, (_, _) {}),
        actions = scope.read(financialActionsProvider.notifier);
    expect(await actions.createRecurring(recurringDraft()), isNull);
    listener.close();
    await scope.pump();
    expect(await actions.createRecurring(recurringDraft()), isNotNull);
    expect(commands.calls[0].id, commands.calls[1].id);
    expect(commands.calls[0].payload, commands.calls[1].payload);
    commands.pending = Completer<Map<String, Object?>>();
    final pending = actions.createRecurring(recurringDraft());
    expect(await actions.createRecurring(recurringDraft()), isNull);
    scope.dispose();
    commands.pending!.complete(commands.response);
    expect(await pending, isNull);
  });
}
