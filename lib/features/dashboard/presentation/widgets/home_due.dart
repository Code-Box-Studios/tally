import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/dates/financial_clock.dart';
import '../../../../core/dates/timezone_catalog.dart';
import '../../../../shared/widgets/money_text.dart';
import '../../../../shared/widgets/paged_records.dart';
import '../../../obligations/domain/due_query.dart';
import '../../../obligations/domain/obligation.dart';
import '../../../obligations/domain/obligation_instance.dart';
import '../../../obligations/presentation/due_providers.dart';
import '../../domain/dashboard_summary.dart';
import '../projected_dashboard_providers.dart';
import 'home_month.dart';
import 'home_panel.dart';

String dueLabel(ObligationInstance instance, DateTime now) {
  if (instance.status == FinancialStatus.failed) {
    return 'Automatic deduction failed';
  }
  if (instance.status == FinancialStatus.expected) {
    return 'Awaiting confirmation';
  }
  final due = instance.dueDate;
  if (due == null) return 'No due date';
  final local = TimezoneCatalog.at(now, instance.timezone);
  final days = DateTime.utc(
    due.year,
    due.month,
    due.day,
  ).difference(DateTime.utc(local.year, local.month, local.day)).inDays;
  if (days == 0) return 'Due today';
  if (days < 0) return 'Overdue · ${due.toString()}';
  return 'Due in $days ${days == 1 ? 'day' : 'days'}';
}

class HomeDue extends ConsumerStatefulWidget {
  const HomeDue({super.key, required this.summary});
  final ProjectedDashboardSummary? summary;
  @override
  ConsumerState<HomeDue> createState() => _HomeDueState();
}

class _HomeDueState extends ConsumerState<HomeDue> {
  bool _reviewOverdue = false;
  @override
  Widget build(BuildContext context) {
    final overdue = widget.summary?.attention.overdue.outgoing;
    return HomePanel(
      title: 'What needs your attention',
      action: TextButton(
        onPressed: () => context.go('/calendar'),
        child: const Text('See calendar →'),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (overdue != null && overdue.count > 0) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.errorContainer
                    .withValues(alpha: .35),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Wrap(
                spacing: 10,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  const Icon(Icons.warning_amber_outlined, size: 19),
                  Text(
                    '${overdue.count} overdue ${overdue.count == 1 ? 'payment' : 'payments'}',
                  ),
                  MoneyText(money: overdue.amount),
                  TextButton(
                    onPressed: () =>
                        setState(() => _reviewOverdue = !_reviewOverdue),
                    child: Text(_reviewOverdue ? 'Hide' : 'Review →'),
                  ),
                ],
              ),
            ),
            if (overdue.unknownAmountCount > 0)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(unknownBillsLabel(overdue.unknownAmountCount)),
              ),
            if (_reviewOverdue)
              const _DueRows(
                group: DueGroup.overdue,
                direction: ObligationDirection.owedByMe,
              ),
            const SizedBox(height: 18),
          ],
          Text('DUE TODAY', style: Theme.of(context).textTheme.labelSmall),
          const _DueRows(
            group: DueGroup.today,
            direction: ObligationDirection.owedByMe,
          ),
          const SizedBox(height: 16),
          Text('COMING UP SOON', style: Theme.of(context).textTheme.labelSmall),
          const _DueRows(
            group: DueGroup.soon,
            direction: ObligationDirection.owedByMe,
          ),
          const Divider(),
          Text(
            'A heads-up now means fewer surprises later.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class HomeAutomatic extends StatelessWidget {
  const HomeAutomatic({super.key});
  @override
  Widget build(BuildContext context) => const HomePanel(
    title: 'Upcoming auto deductions',
    subtitle: 'Expected by schedule',
    child: _DueRows(group: DueGroup.upcoming, automaticOnly: true),
  );
}

class HomeExpected extends StatelessWidget {
  const HomeExpected({super.key});
  @override
  Widget build(BuildContext context) => HomePanel(
    title: 'Expected from others',
    action: TextButton(
      onPressed: () => context.go('/obligations?section=owed'),
      child: const Text('View all'),
    ),
    child: const _DueRows(
      group: DueGroup.upcoming,
      direction: ObligationDirection.owedToMe,
    ),
  );
}

class _DueRows extends ConsumerWidget {
  const _DueRows({
    required this.group,
    this.automaticOnly = false,
    this.direction,
  });
  final DueGroup group;
  final bool automaticOnly;
  final ObligationDirection? direction;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final now = ref.watch(financialClockProvider);
    final query = DueQuery(
      group: group,
      now: now,
      currency: ref.watch(privateCurrencyProvider),
      automaticOnly: automaticOnly,
      direction: direction,
    );
    return PagedRecords<ObligationInstance>(
      key: ValueKey(query),
      first: ref.watch(duePageProvider(query)),
      loadMore: (cursor) =>
          ref.read(dueRepositoryProvider).getDue(query, after: cursor),
      identity: (instance) => instance.id.value,
      onRetry: () => ref.invalidate(duePageProvider(query)),
      empty: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Text(
          automaticOnly
              ? 'No automatic deductions due in the next 30 days.'
              : switch (group) {
                  DueGroup.today =>
                    'Nothing due today. A little room to breathe.',
                  DueGroup.soon => 'Nothing due in the next seven days.',
                  DueGroup.overdue =>
                    'No overdue obligations in this currency.',
                  DueGroup.upcoming => 'Nothing due in the next 30 days.',
                },
        ),
      ),
      builder: (context, instances, complete) => Column(
        children: [
          for (final instance in instances)
            _DueRow(instance: instance, now: now),
        ],
      ),
    );
  }
}

class _DueRow extends StatelessWidget {
  const _DueRow({required this.instance, required this.now});
  final ObligationInstance instance;
  final DateTime now;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 12),
    child: InkWell(
      borderRadius: BorderRadius.circular(9),
      onTap: () => context.go('/obligations/${instance.obligationId.value}'),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primaryContainer,
              borderRadius: BorderRadius.circular(9),
            ),
            child: Icon(
              instance.section == ObligationSection.monthlyDues
                  ? Icons.event_repeat
                  : instance.direction == ObligationDirection.owedToMe
                  ? Icons.north_east
                  : Icons.south_west,
              size: 18,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  instance.title,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 4),
                Text(
                  instance.section == ObligationSection.monthlyDues
                      ? 'Monthly dues'
                      : instance.direction == ObligationDirection.owedToMe
                      ? 'Owed to you'
                      : 'You owe',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 5),
                Text(
                  dueLabel(instance, now),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                if (instance.paymentMode != PaymentMode.manual)
                  Text(
                    instance.deductionStatus.label,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                if (instance.periodLabel.isNotEmpty)
                  Text(
                    instance.periodLabel,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                const SizedBox(height: 6),
                if (instance.remainingAmount != null)
                  MoneyText(money: instance.remainingAmount!)
                else
                  const Text('Amount needed'),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
