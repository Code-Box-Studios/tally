import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';
import '../../../shared/domain/financial_failure.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/widgets/money_text.dart';
import '../domain/command_name.dart';
import '../domain/outbox_entry.dart';
import 'sync_providers.dart';

String pendingActionLabel(OutboxEntry entry) => switch (entry.command.name) {
  CommandName.createObligation =>
    entry.command.payload['direction'] == 'owedToMe'
        ? 'Money lent'
        : 'Money borrowed',
  CommandName.editObligation => 'Obligation changed',
  CommandName.cancelObligation ||
  CommandName.cancelInstallment => 'Obligation cancellation',
  CommandName.createInstallment => 'New installments',
  CommandName.editInstallment => 'Installments changed',
  CommandName.recordPayment ||
  CommandName.recordInstallmentPayment => 'Payment',
  CommandName.correctPayment => 'Payment correction',
  CommandName.createRecurring => 'New recurring bill',
  CommandName.editRecurring => 'Recurring bill changed',
  CommandName.changeRecurringLifecycle => 'Recurring schedule changed',
  CommandName.setRecurringAmount => 'Bill amount changed',
  CommandName.editRecurringInstance => 'Billing period changed',
  CommandName.skipRecurringInstance => 'Billing period skipped',
  CommandName.confirmDeduction => 'Deduction confirmation',
  CommandName.reportDeductionFailure => 'Deduction failed',
  CommandName.saveCatalog =>
    '${switch (entry.command.payload['kind']) {
      'contact' => 'Contact',
      'source' => 'Payment source',
      _ => 'Category',
    }} saved',
  CommandName.setObligationReminder ||
  CommandName.updateNotificationPreferences => 'Reminders changed',
};
String pendingStateLabel(OutboxEntry entry) => switch (entry.state) {
  OutboxState.queued =>
    entry.failure?.code == FinancialFailureCode.recovery
        ? 'Needs verification'
        : 'Waiting to sync',
  OutboxState.sending => 'Syncing',
  OutboxState.accepted => 'Confirmed',
  OutboxState.rejected => 'Needs review',
  OutboxState.blocked => 'Waiting for an earlier change',
  OutboxState.cancelled => 'Cancelled on this device',
};
Money? pendingMoney(OutboxEntry entry) {
  final payload = entry.command.payload;
  final currency = payload['currency'];
  final amount =
      payload['amountMinor'] ??
      (payload['amountKind'] == 'fixed' ? payload['defaultAmountMinor'] : null);
  if (currency is! String || amount is! int) return null;
  try {
    return Money.fromMinorUnits(amount, CurrencyCode.parse(currency));
  } catch (_) {
    return null;
  }
}

String pendingTitle(OutboxEntry entry) {
  final payload = entry.command.payload;
  if (payload['title'] case final String title) return title;
  if (payload['values'] case final Map<String, Object?> values) {
    final name = values['displayName'] ?? values['name'];
    if (name is String) return name;
  }
  return pendingActionLabel(entry);
}

class PendingActionCard extends StatelessWidget {
  const PendingActionCard({super.key, required this.entry, this.onTap});
  final OutboxEntry entry;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final amount = pendingMoney(entry);
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                pendingTitle(entry),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 16,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  if (amount != null)
                    MoneyText(money: amount, includeCode: true),
                  Text(pendingStateLabel(entry)),
                ],
              ),
              if (entry.failure != null && entry.state != OutboxState.queued)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(entry.failure!.message),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class PendingActions extends ConsumerWidget {
  const PendingActions({
    super.key,
    this.resourceKey,
    this.maxItems = 8,
    this.paymentsOnly = false,
  });
  final String? resourceKey;
  final int maxItems;
  final bool paymentsOnly;
  @override
  Widget build(BuildContext context, WidgetRef ref) => ref
      .watch(pendingActionsProvider)
      .when(
        loading: () => const SizedBox.shrink(),
        error: (error, _) => Text(financialMessage(error)),
        data: (page) {
          final rows = page.items
              .where(
                (entry) =>
                    (resourceKey == null ||
                        entry.command.resourceKey == resourceKey) &&
                    (!paymentsOnly ||
                        const {
                          CommandName.recordPayment,
                          CommandName.recordInstallmentPayment,
                          CommandName.correctPayment,
                          CommandName.confirmDeduction,
                          CommandName.reportDeductionFailure,
                        }.contains(entry.command.name)),
              )
              .toList();
          if (rows.isEmpty) return const SizedBox.shrink();
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Waiting to sync',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              const Text(
                'Saved on this device. These changes are separate from your confirmed balances.',
              ),
              const SizedBox(height: 12),
              for (final row in rows.take(maxItems))
                PendingActionCard(
                  entry: row,
                  onTap: () =>
                      context.go('/settings/sync/${row.command.id.value}'),
                ),
              TextButton(
                onPressed: () => context.go('/settings/sync'),
                child: const Text('View saved actions'),
              ),
            ],
          );
        },
      );
}
