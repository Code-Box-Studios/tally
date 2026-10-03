import 'package:flutter/material.dart';

import '../../../../shared/widgets/money_text.dart';
import '../../../../shared/widgets/status_badge.dart';
import '../../domain/dashboard_summary.dart';

class DueList extends StatelessWidget {
  const DueList({super.key, required this.items});
  final List<DuePreviewItem> items;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      for (var i = 0; i < items.length; i++) ...[
        if (i > 0) const Divider(height: 32),
        _DueRow(item: items[i]),
      ],
    ],
  );
}

class _DueRow extends StatelessWidget {
  const _DueRow({required this.item});
  final DuePreviewItem item;
  @override
  Widget build(BuildContext context) {
    final (label, icon, tone) = switch (item.state) {
      PreviewDueState.overdue => (
        'Overdue',
        Icons.warning_amber,
        StatusTone.danger,
      ),
      PreviewDueState.dueToday => (
        'Due today',
        Icons.today_outlined,
        StatusTone.caution,
      ),
      PreviewDueState.paid => (
        'Paid',
        Icons.check_circle_outline,
        StatusTone.positive,
      ),
      PreviewDueState.failed => (
        'Deduction failed',
        Icons.error_outline,
        StatusTone.danger,
      ),
      PreviewDueState.expected => (
        'Expected',
        Icons.autorenew,
        StatusTone.automatic,
      ),
      PreviewDueState.upcoming => (
        'Upcoming',
        Icons.schedule,
        StatusTone.neutral,
      ),
    };
    final section = switch (item.section) {
      PreviewSection.owedByMe => 'I Owe',
      PreviewSection.owedToMe => 'Owed to Me',
      PreviewSection.recurringDue => 'Monthly Dues',
    };
    return LayoutBuilder(
      builder: (context, constraints) {
        final details = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              item.title,
              style: Theme.of(context).textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 5),
            Text(
              '$section · Oct ${item.dueDate.day}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                StatusBadge(label: label, icon: icon, tone: tone),
                if (item.assumed)
                  const StatusBadge(
                    label: 'Assumed',
                    icon: Icons.info_outline,
                    tone: StatusTone.automatic,
                  ),
              ],
            ),
          ],
        );
        final amount = item.remaining == null
            ? const Text('Amount needed')
            : MoneyText(
                money: item.remaining!,
                style: Theme.of(context).textTheme.titleMedium,
              );
        final stack =
            constraints.maxWidth < 380 ||
            MediaQuery.textScalerOf(context).scale(1) > 1.4;
        return stack
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [details, const SizedBox(height: 12), amount],
              )
            : Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: details),
                  const SizedBox(width: 12),
                  Flexible(child: amount),
                ],
              );
      },
    );
  }
}
