import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/dates/financial_clock.dart';
import '../../../core/dates/timezone_catalog.dart';
import '../../../core/identifiers/command_id_factory.dart';
import '../../../core/money/currency_code.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/widgets/money_text.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../obligations/presentation/add_action_sheet.dart';
import '../domain/dashboard_summary.dart';
import 'projected_dashboard_providers.dart';
import 'widgets/home_activity.dart';
import 'widgets/home_due.dart';
import 'widgets/home_metrics.dart';
import 'widgets/home_month.dart';
import 'widgets/home_panel.dart';

class PrivateDashboardScreen extends ConsumerStatefulWidget {
  const PrivateDashboardScreen({super.key});
  @override
  ConsumerState<PrivateDashboardScreen> createState() =>
      _PrivateDashboardScreenState();
}

class _PrivateDashboardScreenState
    extends ConsumerState<PrivateDashboardScreen> {
  bool _refreshing = false;
  Object? _refreshError;
  Future<void> _refresh() async {
    if (_refreshing) return;
    setState(() {
      _refreshing = true;
      _refreshError = null;
    });
    try {
      await ref
          .read(projectedDashboardRepositoryProvider)
          .refresh(newCommandId());
    } catch (error) {
      if (mounted) setState(() => _refreshError = error);
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final currency = ref.watch(privateCurrencyProvider);
    final summaryState = ref.watch(projectedDashboardProvider(currency));
    final ledgerState = ref.watch(ledgerStateProvider);
    final profile = ref.watch(userProfileProvider);
    final now = ref.watch(financialClockProvider);
    final local = TimezoneCatalog.at(now, profile.timezone);
    final firstName = profile.displayName.trim().split(RegExp(r'\s+')).first;
    final record = summaryState.asData?.value;
    final ledger = ledgerState.asData?.value;
    final summary = record?.value;
    var freshness = SummaryFreshness.updating;
    if (summary != null && ledger?.value != null) {
      freshness = summary.freshness(
        ledger: ledger!.value!,
        profile: profile,
        now: now,
        isFromCache: record!.isFromCache,
        ledgerIsFromCache: ledger.isFromCache,
      );
    }
    final wide =
        MediaQuery.sizeOf(context).width >= 1050 &&
        MediaQuery.textScalerOf(context).scale(14) < 22;
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        MediaQuery.sizeOf(context).width < 600 ? 20 : 40,
        33,
        MediaQuery.sizeOf(context).width < 600 ? 20 : 40,
        112,
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1360),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 16,
                runSpacing: 16,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${local.hour < 12
                            ? "GOOD MORNING"
                            : local.hour < 18
                            ? "GOOD AFTERNOON"
                            : "GOOD EVENING"}${firstName.isEmpty ? '' : ', ${firstName.toUpperCase()}'}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Your money, at a glance.',
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'A little clarity for the things you need to remember.',
                      ),
                    ],
                  ),
                  DropdownButton<CurrencyCode>(
                    key: const Key('home-currency'),
                    value: currency,
                    onChanged: (value) {
                      if (value != null) {
                        ref
                            .read(privateCurrencyProvider.notifier)
                            .select(value);
                      }
                    },
                    items: [
                      for (final value in CurrencyCode.values)
                        DropdownMenuItem(value: value, child: Text(value.code)),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 20),
              if (summaryState.hasError || ledgerState.hasError) ...[
                FinancialActionError(
                  error: summaryState.error ?? ledgerState.error,
                ),
                TextButton(
                  onPressed: () {
                    ref.invalidate(projectedDashboardProvider(currency));
                    ref.invalidate(ledgerStateProvider);
                  },
                  child: const Text('Try again'),
                ),
              ],
              if (freshness != SummaryFreshness.current) ...[
                Wrap(
                  spacing: 12,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      freshness == SummaryFreshness.cached
                          ? 'Cached overview · reconnect to confirm.'
                          : 'Updating overview · these totals may be from an earlier update.',
                    ),
                    TextButton(
                      onPressed: _refreshing ? null : _refresh,
                      child: Text(
                        _refreshing ? 'Refresh requested…' : 'Refresh overview',
                      ),
                    ),
                  ],
                ),
                FinancialActionError(error: _refreshError),
                const SizedBox(height: 16),
              ],
              HomeMetrics(summary: summary),
              const SizedBox(height: 20),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  const Icon(Icons.balance_outlined, size: 17),
                  const Text('Net position'),
                  if (summary != null)
                    MoneyText(money: summary.netPosition, includeCode: true)
                  else
                    const Text('—'),
                  const Text(
                    'Borrowing and lending only. Monthly dues are tracked separately.',
                  ),
                ],
              ),
              const SizedBox(height: 26),
              if (wide)
                Row(
                  key: const Key('home-columns'),
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 165,
                      child: Column(
                        children: [
                          HomeDue(summary: summary),
                          const SizedBox(height: 20),
                          const HomeExpected(),
                          const SizedBox(height: 20),
                          const HomeActivity(),
                        ],
                      ),
                    ),
                    const SizedBox(width: 22),
                    Expanded(
                      flex: 100,
                      child: Column(
                        children: [
                          HomeMonth(summary: summary),
                          const SizedBox(height: 20),
                          const HomeAutomatic(),
                          const SizedBox(height: 20),
                          const _QuickAdd(),
                        ],
                      ),
                    ),
                  ],
                )
              else ...[
                HomeDue(summary: summary),
                const SizedBox(height: 20),
                const HomeExpected(),
                const SizedBox(height: 20),
                HomeMonth(summary: summary),
                const SizedBox(height: 20),
                const HomeAutomatic(),
                const SizedBox(height: 20),
                const HomeActivity(),
                const SizedBox(height: 20),
                const _QuickAdd(),
              ],
              const SizedBox(height: 24),
              Text(
                'Amounts shown in ${currency.code}. Currencies are kept separate.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickAdd extends StatelessWidget {
  const _QuickAdd();
  @override
  Widget build(BuildContext context) => HomePanel(
    title: 'One less thing on your mind.',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Let Tally remember your obligations, so you can get on with your day.',
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: () => openAddFlow(context),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('Add an obligation'),
        ),
      ],
    ),
  );
}
