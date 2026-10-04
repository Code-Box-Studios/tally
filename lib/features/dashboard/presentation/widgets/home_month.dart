import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/money/money.dart';
import '../../../../shared/widgets/money_text.dart';
import '../../domain/dashboard_summary.dart';
import 'home_panel.dart';

String unknownBillsLabel(int count) =>
    'Plus $count ${count == 1 ? 'bill' : 'bills'} needing an amount';

class HomeMonth extends StatelessWidget {
  const HomeMonth({super.key, required this.summary});
  final ProjectedDashboardSummary? summary;
  @override
  Widget build(BuildContext context) {
    final month = summary?.month.outgoing;
    final scheduled = month?.scheduled.minorUnits ?? 0;
    final remaining = month?.remaining.minorUnits ?? 0;
    final progress = scheduled == 0 ? 0.0 : (scheduled - remaining) / scheduled;
    return HomePanel(
      title: summary == null
          ? 'This month, in focus'
          : '${DateFormat('MMMM').format(DateTime.utc(summary!.metadata.month.year, summary!.metadata.month.month))}, in focus',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _MonthLine('Scheduled this month', month?.scheduled),
          const SizedBox(height: 15),
          _MonthLine('Paid this month', month?.paid),
          const SizedBox(height: 15),
          _MonthLine('Remaining this month', month?.remaining),
          const SizedBox(height: 20),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(value: progress, minHeight: 6),
          ),
          const SizedBox(height: 8),
          Text(
            'Settled on this month’s dues',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (month != null && month.unknownAmountCount > 0) ...[
            const SizedBox(height: 15),
            Text(unknownBillsLabel(month.unknownAmountCount)),
          ],
          if (month != null && month.assumedPaid.minorUnits > 0) ...[
            const SizedBox(height: 14),
            _MonthLine('Assumed auto deductions', month.assumedPaid),
            const SizedBox(height: 5),
            const Text('Recorded by schedule; deduction not confirmed.'),
          ],
          const SizedBox(height: 18),
          _MonthLine('Received this month', summary?.month.incoming.paid),
          const SizedBox(height: 8),
          Text(
            'Payments recorded this month can cover earlier or later dues.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _MonthLine extends StatelessWidget {
  const _MonthLine(this.label, this.value);
  final String label;
  final Money? value;
  @override
  Widget build(BuildContext context) => Wrap(
    alignment: WrapAlignment.spaceBetween,
    spacing: 10,
    runSpacing: 5,
    children: [
      Text(label),
      value == null
          ? const Text('—')
          : MoneyText(
              money: value!,
              style: Theme.of(context).textTheme.titleMedium,
            ),
    ],
  );
}
