import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/environment.dart';
import '../../../core/config/environment_providers.dart';
import '../../../core/dates/financial_clock.dart';
import '../../../core/money/currency_code.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/page_body.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../calendar/presentation/calendar_agenda.dart';
import '../../search/domain/financial_filter.dart';
import '../../search/domain/period_query.dart';
import '../../search/presentation/financial_filter_panel.dart';
import '../../search/presentation/query_results.dart';
import '../../search/presentation/search_field.dart';
import '../../search/presentation/search_providers.dart';
import '../domain/obligation.dart';
import '../domain/obligation_instance.dart';
import 'add_action_sheet.dart';
import 'obligation_row.dart';
import '../../sync/presentation/pending_actions.dart';

class ObligationsScreen extends ConsumerStatefulWidget {
  const ObligationsScreen({
    super.key,
    this.section = 'owe',
    this.initialCurrency,
  });
  final String section;
  final CurrencyCode? initialCurrency;
  @override
  ConsumerState<ObligationsScreen> createState() => _ObligationsScreenState();
}

class _ObligationsScreenState extends ConsumerState<ObligationsScreen> {
  String get _selected =>
      ['owe', 'owed', 'dues'].contains(widget.section) ? widget.section : 'owe';
  ObligationSection get _type => switch (_selected) {
    'owed' => ObligationSection.owedToMe,
    'dues' => ObligationSection.monthlyDues,
    _ => ObligationSection.iOwe,
  };
  late FinancialFilter _filter = FinancialFilter(
    section: _type,
    currency: widget.initialCurrency,
  );
  bool _periods = false;
  int _searchReset = 0;
  @override
  void didUpdateWidget(covariant ObligationsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.section != widget.section ||
        oldWidget.initialCurrency != widget.initialCurrency) {
      _filter = FinancialFilter(
        section: _type,
        currency: widget.initialCurrency,
      );
      _periods = false;
      _searchReset++;
    }
  }

  Future<void> _filters() async {
    final bills = _type == ObligationSection.monthlyDues && !_periods;
    final result = await showFinancialFilters(
      context,
      _filter,
      showSection: false,
      allowPeriodState: !bills,
      allowLifecycle: bills,
    );
    if (mounted && result != null) {
      setState(() {
        _filter = result;
        if (result == FinancialFilter(section: _type)) _searchReset++;
      });
    }
  }

  void _switchPeriods(bool periods) => setState(() {
    _periods = periods;
    _filter = FinancialFilter(
      section: _type,
      currency: _filter.currency,
      contactId: _filter.contactId,
      categoryId: _filter.categoryId,
      sourceId: _filter.sourceId,
      paymentMode: _filter.paymentMode,
      automaticOnly: _filter.automaticOnly,
      minimumMinor: _filter.minimumMinor,
      maximumMinor: _filter.maximumMinor,
      text: _filter.text,
    );
  });
  @override
  Widget build(BuildContext context) {
    final preview =
            ref.watch(environmentProvider).mode == AppEnvironment.preview,
        now = ref.watch(financialClockProvider),
        query = PeriodQuery(filter: _filter, now: now);
    final (title, description) = switch (_selected) {
      'owed' => (
        'No money owed to you yet',
        'Add money you’ve lent so you can keep track of repayments.',
      ),
      'dues' => (
        'A little clarity for your regular bills',
        'Add rent, subscriptions or another monthly due.',
      ),
      _ => (
        'Nothing owed yet',
        "Add money you've borrowed or an obligation you want Tally to remember.",
      ),
    };
    final filtered =
        _filter !=
        FinancialFilter(section: _type, currency: widget.initialCurrency);
    final empty = EmptyState(
      icon: Icons.wallet_outlined,
      title: filtered
          ? 'No obligations match these filters'
          : _periods
          ? 'No billing periods yet'
          : title,
      description: filtered
          ? 'Try another search or clear your filters.'
          : _periods
          ? 'Generated bills appear here with their own payment history.'
          : description,
      actionLabel: 'Add obligation',
      onAction: () => openAddFlow(context),
    );
    return PageBody(
      title: 'Obligations',
      subtitle: 'A clear view of what’s outstanding.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (!preview) ...[const PendingActions(), const SizedBox(height: 20)],
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final (value, label) in const [
                ('owe', 'I Owe'),
                ('owed', 'Owed to Me'),
                ('dues', 'Monthly Dues'),
              ])
                ChoiceChip(
                  label: Text(label),
                  selected: _selected == value,
                  onSelected: (_) => context.go(
                    Uri(
                      path: '/obligations',
                      queryParameters: {
                        'section': value,
                        if (_filter.currency != null)
                          'currency': _filter.currency!.code,
                      },
                    ).toString(),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 20),
          if (_type == ObligationSection.monthlyDues) ...[
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ChoiceChip(
                  label: const Text('Bills'),
                  selected: !_periods,
                  onSelected: (_) => _switchPeriods(false),
                ),
                ChoiceChip(
                  label: const Text('Billing periods'),
                  selected: _periods,
                  onSelected: (_) => _switchPeriods(true),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              _periods
                  ? 'Each bill, due date and payment stays in its own period.'
                  : 'Manage bill amounts, schedules and active status.',
            ),
            const SizedBox(height: 20),
          ],
          SearchField(
            key: ValueKey(_searchReset),
            value: _filter.text,
            onChanged: (text) =>
                setState(() => _filter = filterWithText(_filter, text)),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              OutlinedButton.icon(
                onPressed: preview ? null : _filters,
                icon: const Icon(Icons.tune),
                label: const Text('Filters'),
              ),
              if (_filter.currency != null)
                Chip(label: Text(_filter.currency!.code)),
              if (_filter.status != RecordStatus.all)
                Chip(label: Text(recordStatusLabel(_filter.status))),
              if (_filter.automaticOnly)
                const Chip(label: Text('Automatic deductions')),
              if (_filter.firstDate != null || _filter.lastDate != null)
                Chip(
                  label: Text(
                    '${_filter.firstDate ?? 'Any date'} – ${_filter.lastDate ?? 'Any date'}',
                  ),
                ),
              if (_filter != FinancialFilter(section: _type))
                TextButton(
                  onPressed: () => setState(() {
                    _filter = FinancialFilter(section: _type);
                    _searchReset++;
                  }),
                  child: const Text('Clear filters'),
                ),
            ],
          ),
          const SizedBox(height: 20),
          if (preview)
            Card(child: empty)
          else if (_periods)
            QueryResults<ObligationInstance>(
              queryKey: (ref.watch(ownerUidProvider), query),
              first: ref.watch(calendarPageProvider(query)),
              loadMore: (cursor, token) => ref
                  .read(searchRepositoryProvider)
                  .getPeriods(query, after: cursor, cancellation: token),
              identity: (value) => value.id.value,
              empty: Card(child: empty),
              onRetry: () => ref.invalidate(calendarPageProvider(query)),
              builder: (_, values, complete) => CalendarAgenda(
                instances: values,
                now: now,
                complete: complete,
                title: 'Billing periods',
              ),
            )
          else
            Card(
              child: QueryResults<Obligation>(
                queryKey: (ref.watch(ownerUidProvider), query),
                first: ref.watch(obligationSearchProvider(query)),
                loadMore: (cursor, token) => ref
                    .read(searchRepositoryProvider)
                    .getObligations(
                      _filter,
                      query.now,
                      after: cursor,
                      cancellation: token,
                    ),
                identity: (value) => value.id.value,
                empty: empty,
                onRetry: () => ref.invalidate(obligationSearchProvider(query)),
                builder: (_, values, _) => ObligationList(values),
              ),
            ),
        ],
      ),
    );
  }
}
