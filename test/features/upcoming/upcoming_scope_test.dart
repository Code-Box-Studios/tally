import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/core/money/money.dart';
import 'package:tally/core/dates/local_date.dart';
import 'package:tally/features/auth/domain/user_profile.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/dashboard/presentation/projected_dashboard_providers.dart';
import 'package:tally/features/activity/presentation/activity_providers.dart';
import 'package:tally/features/obligations/presentation/due_providers.dart';
import 'package:tally/features/payments/domain/payment_commands.dart';
import 'package:tally/features/payments/domain/payment_entry.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/presentation/financial_actions.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import '../../support/upcoming_fixtures.dart';
import 'installment_models_test.dart' show installmentDraft;

Map<String, Object?> createResult() => {
  'obligationId': 'loan-1',
  'obligationInstanceIds': ['first', 'second', 'third'],
  'obligationRevision': 1,
  'instanceRevisions': [
    for (final id in ['first', 'second', 'third'])
      {'instanceId': id, 'instanceRevision': 1},
  ],
};
InstallmentPaymentDraft paymentDraft() => InstallmentPaymentDraft(
  obligationId: ObligationId('loan-1'),
  terms: PaymentTerms(
    amount: Money.fromMinorUnits(5000, CurrencyCode.php),
    date: LocalDate.parse('2026-10-04'),
    sourceId: null,
    method: PaymentMethod.cash,
  ),
);

void main() {
  test('canonical dashboard activity due and currency providers stay inside the current UID scope', () async {
    final root = ProviderContainer(
      overrides: [
        ownerDocumentsFactoryProvider.overrideWithValue(
          (uid) => UpcomingDocuments(uid)
            ..records['summaries/dashboard-PHP'] = RawRecord(
              RawDocument('dashboard-PHP', {
                ...summaryData(),
                'userId': uid.value,
              }),
              isFromCache: false,
            ),
        ),
        ownerCommandsFactoryProvider.overrideWithValue(UpcomingCommands.new),
      ],
    );
    addTearDown(root.dispose);
    final scopes = <ProviderContainer>[];
    for (final uid in ['alice', 'bob']) {
      final profile = UserProfile(
        uid: OwnerUid(uid),
        displayName: uid,
        photoUrl: null,
        defaultCurrency: uid == 'alice' ? CurrencyCode.php : CurrencyCode.usd,
        timezone: 'Asia/Manila',
        locale: 'en',
        theme: ProfileTheme.system,
        onboardingComplete: true,
        revision: 1,
      );
      final scope = ProviderContainer(
        parent: root,
        overrides: [
          ownerUidProvider.overrideWithValue(profile.uid),
          userProfileProvider.overrideWithValue(profile),
        ],
      );
      scopes.add(scope);
      addTearDown(scope.dispose);
      expect(
        scope.read(projectedDashboardRepositoryProvider).owner,
        profile.uid,
      );
      expect(scope.read(activityRepositoryProvider).owner, profile.uid);
      expect(scope.read(dueRepositoryProvider).owner, profile.uid);
      expect(scope.read(privateCurrencyProvider), profile.defaultCurrency);
      final subscription = scope.listen(
        projectedDashboardProvider(CurrencyCode.php),
        (_, _) {},
      );
      addTearDown(subscription.close);
      final summary = await scope.read(
        projectedDashboardProvider(CurrencyCode.php).future,
      );
      expect(summary.value!.metadata.owner, profile.uid);
    }
    scopes[0].read(privateCurrencyProvider.notifier).select(CurrencyCode.eur);
    expect(scopes[1].read(privateCurrencyProvider), CurrencyCode.usd);
    expect(
      () => root.read(projectedDashboardRepositoryProvider),
      throwsA(anything),
    );
  });
  test('installment creation retries keep identity and discard completion from a disposed owner', () async {
    final owner = OwnerUid('alice');
    final commands = UpcomingCommands(owner)
      ..response = createResult()
      ..failNext = true;
    final container = ProviderContainer(
      overrides: [
        ownerUidProvider.overrideWithValue(owner),
        ownerDocumentsFactoryProvider.overrideWithValue(UpcomingDocuments.new),
        ownerCommandsFactoryProvider.overrideWithValue((_) => commands),
      ],
    );
    final listen = container.listen(financialActionsProvider, (_, _) {});
    final actions = container.read(financialActionsProvider.notifier);
    expect(await actions.createInstallment(installmentDraft()), isNull);
    expect(await actions.createInstallment(installmentDraft()), isNotNull);
    expect(commands.calls[0].id, commands.calls[1].id);
    commands.pending = Completer<Map<String, Object?>>();
    final outstanding = actions.createInstallment(installmentDraft());
    expect(await actions.createInstallment(installmentDraft()), isNull);
    listen.close();
    container.dispose();
    commands.pending!.complete(createResult());
    expect(await outstanding, isNull);
  });
  test('a multi-period payment retry keeps its identity after the payment form closes', () async {
    final owner = OwnerUid('alice');
    final commands = UpcomingCommands(owner)
      ..failNext = true
      ..response = {
        'paymentId': 'pay-1',
        'obligationId': 'loan-1',
        'obligationInstanceId': null,
        'obligationRevision': 2,
        'instanceRevision': null,
        'allocationRevisions': [
          {'instanceId': 'first', 'instanceRevision': 2},
          {'instanceId': 'second', 'instanceRevision': 2},
        ],
      };
    final container = ProviderContainer(
      overrides: [
        ownerUidProvider.overrideWithValue(owner),
        ownerDocumentsFactoryProvider.overrideWithValue(UpcomingDocuments.new),
        ownerCommandsFactoryProvider.overrideWithValue((_) => commands),
      ],
    );
    addTearDown(container.dispose);
    final listen = container.listen(financialActionsProvider, (_, _) {});
    expect(
      await container
          .read(financialActionsProvider.notifier)
          .recordInstallmentPayment(paymentDraft()),
      isNull,
    );
    listen.close();
    await container.pump();
    await container.pump();
    expect(
      await container
          .read(financialActionsProvider.notifier)
          .recordInstallmentPayment(paymentDraft()),
      isNotNull,
    );
    expect(commands.calls[0].id, commands.calls[1].id);
  });
}
