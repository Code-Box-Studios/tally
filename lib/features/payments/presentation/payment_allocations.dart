import 'package:flutter/material.dart';

import '../../../shared/widgets/money_text.dart';
import '../../obligations/domain/obligation.dart';
import '../domain/payment_entry.dart';

class PaymentAllocations extends StatelessWidget {
  const PaymentAllocations({
    super.key,
    required this.parent,
    required this.allocations,
    this.title = 'Applied to',
  });
  final Obligation parent;
  final List<PaymentAllocation> allocations;
  final String title;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(title, style: Theme.of(context).textTheme.labelLarge),
      for (final allocation in allocations)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Wrap(
            spacing: 12,
            runSpacing: 5,
            children: [
              Text(
                parent.type == ObligationType.installment
                    ? 'Installment ${parent.installmentInstanceIds.indexOf(allocation.instanceId) + 1}'
                    : 'This obligation',
              ),
              MoneyText(money: allocation.amount, includeCode: true),
            ],
          ),
        ),
    ],
  );
}
