import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/environment.dart';
import '../../../core/config/environment_providers.dart';
import '../../../core/money/currency_code.dart';
import '../../../core/money/money.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/error_panel.dart';
import '../../../shared/widgets/money_text.dart';
import '../../../shared/widgets/status_badge.dart';
import '../domain/dashboard_summary.dart';
import 'dashboard_providers.dart';
import 'private_dashboard_screen.dart';
import 'widgets/due_list.dart';
import 'widgets/summary_card.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preview =
        ref.watch(environmentProvider).mode == AppEnvironment.preview;
    if (!preview) return const PrivateDashboardScreen();
    return ref
        .watch(dashboardSummaryProvider)
        .when(
          skipLoadingOnRefresh: false,
          loading: () => const Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 20),
                Text('Getting your overview…'),
              ],
            ),
          ),
          error: (_, _) => Center(
            child: ErrorPanel(
              title: 'Your overview couldn’t load',
              message: 'Please try again to see what’s due.',
              onRetry: () => ref.invalidate(dashboardSummaryProvider),
            ),
          ),
          data: (summary) => !preview
              ? const SingleChildScrollView(
                  child: EmptyState(
                    icon: Icons.home_outlined,
                    title: 'Your overview starts here',
                    description:
                        'Your loans, dues and payments will appear here.',
                  ),
                )
              : _Overview(summary: summary),
        );
  }
}

class _Overview extends ConsumerWidget {
  const _Overview({required this.summary});
  final DashboardSummary summary;
  @override
  Widget build(BuildContext context, WidgetRef ref) => SingleChildScrollView(
    padding: const EdgeInsets.fromLTRB(24, 32, 24, 112),
    child: LayoutBuilder(
      builder: (context, constraints) {
        final theme = Theme.of(context);
        final wide =
            constraints.maxWidth >= 900 &&
            MediaQuery.textScalerOf(context).scale(1) <= 1.4;
        final cards = [
          SummaryCard(
            label: 'You Owe',
            value: summary.youOwe,
            icon: Icons.south_west,
            description: 'Your outstanding balance',
            emphasized: true,
          ),
          SummaryCard(
            label: 'Owed to You',
            value: summary.owedToYou,
            icon: Icons.north_east,
            description: 'Money still coming back to you',
          ),
          SummaryCard(
            label: 'Due This Month',
            value: summary.dueThisMonth,
            icon: Icons.calendar_today_outlined,
            description: 'Known payments due in October',
          ),
        ];
        final due =
            summary.upcoming
                .where((i) => !i.automatic && i.state != PreviewDueState.paid)
                .toList()
              ..sort((a, b) => a.dueDate.compareTo(b.dueDate));
        final automatic = summary.upcoming.where((i) => i.automatic).toList();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              spacing: 24,
              runSpacing: 16,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'A little clarity. A calmer day.',
                      style: theme.textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 8),
                    const Text('Know what’s due. Make room for what matters.'),
                  ],
                ),
                const StatusBadge(
                  label: 'Sample data',
                  icon: Icons.visibility_outlined,
                  tone: StatusTone.neutral,
                ),
              ],
            ),
            const SizedBox(height: 24),
            Wrap(
              spacing: 16,
              runSpacing: 12,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                const Text('October 2026 · As of Oct 3'),
                DropdownButton<CurrencyCode>(
                  value: summary.currency,
                  underline: const SizedBox.shrink(),
                  onChanged: (value) {
                    if (value != null) {
                      ref
                          .read(selectedCurrencyProvider.notifier)
                          .setCurrency(value);
                    }
                  },
                  items: [
                    for (final currency in CurrencyCode.values)
                      DropdownMenuItem(
                        value: currency,
                        child: Text(currency.code),
                      ),
                  ],
                ),
                const Text('Currencies are shown separately.'),
              ],
            ),
            const SizedBox(height: 24),
            if (wide)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var i = 0; i < cards.length; i++) ...[
                    if (i > 0) const SizedBox(width: 16),
                    Expanded(child: cards[i]),
                  ],
                ],
              )
            else ...[
              for (final card in cards) ...[
                SizedBox(width: double.infinity, child: card),
                const SizedBox(height: 16),
              ],
            ],
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                const Icon(Icons.balance_outlined, size: 20),
                const Text('Net position'),
                MoneyText(
                  money: summary.netPosition,
                  includeCode: true,
                  style: theme.textTheme.titleMedium,
                ),
                const Text('Informational · debts stay separate'),
              ],
            ),
            const SizedBox(height: 32),
            _Panel(
              title: 'Your month at a glance',
              subtitle:
                  'Known amounts only. Variable bills need their own amount.',
              child: Wrap(
                spacing: 32,
                runSpacing: 24,
                children: [
                  _Metric(
                    'Paid this month',
                    summary.paidThisMonth,
                    'Payments recorded in October',
                  ),
                  _Metric(
                    'Remaining this month',
                    summary.remainingThisMonth,
                    'Outstanding for October due dates',
                  ),
                  _Metric('Overdue', summary.overdue, 'Needs your attention'),
                ],
              ),
            ),
            const SizedBox(height: 24),
            if (wide)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 3,
                    child: _Panel(
                      title: 'What needs your attention',
                      subtitle: 'Due today, due soon and overdue',
                      child: DueList(items: due),
                    ),
                  ),
                  const SizedBox(width: 24),
                  Expanded(
                    flex: 2,
                    child: Column(
                      children: [
                        _Panel(
                          title: 'Automatic deductions',
                          subtitle: 'Expected payments · no bank connection',
                          child: DueList(items: automatic),
                        ),
                        const SizedBox(height: 24),
                        _recent(context),
                      ],
                    ),
                  ),
                ],
              )
            else ...[
              _Panel(
                title: 'What needs your attention',
                subtitle: 'Due today, due soon and overdue',
                child: DueList(items: due),
              ),
              const SizedBox(height: 24),
              _Panel(
                title: 'Automatic deductions',
                subtitle: 'Expected payments · no bank connection',
                child: automatic.isEmpty
                    ? const Text('No automatic deductions in this currency.')
                    : DueList(items: automatic),
              ),
              const SizedBox(height: 24),
              _recent(context),
            ],
            const SizedBox(height: 24),
            TextButton.icon(
              onPressed: () => context.go('/obligations'),
              icon: const Icon(Icons.arrow_forward),
              label: const Text('View obligations'),
            ),
          ],
        );
      },
    ),
  );
  Widget _recent(BuildContext context) => _Panel(
    title: 'Recent activity',
    subtitle: 'A record you can come back to',
    child: summary.currency == CurrencyCode.php
        ? const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Today · September internet marked paid'),
              SizedBox(height: 8),
              Text('Oct 1 · Spotify auto deduction recorded'),
              SizedBox(height: 8),
              Text('Assumed — confirmation hasn’t been recorded.'),
            ],
          )
        : const Text('No recent activity in this currency.'),
  );
}

class _Panel extends StatelessWidget {
  const _Panel({
    required this.title,
    required this.subtitle,
    required this.child,
  });
  final String title, subtitle;
  final Widget child;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 24),
          child,
        ],
      ),
    ),
  );
}

class _Metric extends StatelessWidget {
  const _Metric(this.label, this.value, this.hint);
  final String label, hint;
  final Money value;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: 250,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label),
        const SizedBox(height: 8),
        MoneyText(money: value, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text(hint, style: Theme.of(context).textTheme.bodySmall),
      ],
    ),
  );
}
