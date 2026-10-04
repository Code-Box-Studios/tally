import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/financial_labels.dart';
import '../../../shared/widgets/money_text.dart';
import '../domain/obligation.dart';

class ObligationRow extends StatelessWidget {
  const ObligationRow(this.obligation, {super.key, this.wide = false});
  final Obligation obligation;
  final bool wide;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: () => context.go('/obligations/${obligation.id.value}'),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: scheme.outlineVariant)),
        ),
        child: wide
            ? _desktop(context)
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Wrap(
                    spacing: 12,
                    runSpacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Icon(
                        obligation.direction == ObligationDirection.owedByMe
                            ? Icons.south_west
                            : Icons.north_east,
                        size: 18,
                        color: scheme.primary,
                      ),
                      Text(
                        obligation.title,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      FinancialStatusChip(obligation.status),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${obligation.contact?.name ?? 'Personal obligation'} · ${obligation.categoryName}',
                    style: TextStyle(
                      fontSize: 12,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 28,
                    runSpacing: 10,
                    children: [
                      for (final value in [
                        ('Original', obligation.originalAmount),
                        ('Paid', obligation.paidAmount),
                        ('Remaining', obligation.remainingAmount),
                      ])
                        if (value.$2 != null)
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                value.$1,
                                style: TextStyle(
                                  fontSize: 10,
                                  color: scheme.onSurfaceVariant,
                                ),
                              ),
                              MoneyText(
                                money: value.$2!,
                                includeCode: true,
                                style: const TextStyle(
                                  fontFamily: 'Manrope',
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    obligation.dueDate == null
                        ? 'No due date set'
                        : 'Due ${obligation.dueDate}',
                    style: TextStyle(
                      fontSize: 11,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _desktop(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      children: [
        Expanded(
          flex: 4,
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: scheme.primaryContainer,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  obligation.direction == ObligationDirection.owedByMe
                      ? Icons.south_west
                      : Icons.north_east,
                  size: 18,
                  color: scheme.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      obligation.title,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      obligation.contact?.name ?? 'Personal obligation',
                      style: TextStyle(
                        fontSize: 12,
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Expanded(
          flex: 2,
          child: Text(
            obligation.categoryName,
            style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
          ),
        ),
        Expanded(
          flex: 2,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (obligation.remainingAmount case final amount?)
                MoneyText(
                  money: amount,
                  includeCode: true,
                  style: const TextStyle(
                    fontFamily: 'Manrope',
                    fontWeight: FontWeight.w700,
                  ),
                ),
              if (obligation.originalAmount case final amount?)
                MoneyText(
                  money: amount,
                  includeCode: true,
                  style: TextStyle(
                    fontSize: 11,
                    color: scheme.onSurfaceVariant,
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          flex: 2,
          child: Text(
            obligation.dueDate?.toString() ?? 'No due date',
            style: const TextStyle(fontSize: 12),
          ),
        ),
        Expanded(
          flex: 2,
          child: Align(
            alignment: Alignment.centerLeft,
            child: FinancialStatusChip(obligation.status),
          ),
        ),
        const Icon(Icons.chevron_right, size: 18),
      ],
    );
  }
}

class ObligationList extends StatelessWidget {
  const ObligationList(this.values, {super.key});
  final List<Obligation> values;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final wide =
          constraints.maxWidth >= 850 &&
          MediaQuery.textScalerOf(context).scale(14) <= 18;
      return Column(
        children: [
          if (wide)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              child: Row(
                children: [
                  for (final column in const [
                    ('Obligation', 4),
                    ('Category', 2),
                    ('Remaining', 2),
                    ('Due date', 2),
                    ('Status', 2),
                  ])
                    Expanded(
                      flex: column.$2,
                      child: Text(
                        column.$1,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  const SizedBox(width: 18),
                ],
              ),
            ),
          for (final value in values) ObligationRow(value, wide: wide),
        ],
      );
    },
  );
}
