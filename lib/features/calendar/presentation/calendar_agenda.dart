import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/dates/local_date.dart';
import '../../../shared/widgets/financial_labels.dart';
import '../../../shared/widgets/money_text.dart';
import '../../obligations/domain/obligation.dart';
import '../../obligations/domain/obligation_instance.dart';
import '../../recurring/domain/deduction_attempt.dart';
import '../../search/domain/financial_filter.dart';

class CalendarAgenda extends StatelessWidget {
  const CalendarAgenda({
    super.key,
    required this.instances,
    required this.now,
    this.selectedDay,
    this.complete = true,
    this.title = 'Your month ahead',
  });
  final List<ObligationInstance> instances;
  final DateTime now;
  final LocalDate? selectedDay;
  final bool complete;
  final String title;
  @override
  Widget build(BuildContext context) {
    final values =
        instances
            .where(
              (value) => selectedDay == null || value.dueDate == selectedDay,
            )
            .toList()
          ..sort((a, b) {
            final order = a.dueDate!.compareTo(b.dueDate!);
            return order == 0 ? a.id.value.compareTo(b.id.value) : order;
          });
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(20),
            child: Text(
              selectedDay == null ? title : 'Due on $selectedDay',
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          if (values.isEmpty)
            Padding(
              padding: const EdgeInsets.all(20),
              child: Text(
                complete ? 'No due dates on this day.' : 'No loaded due dates on this day. Load more to check the remaining records.',
              ),
            ),
          for (final instance in values)
            CalendarAgendaRow(instance: instance, now: now),
        ],
      ),
    );
  }
}

class CalendarAgendaRow extends StatelessWidget {
  const CalendarAgendaRow({
    super.key,
    required this.instance,
    required this.now,
  });
  final ObligationInstance instance;
  final DateTime now;
  FinancialStatus get _status {
    if (instance.status == FinancialStatus.skipped ||
        instance.status == FinancialStatus.cancelled) {
      return instance.status;
    }
    if (instance.remainingAmount?.minorUnits == 0) return FinancialStatus.paid;
    if (FinancialFilter(status: RecordStatus.overdue)
        .matchesInstance(instance, now)) {
      return FinancialStatus.overdue;
    }
    return instance.paidAmount.minorUnits > 0
        ? FinancialStatus.partiallyPaid
        : FinancialStatus.pending;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: () => context.go(
        Uri(
          path: '/obligations/${instance.obligationId.value}',
          queryParameters: instance.section == ObligationSection.monthlyDues
              ? {'period': instance.id.value}
              : null,
        ).toString(),
      ),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: scheme.outlineVariant)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: 10,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Icon(
                  instance.direction == ObligationDirection.owedByMe
                      ? Icons.south_west
                      : Icons.north_east,
                  size: 18,
                ),
                Text(
                  instance.title,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                FinancialStatusChip(_status),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${switch (instance.section) {
                ObligationSection.iOwe => 'I Owe',
                ObligationSection.owedToMe => 'Owed to Me',
                ObligationSection.monthlyDues => 'Monthly Dues',
              }} · ${instance.periodLabel}',
            ),
            if (instance.contact != null || instance.categoryName.isNotEmpty)
              Text(
                [
                  if (instance.contact != null) instance.contact!.name,
                  if (instance.categoryName.isNotEmpty) instance.categoryName,
                ].join(' · '),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            const SizedBox(height: 12),
            if (instance.remainingAmount case final remaining?) ...[
              Text(
                _status == FinancialStatus.paid
                    ? 'Paid this period'
                    : 'Remaining',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              MoneyText(
                money: _status == FinancialStatus.paid
                    ? instance.paidAmount
                    : remaining,
                includeCode: true,
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ] else ...[
              Text(
                'Amount needed',
                style: Theme.of(context).textTheme.titleSmall,
              ),
              if (instance.estimatedAmount case final estimate?) ...[
                const Text('Estimate · enter the actual bill amount'),
                MoneyText(money: estimate, includeCode: true),
              ],
            ],
            const SizedBox(height: 10),
            Text(
              'Due ${instance.dueDate}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            Text(
              instance.paymentMode == PaymentMode.manual
                  ? 'Manual payment'
                  : instance.paymentMode == PaymentMode.automaticConfirmation
                  ? 'Auto deduct · confirmation required'
                  : 'Auto deduct',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (instance.deductionStatus != DeductionStatus.none)
              Text(instance.deductionStatus.label),
            Text(
              instance.timezone,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
