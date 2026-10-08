import '../../sync/presentation/submission_feedback.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../attachments/domain/attachment.dart';
import '../../attachments/presentation/attachment_panel.dart';

import '../../../core/dates/financial_clock.dart';
import '../domain/visible_financial_status.dart';

import 'package:go_router/go_router.dart';

import '../../notifications/presentation/finite_reminder_dialog.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/presentation/financial_actions.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/financial_labels.dart';
import '../../../shared/widgets/money_text.dart';
import '../../../shared/widgets/page_body.dart';
import '../../../shared/widgets/paged_records.dart';
import '../../payments/domain/payment_entry.dart';
import '../../payments/presentation/payment_editor.dart';
import '../../payments/presentation/payment_correction_editor.dart';
import '../../payments/presentation/payment_allocations.dart';
import '../domain/obligation.dart';
import 'obligation_editor.dart';
import '../../sync/presentation/pending_payment_rows.dart';
import 'installment_periods_panel.dart';
import '../../recurring/presentation/recurring_detail.dart';
import '../../recurring/presentation/recurring_editor.dart';

class ObligationDetailScreen extends ConsumerWidget {
  const ObligationDetailScreen({
    super.key,
    required this.id,
    this.editing = false,
    this.initialPeriod,
    this.waitingForRecord = false,
  });
  final ObligationId id;
  final bool editing;
  final InstanceId? initialPeriod;
  final bool waitingForRecord;
  @override
  Widget build(BuildContext context, WidgetRef ref) => ref
      .watch(obligationProvider(id))
      .when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              FinancialActionError(error: error),
              TextButton(
                onPressed: () => ref.invalidate(obligationProvider(id)),
                child: const Text('Try again'),
              ),
            ],
          ),
        ),
        data: (record) {
          final parent = record.value;
          if (parent == null) {
            if (waitingForRecord) {
              return const EmptyState(
                icon: Icons.cloud_done_outlined,
                title: 'Saved · updating records',
                description: 'The server confirmed your save. Your obligation will appear when its records refresh.',
              );
            }
            return const EmptyState(
              icon: Icons.search_off,
              title: 'Obligation unavailable',
              description: 'This record may have been removed or belong to another account.',
            );
          }
          if (editing) {
            if (parent.isRecurring) {
              return RecurringEditor(key: ValueKey(id), initial: parent);
            }
            return Column(
              children: [
                if (record.isFromCache)
                  const Padding(
                    padding: EdgeInsets.all(12),
                    child: Text(
                      'Cached balances · reconnect to confirm current records.',
                    ),
                  ),
                Expanded(
                  child: parent.type == ObligationType.installment
                      ? InstallmentPeriodsPanel(parent: parent, editing: true)
                      : ObligationEditor(key: ValueKey(id), initial: parent),
                ),
              ],
            );
          }
          if (parent.isRecurring) {
            return RecurringDetail(
              parent: parent,
              isFromCache: record.isFromCache,
              initialPeriod: initialPeriod,
            );
          }
          final active = parent.lifecycle == ObligationLifecycle.active;
          final received = parent.direction == ObligationDirection.owedToMe;
          return PageBody(
            title: parent.title,
            subtitle: received ? 'Owed to you' : 'You owe',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (record.isFromCache)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 16),
                    child: Text(
                      'Cached balances · reconnect to confirm current records.',
                    ),
                  ),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    FinancialStatusChip(
                      visibleFinancialStatus(
                        parent,
                        ref.watch(financialClockProvider),
                      ),
                    ),
                    if (active &&
                        parent.remainingAmount != null &&
                        parent.remainingAmount!.minorUnits > 0)
                      FilledButton.icon(
                        key: const Key('record-payment'),
                        onPressed: () => showFinancialDialog<Object?>(
                          context,
                          PaymentEditor(obligation: parent),
                        ),
                        icon: const Icon(Icons.check),
                        label: Text(
                          received ? 'Record repayment' : 'Record payment',
                        ),
                      ),
                    if (active)
                      OutlinedButton.icon(
                        onPressed: () =>
                            context.go('/obligations/${id.value}/edit'),
                        icon: const Icon(Icons.edit_outlined),
                        label: const Text('Edit'),
                      ),
                    if (active)
                      TextButton(
                        onPressed: () => showFinancialDialog<Object?>(
                          context,
                          _CancelDialog(parent),
                        ),
                        child: const Text('Cancel obligation'),
                      ),
                    OutlinedButton.icon(
                      onPressed: () => showDialog<void>(
                        context: context,
                        useRootNavigator: false,
                        builder: (_) =>
                            FiniteReminderDialog(obligation: parent),
                      ),
                      icon: const Icon(Icons.notifications_none),
                      label: const Text('Reminder settings'),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Wrap(
                          spacing: 40,
                          runSpacing: 20,
                          children: [
                            for (final value in [
                              ('Original', parent.originalAmount),
                              (received ? 'Repaid' : 'Paid', parent.paidAmount),
                              ('Remaining', parent.remainingAmount),
                            ])
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(value.$1),
                                  const SizedBox(height: 7),
                                  if (value.$2 != null)
                                    MoneyText(
                                      money: value.$2!,
                                      includeCode: true,
                                      style: Theme.of(context)
                                          .textTheme
                                          .headlineSmall,
                                    )
                                  else
                                    const Text('Varies by period'),
                                ],
                              ),
                          ],
                        ),
                        const SizedBox(height: 24),
                        Text(
                          '${received ? 'Lent' : 'Borrowed'} ${parent.originationDate} · ${parent.dueDate == null ? 'No due date set' : 'Due ${parent.dueDate}'}',
                        ),
                        if (parent.contact != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 12),
                            child: Text(parent.contact!.name),
                          ),
                        Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text('Category: ${parent.categoryName}'),
                        ),
                        if (parent.source != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 12),
                            child: Text(
                              'Default source: ${parent.source!.name}',
                            ),
                          ),
                        if (parent.description.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 16),
                            child: Text(parent.description),
                          ),
                        if (parent.notes.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 16),
                            child: Text(parent.notes),
                          ),
                        if (parent.interestInfo != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 16),
                            child: Text(
                              'Interest information: ${parent.interestInfo!.rateBasisPoints} basis points · ${parent.interestInfo!.basis}\nFor reference; included balance follows the original amount and payments.',
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                if (parent.type == ObligationType.installment) ...[
                  InstallmentPeriodsPanel(parent: parent),
                  const SizedBox(height: 24),
                ],
                AttachmentPanel(
                  target: AttachmentTarget.forObligation(parent.id),
                ),
                const SizedBox(height: 24),
                Text(
                  'Payment history',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                PendingPaymentRows(resourceKey: 'obligation:${id.value}'),
                const SizedBox(height: 8),
                const Text(
                  'Payments remain traceable. Corrections add a reversal and optional replacement.',
                ),
                const SizedBox(height: 14),
                Card(
                  child: PagedRecords<PaymentEntry>(
                    first: ref.watch(paymentsPageProvider(id)),
                    loadMore: (cursor) => ref
                        .read(paymentsRepositoryProvider)
                        .getPayments(id, after: cursor),
                    identity: (value) => value.id.value,
                    onRetry: () => ref.invalidate(paymentsPageProvider(id)),
                    empty: const EmptyState(
                      icon: Icons.receipt_long_outlined,
                      title: 'No payments recorded yet',
                      description:
                          'Record a payment or repayment to see it here.',
                    ),
                    builder: (context, entries, complete) {
                      final reversed = entries
                          .where(
                            (entry) => entry.type == PaymentEntryType.reversal,
                          )
                          .map((entry) => entry.reversesPaymentId)
                          .toSet();
                      return Column(
                        children: [
                          for (final entry in entries)
                            Padding(
                              padding: const EdgeInsets.all(18),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Wrap(
                                    spacing: 12,
                                    runSpacing: 8,
                                    crossAxisAlignment:
                                        WrapCrossAlignment.center,
                                    children: [
                                      Icon(
                                        entry.type == PaymentEntryType.reversal
                                            ? Icons.undo
                                            : Icons.check_circle_outline,
                                        size: 20,
                                      ),
                                      Text(
                                        entry.type == PaymentEntryType.reversal
                                            ? 'Reversal'
                                            : reversed.contains(entry.id)
                                            ? 'Payment · reversed'
                                            : 'Payment',
                                      ),
                                      MoneyText(
                                        money: entry.amount,
                                        includeCode: true,
                                        style: Theme.of(context)
                                            .textTheme
                                            .titleMedium,
                                      ),
                                      if (active &&
                                          entry.type ==
                                              PaymentEntryType.payment &&
                                          !reversed.contains(entry.id))
                                        TextButton(
                                          key: Key('correct-${entry.id.value}'),
                                          onPressed: () =>
                                              showFinancialDialog<Object?>(
                                                context,
                                                PaymentCorrectionEditor(
                                                  obligation: parent,
                                                  original: entry,
                                                ),
                                              ),
                                          child: const Text('Correct'),
                                        ),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    '${entry.date} · ${methodLabel(entry.method)}${entry.source == null ? '' : ' · ${entry.source!.name}'}',
                                  ),
                                  if (entry.notes.isNotEmpty) Text(entry.notes),
                                  if (parent.type == ObligationType.installment)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 12),
                                      child: PaymentAllocations(
                                        parent: parent,
                                        allocations: entry.allocations,
                                      ),
                                    ),
                                  if (entry.correctionReason != null)
                                    Text(
                                      'Correction reason: ${entry.correctionReason}',
                                    ),
                                  const SizedBox(height: 12),
                                  AttachmentPanel(
                                    target: AttachmentTarget.forPayment(
                                      entry.id,
                                    ),
                                    title: 'Receipts',
                                  ),
                                ],
                              ),
                            ),
                        ],
                      );
                    },
                  ),
                ),
              ],
            ),
          );
        },
      );
}

class _CancelDialog extends ConsumerStatefulWidget {
  const _CancelDialog(this.parent);
  final Obligation parent;
  @override
  ConsumerState<_CancelDialog> createState() => _CancelDialogState();
}

class _CancelDialogState extends ConsumerState<_CancelDialog> {
  final _form = GlobalKey<FormState>();
  final _reason = TextEditingController();
  bool _submitted = false;
  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _submitted = true);
    final actions = ref.read(financialActionsProvider.notifier);
    final result = widget.parent.type == ObligationType.installment
        ? await actions.cancelInstallment(
            widget.parent.id,
            widget.parent.revision,
            _reason.text.trim(),
          )
        : await actions.cancelObligation(
            widget.parent.id,
            widget.parent.revision,
            _reason.text.trim(),
          );
    if (mounted && result != null) {
      if (handleQueuedSubmission(context, result, closeDialog: true)) return;
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final action = ref.watch(financialActionsProvider);
    return Form(
      key: _form,
      child: FinancialDialogBody(
        title: 'Cancel obligation',
        children: [
          const Text(
            'This stops the outstanding obligation. Its original amount and payment history remain available.',
          ),
          const SizedBox(height: 18),
          TextFormField(
            controller: _reason,
            maxLength: 1000,
            decoration: const InputDecoration(
              labelText: 'Reason',
              counterText: '',
            ),
            validator: requiredText,
          ),
          FinancialActionError(error: _submitted ? action.error : null),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: action.isLoading ? null : _save,
            child: const Text('Cancel obligation'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Keep obligation'),
          ),
        ],
      ),
    );
  }
}
