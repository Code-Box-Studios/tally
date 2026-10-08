import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../attachments/domain/attachment.dart';
import '../../attachments/presentation/attachment_panel.dart';

import 'package:go_router/go_router.dart';

import '../../../shared/presentation/financial_form_support.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../../../shared/widgets/money_text.dart';
import '../../../shared/widgets/page_body.dart';
import '../../../shared/widgets/paged_records.dart';
import '../../obligations/domain/obligation.dart';
import '../../obligations/domain/obligation_instance.dart';
import '../domain/recurring_commands.dart';
import '../domain/recurrence_rule.dart';
import 'recurrence_editor.dart';
import 'recurring_editor.dart';
import 'recurring_period_editor.dart';
import 'recurring_period_row.dart';
import 'recurring_providers.dart';
import '../../sync/presentation/pending_actions.dart';

String recurringLifecycleLabel(ObligationLifecycle state) => switch (state) {
  ObligationLifecycle.active => 'Active',
  ObligationLifecycle.paused => 'Paused',
  ObligationLifecycle.ended => 'Ended',
  ObligationLifecycle.cancelled => 'Cancelled',
};

class RecurringDetail extends ConsumerWidget {
  const RecurringDetail({
    super.key,
    required this.parent,
    this.isFromCache = false,
    this.initialPeriod,
  });
  final Obligation parent;
  final bool isFromCache;
  final InstanceId? initialPeriod;
  Future<void> _lifecycle(
    BuildContext context,
    RecurringLifecycleAction action,
    List<ObligationInstance> periods,
    bool complete,
  ) async {
    final today = todayIn(parent.timezone);
    final retained = periods
        .where((period) => period.occurrenceDate.compareTo(today) >= 0)
        .length;
    final result = await showFinancialDialog<RecurringResult>(
      context,
      RecurringLifecycleDialog(
        parent: parent,
        action: action,
        loadedFutureCount: retained,
        complete: complete,
      ),
    );
    if (context.mounted && result != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Schedule ${switch (action) {
              RecurringLifecycleAction.pause => 'paused',
              RecurringLifecycleAction.resume => 'resumed',
              RecurringLifecycleAction.end => 'ended',
            }}. ${result.retainedFutureCount} existing future periods kept.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final first = ref.watch(recurringPeriodsProvider(parent.id));
    final rule = parent.recurrence!.rule;
    return PageBody(
      title: parent.title,
      subtitle: 'Monthly dues · ${recurringLifecycleLabel(parent.lifecycle)}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PendingActions(resourceKey: 'obligation:${parent.id.value}'),
          if (initialPeriod case final id?) ...[
            Text(
              'Selected billing period',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            ref
                .watch(instanceProvider(id))
                .when(
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (error, _) => Column(
                    children: [
                      FinancialActionError(error: error),
                      TextButton(
                        onPressed: () => ref.invalidate(instanceProvider(id)),
                        child: const Text('Try again'),
                      ),
                    ],
                  ),
                  data: (record) {
                    final period = record.value;
                    if (period == null ||
                        period.obligationId != parent.id ||
                        period.section != ObligationSection.monthlyDues) {
                      return const Card(
                        child: Padding(
                          padding: EdgeInsets.all(20),
                          child: Text('This billing period isn’t available'),
                        ),
                      );
                    }
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (record.isFromCache)
                          const Text('Cached period · reconnect to confirm.'),
                        RecurringPeriodRow(
                          key: ValueKey((parent.id, id)),
                          parent: parent,
                          instance: period,
                          initiallyExpanded: true,
                        ),
                      ],
                    );
                  },
                ),
            const SizedBox(height: 24),
          ],
          if (isFromCache)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Text(
                'Cached bill · reconnect to confirm current records.',
              ),
            ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Wrap(
                    spacing: 16,
                    runSpacing: 10,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Chip(
                        avatar: const Icon(Icons.autorenew, size: 16),
                        label: Text(recurringLifecycleLabel(parent.lifecycle)),
                      ),
                      Text(
                        recurrenceLabel(rule.frequency),
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      if (parent.defaultAmount != null) ...[
                        if (parent.amountKind == AmountKind.variable)
                          const Text('Estimate'),
                        MoneyText(
                          money: parent.defaultAmount!,
                          includeCode: true,
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                      ] else
                        Text('Variable amount · ${parent.currency.code}'),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    '${paymentModeLabel(parent.paymentMode)} · ${parent.timezone}',
                  ),
                  if (rule.frequency == RecurrenceFrequency.custom)
                    Text('Every ${rule.interval} ${rule.unit.name}'),
                  Text(
                    'Started ${rule.startDate}${rule.endDate == null ? '' : ' · Ends ${rule.endDate}'}',
                  ),
                  if (parent.source != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        'Source for new periods: ${parent.source!.name}',
                      ),
                    ),
                  if (parent.contact != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(parent.contact!.name),
                    ),
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text('Category: ${parent.categoryName}'),
                  ),
                  if (parent.description.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(parent.description),
                    ),
                  if (parent.notes.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(parent.notes),
                    ),
                  const SizedBox(height: 16),
                  const Text(
                    'Each period below keeps its own bill amount, payments and remaining balance.',
                  ),
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (parent.lifecycle != ObligationLifecycle.ended)
                        OutlinedButton.icon(
                          onPressed: () => context.go(
                            '/obligations/${parent.id.value}/edit',
                          ),
                          icon: const Icon(Icons.edit_outlined, size: 18),
                          label: const Text('Edit future schedule'),
                        ),
                      if (parent.lifecycle == ObligationLifecycle.active)
                        TextButton(
                          onPressed: () => _lifecycle(
                            context,
                            RecurringLifecycleAction.pause,
                            first.asData?.value.items ?? [],
                            first.asData?.value.hasMore == false &&
                                first.asData?.value.isFromCache == false,
                          ),
                          child: const Text('Pause'),
                        ),
                      if (parent.lifecycle == ObligationLifecycle.paused)
                        TextButton(
                          onPressed: () => _lifecycle(
                            context,
                            RecurringLifecycleAction.resume,
                            first.asData?.value.items ?? [],
                            first.asData?.value.hasMore == false &&
                                first.asData?.value.isFromCache == false,
                          ),
                          child: const Text('Resume'),
                        ),
                      if (parent.lifecycle != ObligationLifecycle.ended)
                        TextButton(
                          onPressed: () => _lifecycle(
                            context,
                            RecurringLifecycleAction.end,
                            first.asData?.value.items ?? [],
                            first.asData?.value.hasMore == false &&
                                first.asData?.value.isFromCache == false,
                          ),
                          child: const Text('End'),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          AttachmentPanel(target: AttachmentTarget.forObligation(parent.id)),
          const SizedBox(height: 26),
          Text(
            'Billing periods',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          const Text(
            'Existing periods remain due when a schedule is paused or ended. Payments and corrections stay in the selected period.',
          ),
          const SizedBox(height: 14),
          PagedRecords<ObligationInstance>(
            first: first,
            loadMore: (cursor) => ref
                .read(recurringRepositoryProvider)
                .getPeriods(parent.id, after: cursor),
            identity: (value) => value.id.value,
            onRetry: () => ref.invalidate(recurringPeriodsProvider(parent.id)),
            empty: const Card(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Your first period will appear when its schedule reaches the upcoming 90 days.',
                ),
              ),
            ),
            builder: (context, periods, complete) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final period in periods.where(
                  (period) => period.id != initialPeriod,
                ))
                  RecurringPeriodRow(
                    key: ValueKey(period.id),
                    parent: parent,
                    instance: period,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
