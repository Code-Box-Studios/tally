import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../../../shared/widgets/financial_labels.dart';
import '../../../shared/widgets/money_text.dart';
import '../../../shared/widgets/paged_records.dart';
import '../../obligations/domain/obligation.dart';
import '../../obligations/domain/obligation_instance.dart';
import '../../payments/domain/payment_entry.dart';
import '../../payments/presentation/payment_correction_editor.dart';
import '../domain/deduction_attempt.dart';
import 'deduction_dialogs.dart';
import 'recurring_providers.dart';

String deductionAttemptLabel(DeductionAttemptType type) => switch (type) {
  DeductionAttemptType.assumed => 'Assumed deducted',
  DeductionAttemptType.expected => 'Confirmation requested',
  DeductionAttemptType.suppressed => 'Scheduled deduction not recorded',
  DeductionAttemptType.confirmed => 'Deduction confirmed',
  DeductionAttemptType.failed => 'Deduction failed',
  DeductionAttemptType.manualResolved => 'Paid manually',
  DeductionAttemptType.corrected => 'Automatic payment corrected',
};

class RecurringPeriodHistory extends ConsumerWidget {
  const RecurringPeriodHistory({
    super.key,
    required this.parent,
    required this.instance,
  });
  final Obligation parent;
  final ObligationInstance instance;
  @override
  Widget build(BuildContext context, WidgetRef ref) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text('Deduction history', style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: 8),
      PagedRecords<DeductionAttempt>(
        first: ref.watch(deductionAttemptsProvider(instance.id)),
        loadMore: (cursor) => ref
            .read(recurringRepositoryProvider)
            .getAttempts(instance.id, after: cursor),
        identity: (value) => value.id.value,
        onRetry: () => ref.invalidate(deductionAttemptsProvider(instance.id)),
        empty: const Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Text('No deduction events recorded for this period.'),
        ),
        builder: (context, events, complete) {
          final assumptions = events.where(
            (event) => event.type == DeductionAttemptType.assumed,
          );
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (instance.deductionStatus == DeductionStatus.deducted &&
                  assumptions.isNotEmpty)
                Align(
                  alignment: Alignment.centerLeft,
                  child: OutlinedButton(
                    onPressed: () => showFinancialDialog<Object?>(
                      context,
                      DeductionConfirmationDialog(
                        instance: instance,
                        assumedAttempt: assumptions.first,
                      ),
                    ),
                    child: const Text('Confirm deduction'),
                  ),
                ),
              for (final event in events)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Wrap(
                        spacing: 10,
                        runSpacing: 6,
                        children: [
                          const Icon(Icons.history, size: 18),
                          Text(deductionAttemptLabel(event.type)),
                          if (event.amount != null)
                            MoneyText(money: event.amount!, includeCode: true),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(
                        '${event.actor == DeductionActor.user ? 'Recorded by you' : 'Recorded by Tally'} · ${event.processedAt.toIso8601String()}',
                      ),
                      if (event.scheduledDate != null)
                        Text(
                          'Scheduled ${event.scheduledDate} · ${event.timezone}',
                        ),
                      if (event.source != null)
                        Text('Source: ${event.source!.name}'),
                      if (event.reason != null) Text(event.reason!),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
      const SizedBox(height: 20),
      Text(
        'Confirmation evidence',
        style: Theme.of(context).textTheme.titleMedium,
      ),
      PagedRecords<PaymentEvidence>(
        first: ref.watch(paymentEvidenceProvider(instance.id)),
        loadMore: (cursor) => ref
            .read(recurringRepositoryProvider)
            .getEvidence(instance.id, after: cursor),
        identity: (value) => value.id.value,
        onRetry: () => ref.invalidate(paymentEvidenceProvider(instance.id)),
        empty: const Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Text('No confirmation evidence added yet.'),
        ),
        builder: (context, evidence, complete) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final item in evidence)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Confirmed by you · ${item.recordedAt.toIso8601String()}',
                    ),
                    if (item.notes.isNotEmpty) Text(item.notes),
                    const Text(
                      'The original assumed payment remains unchanged.',
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
      const SizedBox(height: 20),
      Text('Payment history', style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: 8),
      const Text(
        'Corrections add a reversal and optional replacement in this same period.',
      ),
      PagedRecords<PaymentEntry>(
        first: ref.watch(
          periodPaymentsPageProvider((parent: parent.id, period: instance.id)),
        ),
        loadMore: (cursor) => ref
            .read(paymentsRepositoryProvider)
            .getPeriodPayments(parent.id, instance.id, after: cursor),
        identity: (value) => value.id.value,
        onRetry: () => ref.invalidate(
          periodPaymentsPageProvider((parent: parent.id, period: instance.id)),
        ),
        empty: const Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Text('No payments recorded for this period yet.'),
        ),
        builder: (context, entries, complete) {
          final selected = entries
              .where((entry) => entry.instanceId == instance.id)
              .toList();
          final reversed = entries
              .where((entry) => entry.type == PaymentEntryType.reversal)
              .map((entry) => entry.reversesPaymentId)
              .toSet();
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (!complete)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 10),
                  child: Text(
                    'Showing loaded history for this period. Load more payments to check earlier records.',
                  ),
                ),
              if (selected.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(
                    complete
                        ? 'No payments for this period.'
                        : 'No payments for this period in the loaded history.',
                  ),
                ),
              for (final entry in selected)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Wrap(
                        spacing: 12,
                        runSpacing: 8,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Icon(
                            entry.type == PaymentEntryType.reversal
                                ? Icons.undo
                                : Icons.check_circle_outline,
                            size: 18,
                          ),
                          Text(
                            entry.type == PaymentEntryType.reversal
                                ? 'Reversal'
                                : reversed.contains(entry.id)
                                ? 'Payment · reversed'
                                : 'Payment',
                          ),
                          MoneyText(money: entry.amount, includeCode: true),
                          if (entry.type == PaymentEntryType.payment &&
                              !reversed.contains(entry.id))
                            TextButton(
                              onPressed: () => showFinancialDialog<Object?>(
                                context,
                                PaymentCorrectionEditor(
                                  obligation: parent,
                                  original: entry,
                                  selectedInstance: instance,
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
                      Text(switch (entry.provenance) {
                        PaymentProvenance.manual => 'Recorded manually',
                        PaymentProvenance.assumedAutomatic =>
                          'Assumed automatic payment',
                        PaymentProvenance.confirmedAutomatic =>
                          'Confirmed automatic payment',
                      }),
                      if (entry.notes.isNotEmpty) Text(entry.notes),
                      if (entry.correctionReason != null)
                        Text('Correction reason: ${entry.correctionReason}'),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    ],
  );
}
