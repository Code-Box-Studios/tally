import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/dates/local_date.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';
import '../../../shared/domain/financial_failure.dart';
import '../../../shared/presentation/financial_actions.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/error_panel.dart';
import '../../../shared/widgets/page_body.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../payments/domain/payment_commands.dart';
import '../../payments/domain/payment_entry.dart';
import '../domain/command_identity.dart';
import '../domain/command_name.dart';
import '../domain/frozen_command.dart';
import '../domain/outbox_entry.dart';
import 'pending_actions.dart';
import 'pending_actions_controller.dart';
import 'pending_payment_rows.dart';
import 'submission_feedback.dart';
import 'sync_providers.dart';

class PendingObligationDetail extends ConsumerWidget {
  const PendingObligationDetail({super.key, required this.commandId});
  final CommandId commandId;
  @override
  Widget build(BuildContext context, WidgetRef ref) => PageBody(
    title: 'Saved action',
    subtitle: 'Your original details and sync history stay together.',
    child: ref
        .watch(outboxCommandProvider(commandId))
        .when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => ErrorPanel(
            title: 'Couldn’t open this saved action',
            onRetry: () => ref.invalidate(outboxCommandProvider(commandId)),
          ),
          data: (entry) {
            if (entry == null) {
              return const EmptyState(
                icon: Icons.sync_outlined,
                title: 'This saved action isn’t on this device',
                description: 'Open Sync to see changes saved for this account.',
              );
            }
            final action = ref.watch(pendingActionsControllerProvider),
                controller = ref.read(
                  pendingActionsControllerProvider.notifier,
                );
            final finite = entry.command.name == CommandName.createObligation;
            final canonical = entry.result?['obligationId'];
            final originalObligation = entry.command.payload['obligationId'];
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                PendingActionCard(entry: entry),
                const SizedBox(height: 16),
                Text(switch (entry.state) {
                  OutboxState.accepted => 'Confirmed on the server. Your balance may take a moment to refresh.',
                  OutboxState.rejected => 'The server rejected this action. Review its details before creating a new save. This original stays in your history.',
                  OutboxState.cancelled => 'Cancelled before any server attempt. Your confirmed financial records were not changed.',
                  _ => 'These details are saved on this device. Confirmed balances do not include this action.',
                }),
                if (entry.command.payload['dueDate'] case final String due)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text('Due $due'),
                  ),
                for (final field in const {
                  'description': 'Description',
                  'notes': 'Notes',
                  'originationDate': 'Borrowed or lent',
                  'paymentDate': 'Payment date',
                  'startDate': 'Starts',
                  'endDate': 'Ends',
                }.entries)
                  if (entry.command.payload[field.key] case final String value)
                    if (value.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text('${field.value}: $value'),
                      ),
                const SizedBox(height: 20),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    if (entry.state == OutboxState.queued)
                      FilledButton.icon(
                        onPressed: action.isLoading
                            ? null
                            : () => controller.retry(commandId),
                        icon: const Icon(Icons.sync),
                        label: const Text('Retry original action'),
                      ),
                    if (entry.attempts == 0 &&
                        {
                          OutboxState.queued,
                          OutboxState.blocked,
                        }.contains(entry.state))
                      OutlinedButton(
                        onPressed: action.isLoading
                            ? null
                            : () => controller.cancel(commandId),
                        child: const Text('Cancel on this device'),
                      ),
                    if (finite &&
                        {
                          OutboxState.queued,
                          OutboxState.sending,
                        }.contains(entry.state))
                      OutlinedButton.icon(
                        key: const Key('pending-add-payment'),
                        onPressed: action.isLoading
                            ? null
                            : () => showFinancialDialog<Object?>(
                                context,
                                _PendingFinitePayment(parent: entry.command),
                              ),
                        icon: const Icon(Icons.add),
                        label: const Text('Record payment'),
                      ),
                    if (entry.state == OutboxState.accepted &&
                        canonical is String)
                      FilledButton(
                        onPressed: () => context.go('/obligations/$canonical'),
                        child: const Text('View obligation'),
                      ),
                    if (entry.state == OutboxState.rejected &&
                        {
                          CommandName.createObligation,
                          CommandName.recordPayment,
                        }.contains(entry.command.name))
                      OutlinedButton(
                        onPressed: action.isLoading
                            ? null
                            : () => showFinancialDialog<Object?>(
                                context,
                                _ReviewSavedAmount(entry: entry),
                              ),
                        child: const Text('Review details'),
                      ),
                    TextButton(
                      onPressed: () => context.go('/settings/sync'),
                      child: const Text('All saved actions'),
                    ),
                    if (entry.state == OutboxState.rejected &&
                        originalObligation is String)
                      TextButton(
                        onPressed: () =>
                            context.go('/obligations/$originalObligation/edit'),
                        child: const Text('Review current obligation'),
                      ),
                    if (entry.state == OutboxState.rejected &&
                        entry.command.name ==
                            CommandName.updateNotificationPreferences)
                      TextButton(
                        onPressed: () => context.go('/settings/reminders'),
                        child: const Text('Review current reminders'),
                      ),
                  ],
                ),
                FinancialActionError(error: action.error),
                const SizedBox(height: 24),
                PendingPaymentRows(resourceKey: entry.command.resourceKey),
              ],
            );
          },
        ),
  );
}

class _PendingFinitePayment extends ConsumerStatefulWidget {
  const _PendingFinitePayment({required this.parent});
  final FrozenCommand parent;
  @override
  ConsumerState<_PendingFinitePayment> createState() =>
      _PendingFinitePaymentState();
}

class _PendingFinitePaymentState extends ConsumerState<_PendingFinitePayment> {
  final _form = GlobalKey<FormState>();
  final _amount = TextEditingController(), _notes = TextEditingController();
  late final TextEditingController _date;
  PaymentDraft? _pending;
  Object? _validation;
  CurrencyCode get currency =>
      CurrencyCode.parse(widget.parent.payload['currency'] as String);
  @override
  void initState() {
    super.initState();
    _date = TextEditingController(
      text: todayIn(ref.read(userProfileProvider).timezone).toString(),
    );
  }

  @override
  void dispose() {
    _amount.dispose();
    _notes.dispose();
    _date.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (ref.read(ownerUidProvider) != widget.parent.owner) return;
    if (_pending == null) {
      if (!_form.currentState!.validate()) return;
      try {
        _pending = PaymentDraft(
          obligationId: ObligationId(
            predictedCommandId(
              widget.parent.owner,
              widget.parent.id,
              'obligation',
            ),
          ),
          instanceId: InstanceId(
            predictedCommandId(
              widget.parent.owner,
              widget.parent.id,
              'instance',
            ),
          ),
          terms: PaymentTerms(
            amount: Money.parse(_amount.text, currency),
            date: LocalDate.parse(_date.text),
            sourceId: null,
            method: PaymentMethod.cash,
            notes: _notes.text.trim(),
          ),
        );
      } catch (error) {
        setState(() => _validation = error);
        return;
      }
    }
    final result = await ref
        .read(financialActionsProvider.notifier)
        .recordPayment(_pending!);
    if (!mounted) return;
    if (result != null) {
      if (handleQueuedSubmission(context, result, closeDialog: true)) return;
      Navigator.pop(context, result.acceptedValue);
      return;
    }
    final error = ref.read(financialActionsProvider).error;
    if (error is! FinancialFailure ||
        !{
          FinancialFailureCode.offline,
          FinancialFailureCode.unavailable,
        }.contains(error.code)) {
      setState(() => _pending = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final action = ref.watch(financialActionsProvider);
    return Form(
      key: _form,
      child: FinancialDialogBody(
        title: 'Record payment',
        children: [
          Text(
            'This payment uses ${currency.code}. Tally confirms the payment and remaining balance when it syncs.',
          ),
          const SizedBox(height: 16),
          TextFormField(
            key: const Key('pending-payment-amount'),
            controller: _amount,
            readOnly: _pending != null,
            decoration: InputDecoration(labelText: 'Amount (${currency.code})'),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            validator: (value) {
              final error = amountValidation(value, currency);
              if (error != null) return error;
              final amount = Money.parse(value!, currency);
              if (amount.minorUnits < 1) {
                return 'Enter an amount greater than zero.';
              }
              if (amount.minorUnits >
                  (widget.parent.payload['amountMinor'] as int)) {
                return 'This exceeds the original amount. Review the payment.';
              }
              return null;
            },
          ),
          const SizedBox(height: 16),
          TextFormField(
            key: const Key('pending-payment-date'),
            controller: _date,
            readOnly: _pending != null,
            decoration: const InputDecoration(
              labelText: 'Payment date (YYYY-MM-DD)',
            ),
            validator: (value) => dateValidation(value),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _notes,
            readOnly: _pending != null,
            maxLength: 4000,
            decoration: const InputDecoration(labelText: 'Notes'),
          ),
          FinancialActionError(error: _validation ?? action.error),
          FilledButton(
            key: const Key('pending-payment-save'),
            onPressed: action.isLoading ? null : _save,
            child: Text(
              action.isLoading
                  ? 'Saving…'
                  : _pending != null
                  ? 'Retry original payment'
                  : 'Save payment',
            ),
          ),
          TextButton(
            onPressed: action.isLoading ? null : () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }
}

class _ReviewSavedAmount extends ConsumerStatefulWidget {
  const _ReviewSavedAmount({required this.entry});
  final OutboxEntry entry;
  @override
  ConsumerState<_ReviewSavedAmount> createState() => _ReviewSavedAmountState();
}

class _ReviewSavedAmountState extends ConsumerState<_ReviewSavedAmount> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _amount, _notes;
  late final CurrencyCode _currency;
  @override
  void initState() {
    super.initState();
    final payload = widget.entry.command.payload;
    _currency = CurrencyCode.parse(payload['currency'] as String);
    _amount = TextEditingController(
      text: moneyEntry(
        Money.fromMinorUnits(payload['amountMinor'] as int, _currency),
      ),
    );
    _notes = TextEditingController(text: payload['notes'] as String? ?? '');
  }

  @override
  void dispose() {
    _amount.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final result = await ref
        .read(pendingActionsControllerProvider.notifier)
        .review(widget.entry.command.id, {
          ...widget.entry.command.payload,
          'amountMinor': Money.parse(_amount.text, _currency).minorUnits,
          'notes': _notes.text.trim(),
        });
    if (!mounted || result == null) return;
    if (handleQueuedSubmission(context, result, closeDialog: true)) return;
    Navigator.pop(context, result.acceptedValue);
  }

  @override
  Widget build(BuildContext context) {
    final action = ref.watch(pendingActionsControllerProvider);
    return Form(
      key: _form,
      child: FinancialDialogBody(
        title: 'Review saved details',
        children: [
          const Text(
            'Saving creates a new action. The rejected original and its history stay unchanged.',
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _amount,
            decoration: InputDecoration(
              labelText: 'Amount (${_currency.code})',
            ),
            validator: (value) => amountValidation(value, _currency),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _notes,
            maxLength: 4000,
            decoration: const InputDecoration(labelText: 'Notes'),
          ),
          FinancialActionError(error: action.error),
          FilledButton(
            onPressed: action.isLoading ? null : _save,
            child: const Text('Save reviewed action'),
          ),
          TextButton(
            onPressed: action.isLoading ? null : () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }
}
