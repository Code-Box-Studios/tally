import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/dates/local_date.dart';
import 'package:tally/core/money/money.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/obligations/domain/obligation.dart';
import 'package:tally/features/obligations/domain/obligation_commands.dart';
import 'package:tally/shared/presentation/financial_providers.dart';
import 'package:tally/shared/presentation/financial_actions.dart';

import 'repository_paging_test.dart' show FakeDocuments, FakeCommands;

ObligationDraft draft() => ObligationDraft(
  title: 'Personal loan',
  description: 'Borrowed',
  notes: '',
  direction: ObligationDirection.owedByMe,
  amount: Money.parse('10000', CurrencyCode.php),
  originationDate: LocalDate.parse('2026-01-01'),
  dueDate: null,
  contactId: null,
  categoryId: CategoryId('default-personal-loan'),
  paymentSourceId: null,
  interestInfo: null,
);
void main() {
  test(
    'an uncertain command retains its identity after all form listeners leave',
    () async {
      final owner = OwnerUid('alice');
      final commands = FakeCommands(owner);
      final container = ProviderContainer(
        overrides: [
          ownerUidProvider.overrideWithValue(owner),
          ownerDocumentsFactoryProvider.overrideWithValue(
            (_) => FakeDocuments(owner),
          ),
          ownerCommandsFactoryProvider.overrideWithValue((_) => commands),
        ],
      );
      addTearDown(container.dispose);
      var subscription = container.listen(financialActionsProvider, (_, _) {});
      commands.failNext = true;
      expect(
        await container
            .read(financialActionsProvider.notifier)
            .createObligation(draft()),
        isNull,
      );
      subscription.close();
      await container.pump();
      await container.pump();
      subscription = container.listen(financialActionsProvider, (_, _) {});
      addTearDown(subscription.close);
      expect(
        await container
            .read(financialActionsProvider.notifier)
            .createObligation(draft()),
        isNotNull,
      );
      expect(commands.commandIds.last, commands.commandIds.first);
    },
  );
  test('owner-scoped repositories and uncertain command retries cannot leak between accounts', () async {
    final root = ProviderContainer(
      overrides: [
        ownerDocumentsFactoryProvider.overrideWithValue(
          (owner) => FakeDocuments(owner),
        ),
        ownerCommandsFactoryProvider.overrideWithValue(
          (owner) => FakeCommands(owner),
        ),
      ],
    );
    addTearDown(root.dispose);
    final alice = ProviderContainer(
      parent: root,
      overrides: [ownerUidProvider.overrideWithValue(OwnerUid('alice'))],
    );
    final bob = ProviderContainer(
      parent: root,
      overrides: [ownerUidProvider.overrideWithValue(OwnerUid('bob'))],
    );
    addTearDown(bob.dispose);
    final aListen = alice.listen(financialActionsProvider, (_, _) {});
    final bListen = bob.listen(financialActionsProvider, (_, _) {});
    addTearDown(bListen.close);
    expect(
      (await alice.read(obligationsRepositoryProvider).watchObligations().first)
          .items
          .first
          .owner,
      OwnerUid('alice'),
    );
    expect(
      (await bob.read(obligationsRepositoryProvider).watchObligations().first)
          .items
          .first
          .owner,
      OwnerUid('bob'),
    );
    final commands = alice.read(ownerCommandGatewayProvider) as FakeCommands;
    commands.failNext = true;
    final actions = alice.read(financialActionsProvider.notifier);
    expect(await actions.createObligation(draft()), isNull);
    expect(await actions.createObligation(draft()), isNotNull);
    expect(commands.commandIds[0], commands.commandIds[1]);
    expect(await actions.createObligation(draft()), isNotNull);
    expect(commands.commandIds[2], isNot(commands.commandIds[1]));
    commands.pending = Completer<Map<String, Object?>>();
    final outstanding = actions.createObligation(draft());
    expect(
      await actions.createObligation(draft()),
      isNull,
    ); // busy cannot duplicate
    aListen.close();
    alice.dispose();
    commands.pending!.complete({
      'obligationId': 'alice-late',
      'obligationInstanceId': 'alice-period',
      'obligationRevision': 1,
      'instanceRevision': 1,
    });
    expect(await outstanding, isNull);
    expect(bob.read(financialActionsProvider).isLoading, isFalse);
    expect(bob.read(financialActionsProvider).hasError, isFalse);
    expect(
      (bob.read(ownerCommandGatewayProvider) as FakeCommands).commandIds,
      isEmpty,
    );
  });
}
