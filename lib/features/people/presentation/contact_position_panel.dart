import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/dates/financial_clock.dart';
import '../../../core/identifiers/command_id_factory.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/widgets/money_text.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../dashboard/domain/dashboard_summary.dart';
import '../../dashboard/presentation/projected_dashboard_providers.dart';

class ContactPositionPanel extends ConsumerStatefulWidget {
  const ContactPositionPanel({super.key, required this.contactId});
  final ContactId contactId;
  @override
  ConsumerState<ContactPositionPanel> createState() =>
      _ContactPositionPanelState();
}

class _ContactPositionPanelState extends ConsumerState<ContactPositionPanel> {
  bool _busy = false;
  Object? _error;
  Future<void> _refresh() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(projectedDashboardRepositoryProvider)
          .refresh(newCommandId());
    } catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final projection = ref.watch(projectedContactProvider(widget.contactId));
    final ledgerState = ref.watch(ledgerStateProvider);
    final profile = ref.watch(userProfileProvider);
    final record = projection.asData?.value;
    final summary = record?.value;
    final ledger = ledgerState.asData?.value;
    final freshness = summary == null || ledger?.value == null
        ? SummaryFreshness.updating
        : summary.metadata.freshness(
            ledger: ledger!.value!,
            profile: profile,
            now: ref.watch(financialClockProvider),
            isFromCache: record!.isFromCache,
            ledgerIsFromCache: ledger.isFromCache,
          );
    var positions =
        summary?.currencies.values
            .where(
              (position) =>
                  position.youOwe.minorUnits != 0 ||
                  position.owedToYou.minorUnits != 0 ||
                  position.activeCount +
                          position.completedCount +
                          position.cancelledCount >
                      0,
            )
            .toList() ??
        <ContactCurrencyPosition>[];
    if (summary != null && positions.isEmpty) {
      positions = [summary.currencies[profile.defaultCurrency]!];
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Current position',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            if (freshness != SummaryFreshness.current)
              Text(
                freshness == SummaryFreshness.cached
                    ? 'Cached position · reconnect to confirm.'
                    : 'Updating position · these totals may be from an earlier update.',
              ),
            FinancialActionError(
              error: projection.error ?? ledgerState.error ?? _error,
            ),
            const Text(
              'Each debt keeps its own balance. Net position is informational.',
            ),
            for (final position in positions) ...[
              const SizedBox(height: 20),
              Text(
                position.currency.code,
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 24,
                runSpacing: 12,
                children: [
                  for (final (label, money) in [
                    ('You owe', position.youOwe),
                    ('Owed to you', position.owedToYou),
                    ('Net position', position.netPosition),
                  ])
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(label),
                        MoneyText(money: money, includeCode: true),
                      ],
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                '${position.activeCount} active · ${position.completedCount} completed · ${position.cancelledCount} cancelled',
              ),
            ],
            if (freshness != SummaryFreshness.current)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: _busy ? null : _refresh,
                  child: Text(
                    _busy ? 'Refresh requested…' : 'Refresh position',
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
