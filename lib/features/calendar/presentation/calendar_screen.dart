import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/environment.dart';
import '../../../core/config/environment_providers.dart';
import '../../../core/dates/financial_clock.dart';
import '../../../core/dates/local_date.dart';
import '../../../core/dates/timezone_catalog.dart';
import '../../../core/dates/year_month.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/page_body.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../obligations/domain/obligation_instance.dart';
import '../../search/domain/calendar_query.dart';
import '../../search/domain/financial_filter.dart';
import '../../search/presentation/financial_filter_panel.dart';
import '../../search/presentation/query_results.dart';
import '../../search/presentation/search_field.dart';
import '../../search/presentation/search_providers.dart';
import 'calendar_agenda.dart';
import 'calendar_controls.dart';
import 'calendar_month.dart';

class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key, this.initialMonth});
  final YearMonth? initialMonth;
  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  YearMonth? _month;
  LocalDate? _selected;
  FinancialFilter _filter = FinancialFilter();
  void _changeMonth(YearMonth month) => setState(() {
    _month = month;
    _selected = null;
  });
  Future<void> _chooseDay(LocalDate today) async {
    final initial =
        _selected ?? (_month == today.yearMonth ? today : _month!.firstDay);
    final date = await showDatePicker(
      context: context,
      initialDate: DateTime(initial.year, initial.month, initial.day),
      firstDate: DateTime(1900),
      lastDate: DateTime(2199, 12, 31),
    );
    if (mounted && date != null) {
      setState(() {
        _selected = LocalDate.fromParts(date.year, date.month, date.day);
        _month = _selected!.yearMonth;
      });
    }
  }

  Future<void> _filters() async {
    final result = await showFinancialFilters(context, _filter);
    if (mounted && result != null) setState(() => _filter = result);
  }

  @override
  Widget build(BuildContext context) {
    final preview =
            ref.watch(environmentProvider).mode == AppEnvironment.preview,
        now = ref.watch(financialClockProvider),
        zone = preview
            ? 'Asia/Manila'
            : ref.watch(userProfileProvider).timezone,
        local = TimezoneCatalog.at(now, zone),
        today = LocalDate.fromParts(local.year, local.month, local.day);
    _month ??= widget.initialMonth ?? today.yearMonth;
    final query = CalendarQuery(month: _month!, now: now, filter: _filter),
        periods = query.periods;
    final empty = EmptyState(
      icon: Icons.calendar_month_outlined,
      title: _filter == FinancialFilter()
          ? 'A clearer month ahead'
          : 'No due dates match these filters',
      description: _filter == FinancialFilter()
          ? 'Your due dates will appear here when you add an obligation.'
          : 'Try another month or adjust your filters.',
    );
    return PageBody(
      title: 'Calendar',
      subtitle: 'Know what needs to be paid next.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CalendarControls(
            month: _month!,
            selected: _selected,
            previous: query.previousMonth == null
                ? null
                : () => _changeMonth(query.previousMonth!),
            next: query.nextMonth == null
                ? null
                : () => _changeMonth(query.nextMonth!),
            onToday: () => setState(() {
              _month = today.yearMonth;
              _selected = today;
            }),
            onChooseDay: () => _chooseDay(today),
            onWholeMonth: () => setState(() => _selected = null),
          ),
          const SizedBox(height: 20),
          SearchField(
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
              if (_filter != FinancialFilter())
                TextButton(
                  onPressed: () => setState(() => _filter = FinancialFilter()),
                  child: const Text('Clear filters'),
                ),
            ],
          ),
          const SizedBox(height: 20),
          if (preview)
            Card(child: empty)
          else
            QueryResults<ObligationInstance>(
              queryKey: (ref.watch(ownerUidProvider), periods),
              first: ref.watch(calendarPageProvider(periods)),
              loadMore: (cursor, cancellation) => ref
                  .read(searchRepositoryProvider)
                  .getPeriods(
                    periods,
                    after: cursor,
                    cancellation: cancellation,
                  ),
              identity: (instance) => instance.id.value,
              empty: Card(child: empty),
              onRetry: () => ref.invalidate(calendarPageProvider(periods)),
              builder: (context, instances, complete) => LayoutBuilder(
                builder: (context, box) {
                  final agenda = CalendarAgenda(
                    instances: instances,
                    now: now,
                    selectedDay: _selected,
                    complete: complete,
                  );
                  if (box.maxWidth < 900 ||
                      MediaQuery.textScalerOf(context).scale(14) > 20) {
                    return agenda;
                  }
                  final counts = <LocalDate, int>{};
                  for (final instance in instances) {
                    if (instance.dueDate case final date?) {
                      counts.update(
                        date,
                        (value) => value + 1,
                        ifAbsent: () => 1,
                      );
                    }
                  }
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 3,
                        child: CalendarMonth(
                          month: _month!,
                          counts: counts,
                          today: today,
                          selected: _selected,
                          complete: complete,
                          onSelected: (date) =>
                              setState(() => _selected = date),
                        ),
                      ),
                      const SizedBox(width: 20),
                      Expanded(flex: 2, child: agenda),
                    ],
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}
