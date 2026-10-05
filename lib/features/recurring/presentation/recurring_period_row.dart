import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/dates/financial_clock.dart';
import '../../../core/dates/timezone_catalog.dart';
import '../../../core/dates/local_date.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/widgets/financial_labels.dart';
import '../../../shared/widgets/money_text.dart';
import '../../obligations/domain/obligation.dart';
import '../../obligations/domain/obligation_instance.dart';
import '../../payments/presentation/payment_editor.dart';
import '../domain/deduction_attempt.dart';
import 'deduction_dialogs.dart';
import 'recurring_period_editor.dart';
import 'recurring_history.dart';

class RecurringPeriodRow extends ConsumerStatefulWidget {
  const RecurringPeriodRow({
    super.key,
    required this.parent,
    required this.instance,
  });
  final Obligation parent;
  final ObligationInstance instance;
  @override
  ConsumerState<RecurringPeriodRow> createState() => _RecurringPeriodRowState();
}

class _RecurringPeriodRowState extends ConsumerState<RecurringPeriodRow> {
  bool _expanded = false;
  @override
  Widget build(BuildContext context) {
    final period = widget.instance;
    final scheme = Theme.of(context).colorScheme;
    final now = TimezoneCatalog.at(
      ref.watch(financialClockProvider),
      period.timezone,
    );
    final today = LocalDate.fromParts(now.year, now.month, now.day);
    final outstanding =
        !period.closed && (period.remainingAmount?.minorUnits ?? 0) > 0;
    final status =
        !period.closed &&
            (period.remainingAmount == null ||
                period.remainingAmount!.minorUnits > 0) &&
            period.dueDate != null &&
            period.dueDate!.compareTo(today) < 0
        ? FinancialStatus.overdue
        : period.status;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: 14,
              runSpacing: 10,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                const Icon(Icons.calendar_month_outlined, size: 20),
                Text(
                  period.periodLabel,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                FinancialStatusChip(status),
                if (period.paymentMode != PaymentMode.manual)
                  Chip(
                    avatar: Icon(
                      period.deductionStatus == DeductionStatus.failed
                          ? Icons.error_outline
                          : Icons.autorenew,
                      size: 16,
                    ),
                    label: Text(period.deductionStatus.label),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Due ${period.dueDate} · ${period.timezone}',
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
            if (period.deductionDate != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  'Deduction ${period.deductionDate} at ${period.localDeductionTime}',
                ),
              ),
            if (period.source != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('Source: ${period.source!.name}'),
              ),
            const SizedBox(height: 18),
            if (period.amount == null) ...[
              Text(
                'Amount needed',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (period.estimatedAmount != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      const Text('Estimate'),
                      MoneyText(
                        money: period.estimatedAmount!,
                        includeCode: true,
                      ),
                      const Text('· actual bill amount still needed'),
                    ],
                  ),
                ),
            ] else
              Wrap(
                spacing: 32,
                runSpacing: 14,
                children: [
                  for (final value in [
                    ('Bill amount', period.amount!),
                    ('Paid', period.paidAmount),
                    ('Remaining', period.remainingAmount!),
                  ])
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          value.$1,
                          style: TextStyle(color: scheme.onSurfaceVariant),
                        ),
                        const SizedBox(height: 5),
                        MoneyText(
                          money: value.$2,
                          includeCode: true,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ],
                    ),
                ],
              ),
            if (period.notes.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(period.notes),
              ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (!period.closed && period.amount == null)
                  FilledButton(
                    onPressed: () => showFinancialDialog<Object?>(
                      context,
                      PeriodAmountDialog(instance: period),
                    ),
                    child: const Text('Enter amount'),
                  ),
                if (outstanding)
                  FilledButton.icon(
                    onPressed: () => showFinancialDialog<Object?>(
                      context,
                      PaymentEditor(
                        obligation: widget.parent,
                        selectedInstance: period,
                      ),
                    ),
                    icon: const Icon(Icons.check, size: 18),
                    label: Text(
                      period.deductionStatus == DeductionStatus.failed
                          ? 'Retry manually'
                          : 'Mark as paid',
                    ),
                  ),
                if (period.amount != null &&
                    period.deductionStatus == DeductionStatus.expected)
                  OutlinedButton(
                    onPressed: () => showFinancialDialog<Object?>(
                      context,
                      DeductionConfirmationDialog(instance: period),
                    ),
                    child: const Text('Confirm deduction'),
                  ),
                if ([
                  DeductionStatus.expected,
                  DeductionStatus.deducted,
                  DeductionStatus.confirmed,
                ].contains(period.deductionStatus))
                  TextButton(
                    onPressed: () => showFinancialDialog<Object?>(
                      context,
                      DeductionFailureDialog(instance: period),
                    ),
                    child: const Text('Report failed'),
                  ),
                if (!period.closed) ...[
                  TextButton(
                    onPressed: () => showFinancialDialog<Object?>(
                      context,
                      PeriodAmountDialog(instance: period),
                    ),
                    child: const Text('Change amount'),
                  ),
                  TextButton(
                    onPressed: () => showFinancialDialog<Object?>(
                      context,
                      RecurringPeriodEditDialog(instance: period),
                    ),
                    child: const Text('Edit period'),
                  ),
                  if (period.paidAmount.minorUnits == 0)
                    TextButton(
                      onPressed: () => showFinancialDialog<Object?>(
                        context,
                        PeriodSkipDialog(instance: period),
                      ),
                      child: const Text('Skip period'),
                    ),
                ],
                TextButton.icon(
                  onPressed: () => setState(() => _expanded = !_expanded),
                  icon: Icon(_expanded ? Icons.expand_less : Icons.history),
                  label: Text(
                    _expanded
                        ? 'Hide history'
                        : period.deductionStatus == DeductionStatus.deducted
                        ? 'Review and confirm'
                        : 'View history',
                  ),
                ),
              ],
            ),
            if (_expanded) ...[
              const SizedBox(height: 16),
              const Divider(),
              RecurringPeriodHistory(parent: widget.parent, instance: period),
            ],
          ],
        ),
      ),
    );
  }
}
